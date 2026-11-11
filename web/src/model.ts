export type Role = 'SUPER_ADMIN' | 'SALES_OPERATIONS' | 'LEGAL_FINANCE' | 'CREDIT_APPROVER';
export type Stage =
  | 'NEED_DECLARED' | 'APP_VERIFICATION' | 'CREDIT_REVIEW'
  | 'PROFORMA_PAYMENT_RESERVATION' | 'CONTRACT_CHEQUE' | 'DELIVERY_FINAL_DOCS' | 'COMPLETED';

export type User = { id: string; name: string; username: string; roles: Role[]; isActive?: boolean; createdAt?: string; updatedAt?: string };
export type Draft = { stage: Stage; payload: Record<string, unknown>; version: number; updatedAt: string; updatedBy?: { name: string } };
export type Document = { id: string; category: string; stage?: Stage | null; customTitle?: string | null; originalName: string; sizeBytes: number; mimeType: string; uploadedAt: string; uploadedBy?: { name: string } };
export type AuditEvent = { id: string; eventType: string; details: Record<string, unknown>; createdAt: string; actor?: { name: string } | null };
export type ProductLine = { id?: string; title: string; quantity: number; saleUnitPrice?: string | null; supplyUnitCost?: string | null };
export type DriverInstallment = { id: string; number: number; amount: string; dueAt: string; paidAt?: string | null; paidBy?: { id: string; name: string } | null };
export type Driver = {
  id: string; fullName: string; mobile: string; nationalId?: string | null; currentStage: Stage; stageStatus: string;
  productHint?: string | null; archivedAt?: string | null; archiveReason?: string | null;
  createdAt: string; updatedAt: string; createdBy?: { name: string };
  drafts?: Draft[]; documents?: Document[]; auditEvents?: AuditEvent[];
  products?: ProductLine[];
  storeSettlement?: { amount: string; settledAt: string } | null;
  installments?: DriverInstallment[];
};

export const stageList: { id: Stage; title: string; compact: string }[] = [
  { id: 'NEED_DECLARED', title: 'اعلام تمایل', compact: 'تمایل' },
  { id: 'APP_VERIFICATION', title: 'ثبت‌نام و احراز هویت در اپ', compact: 'احراز هویت' },
  { id: 'CREDIT_REVIEW', title: 'اعتبارسنجی', compact: 'اعتبار' },
  { id: 'PROFORMA_PAYMENT_RESERVATION', title: 'پیش‌فاکتور، پرداخت و رزرو', compact: 'پیش‌فاکتور' },
  { id: 'CONTRACT_CHEQUE', title: 'قرارداد و چک', compact: 'قرارداد' },
  { id: 'DELIVERY_FINAL_DOCS', title: 'تحویل و مستندات نهایی', compact: 'تحویل' },
];

export const roleNames: Record<Role, string> = {
  SUPER_ADMIN: 'سوپرادمین',
  SALES_OPERATIONS: 'فروش و عملیات',
  LEGAL_FINANCE: 'حقوقی و مالی',
  CREDIT_APPROVER: 'تأیید اعتبار',
};

export function can(user: User, ...roles: Role[]) {
  return user.roles.includes('SUPER_ADMIN') || roles.some((role) => user.roles.includes(role));
}
