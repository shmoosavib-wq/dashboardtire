import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentCategory, UserRole, WorkflowStage } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth';
import { PrismaService } from '../prisma.service';
import type { ArchiveDriverDto, CreateDriverDto, SaveDraftDto, StoreSettlementDto, WorkflowActionDto } from './drivers.dto';
import { dateOnly, nonEmptyText, nonNegativeInteger, positiveMoney, requireRole, stages } from './workflow';

type JsonObject = Record<string, unknown>;

const stageFields: Record<WorkflowStage, Set<string>> = {
  NEED_DECLARED: new Set(['intentNote']),
  APP_VERIFICATION: new Set(['smartFleetNumber', 'ownerVerified', 'identityVerified']),
  CREDIT_REVIEW: new Set(['sababarTrips', 'transportPayments', 'lastWaybillDate', 'bankRank', 'suggestedLimit', 'approvedLimit', 'decisionNote']),
  PROFORMA_PAYMENT_RESERVATION: new Set(['products', 'invoiceNumber', 'invoiceDate', 'proformaSent', 'paymentAmount', 'paymentDate', 'paymentReference', 'paymentReceivedConfirmed', 'reservationLocation', 'reservationDate', 'reservationConfirmed']),
  CONTRACT_CHEQUE: new Set(['contractNumber', 'chequeNumber', 'sayadId', 'chequeAmount', 'chequeDueDate', 'contractChecked', 'chequeChecked']),
  DELIVERY_FINAL_DOCS: new Set(['deliveryDate', 'deliveryLocation', 'recipient', 'contractPhysical', 'chequePhysical', 'goodsDelivered', 'satisfactionVideoReceived']),
  COMPLETED: new Set(),
};

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { search?: string; stage?: WorkflowStage; archived?: string }) {
    if (query.stage && !stages.includes(query.stage)) throw new BadRequestException('مرحله معتبر نیست.');
    const search = query.search?.trim();
    return this.prisma.driver.findMany({
      where: {
        archivedAt: query.archived === 'true' ? { not: null } : null,
        currentStage: query.stage,
        ...(search ? { OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { mobile: { contains: search } },
          { nationalId: { contains: search } },
        ] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { documents: { where: { deletedAt: null } }, auditEvents: true } },
      },
    });
  }

  async stageCounts() {
    const rows = await this.prisma.driver.groupBy({ by: ['currentStage'], where: { archivedAt: null }, _count: { _all: true } });
    return Object.fromEntries(stages.map((stage) => [stage, rows.find((row) => row.currentStage === stage)?._count._all || 0]));
  }

  async create(input: CreateDriverDto, actor: AuthenticatedUser) {
    const data = {
      fullName: input.fullName.trim(),
      mobile: input.mobile.trim(),
      nationalId: input.nationalId?.trim() || null,
      productHint: input.productHint?.trim() || null,
      createdById: actor.id,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driver.create({ data });
        await tx.stageDraft.create({
          data: {
            driverId: driver.id,
            stage: 'NEED_DECLARED',
            payload: { intentNote: input.intentNote?.trim() || '' },
            updatedById: actor.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            driverId: driver.id,
            actorId: actor.id,
            eventType: 'DRIVER_CREATED',
            details: { stage: 'NEED_DECLARED', productProvided: Boolean(data.productHint) },
          },
        });
        return driver;
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictException('این شماره موبایل قبلاً پرونده دارد.');
      throw error;
    }
  }

  async detail(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        drafts: { orderBy: { stage: 'asc' }, include: { updatedBy: { select: { id: true, name: true } } } },
        documents: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' }, include: { uploadedBy: { select: { id: true, name: true } } } },
        auditEvents: { orderBy: { createdAt: 'desc' }, take: 250, include: { actor: { select: { id: true, name: true } } } },
        products: true,
        storeSettlement: true,
      },
    });
    if (!driver) throw new NotFoundException('پرونده پیدا نشد.');
    return {
      ...driver,
      products: driver.products.map((product) => ({
        ...product,
        saleUnitPrice: product.saleUnitPrice === null ? null : String(product.saleUnitPrice),
        supplyUnitCost: product.supplyUnitCost === null ? null : String(product.supplyUnitCost),
      })),
      storeSettlement: driver.storeSettlement ? { ...driver.storeSettlement, amount: String(driver.storeSettlement.amount) } : null,
    };
  }

  async saveDraft(id: string, input: SaveDraftDto, actor: AuthenticatedUser) {
    const driver = await this.getActiveDriver(id);
    const isHistoricalEdit = stages.indexOf(input.stage) < stages.indexOf(driver.currentStage);
    if (driver.currentStage === 'COMPLETED' || (driver.currentStage !== input.stage && !isHistoricalEdit)) {
      throw new ConflictException('فقط اطلاعات مرحلهٔ فعلی یا مراحل ثبت‌شدهٔ قبلی قابل ویرایش است.');
    }
    this.assertStageAccess(input.stage, actor);
    const patch = this.sanitizePayload(input.stage, input.payload);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.stageDraft.findUnique({ where: { driverId_stage: { driverId: id, stage: input.stage } } });
        if (isHistoricalEdit && !current) throw new ConflictException('برای این مرحله اطلاعات ثبت‌شده‌ای پیدا نشد.');
        const previous = (current?.payload || {}) as JsonObject;
        const merged = { ...previous, ...patch };
        const changedKeys = Object.keys(patch).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(patch[key]));
        if (!changedKeys.length) return current;
        if (current) {
          const updated = await tx.stageDraft.updateMany({
            where: { id: current.id, version: current.version },
            data: { payload: merged as object, version: { increment: 1 }, updatedById: actor.id },
          });
          if (!updated.count) throw new ConflictException('پیش‌نویس هم‌زمان ویرایش شده؛ اطلاعات تازه را بارگذاری و دوباره ذخیره کنید.');
        } else {
          await tx.stageDraft.create({
            data: { driverId: id, stage: input.stage, payload: merged as object, version: 1, updatedById: actor.id },
          });
        }
        const draft = await tx.stageDraft.findUniqueOrThrow({ where: { driverId_stage: { driverId: id, stage: input.stage } } });
        await tx.auditEvent.create({
          data: {
            driverId: id,
            actorId: actor.id,
            eventType: isHistoricalEdit ? 'STAGE_DRAFT_CORRECTED' : 'STAGE_DRAFT_SAVED',
            details: { stage: input.stage, changedKeys, version: draft.version, ...(isHistoricalEdit ? { currentStage: driver.currentStage } : {}) },
          },
        });
        return draft;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (typeof error === 'object' && error && 'code' in error && (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('پیش‌نویس هم‌زمان ویرایش شده؛ اطلاعات تازه را بارگذاری و دوباره ذخیره کنید.');
      }
      throw error;
    }
  }

  async action(id: string, input: WorkflowActionDto, actor: AuthenticatedUser) {
    const driver = await this.getActiveDriver(id);
    const stage = driver.currentStage;
    const draftRow = await this.prisma.stageDraft.findUnique({ where: { driverId_stage: { driverId: id, stage } } });
    const currentPayload = (draftRow?.payload || {}) as JsonObject;
    const actionPayload = input.payload ? this.sanitizePayload(stage, input.payload) : {};
    const payload = { ...currentPayload, ...actionPayload };
    const oldStatus = driver.stageStatus;
    let nextStage: WorkflowStage = stage;
    let nextStatus = 'IN_PROGRESS';
    const action = input.action;

    switch (action) {
      case 'SUBMIT_NEED':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'NEED_DECLARED');
        nextStage = 'APP_VERIFICATION';
        break;
      case 'VERIFY_APP':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'APP_VERIFICATION');
        nonEmptyText(payload.smartFleetNumber, 'شماره هوشمند ناوگان');
        if (payload.ownerVerified !== true || payload.identityVerified !== true) throw new BadRequestException('مالکیت ناوگان و احراز هویت باید تأیید شوند.');
        nextStage = 'CREDIT_REVIEW';
        break;
      case 'SUBMIT_CREDIT':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'CREDIT_REVIEW');
        nonNegativeInteger(payload.sababarTrips, 'تعداد سفر صبابار');
        nonNegativeInteger(payload.transportPayments, 'تعداد پرداخت ترنسپورت');
        nonEmptyText(payload.lastWaybillDate, 'تاریخ آخرین بارنامه');
        nonEmptyText(payload.bankRank, 'رتبه اعتباری');
        positiveMoney(payload.suggestedLimit, 'سقف پیشنهادی');
        nextStatus = 'AWAITING_CREDIT_APPROVAL';
        break;
      case 'APPROVE_CREDIT':
        requireRole(actor, UserRole.CREDIT_APPROVER);
        this.expectStage(stage, 'CREDIT_REVIEW');
        this.expectStatus(oldStatus, 'AWAITING_CREDIT_APPROVAL');
        positiveMoney(payload.approvedLimit, 'سقف اعتبار مصوب');
        nextStage = 'PROFORMA_PAYMENT_RESERVATION';
        break;
      case 'REJECT_CREDIT':
      case 'REQUEST_CREDIT_CHANGES':
        requireRole(actor, UserRole.CREDIT_APPROVER);
        this.expectStage(stage, 'CREDIT_REVIEW');
        this.expectStatus(oldStatus, 'AWAITING_CREDIT_APPROVAL');
        nextStatus = action === 'REJECT_CREDIT' ? 'CREDIT_REJECTED' : 'CREDIT_CHANGES_REQUESTED';
        if (input.note?.trim()) payload.decisionNote = input.note.trim();
        break;
      case 'SUBMIT_PROFORMA':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'PROFORMA_PAYMENT_RESERVATION');
        if (!await this.hasDocument(id, DocumentCategory.PROFORMA)) throw new UnprocessableEntityException('ابتدا پیش‌فاکتور را بارگذاری کنید.');
        if (payload.products !== undefined) this.cleanProducts(payload.products);
        nonEmptyText(payload.invoiceDate, 'تاریخ پیش‌فاکتور');
        nextStatus = 'AWAITING_INITIAL_PAYMENT';
        break;
      case 'REGISTER_INITIAL_PAYMENT':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'PROFORMA_PAYMENT_RESERVATION');
        this.expectStatus(oldStatus, 'AWAITING_INITIAL_PAYMENT');
        positiveMoney(payload.paymentAmount, 'مبلغ پرداخت');
        nonEmptyText(payload.paymentDate, 'تاریخ پرداخت');
        nextStatus = 'AWAITING_PAYMENT_CONFIRMATION';
        break;
      case 'CONFIRM_INITIAL_PAYMENT':
        requireRole(actor, UserRole.LEGAL_FINANCE);
        this.expectStage(stage, 'PROFORMA_PAYMENT_RESERVATION');
        this.expectStatus(oldStatus, 'AWAITING_PAYMENT_CONFIRMATION');
        positiveMoney(payload.paymentAmount, 'مبلغ پرداخت');
        nonEmptyText(payload.paymentDate, 'تاریخ پرداخت');
        if (payload.paymentReceivedConfirmed !== true) throw new BadRequestException('تأیید دریافت پیش‌پرداخت را علامت بزنید.');
        nextStatus = 'PAYMENT_CONFIRMED_AWAITING_RESERVATION';
        break;
      case 'RESERVE_GOODS':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'PROFORMA_PAYMENT_RESERVATION');
        this.expectStatus(oldStatus, 'PAYMENT_CONFIRMED_AWAITING_RESERVATION');
        nonEmptyText(payload.reservationLocation, 'محل رزرو کالا');
        nonEmptyText(payload.reservationDate, 'تاریخ رزرو');
        if (payload.reservationConfirmed !== true) throw new BadRequestException('تأیید رزرو کالا را علامت بزنید.');
        nextStage = 'CONTRACT_CHEQUE';
        break;
      case 'SUBMIT_CONTRACT_CHEQUE':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'CONTRACT_CHEQUE');
        if (!await this.hasDocument(id, DocumentCategory.CONTRACT) || !await this.hasDocument(id, DocumentCategory.CHEQUE)) {
          throw new UnprocessableEntityException('تصویر قرارداد و چک باید هر دو بارگذاری شوند.');
        }
        nextStatus = 'AWAITING_LEGAL_FINANCE_APPROVAL';
        break;
      case 'APPROVE_CONTRACT_CHEQUE':
        requireRole(actor, UserRole.LEGAL_FINANCE);
        this.expectStage(stage, 'CONTRACT_CHEQUE');
        this.expectStatus(oldStatus, 'AWAITING_LEGAL_FINANCE_APPROVAL');
        if (payload.contractChecked !== true || payload.chequeChecked !== true) throw new BadRequestException('قرارداد و چک باید جداگانه تأیید شوند.');
        positiveMoney(payload.chequeAmount, 'مبلغ چک');
        nonEmptyText(payload.chequeNumber, 'شماره چک');
        nonEmptyText(payload.chequeDueDate, 'تاریخ سررسید چک');
        nextStage = 'DELIVERY_FINAL_DOCS';
        break;
      case 'COMPLETE_DELIVERY':
        requireRole(actor, UserRole.SALES_OPERATIONS);
        this.expectStage(stage, 'DELIVERY_FINAL_DOCS');
        for (const key of ['contractPhysical', 'chequePhysical', 'goodsDelivered', 'satisfactionVideoReceived']) {
          if (payload[key] !== true) throw new UnprocessableEntityException('همهٔ تأییدهای تحویل و دریافت مستندات باید ثبت شوند.');
        }
        if (!await this.hasDocument(id, DocumentCategory.SATISFACTION_VIDEO)) throw new UnprocessableEntityException('ویدئوی رضایت راننده باید بارگذاری شود.');
        nonEmptyText(payload.deliveryDate, 'تاریخ تحویل');
        nextStage = 'COMPLETED';
        nextStatus = 'COMPLETED';
        break;
      default:
        throw new BadRequestException('اقدام گردش‌کار شناخته‌شده نیست.');
    }

    const details = {
      action,
      fromStage: stage,
      toStage: nextStage,
      fromStatus: oldStatus,
      toStatus: nextStatus,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.driver.updateMany({
        where: { id, currentStage: stage, stageStatus: oldStatus, archivedAt: null },
        data: { currentStage: nextStage, stageStatus: nextStatus },
      });
      if (!changed.count) throw new ConflictException('پرونده هم‌زمان تغییر کرده؛ اطلاعات تازه را دوباره بارگذاری کنید.');
      await tx.stageDraft.upsert({
        where: { driverId_stage: { driverId: id, stage } },
        create: { driverId: id, stage, payload: payload as object, version: 1, updatedById: actor.id },
        update: { payload: payload as object, version: { increment: 1 }, updatedById: actor.id },
      });
      if (action === 'SUBMIT_PROFORMA' && payload.products !== undefined) {
        const products = this.cleanProducts(payload.products);
        await tx.driverProduct.createMany({
          data: products.map((product) => ({
            driverId: id,
            title: product.title,
            quantity: product.quantity,
            saleUnitPrice: BigInt(product.saleUnitPrice),
            supplyUnitCost: BigInt(product.supplyUnitCost),
          })),
        });
      }
      await tx.auditEvent.create({ data: { driverId: id, actorId: actor.id, eventType: `WORKFLOW_${action}`, details } });
      return tx.driver.findUnique({ where: { id } });
    });
  }

  async archive(id: string, input: ArchiveDriverDto, actor: AuthenticatedUser) {
    requireRole(actor, UserRole.SALES_OPERATIONS);
    const driver = await this.getActiveDriver(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.driver.update({ where: { id }, data: { archivedAt: new Date(), archivedById: actor.id, archiveReason: input.reason?.trim() || null } });
      await tx.auditEvent.create({ data: { driverId: id, actorId: actor.id, eventType: 'DRIVER_ARCHIVED', details: { reason: input.reason?.trim() || null, stage: driver.currentStage } } });
    });
    return { ok: true };
  }

  async restore(id: string, actor: AuthenticatedUser) {
    requireRole(actor, UserRole.SUPER_ADMIN);
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('پرونده پیدا نشد.');
    if (!driver.archivedAt) throw new ConflictException('پرونده در آرشیو نیست.');
    await this.prisma.$transaction(async (tx) => {
      await tx.driver.update({ where: { id }, data: { archivedAt: null, archivedById: null, archiveReason: null } });
      await tx.auditEvent.create({ data: { driverId: id, actorId: actor.id, eventType: 'DRIVER_RESTORED', details: { stage: driver.currentStage } } });
    });
    return { ok: true };
  }

  async settleStore(id: string, input: StoreSettlementDto, actor: AuthenticatedUser) {
    requireRole(actor, UserRole.LEGAL_FINANCE);
    await this.getActiveDriver(id);
    const settledAt = dateOnly(input.settledAt, 'تاریخ تسویه');
    const existing = await this.prisma.storeSettlement.findUnique({ where: { driverId: id } });
    const settlement = await this.prisma.$transaction(async (tx) => {
      const result = await tx.storeSettlement.upsert({
        where: { driverId: id },
        create: { driverId: id, amount: BigInt(input.amount), settledAt, registeredById: actor.id },
        update: { amount: BigInt(input.amount), settledAt, registeredById: actor.id },
      });
      await tx.auditEvent.create({
        data: { driverId: id, actorId: actor.id, eventType: existing ? 'STORE_SETTLEMENT_UPDATED' : 'STORE_SETTLEMENT_RECORDED', details: { amount: String(input.amount), settledAt: input.settledAt } },
      });
      return result;
    });
    return { ...settlement, amount: String(settlement.amount) };
  }

  private async getActiveDriver(id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('پرونده پیدا نشد.');
    if (driver.archivedAt) throw new ConflictException('پرونده آرشیو شده است.');
    return driver;
  }

  private async hasDocument(driverId: string, category: DocumentCategory) {
    return (await this.prisma.driverDocument.count({ where: { driverId, category, deletedAt: null } })) > 0;
  }

  private assertStageAccess(stage: WorkflowStage, actor: AuthenticatedUser) {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    const allowed = stage === 'CREDIT_REVIEW' ? [UserRole.SALES_OPERATIONS, UserRole.CREDIT_APPROVER]
      : stage === 'CONTRACT_CHEQUE' || stage === 'PROFORMA_PAYMENT_RESERVATION' || stage === 'DELIVERY_FINAL_DOCS'
        ? [UserRole.SALES_OPERATIONS, UserRole.LEGAL_FINANCE]
        : [UserRole.SALES_OPERATIONS];
    if (!allowed.some((role) => actor.roles.includes(role))) throw new ForbiddenException('برای ذخیرهٔ این مرحله دسترسی ندارید.');
  }

  private sanitizePayload(stage: WorkflowStage, input: JsonObject): JsonObject {
    const allowed = stageFields[stage];
    const entries = Object.entries(input);
    if (entries.length > 40 || entries.some(([key]) => !allowed.has(key))) throw new BadRequestException('یکی از فیلدهای فرم معتبر نیست.');
    const safe: JsonObject = {};
    for (const [key, value] of entries) {
      if (key === 'products' && stage === 'PROFORMA_PAYMENT_RESERVATION') {
        safe.products = this.sanitizeProductDrafts(value);
        continue;
      }
      if (typeof value === 'string' && value.length > 2000) throw new BadRequestException(`مقدار ${key} بیش از حد طولانی است.`);
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new BadRequestException(`نوع دادهٔ ${key} معتبر نیست.`);
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) throw new BadRequestException(`عدد ${key} معتبر نیست.`);
      safe[key] = value;
    }
    return safe;
  }

  private expectStage(actual: WorkflowStage, expected: WorkflowStage) {
    if (actual !== expected) throw new ConflictException('این اقدام با مرحلهٔ فعلی پرونده سازگار نیست.');
  }

  private expectStatus(actual: string, expected: string) {
    if (actual !== expected) throw new ConflictException('پرونده در وضعیت مناسب برای این اقدام نیست.');
  }

  private requirePositiveInteger(value: unknown, label: string) {
    const number = nonNegativeInteger(value, label);
    if (number < 1) throw new BadRequestException(`${label} باید بیشتر از صفر باشد.`);
    return number;
  }

  private cleanProducts(value: unknown) {
    if (!Array.isArray(value) || value.length > 30) throw new BadRequestException('فهرست کالاها معتبر نیست.');
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('مشخصات یکی از کالاها معتبر نیست.');
      const row = item as Record<string, unknown>;
      if (Object.keys(row).some((key) => !['title', 'quantity', 'saleUnitPrice', 'supplyUnitCost'].includes(key))) throw new BadRequestException('فیلد یکی از کالاها معتبر نیست.');
      return {
        title: nonEmptyText(row.title, 'نام کالا'),
        quantity: this.requirePositiveInteger(row.quantity, 'تعداد کالا'),
        saleUnitPrice: positiveMoney(row.saleUnitPrice, 'قیمت فروش هر واحد'),
        supplyUnitCost: positiveMoney(row.supplyUnitCost, 'قیمت تأمین هر واحد'),
      };
    });
  }

  private sanitizeProductDrafts(value: unknown) {
    if (!Array.isArray(value) || value.length > 30) throw new BadRequestException('فهرست کالاها معتبر نیست.');
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('مشخصات یکی از کالاها معتبر نیست.');
      const row = item as Record<string, unknown>;
      if (Object.keys(row).some((key) => !['title', 'quantity', 'saleUnitPrice', 'supplyUnitCost'].includes(key))) throw new BadRequestException('فیلد یکی از کالاها معتبر نیست.');
      for (const key of ['title', 'quantity', 'saleUnitPrice', 'supplyUnitCost']) {
        const field = row[key];
        if (field !== undefined && field !== null && typeof field !== 'string' && typeof field !== 'number') throw new BadRequestException('نوع دادهٔ یکی از کالاها معتبر نیست.');
        if (typeof field === 'string' && field.length > 300) throw new BadRequestException('مقدار کالا بیش از حد طولانی است.');
        if (typeof field === 'number' && (!Number.isFinite(field) || field < 0 || field > Number.MAX_SAFE_INTEGER)) throw new BadRequestException('عدد کالا معتبر نیست.');
      }
      return { title: row.title ?? '', quantity: row.quantity ?? '', saleUnitPrice: row.saleUnitPrice ?? '', supplyUnitCost: row.supplyUnitCost ?? '' };
    });
  }
}
