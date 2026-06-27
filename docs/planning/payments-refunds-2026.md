# Payments + refunds infrastructure — plan

**Status:** Approved scope, ready to build (after post-onboarding rebuild Phase 12).
**Owner:** Mayank
**Built from:** discussion on 2026-05-26.
**Supersedes:** the refund flow section in [post-onboarding-rebuild-2026.md §1](./post-onboarding-rebuild-2026.md), which only sketched the manual-review concept. This doc is the full spec.

---

## Goal

Ship a UPI-only payment experience that minimizes friction for Indian users, and a refund flow that runs on email + magic links — no admin dashboard needed at this scale.

## Locked decisions

### Payments
- **UPI only.** No cards, no netbanking, no wallets, no EMI. UPI is universal in our target market and has the lowest payment failure rate.
- **Razorpay payment links** restricted to UPI methods.
- **Best-of-both UX**: the bot sends a Razorpay UPI-only page link, but that page itself shows a prominent "Open UPI app" button at the top that fires a `upi://pay` intent for users with a default UPI app set. Razorpay supports this natively via UPI Intent Flow on their hosted page.
- First-time user orders are free (₹0) — payment step skipped entirely. Logic lives in [packages/payment](../../packages/payment).

### Refunds
- User-initiated via the post-delivery menu (free text + optional voice reason).
- **₹0 orders cannot be refunded.** Tapping "Request refund" on a free order shows: *"This was a free order — there's no charge to refund. Want to send a new product instead?"* with the "Send new product" button.
- For paid orders:
  - User submits reason.
  - **Email fires to founder** (Resend transactional email) with: phone number, brand name, order ID, amount, delivered ad links, refund reason text + voice URL.
  - Email contains **two magic-link buttons**: ✅ Approve | ❌ Deny.
  - Clicking either button hits a signed-URL endpoint, executes the decision, marks the token used.
  - User receives a WhatsApp message within seconds confirming approval or denial.
  - On approval: Razorpay refund triggered programmatically (full amount, no partial refunds for v1).
  - On denial: canned message that includes a **separate support WhatsApp number** the user can message to contest. Denied users opening a chat with the support number get a human (founder) on the other end — that chat is NOT handled by the bot. The denial message tells the user to include their order ID when they message support.
- No admin UI. Everything runs through email links.

### Transactional emails
- **Resend** as the email service. Free tier (3000 emails/month) is plenty for launch volume.
- All transactional emails sent from `noreply@autmn.app` (need to verify domain DNS in Resend).
- Templates as TypeScript files in [packages/email](../../packages/email) (new package).

---

## 1. Payment flow

### Happy path

```
state = AWAITING_PAYMENT
amount = ₹49 × number_of_styles_picked

[if user.orderCount == 0]
    Skip payment entirely. Order marked isFirstFree=true.
    state → PROCESSING

[else]
    Create Razorpay payment link with:
        amount: amount * 100  // paise
        currency: "INR"
        accept_partial: false
        expire_by: now + 60 minutes
        notes: { order_id: <our_order_id>, phone: <e164_phone> }
        payment_capture: true
        notify: { sms: false, email: false }  // we notify via WhatsApp ourselves
        callback_url: https://api.autmn.app/webhooks/razorpay/payment-complete
        callback_method: "get"
        options: {
            checkout: {
                method: {
                    netbanking: false,
                    card: false,
                    wallet: false,
                    upi: true,
                    paylater: false,
                    emi: false
                }
            }
        }

    Bot sends WhatsApp message:
        "₹{amount} hai. Pay karne ke baad ads ban jayenge.
         {short_link}
         Sirf UPI accept karte hain — GPay, PhonePe, Paytm, BHIM, WhatsApp Pay."

    [User taps link → Razorpay UPI-only page → completes payment]

    Razorpay sends webhook to /webhooks/razorpay → verified via HMAC → order marked paid
    state → PROCESSING
```

### Razorpay UPI page behavior

When `options.checkout.method.upi: true` is the only method enabled, Razorpay's hosted page:
1. Shows UPI app icons (GPay, PhonePe, Paytm, Amazon Pay UPI, WhatsApp Pay, BHIM) at the top.
2. Shows a "UPI ID" input below for manual entry.
3. On mobile, clicking a UPI app icon fires the platform UPI intent that opens the app directly.
4. On desktop, shows a QR code.

