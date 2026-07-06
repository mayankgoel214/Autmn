/**
 * Production — ONE-SHOT pipeline (business rule, 2026-07).
 *
 * Per style:
 *   ONE gemini-3-pro-image-preview generation ($0.134 / ₹13.40) — delivered
 *   as-is. Catastrophic garbage (free deterministic check) is the ONLY
 *   refund case, classified 'permanent' so the worker refunds immediately.
 *
 * There is deliberately NO tier 2, NO LLM verifier, NO retry, NO re-queue:
 * a second generation on a ₹49 image breaks the unit economics. Every
 * quality lever therefore lives in the prompt and costs (near) nothing:
 *   - Hierarchical prompt: fidelity first, hard negatives, style last
 *   - Exact label-text transcription injected verbatim (Light Analyzer)
 *   - Identity anchoring: primary photo tripled in the reference set
 *   - Temperature 0.3: conservative, less product drift
 *   - Aspect 1:1 forced in prompt (consistent across styles in an order)
 *   - Deterministic defect check on raw output (sharp-only, ~50ms, free):
 *     blur, blank, wrong aspect, product duplication, color shift, fill %
 *
 * Runs all style jobs in Promise.all — they're independent.
 */

import { randomBytes } from 'crypto';
import { geminiGenerateImage } from './gemini-generate.js';
import { postProcessFinal, addAILabel, downloadBuffer, uploadToStorage } from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { processStrictStyle, isStrictStyle, STRICT_COST_INR } from '../strict/index.js';
import { alertCostCeilingBreach } from '../monitoring/alerts.js';
import { buildCreativePrompt, buildAnythingYouWantCreativePrompt } from './prompt-builder.js';
import { preprocessImage } from './preprocess.js';
import { generateCreativeBrief, type CreativeBrief } from './creative-brief.js';
import {
  parsePerStyleInstructions,
  type PerStyleInstructionResult,
} from '../instructions/parse-per-style.js';
import { extractNegatives } from '../instructions/extract-negatives.js';
import { classifyFailure, type FailureClass } from './failure-class.js';
import type {
  ProcessImageParams,
  StyleArtDirection,
  BrandContext,
} from './_common/types.js';

// ---------------------------------------------------------------------------
// Cost constants (INR, ₹100 = $1 approximation)
// ---------------------------------------------------------------------------

const COST_INR = {
  geminiProImage: 13.40,      // $0.134 — gemini-3-pro-image-preview at 2K
  creativeBrief: 0.10,        // ~$0.001 — gemini-2.5-flash with photos + structured output
  instructionParse: 0.05,     // ~$0.0005 — gemini-2.5-flash text-only
} as const;

/** Live price per image (Rs 49, first one free). Telemetry only. */
const RETAIL_PRICE_INR = 49;

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const TIER1_MODEL = 'gemini-3-pro-image-preview';
// One-shot policy (business rule, 2026-07): there is NO tier 2 and NO retry.
// One Gemini generation per image, delivered as-is; catastrophic garbage is
// the only refund case. A second generation on a Rs 49 image breaks the
// unit economics, so all quality effort lives in the prompt, not in re-rolls.

// ---------------------------------------------------------------------------
// Generation parameters
// ---------------------------------------------------------------------------

