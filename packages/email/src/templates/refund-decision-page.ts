/**
 * HTML page rendered when the founder clicks an approve / deny magic link.
 *
 * Not an email — it's the GET /admin/refunds/decide response body. Kept here
 * because it shares the visual language with the refund-request email and
 * benefits from being co-located.
 */

export type RefundDecisionPageStatus =
  | 'confirm'
  | 'approved'
  | 'denied'
  | 'already_decided'
  | 'token_invalid'
  | 'token_expired'
  | 'razorpay_error'
  | 'whatsapp_error';

export interface RefundDecisionPageData {
  status: RefundDecisionPageStatus;
  /** Short order ID for display. Optional — token-invalid pages may not have one. */
  shortId?: string;
  /** Amount in rupees for approval confirmation. */
  amountRupees?: number;
  /** Free-text detail to surface (e.g., Razorpay error). Plain text, no markup. */
  detail?: string;
  /** When the order was previously decided (for already_decided). */
  previousDecidedAt?: string;
  /** Previous decision when status is already_decided. */
  previousStatus?: 'approved' | 'denied';
  /** Pending action being confirmed (for status 'confirm'). */
  action?: 'approve' | 'deny';
  /** POST target (token-carrying) the confirm button submits to. */
  confirmUrl?: string;
}

const TITLE_MAP: Record<RefundDecisionPageStatus, string> = {
  confirm: 'Confirm refund decision',
  approved: 'Refund approved ✅',
  denied: 'Refund denied',
  already_decided: 'Already decided',
  token_invalid: 'Invalid link',
  token_expired: 'Link expired',
  razorpay_error: 'Razorpay refund failed',
  whatsapp_error: 'Decision recorded, user notification failed',
};

const COLOR_MAP: Record<RefundDecisionPageStatus, string> = {
  confirm: '#1d4ed8',
  approved: '#16a34a',
  denied: '#dc2626',
  already_decided: '#6b7280',
  token_invalid: '#dc2626',
  token_expired: '#d97706',
  razorpay_error: '#dc2626',
  whatsapp_error: '#d97706',
};

export function renderRefundDecisionPage(data: RefundDecisionPageData): string {
  const title = TITLE_MAP[data.status];
  const color = COLOR_MAP[data.status];

  const body = buildBody(data);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — Autmn</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; color: #111; background: #f9fafb; margin: 0; padding: 48px 24px;">
  <main style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="margin: 0 0 16px; font-size: 22px; color: ${color};">${escapeHtml(title)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function buildBody(data: RefundDecisionPageData): string {
  switch (data.status) {
    case 'confirm': {
      const isApprove = (data.action ?? 'approve') === 'approve';
      const verb = isApprove ? 'Approve' : 'Deny';
      const intro = isApprove
        ? `<p style="margin: 0 0 12px;">You are about to <strong>approve a refund of ₹${data.amountRupees ?? '?'}</strong> for order <code>#${escapeHtml(data.shortId ?? '?')}</code>.</p>`
        : `<p style="margin: 0 0 12px;">You are about to <strong>deny the refund request</strong> for order <code>#${escapeHtml(data.shortId ?? '?')}</code>.</p>`;
      const btnColor = isApprove ? '#16a34a' : '#dc2626';
      // The decision only runs on this POST. Opening the link (GET) just shows
      // this page, so email scanners / link prefetchers can't trigger a refund.
      return `${intro}
        <p style="margin: 0 0 20px; color: #555;">This is final and notifies the customer. Nothing happens until you press the button.</p>
        <form method="POST" action="${escapeHtml(data.confirmUrl ?? '#')}">
          <button type="submit" style="display:inline-block; background:${btnColor}; color:#fff; border:none; border-radius:8px; padding:12px 20px; font-size:16px; cursor:pointer;">${verb} refund</button>
        </form>`;
    }
    case 'approved':
      return `<p style="margin: 0 0 12px;">Refund of ₹${data.amountRupees ?? '?'} initiated against order <code>#${escapeHtml(data.shortId ?? '?')}</code>.</p>
        <p style="margin: 0; color: #555;">Razorpay will credit the customer's original payment method within 3-5 business days. The customer has been notified via WhatsApp.</p>`;
    case 'denied':
      return `<p style="margin: 0 0 12px;">Refund request for order <code>#${escapeHtml(data.shortId ?? '?')}</code> has been denied.</p>
        <p style="margin: 0; color: #555;">The customer has been notified via WhatsApp with the support phone number for follow-up.</p>`;
    case 'already_decided':
      return `<p style="margin: 0 0 12px;">This refund was already <strong>${escapeHtml(data.previousStatus ?? 'decided')}</strong>${
        data.previousDecidedAt ? ` on ${escapeHtml(data.previousDecidedAt)}` : ''
      }.</p>
        <p style="margin: 0; color: #555;">Magic links are single-use; this click had no effect.</p>`;
    case 'token_invalid':
      return `<p style="margin: 0; color: #555;">The link signature is invalid or malformed. Forward this email to the engineer on duty so they can investigate.</p>`;
    case 'token_expired':
      return `<p style="margin: 0; color: #555;">This magic link is older than 30 days. Refund decisions must now be made manually via SQL.</p>`;
    case 'razorpay_error':
      return `<p style="margin: 0 0 12px;">The refund status was recorded as <strong>approved</strong> but Razorpay returned an error when issuing the refund:</p>
        <pre style="background: #fef2f2; color: #991b1b; padding: 12px; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(data.detail ?? '(no detail)')}</pre>
        <p style="margin: 12px 0 0; color: #555;">Retry from the Razorpay dashboard, or open the order in the DB and clear razorpayRefundError once resolved.</p>`;
    case 'whatsapp_error':
      return `<p style="margin: 0 0 12px;">The refund decision was recorded successfully, but the WhatsApp notification to the customer failed.</p>
        <pre style="background: #fef3c7; color: #92400e; padding: 12px; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(data.detail ?? '(no detail)')}</pre>
        <p style="margin: 12px 0 0; color: #555;">Message the customer manually so they know the outcome.</p>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
