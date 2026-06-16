/**
 * Phase 6 — free-form FAQ matcher.
 *
 * Lightweight keyword/intent map for the four most-asked free-form questions
 * users send in IDLE or CHANGE_SETTINGS_MENU. The dispatcher in machine.ts
 * fires the canned response before the state handler runs — the handler
 * still renders its menu / picker afterwards.
 *
 * "Help" is deliberately NOT here: the existing global help-intent intercept
 * in machine.ts already serves it across every state and includes a
 * status-aware blurb that the state handlers' menus don't carry. Keeping
 * "help" centralized avoids divergence between two handlers.
 */

import type { Language } from '../types.js';

export type FaqIntent = 'price' | 'refund' | 'turnaround' | 'what';

// ---------------------------------------------------------------------------
// Intent matching — priority order matters: refund's "money back" can collide
// with price's "money" if we checked price first, and "what does it cost"
// would match both 'price' and 'what'. Checking refund, then turnaround, then
// price, then what avoids those false positives in practice.
// ---------------------------------------------------------------------------

const PATTERNS: Record<FaqIntent, RegExp> = {
  refund:
    /\b(refund|money\s*back|paise?\s*wapa?s|wapsi|return\s*policy|cancel(?:lation)?)\b/i,
  turnaround:
    /\b(turnaround|delivery\s*time|how\s*long|how\s*soon|when\s*will|kab\s*(?:milega|tak|ready|hoga)|kitna\s*time|jaldi\s*kab)\b/i,
  price:
    /(?:\b(?:price|pricing|cost|fees?|charges?|free|how\s*much|paisa|paise|rupees?|rs\.?|kitne?|kitn[ai])\b|₹)/i,
  what:
    /\b(what\s+(?:is|does|are|do\s+you\s+do)|how\s+does\s+(?:it|this)\s+work|tell\s*me\s*about|autmn\s*(?:kya|kaisa|kya\s*karta)|kya\s*hai|kaise\s*kaam)\b/i,
};

export function matchFaqIntent(text: string): FaqIntent | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length === 0) return null;
  if (PATTERNS.refund.test(t)) return 'refund';
  if (PATTERNS.turnaround.test(t)) return 'turnaround';
  if (PATTERNS.price.test(t)) return 'price';
  if (PATTERNS.what.test(t)) return 'what';
  return null;
}

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

export function faqResponse(intent: FaqIntent, lang: Language): string {
  switch (intent) {
    case 'price':
      switch (lang) {
        case 'hi':
          return '₹99 per image. पहली बार बिल्कुल free है।';
        case 'hinglish':
          return 'Rs 99 per image. Pehli baar bilkul free hai.';
        case 'en':
        default:
          return 'Rs 99 per image. First one is free.';
      }
    case 'refund':
      switch (lang) {
        case 'hi':
          return 'खुश नहीं हैं? पूरा refund मिल जाएगा — बस बता दीजिए।';
        case 'hinglish':
          return 'Khush nahi? Poora refund mil jaayega — bas bata dijiye.';
        case 'en':
        default:
          return 'Not happy? Full refund on request — just tell us.';
      }
    case 'turnaround':
      switch (lang) {
        case 'hi':
          return 'हर creative बनने में 2-5 minutes लगते हैं।';
        case 'hinglish':
          return 'Har creative banne mein 2-5 minutes lagte hain.';
        case 'en':
        default:
          return '2-5 minutes per creative.';
      }
    case 'what':
      switch (lang) {
        case 'hi':
          return 'Autmn आपके product की photo को WhatsApp पर professional creative image में बदलता है।';
        case 'hinglish':
          return 'Autmn aapke product ki photo ko WhatsApp pe professional creative image mein badal deta hai.';
        case 'en':
        default:
          return 'Autmn turns your product photos into professional creative images, right inside WhatsApp.';
      }
  }
}
