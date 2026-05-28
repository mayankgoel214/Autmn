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
  const normalizedStyles =
    styleSelections.length > 0
      ? styleSelections.slice(0, OUTPUT_STYLES_PER_ORDER)
      : selectStylesForOrder(user.businessType, OUTPUT_STYLES_PER_ORDER);

  // Hard assertion — Smart Pack auto-select is defined as 3 styles, custom
  // pickers cap at OUTPUT_STYLES_PER_ORDER. Anything outside [1, 3] is a bug.
  if (normalizedStyles.length < 1 || normalizedStyles.length > OUTPUT_STYLES_PER_ORDER) {
    throw new Error(
      `createOrderAndSendPayment: expected 1..${OUTPUT_STYLES_PER_ORDER} styles, got ${normalizedStyles.length}`,
    );
  }

  const primaryStyleId = normalizedStyles[0] ?? 'style_clean_white';
  // Pre-Phase-8 #2: freemium flag is computed BEFORE the orderCount increment.
  const isFreeOrder = user.orderCount === 0;
  // Phase 12 — dynamic pricing: ₹49 × number of output ads. 1 style = ₹49,
  // 2 styles = ₹98, 3 styles (incl. Smart Pack auto-fill) = ₹147. First
  // order is always ₹0 regardless of how many styles were picked.
  const amount = isFreeOrder ? 0 : PRICE_PER_OUTPUT_AD_PAISE * normalizedStyles.length;

  // Phase 11 — compute the position-based instruction mapping. Only stored
  // when the caller passed `instructionsByPosition` (the ordered per-style
  // list). For the legacy single-blob path, this stays null and the AI
  // pipeline's LLM parser does the splitting at processing time.
  const positionMapping = instructionsByPosition && instructionsByPosition.length > 0
    ? mapInstructionsByPosition(instructionsByPosition, normalizedStyles)
    : null;

  // Phase 15b' — pre-generate a human-readable short id. We check uniqueness
  // against the DB before creating the row; the @unique constraint covers
  // the race window between check + create.
  const shortId = await generateUniqueShortId(async (candidate) => {
    const existing = await prisma.order.findUnique({
      where: { shortId: candidate },
      select: { id: true },
    });
    return existing === null;
  });

  // Create order. The new amountPaise / numStylesPicked / isFirstFree
  // columns (Phase 8 schema) are populated alongside the legacy `amount` +
  // `outputStyleCount` columns until Phase 16 cleanup retires the duplicates.
  const order = await prisma.order.create({
    data: {
      phoneNumber,
      imageCount,
      style: primaryStyleId,              // backward compat — first style
      stylesOrdered: normalizedStyles,
      outputStyleCount: normalizedStyles.length,
      voiceInstructions,
      inputImageUrls: imageStorageUrls,
      status: 'payment_pending',
      amount,
      amountPaise: amount,
      shortId,
      numStylesPicked: normalizedStyles.length,
      isFirstFree: isFreeOrder,
      instructionMappingJson: positionMapping
        ? (positionMapping as unknown as object)
        : undefined,
      productCategory: user.businessType ?? 'general',
      userId: user.id,
    },
  });

  // Pre-Phase-8 #2: increment orderCount at order-creation time (AFTER the
  // order row is successfully written, so a creation failure doesn't burn the
  // user's free-order eligibility). Previously orderCount only incremented in
  // delivery.ts handleSaveAndFinish — a user who never tapped Save & finish
  // kept orderCount=0 and got unlimited free orders. Failing this update
  // silently is non-fatal: worst case, the user's NEXT order is also free —
  // matches the previous (buggy) behaviour, not worse.
  await prisma.user.update({
    where: { id: user.id },
    data: { orderCount: { increment: 1 } },
  }).catch((err) => {
    logger.warn('Failed to increment user.orderCount after order create', {
      phoneNumber,
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

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


