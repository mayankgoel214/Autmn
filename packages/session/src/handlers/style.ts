/**
 * SETUP_STYLE handler — styles-first flow.
 *
 * Styles are picked BEFORE photos are submitted.
 * After style pack pick (or completing custom 3-step) → go to AWAITING_PHOTO.
 * Style-change edit path (session.currentOrderId) is unchanged.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import type { Session, User } from '@autmn/db';
import { prisma } from '@autmn/db';
import { getImageQueue } from '@autmn/queue';
import { transitionTo } from '../db-helpers.js';
import { styleDisplayName, msgRevisionLimitReached, msgAllStylesReady, msgSendProductPhotos, msgStylePackReady } from '../messages.js';
import { createOrderAndSendPayment } from './instructions.js';
import { ListIds, ButtonIds, FREE_REDOS_PER_STYLE, OUTPUT_STYLES_PER_ORDER, isHindi } from '../types.js';
import { selectStylesForOrder } from '../auto-styles.js';
import type { Language } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

export async function handleSetupStyle(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = user.language as Language;
  const phoneNumber = session.phoneNumber;

  // First-time free order → single-pick picker (one free picture). currentOrderId
  // is only set on the style-change edit path, which is multi-irrelevant here.
  const isFirstFreeOrder = user.orderCount === 0 && !session.currentOrderId;

  let styleId: string | null = null;

  // List reply (normal flow)
  if (message.messageType === 'interactive' && message.listReplyId) {
    // "Done" tap — proceed with however many styles were picked
    if (message.listReplyId === ListIds.STYLE_DONE) {
      const currentPicked = (session.styleSelections as string[]) ?? [];
      if (currentPicked.length > 0) {
        const styleNames = currentPicked.map(s => styleDisplayName(s, lang));
        await wa.sendText(phoneNumber, msgAllStylesReady(lang, styleNames));
        logger.info('Early style exit via Done tap', { phoneNumber, styles: currentPicked });
        await finishStylePicking(phoneNumber, currentPicked, session, user, lang, wa);
        return;
      }
      // No styles yet — re-show the first list
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, [], false, isFirstFreeOrder);
      return;
    }

    if (VALID_STYLE_IDS.has(message.listReplyId)) {
      styleId = message.listReplyId;
    }
  }

  // User typed a style name
  if (!styleId && message.messageType === 'text' && message.text) {
    styleId = resolveStyleFromText(message.text.trim().toLowerCase());
  }

  // Returning user: same/new style buttons
  if (!styleId && message.messageType === 'interactive' && message.buttonReplyId) {
    if (message.buttonReplyId === ButtonIds.SAME_STYLE && user.lastStyleUsed) {
      styleId = user.lastStyleUsed;
    }
    if (message.buttonReplyId === ButtonIds.NEW_STYLE) {
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, []);
      return;
    }
  }

  // Fallback: buttonReplyId might contain a style ID (some WhatsApp clients send list selections as button replies)
  if (!styleId && message.buttonReplyId) {
    if (VALID_STYLE_IDS.has(message.buttonReplyId)) {
      styleId = message.buttonReplyId;
    }
  }

  if (!styleId) {
    // Early exit: if user says "done"/"ok"/"bas" and has already picked at least 1 style
    if (message.messageType === 'text' && message.text) {
      const t = message.text.trim().toLowerCase();
      const isDoneIntent = /^(done|ok|okay|bas|theek|theek hai|ho gaya|chalega|chalo|proceed|next|aage)\s*$/.test(t);
      const currentPicked = (session.styleSelections as string[]) ?? [];
      if (isDoneIntent && currentPicked.length > 0) {
        const styleNames = currentPicked.map(s => styleDisplayName(s, lang));
        await wa.sendText(phoneNumber, msgAllStylesReady(lang, styleNames));
        logger.info('Early style exit via "done" intent', { phoneNumber, styles: currentPicked });
        await finishStylePicking(phoneNumber, currentPicked, session, user, lang, wa);
        return;
      }
    }

    const alreadyPicked = (session.styleSelections as string[]) ?? [];
    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, alreadyPicked, false, isFirstFreeOrder);
    return;
  }

  // --- Pack selections: resolve to 3 concrete styles and go to AWAITING_PHOTO ---
  const packStyles = resolvePackStyles(styleId, user.businessType ?? null);
  if (packStyles) {
    // Custom pack: start the individual style picker (customMode=true)
    if (styleId === ListIds.CUSTOM_PACK) {
      await prisma.session.update({
        where: { phoneNumber },
        data: {
          styleSelections: [],
          stylePickStep: 0,
          styleSelection: null,
        },
      });
      logger.info(JSON.stringify({ event: 'custom_pack_selected', phoneNumber }));
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, [], true);
      return;
    }

    // Pre-made pack or Smart Pack: resolve all 3 styles, then go to AWAITING_PHOTO
    const packName = packDisplayName(styleId, lang);
    const styleNames = packStyles.map(s => styleDisplayName(s, lang));
    logger.info(JSON.stringify({ event: 'style_pack_selected', pack: styleId, category: user.businessType, styles: packStyles }));

    await wa.sendText(phoneNumber, msgStylePackReady(lang, packName, styleNames));

    // Save styles and transition to AWAITING_PHOTO — photos come after styles
    await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
      styleSelection: packStyles[0],
      styleSelections: packStyles,
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      currentOrderId: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(phoneNumber, msgSendProductPhotos(lang));
    return;
  }

  const styleName = styleDisplayName(styleId, lang);

  // Check if this is a style-change edit (currentOrderId preserved from edit.ts)
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
    if (order && order.inputImageUrls.length > 0) {
      // Check revision limits: each output style gets FREE_REDOS_PER_STYLE free redo(s).
      // Total free redos for the order = outputStyleCount * FREE_REDOS_PER_STYLE.
      const totalFreeRedos = (order.outputStyleCount || (order.stylesOrdered as string[]).length || OUTPUT_STYLES_PER_ORDER) * FREE_REDOS_PER_STYLE;
      if (order.revisionsUsed >= totalFreeRedos) {
        await wa.sendText(phoneNumber, msgRevisionLimitReached(lang, order.imageCount));
        await transitionTo(phoneNumber, 'DELIVERED');
        return;
      }

      // Style-change edit: reuse existing photos, enqueue reprocessing immediately
      await wa.sendText(
        phoneNumber,
        isHindi(lang)
          ? `*${styleName}* mein bana rahe hain — bas thoda wait karein!`
          : `Reprocessing in *${styleName}* — just a moment!`,
      );

      const inputImageUrls = (order.inputImageUrls as string[]) ?? [];
      const cutoutUrls = (order.cutoutUrls as string[]) ?? [];

      // Style-change edit: reprocess EXACTLY 1 job using the primary input image.
      // Using all images would create N jobs, delivering N outputs and confusing the user.
      const primaryUrl = order.primaryInputImageUrl
        ?? cutoutUrls[0]
        ?? inputImageUrls[0]
        ?? '';

      if (!primaryUrl) {
        await wa.sendText(phoneNumber, isHindi(lang) ? 'Photo nahi mili.' : 'Could not find the original photo.');
        await transitionTo(phoneNumber, 'DELIVERED');
        return;
      }

      const useCutout = !!cutoutUrls[0] && primaryUrl === cutoutUrls[0];

      await prisma.order.update({
        where: { id: order.id },
        data: {
          style: styleId,
          revisionsUsed: { increment: 1 },
          status: 'processing',
          processingStartedAt: new Date(),
          processingCompletedAt: null,
        },
      });

      const editJobId = crypto.randomUUID();
      await prisma.imageJob.create({
        data: {
          id: editJobId,
          orderId: order.id,
          inputImageUrl: primaryUrl,
          style: styleId,
          styleIndex: 0,
          status: 'queued',
        },
      });

      const queue = getImageQueue();
      await queue.add('process_image', {
        orderId: order.id,
        imageJobId: editJobId,
        phoneNumber: phoneNumber,
        inputImageUrl: primaryUrl,
        style: styleId,
        productCategory: order.productCategory ?? undefined,
        pipeline: useCutout ? 'fallback' : 'primary',
      });

      await transitionTo(phoneNumber, 'EDIT_PROCESSING', {
        styleSelection: styleId,
      });

      logger.info('Style-change edit: single-job reprocessing with new style', {
        phoneNumber,
        styleId,
        orderId: order.id,
        primaryUrl,
      });
      return;
    }
  }

  // --- First free order: exactly ONE style → one free ad, finish immediately ---
  // The single-pick picker (sendStyleList singlePick) shows individual styles
  // with no multi-step, so a first-timer's tap lands here. currentOrderId is
  // only set on the style-change edit path (handled above), so this never
  // collides with an edit.
  if (isFirstFreeOrder) {
    logger.info('First free order — single style pick complete', { phoneNumber, styleId });
    await wa.sendText(phoneNumber, msgAllStylesReady(lang, [styleName]));
    await finishStylePicking(phoneNumber, [styleId], session, user, lang, wa);
    return;
  }

  // --- 3-step style picker flow ---
  const currentPicked = (session.styleSelections as string[]) ?? [];
  const currentStep = typeof session.stylePickStep === 'number' ? session.stylePickStep : 0;
  const updatedSelections = [...currentPicked, styleId];
  const cappedSelections = updatedSelections.slice(0, OUTPUT_STYLES_PER_ORDER);
  const newStep = Math.min(cappedSelections.length, OUTPUT_STYLES_PER_ORDER);

  logger.info('Style step picked', { phoneNumber, styleId, newStep, total: OUTPUT_STYLES_PER_ORDER });

  if (newStep < OUTPUT_STYLES_PER_ORDER) {
    // More styles to pick — save progress and show next list
    await prisma.session.update({
      where: { phoneNumber },
      data: {
        styleSelections: cappedSelections,
        stylePickStep: newStep,
        // Keep styleSelection as first pick for backward compat
        styleSelection: cappedSelections[0] ?? null,
      },
    });

    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, cappedSelections);
    return;
  }

  // All 3 custom styles picked
  const styleNames = cappedSelections.map(s => styleDisplayName(s, lang));
  await wa.sendText(phoneNumber, msgAllStylesReady(lang, styleNames));

  logger.info('Custom 3-step style pick complete', { phoneNumber, styles: cappedSelections });
  await finishStylePicking(phoneNumber, cappedSelections, session, user, lang, wa);
}

// ---------------------------------------------------------------------------

// All pack IDs and individual style IDs that are valid list reply values.
// Pack IDs are resolved to concrete style arrays before being saved.
const PACK_IDS = new Set<string>([
  ListIds.SMART_PACK,
  ListIds.BESTSELLER_PACK,
  ListIds.FESTIVAL_PACK,
  ListIds.ACTION_PACK,
  ListIds.CUSTOM_PACK,
]);

const VALID_STYLE_IDS = new Set<string>([
  ...Object.values(ListIds).filter(id => id.startsWith('style_')),
  ...Array.from(PACK_IDS),
]);

/**
 * Returns the 3 concrete style IDs for a given pack, or null if the styleId is
 * not a pack (meaning it's an individual style ID for the custom 3-step flow).
 * Returns an empty array for CUSTOM_PACK (caller handles separately).
 */
