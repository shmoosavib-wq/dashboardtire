import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'api', 'package.json'));
require('dotenv').config({ path: path.join(root, 'api', '.env') });

const apiUrl = process.env.SABABAR_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
const appOrigin = process.env.APP_ORIGIN || 'http://127.0.0.1:5174';
const apiHost = new URL(apiUrl).hostname;
const originHost = new URL(appOrigin).hostname;
const loopback = (host) => host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (process.env.NODE_ENV === 'production' || !loopback(apiHost) || !loopback(originHost)) {
  throw new Error('Smoke test is restricted to a local, non-production API and UI origin.');
}

const username = process.env.SABABAR_TEST_USERNAME || process.env.LOCAL_DEMO_USERNAME;
const password = process.env.SABABAR_TEST_PASSWORD || process.env.LOCAL_DEMO_PASSWORD;
if (!username || !password) throw new Error('Set SABABAR_TEST_USERNAME/PASSWORD or configure local demo credentials in api/.env.');

let passed = 0;
let salesUser;
const temporaryUsers = [];
let driverId;
let createdMobile;
let salesSession;
let adminSession;

async function request(session, method, route, { body, form, expected = [200] } = {}) {
  const headers = { origin: appOrigin };
  if (session?.cookie) headers.cookie = session.cookie;
  let requestBody;
  if (form) requestBody = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(new URL(`/api${route}`, apiUrl), { method, headers, body: requestBody });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  if (!expected.includes(response.status)) {
    const detail = Buffer.isBuffer(data) ? '' : JSON.stringify(data).slice(0, 300);
    throw new Error(`${method} ${route}: expected ${expected.join('/')} but received ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return { response, data };
}

async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${label}`);
}

async function login(user, pass) {
  const { response, data } = await request(null, 'POST', '/auth/login', { body: { username: user, password: pass }, expected: [201] });
  const cookie = (response.headers.get('set-cookie') || '').match(/sababar_session=[^;]+/)?.[0];
  assert.ok(cookie, 'login must issue a session cookie');
  return { cookie, user: data };
}

async function createRoleUser(role, suffix) {
  const user = {
    name: `Smoke ${suffix}`,
    username: `smoke-${Date.now().toString(36)}-${suffix.toLowerCase()}`,
    password: randomBytes(24).toString('base64url'),
    roles: [role],
  };
  const { data } = await request(adminSession, 'POST', '/users', { body: user, expected: [201] });
  temporaryUsers.push(data.id);
  return login(user.username, user.password);
}

async function createTestDriver() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const mobile = `09${randomInt(100000000, 1000000000)}`;
    const { response, data } = await request(salesSession, 'POST', '/drivers', {
      body: { fullName: `Smoke Driver ${Date.now()}`, mobile, intentNote: 'Functional smoke test' },
      expected: [201, 409],
    });
    if (response.status === 201) {
      driverId = data.id;
      createdMobile = mobile;
      return data;
    }
  }
  throw new Error('Could not allocate a unique test mobile number.');
}

async function saveDraft(session, stage, payload) {
  return request(session, 'PATCH', `/drivers/${driverId}/draft`, { body: { stage, payload } });
}

async function action(session, name, payload, expected = [201]) {
  return request(session, 'POST', `/drivers/${driverId}/actions`, { body: { action: name, ...(payload ? { payload } : {}) }, expected });
}

async function upload(session, category, stage, filename, mime, bytes, { customTitle, expected = [201] } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  const title = customTitle ? `&customTitle=${encodeURIComponent(customTitle)}` : '';
  return request(session, 'POST', `/drivers/${driverId}/documents?category=${category}&stage=${stage}${title}`, { form, expected });
}

async function currentDriver(session) {
  return (await request(session, 'GET', `/drivers/${driverId}`)).data;
}