This satisfies the "Both — Razorpay page with prominent Open UPI app button" requirement — Razorpay's page already does this natively when restricted to UPI.

### Failure modes
- Payment link expires (60 min) → user retries → new link generated.
- Payment fails on Razorpay side → user sees error on Razorpay page → can retry without new link.
- Webhook missed → worker polls Razorpay every 30s for up to 30 min (existing behavior).
- After 30 min total wait → escape to IDLE with timeout message.

### Code changes
- [packages/payment/src/](../../packages/payment/src/) — modify `createPaymentLink()` to accept `paymentMethods` config and default to UPI-only.
- Update webhook handler at [apps/api/src/routes/webhooks/razorpay.ts](../../apps/api/src/routes/webhooks/razorpay.ts) — no code change, just verify UPI method routes work.
- Add first-free bypass logic in [packages/session/src/handlers/payment.ts](../../packages/session/src/handlers/payment.ts).

---

## 2. Refund flow

### User-facing

```
state = DELIVERED
[User taps "Request refund" button]

[If Order.amountPaise == 0]
    Bot: "Yeh free order tha — koi charge nahi hua. Naya product bhejna chahein?"
    Show single button: "Send new product"
    Stay in DELIVERED.
    END.

[Else]
    state = REFUND_REQUEST
    Bot: "Refund kyun chahiye? Text ya voice note bhej sakte hain."

    [User responds with text and/or voice note]

    Order.refundReason = text
    Order.refundReasonVoiceUrl = voice_url (if voice)
    Order.refundRequestedAt = now
    Order.refundStatus = "pending"

    Bot: "Got it. Within 24 hours hum review karke confirm karenge ✅"

    state → DELIVERED

    [In parallel, server-side]
    Email fires to founder via Resend (see §3).
```

### Server-side (Resend email)

When `Order.refundStatus` is set to "pending":

```
Send email via Resend:
    from: noreply@autmn.app
    to: mayank@autmn.app  // env var ADMIN_EMAIL
    subject: "Refund request: Order #{shortId} — ₹{amount}"
    template: refund-request.tsx
    data: {
        orderId: order.id,
        shortId: order.shortId,
        amount: order.amountPaise / 100,
        userPhone: user.phoneNumber,
        userBrand: user.name,
        deliveredAdsUrls: order.deliveredAds.map(a => signedUrl(a.storageUrl, 7days)),
        refundReason: order.refundReason,
        refundVoiceUrl: order.refundReasonVoiceUrl ? signedUrl(refundVoiceUrl, 7days) : null,
        approveUrl: buildSignedDecisionUrl(order.id, 'approve'),
        denyUrl: buildSignedDecisionUrl(order.id, 'deny'),
    }
```

The email is rendered with the two big buttons:
- ✅ **Approve refund** → opens `https://api.autmn.app/admin/refunds/decide?token=XXX&action=approve`
- ❌ **Deny refund** → opens `https://api.autmn.app/admin/refunds/decide?token=XXX&action=deny`

### Magic link mechanics

```typescript
function buildSignedDecisionUrl(orderId: string, action: 'approve' | 'deny'): string {
    const tokenPayload = { orderId, action, exp: Date.now() + 30 * 86400 * 1000 };
    const token = jwt.sign(tokenPayload, process.env.REFUND_DECISION_SECRET, { algorithm: 'HS256' });
    return `${APP_URL}/admin/refunds/decide?token=${token}`;
}
```

When the URL is clicked:

```typescript
// GET /admin/refunds/decide?token=XXX
1. Verify JWT signature
2. Decode payload → orderId, action
3. Check Order.refundStatus is still "pending" (prevents double-clicks)
4. If already decided, render: "This refund was already {status} on {date}."
5. Otherwise:
   - Mark Order.refundStatus = action ('approved' | 'denied')
   - Mark Order.refundDecidedAt = now
6. If action == 'approve':
   - Call Razorpay refund API: POST /payments/{payment_id}/refund
   - Mark Order.razorpayRefundId
7. Send WhatsApp message to user:
   - Approved: "Refund approved ✅ ₹{amount} returned to original payment method (3-5 business days). Order #{shortId}."
   - Denied: "After review, we cannot process a refund for order #{shortId}.\n\nIf you want to discuss this further, message us at {SUPPORT_PHONE_NUMBER} and mention order #{shortId}. A team member will get back to you."
8. Render success page: "Decision recorded: {action}. User has been notified."
```

