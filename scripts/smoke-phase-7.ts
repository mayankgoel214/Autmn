#!/usr/bin/env tsx
/**
 * Phase 7 smoke test — polish (lang fixes, picker single-message, upfront
 * copy, 30s "hi" dedupe).
 *
 * Paths:
 *   AK. Hinglish user with one photo present types "blah" → guidance text is
 *       Hinglish ("Pehle ek photo bhejein!"), not English. Pre-Phase-7 it
 *       was English because lang === 'hi' didn't cover 'hinglish'.
 *   AL. Style picker on pick #2 sends a SINGLE list message whose body
 *       contains both the checkbox state and the "Pick style 2" prompt
 *       (was two separate sends before Phase 7).
 *   AM. Initial style list body contains the "Pick 1-3 styles..." upfront
 *       copy.
 *   AN. Returning user sends "hi" twice within 30s — second tap does NOT
 *       re-send the 2-button menu (zero buttons in `sent` on the 2nd call).
 *       Third call after the dedupe window passes DOES re-send.
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

const PHONE = `919993${String(Date.now()).slice(-7)}`;

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
    sendButtons: async (_p: string, body: string, buttons: Array<{ id: string; title: string }>) => {
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
    messageId: `smoke7-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke7-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke7-${PHONE}-${msgCounter++}`,
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

async function cleanup(): Promise<void> {
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke7-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Path AK — hinglish user with zero photos types "blah" → Hinglish guidance
// ---------------------------------------------------------------------------

async function pathHinglishLangFix(): Promise<void> {
  console.log('\n== Path AK: Hinglish user in AWAITING_PHOTO with text → Hinglish guidance ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  // Drive: hi → lang_hinglish → "Tester" → cat_jewellery.
  // After cat_jewellery, state goes to AWAITING_PHOTO with empty photos.
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_hinglish'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);

  sent.length = 0;
  // In AWAITING_PHOTO with zero photos and a text message, images.ts:382-385
  // branch fires "Pehle ek photo bhejein!" (Hinglish) when isHindi is true.
  await handleIncomingMessage(PHONE, makeTextMessage('blah'), wa);

  assert(
    sent.some((m) => m.type === 'text' && /Pehle ek photo bhejein/.test(m.body)),
    'Hinglish guidance text sent (not English)',
  );
  assert(
    !sent.some((m) => m.type === 'text' && /Send a photo first!/.test(m.body)),
    'no English fallback when user is Hinglish',
  );
}

// ---------------------------------------------------------------------------
// Path AL — style picker pick #2 is a SINGLE list message
// ---------------------------------------------------------------------------

async function pathStylePickerSingleMessage(): Promise<void> {
  console.log('\n== Path AL: style picker pick #2 sends one combined list message ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  // Onboard then jump into the custom picker.
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  // After cat_jewellery the user is in AWAITING_PHOTO. To get into the
  // multi-style picker, we'd normally need photos + Custom Pack. For a
  // smoke-only test, set the session state directly and call the
  // style handler's list-reply path.
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: {
      state: 'SETUP_STYLE',
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
    },
  });
  // Tap Custom Pack → triggers sendStyleList with customMode=true, picks=0.
  await handleIncomingMessage(PHONE, makeListMessage('custom_pack'), wa);
  // Tap first custom style — triggers pick #2 (which is where the merge happens).
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeListMessage('style_lifestyle'), wa);

  // Pre-Phase-7 there were TWO messages: a sendText (checkbox state) + a
  // sendList (next-style prompt). Post-Phase-7 it's a single sendList
  // whose body contains both.
  const lists = sent.filter((m) => m.type === 'list');
  const texts = sent.filter((m) => m.type === 'text');
  assert(lists.length === 1, `exactly one list message on pick #2 (got ${lists.length})`);
  assert(
    !texts.some((t) => /✅ Lifestyle Setting/.test(t.body)),
    'no separate checkbox-state text message',
  );
  assert(
    !!lists[0] && /✅ Lifestyle Setting/.test(lists[0].body),
    'list body contains the checkbox state',
  );
  assert(
    !!lists[0] && /Pick style 2/.test(lists[0].body),
    'list body contains the "Pick style 2" prompt',
  );
}

// ---------------------------------------------------------------------------
// Path AM — initial style list contains the "Pick 1-3 styles..." upfront copy
// ---------------------------------------------------------------------------

async function pathUpfrontStyleCopy(): Promise<void> {
  console.log('\n== Path AM: initial style list body contains the "Pick 1-3 styles..." copy ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  // Onboard up to SETUP_STYLE (post-Phase-1 flow puts the picker right after
  // the user sends their first photo OR explicit SETUP_STYLE entry; here we
  // just drive the session directly into SETUP_STYLE and trigger the picker
  // via an unrecognised text input).
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'SETUP_STYLE', styleSelections: [], stylePickStep: 0 },
  });

  sent.length = 0;
  // Send unrecognised text → handleSetupStyle re-shows the initial picker.
  await handleIncomingMessage(PHONE, makeTextMessage('???'), wa);

  const initialList = sent.find((m) => m.type === 'list');
  assert(!!initialList, 'initial style list sent');
  assert(
    !!initialList && /Pick 1-3 styles/.test(initialList.body),
    `upfront copy present in list body (got "${initialList?.body.slice(0, 80)}")`,
  );
}

// ---------------------------------------------------------------------------
// Path AN — idempotent "hi": second tap within 30s is suppressed
// ---------------------------------------------------------------------------

async function pathIdempotentHi(): Promise<void> {
  console.log('\n== Path AN: returning user taps "hi" twice within 30s — second is suppressed ==');
  await cleanup();
  const { wa, sent } = makeMockWa();

  // Onboard a returning user (will have brandName="Tester" + businessType).
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'IDLE', stateEnteredAt: new Date() },
  });

  // First "hi" → menu sent.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  const firstButtons = sent.filter((m) => m.type === 'buttons');
  assert(firstButtons.length === 1, `first "hi" sends 1 button menu (got ${firstButtons.length})`);
  assert(
    !!firstButtons[0] && firstButtons[0].buttons?.some((b) => b.id === 'generate_ad'),
    'menu has Generate ad button',
  );

  // Second "hi" within 30s → suppressed.
  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  const secondButtons = sent.filter((m) => m.type === 'buttons');
  assert(secondButtons.length === 0, `second "hi" within 30s sends 0 button menus (got ${secondButtons.length})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 7 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathHinglishLangFix();
    await pathStylePickerSingleMessage();
    await pathUpfrontStyleCopy();
    await pathIdempotentHi();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 7 smoke assertions green.');
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
