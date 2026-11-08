const assert = require('node:assert/strict');
const test = require('node:test');
const { BadRequestException, ForbiddenException, HttpException, UnprocessableEntityException } = require('@nestjs/common');
const { AuditQueryService } = require('../dist/audit/audit.service.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { DocumentsService } = require('../dist/drivers/documents.service.js');
const { DriversService } = require('../dist/drivers/drivers.service.js');
const { UsersService } = require('../dist/users/users.service.js');
const { dateOnly, hasRole, nonEmptyText, nonNegativeInteger, positiveMoney, requireRole } = require('../dist/drivers/workflow.js');

// Unit tests keep Prisma in memory; the smoke suite separately checks these flows against local PostgreSQL.
const actor = (id, ...roles) => ({ id, name: id, username: id, roles });

test('workflow validation accepts Persian numbers and rejects invalid amounts and dates', () => {
  assert.equal(positiveMoney('۱٬۲۵۰٬۰۰۰', 'amount'), 1250000);
  assert.equal(positiveMoney('١٢٣', 'amount'), 123);
  assert.throws(() => positiveMoney('0', 'amount'), BadRequestException);
  assert.throws(() => positiveMoney('12.5', 'amount'), BadRequestException);
  assert.equal(nonNegativeInteger('۱٬۲۵۰', 'count'), 1250);
  assert.throws(() => nonNegativeInteger('1e3', 'count'), BadRequestException);
  assert.equal(dateOnly('2026-11-08', 'date').toISOString(), '2026-11-08T12:00:00.000Z');
  assert.throws(() => dateOnly('2026-02-30', 'date'), BadRequestException);
  assert.equal(nonEmptyText('  ok  ', 'text'), 'ok');
  assert.throws(() => nonEmptyText('  ', 'text'), BadRequestException);
});

test('role policy permits the assigned role and super admin, and denies unrelated roles', () => {
  requireRole(actor('sales', 'SALES_OPERATIONS'), 'SALES_OPERATIONS');
  requireRole(actor('admin', 'SUPER_ADMIN'), 'LEGAL_FINANCE');
  assert.equal(hasRole(actor('credit', 'CREDIT_APPROVER'), 'CREDIT_APPROVER'), true);
  assert.throws(() => requireRole(actor('sales', 'SALES_OPERATIONS'), 'CREDIT_APPROVER'), ForbiddenException);
});

test('driver draft saves merge partial data and audit only changed field names', async () => {
  const storedDraft = { id: 'draft-1', payload: { smartFleetNumber: 'SF-1', ownerVerified: false }, version: 2 };
  let updateArgs;
  const audit = [];
  const tx = {
    stageDraft: {
      findUnique: async () => storedDraft,
      updateMany: async (args) => { updateArgs = args; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ ...storedDraft, ...updateArgs.data, version: 3 }),
    },
    auditEvent: { create: async (args) => audit.push(args) },
  };
  const prisma = {
    driver: { findUnique: async () => ({ id: 'driver-1', archivedAt: null, currentStage: 'APP_VERIFICATION' }) },
    $transaction: async (callback) => callback(tx),
  };
  const service = new DriversService(prisma);

  const result = await service.saveDraft('driver-1', {
    stage: 'APP_VERIFICATION', payload: { ownerVerified: true },
  }, actor('sales', 'SALES_OPERATIONS'));

  assert.deepEqual(updateArgs.data.payload, { smartFleetNumber: 'SF-1', ownerVerified: true });
  assert.deepEqual(audit[0].data.details.changedKeys, ['ownerVerified']);
  assert.equal(audit[0].data.actorId, 'sales');
  assert.equal(result.version, 3);
});

test('driver draft rejects unknown fields before opening a transaction', async () => {
  let transactionOpened = false;
  const service = new DriversService({
    driver: { findUnique: async () => ({ id: 'driver-1', archivedAt: null, currentStage: 'NEED_DECLARED' }) },
    $transaction: async () => { transactionOpened = true; },
  });
  await assert.rejects(
    service.saveDraft('driver-1', { stage: 'NEED_DECLARED', payload: { adminOverride: true } }, actor('sales', 'SALES_OPERATIONS')),
    BadRequestException,
  );
  assert.equal(transactionOpened, false);
});

test('workflow action advances with a compare-and-set update and writes an audit event', async () => {
  let driver = { id: 'driver-1', currentStage: 'NEED_DECLARED', stageStatus: 'IN_PROGRESS', archivedAt: null };
  let upsertedDraft;
  let auditEvent;
  const tx = {
    driver: {
      updateMany: async ({ data }) => { driver = { ...driver, ...data }; return { count: 1 }; },
      findUnique: async () => driver,
    },
    stageDraft: { upsert: async (args) => { upsertedDraft = args.create; } },
    auditEvent: { create: async (args) => { auditEvent = args.data; } },
  };
  const prisma = {
    driver: { findUnique: async () => driver },
    stageDraft: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };
  const result = await new DriversService(prisma).action(
    'driver-1', { action: 'SUBMIT_NEED', note: 'move forward' }, actor('sales', 'SALES_OPERATIONS'),
  );

  assert.equal(result.currentStage, 'APP_VERIFICATION');
  assert.equal(upsertedDraft.stage, 'NEED_DECLARED');
  assert.equal(auditEvent.eventType, 'WORKFLOW_SUBMIT_NEED');
  assert.equal(auditEvent.details.toStage, 'APP_VERIFICATION');
});

