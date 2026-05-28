/**
 * Onboarding handlers.
 *
 * New users:      IDLE → SETUP_LANGUAGE → SETUP_NAME → AWAITING_PHOTO (category inline)
 *                 or IDLE → SETUP_LANGUAGE → SETUP_NAME → SETUP_CATEGORY → AWAITING_PHOTO
 * Returning users: IDLE → profile confirmation (Continue / Change brand / Change category)
 *                  → AWAITING_PHOTO (styles auto-selected at order time)
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import type { Session, User } from '@autmn/db';
import { prisma } from '@autmn/db';
import { uploadFile, Buckets } from '@autmn/storage';
import { transitionTo, updateUser } from '../db-helpers.js';
import { downloadWhatsAppMedia, mimeToExt } from './instructions.js';
import {
  styleDisplayName,
  msgAllStylesReady,
  msgSendProductPhotos,
  msgAskLanguage,
  msgAskBrandName,
  msgAskCategoryHeader,
  msgAskCategoryOther,
  msgConfirmLanguage,
  msgConfirmBrandName,
  msgConfirmBrandSkipped,
  msgConfirmCategory,
  msgConfirmCategorySkipped,
  categoryDisplayName,
  msgReturningUserMenu,
  btnGenerateAd,
  btnChangeSettings,
} from '../messages.js';
import { sendChangeSettingsMenu } from './change-settings.js';

// ---------------------------------------------------------------------------
// Phase 7 — dedupe rapid "hi" taps that would otherwise re-send the returning-
// user 2-button menu. Process-local Map; sufficient for the impatient-tap UX
// guard the plan calls out (cross-process sync isn't required — the user is
// talking to one API process at a time).
// ---------------------------------------------------------------------------

const RETURNING_MENU_DEDUPE_MS = 30_000;
const lastReturningMenuSentAt = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - RETURNING_MENU_DEDUPE_MS;
  for (const [phone, ts] of lastReturningMenuSentAt) {
    if (ts < cutoff) lastReturningMenuSentAt.delete(phone);
  }
  // Nuclear option for unexpected growth.
  if (lastReturningMenuSentAt.size > 10_000) lastReturningMenuSentAt.clear();
}, 60_000).unref();
import { ListIds, ButtonIds, OUTPUT_STYLES_PER_ORDER, isHindi } from '../types.js';
import { selectStylesForOrder } from '../auto-styles.js';
import type { Language } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// IDLE — entry point
// ---------------------------------------------------------------------------

export async function handleIdle(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  // Guard against stale dispatches — re-read state to ensure we're still IDLE.
  const fresh = await prisma.session.findUnique({
    where: { phoneNumber: session.phoneNumber },
    select: { state: true },
  });
  if (fresh && fresh.state !== 'IDLE') {
    console.info(JSON.stringify({
      event: 'handleIdle_stale_dispatch',
      phoneNumber: session.phoneNumber,
      currentState: fresh.state,
    }));
    return;
  }

  const lang = user.language as Language;
  const displayName = (user as any).brandName ?? user.name ?? null;
  const isReturning = Boolean(displayName);

  logger.info('handleIdle called', { phoneNumber: session.phoneNumber, isReturning, lang });

  // ── Handle button replies (always checked first to prevent re-showing prompts) ──────
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    const buttonId = message.buttonReplyId;

    // Phase 2 — Generate ad: returning user wants to make another ad.
    if (buttonId === ButtonIds.GENERATE_AD) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'AWAITING_PHOTO',
          stateEnteredAt: new Date(),
          styleSelection: null,
          styleSelections: [],
          stylePickStep: 0,
          imageMediaIds: [],
          imageStorageUrls: [],
          voiceInstructions: null,
          currentOrderId: null,
          earlyPhotoMediaId: null,
          inChangeSettings: false,
        },
      });
      if (claimed.count === 0) return;
      await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
      return;
    }

    // Phase 2 — Change settings: open the change-settings menu.
    if (buttonId === ButtonIds.CHANGE_SETTINGS) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'CHANGE_SETTINGS_MENU',
          stateEnteredAt: new Date(),
          inChangeSettings: false,
        },
      });
      if (claimed.count === 0) return;
      await sendChangeSettingsMenu(session.phoneNumber, lang, wa);
      return;
    }

    // Profile confirmation: continue with saved profile → AWAITING_PHOTO (photo first)
    if (buttonId === ButtonIds.PROFILE_CONTINUE) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'AWAITING_PHOTO',
          stateEnteredAt: new Date(),
          styleSelection: null,
          styleSelections: [],
          stylePickStep: 0,
          imageMediaIds: [],
          imageStorageUrls: [],
          voiceInstructions: null,
          currentOrderId: null,
          earlyPhotoMediaId: null,
        },
      });
      if (claimed.count === 0) return;
      await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
      return;
    }

    // Profile update: change brand name → SETUP_NAME
    if (buttonId === ButtonIds.PROFILE_CHANGE_BRAND) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: { state: 'SETUP_NAME', stateEnteredAt: new Date() },
      });
      if (claimed.count === 0) return;
      await wa.sendText(
        session.phoneNumber,
        isHindi(lang) ? 'Apna naya brand naam likhiye:' : 'Type your new brand name:',
      );
      return;
    }

    // Profile update: change category → SETUP_CATEGORY
    if (buttonId === ButtonIds.PROFILE_CHANGE_CATEGORY) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: { state: 'SETUP_CATEGORY', stateEnteredAt: new Date() },
      });
      if (claimed.count === 0) return;
      await sendCategoryList(session.phoneNumber, lang, wa, displayName ?? undefined);
      return;
    }

    // Legacy: SAME_STYLE / NEW_STYLE (old sessions that still have these queued)
    if (buttonId === ButtonIds.SAME_STYLE || buttonId === ButtonIds.NEW_STYLE || buttonId === 'try_new_style') {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'AWAITING_PHOTO',
          stateEnteredAt: new Date(),
          styleSelection: null,
          styleSelections: [],
          stylePickStep: 0,
          imageMediaIds: [],
          imageStorageUrls: [],
          voiceInstructions: null,
          currentOrderId: null,
          earlyPhotoMediaId: null,
        },
      });
      if (claimed.count === 0) return;
      await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
      return;
    }
  }

  // ── Returning user ────────────────────────────────────────────────────────────────
  if (isReturning) {
    // If they sent a photo directly, accept it immediately
    if (message.messageType === 'image' && message.mediaId) {
      let storageUrl: string | null = null;
      try {
        const { buffer, mimeType } = await downloadWhatsAppMedia(message.mediaId);
        const ext = mimeToExt(mimeType);
        const path = `${session.phoneNumber}/${Date.now()}_0${ext}`;
        storageUrl = await uploadFile(Buckets.RAW_IMAGES, path, buffer, mimeType);
      } catch (err) {
        logger.error('Failed to download/upload early photo in IDLE', {
          phoneNumber: session.phoneNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await prisma.session.update({
        where: { phoneNumber: session.phoneNumber },
        data: {
          state: 'AWAITING_PHOTO',
          stateEnteredAt: new Date(),
          imageMediaIds: storageUrl ? [message.mediaId] : [],
          imageStorageUrls: storageUrl ? [storageUrl] : [],
          earlyPhotoMediaId: null,
          styleSelection: null,
          styleSelections: [],
          voiceInstructions: message.caption?.trim() || null,
          currentOrderId: null,
        },
      });
      const photoAck = isHindi(lang)
        ? `Photo mil gayi, ${displayName}. Processing shuru ho raha hai.`
        : `Photo received, ${displayName}. Getting started.`;
      await wa.sendText(session.phoneNumber, photoAck);
      return;
    }

    // Phase 2 — 2-button returning-user menu (replaces the 3-button Continue
    // / Change brand / Change category UI). Brand / category / details edits
    // are all reached via Change settings.
    //
    // Phase 7 — idempotent "hi": if we sent this menu to the same phone in
    // the last 30 seconds, suppress the re-send. Button taps don't update the
    // timestamp, so a user navigating away and coming back later still gets
    // the menu re-rendered.
    const now = Date.now();
    const lastSent = lastReturningMenuSentAt.get(session.phoneNumber) ?? 0;
    if (now - lastSent < RETURNING_MENU_DEDUPE_MS) {
      logger.info('Suppressed duplicate returning-user menu within 30s', {
        phoneNumber: session.phoneNumber,
        ageMs: now - lastSent,
      });
      return;
    }

    const menuBody = msgReturningUserMenu(lang, displayName ?? undefined);

    try {
      await wa.sendButtons(
        session.phoneNumber,
        menuBody,
        [
          { id: ButtonIds.GENERATE_AD,     title: btnGenerateAd(lang) },
          { id: ButtonIds.CHANGE_SETTINGS, title: btnChangeSettings(lang) },
        ],
      );
      lastReturningMenuSentAt.set(session.phoneNumber, now);
    } catch (btnErr) {
      logger.error('sendButtons failed in handleIdle (returning user), falling back to sendText', {
        phoneNumber: session.phoneNumber,
        error: String(btnErr),
      });
      await wa.sendText(session.phoneNumber, menuBody);
      lastReturningMenuSentAt.set(session.phoneNumber, now);
    }
    return;
  }

  // ── New user: language picker first (no auto-detect, per Phase 1) ──────────────
  await transitionTo(session.phoneNumber, 'SETUP_LANGUAGE');

  try {
    await wa.sendButtons(
      session.phoneNumber,
      msgAskLanguage(),
      [
        { id: ButtonIds.LANG_HINDI, title: 'हिंदी' },
        { id: ButtonIds.LANG_ENGLISH, title: 'English' },
        { id: ButtonIds.LANG_HINGLISH, title: 'Hinglish' },
      ],
    );
  } catch (btnErr) {
    logger.error('sendButtons failed in handleIdle (new user language picker)', {
      phoneNumber: session.phoneNumber,
      error: String(btnErr),
    });
    await wa.sendText(
      session.phoneNumber,
      `${msgAskLanguage()}\n\nReply: hindi / english / hinglish (or 1 / 2 / 3)`,
    );
  }
}

function displayCategoryName(categoryId: string | null, lang: Language): string {
  const c = categoryId?.replace(/^cat_/, '') ?? '';
  const names: Record<string, { en: string; hinglish: string }> = {
    jewellery:  { en: 'Jewellery',           hinglish: 'Jewellery / Zewar' },
    food:       { en: 'Food',                hinglish: 'Food / Khaana' },
    garment:    { en: 'Garments',            hinglish: 'Kapde / Garments' },
    skincare:   { en: 'Skincare & Beauty',   hinglish: 'Skincare / Beauty' },
    candle:     { en: 'Candle & Home Decor', hinglish: 'Candle / Home Decor' },
    bag:        { en: 'Bags & Accessories',  hinglish: 'Bag / Purse' },
    electronics:{ en: 'Electronics',         hinglish: 'Electronics' },
    general:    { en: 'Other',               hinglish: 'Kuch Aur' },
  };
  const entry = names[c];
  if (!entry) return categoryId ?? 'Not set';
  return isHindi(lang) ? entry.hinglish : entry.en;
}

// ---------------------------------------------------------------------------
// SETUP_LANGUAGE — user picks Hindi or English
// ---------------------------------------------------------------------------

export async function handleSetupLanguage(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  let lang: Language | null = null;

  if (message.messageType === 'interactive' && message.buttonReplyId) {
    switch (message.buttonReplyId) {
      case ButtonIds.LANG_HINDI:    lang = 'hi'; break;
      case ButtonIds.LANG_ENGLISH:  lang = 'en'; break;
      case ButtonIds.LANG_HINGLISH: lang = 'hinglish'; break;
    }
  } else if (message.messageType === 'text' && message.text) {
    lang = parseLanguagePick(message.text);
  }

  if (!lang) {
    // Could not parse — re-send picker.
    try {
      await wa.sendButtons(
        session.phoneNumber,
        msgAskLanguage(),
        [
          { id: ButtonIds.LANG_HINDI, title: 'हिंदी' },
          { id: ButtonIds.LANG_ENGLISH, title: 'English' },
          { id: ButtonIds.LANG_HINGLISH, title: 'Hinglish' },
        ],
      );
    } catch {
      await wa.sendText(
        session.phoneNumber,
        `${msgAskLanguage()}\n\nReply: hindi / english / hinglish (or 1 / 2 / 3)`,
      );
    }
    return;
  }

  await updateUser(session.phoneNumber, { language: lang });
  await wa.sendText(session.phoneNumber, msgConfirmLanguage(lang));

  // Phase 2: a change-settings edit ends here — back to the menu.
  if (await finishSetupStepIfEditing(session, lang, wa)) return;

  await transitionTo(session.phoneNumber, 'SETUP_NAME');
  await wa.sendText(session.phoneNumber, msgAskBrandName(lang));
}

/**
 * Phase 2 helper. When Session.inChangeSettings is true (set by the
 * change-settings menu when handing off to a Phase 1 handler), clear the flag,
 * transition to CHANGE_SETTINGS_MENU, and re-send the menu — instead of
 * letting the handler progress to the next setup state.
 *
 * Returns true iff the routing happened, so the caller can short-circuit.
 */
