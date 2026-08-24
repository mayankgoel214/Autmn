/**
 * Times the deterministic quality gates over the real before/after pairs in
 * apps/web/public/gallery, and prints the metric values alongside the timings.
 *
 * Real pipeline output rather than synthetic images, because the cost here is
 * dominated by decoding and resampling actual photographs — a generated test
 * pattern would not measure the thing that matters.
 *
 *   npx tsx packages/ai/bench/qa-benchmark.mts
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runDeterministicChecks } from '../src/qa/deterministic-checks.js';

const GALLERY = join(process.cwd(), 'apps/web/public/gallery');
const RUNS = Number(process.env.RUNS ?? 5);

const pairs = (await readdir(GALLERY, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const results: Record<string, unknown> = {};
const timings: number[] = [];

for (const name of pairs) {
  const input = await readFile(join(GALLERY, name, 'before.jpg'));
  const output = await readFile(join(GALLERY, name, 'after.jpg'));

  // Warm-up so sharp's lazy initialisation is not charged to the first sample.
  await runDeterministicChecks(input, output);

  const samples: number[] = [];
  let last;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    last = await runDeterministicChecks(input, output);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  timings.push(median);

  results[name] = {
    medianMs: Number(median.toFixed(1)),
    pass: last!.pass,
    failReason: last!.failReason,
    sceneNCC: Number(last!.sceneNCC.toFixed(4)),
    estimatedFillPct: last!.estimatedFillPct,
    laplacianVariance: Number(last!.laplacianVariance.toFixed(2)),
    quadrantSymmetry: Number(last!.quadrantSymmetry.toFixed(4)),
    colorDistance: Number(last!.colorDistance.toFixed(4)),
    edgeDensityRatio: Number(last!.edgeDensityRatio.toFixed(4)),
    warnings: last!.warnings.length,
  };
}

const total = timings.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  implementation: 'node + sharp',
  runsPerImage: RUNS,
  pairs: pairs.length,
  totalMedianMs: Number(total.toFixed(1)),
  meanPerImageMs: Number((total / pairs.length).toFixed(1)),
  results,
}, null, 2));
