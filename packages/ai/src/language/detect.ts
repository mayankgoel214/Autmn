import { getProviderKey } from '@autmn/keypool';

/**
 * Maps provider-specific language codes to our Language type.
 * Groq returns ISO 639-1 ("hi", "en"); Sarvam returns BCP-47 ("hi-IN", "en-IN").
 * Hinglish cannot be detected from transcription codes — providers label it "hi".
 */
export function normalizeTranscriptionLang(code: string): 'en' | 'hi' {
  if (code.toLowerCase().startsWith('hi')) return 'hi';
  return 'en';
}

/**
 * Detects the language of a user's first message.
 *
 * Returns:
 *   'hinglish' — Hindi (Devanagari or Roman-script) or Hinglish mix
 *   'en'       — English or undetermined
 *
 * Uses Gemini Flash (text-only). Times out after 5s and falls back to 'en'.
 */
export async function detectLanguage(message: string): Promise<'en' | 'hi' | 'hinglish'> {
  if (!message.trim()) return 'en';

  // Fast heuristic: Devanagari code points → definitely Hindi
  if (/[ऀ-ॿ]/.test(message)) return 'hi';

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

    const prompt = `Detect the language of the following message.

Message: ${message}

Rules:
- If the message is in pure English (no Hindi words): return "english"
- If the message is in Hindi using Roman script, or a mix of Hindi and English (Hinglish): return "hinglish"
- If the message is in Hindi using Devanagari script: return "hindi"
- If you cannot determine: return "english"

Examples of Hinglish: "bhai kya scene hai", "hello yaar", "kitna time lagega", "acha", "theek hai", "haan", "nahi", "kya"

Return only one word: "english", "hinglish", or "hindi". Nothing else.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('detectLanguage timeout')), 5_000)
    );

    const result = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 5, temperature: 0 },
      }),
      timeoutPromise,
    ]);

    const raw = result.text?.trim().toLowerCase() ?? 'english';
    if (raw === 'hindi') return 'hi';
    if (raw === 'hinglish') return 'hinglish';
    return 'en';
  } catch {
    return 'en';
  }
}
