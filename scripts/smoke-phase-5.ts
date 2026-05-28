#!/usr/bin/env tsx
/**
 * Phase 5 smoke test — brand-context fetch + prompt injection.
 *
 * No image generation runs (would burn API quota). Instead we assert:
 *   - fetchBrandContextForUser returns the right shape for each profile state
 *   - buildBetaPrompt / buildRevisionPrompt include or omit the brand block
 *     based on the brandContext argument
 *
 * Paths:
 *   Y.  No user        → fetchBrandContextForUser returns undefined.
 *   Z.  User, no profile → undefined.
 *   AA. Empty profile  → undefined (no signal worth injecting).
 *   AB. Populated profile → BrandContext with tagline/vibe/colors/summary.
 *   AC. buildBetaPrompt without brandContext → no "Brand context" block.
 *   AD. buildBetaPrompt with brandContext → block lists tagline/vibe/colors/summary.
 *   AE. buildRevisionPrompt with brandContext → same block, original + revision blocks preserved.
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
const { fetchBrandContextForUser } = await import('../packages/session/dist/index.js');
const { buildBetaPrompt, buildRevisionPrompt } = await import('../packages/ai/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });

const PHONE = `919995${String(Date.now()).slice(-7)}`;

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
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
}

async function ensureUser(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { phoneNumber: PHONE },
    update: {},
    create: { phoneNumber: PHONE, language: 'en', name: 'Joyaa', brandName: 'Joyaa' },
  });
  return user.id;
}

// ---------------------------------------------------------------------------
// Path Y — no user
// ---------------------------------------------------------------------------

async function pathNoUser(): Promise<void> {
  console.log('\n== Path Y: no User → fetchBrandContextForUser returns undefined ==');
  await cleanup();
  const ctx = await fetchBrandContextForUser(PHONE);
  assert(ctx === undefined, `undefined for missing user (got ${JSON.stringify(ctx)})`);
}

// ---------------------------------------------------------------------------
// Path Z — user, no profile
// ---------------------------------------------------------------------------

async function pathUserNoProfile(): Promise<void> {
  console.log('\n== Path Z: user, no BrandProfile → undefined ==');
  await cleanup();
  await ensureUser();
  const ctx = await fetchBrandContextForUser(PHONE);
  assert(ctx === undefined, `undefined when no profile (got ${JSON.stringify(ctx)})`);
}

// ---------------------------------------------------------------------------
// Path AA — empty profile
// ---------------------------------------------------------------------------

async function pathEmptyProfile(): Promise<void> {
  console.log('\n== Path AA: empty BrandProfile → undefined ==');
  await cleanup();
  const userId = await ensureUser();
  await prisma.brandProfile.upsert({
    where: { userId },
    update: { summary: null, tagline: null, vibe: null, brandColors: [] },
    create: { userId, summary: null, tagline: null, vibe: null, brandColors: [] },
  });
  const ctx = await fetchBrandContextForUser(PHONE);
  assert(ctx === undefined, `undefined for an empty profile (got ${JSON.stringify(ctx)})`);
}

// ---------------------------------------------------------------------------
// Path AB — populated profile
// ---------------------------------------------------------------------------

async function pathPopulatedProfile(): Promise<void> {
  console.log('\n== Path AB: populated profile → structured BrandContext ==');
  await cleanup();
  const userId = await ensureUser();
  await prisma.brandProfile.upsert({
    where: { userId },
    update: {
      summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
      tagline: 'Modern heritage jewellery',
      vibe: 'minimalist luxury',
      brandColors: ['rose gold', 'ivory'],
    },
    create: {
      userId,
      summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
      tagline: 'Modern heritage jewellery',
      vibe: 'minimalist luxury',
      brandColors: ['rose gold', 'ivory'],
    },
  });

  const ctx = await fetchBrandContextForUser(PHONE);
  assert(!!ctx, 'context returned');
  assert(ctx?.tagline === 'Modern heritage jewellery', `tagline preserved (got "${ctx?.tagline}")`);
  assert(ctx?.vibe === 'minimalist luxury', `vibe preserved (got "${ctx?.vibe}")`);
  assert(
    JSON.stringify(ctx?.brandColors) === JSON.stringify(['rose gold', 'ivory']),
    `brandColors preserved (got ${JSON.stringify(ctx?.brandColors)})`,
  );
  assert(
    ctx?.summary?.startsWith('Joyaa makes'),
    `summary preserved (got "${ctx?.summary?.slice(0, 40)}")`,
  );
}

// ---------------------------------------------------------------------------
// Path AC — buildBetaPrompt without brandContext
// ---------------------------------------------------------------------------

async function pathPromptWithoutBrand(): Promise<void> {
  console.log('\n== Path AC: buildBetaPrompt WITHOUT brandContext → no brand block ==');
  const prompt = buildBetaPrompt(
    'style_clean_white',
    '',
    'shoot it on a marble surface',
    'cat_jewellery',
    undefined,
    'gold necklace with rubies',
    'Joyaa',
    undefined,
  );
  assert(
    !/Brand context/.test(prompt),
    'no "Brand context" section in the prompt when brandContext omitted',
  );
  assert(prompt.includes('Brand: Joyaa'), 'plain Brand: line still present');
  assert(prompt.includes('Style: Clean White Studio'), 'style line present');
}

// ---------------------------------------------------------------------------
// Path AD — buildBetaPrompt WITH brandContext
// ---------------------------------------------------------------------------

async function pathPromptWithBrand(): Promise<void> {
  console.log('\n== Path AD: buildBetaPrompt WITH brandContext → block includes signals ==');
  const ctx = {
    tagline: 'Modern heritage jewellery',
    vibe: 'minimalist luxury',
    brandColors: ['rose gold', 'ivory'],
    summary: 'Joyaa makes minimalist heritage jewellery for modern Indian brides.',
  };
  const prompt = buildBetaPrompt(
    'style_clean_white',
    '',
    'shoot it on a marble surface',
    'cat_jewellery',
    undefined,
    'gold necklace with rubies',
    'Joyaa',
    ctx,
  );
  assert(/Brand context/.test(prompt), 'block heading present');
  assert(/- Tagline: Modern heritage jewellery/.test(prompt), 'tagline injected');
  assert(/- Vibe: minimalist luxury/.test(prompt), 'vibe injected');
  assert(/- Brand colors: rose gold, ivory/.test(prompt), 'brandColors injected');
  assert(/- About: Joyaa makes minimalist/.test(prompt), 'summary injected');
}

// ---------------------------------------------------------------------------
// Path AE — buildRevisionPrompt WITH brandContext (regression on the existing
//           ORIGINAL CONSTRAINTS / REVISION FEEDBACK blocks)
// ---------------------------------------------------------------------------

async function pathRevisionWithBrand(): Promise<void> {
  console.log('\n== Path AE: buildRevisionPrompt WITH brandContext → block + revision intact ==');
  const ctx = {
    tagline: 'Modern heritage jewellery',
    vibe: 'minimalist luxury',
    brandColors: ['rose gold'],
  };
  const prompt = buildRevisionPrompt(
    'style_clean_white',
    'brighter background please',
    'on a marble surface',
    'cat_jewellery',
    undefined,
    'gold necklace',
    'Joyaa',
    ctx,
  );
  assert(/Brand context/.test(prompt), 'brand block injected');
  assert(/- Tagline: Modern heritage jewellery/.test(prompt), 'tagline injected');
  assert(/REVISION FEEDBACK/.test(prompt), 'REVISION FEEDBACK block preserved');
  assert(/brighter background please/.test(prompt), 'revision feedback text preserved');
  assert(/ORIGINAL CONSTRAINTS/.test(prompt), 'ORIGINAL CONSTRAINTS block preserved');
  assert(/on a marble surface/.test(prompt), 'original constraint text preserved');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Phase 5 smoke test — fake phone ${PHONE}\n`);
  try {
    await cleanup();
    await pathNoUser();
    await pathUserNoProfile();
    await pathEmptyProfile();
    await pathPopulatedProfile();
    await pathPromptWithoutBrand();
    await pathPromptWithBrand();
    await pathRevisionWithBrand();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failures === 0) {
    console.log('\nPASS — all Phase 5 smoke assertions green.');
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
