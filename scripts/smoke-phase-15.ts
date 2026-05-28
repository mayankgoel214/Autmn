#!/usr/bin/env tsx
/**
 * Phase 15 smoke — refund request flow (updated for 15a-c).
 *
 * Phase 15c replaced the POST /admin/refunds/:id/approve|deny routes with a
 * single GET /admin/refunds/decide?token=<jwt>. The email path is stubbed
 * (we override RESEND_API_KEY → unset to skip sending) so we don't need a
 * live Resend account to run smoke.
 *
 * Paths:
 *   BJ'. request_refund (paid) → REFUND_REQUEST + msgAskRefundReason
 *   BL.  text reason captured (paid) → refundReason/refundStatus persisted +
 *        DELIVERED + ack
 *   BM.  whitespace-only text → re-prompt + state stays
 *   BN.  cancel intent → IDLE + nothing persisted
 *   FR.  free-order short-circuit — request_refund on amountPaise=0 →
 *        msgFreeOrderNoRefund + state stays DELIVERED, NO REFUND_REQUEST
 *   ML.  magic-link approve URL: GET /admin/refunds/decide?token=<approve> →
 *        refundStatus='approved' + refundDecidedAt set + renders approved page
 *   MD.  magic-link deny URL: refundStatus='denied' + renders denied page
 *   MI.  magic-link replay (clicking after already decided) → already_decided
 *        page, no state change.
 *   MT.  invalid token → token_invalid page
 *   MX.  expired token → token_expired page
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

// Set required env for token signing + email-skip-mode.
process.env['REFUND_DECISION_SECRET'] = 'smoke-phase-15-secret-must-be-32-chars-or-more!!';
process.env['APP_URL'] = 'http://localhost:3001';
process.env['SUPPORT_PHONE_NUMBER'] = '+919876543210';
// Leave RESEND_API_KEY unset — the email helper throws which is caught + logged.
delete process.env['RESEND_API_KEY'];
delete process.env['ADMIN_EMAIL'];

const { PrismaClient } = await import('../packages/db/src/generated/client/index.js');
const { handleIncomingMessage } = await import(
  '../packages/session/dist/index.js'
);
const { signRefundDecisionToken } = await import(
  '../packages/session/dist/refund-token.js'
);
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919977${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
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
  return { wa: wa as Parameters<typeof handleIncomingMessage>[2], sent };
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
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
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

async function seedDeliveredOrder(opts: { amountPaise: number; shortId: string }): Promise<{ orderId: string }> {
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
      amount: opts.amountPaise,
      amountPaise: opts.amountPaise,
      shortId: opts.shortId,
      isFirstFree: opts.amountPaise === 0,
      productCategory: 'cat_jewellery',
      razorpayPaymentId: opts.amountPaise > 0 ? 'pay_smoke15_dummy' : null,
      userId: user.id,
    },
  });
  await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: {
      state: 'DELIVERED', currentOrderId: order.id, userId: user.id,
      stateEnteredAt: new Date(),
    },
    create: {
      phoneNumber: PHONE, state: 'DELIVERED', currentOrderId: order.id, userId: user.id,
      stateEnteredAt: new Date(),
    },
  });
  return { orderId: order.id };
}

// ---------------------------------------------------------------------------
// Path BJ' — paid order → reason prompt
// ---------------------------------------------------------------------------

async function pathPaidAsksReason(): Promise<void> {
  console.log('\n== Path BJ\': paid request_refund → REFUND_REQUEST + msgAskRefundReason ==');
  await cleanup();
  await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST001' });
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa);

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'REFUND_REQUEST', `state REFUND_REQUEST (got ${session?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /went wrong|kya galat hua|क्या गलत हुआ/i.test(m.body)),
    'msgAskRefundReason prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path FR — free-order short-circuit
// ---------------------------------------------------------------------------

async function pathFreeOrderShortCircuit(): Promise<void> {
  console.log('\n== Path FR: free order request_refund → short-circuit, stays DELIVERED ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 0, shortId: 'TST002' });
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa);

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'DELIVERED',
    `state stays DELIVERED on free order (got ${session?.state})`,
  );
  assert(
    sent.some((m) => m.type === 'text' && /no charge|koi charge|कोई charge|Send new product/i.test(m.body)),
    'free-order-no-refund message sent',
  );
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundStatus === null, 'no refundStatus written on short-circuit');
}

// ---------------------------------------------------------------------------
// Path BL — text reason captured
// ---------------------------------------------------------------------------

async function pathTextReasonCaptured(): Promise<void> {
  console.log('\n== Path BL: text reason → refundStatus=pending + DELIVERED + ack ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST003' });
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2, sent: sent2 } = makeMockWa();
  const reason = 'The image quality was poor.';
  await handleIncomingMessage(PHONE, makeTextMessage(reason), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === reason, `Order.refundReason persisted`);
  assert(order?.refundStatus === 'pending', `Order.refundStatus='pending' (got ${order?.refundStatus})`);
  assert(order?.refundRequestedAt instanceof Date, 'Order.refundRequestedAt set');
  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'DELIVERED', `state -> DELIVERED (got ${session?.state})`);
  assert(
    sent2.some((m) => m.type === 'text' && /Got it|Mil gaya|मिल गया/i.test(m.body)),
    'msgRefundReasonReceived ack sent',
  );
}

// ---------------------------------------------------------------------------
// Path BM — whitespace re-prompts
// ---------------------------------------------------------------------------

async function pathWhitespaceReprompts(): Promise<void> {
  console.log('\n== Path BM: whitespace-only → re-prompt + state stays REFUND_REQUEST ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST004' });
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2, sent: sent2 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeTextMessage('   '), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === null, 'no reason persisted on whitespace');
  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'REFUND_REQUEST', `state stays REFUND_REQUEST (got ${session?.state})`);
  assert(
    sent2.some((m) => m.type === 'text' && /went wrong|kya galat hua/i.test(m.body)),
    're-prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path BN — cancel escape
// ---------------------------------------------------------------------------

async function pathEscapeResetsToIdle(): Promise<void> {
  console.log('\n== Path BN: "cancel" in REFUND_REQUEST → IDLE, no reason persisted ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST005' });
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);

  const { wa: wa2 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeTextMessage('cancel'), wa2);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundReason === null, 'no reason persisted on escape');
  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'IDLE', `state -> IDLE (got ${session?.state})`);
}

// ---------------------------------------------------------------------------
// Path AR — plan §2 anti-abuse: refund already requested
// ---------------------------------------------------------------------------

async function pathAlreadyRequestedGuard(): Promise<void> {
  console.log('\n== Path AR: second request_refund tap → "already requested" + no overwrite ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST010' });

  // First submission — captures reason, returns to DELIVERED, refundStatus='pending'.
  const { wa: wa1 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa1);
  const { wa: wa2 } = makeMockWa();
  const originalReason = 'First reason: colours were wrong.';
  await handleIncomingMessage(PHONE, makeTextMessage(originalReason), wa2);

  let order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.refundStatus === 'pending', 'precondition: status is pending');
  assert(order?.refundReason === originalReason, 'precondition: original reason stored');

  // Second tap — should be a no-op + "already requested" message; state stays DELIVERED.
  const { wa: wa3, sent: sent3 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa3);
  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'DELIVERED',
    `state stays DELIVERED on duplicate request (got ${session?.state})`,
  );
  assert(
    sent3.some((m) =>
      m.type === 'text' &&
      // English uses "for this order is under review"; hi/hinglish surface
      // the "already submitted" phrasing explicitly. Match either.
      /A refund request for this order|pehle se|पहले से/i.test(m.body),
    ),
    'msgRefundAlreadyRequested sent',
  );
  // Critical: simulate user trying to send a NEW reason as text — should not
  // overwrite the original (state is DELIVERED, not REFUND_REQUEST, so the
  // refund handler isn't reached).
  const { wa: wa4 } = makeMockWa();
  await handleIncomingMessage(PHONE, makeTextMessage('Second reason: actually I want my money back NOW.'), wa4);
  order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(
    order?.refundReason === originalReason,
    `original reason preserved (got "${order?.refundReason?.slice(0, 40)}...")`,
  );
}

// ---------------------------------------------------------------------------
// Magic-link decision endpoint
// ---------------------------------------------------------------------------

async function buildAdminApp() {
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

async function pathMagicLinkApprove(): Promise<void> {
  console.log('\n== Path ML: magic-link approve URL → refundStatus=approved + page ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST006' });
  // Set refundStatus=pending manually (skip the user-handler path for this test).
  await prisma.order.update({
    where: { id: orderId },
    data: { refundStatus: 'pending', refundReason: 'wrong colours', refundRequestedAt: new Date() },
  });

  const token = await signRefundDecisionToken(orderId, 'approve');

  // The handleApprove path will try to call Razorpay refund API since the
  // seeded order has razorpayPaymentId='pay_smoke15_dummy'. That call will
  // fail with a network/key error in smoke — which is the documented
  // razorpay_error branch (decision still locked, error stored on the row).
  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: `/admin/refunds/decide?token=${encodeURIComponent(token)}` });
    // Either 200 (approved + Razorpay sandbox succeeded) or 502 (razorpay error
    // with state still locked). Both are valid for smoke; the contract is that
    // refundStatus moves off 'pending'.
    assert([200, 502].includes(res.statusCode), `status 200 or 502 (got ${res.statusCode})`);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert(order?.refundStatus === 'approved', `refundStatus -> approved (got ${order?.refundStatus})`);
    assert(order?.refundDecidedAt instanceof Date, 'refundDecidedAt set');
    // Razorpay almost certainly errored on the dummy id → razorpayRefundError populated.
    assert(
      order?.razorpayRefundId !== null || typeof order?.razorpayRefundError === 'string',
      'either refundId or refundError populated',
    );
    const body = res.body;
    assert(
      /Refund approved|Razorpay refund failed/i.test(body),
      'page renders approved or razorpay_error',
    );
  } finally {
    await app.close();
  }
}

async function pathMagicLinkDeny(): Promise<void> {
  console.log('\n== Path MD: magic-link deny URL → refundStatus=denied + page ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST007' });
  await prisma.order.update({
    where: { id: orderId },
    data: { refundStatus: 'pending', refundReason: 'wrong colours', refundRequestedAt: new Date() },
  });

  const token = await signRefundDecisionToken(orderId, 'deny');

  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: `/admin/refunds/decide?token=${encodeURIComponent(token)}` });
    // 200 (denied + WA delivered) or 207 (denied but WA failed under smoke creds)
    assert([200, 207].includes(res.statusCode), `status 200 or 207 (got ${res.statusCode})`);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert(order?.refundStatus === 'denied', `refundStatus -> denied (got ${order?.refundStatus})`);
    assert(order?.refundDecidedAt instanceof Date, 'refundDecidedAt set');
    assert(
      /Refund denied|user notification failed/i.test(res.body),
      'page renders denied or whatsapp_error',
    );
  } finally {
    await app.close();
  }
}

async function pathMagicLinkReplay(): Promise<void> {
  console.log('\n== Path MI: replaying an already-decided link → already_decided ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST008' });
  await prisma.order.update({
    where: { id: orderId },
    data: {
      refundStatus: 'approved',
      refundDecidedAt: new Date(),
      refundDecisionNote: 'Approved via magic link',
    },
  });
  const token = await signRefundDecisionToken(orderId, 'approve');

  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: `/admin/refunds/decide?token=${encodeURIComponent(token)}` });
    assert(res.statusCode === 200, `200 on replay (got ${res.statusCode})`);
    assert(/already decided/i.test(res.body), 'already_decided page rendered');
    // Important: the previous decision is unchanged.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert(order?.refundStatus === 'approved', 'previous decision unchanged');
  } finally {
    await app.close();
  }
}

async function pathInvalidToken(): Promise<void> {
  console.log('\n== Path MT: garbage token → token_invalid ==');
  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/admin/refunds/decide?token=not-a-jwt' });
    assert(res.statusCode === 401, `401 on invalid token (got ${res.statusCode})`);
    assert(/Invalid link/i.test(res.body), 'token_invalid page rendered');
  } finally {
    await app.close();
  }
}

async function pathExpiredToken(): Promise<void> {
  console.log('\n== Path MX: expired token → token_expired ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder({ amountPaise: 4900, shortId: 'TST009' });
  // Sign with negative TTL — token is "expired" at creation.
  const token = await signRefundDecisionToken(orderId, 'approve', -1);

  const app = await buildAdminApp();
  try {
    const res = await app.inject({ method: 'GET', url: `/admin/refunds/decide?token=${encodeURIComponent(token)}` });
    assert(res.statusCode === 401, `401 on expired token (got ${res.statusCode})`);
    assert(/Link expired/i.test(res.body), 'token_expired page rendered');
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  console.log(`Phase 15 smoke — refund flow (15a-c) — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathPaidAsksReason();
    await pathFreeOrderShortCircuit();
    await pathTextReasonCaptured();
    await pathWhitespaceReprompts();
    await pathEscapeResetsToIdle();
    await pathAlreadyRequestedGuard();
    await pathMagicLinkApprove();
    await pathMagicLinkDeny();
    await pathMagicLinkReplay();
    await pathInvalidToken();
    await pathExpiredToken();
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
