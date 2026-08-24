/**
 * Regression tests for the deterministic quality gates.
 *
 * These exist because the checks were reworked to decode each image once and
 * share the buffer, rather than re-deriving the same 256x256 greyscale five
 * times. That change is only safe if the numbers it produces are unchanged, so
 * the golden values below are the ones the original implementation returned on
 * the real before/after pairs in apps/web/public/gallery.
 *
 * No API key and no network — these are pure pixel arithmetic.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { runDeterministicChecks } from './deterministic-checks.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GALLERY = join(HERE, '..', '..', '..', '..', 'apps', 'web', 'public', 'gallery');

/** Values produced by the pre-refactor implementation. */
const GOLDEN = {
  earrings: { sceneNCC: 0, estimatedFillPct: 100, laplacianVariance: 739.83, quadrantSymmetry: 0.0611 },
  'serum-bottle': { sceneNCC: 0, estimatedFillPct: 100, laplacianVariance: 334.38, quadrantSymmetry: 0.0753 },
} as const;

const galleryAvailable = existsSync(GALLERY);

describe('runDeterministicChecks — golden values on real pipeline output', { skip: !galleryAvailable }, () => {
  for (const [name, expected] of Object.entries(GOLDEN)) {
    test(`${name} matches the pre-refactor numbers`, async () => {
      const input = await readFile(join(GALLERY, name, 'before.jpg'));
      const output = await readFile(join(GALLERY, name, 'after.jpg'));

      const result = await runDeterministicChecks(input, output);

      assert.equal(result.pass, true, 'a real shipped pair must pass');
      assert.equal(result.estimatedFillPct, expected.estimatedFillPct);
      // Floating-point arithmetic over pixels, so compare to a tolerance rather
      // than for exact equality.
      assert.ok(Math.abs(result.sceneNCC - expected.sceneNCC) < 1e-3,
        `sceneNCC ${result.sceneNCC} != ${expected.sceneNCC}`);
      assert.ok(Math.abs(result.laplacianVariance - expected.laplacianVariance) < 0.5,
        `laplacianVariance ${result.laplacianVariance} != ${expected.laplacianVariance}`);
      assert.ok(Math.abs(result.quadrantSymmetry - expected.quadrantSymmetry) < 1e-3,
        `quadrantSymmetry ${result.quadrantSymmetry} != ${expected.quadrantSymmetry}`);
    });
  }
});

describe('runDeterministicChecks — the fatal gates', () => {
  const solid = (r: number, g: number, b: number, size = 1024) =>
    sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } })
      .jpeg()
      .toBuffer();

  /**
   * A synthetic image with structure at several scales.
   *
   * Per-pixel noise will not do: the blank gate averages the frame down to 8x8,
   * and uniform noise averages to a flat mid-grey there, so a noise fixture is
   * rejected as blank before any of the checks under test can run. Large blocks
   * survive that downsample, and the fine detail on top keeps the sharpness and
   * edge metrics meaningful.
   */
  const patterned = async (seedStart: number, size = 1024) => {
    const px = Buffer.alloc(size * size * 3);
    const block = size / 8;
    let seed = seedStart;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const coarse = (Math.floor(x / block) + Math.floor(y / block)) % 2 ? 210 : 40;
        const i = (y * size + x) * 3;
        px[i] = clamp(coarse + (next() % 40) - 20);
        px[i + 1] = clamp(coarse + (next() % 40) - 20);
        px[i + 2] = clamp(coarse + (next() % 40) - 20);
      }
    }
    return sharp(px, { raw: { width: size, height: size, channels: 3 } }).jpeg().toBuffer();
  };

  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

  test('an output handed back unchanged is rejected as no_scene_change', async () => {
    const img = await patterned(12345);
    const result = await runDeterministicChecks(img, img);

    assert.equal(result.pass, false);
    assert.match(result.failReason ?? '', /^no_scene_change/);
    assert.ok(result.sceneNCC > 0.92, `NCC of an image against itself should be ~1, got ${result.sceneNCC}`);
  });

  test('a flat output is rejected as blank', async () => {
    const result = await runDeterministicChecks(await patterned(12345), await solid(200, 200, 200));

    assert.equal(result.pass, false);
    assert.equal(result.failReason, 'output_is_blank');
    assert.equal(result.isBlank, true);
  });

  test('an undersized output is rejected before any pixel analysis', async () => {
    const result = await runDeterministicChecks(await patterned(12345), await patterned(999, 256));

    assert.equal(result.pass, false);
    assert.match(result.failReason ?? '', /^output_too_small:256x256/);
    assert.equal(result.isValid, false);
  });

  test('a corrupt output is reported rather than thrown', async () => {
    const result = await runDeterministicChecks(await patterned(12345), Buffer.from('not an image'));

    assert.equal(result.pass, false);
    assert.equal(result.failReason, 'output_corrupt');
    assert.equal(result.isValid, false);
  });

  test('a genuinely different output passes and reports diagnostics', async () => {
    // Offsetting the pattern changes the scene while keeping both frames
    // structured, which is the "generation worked" path.
    const input = await patterned(12345);
    const output = await sharp(await patterned(777)).rotate(90).jpeg().toBuffer();
    const result = await runDeterministicChecks(input, output);

    assert.equal(result.pass, true);
    assert.ok(result.laplacianVariance > 0);
    assert.ok(result.edgeDensityRatio > 0);
  });
});
