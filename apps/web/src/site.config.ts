/**
 * Autmn — single source of truth for all business, contact, and pricing details.
 *
 * ⚠️ FILL IN EVERY VALUE MARKED `PLACEHOLDER` BEFORE GOING LIVE.
 * Razorpay and Meta both require real, reachable business + contact info on the
 * public site, so the legal pages (privacy / terms / refund / contact) read from
 * here. Anything left as PLACEHOLDER will render a visible TODO badge on the page.
 */

export const site = {
  // ── Identity ────────────────────────────────────────────────────────────────
  name: 'Autmn',
  domain: 'autmn.ai',
  url: 'https://autmn.ai',
  tagline: 'Professional product photos, without the studio.',
  description:
    'Send a product photo on WhatsApp. Get a brand-ready ad back in minutes. ₹49 per image — your first one is free.',

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  // The business WhatsApp number in INTERNATIONAL format, digits only, no +.
  // e.g. '919876543210'. Used for the wa.me click-to-chat CTA everywhere.
  whatsappNumber: 'PLACEHOLDER_WHATSAPP_NUMBER', // TODO: real business number, digits only
  whatsappGreeting: 'hi', // pre-filled message in the chat link

  // ── Pricing (must match the live pipeline) ──────────────────────────────────
  pricePerImage: 49, // ₹ per generated ad
  firstOrderFree: true, // entire first order is free for new users
  currency: '₹',

  // ── Contact ─────────────────────────────────────────────────────────────────
  email: {
    support: 'support@autmn.ai',
    founder: 'PLACEHOLDER_FOUNDER_EMAIL', // TODO: e.g. mayank@autmn.ai
  },

  // ── Legal entity (required by Razorpay KYC + DPDP) ──────────────────────────
  legal: {
    entityName: 'PLACEHOLDER_LEGAL_ENTITY_NAME', // TODO: registered business / proprietor name
    entityType: 'PLACEHOLDER_ENTITY_TYPE', // TODO: 'Sole Proprietorship' | 'Private Limited' etc.
    address: 'PLACEHOLDER_BUSINESS_ADDRESS', // TODO: full reachable address
    city: 'PLACEHOLDER_CITY', // TODO
    state: 'PLACEHOLDER_STATE', // TODO
    pincode: 'PLACEHOLDER_PINCODE', // TODO
    country: 'India',
    governingLawCity: 'PLACEHOLDER_CITY', // TODO: jurisdiction city for ToS
    gstin: '', // optional — leave '' if not GST-registered yet
  },

  // ── Effective dates (shown on legal pages) ──────────────────────────────────
  legalLastUpdated: '2026-05-26',
} as const;

/** wa.me click-to-chat link with the greeting pre-filled. */
export function whatsappLink(): string {
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(site.whatsappGreeting)}`;
}

/** True when a config value still holds a placeholder — used to render TODO badges. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('PLACEHOLDER');
}
