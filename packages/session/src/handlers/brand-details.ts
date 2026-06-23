/**
 * BRAND_DETAILS_COLLECTING handler — guided 3-field flow.
 *
 * Asks for exactly three things, one at a time, each skippable:
 *   step 0 — brand colours  → BrandProfile.brandColors
 *   step 1 — logo (image)   → BrandAsset(type='logo') + BrandProfile.logoUrl
 *   step 2 — tagline        → BrandProfile.tagline
 *
 * Brand category + name are NOT asked here — they're collected during
 * onboarding (SETUP_CATEGORY / SETUP_NAME) and live on the User.
 *
 * The current question is tracked in Session.brandDetailsStep so per-field
 * "skip" can be told apart from "not asked yet". On the final step the handler
 * enqueues the brand-analysis worker (which keeps the user's typed colours +
 * tagline authoritative and fills in vibe + summary, analysing the logo).
 *
 * Entry: tap "Brand details" in the change-settings menu (resets step to 0).
 * Exit: completing/skipping the last field → CHANGE_SETTINGS_MENU.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { uploadFile, Buckets } from '@autmn/storage';
import { getBrandAnalysisQueue } from '@autmn/queue';
import { transitionTo } from '../db-helpers.js';
import { downloadWhatsAppMedia, mimeToExt } from './instructions.js';
import { sendChangeSettingsMenu } from './change-settings.js';
import {
  msgAskBrandColors,
  msgAskBrandLogo,
  msgAskBrandTagline,
  msgBrandLogoExpected,
  msgBrandFileTooLarge,
  msgBrandAnalyzing,
  msgBrandDetailsSkipped,
  msgGenericError,
} from '../messages.js';
import { MAX_BRAND_ASSET_BYTES } from '../types.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

// Per-field skip — leaves the field unchanged and moves to the next question.
const SKIP_INTENT = /^(skip|no|nahi|nahin|नहीं|छोड़ो|chodo|chhodo|pass)\s*$/i;

const STEP_COLOURS = 0;
const STEP_LOGO = 1;
const STEP_TAGLINE = 2;

/**
 * Starts (or restarts) the guided flow at step 0 and asks for colours. The
 * caller transitions the session into BRAND_DETAILS_COLLECTING first. Exported
 * so the change-settings menu can kick the flow off.
 */
