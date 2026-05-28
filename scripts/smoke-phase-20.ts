#!/usr/bin/env tsx
/**
 * Phase 20 smoke — strict track (segmentation + composite).
 *
 * Real BiRefNet calls need a fal.ai key + network; we don't hit them here.
 * Coverage:
 *   ST1. isStrictStyle gates only style_clean_white today.
 *   ST2. WHITE_STUDIO_CONFIG matches the locked spec.
 *   ST3. compositeOnBackground produces a JPEG of the configured size with
 *        sharp metadata reporting the expected dimensions + background.
 *   ST4. compositeOnBackground respects paddingPercent — the rendered
 *        product never breaches the marketplace-safe whitespace.
 *   ST5. compositeOnBackground tolerates extreme aspect ratios (tall / wide)
 *        without throwing.
 *   ST6. STRICT_COST_INR values match the plan (₹2 BiRefNet, ₹0 composite).
 *   ST7. processStrictStyle returns a fallback result with ok=false when
 *        BiRefNet is unconfigured (no FAL_KEY → we expect a clean fallback,
 *        not a crash).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// scripts/ has no symlinked deps; pull sharp from @autmn/ai's node_modules
// via the package's own resolution. Dynamic import so the path-resolution
// runs at call time (after env load).
const sharp = (await import(
  `file://${resolve(import.meta.dirname, '../packages/ai/node_modules/sharp/lib/index.js').replace(/\\/g, '/')}`
)).default as typeof import('sharp').default;

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
  isStrictStyle,
  WHITE_STUDIO_CONFIG,
  STRICT_COST_INR,
  compositeOnBackground,
  processStrictStyle,
} = await import('../packages/ai/dist/strict/index.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
}

function pathIsStrictStyle(): void {
  console.log('\n== Path ST1: isStrictStyle gating ==');
  assert(isStrictStyle('style_clean_white') === true, 'style_clean_white is strict');
  assert(isStrictStyle('style_studio') === false, 'style_studio is creative');
  assert(isStrictStyle('style_lifestyle') === false, 'style_lifestyle is creative');
  assert(isStrictStyle('style_anything_you_want') === false, 'anything-you-want is creative');
}

function pathWhiteStudioConfig(): void {
  console.log('\n== Path ST2: WHITE_STUDIO_CONFIG matches plan spec ==');
  assert(WHITE_STUDIO_CONFIG.background === '#FFFFFF', 'background pure white');
  assert(WHITE_STUDIO_CONFIG.composition === 'centered', 'composition centered');
  assert(WHITE_STUDIO_CONFIG.paddingPercent === 12, 'padding 12%');
  assert(WHITE_STUDIO_CONFIG.shadowOpacity > 0 && WHITE_STUDIO_CONFIG.shadowOpacity < 1, 'shadow opacity in (0,1)');
  assert(WHITE_STUDIO_CONFIG.outputAspect === '1:1', 'output aspect 1:1');
  assert(WHITE_STUDIO_CONFIG.outputSize === 1024, 'output size 1024px');
}

async function pathCompositeBasic(): Promise<void> {
  console.log('\n== Path ST3: compositeOnBackground emits a valid JPEG at configured size ==');
  // Build a synthetic "cutout" PNG — solid red square with alpha.
  const cutout = await sharp({
    create: { width: 400, height: 600, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
  }).png().toBuffer();

  const out = await compositeOnBackground({ cutoutBuffer: cutout, config: WHITE_STUDIO_CONFIG });
  const meta = await sharp(out).metadata();
  assert(meta.format === 'jpeg', `output is JPEG (got ${meta.format})`);
  assert(meta.width === WHITE_STUDIO_CONFIG.outputSize, `width ${WHITE_STUDIO_CONFIG.outputSize}`);
  assert(meta.height === WHITE_STUDIO_CONFIG.outputSize, `height ${WHITE_STUDIO_CONFIG.outputSize}`);

  // Sample a pixel from the very top-left of the canvas — should be near-white.
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const idx = 0; // (0,0)
  const r = data[idx]!, g = data[idx + 1]!, b = data[idx + 2]!;
  assert(r > 240 && g > 240 && b > 240, `top-left near white (got rgb(${r},${g},${b}))`);
  // Sample (10, 10) — outside the cutout bounds, still white.
  const idx2 = (10 * info.width + 10) * info.channels;
  const r2 = data[idx2]!, g2 = data[idx2 + 1]!, b2 = data[idx2 + 2]!;
  assert(r2 > 240 && g2 > 240 && b2 > 240, `margin near white (got rgb(${r2},${g2},${b2}))`);
}

async function pathPaddingRespected(): Promise<void> {
  console.log('\n== Path ST4: cutout never breaches the padding-safe area ==');
  // Make a cutout much larger than the canvas so the scale-down kicks in.
  const cutout = await sharp({
    create: { width: 4000, height: 4000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const out = await compositeOnBackground({ cutoutBuffer: cutout, config: WHITE_STUDIO_CONFIG });
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const expectedPaddingPx = Math.floor(WHITE_STUDIO_CONFIG.outputSize * WHITE_STUDIO_CONFIG.paddingPercent / 100);
  // Sample a pixel inside the padding margin (top edge, halfway through padding).
  const sampleY = Math.floor(expectedPaddingPx / 2);
  const sampleX = Math.floor(info.width / 2);
  const idx = (sampleY * info.width + sampleX) * info.channels;
  const r = data[idx]!, g = data[idx + 1]!, b = data[idx + 2]!;
  assert(r > 240 && g > 240 && b > 240, `pixel inside top padding is white (got rgb(${r},${g},${b}))`);
}

async function pathExtremeAspectRatios(): Promise<void> {
  console.log('\n== Path ST5: tolerates tall + wide cutouts ==');
  const tall = await sharp({
    create: { width: 200, height: 1800, channels: 4, background: { r: 50, g: 80, b: 200, alpha: 1 } },
  }).png().toBuffer();
  const out1 = await compositeOnBackground({ cutoutBuffer: tall, config: WHITE_STUDIO_CONFIG });
  assert((await sharp(out1).metadata()).width === WHITE_STUDIO_CONFIG.outputSize, 'tall cutout → square output');

  const wide = await sharp({
    create: { width: 2400, height: 300, channels: 4, background: { r: 50, g: 200, b: 80, alpha: 1 } },
  }).png().toBuffer();
  const out2 = await compositeOnBackground({ cutoutBuffer: wide, config: WHITE_STUDIO_CONFIG });
  assert((await sharp(out2).metadata()).width === WHITE_STUDIO_CONFIG.outputSize, 'wide cutout → square output');
}

function pathStrictCosts(): void {
  console.log('\n== Path ST6: STRICT_COST_INR matches plan §3 (₹2 BiRefNet, ₹0 composite) ==');
  assert(STRICT_COST_INR.birefnet === 2.0, `birefnet ₹2 (got ${STRICT_COST_INR.birefnet})`);
  assert(STRICT_COST_INR.composite === 0, `composite local-only ₹0 (got ${STRICT_COST_INR.composite})`);
  assert(STRICT_COST_INR.rembg === 1.0, `rembg fallback ₹1 (got ${STRICT_COST_INR.rembg})`);
}

async function pathFallbackOnUnconfiguredFal(): Promise<void> {
  console.log('\n== Path ST7: processStrictStyle falls back cleanly when fal.ai is unreachable ==');
  // Force unreachability by setting a junk key. The fal.ai client will reject
  // either at config time or at subscribe time; either way we expect an
  // ok:false StrictTrackResult, NOT a thrown error.
  const original = process.env['FAL_KEY'];
  process.env['FAL_KEY'] = 'invalid-fal-key-smoke';
  delete process.env['FAL_KEYS'];

  // Tiny synthetic primary buffer.
  const primary = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg().toBuffer();

  let result;
  try {
    result = await processStrictStyle({
      orderId: 'st7-test',
      style: 'style_clean_white',
      primaryBuffer: primary,
      primaryUrl: 'https://example.com/nonexistent.jpg', // skip storage upload
    });
  } catch (err) {
    failures++;
    console.error('  ✗ processStrictStyle threw instead of returning ok:false', err);
    if (original !== undefined) process.env['FAL_KEY'] = original;
    return;
  }

  assert(result.ok === false, 'returns ok:false on fal failure');
  assert(typeof result.fallbackReason === 'string', 'fallbackReason populated');
  assert(result.timings.totalMs >= 0, 'timings present');

  if (original !== undefined) process.env['FAL_KEY'] = original; else delete process.env['FAL_KEY'];
}

async function main(): Promise<void> {
  console.log('Phase 20 smoke — strict track\n');
  pathIsStrictStyle();
  pathWhiteStudioConfig();
  await pathCompositeBasic();
  await pathPaddingRespected();
  await pathExtremeAspectRatios();
  pathStrictCosts();
  await pathFallbackOnUnconfiguredFal();
  if (failures === 0) {
    console.log('\nPASS — all Phase 20 smoke assertions green.');
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
