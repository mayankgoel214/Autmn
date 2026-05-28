#!/usr/bin/env tsx
/**
 * Phase 2 smoke test — returning-user 2-button menu + change-settings flow.
 *
 * Paths covered:
 *   E. Returning user → Generate ad → AWAITING_PHOTO.
 *   F. Returning user → Change settings → Language → confirm + back to menu.
 *   G. Returning user → Change settings → Brand name → confirm + back to menu.
 *   H. Returning user → Change settings → Category via Other (free text) → menu.
 *   I. Returning user → Change settings → Brand details → coming-soon stub + stay in menu.
 *   J. Returning user → Change settings → Back → IDLE.
 *
 * Reuses the Phase 1 onboarding flow to set up the returning user once at the
 * top of each path. Forces state IDLE between paths because there is no
 * built-in path from AWAITING_PHOTO back to IDLE on "hi".
 *
 * Run: npx tsx scripts/smoke-phase-2.ts
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

const PHONE = `919998${String(Date.now()).slice(-7)}`;

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
    messageId: `smoke2-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke2-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke2-${PHONE}-${msgCounter++}`,
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
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke2-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

/**
 * Onboard a returning user via the Phase 1 flow:
 *   hi → lang_en → "Founder" → cat_jewellery → AWAITING_PHOTO.
 * Then force state IDLE so the next "hi" hits handleIdle returning-user branch.
 */