async function finishSetupStepIfEditing(
  session: Session,
  lang: Language,
  wa: WhatsAppClient,
): Promise<boolean> {
  if (!(session as any).inChangeSettings) return false;
  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { inChangeSettings: false },
  });
  await transitionTo(session.phoneNumber, 'CHANGE_SETTINGS_MENU');
  await sendChangeSettingsMenu(session.phoneNumber, lang, wa);
  return true;
}

/**
 * Text-fallback parser for the language picker. Accepts literal language
 * names, 1/2/3, and common Devanagari spellings. Returns null if no match —
 * the caller re-sends the picker.
 */
function parseLanguagePick(text: string): Language | null {
  const t = text.trim().toLowerCase();
  if (/^(hindi|1|हिंदी|हिन्दी)$/.test(t)) return 'hi';
  if (/^(english|2|angrezi)$/.test(t)) return 'en';
  if (/^(hinglish|3|roman hindi|hindi roman)$/.test(t)) return 'hinglish';
  return null;
}

// ---------------------------------------------------------------------------
// SETUP_NAME — user types their name
// ---------------------------------------------------------------------------

export async function handleSetupName(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = user.language as Language;
  const raw = message.text?.trim() ?? '';

  if (!raw) {
    await wa.sendText(session.phoneNumber, msgAskBrandName(lang));
    return;
  }

  let savedBrandName: string | null = null;

  if (SKIP_INTENT.test(raw)) {
    await wa.sendText(session.phoneNumber, msgConfirmBrandSkipped(lang));
  } else {
    savedBrandName = sanitizeBrandName(raw);
    if (!savedBrandName) {
      // Sanitization stripped everything — treat as empty input.
      await wa.sendText(session.phoneNumber, msgAskBrandName(lang));
      return;
    }
    // brandName is canonical; name kept in sync for legacy delivery messages.
    await updateUser(session.phoneNumber, { brandName: savedBrandName, name: savedBrandName });
    await wa.sendText(session.phoneNumber, msgConfirmBrandName(lang, savedBrandName));
  }

  // Phase 2: a change-settings edit ends here — back to the menu.
  if (await finishSetupStepIfEditing(session, lang, wa)) return;

  // Returning user already has a category — skip the category step entirely.
  if (user.businessType) {
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      currentOrderId: null,
      styleSelection: null,
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
    return;
  }

  await transitionTo(session.phoneNumber, 'SETUP_CATEGORY');
  await sendCategoryList(session.phoneNumber, lang, wa, savedBrandName ?? undefined);
}

