/**
 * Admin routes for development/testing.
 * Reset test user data with: curl -X POST http://localhost:3001/admin/reset/PHONE_NUMBER
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config.js';
import { prisma } from '@autmn/db';
import { getRedisConnection } from '@autmn/queue';
import { getStorageClient, Buckets } from '@autmn/storage';
import { WhatsAppClient } from '@autmn/whatsapp';
import { issueRefund } from '@autmn/payment';
import {
  msgRefundApproved,
  msgRefundDenied,
  verifyRefundDecisionToken,
} from '@autmn/session';
import type { Language } from '@autmn/session';
import { renderRefundDecisionPage } from '@autmn/email';
import type { RefundDecisionPageStatus } from '@autmn/email';

/**
 * Parse a Supabase public storage URL into { bucket, path }.
 * URL format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 * Returns null if the URL doesn't match the expected pattern.
 */
const KNOWN_BUCKETS = new Set<string>(Object.values(Buckets));

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match || !match[1] || !match[2]) return null;
    // Only ever delete from buckets we own. A tampered Order.outputImageUrls
    // row (it's an unconstrained Json column) must not be able to steer the
    // admin reset into removing files from an arbitrary bucket.
    if (!KNOWN_BUCKETS.has(match[1])) return null;
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

// ---------------------------------------------------------------------------
// Phase 15c — magic-link decision helpers
// ---------------------------------------------------------------------------

type OrderWithUserLang = Awaited<ReturnType<typeof prisma.order.findUnique>> & {
  user: { language: string | null };
};

/** Send a string of HTML with the given status code. */
function renderHtml(reply: FastifyReply, statusCode: number, html: string): FastifyReply {
  return reply
    .code(statusCode)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .send(html);
}

async function handleApprove(
  app: FastifyInstance,
  reply: FastifyReply,
  order: NonNullable<OrderWithUserLang>,
  lang: Language,
  refundAmountPaise: number,
): Promise<FastifyReply> {
  if (!order.razorpayPaymentId) {
    return renderHtml(reply, 400, renderRefundDecisionPage({
      status: 'razorpay_error',
      shortId: order.shortId ?? undefined,
      detail: 'Order has no razorpayPaymentId — cannot issue Razorpay refund. Likely a free order.',
    }));
  }
  if (refundAmountPaise <= 0) {
    return renderHtml(reply, 400, renderRefundDecisionPage({
      status: 'razorpay_error',
      shortId: order.shortId ?? undefined,
      detail: 'Order amount is zero — nothing to refund.',
    }));
  }

  // H3 — atomically CLAIM the decision before calling Razorpay so two
  // concurrent confirm POSTs (double-click / retry) can't both issue a refund.
  // Only the first transition out of 'pending' wins.
  const claim = await prisma.order.updateMany({
    where: { id: order.id, refundStatus: 'pending' },
    data: {
      refundStatus: 'approved',
      refundDecidedAt: new Date(),
      refundDecisionNote: 'Approved via magic link',
      // Seed a sentinel so that if the process crashes between this claim and
      // recording the Razorpay outcome below, the row reads "approved but
      // issuance unconfirmed" instead of a silent approved-with-no-refund. The
      // success/failure update below overwrites it (cleared to null on success).
      razorpayRefundError: 'issuance_pending',
    },
  });
  if (claim.count === 0) {
    const fresh = await prisma.order
      .findUnique({ where: { id: order.id }, select: { refundStatus: true, refundDecidedAt: true } })
      .catch(() => null);
    return renderHtml(reply, 200, renderRefundDecisionPage({
      status: 'already_decided',
      shortId: order.shortId ?? undefined,
      previousStatus: (fresh?.refundStatus as 'approved' | 'denied') ?? 'approved',
      previousDecidedAt: fresh?.refundDecidedAt?.toISOString(),
    }));
  }

  // We own the decision — issue the Razorpay refund exactly once.
  let razorpayRefundId: string | null = null;
  let razorpayError: string | null = null;
  try {
    const result = await issueRefund(
      order.razorpayPaymentId,
      refundAmountPaise,
      order.refundReason ?? 'Customer-requested refund',
    );
    razorpayRefundId = result.refundId;
  } catch (err) {
    razorpayError = err instanceof Error ? err.message : String(err);
    app.log.error({ orderId: order.id, err: razorpayError }, 'Razorpay refund issuance failed');
  }

  // Record the Razorpay outcome on the already-claimed row. razorpayRefundError
  // gives the founder a clear "retry the API call" signal without rewriting the
  // locked decision state.
  await prisma.order.update({
    where: { id: order.id },
    data: { razorpayRefundId, razorpayRefundError: razorpayError },
  });

  if (razorpayError) {
    return renderHtml(reply, 502, renderRefundDecisionPage({
      status: 'razorpay_error',
      shortId: order.shortId ?? undefined,
      detail: razorpayError,
    }));
  }

  // Notify the user — failures here render a warning page so the founder can
  // follow up manually rather than leaving them in the dark.
  const notifyErr = await notifyUser(
    order.phoneNumber,
    msgRefundApproved(refundAmountPaise, lang, order.shortId ?? undefined),
  );
  if (notifyErr) {
    app.log.warn({ orderId: order.id, err: notifyErr }, 'Refund approved but WhatsApp notification failed');
    return renderHtml(reply, 207, renderRefundDecisionPage({
      status: 'whatsapp_error',
      shortId: order.shortId ?? undefined,
      detail: notifyErr,
    }));
  }

  app.log.info({ orderId: order.id, refundId: razorpayRefundId, amountPaise: refundAmountPaise },
    'Refund approved via magic link');
  return renderHtml(reply, 200, renderRefundDecisionPage({
    status: 'approved',
    shortId: order.shortId ?? undefined,
    amountRupees: Math.round(refundAmountPaise / 100),
  }));
}

