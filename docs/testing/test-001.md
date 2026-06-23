# Test 001 — Returning-user onboarding + brand name change + photo flow

**Date:** 2026-05-22
**Tester:** Mayank
**Phase:** Onboarding (returning user) + Photo flow + Style picker
**Build SHA:** 75b4a618bcfc8760d95362ffbc5fb8a985b56392 (+ local patches to queue/jobs.ts and session/handlers/onboarding.ts to unblock build — see commit message TBD)
**Previous test:** none — first end-to-end test on the rebuilt pipeline

## What was tested

Returning user (had existing profile: name=Mayank, businessType=jewellery, language=hinglish) sends "hi", changes brand name to "Joyaa", sends a real product photo (Snowberry dessert), provides custom instructions, picks 2 styles via the Custom picker, receives 3 ads.

## Transcript

```
4:24:56 Mayank: hi
4:25:15 Bot: Mayank. Aapka saved profile:
              • Category: Jewellery / Zewar
              Continue karein ya update karein.
              [buttons: Continue | Brand naam | Category]

4:25:38 Mayank: [tapped] Brand naam
4:25:52 Bot: Apna naya brand naam likhiye:
4:26:03 Mayank: Joyaa
4:26:18 Bot: Ab apne product ki photos bhejein! Ek hi product ki alag-alag
              angles se 1-5 photos bhej saktein hain. Jab ho jaye, "done" bolein.

4:26:22 Mayank: done   (premature — no photo sent yet)
4:26:33 Bot:    Send a photo first! 📸 Then say "done".    ← ENGLISH (bug)

4:27:34 Bot:    1 photo received ✅                         ← Mayank sent the photo
4:28:05 Mayank: Instructions
4:28:17 Bot:    Kuch special instructions? Text ya voice note bhejein.
4:28:44 Mayank: isme se jis product mein snowberry likha hua hi bs usi ka
                 ad banayega aur baaki sabko ignore karna please

4:29:09 Bot:    Style chuniye:                              ← shows Smart Pack / Custom
4:29:16 Mayank: [tapped] Custom 🎨
4:29:29 Bot:    Koi bhi style chuniye:
4:29:39 Mayank: [tapped] Dark Luxury
4:29:52 Bot:    ✅ Dark Luxury / ⬜ / ⬜   Ek aur style chuniye ya Done tap karein
4:29:53 Bot:    Style 2 chuniye (optional):                  ← double message (bug)
4:30:05 Mayank: [tapped] Autmn Special ✨
4:30:18 Bot:    ✅ Dark Luxury / ✅ Autmn Special / ⬜
4:30:19 Bot:    Style 3 chuniye (optional):                  ← double message (bug)
4:30:26 Mayank: [tapped] Done — 2 styles
4:30:37 Bot:    2 styles ready hain! ✨ ... Ab product ki photos bhejiye!  ← re-asks for photo we already have
4:30:57 Bot:    📷 Photo mil gayi! 3 ads bana rahe hain...

4:32:34 Bot:    🎉 Taiyaar hain! Bhej raha hun...
4:32:40 Bot:    🎨 Dark Luxury Ad (1/3) taiyaar hai!
4:32:42 Bot:    ✨ Autmn Special ✨ Ad (2/3) taiyaar hai!
4:32:43 Bot:    🌿 Lifestyle Setting Ad (3/3) taiyaar hai!   ← 3rd ad user did not pick
```

## Output quality

3 ads delivered. Visual fidelity is strong — Snowberry packaging branding preserved across all 3 generations, dark/cinematic style matched the user's "Dark Luxury" pick well. End-to-end timing: ~5.5 min from "hi" to delivered ads, ~2 min from photo to ads. Pipeline works.

## Issues found

### #1 — Returning-user profile summary is incomplete  (major)
- **Repro:** 4:25:15 — bot showed only `• Category: Jewellery / Zewar`, no brand name in the summary
- **Root cause:** [packages/session/src/handlers/onboarding.ts:171-175](packages/session/src/handlers/onboarding.ts:171) — `profileBody` only lists Category, missing Brand and Language
- **Fix:** include Brand and Language in the bullet list

