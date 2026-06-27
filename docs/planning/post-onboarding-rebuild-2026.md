# Post-onboarding flow rebuild — plan

**Status:** Approved scope, ready to build (after onboarding rebuild lands).
**Owner:** Mayank
**Built from:** discussion on 2026-05-26, [test-001.md](../testing/test-001.md), [current-state.md](../testing/current-state.md).
**Pairs with:** [onboarding-rebuild-2026.md](./onboarding-rebuild-2026.md) — that plan defines the entry; this one defines everything after.

---

## Goal

Replace the post-onboarding flow (photo → styles → instructions → payment → delivery → feedback) with a cleaner, instruction-aware version that uses WhatsApp Flows for multi-select, maps user instructions accurately to specific styles, and removes the edit/revision flow in favor of a manual refund process.

## Locked decisions

### Pricing
- **₹49 per output ad.** Provisional — business side still being worked out.
- **First-time user: entire first order is free** regardless of how many styles they pick.
- No per-revision charge (revision flow removed).

### Style selection
- **User picks 1-3 styles. Optional — they can pick 0** (system uses Smart Pack default).
- **Multi-select via WhatsApp Flows.** One form, real checkboxes, single submission.
- **New style: "Anything You Want"** — uses ONLY user instructions + brand context, no style template. The only style that can be selected multiple times (up to 3×).
- Current "Custom 🎨" renamed to "Pick your own 🎨".

### Instructions
- Accepted as text or voice (voice → Whisper transcribed).
- **Instruction Mapping Algorithm** runs after style selection — see §3 below.
- Mapping is **position-based**, not style-name-based (so 3× "Anything You Want" with "blue first, red rest" works correctly).
- Model-related instructions ("make the model drink", "person holding", etc.) are scoped to model-supporting styles only (currently `STYLE_WITH_MODEL` + `ANYTHING_YOU_WANT`). They never bleed into non-model styles.

### Payment
- ₹49 × number of output ads (number of styles picked).
- First order for a new user: ₹0 (skip Razorpay, mark order as `bypassed_first_free`).
- Razorpay link generated and sent only if amount > 0.

### Processing message
- **Exactly one message** during PROCESSING state: estimated time range.
- Range format: `"Aapke ads taiyaar ho rahe hain. Approximately X-Y minutes 🎨"` where:
  - `X = ceil(calculated_seconds / 60) + 1`  (always +1 min buffer)
  - `Y = X + 1`
  - `calculated_seconds = 60 + (styles_count × 40) + (photos_count × 10)` (rough heuristic, tuneable from test data)
- No status updates during processing. No progress percentages. Silent until delivery.

### Delivery
- Each ad delivered as a WhatsApp image with caption (style name + position).
- After all delivered: single rating message with 5⭐ buttons + "Send new product" + "Request refund".

### Post-delivery menu
- **5⭐ buttons** — one-tap rating.
- **"Send new product"** button → straight to AWAITING_PHOTO. Saved brand/category/language reused silently.
- **"Request refund"** option → enters REFUND_REQUEST state, captures free-text or voice reason, queues for manual review.
- **Edit / revision flow REMOVED.** No way to revise a delivered ad inline.

### Refund flow
- User taps "Request refund" → bot asks: *"Tell us what went wrong (text or voice)"*.
- User responds → reason stored on `Order.refundReason` + `Order.refundRequestedAt`.
- Bot confirms: *"Got it. Our team will review and reply within 24 hours."*
- Manual review by Mayank (admin route or DB inspection).
- Within 24h, admin marks order `refundStatus = 'approved' | 'denied'`.
- Approval → Razorpay refund triggered + user gets *"Refund approved ✅ ₹X returned to original payment method (3-5 business days)"*.
- Denial → user gets *"After review, we cannot process this refund. [reason]"*.

---

## 1. Flow walkthrough

### Entry: after onboarding completes (new or returning user)

