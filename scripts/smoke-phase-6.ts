#!/usr/bin/env tsx
/**
 * Phase 6 smoke test — FAQ matcher + IDLE/CHANGE_SETTINGS_MENU dispatcher.
 *
 * Unit checks:
 *   AF. matchFaqIntent classifies known phrases + returns null on garbage.
 *
 * Integration checks (drive handleIncomingMessage with the mock client):
 *   AG. Returning user in IDLE, types "how much?" → FAQ price reply + the
 *       returning-user 2-button menu both arrive.
 *   AH. Returning user in IDLE, types "asdfgh" → menu only (no FAQ text).
 *   AI. User in CHANGE_SETTINGS_MENU, types "refund" → FAQ refund reply + the
 *       settings list both arrive.
 *   AJ. User in SETUP_NAME types "price" → NO FAQ reply (Phase 6 is scoped
 *       to IDLE + CHANGE_SETTINGS_MENU only). Falls through to normal
 *       setup-name behaviour.
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
const { handleIncomingMessage, clearReturningMenuDedupe } = await import(
  '../packages/session/dist/index.js'
);
// matchFaqIntent isn't re-exported from session/index.ts (kept internal to the
// handler). Import directly from the compiled handler file.
const { matchFaqIntent } = await import('../packages/session/dist/handlers/faq.js');
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919994${String(Date.now()).slice(-7)}`;

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
    messageId: `smoke6-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke6-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
    timestamp: Date.now(),
  };
}
function makeListMessage(listReplyId: string): MessageContext {
  return {
    messageId: `smoke6-${PHONE}-${msgCounter++}`,
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
    where: { messageId: { startsWith: `smoke6-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  // Phase 7's returning-user-menu dedupe Map is process-local, so paths that
  // re-use the same phone within one smoke run would otherwise get their
  // second "hi" silently suppressed. Reset so each path starts clean.
  clearReturningMenuDedupe();
}

async function onboardThenForceIdle(wa: any): Promise<void> {
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);
  await handleIncomingMessage(PHONE, makeTextMessage('Tester'), wa);
  await handleIncomingMessage(PHONE, makeListMessage('cat_jewellery'), wa);
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { state: 'IDLE', stateEnteredAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Path AF — unit checks on matchFaqIntent
// ---------------------------------------------------------------------------

async function pathMatcherUnit(): Promise<void> {
  console.log('\n== Path AF: matchFaqIntent classifier ==');
  assert(matchFaqIntent('how much?') === 'price', `"how much?" -> price`);
  assert(matchFaqIntent('Rs 99 ka?') === 'price', `"Rs 99 ka?" -> price`);
  assert(matchFaqIntent('₹ kitna') === 'price', `"₹ kitna" -> price`);
  assert(matchFaqIntent('is this free?') === 'price', `"is this free?" -> price`);
  assert(matchFaqIntent('refund policy?') === 'refund', `"refund policy?" -> refund`);
  assert(matchFaqIntent('paise wapas milenge?') === 'refund', `"paise wapas..." -> refund`);
  assert(matchFaqIntent('how long does it take?') === 'turnaround', `"how long..." -> turnaround`);
  assert(matchFaqIntent('kab tak ready hoga') === 'turnaround', `"kab tak ready hoga" -> turnaround`);
  assert(matchFaqIntent('what is autmn?') === 'what', `"what is autmn?" -> what`);
  assert(matchFaqIntent('how does this work?') === 'what', `"how does this work?" -> what`);
  assert(matchFaqIntent('asdfghjkl') === null, `"asdfghjkl" -> null`);
  assert(matchFaqIntent('') === null, `empty string -> null`);
}

// ---------------------------------------------------------------------------
// Path AG — FAQ in IDLE (returning user) → reply + menu
// ---------------------------------------------------------------------------

async function pathFaqIdleReturning(): Promise<void> {
  console.log('\n== Path AG: returning user in IDLE asks "how much?" → FAQ + menu ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardThenForceIdle(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('how much?'), wa);

  assert(
    sent.some((m) => m.type === 'text' && /99|free|Rs/i.test(m.body)),
    'FAQ price reply sent',
  );
  const menuBtns = sent.find((m) => m.type === 'buttons');
  assert(!!menuBtns, 'returning-user 2-button menu sent');
  const ids = (menuBtns?.buttons ?? []).map((b) => b.id).sort();
  assert(
    JSON.stringify(ids) === JSON.stringify(['change_settings', 'generate_ad']),
    'menu has Generate ad + Change settings',
  );
}

// ---------------------------------------------------------------------------
// Path AH — non-FAQ text in IDLE → menu only
// ---------------------------------------------------------------------------

async function pathIdleNoMatch(): Promise<void> {
  console.log('\n== Path AH: returning user in IDLE types garbage → menu only, no FAQ ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardThenForceIdle(wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('asdfghjkl'), wa);

  // The returning-user menu body mentions "what would you like to do?", which
  // ALSO contains "what" — so we don't assert by the regex /what/. Instead we
  // check there's no FAQ-shaped reply (no price/refund/turnaround text).
  const faqMatchers = [/99/, /refund/i, /2-5 minutes/i, /WhatsApp pe|professional ad images/i];
  assert(
    !sent.some((m) => m.type === 'text' && faqMatchers.some((r) => r.test(m.body))),
    'no FAQ reply sent on garbage',
  );
  assert(sent.some((m) => m.type === 'buttons'), 'menu re-shown');
}

// ---------------------------------------------------------------------------
// Path AI — FAQ in CHANGE_SETTINGS_MENU → reply + settings list
// ---------------------------------------------------------------------------

async function pathFaqInChangeSettings(): Promise<void> {
  console.log('\n== Path AI: CHANGE_SETTINGS_MENU + "refund" → FAQ + settings list ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  await onboardThenForceIdle(wa);
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('change_settings'), wa);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('refund?'), wa);

  assert(
    sent.some((m) => m.type === 'text' && /refund/i.test(m.body)),
    'FAQ refund reply sent',
  );
  assert(sent.some((m) => m.type === 'list'), 'settings list re-shown');

  const s = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(s?.state === 'CHANGE_SETTINGS_MENU', `state stays CHANGE_SETTINGS_MENU (got ${s?.state})`);
}

// ---------------------------------------------------------------------------
// Path AJ — FAQ is NOT fired outside IDLE / CHANGE_SETTINGS_MENU
// ---------------------------------------------------------------------------

async function pathFaqOutOfScope(): Promise<void> {
  console.log('\n== Path AJ: SETUP_NAME + "price" → no FAQ reply, just brand re-prompt ==');
  await cleanup();
  const { wa, sent } = makeMockWa();
  // Drive a new user up to SETUP_NAME, then send "price" while still in
  // that state. The FAQ dispatcher must NOT fire here.
  await handleIncomingMessage(PHONE, makeTextMessage('hi'), wa);
  await handleIncomingMessage(PHONE, makeButtonMessage('lang_en'), wa);

  const sPre = await prisma.session.findUnique({ where: { phoneNumber: PHONE } });
  assert(sPre?.state === 'SETUP_NAME', `state SETUP_NAME before FAQ probe (got ${sPre?.state})`);

  sent.length = 0;
  await handleIncomingMessage(PHONE, makeTextMessage('how much?'), wa);

  // 'how much?' is a valid SETUP_NAME input (after sanitisation), so the user
  // gets brand name set to 'How much?' rather than a FAQ reply. The key
  // assertion is: NO Rs/99/free price text was sent.
  assert(
    !sent.some((m) => m.type === 'text' && /Rs 99|First one is free|Pehli baar bilkul/i.test(m.body)),
    'no FAQ price reply sent in SETUP_NAME',
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 6 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathMatcherUnit();
    await pathFaqIdleReturning();
    await pathIdleNoMatch();
    await pathFaqInChangeSettings();
    await pathFaqOutOfScope();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 6 smoke assertions green.');
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