test('audit query paginates newest events and combines category with text search', async () => {
  let args;
  let countArgs;
  const service = new AuditQueryService({ auditEvent: {
    findMany: async (query) => { args = query; return [{ id: 'event-1' }]; },
    count: async (query) => { countArgs = query; return 201; },
  } });
  const result = await service.list({ page: 3, pageSize: 1000, q: '  ali  ', category: 'workflow' });
  assert.equal(args.skip, 200);
  assert.equal(args.take, 100);
  assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(args.include.actor.select, { id: true, name: true, username: true });
  assert.equal(args.where.eventType.startsWith, 'WORKFLOW_');
  assert.equal(args.where.AND[0].OR[0].eventType.contains, 'ali');
  assert.deepEqual(countArgs.where, args.where);
  assert.deepEqual(result, { items: [{ id: 'event-1' }], total: 201, page: 3, pageSize: 100, totalPages: 3 });
});

test('last active super admin cannot be disabled', async () => {
  let userUpdated = false;
  const tx = {
    user: {
      findUnique: async () => ({ id: 'admin-1', isActive: true, roles: ['SUPER_ADMIN'] }),
      count: async () => 0,
      update: async () => { userUpdated = true; },
    },
  };
  const service = new UsersService({ $transaction: async (callback) => callback(tx) });
  await assert.rejects(service.update('admin-1', { isActive: false }, actor('admin-1', 'SUPER_ADMIN')), (error) => error.getStatus() === 422);
  assert.equal(userUpdated, false);
});

test('password reset revokes existing sessions and records an audit event', async () => {
  let sessionsRevoked = false;
  let auditEvent;
  const tx = {
    user: { update: async () => ({}) },
    session: { deleteMany: async () => { sessionsRevoked = true; } },
    auditEvent: { create: async ({ data }) => { auditEvent = data; } },
  };
  const prisma = {
    user: { findUnique: async () => ({ id: 'user-1' }) },
    $transaction: async (callback) => callback(tx),
  };
  await new UsersService(prisma).resetPassword('user-1', { password: 'Local-test-password-9!' }, actor('admin', 'SUPER_ADMIN'));
  assert.equal(sessionsRevoked, true);
  assert.equal(auditEvent.eventType, 'USER_PASSWORD_RESET');
  assert.equal(auditEvent.actorId, 'admin');
});

test('store settlement persists the amount/date and records whether it is new', async () => {
  let settlementData;
  let auditEvent;
  const tx = {
    storeSettlement: { upsert: async ({ create }) => { settlementData = create; return { ...create, amount: BigInt(create.amount) }; } },
    auditEvent: { create: async ({ data }) => { auditEvent = data; } },
  };
  const prisma = {
    driver: { findUnique: async () => ({ id: 'driver-1', archivedAt: null }) },
    storeSettlement: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };
  const result = await new DriversService(prisma).settleStore('driver-1', { amount: 76000000, settledAt: '2026-11-08' }, actor('finance', 'LEGAL_FINANCE'));
  assert.equal(settlementData.amount, 76000000n);
  assert.equal(settlementData.settledAt.toISOString(), '2026-11-08T12:00:00.000Z');
  assert.equal(result.amount, '76000000');
  assert.equal(auditEvent.eventType, 'STORE_SETTLEMENT_RECORDED');
});

test('document upload rejects a forged PDF signature before writing to storage', async () => {
  let transactionOpened = false;
  const service = new DocumentsService({
    driver: { findUnique: async () => ({ id: 'driver-1', archivedAt: null, currentStage: 'NEED_DECLARED' }) },
    $transaction: async () => { transactionOpened = true; },
  });
  await assert.rejects(service.upload('driver-1', { category: 'PROFORMA' }, {
    originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 12, buffer: Buffer.from('<html>fake</html>'),
  }, actor('sales', 'SALES_OPERATIONS')), UnprocessableEntityException);
  assert.equal(transactionOpened, false);
});

test('document removal uses a soft delete and leaves an audit trail', async () => {
  let updateArgs;
  let auditEvent;
  const tx = {
    driverDocument: { update: async (args) => { updateArgs = args; } },
    auditEvent: { create: async ({ data }) => { auditEvent = data; } },
  };
  const prisma = {
    driverDocument: { findFirst: async () => ({ id: 'doc-1', category: 'CUSTOM', customTitle: 'extra', originalName: 'extra.pdf' }) },
    $transaction: async (callback) => callback(tx),
  };
  const result = await new DocumentsService(prisma).remove('driver-1', 'doc-1', actor('sales', 'SALES_OPERATIONS'));
  assert.equal(result.success, true);
  assert.equal(updateArgs.where.id, 'doc-1');
  assert.ok(updateArgs.data.deletedAt instanceof Date);
  assert.equal(auditEvent.eventType, 'DOCUMENT_DELETED');
});

test('authentication throttles repeated failed logins for the same username', async () => {
  const service = new AuthService({ user: { findUnique: async () => null } });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await assert.rejects(service.login({ username: 'unknown-user', password: 'wrong' }, {}), (error) => error instanceof HttpException && error.getStatus() === 401);
  }
  await assert.rejects(service.login({ username: 'unknown-user', password: 'wrong' }, {}), (error) => error instanceof HttpException && error.getStatus() === 429);
});
