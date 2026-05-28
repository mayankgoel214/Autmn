/**
 * Phase 15b' — REFUND_REQUEST handler with email-driven review.
 *
 * Captures the user's refund reason (text or voice note), persists it on the
 * Order row, fires a transactional email to the founder containing both
 * approve + deny magic-link buttons, and transitions the user back to
 * DELIVERED. The decision itself is recorded by GET /admin/refunds/decide
 * (apps/api/src/routes/admin/refunds.ts).
 *
 * Free-order short-circuit (per plan §2): if Order.amountPaise === 0, there's
 * nothing to refund. The bot says so + offers "Send new product" and stays
 * in DELIVERED — no email fires, no state change.
 *
 * The decision-side notification (Approved / Denied WhatsApp message) is sent
 * by the magic-link endpoint, NOT here.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { uploadFile, Buckets, getStorageClient } from '@autmn/storage';
import { sendEmail, renderRefundRequestEmail, EmailSendError } from '@autmn/email';
import { transitionTo } from '../db-helpers.js';
import { downloadWhatsAppMedia } from './instructions.js';
import {
  msgAskRefundReason,
  msgRefundReasonReceived,
  msgFreeOrderNoRefund,
  msgGenericError,
} from '../messages.js';
import { buildRefundDecisionUrl } from '../refund-token.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

const MAX_REASON_BYTES = 5 * 1024 * 1024; // 5 MB cap on voice files
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — long enough for founder review

export async function handleRefundRequest(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hi';
  const phoneNumber = session.phoneNumber;

  // ---- Voice reason ----
  if (message.messageType === 'audio' && message.mediaId) {
    try {
      const { transcribeVoiceNote } = await import('@autmn/ai');
      const { buffer, mimeType } = await downloadWhatsAppMedia(message.mediaId);
      if (buffer.byteLength > MAX_REASON_BYTES) {
        await wa.sendText(phoneNumber, 'Voice note too large (5 MB max). Please send a shorter clip or text.');
        return;
      }

      const transcript = await transcribeVoiceNote(buffer, mimeType).catch(() => null);
      const reasonText = (transcript?.text ?? '').trim().slice(0, 5000);

      // Upload the voice file — surfaces in the founder email when transcription
      // is patchy or tone matters for the decision.
      const path = `${phoneNumber}/${Date.now()}.ogg`;
      const storageUrl = await uploadFile(
        Buckets.REFUND_REASONS,
        path,
        buffer,
        mimeType || 'audio/ogg',
      ).catch((err) => {
        logger.warn('Refund voice upload failed (continuing with transcript only)', {
          phoneNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        return null as string | null;
      });

      await persistAndDispatch(session, user, reasonText || '(voice note, no transcript)', storageUrl, lang, wa);
      return;
    } catch (err) {
      logger.error('Refund voice capture failed', {
        phoneNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      await wa.sendText(phoneNumber, msgGenericError(lang));
      return;
    }
  }

  // ---- Text reason ----
  if (message.messageType === 'text' && message.text) {
    const reason = message.text.trim().slice(0, 5000);
    if (!reason) {
      await wa.sendText(phoneNumber, msgAskRefundReason(lang));
      return;
    }
    await persistAndDispatch(session, user, reason, null, lang, wa);
    return;
  }

  // ---- Anything else — re-prompt ----
  await wa.sendText(phoneNumber, msgAskRefundReason(lang));
}

/**
 * Persist the reason + status, then fire the email and acknowledge the user.
 * Splits responsibilities so test paths can stub the email branch.
 */
