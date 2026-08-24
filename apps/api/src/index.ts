import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), override: true });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from '@autmn/db';
import { initSentry, captureException } from '@autmn/ai';
import { initMetrics, observeRequest, startMetricsServer } from '@autmn/metrics';
import { getConfig } from './config.js';
import { registerRawBodyParser } from './middleware/raw-body.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { adminTestRoutes } from './routes/admin/test.js';
import { adminKeypoolRoutes } from './routes/admin/keypool.js';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.js';
import { razorpayWebhookRoutes } from './routes/webhooks/razorpay.js';
import { registerBullBoard } from './plugins/bull-board.js';

async function main() {
  const config = getConfig();

  if (config.NODE_ENV === 'production' && process.env.PAYMENT_BYPASS === 'true') {
    console.error('FATAL: PAYMENT_BYPASS must not be set in production');
    process.exit(1);
  }

  // V1 compromise #4 — Sentry transport for alert.* + uncaught errors.
  // No-op when SENTRY_DSN is unset. MUST run before Fastify so the error
  // hook below sees an initialised SDK.
  initSentry({
    dsn: config.SENTRY_DSN,
    service: 'api',
    environment: config.NODE_ENV,
    release: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  });

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  initMetrics('api');

  // Timing lives in a hook rather than per-route, so a route added later is
  // measured without anyone remembering to instrument it.
  app.addHook('onResponse', async (req, reply) => {
    observeRequest(
      req.method,
      // The route pattern, not the resolved URL: labelling by raw path would
      // mint a series per order id.
      req.routeOptions?.url,
      reply.statusCode,
      reply.elapsedTime / 1000,
    );
  });

  // Metrics listen on their own port rather than as a route on this server.
  // The public surface here receives WhatsApp and Razorpay webhooks from the
  // open internet, and queue depths, job timings and route latencies are not
  // things to hand out there. Prometheus reaches this port over the internal
  // network only.
  startMetricsServer(Number(process.env.METRICS_PORT ?? 9100));

  // Raw body parser must be registered BEFORE routes
  registerRawBodyParser(app);

  // V1 compromise #4 — surface Fastify errors into Sentry. The hook fires
  // for both unhandled handler throws AND replies via reply.send(err). It
  // does NOT alter Fastify's response — Sentry is purely additive.
  app.addHook('onError', async (req, _reply, err) => {
    captureException(err, {
      method: req.method,
      url: req.url,
      requestId: req.id,
    });
  });

  // Plugins
  await app.register(cors, { origin: false });

  // Routes
  await app.register(healthRoutes);
  await app.register(adminRoutes);
  // The /admin/test debug UI authenticates via a ?key=<ADMIN_SECRET> query
  // string, which leaks through access logs, Referer headers, and browser
  // history. It's a pre-launch testing tool — never register it in production,
  // so the master secret can't leak there. Real prod admin ops use the
  // header-authed endpoints (adminRoutes) and the signed refund magic links.
  if (config.NODE_ENV !== 'production') {
    await app.register(adminTestRoutes);
  }
  await app.register(adminKeypoolRoutes);
  await app.register(whatsappWebhookRoutes);
  await app.register(razorpayWebhookRoutes);

  // Bull Board (queue monitoring UI)
  try {
    await registerBullBoard(app);
    app.log.info('Bull Board mounted at /admin/queues');
  } catch (err) {
    app.log.warn({ err }, 'Failed to mount Bull Board — queue monitoring unavailable');
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Shutting down...');
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  // Start
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Autmn API running on port ${config.PORT} (${config.NODE_ENV})`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
