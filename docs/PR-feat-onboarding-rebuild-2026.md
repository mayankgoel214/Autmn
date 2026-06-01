# feat: onboarding + AI pipeline rebuild (Phases 0–25)

Squashed history: **33 commits**, +15.8K LOC, branch ready for production. Verified with `pnpm typecheck` (11 packages green), `pnpm build` (10 packages green), and `scripts/_run-all-smokes.sh` (24/24 smokes green).

Replaces the entire post-onboarding flow + the AI generation pipeline.

---

## Why this PR exists

Two parallel rebuilds shipped on one branch because they touch the same data contracts and share a state-machine seam:

1. **Post-onboarding rebuild (Phases 0–16)** — rewrites the onboarding + delivery + refund flow to be optional, multi-language, branded, and ₹49-per-output instead of ₹199-flat.
2. **AI pipeline rebuild (Phases 17–24)** — two-track engine: strict segmentation+composite for White Studio, creative generative chain (Gemini Pro → verifier → bounded retry → GPT-image-2 safety net) for everything else.
3. **Post-rebuild closeouts (this session, 2026-05-30 → 2026-05-31)** — V1 compromise resolution + Phase 25.

The full picture lives in two specs:

- [`docs/post-onboarding-rebuild-2026.md`](docs/post-onboarding-rebuild-2026.md)
- [`docs/ai-pipeline-rebuild-2026.md`](docs/ai-pipeline-rebuild-2026.md)

---

## What changed at a glance

### User-facing flow

```
hi → optional language/name/category → AWAITING_PHOTO
     ↓
photo(s) → ₹49 × N pricing → UPI payment → PROCESSING (silent)
     ↓
DELIVERED: images + 5⭐ rating list + [Send new product] [Request refund]
     ↓
refund: reason capture → admin email with magic-link approve/deny → Razorpay
```

### AI engine

```
Worker job: { orderId, styles[], imageBuffers[], userInstructions, brandContext }
   ↓
preprocess → Promise.all(lightAnalyze, creative-brief)
   ↓
For each style (parallel):
  ├─ strict track (White Studio) → BiRefNet cutout → sharp composite → finalize
  └─ creative track
        buildCreativePrompt (hierarchical)
        ↓
        Tier 1 (Gemini Pro, temp 0.3, 3× identity anchoring)
        ↓
        runDeterministicChecks (blur/blank/aspect/severe color drift)
        ├─ catastrophic → Tier 2 (GPT-image-2) safety net
        └─ ok → verifyGeneration (Gemini Flash vision)
              ├─ pass → finalize + upload
              └─ drift → retry Tier 1 ONCE → accept-on-second-drift
        ↓
        alertCostCeilingBreach if order > ₹80
        recordTier2Fire (sliding-window burst tracker)
```

### Observability

