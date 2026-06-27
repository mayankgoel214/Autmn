/**
 * Production V1 — ad-engineered pipeline.
 *
 * Per style:
 *   Tier 1: gemini-3-pro-image-preview   ($0.134 / ₹13.40)
 *   Tier 2: gpt-image-2                  ($0.21 / ₹21.00)
 *   Refund: both tiers failed
 *
 * No NB2 middle tier — when Pro safety-refuses, NB2 ~95% refuses too
 * (shared backend), so paying ₹4.50 to almost-never-succeed is wasted spend.
 * GPT-2 has independent safety filters, making it an actually-useful backup.
 *
 * No QA gate. No content-safety preflight. No Art Director. No light
 * analysis (Beta prompt ignores productName). All deliberately removed
 * after V5 over-generation experiments showed the gains were not worth
 * the cost or the latency.
 *
 * Reliability levers (all zero added cost):
 *   - Beta prompt (ad-engineered): style + ad-mode + per-category nudge
 *   - Identity anchoring: input duplicated as the first reference image
 *   - Temperature 0.3: more conservative, less product drift
 *   - Aspect 1:1 forced in prompt (consistent across 3 styles in an order)
 *   - Deterministic defect check on raw Pro output (sharp-only, ~50ms):
 *     blur, blank, wrong aspect, product duplication, color shift, fill %
 *
 * Runs all 3 style jobs in Promise.all — they're independent.
 */

import { randomBytes } from 'crypto';
import { geminiGenerateImage } from './gemini-generate.js';
import { openaiGenerateImage } from './openai-generate.js';
import { postProcessFinal, addAILabel, downloadBuffer, uploadToStorage } from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { verifyGeneration, shouldRetry, type VerificationResult } from '../qa/verify.js';
import { processStrictStyle, isStrictStyle, STRICT_COST_INR } from '../strict/index.js';
import { alertCostCeilingBreach, recordTier2Fire } from '../monitoring/alerts.js';
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
  openaiGptImage2: 21.00,     // $0.21 standard quality — gpt-image-2
  creativeBrief: 0.10,        // ~$0.001 — gemini-2.5-flash with photos + structured output
  instructionParse: 0.05,     // ~$0.0005 — gemini-2.5-flash text-only
  verify: 0.10,               // Phase 19 — gemini-2.5-flash vision compare
} as const;

const RETAIL_PRICE_INR = 99;

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const TIER1_MODEL = 'gemini-3-pro-image-preview';
const TIER2_MODEL = 'gpt-image-2';

// ---------------------------------------------------------------------------
// Generation parameters
// ---------------------------------------------------------------------------

