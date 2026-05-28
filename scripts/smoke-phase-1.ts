#!/usr/bin/env tsx
/**
 * Phase 1 smoke test — exercises the new onboarding state machine end-to-end
 * by driving handleIncomingMessage with mock WhatsApp messages. No real
 * WhatsApp, no real photos, no payments.
 *
 * Paths covered:
 *   A. Skip-everything: hi → lang_hi button → "skip" → cat_skip → AWAITING_PHOTO
 *   B. Fill-everything: hi → "2" (text) → "Joyaa" → cat_jewellery → AWAITING_PHOTO
 *   C. Other free-text: hi → lang_hinglish → "Test Brand" → cat_other → "stationery" → AWAITING_PHOTO
 *   D. Invalid input: hi → "xyz" → re-prompts, state unchanged
 *
 * Run: npx tsx scripts/smoke-phase-1.ts
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

// Imports must come after env load so the Prisma client picks up DATABASE_URL.
// Workspace packages aren't symlinked under scripts/, so import via direct dist
// paths. The inner @autmn/* imports inside session resolve fine because they
// walk up from packages/session/dist/.
const { PrismaClient } = await import('../packages/db/src/generated/client/index.js');
const { handleIncomingMessage } = await import('../packages/session/dist/index.js');
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

// Unique fake phone per run so failed runs don't collide with subsequent runs.
const PHONE = `919999${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  rows?: Array<{ id: string; title: string; description?: string }>;
}

function makeMockWa() {
  const sent: SentMessage[] = [];
  const wa = {
    sendText: async (_phone: string, body: string) => {
      sent.push({ type: 'text', body });
    },
    sendButtons: async (
      _phone: string,
      body: string,
      buttons: Array<{ id: string; title: string }>,
    ) => {
      sent.push({ type: 'buttons', body, buttons });
    },
    sendList: async (
      _phone: string,
      body: string,
      _footer: string,
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    ) => {
      const rows = sections.flatMap((s) => s.rows);
      sent.push({ type: 'list', body, rows });
    },
    sendImage: async (_phone: string, _url: string, caption?: string) => {
      sent.push({ type: 'image', body: caption ?? '' });
    },
    sendPaymentLink: async (_phone: string, body: string) => {
      sent.push({ type: 'paymentLink', body });
    },
    markAsRead: async (_id: string) => {},
  };
  return { wa: wa as any, sent };
}

let msgCounter = 0;
function makeTextMessage(text: string): MessageContext {
  return {
    messageId: `smoke-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke-${PHONE}-${msgCounter++}`,
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
    where: { messageId: { startsWith: `smoke-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Path A — skip everything
// ---------------------------------------------------------------------------

async function pathSkipEverything(): Promise<void> {
  console.log('\n== Path A: skip everything ==');
  const { wa, sent } = makeMockWa();

  // 1. First "hi" → SETUP_LANGUAGE + 3-button picker.
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_LANGUAGE', `state SETUP_LANGUAGE after "hi" (got ${s?.state})`);
  const picker = sent.find((m) => m.type === 'buttons');
  assert(!!picker && picker.buttons?.length === 3, 'language picker sent with 3 buttons');
  const buttonIds = (picker?.buttons ?? []).map((b) => b.id).sort();
  assert(
    JSON.stringify(buttonIds) === JSON.stringify(['lang_en', 'lang_hi', 'lang_hinglish']),
    `picker button ids = lang_en/lang_hi/lang_hinglish (got ${JSON.stringify(buttonIds)})`,
  );

  // 2. Tap lang_hi → SETUP_NAME + confirmation + brand-name prompt.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_hi'), wa);
  s = await getSession();
  let u = await getUser();
  assert(s?.state === 'SETUP_NAME', `state SETUP_NAME after lang_hi (got ${s?.state})`);
  assert(u?.language === 'hi', `language saved as hi (got ${u?.language})`);
  assert(
    sent.some((m) => m.type === 'text' && /भाषा सेट/.test(m.body)),
    'Hindi language-confirmation text sent',
  );
  assert(
    sent.some((m) => m.type === 'text' && /ब्रांड/.test(m.body)),
    'Hindi brand-name prompt sent',
  );

  // 3. Reply "skip" → SETUP_CATEGORY, brandName stays null, list sent with new rows.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('skip'), wa);
  s = await getSession();
  u = await getUser();
  assert(s?.state === 'SETUP_CATEGORY', `state SETUP_CATEGORY after skip (got ${s?.state})`);
  assert(u?.brandName === null, `brandName stayed null after skip (got ${u?.brandName})`);
  assert(
    sent.some((m) => m.type === 'text' && /skip/i.test(m.body)),
    'brand-name skip confirmation sent',
  );
  const list = sent.find((m) => m.type === 'list');
  assert(!!list, 'category list sent');
  const rowIds = (list?.rows ?? []).map((r) => r.id);
  assert(rowIds.includes('cat_other'), 'list contains cat_other row');
  assert(rowIds.includes('cat_skip'), 'list contains cat_skip row');
  assert(!rowIds.includes('cat_general'), 'list no longer contains cat_general row');

  // 4. Tap cat_skip → AWAITING_PHOTO, businessType null, send-photo prompt.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('cat_skip'), wa);
  s = await getSession();
  u = await getUser();
  assert(s?.state === 'AWAITING_PHOTO', `state AWAITING_PHOTO after cat_skip (got ${s?.state})`);
  assert(u?.businessType === null, `businessType stayed null after skip (got ${u?.businessType})`);
  assert(
    sent.some((m) => m.type === 'text' && /skip/i.test(m.body)),
    'category-skip confirmation sent',
  );
}

// ---------------------------------------------------------------------------
// Path B — fill everything
// ---------------------------------------------------------------------------

async function pathFillEverything(): Promise<void> {
  console.log('\n== Path B: fill everything ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_LANGUAGE', 'state SETUP_LANGUAGE');

  // Text fallback "2" → English.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('2'), wa);
  let u = await getUser();
  s = await getSession();
  assert(u?.language === 'en', `language=en via "2" text (got ${u?.language})`);
  assert(s?.state === 'SETUP_NAME', `state SETUP_NAME after "2"`);

  // Brand "Joyaa"
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('Joyaa'), wa);
  u = await getUser();
  s = await getSession();
  assert(u?.brandName === 'Joyaa', `brandName=Joyaa (got ${u?.brandName})`);
  assert(u?.name === 'Joyaa', `name mirrored to Joyaa (got ${u?.name})`);
  assert(s?.state === 'SETUP_CATEGORY', `state SETUP_CATEGORY`);
  assert(
    sent.some((m) => m.type === 'text' && m.body.includes('Brand name set: Joyaa')),
    'brand-name confirmation matches plan example',
  );

  // Tap Jewellery → AWAITING_PHOTO, businessType=cat_jewellery.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  u = await getUser();
  s = await getSession();
  assert(u?.businessType === 'cat_jewellery', `businessType=cat_jewellery (got ${u?.businessType})`);
  assert(s?.state === 'AWAITING_PHOTO', `state AWAITING_PHOTO`);
  assert(
    sent.some((m) => m.type === 'text' && /Category set: Jewellery/i.test(m.body)),
    'category-confirmation text sent',
  );
}

// ---------------------------------------------------------------------------
// Path C — Other free-text category
// ---------------------------------------------------------------------------

async function pathOther(): Promise<void> {
  console.log('\n== Path C: Other (free-text category) ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);

  // Hinglish via button.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_hinglish'), wa);
  let u = await getUser();
  assert(u?.language === 'hinglish', `language=hinglish via button (got ${u?.language})`);

  // Brand. sanitizeBrandName only forces title-case on the first char and
  // preserves the rest of the user's casing, so "Test Brand" stays "Test Brand".
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('Test Brand'), wa);
  u = await getUser();
  assert(u?.brandName === 'Test Brand', `brandName preserved as "Test Brand" (got ${u?.brandName})`);

  // cat_other → SETUP_CATEGORY_OTHER + free-text prompt.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('cat_other'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_CATEGORY_OTHER', `state SETUP_CATEGORY_OTHER (got ${s?.state})`);
  assert(
    sent.some((m) => m.type === 'text' && /category/i.test(m.body)),
    'free-text category prompt sent',
  );

  // Type "stationery" → save + AWAITING_PHOTO.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('stationery'), wa);
  s = await getSession();
  u = await getUser();
  assert(s?.state === 'AWAITING_PHOTO', `state AWAITING_PHOTO after free-text (got ${s?.state})`);
  assert(u?.businessType === 'stationery', `businessType=stationery (got ${u?.businessType})`);
  assert(
    sent.some((m) => m.type === 'text' && /Category set: Stationery/i.test(m.body)),
    'free-text category confirmation sent',
  );
}

// ---------------------------------------------------------------------------
// Path D — invalid language input → re-prompt, state unchanged
// ---------------------------------------------------------------------------

async function pathInvalid(): Promise<void> {
  console.log('\n== Path D: invalid input on language picker ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  let s = await getSession();
  assert(s?.state === 'SETUP_LANGUAGE', 'state SETUP_LANGUAGE');

  // Capture language BEFORE the garbage input to assert it is unchanged.
  // (Note: getOrCreateUser at packages/session/src/db-helpers.ts:119 creates
  // users with language='hi', overriding the schema's @default("hinglish") —
  // a pre-existing inconsistency, not a Phase 1 concern.)
  const langBefore = (await getUser())?.language;

  // Garbage input.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('xyz'), wa);
  s = await getSession();
  const u = await getUser();
  assert(s?.state === 'SETUP_LANGUAGE', `state stays SETUP_LANGUAGE on garbage input (got ${s?.state})`);
  assert(
    u?.language === langBefore,
    `language unchanged by garbage input (before=${langBefore}, after=${u?.language})`,
  );
  const picker = sent.find((m) => m.type === 'buttons') ?? sent.find((m) => m.type === 'text' && /1.*2.*3/.test(m.body));
  assert(!!picker, 'picker re-sent on invalid input');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 1 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup(); // safety: clear any residue from a previous failed run.
    await pathSkipEverything();
    await pathFillEverything();
    await pathOther();
    await pathInvalid();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 1 smoke assertions green.');
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
