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
import {
  msgAskLanguage,
  msgAskBrandName,
  msgChangeSettingsMenuBody,
  msgBrandDetailsComingSoon,
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
// ---------------------------------------------------------------------------

export async function sendChangeSettingsMenu(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
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
        { id: ButtonIds.LANG_HINGLISH, title: 'Hinglish' },
      ],
    );
  } catch (btnErr) {
    logger.error('sendButtons failed sending language picker from change-settings', {
      phoneNumber,
      error: String(btnErr),
    });
    await wa.sendText(
      phoneNumber,
      `${msgAskLanguage()}\n\nReply: hindi / english / hinglish (or 1 / 2 / 3)`,
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

  // Only list-reply rows drive this state; anything else re-prompts.
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
      // Phase 3 wires the real brand-details flow. Stub for Phase 2: ack and
      // stay in the menu so the user can pick something else.
      await wa.sendText(phoneNumber, msgBrandDetailsComingSoon(lang));
      await sendChangeSettingsMenu(phoneNumber, lang, wa);
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