async function handleDeny(
  app: FastifyInstance,
  reply: FastifyReply,
  order: NonNullable<OrderWithUserLang>,
  lang: Language,
): Promise<FastifyReply> {
  // H3 — atomic claim so a double-click can't double-fire the deny side effects.
  const claim = await prisma.order.updateMany({
    where: { id: order.id, refundStatus: 'pending' },
    data: {
      refundStatus: 'denied',
      refundDecidedAt: new Date(),
      refundDecisionNote: 'Denied via magic link',
    },
  });
  if (claim.count === 0) {
    const fresh = await prisma.order
      .findUnique({ where: { id: order.id }, select: { refundStatus: true, refundDecidedAt: true } })
      .catch(() => null);
    return renderHtml(reply, 200, renderRefundDecisionPage({
      status: 'already_decided',
      shortId: order.shortId ?? undefined,
      previousStatus: (fresh?.refundStatus as 'approved' | 'denied') ?? 'denied',
      previousDecidedAt: fresh?.refundDecidedAt?.toISOString(),
    }));
  }

  const supportPhone = process.env['SUPPORT_PHONE_NUMBER'];
  const userMsg = msgRefundDenied(null, lang, order.shortId ?? undefined, supportPhone);
  const notifyErr = await notifyUser(order.phoneNumber, userMsg);
  if (notifyErr) {
    app.log.warn({ orderId: order.id, err: notifyErr }, 'Refund denied but WhatsApp notification failed');
    return renderHtml(reply, 207, renderRefundDecisionPage({
      status: 'whatsapp_error',
      shortId: order.shortId ?? undefined,
      detail: notifyErr,
    }));
  }

  app.log.info({ orderId: order.id }, 'Refund denied via magic link');
  return renderHtml(reply, 200, renderRefundDecisionPage({
    status: 'denied',
    shortId: order.shortId ?? undefined,
  }));
}

/**
 * Shared token → order resolution for the refund-decision routes. Returns
 * either a ready decision context (valid token, pending refund) or a finished
 * HTML page (invalid/expired token, missing order, already decided). Both the
 * GET confirmation page and the POST action go through this so they stay
 * consistent and the side effect lives only in the POST.
 */
type DecisionContext =
  | { kind: 'page'; statusCode: number; html: string }
  | {
      kind: 'ready';
      order: NonNullable<OrderWithUserLang>;
      action: 'approve' | 'deny';
      lang: Language;
      refundAmountPaise: number;
    };

async function loadDecisionContext(
  app: FastifyInstance,
  token: string | undefined,
): Promise<DecisionContext> {
  if (!token) {
    return { kind: 'page', statusCode: 400, html: renderRefundDecisionPage({ status: 'token_invalid' }) };
  }

  let decoded: { orderId: string; action: 'approve' | 'deny' };
  try {
    decoded = await verifyRefundDecisionToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status: RefundDecisionPageStatus = /expired/i.test(message) ? 'token_expired' : 'token_invalid';
    app.log.warn({ err: message }, 'Refund-decision token rejected');
    return { kind: 'page', statusCode: 401, html: renderRefundDecisionPage({ status, detail: message }) };
  }

  const order = await prisma.order.findUnique({
    where: { id: decoded.orderId },
    include: { user: { select: { language: true } } },
  });
  if (!order) {
    return { kind: 'page', statusCode: 404, html: renderRefundDecisionPage({ status: 'token_invalid', detail: 'Order not found' }) };
  }

  // Idempotency — a decision already in place renders as "already decided"
  // rather than re-running side effects.
  if (order.refundStatus && order.refundStatus !== 'pending') {
    return {
      kind: 'page',
      statusCode: 200,
      html: renderRefundDecisionPage({
        status: 'already_decided',
        shortId: order.shortId ?? undefined,
        previousStatus: order.refundStatus as 'approved' | 'denied',
        previousDecidedAt: order.refundDecidedAt?.toISOString(),
      }),
    };
  }
  if (order.refundStatus === null) {
    return {
      kind: 'page',
      statusCode: 409,
      html: renderRefundDecisionPage({ status: 'token_invalid', detail: 'Order has no pending refund request' }),
    };
  }

  const lang = (order.user.language as Language) || 'hi';
  const refundAmountPaise = order.amountPaise > 0 ? order.amountPaise : order.amount;
  return { kind: 'ready', order, action: decoded.action, lang, refundAmountPaise };
}

