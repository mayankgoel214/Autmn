#!/usr/bin/env tsx
/**
 * Pre-Phase-8 smoke — verifies the freemium fix and the 0-styles pricing pin.
 *
 * Paths:
 *   AO. createOrderAndSendPayment with orderCount=0 -> amount=0, orderCount->1
 *       (free path triggered, increment lands AFTER order.create).
 *   AP. Same user (now orderCount=1) -> amount=PRICE_PER_ORDER_PAISE,
 *       orderCount->2 (paid path; PAYMENT_BYPASS auto-confirms so no Razorpay).
 *   AQ. createOrderAndSendPayment with styleSelections=[] -> Smart Pack auto-
 *       select gives 3 styles, normalizedStyles.length=3 (the 0-pick rule).
 *   AR. The order-creation assertion fires when normalizedStyles.length would
 *       be outside [1, 3] (impossible via the public API but the guard is
 *       worth tripping with a forced slice).
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
// Skip Razorpay for paid-order paths inside createOrderAndSendPayment.
process.env.PAYMENT_BYPASS = 'true';

const { PrismaClient } = await import('../packages/db/src/generated/client/index.js');
// instructions.ts isn't re-exported through session/index.ts — import directly.
const { createOrderAndSendPayment } = await import(
  '../packages/session/dist/handlers/instructions.js'
);
const { getImageQueue } = await import('../packages/queue/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919992${String(Date.now()).slice(-7)}`;

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
  return { wa: wa as any, sent };
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

async function getUser() {
  return prisma.user.findUnique({ where: { phoneNumber: PHONE } });
}
async function getSession() {
  return prisma.session.findUnique({ where: { phoneNumber: PHONE } });
}

async function cleanupQueueJobs(): Promise<void> {
  try {
    const queue = getImageQueue();
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);
    for (const j of jobs) {
      if (j.data?.phoneNumber === PHONE) await j.remove().catch(() => {});
    }
    await queue.close().catch(() => {});
  } catch {
    // Queue cleanup failure is non-fatal for the smoke
  }
}

async function cleanup(): Promise<void> {
  await cleanupQueueJobs();
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

/**
 * Construct the minimum user + session rows createOrderAndSendPayment requires
 * before invocation. Bypasses the full state machine for focused testing.
 */
async function seedUserAndSession(opts: { orderCount: number }): Promise<{
  user: any;
  session: any;
}> {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: {
      orderCount: opts.orderCount,
      brandName: 'Tester',
      name: 'Tester',
      businessType: 'cat_jewellery',
      language: 'en',
    },
    create: {
      phoneNumber: PHONE,
      orderCount: opts.orderCount,
      brandName: 'Tester',
      name: 'Tester',
      businessType: 'cat_jewellery',
      language: 'en',
    },
  });
  const session = await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: {
      state: 'AWAITING_PHOTO',
      userId: user.id,
      stateEnteredAt: new Date(),
    },
    create: {
      phoneNumber: PHONE,
      state: 'AWAITING_PHOTO',
      userId: user.id,
      stateEnteredAt: new Date(),
    },
  });
  return { user, session };
}

// ---------------------------------------------------------------------------
// Path AO — first order: orderCount 0 -> 1, amount = 0
// ---------------------------------------------------------------------------

async function pathFirstOrderFree(): Promise<void> {
  console.log('\n== Path AO: orderCount=0 -> free order, increment lands ==');
  await cleanup();
  const { user, session } = await seedUserAndSession({ orderCount: 0 });
  const { wa } = makeMockWa();

  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa,
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: ['style_clean_white'],
    voiceInstructions: null,
  });

  const orders = await prisma.order.findMany({ where: { phoneNumber: PHONE } });
  assert(orders.length === 1, `1 order created (got ${orders.length})`);
  assert(orders[0]?.amount === 0, `order.amount=0 (got ${orders[0]?.amount})`);

  const u = await getUser();
  assert(u?.orderCount === 1, `user.orderCount incremented to 1 (got ${u?.orderCount})`);
}

// ---------------------------------------------------------------------------
// Path AP — second order: orderCount 1 -> 2, amount = PRICE_PER_ORDER_PAISE
// ---------------------------------------------------------------------------

async function pathSecondOrderPaid(): Promise<void> {
  console.log('\n== Path AP: orderCount=1 -> paid order, increment lands ==');
  await cleanup();
  const { user, session } = await seedUserAndSession({ orderCount: 1 });
  const { wa } = makeMockWa();

  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa,
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: ['style_clean_white'],
    voiceInstructions: null,
  });

  const orders = await prisma.order.findMany({ where: { phoneNumber: PHONE } });
  assert(orders.length === 1, `1 order created (got ${orders.length})`);
  // PRICE_PER_ORDER_PAISE = 19900 (₹199). Phase 12 will replace this with the
  // ₹49 × N model. For now we just check it's the paid path, not 0.
  assert(
    typeof orders[0]?.amount === 'number' && orders[0]!.amount > 0,
    `order.amount > 0 on paid path (got ${orders[0]?.amount})`,
  );

  const u = await getUser();
  assert(u?.orderCount === 2, `user.orderCount incremented to 2 (got ${u?.orderCount})`);
}

// ---------------------------------------------------------------------------
// Path AQ — 0-styles → Smart Pack auto-select (3 styles)
// ---------------------------------------------------------------------------

async function pathZeroStylesSmartPack(): Promise<void> {
  console.log('\n== Path AQ: 0 styles picked -> Smart Pack (3 styles) ==');
  await cleanup();
  const { user, session } = await seedUserAndSession({ orderCount: 0 });
  const { wa } = makeMockWa();

  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa,
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: [], // <- zero picks
    voiceInstructions: null,
  });

  const orders = await prisma.order.findMany({ where: { phoneNumber: PHONE } });
  assert(orders.length === 1, `1 order created (got ${orders.length})`);
  const stylesOrdered = (orders[0]?.stylesOrdered ?? []) as string[];
  assert(stylesOrdered.length === 3, `stylesOrdered.length=3 (got ${stylesOrdered.length})`);
  assert(orders[0]?.outputStyleCount === 3, `outputStyleCount=3 (got ${orders[0]?.outputStyleCount})`);
}

// ---------------------------------------------------------------------------
// Path AR — over-limit styles get sliced to 3, length assertion holds.
//           (The hard error path is impossible to reach via the public API —
//           the slice clamps it. This is a soft check that slicing works.)
// ---------------------------------------------------------------------------

async function pathStyleClamp(): Promise<void> {
  console.log('\n== Path AR: 5 styles picked -> sliced to 3 ==');
  await cleanup();
  const { user, session } = await seedUserAndSession({ orderCount: 0 });
  const { wa } = makeMockWa();

  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa,
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: ['style_a', 'style_b', 'style_c', 'style_d', 'style_e'],
    voiceInstructions: null,
  });

  const orders = await prisma.order.findMany({ where: { phoneNumber: PHONE } });
  const stylesOrdered = (orders[0]?.stylesOrdered ?? []) as string[];
  assert(stylesOrdered.length === 3, `over-cap picks sliced to 3 (got ${stylesOrdered.length})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Pre-Phase-8 smoke — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathFirstOrderFree();
    await pathSecondOrderPaid();
    await pathZeroStylesSmartPack();
    await pathStyleClamp();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all pre-Phase-8 smoke assertions green.');
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
