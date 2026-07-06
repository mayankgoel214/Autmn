#!/usr/bin/env tsx
/**
 * Phase 19 smoke — ONE-SHOT generation policy + cost recording.
 *
 * Rewritten 2026-07 when the business locked the one-shot rule: ONE Gemini
 * generation per image, delivered as-is; no tier 2, no LLM verifier, no
 * retry. These tests are the regression guard for that rule:
 *   V1. Built pipeline contains NO tier-2 / verifier / retry machinery.
 *   V2. One-shot failure path exists and classifies refunds as 'permanent'
 *       (immediate refund, no transient re-queue window).
 *   V3. Prompt builder supports exact label-text injection + tail reminder.
 *   V4. Order.actualCostInr column exists + accepts Decimal writes.
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
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2]!;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(resolve(import.meta.dirname, '../.env'));

const { prisma } = await import('../packages/db/dist/index.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${msg}`);
  }
}

const PHONE = `919955${String(Date.now()).slice(-7)}`;

async function cleanup(): Promise<void> {
  await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: PHONE } } }).catch(() => {});
  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  // The COST01 shortId is fixed but PHONE is timestamp-random: a run killed
  // mid-test strands a COST01 order under an old phone that per-phone cleanup
  // never matches, and every later run then dies on the short_id unique
  // constraint. Delete by shortId too so the script self-heals.
  await prisma.imageJob.deleteMany({ where: { order: { shortId: 'COST01' } } }).catch(() => {});
  await prisma.order.deleteMany({ where: { shortId: 'COST01' } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// V1 — the built pipeline has no second-attempt machinery
// ---------------------------------------------------------------------------

function pathOneShotEnforced(): void {
  console.log('\n== Path V1: built pipeline contains no tier-2 / verifier / retry ==');
  const dist = readFileSync(
    resolve(import.meta.dirname, '../packages/ai/dist/pipeline/production.js'),
    'utf-8',
  );
  assert(!dist.includes('gpt-image-2'), 'no gpt-image-2 tier in built pipeline');
  assert(!dist.includes('openaiGenerateImage'), 'no OpenAI generate call');
  assert(!dist.includes('runVerifierWithRetry'), 'no verifier-retry loop');
  assert(!dist.includes('verifyGeneration'), 'no LLM verifier call');
  assert(dist.includes('production_oneshot_failed'), 'one-shot failure event present');
}

// ---------------------------------------------------------------------------
// V2 — failures are permanent (immediate refund, no re-queue)
// ---------------------------------------------------------------------------

function pathPermanentRefund(): void {
  console.log('\n== Path V2: one-shot failures classify as permanent ==');
  const dist = readFileSync(
    resolve(import.meta.dirname, '../packages/ai/dist/pipeline/production.js'),
    'utf-8',
  );
  // The refund StyleResult hard-codes errorClass 'permanent' so the worker
  // refunds immediately instead of holding the order in a retry window.
  assert(/errorClass:\s*['"]permanent['"]/.test(dist), "refund errorClass hard-coded 'permanent'");
}

// ---------------------------------------------------------------------------
// V3 — prompt carries the fidelity upgrades
// ---------------------------------------------------------------------------

async function pathPromptFidelity(): Promise<void> {
  console.log('\n== Path V3: label-text injection + tail reminder in prompt ==');
  const { buildCreativePrompt } = await import('../packages/ai/dist/pipeline/prompt-builder.js');
  const prompt = buildCreativePrompt({
    style: 'style_clean_white',
    productCategory: 'food',
    productDescription: 'Cadbury Dairy Milk chocolate bar (purple, gold)',
    labelText: 'Cadbury | Dairy Milk',
    negativeConstraints: ['no humans'],
  });
  assert(prompt.includes('reads EXACTLY: "Cadbury | Dairy Milk"'), 'label text injected verbatim');
  assert(
    prompt.includes('character, word, and capitalization'),
    'character-for-character clause present',
  );
  assert(
    prompt.includes('Final reminder — the image must NOT contain: no humans'),
    'negatives recap at prompt tail',
  );
  assert(
    prompt.indexOf('PRIMARY OBJECTIVE') < prompt.indexOf('STYLE DIRECTION'),
    'fidelity section still precedes style direction',
  );

  const noLabel = buildCreativePrompt({ style: 'style_lifestyle', productCategory: 'jewellery' });
  assert(!noLabel.includes('reads EXACTLY'), 'no label clause when analyzer found no text');
}

// ---------------------------------------------------------------------------
// V4 — Order.actualCostInr accepts Decimal writes
// ---------------------------------------------------------------------------

async function pathCostColumn(): Promise<void> {
  console.log('\n== Path V4: Order.actualCostInr column accepts Decimal writes ==');
  await cleanup();
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: { name: 'CostTester' },
    create: { phoneNumber: PHONE, name: 'CostTester', language: 'en' },
  });
  const order = await prisma.order.create({
    data: {
      user: { connect: { id: user.id } },
      phoneNumber: PHONE,
      imageCount: 1,
      style: 'style_clean_white',
      status: 'processing',
      amount: 4900,
      amountPaise: 4900,
      shortId: 'COST01',
      inputImageUrls: ['https://example.com/in.jpg'],
    },
  });
  assert(order.actualCostInr === null, 'actualCostInr starts null');
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { actualCostInr: 13.5 as unknown as number },
  });
  assert(
    String(updated.actualCostInr) === '13.5',
    `actualCostInr writes round-trip (got ${updated.actualCostInr})`,
  );
  await cleanup();
}

async function main(): Promise<void> {
  console.log('Phase 19 smoke — one-shot policy + cost recording\n');
  try {
    pathOneShotEnforced();
    pathPermanentRefund();
    await pathPromptFidelity();
    await pathCostColumn();
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  if (failures > 0) {
    console.log(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nPASS — all Phase 19 smoke assertions green.');
}

main().catch(async (err) => {
  console.error('Smoke test crashed:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
