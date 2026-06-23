#!/usr/bin/env tsx
/**
 * Brand-profile view + edit smoke test.
 *
 * "Edit" now restarts the guided 3-field flow (colours → logo → tagline)
 * rather than the old natural-language edit mode. The logo step is exercised
 * via "skip" only (no real media download).
 *
 * Paths:
 *   Q. No profile → tapping Brand details drops into BRAND_DETAILS_COLLECTING.
 *   R. Profile with content → view + single Edit button; stays CHANGE_SETTINGS_MENU.
 *   S. Tap Edit → BRAND_DETAILS_COLLECTING at step 0 with the colours prompt.
 *   T. Guided colours edit → brandColors patched, advances to the logo step.
 *   U. Finish the guided edit (skip logo → tagline) → job enqueued, back to menu.
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

const PHONE = `919996${String(Date.now()).slice(-7)}`;

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
    messageId: `smoke4-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke4-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke4-${PHONE}-${msgCounter++}`,
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
async function getProfile() {
  const u = await getUser();
  if (!u) return null;
  return prisma.brandProfile.findUnique({ where: { userId: u.id } });
}

async function cleanup(): Promise<void> {
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke4-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

/**
 * Onboard the user via Phase 1, force IDLE, then drop into the CHANGE_SETTINGS_MENU.
 * Returns the user record so the caller can attach a pre-seeded BrandProfile if needed.
 */
async function onboardAndOpenMenu(wa: any): Promise<{ userId: string }> {
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Joyaa'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'IDLE', stateEnteredAt: new Date() },
  });
  const user = await getUser();
  if (!user) throw new Error('User not created during onboarding');
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);
  return { userId: user.id };
}

async function seedBrandProfile(userId: string): Promise<{ id: string }> {
  const profile = await prisma.brandProfile.upsert({
    where: { userId },
    update: {
      tagline: 'Modern heritage jewellery',
      brandColors: ['rose gold', 'ivory'],
      vibe: 'minimalist luxury',
      summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
      logoUrl: 'https://example.com/logo.png',
      summaryUpdatedAt: new Date(),
    },
    create: {
      userId,
      tagline: 'Modern heritage jewellery',
      brandColors: ['rose gold', 'ivory'],
      vibe: 'minimalist luxury',
      summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
      logoUrl: 'https://example.com/logo.png',
      summaryUpdatedAt: new Date(),
    },
  });

  await prisma.brandAsset.createMany({
    data: [
      { brandProfileId: profile.id, type: 'logo', storageUrl: 'https://example.com/logo.png', mimeType: 'image/png' },
      { brandProfileId: profile.id, type: 'reference_image', storageUrl: 'https://example.com/ref1.jpg', mimeType: 'image/jpeg' },
      { brandProfileId: profile.id, type: 'website', rawText: 'https://joyaa.example.com' },
    ],
  });

  return { id: profile.id };
}

// ---------------------------------------------------------------------------
// Path Q — no profile yet → tapping Brand details drops into the guided flow
// ---------------------------------------------------------------------------

async function pathNoProfile(): Promise<void> {
  console.log('\n== Path Q: no profile → SETTING_BRAND_DETAILS drops into collection ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndOpenMenu(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(s?.brandDetailsStep === 0, `brandDetailsStep=0 (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'text' && /colour|color/i.test(m.body)), 'colours prompt sent');
  assert(
    !sent.some((m) => m.type === 'buttons' && m.buttons?.some((b) => b.id === 'edit_brand')),
    'no Edit button sent when profile absent',
  );
}

// ---------------------------------------------------------------------------
// Path R — profile with content → view + single Edit button
// ---------------------------------------------------------------------------

async function pathViewWithButtons(): Promise<void> {
  console.log('\n== Path R: profile exists → view + single Edit button ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state stays CHANGE_SETTINGS_MENU (got ${s?.state})`);

  const view = sent.find((m) => m.type === 'buttons');
  assert(!!view, 'view sent as buttons');
  assert(/Joyaa/.test(view?.body ?? ''), 'view text mentions brand name');
  assert(/Tagline:.*Modern heritage/.test(view?.body ?? ''), 'view shows tagline');
  assert(/Colors:.*rose gold/.test(view?.body ?? ''), 'view shows colors');

  const btnIds = (view?.buttons ?? []).map((b) => b.id).sort();
  assert(
    JSON.stringify(btnIds) === JSON.stringify(['edit_brand']),
    `buttons = edit_brand only (got ${JSON.stringify(btnIds)})`,
  );
}

// ---------------------------------------------------------------------------
// Path S — tap Edit → guided flow at step 0 (colours)
// ---------------------------------------------------------------------------

async function pathTapEdit(): Promise<void> {
  console.log('\n== Path S: tap Edit → BRAND_DETAILS_COLLECTING step 0 ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);
  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(s?.brandDetailsStep === 0, `brandDetailsStep=0 (got ${s?.brandDetailsStep})`);
  assert(
    sent.some((m) => m.type === 'text' && /colour|color/i.test(m.body)),
    'colours prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path T — guided colours edit overwrites the seeded colours
// ---------------------------------------------------------------------------

async function pathEditColours(): Promise<void> {
  console.log('\n== Path T: guided colours edit → brandColors patched, advance to logo ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('red and gold'), wa);

  const profile = await getProfile();
  assert(
    JSON.stringify(profile?.brandColors) === JSON.stringify(['red', 'gold']),
    `brandColors patched to [red, gold] (got ${JSON.stringify(profile?.brandColors)})`,
  );
  const s = await getSession();
  assert(s?.brandDetailsStep === 1, `advanced to logo step (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'text' && /logo/i.test(m.body)), 'logo prompt sent');
}

// ---------------------------------------------------------------------------
// Path U — finishing the guided edit enqueues the worker + returns to menu
// ---------------------------------------------------------------------------

async function pathFinishEdit(): Promise<void> {
  console.log('\n== Path U: skip logo → tagline → job enqueued + menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  const { id: profileId } = await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('red and gold'), wa); // colours → logo
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa); // skip logo → tagline

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('Crafted for modern brides'), wa); // tagline → finalise

  const profile = await getProfile();
  assert(profile?.tagline === 'Crafted for modern brides', `tagline patched (got "${profile?.tagline}")`);

  const { getBrandAnalysisQueue } = await import('../packages/queue/dist/index.js');
  const queue = getBrandAnalysisQueue();
  const queued = await queue.getJobs(['waiting', 'active', 'delayed']);
  const ourJob = queued.find((j: any) => j.data?.brandProfileId === profileId);
  assert(!!ourJob, 'brand-analysis job enqueued');
  assert(
    sent.some((m) => m.type === 'text' && /analy|analyse|analyz/i.test(m.body)),
    'analysing-ack text sent',
  );

  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert(s?.brandDetailsStep === 0, `step reset to 0 (got ${s?.brandDetailsStep})`);
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after finalise');

  if (ourJob) await ourJob.remove().catch(() => {});
  await queue.close().catch(() => {});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Brand-profile view + edit smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathNoProfile();
    await pathViewWithButtons();
    await pathTapEdit();
    await pathEditColours();
    await pathFinishEdit();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all brand-profile smoke assertions green.');
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