async function cleanup() {
  if (driverId && salesSession) {
    try {
      const driver = await currentDriver(salesSession);
      if (!driver.archivedAt) await request(salesSession, 'POST', `/drivers/${driverId}/archive`, { body: { reason: 'Automated smoke test cleanup' }, expected: [201] });
    } catch (error) {
      console.error(`CLEANUP WARNING driver ${createdMobile || driverId}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  for (const id of temporaryUsers) {
    try { await request(adminSession, 'PATCH', `/users/${id}`, { body: { isActive: false } }); }
    catch (error) { console.error(`CLEANUP WARNING temporary user ${id}: ${error instanceof Error ? error.message : 'failed'}`); }
  }
  if (adminSession) {
    try { await request(adminSession, 'POST', '/auth/logout', { expected: [201] }); }
    catch (error) { console.error(`CLEANUP WARNING admin session: ${error instanceof Error ? error.message : 'failed'}`); }
  }
}

try {
  await check('API is reachable and initialized', async () => {
    const status = await request(null, 'GET', '/auth/setup-status');
    assert.equal(status.data.initialized, true);
  });
  await check('web app is served from the configured local origin', async () => {
    const response = await fetch(appOrigin);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"/);
  });

  adminSession = await login(username, password);
  assert.ok(adminSession.user.roles.includes('SUPER_ADMIN'), 'configured test account must be a super admin');
  salesSession = await createRoleUser('SALES_OPERATIONS', 'Sales');
  salesUser = salesSession.user;
  const creditSession = await createRoleUser('CREDIT_APPROVER', 'Credit');
  const financeSession = await createRoleUser('LEGAL_FINANCE', 'Finance');
  await check('separate role accounts can authenticate', async () => {
    assert.deepEqual(salesUser.roles, ['SALES_OPERATIONS']);
    assert.deepEqual(creditSession.user.roles, ['CREDIT_APPROVER']);
    assert.deepEqual(financeSession.user.roles, ['LEGAL_FINANCE']);
  });

  await check('user administration is restricted to super admins', async () => {
    await request(salesSession, 'GET', '/users', { expected: [403] });
    const users = await request(adminSession, 'GET', '/users');
    assert.ok(Array.isArray(users.data));
  });

  await check('unauthenticated API requests are rejected', async () => {
    await request(null, 'GET', '/drivers', { expected: [401] });
  });

  const created = await createTestDriver();
  await check('lead creation starts at declared intent and is searchable', async () => {
    assert.equal(created.currentStage, 'NEED_DECLARED');
    assert.equal(created.stageStatus, 'IN_PROGRESS');
    const rows = (await request(salesSession, 'GET', `/drivers?search=${encodeURIComponent(createdMobile)}`)).data;
    assert.ok(rows.some((row) => row.id === driverId));
  });

  await check('role restrictions and declared-intent transition work', async () => {
    await action(creditSession, 'SUBMIT_NEED', undefined, [403]);
    await action(salesSession, 'SUBMIT_NEED');
    assert.equal((await currentDriver(salesSession)).currentStage, 'APP_VERIFICATION');
  });

  await check('partial identity draft persists and incomplete submission stays put', async () => {
    await saveDraft(salesSession, 'APP_VERIFICATION', { smartFleetNumber: 'SF-TEST-25' });
    const saved = await currentDriver(salesSession);
    const draft = saved.drafts.find((item) => item.stage === 'APP_VERIFICATION');
    assert.equal(draft.payload.smartFleetNumber, 'SF-TEST-25');
    await action(salesSession, 'VERIFY_APP', undefined, [400]);
    assert.equal((await currentDriver(salesSession)).currentStage, 'APP_VERIFICATION');
    await saveDraft(salesSession, 'APP_VERIFICATION', { ownerVerified: true, identityVerified: true });
    await action(salesSession, 'VERIFY_APP');
    assert.equal((await currentDriver(salesSession)).currentStage, 'CREDIT_REVIEW');
  });

  await check('credit data is saved, visible to approver, and role-gated', async () => {
    const creditData = { sababarTrips: 12, transportPayments: 8, lastWaybillDate: '1405/08/16', bankRank: 'A', suggestedLimit: '50000000' };
    await saveDraft(salesSession, 'CREDIT_REVIEW', creditData);
    await action(creditSession, 'SUBMIT_CREDIT', undefined, [403]);
    await action(salesSession, 'SUBMIT_CREDIT');
    const detail = await currentDriver(creditSession);
    const draft = detail.drafts.find((item) => item.stage === 'CREDIT_REVIEW');
    assert.equal(draft.payload.sababarTrips, 12);
    assert.equal(draft.payload.transportPayments, 8);
    await action(salesSession, 'APPROVE_CREDIT', { approvedLimit: '40000000' }, [403]);
    await action(creditSession, 'APPROVE_CREDIT', { approvedLimit: '40000000' });
    assert.equal((await currentDriver(salesSession)).currentStage, 'PROFORMA_PAYMENT_RESERVATION');
  });

  const pdf = Buffer.from('%PDF-1.4\n%smoke-test\n%%EOF\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/s7sAAAAASUVORK5CYII=', 'base64');
  await check('proforma requires a document but does not require a product entry', async () => {
    await saveDraft(salesSession, 'PROFORMA_PAYMENT_RESERVATION', { invoiceNumber: 'SMOKE-001', invoiceDate: '1405/08/16' });
    await action(salesSession, 'SUBMIT_PROFORMA', undefined, [422]);
    const forgedPdf = Buffer.from('<html>not a PDF</html>');
    await upload(salesSession, 'PROFORMA', 'PROFORMA_PAYMENT_RESERVATION', 'forged-invoice.pdf', 'application/pdf', forgedPdf, { expected: [422] });
    const uploadedPdf = await upload(salesSession, 'PROFORMA', 'PROFORMA_PAYMENT_RESERVATION', 'smoke-invoice.pdf', 'application/octet-stream', pdf);
    assert.equal(uploadedPdf.data.category, 'PROFORMA');
    assert.equal(uploadedPdf.data.mimeType, 'application/pdf');
    const uploadedImage = await upload(salesSession, 'PROFORMA', 'PROFORMA_PAYMENT_RESERVATION', 'smoke-invoice.png', 'image/png', png);
    assert.equal(uploadedImage.data.mimeType, 'image/png');
    await action(salesSession, 'SUBMIT_PROFORMA');
    const driver = await currentDriver(salesSession);
    assert.equal(driver.stageStatus, 'AWAITING_INITIAL_PAYMENT');
    assert.equal(driver.products.length, 0);
  });

  await check('initial payment saves in pieces and requires finance confirmation', async () => {
    await saveDraft(salesSession, 'PROFORMA_PAYMENT_RESERVATION', { paymentAmount: '10000000' });
    const partial = await currentDriver(salesSession);
    assert.equal(partial.drafts.find((item) => item.stage === 'PROFORMA_PAYMENT_RESERVATION').payload.paymentAmount, '10000000');
    await saveDraft(salesSession, 'PROFORMA_PAYMENT_RESERVATION', { paymentDate: '1405/08/16', paymentReference: 'SMOKE-PAY-01' });
    await action(salesSession, 'REGISTER_INITIAL_PAYMENT');
    await action(salesSession, 'CONFIRM_INITIAL_PAYMENT', undefined, [403]);
    await action(financeSession, 'CONFIRM_INITIAL_PAYMENT', undefined, [400]);
    await action(financeSession, 'CONFIRM_INITIAL_PAYMENT', { paymentReceivedConfirmed: true });
    assert.equal((await currentDriver(salesSession)).stageStatus, 'PAYMENT_CONFIRMED_AWAITING_RESERVATION');
  });

  await check('reservation is registered before advancing to contract stage', async () => {
    await saveDraft(salesSession, 'PROFORMA_PAYMENT_RESERVATION', { reservationLocation: 'Local smoke warehouse', reservationDate: '1405/08/16' });
    await action(salesSession, 'RESERVE_GOODS', undefined, [400]);
    await saveDraft(salesSession, 'PROFORMA_PAYMENT_RESERVATION', { reservationConfirmed: true });
    await action(salesSession, 'RESERVE_GOODS');
    assert.equal((await currentDriver(salesSession)).currentStage, 'CONTRACT_CHEQUE');
  });

  const contractPdf = Buffer.from('%PDF-1.4\n%contract\n%%EOF\n');
  const chequePdf = Buffer.from('%PDF-1.4\n%cheque\n%%EOF\n');
  await check('contract and cheque upload together; legal/finance approval checks both', async () => {
    await saveDraft(salesSession, 'CONTRACT_CHEQUE', { contractNumber: 'SMOKE-CON-01', chequeNumber: '12345678', sayadId: 'SMOKE-SAYAD', chequeAmount: '40000000', chequeDueDate: '1405/12/16' });
    await upload(salesSession, 'CONTRACT', 'CONTRACT_CHEQUE', 'smoke-contract.pdf', 'application/pdf', contractPdf);
    await action(salesSession, 'SUBMIT_CONTRACT_CHEQUE', undefined, [422]);
    await upload(salesSession, 'CHEQUE', 'CONTRACT_CHEQUE', 'smoke-cheque.pdf', 'application/pdf', chequePdf);
    await action(salesSession, 'SUBMIT_CONTRACT_CHEQUE');
    await action(financeSession, 'APPROVE_CONTRACT_CHEQUE', undefined, [400]);
    const review = await currentDriver(financeSession);
    const draft = review.drafts.find((item) => item.stage === 'CONTRACT_CHEQUE');
    assert.equal(draft.payload.chequeNumber, '12345678');
    await saveDraft(financeSession, 'CONTRACT_CHEQUE', { contractChecked: true, chequeChecked: true });
    await action(financeSession, 'APPROVE_CONTRACT_CHEQUE');
    assert.equal((await currentDriver(salesSession)).currentStage, 'DELIVERY_FINAL_DOCS');
  });

  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])]);
  await check('delivery requires all checks and satisfaction video before completion', async () => {
    await saveDraft(salesSession, 'DELIVERY_FINAL_DOCS', { deliveryDate: '1405/08/16', deliveryLocation: 'Smoke yard', recipient: 'Smoke recipient' });
    await upload(salesSession, 'SATISFACTION_VIDEO', 'DELIVERY_FINAL_DOCS', 'smoke-satisfaction.mp4', 'video/mp4', mp4);
    await action(salesSession, 'COMPLETE_DELIVERY', undefined, [422]);
    await saveDraft(salesSession, 'DELIVERY_FINAL_DOCS', { contractPhysical: true, chequePhysical: true, goodsDelivered: true, satisfactionVideoReceived: true });
    await action(salesSession, 'COMPLETE_DELIVERY');
    const completed = await currentDriver(salesSession);
    assert.equal(completed.currentStage, 'COMPLETED');
    assert.equal(completed.stageStatus, 'COMPLETED');
    const categories = new Set(completed.documents.map((doc) => doc.category));
    for (const category of ['PROFORMA', 'CONTRACT', 'CHEQUE', 'SATISFACTION_VIDEO']) assert.ok(categories.has(category));
  });

  await check('document download returns original bytes and is audit logged', async () => {
    const detail = await currentDriver(salesSession);
    const doc = detail.documents.find((item) => item.category === 'PROFORMA' && item.mimeType === 'application/pdf');
    assert.ok(doc);
    const { response, data } = await request(salesSession, 'GET', `/drivers/${driverId}/documents/${doc.id}/download`);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(data, pdf);
  });

  await check('custom document can be uploaded, is role-protected, soft-deleted, and audited', async () => {
    const { data: document } = await upload(salesSession, 'CUSTOM', 'COMPLETED', 'smoke-extra.pdf', 'application/pdf', pdf, { customTitle: 'مدرک آزمایشی' });
    await request(financeSession, 'DELETE', `/drivers/${driverId}/documents/${document.id}`, { expected: [403] });
    await request(salesSession, 'DELETE', `/drivers/${driverId}/documents/${document.id}`, { expected: [200] });
    await request(salesSession, 'GET', `/drivers/${driverId}/documents/${document.id}/download`, { expected: [404] });
    const detail = await currentDriver(salesSession);
    assert.ok(detail.auditEvents.some((event) => event.eventType === 'DOCUMENT_DELETED' && event.details.documentId === document.id));
  });

  await check('store settlement records amount/date and appears in dossier', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await request(financeSession, 'POST', `/drivers/${driverId}/store-settlement`, { body: { amount: 76000000, settledAt: today }, expected: [201] });
    const detail = await currentDriver(financeSession);
    assert.equal(detail.storeSettlement.amount, '76000000');
    assert.equal(detail.storeSettlement.settledAt.slice(0, 10), today);
  });

  await check('archive and restore preserve the driver record and audit trail', async () => {
    await request(salesSession, 'POST', `/drivers/${driverId}/archive`, { body: { reason: 'Smoke test archive/restore check' }, expected: [201] });
    const archived = (await request(salesSession, 'GET', `/drivers?archived=true&search=${encodeURIComponent(createdMobile)}`)).data;
    assert.ok(archived.some((row) => row.id === driverId));
    await request(adminSession, 'POST', `/drivers/${driverId}/restore`, { expected: [201] });
    const restored = await currentDriver(salesSession);
    assert.equal(restored.archivedAt, null);
    const events = restored.auditEvents.map((event) => event.eventType);
    for (const event of ['DRIVER_CREATED', 'STAGE_DRAFT_SAVED', 'WORKFLOW_SUBMIT_NEED', 'WORKFLOW_VERIFY_APP', 'WORKFLOW_SUBMIT_CREDIT', 'WORKFLOW_APPROVE_CREDIT', 'WORKFLOW_SUBMIT_PROFORMA', 'WORKFLOW_REGISTER_INITIAL_PAYMENT', 'WORKFLOW_CONFIRM_INITIAL_PAYMENT', 'WORKFLOW_RESERVE_GOODS', 'WORKFLOW_SUBMIT_CONTRACT_CHEQUE', 'WORKFLOW_APPROVE_CONTRACT_CHEQUE', 'WORKFLOW_COMPLETE_DELIVERY', 'DOCUMENT_UPLOADED', 'DOCUMENT_DOWNLOADED', 'STORE_SETTLEMENT_RECORDED', 'DRIVER_ARCHIVED', 'DRIVER_RESTORED']) assert.ok(events.includes(event), `missing audit event ${event}`);
  });
} catch (error) {
  console.error(`FAIL after ${passed} checks: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}

if (process.exitCode !== 1) console.log(`SMOKE TEST PASSED: ${passed} checks; driver ${createdMobile || '(not created)'} archived and temporary users disabled.`);
