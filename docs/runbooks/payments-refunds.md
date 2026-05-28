# Payments + refunds — operational runbook

This runbook complements [docs/runbooks/whatsapp-flows.md](./whatsapp-flows.md). It covers:

- UPI-only payment link config (Phase 12a)
- Resend transactional-email setup for refund requests (Phase 15a)
- Magic-link refund decision flow (Phase 15c)
- Support phone number for denied refunds

## 1. UPI-only payment links

`createPaymentLink()` now restricts the Razorpay hosted page to `upi` only by default. Cards / netbanking / wallets / EMI / paylater are all `false`.

When a user opens the short URL on mobile, Razorpay's UPI Intent Flow fires (`upi_link: true`) and deep-links into whichever UPI app they have set as default. On desktop, the page shows a QR code + UPI ID input. There's no other method available — by design.

### Staging override

For a one-off card test on staging:

```ts
await createPaymentLink({
  orderId,
  customerPhone,
  amount,
  paymentMethods: { card: true },   // merges on top of UPI-only default
});
```

### Verifying on a real device

1. Trigger a paid order (any order #2+ from a registered phone).
2. Tap the payment link in WhatsApp.
3. The page should:
   - Show UPI app icons (GPay / PhonePe / Paytm / Amazon Pay UPI / WhatsApp Pay / BHIM) at the top
   - Show a UPI ID input below
   - NOT show card / netbanking / wallet sections
4. Tap a UPI app icon → the app should open with the payment pre-filled.

### Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Page shows "no payment method available" | `paymentMethods` zero'd out by accident | Check the override merge in payment-link.ts; default is UPI-only |
| Card section visible on production | Staging override leaked into prod | Audit `paymentMethods` callers; remove the override |
| UPI app intent doesn't fire on Android | Old Android version or no default UPI app set | User must pick a UPI ID from the page input. Rare but real. |

## 2. Resend (email infrastructure)

Phase 15a wires a transactional email sent to the founder whenever a user submits a refund reason. Resend is the only provider supported.

### Required env vars

| Var | Value |
|---|---|
| `RESEND_API_KEY` | Server-side API key from https://resend.com/api-keys |
| `ADMIN_EMAIL`    | Founder address that receives refund requests, e.g. `mayank@autmn.app` |
| `APP_URL`        | Production base URL (e.g. `https://api.autmn.app`) — used in magic-link button URLs |
| `FROM_EMAIL`     | Optional. Defaults to `Autmn <noreply@autmn.app>`. Must point at a verified domain. |

### Domain verification

Resend requires SPF + DKIM + DMARC records for the sending domain. This takes 24-48h to propagate. Set this up on **Day 1** of payment-refund work — don't gate on writing code.

1. Resend Dashboard → Domains → Add Domain → `autmn.app`.
2. Add the listed DNS records at your registrar (Cloudflare / Route53 / Namecheap / etc.).
3. Wait for green checkmarks on SPF, DKIM, DMARC.
4. Send a test email via `sendEmail({ to: 'self', ... })` and check Gmail delivery.

### Without verification

`sendEmail` will still attempt to send through Resend's shared `onboarding.resend.dev` sender, but Gmail will route those into Spam. Don't ship before the domain is verified.

### Disabling email (kill switch)

Unset `RESEND_API_KEY`. The `sendEmail` helper throws `EmailSendError('RESEND_API_KEY is not configured')`, the refund handler catches it and logs to Sentry, and the user-facing flow continues normally (reason gets stored on the order). The founder won't be notified, but the next manual review of `Order.refundStatus = 'pending'` will surface the request.

## 3. Magic-link refund decisions

When a refund request arrives, the email contains two buttons:

- **✅ Approve refund** → `GET /admin/refunds/decide?token=<approve-jwt>`
- **❌ Deny refund** → `GET /admin/refunds/decide?token=<deny-jwt>`

The token is HS256-signed by `REFUND_DECISION_SECRET`, holds the orderId + action, and expires after 30 days. Clicking it once:

1. Verifies the signature + expiry
2. Checks `refundStatus` is still `pending` (idempotency)
3. On **approve**: writes `refundStatus='approved'`, then calls `issueRefund()` against Razorpay. If Razorpay fails, the decision is still locked but `razorpayRefundError` is populated for manual retry.
4. On **deny**: writes `refundStatus='denied'`.
5. Sends the user a WhatsApp message (approval / denial copy). Failures here render a `whatsapp_error` page so the founder knows to message manually.
6. Renders a confirmation page.

### Required env vars

| Var | Value |
|---|---|
| `REFUND_DECISION_SECRET` | Random ≥32-char string. Treat like a webhook secret; rotation invalidates every outstanding email. |
| `APP_URL` | Production base URL used when building the click target. |
| `SUPPORT_PHONE_NUMBER` | E.164 phone (e.g. `+919876543210`) — included in denial WhatsApp messages so users can contest. |

### Rolling the secret

If `REFUND_DECISION_SECRET` leaks (or you want to rotate quarterly), set the new value and redeploy. Outstanding emails become unclickable; their pending orders need to be decided via SQL:

```sql
update orders set refund_status='approved', refund_decided_at=now(),
  razorpay_refund_id=null, refund_decision_note='Manual SQL approval, post-rotation'
where id='<uuid>';
-- then call Razorpay refund API manually from the dashboard
```

### Support phone number

The denial WhatsApp message tells the user to contact `SUPPORT_PHONE_NUMBER` if they want to contest. This is a **separately staffed** number — the bot doesn't handle it. Setup:

1. Procure a dedicated number, or use an existing personal WhatsApp.
2. Install WhatsApp Business app, register the number.
3. Set `SUPPORT_PHONE_NUMBER` in prod env.
4. Define a response SLA (e.g. "within 24h on business days").
5. Optionally configure auto-reply outside hours.

If `SUPPORT_PHONE_NUMBER` is unset, the denial message ships without a contact section — the user just gets the bare "we cannot process this refund" copy.

## 4. Free-order refund short-circuit

When a user taps **Request refund** on an order where `amountPaise === 0`, the bot does NOT enter `REFUND_REQUEST`. Instead it sends `msgFreeOrderNoRefund` ("This was a free order — there's no charge to refund. Want to send a new product?") and stays in `DELIVERED`.

This guards against:
- Wasted founder review time
- Inadvertent Razorpay refund calls on orders without a `razorpayPaymentId`

The user can still tap **Send new product** from the same menu to start a fresh order.

## 5. End-to-end test on real Razorpay sandbox

Before going live, run one full loop in sandbox:

1. Set Razorpay env to test keys (`RAZORPAY_KEY_ID=rzp_test_xxx`, `RAZORPAY_KEY_SECRET=...`).
2. Trigger a paid order on a real WhatsApp number you can monitor.
3. Pay via UPI sandbox (Razorpay test cards page has a "Sandbox UPI" option).
4. After delivery, tap Request refund, send a reason.
5. Confirm the email arrives in `ADMIN_EMAIL` inbox with working buttons.
6. Click Approve. Verify:
   - Refund decision page renders ✅
   - WhatsApp message arrives at the user
   - Razorpay sandbox dashboard shows the refund initiated
   - `orders.refund_status = 'approved'`, `razorpay_refund_id` populated
7. Re-click the same link → already_decided page.
8. Repeat with a Deny token on a second order.

## 6. Known gaps (V1)

- **Partial refunds**: not supported. If a user is unhappy with 1 of 3 ads, the choice is full refund or none. Razorpay supports partials natively, but the magic-link UI doesn't expose them in V1.
- **Custom denial reasons**: the denial WhatsApp message can't include a free-text reason from the founder. The decision note is recorded internally but not surfaced to the user.
- **Re-decision**: once a decision is locked, the only way to flip it is via SQL.
- **Failed-Razorpay retry**: if the refund API errors after approval, retry happens through the Razorpay dashboard (or a follow-up curl). The order row stays `approved` with `razorpayRefundError` populated — caller knows to retry manually.
