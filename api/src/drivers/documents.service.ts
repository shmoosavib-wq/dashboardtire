import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { DocumentCategory, WorkflowStage } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../common/auth';
import { PrismaService } from '../prisma.service';
import type { UploadDocumentDto } from './drivers.dto';
import { hasRole } from './workflow';

const MIME_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
};

const EXTENSION_MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4',
};

function validateSignature(mime: string, buffer: Buffer): boolean {
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'video/mp4') return buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

function safeOriginalName(input: string): string {
  const name = input.split(/[\\/]/).pop() || 'document';
  return name.replace(/[\u0000-\u001f\u007f";]/g, '_').slice(0, 180) || 'document';
}

function encodedName(name: string): string {
  return encodeURIComponent(name).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));
}

@Injectable()
export class DocumentsService {
  private readonly baseDir = resolve(process.env.FILE_STORAGE_DIR || 'private-files');
  private readonly storageUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  private readonly storageBucket = process.env.SUPABASE_STORAGE_BUCKET;
  private readonly storageSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  constructor(private readonly prisma: PrismaService) {}

  async upload(driverId: string, input: UploadDocumentDto, file: Express.Multer.File, actor: AuthenticatedUser) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, archivedAt: true, currentStage: true } });
    if (!driver) throw new NotFoundException('پرونده پیدا نشد.');
    if (driver.archivedAt) throw new BadRequestException('پرونده آرشیو شده است.');
    this.assertUploadAccess(input.stage || driver.currentStage, actor);
    if (!file?.buffer?.length) throw new BadRequestException('فایل دریافت نشد.');
    const extension = extname(file.originalname).toLowerCase();
    const mime = EXTENSION_MIME[extension] || file.mimetype.toLowerCase();
    const max = input.category === 'SATISFACTION_VIDEO' ? Number(process.env.MAX_VIDEO_BYTES || 157286400) : Number(process.env.MAX_DOCUMENT_BYTES || 20971520);
    if (!MIME_EXTENSIONS[mime]?.includes(extension)) throw new UnprocessableEntityException('فقط PDF، JPG، PNG یا MP4 مجاز است.');
    if (file.size > max) throw new UnprocessableEntityException('حجم فایل از حد مجاز بیشتر است.');
    if (!validateSignature(mime, file.buffer)) throw new UnprocessableEntityException('محتوای فایل با نوع اعلام‌شده سازگار نیست.');
    if (input.category === DocumentCategory.CUSTOM && !input.customTitle?.trim()) throw new BadRequestException('برای مدرک متفرقه عنوان وارد کنید.');
    const remoteStorage = Boolean(this.storageUrl && this.storageBucket && this.storageSecret);
    if (process.env.NODE_ENV === 'production' && !remoteStorage) {
      throw new UnprocessableEntityException('File storage is not configured for this deployment.');
    }
    const storageKey = remoteStorage ? `${driverId}/${randomUUID()}` : randomUUID();
    const folder = resolve(this.baseDir, driverId);
    const target = resolve(folder, storageKey);
    const rel = relative(folder, target);
    if (rel.startsWith('..' + sep) || rel === '..') throw new BadRequestException('مسیر فایل معتبر نیست.');
    const originalName = safeOriginalName(file.originalname);
    if (remoteStorage) await this.storageRequest(storageKey, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: new Uint8Array(file.buffer) });
    else {
      await mkdir(folder, { recursive: true });
      await writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.driverDocument.create({
          data: {
            driverId,
            category: input.category,
            stage: input.stage || driver.currentStage,
            customTitle: input.category === DocumentCategory.CUSTOM ? input.customTitle!.trim() : null,
            originalName,
            storageKey,
            mimeType: mime,
            sizeBytes: file.size,
            uploadedById: actor.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            driverId,
            actorId: actor.id,
            eventType: 'DOCUMENT_UPLOADED',
            details: { documentId: document.id, category: input.category, title: document.customTitle, sizeBytes: file.size },
          },
        });
        return document;
      });
    } catch (error) {
      if (remoteStorage) await this.storageRequest(storageKey, { method: 'DELETE' }).catch(() => undefined);
      else await unlink(target).catch(() => undefined);
      throw error;
    }
  }

  async download(driverId: string, documentId: string, actor: AuthenticatedUser, response: Response) {
    const doc = await this.prisma.driverDocument.findFirst({ where: { id: documentId, driverId, deletedAt: null } });
    if (!doc) throw new NotFoundException('فایل پیدا نشد.');
    if (this.storageUrl && this.storageBucket && this.storageSecret) {
      await this.prisma.auditEvent.create({ data: { driverId, actorId: actor.id, eventType: 'DOCUMENT_DOWNLOADED', details: { documentId: doc.id, category: doc.category } } });
      response.setHeader('Content-Type', doc.mimeType);
      response.setHeader('Content-Length', String(doc.sizeBytes));
      response.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodedName(doc.originalName));
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const stored = await this.storageRequest(doc.storageKey);
      if (!stored.body) throw new NotFoundException('Stored file not found.');
      return new StreamableFile(Readable.fromWeb(stored.body as import('node:stream/web').ReadableStream));
    }
    const folder = resolve(this.baseDir, driverId);
    const filePath = resolve(folder, doc.storageKey);
    const rel = relative(folder, filePath);
    if (rel.startsWith('..' + sep) || rel === '..') throw new NotFoundException('فایل پیدا نشد.');
    const metadata = await stat(filePath).catch(() => null);
    if (!metadata?.isFile()) throw new NotFoundException('فایل روی فضای ذخیره‌سازی موجود نیست.');
    await this.prisma.auditEvent.create({ data: { driverId, actorId: actor.id, eventType: 'DOCUMENT_DOWNLOADED', details: { documentId: doc.id, category: doc.category } } });
    response.setHeader('Content-Type', doc.mimeType);
    response.setHeader('Content-Length', String(doc.sizeBytes));
    response.setHeader('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + encodedName(doc.originalName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(filePath));
  }

  private async storageRequest(storageKey: string, init: RequestInit = {}) {
    if (!this.storageUrl || !this.storageBucket || !this.storageSecret) throw new Error('Remote file storage is not configured');
    const path = storageKey.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${this.storageUrl}/storage/v1/object/${encodeURIComponent(this.storageBucket)}/${path}`, {
      ...init,
      headers: { apikey: this.storageSecret, Authorization: `Bearer ${this.storageSecret}`, ...init.headers },
    });
    if (!response.ok) throw new Error(`Remote file storage returned ${response.status}`);
    return response;
  }

  async remove(driverId: string, documentId: string, actor: AuthenticatedUser) {
    const document = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId, deletedAt: null },
      select: { id: true, category: true, customTitle: true, originalName: true },
    });
    if (!document) throw new NotFoundException('Ù…Ø¯Ø±Ú© Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯.');

    await this.prisma.$transaction(async (tx) => {
      await tx.driverDocument.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          driverId,
          actorId: actor.id,
          eventType: 'DOCUMENT_DELETED',
          details: { documentId: document.id, category: document.category, title: document.customTitle, originalName: document.originalName },
        },
      });
    });
    return { success: true };
  }

  private assertUploadAccess(stage: WorkflowStage, actor: AuthenticatedUser) {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    const legalStages: WorkflowStage[] = ['PROFORMA_PAYMENT_RESERVATION', 'CONTRACT_CHEQUE', 'DELIVERY_FINAL_DOCS'];
    const allowed = stage === 'CREDIT_REVIEW' ? hasRole(actor, 'CREDIT_APPROVER')
      : legalStages.includes(stage) ? hasRole(actor, 'SALES_OPERATIONS') || hasRole(actor, 'LEGAL_FINANCE')
      : hasRole(actor, 'SALES_OPERATIONS');
    if (!allowed) throw new ForbiddenException('برای بارگذاری مدرک دسترسی ندارید.');
  }
}