export async function startBrandDetailsFlow(
  user: User,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  await prisma.session.update({
    where: { phoneNumber },
    data: { brandDetailsStep: STEP_COLOURS },
  });
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
  const step = (session as any).brandDetailsStep ?? STEP_COLOURS;
  const isSkip = message.messageType === 'text' && SKIP_INTENT.test(text);

  // Lazy-create the BrandProfile (1:1 with User) so each step can write to it.
  const profile = await prisma.brandProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // ── Step 0 — brand colours ───────────────────────────────────────────────
  if (step === STEP_COLOURS) {
    if (!isSkip && message.messageType === 'text' && text.length > 0) {
      const colours = parseColours(text);
      if (colours.length > 0) {
        await prisma.brandProfile.update({
          where: { id: profile.id },
          data: { brandColors: colours },
        });
      }
    } else if (!isSkip && message.messageType !== 'text') {
      // Non-text (e.g. an image sent early) — re-ask this step.
      await wa.sendText(phoneNumber, msgAskBrandColors(lang, profile.brandColors));
      return;
    }
    await advanceTo(phoneNumber, STEP_LOGO);
    const hasLogo = await hasLogoAsset(profile.id);
    await wa.sendText(phoneNumber, msgAskBrandLogo(lang, hasLogo));
    return;
  }

  // ── Step 1 — logo image ──────────────────────────────────────────────────
  if (step === STEP_LOGO) {
    if (!isSkip && message.messageType === 'image' && message.mediaId) {
      const stored = await ingestLogo(profile.id, message.mediaId, phoneNumber, lang, wa);
      if (!stored) return; // too-large / download error — stay on this step
    } else if (!isSkip) {
      // Anything that isn't an image and isn't "skip" — nudge, stay here.
      await wa.sendText(phoneNumber, msgBrandLogoExpected(lang));
      return;
    }
    await advanceTo(phoneNumber, STEP_TAGLINE);
    const fresh = await prisma.brandProfile.findUnique({ where: { id: profile.id } });
    await wa.sendText(phoneNumber, msgAskBrandTagline(lang, fresh?.tagline));
    return;
  }

  // ── Step 2 — tagline ─────────────────────────────────────────────────────
  if (step === STEP_TAGLINE) {
    if (!isSkip && message.messageType === 'text' && text.length > 0) {
      await prisma.brandProfile.update({
        where: { id: profile.id },
        data: { tagline: text.slice(0, 100) },
      });
    } else if (!isSkip && message.messageType !== 'text') {
      await wa.sendText(phoneNumber, msgAskBrandTagline(lang, profile.tagline));
      return;
    }
    await finaliseBrandProfile(user, phoneNumber, lang, wa);
    return;
  }

  // Defensive — unknown step. Restart the flow.
  await startBrandDetailsFlow(user, phoneNumber, lang, wa);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function advanceTo(phoneNumber: string, step: number): Promise<void> {
  await prisma.session.update({
    where: { phoneNumber },
    data: { brandDetailsStep: step },
  });
}

async function hasLogoAsset(brandProfileId: string): Promise<boolean> {
  const count = await prisma.brandAsset.count({
    where: { brandProfileId, type: 'logo' },
  });
  return count > 0;
}

/** Split a free-text colour reply into 1-6 trimmed colour tokens. */
function parseColours(raw: string): string[] {
  return raw
    .split(/[,\n;/]|\band\b|\baur\b|\bor\b|&/i)
    .map((s) => s.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Downloads + stores the logo image. Returns true on success, false if the
 * file was rejected (too large) or the download failed — in which case the
 * caller keeps the user on the logo step.
 */
async function ingestLogo(
  brandProfileId: string,
  mediaId: string,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<boolean> {
  try {
    const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
    if (buffer.byteLength > MAX_BRAND_ASSET_BYTES) {
      await wa.sendText(phoneNumber, msgBrandFileTooLarge(lang));
      return false;
    }

    const ext = mimeToExt(mimeType);
    const id = crypto.randomUUID().slice(0, 8);
    const path = `${phoneNumber}/${Date.now()}_${id}${ext}`;
    const storageUrl = await uploadFile(Buckets.BRAND_ASSETS, path, buffer, mimeType);

    // A profile carries a single logo. Replace any previous one so re-running
    // the flow doesn't pile up stale logo rows.
    await prisma.brandAsset.deleteMany({ where: { brandProfileId, type: 'logo' } });
    await prisma.brandAsset.create({
      data: { brandProfileId, type: 'logo', storageUrl, mimeType },
    });
    await prisma.brandProfile.update({
      where: { id: brandProfileId },
      data: { logoUrl: storageUrl },
    });
    return true;
  } catch (err) {
    logger.error('Brand logo upload failed', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Finaliser — enqueues the brand-analysis job (keeps user colours + tagline
// authoritative, fills vibe + summary) and hands the user back to the menu.
// ---------------------------------------------------------------------------

async function finaliseBrandProfile(
  user: User,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  // Reset the step so a future entry starts clean, and leave the collecting
  // state regardless of outcome.
  await prisma.session.update({
    where: { phoneNumber },
    data: { brandDetailsStep: STEP_COLOURS },
  });

  const profile = await prisma.brandProfile.findUnique({ where: { userId: user.id } });

  // Nothing meaningful collected (and no prior profile) — treat as a skip.
  const hasContent =
    !!profile &&
    ((profile.brandColors?.length ?? 0) > 0 ||
      !!profile.tagline ||
      !!profile.logoUrl ||
      !!profile.summary);

  if (!profile || !hasContent) {
    await wa.sendText(phoneNumber, msgBrandDetailsSkipped(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  // Enqueue the worker. We ack synchronously and hand the user back to the
  // menu — the worker writes the final summary + sends a follow-up.
  try {
    const queue = getBrandAnalysisQueue();
    await queue.add(
      'analyze_brand',
      {
        brandProfileId: profile.id,
        phoneNumber,
        userLang: lang,
        userBrandName: (user as any).brandName ?? user.name ?? undefined,
      },
      { jobId: `brand_analysis_${profile.id}_${Date.now()}` },
    );
    await wa.sendText(phoneNumber, msgBrandAnalyzing(lang));
  } catch (err) {
    logger.error('Failed to enqueue brand-analysis job', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }

  await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
  await sendChangeSettingsMenu(phoneNumber, lang, wa);
}
