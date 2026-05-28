#!/usr/bin/env tsx
/**
 * Phase 12 smoke — ₹49 × N dynamic pricing + isFirstFree flag.
 *
 * Matrix: (free first order vs paid second order) × (1 vs 2 vs 3 picks).
 *
 *   AX. First order, 1 pick   → amount=0,   amountPaise=0,   numStylesPicked=1, isFirstFree=true
 *   AY. First order, 0 picks  → Smart Pack auto-fills 3, but isFirstFree -> amount=0
 *   AZ. Second order, 1 pick  → amount=4900,  amountPaise=4900,  numStylesPicked=1, isFirstFree=false
 *   BA. Second order, 2 picks → amount=9800,  amountPaise=9800,  numStylesPicked=2, isFirstFree=false
 *   BB. Second order, 3 picks → amount=14700, amountPaise=14700, numStylesPicked=3, isFirstFree=false
 *   BC. Second order, 0 picks → Smart Pack 3 → amount=14700
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
process.env.PAYMENT_BYPASS = 'true';

const { PrismaClient } = await import('../packages/db/src/generated/client/index.js');
const { createOrderAndSendPayment } = await import(
  '../packages/session/dist/handlers/instructions.js'
);
const { getImageQueue } = await import('../packages/queue/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919990${String(Date.now()).slice(-7)}`;
const PRICE_PER_OUTPUT_AD_PAISE = 4900; // mirror — should match types.ts

function makeMockWa() {
  const wa = {
    sendText: async () => {},
    sendButtons: async () => {},
    sendList: async () => {},
    sendImage: async () => {},
    sendPaymentLink: async () => {},
    markAsRead: async () => {},
  };
  return wa as any;
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
  try {
    const q = getImageQueue();
    const jobs = await q.getJobs(['waiting', 'active', 'delayed']);
    for (const j of jobs) {
      if (j.data?.phoneNumber === PHONE) await j.remove().catch(() => {});
    }
    await q.close().catch(() => {});
  } catch {
    // queue cleanup is best-effort
  }
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

async function seedUserAndSession(orderCount: number) {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: { orderCount, brandName: 'Tester', name: 'Tester', businessType: 'cat_jewellery', language: 'en' },
    create: { phoneNumber: PHONE, orderCount, brandName: 'Tester', name: 'Tester', businessType: 'cat_jewellery', language: 'en' },
  });
  const session = await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: { state: 'AWAITING_PHOTO', userId: user.id, stateEnteredAt: new Date() },
    create: { phoneNumber: PHONE, state: 'AWAITING_PHOTO', userId: user.id, stateEnteredAt: new Date() },
  });
  return { user, session };
}

async function runOnce(opts: {
  orderCount: number;
  styleSelections: string[];
}): Promise<any> {
  await cleanup();
  const { user, session } = await seedUserAndSession(opts.orderCount);
  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa: makeMockWa(),
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: opts.styleSelections,
    voiceInstructions: null,
  });
  const orders = await prisma.order.findMany({ where: { phoneNumber: PHONE } });
  return orders[0];
}

async function main(): Promise<void> {
  console.log(`Phase 12 smoke test — fake phone ${PHONE}\n`);
  try {
    // AX — first order, 1 pick → free
    console.log('\n== Path AX: first order, 1 pick → free + numStylesPicked=1 ==');
    let order = await runOnce({ orderCount: 0, styleSelections: ['style_clean_white'] });
    assert(order?.amount === 0, `amount=0 (got ${order?.amount})`);
    assert(order?.amountPaise === 0, `amountPaise=0 (got ${order?.amountPaise})`);
    assert(order?.numStylesPicked === 1, `numStylesPicked=1 (got ${order?.numStylesPicked})`);
    assert(order?.isFirstFree === true, `isFirstFree=true (got ${order?.isFirstFree})`);

    // AY — first order, 0 picks → Smart Pack 3 → still free
    console.log('\n== Path AY: first order, 0 picks → Smart Pack 3 but free ==');
    order = await runOnce({ orderCount: 0, styleSelections: [] });
    assert(order?.amount === 0, `first-free + 0 picks still amount=0 (got ${order?.amount})`);
    assert(order?.amountPaise === 0, `amountPaise=0 (got ${order?.amountPaise})`);
    assert(order?.numStylesPicked === 3, `numStylesPicked=3 from Smart Pack (got ${order?.numStylesPicked})`);
    assert(order?.isFirstFree === true, `isFirstFree=true (got ${order?.isFirstFree})`);

    // AZ — second order, 1 pick → ₹49
    console.log('\n== Path AZ: paid order, 1 pick → ₹49 ==');
    order = await runOnce({ orderCount: 1, styleSelections: ['style_clean_white'] });
    assert(order?.amount === PRICE_PER_OUTPUT_AD_PAISE, `amount=4900 (got ${order?.amount})`);
    assert(order?.amountPaise === PRICE_PER_OUTPUT_AD_PAISE, `amountPaise=4900 (got ${order?.amountPaise})`);
    assert(order?.numStylesPicked === 1, `numStylesPicked=1 (got ${order?.numStylesPicked})`);
    assert(order?.isFirstFree === false, `isFirstFree=false (got ${order?.isFirstFree})`);

    // BA — second order, 2 picks → ₹98
    console.log('\n== Path BA: paid order, 2 picks → ₹98 ==');
    order = await runOnce({ orderCount: 1, styleSelections: ['style_clean_white', 'style_studio'] });
    assert(order?.amount === PRICE_PER_OUTPUT_AD_PAISE * 2, `amount=9800 (got ${order?.amount})`);
    assert(order?.amountPaise === PRICE_PER_OUTPUT_AD_PAISE * 2, `amountPaise=9800 (got ${order?.amountPaise})`);
    assert(order?.numStylesPicked === 2, `numStylesPicked=2 (got ${order?.numStylesPicked})`);

    // BB — second order, 3 picks → ₹147
    console.log('\n== Path BB: paid order, 3 picks → ₹147 ==');
    order = await runOnce({
      orderCount: 1,
      styleSelections: ['style_clean_white', 'style_studio', 'style_lifestyle'],
    });
    assert(order?.amount === PRICE_PER_OUTPUT_AD_PAISE * 3, `amount=14700 (got ${order?.amount})`);
    assert(order?.amountPaise === PRICE_PER_OUTPUT_AD_PAISE * 3, `amountPaise=14700 (got ${order?.amountPaise})`);
    assert(order?.numStylesPicked === 3, `numStylesPicked=3 (got ${order?.numStylesPicked})`);

    // BC — second order, 0 picks → Smart Pack 3 → ₹147
    console.log('\n== Path BC: paid order, 0 picks (Smart Pack) → ₹147 ==');
    order = await runOnce({ orderCount: 1, styleSelections: [] });
    assert(order?.amount === PRICE_PER_OUTPUT_AD_PAISE * 3, `Smart Pack amount=14700 (got ${order?.amount})`);
    assert(order?.numStylesPicked === 3, `Smart Pack numStylesPicked=3 (got ${order?.numStylesPicked})`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 12 smoke assertions green.');
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