function resolvePackStyles(styleId: string, category: string | null): string[] | null {
  if (styleId === ListIds.SMART_PACK) {
    return resolveSmartPack(category);
  }
  if (styleId === ListIds.BESTSELLER_PACK) {
    return ['style_lifestyle', 'style_studio', 'style_gradient'];
  }
  if (styleId === ListIds.FESTIVAL_PACK) {
    return ['style_festive', 'style_lifestyle', 'style_clean_white'];
  }
  if (styleId === ListIds.ACTION_PACK) {
    return ['style_with_model', 'style_outdoor', 'style_lifestyle'];
  }
  if (styleId === ListIds.CUSTOM_PACK) {
    return []; // signal caller to start 3-step picker
  }
  return null; // not a pack — individual style
}

/**
 * Human-readable display name for a pack.
 */
function packDisplayName(packId: string, lang: Language): string {
  const names: Record<string, { hinglish: string; en: string }> = {
    smart_pack: { hinglish: 'Smart Pack \u2728', en: 'Smart Pack \u2728' },
    bestseller_pack: { hinglish: 'Best Seller Pack \ud83c\udfc6', en: 'Best Seller Pack \ud83c\udfc6' },
    festival_pack: { hinglish: 'Festival Pack \ud83c\udf89', en: 'Festival Pack \ud83c\udf89' },
    action_pack: { hinglish: 'Action Pack \ud83d\udcaa', en: 'Action Pack \ud83d\udcaa' },
    custom_pack: { hinglish: 'Custom \ud83c\udfa8', en: 'Custom \ud83c\udfa8' },
  };
  const key = isHindi(lang) ? 'hinglish' : 'en';
  return names[packId]?.[key] ?? packId;
}

