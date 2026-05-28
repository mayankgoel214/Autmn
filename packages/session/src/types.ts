// ---------------------------------------------------------------------------
// Language type — shared across all message functions and handlers
// ---------------------------------------------------------------------------

export type Language =
  | 'en'
  | 'hinglish'
  | 'hi'
  | 'ta'
  | 'te'
  | 'bn'
  | 'mr'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'pa'
  | 'or';

export const SUPPORTED_LANGUAGES: Language[] = [
  'en', 'hinglish', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or',
];

/** Human-readable English name for each language. */
export function getLanguageName(lang: Language): string {
  switch (lang) {
    case 'en':       return 'English';
    case 'hinglish': return 'Hinglish';
    case 'hi':       return 'Hindi';
    case 'ta':       return 'Tamil';
    case 'te':       return 'Telugu';
    case 'bn':       return 'Bengali';
    case 'mr':       return 'Marathi';
    case 'gu':       return 'Gujarati';
    case 'kn':       return 'Kannada';
    case 'ml':       return 'Malayalam';
    case 'pa':       return 'Punjabi';
    case 'or':       return 'Odia';
  }
}

/** Native-script name — useful for UI display. */
export function getLanguageNativeName(lang: Language): string {
  switch (lang) {
    case 'en':       return 'English';
    case 'hinglish': return 'Hinglish';
    case 'hi':       return 'हिंदी';
    case 'ta':       return 'தமிழ்';
    case 'te':       return 'తెలుగు';
    case 'bn':       return 'বাংলা';
    case 'mr':       return 'मराठी';
    case 'gu':       return 'ગુજરાતી';
    case 'kn':       return 'ಕನ್ನಡ';
    case 'ml':       return 'മലയാളം';
    case 'pa':       return 'ਪੰਜਾਬੀ';
    case 'or':       return 'ଓଡ଼ିଆ';
  }
}

/** Returns true for both pure Hindi ('hi') and Hinglish ('hinglish'). */
export function isHindi(lang: Language): boolean {
  return lang === 'hi' || lang === 'hinglish';
}

// ---------------------------------------------------------------------------

export const CONVERSATION_STATES = [
  'IDLE',
  'SETUP_LANGUAGE',
  'SETUP_NAME',
  'SETUP_CATEGORY',
  'SETUP_CATEGORY_OTHER',
  'SETUP_STYLE',
  'AWAITING_PHOTO',
  'AWAITING_PAYMENT',
  'PROCESSING',
  'DELIVERED',
  'EDIT_PROCESSING',
  'AWAITING_REVISION_PAYMENT',
  'CHANGE_SETTINGS_MENU',
  'BRAND_DETAILS_COLLECTING',
  'BRAND_DETAILS_EDITING',
  'REFUND_REQUEST',
] as const;

export type ConversationState = typeof CONVERSATION_STATES[number];

export interface SessionContext {
  phoneNumber: string;
  userName?: string;
  language: Language;
  businessType?: string;
  currentState: ConversationState;
  currentOrderId?: string;
}

