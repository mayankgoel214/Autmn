# Go-Live Runbook

The end-to-end checklist for taking Autmn from "merged to `main`" to "accepting real paid orders." Work top to bottom. The two external approvals in Phase 0 are the long poles (days, not minutes) — start them first and let them run in the background while you do everything else.

---

## Phase 0 — Start the slow external approvals (do this first)

These gate everything and can take days. Kick them off before any code/infra work.

- [ ] **Razorpay live activation.** Submit KYC: PAN, bank account, business proof, and GST if applicable. Until this clears you cannot accept money. (`dashboard.razorpay.com` → Account & Settings → Activate.)
- [ ] **Meta WhatsApp business number.** A test number can only message whitelisted recipients. To sell to strangers you need Meta Business verification + an approved phone number on the WhatsApp Business Account. (`business.facebook.com` → Business Settings → Security Center → Start verification.)

---

## Phase 1 — Rotate and provision secrets

The live keys were exposed in chat transcripts. Rotate everything before going live, then load the fresh values into Railway (never `.env` in prod).

- [ ] Rotate WhatsApp access token + app secret (Meta) — see [key-rotation](key-rotation.md) for the AI keys' zero-downtime flow.
- [ ] Rotate Razorpay key id / secret / webhook secret.
- [ ] Rotate Supabase service-role key + database password.
- [ ] Rotate Redis (Upstash) URL/token.
- [ ] Rotate Gemini / OpenAI / Groq keys (3+ Gemini keys recommended — the keypool rotates them).
- [ ] Generate a fresh `ADMIN_SECRET` (`openssl rand -hex 32`) and `REFUND_DECISION_SECRET` (≥32 chars).
- [ ] Confirm `.env`, `cloudflared.exe`, and `tunnel.log` stay gitignored — they must never reach git.

### Required production env vars (set on BOTH `autmn-api` and `autmn-worker` Railway services)

The app **hard-fails at startup** if any of these are still the literal `placeholder` in production (`apps/*/src/config.ts` → `PROD_REQUIRED_SECRETS`). It also hard-fails if `PAYMENT_BYPASS=true` is set in production.

- [ ] `NODE_ENV=production`
- [ ] `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — **`placeholder` here disables HMAC verification.**
- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_CALLBACK_URL`
- [ ] `GEMINI_API_KEY` (or `GEMINI_API_KEYS`), `OPENAI_API_KEY`, `FAL_KEY`, `GROQ_API_KEY`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (pooled, port 6543), `DIRECT_URL` (direct, port 5432 — migrations)
- [ ] `REDIS_URL`
- [ ] `ADMIN_SECRET`
- [ ] `SENTRY_DSN` — **currently empty = error tracking off.** Set it.
- [ ] `RESEND_API_KEY`, `ADMIN_EMAIL`, `REFUND_DECISION_SECRET`, `FROM_EMAIL` (verified domain) — refund flow.
- [ ] `APP_URL` = the live API host (used to build refund magic links).
- [ ] Verify `PAYMENT_BYPASS` is **unset**.

---

## Phase 2 — Provision infrastructure

- [ ] Create the Railway project with two services: `autmn-api` and `autmn-worker` (region `ap-south-1` / Mumbai — already pinned in `railway.toml`).
- [ ] Create the Supabase Storage buckets: `raw-images`, `processed-images`, `cutouts`, `voice-notes`, `refund-reasons`, `brand-assets`.
- [ ] In GitHub repo settings → Secrets, set `RAILWAY_TOKEN_PRODUCTION` and `RAILWAY_TOKEN_STAGING`.
- [ ] (Recommended) Add a GitHub **environment protection rule** on `production` requiring manual approval, so a push to `main` doesn't auto-ship unreviewed.

---

## Phase 3 — Deploy

Migrations run automatically on the API service (`prisma migrate deploy` precedes `node apps/api/dist/index.js` in `apps/api/railway.toml`).

- [ ] Merge the release into `staging` first. CI (`secret-scan` + `check`) must be green, then `deploy-staging` ships it.
- [ ] Smoke-test staging end to end (Phase 5 below) against test credentials.
- [ ] Merge `staging` → `main`. `deploy-production` ships both services.
- [ ] Confirm both services are healthy:
  ```bash
  curl https://<api-host>/health          # { status: "ok" }
  curl https://<api-host>/health/ready     # 200 = DB + Redis reachable
  ```

---

## Phase 4 — Wire webhooks

- [ ] **Meta:** set Webhook URL to `https://<api-host>/webhooks/whatsapp`, Verify Token = `WHATSAPP_VERIFY_TOKEN`, click Verify & Save, subscribe to the `messages` field.
- [ ] **Razorpay:** add webhook `https://<api-host>/webhooks/razorpay` for `payment.captured`, secret = `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Confirm both webhooks land: check the `webhook_events` table after a test event.

---

## Phase 5 — Production smoke test (one real paid order on yourself)

- [ ] Message the live WhatsApp number "hi" → onboarding starts.
- [ ] Complete language → name → category → style.
- [ ] Send 1–2 real product photos.
- [ ] Pay the real Razorpay link with a real UPI payment (small amount).
- [ ] Receive the generated ad image(s) on WhatsApp.
- [ ] Verify `orders.status` = `completed` and a `payments` row exists.
- [ ] Check `/admin/queues` (with `x-admin-secret`) for clean job completion.
- [ ] Trigger a refund request and confirm the founder email arrives (Resend) and the magic link works.

---

## Phase 6 — Legal & customer-facing (required to actually sell)

- [ ] Publish a **privacy policy + terms** URL — both Razorpay and Meta require one.
- [ ] Stand up a minimal landing page with the WhatsApp number / click-to-chat link.
- [ ] Confirm the storage TTL cron is running (DPDP — Phase 25; daily 21:30 UTC). Check worker logs for the `storage-cleanup` job.

---

## Rollback

- **Bad deploy:** Railway → service → Deployments → redeploy the previous good build. Both services restart in seconds; they are stateless.
- **Bad migration:** migrations are forward-only via `prisma migrate deploy`. To revert, ship a new migration that undoes the change — do not hand-edit the DB. Test the down-path on staging first.
- **Webhook misconfig:** Meta/Razorpay both retry failed deliveries; fix the URL/secret and the backlog re-delivers. The `payment-check` queue also polls Razorpay as a backstop, so a briefly-broken Razorpay webhook does not lose payments.

---

## Post-launch watch (first orders)

Tail worker logs for these structured events (see [CLAUDE-CONTINUE](../CLAUDE-CONTINUE.md) for the full table):

- `production_tier2_failed` → both Gemini and OpenAI failed; a refund was triggered. Investigate the input photo.
- `storage_upload_retry` climbing → Supabase instability; self-heals 3× but watch frequency.
- Rising 429s on `/admin/keypool` → add more provider keys ([key-rotation](key-rotation.md)).

> Known scaling limit: the WhatsApp webhook rate limiter is **in-memory** (`apps/api/src/routes/webhooks/whatsapp.ts`). Correct on a single API instance; move it to Redis before scaling the API past one replica.