```
[onboarding completes] OR [Send new product tapped]
    ↓
state = AWAITING_PHOTO
    ↓
Bot: "Apne product ki photos bhejein! 1-5 photos, jab ho jaye 'done' bolein."
    ↓
[User sends 1-5 product photos, possibly with voice/caption]
    ↓
[User types 'done' OR sends 5th photo (auto-advance)]
    ↓
state = SETUP_STYLE
    ↓
Bot sends WhatsApp Flow: style picker (multi-select, 1-3)
    ↓
[User submits Flow with 1-3 picks]
    ↓
state = AWAITING_INSTRUCTIONS
    ↓
Bot: "Koi special instructions? Text ya voice note bhej sakte hain. Ya 'skip' likhiye."
    ↓
[User responds with instructions, voice note, or 'skip']
    ↓
[Instruction Mapping Algorithm runs — see §3]
    ↓
state = AWAITING_PAYMENT (or skip if first order = free)
    ↓
[If amount > 0] Bot: Razorpay link + "Pay karne ke baad ads bana denge."
[If amount = 0] Bot: skip directly to processing
    ↓
[Payment confirmed via webhook OR worker poll]
    ↓
state = PROCESSING
    ↓
Bot: "Aapke ads taiyaar ho rahe hain. Approximately X-Y minutes 🎨"
    ↓
[AI pipeline runs — silent during this time]
    ↓
state = DELIVERED
    ↓
Bot sends N ads as images with captions
    ↓
Bot: "Yeh raha aapka ad{s} 🎉" + 3 buttons: ⭐⭐⭐⭐⭐ rating row, Send new product, Request refund
    ↓
[User taps rating] → stored, "Thanks!" + leave menu visible
[User taps Send new product] → state = AWAITING_PHOTO, settings reused
[User taps Request refund] → state = REFUND_REQUEST
```

### Refund sub-flow

```
state = REFUND_REQUEST
    ↓
Bot: "Tell us what went wrong (text or voice)."
    ↓
[User responds]
    ↓
Order.refundReason stored, refundStatus = 'pending'
    ↓
Bot: "Got it. Our team will review and reply within 24 hours."
    ↓
state → DELIVERED (still on the order)
    ↓
[Admin reviews manually within 24h]
    ↓
[Admin approves] → Razorpay refund + WhatsApp notification
[Admin denies] → WhatsApp notification with reason
```

---

## 2. WhatsApp Flows setup

This is a new dependency we don't have today. Need to:

1. **Create the Flow JSON** for style picker. Flow defines:
   - One screen with title "Pick up to 3 styles"
   - A `CheckboxGroup` component with 9 options (8 templates + "Anything You Want")
   - Min selections: 0 (allows skip)
   - Max selections: 3
   - "Anything You Want" specifically marked as `allow_multiple_selection: true` (Flows feature flag — verify availability)
   - Submit button: "Done"
2. **Publish to Meta** — Flows have a draft/publish lifecycle. Approval is typically instant for non-restricted use cases.
3. **Server endpoint to handle Flow responses** — webhook event type `interactive` with sub-type `nfm_reply` (Native Flow Message). Need a handler in [routes/webhooks/whatsapp.ts](../../apps/api/src/routes/webhooks/whatsapp.ts).
4. **Encryption** — Flows require server-side AES-256-GCM encryption for data exchange. Need to generate key pair, store private key as env var.
5. **Fallback** — if Flow message fails to render (rare), drop back to sequential picks (existing behavior).

**Note on "Anything You Want" allowing multiple selections:** If WhatsApp Flows can't enforce per-option multi-pick natively, we handle it in the Flow logic — show 11 rows (8 templates + 3× "Anything You Want" slots labeled "Anything You Want #1", "#2", "#3"). User can tick any combination. Worth verifying with the Meta Flows docs before locking the schema.

---

## 3. The Instruction Mapping Algorithm

This is the most novel and risk-prone part. Detailed spec.

### Input

```typescript
{
  selectedStyles: ["autmn_special", "studio", "dark_luxury"],  // 1-3 entries, positional
  rawInstructions: "make autmn special blue, rest red",        // raw text or voice transcript
  transcriptSource: "text" | "voice",
  productCategory: "jewellery",
  brandSummary: "Joyaa is a modern heritage jewellery brand...", // from brand profile if exists
  lang: "hinglish"
}
```

### Step 1 — LLM parse (Gemini Flash, JSON mode)

```
System prompt:
You are an instruction parser for an AI ad generator. The user has picked N styles (in order, positions 1 to N).
Your job is to read their instructions and assign per-position prompts.

Rules:
- If an instruction mentions a position ("first", "second", "third", "last", "rest"), assign by position
- If an instruction mentions a style name explicitly ("autmn special", "dark luxury"), match by style name
- If an instruction is global ("all of them red"), assign to all positions
- If an instruction mentions "model", "person", "wear", "drink", "hold", "carry" — flag it as model-related
- If an instruction is nonsensical, irrelevant, or contradictory, add to "rejected"

Output JSON ONLY:
{
  "perPosition": [
    { "position": 0, "instructions": string | null, "modelRelated": string[] },
    { "position": 1, "instructions": string | null, "modelRelated": string[] },
    { "position": 2, "instructions": string | null, "modelRelated": string[] }
  ],
  "global": string | null,
  "rejected": string[]
}

User message:
Styles picked (in order):
  Position 0: autmn_special — Autmn's AI creative direction
  Position 1: studio — Colored backdrop studio
  Position 2: dark_luxury — Dramatic dark & cinematic

User instructions:
"make autmn special blue, rest red"
```

