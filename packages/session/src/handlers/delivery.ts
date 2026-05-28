/**
 * DELIVERED state handler — interim Phase 8 shape.
 *
 * Phase 8 removed the inline edit/revision flow entirely. The DELIVERED
 * feedback set is now just FEEDBACK_GREAT (Save & finish) + a numbered
 * fallback for "Order another product" / "Save and finish". Phase 14 will
 * replace this with the 5⭐ + "Send new product" + "Request refund" menu;
 * until then, ad regeneration after delivery is unsupported on purpose.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { transitionTo } from '../db-helpers.js';
import {
  msgImageDelivered,
  msgStyleImageDelivered,
  msgAskFeedback,
  styleDisplayName,
  msgSendProductPhotos,
} from '../messages.js';
import { ButtonIds, isHindi } from '../types.js';
import type { Language } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Style emoji map for 3-style output labels
// ---------------------------------------------------------------------------

const STYLE_EMOJI: Record<string, string> = {
  style_clean_white: '⬜',
  style_studio: '📸',
  style_gradient: '🎨',
  style_lifestyle: '🌿',
  style_outdoor: '🌳',
  style_festive: '🎉',
  style_with_model: '👤',
  style_autmn_special: '✨',
  style_video_shoot: '🎬',
};

// ---------------------------------------------------------------------------
// Send processed images to user (called by worker after processing completes)
// ---------------------------------------------------------------------------

export async function sendProcessedImages(
  phoneNumber: string,
  outputImageUrls: string[],
  language: Language,
  userName: string | undefined,
  wa: WhatsAppClient,
  videoUrls?: string[],
  storyUrls?: string[],
  styleLabels?: string[],
): Promise<void> {
  logger.info('Delivering processed images', { phoneNumber, count: outputImageUrls.length, videoCount: videoUrls?.length ?? 0, hasStyleLabels: !!styleLabels });

  for (let i = 0; i < outputImageUrls.length; i++) {
    const url = outputImageUrls[i]!;

    let caption: string;
    if (styleLabels && styleLabels[i]) {
      const styleId = styleLabels[i]!;
      const emoji = STYLE_EMOJI[styleId] ?? '✨';
      const label = styleDisplayName(styleId, language);
      caption = msgStyleImageDelivered(language, label, emoji, i + 1, outputImageUrls.length);
    } else {
      caption =
        outputImageUrls.length === 1
          ? msgImageDelivered(language, userName)
          : msgImageDelivered(language, userName, i + 1, outputImageUrls.length);
    }

    await wa.sendImage(phoneNumber, url, caption);

    // Gap after every image — including the last one, so the completion text
    // doesn't fire before WhatsApp has finished delivering the final image.
    await sleep(1500);
  }

  // Re-check that ALL jobs for this order are truly complete before showing
  // feedback buttons. This prevents showing buttons prematurely when another
  // job finishes and delivers its image AFTER the buttons were already sent.
  const session = await prisma.session.findUnique({ where: { phoneNumber } });
  const currentOrderId = session?.currentOrderId;
  if (currentOrderId) {
    const pendingJobs = await prisma.imageJob.count({
      where: {
        orderId: currentOrderId,
        status: { notIn: ['completed', 'failed'] },
      },
    });
    if (pendingJobs > 0) {
      logger.info('Skipping feedback buttons — jobs still pending', {
        phoneNumber,
        orderId: currentOrderId,
        pendingJobs,
      });
      return;
    }
  }

  // Fetch total ad count from the order for the menu message
  let totalAdCount = outputImageUrls.length;
  if (currentOrderId) {
    const orderForCount = await prisma.order.findUnique({
      where: { id: currentOrderId },
      select: { stylesOrdered: true, outputStyleCount: true },
    }).catch(() => null);
    const count = orderForCount?.outputStyleCount
      ?? (orderForCount?.stylesOrdered as string[] | null)?.length
      ?? outputImageUrls.length;
    if (count > 0) totalAdCount = count;
  }

  // Extra buffer: WhatsApp accepts image sends immediately but delivers them
  // asynchronously through its CDN. 3 s gives the last image time to land
  // before the summary text arrives, preventing out-of-order display.
  await sleep(3000);
  await wa.sendText(phoneNumber, buildPostDeliveryMenu(totalAdCount, language));
}

// ---------------------------------------------------------------------------
// Handle feedback in DELIVERED state — interim Phase 8 shape.
// ---------------------------------------------------------------------------

export async function handleDelivered(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hinglish';

  // ── Numbered text-reply parsing (Phase 8 menu has 2 options) ─────────────
  if (message.messageType === 'text' && message.text) {
    const t = message.text.trim();

    // Phase 8 menu: 1 = Order another, 2 = Save and finish. (Phase 14 replaces
    // this with 5⭐ + Send new product + Request refund.)
    if (isMenuOrderAnother(t)) {
      await handleOrderAnother(session, wa, lang);
      return;
    }
    if (isMenuSaveFinish(t)) {
      await handleSaveAndFinish(session, user, wa, lang);
      return;
    }

    // "hi" / "hello" greetings in DELIVERED → transition to IDLE so the
    // returning-user 2-button menu fires naturally. Same behaviour as before
    // the edit flow was removed.
    const isGreeting = /^(hi|hello|hey|hii|hiii|namaste|naya|new|start|shuru|hlo|hlw)\s*$/i.test(t);
    if (isGreeting) {
      logger.info('Greeting in DELIVERED state, transitioning to IDLE', { text: t, phoneNumber: session.phoneNumber });
      try {
        await transitionTo(session.phoneNumber, 'IDLE');
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
        if (freshSession) {
          const { handleIdle } = await import('./onboarding.js');
          await handleIdle(freshSession, user, message, wa);
        }
      } catch (err) {
        logger.error('Error in greeting→IDLE→handleIdle path', {
          phoneNumber: session.phoneNumber,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
        });
        throw err;
      }
      return;
    }
  }

  // ── Interactive buttons ──────────────────────────────────────────────────
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    if (message.buttonReplyId === ButtonIds.FEEDBACK_GREAT) {
      await handleSaveAndFinish(session, user, wa, lang);
      return;
    }
    // All other button IDs (legacy FEEDBACK_CHANGE / FEEDBACK_REDO /
    // REDO_STYLE_* / try_new_style / reuse_photo / new_photo) were removed
    // in Phase 8. Fall through to the default re-prompt.
  }

  // ── New photo → start a new order, preserving last style ────────────────
  if (message.messageType === 'image') {
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      imageMediaIds: [],
      imageStorageUrls: [],
      currentOrderId: null,
      styleSelection: user.lastStyleUsed ?? session.styleSelection ?? null,
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    const { handleAwaitingPhoto } = await import('./images.js');
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
    if (freshSession) {
      await handleAwaitingPhoto(freshSession, user, message, wa);
    }
    return;
  }

  // ── Default — re-show the single Save & finish button ───────────────────
  try {
    await wa.sendButtons(session.phoneNumber, msgAskFeedback(lang), [
      { id: ButtonIds.FEEDBACK_GREAT, title: 'Love it! ❤️' },
    ]);
  } catch {
    await wa.sendText(session.phoneNumber, msgAskFeedback(lang));
  }
}

// ---------------------------------------------------------------------------
// Post-delivery numbered menu
// ---------------------------------------------------------------------------

function buildPostDeliveryMenu(adCount: number, lang: Language): string {
  const countStr = adCount === 1 ? '1 ad' : `${adCount} ads`;
  if (lang === 'hi') {
    const countHi = adCount === 1 ? 'ये रहा आपका 1 ऐड' : `ये रहे आपके ${adCount} ऐड`;
    return `${countHi} 🎉\n\nअब क्या करना है?\n\n1 — दूसरे प्रोडक्ट का ऑर्डर करें\n2 — सेव करके खत्म करें`;
  }
  if (isHindi(lang)) {
    return `Yeh raha aapka ${adCount === 1 ? '1 ad' : `${adCount} ads`} 🎉\n\nKya karna chahenge? Reply karein:\n\n1 — Doosre product ka order\n2 — Save karke khatam`;
  }
  return `That's your ${countStr} 🎉\n\nWhat would you like to do? Reply with:\n\n1 — Order another product\n2 — Save and finish`;
}

function isMenuOrderAnother(t: string): boolean {
  // Phase 8 menu option "1" -> Order another. The legacy "2" / "3" digits
  // are intentionally NOT honoured here — if we accepted them too they would
  // collide with the new "2 = Save" mapping below.
  return /^(1|order|another|nayi?\s*order|doosra|naya)\b/i.test(t);
}

function isMenuSaveFinish(t: string): boolean {
  // Phase 8 menu option "2" -> Save. Also accepts the legacy "3" digit and
  // all the save-intent keywords so users coming back from stale chat history
  // typing "3" or "save" still navigate correctly.
  return /^(2|3|save|finish|done|khatam|ho\s*gaya|theek)\b/i.test(t);
}

// ---------------------------------------------------------------------------
// Sub-handlers
// ---------------------------------------------------------------------------

async function handleOrderAnother(
  session: Session,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
    imageMediaIds: [],
    imageStorageUrls: [],
    currentOrderId: null,
    styleSelection: null,
    styleSelections: [],
    stylePickStep: 0,
    voiceInstructions: null,
    earlyPhotoMediaId: null,
  });
  await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
}

async function handleSaveAndFinish(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  await wa.sendText(
    session.phoneNumber,
    isHindi(lang)
      ? 'Done! Aapke ads save ho gaye. Kisi bhi time message karein — hum aur ads banane ke liye ready hain. 😊'
      : 'Done. Your ads are saved. Message us anytime to make more. 😊',
  );

  const order = session.currentOrderId
    ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
    : null;

  const currentHistory = (user.styleHistory as Record<string, number> | null) ?? {};
  const styleId = session.styleSelection ?? order?.style ?? null;
  const updatedHistory = styleId
    ? { ...currentHistory, [styleId]: (currentHistory[styleId] ?? 0) + 1 }
    : currentHistory;

  // Pre-Phase-8 #2: orderCount is now incremented in createOrderAndSendPayment
  // (at order creation, not on Save & finish), so a user who never tapped this
  // feedback button no longer gets unlimited free orders. totalImages /
  // lastStyleUsed / styleHistory are still per-delivery and stay here.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totalImages: { increment: order?.imageCount ?? 0 },
      ...(styleId ? { lastStyleUsed: styleId } : {}),
      styleHistory: updatedHistory,
    },
  });

  await transitionTo(session.phoneNumber, 'IDLE', {
    currentOrderId: null,
    styleSelection: null,
    voiceInstructions: null,
    imageMediaIds: [],
    imageStorageUrls: [],
    earlyPhotoMediaId: null,
  });

  logger.info('Order completed — Save and finish', {
    phoneNumber: session.phoneNumber,
    orderId: order?.id,
    styleId,
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
