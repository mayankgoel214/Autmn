# Onboarding audit — full bottleneck list

Built from reading [packages/session/src/handlers/onboarding.ts](packages/session/src/handlers/onboarding.ts), the IDLE state in [machine.ts](packages/session/src/machine.ts), and the test-001 transcript.

## Current state diagram

```
IDLE (entry — every message lands here if no active session)
│
├─ New user (no name in DB)
│    1. auto-detect language from first message (text or voice transcript)
│    2. → SETUP_NAME
│    3. ask "brand + what you sell" in one combined prompt
│    4. parse → if category found inline, → AWAITING_PHOTO
│                else → SETUP_CATEGORY → AWAITING_PHOTO
│
└─ Returning user (name in DB)
     ├─ photo sent directly → AWAITING_PHOTO (silent accept)
     ├─ "Continue" button   → AWAITING_PHOTO
     ├─ "Brand naam" button → SETUP_NAME (new brand, then → AWAITING_PHOTO)
     ├─ "Category" button   → SETUP_CATEGORY (new category, then → AWAITING_PHOTO)
     └─ anything else → re-show profile menu
```

## Issues — by severity

### 🔴 P0 — must fix before launch

**P0-1. New users don't know what Autmn does.**
First message says "Namaste! Autmn mein aapka swagat hai 🙏 Aapka brand naam aur aap kya bechte hain". Doesn't explain: *we turn product photos into professional ads, first one is free, ₹99 each after, takes 2 minutes*. Users texting "hi" cold will be confused and bounce.
→ Add a 2-line value prop above the first question, with at least one concrete benefit and the price anchor.

**P0-2. Hinglish users see English fallbacks.**
Confirmed in test 001 (#4) at [images.ts:383](packages/session/src/handlers/images.ts:383) — `lang === 'hi'` excludes hinglish. Same bug pattern likely exists elsewhere — needs an audit of every `lang === 'hi'` check in the codebase.
→ Replace with `isHindi(lang)` everywhere; grep for remaining instances.

**P0-3. Language detection is one-shot and silent.**
- Falls back to English on any error or short input ("hi", "hey")
- User has zero ability to override later — there's no "change language" option in the returning-user menu either
→ Two fixes: (a) lower confidence threshold to bias toward Hindi for ambiguous Indian users (the target market), (b) add a Change Language option to the returning-user menu, (c) make the very first reply offer an inline "🇮🇳 हिंदी / English" toggle if confidence is low.

### 🟠 P1 — meaningful friction, fix before scale

**P1-1. Profile summary is incomplete (test 001 #1).**
Returning user sees only `• Category: Jewellery / Zewar`. No brand name, no language. They can't tell what's saved.
→ Add Brand, Language, total orders to-date.

**P1-2. No confirmation after a profile update (test 001 #2).**
Change brand name → bot jumps straight to "send photo". User has no idea if Joyaa was saved or thrown away.
→ Always send `Brand updated: Joyaa ✅` before transitioning forward.

**P1-3. Missing options in returning menu (test 001 #3).**
Only 3 buttons: Continue / Brand / Category. Missing: change language, change brand details/website, view full profile, delete profile.
→ Switch to a list message (5+ rows, single tap). Categories: profile changes vs. continue.

**P1-4. Voice note as first message — transcript thrown away.**
[onboarding.ts:201-215](packages/session/src/handlers/onboarding.ts:201) transcribes for language detection only. If user said "Hi I'm Joyaa, I sell jewellery", they're then asked to type the same info.
→ Pass the transcript through to brand parsing too.

**P1-5. Photo re-asked after styles (test 001 #6).**
After style picker, bot says "Ab product ki photos bhejiye!" even when photo is already in session.
→ Conditional copy: skip if `imageStorageUrls.length > 0`.

**P1-6. New-user first question is overloaded.**
"Brand name AND what you sell" in one prompt with a comma example. Many users will respond with just one. Falls through OK but feels broken.
→ Either split into 2 prompts, or accept partial input gracefully with a friendly clarifier ("Bas brand name mil gaya — ab category bhi bataiye?").

**P1-7. Returning user sends photo directly → silent acceptance.**
[onboarding.ts:135-167](packages/session/src/handlers/onboarding.ts:135) — power user shortcut, but if the saved profile is stale, user generates an ad with wrong category/style and is surprised.
→ Add a quick context line: "Photo mil gayi, Joyaa (Jewellery). Agar kuch update karna hai to 'profile' likhiye."

### 🟡 P2 — polish

**P2-1. Style picker fires duplicate messages (test 001 #5).**
Two back-to-back messages: checkbox state + "Pick style N (optional)". Should be one.
→ Combine in [sendStyleList](packages/session/src/handlers/onboarding.ts:484-503).

**P2-2. 2 styles picked → 3 ads delivered (test 001 #7).**
Surprise on first run.
→ Add upfront copy: "Pick 1-3 styles — we'll generate 3 ads, AI fills in the rest." Or change behavior to honor exact pick.

**P2-3. No "back" or "cancel" anywhere.**
Tap wrong category → stuck, have to complete and re-update.
→ Add a "↩ Back" option in every list message.

**P2-4. Idempotency on repeat "hi".**
Sends profile menu every time, even 3 times in 10 seconds. Looks janky.
→ Suppress duplicate menu sends within a 30s window per phone.

**P2-5. WhatsApp interactive fallback is partial.**
[onboarding.ts:187-193](packages/session/src/handlers/onboarding.ts:187) wraps `sendButtons` in try/catch with a text fallback, but `sendList` has no fallback. Meta sometimes drops interactive messages on free-tier test numbers.
→ Wrap every `sendList`/`sendButtons` call uniformly.

**P2-6. Update-then-keep-going UX.**
After updating brand or category, user is shoved into AWAITING_PHOTO immediately. What if they wanted to update both? They have to re-enter the menu.
→ After any update, return to the profile menu with the updated values shown.

### 🟢 P3 — nice to have

- **No analytics / funnel tracking** — we have no visibility into where users drop off. Worth adding before scaling marketing spend.
- **No abuse/rate-limit per user** — burst of "hi" → burst of replies → Meta could throttle the WABA.
- **No "what's new" since last visit** — when we add styles or features, returning users don't see them.
- **The User table has `name` but no `brandName` column.** Code in [delivery.ts](packages/session/src/handlers/delivery.ts) reads `(user as any).brandName` which is always undefined. If we ever want to distinguish brand from individual name, we need a migration.

## Open product calls (need Mayank + co-founder decision)

1. **First-message UX**: split into two prompts (brand → then category) vs. keep combined?
2. **Language override**: inline toggle on every reply for low-confidence cases? Or only in profile menu?
3. **3 ads vs. N ads**: always deliver 3 (current), or honor exact pick?
4. **Photo-first vs. menu-first for returning users**: keep both, or pick one canonical path?
5. **Profile persistence**: should "Continue" mean "use my last settings" or "fresh order with saved category"? Currently it's the latter; could be confusing if user expects style memory too.

## What's NOT broken (confirmed working)

- Message ID dedup exists ([db-helpers.ts:152](packages/session/src/db-helpers.ts:152))
- Webhook unknown-type dedup exists (CHANGELOG)
- Stale dispatch guards exist ([onboarding.ts:38-50](packages/session/src/handlers/onboarding.ts:38))
- HMAC signature verification on webhooks
- AI pipeline produces high-quality output (test 001)
