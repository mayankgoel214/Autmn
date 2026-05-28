/**
 * Phase 3b — structured brand summary via Gemini 2.5 Flash.
 *
 * Takes the per-asset descriptions produced by analyzeImage / analyzePDF /
 * scrapeWebsite (plus raw text/website notes from the user) and returns a
 * compact structured profile we use as ad-generation context.
 *
 * Uses Gemini's responseSchema feature so the JSON shape is always valid;
 * we still defensively narrow the result.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';

export interface AssetDescriptor {
  /** BrandAsset.type — 'logo' | 'reference_image' | 'sample' | 'pdf' |
   *  'document' | 'website' | 'text'. */
  type: string;
  /** Either an AI-generated description (image/pdf/website) or the raw text
   *  the user typed (text/website notes). */
  description: string;
}

export interface BrandSummary {
  tagline: string;
  brandColors: string[];
  vibe: string;
  summary: string;
}

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

export async function generateSummary(assets: AssetDescriptor[]): Promise<BrandSummary> {
  if (assets.length === 0) {
    return { tagline: '', brandColors: [], vibe: '', summary: 'No brand assets provided.' };
  }

  const apiKey = getProviderKey('gemini');
  const genAI = new GoogleGenAI({ apiKey });

  const lines = assets
    .map((a, i) => `[${i + 1}] (${a.type}) ${a.description.slice(0, 600)}`)
    .join('\n');

  const prompt = `You are a brand strategist building a profile for an Indian SMB seller. Based on the following brand assets and descriptions, produce a concise structured profile.

${lines}

Rules:
- tagline: a short brand tagline (under 50 characters, no quotation marks). Empty string if you cannot infer one with confidence.
- brandColors: 2-4 dominant colors as CSS color names or hex codes. Empty array if unclear.
- vibe: 2-4 words describing the brand mood (e.g. "minimalist luxury", "playful festive", "earthy artisan", "modern heritage").
- summary: 1-3 sentences capturing what the brand sells, who it's for, and how it presents itself visually.

Never invent details that aren't supported by the assets above. Use empty string / array when uncertain.`;

  const result = await withTimeout(
    genAI.models.generateContent({
      model: MODEL,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tagline: { type: Type.STRING },
            brandColors: { type: Type.ARRAY, items: { type: Type.STRING } },
            vibe: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: ['tagline', 'brandColors', 'vibe', 'summary'],
        },
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
    TIMEOUT_MS,
    'generateSummary',
  );

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed: Partial<BrandSummary> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // Gemini occasionally drops a stray ```json fence even with responseMimeType;
    // strip it and retry once.
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }
  }

  return {
    tagline: typeof parsed.tagline === 'string' ? parsed.tagline.slice(0, 100) : '',
    brandColors: Array.isArray(parsed.brandColors)
      ? parsed.brandColors.filter((c): c is string => typeof c === 'string').slice(0, 6)
      : [],
    vibe: typeof parsed.vibe === 'string' ? parsed.vibe.slice(0, 50) : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1500) : '',
  };
}
