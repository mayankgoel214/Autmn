/**
 * Phase 15 — REFUND_REQUEST handler.
 *
 * Captures the user's refund reason (text or voice note), stores it on the
 * Order row, transitions back to DELIVERED, and waits for the admin route
 * (apps/api/src/routes/admin.ts) to approve or deny. Razorpay refund + user
 * notification are issued from the admin side, not here.
 *
 * Per plan §Refund flow:
 *   - Bot: "Tell us what went wrong (text or voice)."
 *   - User responds → reason stored, refundStatus='pending', refundRequestedAt set.
 *   - Bot: "Got it. Our team will review and reply within 24 hours."
 *   - Session returns to DELIVERED.
 *   - Manual review by Mayank within 24h.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { uploadFile, Buckets } from '@autmn/storage';
import { transitionTo } from '../db-helpers.js';
import { downloadWhatsAppMedia } from './instructions.js';
import {
  msgAskRefundReason,
  msgRefundReasonReceived,
  msgGenericError,
} from '../messages.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

const MAX_REASON_BYTES = 5 * 1024 * 1024; // 5 MB cap on voice files

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

      // Upload the voice file too — useful for admin review when transcription
      // is patchy or the user's tone matters for the decision.
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

      await persistReason(session, reasonText || '(voice note, no transcript)', storageUrl);
      await acknowledgeAndExit(session, lang, wa);
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
    await persistReason(session, reason, null);
    await acknowledgeAndExit(session, lang, wa);
    return;
  }

  // ---- Anything else — re-prompt ----
  await wa.sendText(phoneNumber, msgAskRefundReason(lang));
}

async function persistReason(
  session: Session,
  reason: string,
  voiceUrl: string | null,
): Promise<void> {
  if (!session.currentOrderId) {
    logger.warn('handleRefundRequest: no currentOrderId on session', {
      phoneNumber: session.phoneNumber,
    });
    return;
  }
  await prisma.order.update({
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
    hasVoice: voiceUrl !== null,
    reasonLength: reason.length,
  });
}

async function acknowledgeAndExit(
  session: Session,
  lang: Language,
  wa: WhatsAppClient,
): Promise<void> {
  await wa.sendText(session.phoneNumber, msgRefundReasonReceived(lang));
  // Return to DELIVERED — the menu's other rows are still in the chat
  // history and remain tappable while the user waits for the team.
  await transitionTo(session.phoneNumber, 'DELIVERED');
}
