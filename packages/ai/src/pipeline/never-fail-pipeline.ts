/**
 * Never-fail pipeline — thin wrapper over the V1 production chain.
 *
 * The worker calls processImageNeverFail() per style. This module keeps the
 * external shape (NeverFailParams / NeverFailResult) so the worker needs no
 * changes, while routing all generation through production.ts internally.
 *
 * Tier mapping (from production.ts V1):
 *   StyleResult.tier 1         → NeverFailResult.tier 1 (Pro succeeded)
 *   StyleResult.tier 2         → NeverFailResult.tier 2 (Pro failed, GPT-2 succeeded)
 *   StyleResult.tier 'refund'  → throws Error('[needs_refund: true] ...')
 *
 * pipelineMode and modelOverride are still accepted on the type for admin-UI
 * backward compatibility, but are ignored. All paths run the same V1 chain
 * (Beta prompt + Pro → GPT-2 → refund).
 */

import { downloadBuffer } from './fallback.js';
import { preprocessImage } from './preprocess.js';
import { processStyleProduction } from './production.js';
import { generateCreativeBrief } from './creative-brief.js';
import { lightAnalyze, type LightAnalysis } from './light-analyzer.js';
import type { ProcessImageParams, BrandContext } from './_common/types.js';

// ---------------------------------------------------------------------------
// Phase 21 — extract the six edge-case bool fields from a LightAnalysis
// result into the shape processStyleProduction / processStyleWithChain expect.
// Keys MUST match LightAnalysisSchema field names and EDGE_CASE_RULES keys
// (see packages/ai/src/pipeline/category-rules.ts).
// ---------------------------------------------------------------------------
function extractEdgeCaseFlags(analysis: LightAnalysis): Record<string, boolean> {
  return {
    isTransparent: analysis.isTransparent,
    isReflectiveMetal: analysis.isReflectiveMetal,
    hasEmbroidery: analysis.hasEmbroidery,
    isLowContrastVsBackground: analysis.isLowContrastVsBackground,
    hasTextOrLogo: analysis.hasTextOrLogo,
    isTinyProduct: analysis.isTinyProduct,
  };
}

// ---------------------------------------------------------------------------
// Extended params (backward-compatible)
// ---------------------------------------------------------------------------

export interface NeverFailParams extends ProcessImageParams {
  /** Pre-downloaded reference image buffers for multi-angle orders. */
  referenceImageBuffers?: Buffer[];
  /** Kept for backward compat — not used in production routing. */
  profileV4?: unknown;
  /**
   * Override the Tier 1 image model — kept for admin UI compat.
   * Ignored in V1 (always runs Pro → GPT-2 chain).
   */
  modelOverride?: string;
  /**
   * Pipeline mode — kept for backward compat.
   * Ignored in V1 — all modes run the Beta prompt.
   */
  pipelineMode?: 'full' | 'lean' | 'skinny' | 'beta';
  /**
   * Phase 5 — per-user brand context. Threaded into the prompt so the LLM
   * sees the brand's tagline / vibe / colours / summary as a stylistic
   * anchor. Omit it for byte-identical pre-Phase-5 prompts.
   */
  brandContext?: BrandContext;
}