### Step 2 — Deterministic safety filter

After LLM returns, walk each position:

```python
MODEL_SUPPORTING_STYLES = {"style_with_model", "anything_you_want"}

for each position p in perPosition:
    if p.modelRelated is not empty:
        style = selectedStyles[p.position]
        if style not in MODEL_SUPPORTING_STYLES:
            # Strip model-related instructions, log to rejected
            rejected.append(f"Position {p.position}: {p.modelRelated} (model instruction not applicable to {style})")
            p.modelRelated = []
```

This is a **hard wall**: even if the LLM tries to be helpful and applies a model instruction broadly, we don't trust it. The filter strips silently.

### Step 3 — Build per-position generation prompts

```python
for each position p:
    style = selectedStyles[p.position]
    user_addition = p.instructions or global

    if style == "anything_you_want":
        prompt = build_free_custom_prompt(
            product_photo=photo,
            brand_summary=brand_summary,
            user_instructions=user_addition or "Default safe prompt: best possible ad for {category}",
            model_instructions=p.modelRelated
        )
    else:
        prompt = build_templated_prompt(
            style_template=STYLE_TEMPLATES[style],
            product_photo=photo,
            brand_summary=brand_summary,
            user_addition=user_addition,
            # model_instructions only included if style supports model
        )

    generation_jobs.append({ position: p.position, style: style, prompt: prompt })
```

### Edge cases the algorithm must handle

| Scenario | Expected behavior |
|---|---|
| Empty instructions | All positions use style template (or brand-default for AYW). No flags raised. |
| `"skip"` typed | Same as empty. |
| Instructions match only 1 style | Other positions get no user additions (NOT spread). |
| Global + per-style instructions | Per-style overrides global for that position. |
| Conflicting instructions ("blue then red") | LLM picks the most recent / most specific; lower-confidence ones in rejected. |
| Pure noise ("i love this product") | All goes to rejected. No instructions applied. |
| Model instruction on non-model style | Stripped silently by deterministic filter. Logged. |
| Model instruction on model style | Applied to that position only. |
| Voice transcript with disfluencies ("um, make the, uh, first one blue") | LLM is robust to this — treat as text after transcription. |
| Mixed language ("autmn special ko blue karo, baaki red") | LLM handles Hinglish fine. |
| User picks 3× "Anything You Want" with instructions like "first luxury, second playful, third minimal" | Position-based mapping: 0=luxury, 1=playful, 2=minimal. |
| User picks 3× "Anything You Want" with no instructions | All 3 use default safe prompt — likely produce 3 similar but slightly varied ads (seed variation). |

### Telemetry / debugging

- Log every LLM input + output (no PII, but the parsed mapping is useful for tuning).
- Track `rejected` reasons — over time, surface "instructions we couldn't apply" so user can resubmit if they want.
- Track `modelRelated` strippings — if this happens often, the LLM parser needs tuning.

### Fallback if LLM call fails

- If Gemini Flash call times out or returns invalid JSON, apply instructions as **global only** to every position (current behavior). Log the failure to Sentry.
- Order proceeds. User gets ads, may not be exactly what they asked for but not blocked.

---

## 4. Data model changes

### `Order` (existing — add columns)
- `numStylesPicked Int` — 1, 2, or 3 (or 0 for default Smart Pack)
- `amountPaise Int` — final amount in paise (₹49 × n). 0 for free first order.
- `isFirstFree Boolean @default(false)` — flag for the bypassed first order.
- `instructionMappingJson Json?` — the full parse output from the algorithm. For debugging and refund review.
- `refundReason String? @db.Text`
- `refundReasonVoiceUrl String?` — Supabase Storage URL if voice
- `refundRequestedAt DateTime?`
- `refundStatus String?` — `'pending' | 'approved' | 'denied' | null`
- `refundDecidedAt DateTime?`
- `refundDecisionNote String?`
- `rating Int?` — 1 to 5
- `ratedAt DateTime?`

### `Session` (existing — add columns)
- `pendingInstructions String? @db.Text` — collected during AWAITING_INSTRUCTIONS, before payment.
- `pendingInstructionsVoiceUrl String?`
- `pendingMapping Json?` — output of the instruction mapper, cached before payment confirms.