### Failure modes
- Token already used → page shows "Already decided" with previous status.
- Token expired (>30 days) → page shows error, founder must re-decide via SQL.
- Razorpay refund API fails on approval → order marked `refundStatus = 'approved'` but `razorpayRefundError` set, alert via Sentry. Founder retries manually.
- WhatsApp message fails → log to Sentry, founder gets a "decision recorded but user not notified" page. Manual followup.

### Anti-abuse considerations for v1
- One refund request per order. Once `refundStatus` is set, additional taps show: *"Refund request already submitted for this order."*
- No way to "cancel" a refund request from the user side. Once submitted, founder decides.
- Magic links signed with HS256 + 30-day expiry. Single-use enforced by `refundStatus != pending` check.

---

## 3. Email templates needed

| Template | Sent when | To |
|---|---|---|
| `refund-request.tsx` | User submits a refund request | Founder (`ADMIN_EMAIL`) |
| `refund-approved-user.tsx` | Approval magic link clicked | User (not used directly — we use WhatsApp for user notification, not email) |
| `refund-denied-user.tsx` | Denial magic link clicked | User (same — WhatsApp, not email) |

For v1 we only need the **founder-facing refund request email**. User notifications stay in WhatsApp. The user-facing email templates above can be deferred; not building them now.

---

## 4. Data model changes

### `Order` (additions on top of [post-onboarding plan §4](./post-onboarding-rebuild-2026.md))
- All refund fields already listed there. Add:
- `shortId String @unique` — 6-character human-readable order ID (e.g., `A3K9X7`) for emails and user-facing references. Generated on order creation.
- `razorpayPaymentId String?` — captured from Razorpay webhook for refund API calls.
- `razorpayRefundId String?` — captured from refund API response.
- `razorpayRefundError String?` — set if refund API fails.

### `RefundDecisionToken` — alternative to JWT
Optional: instead of JWT, persist tokens in DB for stricter single-use enforcement.
```
model RefundDecisionToken {
  id          String   @id @default(uuid()) @db.Uuid
  orderId     String   @db.Uuid
  order       Order    @relation(fields: [orderId], references: [id])
  action      String   // 'approve' | 'deny'
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())

  @@index([orderId])
  @@map("refund_decision_tokens")
}
```

**Recommendation:** start with JWT (simpler). Migrate to DB tokens only if we see token replay attacks or need to revoke.

### Storage
- `refund-reasons` bucket (already in post-onboarding plan).

---

## 5. New packages / dependencies

