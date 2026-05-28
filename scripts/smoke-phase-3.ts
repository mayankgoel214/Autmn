#!/usr/bin/env tsx
/**
 * Phase 3 smoke test — brand-details capture (text / URL / skip / done /
 * cost-rail). Image and document paths require real WhatsApp media downloads
 * and aren't covered here — Phase 3b's integration tests will hit those.
 *
 * Paths:
 *   K. text note → BrandAsset(type='text'), state stays in collecting.
 *   L. URL → BrandAsset(type='website'), URL extracted from text.
 *   M. "skip" → returns to CHANGE_SETTINGS_MENU.
 *   N. assets + "done" → BrandProfile.summary set, initial BrandSummaryVersion
 *      created (stub), returns to menu.
 *   O. "done" with no assets → treats as skip (no version row).
 *   P. cost rail — 11th asset rejected once 10 are present.
 *
 * Run: npx tsx scripts/smoke-phase-3.ts
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
const { handleIncomingMessage } = await import('../packages/session/dist/index.js');
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919997${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  rows?: Array<{ id: string; title: string; description?: string }>;
}

function makeMockWa() {
  const sent: SentMessage[] = [];
  const wa = {
    sendText: async (_p: string, body: string) => {
      sent.push({ type: 'text', body });
    },
    sendButtons: async (
      _p: string,
      body: string,
      buttons: Array<{ id: string; title: string }>,
    ) => {
      sent.push({ type: 'buttons', body, buttons });
    },
    sendList: async (
      _p: string,
      body: string,
      _footer: string,
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    ) => {
      sent.push({ type: 'list', body, rows: sections.flatMap((s) => s.rows) });
    },
    sendImage: async (_p: string, _url: string, caption?: string) => {
      sent.push({ type: 'image', body: caption ?? '' });
    },
    sendPaymentLink: async (_p: string, body: string) => {
      sent.push({ type: 'paymentLink', body });
    },
    markAsRead: async (_id: string) => {},
  };
  return { wa: wa as any, sent };
}

let msgCounter = 0;
function makeTextMessage(text: string): MessageContext {
  return {
    messageId: `smoke3-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke3-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke3-${PHONE}-${msgCounter++}`,
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

async function getSession() {
  return prisma.session.findUnique({ where: { phoneNumber: PHONE } });
}
async function getUser() {
  return prisma.user.findUnique({ where: { phoneNumber: PHONE } });
}

async function cleanup(): Promise<void> {
  // brand_summary_versions + brand_assets cascade off brand_profiles, which
  // cascades off users. Deleting the user is enough; we explicitly delete
  // sessions/orders/processed_messages first to satisfy non-cascading FKs.
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke3-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

/**
 * Onboard a user via the Phase 1 flow, force IDLE, then drive the Phase 2
 * menu → Change settings → Brand details so we land in BRAND_DETAILS_COLLECTING.
 */
async function navigateToBrandDetails(wa: any): Promise<void> {
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'IDLE', stateEnteredAt: new Date() },
  });
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
}

async function brandProfileFor(): Promise<{ id: string } | null> {
  const u = await getUser();
  if (!u) return null;
  return prisma.brandProfile.findUnique({ where: { userId: u.id } });
}

// ---------------------------------------------------------------------------
// Path K — text note
// ---------------------------------------------------------------------------

async function pathTextNote(): Promise<void> {
  console.log('\n== Path K: text note → BrandAsset(type=text) ==');
  await cleanup();
  const { wa } = makeMockWa();
  await navigateToBrandDetails(wa);

  let s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);

  await handleIncomingMessage(
    PHONE,
    makeTextMessage('We make handmade silver jewellery for weddings.'),
    wa,
  );

  const profile = await brandProfileFor();
  assert(!!profile, 'BrandProfile lazy-created');
  const assets = profile
    ? await prisma.brandAsset.findMany({ where: { brandProfileId: profile.id } })
    : [];
  assert(assets.length === 1, `1 BrandAsset row (got ${assets.length})`);
  assert(assets[0]?.type === 'text', `type=text (got ${assets[0]?.type})`);
  assert(
    assets[0]?.rawText?.includes('silver') === true,
    `rawText preserved (got ${assets[0]?.rawText?.slice(0, 40)})`,
  );

  s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', 'still in collecting state after text');
}

// ---------------------------------------------------------------------------
// Path L — URL detection
// ---------------------------------------------------------------------------

async function pathUrl(): Promise<void> {
  console.log('\n== Path L: URL → BrandAsset(type=website) ==');
  await cleanup();
  const { wa } = makeMockWa();
  await navigateToBrandDetails(wa);

  await handleIncomingMessage(
    PHONE,
    makeTextMessage('Visit our shop at https://joyaa.example.com — handmade gold jewellery'),
    wa,
  );

  const profile = await brandProfileFor();
  const assets = profile
    ? await prisma.brandAsset.findMany({ where: { brandProfileId: profile.id } })
    : [];
  assert(assets.length === 1, '1 asset');
  assert(assets[0]?.type === 'website', `type=website (got ${assets[0]?.type})`);
  assert(
    assets[0]?.rawText?.includes('https://joyaa.example.com') === true,
    'rawText contains the URL',
  );
}

