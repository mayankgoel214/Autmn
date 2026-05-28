#!/usr/bin/env tsx
/**
 * Phase 8 smoke — data model expansion + edit removal.
 *
 * Verifies:
 *   AS. New Order columns exist + accept writes (amountPaise, isFirstFree,
 *       numStylesPicked, rating, refund*).
 *   AT. New Session columns exist (pendingInstructions, pendingMapping).
 *   AW. ButtonIds no longer expose FEEDBACK_CHANGE / FEEDBACK_REDO / EDIT_* /
 *       REDO_STYLE_* / CHANGE_SOMETHING (compile-time absence, double-checked
 *       at runtime via the exported constant).
 *
 * NOTE: Phase 8 originally also asserted FEEDBACK_GREAT (save-and-finish) and
 * numbered "1"/"2" text-menu navigation. Phase 14 replaced that menu wholesale
 * with the 5⭐ rating list + send_new_product + request_refund rows, so those
 * paths (AU and AV) were dropped. Their replacements are covered by
 * smoke-phase-14.ts (paths BH/BI/BJ/BK).
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
const { handleIncomingMessage, clearReturningMenuDedupe, ButtonIds } = await import(
  '../packages/session/dist/index.js'
);
type MessageContext = import('../packages/session/dist/index.js').MessageContext;

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919991${String(Date.now()).slice(-7)}`;

interface SentMessage {
  type: 'text' | 'buttons' | 'list' | 'image' | 'paymentLink';
  body: string;
  buttons?: Array<{ id: string; title: string }>;
}

function makeMockWa() {
  const sent: SentMessage[] = [];
  const wa = {
    sendText: async (_p: string, body: string) => sent.push({ type: 'text', body }),
    sendButtons: async (_p: string, body: string, buttons: Array<{ id: string; title: string }>) =>
      sent.push({ type: 'buttons', body, buttons }),
    sendList: async (_p: string, body: string) => sent.push({ type: 'list', body }),
    sendImage: async (_p: string, _u: string, caption?: string) =>
      sent.push({ type: 'image', body: caption ?? '' }),
    sendPaymentLink: async (_p: string, body: string) =>
      sent.push({ type: 'paymentLink', body }),
    markAsRead: async (_id: string) => {},
  };
  return { wa: wa as any, sent };
}

let msgCounter = 0;
function makeTextMessage(text: string): MessageContext {
  return {
    messageId: `smoke8-${PHONE}-${msgCounter++}`,
    messageType: 'text',
    text,
    timestamp: Date.now(),
  };
}
function makeButtonMessage(buttonReplyId: string): MessageContext {
  return {
    messageId: `smoke8-${PHONE}-${msgCounter++}`,
    messageType: 'interactive',
    buttonReplyId,
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
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage.deleteMany({
    where: { messageId: { startsWith: `smoke8-${PHONE}-` } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  clearReturningMenuDedupe();
}

async function seedDeliveredOrder(): Promise<{ userId: string; orderId: string }> {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: {
      brandName: 'Tester',
      name: 'Tester',
      businessType: 'cat_jewellery',
      language: 'en',
      orderCount: 1,
    },
    create: {
      phoneNumber: PHONE,
      brandName: 'Tester',
      name: 'Tester',
      businessType: 'cat_jewellery',
      language: 'en',
      orderCount: 1,
    },
  });
  const order = await prisma.order.create({
    data: {
      phoneNumber: PHONE,
      imageCount: 1,
      style: 'style_clean_white',
      stylesOrdered: ['style_clean_white', 'style_studio', 'style_lifestyle'],
      outputStyleCount: 3,
      inputImageUrls: ['https://example.com/photo.jpg'],
      outputImageUrls: [
        'https://example.com/out1.jpg',
        'https://example.com/out2.jpg',
        'https://example.com/out3.jpg',
      ],
      status: 'completed',
      amount: 0,
      productCategory: 'cat_jewellery',
      userId: user.id,
    },
  });
  await prisma.session.upsert({
    where: { phoneNumber: PHONE },
    update: {
      state: 'DELIVERED',
      currentOrderId: order.id,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
    create: {
      phoneNumber: PHONE,
      state: 'DELIVERED',
      currentOrderId: order.id,
      userId: user.id,
      stateEnteredAt: new Date(),
    },
  });
  return { userId: user.id, orderId: order.id };
}

// ---------------------------------------------------------------------------
// Path AS — new Order columns
// ---------------------------------------------------------------------------

async function pathOrderColumns(): Promise<void> {
  console.log('\n== Path AS: new Order columns exist + writeable ==');
  await cleanup();
  const { orderId } = await seedDeliveredOrder();

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      numStylesPicked: 2,
      amountPaise: 9800,
      isFirstFree: true,
      instructionMappingJson: { perPosition: [], global: 'test' },
      refundReason: 'photos are blurry',
      refundReasonVoiceUrl: 'https://example.com/voice.ogg',
      refundRequestedAt: new Date(),
      refundStatus: 'pending',
      rating: 4,
      ratedAt: new Date(),
    },
  });

  assert(updated.numStylesPicked === 2, `numStylesPicked=2 (got ${updated.numStylesPicked})`);
  assert(updated.amountPaise === 9800, `amountPaise=9800 (got ${updated.amountPaise})`);
  assert(updated.isFirstFree === true, `isFirstFree=true (got ${updated.isFirstFree})`);
  const mapping = updated.instructionMappingJson as { global?: string };
  assert(mapping?.global === 'test', `instructionMappingJson preserved (got ${mapping?.global})`);
  assert(updated.refundStatus === 'pending', `refundStatus=pending (got ${updated.refundStatus})`);
  assert(updated.rating === 4, `rating=4 (got ${updated.rating})`);
  assert(updated.ratedAt instanceof Date, 'ratedAt set');
}

// ---------------------------------------------------------------------------
// Path AT — new Session columns
// ---------------------------------------------------------------------------

async function pathSessionColumns(): Promise<void> {
  console.log('\n== Path AT: new Session columns exist + writeable ==');
  await cleanup();
  await seedDeliveredOrder();

  const updated = await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: {
      pendingInstructions: 'make autmn special blue, rest red',
      pendingInstructionsVoiceUrl: 'https://example.com/instr.ogg',
      pendingMapping: { perPosition: [{ position: 0, instructions: 'blue' }] },
    },
  });

  assert(
    updated.pendingInstructions === 'make autmn special blue, rest red',
    'pendingInstructions written',
  );
  assert(
    updated.pendingInstructionsVoiceUrl === 'https://example.com/instr.ogg',
    'pendingInstructionsVoiceUrl written',
  );
  const mapping = updated.pendingMapping as { perPosition?: any[] };
  assert(
    Array.isArray(mapping?.perPosition) && mapping.perPosition.length === 1,
    'pendingMapping JSON preserved',
  );
}

// ---------------------------------------------------------------------------
// Path AU — FEEDBACK_GREAT button still triggers Save & finish
// ---------------------------------------------------------------------------

// Paths AU and AV (FEEDBACK_GREAT save-and-finish + typed "1"/"2" numbered
// menu) were superseded by the Phase 14 delivery rebuild — see header comment.
// Their replacements live in smoke-phase-14.ts.

// ---------------------------------------------------------------------------
// Path AW — removed ButtonIds aren't exposed
// ---------------------------------------------------------------------------

async function pathButtonIdsScrubbed(): Promise<void> {
  console.log('\n== Path AW: edit-related ButtonIds removed ==');
  const removed = [
    'FEEDBACK_CHANGE',
    'FEEDBACK_REDO',
    'EDIT_BACKGROUND',
    'EDIT_LIGHTING',
    'EDIT_STYLE',
    'EDIT_CROP',
    'EDIT_OTHER',
    'REDO_STYLE_0',
    'REDO_STYLE_1',
    'REDO_STYLE_2',
    'CHANGE_SOMETHING',
  ];
  for (const key of removed) {
    assert(
      !(key in (ButtonIds as any)),
      `ButtonIds.${key} removed`,
    );
  }
  // Survivors
  assert((ButtonIds as any).FEEDBACK_GREAT === 'feedback_great', 'FEEDBACK_GREAT kept');
  assert((ButtonIds as any).GENERATE_AD === 'generate_ad', 'GENERATE_AD (Phase 2) kept');
  assert((ButtonIds as any).EDIT_BRAND === 'edit_brand', 'EDIT_BRAND (Phase 4) kept');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 8 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathOrderColumns();
    await pathSessionColumns();
    await pathButtonIdsScrubbed();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 8 smoke assertions green.');
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
