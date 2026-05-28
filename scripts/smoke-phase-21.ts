#!/usr/bin/env tsx
/**
 * Phase 21 smoke — negative-instruction extractor + edge-case flag plumbing.
 *
 * Paths:
 *   NE1. extractNegatives catches English "no X", "don't add X", "without X", "avoid X".
 *   NE2. extractNegatives catches Hinglish "X nahi", "mat do", "nahi chahiye".
 *   NE3. Empty / null / whitespace input → empty array (never throws).
 *   NE4. Duplicates deduped; output is hard-capped at 8.
 *   NE5. Phrases never exceed MAX_NEGATIVE_LENGTH chars.
 *   NE6. extractNegativesPerStyle wraps per-style mapping correctly.
 *   NE7. buildCreativePrompt renders extracted negatives in CRITICAL block.
 *   NE8. EDGE_CASE_RULES contains all 6 documented flags + buildEdgeCaseAddenda
 *        concatenates only the true ones.
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

const {
  extractNegatives,
  extractNegativesPerStyle,
  buildCreativePrompt,
  EDGE_CASE_RULES,
  buildEdgeCaseAddenda,
} = await import('../packages/ai/dist/index.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
}

function pathEnglishPatterns(): void {
  console.log('\n== Path NE1: English negative patterns ==');
  const text = 'Make it bright. No garnish, no steam. Don\'t add a model. Without props. Avoid background text.';
  const negs = extractNegatives(text);
  const flat = negs.join(' | ').toLowerCase();
  assert(/garnish/.test(flat), 'matched "no garnish"');
  assert(/steam/.test(flat), 'matched "no steam"');
  assert(/model/.test(flat), 'matched "don\'t add a model"');
  assert(/props/.test(flat), 'matched "without props"');
  assert(/background text/.test(flat), 'matched "avoid background text"');
}

function pathHinglishPatterns(): void {
  console.log('\n== Path NE2: Hinglish negative patterns ==');
  const text1 = 'Model nahi chahiye. Steam mat do. Background mein text nahi.';
  const negs = extractNegatives(text1);
  assert(negs.length > 0, `extracted at least one Hinglish negative (got ${negs.length})`);
  // Don't assert exact phrasing — regex returns "no <phrase>" with the noun
  // captured loosely. We just need *something* to surface so the prompt has
  // a CRITICAL NEGATIVE block.
}

function pathEmptyInputs(): void {
  console.log('\n== Path NE3: empty/null/whitespace → [] ==');
  assert(extractNegatives('').length === 0, 'empty string');
  assert(extractNegatives('   \n\t  ').length === 0, 'whitespace');
  assert(extractNegatives(undefined).length === 0, 'undefined');
  assert(extractNegatives(null).length === 0, 'null');
  assert(extractNegatives('Just a normal instruction with no negatives needed.').length >= 0, 'no patterns → some or none, but no crash');
}

function pathDedupeCap(): void {
  console.log('\n== Path NE4: dedupe + 8-entry hard cap ==');
  const repeated = Array(20).fill('no garnish').join('. ');
  const negs = extractNegatives(repeated);
  assert(negs.length <= 8, `at most 8 entries (got ${negs.length})`);
  // Dedupe — even 20 "no garnish" should reduce to 1.
  assert(new Set(negs).size === negs.length, 'no duplicates');
}

function pathLengthCap(): void {
  console.log('\n== Path NE5: phrase length cap ==');
  const long = `no ${'a'.repeat(200)}`;
  const negs = extractNegatives(long);
  for (const n of negs) {
    assert(n.length <= 60, `phrase ≤ 60 chars (got ${n.length})`);
  }
}

function pathPerStyleWrapper(): void {
  console.log('\n== Path NE6: extractNegativesPerStyle wraps per-style mapping ==');
  const perStyle = {
    style_clean_white: 'no garnish',
    style_studio: 'don\'t add a model',
    style_lifestyle: null,
  };
  const out = extractNegativesPerStyle(perStyle);
  assert(out['style_clean_white'].length > 0, 'first style has extracted negs');
  assert(out['style_studio'].length > 0, 'second style has extracted negs');
  assert(out['style_lifestyle'].length === 0, 'null input → []');
}

function pathPromptIntegration(): void {
  console.log('\n== Path NE7: buildCreativePrompt renders negatives in CRITICAL block ==');
  const prompt = buildCreativePrompt({
    style: 'style_lifestyle',
    productCategory: 'food',
    negativeConstraints: ['no garnish', 'no steam'],
  });
  assert(/CRITICAL NEGATIVE CONSTRAINTS/.test(prompt), 'CRITICAL block present');
  assert(/- no garnish/.test(prompt), 'no garnish listed');
  assert(/- no steam/.test(prompt), 'no steam listed');
}

function pathEdgeCaseRules(): void {
  console.log('\n== Path NE8: EDGE_CASE_RULES + buildEdgeCaseAddenda ==');
  const expectedKeys = [
    'isTransparent',
    'isReflectiveMetal',
    'hasEmbroidery',
    'isLowContrastVsBackground',
    'hasTextOrLogo',
    'isTinyProduct',
  ];
  for (const key of expectedKeys) {
    assert(typeof EDGE_CASE_RULES[key] === 'string', `EDGE_CASE_RULES.${key} present`);
  }
  const noFlags = buildEdgeCaseAddenda(undefined);
  assert(noFlags === '', 'no flags → empty');
  const oneFlag = buildEdgeCaseAddenda({ isTransparent: true });
  assert(/transparency/i.test(oneFlag), 'true flag includes its rule');
  assert(!/embroidery/i.test(oneFlag), 'false flag excluded');
  const allFalse = buildEdgeCaseAddenda({
    isTransparent: false,
    hasTextOrLogo: false,
  });
  assert(allFalse === '', 'all false → empty');
}

async function main(): Promise<void> {
  console.log('Phase 21 smoke — negative extractor + edge-case plumbing\n');
  pathEnglishPatterns();
  pathHinglishPatterns();
  pathEmptyInputs();
  pathDedupeCap();
  pathLengthCap();
  pathPerStyleWrapper();
  pathPromptIntegration();
  pathEdgeCaseRules();
  if (failures === 0) {
    console.log('\nPASS — all Phase 21 smoke assertions green.');
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