const SKIP_INTENT = /^(skip|no|nahi|nahin|नहीं|छोड़ो|chodo|chhodo|pass)$/i;

function sanitizeBrandName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 50);
  return cleaned.length === 0 ? '' : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ---------------------------------------------------------------------------
// SETUP_CATEGORY — user picks category, style list appears immediately
// ---------------------------------------------------------------------------

export async function handleSetupCategory(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = user.language as Language;
  const userName = (user as any).brandName ?? user.name ?? undefined;

  if (message.messageType !== 'interactive' || !message.listReplyId) {
    await sendCategoryList(session.phoneNumber, lang, wa, userName);
    return;
  }

  const replyId = message.listReplyId;

  // Skip — leave businessType unset, go straight to AWAITING_PHOTO.
  if (replyId === ListIds.CAT_SKIP) {
    await wa.sendText(session.phoneNumber, msgConfirmCategorySkipped(lang));
    // Phase 2: a change-settings edit ends here — back to the menu.
    if (await finishSetupStepIfEditing(session, lang, wa)) return;
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      currentOrderId: null,
      styleSelection: null,
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
    return;
  }

  // Other — capture free-text category in SETUP_CATEGORY_OTHER.
  if (replyId === ListIds.CAT_OTHER) {
    await transitionTo(session.phoneNumber, 'SETUP_CATEGORY_OTHER');
    await wa.sendText(session.phoneNumber, msgAskCategoryOther(lang));
    return;
  }

  if (!VALID_CATEGORY_IDS.has(replyId)) {
    await sendCategoryList(session.phoneNumber, lang, wa, userName);
    return;
  }

  await updateUser(session.phoneNumber, { businessType: replyId });
  await wa.sendText(session.phoneNumber, msgConfirmCategory(lang, categoryDisplayName(replyId, lang)));
  // Phase 2: a change-settings edit ends here — back to the menu.
  if (await finishSetupStepIfEditing(session, lang, wa)) return;

  await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
    currentOrderId: null,
    styleSelection: null,
    styleSelections: [],
    stylePickStep: 0,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    earlyPhotoMediaId: null,
  });
  await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
}

