/**
 * Phase 23 + V1 compromise #4 — Sentry transport for alert.* events.
 *
 * Centralises @sentry/node so the alerts module (and any other call site
 * that wants to surface a structured signal) can capture without each
 * caller having to import the SDK and worry about init state.
 *
 * Init policy:
 *   - initSentry({ dsn, ... }) MUST be called once at process startup
 *     (apps/api/src/index.ts + apps/worker/src/index.ts do this).
 *   - When `dsn` is missing or empty, init is a no-op and every capture
 *     function below silently skips the SDK call. Console.warn output
 *     in alerts.ts is unchanged either way — Sentry is purely additive.
 *
 * Why a thin wrapper instead of importing @sentry/node directly in
 * alerts.ts:
 *   - The smoke tests for alerts.ts (smoke-phase-23) assert on captured
 *     console.warn output and must NOT depend on a live Sentry transport.
 *     Routing via this module makes the no-op path obvious.
 *   - If we ever swap transports (Better Stack, Datadog, native pino+otel
 *     pipeline), only this file changes.
 */

import * as Sentry from '@sentry/node';

let initialised = false;

export interface InitSentryOptions {
  /**
   * Sentry DSN. When undefined/empty, this entire module turns into
   * no-ops so dev environments without Sentry credentials don't error.
   */
  dsn: string | undefined;
  /** Distinguishes events from api/ worker/ admin/ in the Sentry UI. */
  service: 'api' | 'worker' | 'admin';
  /** Sentry environment tag (e.g. 'production', 'staging', 'dev'). */
  environment?: string;
  /** Release SHA — wire to GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_SHA at deploy time. */
  release?: string;
  /**
   * Trace sample rate — default 0 (events only). Bump to >0 only after
   * we have a clear performance signal worth paying for.
   */
  tracesSampleRate?: number;
}

/**
 * Initialise the Sentry SDK exactly once per process. Safe to call
 * multiple times; subsequent calls log a warn and skip.
 *
 * Returns `true` when Sentry is now active, `false` when init was
 * skipped (missing DSN). Callers can branch on this for logging.
 */
export function initSentry(opts: InitSentryOptions): boolean {
  if (initialised) {
    console.warn(JSON.stringify({
      event: 'sentry_init_skipped',
      reason: 'already_initialised',
      service: opts.service,
    }));
    return true;
  }
  if (!opts.dsn || !opts.dsn.trim()) {
    console.info(JSON.stringify({
      event: 'sentry_init_skipped',
      reason: 'no_dsn',
      service: opts.service,
      note: 'Alerts emit as console.warn only. Set SENTRY_DSN to enable transport.',
    }));
    return false;
  }
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment ?? process.env.NODE_ENV ?? 'development',
    release: opts.release,
    tracesSampleRate: opts.tracesSampleRate ?? 0,
    // Tag every event with the originating service so the UI can split
    // api/worker without a custom dashboard.
    initialScope: { tags: { service: opts.service } },
  });
  initialised = true;
  console.info(JSON.stringify({
    event: 'sentry_init',
    service: opts.service,
    environment: opts.environment ?? process.env.NODE_ENV ?? 'development',
  }));
  return true;
}

/**
 * True iff initSentry has been called successfully (DSN was set).
 * Exposed for the alerts module to early-return.
 */
export function isSentryActive(): boolean {
  return initialised;
}

/**
 * Capture an alert.* event. Mirrors the payload that alerts.ts already
 * emits as JSON, so the Sentry-side fingerprint matches the log-side
 * grep target.
 *
 * The `level` parameter maps to Sentry's severity level. We use
 * 'warning' for cost-ceiling, 'error' for keypool exhaustion + tier-2
 * burst (matches the severity field on the existing JSON events).
 */
export function captureAlert(params: {
  level: 'warning' | 'error';
  event: string;
  payload: Record<string, unknown>;
}): void {
  if (!initialised) return;
  Sentry.withScope((scope) => {
    scope.setLevel(params.level);
    scope.setTag('alert_event', params.event);
    // Promote known structured fields to Sentry tags so they're searchable
    // from the UI without unpacking the JSON context blob.
    for (const key of ['orderId', 'provider', 'style'] as const) {
      const value = params.payload[key];
      if (typeof value === 'string') scope.setTag(key, value);
    }
    scope.setContext('payload', params.payload);
    Sentry.captureMessage(params.event, params.level);
  });
}

/**
 * Capture an exception. Used at the request-/job-level catch blocks in
 * apps/api + apps/worker. No-op when DSN is unset.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialised) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('extra', context);
    Sentry.captureException(err);
  });
}

/**
 * Test-only reset hook so unit tests can re-initialise. Not exported
 * from the package index.
 */
export function _resetSentryForTests(): void {
  initialised = false;
}
