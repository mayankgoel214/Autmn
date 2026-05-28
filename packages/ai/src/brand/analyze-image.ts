/**
 * Phase 3b — image analysis via Gemini Flash vision.
 *
 * Takes a brand-asset image buffer and returns a 1-2 sentence description of
 * the visual identity it conveys. The downstream generateSummary call stitches
 * these per-asset descriptions into a structured brand profile.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';

export interface AnalyzeImageParams {
  imageBuffer: Buffer;
  mimeType?: string;
  /** Hint to the prompt — different asset types get different framing. */
  assetType?: 'logo' | 'reference_image' | 'sample';
}

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 30_000;

function detectMime(buf: Buffer, hint?: string): string {
  if (hint && hint.startsWith('image/')) return hint;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

export async function analyzeImage(params: AnalyzeImageParams): Promise<string> {
  const { imageBuffer, mimeType, assetType } = params;
  const apiKey = getProviderKey('gemini');
  const genAI = new GoogleGenAI({ apiKey });

  const typeHint =
    assetType === 'logo'
      ? "This image is the brand's LOGO."
      : assetType === 'sample'
      ? 'This image is a SAMPLE AD the brand has previously made.'
      : 'This image is a REFERENCE PHOTO the brand provided.';

  const prompt = `${typeHint}

Describe what this image conveys about the brand in 1-2 concise sentences. Focus on:
- Visual style (minimalist, ornate, modern, traditional, playful, luxury, etc.)
- Dominant colors and mood
- What product or service it represents
- Any visible text, slogan, or logo treatment

Reply with ONLY the description. No preamble.`;

  const result = await withTimeout(
    genAI.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: detectMime(imageBuffer, mimeType),
                data: imageBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
    }),
    TIMEOUT_MS,
    'analyzeImage',
  );

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const t = (p as any).text;
    if (typeof t === 'string' && t.length > 0) return t.trim().slice(0, 500);
  }
  return '';
}
