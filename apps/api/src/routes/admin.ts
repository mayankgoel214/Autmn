/**
 * Admin routes for development/testing.
 * Reset test user data with: curl -X POST http://localhost:3001/admin/reset/PHONE_NUMBER
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config.js';
import { prisma } from '@autmn/db';
import { getRedisConnection } from '@autmn/queue';
import { getStorageClient } from '@autmn/storage';
import { WhatsAppClient } from '@autmn/whatsapp';
import { issueRefund } from '@autmn/payment';
import { msgRefundApproved, msgRefundDenied } from '@autmn/session';
import type { Language } from '@autmn/session';

/**
 * Parse a Supabase public storage URL into { bucket, path }.
 * URL format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 * Returns null if the URL doesn't match the expected pattern.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match || !match[1] || !match[2]) return null;
    return { bucket: match[1], path: match[2] };
  } catch {
    return null;
  }
}

/**
 * Delete a list of storage URLs from Supabase Storage.
 * Groups by bucket, deletes in bulk. Logs warnings on failure but does not throw.
 */
async function deleteStorageFiles(app: FastifyInstance, urls: string[]): Promise<void> {
  const storage = getStorageClient();
  const bucketMap = new Map<string, string[]>();

  for (const url of urls) {
    if (!url || url.startsWith('data:')) continue;
    const parsed = parseStorageUrl(url);
    if (!parsed) continue;
    const existing = bucketMap.get(parsed.bucket) ?? [];
    existing.push(parsed.path);
    bucketMap.set(parsed.bucket, existing);
  }

  for (const [bucket, paths] of bucketMap) {
    const { error } = await storage.storage.from(bucket).remove(paths);
    if (error) {
      app.log.warn({ bucket, paths, error: error.message }, 'Storage cleanup: failed to delete files (continuing)');
    } else {
      app.log.info({ bucket, count: paths.length }, 'Storage cleanup: deleted files');
    }
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Auth guard: require x-admin-secret header in production
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (config.NODE_ENV === 'production') {
      const secret = req.headers['x-admin-secret'];
      const expected = config.ADMIN_SECRET ?? '';
      if (
        !secret ||
        !expected ||
        Buffer.byteLength(secret as string) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(secret as string), Buffer.from(expected))
      ) {
        return reply.code(403).send({ error: 'Forbidden', code: 'ADMIN_AUTH_REQUIRED' });
      }
    }
  });


  // Flush stale bull queue keys
  app.post('/admin/flush-queue/:queueName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { queueName } = req.params as { queueName: string };
    const redis = getRedisConnection();

    const ALLOWED_QUEUES = ['image-processing', 'payment-check', 'session-timeout'];
    if (!ALLOWED_QUEUES.includes(queueName)) {
      return reply.code(400).send({ error: 'Invalid queue name', allowed: ALLOWED_QUEUES });
    }

    try {
      const keys = await redis.keys(`bull:${queueName}:*`);
      app.log.info({ queueName, keyCount: keys.length }, 'Flushing queue keys');

      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) { pipeline.del(key); }
        await pipeline.exec();
      }

      return reply.send({ ok: true, deleted: keys.length });
    } catch (err) {
      app.log.error({ err, queueName }, 'Flush failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  // -----------------------------------------------------------------------
  // Phase 15 — refund review
  //
  // Three endpoints, all require x-admin-secret in production:
  //   GET  /admin/refunds                       — list pending refund requests
  //   POST /admin/refunds/:orderId/approve      — Razorpay refund + WA notify
  //   POST /admin/refunds/:orderId/deny         — mark denied + WA notify
  //
  // The user's refundStatus transitions: null → 'pending' (handler) →
  // 'approved' | 'denied' (here). We refuse to approve/deny anything that
  // isn't currently 'pending' so retries are idempotent-ish.
  // -----------------------------------------------------------------------

  app.get('/admin/refunds', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const orders = await prisma.order.findMany({
        where: { refundStatus: 'pending' },
        select: {
          id: true,
          phoneNumber: true,
          amountPaise: true,
          amount: true,
          refundReason: true,
          refundReasonVoiceUrl: true,
          refundRequestedAt: true,
          razorpayPaymentId: true,
          stylesOrdered: true,
          outputImageUrls: true,
          createdAt: true,
          user: { select: { name: true, language: true, brandName: true } },
        },
        orderBy: { refundRequestedAt: 'asc' },
      });
      return reply.send({ ok: true, count: orders.length, refunds: orders });
    } catch (err) {
      app.log.error({ err }, 'List pending refunds failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  app.post('/admin/refunds/:orderId/approve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = req.params as { orderId: string };
    const body = (req.body ?? {}) as { reviewedBy?: string; note?: string };

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: { select: { language: true } } },
      });

      if (!order) return reply.code(404).send({ ok: false, error: 'Order not found' });
      if (order.refundStatus !== 'pending') {
        return reply.code(409).send({
          ok: false,
          error: `Order is not in 'pending' refund state (current: ${order.refundStatus ?? 'none'})`,
        });
      }
      if (!order.razorpayPaymentId) {
        return reply.code(400).send({
          ok: false,
          error: 'Order has no razorpayPaymentId — cannot issue Razorpay refund',
        });
      }

      // Use amountPaise (Phase 8 source of truth) and fall back to legacy amount.
      const refundAmount = order.amountPaise > 0 ? order.amountPaise : order.amount;
      if (refundAmount <= 0) {
        return reply.code(400).send({ ok: false, error: 'Order amount is zero — nothing to refund' });
      }

      const refundResult = await issueRefund(
        order.razorpayPaymentId,
        refundAmount,
        order.refundReason ?? 'Customer-requested refund',
      );

      await prisma.order.update({
        where: { id: orderId },
        data: {
          refundStatus: 'approved',
          refundDecidedAt: new Date(),
          refundDecisionNote: body.reviewedBy
            ? `Approved by ${body.reviewedBy}${body.note ? `: ${body.note}` : ''}`
            : body.note ?? null,
        },
      });

      // Notify user — best-effort; we do not want to surface WA failures as
      // refund failures because Razorpay has already moved money.
      try {
        const config = getConfig();
        const wa = new WhatsAppClient({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        });
        const lang = (order.user.language as Language) || 'hi';
        await wa.sendText(order.phoneNumber, msgRefundApproved(refundAmount, lang));
      } catch (notifyErr) {
        app.log.warn({ orderId, err: notifyErr }, 'Refund approved but user notification failed');
      }

      app.log.info(
        { orderId, refundId: refundResult.refundId, amountPaise: refundAmount },
        'Refund approved + Razorpay refund issued',
      );
      return reply.send({
        ok: true,
        refundId: refundResult.refundId,
        razorpayStatus: refundResult.status,
        amountPaise: refundAmount,
      });
    } catch (err) {
      app.log.error({ err, orderId }, 'Approve refund failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  app.post('/admin/refunds/:orderId/deny', async (req: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = req.params as { orderId: string };
    const body = (req.body ?? {}) as { reason?: string; reviewedBy?: string };

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: { select: { language: true } } },
      });

      if (!order) return reply.code(404).send({ ok: false, error: 'Order not found' });
      if (order.refundStatus !== 'pending') {
        return reply.code(409).send({
          ok: false,
          error: `Order is not in 'pending' refund state (current: ${order.refundStatus ?? 'none'})`,
        });
      }

      const denialReason = (body.reason ?? '').trim() || null;

      await prisma.order.update({
        where: { id: orderId },
        data: {
          refundStatus: 'denied',
          refundDecidedAt: new Date(),
          refundDecisionNote: body.reviewedBy
            ? `Denied by ${body.reviewedBy}${denialReason ? `: ${denialReason}` : ''}`
            : denialReason,
        },
      });

      try {
        const config = getConfig();
        const wa = new WhatsAppClient({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        });
        const lang = (order.user.language as Language) || 'hi';
        await wa.sendText(order.phoneNumber, msgRefundDenied(denialReason, lang));
      } catch (notifyErr) {
        app.log.warn({ orderId, err: notifyErr }, 'Refund denied but user notification failed');
      }

      app.log.info({ orderId, denialReason }, 'Refund denied');
      return reply.send({ ok: true });
    } catch (err) {
      app.log.error({ err, orderId }, 'Deny refund failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  app.post('/admin/reset/:phone', async (req: FastifyRequest, reply: FastifyReply) => {
    const { phone } = req.params as { phone: string };

    try {
      // Step 1: collect storage URLs from all orders before deleting DB records
      const orders = await prisma.order.findMany({
        where: { phoneNumber: phone },
        select: { inputImageUrls: true, outputImageUrls: true, cutoutUrls: true },
      });

      const allUrls: string[] = [];
      for (const order of orders) {
        allUrls.push(...order.inputImageUrls, ...order.outputImageUrls, ...order.cutoutUrls);
      }

      // Step 2: delete files from storage (non-fatal)
      if (allUrls.length > 0) {
        await deleteStorageFiles(app, allUrls);
      }

      // Step 3: delete DB records in dependency order
      const deleted = {
        imageJobs: (await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: phone } } })).count,
        orders: (await prisma.order.deleteMany({ where: { phoneNumber: phone } })).count,
        sessions: (await prisma.session.deleteMany({ where: { phoneNumber: phone } })).count,
        users: (await prisma.user.deleteMany({ where: { phoneNumber: phone } })).count,
      };

      app.log.info({ phone, deleted, storageFilesDeleted: allUrls.length }, 'Test data reset');
      return reply.send({ ok: true, deleted });
    } catch (err) {
      app.log.error({ err, phone }, 'Reset failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });
}
