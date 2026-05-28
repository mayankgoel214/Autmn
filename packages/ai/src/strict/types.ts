/**
 * Phase 20 — strict-track types.
 *
 * The strict track skips generative image models entirely. For styles where
 * product identity must be preserved with near-100% fidelity (White Studio,
 * future marketplace presets), we:
 *   1. Segment the product cutout with BiRefNet (alpha mask).
 *   2. Composite the cutout onto a target background (white for V1).
 *   3. Synthesize a soft contact shadow with sharp (no LLM call).
 *   4. Verify with a lighter check (no comparative LLM, just sanity).
 *
 * Cost: ~₹3-5/style vs ₹13.40 on the creative track. Identity preservation
 * is near-100% by construction — we never ask a model to regenerate the
 * product itself.
 */

export interface StrictTrackConfig {
  /** Background hex color, e.g. "#FFFFFF" for White Studio. */
  background: string;
  /** Composition placement — V1 supports 'centered' only. */
  composition: 'centered';
  /**
   * Marketplace-safe whitespace around the product, as a percent of the
   * shorter dimension. 12% matches Amazon's product image guidelines.
   */
  paddingPercent: number;
  /** Soft contact shadow opacity (0-1). 0 disables. */
  shadowOpacity: number;
  /** Shadow blur radius in pixels at 1024×1024 output. Scales linearly. */
  shadowBlurPx: number;
  /** Output aspect — V1 supports '1:1' only. */
  outputAspect: '1:1';
  /**
   * Final output edge in pixels. 1024 matches the creative track's typical
   * output size so downstream sizing is consistent.
   */
  outputSize: number;
}

/**
 * Phase 20 — White Studio config. The primary fix from the co-founder's
 * feedback: stop asking a generative model to redraw products on white.
 */
export const WHITE_STUDIO_CONFIG: StrictTrackConfig = {
  background: '#FFFFFF',
  composition: 'centered',
  paddingPercent: 12,
  shadowOpacity: 0.18,
  shadowBlurPx: 24,
  outputAspect: '1:1',
  outputSize: 1024,
};

export interface StrictTrackResult {
  /** Final composed JPEG buffer. */
  buffer: Buffer;
  /** Cost incurred (segmentation + sharp ops are local). */
  costInr: number;
  /** True if the strict track succeeded; false → caller falls back to creative. */
  ok: boolean;
  /** Reason for fallback when ok is false. */
  fallbackReason?: string;
  /** Step-by-step timing for observability. */
  timings: {
    segmentationMs: number;
    compositeMs: number;
    totalMs: number;
  };
}

/** Per-track cost constants in rupees. */
export const STRICT_COST_INR = {
  birefnet: 2.0,         // fal.ai BiRefNet v2
  rembg: 1.0,            // fal.ai rembg (fallback segmenter)
  composite: 0,          // sharp — pure local
} as const;
