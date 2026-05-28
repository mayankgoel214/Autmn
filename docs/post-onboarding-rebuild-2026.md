# Post-onboarding rebuild — 2026 (Phases 0-16)

Single-page summary of the rebuild work on branch `feat/onboarding-rebuild-2026`. Each phase has its own `scripts/smoke-phase-N.ts` test; this doc explains how the pieces fit together.

## What changed (one-liner)

The onboarding + post-onboarding flow was rewritten to be:
- fully optional (skip any onboarding step),
- multi-language (en / hinglish / hi),
- driven by a rich `BrandProfile` + `BrandSummaryVersion` derived from user-supplied assets,
- ₹49 per output ad (was ₹199 flat),
- with a single processing-estimate message instead of progress chatter,
- delivered via a 5-star rating list + next-step menu,
- with a real refund flow (reason capture + admin review + Razorpay refund),
- ready for WhatsApp Flows behind an env gate.

## State machine

```
IDLE ─┬─ "hi" / Generate Ad ─→ (returning users) menu
      ├─ Change settings ─→ CHANGE_SETTINGS_MENU
      └─ Setup tap ─→ SETUP_LANGUAGE → SETUP_NAME → SETUP_CATEGORY
                                                     ↓
                                            SETUP_CATEGORY_OTHER (free-text)
                                                     ↓
                                              SETUP_STYLE
                                                     ↓
                                            AWAITING_PHOTO
                                                     ↓
                                       AWAITING_PAYMENT  (paid orders only)
                                                     ↓
                                              PROCESSING
                                                     ↓
                                              DELIVERED
                                          ┌─ rate_1..5 → stay DELIVERED
                                          ├─ send_new_product → AWAITING_PHOTO
                                          └─ request_refund → REFUND_REQUEST
                                                                  ↓
                                                       (text or voice reason)
                                                                  ↓
                                                          back to DELIVERED

CHANGE_SETTINGS_MENU ─→ BRAND_DETAILS_COLLECTING / BRAND_DETAILS_EDITING
```

`EDIT_PROCESSING` and `AWAITING_REVISION_PAYMENT` remain in the Prisma enum (because `DROP VALUE` on an enum in prod is destructive) but have no live handlers — Phase 8 removed the edit-after-delivery flow wholesale.

## Phase index

| Phase | Theme | Smoke test |
|---|---|---|
| 0  | Init + schema baseline (init migration backfill) | smoke-pre-phase-8.ts |
| 1  | Optional onboarding (language → name → category) | smoke-phase-1.ts |
| 2  | Returning-user menu + Change settings | smoke-phase-2.ts |
| 3a | Brand-details asset collection (text/URL/PDF/voice) | smoke-phase-3.ts |
| 3b | Brand analyzers (image/PDF/website + summary) | covered by smoke-phase-3 |
| 4  | Brand-details editing (LLM patch) | smoke-phase-4.ts |
| 5  | BrandContext threads into prompts | smoke-phase-5.ts |
| 6  | FAQ matcher (price/refund/turnaround) | smoke-phase-6.ts |
| 7  | Style picker polish + dedupe | smoke-phase-7.ts |
| 8  | Order/Session schema expansion + edit-flow removal | smoke-phase-8.ts |
| 9  | WhatsApp Flows scaffolding (env-gated) | smoke-phase-9.ts |
| 10 | "Anything You Want" style | smoke-phase-10.ts |
| 11 | Position-based instruction mapping | smoke-phase-11.ts |
| 12 | Dynamic pricing ₹49×N | smoke-phase-12.ts |
| 13 | Single processing-estimate message | smoke-phase-13.ts |
| 14 | Delivery menu redesign (5⭐ + next-step) | smoke-phase-14.ts |
| 15 | Refund flow (reason capture + admin review + Razorpay) | smoke-phase-15.ts |
| 16 | E2E integration + polish | smoke-phase-16.ts |

Total: 17 smoke tests, ~250 assertions, all green.

## Key files added

- `packages/session/src/handlers/refund.ts` — Phase 15 reason capture
- `packages/session/src/handlers/style-picker-flow.ts` — Phase 9 Flow wrapper
- `packages/session/src/instructions-mapping.ts` — Phase 11 position algorithm
- `packages/session/src/brand-context.ts` — Phase 5 brand fetch
- `packages/ai/src/brand/*.ts` — Phase 3b analyzers
- `packages/whatsapp/src/flows.ts` — Phase 9 JSON builder + response parser
- `apps/api/src/routes/admin.ts` — Phase 15 admin refund routes
- `docs/runbooks/whatsapp-flows.md` — Phase 9 dashboard activation

## Env flags (post-deploy)

| Flag | Default | Effect |
|---|---|---|
| `PAYMENT_BYPASS` | unset | If "true", skips Razorpay and treats every order as free. **Refuses to start in production.** |
| `BRAND_ANALYSIS_DRY_RUN` | unset | If "true", brand-analyzer worker logs the plan but doesn't call LLMs. |
| `INCLUDE_BRAND_CONTEXT` | "true" | Set to "false" to drop brand context from prompts (debug). |
| `WHATSAPP_FLOWS_ENABLED` | unset | Set to "true" to activate Flow style picker (requires Flow ID below). |
| `WHATSAPP_STYLE_PICKER_FLOW_ID` | unset | Flow ID from Meta Business Manager. See `docs/runbooks/whatsapp-flows.md`. |
| `WHATSAPP_STYLE_PICKER_FLOW_MODE` | "published" | "draft" during dashboard testing. |

## Dormant-but-ready pieces

These ship in this branch but are gated off until ops finishes the manual work:

1. **WhatsApp Flows** — env-gated (`WHATSAPP_FLOWS_ENABLED`). Falls back to the legacy list picker when disabled.
2. **Razorpay approval** — admin route `POST /admin/refunds/:orderId/approve` is wired but not exercised in smoke tests because it hits real Razorpay. Verify in sandbox before production.

## Removed (Phase 8 + 15 + 16 cleanup)

- `FEEDBACK_CHANGE`, `FEEDBACK_REDO`, `EDIT_BACKGROUND`, `EDIT_LIGHTING`, `EDIT_STYLE`, `EDIT_CROP`, `EDIT_OTHER`, `REDO_STYLE_0..2`, `CHANGE_SOMETHING` from `ButtonIds`.
- The numbered-text menu (`"1" → Order another, "2" → Save`) from the delivery state.
- `msgRefundComingSoon` (Phase 14 placeholder, replaced by Phase 15 real flow).
- `fluent-ffmpeg` from `@autmn/ai` package deps.

## Migration notes

- Init migration backfilled at `packages/db/prisma/migrations/20260101000000_init/` covering everything pre-Phase-8.
- Phase 8 added 13 Order columns + 3 Session columns.
- Phase 14 added the `REFUND_REQUEST` session state value (`20260528122950_phase14_refund_request_state`).

## Test pattern

Every phase test uses the same harness:
- Mock WhatsApp client with `sendText` / `sendList` / etc. capturing all messages
- Fresh fake phone per run (`919...{timestamp}`)
- Cleanup before + after each path
- Direct dist/ imports (workspace packages aren't symlinked under `scripts/`)
- `clearReturningMenuDedupe()` called in cleanup for tests that reuse phones across paths
