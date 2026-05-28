/**
 * @autmn/email — transactional email via Resend.
 *
 * Phase 15a — wraps Resend's API so the rest of the codebase imports a
 * provider-agnostic `sendEmail`. Templates are plain HTML string builders
 * (`packages/email/src/templates/*`) so we don't pull a React Email tree in.
 *
 * Env vars:
 *   RESEND_API_KEY  — required at send time (lazy-checked). Without it,
 *                     sendEmail throws so the caller can fall back / alert.
 *   FROM_EMAIL      — defaults to "Autmn <noreply@autmn.app>". Domain must
 *                     be verified in Resend (SPF + DKIM + DMARC).
 *   APP_URL         — base URL for magic links in templates.
 *   ADMIN_EMAIL     — founder address that receives refund-request emails.
 */

export { sendEmail, EmailSendError } from './client.js';
export type { SendEmailParams, SendEmailResult } from './client.js';

export { renderRefundRequestEmail } from './templates/refund-request.js';
export type { RefundRequestEmailData } from './templates/refund-request.js';

export { renderRefundDecisionPage } from './templates/refund-decision-page.js';
export type {
  RefundDecisionPageData,
  RefundDecisionPageStatus,
} from './templates/refund-decision-page.js';
