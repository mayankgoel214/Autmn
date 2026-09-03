# Marquee

WhatsApp-native AI product photography for Indian micro-sellers. (Formerly
named Autmn — the repo, site and copy were renamed; package scopes keep the
historical `@autmn` prefix.)

- Send a photo of your product on WhatsApp. Get a professional ad image back in minutes.
- No app to download. No design skills needed. Works on the phone you already use.
- Rs 99 per image. First order bilkul free.

**Live:** https://marquee-web.vercel.app — the marketing site, deployed as a
portfolio build (orders are not being taken, so the business contact details and
the WhatsApp CTA are disabled there).

**Stack:** TypeScript · pnpm monorepo (3 apps, 10 packages) · Fastify · Next.js 15
· PostgreSQL + Prisma · Redis-backed queue · WhatsApp Cloud API · Gemini 3 Pro
Image / OpenAI / fal.ai / Groq · Razorpay · GitHub Actions

**Run it locally:**

```bash
docker compose up --build     # API, worker, Postgres and Redis
```

API on `:3000`, queue dashboard at `/admin/queues`. Postgres and Redis run in
the compose stack rather than against the hosted Neon and Upstash instances, so
a local run cannot reach production data. Without AI provider keys in `.env` the
services start and serve health, but a generation job fails at the first call.
See [Local Development Setup](#local-development-setup) for running without
Docker.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Environment Variables](#environment-variables)
5. [Local Development Setup](#local-development-setup)
6. [Database Schema](#database-schema)
7. [Session State Machine](#session-state-machine)
8. [AI Pipeline](#ai-pipeline)
9. [Payment Flow](#payment-flow)
10. [Queue Architecture](#queue-architecture)
11. [API Routes](#api-routes)
12. [Deployment](#deployment)
13. [Security](#security)
14. [Testing](#testing)
15. [Project Structure](#project-structure)
16. [Key Decisions](#key-decisions)

---

## Architecture Overview

```
WhatsApp User
     |
     | (HTTP POST)
     v
+--------------------+
|   apps/api         |  Fastify HTTP server
|   (port 3000)      |  - Verifies HMAC signatures
|                    |  - Parses webhook payloads
|                    |  - Runs session state machine
|                    |  - Creates Razorpay payment links
+--------------------+
     |           |
     |           | (BullMQ jobs)
     |           v
     |    +--------------------+
     |    |   Upstash Redis    |  3 queues:
     |    |   (BullMQ broker)  |  image-processing
     |    |                    |  payment-check
     |    |                    |  session-timeout
     |    +--------------------+
     |           |
     |           | (job pickup)
     |           v
     |    +--------------------+
     |    |   apps/worker      |  BullMQ worker process
     |    |                    |  - Runs AI pipeline
     |    |                    |  - Polls Razorpay
     |    |                    |  - Handles session timeouts
     |    +--------------------+
     |           |
     |           | (AI API calls)
     |           v
     |    +--------------------+
     |    |   AI Services      |
     |    |                    |  Gemini 2.5 Flash — analysis + generation
     |    |                    |  fal.ai — BiRefNet, Bria, Seedream, Flux
     |    |                    |  Groq Whisper — voice note transcription
     |    |                    |  Sarvam AI — Hindi transcription fallback
     |    +--------------------+
     |           |
     |           | (upload)
     |           v
     |    +--------------------+
     |    |   Supabase Storage |  Input images, output ads, cutouts, videos
     |    +--------------------+
     |
     | (WhatsApp Cloud API)
     v
WhatsApp User receives ad image + Ken Burns video
```

### Monorepo Structure

```
marquee/
├── apps/
│   ├── api/          @autmn/api    — Fastify HTTP server, webhooks, session routing
│   ├── web/          @autmn/web    — Next.js marketing site (deployed to Vercel)
│   └── worker/       @autmn/worker — BullMQ workers for image, payment, session jobs
└── packages/
    ├── ai/           @autmn/ai     — Full AI image pipeline (generation, QA gates, briefs)
    ├── db/           @autmn/db     — Prisma client + PostgreSQL schema
    ├── email/        @autmn/email  — Resend transport + refund-decision pages
    ├── keypool/      @autmn/keypool — Round-robin API key pool across AI providers
    ├── metrics/      @autmn/metrics — Prometheus metrics for both processes
    ├── payment/      @autmn/payment — Razorpay payment link creation + verification
    ├── queue/        @autmn/queue  — BullMQ queue definitions + Redis connection
    ├── session/      @autmn/session — Conversation state machine + message handlers
    ├── storage/      @autmn/storage — Storage drivers: Supabase, or local disk (STORAGE_DRIVER=local)
    └── whatsapp/     @autmn/whatsapp — WhatsApp Cloud API client + HMAC verification
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | >= 20 |
| Package manager | pnpm (workspaces) | 9.15.0 |
| Language | TypeScript | ^5.7.0 |
| HTTP server | Fastify | ^5.0.0 |
| ORM | Prisma | ~6.6.0 |
| Database | PostgreSQL (Supabase) | — |
| Queue broker | Redis (Upstash) | — |
| Job queue | BullMQ | ^5.0.0 |
| Queue UI | Bull Board | ^6.0.0 |
| File storage | Supabase Storage | — |
| Payments | Razorpay | — |
| AI — image generation | Gemini 2.5 Flash (Image Preview) | — |
| AI — background removal | fal.ai BiRefNet v2 | — |
| AI — product shot | fal.ai Bria | — |
| AI — scene generation | fal.ai Seedream v4.5 | — |
| AI — inpainting | fal.ai Flux Pro Fill | — |
| AI — refinement | fal.ai Flux Kontext | — |
| AI — face restore | fal.ai CodeFormer | — |
| AI — upscaling | fal.ai ESRGAN | — |
| AI — voice transcription | Groq Whisper Turbo | — |
| AI — Hindi transcription | Sarvam AI (fallback) | — |
| Image processing | sharp | — |
| Schema validation | Zod | ^3.23.0 |
| Error monitoring | Sentry | — |
| Dev runner | tsx | ^4.19.0 |
| Logger | Pino (pino-pretty in dev) | — |

---

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (`npm install -g pnpm`)
- **ngrok** (for local webhook testing)

You need accounts with all of these services:

| Service | What it does | Get it |
|---|---|---|
| Supabase | PostgreSQL database + file storage | supabase.com |
| Upstash | Serverless Redis for BullMQ | upstash.com |
| Meta Developer | WhatsApp Cloud API | developers.facebook.com |
| Razorpay | Payment links + webhooks | razorpay.com |
| Google AI Studio | Gemini 2.5 Flash image generation | aistudio.google.com |
| fal.ai | BiRefNet, Bria, Seedream, Flux, etc. | fal.ai |
| Groq | Whisper voice transcription | console.groq.com |
| Sarvam AI | Hindi transcription fallback | sarvam.ai (optional) |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value before running.

### WhatsApp Cloud API

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Yes (prod) | Permanent system user token | Meta Business Suite → System Users |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes (prod) | Phone number ID from Meta dashboard | WhatsApp → API Setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Yes (prod) | WABA ID | Meta Business Suite |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Any string you choose — used to verify webhook URL | You define this |
| `WHATSAPP_APP_SECRET` | Yes (prod) | App secret for HMAC signature verification | Meta App → Settings → Basic |

### AI Services

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `FAL_KEY` | Yes (prod) | fal.ai API key (BiRefNet, Bria, Seedream, Flux) | fal.ai dashboard |
| `GOOGLE_AI_API_KEY` | Yes (prod) | Gemini API key for image generation + analysis | aistudio.google.com |
| `GROQ_API_KEY` | Yes (prod) | Groq Whisper Turbo for voice note transcription | console.groq.com |
| `SARVAM_API_KEY` | Optional | Fallback Hindi transcription | sarvam.ai |

### Razorpay

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `RAZORPAY_KEY_ID` | Yes (prod) | Razorpay public key | Razorpay dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Yes (prod) | Razorpay secret key | Same as above |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (prod) | HMAC secret for webhook verification | Razorpay → Webhooks |

### Supabase

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | Yes | Project URL (`https://xxx.supabase.co`) | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS) | Same as above |
| `DATABASE_URL` | Yes | Postgres connection string (pooled via pgBouncer) | Supabase → Settings → Database |
| `DIRECT_URL` | Yes (migrations) | Direct Postgres URL (no pgBouncer) | Same page — use for `prisma migrate` |

### Redis

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `REDIS_URL` | Yes | Upstash Redis REST URL (or standard `redis://`) | Upstash console |

### App

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | No | `development` or `production` | `development` |
| `PORT` | No | HTTP port for the API server | `3000` |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error` | `info` |
| `APP_URL` | No | Public base URL of the API | `https://your-app.railway.app` |

### Admin and Dev

| Variable | Required | Description |
|---|---|---|
| `ADMIN_SECRET` | Yes (prod) | Secret for admin routes. Generate: `openssl rand -hex 32` |
| `PAYMENT_BYPASS` | Never commit | Set via shell only (`export PAYMENT_BYPASS=true`) to skip Razorpay in dev. Blocked in production. |

### Monitoring

| Variable | Required | Description |
|---|---|---|
| `SENTRY_DSN` | Optional | Sentry DSN for error monitoring |

---

## Local Development Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-org/autmn.git
cd autmn
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Copy environment file

```bash
cp .env.example .env
```

### 4. Fill in environment variables

Open `.env` and fill in every value. For dev, most AI/payment keys can stay as `placeholder` — only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `REDIS_URL` are required to boot.

### 5. Set up Supabase

1. Create a new project at supabase.com.
2. Go to Settings → API. Copy `Project URL` → `SUPABASE_URL`, `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`.
3. Go to Settings → Database. Copy the **Connection string** (Transaction mode / port 6543) → `DATABASE_URL`. Copy the **Direct connection** (port 5432) → `DIRECT_URL`.
4. Create a storage bucket named `autmn` (or whatever name you use) with public read access.

### 6. Set up Upstash Redis

1. Create a free Redis database at upstash.com.
2. Copy the `REDIS_URL` (use the `rediss://` TLS URL).

### 7. Push the database schema

For a fresh dev database (no migration history):

```bash
pnpm db:push
```

For production or when you want migration history:

```bash
pnpm db:migrate
```

To open Prisma Studio and inspect your data:

```bash
pnpm db:studio
```

### 8. Expose your local server with ngrok

WhatsApp requires a public HTTPS URL to send webhooks.

```bash
ngrok http 3000
```

Copy the `https://` forwarding URL (e.g. `https://abc123.ngrok-free.app`).

### 9. Configure the Meta webhook

1. Go to Meta Developer Portal → your App → WhatsApp → Configuration.
2. Set **Webhook URL** to `https://abc123.ngrok-free.app/webhooks/whatsapp`.
3. Set **Verify Token** to the same value as `WHATSAPP_VERIFY_TOKEN` in your `.env`.
4. Click **Verify and Save**. Subscribe to the `messages` field.

### 10. Start the API server (Tab 1)

```bash
pnpm --filter @autmn/api dev
```

Or from the root:

```bash
pnpm dev:api
```

The API starts at `http://localhost:3000`.

### 11. Start the worker (Tab 2)

```bash
pnpm --filter @autmn/worker dev
```

Or from the root:

```bash
pnpm dev:worker
```

### 12. Test the flow

Send "hi" on WhatsApp to your test number. The bot should reply with a language selection prompt.

To skip Razorpay during dev testing:

```bash
export PAYMENT_BYPASS=true
pnpm dev:api
pnpm dev:worker
```

---

## Database Schema

All tables use UUIDs as primary keys and snake_case column names.

### `users`

Stores one record per phone number. Created on first message.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `phone_number` | String (unique) | E.164 format |
| `name` | String? | Collected during onboarding |
| `language` | String | `hi` (default) or `en` |
| `business_type` | String? | Product category chosen by user |
| `style_preference` | String? | Last style explicitly chosen |
| `last_style_used` | String? | Most recent style (may differ from preference) |
| `style_history` | JSON? | Per-style usage counts |
| `order_count` | Int | Total orders placed |
| `total_images` | Int | Total images processed |

### `sessions`

One active session per phone number. Holds conversation state.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `phone_number` | String (unique) | |
| `state` | SessionState enum | Current conversation state |
| `current_order_id` | UUID? | Active order being processed |
| `style_selection` | String? | Style chosen for current order |
| `voice_instructions` | String? | Transcribed voice note instructions |
| `image_media_ids` | String[] | WhatsApp media IDs collected in AWAITING_PHOTO |
| `image_storage_urls` | String[] | Uploaded input images |
| `early_photo_media_id` | String? | Photo sent before reaching AWAITING_PHOTO state |
| `last_user_message_at` | DateTime? | Last activity timestamp |
| `state_entered_at` | DateTime? | When current state was entered (for timeout detection) |
| `csw_expires_at` | DateTime? | Customer Service Window expiry (24h from last message) |

### `orders`

One record per product photography order.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `phone_number` | String | |
| `image_count` | Int | 1–5 images |
| `style` | String? | e.g. `style_lifestyle` |
| `voice_instructions` | String? | Transcribed instructions |
| `input_image_urls` | String[] | Supabase Storage URLs |
| `output_image_urls` | String[] | Generated ad image URLs |
| `cutout_urls` | String[] | BiRefNet cutout URLs |
| `status` | OrderStatus enum | See below |
| `amount` | Int | Price in paise (Rs × 100) |
| `revisions_used` | Int | Edit revisions used (2 free per order) |
| `razorpay_payment_link_id` | String? | |
| `razorpay_payment_link_url` | String? | Short URL sent to user |
| `razorpay_payment_id` | String? | Captured payment ID |
| `qa_best_score` | Float? | Best QA score across all image jobs |
| `qa_attempts` | Int | Total QA attempts |
| `product_category` | String? | e.g. `cat_jewellery` |

**OrderStatus values:** `created` → `payment_pending` → `payment_confirmed` → `processing` → `completed` / `failed` / `refunded`

### `payments`

One record per captured Razorpay payment.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `razorpay_payment_id` | String (unique) | |
| `razorpay_payment_link_id` | String? | |
| `amount` | Int | In paise |
| `currency` | String | `INR` |
| `method` | String? | `upi`, `card`, etc. |
| `status` | PaymentStatus enum | `pending` / `captured` / `failed` / `refunded` |

### `refunds`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `razorpay_refund_id` | String (unique) | |
| `amount` | Int | In paise |
| `status` | String | Razorpay refund status |
| `reason` | String? | |

### `image_jobs`

One record per image within an order. An order with 3 photos creates 3 jobs.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `input_image_url` | String | Supabase Storage URL |
| `output_image_url` | String? | Generated ad URL |
| `cutout_url` | String? | BiRefNet cutout URL |
| `style` | String? | |
| `prompt_used` | String? | Final prompt sent to generation model |
| `pipeline` | JobPipeline enum | `primary`, `fallback`, `bria`, `composite`, etc. |
| `status` | JobStatus enum | `queued` / `processing` / `completed` / `failed` |
| `qa_score` | Float? | Final QA score (0–100) |
| `attempts` | Int | Retry count |
| `max_attempts` | Int | Default 3 |
| `duration_ms` | Int? | Wall-clock time for the job |

### `processed_messages`

Idempotency table. WhatsApp delivers webhooks at-least-once. Every `messageId` is recorded here on first processing. Duplicates are silently dropped.

| Field | Type |
|---|---|
| `message_id` | String PK |
| `processed_at` | DateTime |

### `webhook_events`

Audit log for all incoming webhooks (WhatsApp + Razorpay).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `source` | WebhookSource enum | `whatsapp` or `razorpay` |
| `event_type` | String | e.g. `payment.captured` |
| `external_id` | String? | Razorpay payment ID, WhatsApp message ID |
| `raw_payload` | JSON | Full webhook body |
| `processed` | Boolean | |

### `prompt_templates`

Versioned prompts per style. Supports A/B testing and prompt iteration without code deploys.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `style_id` | String | e.g. `style_lifestyle` |
| `version` | Int | |
| `prompt` | String | |
| `negative_prompt` | String? | |
| `category_overrides` | JSON? | Per-category prompt tweaks |
| `avg_qa_score` | Float? | Tracked across all uses |
| `usage_count` | Int | |
| `active` | Boolean | Only one active version per style |

---

## Session State Machine

Every WhatsApp message passes through `handleIncomingMessage()` in `packages/session/src/machine.ts`. The function reads the current session state from the database and dispatches to the correct handler.

```
                    ┌──────────────────────────────────┐
           "hi"     │                                  │
  ─────────────────>│            IDLE                  │
                    │                                  │
                    └──────────────┬───────────────────┘
                                   │ first message
                                   v
                    ┌──────────────────────────────────┐
                    │         SETUP_LANGUAGE           │ Choose Hindi / English
                    └──────────────┬───────────────────┘
                                   │ language selected
                                   v
                    ┌──────────────────────────────────┐
                    │          SETUP_NAME              │ Enter business/seller name
                    └──────────────┬───────────────────┘
                                   │ name entered
                                   v
                    ┌──────────────────────────────────┐
                    │        SETUP_CATEGORY            │ Pick product category
                    └──────────────┬───────────────────┘
                  (category mapped │ to recommended style)
                                   v
                    ┌──────────────────────────────────┐
                    │         SETUP_STYLE              │ Confirm / change style
                    └──────────────┬───────────────────┘
                                   │ style confirmed
                                   v
                    ┌──────────────────────────────────┐
                    │        AWAITING_PHOTO            │ Send 1–5 product photos
                    └──────────────┬───────────────────┘
                  (45s batch       │ photos received + timeout
                   window)        v
                    ┌──────────────────────────────────┐
                    │       AWAITING_PAYMENT           │ Razorpay link sent
                    └──────────────┬───────────────────┘
                    │  payment     │ payment confirmed
                    │  cancelled   │ (webhook or poll)
                    │  → IDLE      v
                    ┌──────────────────────────────────┐
                    │          PROCESSING              │ Worker running AI pipeline
                    └──────────────┬───────────────────┘
                   (auto-reset     │ jobs complete
                   after 10 min)  v
                    ┌──────────────────────────────────┐
                    │          DELIVERED               │ Ad image + video sent
                    └──────────────┬───────────────────┘
                                   │ user requests edit
                                   v
                    ┌──────────────────────────────────┐
                    │       EDIT_PROCESSING            │ Re-running pipeline
                    └──────────────┬───────────────────┘
                   (auto-reset     │ edit complete
                   after 5 min)   v
                                DELIVERED
```

**State descriptions:**

| State | What happens |
|---|---|
| `IDLE` | New or reset user. Any message triggers onboarding. |
| `SETUP_LANGUAGE` | User picks Hindi or English via buttons. |
| `SETUP_NAME` | User types their name or business name. |
| `SETUP_CATEGORY` | User picks product category from a list (jewellery, food, garment, skincare, candle, bag, general). |
| `SETUP_STYLE` | System recommends a style based on category. User confirms or picks from 8 options. |
| `AWAITING_PHOTO` | User sends photos. A 45-second batch window collects up to 5 images before advancing. Voice notes accepted as styling instructions. |
| `AWAITING_PAYMENT` | Razorpay Payment Link is created and sent. User can resend link or cancel. First order is free (PAYMENT_BYPASS equivalent for order_count == 0). |
| `PROCESSING` | AI pipeline is running. Messages from user receive a "processing, please wait" reply. Auto-recovers to IDLE after 10 minutes. |
| `DELIVERED` | Ad image (and Ken Burns video) delivered. User can ask for edits. 2 free revisions per order. |
| `EDIT_PROCESSING` | Re-run pipeline with updated instructions. Auto-recovers to DELIVERED after 5 minutes. |

**Returning users** skip onboarding (SETUP_LANGUAGE → SETUP_NAME → SETUP_CATEGORY). They jump straight to SETUP_STYLE, with their last style pre-selected.

---

## AI Pipeline

### V3 Pipeline (primary)

V3 is in `packages/ai/src/pipeline/gemini-pipeline-v3.ts`. It generates scroll-stopping ad images, not just clean product shots.

```
Stage 1: Download + Preprocess
  └─ Download input image
  └─ Normalize (resize, square, JPEG conversion)

Stage 2: V3 Creative Concept Analysis (Gemini 2.5 Flash)
  └─ Single API call returns:
       - productName, productCategory
       - heroMoment (the story: "chocolate splash frozen mid-air")
       - emotionalTrigger ("craving", "luxury", "freshness")
       - dynamicElements (specific visual elements to include)
       - creativeBrief (full generation directive)
       - brandElements (logos, text to preserve)
       - hasBranding, brandingConfidence
       - recommendedCanvasFill (0.0–1.0)
       - productPhysicalSize ("tiny" / "small" / "medium" / "large")
       - usable (false if image is not a product photo)

Stage 3: Generate 3 Parallel Candidates (Gemini 2.5 Flash Image Preview)
  └─ 3 calls at temperatures 0.5, 0.8, 1.0
  └─ Gemini picks the best candidate on emotional impact + scroll-stopping power

Stage 4: 3-Layer QA for each candidate
  Layer 0: Deterministic checks (<100ms, zero API cost, via sharp)
    - NCC scene change detection (rejects near-identical to input)
    - Estimated product fill percentage (rejects too small)
    - Blank/blurry output detection
    - Symmetry-based duplicate product detection
    - Auto-crop decorative borders (Gemini sometimes adds frames)
  Layer 1: Focused AI binary checks (~2s, Gemini 2.5 Flash)
    - Product count (exactly 1)
    - Fundamental rendering defects
    - Random text / watermarks
    - Human anatomy errors (when style_with_model)
  Layer 2: AI quality scoring (~3s, Gemini 2.5 Flash)
    - Pass threshold: score >= 60
    - Product fidelity check (for branded products)
    - Issues list → surgical edit prompt on retry

Stage 5: Branding Fix (conditional, Gemini edit)
  └─ Only when product has brand elements (logos, text)
  └─ Corrects garbled branding from generation

Stage 6: Post-processing (sharp, zero API cost)
  └─ Style-aware film grain (1–4 intensity)
  └─ Vignette (0.04–0.14 strength)
  └─ Color temperature shift
  └─ Saturation and contrast
  └─ "AI Generated" label watermark

Stage 7: Upload to Supabase Storage

Stage 8: Ken Burns Video (non-blocking)
  └─ 5-second pan/zoom video from the still image
  └─ Sent alongside the image on WhatsApp
```

**Retry logic:** Failed QA (Layer 0 or Layer 1) generates specific warning text fed into the next attempt's prompt. Up to 4 total attempts (3 parallel + 1 retry).

**Fallback chain:**

```
V3 Gemini Pipeline
  └─ (if all 4 attempts fail QA) → Bria Product Shot (fal.ai)
       └─ (if Bria fails QA) → Studio Shot on white (BiRefNet cutout on white background)
            └─ (if studio shot fails) → Original preprocessed image with AI label
```

### Composite Pipeline (V2, used for specific styles)

`packages/ai/src/pipeline/orchestrator.ts`. Uses branding detection to route between three tracks:

- **Track A (branded products):** Bria Product Shot on scene description → paste real cutout on top
- **Track S (small/flat branded):** Flux Pro Fill inpainting — preserves pixel-perfect product, generates scene around it
- **Track B (unbranded / with model):** Seedream v4.5 full creative generation → Flux Kontext refinement → ESRGAN upscale

---

## Payment Flow

```
1. User confirms photos in AWAITING_PHOTO
   └─ If first order (order_count == 0): FREE — skip payment entirely

2. Order created in DB with amount = 9900 paise (Rs 99 per image)

3. Session transitions to AWAITING_PAYMENT
   └─ Razorpay Payment Link created (30 min expiry)
   └─ Short URL sent to user via WhatsApp CTA button
   └─ PaymentCheck job enqueued with 2-minute delay (backup poll)

4. User pays via UPI, card, net banking, etc.

5a. Razorpay webhook fires → POST /webhooks/razorpay
    └─ HMAC signature verified
    └─ Event logged to webhook_events table
    └─ payment.captured: order updated → PROCESSING
    └─ Image processing jobs enqueued

5b. PaymentCheck worker polls Razorpay (backup if webhook missed)
    └─ Retries up to 5 times
    └─ On confirmed: same flow as 5a

6. Worker processes images → DELIVERED
   └─ Ad image + Ken Burns video sent on WhatsApp

7. User can request edits (2 free)
   └─ Edit revision costs Rs 29 (EDIT_REVISION_PAISE = 2900)
   └─ Separate payment link for paid edits
```

**Pricing constants** (defined in `packages/session/src/types.ts`):

| Constant | Value |
|---|---|
| `PRICE_PER_IMAGE_PAISE` | 9900 (Rs 99) |
| `EDIT_REVISION_PAISE` | 2900 (Rs 29) |
| `MAX_IMAGES_PER_ORDER` | 5 |
| `FREE_REVISIONS_PER_ORDER` | 2 |
| `PAYMENT_CHECK_DELAY_MS` | 120,000 (2 minutes) |

---

## Queue Architecture

Three BullMQ queues, all backed by Upstash Redis. Each queue has its own Redis connection (BullMQ requirement).

### `image-processing`

Processes one image through the full AI pipeline.

| Setting | Value |
|---|---|
| Concurrency | 3 |
| Lock duration | 600,000ms (10 min) — pipeline can take 7+ min |
| Rate limit | 10 jobs per 60 seconds |
| Job data | `orderId`, `imageJobId`, `phoneNumber`, `inputImageUrl`, `style`, `voiceInstructions`, `productCategory` |

### `payment-check`

Polls Razorpay to confirm payment when the webhook was missed or delayed.

| Setting | Value |
|---|---|
| Concurrency | 5 |
| Delay | 2 minutes after payment link creation |
| Retries | 5 attempts |
| Job data | `orderId`, `phoneNumber`, `paymentLinkId`, `attempt` |

### `session-timeout`

Handles conversations that go quiet at specific states (e.g. user abandoned during photo upload).

| Setting | Value |
|---|---|
| Concurrency | 10 |
| Job data | `phoneNumber`, `sessionId`, `expectedState` |

**Bull Board UI** is mounted at `/admin/queues` for monitoring active, waiting, completed, and failed jobs.

---

## API Routes

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe. Returns `{ status: "ok", uptime, timestamp }`. Used by Railway. |
| `GET` | `/health/ready` | Readiness probe. Pings PostgreSQL and Redis. Returns 200 if both ok, 503 if either fails. |

### Webhooks

| Method | Path | Description |
|---|---|---|
| `GET` | `/webhooks/whatsapp` | Meta webhook verification (challenge-response). |
| `POST` | `/webhooks/whatsapp` | Incoming WhatsApp messages. HMAC-verified via `WHATSAPP_APP_SECRET`. Idempotent via `processed_messages` table. |
| `POST` | `/webhooks/razorpay` | Razorpay payment events. HMAC-verified via `RAZORPAY_WEBHOOK_SECRET`. Handles `payment.captured`. |

### Admin

All admin routes require `x-admin-secret` header in production (value must match `ADMIN_SECRET`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/reset/:phone` | Deletes all data for a phone number: sessions, orders, image jobs, payments, storage files. Use for dev testing. |
| `POST` | `/admin/flush-queue/:queueName` | Deletes all Redis keys for a BullMQ queue. Allowed queues: `image-processing`, `payment-check`, `session-timeout`. |
| `GET` | `/admin/queues` | Bull Board queue monitoring UI. |

---

## Deployment

**Today (portfolio build):** the marketing site (`apps/web`) deploys to Vercel
at https://marquee-web.vercel.app. The API and worker are not hosted — running
them requires live WhatsApp Business credentials (Meta business verification)
and a funded Razorpay account, which is exactly what the service being paused
means. The full backend runs locally with `docker compose up --build`, storage
included (local driver), and the Kubernetes manifests under `ops/k8s` are the
deployment shape it ran against a real cluster with.

**When it ran as a business,** the API and worker ran as two services from this
repo (originally Railway):

| Service | Start command | Notes |
|---|---|---|
| API | `node apps/api/dist/index.js` | health at `/health`, port 3000, stateless |
| Worker | `node apps/worker/dist/index.js` | scale by queue depth, not CPU — see `ops/k8s` |

### Build order

The root `build` script builds `@autmn/db` first, then all other packages in parallel. This ensures Prisma Client is generated before any package that imports it.

```bash
pnpm build
# Equivalent to:
# pnpm --filter @autmn/db build
# pnpm --filter '!@autmn/db' -r build
```

### Database migrations

Run migrations before deploying a new version:

```bash
# Push schema without migration history (dev / first deploy)
pnpm db:push

# Generate and apply a named migration (production)
pnpm db:migrate
```

---

## Security

### Webhook HMAC verification

Both webhooks verify the request signature before processing:

- **WhatsApp:** `X-Hub-Signature-256` header verified against `WHATSAPP_APP_SECRET`.
- **Razorpay:** `X-Razorpay-Signature` header verified against `RAZORPAY_WEBHOOK_SECRET`.

Requests with invalid signatures return `403` immediately.

### Admin route protection

In production, all `/admin/*` routes require `x-admin-secret: <ADMIN_SECRET>` header. Missing or wrong secret returns `403`.

In development, admin routes are open (no header required).

### Payment bypass blocked in production

The `PAYMENT_BYPASS=true` flag is checked at startup in both `api` and `worker`. If set in production, the process exits with a fatal error. Never commit this to `.env`.

### CORS disabled

`@fastify/cors` is registered with `{ origin: false }`. The API is an API-only service — no browser clients, no CORS needed.

### Amount never from client

Payment amounts are always read from the database order record. No client-supplied amount is ever trusted.

---

## Testing

### Reset a test user

Deletes all data (session, orders, images, storage files) for a phone number so you can run through the full flow again from scratch.

```bash
# Development
curl -X POST http://localhost:3000/admin/reset/919876543210

# Production (requires admin secret)
curl -X POST https://your-app.railway.app/admin/reset/919876543210 \
  -H "x-admin-secret: your-admin-secret"
```

### Skip payment in dev

```bash
export PAYMENT_BYPASS=true
pnpm dev:api
pnpm dev:worker
```

With this set, the payment step is automatically confirmed without creating a Razorpay link.

### Full flow test checklist

1. Start API and worker.
2. Start ngrok and configure Meta webhook.
3. Send "hi" on WhatsApp.
4. Select language.
5. Enter seller name.
6. Pick product category.
7. Confirm or change style.
8. Send 1–3 product photos.
9. Wait for payment prompt (or auto-confirm with `PAYMENT_BYPASS`).
10. Wait for processed ad image to arrive on WhatsApp.
11. Request an edit.
12. Check `/admin/queues` for job status.
13. Run reset when done: `curl -X POST http://localhost:3000/admin/reset/PHONE`.

### Health checks

```bash
# Liveness
curl http://localhost:3000/health

# Readiness (DB + Redis)
curl http://localhost:3000/health/ready
```

---

## Project Structure

```
autmn/
├── .env.example                    Environment variable template
├── package.json                    Root workspace — scripts and engines
├── pnpm-workspace.yaml             Workspace package paths
├── tsconfig.json                   Root TypeScript config
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts            Server entry point
│   │   │   ├── config.ts           Zod-validated env schema
│   │   │   ├── middleware/
│   │   │   │   └── raw-body.ts     Preserve raw body for HMAC verification
│   │   │   ├── plugins/
│   │   │   │   └── bull-board.ts   Queue monitoring UI setup
│   │   │   └── routes/
│   │   │       ├── health.ts       GET /health, GET /health/ready
│   │   │       ├── admin.ts        POST /admin/reset, POST /admin/flush-queue
│   │   │       └── webhooks/
│   │   │           ├── whatsapp.ts POST /webhooks/whatsapp
│   │   │           └── razorpay.ts POST /webhooks/razorpay
│   │   └── package.json
│   │
│   └── worker/
│       ├── src/
│       │   ├── index.ts            Worker entry point — 3 BullMQ workers
│       │   ├── config.ts           Zod-validated env schema
│       │   └── processors/
│       │       ├── image-processing.ts  Full AI pipeline per image job
│       │       ├── payment-check.ts     Razorpay payment poll
│       │       └── session-timeout.ts   Abandoned session cleanup
│       └── package.json
│
└── packages/
    ├── ai/
    │   └── src/
    │       ├── index.ts
    │       ├── pipeline/
    │       │   ├── gemini-pipeline-v3.ts   V3 creative ad pipeline (primary)
    │       │   ├── orchestrator.ts         V2 composite pipeline (fallback)
    │       │   ├── gemini-generate.ts      Gemini image generation calls
    │       │   ├── gemini-branding-fix.ts  Branding correction pass
    │       │   ├── product-analyzer-v3.ts  V3 creative concept analysis
    │       │   ├── product-analyzer.ts     V2 analysis
    │       │   ├── preprocess.ts           Image normalization + enhancement
    │       │   ├── product-shot.ts         Bria Product Shot wrapper
    │       │   ├── fallback.ts             BiRefNet, Flux, Seedream, post-processing
    │       │   ├── kontext-shot.ts         Flux Kontext refinement
    │       │   └── nano-banana-shot.ts     Nano Banana pipeline
    │       ├── qa/
    │       │   ├── combined-qa.ts          Full QA orchestrator
    │       │   ├── deterministic-checks.ts Layer 0: sharp-based gates
    │       │   ├── focused-checks.ts       Layer 1: binary AI checks
    │       │   ├── assess.ts               Layer 2: AI quality score
    │       │   ├── supervisor.ts           QA supervisor
    │       │   └── output-check.ts         Output validation
    │       ├── prompts/
    │       │   ├── product-analysis.ts
    │       │   ├── quality-assessment.ts
    │       │   ├── ad-prompt-generator.ts
    │       │   ├── instruction-parser.ts
    │       │   ├── product-shot.ts
    │       │   └── output-check.ts
    │       ├── transcription/
    │       │   ├── index.ts                Router: Groq → Sarvam fallback
    │       │   ├── groq-whisper.ts         Groq Whisper Turbo
    │       │   └── sarvam.ts               Sarvam AI Hindi transcription
    │       ├── parsing/
    │       │   └── instructions.ts
    │       └── video/
    │           └── ken-burns.ts            Ken Burns pan/zoom video generation
    │
    ├── db/
    │   ├── prisma/
    │   │   └── schema.prisma       Full PostgreSQL schema
    │   └── src/
    │       ├── client.ts           Prisma client singleton
    │       └── index.ts            Re-exports
    │
    ├── payment/
    │   └── src/
    │       ├── client.ts           Razorpay client singleton
    │       └── types.ts            Payment types
    │
    ├── queue/
    │   └── src/
    │       ├── index.ts            Queue factory functions
    │       └── names.ts            Queue name constants
    │
    ├── session/
    │   └── src/
    │       ├── machine.ts          Main handleIncomingMessage() router
    │       ├── types.ts            State enum, pricing constants, button/list IDs
    │       ├── messages.ts         All WhatsApp message strings (Hindi + English)
    │       ├── db-helpers.ts       Session read/write helpers
    │       ├── logger.ts           Pino logger
    │       └── handlers/
    │           ├── onboarding.ts   IDLE, SETUP_LANGUAGE, SETUP_NAME, SETUP_CATEGORY
    │           ├── style.ts        SETUP_STYLE
    │           ├── images.ts       AWAITING_PHOTO
    │           ├── payment.ts      AWAITING_PAYMENT + onPaymentConfirmed()
    │           ├── delivery.ts     DELIVERED
    │           ├── edit.ts         EDIT_PROCESSING
    │           └── instructions.ts Voice note parsing + free trial trigger
    │
    ├── storage/
    │   └── src/
    │       ├── client.ts           Supabase Storage client
    │       ├── upload.ts           Upload buffer to storage
    │       ├── download.ts         Download URL to buffer
    │       ├── url.ts              Public URL generation
    │       └── index.ts
    │
    └── whatsapp/
        └── src/
            ├── index.ts            WhatsAppClient with all send methods
            ├── webhook.ts          Webhook payload parsing
            ├── signature.ts        HMAC verification
            └── types.ts            WhatsApp API types
```

---

## Key Decisions

### Why WhatsApp only — no web app

Indian micro-sellers (jewellers, home bakers, garment sellers, candle makers) already run their businesses on WhatsApp. A web app means a new habit to form, a new login to remember, and a device that may not have a browser. WhatsApp means zero friction — the customer is already there.

### Why pnpm workspaces

A single repo with shared packages (`@autmn/db`, `@autmn/session`, etc.) means one `pnpm install`, one TypeScript build, one place to update shared types. Alternatives like npm workspaces lack the hoisting performance. Turborepo was considered but adds complexity without meaningful benefit at this repo size.

### Why BullMQ instead of processing inline

AI pipeline calls take 30 seconds to 7 minutes. HTTP request timeouts (especially through ngrok or Railway's proxy) would kill the job mid-run. BullMQ moves the work to a background process, survives request termination, supports retries, and gives a monitoring UI (Bull Board). It also decouples the API server from AI API rate limits.

### Why Gemini 2.5 Flash for image generation

Gemini 2.5 Flash with Image Preview can both analyze and generate in a single model. The V3 pipeline uses it for analysis (Stage 2) and generation (Stage 3). This means one model to manage, one API key, and strong performance on Indic product categories (food, jewellery, textiles) that Western models handle poorly.

### Why 3 parallel candidates in V3

Image generation is non-deterministic. A single generation attempt may produce a safe but uninspired result. Three parallel attempts at temperatures 0.5, 0.8, and 1.0 explore the creative space simultaneously. Gemini then picks the winner on emotional impact rather than technical correctness. This produces bolder, more scroll-stopping ads without increasing total latency (the three calls run in parallel).

### Why free first order

Conversion from "heard about it" to "paying customer" requires zero risk. The first order free removes the price barrier entirely. Users see real output for their real product before spending Rs 1. In testing this dramatically increased repeat orders — users who got free results came back and paid.

### Pricing model

Rs 99 per image. Rs 29 per paid edit revision (2 free revisions included per order). Simple and predictable for sellers who are not used to subscription pricing or credits.