async function persistAndDispatch(
  session: Session,
  user: User,
  reason: string,
  voiceUrl: string | null,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  if (!session.currentOrderId) {
    logger.warn('handleRefundRequest: no currentOrderId on session', {
      phoneNumber: session.phoneNumber,
    });
    return;
  }
  const updated = await prisma.order.update({
    where: { id: session.currentOrderId },
    data: {
      refundReason: reason,
      refundReasonVoiceUrl: voiceUrl,
      refundRequestedAt: new Date(),
      refundStatus: 'pending',
    },
  });

  logger.info('Refund request captured', {
    phoneNumber: session.phoneNumber,
    orderId: session.currentOrderId,
    shortId: updated.shortId,
    hasVoice: voiceUrl !== null,
    reasonLength: reason.length,
  });

  // Fire-and-forget the founder email — we never want a Resend outage to
  // block the user-facing acknowledgement. Failures land in Sentry/logger
  // and require a manual retry from the founder side.
  await sendRefundRequestEmail(updated, user, voiceUrl).catch((err) => {
    logger.error('Refund-request email failed (decision now stuck until manual retry)', {
      phoneNumber: session.phoneNumber,
      orderId: session.currentOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  await wa.sendText(session.phoneNumber, msgRefundReasonReceived(lang));
  // Return to DELIVERED — the menu's other rows are still tappable while
  // the user waits for the decision.
  await transitionTo(session.phoneNumber, 'DELIVERED');
}

/**
 * Compose + send the refund-request email to the founder.
 *
 * Magic links are JWT-signed in @autmn/session/refund-token; the founder
 * clicks one, the decision endpoint verifies the signature, marks the order,
 * issues the Razorpay refund (on approval), and messages the user.
 */
async function sendRefundRequestEmail(
  order: Awaited<ReturnType<typeof prisma.order.update>>,
  user: User,
  voiceUrl: string | null,
): Promise<void> {
  const adminEmail = process.env['ADMIN_EMAIL'];
  if (!adminEmail) {
    throw new EmailSendError('ADMIN_EMAIL is not configured — refund email skipped');
  }
  if (!order.shortId) {
    // Old orders pre-Phase-15b' might not have a shortId. Refuse to send;
    // surface in logs so we know to backfill.
    throw new EmailSendError(`Order ${order.id} has no shortId — refund email skipped`);
  }

  const [approveUrl, denyUrl] = await Promise.all([
    buildRefundDecisionUrl(order.id, 'approve'),
    buildRefundDecisionUrl(order.id, 'deny'),
  ]);

  // Signed URLs for the delivered ads + voice note keep them private even if
  // the email is forwarded — 7-day TTL is well within the 30-day decision
  // window without leaving links live forever.
  const deliveredAdsUrls = await Promise.all(
    order.outputImageUrls.map((u) => signOrPassthrough(u)),
  );
  const refundVoiceUrl = voiceUrl ? await signOrPassthrough(voiceUrl) : null;

  const email = renderRefundRequestEmail({
    orderId: order.id,
    shortId: order.shortId,
    amountRupees: Math.round((order.amountPaise || order.amount) / 100),
    userPhone: `+${order.phoneNumber}`,
    userBrand: user.brandName ?? user.name ?? null,
    deliveredAdsUrls,
    refundReason: order.refundReason ?? '(no reason text)',
    refundVoiceUrl,
    approveUrl,
    denyUrl,
    submittedAt: (order.refundRequestedAt ?? new Date()).toISOString(),
  });

  const result = await sendEmail({
    to: adminEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  logger.info('Refund-request email sent', {
    orderId: order.id,
    shortId: order.shortId,
    messageId: result.id,
  });
}

/**
 * For Supabase signed URLs we get a fresh signature; for already-public URLs
 * we pass through unchanged. The parser is the same one the admin reset path
 * uses (apps/api/src/routes/admin.ts).
 */
async function signOrPassthrough(url: string): Promise<string> {
  const match = url.match(/\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
  if (!match) return url;
  const [, mode, bucket, path] = match;
  // If it's already public, no need to sign.
  if (mode === 'public') return url;
  try {
    const client = getStorageClient();
    const { data, error } = await client.storage.from(bucket!).createSignedUrl(path!, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch {
    return url;
  }
}

/**
 * Phase 15b' — free-order short-circuit. Called from delivery.handleRequestRefund
 * before the state transition when Order.amountPaise === 0. Posts the
 * "no charge to refund" message + Send-new-product button and stays in
 * DELIVERED.
 */
export async function handleFreeOrderRefundShortCircuit(
  session: Session,
  user: User,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hi';
  await wa.sendText(session.phoneNumber, msgFreeOrderNoRefund(lang));
}
