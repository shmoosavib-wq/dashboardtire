import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole, WorkflowStage, type Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth';
import { PrismaService } from '../prisma.service';

type Granularity = 'daily' | 'monthly';
type Period = '30d' | '3m' | '6m' | '12m';
type Bucket = { key: string; salesCount: number; salesAmount: bigint; receivedAmount: bigint; supplierPaidAmount: bigint; dueAmount: bigint };
type JsonObject = Record<string, unknown>;

const tehranDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dateKey(date: Date): string {
  const parts = tehranDateFormat.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDay(key: string, amount: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function monthKey(key: string): string { return key.slice(0, 7); }

function shiftMonth(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function bucketKeys(granularity: Granularity, start: string, endExclusive: string): string[] {
  const keys: string[] = [];
  let key = granularity === 'daily' ? start : monthKey(start);
  const last = granularity === 'daily' ? shiftDay(endExclusive, -1) : monthKey(shiftDay(endExclusive, -1));
  while (key <= last) {
    keys.push(key);
    key = granularity === 'daily' ? shiftDay(key, 1) : shiftMonth(key, 1);
  }
  return keys;
}

function tehranDayStart(key: string): Date { return new Date(`${key}T00:00:00+03:30`); }

function asObject(value: Prisma.JsonValue | null | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function asAmount(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value);
  return /^\d+$/.test(normalized) ? BigInt(normalized) : null;
}

function readSaleAmount(payload: JsonObject, products: { quantity: number; saleUnitPrice: bigint | null }[]): bigint {
  const draftProducts = Array.isArray(payload.products) ? payload.products : null;
  const source = draftProducts?.length ? draftProducts : products;
  return source.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const row = item as Record<string, unknown>;
    const quantity = Number(row.quantity);
    const price = asAmount(row.saleUnitPrice);
    return Number.isSafeInteger(quantity) && quantity > 0 && price !== null ? sum + BigInt(quantity) * price : sum;
  }, 0n);
}

function readSaleQuantity(payload: JsonObject, products: { quantity: number }[]): number {
  const draftProducts = Array.isArray(payload.products) ? payload.products : null;
  const source = draftProducts?.length ? draftProducts : products;
  return source.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const quantity = Number((item as Record<string, unknown>).quantity);
    return Number.isSafeInteger(quantity) && quantity > 0 ? sum + quantity : sum;
  }, 0);
}

function readConfirmedSaleQuantity(details: JsonObject, payload: JsonObject, products: { quantity: number }[]): number {
  const snapshot = details.soldPairs;
  return typeof snapshot === 'number' && Number.isSafeInteger(snapshot) && snapshot >= 0
    ? snapshot : readSaleQuantity(payload, products);
}

function hasConfirmedInitialPayment(payload: JsonObject): boolean {
  return payload.paymentReceivedConfirmed === true && (asAmount(payload.paymentAmount) ?? 0n) > 0n;
}