export interface NeverFailResult {
  outputUrl: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  storyUrl?: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  videoUrl?: string;
  cutoutUrl?: string;
  /** Placeholder — no QA gate in V1. */
  qaScore: number;
  pipeline: string;
  attempts: number;
  durationMs: number;
  /** 1 = Pro, 2 = GPT-2. (Tier 4 retained on type for old callers but unused in V1.) */
  tier: 1 | 2 | 3 | 4;
  tierReason?: string;
  outputBuffer?: Buffer;
  inputAssessment?: unknown;
  rejected?: boolean;
  rejectionReason?: string;
  usedCreativeDirection?: {
    heroMoment: string;
    creativeBrief: string;
    scenePrompt: string;
    dynamicElements: string[];
    emotionalTrigger: string;
    storyScene: string;
    backgroundOnlyPrompt: string;
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function processImageNeverFail(
  params: NeverFailParams,
): Promise<NeverFailResult> {
  const totalStart = Date.now();
  const style = params.style ?? 'style_lifestyle';

  if (params.pipelineMode && params.pipelineMode !== 'beta') {
    console.info(JSON.stringify({
      event: 'never_fail_mode_ignored',
      pipelineMode: params.pipelineMode,
      note: 'V1 ignores pipelineMode. All paths run Beta + Pro → GPT-2 → refund.',
    }));
  }

  if (params.modelOverride) {
    console.info(JSON.stringify({
      event: 'never_fail_model_override_ignored',
      modelOverride: params.modelOverride,
      note: 'V1 ignores modelOverride. Production always uses the full tier chain.',
    }));
  }

  // ---- Download + preprocess ------------------------------------------------
  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(
      `Cannot download input image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let primaryBuffer: Buffer;
  try {
    const pp = await preprocessImage(rawBuffer);
    primaryBuffer = pp.buffer;
  } catch {
    primaryBuffer = rawBuffer;
  }

  // ---- V1.1 + Phase 21: Creative Brief + Light Analyzer (parallel) ---------
  // Both calls look at the same buffers; running them in parallel keeps the
  // per-style latency floor near the slower of the two (~5-8s) instead of
  // ~10-15s if chained. Each failure mode is isolated:
  //   - brief failure → null → falls back to V1 base Beta prompt
  //   - lightAnalyze failure → undefined edgeCaseFlags → no category addenda
  //     (identical to pre-Phase-21 behavior — safe)
  const allBuffers = [primaryBuffer, ...(params.referenceImageBuffers ?? [])];

  const [brief, edgeCaseFlags] = await Promise.all([
    generateCreativeBrief({
      buffers: allBuffers,
      styles: [style],
      productCategory: params.productCategory,
      brandName: params.brandName,
    }),
    lightAnalyze(allBuffers)
      .then((analysis) => {
        const flags = extractEdgeCaseFlags(analysis);
        const fired = Object.entries(flags)
          .filter(([_, v]) => v)
          .map(([k]) => k);
        console.info(JSON.stringify({
          event: 'never_fail_edge_case_flags',
          style,
          analysisCategory: analysis.productCategory,
          flagsFired: fired,
        }));
        return flags as Record<string, boolean | undefined>;
      })
      .catch((err) => {
        console.warn(JSON.stringify({
          event: 'never_fail_light_analyze_failed',
          style,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
          note: 'Falling back to undefined edgeCaseFlags — no addenda fire',
        }));
        return undefined;
      }),
  ]);

  // ---- Route to V1.1 production chain ---------------------------------------
  const styleResult = await processStyleProduction({
    style,
    primaryBuffer,
    referenceBuffers: params.referenceImageBuffers ?? [],
    productCategory: params.productCategory,
    userInstructions: params.voiceInstructions,
    originalVoiceInstructions: params.originalVoiceInstructions,
    artDirection: brief?.directions[style],
    productDescription: brief?.profile.productType,
    brandName: params.brandName,
    brandContext: params.brandContext,
    edgeCaseFlags,
  });

  // ---- Map to NeverFailResult ------------------------------------------------
  if (styleResult.tier === 'refund') {
    // Carry the transient/permanent classification up to the worker via the
    // marker string — the thrown Error message is the only channel the worker
    // sees. Default 'transient' if the chain didn't stamp one.
    const failureClass = styleResult.errorClass ?? 'transient';
    throw new Error(
      `[needs_refund: true][class: ${failureClass}] All AI tiers exhausted for style "${style}". Last error: ${styleResult.error ?? 'unknown'}`,
    );
  }

  // tier is 1 | 2 here (refund handled above)
  const tier = styleResult.tier;

  return {
    outputUrl: styleResult.outputUrl!,
    qaScore: 100, // No QA gate in V1
    pipeline: styleResult.model,
    attempts: tier,
    durationMs: Date.now() - totalStart,
    tier,
    tierReason: tier === 1
      ? 'Pro succeeded'
      : 'Pro failed — GPT-2 succeeded',
  };
}
