import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { hashPassword, verifyPassword } from './password';
import type { LoginDto, SetupSuperAdminDto } from './auth.dto';

const COOKIE_NAME = 'sababar_session';
const SESSION_HOURS = Math.min(Math.max(Number(process.env.SESSION_TTL_HOURS || 12), 1), 24);

@Injectable()
export class AuthService {
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async setupStatus() {
    return { initialized: (await this.prisma.user.count()) > 0 };
  }

  async createFirstSuperAdmin(input: SetupSuperAdminDto) {
    const username = input.username.trim().toLowerCase();
    const configuredToken = process.env.BOOTSTRAP_TOKEN || '';
    const providedToken = Buffer.from(input.bootstrapToken);
    const expectedToken = Buffer.from(configuredToken);
    if (expectedToken.length < 32 || providedToken.length !== expectedToken.length || !timingSafeEqual(providedToken, expectedToken)) {
      throw new UnauthorizedException('توکن راه‌اندازی معتبر نیست.');
    }
    if (await this.prisma.user.count()) throw new ConflictException('سامانه قبلاً راه‌اندازی شده است.');
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        if (await tx.user.count()) throw new ConflictException('سامانه قبلاً راه‌اندازی شده است.');
        const created = await tx.user.create({
          data: { name: input.name.trim(), username, passwordHash, roles: ['SUPER_ADMIN'] },
          select: { id: true, name: true, username: true, roles: true },
        });
        await tx.auditEvent.create({ data: { actorId: created.id, eventType: 'SUPER_ADMIN_BOOTSTRAPPED', details: {} } });
        return created;
      }, { isolationLevel: 'Serializable' });
      return user;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ConflictException('راه‌اندازی هم‌زمان انجام شد؛ صفحه را تازه‌سازی کنید.');
    }
  }

  async login(input: LoginDto, response: Response) {
    const username = input.username.trim().toLowerCase();
    const current = this.failures.get(username);
    if (current && current.lockedUntil > Date.now()) throw new HttpException('چند دقیقه بعد دوباره تلاش کنید.', HttpStatus.TOO_MANY_REQUESTS);
    const user = await this.prisma.user.findUnique({ where: { username } });
    const verified = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !verified || !user.isActive) {
      const next = current && current.lockedUntil > 0 && current.lockedUntil <= Date.now() ? { count: 1, lockedUntil: 0 } : { count: (current?.count || 0) + 1, lockedUntil: 0 };
      if (next.count >= 8) next.lockedUntil = Date.now() + 15 * 60 * 1000;
      this.failures.set(username, next);
      if (this.failures.size > 1000) this.failures.clear();
      throw new UnauthorizedException('نام کاربری یا رمز عبور درست نیست.');
    }
    this.failures.delete(username);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    await this.prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt } });
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
    return { id: user.id, name: user.name, username: user.username, roles: user.roles };
  }

  async logout(cookieHeader: string | undefined, response: Response) {
    const token = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (token) {
      try {
        const tokenHash = createHash('sha256').update(decodeURIComponent(token)).digest('hex');
        await this.prisma.session.deleteMany({ where: { tokenHash } });
      } catch { /* malformed cookie: still clear it below */ }
    }
    response.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return { ok: true };
  }
}