### Storage
- New bucket: `refund-reasons` (private, audio files).

---

## 5. State machine changes

### New states
- `AWAITING_INSTRUCTIONS` — after style picker, before payment.
- `REFUND_REQUEST` — collecting refund reason after delivery.

### Modified states
- `SETUP_STYLE` — now uses WhatsApp Flow for picker. Handler simplified to handle the Flow `nfm_reply` event.
- `DELIVERED` — feedback menu changes (5⭐ + Send new product + Request refund). Edit option removed.
- `AWAITING_PAYMENT` — handler unchanged but `bypass on first_free order` logic added.

### Removed states
- `EDIT_PROCESSING` — gone with edit flow.
- `AWAITING_REVISION_PAYMENT` — gone with edit flow.

### Removed handlers
- [handlers/edit.ts](../../packages/session/src/handlers/edit.ts) — delete entirely.
- Edit-related buttons in [types.ts](../../packages/session/src/types.ts) `ButtonIds.EDIT_*` — delete.

---

## 6. Touchpoints (files that change)

| Concern | Files |
|---|---|
| State machine | [packages/session/src/machine.ts](../../packages/session/src/machine.ts), [packages/session/src/types.ts](../../packages/session/src/types.ts) |
| Style picker via Flows | [packages/whatsapp/](../../packages/whatsapp/) (new Flow client), new [packages/session/src/handlers/style.ts](../../packages/session/src/handlers/style.ts) (rewrite), new [apps/api/src/routes/webhooks/whatsapp.ts](../../apps/api/src/routes/webhooks/whatsapp.ts) handler for `nfm_reply` |
| Instruction mapper | new `packages/ai/src/instructions/mapper.ts` |
| Pipeline integration | [packages/ai/src/pipeline/](../../packages/ai/src/pipeline/) — read mapping output, build per-position prompts |
| New "Anything You Want" style | new `packages/ai/src/styles/anything-you-want.ts`, registered in style index |
| Payment | [packages/payment/](../../packages/payment/) — first-free bypass logic, dynamic amount calc |
| Processing message | [packages/session/src/handlers/payment.ts](../../packages/session/src/handlers/payment.ts) — single message on PROCESSING transition |
| Delivery feedback | [packages/session/src/handlers/delivery.ts](../../packages/session/src/handlers/delivery.ts) — new menu, remove edit |
| Refund flow | [packages/session/src/handlers/refund.ts](../../packages/session/src/handlers/refund.ts) (new) |
| Edit removal | delete [packages/session/src/handlers/edit.ts](../../packages/session/src/handlers/edit.ts), remove dispatch in machine.ts |
| Schema | [packages/db/prisma/schema.prisma](../../packages/db/prisma/schema.prisma) — Order + Session columns, new bucket |
| Admin / refund review | new admin route in [apps/api/src/routes/](../../apps/api/src/routes/) (or just SQL for v1) |

---

## 7. Build phases

Numbered to continue from onboarding-rebuild-2026.md (which is Phases 0-7).

### Phase 8 — Data + edit removal (foundation)
**Effort:** ½ day
- Add Order/Session columns from §4.
- Drop edit handler, edit states, edit button IDs.
- Update machine.ts dispatcher.
- Smoke test: existing flow still works through delivery without edit option.

### Phase 9 — WhatsApp Flow for style picker
**Effort:** 1-2 days
- Generate Meta Flow JSON for multi-select picker.
- Publish to Meta dashboard, test the embedded form on real WhatsApp.
- Add encryption (AES-256-GCM key pair).
- Webhook handler for `nfm_reply`.
- Sequential-pick fallback if Flow fails.
- Test: pick 0, 1, 2, 3 styles; pick "Anything You Want" 1×, 2×, 3×.

### Phase 10 — "Anything You Want" style
**Effort:** 1 day
- New style entry in style index + Flow rows.
- New pipeline path in `packages/ai/src/styles/anything-you-want.ts`.
- Default safe prompt for when no instructions provided.
- Test: AYW with rich instructions, AYW with empty instructions, 3× AYW.

### Phase 11 — Instruction mapping algorithm
**Effort:** 2-3 days
- Build `packages/ai/src/instructions/mapper.ts`.
- LLM parser with JSON output schema.
- Deterministic model-safety filter.
- Per-position prompt builder.
- Wire into pipeline.
- Unit tests for every edge case in §3 table.
- Integration test: real WhatsApp test, "blue first, red rest" scenario, verify mapping output.