// ---------------------------------------------------------------------------
// SETUP_CATEGORY_OTHER — free-text category capture (Phase 1)
// ---------------------------------------------------------------------------

export async function handleSetupCategoryOther(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = user.language as Language;
  const raw = message.text?.trim() ?? '';

  if (!raw) {
    await wa.sendText(session.phoneNumber, msgAskCategoryOther(lang));
    return;
  }

  // Allow skipping from inside the free-text capture step too.
  if (SKIP_INTENT.test(raw)) {
    await wa.sendText(session.phoneNumber, msgConfirmCategorySkipped(lang));
    // Phase 2: a change-settings edit ends here — back to the menu.
    if (await finishSetupStepIfEditing(session, lang, wa)) return;
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      currentOrderId: null,
      styleSelection: null,
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
    return;
  }

  // Free-text category is stored verbatim (sanitized + lowercased) as the
  // businessType. It won't match any cat_* key in CATEGORY_STYLE_RECOMMENDATION
  // or selectStylesForOrder, which is the intended "no style recommendation for
  // Other" behavior from the plan — both fall through to their defaults.
  // eslint-disable-next-line no-control-regex
  const sanitized = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 50).toLowerCase();
  if (!sanitized) {
    await wa.sendText(session.phoneNumber, msgAskCategoryOther(lang));
    return;
  }
  const displayName = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);

  await updateUser(session.phoneNumber, { businessType: sanitized });
  await wa.sendText(session.phoneNumber, msgConfirmCategory(lang, displayName));
  // Phase 2: a change-settings edit ends here — back to the menu.
  if (await finishSetupStepIfEditing(session, lang, wa)) return;

  await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
    currentOrderId: null,
    styleSelection: null,
    styleSelections: [],
    stylePickStep: 0,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    earlyPhotoMediaId: null,
  });
  await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function sendCategoryList(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  name?: string,
): Promise<void> {
  const greeting = msgAskCategoryHeader(lang, name);

  await wa.sendList(
    phoneNumber,
    greeting,
    isHindi(lang) ? 'Chuniye' : 'Choose',
    [
      {
        title: isHindi(lang) ? 'Product type' : 'Product Type',
        rows: [
          { id: ListIds.CAT_JEWELLERY, title: isHindi(lang) ? 'Jewellery / Zewar' : 'Jewellery', description: 'Rings, necklaces, earrings...' },
          { id: ListIds.CAT_FOOD, title: isHindi(lang) ? 'Khaana / Food' : 'Food', description: 'Packaged food, sweets, snacks...' },
          { id: ListIds.CAT_GARMENT, title: isHindi(lang) ? 'Kapde / Garments' : 'Garments', description: 'Sarees, kurtas, shirts...' },
          { id: ListIds.CAT_SKINCARE, title: 'Skincare / Beauty', description: 'Creams, serums, cosmetics...' },
          { id: ListIds.CAT_CANDLE, title: 'Candle / Home Decor', description: 'Candles, diffusers, decor...' },
          { id: ListIds.CAT_BAG, title: 'Bag / Purse', description: 'Handbags, wallets, clutches...' },
          { id: ListIds.CAT_OTHER, title: isHindi(lang) ? '✏️ Khud likhein' : '✏️ Type my own', description: isHindi(lang) ? 'Apni category type karein' : 'Type your own category' },
          { id: ListIds.CAT_SKIP, title: isHindi(lang) ? '⏭️ Skip karein' : '⏭️ Skip', description: isHindi(lang) ? 'Bina category aage badein' : 'Skip this step' },
        ],
      },
    ],
  );
}

