#!/usr/bin/env tsx
/**
 * Brand-details smoke test — single "brand colours" question.
 *
 * Paths:
 *   K. enter flow → BRAND_DETAILS_COLLECTING, colours prompt asked.
 *   L. colours text → brandColors parsed + stored, back to CHANGE_SETTINGS_MENU.
 *   M. "skip" → no colours stored, back to CHANGE_SETTINGS_MENU.
 *   N. non-text input → re-ask, stays in collecting state.
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
function makeImageMessage(): MessageContext {
  return {
    messageId: `smoke3-${PHONE}-${msgCounter++}`,
    messageType: 'image',
    mediaId: `media-${msgCounter}`,
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
  // brand_assets / brand_summary_versions cascade off brand_profiles, which
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

async function brandProfileFor(): Promise<{ id: string; brandColors: string[] } | null> {
  const u = await getUser();
  if (!u) return null;
  return prisma.brandProfile.findUnique({ where: { userId: u.id } });
}

// ---------------------------------------------------------------------------
// Path K — entering the flow asks for colours
// ---------------------------------------------------------------------------

async function pathEnter(): Promise<void> {
  console.log('\n== Path K: enter flow → colours prompt ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  sent.length = 0;
  await navigateToBrandDetails(wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `state BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /colour|color/i.test(m.body)),
    'colours prompt sent',
  );
}

// ---------------------------------------------------------------------------
// Path L — colours text stored, returns to the menu
// ---------------------------------------------------------------------------

async function pathColours(): Promise<void> {
  console.log('\n== Path L: colours text → stored + back to menu ==');
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
  assert(
    sent.some((m) => m.type === 'text' && /saved|save ho|save हो/i.test(m.body)),
    'saved-confirmation text sent',
  );
  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
  // NB: the menu re-render can be suppressed by sendChangeSettingsMenu's 6s
  // dedupe when the test runs faster than that window — not asserted here.
}

// ---------------------------------------------------------------------------
// Path M — "skip" returns to the menu without storing colours
// ---------------------------------------------------------------------------

async function pathSkip(): Promise<void> {
  console.log('\n== Path M: "skip" → back to menu, no colours ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa);

  const profile = await brandProfileFor();
  assert((profile?.brandColors.length ?? 0) === 0, 'no colours stored on skip');
  assert(sent.some((m) => m.type === 'text' && /skip/i.test(m.body)), 'skip-confirmation text sent');
  const s = await getSession();
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state CHANGE_SETTINGS_MENU (got ${s?.state})`);
}

// ---------------------------------------------------------------------------
// Path N — non-text input re-asks and stays in the collecting state
// ---------------------------------------------------------------------------

async function pathNonText(): Promise<void> {
  console.log('\n== Path N: image input → re-ask, stays collecting ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await navigateToBrandDetails(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeImageMessage(), wa);

  const s = await getSession();
  assert(s?.state === 'BRAND_DETAILS_COLLECTING', `stays BRAND_DETAILS_COLLECTING (got ${s?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /colour|color/i.test(m.body)),
    'colours prompt re-asked',
  );
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
    await pathSkip();
    await pathNonText();
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
