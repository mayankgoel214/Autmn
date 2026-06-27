# Current UX + edge case audit

What's actually shipped today, anchored to [test-001.md](test-001.md) and the code.

---

## 1. The current UX as a user experiences it

### First-time user (new phone number)

| Step | What user sees | Where it lives |
|---|---|---|
| User texts anything (e.g. "hi") | `Namaste! Autmn mein aapka swagat hai 🙏 Aapka brand naam aur aap kya bechte hain — jaise: Riya Boutique, Jewellery` | [onboarding.ts:222-226](../../packages/session/src/handlers/onboarding.ts:222) |
| Implicit step | Bot auto-detects language from that first message (no language picker shown) | [onboarding.ts:217](../../packages/session/src/handlers/onboarding.ts:217) |
| User types `Joyaa, Jewellery` | Parsed: brand=Joyaa, category=cat_jewellery. Bot saves both, sends *"Ab apne product ki photos bhejein!"* | [onboarding.ts:283-336](../../packages/session/src/handlers/onboarding.ts:283) |
| User types just `Joyaa` | Brand saved, sent to category picker (list of 7 hardcoded categories, no "Other" free-text) | [onboarding.ts:381-410](../../packages/session/src/handlers/onboarding.ts:381) |

### Returning user (already has name + category in DB)

Mirrors test 001 verbatim:

| Step | What user sees | Where it lives |
|---|---|---|
| User texts "hi" | `Mayank. Aapka saved profile:\n• Category: Jewellery / Zewar\n\nContinue karein ya update karein.` + 3 buttons: Continue / Brand naam / Category | [onboarding.ts:170-186](../../packages/session/src/handlers/onboarding.ts:170) |
| Taps Continue | → AWAITING_PHOTO with `msgSendProductPhotos` prompt | [onboarding.ts:63-82](../../packages/session/src/handlers/onboarding.ts:63) |
| Taps Brand naam | → SETUP_NAME with prompt `Apna naya brand naam likhiye:` | [onboarding.ts:85-96](../../packages/session/src/handlers/onboarding.ts:85) |
| Taps Category | → SETUP_CATEGORY with the category list | [onboarding.ts:98-107](../../packages/session/src/handlers/onboarding.ts:98) |

Power-user shortcut: if returning user sends a photo directly (no "hi" first), it's silently accepted and routed into the photo flow with `Photo mil gayi, ${displayName}. Processing shuru ho raha hai.` — [onboarding.ts:135-167](../../packages/session/src/handlers/onboarding.ts:135).

### Photo flow

