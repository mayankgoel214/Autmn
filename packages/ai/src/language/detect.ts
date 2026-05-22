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
// Words that only appear in Hindi/Hinglish — impossible in standard English.
// Checked as whole words (word boundaries) to avoid substring false-positives.
const HINGLISH_WORD_RE = /\b(haan|haa|nahi|nahin|yaar|bhai|acha|accha|theek|theekhai|kya|kyun|kaise|kitna|kitne|kab|kaun|kahaan|kahan|mera|meri|tera|teri|apna|apni|aapka|aapki|tumhara|humara|namaste|namaskar|lagega|lagti|lagta|milega|milegi|karein|karo|karna|boliye|batao|bataiye|bhejiye|bhejo|chahiye|bilkul|zaroor|chalega|seedha|chhod|lena|lelo|dena|dedo|rakho|shukriya|dhanyawad|swagat|zyada|thoda|bahut|sirf|abhi|jaldi|kal|aaj|phir|dobara|wala|wali|wale|matlab|matlab)\b/i;

export async function detectLanguage(message: string): Promise<'en' | 'hi' | 'hinglish'> {
  if (!message.trim()) return 'en';

  // Fast heuristic: Devanagari code points → definitely Hindi
  if (/[ऀ-ॿ]/.test(message)) return 'hi';

  // Fast heuristic: unambiguous Hinglish words → no API call needed
  if (HINGLISH_WORD_RE.test(message)) return 'hinglish';

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

    const prompt = `Classify the language of this message. Reply with exactly one word.

Message: "${message}"

Reply "hinglish" if it contains any Hindi words written in Roman script (e.g. "yaar", "bhai", "theek", "haan", "kya", "acha", "namaste", "kitna").
Reply "hindi" if it uses Devanagari script.
Reply "english" if it is pure English with no Hindi words.

One word only: english / hinglish / hindi`;

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