/**
 * Resolves Smart Pack to the 3 best concrete styles for the given product category.
 */
function resolveSmartPack(category: string | null): string[] {
  return selectStylesForOrder(category, OUTPUT_STYLES_PER_ORDER);
}

/**
 * Called when style picking is complete (all 3 picked or early exit).
 * If photos are already in the session (photo-first flow), creates the order immediately.
 * Otherwise transitions to AWAITING_PHOTO so the user can send photos.
 */
async function finishStylePicking(
  phoneNumber: string,
  styles: string[],
  session: Session,
  user: User,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  const imageUrls = (session.imageStorageUrls as string[]) ?? [];
  const imageIds = (session.imageMediaIds as string[]) ?? [];

  if (imageUrls.length > 0) {
    // Photo-first flow: photos already collected — save styles then create order
    const updatedSession = await prisma.session.update({
      where: { phoneNumber },
      data: { styleSelection: styles[0] ?? null, styleSelections: styles, stylePickStep: 0 },
    });
    await createOrderAndSendPayment({
      session: updatedSession,
      user,
      lang,
      wa,
      imageStorageUrls: imageUrls,
      imageMediaIds: imageIds,
      imageCount: imageUrls.length,
      styleSelections: styles,
      voiceInstructions: session.voiceInstructions ?? null,
    });
  } else {
    // No photos yet — ask user to send photos
    await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
      styleSelection: styles[0],
      styleSelections: styles,
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      currentOrderId: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(phoneNumber, msgSendProductPhotos(lang));
  }
}

