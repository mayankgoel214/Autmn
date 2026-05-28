/**
 * Env parsing. Accepts:
 *   FOO_KEYS=key1,key2,key3   (comma-separated plural — preferred)
 *   FOO_KEY=key1              (single, backwards compatible)
 *
 * Strips whitespace, drops empties, dedupes, preserves order.
 */

import type { Provider } from './types.js';

interface ProviderEnvSpec {
  /** Plural env var, comma-separated. */
  plural: string;
  /** Single-key env var, backwards compatible. */
  singular: string;
  /** Alternative singulars checked if the main one is missing. */
  altSingulars?: string[];
}

const PROVIDER_ENV: Record<Provider, ProviderEnvSpec> = {
  gemini: {
    // Phase 17 — canonical surface is GEMINI_API_KEY[S]; the GOOGLE_AI_* and
    // GOOGLE_GENAI_API_KEY aliases stay as altSingulars for one deprecation
    // cycle so existing .env files keep working. Plural form preferred when
    // multiple keys are configured for rate-limit rotation.
    plural: 'GEMINI_API_KEYS',
    singular: 'GEMINI_API_KEY',
    altSingulars: ['GOOGLE_AI_API_KEYS', 'GOOGLE_AI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
  },
  fal: {
    plural: 'FAL_KEYS',
    singular: 'FAL_KEY',
    altSingulars: ['FAL_API_KEY'],
  },
  groq: {
    plural: 'GROQ_API_KEYS',
    singular: 'GROQ_API_KEY',
  },
  sarvam: {
    plural: 'SARVAM_API_KEYS',
    singular: 'SARVAM_API_KEY',
  },
  openai: {
    plural: 'OPENAI_API_KEYS',
    singular: 'OPENAI_API_KEY',
  },
};

export function readKeysFromEnv(provider: Provider, env: NodeJS.ProcessEnv = process.env): string[] {
  const spec = PROVIDER_ENV[provider];

  // 1. Canonical plural — preferred path for production.
  const plural = env[spec.plural];
  if (plural && plural.trim()) {
    return splitKeys(plural);
  }

  // 2. Canonical singular.
  const single = env[spec.singular];
  if (single && single.trim()) return [single.trim()];

  // 3. Backwards-compatible alts (deprecated names). Plural form ends in 'S';
  // we treat any alt with that suffix as a comma-separated list.
  for (const alt of spec.altSingulars ?? []) {
    const v = env[alt];
    if (v && v.trim()) {
      return alt.endsWith('KEYS') ? splitKeys(v) : [v.trim()];
    }
  }
  return [];
}

function splitKeys(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function providerEnvSpec(provider: Provider): ProviderEnvSpec {
  return PROVIDER_ENV[provider];
}