const TIER1_TEMPERATURE = 0.3;     // conservative, faithful to input
const GEMINI_TIER_TIMEOUT_MS = 3 * 60 * 1000;  // 3 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionParams extends ProcessImageParams {
  /**
   * 1-3 style IDs to generate (e.g. ["style_clean_white", "style_with_model"]).
   * All styles are processed in parallel.
   */
  styles: string[];
  /**
   * All input photos — first is primary, rest are reference. Up to 5.
   * If provided, generation uses all buffers. When absent, the single
   * imageUrl is downloaded and used.
   */
  imageBuffers?: Buffer[];
  /**
   * Optional user-provided guidance (voice-note transcript or typed text).
   */
  userInstructions?: string;
  /**
   * Optional per-user brand context (Phase 5). When supplied, threaded into
   * every prompt so the LLM has the brand's tagline / vibe / colors / summary
   * as a stylistic anchor. Omit it for parity with pre-Phase-5 generation.
   */
  brandContext?: BrandContext;
  /**
   * Optional Light-Analyzer edge-case flags (Phase 21). When supplied, the
   * matching addenda from EDGE_CASE_RULES fire in the category section of
   * the prompt. Worker calls lightAnalyze upstream and forwards the booleans
   * here; production.ts does NOT call lightAnalyze itself to keep cost off
   * the per-order path.
   *
   * Keys map to LightAnalysisSchema bool fields: isTransparent,
   * isReflectiveMetal, hasEmbroidery, isLowContrastVsBackground,
   * hasTextOrLogo, isTinyProduct.
   */
  edgeCaseFlags?: Record<string, boolean | undefined>;
}

export interface StyleResult {
  style: string;
  /** Supabase URL. null when tier === 'refund'. */
  outputUrl: string | null;
  tier: 1 | 2 | 'refund';
  model: 'gemini-3-pro-image-preview' | 'gpt-image-2' | 'refund';
  /** Actual cost incurred for this style (includes failed-tier attempts + verifier). */
  costInr: number;
  durationMs: number;
  /** Prompt sent to the winning tier — useful for debugging. */
  prompt: string;
  error: string | null;
  /**
   * For tier === 'refund' only: whether the final failure was transient
   * (retryable) or permanent. Drives the worker's refund-vs-retry gate.
   */
  errorClass?: FailureClass;
  /** Defect check fail reason (when Pro output was rejected before fallback). */
  tier1DefectReason?: string | null;
  /** Always 1 under the one-shot policy (kept for telemetry compatibility). */
  attempts?: number;
}

