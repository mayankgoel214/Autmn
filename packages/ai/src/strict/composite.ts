/**
 * Phase 20 — composite the product cutout onto a clean studio background.
 *
 * Pure local op (sharp). Steps:
 *   1. Load the alpha-channel PNG cutout.
 *   2. Compute fit-to-canvas scale that leaves `paddingPercent` whitespace.
 *   3. Render a soft contact shadow underneath via a blurred dark ellipse.
 *   4. Composite cutout on top of the background.
 *   5. Output JPEG at `outputSize × outputSize`.
 *
 * Edge cases handled:
 *   - Cutout taller than wide → fit by height, center horizontally.
 *   - Cutout with translucent edges (alpha gradient) → preserved.
 *   - Tiny cutouts (e.g. earring stud) → still padded to look premium.
 */

import sharp from 'sharp';
import type { StrictTrackConfig } from './types.js';

export interface CompositeParams {
  /** PNG buffer with alpha channel from BiRefNet segmentation. */
  cutoutBuffer: Buffer;
  config: StrictTrackConfig;
}

export async function compositeOnBackground(params: CompositeParams): Promise<Buffer> {
  const { cutoutBuffer, config } = params;
  const { outputSize, paddingPercent, background, shadowOpacity, shadowBlurPx } = config;

  // 1. Inspect the cutout's tight bounding box (post-segmentation, the alpha
  //    edges are clean enough that the metadata-reported dims are accurate).
  const cutoutMeta = await sharp(cutoutBuffer).metadata();
  const cutoutW = cutoutMeta.width ?? 0;
  const cutoutH = cutoutMeta.height ?? 0;
  if (cutoutW === 0 || cutoutH === 0) {
    throw new Error(`compositeOnBackground: cutout has zero dimensions (got ${cutoutW}×${cutoutH})`);
  }

  // 2. Compute fit scale. Target a "useful area" inside the canvas equal to
  //    (1 - 2*padding) of the canvas size. Scale by the limiting axis.
  const paddedExtent = Math.floor(outputSize * (1 - 2 * paddingPercent / 100));
  const scale = Math.min(paddedExtent / cutoutW, paddedExtent / cutoutH);
  const targetW = Math.max(1, Math.round(cutoutW * scale));
  const targetH = Math.max(1, Math.round(cutoutH * scale));

  // 3. Resize cutout.
  const resizedCutout = await sharp(cutoutBuffer)
    .resize(targetW, targetH, { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // 4. Background.
  const bg = sharp({
    create: {
      width: outputSize,
      height: outputSize,
      channels: 3,
      background,
    },
  });

  // 5. Shadow — render a soft horizontal ellipse darker than background,
  //    placed slightly below the cutout's vertical centre, blurred.
  const composites: sharp.OverlayOptions[] = [];

  if (shadowOpacity > 0) {
    const shadowBuf = await renderContactShadow({
      cutoutW: targetW,
      cutoutH: targetH,
      canvasW: outputSize,
      canvasH: outputSize,
      blurPx: shadowBlurPx,
      opacity: shadowOpacity,
    });
    composites.push({ input: shadowBuf, left: 0, top: 0 });
  }

  // Cutout overlay — centered horizontally, slightly above vertical centre
  // for a more pleasing weight on the page (rule of thirds).
  const left = Math.floor((outputSize - targetW) / 2);
  // Anchor the cutout's bottom 8% above the canvas bottom so the contact
  // shadow has room to fall under it without clipping.
  const top = Math.max(0, outputSize - targetH - Math.floor(outputSize * 0.08));
  composites.push({ input: resizedCutout, left, top });

  return bg
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

interface ShadowParams {
  cutoutW: number;
  cutoutH: number;
  canvasW: number;
  canvasH: number;
  blurPx: number;
  opacity: number;
}

/**
 * Render a single soft contact shadow as a blurred grey ellipse on a
 * transparent canvas the size of the final image. Cheap (~1ms), deterministic,
 * and identity-preserving (vs Flux inpainting at ~₹1-2 + 5s latency).
 */
async function renderContactShadow(params: ShadowParams): Promise<Buffer> {
  const { cutoutW, cutoutH, canvasW, canvasH, blurPx, opacity } = params;

  // Ellipse anchored at the cutout's foot (same horizontal centre + bottom).
  const cx = Math.floor(canvasW / 2);
  const footY = Math.max(0, canvasH - Math.floor(canvasH * 0.08) - Math.floor(cutoutH * 0.05));

  // Width: ~95% of the cutout. Height: tall enough that the blur softens the
  // edges into the canvas without a hard line.
  const ellipseW = Math.floor(cutoutW * 0.95);
  const ellipseH = Math.max(8, Math.floor(cutoutH * 0.12));

  // Use SVG → sharp renders fast + supports blur natively.
  const alpha = Math.max(0, Math.min(1, opacity));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
      <defs>
        <filter id="b" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="${blurPx}" />
        </filter>
      </defs>
      <ellipse cx="${cx}" cy="${footY}" rx="${ellipseW / 2}" ry="${ellipseH / 2}"
        fill="rgba(0,0,0,${alpha})" filter="url(#b)" />
    </svg>`,
  );
  return sharp(svg).png().toBuffer();
}
