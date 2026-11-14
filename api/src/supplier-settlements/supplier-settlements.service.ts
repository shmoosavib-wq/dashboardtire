import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth';
import { PrismaService } from '../prisma.service';
import { dateOnly, nonEmptyText, positiveMoney } from '../drivers/workflow';
import type { AddPurchaseProductDto, CreateSupplierSettlementDto, UpdateSupplierDebtDto } from './supplier-settlements.dto';

const settlementDriverStages = ['COMPLETED', 'DELIVERY_FINAL_DOCS'] as const;

@Injectable()
export class SupplierSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async eligibleDrivers() {
    return this.prisma.driver.findMany({
      where: { OR: [{ currentStage: { in: [...settlementDriverStages] } }, { stageStatus: 'COMPLETED' }] },
      select: { id: true, fullName: true, mobile: true, archivedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async addPurchaseProduct(input: AddPurchaseProductDto, actor: AuthenticatedUser) {
    if (!actor.roles.includes(UserRole.SUPER_ADMIN) && !actor.roles.includes(UserRole.LEGAL_FINANCE)) {
      throw new ForbiddenException('افزودن قلم خرید فقط برای نقش مالی مجاز است.');
    }
    const title = nonEmptyText(input.title, 'عنوان کالا');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${input.driverId}::uuid FOR UPDATE`;
      const driver = await tx.driver.findFirst({
        where: { id: input.driverId, OR: [{ currentStage: { in: [...settlementDriverStages] } }, { stageStatus: 'COMPLETED' }] },
        select: { id: true, fullName: true, archivedAt: true },
      });
      if (!driver) throw new NotFoundException('پروندهٔ انتخاب‌شده در مرحلهٔ تحویل یا تکمیل‌شده پیدا نشد.');
      const product = await tx.driverProduct.create({
        data: { driverId: driver.id, title, quantity: input.quantity, saleUnitPrice: BigInt(input.saleUnitPrice) },
      });
      await tx.auditEvent.create({
        data: {
          driverId: driver.id,
          actorId: actor.id,
          eventType: 'SUPPLIER_PURCHASE_PRODUCT_ADDED',
          details: { productId: product.id, title, quantity: product.quantity, saleUnitPrice: String(product.saleUnitPrice), source: 'manual' },
        },
      });
      return { id: product.id, title: product.title, quantity: product.quantity, saleTotal: String(BigInt(product.quantity) * BigInt(product.saleUnitPrice!)), driver };
    });
  }

  async list(page = 1, pageSize = 10) {
    const currentPage = Math.max(1, Math.floor(page || 1));
    const size = [10, 20, 50].includes(pageSize) ? pageSize : 10;
    const where = { driver: { OR: [{ currentStage: { in: [...settlementDriverStages] } }, { stageStatus: 'COMPLETED' }] } };
    const [products, total] = await Promise.all([
      this.prisma.driverProduct.findMany({
        where,
        skip: (currentPage - 1) * size,
        take: size,
        orderBy: [{ driver: { fullName: 'asc' } }, { title: 'asc' }],
        include: {
          driver: { select: { id: true, fullName: true, mobile: true, archivedAt: true } },
          supplierSettlements: {
            orderBy: { createdAt: 'asc' },
            include: { registeredBy: { select: { name: true } } },
          },
        },
      }),
      this.prisma.driverProduct.count({ where }),
    ]);

    return {
      items: products.map((product) => {
        const snapshot = product.supplierSettlements.at(-1);
        const payable = snapshot?.payableTotalSnapshot ?? null;
        const saleTotal = product.saleUnitPrice === null ? null : BigInt(product.saleUnitPrice) * BigInt(product.quantity);
        const paid = product.supplierSettlements.reduce((sum, entry) => sum + entry.amount, 0n);
        return {
          id: product.id,
          title: snapshot?.productTitleSnapshot ?? product.title,
          quantity: snapshot?.quantitySnapshot ?? product.quantity,
          saleTotal: saleTotal === null ? null : String(saleTotal),
          payableTotal: payable === null ? null : String(payable),
          paidTotal: String(paid),
          remaining: payable === null ? null : String(payable - paid),
          driver: product.driver,
          settlements: [...product.supplierSettlements].reverse().map((entry) => ({
            id: entry.id,
            storeName: entry.storeName,
            amount: String(entry.amount),
            settledAt: entry.settledAt,
            registeredAt: entry.createdAt,
            registeredBy: entry.registeredBy,
          })),
        };
      }),
      total,
      page: currentPage,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    };
  }

  async create(productId: string, input: CreateSupplierSettlementDto, actor: AuthenticatedUser) {
    if (!actor.roles.includes(UserRole.SUPER_ADMIN) && !actor.roles.includes(UserRole.LEGAL_FINANCE)) {
      throw new ForbiddenException('ثبت تسویه فقط برای نقش مالی مجاز است.');
    }
    const amount = BigInt(positiveMoney(input.amount, 'مبلغ پرداخت'));
    const settledAt = dateOnly(input.settledAt, 'تاریخ پرداخت');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "DriverProduct" WHERE "id" = ${productId}::uuid FOR UPDATE`;
      const product = await tx.driverProduct.findUnique({
        where: { id: productId },
        include: { driver: { select: { id: true, currentStage: true, stageStatus: true } }, supplierSettlements: { orderBy: { createdAt: 'asc' }, select: { amount: true, storeName: true, productTitleSnapshot: true, quantitySnapshot: true, saleTotalSnapshot: true, payableTotalSnapshot: true } } },
      });
      if (!product || (!settlementDriverStages.some((stage) => stage === product.driver.currentStage) && product.driver.stageStatus !== 'COMPLETED')) throw new NotFoundException('کالای تحویل‌شده پیدا نشد.');
      const snapshot = product.supplierSettlements.at(-1);
      const payable = BigInt(positiveMoney(input.payableTotal, 'مبلغ کل بدهی به تأمین‌کننده'));
      const storeName = nonEmptyText(snapshot?.storeName ?? input.storeName, 'نام فروشگاه');
      if (storeName.length > 120) throw new BadRequestException('نام فروشگاه نباید بیشتر از ۱۲۰ نویسه باشد.');
      const paid = product.supplierSettlements.reduce((sum, entry) => sum + entry.amount, 0n);
      if (payable < paid) throw new BadRequestException('مبلغ کل بدهی نمی‌تواند از مجموع پرداخت‌های ثبت‌شده کمتر باشد.');
      if (amount > payable - paid) throw new BadRequestException('مبلغ پرداخت از ماندهٔ بدهی به تأمین‌کننده بیشتر است.');

      const saleTotalSnapshot = snapshot?.saleTotalSnapshot ?? (product.saleUnitPrice === null ? null : BigInt(product.saleUnitPrice) * BigInt(product.quantity));

      const settlement = await tx.supplierSettlementRecord.create({
        data: {
          productId,
          productTitleSnapshot: snapshot?.productTitleSnapshot ?? product.title,
          quantitySnapshot: snapshot?.quantitySnapshot ?? product.quantity,
          saleTotalSnapshot,
          payableTotalSnapshot: payable,
          storeName,
          amount,
          settledAt,
          registeredById: actor.id,
        },
        include: { registeredBy: { select: { name: true } } },
      });
      await tx.auditEvent.create({
        data: {
          driverId: product.driver.id,
          actorId: actor.id,
          eventType: 'SUPPLIER_SETTLEMENT_RECORDED',
          details: { productId, productTitle: product.title, storeName, amount: String(amount), payableTotal: String(payable), settledAt: settledAt.toISOString().slice(0, 10) },
        },
      });
      return {
        id: settlement.id,
        storeName: settlement.storeName,
        amount: String(settlement.amount),
        settledAt: settlement.settledAt,
        registeredAt: settlement.createdAt,
        registeredBy: settlement.registeredBy,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async updateDebt(productId: string, input: UpdateSupplierDebtDto, actor: AuthenticatedUser) {
    if (!actor.roles.includes(UserRole.SUPER_ADMIN) && !actor.roles.includes(UserRole.LEGAL_FINANCE)) {
      throw new ForbiddenException('ویرایش بدهی فقط برای نقش مالی مجاز است.');
    }
    const payable = BigInt(positiveMoney(input.payableTotal, 'مبلغ کل بدهی به تأمین‌کننده'));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "DriverProduct" WHERE "id" = ${productId}::uuid FOR UPDATE`;
      const product = await tx.driverProduct.findUnique({
        where: { id: productId },
        include: { driver: { select: { id: true, currentStage: true, stageStatus: true } }, supplierSettlements: { orderBy: { createdAt: 'asc' }, select: { amount: true, payableTotalSnapshot: true } } },
      });
      if (!product || (!settlementDriverStages.some((stage) => stage === product.driver.currentStage) && product.driver.stageStatus !== 'COMPLETED') || product.supplierSettlements.length === 0) throw new NotFoundException('تسویهٔ ثبت‌شده برای این کالا پیدا نشد.');
      const paid = product.supplierSettlements.reduce((sum, entry) => sum + entry.amount, 0n);
      if (payable < paid) throw new BadRequestException('مبلغ کل بدهی نمی‌تواند از مجموع پرداخت‌های ثبت‌شده کمتر باشد.');
      const previousPayable = product.supplierSettlements.at(-1)!.payableTotalSnapshot;
      await tx.supplierSettlementRecord.updateMany({ where: { productId }, data: { payableTotalSnapshot: payable } });
      await tx.auditEvent.create({
        data: {
          driverId: product.driver.id,
          actorId: actor.id,
          eventType: 'SUPPLIER_DEBT_UPDATED',
          details: { productId, previousPayable: String(previousPayable), payable: String(payable), paid: String(paid) },
        },
      });
      return { productId, payableTotal: String(payable), paidTotal: String(paid), remaining: String(payable - paid) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