### #2 — No confirmation after brand name update  (major)
- **Repro:** 4:26:18 — bot jumped straight to "send photos" after "Joyaa", no "Brand name updated to Joyaa ✅"
- **Root cause:** [packages/session/src/handlers/onboarding.ts:332](packages/session/src/handlers/onboarding.ts:332) — `handleSetupName` returning-user branch just sends `msgSendProductPhotos` with no acknowledgement
- **Fix:** prepend a confirmation line: "Brand naam update ho gaya: Joyaa ✅"

### #3 — Missing options in returning-user menu  (major)
- **Repro:** 4:25:15 — only 3 buttons (Continue / Brand naam / Category). User wants to also change language, brand details
- **Root cause:** [packages/session/src/handlers/onboarding.ts:181-185](packages/session/src/handlers/onboarding.ts:181) — only 3 button options. WhatsApp button limit is 3 per `sendButtons`, so 4th option requires a list message instead.
- **Fix options:**
  - (a) swap `sendButtons` → `sendList` with rows: Continue / Change brand / Change category / Change language / View full profile
  - (b) keep 3 buttons but add "More options" as the 3rd, which opens a list

### #4 — Language fallback to English when state is "hinglish"  (major)
- **Repro:** 4:26:33 — bot said *"Send a photo first! 📸 Then say 'done'."* in English even though user is on hinglish
- **Root cause:** [packages/session/src/handlers/images.ts:383](packages/session/src/handlers/images.ts:383) — uses `lang === 'hi'` instead of `isHindi(lang)`. Pure `'hi'` triggers Hindi, `'hinglish'` falls through to English.
- **Fix:** replace `lang === 'hi'` with `isHindi(lang)` here and audit the file for other instances of the same bug

### #5 — Style picker emits two messages back-to-back  (minor)
- **Repro:** 4:29:52 + 4:29:53, 4:30:18 + 4:30:19 — confirmation + next-prompt come as two separate messages
- **Root cause:** TBD — style picker handler ([packages/session/src/handlers/style.ts]) sends ack + prompt separately
- **Fix:** combine into a single message: "✅ Dark Luxury (1/3). Ek aur style chuniye ya Done tap karein ↓" with the picker buttons inline

### #6 — Bot re-asks for photo we already have  (major)
- **Repro:** 4:30:37 — "Ab product ki photos bhejiye!" after styles, but photo was already received at 4:27:34
- **Root cause:** [packages/session/src/messages.ts:193] `msgSendProductPhotos` is the canonical "send photos" prompt; it's being fired unconditionally after style selection regardless of whether a photo already exists
- **Fix:** check `session.imageStorageUrls.length > 0` before sending — if photo present, skip the prompt and go straight to processing message

### #7 — 3rd ad ("Lifestyle Setting") generated despite user picking only 2 styles  (major / expectation mismatch)
- **Repro:** 4:30:26 user confirmed "Done — 2 styles", but received 3 ads at 4:32:40-43
- **Root cause:** [packages/session/src/types.ts:111] `OUTPUT_STYLES_PER_ORDER = 3` is hardcoded; if user picks fewer, system fills in extras via `selectStylesForOrder` ([packages/session/src/auto-styles.ts])
- **Fix options:**
  - (a) honor user's pick exactly — 2 styles = 2 ads
  - (b) keep the "always 3" guarantee but tell the user upfront: "We'll generate 3 ads — pick 1-3 styles, AI fills in the rest"
  - **Recommendation:** (b) is the better product call — 3 ads is part of the value prop ("Rs 99 per image" promises 3 styles). But the UI should say so explicitly so the 3rd doesn't feel like a bug.

## Action items

Phase 1: Onboarding (this test)
- [ ] Issue #1 — add Brand and Language to returning-user profile summary
- [ ] Issue #2 — add brand-name-updated confirmation
- [ ] Issue #3 — swap to list message OR add 4th option ("Change language", "View full profile")
- [ ] Issue #4 — fix `lang === 'hi'` → `isHindi(lang)` across [packages/session/src/handlers/images.ts] (audit whole file)
- [ ] Issue #5 — merge double messages in style picker
- [ ] Issue #6 — skip "send photos" prompt when photo already in session
- [ ] Issue #7 — pick option (a) or (b) with Mayank, update copy accordingly

## Next test

`test-002.md` — re-run the exact same scenario after the Phase 1 fixes land. Verify: brand-update confirmation visible, no English fallback, no duplicate style-picker messages, no re-asking for the photo, 2-style pick produces the expected number of ads.