// ---------------------------------------------------------------------------
// Path M — "skip" exit
// ---------------------------------------------------------------------------

async function pathSkip(): Promise<void> {
  console.log('\n== Path M: "skip" → back to change-settings menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa);
  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after skip');
  assert(
    sent.some((m) => m.type === 'text' && /skip/i.test(m.body)),
    'skip-confirmation text sent',
  );
}

// ---------------------------------------------------------------------------
// Path N — "done" with at least one asset enqueues the brand-analysis job
// (Phase 3b: summary writes are now the worker's job, not the handler's).
// ---------------------------------------------------------------------------

async function pathDoneWithAssets(): Promise<void> {
  console.log('\n== Path N: assets + "done" → brand-analysis job enqueued + menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('Premium silver brand'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('https://store.example.com'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('done'), wa);

  const profile = await brandProfileFor();
  assert(!!profile, 'BrandProfile exists');

  // The worker writes summary / version asynchronously; nothing should be on
  // the profile or in BrandSummaryVersion yet from the handler call alone.
  assert(profile?.summary === null, `profile.summary still null pre-worker (got "${profile?.summary}")`);
  const preVersions = profile
    ? await prisma.brandSummaryVersion.count({ where: { brandProfileId: profile.id } })
    : 0;
  assert(preVersions === 0, `no BrandSummaryVersion rows pre-worker (got ${preVersions})`);

  // The handler must have enqueued a brand-analysis job carrying this profile.
  const { getBrandAnalysisQueue } = await import('../packages/queue/dist/index.js');
  const queue = getBrandAnalysisQueue();
  const queued = await queue.getJobs(['waiting', 'active', 'delayed']);
  const ourJob = queued.find((j: any) => j.data?.brandProfileId === profile!.id);
  assert(!!ourJob, 'brand-analysis job enqueued');
  assert(
    ourJob?.data?.phoneNumber === PHONE,
    `job phoneNumber=${PHONE} (got ${ourJob?.data?.phoneNumber})`,
  );

  // User-facing acknowledgement is the "analysing..." text, NOT the final
  // structured profile — that arrives later from the worker.
  assert(
    sent.some((m) => m.type === 'text' && /analy|analyse|analyz/i.test(m.body)),
    'analysing-ack text sent',
  );

  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU after done (got ${s?.state})`);
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after done');

  // Remove the queued job so a live worker doesn't try to process orphaned
  // data once we've cleaned the user up.
  if (ourJob) await ourJob.remove().catch(() => {});
  await queue.close().catch(() => {});
}

// ---------------------------------------------------------------------------
// Path O — "done" with no assets behaves like skip
// ---------------------------------------------------------------------------

async function pathDoneNoAssets(): Promise<void> {
  console.log('\n== Path O: "done" with no assets → treated as skip ==');
  await cleanup();
  const { wa } = makeMockWa();
  await navigateToBrandDetails(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('done'), wa);

  const profile = await brandProfileFor();
  assert(!profile, 'no BrandProfile created when nothing was uploaded');
  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
}

// ---------------------------------------------------------------------------
// Path P — cost rail: 11th asset rejected
// ---------------------------------------------------------------------------

async function pathCostRail(): Promise<void> {
  console.log('\n== Path P: 11th asset rejected (MAX_BRAND_ASSETS = 10) ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  // Pre-seed 10 text assets directly to skip the per-message latency.
  const user = await getUser();
  if (!user) {
    failures++;
    console.error('  ✗ user missing during cost-rail setup');
    return;
  }
  const profile = await prisma.brandProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  await prisma.brandAsset.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      brandProfileId: profile.id,
      type: 'text',
      rawText: `pre-seeded note ${i + 1}`,
    })),
  });
  const seeded = await prisma.brandAsset.count({ where: { brandProfileId: profile.id } });
  assert(seeded === 10, `seeded 10 assets (got ${seeded})`);

  // 11th text message — must be rejected, no new asset row.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('one more note'), wa);

  const afterCount = await prisma.brandAsset.count({ where: { brandProfileId: profile.id } });
  assert(afterCount === 10, `asset count stayed at 10 (got ${afterCount})`);
  assert(
    sent.some((m) => m.type === 'text' && /max|done|skip/i.test(m.body)),
    'rejection message sent',
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 3 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathTextNote();
    await pathUrl();
    await pathSkip();
    await pathDoneWithAssets();
    await pathDoneNoAssets();
    await pathCostRail();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 3 smoke assertions green.');
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
