#!/usr/bin/env tsx
/**
 * Phase 11 smoke — position-based instruction mapping.
 *
 * Paths:
 *   BX. N === M (3 instructions, 3 styles) → 1:1 zip, no flags.
 *   BY. N < M (2 instructions, 3 styles)  → broadcast last; broadcasted=true.
 *   BZ. N > M (5 instructions, 3 styles)  → fold extras into last with " | ";
 *                                            collapsed=true.
 *   CA. N === 0 or all-empty               → empty perStyle map, no flags.
 *   CB. Trimming + empty-string filtering — "  foo  " is normalised.
 *   CC. Anything-You-Want in styles list   → mapped identically (no special
 *                                            casing required at the mapping
 *                                            layer; downstream prompt builder
 *                                            handles the difference).
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

const { mapInstructionsByPosition } = await import('../packages/session/dist/index.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Path BX — N === M zip
// ---------------------------------------------------------------------------

function pathEqualLengths(): void {
  console.log('\n== Path BX: N === M (3, 3) → 1:1 zip ==');
  const result = mapInstructionsByPosition(
    ['white background', 'studio with shadow', 'futuristic cyberpunk'],
    ['style_clean_white', 'style_studio', 'style_anything_you_want'],
  );
  assert(result.perStyle['style_clean_white'] === 'white background', 'pos 0');
  assert(result.perStyle['style_studio'] === 'studio with shadow', 'pos 1');
  assert(result.perStyle['style_anything_you_want'] === 'futuristic cyberpunk', 'pos 2');
  assert(result.broadcasted === false, 'broadcasted=false on equal lengths');
  assert(result.collapsed === false, 'collapsed=false on equal lengths');
}

// ---------------------------------------------------------------------------
// Path BY — N < M broadcast
// ---------------------------------------------------------------------------

function pathBroadcastLast(): void {
  console.log('\n== Path BY: N < M (2, 3) → broadcast last ==');
  const result = mapInstructionsByPosition(
    ['minimal aesthetic', 'pastel pink bg'],
    ['style_clean_white', 'style_studio', 'style_lifestyle'],
  );
  assert(result.perStyle['style_clean_white'] === 'minimal aesthetic', 'pos 0 unchanged');
  assert(result.perStyle['style_studio'] === 'pastel pink bg', 'pos 1 unchanged');
  assert(
    result.perStyle['style_lifestyle'] === 'pastel pink bg',
    `pos 2 broadcast from pos 1 (got ${result.perStyle['style_lifestyle']})`,
  );
  assert(result.broadcasted === true, 'broadcasted=true');
  assert(result.collapsed === false, 'collapsed=false');
}

// ---------------------------------------------------------------------------
// Path BZ — N > M collapse
// ---------------------------------------------------------------------------

function pathCollapseExtras(): void {
  console.log('\n== Path BZ: N > M (5, 3) → fold extras into last ==');
  const result = mapInstructionsByPosition(
    ['clean', 'studio', 'lifestyle', 'extra4', 'extra5'],
    ['style_clean_white', 'style_studio', 'style_lifestyle'],
  );
  assert(result.perStyle['style_clean_white'] === 'clean', 'pos 0');
  assert(result.perStyle['style_studio'] === 'studio', 'pos 1');
  assert(
    result.perStyle['style_lifestyle'] === 'lifestyle | extra4 | extra5',
    `pos 2 collapsed (got ${result.perStyle['style_lifestyle']})`,
  );
  assert(result.broadcasted === false, 'broadcasted=false on collapse');
  assert(result.collapsed === true, 'collapsed=true');
}

// ---------------------------------------------------------------------------
// Path CA — empty inputs
// ---------------------------------------------------------------------------

function pathEmptyInputs(): void {
  console.log('\n== Path CA: empty or all-whitespace inputs → empty perStyle ==');
  const r1 = mapInstructionsByPosition([], ['style_clean_white', 'style_studio']);
  assert(Object.keys(r1.perStyle).length === 0, 'no styles mapped when N=0');
  assert(r1.broadcasted === false && r1.collapsed === false, 'flags clean');

  const r2 = mapInstructionsByPosition(['', '   '], ['style_clean_white']);
  assert(Object.keys(r2.perStyle).length === 0, 'whitespace-only entries filtered out');

  const r3 = mapInstructionsByPosition(['x'], []);
  assert(Object.keys(r3.perStyle).length === 0, 'empty styles list short-circuits');
}

// ---------------------------------------------------------------------------
// Path CB — trimming
// ---------------------------------------------------------------------------

function pathTrimming(): void {
  console.log('\n== Path CB: leading/trailing whitespace is trimmed ==');
  const r = mapInstructionsByPosition(
    ['  white bg  ', '\tstudio\n'],
    ['style_clean_white', 'style_studio'],
  );
  assert(r.perStyle['style_clean_white'] === 'white bg', 'leading/trailing trimmed (pos 0)');
  assert(r.perStyle['style_studio'] === 'studio', 'tabs/newlines trimmed (pos 1)');
}

// ---------------------------------------------------------------------------
// Path CC — anything-you-want is mapped identically
// ---------------------------------------------------------------------------

function pathAnythingYouWantMapping(): void {
  console.log('\n== Path CC: anything-you-want behaves like any other style position ==');
  const r = mapInstructionsByPosition(
    ['classic e-commerce', 'A neon-lit Tokyo arcade at midnight', 'colourful studio'],
    ['style_clean_white', 'style_anything_you_want', 'style_studio'],
  );
  assert(
    r.perStyle['style_anything_you_want'] === 'A neon-lit Tokyo arcade at midnight',
    `description routed to anything-you-want slot (got ${r.perStyle['style_anything_you_want']})`,
  );
  assert(
    r.perStyle['style_clean_white'] === 'classic e-commerce',
    'neighbour position untouched',
  );
}

async function main(): Promise<void> {
  console.log('Phase 11 smoke test — Position-based instruction mapping\n');
  pathEqualLengths();
  pathBroadcastLast();
  pathCollapseExtras();
  pathEmptyInputs();
  pathTrimming();
  pathAnythingYouWantMapping();
  if (failures === 0) {
    console.log('\nPASS — all Phase 11 smoke assertions green.');
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