export interface MessageContext {
  messageId: string;
  messageType: 'text' | 'image' | 'audio' | 'interactive' | 'document' | 'unknown';
  text?: string;
  mediaId?: string;
  caption?: string;        // Image caption text from WhatsApp
  buttonReplyId?: string;
  listReplyId?: string;
  isVoiceNote?: boolean;
  // Document message fields (PDFs, docs, etc.) — Phase 3 brand-details capture.
  documentMimeType?: string;
  documentFilename?: string;
  documentFileSize?: number; // bytes; used by the brand-details cost rail
  // Phase 9 — WhatsApp Flow completion response. Populated when Meta delivers
  // a nfm_reply webhook (user submitted a Flow form). `flowResponse` is the
  // parsed response_json object; `flowToken` is the opaque correlation token
  // we passed when sending the Flow (usually order id or session id).
  flowResponse?: Record<string, unknown>;
  flowToken?: string;
  flowName?: string;       // Meta provides this as response_json.flow_name
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Pricing constants
// ---------------------------------------------------------------------------

/**
 * @deprecated Phase 12 - use PRICE_PER_OUTPUT_AD_PAISE × N instead. Left in
 * place for one phase so external admin tooling and stale code paths don't
 * break; Phase 16 polish will remove it.
 */
export const PRICE_PER_ORDER_PAISE = 19900;

/**
 * Phase 12 - price per single generated ad output in paise (₹49). The
 * final order amount is this × number of styles picked (1-3). For the
 * 0-pick → Smart Pack case, that's 3 × 4900 = ₹147.
 */
export const PRICE_PER_OUTPUT_AD_PAISE = 4900;

/** Number of style ad outputs generated per order */
export const OUTPUT_STYLES_PER_ORDER = 3;

/** Free redos per style output */
export const FREE_REDOS_PER_STYLE = 1;

/** @deprecated Use PRICE_PER_OUTPUT_AD_PAISE × N instead. Price per image in paise (Rs 99) */
export const PRICE_PER_IMAGE_PAISE = 9900;

/** Edit revision fee in paise (Rs 29) */
export const EDIT_REVISION_PAISE = 2900;

/** Maximum reference photos per order (angle shots of the same product) */
export const MAX_IMAGES_PER_ORDER = 5;

/**
 * Free redos per image. Each image the customer paid for gets this many
 * free regenerations. Total free redos for an order = imageCount * FREE_REDOS_PER_IMAGE.
 */
export const FREE_REDOS_PER_IMAGE = 1;

/** @deprecated Use FREE_REDOS_PER_IMAGE instead. */
export const FREE_REVISIONS_PER_ORDER = 2;

/** Seconds to wait (rolling debounce) for more photos before showing buttons */
export const PHOTO_BATCH_TIMEOUT_SECONDS = 8;

/** @deprecated No longer used — buttons no longer auto-advance */
export const BUTTONS_SHOWN_TIMEOUT_SECONDS = 30;

/** Seconds before sending a gentle nudge if user hasn't acted after buttons shown */
export const PHOTO_NUDGE_TIMEOUT_SECONDS = 120;

/** Payment check job delay in milliseconds (2 minutes) */
export const PAYMENT_CHECK_DELAY_MS = 120_000;

// ---------------------------------------------------------------------------
// Phase 3 — brand-details collection cost rails
// ---------------------------------------------------------------------------

/** Maximum number of brand assets a single user may upload. */
export const MAX_BRAND_ASSETS = 10;

/** Maximum size per brand asset in bytes (5 MB). */
export const MAX_BRAND_ASSET_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Button / list reply IDs
// ---------------------------------------------------------------------------

export const ButtonIds = {
  // Language
  LANG_HINDI: 'lang_hi',
  LANG_ENGLISH: 'lang_en',
  LANG_HINGLISH: 'lang_hinglish',
  // Returning user style confirm (legacy — still handled for old sessions)
  SAME_STYLE: 'same_style',
  NEW_STYLE: 'new_style',
  // Returning user profile confirmation (legacy 3-button UI — Phase 2 replaces)
  PROFILE_CONTINUE: 'profile_continue',
  PROFILE_CHANGE_BRAND: 'profile_change_brand',
  PROFILE_CHANGE_CATEGORY: 'profile_change_category',
  // Returning user 2-button menu (Phase 2)
  GENERATE_AD: 'generate_ad',
  CHANGE_SETTINGS: 'change_settings',
  // Brand-details view buttons (Phase 4)
  EDIT_BRAND: 'edit_brand',
  ADD_MORE_BRAND: 'add_more_brand',
  // Free trial confirm
  CONFIRM_FREE: 'confirm_free',
  // Feedback (Phase 8: only FEEDBACK_GREAT survives; FEEDBACK_CHANGE /
  // FEEDBACK_REDO / EDIT_* / REDO_STYLE_* / CHANGE_SOMETHING were removed
  // alongside the inline edit/revision flow.)
  FEEDBACK_GREAT: 'feedback_great',
  // Payment
  CANCEL_ORDER: 'cancel_order',
  // Photo batch — process or add instructions
  PROCESS_NOW: 'process_now',
  ADD_INSTRUCTIONS: 'add_instructions',
} as const;

// Category → recommended style mapping (must stay in sync with resolveSmartStyle in style.ts)
export const CATEGORY_STYLE_RECOMMENDATION: Record<string, string> = {
  cat_jewellery: 'style_gradient',    // Dark luxury suits jewellery best
  cat_food: 'style_lifestyle',
  cat_garment: 'style_lifestyle',
  cat_skincare: 'style_autmn_special',
  cat_candle: 'style_gradient',       // Dark luxury with candle's own flame
  cat_bag: 'style_lifestyle',
  cat_general: 'style_autmn_special',
};

export const ListIds = {
  // Categories
  CAT_JEWELLERY: 'cat_jewellery',
  CAT_FOOD: 'cat_food',
  CAT_GARMENT: 'cat_garment',
  CAT_SKINCARE: 'cat_skincare',
  CAT_CANDLE: 'cat_candle',
  CAT_BAG: 'cat_bag',
  CAT_GENERAL: 'cat_general',
  CAT_OTHER: 'cat_other',
  CAT_SKIP: 'cat_skip',
  // Change-settings menu rows (Phase 2)
  SETTING_LANGUAGE: 'setting_language',
  SETTING_BRAND: 'setting_brand',
  SETTING_CATEGORY: 'setting_category',
  SETTING_BRAND_DETAILS: 'setting_brand_details',
  SETTING_BACK: 'setting_back',
  // Style packs (single-tap = all 3 styles resolved)
  SMART_PACK: 'smart_pack',
  BESTSELLER_PACK: 'bestseller_pack',
  FESTIVAL_PACK: 'festival_pack',
  ACTION_PACK: 'action_pack',
  CUSTOM_PACK: 'custom_pack',
  // Individual styles (used in custom 3-step picker)
  STYLE_AUTMN_SPECIAL: 'style_autmn_special',
  STYLE_CLEAN_WHITE: 'style_clean_white',
  STYLE_LIFESTYLE: 'style_lifestyle',
  STYLE_GRADIENT: 'style_gradient',
  STYLE_OUTDOOR: 'style_outdoor',
  STYLE_STUDIO: 'style_studio',
  STYLE_FESTIVE: 'style_festive',
  STYLE_WITH_MODEL: 'style_with_model',
  STYLE_VIDEO_SHOOT: 'style_video_shoot',
  // Phase 10 — user-described custom direction. Treated as one of the 1-3
  // pickable styles; the user's description lands later via the per-style
  // instruction mapping (Phase 11) instead of via a templated style prompt.
  STYLE_ANYTHING_YOU_WANT: 'style_anything_you_want',
  // Style picker control
  STYLE_DONE: 'style_done',
  // Phase 14 — post-delivery menu (single list with two sections):
  //   Section "Rate the ads" -> RATE_1..RATE_5
  //   Section "Next step"   -> SEND_NEW_PRODUCT, REQUEST_REFUND
  RATE_1: 'rate_1',
  RATE_2: 'rate_2',
  RATE_3: 'rate_3',
  RATE_4: 'rate_4',
  RATE_5: 'rate_5',
  SEND_NEW_PRODUCT: 'send_new_product',
  REQUEST_REFUND: 'request_refund',
} as const;