/**
 * Sends the style picker.
 *
 * customMode=false (default, initial):
 *   Two rows only — Smart Pack ✨ and Custom 🎨.
 *
 * customMode=true (after Custom is tapped):
 *   First pick: all 8 individual styles.
 *   Picks 2-3: checkbox state text + Done row + remaining styles.
 */
export async function sendStyleList(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  categoryId?: string,
  alreadyPicked: string[] = [],
  customMode: boolean = false,
): Promise<void> {
  const pickNumber = alreadyPicked.length + 1;

  const styleRows = [
    { id: ListIds.STYLE_AUTMN_SPECIAL, title: styleDisplayName(ListIds.STYLE_AUTMN_SPECIAL, lang) },
    { id: ListIds.STYLE_CLEAN_WHITE, title: styleDisplayName(ListIds.STYLE_CLEAN_WHITE, lang) },
    { id: ListIds.STYLE_STUDIO, title: styleDisplayName(ListIds.STYLE_STUDIO, lang) },
    { id: ListIds.STYLE_LIFESTYLE, title: styleDisplayName(ListIds.STYLE_LIFESTYLE, lang) },
    { id: ListIds.STYLE_OUTDOOR, title: styleDisplayName(ListIds.STYLE_OUTDOOR, lang) },
    { id: ListIds.STYLE_GRADIENT, title: styleDisplayName(ListIds.STYLE_GRADIENT, lang) },
    { id: ListIds.STYLE_FESTIVE, title: styleDisplayName(ListIds.STYLE_FESTIVE, lang) },
    { id: ListIds.STYLE_WITH_MODEL, title: styleDisplayName(ListIds.STYLE_WITH_MODEL, lang) },
  ].filter(row => !alreadyPicked.includes(row.id));

  if (alreadyPicked.length === 0 && !customMode) {
    // Initial 2-option list: Smart Pack or Custom.
    // Phase 7 — upfront copy explains the order shape so users don't think
    // they're locked into picking exactly 3 styles up front.
    const upfront = isHindi(lang)
      ? '1-3 styles chuniye — hum 3 ads banayenge, baaki AI khud bhar dega.'
      : "Pick 1-3 styles — we'll generate 3 ads, AI fills in the rest.";
    const ask = isHindi(lang) ? 'Style chuniye:' : 'Pick your style:';
    await wa.sendList(
      phoneNumber,
      `${upfront}\n\n${ask}`,
      isHindi(lang) ? 'Chuniye' : 'Choose',
      [
        {
          title: 'Let AI choose',
          rows: [{
            id: ListIds.SMART_PACK,
            title: 'Smart Pack ✨',
            description: isHindi(lang)
              ? 'AI aapke product ke liye 3 best styles chunega'
              : 'AI picks the best 3 styles for your product',
          }],
        },
        {
          title: isHindi(lang) ? 'Khud chuniye' : 'Choose yourself',
          rows: [{
            id: ListIds.CUSTOM_PACK,
            title: isHindi(lang) ? 'Custom 🎨' : 'Custom 🎨',
            description: isHindi(lang)
              ? '1, 2 ya 3 styles khud chuniye'
              : 'Pick 1, 2 or 3 styles yourself',
          }],
        },
      ],
    );
  } else if (alreadyPicked.length === 0 && customMode) {
    // Custom mode, first pick: show all 8 individual styles
    await wa.sendList(
      phoneNumber,
      isHindi(lang) ? 'Koi bhi style chuniye:' : 'Pick a style:',
      isHindi(lang) ? 'Chuniye' : 'Choose',
      [{ title: isHindi(lang) ? 'Styles' : 'Styles', rows: styleRows }],
    );
  } else {
    // Picks 2-3: single list message — checkbox state + prompt go into the
    // list body together (Phase 7 polish — was two separate sends before).
    const checkboxText = buildCheckboxState(alreadyPicked, lang);
    const promptText = isHindi(lang)
      ? `Style ${pickNumber} chuniye (optional):`
      : `Pick style ${pickNumber} (optional):`;

    await wa.sendList(
      phoneNumber,
      `${checkboxText}\n\n${promptText}`,
      isHindi(lang) ? 'Chuniye' : 'Choose',
      [{ title: isHindi(lang) ? 'Styles' : 'Styles', rows: styleRows }],
    );
  }
}