- `actualCostInr` Decimal column on Order (per-order rounded cost)
- Per-style log events: `strict_style_complete`, `production_style_complete`, `production_verifier_retry_*`, `production_tier1_defect`, `production_tier2_failed`
- Alert events: `alert.cost_ceiling_breach` (>₹80), `alert.tier2_burst` (3+ in 10 min), `alert.keypool_exhausted`
- All alert events now also route through Sentry (V1 compromise #4 closed this session)

---

## Phase index

### Post-onboarding rebuild

| Phase | Theme | Smoke |
|---|---|---|
| 0 | Init + schema baseline | smoke-pre-phase-8 |
| 1 | Optional onboarding (language → name → category) | smoke-phase-1 |
| 2 | Returning-user menu + Change settings | smoke-phase-2 |
| 3a/3b | Brand-details collection + analyzers | smoke-phase-3 |
| 4 | Brand-details editing (LLM patch) | smoke-phase-4 |
| 5 | BrandContext threads into prompts | smoke-phase-5 |
| 6 | FAQ matcher | smoke-phase-6 |
| 7 | Style picker polish + dedupe | smoke-phase-7 |
| 8 | Order/Session schema expansion + edit-flow removal | smoke-phase-8 |
| 9 | WhatsApp Flows scaffolding (env-gated, dormant) | smoke-phase-9 |
| 10 | "Anything You Want" style | smoke-phase-10 |
| 11 | Position-based instruction mapping | smoke-phase-11 |
| 12 | Dynamic pricing ₹49×N | smoke-phase-12 |
| 13 | Single processing-estimate message | smoke-phase-13 |
| 14 | Delivery menu redesign (5⭐ + next-step) | smoke-phase-14 |
| 15 | Refund flow (reason capture + admin review + Razorpay) | smoke-phase-15 |
| 16 | E2E integration + polish | smoke-phase-16 |

### AI pipeline rebuild

| Phase | Theme | Smoke |
|---|---|---|
| 17 | Pipeline cleanup + env consolidation | regression-only |
| 18 | Hierarchical prompt builder + category rules | smoke-phase-18 |
| 19 | Verifier + retry policy + Order.actualCostInr | smoke-phase-19 |
| 20 | Strict track for White Studio | smoke-phase-20 |
| 21 | Negative extractor + edge-case plumbing | smoke-phase-21 |
| 22 | Brand context owned by prompt-builder | smoke-phase-18 PB6 |
| 23 | Observability alerts | smoke-phase-23 |
| 24 | E2E cost/quality validation + the doc | real-product run |
| 25 | Storage TTL cleanup (DPDP compliance) | smoke-phase-25 |

---

## V1 compromises closed this session (2026-05-30 → 05-31)

The AI-pipeline doc had a "Known V1 compromises" section listing 5 deferred items. 3 were closed this session:

| # | Item | Status | Commit |
|---|---|---|---|
| 1 | Tier 2 fires on any catastrophic, not just safety refusal | **Deferred** — waiting on production data | — |
| 2 | Edge-case flags wired but not auto-populated | ✅ Resolved | `084ba72` |
| 3 | Flux shadow inpainting deferred | **Deferred** — sharp local synth is shipping; layer on if quality demands | — |
| 4 | Sentry SDK not integrated | ✅ Resolved | `e000838` |
| 5 | `style-prompts-v5.ts` still exists | ✅ Resolved | `8de7625` + `14cee1d` + `a1c0750` |

Plus closeout of Phase 25 (Storage TTL cron — DPDP compliance, was on the `docs/CLAUDE-CONTINUE.md` pending list) in `778eada`.

---

## Architecture decisions — DO NOT reverse without strong evidence

| Decision | Why locked |
|---|---|
| Hierarchical prompt > flat sentence | V5 SCHEMA fought Pro's priors. Plan §2 lock |
| Two-track engine (strict + creative) | White Studio at ~₹3-5 vs creative at ~₹13.50 saves 50% on the most common style |
| Per-style Creative Brief LLM | Same style + different product = different ad direction. This is the moat |
| Triple identity anchoring (3× primary as ref) | Fixes Monster-style identity drift |
| `prompt-builder.ts` is the SINGLE source of truth | Phase 22 deletion of `style-prompts-v5.ts` |
| Edge-case flags auto-populated via lightAnalyze in `processImageNeverFail` | Per-style cost +~₹0.10 buys product fidelity addenda |
| Severe color drift hard fail | Catches white-Monster → black-Monster drift |
| Verifier+retry, retry cap 1, accept-on-second-drift | Saves Tier 2 fires; bounded cost |
| `1:1` square aspect locked | Universal WhatsApp / Insta / Facebook |
| Only `style_with_model` may include a person | Hard rule in brief LLM prompt |
| Strict track on cutout failure → fall through to creative | Order always ships something |

---

## Migration notes

- Init migration backfilled at `packages/db/prisma/migrations/20260101000000_init/` covering everything pre-Phase-8
- Phase 8 added 13 Order columns + 3 Session columns
- Phase 14 added `REFUND_REQUEST` SessionState
- Phase 19 added `actualCostInr Decimal(10,2)` on Order (`20260529150000_phase19_actual_cost/`)
- `EDIT_PROCESSING` + `AWAITING_REVISION_PAYMENT` enum values stay (DROP VALUE on enum is destructive in prod) but have no live handlers

---

## Env vars introduced or changed

| Var | Status |
|---|---|
| `GEMINI_API_KEY[S]` | **Canonical** (Phase 17). Legacy `GOOGLE_AI_API_KEY[S]` / `GOOGLE_GENAI_API_KEY` still honoured by keypool altSingulars |
| `GEMINI_IMAGE_MODEL` | **Removed.** Model selection now lives in `production.ts` constants |
| `SENTRY_DSN` | Optional. No-op when unset (V1 compromise #4) |
| `WHATSAPP_FLOWS_ENABLED` / `WHATSAPP_STYLE_PICKER_FLOW_ID` / `WHATSAPP_STYLE_PICKER_FLOW_MODE` | Phase 9 — dormant by default |
| `INCLUDE_BRAND_CONTEXT` | Optional (default true). Kill switch for A/B |
| `BRAND_ANALYSIS_DRY_RUN` | Smoke-only |
| `PAYMENT_BYPASS` | Refuses to start in production |
| `REFUND_DECISION_SECRET`, `ADMIN_EMAIL`, `RESEND_API_KEY` | Phase 15 refund flow |

`.env.example` updated.

---

## Test gates before production rollout

The 24 smoke files cover the deterministic surfaces. The model-dependent surfaces (real Gemini / GPT / fal calls) need a manual end-to-end run before launch:

1. **test-019**: 5 White Studio runs across product types — co-founder approves quality. **Highest-value gate.**
2. **test-020**: negatives respected (no garnish, no model) on food + clothing.
3. **test-021**: brand-context aesthetic differences with/without profile.
4. **test-022**: simulate banned key → keypool rotates automatically.
5. **test-023**: 20 representative orders — avg cost < ₹50, margin floor 65%.
6. **Phase 25 first scheduled run**: watch logs for `storage_cleanup_complete` event with `errors: 0`.

These are operational, not smoke — schedule a 1-day batch run before flipping production traffic.

---

## What still needs doing after this PR merges

From `docs/CLAUDE-CONTINUE.md` pending list and the two V1 compromises that remain deferred:

1. Real WhatsApp Cloud API + Razorpay credentials, then deploy (Vercel for API, Railway for worker)
2. First 5 paid orders to calibrate cost projections
3. V1.3 smart-edit pipeline — pass previous output to Pro on "Make a change" instead of re-rolling from original photo
4. Bulk mode — 30/50/100 photos with Gemini Batch API (50% Pro discount)
5. `scripts/test-production.ts` regression harness — blocked on fixture photos
6. Compromise #1: Tier 2 safety-refusal scoping — revisit if Tier 2 fires too often
7. Compromise #3: Flux shadow inpainting — revisit if strict-track quality demands

---

## Commit history on this branch

```
778eada feat(phase-25): Storage TTL cleanup cron (DPDP compliance)
e000838 feat(monitoring): Sentry transport for alert.* + uncaught errors
b9aade6 docs(ai-pipeline-rebuild): mark compromises #2 + #5 resolved
a1c0750 refactor(phase-22): delete style-prompts-v5.ts
14cee1d refactor(phase-22): migrate buildBetaPrompt / buildRevisionPrompt callers
8de7625 refactor(phase-22): relocate StyleArtDirection + BrandContext to _common/types
084ba72 feat(phase-21): auto-populate Light Analyzer edge-case flags
92f518c chore(verify): typecheck fix + smoke runner
67106da feat(ai-pipeline): Phases 17–24 — two-track pipeline rebuild
91782f7 fix(payments+refunds): plan §1+§2 alignment from last turn
394cc49 feat(payments+refunds): UPI-only links, @autmn/email, magic-link refund decisions
e85aa08 chore(phase-16): polish + end-to-end integration smoke
7bc5ce3 feat(phase-9): WhatsApp Flows scaffolding (env-gated, dormant by default)
cc8cfe2 feat(phase-10,11): Anything-You-Want style + position-based instruction mapping
4f31557 feat(phase-15): refund flow — reason capture + admin review + Razorpay
bde7f2f feat(post-onboarding): Phase 14 - 5⭐ + Send new product + Request refund menu
d2fea7c feat(post-onboarding): Phase 13 - single processing-estimate message
6620a7a feat(post-onboarding): Phase 12 - ₹49 × N dynamic pricing
2f19499 feat(post-onboarding): Phase 8 - data model + edit/revision flow removed
e3b76af chore(pre-phase-8): migration backfill + freemium fix + 0-styles pricing pin
20f440c feat(onboarding): Phase 7 - polish (test-001 leftovers)
4ac9a7e feat(onboarding): Phase 6 - free-form FAQ in IDLE + CHANGE_SETTINGS_MENU
c13f823 feat(onboarding): Phase 5 - inject BrandContext into ad generation prompts
d53f3f2 feat(onboarding): Phase 4 - brand profile view + natural-language edit
1e74933 feat(onboarding): Phase 3b - real brand-analysis pipeline (Gemini + Playwright)
5901269 feat(onboarding): Phase 3a - brand-details capture (state machine + DB)
6be392f feat(onboarding): rebuild Phases 0-2 of the optional, multi-language flow
7ac32e4 fix(delivery): prevent completion message arriving before last image
4542a78 fix(session): deliver exactly the styles selected — no auto-padding to 3
ee4966a fix(session): remove descriptions from style list rows
1b271be chore: remove fluent-ffmpeg dependency from packages/ai
0f96129 feat(ai): production pipeline V1.2.x — creative brief, style prompts, never-fail
22c47dd fix(session): singular/plural style count, remove Done accordion from style picker
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
