/**
 * Marquee — single source of truth for all business, contact, and pricing details.
 *
 * PORTFOLIO BUILD. Marquee is not currently accepting orders, so the live
 * business identity — proprietor name, registered street address and the
 * operating WhatsApp number — has been removed from this file so it cannot
 * reach the deployed bundle. The real values live in git history and the
 * ops runbook; restore them here to go live again.
 *
 * ⚠️ FILL IN EVERY VALUE MARKED `PLACEHOLDER` BEFORE GOING LIVE.
 * Razorpay and Meta both require real, reachable business + contact info on the
 * public site, so the legal pages (privacy / terms / refund / contact) read from
 * here. Anything left as PLACEHOLDER will render a visible TODO badge on the page.
 */

/** Marquee is showcased as engineering work, not sold, in this build. */
export const PORTFOLIO_MODE = true;

export const portfolio = {
  author: 'Mayank Goel',
  repo: 'https://github.com/mayankgoel214/Marquee',
  site: 'https://mayank-goel.com',
} as const;

export const site = {
  // ── Identity ────────────────────────────────────────────────────────────────
  name: 'Marquee',
  domain: 'marquee-web.vercel.app', // autmn.ai is retired
  url: 'https://marquee-web.vercel.app',
  tagline: 'Professional product photos, without the studio.',
  description:
    'Send a product photo on WhatsApp. Get a brand-ready ad back in minutes. ₹49 per image — your first one is free.',

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  // The business WhatsApp number in INTERNATIONAL format, digits only, no +.
  // e.g. '919876543210'. Used for the wa.me click-to-chat CTA everywhere.
  whatsappNumber: '', // removed for the portfolio build
  whatsappGreeting: 'hi', // pre-filled message in the chat link

  // ── Pricing (must match the live pipeline) ──────────────────────────────────
  pricePerImage: 49, // ₹ per generated ad
  firstOrderFree: true, // entire first order is free for new users
  currency: '₹',

  // ── Contact ─────────────────────────────────────────────────────────────────
  email: {
    support: 'mayankgoel214@gmail.com', // the autmn.ai mailboxes are retired
    founder: 'mayankgoel214@gmail.com',
  },

  // ── Legal entity (required by Razorpay KYC + DPDP) ──────────────────────────
  legal: {
    entityName: 'Marquee',
    entityType: 'Sole Proprietorship',
    address: '', // removed for the portfolio build
    city: 'Kolkata',
    state: 'West Bengal',
    pincode: '700071',
    country: 'India',
    governingLawCity: 'Kolkata',
    gstin: '', // not GST-registered
  },

  // ── Effective dates (shown on legal pages) ──────────────────────────────────
  legalLastUpdated: '2026-06-27',
} as const;

/** wa.me click-to-chat link with the greeting pre-filled. */
export function whatsappLink(): string {
  if (PORTFOLIO_MODE) return portfolio.repo;
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(site.whatsappGreeting)}`;
}

/** True when a config value still holds a placeholder — used to render TODO badges. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('PLACEHOLDER');
}
