# AI pipeline rebuild — 2026 (Phases 17–24)

Single-page summary of the AI pipeline rebuild on branch `feat/onboarding-rebuild-2026`. Pairs with [post-onboarding-rebuild-2026.md](./post-onboarding-rebuild-2026.md) and [runbooks/payments-refunds.md](./runbooks/payments-refunds.md). Built from the plan in this turn's spec.

## What changed (one-liner)

Re-architected the ad-generation engine into a **two-track pipeline**:
- **Strict track** (segmentation + composite) for White Studio — ~₹3-5/style, near-100% identity preservation
- **Creative track** (Gemini Pro → verify → bounded retry → GPT-image-2 on safety refusal) for everything else

Hardened with a hierarchical prompt structure, LLM drift verifier, hard retry cap of 1, per-order cost monitoring, runaway-cost + Tier-2 burst alerts, and a canonical `GEMINI_API_KEY` env var (legacy aliases still honoured).

## Per-style track assignment

| Style ID | Track | Cost |
|---|---|---|
| `style_clean_white` | **strict** | ~₹3-5 (BiRefNet + sharp composite) |
| `style_studio` | creative | ~₹13.50 (Tier 1 pass) |
| `style_lifestyle` | creative | ~₹13.50 |
| `style_outdoor` | creative | ~₹13.50 |
| `style_gradient` | creative | ~₹13.50 |
| `style_festive` | creative | ~₹13.50 |
| `style_with_model` | creative | ~₹13.50 |
| `style_autmn_special` | creative | ~₹13.50 |
| `style_anything_you_want` | creative | ~₹13.50 (user description IS the brief) |

Future marketplace presets (Amazon-ready, Nykaa-ready, Zomato-ready, Shopify-ready, Instagram-ready) land on the strict track post-launch.

## Architecture overview

```
Job arrives at worker: { orderId, styles[], imageBuffers[], userInstructions, brandContext }
    │
    ▼ preprocess (sharp), creative brief (Gemini Flash), instruction parsing
    │
For each style (Promise.all):
  │
  ├─ isStrictStyle(style) === true → STRICT TRACK
  │    BiRefNet cutout → sharp composite (white bg + soft shadow) → finalize
  │    On cutout failure → fall through to creative track
  │
  └─ Otherwise → CREATIVE TRACK
       buildCreativePrompt (hierarchical) → Tier 1 (Gemini Pro)
       ↓
       runDeterministicChecks (blur/blank/aspect/severe color drift)
       ├─ catastrophic → Tier 2 (GPT-image-2) safety net
       └─ ok → verifyGeneration (Gemini Flash vision)
            ├─ pass → finalize + upload
            └─ drift → retry Tier 1 ONCE → verify retry → accept
       ↓
       alertCostCeilingBreach if order > ₹80
       recordTier2Fire (sliding-window burst tracker)
```

## Prompt hierarchy (locked)

`buildCreativePrompt` emits sections in this fixed order — model sees product fidelity before creative direction:

1. **PRIMARY OBJECTIVE** — product faithfulness, brand line
2. **CRITICAL NEGATIVE CONSTRAINTS** — hard list extracted from user text (suppressed when empty)
3. **BRAND CONTEXT** — tagline / vibe / palette / summary from BrandProfile (suppressed when empty)
4. **PRODUCT CATEGORY** — `category-rules.ts` body + Light-Analyzer edge-case addenda
5. **USER INSTRUCTIONS FOR THIS POSITION** — per-position text from instruction mapping (suppressed when empty)
6. **STYLE DIRECTION** — Creative Brief output or default
7. **ASPECT + COMPOSITION** — 1:1 square + identity-anchoring rule

