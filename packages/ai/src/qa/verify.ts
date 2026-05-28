/**
 * Phase 19 — drift detection via Gemini 2.5 Flash vision.
 *
 * Runs AFTER the existing runDeterministicChecks (qa/deterministic-checks.ts).
 * Deterministic checks are the gate — if they catch a hard fail (blur,
 * blank canvas, severe color drift), we skip the LLM call entirely and let
 * the caller retry directly. If deterministic checks pass, the LLM verifier
 * runs to catch nuanced drift the pixel-level checks can't see:
 *   - logo / text rotated, simplified, or missing
 *   - shape proportions altered
 *   - secondary objects invented
 *   - explicit negatives violated
 *
 * Returns a structured result the caller uses to decide retry vs accept.
 * Cost: ~₹0.10 per call. Latency: ~2-3s. Hard 10s timeout.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const VerificationResultSchema = z.object({
  /** True if the product identity is preserved within reasonable tolerance. */
  identityPreserved: z.boolean().catch(true),
  /** 0-100. 0 = perfect, 100 = completely different product. */
  driftScore: z.number().int().min(0).max(100).catch(0),
  /** Short reason list explaining the drift score. Empty on pass. */
  driftReasons: z.array(z.string()).max(8).catch([]),
  /** Subset of input `negatives` the verifier found in the output. */
  negativesViolated: z.array(z.string()).max(20).catch([]),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export interface VerifyParams {
  /** Original product photo — source of truth. */
  inputBuffer: Buffer;
  /** Generated ad buffer. */
  outputBuffer: Buffer;
  /** Negatives extracted from the user's instruction. Empty array if none. */
  negatives?: string[];
  /** Optional context for the verifier prompt (style id, category). */
  hints?: {
    style?: string;
    category?: string;
  };
}

// ---------------------------------------------------------------------------
// Tunable thresholds — Phase 19 default. May be adjusted from real data.
// ---------------------------------------------------------------------------

/** Drift scores above this trigger a retry. */
export const DRIFT_THRESHOLD = 30;

const TIMEOUT_MS = 10_000;
const MODEL = 'gemini-2.5-flash';
const TEMPERATURE = 0;

// ---------------------------------------------------------------------------
// Decision helpers — kept here so callers don't reinvent the policy
// ---------------------------------------------------------------------------

/**
 * Should the caller retry? True when drift exceeds the threshold OR any
 * explicit negative was violated.
 */
export function shouldRetry(v: VerificationResult): boolean {
  return v.driftScore > DRIFT_THRESHOLD || v.negativesViolated.length > 0;
}

/**
 * Hard cap: after 1 retry, we accept whatever we have. Refund is more
 * expensive than minor drift (plan §Locked decisions).
 */
export function shouldAccept(v: VerificationResult, attemptNumber: number): boolean {
  if (attemptNumber >= 2) return true;
  return !shouldRetry(v);
}

// ---------------------------------------------------------------------------
// Verifier — the call
// ---------------------------------------------------------------------------

/**
 * Compare the generated image to the input. Returns drift + negatives report.
 *
 * On any error (timeout, API failure, malformed JSON) we return a permissive
 * result — driftScore=0, no negatives violated — so the caller accepts the
 * generation rather than thrashing retries. The error is logged.
 */
export async function verifyGeneration(params: VerifyParams): Promise<VerificationResult> {
  const { inputBuffer, outputBuffer, negatives = [], hints } = params;

  const cleanedNegatives = negatives.map((n) => n.trim()).filter(Boolean);
  const prompt = buildVerifierPrompt(cleanedNegatives, hints);

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`verifyGeneration timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
  );

  let rawText = '';
  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Reference (input) photo:' },
              { inlineData: { mimeType: 'image/jpeg' as const, data: inputBuffer.toString('base64') } },
              { text: 'Generated (output) image:' },
              { inlineData: { mimeType: 'image/jpeg' as const, data: outputBuffer.toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        config: { temperature: TEMPERATURE },
      }),
      timeoutPromise,
    ]);

    const candidates = response.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];
    for (const part of parts) {
      const text = (part as { text?: string }).text;
      if (text) rawText += text;
    }

    const cleaned = stripJsonFences(rawText.trim());
    const parsed = JSON.parse(cleaned);
    return VerificationResultSchema.parse(parsed);
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'verify_generation_failed',
      error: err instanceof Error ? err.message : String(err),
      rawTextPreview: rawText.slice(0, 200),
    }));
    // Fail-open: we accept rather than refund on verifier failure. The
    // caller's deterministic check already weeded out the catastrophic
    // failures; nuanced drift slipping through is preferable to a wasted
    // retry budget.
    return { identityPreserved: true, driftScore: 0, driftReasons: [], negativesViolated: [] };
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildVerifierPrompt(negatives: string[], hints: VerifyParams['hints']): string {
  const negativeBlock = negatives.length > 0
    ? `\n\nNEGATIVE CONSTRAINTS — the user explicitly said the output MUST NOT contain any of:\n${negatives.map((n) => `- ${n}`).join('\n')}\n\nFor each, check the generated image carefully. List ones that appear in negativesViolated.`
    : '\n\nNo explicit negative constraints to check.';

  const hintBlock = hints
    ? `\nGenerated style: ${hints.style ?? 'unspecified'} (style context, not a constraint to score against).\nProduct category: ${hints.category ?? 'unspecified'}.`
    : '';

  return `You are a product-fidelity QA reviewer for an ecommerce ad generator.

Compare the GENERATED image to the REFERENCE photo.${hintBlock}

Score how faithfully the product identity is preserved. Identity = exact shape, color, materials, logos, text, packaging, proportions. The background, lighting, and scene composition are EXPECTED to differ — only the product itself must remain unchanged.${negativeBlock}

Respond ONLY with this JSON shape (no markdown fences, no commentary):
{
  "identityPreserved": boolean,
  "driftScore": number,        // 0-100; 0 = perfect, 100 = completely different product
  "driftReasons": string[],    // 0-8 short reasons explaining the score; empty when 0
  "negativesViolated": string[]  // subset of the listed negatives that appear in the generated image
}

Scoring guide:
- 0-15: imperceptible drift, product is the same.
- 16-30: minor drift (slight color tint, small detail loss) — still usable.
- 31-50: noticeable drift (logo slightly off, proportions wrong) — retry recommended.
- 51-80: major drift (wrong color, missing details, distorted shape).
- 81-100: completely different product or unusable output.`;
}

function stripJsonFences(s: string): string {
  // Some models still wrap JSON in ```json ... ``` fences despite the prompt.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  return s;
}
