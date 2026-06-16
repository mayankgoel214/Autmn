/**
 * refund-request.tsx (renamed to .ts — plain HTML, no JSX).
 *
 * Founder-facing email triggered when a user submits a refund reason.
 * Contains all the context the founder needs to decide approve / deny
 * without leaving the email client, plus two magic-link buttons.
 *
 * Per plan §2: this is the ONLY email the system actually sends. User
 * notifications go through WhatsApp.
 */

export interface RefundRequestEmailData {
  /** Long UUID — used in URLs. */
  orderId: string;
  /** Human-readable 6-char id displayed in subject + body. */
  shortId: string;
  /** Rupees (display); we accept paise upstream and divide. */
  amountRupees: number;
  /** Customer WhatsApp number, E.164 with leading "+". */
  userPhone: string;
  /** Brand name from the User row (display only). */
  userBrand: string | null;
  /** Public/signed URLs to the delivered creatives. */
  deliveredAdsUrls: string[];
  /** Free-text reason the user submitted. */
  refundReason: string;
  /** Signed voice-note URL, or null if the user only sent text. */
  refundVoiceUrl: string | null;
  /** Magic links — signed by the API; clicking either records the decision. */
  approveUrl: string;
  denyUrl: string;
  /** ISO timestamp of submission for display. */
  submittedAt: string;
}

/** Render the refund-request email as HTML + plain-text. */
export function renderRefundRequestEmail(data: RefundRequestEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Refund request: Order #${data.shortId} — ₹${data.amountRupees}`;

  const adsList = data.deliveredAdsUrls.length
    ? data.deliveredAdsUrls
        .map((url, i) => `<li><a href="${escapeAttr(url)}">Creative ${i + 1}</a></li>`)
        .join('')
    : '<li><em>No delivered creative URLs on record.</em></li>';

  const voiceRow = data.refundVoiceUrl
    ? `<tr><td><strong>Voice note:</strong></td><td><a href="${escapeAttr(data.refundVoiceUrl)}">Open recording</a></td></tr>`
    : '';

  // Inline styles only — most email clients strip <style> tags.
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; color: #111; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Refund request — Order #${escapeHtml(data.shortId)}</h1>
  <p style="margin: 0 0 16px; color: #555;">A customer is asking for a refund. Review the context below and click one button.</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;" cellpadding="6">
    <tr><td style="width: 140px;"><strong>Order ID:</strong></td><td><code>${escapeHtml(data.orderId)}</code></td></tr>
    <tr><td><strong>Short ID:</strong></td><td>#${escapeHtml(data.shortId)}</td></tr>
    <tr><td><strong>Amount:</strong></td><td>₹${data.amountRupees}</td></tr>
    <tr><td><strong>Customer:</strong></td><td>${escapeHtml(data.userBrand ?? '—')} (<code>${escapeHtml(data.userPhone)}</code>)</td></tr>
    <tr><td><strong>Submitted:</strong></td><td>${escapeHtml(data.submittedAt)}</td></tr>
    ${voiceRow}
  </table>

  <h2 style="font-size: 16px; margin: 0 0 8px;">Reason</h2>
  <blockquote style="margin: 0 0 24px; padding: 12px 16px; background: #f6f7f9; border-left: 4px solid #ccc; white-space: pre-wrap;">${escapeHtml(data.refundReason)}</blockquote>

  <h2 style="font-size: 16px; margin: 0 0 8px;">Delivered creatives</h2>
  <ul style="margin: 0 0 32px; padding-left: 20px;">${adsList}</ul>

  <table cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
    <tr>
      <td style="padding-right: 12px;">
        <a href="${escapeAttr(data.approveUrl)}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">✅ Approve refund</a>
      </td>
      <td>
        <a href="${escapeAttr(data.denyUrl)}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">❌ Deny refund</a>
      </td>
    </tr>
  </table>

  <p style="font-size: 12px; color: #888; margin: 0;">
    Magic links expire in 30 days and can only be clicked once.
    Once a decision is recorded, the customer receives a WhatsApp message and the order's refundStatus is locked.
  </p>
</body>
</html>`;

  const text = [
    `Refund request — Order #${data.shortId}`,
    '',
    `Order ID: ${data.orderId}`,
    `Amount:   ₹${data.amountRupees}`,
    `Customer: ${data.userBrand ?? '—'} (${data.userPhone})`,
    `Submitted: ${data.submittedAt}`,
    ...(data.refundVoiceUrl ? [`Voice:    ${data.refundVoiceUrl}`] : []),
    '',
    'Reason:',
    data.refundReason,
    '',
    'Delivered creatives:',
    ...(data.deliveredAdsUrls.length
      ? data.deliveredAdsUrls.map((u, i) => `  ${i + 1}. ${u}`)
      : ['  (none on record)']),
    '',
    `APPROVE: ${data.approveUrl}`,
    `DENY:    ${data.denyUrl}`,
    '',
    'Magic links expire in 30 days, single-use.',
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Tiny escapers — avoid pulling in a templating lib for two transactional
// emails. Email clients do not need full HTML spec coverage.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
