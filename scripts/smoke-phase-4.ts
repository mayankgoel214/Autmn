#!/usr/bin/env tsx
/**
 * Phase 4 smoke test — brand profile view + edit.
 *
 * Runs with BRAND_ANALYSIS_DRY_RUN=true so parseBrandEdit only uses its
 * deterministic regex fast-path — no Gemini calls.
 *
 * Paths:
 *   Q. No profile → tapping Brand details still drops into BRAND_DETAILS_COLLECTING
 *      (Phase 3a fallback preserved).
 *   R. Profile with content → view + Edit / Add-more buttons sent; state stays
 *      CHANGE_SETTINGS_MENU.
 *   S. Tap Edit → BRAND_DETAILS_EDITING + edit prompt.
 *   T. "change colors to red and gold" → brandColors patched, version row appended.
 *   U. "tagline: handcrafted in India" → tagline patched, another version row.
 *   V. Garbage instruction → "unrecognised" reply, no patch applied.
 *   W. "done" → CHANGE_SETTINGS_MENU + exit confirmation.
 *   X. Tap Add more from the view → BRAND_DETAILS_COLLECTING.
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

// Force regex-only parsing in parseBrandEdit so we never call Gemini.
process.env.BRAND_ANALYSIS_DRY_RUN = 'true';

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
      summaryUpdatedAt: new Date(),
    },
    create: {
      userId,
      tagline: 'Modern heritage jewellery',
      brandColors: ['rose gold', 'ivory'],
      vibe: 'minimalist luxury',
      summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
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
// Path Q — no profile yet → tapping Brand details drops into collection
// ---------------------------------------------------------------------------

async function pathNoProfile(): Promise<void> {
  console.log('\n== Path Q: no profile → SETTING_BRAND_DETAILS still drops into collection ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndOpenMenu(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(sent.some((m) => m.type === 'text' && /done|skip|logo/i.test(m.body)), 'collection prompt sent');
  // No view buttons should have been sent because there's nothing to view.
  assert(
    !sent.some((m) => m.type === 'buttons' && m.buttons?.some((b) => b.id === 'edit_brand')),
    'no Edit button sent when profile absent',
  );
}

// ---------------------------------------------------------------------------
// Path R — profile with content → view + Edit/Add-more buttons
// ---------------------------------------------------------------------------

async function pathViewWithButtons(): Promise<void> {
  console.log('\n== Path R: profile exists → view + Edit/Add-more buttons ==');
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
  assert(/Vibe:.*minimalist luxury/.test(view?.body ?? ''), 'view shows vibe');
  assert(/2 images/.test(view?.body ?? ''), 'view shows image count');
  assert(/1 website link/.test(view?.body ?? ''), 'view shows website count');

  const btnIds = (view?.buttons ?? []).map((b) => b.id).sort();
  assert(
    JSON.stringify(btnIds) === JSON.stringify(['add_more_brand', 'edit_brand']),
    `buttons = edit_brand + add_more_brand (got ${JSON.stringify(btnIds)})`,
  );
}

// ---------------------------------------------------------------------------
// Path S — tap Edit → BRAND_DETAILS_EDITING + prompt
// ---------------------------------------------------------------------------

async function pathTapEdit(): Promise<void> {
  console.log('\n== Path S: tap Edit → BRAND_DETAILS_EDITING + edit prompt ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);
  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_EDITING', `state BRAND_DETAILS_EDITING (got ${s?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /natural language|done/i.test(m.body)),
    'edit prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path T — natural-language color edit
// ---------------------------------------------------------------------------

async function pathEditColors(): Promise<void> {
  console.log('\n== Path T: "change colors to red and gold" → brandColors patched + version ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  const { id: profileId } = await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('change colors to red and gold'), wa);

  const profile = await getProfile();
  assert(
    JSON.stringify(profile?.brandColors) === JSON.stringify(['red', 'gold']),
    `brandColors patched to [red, gold] (got ${JSON.stringify(profile?.brandColors)})`,
  );

  const versions = await prisma.brandSummaryVersion.findMany({
    where: { brandProfileId: profileId },
    orderBy: { createdAt: 'desc' },
  });
  assert(versions.length === 1, `1 new BrandSummaryVersion (got ${versions.length})`);
  assert(
    typeof versions[0]?.changeReason === 'string' && versions[0]!.changeReason!.startsWith('user_edit:'),
    `version.changeReason starts with "user_edit:" (got "${versions[0]?.changeReason}")`,
  );
  const struct = versions[0]?.structuredData as any;
  assert(struct?.editedField === 'brandColors', `structuredData.editedField=brandColors`);

  assert(
    sent.some((m) => m.type === 'text' && /Updated/.test(m.body) && /red, gold/i.test(m.body)),
    'applied-confirmation text mentions new colors',
  );

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_EDITING', `stays in editing state after patch`);
}

// ---------------------------------------------------------------------------
// Path U — tagline edit (different field, second version row)
// ---------------------------------------------------------------------------

async function pathEditTagline(): Promise<void> {
  console.log('\n== Path U: "tagline: handcrafted in India" → tagline patched ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  const { id: profileId } = await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('tagline: handcrafted in India'), wa);

  const profile = await getProfile();
  assert(
    profile?.tagline === 'handcrafted in India',
    `tagline patched (got "${profile?.tagline}")`,
  );
  const versions = await prisma.brandSummaryVersion.count({ where: { brandProfileId: profileId } });
  assert(versions === 1, `1 version row created (got ${versions})`);
  assert(
    sent.some((m) => m.type === 'text' && /Updated/.test(m.body) && /handcrafted in India/.test(m.body)),
    'confirmation mentions new tagline',
  );
}

// ---------------------------------------------------------------------------
// Path V — unrecognised instruction → unrecognized message, no patch
// ---------------------------------------------------------------------------

async function pathEditUnrecognised(): Promise<void> {
  console.log('\n== Path V: garbage instruction → unrecognised, no patch ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  const { id: profileId } = await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('asdfghjkl'), wa);

  const profile = await getProfile();
  assert(
    profile?.tagline === 'Modern heritage jewellery',
    `tagline unchanged after garbage (got "${profile?.tagline}")`,
  );
  const versions = await prisma.brandSummaryVersion.count({ where: { brandProfileId: profileId } });
  assert(versions === 0, `no version row created on garbage (got ${versions})`);
  assert(
    sent.some((m) => m.type === 'text' && /Couldn't parse|Samajh|समझ/i.test(m.body)),
    'unrecognised message sent',
  );
}

// ---------------------------------------------------------------------------
// Path W — "done" exits editing back to the menu
// ---------------------------------------------------------------------------

async function pathEditDone(): Promise<void> {
  console.log('\n== Path W: "done" → back to CHANGE_SETTINGS_MENU ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('edit_brand'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('done'), wa);

  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert(sent.some((m) => m.type === 'text' && /Edits saved|save ho gaye|save हो/i.test(m.body)), 'exit text sent');
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after done');
}

// ---------------------------------------------------------------------------
// Path X — tap Add more → BRAND_DETAILS_COLLECTING
// ---------------------------------------------------------------------------

async function pathAddMore(): Promise<void> {
  console.log('\n== Path X: tap Add more → BRAND_DETAILS_COLLECTING ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  const { userId } = await onboardAndOpenMenu(wa);
  await seedBrandProfile(userId);
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('add_more_brand'), wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(sent.some((m) => m.type === 'text' && /done|skip|logo/i.test(m.body)), 'collection prompt sent');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 4 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathNoProfile();
    await pathViewWithButtons();
    await pathTapEdit();
    await pathEditColors();
    await pathEditTagline();
    await pathEditUnrecognised();
    await pathEditDone();
    await pathAddMore();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 4 smoke assertions green.');
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
