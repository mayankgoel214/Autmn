/**
 * Phase 15b' — short, human-readable order id used in emails + WhatsApp
 * messages ("Order #A3K9X7").
 *
 * Alphabet: 32 chars (uppercase A-Z minus I/O/Q/S to avoid look-alike +
 * shoulder-surf confusion, plus digits 1-9 minus 0). 32^6 ≈ 1.07B
 * combinations — collision probability inside 100k orders is ~0.0005%,
 * which is fine since DB unique-constraint catches the rest and the caller
 * retries.
 *
 * Generation is sync + side-effect-free; the @unique constraint on
 * Order.shortId is what makes this safe in concurrent writes.
 */

import { randomInt } from 'crypto';

// Removed I O Q S to avoid confusion with 1/0; removed 0 for the same reason.
const ALPHABET = 'ABCDEFGHJKLMNPRTUVWXYZ123456789';

export interface GenerateShortIdOptions {
  /** Defaults to 6. */
  length?: number;
}

export function generateShortId(opts: GenerateShortIdOptions = {}): string {
  const length = opts.length ?? 6;
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/**
 * Retry wrapper for the caller. When the @unique constraint fires, just
 * call this again. Cap is conservative — we should never iterate more than
 * once or twice in practice.
 */
export async function generateUniqueShortId(
  isUnique: (id: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateShortId();
    if (await isUnique(candidate)) return candidate;
  }
  throw new Error(`generateUniqueShortId: exhausted ${maxAttempts} attempts`);
}
