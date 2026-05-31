/**
 * Phase 23 — observability hooks for the AI pipeline.
 *
 * Each alert emits the structured pino-compatible JSON line (so logs +
 * existing log forwarding pipelines continue to surface the event) AND,
 * when Sentry has been initialised at process startup via initSentry()
 * in ./sentry.ts, also captures the same shape into Sentry as a tagged
 * message. The captureAlert wrapper is a no-op when SENTRY_DSN is unset,
 * so this is purely additive — no breaking change for environments that
 * route via logs only.
 *
 * Three trigger points per plan §8:
 *   1. Single-order cost above ALERT_COST_CEILING_INR
 *   2. KeyPoolExhaustedError surfacing in any provider
 *   3. 3+ consecutive Tier-2 fires in a 10-minute sliding window
 *
 * Trigger 3 maintains an in-process sliding-window counter; the keypool
 * one is invoked by the caller when it catches the error and decides to
 * surface it. (Catching it deep in the keypool would create circular noise.)
 */

import { captureAlert } from './sentry.js';

/** Alert threshold for per-order cost. Plan §8: ₹80 suggests a runaway loop. */
export const ALERT_COST_CEILING_INR = 80;

/** Threshold for consecutive Tier-2 fires before alerting (Gemini outage signal). */
export const TIER2_BURST_THRESHOLD = 3;
const TIER2_BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Emit an alert when an order's total cost exceeded ALERT_COST_CEILING_INR.
 *
 * The event is emitted as a JSON line to stdout (pino-compatible). The
 * payload deliberately includes `event: 'alert.cost_ceiling_breach'` so the
 * log router can filter on it without parsing the message.
 */
export function alertCostCeilingBreach(payload: {
  orderId: string;
  totalCostInr: number;
  styleCount: number;
  brief?: string;
}): void {
  if (payload.totalCostInr <= ALERT_COST_CEILING_INR) return;
  const fullPayload = {
    threshold: ALERT_COST_CEILING_INR,
    ...payload,
  };
  console.warn(JSON.stringify({
    event: 'alert.cost_ceiling_breach',
    severity: 'warning',
    ...fullPayload,
  }));
  captureAlert({
    level: 'warning',
    event: 'alert.cost_ceiling_breach',
    payload: fullPayload,
  });
}

/**
 * Emit an alert when KeyPoolExhaustedError surfaces. Call site wraps the
 * thrown error with this so the alert fires at the boundary (not deep
 * inside the keypool).
 */
export function alertKeyPoolExhausted(payload: {
  provider: string;
  keyCount: number;
  cooldownsBlocking: number;
  context?: string;
}): void {
  console.warn(JSON.stringify({
    event: 'alert.keypool_exhausted',
    severity: 'error',
    ...payload,
  }));
  captureAlert({
    level: 'error',
    event: 'alert.keypool_exhausted',
    payload,
  });
}

// ---------------------------------------------------------------------------
// Tier-2 burst tracker
// ---------------------------------------------------------------------------

const tier2Timestamps: number[] = [];

/**
 * Record a Tier-2 fire and check if the sliding window count crosses the
 * burst threshold. When it does, emit an alert (idempotent per window —
 * fires once until the window drains below threshold).
 */
let lastBurstAlertAt = 0;
const BURST_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export function recordTier2Fire(payload: {
  orderId: string;
  style: string;
  reason?: string;
}): void {
  const now = Date.now();
  // Drop timestamps older than the window.
  while (tier2Timestamps.length > 0 && now - tier2Timestamps[0]! > TIER2_BURST_WINDOW_MS) {
    tier2Timestamps.shift();
  }
  tier2Timestamps.push(now);

  if (tier2Timestamps.length >= TIER2_BURST_THRESHOLD && now - lastBurstAlertAt > BURST_ALERT_COOLDOWN_MS) {
    lastBurstAlertAt = now;
    const burstPayload = {
      count: tier2Timestamps.length,
      windowMs: TIER2_BURST_WINDOW_MS,
      threshold: TIER2_BURST_THRESHOLD,
      orderId: payload.orderId,
      style: payload.style,
      reason: payload.reason,
    };
    console.warn(JSON.stringify({
      event: 'alert.tier2_burst',
      severity: 'error',
      ...burstPayload,
    }));
    captureAlert({
      level: 'error',
      event: 'alert.tier2_burst',
      payload: burstPayload,
    });
  }
}

/** Reset internal state — test-only. */
export function _resetTier2BurstTracker(): void {
  tier2Timestamps.length = 0;
  lastBurstAlertAt = 0;
}
