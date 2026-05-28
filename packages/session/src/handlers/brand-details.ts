/**
 * Phase 3a — BRAND_DETAILS_COLLECTING handler.
 *
 * Captures brand assets (logo / sample images / PDFs / docs / text notes /
 * website URLs) into BrandAsset rows hung off a BrandProfile (1:1 with User,
 * lazy-created on first asset). On "done" runs a STUB summary generator that
 * writes a placeholder BrandProfile.summary + initial BrandSummaryVersion;
 * Phase 3b replaces the stub with real Gemini vision + pdf-parse + Playwright.
 *
 * Entry: tap "Brand details" in the change-settings menu (Phase 2 wires this).
 * Exit: "skip" or "done" → CHANGE_SETTINGS_MENU.
 *
 * Cost rails enforced here:
 *   - max 10 BrandAssets per BrandProfile (MAX_BRAND_ASSETS)
 *   - max 5 MB per uploaded file (MAX_BRAND_ASSET_BYTES)
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { uploadFile, Buckets } from '@autmn/storage';
import { transitionTo } from '../db-helpers.js';
import { downloadWhatsAppMedia, mimeToExt } from './instructions.js';
import { sendChangeSettingsMenu } from './change-settings.js';
import {
  msgBrandDetailFileSaved,
  msgBrandDetailTextSaved,
  msgBrandDetailUrlSaved,
  msgBrandLimitReached,
  msgBrandFileTooLarge,
  msgBrandProfileSaved,
  msgBrandDetailsSkipped,
  msgBrandDetailsUnknown,
  msgGenericError,
} from '../messages.js';
import { MAX_BRAND_ASSETS, MAX_BRAND_ASSET_BYTES } from '../types.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

// Match the first URL in a string; we accept http and https.
const URL_REGEX = /https?:\/\/[^\s]+/i;

// Local copies so this handler matches the intent set used elsewhere without
// importing SKIP_INTENT from onboarding (private).
const DONE_INTENT = /^(done|bas|finish|khatam|ho ?gaya|complete|theek hai)\s*$/i;
const SKIP_INTENT = /^(skip|no|nahi|nahin|नहीं|छोड़ो|chodo|chhodo|pass)\s*$/i;

export async function handleBrandDetailsCollecting(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hi';
  const phoneNumber = session.phoneNumber;
  const text = message.text?.trim() ?? '';

  // ── "skip" — abandon collection without finalising a summary ─────────────
  if (message.messageType === 'text' && SKIP_INTENT.test(text)) {
    await wa.sendText(phoneNumber, msgBrandDetailsSkipped(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  // ── "done" — finalise + run (stub) summary + return to menu ───────────────
  if (message.messageType === 'text' && DONE_INTENT.test(text)) {
    await finaliseBrandProfile(user, phoneNumber, lang, wa);
    return;
  }

  // Lazy-create the BrandProfile (1:1 with User) on first inbound asset.
  const profile = await prisma.brandProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // ── Cost rail: max-files. Check BEFORE doing any expensive download. ─────
  const existingCount = await prisma.brandAsset.count({
    where: { brandProfileId: profile.id },
  });
  if (existingCount >= MAX_BRAND_ASSETS) {
    await wa.sendText(phoneNumber, msgBrandLimitReached(lang, MAX_BRAND_ASSETS));
    return;
  }
  const nextCount = existingCount + 1;

  // ── Image ─────────────────────────────────────────────────────────────────
  if (message.messageType === 'image' && message.mediaId) {
    await ingestImage(profile.id, message.mediaId, phoneNumber, lang, wa, nextCount);
    return;
  }

  // ── Document (PDF or other) ───────────────────────────────────────────────
  if (message.messageType === 'document' && message.mediaId) {
    await ingestDocument(
      profile.id,
      message.mediaId,
      message.documentMimeType ?? null,
      message.documentFilename ?? null,
      phoneNumber,
      lang,
      wa,
      nextCount,
    );
    return;
  }

  // ── Text — URL detection routes to type='website', else 'text' ──────────
  if (message.messageType === 'text' && text.length > 0) {
    await ingestText(profile.id, text, phoneNumber, lang, wa, nextCount);
    return;
  }

  // Anything else (audio, interactive) — nudge the user.
  await wa.sendText(phoneNumber, msgBrandDetailsUnknown(lang));
}

// ---------------------------------------------------------------------------
// Asset ingestion helpers
// ---------------------------------------------------------------------------

async function ingestImage(
  brandProfileId: string,
  mediaId: string,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  count: number,
): Promise<void> {
  try {
    const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
    if (buffer.byteLength > MAX_BRAND_ASSET_BYTES) {
      await wa.sendText(phoneNumber, msgBrandFileTooLarge(lang));
      return;
    }

    // First image becomes the logo; later ones are reference shots. Phase 4
    // adds a way for users to re-label (set type='sample' / swap logo).
    const existingImages = await prisma.brandAsset.count({
      where: { brandProfileId, type: { in: ['logo', 'reference_image'] } },
    });
    const type = existingImages === 0 ? 'logo' : 'reference_image';

    const ext = mimeToExt(mimeType);
    const id = crypto.randomUUID().slice(0, 8);
    const path = `${phoneNumber}/${Date.now()}_${id}${ext}`;
    const storageUrl = await uploadFile(Buckets.BRAND_ASSETS, path, buffer, mimeType);

    await prisma.brandAsset.create({
      data: {
        brandProfileId,
        type,
        storageUrl,
        mimeType,
      },
    });

    await wa.sendText(phoneNumber, msgBrandDetailFileSaved(lang, count, MAX_BRAND_ASSETS));
  } catch (err) {
    logger.error('Brand image upload failed', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

async function ingestDocument(
  brandProfileId: string,
  mediaId: string,
  hintedMime: string | null,
  filename: string | null,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  count: number,
): Promise<void> {
  try {
    const { buffer, mimeType: downloadedMime } = await downloadWhatsAppMedia(mediaId);
    if (buffer.byteLength > MAX_BRAND_ASSET_BYTES) {
      await wa.sendText(phoneNumber, msgBrandFileTooLarge(lang));
      return;
    }

    const effectiveMime = (hintedMime ?? downloadedMime ?? 'application/octet-stream').toLowerCase();
    const isPdf = effectiveMime.includes('pdf');
    const type = isPdf ? 'pdf' : 'document';
    const ext = isPdf ? '.pdf' : extFromMime(effectiveMime);
    const id = crypto.randomUUID().slice(0, 8);
    const path = `${phoneNumber}/${Date.now()}_${id}${ext}`;
    const storageUrl = await uploadFile(Buckets.BRAND_ASSETS, path, buffer, effectiveMime);

    await prisma.brandAsset.create({
      data: {
        brandProfileId,
        type,
        storageUrl,
        mimeType: effectiveMime,
        originalFilename: filename,
      },
    });

    await wa.sendText(phoneNumber, msgBrandDetailFileSaved(lang, count, MAX_BRAND_ASSETS));
  } catch (err) {
    logger.error('Brand document upload failed', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

async function ingestText(
  brandProfileId: string,
  rawText: string,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  count: number,
): Promise<void> {
  const stored = rawText.slice(0, 5000);
  const isUrl = URL_REGEX.test(stored);

  await prisma.brandAsset.create({
    data: {
      brandProfileId,
      type: isUrl ? 'website' : 'text',
      rawText: stored,
    },
  });

  await wa.sendText(
    phoneNumber,
    isUrl
      ? msgBrandDetailUrlSaved(lang, count, MAX_BRAND_ASSETS)
      : msgBrandDetailTextSaved(lang, count, MAX_BRAND_ASSETS),
  );
}

// ---------------------------------------------------------------------------
// "done" finaliser — STUB summary; Phase 3b plugs in real Gemini/Playwright.
// ---------------------------------------------------------------------------

async function finaliseBrandProfile(
  user: User,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  const profile = await prisma.brandProfile.findUnique({ where: { userId: user.id } });

  // User typed "done" without ever sending an asset — treat as skip.
  if (!profile) {
    await wa.sendText(phoneNumber, msgBrandDetailsSkipped(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  const assets = await prisma.brandAsset.findMany({
    where: { brandProfileId: profile.id },
    orderBy: { createdAt: 'asc' },
  });

  if (assets.length === 0) {
    await wa.sendText(phoneNumber, msgBrandDetailsSkipped(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  const summary = buildStubSummary(assets);
  const websites = assets
    .filter((a) => a.type === 'website' && a.rawText)
    .map((a) => extractFirstUrl(a.rawText!))
    .filter((u): u is string => u !== null);

  await prisma.brandProfile.update({
    where: { id: profile.id },
    data: {
      summary,
      summaryUpdatedAt: new Date(),
      websiteUrl: websites[0] ?? profile.websiteUrl,
    },
  });

  await prisma.brandSummaryVersion.create({
    data: {
      brandProfileId: profile.id,
      summary,
      // Phase 3b populates these once the real AI runs.
      structuredData: { tagline: null, brandColors: [], vibe: null, stub: true },
      changeReason: 'initial',
    },
  });

  await wa.sendText(phoneNumber, msgBrandProfileSaved(lang, assets.length));
  await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
  await sendChangeSettingsMenu(phoneNumber, lang, wa);
}

/**
 * Stub summary writer used until Phase 3b wires real Gemini/Playwright.
 * Just counts asset types and concatenates text notes for context.
 */
