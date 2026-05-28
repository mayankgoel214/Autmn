/**
 * Phase 21 — extract negative constraints from a free-text instruction.
 *
 * Deterministic regex-based extractor. Runs in 0ms (no LLM call), so we can
 * call it per-style without budget impact. Catches the common patterns Indian
 * SMB sellers use in WhatsApp:
 *   "no garnish, no steam"
 *   "don't add a model"
 *   "without props"
 *   "avoid background text"
 *
 * Misses are caught downstream by the verifier (qa/verify.ts) which is a
 * vision LLM looking at the actual output. This extractor's job is just to
 * surface the obvious ones into the prompt's CRITICAL NEGATIVE CONSTRAINTS
 * block so the model sees them as hard constraints from the start.
 */

const NEGATIVE_PATTERNS: RegExp[] = [
  // English
  /\bno\s+([a-z][\w\s-]{1,40}?)(?=[.,;!?]|$|\band\b|\bbut\b)/gi,
  /\bdon'?t\s+(?:add|include|show|use|put|have)\s+([a-z][\w\s-]{1,40}?)(?=[.,;!?]|$|\band\b)/gi,
  /\bwithout\s+([a-z][\w\s-]{1,40}?)(?=[.,;!?]|$|\band\b)/gi,
  /\bavoid\s+([a-z][\w\s-]{1,40}?)(?=[.,;!?]|$|\band\b)/gi,
  // Hinglish
  /\bnahi\s+(?:chahiye|hona|honi|hone|do|dena|chahta|chahti|chahte)\b.{0,20}/gi,
  /\bmat\s+(?:do|dena|daalo|daalna|laga|lagana|laao|lana)\b.{0,20}/gi,
  /\b(\w[\w\s-]{0,30})\s+nahi\b/gi,
];

const MAX_NEGATIVE_LENGTH = 50;
const MAX_NEGATIVES_PER_TEXT = 8;

/**
 * Extract negative constraints from instruction text. Returns a deduped,
 * length-capped list. Empty input → empty array.
 */
export function extractNegatives(text: string | undefined | null): string[] {
  if (!text || !text.trim()) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const pattern of NEGATIVE_PATTERNS) {
    // Reset lastIndex for global regex reuse.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const phrase = (match[1] ?? match[0])
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_NEGATIVE_LENGTH);

      if (!phrase || phrase.length < 2) continue;

      // Reconstruct as "no X" / "don't X" form so it reads as a constraint
      // when surfaced in the prompt + verifier list.
      const phrased = match[0].toLowerCase().startsWith('no ')
        ? `no ${phrase}`
        : match[0].toLowerCase().includes('without')
          ? `no ${phrase}`
          : match[0].toLowerCase().includes('avoid')
            ? `no ${phrase}`
            : match[0].toLowerCase().includes("don't") || match[0].toLowerCase().startsWith('dont')
              ? `do not ${phrase}`
              : `no ${phrase}`;

      if (seen.has(phrased)) continue;
      seen.add(phrased);
      out.push(phrased);
      if (out.length >= MAX_NEGATIVES_PER_TEXT) return out;
    }
  }

  return out;
}

/**
 * Extract negatives for an entire per-style mapping. Returns a same-keyed
 * object where each value is the negatives array for that style.
 */
export function extractNegativesPerStyle(
  perStyle: Record<string, string | null | undefined>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [style, text] of Object.entries(perStyle)) {
    out[style] = extractNegatives(text);
  }
  return out;
}