### Phase 12 — Payment + first-free bypass
**Effort:** ½ day
- Dynamic amount calc (₹49 × N).
- First-order detection: `if user.orderCount == 0: skip payment`.
- Mark `isFirstFree` on order.
- Test: first order free, second order paid.

### Phase 13 — Processing message simplification
**Effort:** ½ day
- Single message on PROCESSING transition with dynamic range.
- Strip all intermediate status messages from pipeline.
- Test: verify silence between processing-start and delivery.

### Phase 14 — Delivery feedback redesign
**Effort:** 1 day
- New menu: 5⭐ buttons + Send new product + Request refund.
- Rating storage on Order.
- "Send new product" → AWAITING_PHOTO with saved context.
- Remove edit-related buttons and copy.
- Test: each menu option lands correctly.

### Phase 15 — Refund request flow
**Effort:** 1 day
- New `REFUND_REQUEST` state.
- Reason capture (text + optional voice).
- Storage of voice to `refund-reasons` bucket.
- Confirmation message + transition back to DELIVERED.
- Admin route: list pending refunds + approve/deny (or just SQL helpers for v1).
- Razorpay refund integration on approval.
- Notification to user on decision.
- Test: full refund cycle (request → approve → user notified).

### Phase 16 — Polish + integration test
**Effort:** ½ day
- Run full end-to-end: onboarding → photo → 3 styles → instructions → free first order → delivery → rating + new product.
- Log to test-NNN.md.
- Fix anything that fell out.

---

## 8. Test gates

| After phase | Test |
|---|---|
| 9 | test-009 — Flow picker works for all combinations including 3× AYW |
| 10 | test-010 — AYW with rich instructions produces wildly different output vs templated styles |
| 11 | test-011 — instruction mapping edge case battery (10 scenarios from §3) |
| 12 | test-012 — first order shows ₹0, second shows ₹49 × N |
| 14 | test-013 — rating + Send new product + Request refund all wired correctly |
| 15 | test-014 — refund request → admin approves → user notified end-to-end |
| 16 | test-015 — full happy path from onboarding to second order |

---

## 9. Out of scope (and not in plan)

- **Edit / revision flow** — removed entirely per decision.
- **Refund auto-approval** — all refunds are manual for v1. Worth automating common cases later.
- **Analytics / funnel tracking** — still deferred to ops hardening phase.
- **Multi-product orders** — one product per order. If user wants different products, they "Send new product" between orders.
- **Style favoriting / saved templates** — not built. Could be a v2 nice-to-have.
- **A/B testing infrastructure** — not built. Useful for optimizing the instruction mapper prompt over time.

---

## 10. Risks and unknowns

1. **WhatsApp Flow "allow multiple selection per option"** — verify this is supported. If not, we fall back to showing AYW as 3 distinct rows (#1, #2, #3) in the Flow.
2. **Instruction mapper LLM quality** — Gemini Flash is fast and cheap but might misparse complex Hinglish. Plan calls for the deterministic safety filter as a hard wall; we may need to upgrade to Gemini Pro or Claude Haiku if quality is poor.
3. **Free first-order abuse** — bad actors could create multiple accounts to get unlimited free orders. Phone numbers are the unique identity but anyone can spin up SIMs. Worth tracking and possibly adding phone verification later.
4. **Refund volume** — manual review doesn't scale past ~20-50 refund requests/day comfortably for a solo founder. Build admin UI before that volume hits.
5. **Razorpay refund timing** — refunds take 3-5 business days to reach the customer. Make sure messaging is clear about this so users don't panic.
6. **Processing time variance** — if a generation takes 6 minutes instead of 3, we've under-promised. The `+1 min buffer` should handle ~80% of cases; if not, bump the heuristic.
7. **No edit flow means more refund pressure** — without inline revisions, unhappy users only path is refund. Watch refund rate as a leading indicator of quality issues.

---

## 11. Ready to start?

Phase 8 (data + edit removal) can start immediately after onboarding rebuild Phase 0 lands — they don't conflict. Phase 9-11 (Flows + AYW + instruction mapper) are the bulk of new code. Phases 12-15 are smaller bolt-ons.

Total estimated effort: **~8-10 working days** on top of the onboarding rebuild's 8-10 days.

If we want to launch sooner, the **cheapest cuts** would be:
- Skip Phase 9 (Flows), keep sequential picker → saves 1-2 days, worse UX
- Skip Phase 15 (refund automation), do refunds 100% manually via SQL + WhatsApp → saves 1 day

Sign off on the plan and we can start.
