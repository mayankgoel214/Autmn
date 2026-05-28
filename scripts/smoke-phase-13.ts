#!/usr/bin/env tsx
/**
 * Phase 13 smoke — single processing-estimate message + intermediates removed.
 *
 *   BD. msgProcessingEstimate heuristic (3 styles + 1 photo) -> "5-6 minutes"
 *   BE. msgProcessingEstimate Hinglish format
 *   BF. Free first order via createOrderAndSendPayment sends the new
 *       processing-estimate text, NOT the old "Got photo, creating..." copy.
 *   BG. The worker's image-processing.ts no longer references
 *       msgGotPhotoCreating or msgProgressAlmostDone (static check on dist).
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
const { msgProcessingEstimate } = await import(
  '../packages/session/dist/messages.js'
);
const { getImageQueue } = await import('../packages/queue/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919989${String(Date.now()).slice(-7)}`;

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

async function cleanup(): Promise<void> {
  try {
    const q = getImageQueue();
    const jobs = await q.getJobs(['waiting', 'active', 'delayed']);
    for (const j of jobs) {
      if (j.data?.phoneNumber === PHONE) await j.remove().catch(() => {});
    }
    await q.close().catch(() => {});
  } catch { /* best-effort */ }
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

// ---------------------------------------------------------------------------
// Path BD — msgProcessingEstimate heuristic for 3 styles + 1 photo
// ---------------------------------------------------------------------------

async function pathHeuristic3x1(): Promise<void> {
  console.log('\n== Path BD: msgProcessingEstimate(3 styles, 1 photo) -> 5-6 minutes ==');
  // calculated_seconds = 60 + 3*40 + 1*10 = 190 -> ceil(190/60)=4, X=4+1=5, Y=6
  const text = msgProcessingEstimate(3, 1, 'en');
  assert(/Approximately 5-6 minutes/.test(text), `English format includes "5-6 minutes" (got "${text}")`);
  assert(/🎨/.test(text), `English text includes 🎨`);
}

// ---------------------------------------------------------------------------
// Path BE — Hinglish format
// ---------------------------------------------------------------------------

async function pathHinglishFormat(): Promise<void> {
  console.log('\n== Path BE: Hinglish format ==');
  // 1 style + 1 photo: 60 + 40 + 10 = 110 -> ceil(110/60)=2, X=3, Y=4
  const text = msgProcessingEstimate(1, 1, 'hinglish');
  assert(
    /Aapke ads taiyaar ho rahe hain.* 3-4 minutes/.test(text),
    `Hinglish format correct (got "${text}")`,
  );
}

// ---------------------------------------------------------------------------
// Path BF — free order sends the new processing-estimate, not the old copy
// ---------------------------------------------------------------------------

async function pathFreeOrderSendsEstimate(): Promise<void> {
  console.log('\n== Path BF: free order -> new processing-estimate text, not the legacy copy ==');
  await cleanup();
  const { user, session } = await seedUserAndSession(0);
  const { wa, sent } = makeMockWa();

  await createOrderAndSendPayment({
    session,
    user,
    lang: 'en',
    wa,
    imageStorageUrls: ['https://example.com/photo.jpg'],
    imageMediaIds: ['fake-media'],
    imageCount: 1,
    styleSelections: ['style_clean_white', 'style_studio', 'style_lifestyle'],
    voiceInstructions: null,
  });

  assert(
    sent.some((m) => m.type === 'text' && /Approximately \d+-\d+ minutes/.test(m.body)),
    'new processing-estimate text sent',
  );
  // Legacy "Got photo, creating..." (msgGotPhotoCreating) and "Got photos"
  // text should NOT appear.
  assert(
    !sent.some((m) => m.type === 'text' && /Got photos?, creating/i.test(m.body)),
    'legacy msgGotPhotoCreating text NOT sent',
  );
}

// ---------------------------------------------------------------------------
// Path BG — static check: worker dist no longer references the dropped exports
// ---------------------------------------------------------------------------

async function pathWorkerNoIntermediates(): Promise<void> {
  console.log('\n== Path BG: worker dist no longer references msgGotPhotoCreating / msgProgressAlmostDone ==');
  const distPath = resolve(import.meta.dirname, '../apps/worker/dist/processors/image-processing.js');
  const src = readFileSync(distPath, 'utf-8');
  assert(!/msgGotPhotoCreating/.test(src), 'msgGotPhotoCreating absent from worker dist');
  assert(!/msgProgressAlmostDone/.test(src), 'msgProgressAlmostDone absent from worker dist');
  assert(!/stage2Timer/.test(src), 'stage2Timer absent from worker dist');
  // msgProgressReadyToSend stays — it's the CDN-load buffer before delivery.
  assert(/msgProgressReadyToSend/.test(src), 'msgProgressReadyToSend kept (CDN-load buffer)');
}

async function main(): Promise<void> {
  console.log(`Phase 13 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathHeuristic3x1();
    await pathHinglishFormat();
    await pathFreeOrderSendsEstimate();
    await pathWorkerNoIntermediates();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 13 smoke assertions green.');
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
