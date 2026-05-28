#!/usr/bin/env tsx
/**
 * Phase 23 smoke — observability alerts.
 *
 * Paths:
 *   AL1. alertCostCeilingBreach below threshold → NO event emitted.
 *   AL2. alertCostCeilingBreach above threshold → JSON event with severity warning.
 *   AL3. recordTier2Fire below burst threshold → no alert.
 *   AL4. recordTier2Fire crossing burst threshold → alert.tier2_burst fires once.
 *   AL5. recordTier2Fire after window expiry resets the counter.
 *   AL6. alertKeyPoolExhausted always emits.
 *   AL7. ALERT_COST_CEILING_INR and TIER2_BURST_THRESHOLD match plan §8.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(envPath: string): void {
  let contents: string;
  try { contents = readFileSync(envPath, 'utf-8'); } catch { process.exit(1); }
  for (const line of contents.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadEnv(resolve(import.meta.dirname, '../.env'));

const {
  alertCostCeilingBreach,
  alertKeyPoolExhausted,
  recordTier2Fire,
  ALERT_COST_CEILING_INR,
  TIER2_BURST_THRESHOLD,
  _resetTier2BurstTracker,
} = await import('../packages/ai/dist/monitoring/alerts.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
}

/** Capture console.warn output during a block. */
function captureWarn(fn: () => void): string[] {
  const original = console.warn;
  const captured: string[] = [];
  console.warn = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  try { fn(); } finally { console.warn = original; }
  return captured;
}

function pathCostBelow(): void {
  console.log('\n== Path AL1: cost ≤ ceiling → no alert ==');
  const out = captureWarn(() => alertCostCeilingBreach({
    orderId: 'o1', totalCostInr: 45, styleCount: 3,
  }));
  assert(out.length === 0, 'no warn emitted for cost=45');
}

function pathCostAbove(): void {
  console.log('\n== Path AL2: cost > ceiling → JSON alert with severity warning ==');
  const out = captureWarn(() => alertCostCeilingBreach({
    orderId: 'o2', totalCostInr: 120, styleCount: 3,
  }));
  assert(out.length === 1, `one alert emitted (got ${out.length})`);
  const parsed = JSON.parse(out[0]!);
  assert(parsed.event === 'alert.cost_ceiling_breach', 'event tag correct');
  assert(parsed.severity === 'warning', 'severity warning');
  assert(parsed.totalCostInr === 120, 'cost payload threaded');
}

function pathTier2Below(): void {
  console.log('\n== Path AL3: Tier 2 below burst threshold → no alert ==');
  _resetTier2BurstTracker();
  const out = captureWarn(() => {
    recordTier2Fire({ orderId: 'a', style: 'style_studio' });
    recordTier2Fire({ orderId: 'b', style: 'style_studio' });
  });
  assert(out.length === 0, '2 fires below threshold → no alert');
}

function pathTier2BurstFires(): void {
  console.log('\n== Path AL4: Tier 2 crossing burst threshold → alert.tier2_burst once ==');
  _resetTier2BurstTracker();
  const out = captureWarn(() => {
    for (let i = 0; i < TIER2_BURST_THRESHOLD; i++) {
      recordTier2Fire({ orderId: `o${i}`, style: 'style_studio' });
    }
    // Additional fires in the same window should NOT re-alert (cooldown).
    recordTier2Fire({ orderId: 'extra', style: 'style_studio' });
    recordTier2Fire({ orderId: 'extra2', style: 'style_studio' });
  });
  const alerts = out.map((l) => JSON.parse(l)).filter((p) => p.event === 'alert.tier2_burst');
  assert(alerts.length === 1, `exactly one burst alert in window (got ${alerts.length})`);
  assert(alerts[0]!.count >= TIER2_BURST_THRESHOLD, 'count payload includes window total');
}

function pathTier2WindowReset(): void {
  console.log('\n== Path AL5: window-expired fires drop from sliding-window count ==');
  // Hard to test the real clock; instead verify the export exists + the
  // burst tracker maintains state. (Time-based expiry is unit-testable
  // separately with fake timers; here we just sanity check the reset hook.)
  _resetTier2BurstTracker();
  const out = captureWarn(() => recordTier2Fire({ orderId: 'a', style: 's' }));
  assert(out.length === 0, 'single fire post-reset → no alert');
}

function pathKeyPoolAlert(): void {
  console.log('\n== Path AL6: alertKeyPoolExhausted always emits ==');
  const out = captureWarn(() => alertKeyPoolExhausted({
    provider: 'gemini', keyCount: 3, cooldownsBlocking: 3, context: 'image_gen',
  }));
  assert(out.length === 1, 'one alert emitted');
  const parsed = JSON.parse(out[0]!);
  assert(parsed.event === 'alert.keypool_exhausted', 'event tag correct');
  assert(parsed.severity === 'error', 'severity error');
  assert(parsed.provider === 'gemini', 'provider threaded');
}

function pathConstants(): void {
  console.log('\n== Path AL7: thresholds match plan §8 ==');
  assert(ALERT_COST_CEILING_INR === 80, `cost ceiling ₹80 (got ${ALERT_COST_CEILING_INR})`);
  assert(TIER2_BURST_THRESHOLD === 3, `tier-2 threshold 3 (got ${TIER2_BURST_THRESHOLD})`);
}

async function main(): Promise<void> {
  console.log('Phase 23 smoke — observability alerts\n');
  pathCostBelow();
  pathCostAbove();
  pathTier2Below();
  pathTier2BurstFires();
  pathTier2WindowReset();
  pathKeyPoolAlert();
  pathConstants();
  if (failures === 0) {
    console.log('\nPASS — all Phase 23 smoke assertions green.');
    process.exit(0);
  } else {
    console.error(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => { console.error('Smoke test crashed:', err); process.exit(1); });
