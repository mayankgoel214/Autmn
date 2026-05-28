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
  msgDeliveryMenuBody,
  msgDeliveryMenuFooter,
  msgDeliveryRateSectionTitle,
  msgDeliveryNextSectionTitle,
  rowRate,
  rowSendNewProduct,
  rowRequestRefund,
  msgRatingThanks,
  msgAskRefundReason,
  styleDisplayName,
  msgSendProductPhotos,
} from '../messages.js';
import { ListIds, isHindi } from '../types.js';
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

  // Phase 14 — single list with two sections: rating (1-5⭐) + next step
  // (Send new product / Request refund). Replaces the legacy numbered text
  // menu and the Save/Order-another button group.
  await sendDeliveryMenu(phoneNumber, totalAdCount, language, wa);
}

async function sendDeliveryMenu(
  phoneNumber: string,
  adCount: number,
  language: Language,
  wa: WhatsAppClient,
): Promise<void> {
  try {
    await wa.sendList(
      phoneNumber,
      msgDeliveryMenuBody(adCount, language),
      msgDeliveryMenuFooter(language),
      [
        {
          title: msgDeliveryRateSectionTitle(language),
          rows: [
            { id: ListIds.RATE_5, title: rowRate(5, language) },
            { id: ListIds.RATE_4, title: rowRate(4, language) },
            { id: ListIds.RATE_3, title: rowRate(3, language) },
            { id: ListIds.RATE_2, title: rowRate(2, language) },
            { id: ListIds.RATE_1, title: rowRate(1, language) },
          ],
        },
        {
          title: msgDeliveryNextSectionTitle(language),
          rows: [
            { id: ListIds.SEND_NEW_PRODUCT, title: rowSendNewProduct(language) },
            { id: ListIds.REQUEST_REFUND, title: rowRequestRefund(language) },
          ],
        },
      ],
    );
  } catch (err) {
    logger.error('Delivery menu send failed; falling back to text body only', {
      phoneNumber,
      error: String(err),
    });
    await wa.sendText(phoneNumber, msgDeliveryMenuBody(adCount, language));
  }
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

  // ── List-reply routing (the Phase 14 menu) ───────────────────────────────
  if (message.messageType === 'interactive' && message.listReplyId) {
    const id = message.listReplyId;
    const ratingMap: Record<string, number> = {
      [ListIds.RATE_1]: 1,
      [ListIds.RATE_2]: 2,
      [ListIds.RATE_3]: 3,
      [ListIds.RATE_4]: 4,
      [ListIds.RATE_5]: 5,
    };

    if (id in ratingMap) {
      await handleRating(session, user, wa, lang, ratingMap[id]!);
      return;
    }
    if (id === ListIds.SEND_NEW_PRODUCT) {
      await handleSendNewProduct(session, wa, lang);
      return;
    }
    if (id === ListIds.REQUEST_REFUND) {
      await handleRequestRefund(session, user, wa, lang);
      return;
    }
    // Unknown list id — re-show the menu.
    await reshowDeliveryMenu(session, wa, lang);
    return;
  }

  // ── "hi" greeting still bounces back to IDLE so the returning-user menu
  //    fires naturally. Other free-form text re-shows the menu. ────────────
  if (message.messageType === 'text' && message.text) {
    const t = message.text.trim();
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
    // Any other text — re-show the menu rather than silently dropping.
    await reshowDeliveryMenu(session, wa, lang);
    return;
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

  // ── Default — re-show the delivery menu ─────────────────────────────────
  await reshowDeliveryMenu(session, wa, lang);
}

async function reshowDeliveryMenu(
  session: Session,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  let adCount = 1;
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({
      where: { id: session.currentOrderId },
      select: { outputStyleCount: true, stylesOrdered: true, numStylesPicked: true },
    }).catch(() => null);
    adCount =
      order?.numStylesPicked ||
      order?.outputStyleCount ||
      (order?.stylesOrdered as string[] | null)?.length ||
      1;
  }
  await sendDeliveryMenu(session.phoneNumber, adCount, lang, wa);
}

async function handleRating(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: Language,
  rating: number,
): Promise<void> {
  if (session.currentOrderId) {
    await prisma.order.update({
      where: { id: session.currentOrderId },
      data: { rating, ratedAt: new Date() },
    }).catch((err) => {
      logger.warn('Failed to write Order.rating', {
        orderId: session.currentOrderId,
        rating,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  await wa.sendText(session.phoneNumber, msgRatingThanks(rating, lang));
  logger.info('Order rated', {
    phoneNumber: session.phoneNumber,
    orderId: session.currentOrderId,
    rating,
  });
  // Stay in DELIVERED — the action rows in the same menu remain tappable.
  // Also update lastStyleUsed/totalImages/styleHistory if this rating is the
  // first feedback we got (parity with the legacy "Save and finish" path).
  const order = session.currentOrderId
    ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
    : null;
  const currentHistory = (user.styleHistory as Record<string, number> | null) ?? {};
  const styleId = session.styleSelection ?? order?.style ?? null;
  const updatedHistory = styleId
    ? { ...currentHistory, [styleId]: (currentHistory[styleId] ?? 0) + 1 }
    : currentHistory;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totalImages: { increment: order?.imageCount ?? 0 },
      ...(styleId ? { lastStyleUsed: styleId } : {}),
      styleHistory: updatedHistory,
    },
  }).catch(() => {});
}

async function handleSendNewProduct(
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

async function handleRequestRefund(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({
      where: { id: session.currentOrderId },
      select: { amountPaise: true, amount: true, refundStatus: true },
    });

    // Plan §2 anti-abuse: "One refund request per order. Once refundStatus
    // is set, additional taps show 'Refund request already submitted'." This
    // guard MUST run before the free-order short-circuit so a user can't
    // toggle between menu rows to overwrite an already-submitted reason.
    if (order?.refundStatus) {
      const { msgRefundAlreadyRequested } = await import('../messages.js');
      await wa.sendText(session.phoneNumber, msgRefundAlreadyRequested(lang, order.refundStatus));
      return;
    }

    // Phase 15b' — short-circuit free orders. No charge, nothing to refund;
    // direct the user to "Send new product" instead and stay in DELIVERED.
    const totalPaise = (order?.amountPaise ?? 0) || (order?.amount ?? 0);
    if (totalPaise === 0) {
      const { handleFreeOrderRefundShortCircuit } = await import('./refund.js');
      await handleFreeOrderRefundShortCircuit(session, user, wa);
      return;
    }
  }

  await transitionTo(session.phoneNumber, 'REFUND_REQUEST');
  // Phase 15 — the user's next message (text or voice) becomes the refund
  // reason and is processed by handlers/refund.ts. We just send the opening
  // prompt here and let the state machine route subsequent input.
  await wa.sendText(session.phoneNumber, msgAskRefundReason(lang));
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