const TIER1_TEMPERATURE = 0.3;     // conservative, faithful to input
const GEMINI_TIER_TIMEOUT_MS = 3 * 60 * 1000;  // 3 minutes
const OPENAI_TIER_TIMEOUT_MS = 150_000;         // 150s — GPT can be slow

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
  // ---------------------------------------------------------------------
  // Phase 19 — verification + retry observability
  // ---------------------------------------------------------------------
  /** Number of Tier 1 attempts spent on this style. 1 = no retry, 2 = one retry. */
  attempts?: number;
  /** Verification result from the winning attempt. Null if verifier didn't run. */
  verification?: VerificationResult | null;
  /** True if we accepted the output despite the verifier flagging drift. */
  acceptedDespiteDrift?: boolean;
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
      // Phase 19 — LLM drift detection after the deterministic pre-filter.
      // The deterministic check already rejected blur/blank/severe-color
      // drift; the LLM looks for nuanced drift (rotated logo, wrong text,
      // invented secondary objects, explicit-negative violations).
      let verified: { buffer: Buffer; verification: VerificationResult; attempts: number; acceptedDespiteDrift: boolean };
      try {
        verified = await runVerifierWithRetry({
          orderId,
          style,
          prompt,
          primaryBuffer,
          referenceBuffers,
          firstBuffer: gen.imageBuffer,
          // Phase 21 — negatives from extractNegatives feed the verifier so
          // it explicitly checks for violations in the output.
          negatives,
          category: productCategory,
        });
        // Each verifier call + each Tier 1 retry both bump cost.
        accumulatedCost += COST_INR.verify * verified.attempts;
        accumulatedCost += COST_INR.geminiProImage * (verified.attempts - 1);
      } catch (verifyErr) {
        // Verifier path threw (very rare — even timeout returns a permissive
        // result). Fall back to the original buffer + a synthetic pass.
        console.warn(JSON.stringify({
          event: 'production_verifier_path_failed',
          orderId, style,
          reason: verifyErr instanceof Error ? verifyErr.message.slice(0, 200) : String(verifyErr),
        }));
        verified = {
          buffer: gen.imageBuffer,
          verification: { identityPreserved: true, driftScore: 0, driftReasons: [], negativesViolated: [] },
          attempts: 1,
          acceptedDespiteDrift: false,
        };
      }

      const finalized = await finalize(verified.buffer, style);
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
        attempts: verified.attempts,
        verification: verified.verification,
        acceptedDespiteDrift: verified.acceptedDespiteDrift,
      };

      console.info(JSON.stringify({
        event: 'production_style_complete',
        orderId,
        style,
        tier: 1,
        model: TIER1_MODEL,
        costInr,
        durationMs: result.durationMs,
        attempts: verified.attempts,
        driftScore: verified.verification.driftScore,
        acceptedDespiteDrift: verified.acceptedDespiteDrift,
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

  // ---- Tier 2: OpenAI GPT Image 2 -------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier2_start',
      orderId,
      style,
      model: TIER2_MODEL,
      tier1FailReason: tier1DefectReason,
    }));

    const gen = await withTimeout(
      openaiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        referenceImageBuffers: referenceBuffers.length > 0 ? referenceBuffers : undefined,
        model: TIER2_MODEL,
      }),
      OPENAI_TIER_TIMEOUT_MS,
      `Tier 2 OpenAI (${style})`,
    );

    const finalized = await finalize(gen.imageBuffer, style);
    const outputUrl = await uploadToStorage(
      finalized,
      `production_${orderId}_${style}_tier2_${Date.now()}.jpg`,
    );
    const costInr = accumulatedCost + COST_INR.openaiGptImage2;

    const result: StyleResult = {
      style,
      outputUrl,
      tier: 2,
      model: 'gpt-image-2',
      costInr,
      durationMs: Date.now() - styleStart,
      prompt,
      error: null,
      tier1DefectReason,
    };

    console.info(JSON.stringify({
      event: 'production_style_complete',
      orderId,
      style,
      tier: 2,
      model: TIER2_MODEL,
      costInr,
      durationMs: result.durationMs,
      error: null,
    }));

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    accumulatedCost += COST_INR.openaiGptImage2;
    // Classify the FINAL (Tier 2) error. tier1DefectReason is folded in so a
    // permanent Tier-1 signal (e.g. safety block) still surfaces as permanent
    // even if Tier 2 failed transiently.
    const errorClass = classifyFailure(`${errMsg}\n${tier1DefectReason ?? ''}`);

    console.error(JSON.stringify({
      event: 'production_tier2_failed',
      orderId,
      style,
      reason: errMsg.slice(0, 200),
      errorClass,
    }));

    // Both tiers failed — refund
    const result: StyleResult = {
      style,
      outputUrl: null,
      tier: 'refund',
      model: 'refund',
      costInr: accumulatedCost,
      durationMs: Date.now() - styleStart,
      prompt,
      error: errMsg.slice(0, 300),
      errorClass,
      tier1DefectReason,
    };

    console.info(JSON.stringify({
      event: 'production_style_complete',
      orderId,
      style,
      tier: 'refund',
      model: 'refund',
      costInr: accumulatedCost,
      durationMs: result.durationMs,
      error: errMsg.slice(0, 200),
    }));

    return result;
  }
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
  const marginInr = Number((RETAIL_PRICE_INR - totalCostInr).toFixed(2));
  const marginPct = Number(((marginInr / RETAIL_PRICE_INR) * 100).toFixed(1));
  const needsRefund = styleResults.some(r => r.tier === 'refund');

  const tier1Count = styleResults.filter(r => r.tier === 1).length;
  const tier2Count = styleResults.filter(r => r.tier === 2).length;
  const refundCount = styleResults.filter(r => r.tier === 'refund').length;

  // Phase 23 — runaway-cost alert + Tier-2 burst tracker.
  alertCostCeilingBreach({
    orderId,
    totalCostInr,
    styleCount: params.styles.length,
  });
  for (const r of styleResults.filter(r => r.tier === 2)) {
    recordTier2Fire({ orderId, style: r.style, reason: r.tier1DefectReason ?? undefined });
  }

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

