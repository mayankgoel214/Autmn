#!/usr/bin/env tsx
/**
 * Phase 18 smoke — hierarchical prompt builder + category rules.
 *
 * Pure unit-level tests against the new builders. No model calls, no DB.
 *
 * Paths:
 *   PB1. buildCreativePrompt emits all 6 mandatory sections in the locked order
 *        (PRIMARY OBJECTIVE → CRITICAL NEGATIVE → BRAND → CATEGORY → USER → STYLE → ASPECT).
 *   PB2. Empty optional sections are SUPPRESSED (no empty headers).
 *   PB3. Category rule is selected by normaliseCategory (food / cat_food both resolve to "food").
 *   PB4. Edge-case flags append to category body.
 *   PB5. Negative constraints surface in the CRITICAL NEGATIVE block as a "- " list.
 *   PB6. Brand context block renders tagline/vibe/palette/summary lines.
 *   PB7. style_anything_you_want routes through buildAnythingYouWantCreativePrompt
 *        (USER-DESCRIBED SCENE block, no STYLE DIRECTION block).
 *   PB8. Empty user description for anything-you-want still ships a fallback.
 *   PB9. LightAnalysisSchema accepts edge-case flag fields and defaults them to false.
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

const { buildCreativePrompt, buildAnythingYouWantCreativePrompt } = await import(
  '../packages/ai/dist/pipeline/prompt-builder.js'
);
const { normaliseCategory, getCategoryRule, CATEGORY_RULES } = await import(
  '../packages/ai/dist/pipeline/category-rules.js'
);
const { LightAnalysisSchema } = await import(
  '../packages/ai/dist/pipeline/light-analyzer.js'
);

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
}

function pathSectionOrder(): void {
  console.log('\n== Path PB1: section order matches the locked hierarchy ==');
  const p = buildCreativePrompt({
    style: 'style_studio',
    productCategory: 'jewellery',
    productDescription: 'gold kundan necklace',
    brandName: 'Riya Boutique',
    brandContext: { tagline: 'Heritage in every piece', vibe: 'royal elegance' },
    userInstructions: 'pair with maroon background',
    negativeConstraints: ['no model', 'no text overlay'],
  });
  const order = [
    'PRIMARY OBJECTIVE',
    'CRITICAL NEGATIVE CONSTRAINTS',
    'BRAND CONTEXT',
    'PRODUCT CATEGORY',
    'USER INSTRUCTIONS FOR THIS POSITION',
    'STYLE DIRECTION',
    'ASPECT + COMPOSITION',
  ];
  let lastIdx = -1;
  for (const header of order) {
    const idx = p.indexOf(header);
    assert(idx > lastIdx, `${header} appears after the previous (idx ${idx})`);
    lastIdx = idx;
  }
}

function pathEmptySectionsSuppressed(): void {
  console.log('\n== Path PB2: empty sections suppressed ==');
  const p = buildCreativePrompt({
    style: 'style_clean_white',
    productCategory: 'general',
    // No brand, no negatives, no user instructions.
  });
  assert(!p.includes('CRITICAL NEGATIVE CONSTRAINTS'), 'no negatives → no negatives header');
  assert(!p.includes('BRAND CONTEXT'), 'no brand → no brand header');
  assert(!p.includes('USER INSTRUCTIONS FOR THIS POSITION'), 'no user instr → no user header');
  // PRIMARY OBJECTIVE / PRODUCT CATEGORY / STYLE DIRECTION / ASPECT must always appear.
  assert(p.includes('PRIMARY OBJECTIVE'), 'PRIMARY OBJECTIVE always present');
  assert(p.includes('PRODUCT CATEGORY'), 'PRODUCT CATEGORY always present');
  assert(p.includes('STYLE DIRECTION'), 'STYLE DIRECTION always present');
  assert(p.includes('ASPECT + COMPOSITION'), 'ASPECT + COMPOSITION always present');
}

function pathCategoryNormalisation(): void {
  console.log('\n== Path PB3: normaliseCategory accepts schema + ListIds forms ==');
  assert(normaliseCategory('food') === 'food', 'plain → key');
  assert(normaliseCategory('cat_food') === 'food', 'cat_ prefix stripped');
  assert(normaliseCategory('jewelry') === 'jewellery', 'jewelry alias');
  assert(normaliseCategory('clothing') === 'garment', 'clothing → garment alias');
  assert(normaliseCategory('cosmetics') === 'skincare', 'cosmetics → skincare alias');
  assert(normaliseCategory('mystery') === 'general', 'unknown → general fallback');
  assert(normaliseCategory(undefined) === 'general', 'undefined → general');
  assert(getCategoryRule('food').includes('Plating'), 'rule body returned for food');
  assert(CATEGORY_RULES['general'].length > 0, 'general rule non-empty');
}

function pathEdgeCaseFlags(): void {
  console.log('\n== Path PB4: edge-case flags append to category body ==');
  const p = buildCreativePrompt({
    style: 'style_studio',
    productCategory: 'skincare',
    edgeCaseFlags: { isTransparent: true, hasTextOrLogo: true },
  });
  assert(/PRODUCT CATEGORY[\s\S]*Preserve transparency/.test(p), 'transparency rule after category header');
  assert(/Preserve all text and logos/i.test(p), 'text/logo rule appended');
  assert(!/Macro composition/.test(p), 'unselected flag not present');
}

function pathNegativesBlock(): void {
  console.log('\n== Path PB5: negative constraints rendered as a "- " list ==');
  const p = buildCreativePrompt({
    style: 'style_lifestyle',
    productCategory: 'food',
    negativeConstraints: ['no garnish', 'no steam', '  no hands  '],
  });
  assert(/- no garnish/.test(p), 'first negative listed');
  assert(/- no steam/.test(p), 'second negative listed');
  assert(/- no hands/.test(p), 'whitespace trimmed in negatives');
  assert(/MUST NOT APPEAR/.test(p), 'block heading present');
}

function pathBrandBlock(): void {
  console.log('\n== Path PB6: brand context block renders all four sub-fields ==');
  const p = buildCreativePrompt({
    style: 'style_studio',
    brandContext: {
      tagline: 'Heritage in every piece',
      vibe: 'royal elegance',
      brandColors: ['#9C1B1B', 'gold'],
      summary: 'Riya Boutique is a 30-year jewellery house from Jaipur known for kundan and polki work.',
    },
  });
  assert(/Tagline: Heritage in every piece/.test(p), 'tagline');
  assert(/Vibe: royal elegance/.test(p), 'vibe');
  assert(/Brand colors: #9C1B1B, gold/.test(p), 'colors');
  assert(/About: Riya Boutique/.test(p), 'summary');
}

function pathAnythingYouWantRoute(): void {
  console.log('\n== Path PB7: anything-you-want uses USER-DESCRIBED SCENE, no STYLE DIRECTION ==');
  const description = 'A neon-lit Tokyo arcade at midnight, product floating in front of an arcade cabinet';
  const p = buildAnythingYouWantCreativePrompt({
    style: 'style_anything_you_want',
    productCategory: 'electronics',
    productDescription: 'wireless earbuds',
    userInstructions: description,
  });
  assert(p.includes('USER-DESCRIBED SCENE'), 'user-described scene block present');
  assert(p.includes(description), 'user description appears verbatim');
  assert(!p.includes('STYLE DIRECTION'), 'no templated STYLE DIRECTION header');
}

function pathAnythingYouWantFallback(): void {
  console.log('\n== Path PB8: empty anything-you-want description still ships a prompt ==');
  const p = buildAnythingYouWantCreativePrompt({
    style: 'style_anything_you_want',
    productCategory: 'general',
  });
  assert(p.length > 300, `prompt non-trivial length (${p.length})`);
  assert(/tasteful modern aesthetic|provided no description/i.test(p), 'fallback hint surfaces');
}

function pathLightAnalysisSchema(): void {
  console.log('\n== Path PB9: LightAnalysisSchema accepts + defaults the new edge-case flags ==');
  const minimal = LightAnalysisSchema.parse({
    productName: 'gold necklace',
    productCategory: 'jewellery',
    hasBranding: false,
    physicalSize: 'medium',
    dominantColors: ['gold'],
    typicalSetting: 'jewellery store',
    usable: true,
    itemCount: 1,
    items: ['gold necklace'],
    setDescription: null,
    // edge-case flags intentionally omitted — schema should default them.
  });
  assert(minimal.isTransparent === false, 'isTransparent defaults false');
  assert(minimal.isReflectiveMetal === false, 'isReflectiveMetal defaults false');
  assert(minimal.hasEmbroidery === false, 'hasEmbroidery defaults false');
  assert(minimal.isLowContrastVsBackground === false, 'isLowContrastVsBackground defaults false');
  assert(minimal.hasTextOrLogo === false, 'hasTextOrLogo defaults false');
  assert(minimal.isTinyProduct === false, 'isTinyProduct defaults false');

  const full = LightAnalysisSchema.parse({
    productName: 'kombucha bottle',
    productCategory: 'food',
    hasBranding: true,
    physicalSize: 'small',
    dominantColors: ['amber', 'cyan'],
    typicalSetting: 'fridge shelf',
    usable: true,
    itemCount: 1,
    items: ['kombucha bottle'],
    setDescription: null,
    isTransparent: true,
    isReflectiveMetal: false,
    hasEmbroidery: false,
    isLowContrastVsBackground: false,
    hasTextOrLogo: true,
    isTinyProduct: false,
  });
  assert(full.isTransparent === true, 'isTransparent accepted true');
  assert(full.hasTextOrLogo === true, 'hasTextOrLogo accepted true');
}

async function main(): Promise<void> {
  console.log('Phase 18 smoke — hierarchical prompt builder + category rules\n');
  pathSectionOrder();
  pathEmptySectionsSuppressed();
  pathCategoryNormalisation();
  pathEdgeCaseFlags();
  pathNegativesBlock();
  pathBrandBlock();
  pathAnythingYouWantRoute();
  pathAnythingYouWantFallback();
  pathLightAnalysisSchema();
  if (failures === 0) {
    console.log('\nPASS — all Phase 18 smoke assertions green.');
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
