import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { UserRole, WorkflowStage } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth';

export const stages: WorkflowStage[] = [
  'NEED_DECLARED', 'APP_VERIFICATION', 'CREDIT_REVIEW',
  'PROFORMA_PAYMENT_RESERVATION', 'CONTRACT_CHEQUE', 'DELIVERY_FINAL_DOCS', 'COMPLETED',
];

export const stageLabels: Record<WorkflowStage, string> = {
  NEED_DECLARED: 'اعلام تمایل',
  APP_VERIFICATION: 'ثبت‌نام و احراز هویت در اپ',
  CREDIT_REVIEW: 'اعتبارسنجی',
  PROFORMA_PAYMENT_RESERVATION: 'پیش‌فاکتور، پرداخت و رزرو',
  CONTRACT_CHEQUE: 'قرارداد و چک',
  DELIVERY_FINAL_DOCS: 'تحویل و مستندات نهایی',
  COMPLETED: 'تکمیل‌شده',
};

export function requireRole(user: AuthenticatedUser, role: UserRole) {
  if (user.roles.includes('SUPER_ADMIN') || user.roles.includes(role)) return;
  throw new ForbiddenException('برای این اقدام دسترسی ندارید.');
}

export function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} را وارد کنید.`);
  return value.trim();
}

function normalizeDigits(value: unknown): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, (char) => {
    if (fa.includes(char)) return String(fa.indexOf(char));
    return String(ar.indexOf(char));
  }).replace(/[,٬،\s]/g, '');
}

export function positiveMoney(value: unknown, label: string): number {
  const normalized = normalizeDigits(value);
  const number = typeof value === 'number' ? value : /^\d+$/.test(normalized) ? Number(normalized) : NaN;
  if (!Number.isSafeInteger(number) || number < 1) throw new BadRequestException(`${label} باید عدد صحیح مثبت باشد.`);
  return number;
}

export function nonNegativeInteger(value: unknown, label: string, max = 100000000): number {
  const normalized = normalizeDigits(value);
  const number = typeof value === 'number' ? value : /^\d+$/.test(normalized) ? Number(normalized) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new BadRequestException(`${label} معتبر نیست.`);
  return number;
}

export function dateOnly(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} را انتخاب کنید.`);
  const result = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} معتبر نیست.`);
  return result;
}

export function hasRole(user: AuthenticatedUser, role: UserRole): boolean {
  return user.roles.includes('SUPER_ADMIN') || user.roles.includes(role);
}