// ---------------------------------------------------------------------------
// Phase 19 — verifier + bounded retry
// ---------------------------------------------------------------------------

interface VerifierRetryParams {
  orderId: string;
  style: string;
  prompt: string;
  primaryBuffer: Buffer;
  referenceBuffers: Buffer[];
  /** Output from the first Tier 1 attempt (already past deterministic check). */
  firstBuffer: Buffer;
  /** Explicit negatives from instruction parser (Phase 21 will populate). */
  negatives: string[];
  category: string | undefined;
}

interface VerifierRetryResult {
  /** The accepted output buffer (first attempt if no retry, second if retry replaced it). */
  buffer: Buffer;
  /** Verification result for the accepted buffer. */
  verification: VerificationResult;
  /** Total Tier 1 attempts spent (1 or 2). */
  attempts: number;
  /** True when we accepted a drifted output because the retry cap was hit. */
  acceptedDespiteDrift: boolean;
}

/**
 * Run the LLM verifier on the first generation. On drift, retry Tier 1 once.
 * Whichever output we end up with — verified pass OR second drifted attempt —
 * is what we ship. Per plan §Locked decisions: "Drift detected after retry →
 * accept and deliver" (refund is more expensive than minor drift).
 *
 * Retry uses the same prompt + reference set (no prompt rewrite — that would
 * conflate "did the model misbehave" with "did the prompt change"). Caller
 * accounts for cost.
 */
async function runVerifierWithRetry(params: VerifierRetryParams): Promise<VerifierRetryResult> {
  const { orderId, style, prompt, primaryBuffer, referenceBuffers, firstBuffer, negatives, category } = params;

  // Attempt 1 — verify the buffer the caller already produced.
  const v1 = await verifyGeneration({
    inputBuffer: primaryBuffer,
    outputBuffer: firstBuffer,
    negatives,
    hints: { style, category },
  });

  if (!shouldRetry(v1)) {
    return { buffer: firstBuffer, verification: v1, attempts: 1, acceptedDespiteDrift: false };
  }

  console.info(JSON.stringify({
    event: 'production_verifier_retry_triggered',
    orderId, style,
    driftScore: v1.driftScore,
    driftReasons: v1.driftReasons,
    negativesViolated: v1.negativesViolated,
  }));

  // Attempt 2 — single Tier 1 retry. Failures here (safety refusal,
  // timeout) fall back to the first attempt; better than nothing.
  let retryBuffer: Buffer | null = null;
  try {
    const retryGen = await withTimeout(
      geminiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        temperature: TIER1_TEMPERATURE,
        referenceImageBuffers: [primaryBuffer, primaryBuffer, ...referenceBuffers],
        model: TIER1_MODEL,
      }),
      GEMINI_TIER_TIMEOUT_MS,
      `Tier 1 retry (${style})`,
    );

    const retryDefect = await checkOutputForDefects(primaryBuffer, retryGen.imageBuffer, style);
    if (retryDefect.catastrophic) {
      // Retry produced a worse output than the first — keep the first.
      console.warn(JSON.stringify({
        event: 'production_verifier_retry_defect',
        orderId, style, reason: retryDefect.reason,
      }));
      return { buffer: firstBuffer, verification: v1, attempts: 2, acceptedDespiteDrift: true };
    }
    retryBuffer = retryGen.imageBuffer;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'production_verifier_retry_failed',
      orderId, style,
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
    }));
    return { buffer: firstBuffer, verification: v1, attempts: 2, acceptedDespiteDrift: true };
  }

  // Verify the retry. Whatever it scores, we ship it (hard cap).
  const v2 = await verifyGeneration({
    inputBuffer: primaryBuffer,
    outputBuffer: retryBuffer,
    negatives,
    hints: { style, category },
  });
  const acceptedDespiteDrift = shouldRetry(v2);
  if (acceptedDespiteDrift) {
    console.warn(JSON.stringify({
      event: 'production_verifier_retry_still_drift',
      orderId, style,
      driftScore: v2.driftScore,
      driftReasons: v2.driftReasons,
      negativesViolated: v2.negativesViolated,
    }));
  } else {
    console.info(JSON.stringify({
      event: 'production_verifier_retry_pass',
      orderId, style, driftScore: v2.driftScore,
    }));
  }
  return { buffer: retryBuffer, verification: v2, attempts: 2, acceptedDespiteDrift };
}
