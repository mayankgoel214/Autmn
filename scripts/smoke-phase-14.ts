#!/usr/bin/env tsx
/**
 * Phase 14 smoke — delivery menu redesign.
 *
 * Paths:
 *   BH. List-reply rate_5 -> Order.rating=5 + ratedAt set + thanks text sent;
 *       state stays DELIVERED so the same menu's action rows remain tappable.
 *   BI. List-reply send_new_product -> state AWAITING_PHOTO + send-photo text.
 *   BJ. List-reply request_refund -> state REFUND_REQUEST + Phase 15 placeholder.
 *   BK. sendProcessedImages emits the new 2-section list (5 rate rows + 2
 *       next-step rows). NO numbered text fallback.
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
const { handleIncomingMessage, sendProcessedImages } = await import(
  '../packages/session/dist/index.js'
);
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919988${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
  rows?: Array<{ id: string; title: string }>;
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
}

function makeMockWa() {
  const sent: SentMessage[] = [];
  const wa = {
    sendText: async (_p: string, body: string) => sent.push({ type: 'text', body }),
    sendButtons: async (_p: string, body: string) => sent.push({ type: 'buttons', body }),
    sendList: async (
      _p: string,
      body: string,
      _footer: string,
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    ) => sent.push({
      type: 'list',
      body,
      rows: sections.flatMap((s) => s.rows),
      sections,
    }),
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
    messageId: `smoke14-${PHONE}-${msgCounter++}`,
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
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function cleanup(): Promise<void> {
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke14-${PHONE}-` } },
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
      stylesOrdered: ['style_clean_white', 'style_studio', 'style_lifestyle'],
      outputStyleCount: 3,
      numStylesPicked: 3,
      inputImageUrls: ['https://example.com/photo.jpg'],
      outputImageUrls: [
        'https://example.com/out1.jpg',
        'https://example.com/out2.jpg',
        'https://example.com/out3.jpg',
      ],
      status: 'completed',
      // Phase 15b' added a free-order short-circuit on Request refund. The
      // delivery menu tests below assume a paid order so the request_refund
      // path actually transitions to REFUND_REQUEST. Seed a real amount.
      amount: 14700,
      amountPaise: 14700,
      isFirstFree: false,
      razorpayPaymentId: 'pay_smoke14_dummy',
      productCategory: 'cat_jewellery',
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
// Path BH — rate_5 saves rating, thanks text sent, state stays DELIVERED
// ---------------------------------------------------------------------------

async function pathRatingFive(): Promise<void> {
  console.log('\n== Path BH: rate_5 -> rating=5 + ratedAt + state stays DELIVERED ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('rate_5'), wa);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  assert(order?.rating === 5, `Order.rating=5 (got ${order?.rating})`);
  assert(order?.ratedAt instanceof Date, 'Order.ratedAt set');

  assert(
    sent.some((m) => m.type === 'text' && /Thanks!|Shukriya|धन्यवाद/.test(m.body)),
    'rating-thanks text sent',
  );
  assert(
    sent.some((m) => m.type === 'text' && /⭐⭐⭐⭐⭐/.test(m.body)),
    'thanks text shows 5 stars',
  );

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'DELIVERED',
    `state stays DELIVERED after rating (got ${session?.state})`,
  );
}

// ---------------------------------------------------------------------------
// Path BI — send_new_product -> AWAITING_PHOTO + send-photo prompt
// ---------------------------------------------------------------------------

async function pathSendNewProduct(): Promise<void> {
  console.log('\n== Path BI: send_new_product -> AWAITING_PHOTO + photo prompt ==');
  await cleanup();
  await seedDeliveredOrder();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('send_new_product'), wa);

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'AWAITING_PHOTO',
    `state AWAITING_PHOTO (got ${session?.state})`,
  );
  assert(session?.currentOrderId === null, 'currentOrderId cleared');
  assert(
    sent.some((m) => m.type === 'text' && m.body.length > 0),
    'send-photo prompt text sent',
  );
}

// ---------------------------------------------------------------------------
// Path BJ — request_refund -> REFUND_REQUEST + Phase 15 placeholder
// ---------------------------------------------------------------------------

async function pathRequestRefund(): Promise<void> {
  console.log('\n== Path BJ: request_refund -> REFUND_REQUEST + reason prompt ==');
  await cleanup();
  await seedDeliveredOrder();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeListMessage('request_refund'), wa);

  const session = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(
    session?.state === 'REFUND_REQUEST',
    `state REFUND_REQUEST (got ${session?.state})`,
  );
  // Phase 15 replaced the Phase 14 placeholder with the real reason prompt.
  // We only verify the menu→state transition + that *some* prompt fired here;
  // the prompt's full surface is covered by smoke-phase-15.ts.
  assert(
    sent.some((m) => m.type === 'text' && m.body.length > 0),
    'refund prompt text sent',
  );
}

// ---------------------------------------------------------------------------
// Path BK — sendProcessedImages emits the new 2-section list, not numbered text
// ---------------------------------------------------------------------------

async function pathDeliveryMenuShape(): Promise<void> {
  console.log('\n== Path BK: sendProcessedImages emits the new 2-section list ==');
  await cleanup();
  await seedDeliveredOrder();
  const { wa, sent } = makeMockWa();

  await sendProcessedImages(
    PHONE,
    [
      'https://example.com/out1.jpg',
      'https://example.com/out2.jpg',
      'https://example.com/out3.jpg',
    ],
    'en',
    'Tester',
    wa,
    [],
    [],
    ['style_clean_white', 'style_studio', 'style_lifestyle'],
  );

  const list = sent.find((m) => m.type === 'list');
  assert(!!list, 'delivery menu list sent');
  const sections = (list as any)?.sections as Array<{ title: string; rows: any[] }> | undefined;
  assert(sections?.length === 2, `list has 2 sections (got ${sections?.length})`);
  const rateRows = sections?.[0]?.rows ?? [];
  assert(rateRows.length === 5, `Rate section has 5 rows (got ${rateRows.length})`);
  const nextRows = sections?.[1]?.rows ?? [];
  assert(nextRows.length === 2, `Next section has 2 rows (got ${nextRows.length})`);
  const rateIds = rateRows.map((r) => r.id).sort();
  assert(
    JSON.stringify(rateIds) === JSON.stringify(['rate_1', 'rate_2', 'rate_3', 'rate_4', 'rate_5']),
    `rate row ids = rate_1..rate_5 (got ${JSON.stringify(rateIds)})`,
  );
  const nextIds = nextRows.map((r) => r.id).sort();
  assert(
    JSON.stringify(nextIds) === JSON.stringify(['request_refund', 'send_new_product']),
    `next row ids = request_refund + send_new_product (got ${JSON.stringify(nextIds)})`,
  );

  // No legacy numbered text fallback should be sent.
  assert(
    !sent.some((m) => m.type === 'text' && /1 — Order another product/.test(m.body)),
    'legacy numbered menu text NOT sent',
  );
}

async function main(): Promise<void> {
  console.log(`Phase 14 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathRatingFive();
    await pathSendNewProduct();
    await pathRequestRefund();
    await pathDeliveryMenuShape();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 14 smoke assertions green.');
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
