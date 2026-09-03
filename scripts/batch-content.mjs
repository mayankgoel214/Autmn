// Autmn content batch generator.
//
// Usage:
//   node --env-file=.env scripts/batch-content.mjs [stylesCSV]
//
// Input layout (you create this):
//   content/input/<product-name>/         one folder per product
//     1.jpg 2.jpg ...                      1-5 raw photos (first = primary)
//     category.txt                         optional, e.g. "food" (default: general)
//
// Output:
//   content/output/<product-name>/
//     before.jpg                           the raw primary photo
//     <style>.jpg                          each generated Autmn ad (watermark already applied)
//     <style>__pair.jpg                    before | after side-by-side for the gallery
//   content/output/manifest.json           full run summary (tier, cost, paths)
//
// Default styles can be overridden:  node ... scripts/batch-content.mjs "style_clean_white,style_lifestyle,style_festive"
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  statSync,
  copyFileSync,
} from 'fs';
import { createRequire } from 'module';
import { processStyleProduction } from '../packages/ai/dist/index.js';
const require = createRequire('/Users/mayankgoel/projects/Marquee/packages/ai/');
const sharp = require('sharp');

const IN = 'content/input';
const OUT = 'content/output';
const DEFAULT_STYLES = ['style_clean_white', 'style_lifestyle', 'style_festive'];
const styles =
  process.argv[2]
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? DEFAULT_STYLES;
const IMG_RE = /\.(jpe?g|png|webp)$/i;

if (!existsSync(IN)) {
  console.error(
    `No input dir at ${IN}/. Create it with one subfolder per product (1.jpg, 2.jpg, optional category.txt).`,
  );
  process.exit(1);
}

const products = readdirSync(IN).filter((d) => statSync(`${IN}/${d}`).isDirectory());
if (products.length === 0) {
  console.error(`${IN}/ has no product folders yet.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
console.log(`Products: ${products.length} | styles: ${styles.join(', ')}\n`);

const manifest = [];
let totalCost = 0;
let okCount = 0;
let failCount = 0;

for (const product of products) {
  const dir = `${IN}/${product}`;
  const photos = readdirSync(dir)
    .filter((f) => IMG_RE.test(f))
    .sort();
  if (photos.length === 0) {
    console.log(`⚠ ${product}: no images, skipping`);
    continue;
  }
  const category = existsSync(`${dir}/category.txt`)
    ? readFileSync(`${dir}/category.txt`, 'utf8').trim() || 'general'
    : 'general';
  const primary = readFileSync(`${dir}/${photos[0]}`);
  const refs = photos.slice(1, 5).map((f) => readFileSync(`${dir}/${f}`));

  const outDir = `${OUT}/${product}`;
  mkdirSync(outDir, { recursive: true });
  copyFileSync(`${dir}/${photos[0]}`, `${outDir}/before.jpg`);

  console.log(
    `▶ ${product}  (category: ${category}, ${photos.length} photo${photos.length > 1 ? 's' : ''})`,
  );

  for (const style of styles) {
    const t0 = Date.now();
    process.stdout.write(`   ${style.padEnd(22)} `);
    try {
      const r = await processStyleProduction({
        style,
        primaryBuffer: primary,
        referenceBuffers: refs,
        productCategory: category,
        orderId: `content-${product}-${style}`.replace(/[^a-z0-9-]/gi, '').slice(0, 40),
      });
      if (!r.outputUrl || r.tier === 'refund') throw new Error('no output (refund)');

      // fetch the generated image and save locally
      const buf = Buffer.from(await (await fetch(r.outputUrl)).arrayBuffer());
      const afterPath = `${outDir}/${style}.jpg`;
      writeFileSync(afterPath, buf);

      // before|after composite (equal height, white gutter)
      const H = 1000;
      const before = await sharp(primary).resize({ height: H }).toBuffer();
      const after = await sharp(buf).resize({ height: H }).toBuffer();
      const bMeta = await sharp(before).metadata();
      const aMeta = await sharp(after).metadata();
      const gutter = 24;
      const W = bMeta.width + gutter + aMeta.width;
      await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
        .composite([
          { input: before, left: 0, top: 0 },
          { input: after, left: bMeta.width + gutter, top: 0 },
        ])
        .jpeg({ quality: 90 })
        .toFile(`${outDir}/${style}__pair.jpg`);

      totalCost += r.costInr ?? 0;
      okCount++;
      console.log(`✓ tier${r.tier} ₹${r.costInr} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      manifest.push({
        product,
        category,
        style,
        tier: r.tier,
        costInr: r.costInr,
        after: afterPath,
        pair: `${outDir}/${style}__pair.jpg`,
      });
    } catch (e) {
      failCount++;
      console.log(`✗ ${e?.message ?? e}`);
      manifest.push({ product, category, style, error: String(e?.message ?? e) });
    }
  }
  console.log('');
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(
  `=== done: ${okCount} ok, ${failCount} failed | est. cost ₹${totalCost.toFixed(1)} | manifest: ${OUT}/manifest.json ===`,
);