function isFinancialUser(actor: AuthenticatedUser): boolean {
  return actor.roles.includes(UserRole.SUPER_ADMIN) || actor.roles.includes(UserRole.LEGAL_FINANCE);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(rawPeriod: string | undefined, rawGranularity: string | undefined, actor: AuthenticatedUser) {
    const periodAliases: Record<string, Period> = { daily: '30d', monthly: '12m' };
    const legacyGranularity = rawPeriod === 'daily' || rawPeriod === 'monthly' ? rawPeriod
      : !rawPeriod && (rawGranularity === 'daily' || rawGranularity === 'monthly') ? rawGranularity : undefined;
    const period = (rawPeriod && periodAliases[rawPeriod] ? periodAliases[rawPeriod]
      : rawPeriod || (legacyGranularity === 'monthly' ? '12m' : legacyGranularity === 'daily' ? '30d' : '30d')) as Period;
    if (!['30d', '3m', '6m', '12m'].includes(period)) {
      throw new BadRequestException('بازهٔ گزارش معتبر نیست.');
    }
    if (rawGranularity && rawGranularity !== 'daily' && rawGranularity !== 'monthly') {
      throw new BadRequestException('نوع نمایش نمودار معتبر نیست.');
    }
    const granularity: Granularity = rawGranularity === 'daily' || rawGranularity === 'monthly'
      ? rawGranularity : legacyGranularity || (period === '30d' ? 'daily' : 'monthly');
    const today = dateKey(new Date());
    const periodMonths = period === '30d' ? 0 : Number.parseInt(period, 10);
    const firstDay = period === '30d' ? shiftDay(today, -29) : `${shiftMonth(monthKey(today), 1 - periodMonths)}-01`;
    const endExclusive = shiftDay(today, 1);
    const keys = bucketKeys(granularity, firstDay, endExclusive);
    const from = tehranDayStart(firstDay);
    const to = tehranDayStart(endExclusive);
    const [activeCases, stageRows] = await Promise.all([
      this.prisma.driver.count({ where: { archivedAt: null } }),
      this.prisma.driver.groupBy({ by: ['currentStage'], where: { archivedAt: null }, _count: { _all: true } }),
    ]);
    const stageCounts = Object.fromEntries(Object.values(WorkflowStage).map((stage) => [
      stage,
      stageRows.find((row) => row.currentStage === stage)?._count._all || 0,
    ])) as Record<WorkflowStage, number>;
    const buckets = new Map(keys.map((key) => [key, { key, salesCount: 0, salesAmount: 0n, receivedAmount: 0n, supplierPaidAmount: 0n, dueAmount: 0n } satisfies Bucket]));
    const canViewFinancials = isFinancialUser(actor);
    const activity = await this.prisma.auditEvent.findMany({
      where: {
        driverId: { not: null },
        OR: [
          { eventType: { startsWith: 'WORKFLOW_' } },
          { eventType: { in: ['INSTALLMENT_PAYMENT_RECORDED', 'INSTALLMENT_PAYMENT_UPDATED', 'INSTALLMENT_PAYMENT_AMOUNT_UPDATED', 'DRIVER_CREATED'] } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6,
      select: {
        id: true, eventType: true, createdAt: true,
        driver: { select: { id: true, fullName: true } },
        actor: { select: { name: true } },
      },
    });

    if (canViewFinancials) {
      const confirmations = await this.prisma.auditEvent.findMany({
        where: { eventType: 'WORKFLOW_CONFIRM_INITIAL_PAYMENT' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          driverId: true,
          createdAt: true,
          details: true,
          driver: {
            select: {
              drafts: { where: { stage: WorkflowStage.PROFORMA_PAYMENT_RESERVATION }, select: { payload: true } },
              products: { select: { quantity: true, saleUnitPrice: true } },
            },
          },
        },
      });
      const financialCorrections = await this.prisma.auditEvent.findMany({
        where: { eventType: 'FINANCIAL_PRODUCT_CORRECTED', driverId: { not: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { driverId: true, details: true },
      });
      const latestCorrectionByDriver = new Map<string, JsonObject>();
      for (const correction of financialCorrections) {
        if (correction.driverId && !latestCorrectionByDriver.has(correction.driverId)) {
          latestCorrectionByDriver.set(correction.driverId, asObject(correction.details));
        }
      }
      const firstConfirmationByDriver = new Set<string>();
      let salesCount = 0;
      let salesAmount = 0n;
      let initialReceived = 0n;
      for (const event of confirmations) {
        if (!event.driverId || firstConfirmationByDriver.has(event.driverId)) continue;
        firstConfirmationByDriver.add(event.driverId);
        const details = asObject(event.details);
        const payload = asObject(event.driver?.drafts[0]?.payload);
        const paymentKey = typeof details.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(details.paymentDate)
          ? details.paymentDate : typeof payload.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.paymentDate)
            ? payload.paymentDate : dateKey(event.createdAt);
        if (paymentKey < firstDay || paymentKey >= endExclusive) continue;
        const key = granularity === 'daily' ? paymentKey : monthKey(paymentKey);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        const correction = latestCorrectionByDriver.get(event.driverId);
        const sale = asAmount(correction?.saleAmount) ?? asAmount(details.saleAmount) ?? readSaleAmount(payload, event.driver?.products || []);
        const payment = asAmount(details.initialPaymentAmount) ?? asAmount(payload.paymentAmount) ?? 0n;
        const pairsSold = typeof correction?.soldPairs === 'number' && Number.isSafeInteger(correction.soldPairs) && correction.soldPairs >= 0
          ? correction.soldPairs : readConfirmedSaleQuantity(details, payload, event.driver?.products || []);
        bucket.salesCount += pairsSold;
        bucket.salesAmount += sale;
        bucket.receivedAmount += payment;
        salesCount += pairsSold;
        salesAmount += sale;
        initialReceived += payment;
      }

      const confirmedDrafts = await this.prisma.stageDraft.findMany({
        where: { stage: WorkflowStage.PROFORMA_PAYMENT_RESERVATION },
        select: {
          driverId: true,
          payload: true,
          driver: {
            select: {
              createdAt: true,
              products: { select: { quantity: true, saleUnitPrice: true } },
            },
          },
        },
      });
      for (const draftRow of confirmedDrafts) {
        if (firstConfirmationByDriver.has(draftRow.driverId)) continue;
        const payload = asObject(draftRow.payload);
        if (!hasConfirmedInitialPayment(payload)) continue;
        firstConfirmationByDriver.add(draftRow.driverId);
        const paymentKey = typeof payload.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.paymentDate)
          ? payload.paymentDate : dateKey(draftRow.driver.createdAt);
        if (paymentKey < firstDay || paymentKey >= endExclusive) continue;
        const key = granularity === 'daily' ? paymentKey : monthKey(paymentKey);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        const sale = readSaleAmount(payload, draftRow.driver.products);
        const payment = asAmount(payload.paymentAmount) ?? 0n;
        const pairsSold = readConfirmedSaleQuantity({}, payload, draftRow.driver.products);
        bucket.salesCount += pairsSold;
        bucket.salesAmount += sale;
        bucket.receivedAmount += payment;
        salesCount += pairsSold;
        salesAmount += sale;
        initialReceived += payment;
      }

      const todayStart = tehranDayStart(today);
      const horizon = tehranDayStart(shiftDay(today, 31));
      const [installments, unpaidOverdue, overdueItems, upcomingItems, upcomingSummary] = await Promise.all([
        this.prisma.driverInstallment.findMany({
          where: { paidAt: { gte: from, lt: to } },
          select: { amount: true, paidAt: true },
        }),
        this.prisma.driverInstallment.aggregate({
          where: { paidAt: null, dueAt: { lt: todayStart } },
          _sum: { amount: true }, _count: { _all: true },
        }),
        this.prisma.driverInstallment.findMany({
          where: { paidAt: null, dueAt: { lt: todayStart } },
          orderBy: { dueAt: 'asc' }, take: 3,
          select: { id: true, number: true, amount: true, dueAt: true, driver: { select: { id: true, fullName: true } } },
        }),
        this.prisma.driverInstallment.findMany({
          where: { paidAt: null, dueAt: { gte: todayStart, lt: horizon } },
          orderBy: { dueAt: 'asc' }, take: 3,
          select: { id: true, number: true, amount: true, dueAt: true, driver: { select: { id: true, fullName: true } } },
        }),
        this.prisma.driverInstallment.aggregate({
          where: { paidAt: null, dueAt: { gte: todayStart, lt: horizon } },
          _sum: { amount: true }, _count: { _all: true },
        }),
      ]);
      let receivedAmount = initialReceived;
      for (const installment of installments) {
        if (!installment.paidAt) continue;
        const paidKey = dateKey(installment.paidAt);
        const key = granularity === 'daily' ? paidKey : monthKey(paidKey);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        bucket.receivedAmount += installment.amount;
        receivedAmount += installment.amount;
      }

      const scheduled = await this.prisma.driverInstallment.findMany({
        where: { dueAt: { gte: from, lt: to }, paidAt: null },
        select: { amount: true, dueAt: true },
      });
      for (const installment of scheduled) {
        const dueKey = dateKey(installment.dueAt);
        const key = granularity === 'daily' ? dueKey : monthKey(dueKey);
        const bucket = buckets.get(key);
        if (bucket) bucket.dueAmount += installment.amount;
      }

      const supplierSettlements = await this.prisma.supplierSettlementRecord.findMany({
        where: { settledAt: { gte: from, lt: to } },
        select: { amount: true, settledAt: true },
      });
      let supplierPaidAmount = 0n;
      for (const settlement of supplierSettlements) {
        const settledKey = dateKey(settlement.settledAt);
        const key = granularity === 'daily' ? settledKey : monthKey(settledKey);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        bucket.supplierPaidAmount += settlement.amount;
        supplierPaidAmount += settlement.amount;
      }

      const rows = keys.map((key) => ({ ...buckets.get(key)!, labelKey: key }));
      const overdueAmount = unpaidOverdue._sum.amount || 0n;
      return {
        period,
        granularity,
        generatedAt: new Date().toISOString(),
        hasFinancialAccess: true,
        activeCases,
        stageCounts,
        totals: {
          salesCount,
          salesAmount: String(salesAmount),
          receivedAmount: String(receivedAmount),
          supplierPaidAmount: String(supplierPaidAmount),
          cashflowNet: String(receivedAmount - supplierPaidAmount),
          nextDueAmount: String(upcomingSummary._sum.amount || 0n),
          overdueAmount: String(overdueAmount),
          overdueCount: unpaidOverdue._count._all,
          nextDueCount: upcomingSummary._count._all,
        },
        series: rows.map((row) => ({ ...row,
          salesAmount: String(row.salesAmount), receivedAmount: String(row.receivedAmount), supplierPaidAmount: String(row.supplierPaidAmount), cashflowNet: String(row.receivedAmount - row.supplierPaidAmount), dueAmount: String(row.dueAmount),
        })),
        dueItems: [...overdueItems, ...upcomingItems].map((item) => ({
          id: item.id, driverId: item.driver.id, driverName: item.driver.fullName, number: item.number,
          amount: String(item.amount), dueAt: item.dueAt,
          overdue: dateKey(item.dueAt) < today,
          dueSoon: dateKey(item.dueAt) >= today && dateKey(item.dueAt) <= shiftDay(today, 3),
        })),
        activity: activity.map((item) => ({ id: item.id, eventType: item.eventType, createdAt: item.createdAt,
          driverId: item.driver?.id || null, driverName: item.driver?.fullName || null, actorName: item.actor?.name || null,
        })),
      };
    }

    const confirmations = await this.prisma.auditEvent.findMany({
      where: { eventType: 'WORKFLOW_CONFIRM_INITIAL_PAYMENT', driverId: { not: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
        driverId: true, createdAt: true, details: true,
        driver: {
          select: {
            drafts: { where: { stage: WorkflowStage.PROFORMA_PAYMENT_RESERVATION }, select: { payload: true } },
            products: { select: { quantity: true } },
          },
        },
      },
    });
    const countedDrivers = new Set<string>();
    for (const event of confirmations) {
      if (!event.driverId || countedDrivers.has(event.driverId)) continue;
      countedDrivers.add(event.driverId);
      const details = asObject(event.details);
      const date = typeof details.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(details.paymentDate)
        ? details.paymentDate : dateKey(event.createdAt);
      if (date < firstDay || date >= endExclusive) continue;
      const bucket = buckets.get(granularity === 'daily' ? date : monthKey(date));
      const payload = asObject(event.driver?.drafts[0]?.payload);
      if (bucket) bucket.salesCount += readConfirmedSaleQuantity(details, payload, event.driver?.products || []);
    }
    const confirmedDrafts = await this.prisma.stageDraft.findMany({
      where: { stage: WorkflowStage.PROFORMA_PAYMENT_RESERVATION },
      select: { driverId: true, payload: true, driver: { select: { createdAt: true, products: { select: { quantity: true } } } } },
    });
    for (const draftRow of confirmedDrafts) {
      if (countedDrivers.has(draftRow.driverId)) continue;
      const payload = asObject(draftRow.payload);
      if (!hasConfirmedInitialPayment(payload)) continue;
      countedDrivers.add(draftRow.driverId);
      const date = typeof payload.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.paymentDate)
        ? payload.paymentDate : dateKey(draftRow.driver.createdAt);
      if (date < firstDay || date >= endExclusive) continue;
      const bucket = buckets.get(granularity === 'daily' ? date : monthKey(date));
      if (bucket) bucket.salesCount += readConfirmedSaleQuantity({}, payload, draftRow.driver.products);
    }
    const rows = keys.map((key) => ({ ...buckets.get(key)!, labelKey: key }));
    return {
      period,
      granularity,
      generatedAt: new Date().toISOString(),
      hasFinancialAccess: false,
      activeCases,
      stageCounts,
      totals: { salesCount: rows.reduce((sum, row) => sum + row.salesCount, 0), salesAmount: null, receivedAmount: null, supplierPaidAmount: null, cashflowNet: null, nextDueAmount: null, overdueAmount: null, overdueCount: null, nextDueCount: null },
      series: rows.map((row) => ({ ...row, salesAmount: null, receivedAmount: null, supplierPaidAmount: null, cashflowNet: null, dueAmount: null })),
      dueItems: null,
      activity: activity.map((item) => ({ id: item.id, eventType: item.eventType, createdAt: item.createdAt,
        driverId: item.driver?.id || null, driverName: item.driver?.fullName || null, actorName: item.actor?.name || null,
      })),
    };
  }
}
