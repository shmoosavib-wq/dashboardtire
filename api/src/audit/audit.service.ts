import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; q?: string; category?: string } = {}) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize || 25)));
    const q = query.q?.trim();
    const categoryTypes: Record<string, string[]> = {
      documents: ['DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'DOCUMENT_DOWNLOADED'],
      users: ['USER_CREATED', 'USER_UPDATED', 'USER_PASSWORD_RESET', 'SUPER_ADMIN_BOOTSTRAPPED'],
      settlements: ['STORE_SETTLEMENT_RECORDED', 'STORE_SETTLEMENT_UPDATED', 'SUPPLIER_SETTLEMENT_RECORDED', 'SUPPLIER_DEBT_UPDATED', 'SUPPLIER_PURCHASE_PRODUCT_ADDED', 'SUPPLIER_PURCHASE_PRODUCT_UPDATED'],
      archive: ['DRIVER_ARCHIVED', 'DRIVER_RESTORED'],
    };
    const where: any = {};
    if (query.category === 'workflow') where.eventType = { startsWith: 'WORKFLOW_' };
    else if (query.category && categoryTypes[query.category]) where.eventType = { in: categoryTypes[query.category] };
    if (q) {
      const search = [
        { eventType: { contains: q, mode: 'insensitive' } },
        { actor: { is: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } } },
        { driver: { is: { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q } }] } } },
      ];
      where.AND = [...(where.AND || []), { OR: search }];
    }
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        actor: { select: { id: true, name: true, username: true } },
        driver: { select: { id: true, fullName: true, mobile: true } },
      },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