### `@autmn/email` (new package)
- Wraps Resend SDK.
- Exports: `sendEmail(template, data)`.
- Templates as React Email components (Resend's recommended approach) or simple HTML strings.
- Env var: `RESEND_API_KEY`, `ADMIN_EMAIL`, `APP_URL`.

### Support channel
- **Separate WhatsApp number for support / contested refunds.** Set as env var: `SUPPORT_PHONE_NUMBER` (E.164 format, e.g. `+919876543210`). Referenced in the refund denial WhatsApp message. This number is NOT connected to the Autmn bot — it's a human-monitored line (founder's WhatsApp Business app or personal). Setup is ops-side, not code:
  - Procure a dedicated number for support (or use founder's existing personal WhatsApp).
  - Install WhatsApp Business app on the device, register the number.
  - Add the number to `.env` as `SUPPORT_PHONE_NUMBER`.
  - Document a basic support SLA (e.g., respond within 24h on business days).

### npm dependencies
- `resend` (or `@resend/node`)
- `jsonwebtoken` (or `jose` for ESM-friendly JWT)
- Optionally `react-email` if we want React-based templates

---

## 6. Build phases

These slot into the post-onboarding rebuild sequence (Phases 8-16). The payment changes are part of Phase 12 in that doc; refunds are Phase 15. This doc expands both.

### Phase 12a — UPI-only payment links (½ day)
- Modify `createPaymentLink()` in [packages/payment](../../packages/payment) to accept method restrictions, default to UPI-only.
- Verify Razorpay hosted page shows UPI apps + UPI ID input only.
- Test on a real mobile device with GPay installed — confirm intent fires.

### Phase 12b — First-free bypass (½ day)
- Logic in [packages/session/src/handlers/payment.ts](../../packages/session/src/handlers/payment.ts): `if user.orderCount == 0, skip payment, mark order isFirstFree`.
- Test: new user pays ₹0, second order pays ₹49 × N.

### Phase 15a — Email infrastructure (½ day)
- Create [packages/email](../../packages/email) workspace package.
- Add Resend dependency, verify domain DNS.
- Build `sendEmail()` helper.
- Write `refund-request.tsx` template.
- Test send to founder's email.

### Phase 15b — Refund request flow (1 day)
- New `REFUND_REQUEST` state.
- Reason capture (text + optional voice) handler.
- Voice upload to `refund-reasons` bucket.
- Email send on submission.
- User confirmation message.
- Free-order short-circuit ("no charge to refund — send new product?").
- Test: full refund request submission, founder receives email with working magic links.

### Phase 15c — Magic link decision endpoint (½ day)
- `GET /admin/refunds/decide` route in [apps/api/src/routes/admin/refunds.ts](../../apps/api/src/routes/) (new).
- JWT verification.
- Status idempotency check.
- Razorpay refund API call on approval.
- WhatsApp notification to user.
- Render minimal HTML success/error page.
- Test: click Approve from email → user gets WhatsApp + Razorpay shows refund initiated.

### Phase 15d — Anti-abuse + edge cases (½ day)
- Double-click protection (already covered by status check).
- Expired token handling.
- Failed Razorpay refund → Sentry alert + founder error page with retry hint.
- Failed WhatsApp notification → log, page shows "user not yet notified" warning.

---

## 7. Test gates

| After phase | Test |
|---|---|
| 12a | Real device test: payment link opens UPI-only Razorpay page, GPay intent works |
| 12b | Free first order skips payment screen, second order shows ₹98 (2 styles × ₹49) |
| 15a | Email arrives in founder's inbox with order metadata + working magic links |
| 15b | User submits refund reason, gets confirmation, email fires to founder |
| 15c | Founder clicks Approve in email → user receives WhatsApp + Razorpay refund initiated |
| 15d | Double-clicking same magic link shows "already decided" page |

---

## 8. Risks and unknowns

1. **Razorpay UPI method restriction quirks.** If the UPI Intent Flow doesn't fire on certain Android versions or browsers, users may see "no UPI app found." Test on a few devices before launch.
2. **Resend domain verification.** Requires DNS access for `autmn.app`. SPF + DKIM + DMARC records. Can take 24-48h to propagate. Block this on Day 1 of payment-refund work.
3. **Token leak in email.** If founder's email is forwarded or screenshotted with magic links visible, anyone can click. Mitigation: short-ish expiry (30 days), one-time use enforced by status check. Adding IP allowlist or 2FA on click is overkill for solo founder.
4. **Razorpay refund timing communication.** Refunds take 3-5 business days to credit back. The WhatsApp message clearly states this — users may still ping support before the timeline. Have a canned "still processing" reply ready.
5. **No partial refunds.** If a user is unhappy with 1 of 3 ads, current spec says full refund or nothing. May want partial refund support later — Razorpay supports it natively. Skipping for v1.
6. **Email deliverability.** If refund request emails go to spam, founder misses 24h SLA. Resend has good defaults, but check the inbox on first real email.
7. **₹0 first-free abuse.** As noted in post-onboarding plan §10. Phone numbers are unique but SIMs are cheap. If we see clustering of new accounts from suspicious numbers, may need phone verification (OTP) before order #1.
8. **Support WhatsApp number is human-staffed.** If founder doesn't actually monitor it, the "contest your denial" promise becomes hollow and damages trust worse than not offering it at all. Worth setting up a basic ops process (e.g., daily check-in at fixed times, auto-reply if outside hours) before going live.

---

## 9. Out of scope (and not in plan)

- Partial refunds (refund 1 of N ads).
- Custom denial reasons (free text from founder).
- Refund analytics / dashboard.
- Multiple payment methods (cards, wallets, netbanking, EMI).
- International payments.
- Subscription / recurring payments.
- Invoice generation (need to add for GST compliance once revenue crosses threshold — separate work).
- Promo codes / discounts beyond first-free.
- Wallet credits as refund alternative.

---

## 10. Ready to start?

This work integrates into the post-onboarding rebuild sequence as Phases 12a-b and 15a-d. Approximate total effort: **~3 days** spread across that broader timeline.

Domain DNS setup for Resend should start on Day 1 since it has external propagation delay. Everything else can be built in sequence.
