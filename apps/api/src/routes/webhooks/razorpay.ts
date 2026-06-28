/**
 * Razorpay webhook route.
 *
 * POST /webhooks/razorpay — Handles payment_link.paid events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyRazorpaySignature, parsePaymentLinkPaidEvent } from '@autmn/payment';
import { prisma } from '@autmn/db';
import { WhatsAppClient } from '@autmn/whatsapp';
import { onPaymentConfirmed } from '@autmn/session';
import { getConfig } from '../../config.js';

export async function razorpayWebhookRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  app.post('/webhooks/razorpay', async (req: FastifyRequest, reply: FastifyReply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req as any).rawBody as string | undefined;

    if (!signature || !rawBody) {
      return reply.code(400).send('Missing signature');
    }

    // Verify signature — MUST use raw body, not re-serialized JSON
    if (!verifyRazorpaySignature(rawBody, signature, config.RAZORPAY_WEBHOOK_SECRET)) {
      app.log.warn('Invalid Razorpay webhook signature');
      return reply.code(400).send('Invalid signature');
    }

    // Durably persist the raw event BEFORE acking. Razorpay treats a 200 as
    // "received — won't retry", so acking before the event is saved risks losing
    // a real payment if the process crashes mid-handler. The insert is a single
    // fast write, well within Razorpay's window. If it fails we do NOT ack →
    // Razorpay retries, which is exactly what we want.
    const body = req.body as any;
    try {
      await prisma.webhookEvent.create({
        data: {
          source: 'razorpay',
          eventType: body?.event ?? 'unknown',
          rawPayload: body,
        },
      });
    } catch (err) {
      app.log.error({ err }, 'Failed to persist Razorpay webhook event — returning 500 for retry');
      return reply.code(500).send('persist failed');
    }

    // Event is durable — safe to ack. Heavy processing continues async.
    reply.code(200).send('OK');

    try {
      // Only payment_link.paid drives order state.
      if (body?.event !== 'payment_link.paid') {
        return;
      }

      // parsePaymentLinkPaidEvent can throw on a malformed body; the raw event
      // is already saved, so swallow and bail rather than crash post-ack.
      let event: ReturnType<typeof parsePaymentLinkPaidEvent>;
      try {
        event = parsePaymentLinkPaidEvent(body);
      } catch (err) {
        app.log.warn({ err }, 'Malformed payment_link.paid event — skipping');
        return;
      }
      if (!event) {
        app.log.warn('Could not parse payment_link.paid event');
        return;
      }

      // Idempotency check — skip if payment already recorded.
      const existingPayment = await prisma.payment.findUnique({
        where: { razorpayPaymentId: event.paymentId },
      });
      if (existingPayment) {
        app.log.info({ paymentId: event.paymentId }, 'Duplicate payment webhook, skipping');
        return;
      }

      const order = await prisma.order.findFirst({
        where: { razorpayPaymentLinkId: event.paymentLinkId },
      });
      if (!order) {
        app.log.error({ paymentLinkId: event.paymentLinkId }, 'Order not found for payment');
        return;
      }

      // Record the payment. The unique constraint on razorpayPaymentId closes
      // the check-then-create race between two concurrent deliveries: the loser
      // hits P2002 and bails rather than double-confirming the order.
      try {
        await prisma.payment.create({
          data: {
            orderId: order.id,
            razorpayPaymentId: event.paymentId,
            razorpayPaymentLinkId: event.paymentLinkId,
            amount: event.amount,
            method: event.method,
            status: 'captured',
            capturedAt: new Date(),
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          app.log.info({ paymentId: event.paymentId }, 'Concurrent duplicate payment webhook, skipping');
          return;
        }
        throw err;
      }

      // onPaymentConfirmed handles the order status transition atomically with
      // its own idempotency guard.
      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });
      await onPaymentConfirmed(order.id, event.paymentId, wa);
    } catch (err) {
      app.log.error({ err }, 'Razorpay webhook processing error');
    }
  });
}
