/**
 * Phase 20 — strict-track processor.
 *
 * One-shot path for styles where product identity must be preserved by
 * construction (currently only `style_clean_white`). Steps per call:
 *   1. Upload primary buffer to fal.ai storage (BiRefNet input).
 *   2. Run BiRefNet v2 → cutout URL with alpha channel.
 *   3. Download cutout buffer.
 *   4. Composite onto WHITE_STUDIO_CONFIG background (sharp).
 *   5. Return buffer + cost summary.
 *
 * Fallback: on any failure (BiRefNet outage, transparent product, low-contrast
 * silhouette), returns ok=false + reason. The caller (production.ts) then
 * runs the creative-track path for that style.
 *
 * Strict track has NO Tier 2 — segmentation either works cleanly or it
 * doesn't; LLM safety refusal isn't a failure mode for compositing.
 */

import { downloadBuffer, removeBackground, uploadToStorage } from '../pipeline/fallback.js';
import { compositeOnBackground } from './composite.js';
import { WHITE_STUDIO_CONFIG, STRICT_COST_INR, type StrictTrackConfig, type StrictTrackResult } from './types.js';

/**
 * Returns true if the given style id is configured as a strict-track style.
 * Currently only `style_clean_white`; future marketplace presets land here.
 */
export function isStrictStyle(style: string): boolean {
  return style === 'style_clean_white';
}

/**
 * Resolve the config for a strict-track style. Throws on unknown style id
 * because callers MUST gate with `isStrictStyle` first.
 */
function configForStyle(style: string): StrictTrackConfig {
  switch (style) {
    case 'style_clean_white':
      return WHITE_STUDIO_CONFIG;
    default:
      throw new Error(`strict-track config not defined for style: ${style}`);
  }
}

export interface ProcessStrictStyleParams {
  orderId: string;
  style: string;
  /** Primary product photo (post-preprocess). */
  primaryBuffer: Buffer;
  /**
   * Pre-uploaded URL for the primary buffer. Optional — if absent we upload
   * here. Passing one avoids a re-upload when the caller already staged the
   * image for the creative-track flow.
   */
  primaryUrl?: string;
}

export async function processStrictStyle(params: ProcessStrictStyleParams): Promise<StrictTrackResult> {
  const { orderId, style, primaryBuffer } = params;
  const startMs = Date.now();
  const config = configForStyle(style);

  // 1. Ensure we have a URL for BiRefNet. fallback.ts uploadToStorage accepts
  //    a buffer + name and returns a Supabase URL; we reuse it so BiRefNet
  //    fetches over CDN rather than us shipping the bytes a second time.
  let imageUrl: string;
  if (params.primaryUrl) {
    imageUrl = params.primaryUrl;
  } else {
    try {
      imageUrl = await uploadToStorage(primaryBuffer, `strict_${orderId}_${style}_input_${Date.now()}.jpg`);
    } catch (err) {
      return strictFail(startMs, `input upload failed: ${asMessage(err)}`);
    }
  }

  // 2. BiRefNet segmentation.
  let cutoutUrl: string;
  let segmentationMs = 0;
  try {
    const segStart = Date.now();
    cutoutUrl = await removeBackground(imageUrl);
    segmentationMs = Date.now() - segStart;
  } catch (err) {
    return strictFail(startMs, `BiRefNet failed: ${asMessage(err)}`);
  }

  // 3. Download cutout.
  let cutoutBuffer: Buffer;
  try {
    cutoutBuffer = await downloadBuffer(cutoutUrl);
  } catch (err) {
    return strictFail(startMs, `cutout download failed: ${asMessage(err)}`);
  }

  // 4. Composite via sharp.
  let buffer: Buffer;
  let compositeMs = 0;
  try {
    const compStart = Date.now();
    buffer = await compositeOnBackground({ cutoutBuffer, config });
    compositeMs = Date.now() - compStart;
  } catch (err) {
    return strictFail(startMs, `composite failed: ${asMessage(err)}`, segmentationMs);
  }

  const totalMs = Date.now() - startMs;
  const costInr = STRICT_COST_INR.birefnet + STRICT_COST_INR.composite;
  console.info(JSON.stringify({
    event: 'strict_style_complete',
    orderId, style,
    segmentationMs, compositeMs, totalMs,
    costInr,
  }));

  return {
    buffer,
    costInr,
    ok: true,
    timings: { segmentationMs, compositeMs, totalMs },
  };
}

function strictFail(startMs: number, reason: string, segmentationMs = 0): StrictTrackResult {
  const totalMs = Date.now() - startMs;
  console.warn(JSON.stringify({
    event: 'strict_style_fallback',
    reason, totalMs, segmentationMs,
  }));
  return {
    buffer: Buffer.alloc(0),
    costInr: STRICT_COST_INR.birefnet, // we charged for the attempt
    ok: false,
    fallbackReason: reason,
    timings: { segmentationMs, compositeMs: 0, totalMs },
  };
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err);
}