function buildStubSummary(
  assets: Array<{ type: string; rawText: string | null }>,
): string {
  const counts = {
    logo: assets.filter((a) => a.type === 'logo').length,
    image: assets.filter((a) => a.type === 'reference_image').length,
    pdf: assets.filter((a) => a.type === 'pdf').length,
    doc: assets.filter((a) => a.type === 'document').length,
    text: assets.filter((a) => a.type === 'text').length,
    web: assets.filter((a) => a.type === 'website').length,
  };

  const notes = assets
    .filter((a) => a.type === 'text' && a.rawText)
    .map((a) => a.rawText!.trim())
    .join(' | ');

  const parts: string[] = [];
  if (counts.logo + counts.image) parts.push(`${counts.logo + counts.image} image(s)`);
  if (counts.pdf) parts.push(`${counts.pdf} PDF(s)`);
  if (counts.doc) parts.push(`${counts.doc} document(s)`);
  if (counts.text) parts.push(`${counts.text} note(s)`);
  if (counts.web) parts.push(`${counts.web} website link(s)`);

  let summary = `Brand assets uploaded: ${parts.join(', ') || 'none'}. ` +
    `AI summary will be generated once Phase 3b's brand-analysis pipeline is wired.`;
  if (notes) summary += ` Notes: ${notes.slice(0, 500)}`;
  return summary;
}

function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  return m ? m[0] : null;
}

function extFromMime(mime: string): string {
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return '.docx';
  if (mime.includes('spreadsheetml') || mime.includes('excel') || mime.includes('ms-excel'))
    return '.xlsx';
  if (mime.includes('plain')) return '.txt';
  if (mime.includes('csv')) return '.csv';
  return '';
}
