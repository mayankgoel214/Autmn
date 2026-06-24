/**
 * BRAND_DETAILS_COLLECTING handler — single "brand colours" question.
 *
 * Brand details collapsed to the one signal that actually steers ad output:
 * the brand palette. We ask for colours, store them on BrandProfile.brandColors
 * (read by the ad prompt builder as a soft palette nudge), and return to the
 * change-settings menu. No logo, tagline, vibe, or AI brand-analysis worker —
 * those were soft-to-inert flavour with disproportionate friction/cost.
 *
 * Category + name are NOT asked here — they're collected during onboarding
 * (SETUP_CATEGORY / SETUP_NAME) and live on the User.
 *
 * Entry: tap "Brand details" in the change-settings menu.
 * Exit: colours saved or "skip" → CHANGE_SETTINGS_MENU.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { transitionTo } from '../db-helpers.js';
import { sendChangeSettingsMenu } from './change-settings.js';
import {
  msgAskBrandColors,
  msgBrandColorsSaved,
  msgBrandDetailsSkipped,
} from '../messages.js';
import type { Language, MessageContext } from '../types.js';

const SKIP_INTENT = /^(skip|no|nahi|nahin|नहीं|छोड़ो|chodo|chhodo|pass)\s*$/i;

/**
 * Sends the brand-colours prompt. The caller transitions the session into
 * BRAND_DETAILS_COLLECTING first. Exported so the change-settings menu can
 * kick the flow off.
 */
export async function startBrandDetailsFlow(
  user: User,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  const profile = await prisma.brandProfile.findUnique({ where: { userId: user.id } });
  await wa.sendText(phoneNumber, msgAskBrandColors(lang, profile?.brandColors));
}

export async function handleBrandDetailsCollecting(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hi';
  const phoneNumber = session.phoneNumber;
  const text = message.text?.trim() ?? '';

  // ── "skip" — leave without changing anything ─────────────────────────────
  if (message.messageType === 'text' && SKIP_INTENT.test(text)) {
    await wa.sendText(phoneNumber, msgBrandDetailsSkipped(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  // ── Colours text — parse, store, confirm, back to menu ───────────────────
  if (message.messageType === 'text' && text.length > 0) {
    const colours = parseColours(text);
    if (colours.length === 0) {
      // Nothing usable parsed out — re-ask rather than store an empty list.
      await wa.sendText(phoneNumber, msgAskBrandColors(lang));
      return;
    }

    await prisma.brandProfile.upsert({
      where: { userId: user.id },
      update: { brandColors: colours },
      create: { userId: user.id, brandColors: colours },
    });

    await wa.sendText(phoneNumber, msgBrandColorsSaved(lang, colours));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  // Anything else (image, audio, interactive) — re-ask for colours as text.
  await wa.sendText(phoneNumber, msgAskBrandColors(lang));
}

/** Split a free-text colour reply into 1-6 trimmed colour tokens. */
function parseColours(raw: string): string[] {
  return raw
    .split(/[,\n;/]|\band\b|\baur\b|\bor\b|&/i)
    .map((s) => s.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 6);
}
