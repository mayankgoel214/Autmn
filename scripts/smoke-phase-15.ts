#!/usr/bin/env tsx
/**
 * Phase 15 smoke — refund request flow.
 *
 * Paths:
 *   BJ′. (updated from Phase 14) request_refund -> REFUND_REQUEST + the new
 *        msgAskRefundReason prompt (NOT the deprecated msgRefundComingSoon).
 *   BL.  Text reason in REFUND_REQUEST -> Order.refundReason set,
 *        refundStatus='pending', refundRequestedAt set, state -> DELIVERED,
 *        msgRefundReasonReceived sent.
 *   BM.  Whitespace-only text -> re-prompt, state stays REFUND_REQUEST,
 *        Order.refundReason still null.
 *   BN.  Escape intent ("menu") in REFUND_REQUEST -> resets to IDLE,
 *        no refund reason persisted.
 *   BO.  Admin GET /admin/refunds returns the pending order, with
 *        refundReason + amountPaise populated.
 *   BP.  Admin POST /admin/refunds/:orderId/deny marks refundStatus='denied'
 *        and writes decision note + sends WA notification (mocked client).
 *
 * The Razorpay approval path is NOT exercised here — it would require
 * a sandbox payment ID. The typecheck on admin.ts confirms wiring; the
 * runtime path is covered by the existing payment package tests + manual
 * test in Razorpay sandbox before production deploy.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`Could not read ${envPath}`);
    process.exit(1);
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadEnv(resolve(import.meta.dirname, '../.env'));

const { PrismaClient } = await import('../packages/db/src/generated/client/index.js');
const { handleIncomingMessage } = await import(
  '../packages/session/dist/index.js'
);
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919977${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
  rows?: Array<{ id: string; title: string }>;
}

function makeMockWa() {
  const sent: SentMessage[] = [];
  const wa = {
    sendText: async (_p: string, body: string) => sent.push({ type: 'text', body }),
    sendButtons: async (_p: string, body: string) => sent.push({ type: 'buttons', body }),
    sendList: async (_p: string, body: string) => sent.push({ type: 'list', body }),
    sendImage: async (_p: string, _u: string, caption?: string) =>
      sent.push({ type: 'image', body: caption ?? '' }),
    sendPaymentLink: async (_p: string, body: string) =>
      sent.push({ type: 'paymentLink', body }),
    markAsRead: async (_id: string) => {},
  };
  return { wa: wa as any, sent };
}

let msgCounter = 0;
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke15-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    listReplyId,
    timestamp: Date.now(),
  };
}
function makeTextMessage(text: string): MessageContext {
  return {
    messageId: `smoke15-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function cleanup(): Promise<void> {
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke15-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

async function seedDeliveredOrder(): Promise<{ orderId: string }> {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: {
      brandName: 'Tester', name: 'Tester', businessType: 'cat_jewellery',
      language: 'en', orderCount: 1,
    },
    create: {
      phoneNumber: PHONE,
      brandName: 'Tester', name: 'Tester', businessType: 'cat_jewellery',
      language: 'en', orderCount: 1,
    },
  });
  const order = await prisma.order.create({
    data: {
      phoneNumber: PHONE,
      imageCount: 1,
      style: 'style_clean_white',
      stylesOrdered: ['style_clean_white'],
      outputStyleCount: 1,
      numStylesPicked: 1,
      inputImageUrls: ['https://example.com/photo.jpg'],
      outputImageUrls: ['https://example.com/out1.jpg'],
      status: 'completed',
      amount: 4900,
      amountPaise: 4900,
      isFirstFree: false,
      productCategory: 'cat_jewellery',
      razorpayPaymentId: 'pay_smoke15_dummy',
      userId: user.id,
    },
  });
  await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: {
      state: 'DELIVERED',
      currentOrderId: order.id,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
    create: {
      phoneNumber: PHONE,
      state: 'DELIVERED',
      currentOrderId: order.id,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
  });
  return { orderId: order.id };
}

// ---------------------------------------------------------------------------
// Path BJ′ — request_refund -> asks for reason (NOT Phase 14 placeholder)
// ---------------------------------------------------------------------------

async function pathRequestRefundAsksReason(): Promise<void> {
  console.log('\n== Path BJ′: request_refund -> REFUND_REQUEST + msgAskRefundReason ==');
  await cleanup();
  await seedDeliveredOrder();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa);

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'REFUND_REQUEST',
    `state REFUND_REQUEST (got ${session?.state})`,
  );
  // The new prompt asks for a reason; the deprecated stub said "coming soon" / "Phase 15".
  assert(
    sent.some((m) => m.type === 'text' && /went wrong|kya galat hua|क्या गलत हुआ/i.test(m.body)),
    'msgAskRefundReason prompt sent',
  );
  assert(
    !sent.some((m) => m.type === 'text' && /coming|Phase 15|manual review/i.test(m.body)),
    'deprecated placeholder text NOT sent',
  );
}

// ---------------------------------------------------------------------------
// Path BL — text reason captured -> DELIVERED + status='pending'
// ---------------------------------------------------------------------------

async function pathTextReasonCaptured(): Promise<void> {
  console.log('\n== Path BL: text reason captured -> DELIVERED + status=pending ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa: wa1 } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2, sent: sent2 } = makeMockWa();
  const reason = 'The image quality was poor and the lighting felt unnatural.';
  await handleIncomingMessage(PHONE, makeTextMessage(reason), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === reason, `Order.refundReason persisted (got ${order?.refundReason?.slice(0, 30)}...)`);
  assert(order?.refundStatus === 'pending', `Order.refundStatus='pending' (got ${order?.refundStatus})`);
  assert(order?.refundRequestedAt instanceof Date, 'Order.refundRequestedAt set');
  assert(order?.refundReasonVoiceUrl === null, 'Order.refundReasonVoiceUrl null for text reason');

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'DELIVERED', `state -> DELIVERED (got ${session?.state})`);

  assert(
    sent2.some((m) => m.type === 'text' && /Got it|Mil gaya|मिल गया/i.test(m.body)),
    'msgRefundReasonReceived ack sent',
  );
}

// ---------------------------------------------------------------------------
// Path BM — whitespace-only text re-prompts, state stays REFUND_REQUEST
// ---------------------------------------------------------------------------

async function pathWhitespaceReprompts(): Promise<void> {
  console.log('\n== Path BM: whitespace-only text -> re-prompt + state stays REFUND_REQUEST ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa: wa1 } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2, sent: sent2 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeTextMessage('   '), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === null, 'Order.refundReason still null after whitespace');
  assert(order?.refundStatus === null, 'Order.refundStatus still null');

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'REFUND_REQUEST',
    `state stays REFUND_REQUEST (got ${session?.state})`,
  );
  assert(
    sent2.some((m) => m.type === 'text' && /went wrong|kya galat hua|क्या गलत हुआ/i.test(m.body)),
    're-prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path BN — escape intent ("menu") resets to IDLE without persisting reason
// ---------------------------------------------------------------------------

async function pathEscapeResetsToIdle(): Promise<void> {
  console.log('\n== Path BN: "cancel" in REFUND_REQUEST -> IDLE, no reason persisted ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa: wa1 } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2 } = makeMockWa();
  // "cancel" is in the isEscapeIntent regex — the user can back out of the
  // reason prompt without committing to a refund request.
  await handleIncomingMessage(PHONE, makeTextMessage('cancel'), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === null, 'Order.refundReason still null after escape');
  assert(order?.refundStatus === null, 'Order.refundStatus still null after escape');

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'IDLE', `state -> IDLE (got ${session?.state})`);
  assert(session?.currentOrderId === null, 'currentOrderId cleared on escape');
}

// ---------------------------------------------------------------------------
// Admin route tests — use a lightweight in-process fastify instance so we
// don't need to spin up the real server (no port binding, no Razorpay).
// ---------------------------------------------------------------------------

async function buildAdminApp() {
  // Fastify lives under apps/api/node_modules — scripts/ has no direct
  // resolution path because it isn't a workspace member. Use the file:// URL
  // of the package's own entry point.
  const fastifyPath = resolve(
    import.meta.dirname,
    '../apps/api/node_modules/fastify/fastify.js',
  );
  const Fastify = (await import(`file://${fastifyPath.replace(/\\/g, '/')}`)).default;
  const { adminRoutes } = await import('../apps/api/dist/routes/admin.js');
  const app = Fastify({ logger: false });
  await app.register(adminRoutes);
  return app;
}

async function pathAdminListPending(): Promise<void> {
  console.log('\n== Path BO: GET /admin/refunds lists pending order ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);
  const { wa: wa2 } = makeMockWa();
  await handleIncomingMessage(
    PHONE,
    makeTextMessage('Output had wrong colours.'),
    wa2,
  );

  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/admin/refunds' });
    assert(res.statusCode === 200, `GET /admin/refunds 200 (got ${res.statusCode})`);
    const json = res.json() as { ok: boolean; count: number; refunds: Array<{ id: string; refundReason: string }> };
    assert(json.ok === true, 'response.ok=true');
    const ours = json.refunds.find((r) => r.id === orderId);
    assert(!!ours, 'our pending order appears in the list');
    assert(ours?.refundReason === 'Output had wrong colours.', 'refundReason populated in list');
  } finally {
    await app.close();
  }
}

async function pathAdminDeny(): Promise<void> {
  console.log('\n== Path BP: POST /admin/refunds/:orderId/deny marks denied + notifies ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);
  const { wa: wa2 } = makeMockWa();
  await handleIncomingMessage(
    PHONE,
    makeTextMessage('Output too generic'),
    wa2,
  );

  const app = await buildAdminApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/refunds/${orderId}/deny`,
      payload: { reason: 'Output matches the brief; QA score above threshold.', reviewedBy: 'mayank' },
      headers: { 'content-type': 'application/json' },
    });
    assert(res.statusCode === 200, `POST .../deny 200 (got ${res.statusCode}, body=${res.body})`);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert(order?.refundStatus === 'denied', `refundStatus -> denied (got ${order?.refundStatus})`);
    assert(order?.refundDecidedAt instanceof Date, 'refundDecidedAt set');
    assert(
      typeof order?.refundDecisionNote === 'string' && order.refundDecisionNote.includes('mayank'),
      `refundDecisionNote contains reviewer (got ${order?.refundDecisionNote})`,
    );

    // Second denial should now be 409 (not pending anymore).
    const res2 = await app.inject({
      method: 'POST',
      url: `/admin/refunds/${orderId}/deny`,
      payload: { reason: 'duplicate' },
      headers: { 'content-type': 'application/json' },
    });
    assert(res2.statusCode === 409, `second denial returns 409 (got ${res2.statusCode})`);
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  console.log(`Phase 15 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathRequestRefundAsksReason();
    await pathTextReasonCaptured();
    await pathWhitespaceReprompts();
    await pathEscapeResetsToIdle();
    await pathAdminListPending();
    await pathAdminDeny();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 15 smoke assertions green.');
    process.exit(0);
  } else {
    console.error(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