`style_anything_you_want` swaps STYLE DIRECTION for USER-DESCRIBED SCENE (the user's words ARE the direction).

## Phase index

| Phase | Theme | Smoke test |
|---|---|---|
| 17 | Pipeline cleanup + env consolidation | (no new smoke — regression-only) |
| 18 | Hierarchical prompt builder + category rules | smoke-phase-18.ts |
| 19 | Verifier + retry policy + Order.actualCostInr | smoke-phase-19.ts |
| 20 | Strict track for White Studio | smoke-phase-20.ts |
| 21 | Negative extractor + edge-case plumbing | smoke-phase-21.ts |
| 22 | Brand context owned by prompt-builder | (covered by Phase 18 path PB6) |
| 23 | Observability alerts | smoke-phase-23.ts |
| 24 | E2E cost/quality validation + this doc | (real-product run, see §Test gates) |

Total: 7 new smoke files, ~50 assertions on top of the post-onboarding suite.

## Key files added / changed

```
packages/ai/src/
  pipeline/
    prompt-builder.ts        ← NEW. Hierarchical prompt; replaces buildBetaPrompt
    category-rules.ts        ← NEW. Per-category + per-edge-case prompt fragments
    light-analyzer.ts        ← +6 edge-case bool fields on the schema
    production.ts            ← Routes strict styles + verifier + retry + alerts
    _archive/                ← DELETED (7 obsolete files)
  qa/
    verify.ts                ← NEW. Gemini Flash drift detection
  strict/                    ← NEW directory
    types.ts                 ← WHITE_STUDIO_CONFIG
    composite.ts             ← sharp composite + sharp soft shadow
    processor.ts             ← BiRefNet → composite → finalize
    index.ts
  instructions/
    extract-negatives.ts     ← NEW. Regex-based negative extractor (no LLM call)
  monitoring/
    alerts.ts                ← NEW. Cost-ceiling, keypool-exhausted, Tier-2 burst

packages/db/prisma/
  schema.prisma              ← +actualCostInr Decimal(10,2) on Order
  migrations/20260529150000_phase19_actual_cost/

packages/keypool/src/env.ts  ← Canonical GEMINI_API_KEY[S]; legacy aliases as altSingulars

docs/
  ai-pipeline-rebuild-2026.md (this doc)
```

## Env var reference (post-Phase-17)

| Var | Canonical / Legacy | Notes |
|---|---|---|
| `GEMINI_API_KEY` | canonical singular | Required for Tier 1 + all Gemini Flash calls |
| `GEMINI_API_KEYS` | canonical plural | Comma-separated; overrides singular |
| `GOOGLE_AI_API_KEY[S]` | deprecated | Still honoured by keypool altSingulars |
| `GOOGLE_GENAI_API_KEY` | deprecated | Lowest-priority alias |
| `GEMINI_IMAGE_MODEL` | **removed** | Model selection now lives in production.ts constants |
| `OPENAI_API_KEY[S]` | canonical | Required for Tier 2 (GPT-image-2) safety-refusal fallback |
| `FAL_KEY[S]` | canonical | Required for strict track (BiRefNet v2) |

## Reliability + cost guardrails

| Guardrail | Where | Behavior |
|---|---|---|
| Retry cap | `runVerifierWithRetry` in production.ts | 1 Tier-1 retry max; accept-on-second-drift |
| Tier 2 trigger | `processStyleWithChain` catch block | Only on Tier 1 exception (safety refusal). Drift retries Tier 1, not Tier 2 |
| No Tier 2 retry | by design | If Tier 2 fails too → refund |
| Cost ceiling alert | `alertCostCeilingBreach` | Single-order cost > ₹80 → structured warn (Sentry-routable) |
| Tier-2 burst alert | `recordTier2Fire` | ≥3 fires in 10 min sliding window → alert.tier2_burst |
| Strict-track fallback | `processStrictStyle` returns ok:false | Falls through to creative; logged as `strict_to_creative_fallback` |

## Cost summary (per-order, on completion)

`processOrderProduction` emits a structured `production_order_complete` event with per-style costs, total, margin, and counts. The `actualCostInr` column on `Order` records the rounded total (Decimal(10,2)). Worker writes it once on completion.

Per-style log events:
- `strict_style_complete` — strict track succeeded
- `strict_style_fallback` — strict track fell to creative
- `strict_to_creative_fallback` — wrapper-level log
- `production_style_complete` — creative track ok, with attempts + driftScore + acceptedDespiteDrift
- `production_verifier_retry_triggered` — retry kicked in
- `production_verifier_retry_pass` — retry recovered
- `production_verifier_retry_still_drift` — accepted despite drift (hard cap)
- `production_tier1_failed` / `production_tier2_*` — generation failures

## Test gates (plan §§7, 24)

Smoke tests cover the deterministic surfaces. The model-dependent surfaces (real Gemini / GPT / fal calls) need a manual end-to-end run before launch:

1. **test-016 to test-018**: existing pipeline still ships after cleanup; product fidelity improved with hierarchy; verifier triggers on drift, not on pass.
2. **test-019**: 5 White Studio runs across product types — co-founder approves quality. **Highest-value gate.**
3. **test-020**: negatives respected (no garnish, no model) on food + clothing.
4. **test-021**: brand-context aesthetic differences with/without profile.
5. **test-022**: simulate banned key → keypool rotates automatically.
6. **test-023**: 20 representative orders — avg cost < ₹50, margin floor 65% maintained.

These are operational, not smoke — schedule a 1-day batch run before production rollout.

## Known V1 compromises (vs plan)

1. **Tier 2 still fires on deterministic catastrophic, not only safety refusal.** Plan §2 wants Tier 2 reserved for safety refusal; current code falls to Tier 2 on any unrecoverable Tier 1 failure (including blur/blank). Reason: distinguishing safety refusal from other failures requires Gemini error-code inspection that wasn't risk-justified in V1. The verifier+retry sits ON TOP of this; if Tier 1 produced something checkable, Tier 2 never fires. Revisit if Tier 2 fires too often in production.
2. **Edge-case flags hook is wired but not auto-populated.** `processStyleWithChain` accepts an `edgeCaseFlags` param and threads it into the prompt; the worker needs to call `lightAnalyze` upstream and forward the result. Not in V1 (worker change deferred).
3. **Flux shadow inpainting deferred.** Plan §3 lists Flux inpainting as the lighting reconstruction step for the strict track. V1 ships with sharp's local soft-shadow synthesis (deterministic, ₹0, instant). Flux can layer on later if quality demands.
4. **Sentry SDK not integrated.** Alert events emit as structured pino JSON (`event: alert.cost_ceiling_breach`, etc.) — ops routes them via log forwarding for now. Drop in `@sentry/node` later without touching call sites.
5. **style-prompts-v5.ts still exists.** Plan §22 wants it deleted once all callers migrate. `apps/api/src/routes/admin/test.ts` still imports `buildBetaPrompt`; full deletion deferred.

## Where to look when something breaks

| Symptom | Look at |
|---|---|
| White Studio output wrong | `packages/ai/src/strict/processor.ts` + `strict_style_fallback` events |
| Drift on a creative-track style | `production_verifier_retry_*` events, `Order.actualCostInr` field |
| Cost above ₹80 per order | `alert.cost_ceiling_breach` event; runaway Tier-2 fires or retries |
| Gemini outages | `alert.tier2_burst` event (3+ fires in 10 min) |
| Negatives ignored | `extract-negatives.ts` regex coverage; verifier's `negativesViolated` field |
| Edge-case rules not firing | Light Analyzer call site needs to populate the bool fields + thread into ProductionParams |
