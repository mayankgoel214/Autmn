/**
 * Shared utility functions for order creation and media handling.
 * Used by images.ts (AWAITING_PHOTO handler).
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { downloadMedia } from '@autmn/whatsapp';
import type { Session, User } from '@autmn/db';
import { prisma } from '@autmn/db';
import { transitionTo } from '../db-helpers.js';
import { msgProcessingEstimate } from '../messages.js';
import { PRICE_PER_OUTPUT_AD_PAISE, OUTPUT_STYLES_PER_ORDER, ButtonIds } from '../types.js';
import type { Language } from '../types.js';
import { sendPaymentLink, enqueueImageJobs } from './payment.js';
import { selectStylesForOrder } from '../auto-styles.js';
import { mapInstructionsByPosition } from '../instructions-mapping.js';
import { generateUniqueShortId } from '../short-id.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Download media from WhatsApp
// ---------------------------------------------------------------------------

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
  if (!accessToken || accessToken === 'placeholder') {
    console.error(JSON.stringify({ event: 'missing_whatsapp_access_token' }));
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  }

  const DOWNLOAD_TIMEOUT_MS = 20_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Photo download timed out after 20s')), DOWNLOAD_TIMEOUT_MS)
  );

  return Promise.race([
    downloadMedia(mediaId, accessToken),
    timeoutPromise,
  ]);
}

export function mimeToExt(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '.jpg';
}

// ---------------------------------------------------------------------------
// Create order and send payment / start processing
// ---------------------------------------------------------------------------

export interface CreateOrderParams {
  session: Session;
  user: User;
  lang: Language;
  wa: WhatsAppClient;
  imageStorageUrls: string[];
  imageMediaIds: string[];
  imageCount: number;
  /** All 3 styles selected for this order */
  styleSelections: string[];
  voiceInstructions: string | null;
  /**
   * Phase 11 — optional ordered list of per-style user instructions. When the
   * user sent N separate messages (one per style) instead of one combined
   * voice/text blob, pass them here so the position-based mapping algorithm
   * can produce `Order.instructionMappingJson`. The single-blob `voiceInstructions`
   * field above remains the legacy primary path (parsed by the LLM downstream).
   */
  instructionsByPosition?: string[];
}

export async function createOrderAndSendPayment(params: CreateOrderParams): Promise<void> {
  const { session, user, lang, wa, imageStorageUrls, imageMediaIds, imageCount, styleSelections, voiceInstructions, instructionsByPosition } = params;
  const phoneNumber = session.phoneNumber;

  // Deliver exactly the styles the user chose — no auto-padding.
  // Smart Pack always passes 3; custom pickers pass 1-3.
  //
  // Pre-Phase-8 #3: pin the 0-styles semantics. Zero picks → auto-select
  // Smart Pack (3 ads). This branch is now the documented contract, not a
  // "should not happen" fallback. Phase 9's Flow picker explicitly allows
  // a 0-pick submission, so this code path becomes load-bearing then.
  let normalizedStyles =
    styleSelections.length > 0
      ? styleSelections.slice(0, OUTPUT_STYLES_PER_ORDER)
      : selectStylesForOrder(user.businessType, OUTPUT_STYLES_PER_ORDER);

  // Phase 15b' — pre-generate a human-readable short id (its own uniqueness
  // check + the @unique constraint cover the race). Done before the tx so the
  // transaction stays short.
  const shortId = await generateUniqueShortId(async (candidate) => {
    const existing = await prisma.order.findUnique({
      where: { shortId: candidate },
      select: { id: true },
    });
    return existing === null;
  });

  // C3 — atomically claim the single free order AND create the order in ONE
  // transaction:
  //  - The conditional update (orderCount 0 → 1) means two concurrent webhook
  //    deliveries for the same user can't BOTH read 0 and both get a free
  //    order. Exactly one wins the claim; the rest are paid.
  //  - Wrapping the create in the same tx means a failed create rolls back the
  //    claim, so a transient error never burns the user's free first order.
  const { order, isFreeOrder } = await prisma.$transaction(async (tx) => {
    const freeClaim = await tx.user.updateMany({
      where: { id: user.id, orderCount: 0 },
      data: { orderCount: 1 },
    });
    const isFree = freeClaim.count === 1;

    // First-time free order: exactly ONE ad regardless of how many styles
    // arrived. Extra styles are a paid feature from the second order onward.
    const styles = isFree ? normalizedStyles.slice(0, 1) : normalizedStyles;
    if (styles.length < 1 || styles.length > OUTPUT_STYLES_PER_ORDER) {
      throw new Error(
        `createOrderAndSendPayment: expected 1..${OUTPUT_STYLES_PER_ORDER} styles, got ${styles.length}`,
      );
    }

    // Phase 12 — dynamic pricing: ₹49 × ads. First order is always ₹0.
    const amount = isFree ? 0 : PRICE_PER_OUTPUT_AD_PAISE * styles.length;
    const primaryId = styles[0] ?? 'style_clean_white';
    const positionMapping = instructionsByPosition && instructionsByPosition.length > 0
      ? mapInstructionsByPosition(instructionsByPosition, styles)
      : null;

    const created = await tx.order.create({
      data: {
        phoneNumber,
        imageCount,
        style: primaryId,                  // backward compat — first style
        stylesOrdered: styles,
        outputStyleCount: styles.length,
        voiceInstructions,
        inputImageUrls: imageStorageUrls,
        status: 'payment_pending',
        amount,
        amountPaise: amount,
        shortId,
        numStylesPicked: styles.length,
        isFirstFree: isFree,
        instructionMappingJson: positionMapping
          ? (positionMapping as unknown as object)
          : undefined,
        productCategory: user.businessType ?? 'general',
        userId: user.id,
      },
    });

    // Paid orders still advance the lifetime counter (a free order already did
    // the 0 → 1 claim above).
    if (!isFree) {
      await tx.user.update({
        where: { id: user.id },
        data: { orderCount: { increment: 1 } },
      });
    }

    return { order: created, isFreeOrder: isFree };
  });

  // Re-derive downstream values from the persisted order (the tx may have
  // capped styles for a free order).
  normalizedStyles = (order.stylesOrdered as string[]) ?? normalizedStyles;
  const primaryStyleId = order.style ?? 'style_clean_white';

  if (isFreeOrder) {
    // Free order — skip payment, set to processing BEFORE enqueuing
    // (worker checks status: 'processing' for delivery — must be set first)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'processing', processingStartedAt: new Date() },
    });

    await transitionTo(phoneNumber, 'PROCESSING', {
      currentOrderId: order.id,
      styleSelection: primaryStyleId,
    });

    // Phase 13 — single processing-estimate message (replaces msgProcessingNow).
    await wa.sendText(
      phoneNumber,
      msgProcessingEstimate(normalizedStyles.length, imageCount, lang),
    );

    // Enqueue image jobs using the canonical enqueueImageJobs from payment.ts.
    // Order status is already set to 'processing' above; the canonical function
    // will perform an idempotent update back to 'processing', which is harmless.
    await enqueueImageJobs(order.id, phoneNumber, order);
  } else {
    // Paid order — go directly to payment link.
    // User already received "X photos received ✅" from the debounce buttons flow,
    // so the msgPhotoReceivedWithPayment confirmation is intentionally omitted here
    // to avoid a duplicate message. The payment link itself shows the amount.
    const updatedSession = await transitionTo(phoneNumber, 'AWAITING_PAYMENT', {
      currentOrderId: order.id,
      styleSelection: primaryStyleId,
    });

    await sendPaymentLink(updatedSession, user, wa);
  }
}