function resolveStyleFromText(text: string): string | null {
  // Phase 10 — match the "Anything You Want" intent first, since words like
  // "custom" / "anything" are unambiguous and shouldn't be hijacked by the
  // generic-keyword matchers below.
  if (text.includes('anything') || text.includes('custom') || text.includes('kuch bhi') || text.includes('apni marzi') || text.includes('khud')) return ListIds.STYLE_ANYTHING_YOU_WANT;
  if (text.includes('special') || text.includes('autmn') || text.includes('best') || text.includes('creative')) return ListIds.STYLE_AUTMN_SPECIAL;
  if (text.includes('white') || text.includes('safed') || text.includes('clean')) return ListIds.STYLE_CLEAN_WHITE;
  if (text.includes('lifestyle') || text.includes('life')) return ListIds.STYLE_LIFESTYLE;
  if (text.includes('gradient') || text.includes('color') || text.includes('colour')) return ListIds.STYLE_GRADIENT;
  if (text.includes('outdoor') || text.includes('bahar') || text.includes('nature')) return ListIds.STYLE_OUTDOOR;
  if (text.includes('studio') || text.includes('professional')) return ListIds.STYLE_STUDIO;
  if (text.includes('festive') || text.includes('tyohar') || text.includes('festival')) return ListIds.STYLE_FESTIVE;
  if (text.includes('minimal') || text.includes('simple')) return ListIds.STYLE_CLEAN_WHITE;
  if (text.includes('model') || text.includes('person') || text.includes('human')) return ListIds.STYLE_WITH_MODEL;
  if (text.includes('video') || text.includes('reel') || text.includes('clip')) return ListIds.STYLE_AUTMN_SPECIAL;
  return null;
}