function buildCheckboxState(alreadyPicked: string[], lang: Language): string {
  const lines: string[] = [];
  for (let i = 0; i < OUTPUT_STYLES_PER_ORDER; i++) {
    if (i < alreadyPicked.length) {
      lines.push(`✅ ${styleDisplayName(alreadyPicked[i]!, lang)}`);
    } else {
      lines.push('⬜ (optional)');
    }
  }
  const hint = isHindi(lang)
    ? 'Ek aur style chuniye ya Done tap karein ↓'
    : 'Pick another or tap Done ↓';
  return lines.join('\n') + '\n\n' + hint;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

// Explicit set — CAT_OTHER and CAT_SKIP also start with `cat_` but are control
// rows handled separately, not real categories.
const VALID_CATEGORY_IDS = new Set<string>([
  ListIds.CAT_JEWELLERY,
  ListIds.CAT_FOOD,
  ListIds.CAT_GARMENT,
  ListIds.CAT_SKINCARE,
  ListIds.CAT_CANDLE,
  ListIds.CAT_BAG,
  ListIds.CAT_GENERAL,
]);

// ---------------------------------------------------------------------------
// Brand + category parser — for combined "Riya Boutique, Jewellery" replies
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/jewel|jewl|zewar|gold|ring|necklace|earring|haar|kangan|zewarat/i, 'cat_jewellery'],
  [/food|khaana|khana|bakery|sweet|mithai|snack|namkeen|restaurant|cake|bake/i, 'cat_food'],
  [/garment|kapda|kapde|saree|sari|kurta|shirt|dress|cloth|fashion|apparel|lehenga/i, 'cat_garment'],
  [/skin|beauty|cream|serum|lotion|makeup|cosmetic|moisturizer|facewash/i, 'cat_skincare'],
  [/candle|diffuser|fragrance|decor|aroma/i, 'cat_candle'],
  [/bag|purse|wallet|handbag|clutch|backpack/i, 'cat_bag'],
];

