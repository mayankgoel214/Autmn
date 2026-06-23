#!/usr/bin/env tsx
/**
 * Brand-details smoke test — guided 3-field flow (colours → logo → tagline).
 *
 * The logo step needs a real WhatsApp media download, so it's exercised here
 * only via "skip" and the wrong-input nudge — never an actual upload.
 *
 * Paths:
 *   K. enter flow → BRAND_DETAILS_COLLECTING, step 0, colours prompt asked.
 *   L. colours text → brandColors parsed + stored, advances to logo step.
 *   M. "skip" on colours → field left empty, advances to logo step.
 *   N. logo step: non-image text → nudge, stays on logo step.
 *   O. full happy path (colours → skip logo → tagline) → fields stored,
 *      brand-analysis job enqueued, "analysing" ack, back to menu.
 *   P. skip every field → treated as skip (no job), back to menu.
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

async function brandProfileFor(): Promise<{ id: string; brandColors: string[]; tagline: string | null } | null> {
  const u = await getUser();
  if (!u) return null;
  return prisma.brandProfile.findUnique({ where: { userId: u.id } });
}

// ---------------------------------------------------------------------------
// Path K — entering the flow asks for colours at step 0
// ---------------------------------------------------------------------------

async function pathEnter(): Promise<void> {
  console.log('\n== Path K: enter flow → step 0 + colours prompt ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  sent.length = 0;
  await navigateToBrandDetails(wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(s?.brandDetailsStep === 0, `brandDetailsStep=0 (got ${s?.brandDetailsStep})`);
  assert(
    sent.some((m) => m.type === 'text' && /colour|color/i.test(m.body)),
    'colours prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path L — colours text stored, advances to the logo step
// ---------------------------------------------------------------------------

async function pathColours(): Promise<void> {
  console.log('\n== Path L: colours text → brandColors stored, advance to logo ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('red and gold'), wa);

  const profile = await brandProfileFor();
  assert(
    JSON.stringify(profile?.brandColors) === JSON.stringify(['red', 'gold']),
    `brandColors parsed to [red, gold] (got ${JSON.stringify(profile?.brandColors)})`,
  );
  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', 'still collecting');
  assert(s?.brandDetailsStep === 1, `advanced to logo step (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'text' && /logo/i.test(m.body)), 'logo prompt sent');
}

// ---------------------------------------------------------------------------
// Path M — "skip" on colours leaves the field empty, advances to logo
// ---------------------------------------------------------------------------

async function pathSkipColours(): Promise<void> {
  console.log('\n== Path M: skip colours → empty, advance to logo ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa);

  const profile = await brandProfileFor();
  assert((profile?.brandColors.length ?? 0) === 0, 'no colours stored after skip');
  const s = await getSession();
  assert(s?.brandDetailsStep === 1, `advanced to logo step (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'text' && /logo/i.test(m.body)), 'logo prompt sent');
}

// ---------------------------------------------------------------------------
// Path N — logo step nudges on non-image input and stays put
// ---------------------------------------------------------------------------

async function pathLogoNudge(): Promise<void> {
  console.log('\n== Path N: logo step + text → nudge, stays on logo step ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // past colours → logo step

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('here is my brand'), wa);

  const s = await getSession();
  assert(s?.brandDetailsStep === 1, `stays on logo step (got ${s?.brandDetailsStep})`);
  assert(
    sent.some((m) => m.type === 'text' && /image|logo/i.test(m.body)),
    'logo-expected nudge sent',
  );
}

// ---------------------------------------------------------------------------
// Path O — full happy path: colours → skip logo → tagline → enqueue + menu
// ---------------------------------------------------------------------------

async function pathHappyPath(): Promise<void> {
  console.log('\n== Path O: colours → skip logo → tagline → job enqueued + menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('emerald, ivory'), wa); // colours → logo
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // skip logo → tagline

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('Handcrafted in India'), wa); // tagline → finalise

  const profile = await brandProfileFor();
  assert(!!profile, 'BrandProfile exists');
  assert(
    JSON.stringify(profile?.brandColors) === JSON.stringify(['emerald', 'ivory']),
    `colours persisted (got ${JSON.stringify(profile?.brandColors)})`,
  );
  assert(profile?.tagline === 'Handcrafted in India', `tagline persisted (got "${profile?.tagline}")`);

  // The worker writes summary asynchronously — nothing on the profile yet.
  const fullProfile = profile
    ? await prisma.brandProfile.findUnique({ where: { id: profile.id } })
    : null;
  assert(fullProfile?.summary === null, `summary still null pre-worker (got "${fullProfile?.summary}")`);

  // The handler must have enqueued a brand-analysis job for this profile.
  const { getBrandAnalysisQueue } = await import('../packages/queue/dist/index.js');
  const queue = getBrandAnalysisQueue();
  const queued = await queue.getJobs(['waiting', 'active', 'delayed']);
  const ourJob = queued.find((j: any) => j.data?.brandProfileId === profile!.id);
  assert(!!ourJob, 'brand-analysis job enqueued');
  assert(
    ourJob?.data?.phoneNumber === PHONE,
    `job phoneNumber=${PHONE} (got ${ourJob?.data?.phoneNumber})`,
  );

  assert(
    sent.some((m) => m.type === 'text' && /analy|analyse|analyz/i.test(m.body)),
    'analysing-ack text sent',
  );

  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU after finalise (got ${s?.state})`);
  assert(s?.brandDetailsStep === 0, `step reset to 0 (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after finalise');

  if (ourJob) await ourJob.remove().catch(() => {});
  await queue.close().catch(() => {});
}

// ---------------------------------------------------------------------------
// Path P — skipping every field is treated as a skip (no job)
// ---------------------------------------------------------------------------

async function pathSkipAll(): Promise<void> {
  console.log('\n== Path P: skip all fields → treated as skip, no job ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // colours
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // logo
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // tagline → finalise

  const profile = await brandProfileFor();
  // Profile is lazily upserted but carries no content.
  assert(
    !profile || ((profile.brandColors.length === 0) && !profile.tagline),
    'no brand content stored',
  );

  const { getBrandAnalysisQueue } = await import('../packages/queue/dist/index.js');
  const queue = getBrandAnalysisQueue();
  const queued = await queue.getJobs(['waiting', 'active', 'delayed']);
  const ourJob = profile ? queued.find((j: any) => j.data?.brandProfileId === profile.id) : undefined;
  assert(!ourJob, 'no brand-analysis job enqueued on skip-all');
  await queue.close().catch(() => {});

  assert(sent.some((m) => m.type === 'text' && /skip/i.test(m.body)), 'skip-confirmation text sent');
  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Brand-details smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathEnter();
    await pathColours();
    await pathSkipColours();
    await pathLogoNudge();
    await pathHappyPath();
    await pathSkipAll();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all brand-details smoke assertions green.');
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
