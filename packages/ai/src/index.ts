/**
 * @autmn/ai — Core AI pipeline package.
 *
 * Processes product photos into professional images for Indian SMB sellers
 * using a smart AI-driven approach:
 *   - Production pipeline: Beta prompt + Pro → Flash → GPT-2 fallback chain
 *   - Never-fail orchestrator: thin wrapper over production.ts
 *   - QA: deterministic sharp-based checks (no LLM QA gate in production)
 *   - Transcription: Groq Whisper Turbo with Sarvam AI fallback
 *   - Instruction parsing: Gemini 2.5 Flash Lite
 */

// ---------------------------------------------------------------------------
// Pipeline — main entry point (production)
// ---------------------------------------------------------------------------

export {
  processImageNeverFail,
  type NeverFailResult,
  type NeverFailParams,
} from './pipeline/never-fail-pipeline.js';

export {
  processOrderProduction,
  processStyleProduction,
  type ProductionParams,
  type ProductionResult,
  type StyleResult,
} from './pipeline/production.js';

export {
  generateCreativeBrief,
  type CreativeBrief,
  type ProductProfile,
  type StyleDirection,
} from './pipeline/creative-brief.js';

// Shared pipeline types
export type { ProcessImageParams, ProcessImageResult } from './pipeline/_common/types.js';

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export {
  runDeterministicChecks,
  type DeterministicResult,
} from './qa/deterministic-checks.js';

// ---------------------------------------------------------------------------
// Analysis + prompt building
// ---------------------------------------------------------------------------

export {
  lightAnalyze,
  type LightAnalysis,
} from './pipeline/light-analyzer.js';

// Phase 22 — buildBetaPrompt / buildRevisionPrompt / buildAnythingYouWantPrompt
// / formatBrandContextBlock retired alongside the deleted style-prompts-v5.ts.
// Use buildCreativePrompt / buildAnythingYouWantCreativePrompt from
// prompt-builder.ts instead. StyleArtDirection + BrandContext now live in
// _common/types.ts.
export type { StyleArtDirection, BrandContext } from './pipeline/_common/types.js';

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export {
  transcribeVoiceNote,
  transcribeWithGroq,
  transcribeWithSarvam,
  type TranscriptionResult,
} from './transcription/index.js';

// ---------------------------------------------------------------------------
// Instruction parsing
// ---------------------------------------------------------------------------

export {
  parseEditInstructions,
  type EditCommand,
} from './parsing/instructions.js';

export {
  parsePerPhotoInstructions,
  type InstructionParseResult,
} from './instructions/parse-per-photo.js';

export {
  parsePerStyleInstructions,
  type PerStyleInstructionResult,
} from './instructions/parse-per-style.js';

// Phase 21 — negative extractor (deterministic, no LLM call).
export {
  extractNegatives,
  extractNegativesPerStyle,
} from './instructions/extract-negatives.js';

// Phase 19 — verifier.
export {
  verifyGeneration,
  shouldRetry,
  shouldAccept,
  DRIFT_THRESHOLD,
  VerificationResultSchema,
  type VerificationResult,
  type VerifyParams,
} from './qa/verify.js';

// Phase 20 — strict track (segmentation + composite).
export {
  processStrictStyle,
  isStrictStyle,
  compositeOnBackground,
  WHITE_STUDIO_CONFIG,
  STRICT_COST_INR,
  type StrictTrackConfig,
  type StrictTrackResult,
} from './strict/index.js';

// Phase 23 — observability hooks (cost ceiling, keypool exhaustion, Tier-2 burst).
export {
  ALERT_COST_CEILING_INR,
  TIER2_BURST_THRESHOLD,
  alertCostCeilingBreach,
  alertKeyPoolExhausted,
  recordTier2Fire,
  _resetTier2BurstTracker,
} from './monitoring/alerts.js';

// V1 compromise #4 — Sentry transport for alert.* events. App entry
// points (apps/api, apps/worker) call initSentry() at startup; alerts.ts
// uses captureAlert internally.
export {
  initSentry,
  isSentryActive,
  captureException,
  type InitSentryOptions,
} from './monitoring/sentry.js';

// Phase 18 — hierarchical prompt builder + category rules.
export {
  buildCreativePrompt,
  buildAnythingYouWantCreativePrompt,
  type BuildCreativePromptParams,
} from './pipeline/prompt-builder.js';
export {
  CATEGORY_RULES,
  EDGE_CASE_RULES,
  normaliseCategory,
  getCategoryRule,
  buildEdgeCaseAddenda,
} from './pipeline/category-rules.js';

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

export {
  preprocessImage,
  type ImageMetadata,
} from './pipeline/preprocess.js';

// ---------------------------------------------------------------------------
// Shared image I/O helpers (used by worker)
// ---------------------------------------------------------------------------

export {
  downloadBuffer,
} from './pipeline/fallback.js';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export { detectLanguage, normalizeTranscriptionLang } from './language/detect.js';

// ---------------------------------------------------------------------------
// Voice interpretation
// ---------------------------------------------------------------------------

export { interpretVoiceNote, type VoiceInterpretResult } from './voice/interpret.js';

// ---------------------------------------------------------------------------
// OpenAI image generation (admin A/B testing)
// ---------------------------------------------------------------------------

export {
  openaiGenerateImage,
  type OpenAIGenerateParams,
  type OpenAIModelId,
} from './pipeline/openai-generate.js';

// ---------------------------------------------------------------------------
// Brand analysis (Phase 3b) — image / pdf / website / structured summary
// ---------------------------------------------------------------------------

export {
  analyzeImage,
  analyzePDF,
  scrapeWebsite,
  fetchHtml,
  generateSummary,
  parseBrandEdit,
  type AnalyzeImageParams,
  type ScrapeResult,
  type BrandSummary,
  type AssetDescriptor,
  type BrandEditPatch,
  type BrandEditField,
} from './brand/index.js';
