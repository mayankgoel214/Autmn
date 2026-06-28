#!/usr/bin/env tsx
/**
 * Phase 16 smoke — end-to-end integration of the Phase 8–15 surface.
 *
 * The onboarding path is covered by smoke-phase-1..7; the order-creation
 * path by smoke-phase-12; the AI pipeline by package-level tests. This
 * test focuses on the post-delivery user surface which Phase 14 + 15
 * rebuilt — it threads a single fresh user through the whole rating →
 * refund flow exactly as the WhatsApp client would deliver it, asserting
 * the state + DB outcome at each transition.
 *
 * Path E2E (10 steps):
 *   1. Seed a fresh user + a completed Order in DELIVERED state.
 *   2. sendProcessedImages emits 3 images + the 2-section delivery list.
 *   3. User taps rate_4 → Order.rating=4 + ratedAt set, state stays
 *      DELIVERED (the menu remains tappable for the next-action rows).
 *   4. User taps send_new_product → AWAITING_PHOTO + currentOrderId
 *      cleared (Phase 14 next-step path).
 *   5. Seed back to DELIVERED for the refund branch.
 *   6. User taps request_refund → REFUND_REQUEST + msgAskRefundReason.
 *   7. User sends a text reason → Order.refundReason persisted,
 *      refundStatus='pending', refundRequestedAt set, state back to
 *      DELIVERED, msgRefundReasonReceived ack.
 *   8. Magic-link GET /admin/refunds/decide?token=<deny> → refundStatus='denied'
 *      + decision note + WA notification path runs.
 *   9. Clicking the same magic link again → already_decided page, no state change.
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
const { handleIncomingMessage, sendProcessedImages } =
  await import('../packages/session/dist/index.js');
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919966${String(Date.now()).slice(-7)}`;

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
    sendPaymentLink: async (_p: string, body: string) => sent.push({ type: 'paymentLink', body }),
    markAsRead: async (_id: string) => {},
  };
  return { wa: wa as Parameters<typeof handleIncomingMessage>[2], sent };
}

let counter = 0;
function makeText(text: string): MessageContext {
  return {
    messageId: `e2e-${PHONE}-${counter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeList(listReplyId: string): MessageContext {
  return {
    messageId: `e2e-${PHONE}-${counter++}`,
    messageType: 'interactive',
    listReplyId,
    timestamp: Date.now(),
  };
}

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  } else console.log(`  ✓ ${msg}`);
}

async function cleanup(): Promise<void> {
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage
    .deleteMany({
      where: { messageId: { startsWith: `e2e-${PHONE}-` } },
    })
    .catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

async function seedDeliveredOrder(opts: { styles: string[] }): Promise<{ orderId: string }> {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: {
      brandName: 'E2E Brand',
      name: 'E2E Tester',
      businessType: 'cat_jewellery',
      language: 'en',
      orderCount: 1,
    },
    create: {
      phoneNumber: PHONE,
      brandName: 'E2E Brand',
      name: 'E2E Tester',
      businessType: 'cat_jewellery',
      language: 'en',
      orderCount: 1,
    },
  });
  const order = await prisma.order.create({
    data: {
      phoneNumber: PHONE,
      imageCount: 1,
      style: opts.styles[0]!,
      stylesOrdered: opts.styles,
      outputStyleCount: opts.styles.length,
      numStylesPicked: opts.styles.length,
      inputImageUrls: ['https://example.com/in1.jpg'],
      outputImageUrls: opts.styles.map((_, i) => `https://example.com/out${i + 1}.jpg`),
      cutoutUrls: [],
      status: 'completed',
      amount: 4900 * opts.styles.length,
      amountPaise: 4900 * opts.styles.length,
      isFirstFree: false,
      razorpayPaymentId: 'pay_e2e_test',
      productCategory: 'cat_jewellery',
      userId: user.id,
    },
  });
  await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: {
      state: 'DELIVERED',
      currentOrderId: order.id,
      styleSelections: opts.styles,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
    create: {
      phoneNumber: PHONE,
      state: 'DELIVERED',
      currentOrderId: order.id,
      styleSelections: opts.styles,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
  });
  return { orderId: order.id };
}

async function buildAdminApp() {
  const fastifyPath = resolve(import.meta.dirname, '../apps/api/node_modules/fastify/fastify.js');
  const Fastify = (await import(`file://${fastifyPath.replace(/\\/g, '/')}`)).default;
  const { adminRoutes } = await import('../apps/api/dist/routes/admin.js');
  const app = Fastify({ logger: false });
  await app.register(adminRoutes);
  return app;
}

async function runHappyPath(): Promise<void> {
  console.log('\n== E2E: Phase 8-15 integrated rating + refund surface ==');

  // ---- Step 1+2: seed + delivery list ----
  const { orderId } = await seedDeliveredOrder({
    styles: ['style_clean_white', 'style_anything_you_want', 'style_studio'],
  });

  const mock1 = makeMockWa();
  await sendProcessedImages(
    PHONE,
    [
      'https://example.com/out1.jpg',
      'https://example.com/out2.jpg',
      'https://example.com/out3.jpg',
    ],
    'en',
    'E2E Brand',
    mock1.wa,
    [],
    [],
    ['style_clean_white', 'style_anything_you_want', 'style_studio'],
  );
  assert(
    mock1.sent.filter((m) => m.type === 'image').length === 3,
    'Step 2: 3 images sent on delivery',
  );
  assert(
    mock1.sent.some((m) => m.type === 'list'),
    'Step 2: delivery list (rate + next-step) sent',
  );

  // ---- Step 3: rate_4 ----
  const mock2 = makeMockWa();
  await handleIncomingMessage(PHONE, makeList('rate_4'), mock2.wa);
  let order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.rating === 4, `Step 3: rating=4 (got ${order?.rating})`);
  assert(order?.ratedAt instanceof Date, 'Step 3: ratedAt set');
  let session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'DELIVERED', `Step 3: state stays DELIVERED (got ${session?.state})`);
  assert(
    mock2.sent.some((m) => m.type === 'text' && /⭐⭐⭐⭐/.test(m.body)),
    'Step 3: 4-star thanks message',
  );

  // ---- Step 4: send_new_product → AWAITING_PHOTO ----
  const mock3 = makeMockWa();
  await handleIncomingMessage(PHONE, makeList('send_new_product'), mock3.wa);
  session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'AWAITING_PHOTO',
    `Step 4: state AWAITING_PHOTO (got ${session?.state})`,
  );
  assert(session?.currentOrderId === null, 'Step 4: currentOrderId cleared on send-new');

  // ---- Step 5: reseed for the refund branch ----
  await cleanup();
  const { orderId: orderId2 } = await seedDeliveredOrder({
    styles: ['style_clean_white', 'style_anything_you_want'],
  });

  // ---- Step 6: request_refund → REFUND_REQUEST + msgAskRefundReason ----
  const mock4 = makeMockWa();
  await handleIncomingMessage(PHONE, makeList('request_refund'), mock4.wa);
  session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'REFUND_REQUEST',
    `Step 6: state REFUND_REQUEST (got ${session?.state})`,
  );
  assert(
    mock4.sent.some(
      (m) => m.type === 'text' && /went wrong|kya galat hua|क्या गलत हुआ/i.test(m.body),
    ),
    'Step 6: msgAskRefundReason prompt sent',
  );

  // ---- Step 7: send text reason ----
  const mock5 = makeMockWa();
  const reason = 'The "anything you want" output lost too much of our brand colour palette.';
  await handleIncomingMessage(PHONE, makeText(reason), mock5.wa);
  order = await prisma.order.findUnique({ where: { id: orderId2 } });
  assert(order?.refundReason === reason, 'Step 7: refundReason persisted');
  assert(
    order?.refundStatus === 'pending',
    `Step 7: refundStatus=pending (got ${order?.refundStatus})`,
  );
  assert(order?.refundRequestedAt instanceof Date, 'Step 7: refundRequestedAt set');
  session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(session?.state === 'DELIVERED', `Step 7: state back to DELIVERED (got ${session?.state})`);
  assert(
    mock5.sent.some((m) => m.type === 'text' && /Got it|Mil gaya|मिल गया/i.test(m.body)),
    'Step 7: msgRefundReasonReceived ack sent',
  );

  // ---- Step 8: magic-link deny → refundStatus=denied ----
  const { signRefundDecisionToken } = await import('../packages/session/dist/refund-token.js');
  process.env['REFUND_DECISION_SECRET'] = 'phase16-e2e-test-secret-must-be-32-chars!!';
  process.env['APP_URL'] = 'http://localhost:3001';

  const app = await buildAdminApp();
  try {
    const denyToken = await signRefundDecisionToken(orderId2, 'deny');
    // POST applies the decision. GET is the prefetch-safe confirm page only
    // (email scanners issue GET), so the side effect lives in POST.
    const denyRes = await app.inject({
      method: 'POST',
      url: `/admin/refunds/decide?token=${encodeURIComponent(denyToken)}`,
    });
    // 200 or 207 (denied page or whatsapp_error page if WA send fails under
    // smoke creds). Either way the order should be denied.
    assert(
      [200, 207].includes(denyRes.statusCode),
      `Step 8: 200 or 207 (got ${denyRes.statusCode})`,
    );
    order = await prisma.order.findUnique({ where: { id: orderId2 } });
    assert(
      order?.refundStatus === 'denied',
      `Step 8: refundStatus=denied (got ${order?.refundStatus})`,
    );
    assert(order?.refundDecidedAt instanceof Date, 'Step 8: refundDecidedAt set');

    // ---- Step 9: same link clicked again → already_decided idempotency ----
    const dup = await app.inject({
      method: 'GET',
      url: `/admin/refunds/decide?token=${encodeURIComponent(denyToken)}`,
    });
    assert(dup.statusCode === 200, `Step 9: replay returns 200 (got ${dup.statusCode})`);
    assert(/already decided/i.test(dup.body), 'Step 9: already_decided page rendered');
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  console.log(`Phase 16 E2E smoke — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await runHappyPath();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — Phase 16 E2E green.');
    process.exit(0);
  } else {
    console.error(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('E2E smoke crashed:', err);
  process.exit(1);
});