| Step | Behavior | Code |
|---|---|---|
| Photo sent in AWAITING_PHOTO | Uploaded to Supabase Storage `raw-images` bucket. Counter shown: `1 photo received ✅`. Max 5 photos per order. | [images.ts](../../packages/session/src/handlers/images.ts) |
| Hit MAX (5) | Auto-creates order + payment immediately, no "done" needed | [images.ts:244-251](../../packages/session/src/handlers/images.ts:244) |
| User types "done" with 0 photos | `Send a photo first! 📸 Then say "done".` *(test-001 issue #4: this is English even for hinglish users)* | [images.ts:382-386](../../packages/session/src/handlers/images.ts:382) |
| User types "Instructions" | Routes to instructions flow (free text or voice note) | [instructions.ts](../../packages/session/src/handlers/instructions.ts) |
| Voice note in AWAITING_PHOTO | Transcribed via Groq Whisper (or Sarvam for Hindi), stored as `voiceInstructions` | [images.ts:262](../../packages/session/src/handlers/images.ts:262) |

### Style picker

| Step | Behavior |
|---|---|
| Initial picker (2 rows) | Smart Pack ✨ OR Custom 🎨 |
| Smart Pack | AI auto-picks 3 styles based on category recommendation. Skips picker. |
| Custom | Opens 8-style list. User picks one. |
| After 1st custom pick | Sends checkbox state `✅ Pick / ⬜ / ⬜` then a SECOND message with picker. *(test-001 issue #5: should be merged)* |
| User picks 2 styles, taps "Done — 2 styles" | System still generates **3 ads** total because `OUTPUT_STYLES_PER_ORDER = 3` and `selectStylesForOrder` fills the 3rd. *(test-001 issue #7)* |

### Payment

Currently bypassed by default in dev (`PAYMENT_BYPASS=true` in `.env`). In prod: Razorpay payment link sent, polled by worker every 30s up to 30min.

### Delivery

Each ad is sent as a WhatsApp image with caption `🎨 Dark Luxury Ad (1/3) taiyaar hai!`. After all delivered: feedback menu (Great / Change / Redo).

---

## 2. State machine — all 11 states

Defined in [types.ts:66-77](../../packages/session/src/types.ts:66):

```
IDLE                       — entry point; new user or returning user landing here
SETUP_LANGUAGE             — language picker (legacy, no longer entered in new flow)
SETUP_NAME                 — asking for brand name
SETUP_CATEGORY             — picking category from list
SETUP_STYLE                — picking style (sub-states for multi-pick)
AWAITING_PHOTO             — collecting 1-5 product photos
AWAITING_PAYMENT           — Razorpay link sent, waiting
PROCESSING                 — worker is running AI pipeline
DELIVERED                  — ads delivered, awaiting feedback
EDIT_PROCESSING            — user requested edit on a delivered ad
AWAITING_REVISION_PAYMENT  — paid revision (after 2 free revisions used)
```

Every state has its own handler in `packages/session/src/handlers/`. Every transition is logged.

---

## 3. Edge cases currently handled (more than I expected)

Reading the dispatcher in [machine.ts](../../packages/session/src/machine.ts), here's what's already wired up:

### Pre-handler safeguards
- **Idempotency** — every message ID checked against `ProcessedMessage` table before any handler runs. Duplicate webhooks (Meta sometimes triple-fires) are silently dropped. [machine.ts:48-53](../../packages/session/src/machine.ts:48)
- **Customer Service Window (CSW) tracking** — every user message updates `cswExpiresAt` to now + 24h. This is the Meta-mandated 24h reply window. [machine.ts:67-73](../../packages/session/src/machine.ts:67)

### Intent interceptors (run before state routing)
- **Help intent** — `help`, `madad`, `menu`, `?`, `kaise`, `how` → shows help message in current language. [machine.ts:98-105](../../packages/session/src/machine.ts:98)
- **Language switch** — typed phrases like `english`, `hindi`, `अंग्रेज़ी`, `talk in english`, `English mein baat karo` switch language immediately, re-prompt current state in new language. [machine.ts:107-156](../../packages/session/src/machine.ts:107)

### Per-state escape hatches
Almost every state listens for "escape intent" — any of: `hi`, `hello`, `hey`, `namaste`, `naya`, `new`, `start`, `shuru`, `cancel`, `stop`, `reset`, `restart`, `start over`, `naya karo`, `band karo`. Triggering it resets the session to IDLE (with order state cleared) and re-runs the IDLE handler.

States with escape support: `SETUP_LANGUAGE`, `SETUP_NAME`, `SETUP_CATEGORY`, `SETUP_STYLE`, `AWAITING_PAYMENT`, `PROCESSING` (with care — `currentOrderId` preserved so worker can finish), `EDIT_PROCESSING`, `AWAITING_REVISION_PAYMENT`. [machine.ts:165-410](../../packages/session/src/machine.ts:165)

### Per-state timeouts (auto-recovery)
- `AWAITING_PHOTO` > 60 min → reset to IDLE with apology message
- `PROCESSING` > 10 min → reset to IDLE, "processing seems stuck" message
- `EDIT_PROCESSING` > 5 min → reset to DELIVERED
- `AWAITING_REVISION_PAYMENT` > 30 min → reset to DELIVERED

### Session recovery messages
If user returns after > 30 min gap with an active session, bot sends a contextual *"Welcome back — picking up your X"* message before the state handler runs. 6 step types: brand_intake, photo_upload, style_selection, payment, generation, delivery. [machine.ts:437-540](../../packages/session/src/machine.ts:437)

### Photo collection edge cases
- Hard cap of 5 photos. 6th is rejected with `Maximum 5 photos ho gayi hain. Kripya "done" bolein...`
- Photo batch timeout: 8 seconds. If user pauses, system shows "ready to process" button.
- Caption on photo treated as voice instructions (sneaky — see audit P1-7).
- Race condition guard if multiple photos arrive in rapid burst (Prisma update with `imageStorageUrls` array merge). [images.ts:232-251](../../packages/session/src/handlers/images.ts:232)

### Handler-level
- **Stale dispatch guard** in `handleIdle` — re-reads session state from DB before doing anything; bails if state changed since dispatch. [onboarding.ts:38-50](../../packages/session/src/handlers/onboarding.ts:38)
- **Generic error catch** — every handler call wrapped; on error, user gets `msgGenericError(lang)`. [machine.ts:417-430](../../packages/session/src/machine.ts:417)
- **`sendButtons` fallback** to `sendText` if Meta drops the interactive message. (Only in returning-user profile menu, NOT consistent across the codebase.) [onboarding.ts:187-193](../../packages/session/src/handlers/onboarding.ts:187)

### Webhook-level (apps/api)
- **HMAC signature verification** on every POST. [webhooks/whatsapp.ts](../../apps/api/src/routes/webhooks/whatsapp.ts)
- **Unknown message type dedup** — Meta sends extra envelopes (reactions, system, order, referral); rejection text deduped within 10s window per phone (CHANGELOG fix #5).

---

## 4. Edge cases NOT currently handled — the gaps

These are real risks today:

### Onboarding / IDLE
| Gap | Where it bites |
|---|---|
| **First message doesn't explain Autmn.** New users get "what's your brand name" with no context on what we do or what it costs. | Phase 1 of rebuild fixes this. |
| **Language detection silent fallback to English** on short/ambiguous input ("hi", "hey"). | Phase 1 rebuild removes auto-detect entirely. |
| **`lang === 'hi'` checks** leak English to hinglish users. Confirmed at [images.ts:383](../../packages/session/src/handlers/images.ts:383); needs grep audit for others. | Phase 7 polish. |
| **Voice note as first message** is transcribed only for language detection, then discarded. User has to re-type the info. | Phase 1 rebuild. |
| **Returning-user menu** missing change-language, view-full-profile, change-brand-details options. | Phase 2 rebuild. |
| **No update confirmations** on brand or category change — user can't tell if it saved. | Phase 1/2 rebuild. |
| **Returning user sends photo directly** without seeing saved settings. If saved category is stale, ad is generated with wrong styling silently. | Phase 2 — add a context line on silent accept. |

### Photo / collection flow
| Gap | Where it bites |
|---|---|
| **Photo re-asked after style picker** when photo already in session. | Phase 7 polish. |
| **Style picker double-message.** | Phase 7 polish. |
| **2-style pick → 3 ads delivered**, no upfront warning. | Phase 7 polish — copy fix. |
| **Caption-as-instructions** is sneaky — user might caption "for diwali" thinking it's a label, not realizing it becomes a generation instruction. | Not in plan yet. |
| **No "back" button anywhere** in pickers. Wrong tap = stuck or escape-and-restart. | Phase 2 rebuild adds Back to settings menu. Picker back is still missing. |

### Cross-cutting
| Gap | Where it bites |
|---|---|
| **No abuse/rate-limit** per phone. User can hammer "hi" 50 times and get 50 menu sends. Meta may rate-limit our WABA token. | Not in rebuild plan. Should add. |
| **`sendList` has no text fallback.** Only `sendButtons` does. Category picker and style picker can silently fail. | Phase 7 polish. |
| **No funnel analytics.** We have no visibility into where users drop off. | Not in rebuild plan — add when we're ready to optimize. |
| **Outbound message failures don't retry.** If `wa.sendText` fails (Meta API hiccup), state has already advanced and user gets nothing. | Not in rebuild plan. |
| **No multi-photo product order tracking** — user can only do one product per order. To do a second product, they have to "start over". | Edit flow handles single-product revisions, not multi-product orders. |
| **Brand information not used in AI prompts.** Even if we had a brand summary, current pipeline doesn't read it. | Phase 5 of rebuild plugs this in. |
| **No way to delete account / data.** GDPR-style "delete my data" request would need DB intervention. | Not in plan. |

### Failure mode I'd flag specifically
| What if... | Current behavior | What should happen |
|---|---|---|
| AI pipeline crashes mid-order | Worker logs error. User is left in PROCESSING with the 10-min timeout. They see "processing stuck" after 10 min. | Worker should catch + notify immediately, refund the order. |
| Razorpay webhook never arrives | `AWAITING_PAYMENT` polled by worker every 30s up to 30min. After 30min, timeout. | Worker polling exists, but user gets no nudge during the wait beyond auto-recovery messages. |
| User changes phone number | New phone = new user record. Old account orphaned. | No flow for account merging. |
| Phone number with country code variations | Likely treated as different users (need to confirm normalization). | Should normalize to E.164 on every write. |
| Meta token expires / 401s | All outbound `wa.send*` calls fail until token rotated. | No alerting; only Sentry would catch. |

---

## 5. Quick summary for the conversation

**What's better than I initially gave it credit for:**
- Idempotency, CSW tracking, escape intents on every state, timeouts on every long-running state, session recovery messages after gap, language-switch via typed text, generic error handler. The foundation is solid.

**What's missing or weak:**
- New-user UX (no value prop, no language picker, voice transcript discarded)
- Returning-user UX (incomplete profile summary, no change-language, no confirmations)
- Polish bugs from test 001 (lang === 'hi' fallback, double messages, photo re-prompt, 2→3 ads surprise)
- Abuse protection, analytics, outbound retry, account deletion — not present

**What the rebuild plan covers vs doesn't:**
- ✅ Covers: language picker, full settings menu, brand details (the big one), confirmations, FAQ fallback, all test-001 polish
- ❌ Doesn't cover: rate limiting, funnel analytics, outbound retry, account management — recommend adding to a separate "ops hardening" phase pre-launch
