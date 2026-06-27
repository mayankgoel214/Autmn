// Internal end-to-end pipeline smoke. Run from repo root:
//   node --env-file=.env scripts/internal-smoke.mjs
// Exercises the real Gemini (creative track) + fal.ai (strict track) + Supabase upload.
import { readFileSync } from 'fs';
import { processStyleProduction } from '../packages/ai/dist/index.js';

const img = readFileSync('tests/pilot/products/diet-coke/1.jpg');
console.log(`input image: ${(img.length / 1024).toFixed(0)} KB\n`);

const cases = [
  { label: 'CREATIVE (Gemini Tier-1)', style: 'style_lifestyle', category: 'food' },
  { label: 'STRICT (white studio / fal.ai)', style: 'style_clean_white', category: 'food' },
];

let pass = 0;
for (const c of cases) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${c.label} [${c.style}] ... `);
  try {
    const r = await processStyleProduction({
      style: c.style,
      primaryBuffer: img,
      referenceBuffers: [],
      productCategory: c.category,
      userInstructions: '',
      orderId: `smoke-${c.style}`,
    });
    const ok = !!r.outputUrl && r.tier !== 'refund';
    console.log(ok ? 'PASS' : 'FAIL');
    console.log(
      `   tier=${r.tier} model=${r.model} cost=₹${r.costInr ?? '?'} ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    console.log(`   output: ${r.outputUrl ?? '(none)'}\n`);
    if (ok) pass++;
  } catch (e) {
    console.log('ERROR');
    console.log(`   ${e?.message ?? e}\n`);
  }
}

console.log(`\n=== ${pass}/${cases.length} passed ===`);
process.exit(pass === cases.length ? 0 : 1);