/**
 * Best-effort WhatsApp send. Returns null on success, an error string on failure.
 * Constructed inline so we don't share a client across requests (small volume,
 * trivial cost).
 */
async function notifyUser(phoneNumber: string, body: string): Promise<string | null> {
  try {
    const config = getConfig();
    const wa = new WhatsAppClient({
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    });
    await wa.sendText(phoneNumber, body);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Auth guard: require x-admin-secret header in production.
  // EXCEPTION: the refund-decision magic link is authenticated by JWT in the
  // URL (signed by REFUND_DECISION_SECRET) and is opened from the founder's
  // email client, which has no way to set custom headers. The JWT verification
  // inside that route is the auth — skip the secret check here.
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith('/admin/refunds/decide')) return;

    const config = getConfig();
    if (config.NODE_ENV === 'production') {
      const secret = req.headers['x-admin-secret'];
      const expected = config.ADMIN_SECRET ?? '';
      if (
        typeof secret !== 'string' ||
        !secret ||
        !expected ||
        Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
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
  // Phase 15c — magic-link refund decision
  //
  //   GET /admin/refunds/decide?token=<jwt>
  //
  // The founder clicks an Approve or Deny button in the refund-request email.
  // The button URL is a signed JWT (HS256, 30-day TTL) containing the orderId
  // and the action. We verify the signature here, check idempotency against
  // refundStatus, run the side effects (Razorpay refund on approve, WhatsApp
  // notification either way), and render a minimal status page.
  //
  // No admin UI for listing pending refunds — review happens via email. See
  // docs/runbooks/payments-refunds.md for the operational story.
  // -----------------------------------------------------------------------

  // GET only RENDERS — it never mutates. This is the fix for the prefetch hole:
  // email clients, Safe-Links scanners and chat unfurlers all issue GET, so a
  // GET that refunded money would auto-fire on the founder's inbox. Now GET
  // shows a confirmation page whose button POSTs the same token; the refund
  // runs only in the POST handler below.
  app.get('/admin/refunds/decide', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = (req.query as { token?: string }) ?? {};
    const ctx = await loadDecisionContext(app, token);
    if (ctx.kind === 'page') return renderHtml(reply, ctx.statusCode, ctx.html);

    const confirmUrl = `/admin/refunds/decide?token=${encodeURIComponent(token!)}`;
    return renderHtml(reply, 200, renderRefundDecisionPage({
      status: 'confirm',
      action: ctx.action,
      shortId: ctx.order.shortId ?? undefined,
      amountRupees: Math.round(ctx.refundAmountPaise / 100),
      confirmUrl,
    }));
  });

  // POST performs the decision. Reached only when the founder presses the
  // confirm button on the GET page. Browsers and scanners do not auto-POST, so
  // the side effect cannot be triggered by merely opening the email link.
  app.post('/admin/refunds/decide', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = (req.query as { token?: string }) ?? {};
    const ctx = await loadDecisionContext(app, token);
    if (ctx.kind === 'page') return renderHtml(reply, ctx.statusCode, ctx.html);

    if (ctx.action === 'approve') {
      return handleApprove(app, reply, ctx.order, ctx.lang, ctx.refundAmountPaise);
    }
    return handleDeny(app, reply, ctx.order, ctx.lang);
  });

  app.post('/admin/reset/:phone', async (req: FastifyRequest, reply: FastifyReply) => {
    const { phone } = req.params as { phone: string };

    // Validate the phone — digits only, plausible length — so a malformed or
    // hostile param can't fan out into an unintended match set.
    if (!/^\d{8,15}$/.test(phone)) {
      return reply.code(400).send({ ok: false, error: 'Invalid phone format (digits only, 8-15)' });
    }
    // This permanently deletes a user + their orders/jobs/sessions + storage.
    // Require an explicit confirm so a stray click/prefetch can't wipe a user.
    // (The route is already behind the x-admin-secret preHandler guard.)
    if ((req.query as { confirm?: string })?.confirm !== 'YES') {
      return reply.code(400).send({ ok: false, error: 'Destructive: add ?confirm=YES to proceed' });
    }

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
