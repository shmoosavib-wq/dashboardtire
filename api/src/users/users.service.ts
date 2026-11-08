import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma.service';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, username: true, roles: true, isActive: true, createdAt: true, updatedAt: true },
    });
  }

  async create(input: CreateUserDto, actor: AuthenticatedUser) {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: input.name.trim(), username: input.username.trim().toLowerCase(), passwordHash, roles: [...new Set(input.roles)] },
          select: { id: true, name: true, username: true, roles: true, isActive: true, createdAt: true },
        });
        await tx.auditEvent.create({ data: { actorId: actor.id, eventType: 'USER_CREATED', details: { userId: user.id, roles: user.roles } } });
        return user;
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictException('این نام کاربری قبلاً ثبت شده است.');
      throw error;
    }
  }

  async update(id: string, input: UpdateUserDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('کاربر پیدا نشد.');
      const roles = input.roles ? [...new Set(input.roles)] as UserRole[] : current.roles;
      const isActive = input.isActive ?? current.isActive;
      const removesActiveSuperAdmin = current.isActive && current.roles.includes('SUPER_ADMIN') && (!isActive || !roles.includes('SUPER_ADMIN'));
      if (removesActiveSuperAdmin) {
        const remaining = await tx.user.count({ where: { id: { not: id }, isActive: true, roles: { has: 'SUPER_ADMIN' } } });
        if (remaining === 0) throw new UnprocessableEntityException('حداقل یک سوپرادمین فعال باید باقی بماند.');
      }
      const user = await tx.user.update({
        where: { id },
        data: { name: input.name?.trim(), roles: input.roles ? roles : undefined, isActive: input.isActive },
        select: { id: true, name: true, username: true, roles: true, isActive: true, updatedAt: true },
      });
      if (!user.isActive) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditEvent.create({ data: { actorId: actor.id, eventType: 'USER_UPDATED', details: { userId: id, changedFields: Object.keys(input), roles: user.roles, isActive: user.isActive } } });
      return user;
    }, { isolationLevel: 'Serializable' });
  }

  async resetPassword(id: string, input: ResetPasswordDto, actor: AuthenticatedUser) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('کاربر پیدا نشد.');
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditEvent.create({ data: { actorId: actor.id, eventType: 'USER_PASSWORD_RESET', details: { userId: id } } });
    });
    return { ok: true };
  }
}
