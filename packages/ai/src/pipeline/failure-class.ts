/**
 * Shared transient-vs-permanent failure classifier.
 *
 * Single source of truth for "should we keep retrying this?". The signal
 * lists mirror the inline checks already used inside gemini-generate.ts and
 * openai-generate.ts (left untouched to keep their tested behavior), plus the
 * circuit-breaker-OPEN sentinel.
 *
 * Default is 'transient': an unknown error is more cheaply handled by retrying
 * within the window than by wrongly refunding a recoverable order.
 */
export type FailureClass = 'transient' | 'permanent';

// Permanent — retrying will not help (bad input, auth, policy, quota ceiling).
const PERMANENT_SIGNALS = [
  '"code":400',
  '"code":401',
  '"code":403',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'SAFETY',
  'PROHIBITED_CONTENT',
  'content_policy_violation',
  'invalid_api_key',
  'billing_hard_limit_reached',
  // OpenAI billing/quota exhausted — retrying will not help. NOTE: we do NOT
  // add Gemini's 'RESOURCE_EXHAUSTED' here: Gemini returns it for ordinary
  // per-minute rate limits too, which ARE retryable. Marking it permanent
  // would wrongfully refund recoverable orders. 429 / rate limit stay transient.
  'insufficient_quota',
  'You exceeded your current quota',
  // Bad/oversized input that no retry can fix.
  'context_length_exceeded',
];

// Transient — provider busy / overloaded / network blips / breaker open.
const TRANSIENT_SIGNALS = [
  '429',
  'rate limit',
  'rate_limit',
  'timed out',
  'timeout',
  '"code":500',
  '"code":502',
  '"code":503',
  '"code":504',
  'UNAVAILABLE',
  'overloaded',
  'circuit breaker is OPEN',
  'ECONNRESET',
  'ETIMEDOUT',
  'fetch failed',
];

export function classifyFailure(errorText: string): FailureClass {
  const text = errorText ?? '';
  // Permanent wins if both somehow appear — a 403 inside a retried call is
  // still permanent.
  if (PERMANENT_SIGNALS.some((s) => text.includes(s))) return 'permanent';
  if (TRANSIENT_SIGNALS.some((s) => text.includes(s))) return 'transient';
  return 'transient';
}