async function onboardAndReset(wa: any): Promise<void> {
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Founder'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);

  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'IDLE', stateEnteredAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Path E — Generate ad
// ---------------------------------------------------------------------------

async function pathGenerateAd(): Promise<void> {
  console.log('\n== Path E: returning user → Generate ad ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  // First "hi" as returning user → 2-button menu.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  let s = await getSession();
  assert(s?.state === 'IDLE', `state IDLE after returning-user hi (got ${s?.state})`);
  const menu = sent.find((m) => m.type === 'buttons');
  assert(!!menu, 'returning-user menu sent');
  const ids = (menu?.buttons ?? []).map((b) => b.id).sort();
  assert(
    JSON.stringify(ids) === JSON.stringify(['change_settings', 'generate_ad']),
    `menu buttons = generate_ad + change_settings (got ${JSON.stringify(ids)})`,
  );
  assert(
    !ids.includes('profile_continue') && !ids.includes('profile_change_brand'),
    'legacy 3-button profile UI not present',
  );

  // Tap Generate ad → AWAITING_PHOTO + send-photo prompt. inChangeSettings stays false.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('generate_ad'), wa);
  s = await getSession();
  assert(s?.state === 'AWAITING_PHOTO', `state AWAITING_PHOTO after generate_ad (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === false, 'inChangeSettings stays false');
  assert(
    sent.some((m) => m.type === 'text' && m.body.length > 0),
    'send-photo prompt text sent',
  );
}

// ---------------------------------------------------------------------------
// Path F — Change language round-trip
// ---------------------------------------------------------------------------

async function pathChangeLanguage(): Promise<void> {
  console.log('\n== Path F: change settings → Language → back to menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);

  // Tap Change settings → CHANGE_SETTINGS_MENU + list with 5 rows.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);
  let s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
  const list = sent.find((m) => m.type === 'list');
  assert(!!list, 'change-settings list sent');
  const rowIds = (list?.rows ?? []).map((r) => r.id).sort();
  assert(
    JSON.stringify(rowIds) === JSON.stringify(['setting_back', 'setting_brand', 'setting_brand_details', 'setting_category', 'setting_language']),
    `menu rows = 5 expected ids (got ${JSON.stringify(rowIds)})`,
  );

  // Tap Language → SETUP_LANGUAGE + picker + inChangeSettings=true.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_language'), wa);
  s = await getSession();
  assert(s?.state === 'SETUP_LANGUAGE', `state SETUP_LANGUAGE after setting_language (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === true, `inChangeSettings=true (got ${(s as any)?.inChangeSettings})`);
  assert(sent.some((m) => m.type === 'buttons' && m.buttons?.length === 3), 'language picker re-sent');

  // Tap Hindi → language saved + back to CHANGE_SETTINGS_MENU + menu re-shown + flag cleared.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_hi'), wa);
  s = await getSession();
  const u = await getUser();
  assert(u?.language === 'hi', `language updated to hi (got ${u?.language})`);
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `back at CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === false, 'inChangeSettings cleared');
  assert(
    sent.some((m) => m.type === 'text' && /भाषा सेट|Language set/.test(m.body)),
    'language-confirmation sent',
  );
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after edit');
}

// ---------------------------------------------------------------------------
// Path G — Change brand round-trip
// ---------------------------------------------------------------------------

async function pathChangeBrand(): Promise<void> {
  console.log('\n== Path G: change settings → Brand name → back to menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);

  // Tap Brand name → SETUP_NAME + brand prompt + inChangeSettings=true.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_NAME', `state SETUP_NAME (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === true, 'inChangeSettings=true');

  // Type new brand → saved + back to menu + flag cleared. user.businessType
  // already exists (cat_jewellery) — but in change-settings mode we route to
  // menu, NOT to AWAITING_PHOTO via the businessType shortcut.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('NewBrand'), wa);
  s = await getSession();
  const u = await getUser();
  assert(u?.brandName === 'NewBrand', `brandName updated to NewBrand (got ${u?.brandName})`);
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `back at CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === false, 'inChangeSettings cleared');
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown after brand edit');
}

// ---------------------------------------------------------------------------
// Path H — Change category via Other (free-text)
// ---------------------------------------------------------------------------

async function pathChangeCategoryOther(): Promise<void> {
  console.log('\n== Path H: change settings → Category → Other → free text → back to menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);

  // Tap Category → SETUP_CATEGORY + list + inChangeSettings=true.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_category'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_CATEGORY', `state SETUP_CATEGORY (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === true, 'inChangeSettings=true');

  // Tap Other → SETUP_CATEGORY_OTHER + free-text prompt. Flag must persist.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('cat_other'), wa);
  s = await getSession();
  assert(s?.state === 'SETUP_CATEGORY_OTHER', `state SETUP_CATEGORY_OTHER (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === true, 'inChangeSettings persists into SETUP_CATEGORY_OTHER');

  // Type "stationery" → save + back to menu + flag cleared.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('stationery'), wa);
  s = await getSession();
  const u = await getUser();
  assert(u?.businessType === 'stationery', `businessType=stationery (got ${u?.businessType})`);
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `back at CHANGE_SETTINGS_MENU (got ${s?.state})`);
  assert((s as any)?.inChangeSettings === false, 'inChangeSettings cleared');
  assert(sent.some((m) => m.type === 'list'), 'menu re-shown');
}

// ---------------------------------------------------------------------------
// Path I — Brand details row hands off to BRAND_DETAILS_COLLECTING
//          (Phase 3 wired the real handler; the Phase 2 stub is gone.)
// ---------------------------------------------------------------------------

async function pathBrandDetailsStub(): Promise<void> {
  console.log('\n== Path I: brand details → BRAND_DETAILS_COLLECTING + prompt ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_brand_details'), wa);
  const s = await getSession();
  assert(
    s?.state === 'BRAND_DETAILS_COLLECTING',
    `state BRAND_DETAILS_COLLECTING (got ${s?.state})`,
  );
  assert(
    sent.some((m) => m.type === 'text' && /done|skip|logo/i.test(m.body)),
    'brand-details prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path J — Back to IDLE
// ---------------------------------------------------------------------------

async function pathBack(): Promise<void> {
  console.log('\n== Path J: change settings → Back → IDLE ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardAndReset(wa);

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('setting_back'), wa);
  const s = await getSession();
  assert(s?.state === 'IDLE', `state IDLE after Back (got ${s?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /done|ho gaya|हो गया/i.test(m.body)),
    'settings-exit text sent',
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 2 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathGenerateAd();
    await pathChangeLanguage();
    await pathChangeBrand();
    await pathChangeCategoryOther();
    await pathBrandDetailsStub();
    await pathBack();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 2 smoke assertions green.');
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
