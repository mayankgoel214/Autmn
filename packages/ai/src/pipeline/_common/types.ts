/**
 * Shared pipeline types — single source of truth for cross-module shapes.
 * Originally extracted from orchestrator.ts (V1).
 */

// ---------------------------------------------------------------------------
// Creative-brief output shapes (consumed by prompt-builder.ts + production.ts)
//
// Lifted out of style-prompts-v5.ts during the Phase 22 cleanup so the new
// hierarchical prompt builder is no longer a dependent of the soon-to-be-
// deleted legacy file.
// ---------------------------------------------------------------------------

/**
 * Per-style art direction emitted by the Creative Brief step (V1.1+).
 * Threaded into prompt-builder.ts via params.artDirection.
 */
export interface StyleArtDirection {
  /** 10-25 word concrete scene: where + what's happening + key visual element. */
  sceneDirection: string;
  /** 3-7 word emotional/visual tone (e.g. "warm and aspirational"). */
  moodAnchor: string;
}

/**
 * Per-user brand context (Phase 5) — derived from BrandProfile +
 * BrandSummaryVersion in packages/session/src/brand-context.ts. Threaded
 * through every prompt builder so the LLM has the user's brand identity as
 * a stylistic anchor. Every field is optional; an empty BrandContext is
 * treated identically to undefined.
 */
export interface BrandContext {
  /** Free-text summary written by generateSummary (Phase 3b). */
  summary?: string;
  /** Brand tagline. */
  tagline?: string;
  /** 2-6 brand colours as colour names or hex codes. */
  brandColors?: string[];
  /** 2-4 word brand vibe ("minimalist luxury", "playful festive", etc.). */
  vibe?: string;
}

// ---------------------------------------------------------------------------
// Legacy pipeline shapes (used by never-fail-pipeline.ts)
// ---------------------------------------------------------------------------

export interface ProcessImageParams {
  imageUrl: string;
  style?: string;
  productCategory?: string;
  brandName?: string;
  voiceInstructions?: string;
  /** Original order voice instructions — set on revision jobs to preserve first-generation constraints. */
  originalVoiceInstructions?: string;
  maxAttempts?: number;
  /** Pre-computed multi-angle product profile. Passed from worker when the order has
   *  multiple input images. The V3 pipeline uses this to skip redundant analysis and
   *  to provide richer context about all angles of the product. */
  productProfile?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ProcessImageResult {
  outputUrl: string;
  outputBuffer?: Buffer;
  storyUrl?: string;
  videoUrl?: string;
  cutoutUrl?: string;
  studioShotUrl?: string;
  qaScore: number;
  pipeline: 'composite' | 'styled-studio-fallback' | 'primary';
  attempts: number;
  durationMs: number;
  inputAssessment?: { usable: boolean; productCategory: string };
  // productAnalysis was typed against the V1 ProductAnalysis from product-analyzer.ts (now deleted).
  // V5 and never-fail pipelines do not populate this field.
  productAnalysis?: unknown;
  adPrompt?: string;
  rejected?: boolean;
  rejectionReason?: string;
  /** The creative direction actually used during generation — returned so the worker
   *  can cache it per-style regardless of whether the profile already had it. */
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
