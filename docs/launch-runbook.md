# Autmn — Launch Runbook

The definitive step-by-step to take Autmn from "code done" to "live and taking
real orders." Written against the actual repo (Railway + Dockerfiles + CI in
`.github/workflows/ci.yml`). Work top to bottom; the phases are ordered by
dependency.

Status at time of writing: code is launch-grade and verified (full build,
typecheck, 72 unit tests, 27/27 smoke suite); the live Supabase schema is
clean and fully migrated; the website is live with the real WhatsApp number
and legal entity.

Legend: **[Founder]** = only you can do it · **[Tech]** = Claude/engineer can
drive · **[Both]** = needs your account access + technical execution.

---

## Phase 0 — External approvals (START TODAY, long lead, gates everything)

These take days of review and block real traffic. Begin immediately and in
parallel with everything else.

- [ ] **[Founder] Razorpay live activation / KYC** — PAN, bank account, business
  proof, GST (optional). Until this is "Live," no real payment can be captured.
  Note: your entity is **Anshika Jain, Sole Proprietorship** (matches the site).
- [ ] **[Founder] Meta WhatsApp Business verification** — verify the business in
  Meta Business Manager, get the phone number `+91 74395 06526` approved on the
  WhatsApp Cloud API, and (for messaging users who haven't messaged first) move
  the number out of the limited tier. Submit any required message templates.

---

## Phase 1 — Rotate every dev-exposed credential ([Tech] guides, [Founder] holds keys)

During development, secrets were pasted into chat. Rotate ALL of these and use
ONLY the fresh values in production. Do not reuse any dev value.

- [ ] `WHATSAPP_ACCESS_TOKEN` — generate a permanent (System User) token in Meta,
  not the 1-hour dev token.
- [ ] `WHATSAPP_APP_SECRET` — from the Meta app (used for webhook HMAC).
- [ ] `WHATSAPP_VERIFY_TOKEN` — pick a fresh random string; you'll enter the same
  value in the Meta webhook config.
- [ ] `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` — from the **Live** Razorpay
  dashboard (not Test).
- [ ] `RAZORPAY_WEBHOOK_SECRET` — set when you create the webhook (Phase 5).
- [ ] `GOOGLE_AI_API_KEY` — fresh Gemini key on the billed project.
- [ ] `GROQ_API_KEY`, `FAL_KEY`, `SARVAM_API_KEY` — rotate.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — rotate in Supabase (Settings → API).
- [ ] `ADMIN_SECRET` — fresh long random string (guards admin endpoints).
- [ ] `SENTRY_DSN` — create the Sentry project, copy the DSN.

Tip: the app **hard-fails on startup in production if any secret is still the
literal `placeholder`** (verified in `apps/*/src/config.ts`), so a missed value
fails fast rather than silently.

---

## Phase 2 — Supabase production ([Both])

- [ ] Decide: is the current Supabase project (`yptkybppxjhnrzwlfbni`) your
  intended **production** DB, or a dev one?
  - The smoke/test runs wrote test rows to it. If it's prod, clean test data with
    `scripts/truncate-all.ts` (requires `--yes`; preserves webhook_events).
  - If you want a fresh prod project: create it, then the API container runs
    `prisma migrate deploy` automatically on first boot (Dockerfile CMD) — no
    manual migration needed.
- [ ] Create the storage buckets the app uses (see `packages/storage/src/buckets.ts`)
  via `scripts/create-buckets.ts`.
- [ ] Confirm `DATABASE_URL` (pooled) and `DIRECT_URL` for the prod project.

---

## Phase 3 — Railway services ([Both])

The repo already targets Railway services named **`autmn-api`** and
**`autmn-worker`** with **staging** and **production** environments (see
`.github/workflows/ci.yml`). The Dockerfiles are at `apps/api/Dockerfile`
(EXPOSE 3000, runs migrate-deploy then the API) and `apps/worker/Dockerfile`.

- [ ] Create a Railway project; add environments **staging** and **production**.
- [ ] Create service **`autmn-api`** from `apps/api/Dockerfile`.
- [ ] Create service **`autmn-worker`** from `apps/worker/Dockerfile`.
- [ ] Add a **Redis** plugin/service; copy its `REDIS_URL` (BullMQ queue).
- [ ] Generate a **Railway token** and add it to GitHub repo secrets so CI can
  deploy (`RAILWAY_TOKEN`). CI deploys on push to main (production) per
  `ci.yml`.
- [ ] **HARD RULE for launch: run exactly ONE `autmn-worker` instance and ONE
  `autmn-api` instance.** The AI throttle and webhook rate-limiter are in-process
  (documented as post-launch work to make Redis-backed). Do not scale out until
  that's done.

---

## Phase 4 — Set production env vars ([Both])

Set these on BOTH `autmn-api` and `autmn-worker` in the Railway **production**
environment (worker doesn't need the WhatsApp webhook/verify vars but it's fine
to set them everywhere). Values come from Phases 1–3.

```
NODE_ENV=production
LOG_LEVEL=info
PORT=3000                      # api only
APP_URL=https://api.autmn.ai   # api only (used in refund magic links)

# WhatsApp
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_APP_SECRET=...         # api only (webhook HMAC)
WHATSAPP_VERIFY_TOKEN=...       # api only (webhook handshake)

# AI
GOOGLE_AI_API_KEY=...
GROQ_API_KEY=...
FAL_KEY=...
SARVAM_API_KEY=...

# Razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...     # api only

# Data + infra
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...               # pooled
DIRECT_URL=...                 # direct (migrations)
REDIS_URL=...

# Ops
SENTRY_DSN=...
ADMIN_SECRET=...
```

Do NOT set `PAYMENT_BYPASS` in production — it is hard-gated to non-prod, but
leave it unset to be safe.

---

## Phase 5 — Domain + webhooks ([Both])

- [ ] **autmn.ai** → Vercel (the marketing site is already deployed there).
- [ ] **api.autmn.ai** → the Railway `autmn-api` service (custom domain in Railway).
- [ ] **Meta webhook** (WhatsApp): callback URL
  `https://api.autmn.ai/webhooks/whatsapp`, verify token = your
  `WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`. (The GET handler does the
  verification handshake; the POST handler ingests messages.)
- [ ] **Razorpay webhook**: URL `https://api.autmn.ai/webhooks/razorpay`, event
  `payment_link.paid`, secret = your `RAZORPAY_WEBHOOK_SECRET`.

---

## Phase 6 — Ship ([Tech] + [Founder] approval)

- [ ] Final pre-merge check: run `/safety-check` on the branch (reviewer +
  security + qa). The code review already passed twice; this is the last gate.
- [ ] Merge `feat/onboarding-rebuild-2026` → `main`.
- [ ] CI runs (gitleaks → build/typecheck/test → Railway deploy). The API
  container runs `prisma migrate deploy` on boot (schema already in sync, so
  it's a no-op now).
- [ ] Confirm both services are healthy:
  - `GET https://api.autmn.ai/health` → ok
  - `GET https://api.autmn.ai/health/ready` → ok (DB + Redis reachable)

---

## Phase 7 — Go-live validation (the real test)

Do this with a real phone before announcing anything.

- [ ] From a phone, message the WhatsApp number → complete onboarding → send a
  product photo → pick a style → confirm you get a real generated ad back. This
  is the **first free image** (the rule: first order = 1 free image).
- [ ] As a returning user, place a paid order → pay **one real ₹49 UPI payment**
  end-to-end → confirm the ad is delivered and the order shows captured in
  Razorpay.
- [ ] Trigger a refund request from the delivery menu → check the refund email
  arrives → click Approve → confirm the page asks to confirm (POST) and the
  refund issues in Razorpay.
- [ ] Clean up your test user: `POST https://api.autmn.ai/admin/reset/<phone>?confirm=YES`
  with header `x-admin-secret: <ADMIN_SECRET>`.

---

## Phase 8 — Launch content ([Founder])

- [ ] Replace the website's CC0 sample gallery with 5–10 **real** seller
  before/afters once you've collected them.
- [ ] Pick ONE wedge seller category to win first.
- [ ] Pre-launch posts (the doc's ~13-piece plan) + the Instagram→WhatsApp
  click-to-chat bridge.

---

## Rollback

- Railway keeps previous deploys — redeploy the prior image to roll back code.
- DB migrations in this release are additive/nullable only; no destructive
  changes, so a code rollback needs no DB rollback.
- If a money bug appears: the money path is idempotent (no double-charge /
  multiple-free / pay-N-get-2N) and refunds are atomic, but if in doubt, pause
  by scaling `autmn-worker` to 0 (stops processing) while keeping the API up.

---

## Known post-launch follow-ups (non-blocking, by design)

- Make the AI throttle + webhook rate-limiter Redis-backed before running >1
  instance of either service.
- Media-byte webhook durability (download-before-ack) — Meta media URLs expire
  in ~5 min, so a crash can still lose a photo even though the envelope is saved.
- Per-order AI cost ceiling (hard cap, not just the per-image retry cap).
- Schema/dead-column cleanup migration (4 dead tables + unused columns).
- Retention sweep job on `webhook_events` (DPDP).
