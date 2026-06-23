/**
 * Phase 2 — change-settings handler.
 *
 * Single state CHANGE_SETTINGS_MENU. When a row is tapped the handler sets
 * Session.inChangeSettings=true and transitions back to the matching SETUP_*
 * state, re-prompting the user. The Phase 1 handlers check the flag at the end
 * of their happy-path and route back here (instead of progressing forward)
 * when it's set, so we reuse them without duplication.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import type { Session, User } from '@autmn/db';
import { prisma } from '@autmn/db';
import { transitionTo } from '../db-helpers.js';
import { sendCategoryList } from './onboarding.js';
import { startBrandDetailsFlow } from './brand-details.js';
import {
  msgAskLanguage,
  msgAskBrandName,
  msgBrandProfileView,
  btnEditBrand,
  msgChangeSettingsMenuBody,
  msgSettingsExit,
  rowChangeLanguage,
  rowChangeBrand,
  rowChangeCategory,
  rowChangeBrandDetails,
  rowBack,
} from '../messages.js';
import { ButtonIds, ListIds, isHindi } from '../types.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Re-usable list sender — called by the menu handler and by every Phase 1
// handler when it finishes a setting edit (inChangeSettings === true).
//
// De-dupe guard: a rapid repeat trigger (e.g. tapping "Change settings" twice,
// where the second tap lands in CHANGE_SETTINGS_MENU and falls through to the
// menu's default re-show arm) produced two identical "What would you like to
// change?" messages. We suppress a re-render within a short window. The window
// is intentionally short — legitimate re-shows after completing an edit
// (language/brand/category) are spaced out by user interaction and won't be
// caught.
// ---------------------------------------------------------------------------

const CHANGE_SETTINGS_DEDUPE_MS = 6_000;
const lastChangeSettingsMenuAt = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - CHANGE_SETTINGS_DEDUPE_MS;
  for (const [phone, ts] of lastChangeSettingsMenuAt) {
    if (ts < cutoff) lastChangeSettingsMenuAt.delete(phone);
  }
  if (lastChangeSettingsMenuAt.size > 10_000) lastChangeSettingsMenuAt.clear();
}, 60_000).unref();

export async function sendChangeSettingsMenu(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  const now = Date.now();
  const last = lastChangeSettingsMenuAt.get(phoneNumber) ?? 0;
  if (now - last < CHANGE_SETTINGS_DEDUPE_MS) {
    logger.info('Suppressed duplicate change-settings menu', { phoneNumber, ageMs: now - last });
    return;
  }
  lastChangeSettingsMenuAt.set(phoneNumber, now);

  await wa.sendList(
    phoneNumber,
    msgChangeSettingsMenuBody(lang),
    isHindi(lang) ? 'Chuniye' : 'Choose',
    [
      {
        title: isHindi(lang) ? 'Settings' : 'Settings',
        rows: [
          { id: ListIds.SETTING_LANGUAGE,       title: rowChangeLanguage(lang) },
          { id: ListIds.SETTING_BRAND,          title: rowChangeBrand(lang) },
          { id: ListIds.SETTING_CATEGORY,       title: rowChangeCategory(lang) },
          { id: ListIds.SETTING_BRAND_DETAILS,  title: rowChangeBrandDetails(lang) },
          { id: ListIds.SETTING_BACK,           title: rowBack(lang) },
        ],
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// Picker helper — inline copy of the 3-button language picker used by
// onboarding.ts. Duplicated intentionally to keep the diff narrow; consolidate
// in a future cleanup pass if more callers appear.
// ---------------------------------------------------------------------------

async function sendLanguagePicker(phoneNumber: string, wa: WhatsAppClient): Promise<void> {
  try {
    await wa.sendButtons(
      phoneNumber,
      msgAskLanguage(),
      [
        { id: ButtonIds.LANG_HINDI,    title: 'हिंदी' },
        { id: ButtonIds.LANG_ENGLISH,  title: 'English' },
      ],
    );
  } catch (btnErr) {
    logger.error('sendButtons failed sending language picker from change-settings', {
      phoneNumber,
      error: String(btnErr),
    });
    await wa.sendText(
      phoneNumber,
      `${msgAskLanguage()}\n\nReply: hindi / english (or 1 / 2)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleChangeSettingsMenu(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) ?? 'hi';
  const phoneNumber = session.phoneNumber;

  // Phase 4 — the brand-profile view is rendered into THIS state, so we have
  // to accept button replies (Edit / Add more) here too. Handle them before
  // the list-reply gate.
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    switch (message.buttonReplyId) {
      case ButtonIds.EDIT_BRAND:
      // ADD_MORE_BRAND is no longer offered, but old in-flight button taps may
      // still arrive — route them to the same guided edit flow.
      case ButtonIds.ADD_MORE_BRAND: {
        await transitionTo(phoneNumber, 'BRAND_DETAILS_COLLECTING');
        await startBrandDetailsFlow(user, phoneNumber, lang, wa);
        return;
      }
      default:
        // Unknown button — re-show the menu rather than silently ignore.
        await sendChangeSettingsMenu(phoneNumber, lang, wa);
        return;
    }
  }

  // Only list-reply rows drive the rest of this state.
  if (message.messageType !== 'interactive' || !message.listReplyId) {
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  const rowId = message.listReplyId;

  switch (rowId) {
    case ListIds.SETTING_LANGUAGE: {
      await prisma.session.update({
        where: { phoneNumber },
        data: { inChangeSettings: true },
      });
      await transitionTo(phoneNumber, 'SETUP_LANGUAGE');
      await sendLanguagePicker(phoneNumber, wa);
      return;
    }

    case ListIds.SETTING_BRAND: {
      await prisma.session.update({
        where: { phoneNumber },
        data: { inChangeSettings: true },
      });
      await transitionTo(phoneNumber, 'SETUP_NAME');
      await wa.sendText(phoneNumber, msgAskBrandName(lang));
      return;
    }

    case ListIds.SETTING_CATEGORY: {
      await prisma.session.update({
        where: { phoneNumber },
        data: { inChangeSettings: true },
      });
      await transitionTo(phoneNumber, 'SETUP_CATEGORY');
      await sendCategoryList(
        phoneNumber,
        lang,
        wa,
        (user as any).brandName ?? user.name ?? undefined,
      );
      return;
    }

    case ListIds.SETTING_BRAND_DETAILS: {
      // Phase 4 — branch on whether the user already has a BrandProfile with
      // content. With content: render the structured view + Edit/Add-more
      // buttons, stay in CHANGE_SETTINGS_MENU. Without content: drop straight
      // into the collection flow (Phase 3a behaviour).
      const profile = await prisma.brandProfile.findUnique({
        where: { userId: user.id },
      });

      if (profile) {
        const assets = await prisma.brandAsset.findMany({
          where: { brandProfileId: profile.id },
          select: { type: true },
        });
        const hasContent = assets.length > 0 || profile.summary !== null;
        if (hasContent) {
          await sendBrandProfileView(user, profile, assets, phoneNumber, lang, wa);
          return;
        }
      }

      await transitionTo(phoneNumber, 'BRAND_DETAILS_COLLECTING');
      await startBrandDetailsFlow(user, phoneNumber, lang, wa);
      return;
    }

    case ListIds.SETTING_BACK: {
      await transitionTo(phoneNumber, 'IDLE');
      await wa.sendText(phoneNumber, msgSettingsExit(lang));
      return;
    }

    default: {
      // Unrecognised row — show the menu again rather than silently ignore.
      await sendChangeSettingsMenu(phoneNumber, lang, wa);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — brand-profile view renderer. Called when SETTING_BRAND_DETAILS is
// tapped AND the user already has a BrandProfile with assets or summary.
// ---------------------------------------------------------------------------

async function sendBrandProfileView(
  user: User,
  profile: { tagline: string | null; brandColors: string[]; vibe: string | null },
  assets: Array<{ type: string }>,
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  const counts = { image: 0, pdf: 0, doc: 0, text: 0, website: 0 };
  for (const a of assets) {
    if (a.type === 'logo' || a.type === 'reference_image' || a.type === 'sample') counts.image++;
    else if (a.type === 'pdf') counts.pdf++;
    else if (a.type === 'document') counts.doc++;
    else if (a.type === 'text') counts.text++;
    else if (a.type === 'website') counts.website++;
  }

  const viewText = msgBrandProfileView(
    {
      brandName: (user as any).brandName ?? user.name ?? undefined,
      tagline: profile.tagline,
      brandColors: profile.brandColors,
      vibe: profile.vibe,
      assetCounts: counts,
    },
    lang,
  );

  try {
    await wa.sendButtons(phoneNumber, viewText, [
      { id: ButtonIds.EDIT_BRAND, title: btnEditBrand(lang) },
    ]);
  } catch (btnErr) {
    logger.error('sendButtons failed rendering brand-profile view', {
      phoneNumber,
      error: String(btnErr),
    });
    await wa.sendText(
      phoneNumber,
      `${viewText}\n\nReply "edit" to update your brand colours, logo or tagline.`,
    );
  }
}
