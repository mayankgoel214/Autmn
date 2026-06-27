/**
 * ⚠️⚠️⚠️  TEMPORARY TEST SCAFFOLDING — DO NOT COMMIT. REMOVE AFTER TESTING. ⚠️⚠️⚠️
 *
 * Env-gated failure injector for manually verifying the transient-vs-permanent
 * refund gate without a real AI outage.
 *
 *   FORCE_TRANSIENT_FAILURE=true → every generation attempt throws a transient
 *                                  error ("429 / 503 UNAVAILABLE") so both tiers
 *                                  fail → chain reaches tier:'refund' classified
 *                                  TRANSIENT → worker re-queues within 45 min.
 *   FORCE_PERMANENT_FAILURE=true → every attempt throws a permanent error
 *                                  ('"code":400' + SAFETY) → classified PERMANENT
 *                                  → worker refunds immediately, no waiting.
 *
 * When NEITHER is set, this is a no-op and behavior is 100% unchanged.
 * PERMANENT takes precedence if both are somehow set.
 */

const TRANSIENT_ON = () => process.env.FORCE_TRANSIENT_FAILURE === 'true';
const PERMANENT_ON = () => process.env.FORCE_PERMANENT_FAILURE === 'true';

// Loud, once-per-process banner at module load so it can't be forgotten.
if (TRANSIENT_ON() || PERMANENT_ON()) {
  console.error(JSON.stringify({
    event: 'FORCED_FAILURE_INJECTION_ENABLED',
    mode: PERMANENT_ON() ? 'permanent' : 'transient',
    warning: '🔴 AI GENERATION IS BEING FORCED TO FAIL — TEST SCAFFOLDING IS ACTIVE 🔴',
  }));
}

/** Throws a forced error if an injection flag is set. No-op otherwise. */
export function forceFailureIfRequested(stage: string): void {
  if (PERMANENT_ON()) {
    console.error(JSON.stringify({
      event: 'FORCED_FAILURE_INJECTED', mode: 'permanent', stage,
    }));
    // Contains '"code":400' and 'SAFETY' → classifyFailure() → 'permanent'.
    throw new Error(
      'FORCED TEST FAILURE (FORCE_PERMANENT_FAILURE): {"error":{"code":400,"status":"INVALID_ARGUMENT"}} blocked by SAFETY',
    );
  }
  if (TRANSIENT_ON()) {
    console.error(JSON.stringify({
      event: 'FORCED_FAILURE_INJECTED', mode: 'transient', stage,
    }));
    // Contains '429' / 'UNAVAILABLE' / 'overloaded' → classifyFailure() → 'transient'.
    throw new Error(
      'FORCED TEST FAILURE (FORCE_TRANSIENT_FAILURE): 429 rate limit — 503 UNAVAILABLE, provider overloaded',
    );
  }
}
