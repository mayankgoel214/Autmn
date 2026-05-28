/**
 * Phase 11 — position-based instruction mapping.
 *
 * Maps a list of N user instructions to M picked styles by position. Used
 * when the user sends a sequence of separate instructions (one per style)
 * instead of one combined free-form blob. The LLM-based parser
 * (parsePerStyleInstructions in @autmn/ai) remains the primary path for
 * single-blob input; this function is the deterministic alternative when we
 * have a structured per-position list.
 *
 * Decision (locked):
 * - N instructions, M styles, N === M       → 1:1 map.
 * - N instructions, M styles, N > M         → join extras into the last style.
 * - N instructions, M styles, N < M         → broadcast the last instruction
 *                                              to remaining styles. This was
 *                                              chosen over "leave empty" or
 *                                              "re-prompt" — matches user's
 *                                              apparent emphasis with no
 *                                              friction.
 * - N === 0                                  → empty mapping (all styles fall
 *                                              back to templated style prompt).
 *
 * The Phase 10 "Anything You Want" style is mapped exactly the same way —
 * its position-mapped instruction becomes the creative direction in
 * buildAnythingYouWantPrompt.
 */

export interface PositionMapResult {
  /** styleId → user's per-style instruction (trimmed). Missing keys mean no instruction. */
  perStyle: Record<string, string>;
  /** Whether the last instruction was broadcast (N < M case). */
  broadcasted: boolean;
  /** Whether extras were folded into the last style (N > M case). */
  collapsed: boolean;
}

/**
 * Map an ordered list of user instructions onto an ordered list of style IDs.
 *
 * Both arrays are read in order. Inputs are trimmed; empty strings count as
 * "no instruction here" and the algorithm carries the previous one forward
 * (so a user who sends "white bg" then "" for the next style still gets
 * "white bg" applied to position 1 — the broadcast rule).
 *
 * Returns a deterministic mapping. Never throws. Empty styles array → empty
 * perStyle.
 */
export function mapInstructionsByPosition(
  instructions: string[],
  styles: string[],
): PositionMapResult {
  const out: Record<string, string> = {};
  if (styles.length === 0) {
    return { perStyle: out, broadcasted: false, collapsed: false };
  }

  // Normalise — strip whitespace, drop pure-empty entries, preserve order.
  const cleaned = instructions.map((s) => (s ?? '').trim()).filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    return { perStyle: out, broadcasted: false, collapsed: false };
  }

  const N = cleaned.length;
  const M = styles.length;

  let broadcasted = false;
  let collapsed = false;

  if (N === M) {
    // 1:1 — straightforward zip.
    for (let i = 0; i < M; i++) {
      out[styles[i]!] = cleaned[i]!;
    }
  } else if (N < M) {
    // Broadcast last instruction across remaining slots.
    for (let i = 0; i < M; i++) {
      out[styles[i]!] = i < N ? cleaned[i]! : cleaned[N - 1]!;
    }
    broadcasted = true;
  } else {
    // N > M — fold extras into the last style. The last style gets:
    //   `${cleaned[M-1]} ${cleaned[M]} ... ${cleaned[N-1]}` joined with " | ".
    for (let i = 0; i < M - 1; i++) {
      out[styles[i]!] = cleaned[i]!;
    }
    const tail = cleaned.slice(M - 1).join(' | ');
    out[styles[M - 1]!] = tail;
    collapsed = true;
  }

  return { perStyle: out, broadcasted, collapsed };
}
