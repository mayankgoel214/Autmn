# Branch review — feat/onboarding-rebuild-2026

**Date:** 2026-06-22
**Reviewer:** Claude (with Mayank)
**Branch:** `feat/onboarding-rebuild-2026` @ 35e755c
**Context:** Co-founder (AI-assisted) implemented the entire roadmap from the 4 planning docs across Phases 0–25. This is an independent verification of the PR's claims before merge.

## Verdict

**Strong branch, but NOT "all green" as the PR body claims.** Builds cleanly, typechecks cleanly *after a build*, most smokes pass — but at least one smoke fails on a fresh run, exposing a real spec gap. Needs the gaps below closed before merge to main.

## Verification results (independently run)

| Check | PR claim | Actual result |
|---|---|---|
| `pnpm build` | 10 packages green | ✅ Confirmed green |
| `pnpm typecheck` | 11 packages green | ⚠️ **Fails on fresh checkout** (stale `dist/`); **passes after `pnpm build`**. Build-order dependency — typecheck doesn't trigger the dependency build. |
| Smoke phase 1 (onboarding) | green | ❌ **FAIL — 2 assertions** (Hinglish picker) |
| Smoke phase 11 (instruction mapping) | green | ✅ PASS |
| Smoke phase 19 (verifier + cost) | green | ✅ PASS (`actualCostInr` round-trips at 44.93) |
| DB schema applied | — | ✅ Real Supabase has all new columns/enum values |

## Confirmed implemented (verified by code read)

- **Two-track AI pipeline**: strict (`packages/ai/src/strict/`) for White Studio, creative (`packages/ai/src/pipeline/production.ts`) for the rest. ✅
- **Verifier + bounded retry**: `packages/ai/src/qa/verify.ts`, drift threshold 30, max 1 retry, accept-on-second-drift. ✅
- **Hierarchical prompt builder**: `packages/ai/src/pipeline/prompt-builder.ts`; `style-prompts-v5.ts` deleted; `category-rules.ts` with 10 categories + edge-case flags. ✅
- **`_archive/` deleted.** ✅
- **State machine**: edit/revision flow removed (enum values retained for stale rows, no handlers); REFUND_REQUEST, CHANGE_SETTINGS_MENU, BRAND_DETAILS_* added. ✅
- **Refund flow**: reason capture (text+voice), JWT magic-link approve/deny, free-order short-circuit. ✅
- **Brand details**: multi-format capture (image/PDF/text/website), async analysis worker, natural-language editing. ✅
- **Delivery**: 5⭐ + Send new product + Request refund; edit removed. ✅

## Gaps / discrepancies found

### 1. Hinglish missing from language picker (real bug — smoke-1 fails)
- Plan locked a **3-button** picker: Hindi / English / Hinglish, with text fallback.
- Implementation sends **only 2 buttons** (`lang_en`, `lang_hi`). Hinglish exists in the button-id enum and the text-fallback parser, but no button is rendered.
- WhatsApp supports 3 buttons, so this is a quick fix in `onboarding.ts` (~line 297) and `change-settings.ts` (~line 104).
- **Smoke-phase-1 correctly fails on this.** PR's "24/24 green" is inaccurate.

### 2. "Anything You Want" not pickable multiple times (spec gap)
- We locked: AYW is the one style selectable up to 3×.
- Implementation filters out any already-picked style, including AYW (`onboarding.ts` ~line 686). No exception for AYW.
- Only matters in the sequential picker; the Flows picker (dormant) may handle differently.

### 3. Per-order cost recording may not reach the worker path (needs verification)
- `processOrderProduction` computes + the phase-19 smoke confirms `actualCostInr` round-trips.
- BUT the worker uses `processImageNeverFail` (per-style wrapper) whose `NeverFailResult` reportedly omits cost fields — so the live order path may not persist cost even though the batch function does.
- **Action:** trace `apps/worker/src/processors/image-processing.ts` and confirm whether `Order.actualCostInr` is written on real orders.

### 4. Model-instruction safety filter is permissive, not a hard wall
- Plan called for a **deterministic** filter so model instructions ("make the model drink it") never leak into non-model styles.
- Implementation auto-promotes to `style_with_model` when model keywords are detected, but there's **no deterministic gate** stripping model instructions from non-model style prompts — relies on the downstream LLM prompt. This is the exact failure mode the co-founder reported.
- **Action:** add the deterministic strip described in pipeline-rebuild plan §3 / post-onboarding §3 Step 2.

### 5. Refund denial → support number message not found in session handlers
- The denial path lives in the magic-link endpoint; the user-facing "contest via support number" WhatsApp message wasn't located in session handlers. Verify it fires from the admin/refund decision route and that `SUPPORT_PHONE_NUMBER` is wired.

## Deferred items the PR itself flags (acceptable for now)

- Tier 2 fires on any catastrophic defect, not only safety refusal (waiting on prod data).
- Flux shadow inpainting deferred — strict track uses sharp local shadow synthesis.
- WhatsApp Flows scaffolded but **dormant** (`WHATSAPP_FLOWS_ENABLED=false`) — launch uses sequential picker.

## Recommended pre-merge checklist

- [ ] Fix #1 (Hinglish 3rd button) — makes smoke-1 green.
- [ ] Fix #2 (AYW repeatable) or consciously defer with a note.
- [ ] Verify #3 (cost recording on the live worker path).
- [ ] Implement #4 (deterministic model-instruction filter) — co-founder's reported bug.
- [ ] Verify #5 (denial → support number message).
- [ ] Re-run all 23 smokes, confirm genuinely green.
- [ ] Then the 6 model-dependent manual gates (test-019..023 + Phase 25 cron) before production traffic.

## Note on the build-order gotcha

`pnpm typecheck` and `pnpm dev` both fail on a fresh checkout because dependent packages' `dist/` (and the Prisma client) aren't built. **Always run `pnpm build` first.** This has bitten twice now. Worth adding a `prebuild`/`pretypecheck` hook or documenting in the README so it doesn't read as "the branch is broken."
