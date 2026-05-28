/**
 * Phase 4 — natural-language brand-profile edit parser.
 *
 * Input:  a free-form instruction the user typed in BRAND_DETAILS_EDITING,
 *         e.g. "change colors to red and gold", "tagline: handcrafted in India",
 *         "make the vibe more luxurious", "summary: family-run sweets shop".
 *
 * Output: a structured patch the handler applies directly to BrandProfile,
 *         or null when the parser is confident the instruction targets none
 *         of the four editable fields.
 *
 * Two layers:
 *   1. Fast regex (free, deterministic, smoke-test-friendly). Handles the
 *      common imperative shapes that account for most edits.
 *   2. Gemini 2.5 Flash structured-output fallback for everything the regex
 *      misses (creative phrasing, multi-instruction sentences, etc.). Skipped
 *      entirely when BRAND_ANALYSIS_DRY_RUN=true so smoke tests run offline.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';

export type BrandEditField = 'tagline' | 'brandColors' | 'vibe' | 'summary';

export interface BrandEditPatch {
  field: BrandEditField;
  /** Strings for tagline / vibe / summary; string[] for brandColors. */
  value: string | string[];
  /** Short, user-facing display of the new value (used in confirmations). */
  display: string;
  /** Original instruction, kept for BrandSummaryVersion.changeReason. */
  rawInstruction: string;
}

const TIMEOUT_MS = 20_000;
const MODEL = 'gemini-2.5-flash';

function isDryRun(): boolean {
  const v = process.env.BRAND_ANALYSIS_DRY_RUN;
  return v === 'true' || v === '1';
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseBrandEdit(text: string): Promise<BrandEditPatch | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Layer 1 — regex fast-path. Handles ~80% of real instructions, costs
  // nothing, and keeps the smoke test deterministic.
  const fast = parseFastRegex(trimmed);
  if (fast) return fast;

  // DRY_RUN never escalates to the real LLM — regex-only world.
  if (isDryRun()) return null;

  // Layer 2 — Gemini structured output.
  try {
    return await parseWithGemini(trimmed);
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'brand_edit_parse_llm_failed',
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      }),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Regex fast-path
// ---------------------------------------------------------------------------

const FIELD_HINTS: Record<BrandEditField, RegExp> = {
  // "color" matches British "colour" too via the optional u.
  brandColors: /\bcolou?rs?\b|\brang\b|\brangon\b/i,
  tagline: /\btagline\b|\btag\s*line\b|\bslogan\b/i,
  vibe: /\bvibe\b|\bmood\b|\bfeel\b/i,
  summary: /\bsummary\b|\bdescription\b|\babout\b/i,
};

function parseFastRegex(text: string): BrandEditPatch | null {
  // Try each field; first hint that matches wins.
  for (const field of ['brandColors', 'tagline', 'vibe', 'summary'] as const) {
    if (!FIELD_HINTS[field].test(text)) continue;
    const value = extractValueFor(field, text);
    if (value === null) continue;
    return buildPatch(field, value, text);
  }
  return null;
}

function extractValueFor(field: BrandEditField, text: string): string | null {
  // Common shapes:
  //   "change colors to red and gold"
  //   "set tagline to handcrafted in India"
  //   "tagline: handcrafted in India"
  //   "make the vibe more luxurious"
  //   "colors should be red, gold"
  // We look for the value AFTER the field hint, stripping common connector
  // words. If nothing comes after the hint, we treat the rest of the string
  // as the value.

  const lower = text.toLowerCase();
  const hintMatch = FIELD_HINTS[field].exec(lower);
  if (!hintMatch) return null;
  const afterHint = text.slice((hintMatch.index ?? 0) + hintMatch[0].length);

  // Strip leading connectors / punctuation.
  const stripped = afterHint
    .replace(/^[:\-,—]+/, '')
    .replace(/^\s*(should\s+be|to|is|are|more|less|=|as)\s+/i, '')
    .trim();

  if (stripped.length === 0) return null;
  // Cap length so a runaway paste doesn't blow out the column.
  return stripped.slice(0, 500);
}

function buildPatch(field: BrandEditField, value: string, raw: string): BrandEditPatch {
  if (field === 'brandColors') {
    const colors = value
      .split(/\s*,\s*|\s+and\s+|\s*\/\s*|\s+&\s+/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .slice(0, 6);
    return {
      field,
      value: colors,
      display: colors.join(', '),
      rawInstruction: raw,
    };
  }
  return {
    field,
    value,
    display: value,
    rawInstruction: raw,
  };
}

// ---------------------------------------------------------------------------
// Gemini structured-output fallback
// ---------------------------------------------------------------------------

async function parseWithGemini(text: string): Promise<BrandEditPatch | null> {
  const apiKey = getProviderKey('gemini');
  const genAI = new GoogleGenAI({ apiKey });

  const prompt = `You are parsing a single brand-profile edit instruction from an Indian SMB seller. Decide which ONE field they want to change and extract the new value.

Editable fields:
- tagline       (string, under ~50 chars)
- brandColors   (array of colour names or hex codes)
- vibe          (string, 2-4 words describing brand mood)
- summary       (1-3 sentence brand description)

Instruction:
"""${text}"""

If the instruction does not target one of the four fields, return field = "" (empty). Never invent values that are not present in the instruction.`;

  const result = await withTimeout(
    genAI.models.generateContent({
      model: MODEL,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            field: { type: Type.STRING },
            stringValue: { type: Type.STRING },
            arrayValue: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['field'],
        },
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
    TIMEOUT_MS,
    'parseBrandEdit',
  );

  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed: { field?: string; stringValue?: string; arrayValue?: string[] } = {};
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return null;
  }

  const field = parsed.field;
  if (!field || !['tagline', 'brandColors', 'vibe', 'summary'].includes(field)) return null;

  if (field === 'brandColors') {
    const colors = Array.isArray(parsed.arrayValue)
      ? parsed.arrayValue.map((c) => c.trim()).filter(Boolean).slice(0, 6)
      : [];
    if (colors.length === 0) return null;
    return {
      field: 'brandColors',
      value: colors,
      display: colors.join(', '),
      rawInstruction: text,
    };
  }

  const value = (parsed.stringValue ?? '').trim();
  if (!value) return null;
  return {
    field: field as BrandEditField,
    value: value.slice(0, 500),
    display: value.slice(0, 500),
    rawInstruction: text,
  };
}
