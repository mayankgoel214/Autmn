/**
 * Phase 15c — JWT helpers for refund-decision magic links.
 *
 * The plan locks single-use enforcement via the `refundStatus === 'pending'`
 * check at click time, not via a DB-tracked token table. JWT keeps the
 * implementation small; if we ever see token replay we promote to the
 * RefundDecisionToken model sketched in §4.
 *
 * Algorithm: HS256.
 * TTL: 30 days from issue (per plan §2).
 *
 * Env:
 *   REFUND_DECISION_SECRET — required. Treat like a webhook secret; rotation
 *                            invalidates every outstanding email.
 *   APP_URL                — base URL used when building the click target.
 */

import { SignJWT, jwtVerify } from 'jose';

const ALG = 'HS256';
// 7 days. Short enough to bound a leaked link's usefulness, long enough for a
// founder to action a refund email over a weekend. Also bound to the request
// timestamp at click time (see loadDecisionContext).
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export type RefundDecisionAction = 'approve' | 'deny';

export interface RefundDecisionTokenPayload {
  orderId: string;
  action: RefundDecisionAction;
  /** Issued-at seconds since epoch. */
  iat: number;
  /** Expiry seconds since epoch. */
  exp: number;
}

function getSecret(): Uint8Array {
  const raw = process.env['REFUND_DECISION_SECRET'];
  if (!raw || raw.length < 32) {
    throw new Error(
      'REFUND_DECISION_SECRET is missing or shorter than 32 chars — refusing to sign refund tokens.',
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Sign a refund-decision token. Returns the encoded JWT string.
 *
 * `ttlSeconds` defaults to 30 days per plan. Callers may pass a shorter
 * value for testing.
 */
export async function signRefundDecisionToken(
  orderId: string,
  action: RefundDecisionAction,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ orderId, action })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecret());
  return token;
}

/**
 * Verify a refund-decision token. Throws on signature mismatch or expiry.
 *
 * jose surfaces expiry as `JWTExpired` (code `ERR_JWT_EXPIRED`). We rethrow
 * with a message that contains "expired" so the admin route can distinguish
 * the expired branch from generic signature failures without inspecting
 * library-specific error codes.
 */
export async function verifyRefundDecisionToken(
  token: string,
): Promise<RefundDecisionTokenPayload> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    payload = result.payload;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'ERR_JWT_EXPIRED' || /expired/i.test(e.message)) {
      throw new Error(`Token expired: ${e.message}`);
    }
    throw err;
  }

  if (typeof payload['orderId'] !== 'string' || typeof payload['action'] !== 'string') {
    throw new Error('Token payload missing required fields');
  }
  const action = payload['action'];
  if (action !== 'approve' && action !== 'deny') {
    throw new Error(`Token payload has invalid action: ${action}`);
  }
  return {
    orderId: payload['orderId'] as string,
    action,
    iat: payload['iat'] as number,
    exp: payload['exp'] as number,
  };
}

/**
 * Build the full magic-link URL the founder clicks in their email.
 *
 * The exception thrown when APP_URL is missing is intentionally loud — we'd
 * rather fail email composition than send a link to localhost.
 */
export async function buildRefundDecisionUrl(
  orderId: string,
  action: RefundDecisionAction,
): Promise<string> {
  const base = process.env['APP_URL'];
  if (!base) {
    throw new Error('APP_URL is not configured — cannot build refund-decision URL');
  }
  const token = await signRefundDecisionToken(orderId, action);
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/admin/refunds/decide?token=${encodeURIComponent(token)}`;
}