export interface ProductionResult {
  orderId: string;
  styleResults: StyleResult[];
  /** V1.1 Creative Brief (null if step failed or was skipped — pipeline still runs). */
  creativeBrief: CreativeBrief | null;
  /** V1.2.1 — parsed customer instructions (null if user provided none). */
  parsedInstructions: PerStyleInstructionResult | null;
  /** Sum of per-style costs + creative brief overhead. */
  totalCostInr: number;
  /** RETAIL_PRICE_INR - totalCostInr */
  marginInr: number;
  marginPct: number;
  /** true if any style ended in 'refund' tier */
  needsRefund: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Apply post-processing and AI label. Non-fatal — on error returns raw buffer.
 */
async function finalize(buffer: Buffer, style: string): Promise<Buffer> {
  try {
    const processed = await postProcessFinal(buffer, style);
    return await addAILabel(processed);
  } catch {
    return buffer;
  }
}

/**
 * Run defect checks on raw Pro output (before post-processing).
 *
 * runDeterministicChecks already covers aspect, fill %, blur, duplication,
 * and color shift. We treat any pass=false as catastrophic and fall to GPT-2.
 *
 * Pure sharp, ~50-100ms, zero API cost.
 */
async function checkOutputForDefects(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
  style?: string,
): Promise<{ catastrophic: boolean; reason: string | null }> {
  try {
    const result = await runDeterministicChecks(inputBuffer, outputBuffer, style);
    if (!result.pass) {
      return { catastrophic: true, reason: result.failReason };
    }
    return { catastrophic: false, reason: null };
  } catch {
    // If we can't even check, assume it's fine — let it ship rather than
    // unnecessarily falling to expensive GPT-2.
    return { catastrophic: false, reason: null };
  }
}

// ---------------------------------------------------------------------------
// Per-style algorithm
// ---------------------------------------------------------------------------

async function processStyleWithChain(
  style: string,
  primaryBuffer: Buffer,
  referenceBuffers: Buffer[],
  userInstructions: string | undefined,
  productCategory: string | undefined,
  orderId: string,
  artDirection?: StyleArtDirection,
  productDescription?: string,
  brandName?: string,
  originalVoiceInstructions?: string,
  brandContext?: BrandContext,
  // Phase 21 — edge-case flags from Light Analyzer drive category addenda
  // (transparent / reflective metal / embroidery / etc.).
  edgeCaseFlags?: Record<string, boolean | undefined>,
  // One-shot upgrade — exact label/brand text transcribed by the Light
  // Analyzer, injected verbatim into the prompt so the model reproduces it
  // character for character instead of hallucinating typography.
  labelText?: string | null,
): Promise<StyleResult> {
  // Phase 21 — extract negatives from the per-style instruction text.
  // Deterministic regex pass (0ms); the verifier picks up what we miss.
  const negatives = extractNegatives(userInstructions);
  const styleStart = Date.now();
  // Phase 22 — every track goes through the hierarchical creative builder.
  // The legacy buildRevisionPrompt path (live before Phase 8 removed the
  // edit-after-delivery flow) is collapsed into the standard builder by
  // merging originalVoiceInstructions with userInstructions and routing
  // them through the USER INSTRUCTIONS section. style_anything_you_want
  // still delegates to its dedicated builder so the user's description
  // IS the creative direction rather than a stylistic addendum.
  const isRevision = !!(originalVoiceInstructions && userInstructions);
  const mergedUserInstructions = isRevision
    ? `Original ad constraints (still apply): ${originalVoiceInstructions!.trim()}\nRevision feedback (apply on top): ${userInstructions!.trim()}`
    : userInstructions;

  let prompt: string;
  if (style === 'style_anything_you_want') {
    prompt = buildAnythingYouWantCreativePrompt({
      style,
      productCategory,
      edgeCaseFlags,
      productDescription,
      brandName,
      brandContext,
      userInstructions: mergedUserInstructions,
      negativeConstraints: negatives,
      labelText,
    });
  } else {
    prompt = buildCreativePrompt({
      style,
      productCategory,
      edgeCaseFlags,
      productDescription,
      brandName,
      brandContext,
      artDirection,
      userInstructions: mergedUserInstructions,
      negativeConstraints: negatives,
      labelText,
    });
  }
  let accumulatedCost = 0;
  let tier1DefectReason: string | null = null;

  // ---- Tier 1: Pro -----------------------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier1_start',
      orderId,
      style,
      productCategory: productCategory ?? 'unspecified',
      model: TIER1_MODEL,
    }));

    const gen = await withTimeout(
      geminiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        temperature: TIER1_TEMPERATURE,
        // V1.2 Identity anchoring — primary buffer passed 3× as references.
        // Pro accepts up to 16 reference images; tripling the primary
        // reinforces "this is the product, preserve it exactly" without any
        // cost increase. Combined with the preservation clause in the prompt,
        // this fixes Monster-style identity drift on rare product variants.
        referenceImageBuffers: [primaryBuffer, primaryBuffer, ...referenceBuffers],
        model: TIER1_MODEL,
      }),
      GEMINI_TIER_TIMEOUT_MS,
      `Tier 1 Pro (${style})`,
    );

    // Defect check on RAW Pro output (before post-processing). Post-processing
    // adds the "AI Generated" label which would skew an input/output NCC.
    const defect = await checkOutputForDefects(primaryBuffer, gen.imageBuffer, style);

    if (!defect.catastrophic) {
      // One-shot policy: the deterministic check passed, so this IS the
      // deliverable. No LLM verifier, no retry, no second generation — the
      // prompt (fidelity hierarchy + exact label text + identity anchoring)
      // is the entire quality mechanism.
      const finalized = await finalize(gen.imageBuffer, style);
      const outputUrl = await uploadToStorage(
        finalized,
        `production_${orderId}_${style}_tier1_${Date.now()}.jpg`,
      );
      const costInr = accumulatedCost + COST_INR.geminiProImage;

      const result: StyleResult = {
        style,
        outputUrl,
        tier: 1,
        model: 'gemini-3-pro-image-preview',
        costInr,
        durationMs: Date.now() - styleStart,
        prompt,
        error: null,
        tier1DefectReason: null,
        attempts: 1,
      };

      console.info(JSON.stringify({
        event: 'production_style_complete',
        orderId,
        style,
        tier: 1,
        model: TIER1_MODEL,
        costInr,
        durationMs: result.durationMs,
        oneShot: true,
        error: null,
      }));

      return result;
    }

    tier1DefectReason = defect.reason;
    console.warn(JSON.stringify({
      event: 'production_tier1_defect',
      orderId,
      style,
      reason: defect.reason,
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : String(err);
    tier1DefectReason = reason;
    console.warn(JSON.stringify({
      event: 'production_tier1_failed',
      orderId,
      style,
      reason,
    }));
  }
  accumulatedCost += COST_INR.geminiProImage;

  // ---- One-shot policy: the single Gemini attempt failed → refund. ----------
  // No tier 2, no retry, no re-queue. Every failure is classified 'permanent'
  // so the worker refunds immediately instead of holding the order in the
  // 45-minute transient window — the seller hears "not working right now"
  // and gets their money back, and we never spend on a second generation.
  const failReason = tier1DefectReason ?? 'Gemini generation failed';

  console.error(JSON.stringify({
    event: 'production_oneshot_failed',
    orderId,
    style,
    reason: failReason.slice(0, 200),
  }));

  const result: StyleResult = {
    style,
    outputUrl: null,
    tier: 'refund',
    model: 'refund',
    costInr: accumulatedCost,
    durationMs: Date.now() - styleStart,
    prompt,
    error: failReason.slice(0, 300),
    errorClass: 'permanent',
    tier1DefectReason,
  };

  console.info(JSON.stringify({
    event: 'production_style_complete',
    orderId,
    style,
    tier: 'refund',
    model: 'refund',
    oneShot: true,
    costInr: accumulatedCost,
    durationMs: result.durationMs,
    error: failReason.slice(0, 200),
  }));

  return result;
}

// ---------------------------------------------------------------------------
// Public API: processStyleProduction
// ---------------------------------------------------------------------------

/**
 * Process a single style through the production V1.1 chain.
 * Exposed for the never-fail-pipeline thin wrapper.
 *
 * artDirection (V1.1, optional): per-style creative direction generated by
 * the Creative Brief step at order level. When omitted, falls back to V1
 * base Beta prompt — proven working.
 */
export async function processStyleProduction(params: {
  style: string;
  primaryBuffer: Buffer;
  referenceBuffers: Buffer[];
  /** Kept for signature compatibility — Beta prompt ignores productName. */
  productName?: string;
  productCategory?: string;
  userInstructions?: string;
  originalVoiceInstructions?: string;
  orderId?: string;
  artDirection?: StyleArtDirection;
  productDescription?: string;
  brandName?: string;
  brandContext?: BrandContext;
  /**
   * Phase 21 — Light Analyzer edge-case flags. When provided, drive
   * EDGE_CASE_RULES addenda inside the category section of the prompt.
   * Worker / never-fail-pipeline calls lightAnalyze upstream and forwards
   * the booleans here. Omit to skip edge-case addenda entirely (V1 default).
   */
  edgeCaseFlags?: Record<string, boolean | undefined>;
  /** One-shot upgrade — exact label text from the Light Analyzer. */
  labelText?: string | null;
}): Promise<StyleResult> {
  const orderId = params.orderId ?? randomBytes(4).toString('hex');
  return processStyleWithChain(
    params.style,
    params.primaryBuffer,
    params.referenceBuffers,
    params.userInstructions,
    params.productCategory,
    orderId,
    params.artDirection,
    params.productDescription,
    params.brandName,
    params.originalVoiceInstructions,
    params.brandContext,
    params.edgeCaseFlags,
    params.labelText,
  );
}

// ---------------------------------------------------------------------------
// Public API: processOrderProduction
// ---------------------------------------------------------------------------

/**
 * Process a full order — multiple styles in parallel.
 *
 * Used by admin UI for direct testing. The worker calls processImageNeverFail
 * (per-style) which routes through processStyleProduction.
 */
export async function processOrderProduction(
  params: ProductionParams,
): Promise<ProductionResult> {
  const orderStart = Date.now();
  const orderId = randomBytes(4).toString('hex');

  // ---- Resolve primary + reference buffers ----------------------------------
  let primaryBuffer: Buffer;
  let referenceBuffers: Buffer[] = [];

  if (params.imageBuffers && params.imageBuffers.length > 0) {
    // Buffers provided directly (admin UI path)
    try {
      const pp = await preprocessImage(params.imageBuffers[0]!);
      primaryBuffer = pp.buffer;
    } catch {
      primaryBuffer = params.imageBuffers[0]!;
    }
    referenceBuffers = params.imageBuffers.slice(1);
  } else {
    // Download from URL (worker path)
    const raw = await downloadBuffer(params.imageUrl);
    try {
      const pp = await preprocessImage(raw);
      primaryBuffer = pp.buffer;
    } catch {
      primaryBuffer = raw;
    }
  }

  // ---- V1.2.1: Parse customer instructions per-style -----------------------
  // If the user provided free-form instructions ("model ko Asian banao aur
  // colored studio ko green"), this Gemini Flash call splits them into
  // per-style + global buckets. Hinglish-aware. Falls back to "apply raw
  // to everything" on any error.
  const rawInstructions = params.userInstructions ?? params.voiceInstructions;
  let parsedInstructions: PerStyleInstructionResult | null = null;
  let parsedCostInr = 0;

  if (rawInstructions && rawInstructions.trim().length > 0) {
    const parseStart = Date.now();
    parsedInstructions = await parsePerStyleInstructions({
      rawInstructions,
      styles: params.styles,
    });
    parsedCostInr = COST_INR.instructionParse;

    console.info(JSON.stringify({
      event: 'production_instructions_parsed',
      orderId,
      confidence: parsedInstructions.confidence,
      hasGlobal: !!parsedInstructions.globalInstruction,
      perStyleHits: Object.entries(parsedInstructions.perStyle)
        .filter(([_, v]) => v && v.trim().length > 0)
        .map(([s]) => s),
      durationMs: Date.now() - parseStart,
      costInr: parsedCostInr,
    }));
  }

  // ---- V1.1: Creative Brief (per-product art direction) --------------------
  // Single Gemini Flash call analyzes the product photos + generates per-style
  // creative direction. V1.2.1 — also passes parsed instructions so the brief
  // LLM can weave them into its per-style direction. On any failure, returns
  // null and the pipeline falls through to V1 base Beta prompt.
  const briefStart = Date.now();
  const allBuffers = [primaryBuffer, ...referenceBuffers];
  const creativeBrief = await generateCreativeBrief({
    buffers: allBuffers,
    styles: params.styles,
    productCategory: params.productCategory,
    perStyleInstructions: parsedInstructions?.perStyle,
    globalInstruction: parsedInstructions?.globalInstruction,
  });
  const briefDurationMs = Date.now() - briefStart;
  const briefCostInr = creativeBrief ? COST_INR.creativeBrief : 0;

  console.info(JSON.stringify({
    event: 'production_creative_brief',
    orderId,
    briefHit: creativeBrief !== null,
    productType: creativeBrief?.profile.productType.slice(0, 80) ?? null,
    durationMs: briefDurationMs,
    costInr: briefCostInr,
  }));

  // ---- Per-style instruction routing ----------------------------------------
  // For each style, combine global + per-style instruction (if parsed). If
  // parsing wasn't run (no user input), pass undefined → no instruction.
  // If parsing ran but produced fallback (raw → globalInstruction),
  // every style gets the raw text — preserves V1.1 behavior on parser failure.
  function instructionForStyle(style: string): string | undefined {
    if (!parsedInstructions) return undefined;
    const perStyle = parsedInstructions.perStyle[style];
    const global = parsedInstructions.globalInstruction;
    const parts = [global, perStyle].filter((s): s is string => !!s && s.trim().length > 0);
    return parts.length > 0 ? parts.join('. ') : undefined;
  }

  // ---- Run all styles in parallel -------------------------------------------
  // Phase 20 — branch on track per style. Strict styles (White Studio) skip
  // the generative pipeline entirely; on cutout failure they fall through to
  // the creative chain so we always ship something.
  const styleResults = await Promise.all(
    params.styles.map(async (style) => {
      if (isStrictStyle(style)) {
        const strict = await processStrictStyle({ orderId, style, primaryBuffer });
        if (strict.ok) {
          const finalized = await finalize(strict.buffer, style);
          const outputUrl = await uploadToStorage(
            finalized,
            `production_${orderId}_${style}_strict_${Date.now()}.jpg`,
          );
          return {
            style,
            outputUrl,
            tier: 1 as const,                  // strict is implicitly Tier 1
            model: 'gemini-3-pro-image-preview' as const, // shared StyleResult type; track is implied by costInr
            costInr: strict.costInr,
            durationMs: strict.timings.totalMs,
            prompt: `[strict track] ${style}`,
            error: null,
            tier1DefectReason: null,
            attempts: 1,
            verification: null,
            acceptedDespiteDrift: false,
          };
        }
        console.warn(JSON.stringify({
          event: 'strict_to_creative_fallback',
          orderId, style, reason: strict.fallbackReason,
        }));
        // Fall through to the creative chain so the order still ships.
      }
      return processStyleWithChain(
        style,
        primaryBuffer,
        referenceBuffers,
        instructionForStyle(style),
        params.productCategory,
        orderId,
        creativeBrief?.directions[style],
        creativeBrief?.profile.productType,
        params.brandName,
        undefined, // originalVoiceInstructions — not passed in order-level path
        params.brandContext,
        // Phase 21 — edge-case flags from caller (worker can call lightAnalyze
        // upstream and forward them). undefined → category rule fires without
        // edge-case addenda.
        params.edgeCaseFlags,
      );
    }),
  );

  // ---- Aggregate metrics ----------------------------------------------------
  const styleCostInr = styleResults.reduce((sum, r) => sum + r.costInr, 0);
  const totalCostInr = Number((styleCostInr + briefCostInr + parsedCostInr).toFixed(2));
  // Retail = Rs 49 per image (the live price). Margin telemetry is per-order.
  const retailInr = RETAIL_PRICE_INR * params.styles.length;
  const marginInr = Number((retailInr - totalCostInr).toFixed(2));
  const marginPct = Number(((marginInr / retailInr) * 100).toFixed(1));
  const needsRefund = styleResults.some(r => r.tier === 'refund');

  const tier1Count = styleResults.filter(r => r.tier === 1).length;
  const tier2Count = 0; // one-shot policy — tier 2 removed
  const refundCount = styleResults.filter(r => r.tier === 'refund').length;

  // Phase 23 — runaway-cost alert.
  alertCostCeilingBreach({
    orderId,
    totalCostInr,
    styleCount: params.styles.length,
  });

  const result: ProductionResult = {
    orderId,
    styleResults,
    creativeBrief,
    parsedInstructions,
    totalCostInr,
    marginInr,
    marginPct,
    needsRefund,
    durationMs: Date.now() - orderStart,
  };

  console.info(JSON.stringify({
    event: 'production_order_complete',
    orderId,
    totalCostInr,
    briefCostInr,
    parsedCostInr,
    marginInr,
    marginPct,
    needsRefund,
    briefHit: creativeBrief !== null,
    instructionsParsed: parsedInstructions !== null,
    tier1Count,
    tier2Count,
    refundCount,
    durationMs: result.durationMs,
  }));

  return result;
}

