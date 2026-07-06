# Autmn — Final Test Guide (for the deep pre-launch test)

Everything code-side is done, merged to `main`, and verified green (build,
typecheck, 72 unit tests, full smoke suite, one real end-to-end AI generation).
This is the recipe to reproduce that verification from a fresh pull and then go
deeper.

## 0. Pull and build (order matters)

```bash
git checkout main && git pull
pnpm install
pnpm build          # REQUIRED before anything else — see note below
pnpm typecheck
pnpm test           # unit tests (72; AI-key tests self-skip without keys)
```

> **Why `pnpm build` first:** typecheck, the apps, and every smoke script
> resolve workspace packages (`@autmn/db`, `@autmn/session`, ...) from their
> built `dist/`. On a fresh pull those are stale or missing, so skipping the
> build produces false "missing export / unknown column" errors. Also: if you
> edit a package's source while testing, rebuild that package before re-running
> its smoke, or the smoke silently tests the old code.

## 1. Environment

Copy `.env.example` → `.env` in the repo root and fill it. The smokes need at
minimum `DATABASE_URL` (plus the Supabase/Redis vars for specific phases). The
shared dev DB is already migrated: `prisma migrate status` should say
"Database schema is up to date!" — if it doesn't, stop and check which DB you
are pointed at.

## 2. Integration smoke suite (free — AI calls are mocked)

```bash
bash scripts/_run-all-smokes.sh
```

23 scripts, ~15-25 min, sequential (they truncate shared test rows — do not run
two at once). All 23 pass at the merge commit. Each prints PASS/FAIL with the
failing assertion if any.

Heads-up on two rules the tests encode (they are business rules, not bugs):
- **First order = exactly ONE free image.** `orderCount: 0` always produces a
  single free image. To exercise the paid multi-style path, seed the test user
  with `orderCount: 1`.
- **Refund magic link is GET = confirm page, POST = apply.** A GET never
  mutates (email scanners prefetch GETs); the decision fires on POST only.

## 3. The real-AI end-to-end (spends money — run deliberately)

Each tier-1 generation costs ~Rs 13-15. One real order with 1 style is the
canonical test:

1. Start the apps locally (two terminals):
   `pnpm --filter @autmn/api dev` and `pnpm --filter @autmn/worker dev`
   (the root `pnpm dev` script is broken — use the per-app commands).
2. Drive one order end to end from a test WhatsApp number (or run
   `scripts/internal-flow-test.mjs` with the worker up): photo → styles →
   instructions → free first order → generated image delivered.
3. Verify in the DB afterwards: the order is `completed`, `outputImageUrls`
   has exactly one URL per style, and `actual_cost_inr` is populated (cost
   recording is wired through the completion claim — a re-delivered job must
   NOT double it).
4. Reset your test number when done:
   `POST /admin/reset/<phone>?confirm=YES` with header `x-admin-secret`.

## 4. What to probe in a deep test (the risky seams)

- **Duplicate webhook delivery:** send the same message envelope twice — one
  order, one ack (idempotency: processed-message mark + deterministic BullMQ
  job ids + payment P2002 guard).
- **Free-order race:** two rapid first messages from a brand-new number must
  yield exactly one `isFirstFree: true` order (atomic claim in a transaction).
- **Refund double-click:** two rapid POSTs on the decide link must issue at
  most one Razorpay refund (atomic status claim; `issuance_pending` sentinel
  detects a crash mid-issue).
- **Transient failure path:** a flaky generation retries with backoff inside a
  45-min window, capped at 8 real retries, then refund-routes. Permanent
  errors (quota exhausted, safety block) refund immediately.
- **Partial success:** 2 styles where 1 fails → the good image is delivered,
  the count message says 1, the failed style is acknowledged.

## 5. Known state / not part of this test

- **Deployment is not done** (Railway, prod secrets, domain, Meta webhook
  wiring). CI's `deploy-production` job on `main` will show a red X until
  `RAILWAY_TOKEN_PRODUCTION` exists — the build/test/gitleaks jobs are the
  signal, the deploy job is expected to fail for now.
- Business/ops items (Meta verification, legal-address update on the site,
  credential rotation) are tracked in `docs/launch-runbook.md` and are being
  handled separately — not code, not part of this test.
- Post-launch backlog (deliberate deferrals): dead-table/schema cleanup
  migration, Redis-backed rate limiter before scaling past 1 instance,
  media-byte webhook durability, per-order cost ceiling.
