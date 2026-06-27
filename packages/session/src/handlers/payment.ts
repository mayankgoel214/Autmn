/**
 * AWAITING_PAYMENT handler — V2 streamlined flow.
 *
 * - Creates a Razorpay Payment Link (amount from DB order — never client-supplied).
 * - Sends the link via WhatsApp CTA button.
 * - Enqueues a PaymentCheck delayed job (2 min) as webhook backup.
 * - onPaymentConfirmed() is called by the Razorpay webhook when payment.captured fires.
 * - enqueueImageJobs() is shared with free-trial path (called by instructions.ts).
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import { parsePerStyleInstructions } from '@autmn/ai';
import type { Session, User, Order } from '@autmn/db';
import { createPaymentLink } from '@autmn/payment';
import { getPaymentCheckQueue, getImageQueue, getSessionTimeoutQueue } from '@autmn/queue';
import { transitionTo } from '../db-helpers.js';
import {
  msgPaymentPending,
  msgProcessingEstimate,
  msgGenericError,
} from '../messages.js';
import { PAYMENT_CHECK_DELAY_MS, ButtonIds, isHindi } from '../types.js';
import type { Language } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingPayment(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hinglish';
  const phoneNumber = session.phoneNumber;

  // ---- Internal trigger: send the payment link ----
  if (message.buttonReplyId === '__send_payment_link') {
    await sendPaymentLink(session, user, wa);
    return;
  }

  // ---- User tapped "Resend Link" ----
  if (message.buttonReplyId === 'resend_link') {
    await sendPaymentLink(session, user, wa);
    return;
  }

  // ---- User tapped "Cancel Order" ----
  if (message.buttonReplyId === ButtonIds.CANCEL_ORDER || message.buttonReplyId === 'cancel_order') {
    await transitionTo(phoneNumber, 'IDLE', { currentOrderId: null });
    await wa.sendText(
      phoneNumber,
      isHindi(lang)
        ? 'Order cancel ho gaya. Jab bhi ready hon, wapas aa jaana!'
        : 'Order cancelled. Come back whenever you are ready!',
    );
    return;
  }

  // ---- User messaged while payment is pending → remind ----
  await wa.sendButtons(
    phoneNumber,
    msgPaymentPending(lang),
    [
      { id: 'resend_link', title: isHindi(lang) ? 'Link dobara bhejo' : 'Resend Link' },
      { id: ButtonIds.CANCEL_ORDER, title: isHindi(lang) ? 'Cancel' : 'Cancel' },
    ],
  );
}

// ---------------------------------------------------------------------------
// Called by the Razorpay webhook handler when payment.captured fires
// ---------------------------------------------------------------------------

export async function onPaymentConfirmed(
  orderId: string,
  razorpayPaymentId: string,
  wa: WhatsAppClient,
): Promise<void> {
  // Idempotency guard — optimistic lock via updateMany so only one concurrent
  // caller (Razorpay webhook or payment-check poller) proceeds. The second
  // caller will see count === 0 and bail out safely.
  const guard = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: ['payment_pending', 'created'] },
    },
    data: { status: 'payment_confirmed', razorpayPaymentId },
  });

  if (guard.count === 0) {
    logger.info(JSON.stringify({ event: 'payment_already_confirmed', orderId }));
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    logger.error('onPaymentConfirmed: order not found after guard update', { orderId });
    return;
  }

  const phoneNumber = order.phoneNumber;
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) {
    logger.error('onPaymentConfirmed: user not found', { phoneNumber });
    return;
  }

  const lang = (user.language as Language) || 'hinglish';

  try {
    // Status already set to payment_confirmed by the idempotency guard above.
    // Transition session state to PROCESSING.
    await transitionTo(phoneNumber, 'PROCESSING', {
      currentOrderId: order.id,
    });

    // Phase 13 — single processing-estimate message (replaces the old
    // "Payment received ✅" + intermediate progress sends). The worker will
    // be silent until delivery; this is the only PROCESSING-state message.
    const stylesCount =
      (order.stylesOrdered as string[] | null)?.length ??
      order.outputStyleCount ??
      1;
    const photosCount = (order.inputImageUrls as string[] | null)?.length ?? order.imageCount ?? 1;
    await wa.sendText(phoneNumber, msgProcessingEstimate(stylesCount, photosCount, lang));

    try {
      await enqueueImageJobs(orderId, phoneNumber, order);
    } catch (enqueueErr) {
      console.error(JSON.stringify({
        event: 'enqueue_after_payment_failed',
        orderId: order.id,
        error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
      }));

      // Reset session so user can see their order history and retry
      await transitionTo(phoneNumber, 'DELIVERED', {
        currentOrderId: order.id,
      });

      await wa.sendText(phoneNumber, isHindi(lang)
        ? 'Kuch problem aayi. Kripya "hi" bhejein aur dobara try karein. Aapka payment safe hai.'
        : 'Something went wrong. Please send "hi" and try again. Your payment is safe.');

      return;
    }

    // Schedule a proactive delay notification at 90 seconds.
    // If the session is still in PROCESSING when it fires, sends msgProcessingDelay.
    try {
      const timeoutQueue = getSessionTimeoutQueue();
      await timeoutQueue.add(
        'session-timeout',
        {
          phoneNumber,
          expectedState: 'PROCESSING',
          action: 'nudge',
        },
        { delay: 90_000, jobId: `processing_nudge_${phoneNumber}_${Date.now()}` },
      );
    } catch (nudgeErr) {
      logger.warn('Failed to schedule processing nudge job', {
        phoneNumber,
        error: nudgeErr instanceof Error ? nudgeErr.message : String(nudgeErr),
      });
    }
  } catch (err) {
    logger.error('onPaymentConfirmed failed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

// ---------------------------------------------------------------------------
// Enqueue image processing jobs (shared: used by payment confirmation + free trial)
// ---------------------------------------------------------------------------

export async function enqueueImageJobs(
  orderId: string,
  phoneNumber: string,
  order: Order,
): Promise<void> {
  const imageQueue = getImageQueue();

  // Idempotency — if jobs already exist for this order, a prior call (webhook +
  // poller, or a retried caller) already enqueued them. Bail rather than
  // double-spend (pay for N styles, generate 2N). onPaymentConfirmed's atomic
  // status claim covers the paid path; this guards the free path and re-entry.
  const existingJobs = await prisma.imageJob.count({ where: { orderId } });
  if (existingJobs > 0) {
    console.warn(JSON.stringify({ event: 'enqueue_image_jobs_skipped_existing', orderId, existingJobs }));
    return;
  }

  const inputImageUrls = order.inputImageUrls as string[];
  const voiceInstructions = order.voiceInstructions as string | null;

  const userForBrand = await prisma.user.findUnique({
    where: { phoneNumber },
    select: { brandName: true },
  }).catch(() => null);
  const brandName = userForBrand?.brandName ?? undefined;

  // V2 model: 1 job per OUTPUT STYLE (always OUTPUT_STYLES_PER_ORDER = 3).
  // Each job uses the primary input photo and one of the 3 ordered styles.
  // Fall back to the legacy single-style path for old orders where stylesOrdered is empty.
  const stylesOrdered = (order.stylesOrdered as string[]) ?? [];
  const primaryInputImageUrl = inputImageUrls[0] ?? '';

  const styleJobs: Array<{ styleId: string; styleIndex: number }> =
    stylesOrdered.length > 0
      ? stylesOrdered.map((styleId, i) => ({ styleId, styleIndex: i }))
      : [{ styleId: order.style ?? 'style_clean_white', styleIndex: 0 }]; // legacy single-job path

  // ── Per-style instruction parsing ─────────────────────────────────────────
  // If the customer sent instructions AND there are multiple styles, split the
  // instruction into per-style slices so each Gemini call only sees its own
  // directive. Falls back to applying the raw instruction to all styles on error.
  let perStyleInstructions: Record<string, string | null> = {};
  let globalInstruction: string | null = null;

  if (voiceInstructions && styleJobs.length > 1) {
    const parseStart = Date.now();
    try {
      const parsed = await parsePerStyleInstructions({
        rawInstructions: voiceInstructions,
        styles: styleJobs.map(j => j.styleId),
      });
      perStyleInstructions = parsed.perStyle;
      globalInstruction = parsed.globalInstruction;

      console.info(JSON.stringify({
        event: 'per_style_parse_done',
        orderId,
        confidence: parsed.confidence,
        durationMs: Date.now() - parseStart,
        perStyle: parsed.perStyle,
        globalInstruction: parsed.globalInstruction,
      }));
    } catch (err) {
      // H8 — the parser failing (Gemini outage / bad JSON) must NOT drop the
      // customer's paid instruction. Fall back to applying the raw instruction
      // to every style (the documented behaviour the code previously lacked).
      globalInstruction = voiceInstructions;
      perStyleInstructions = {};
      console.error(JSON.stringify({
        event: 'per_style_parse_failed_fallback_global',
        orderId,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // Resolve the effective instruction for one style:
  // - If parser returned both per-style and global, merge them ("perStyle. global.")
  // - If only per-style, use that
  // - If only global (or parser failed and returned raw as global), use that
  // - If neither, undefined (no customer note)
  function resolveInstructionForStyle(styleId: string): string | undefined {
    const perStyle = perStyleInstructions[styleId] ?? null;
    const parts = [perStyle, globalInstruction].filter((p): p is string => !!p?.trim());
    if (parts.length === 0) return undefined;
    return parts.join('. ');
  }

  console.info(JSON.stringify({
    event: 'enqueue_image_jobs_start',
    orderId,
    inputPhotoCount: inputImageUrls.length,
    outputJobCount: styleJobs.length,
    styles: styleJobs.map(j => j.styleId),
    hasInstructions: !!voiceInstructions,
  }));

  for (const { styleId, styleIndex } of styleJobs) {
    const imageJob = await prisma.imageJob.create({
      data: {
        orderId,
        inputImageUrl: primaryInputImageUrl,
        style: styleId,
        styleIndex,
        pipeline: 'primary',
        status: 'queued',
      },
    });

    // Use the style-specific instruction if we parsed one, else fall back to the
    // raw voiceInstructions (single-style order, or parser was skipped).
    const effectiveInstruction =
      styleJobs.length > 1
        ? resolveInstructionForStyle(styleId)
        : (voiceInstructions ?? undefined);

    await imageQueue.add('process_image', {
      orderId,
      imageJobId: imageJob.id,
      phoneNumber,
      inputImageUrl: primaryInputImageUrl,
      style: styleId,
      voiceInstructions: effectiveInstruction,
      productCategory: order.productCategory ?? undefined,
      brandName,
      pipeline: 'primary',
    }, {
      // Deterministic per order+style so a duplicate enqueue is dropped at the
      // queue layer (defense alongside the existing-jobs guard above).
      jobId: `process_image_${orderId}_${styleIndex}`,
    });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'processing', processingStartedAt: new Date() },
  });

  logger.info('Image processing jobs enqueued', {
    orderId,
    outputJobCount: styleJobs.length,
    styles: styleJobs.map(j => j.styleId),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function sendPaymentLink(
  session: Session,
  user: User,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hinglish';
  const phoneNumber = session.phoneNumber;

  if (!session.currentOrderId) {
    logger.error('sendPaymentLink: no currentOrderId on session', { phoneNumber });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
  if (!order) {
    logger.error('sendPaymentLink: order not found', { orderId: session.currentOrderId });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  // Check if existing link might be expired (created more than 25 minutes ago)
  const linkAge = order.createdAt ? Date.now() - new Date(order.createdAt).getTime() : Infinity;
  const LINK_EXPIRY_BUFFER = 25 * 60 * 1000; // 25 minutes (links expire at 30)

  if (order.razorpayPaymentLinkUrl && linkAge < LINK_EXPIRY_BUFFER) {
    // Reuse existing link
    // Phase 12a — payment-link message references the UPI-only constraint
    // so users know what to expect on the Razorpay page. The 3-creatives label is
    // retained as a heuristic; numStylesPicked drives the actual amount via
    // Phase 12 pricing (amountPaise on the order row).
    await wa.sendPaymentLink(
      phoneNumber,
      isHindi(lang)
        ? `Rs ${order.amount / 100} hai. Pay karne ke baad creatives ban jayenge.\nSirf UPI accept karte hain - GPay, PhonePe, Paytm, BHIM, WhatsApp Pay.`
        : `Rs ${order.amount / 100}. We'll start creating your creatives right after payment.\nUPI only - GPay, PhonePe, Paytm, BHIM, WhatsApp Pay.`,
      order.razorpayPaymentLinkUrl,
      isHindi(lang) ? 'UPI se pay karo' : 'Pay with UPI',
    );
    return;
  }

  // Create new link (existing link expired or doesn't exist)

  // DEV MODE: skip payment and auto-confirm. HARD-gated to non-production so a
  // leaked/mis-set PAYMENT_BYPASS env can never make real orders free in prod.
  if (process.env.PAYMENT_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
    logger.info('DEV MODE: Skipping payment, auto-confirming order', { phoneNumber, orderId: order.id });
    await onPaymentConfirmed(order.id, 'dev_payment_' + Date.now(), wa);
    return;
  }

  try {
    const link = await createPaymentLink({
      orderId: order.id,
      customerPhone: phoneNumber,
      customerName: user.name ?? undefined,
      amount: order.amount, // paise — always from DB, never client-provided
      description: `Autmn - ${order.imageCount} photo(s), 3 creatives`,
      expiresInMinutes: 30,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        razorpayPaymentLinkId: link.id,
        razorpayPaymentLinkUrl: link.shortUrl,
        status: 'payment_pending',
      },
    });

    await wa.sendPaymentLink(
      phoneNumber,
      isHindi(lang)
        ? `${order.imageCount} photo • 3 professional creatives • Rs ${order.amount / 100}\nPayment karein:`
        : `${order.imageCount} photo(s) • 3 professional creatives • Rs ${order.amount / 100}\nPay to get started:`,
      link.shortUrl,
      isHindi(lang) ? 'Payment karo' : 'Pay Now',
    );

    await schedulePaymentCheck(order.id, phoneNumber, link.id);

    logger.info('Payment link sent', { phoneNumber, orderId: order.id, linkId: link.id });
  } catch (err) {
    logger.error('createPaymentLink failed', {
      phoneNumber,
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

async function schedulePaymentCheck(
  orderId: string,
  phoneNumber: string,
  paymentLinkId: string,
): Promise<void> {
  try {
    const queue = getPaymentCheckQueue();
    await queue.add(
      'check_payment',
      { orderId, phoneNumber, paymentLinkId, attempt: 0 },
      {
        delay: PAYMENT_CHECK_DELAY_MS,
        jobId: `payment_check_${orderId}`,
        attempts: 5,
      },
    );
  } catch (err) {
    logger.warn('Failed to schedule payment check job', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// The Rs 29 paid-revision flow was removed in Phase 8. onRevisionPaymentConfirmed
// and its webhook/poller wiring were deleted in the 2026-06 hardening pass —
// nothing ever set razorpayRevisionLinkId, so the path was unreachable dead code.