function parseBrandAndCategory(raw: string): { brandName: string; categoryId: string | null } {
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\x00-\x1F\x7F]/g, '').trim();

  const sanitize = (s: string) => {
    const t = s.trim().slice(0, 50);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  // Comma-separated: "Riya Boutique, Jewellery"
  const commaIdx = text.indexOf(',');
  if (commaIdx > 0) {
    const brandPart = text.slice(0, commaIdx).trim();
    const categoryPart = text.slice(commaIdx + 1).trim();
    if (brandPart.length >= 1) {
      let categoryId: string | null = null;
      for (const [pattern, id] of CATEGORY_PATTERNS) {
        if (pattern.test(categoryPart)) { categoryId = id; break; }
      }
      return { brandName: sanitize(brandPart), categoryId };
    }
  }

  // No comma: check if a category keyword is embedded
  for (const [pattern, id] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      const stripped = text.replace(pattern, '').replace(/[,\s]+$/, '').trim();
      return { brandName: sanitize(stripped.length >= 1 ? stripped : text), categoryId: id };
    }
  }

  // Only brand name found — no category recognized
  return { brandName: sanitize(text), categoryId: null };
}

/**
 * Fills `existing` styles up to `target` count using the Smart Pack for the
 * given category. Never repeats a style.
 */
function fillWithSmartPack(existing: string[], category: string | null, target: number): string[] {
  if (existing.length >= target) return existing.slice(0, target);
  const smartPack = selectStylesForOrder(category, target);
  const result = [...existing];
  const usedSet = new Set(result);
  for (const style of smartPack) {
    if (result.length >= target) break;
    if (!usedSet.has(style)) { result.push(style); usedSet.add(style); }
  }
  return result.slice(0, target);
}

export { logger };
