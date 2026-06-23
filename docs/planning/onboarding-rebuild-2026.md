# Onboarding rebuild — plan

**Status:** Approved scope, ready to build.
**Owner:** Mayank
**Built from:** [docs/testing/onboarding-audit.md](../testing/onboarding-audit.md), test-001, and the discussion logged on 2026-05-26.

---

## Goal

Replace the current onboarding with a fully optional, multi-language flow that builds a rich brand profile (text, images, PDFs, website) and injects that brand context into every ad generation, while remaining usable for users who skip everything.

## Locked decisions

### Principles
- **Everything is optional.** Language, brand name, category, brand details. Product produces results with zero input. Brand profile is an optimization signal, never a gate.
- **Phone number is the unique identity.** Single account per phone, stores language + brand name + category + brand profile.
- **Existing users will be wiped.** Migration script truncates User/Session/Order tables. Everyone re-onboards.

### New-user flow
1. **Language picker** — always ask, no auto-detect. Hindi / English / Hinglish. Buttons + text fallback ("hindi", "english", "hinglish", "1", "2", "3").
2. **Brand name** — free text, skippable.
3. **Brand category** — list with "Other" → free text. Skippable.
   - "Other" categories: no style recommendation, defaults to Smart Pack / Custom picker.
4. **Brand details** — single open prompt: *"Send anything about your brand — logo, samples, descriptions, website URL. Type 'done' when finished or 'skip'."*
   - Accepts: images, PDFs, text, website URLs.
   - Limits: max 10 files, 5 MB each.
   - Website: Playwright headless render.
   - AI summary: Gemini 2.5 Flash, runs once on 'done'.
   - Skippable.

### Returning-user flow
- Any message → 2-button menu: **Generate ad** / **Change settings**.
- **Generate ad** → straight to "send photo" prompt. Saved context used silently.
- **Change settings** → list with 4 rows: Language / Brand name / Category / Brand details.
- All updates emit a confirmation message.
- **Free-form messages** → match against canned FAQ responses (price / refund / help / what is this / turnaround). Otherwise re-show menu.

### Brand details editing
- View as **structured fields** (Brand / Tagline / Colors / Vibe / Samples).
- Edit via **natural language** ("change colors to red and gold"). Atomic field patches — no AI re-summary unless new assets are uploaded.
- **Version history** kept for every summary change. Undo possible.

### Where the brand details prompt surfaces
- Only when user explicitly taps **Brand details** in the change-settings menu. No first-ad nudges, no random reminders.

---

## Data model changes

### `User` (existing — add column)
- `brandName String?` — referenced by code today but column doesn't exist. **Add via migration.**

### `BrandProfile` (new — 1:1 with User)
```
model BrandProfile {
  id              String   @id @default(uuid()) @db.Uuid
  userId          String   @unique @db.Uuid
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  logoUrl         String?
  tagline         String?
  brandColors     String[] // hex codes or color names
  vibe            String?  // "minimalist luxury", "playful festive", etc.
  websiteUrl      String?

  summary         String?  @db.Text  // full natural-language summary used in AI prompts
  summaryUpdatedAt DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  assets          BrandAsset[]
  versions        BrandSummaryVersion[]

  @@map("brand_profiles")
}
```

### `BrandAsset` (new — N:1 with BrandProfile)
```
model BrandAsset {
  id              String   @id @default(uuid()) @db.Uuid
  brandProfileId  String   @db.Uuid
  brandProfile    BrandProfile @relation(fields: [brandProfileId], references: [id], onDelete: Cascade)

  type            String   // 'logo' | 'sample' | 'reference_image' | 'pdf' | 'website' | 'text'
  storageUrl      String?  // null for text and website types
  rawText         String?  @db.Text  // for text/url types
  originalFilename String?
  mimeType        String?

  aiDescription   String?  @db.Text  // AI's analysis of this asset

  createdAt       DateTime @default(now())

  @@index([brandProfileId])
  @@map("brand_assets")
}
```

### `BrandSummaryVersion` (new — N:1 with BrandProfile)
```
model BrandSummaryVersion {
  id              String   @id @default(uuid()) @db.Uuid
  brandProfileId  String   @db.Uuid
  brandProfile    BrandProfile @relation(fields: [brandProfileId], references: [id], onDelete: Cascade)

  summary         String   @db.Text
  structuredData  Json     // { tagline, brandColors, vibe }
  changeReason    String?  // "initial", "user_edit: change colors to red", "asset_added"

  createdAt       DateTime @default(now())

  @@index([brandProfileId, createdAt])
  @@map("brand_summary_versions")
}
```

### Storage
- New Supabase bucket: `brand-assets` (private; signed URLs only).

### Session
- New states needed in the state machine:
  - `BRAND_DETAILS_COLLECTING` — accepting brand uploads
  - `BRAND_DETAILS_EDITING` — editing existing profile via natural language
  - `CHANGE_SETTINGS_MENU` — showing the 4-option list
  - `CHANGE_LANGUAGE` / `CHANGE_NAME` / `CHANGE_CATEGORY` (or reuse SETUP_* states)

---

## Build phases

### Phase 0 — Data + cutover (foundation)
**Effort:** ~half day
- Prisma migration: add `brandName` to User, add three new tables, drop existing data.
- Create `brand-assets` bucket via [scripts/create-buckets.ts](../../scripts/create-buckets.ts).
- Truncate script: User / Session / Order / ProcessedMessage rows.
- Regenerate Prisma client, update [packages/db](../../packages/db).

### Phase 1 — New-user happy path (no brand details)
**Effort:** 1 day
- New `SETUP_LANGUAGE` handler:
  - Send 3-button picker (Hindi / English / Hinglish) on first contact, no auto-detect.
  - Accept text fallback: "hindi" / "english" / "hinglish" / "1" / "2" / "3" / "हिंदी".
- Refactor `handleSetupName`:
  - Add "skip" intent handling.
  - Drop the combined brand+category prompt — ask for brand only.
- Refactor `handleSetupCategory`:
  - Add "Other" row at bottom of list.
  - New `SETUP_CATEGORY_OTHER` state for free-text capture.
  - "Skip" option in the list.
- Confirmation message after each step ("Brand naam set: Joyaa ✅").
- Test: new user flow end-to-end skipping everything → photo → ad.
- Test: new user flow end-to-end filling everything → photo → ad.

### Phase 2 — Returning-user 2-option menu + change settings
**Effort:** 1 day
- Rewrite `handleIdle` returning-user branch:
  - 2 buttons: **Generate ad** / **Change settings**.
  - Remove the current 3-button Continue/Brand/Category UI.
- `Generate ad` button → AWAITING_PHOTO directly with no extra copy.
- `Change settings` button → new `CHANGE_SETTINGS_MENU` state, list message: Language / Brand name / Category / Brand details.
- Each row routes to the matching state. Reuse handlers from Phase 1 where possible.
- After every update, confirmation message + return to CHANGE_SETTINGS_MENU (so user can update multiple things in a row).
- "Back" option in the menu to return to IDLE.
- Test: changing each setting, including multi-update in one session.

### Phase 3 — Brand details capture (the big one)
**Effort:** 3-4 days
- New `BRAND_DETAILS_COLLECTING` state.
- Single prompt: *"Send anything about your brand — logo, sample ads, descriptions, website URL. Type 'done' when finished or 'skip'."*
- Inbound message handling per type:
  - **Image** → upload to `brand-assets/`, create BrandAsset record (type=`reference_image` or `logo` if it's the first; user can re-label later).
  - **PDF** → upload + extract text + thumbnail first page.
  - **Document (doc/xls/etc.)** → upload + best-effort text extract; if no extractor available, store raw and note in summary.
  - **Text message** → create BrandAsset(type=`text`).
  - **URL detection** in text (regex for `https?://`) → create BrandAsset(type=`website`).
  - **"done"** → transition to summary generation.
  - **"skip"** → return to previous flow (new-user → AWAITING_PHOTO, returning-user → CHANGE_SETTINGS_MENU).
- Cost rails enforced at this state:
  - Reject 11th file with friendly message: "10 files max. Type 'done' to save what you have or 'skip'."
  - Reject >5 MB files: "File too big. Send under 5 MB please."
- New module `packages/ai/src/brand/`:
  - `analyzeImage(url)` → Gemini Flash vision call → 1-2 sentence description.
  - `analyzePDF(url)` → extract text via pdf-parse, return text + page thumbnails for image analysis.
  - `scrapeWebsite(url)` → Playwright render, extract H1/H2/hero copy + dominant colors via image analysis of screenshot.
  - `generateSummary(assets[])` → single Gemini Flash call: takes all individual asset descriptions, returns structured `{ tagline, brandColors[], vibe, summary }`.
- On 'done':
  - Run all per-asset analyses in parallel (worker queue: new `brand-analysis` queue).
  - Once all done, run `generateSummary`.
  - Write to `BrandProfile` + initial `BrandSummaryVersion`.
  - Send user the structured profile + "Brand profile saved ✅".
- Playwright setup:
  - Add `playwright` to `@autmn/ai` workspace.
  - Worker Dockerfile installs browser binaries.
  - Wrap in a 30s timeout; on failure fall back to lightweight HTML fetch.
  - Flag in `.env`: `BRAND_SCRAPE_TIMEOUT_MS=30000`.
- Test: each input type works in isolation; combined upload of 5 files works; oversize/over-limit rejection works; Playwright scrape works for a Shopify, Wix, and SPA site.

### Phase 4 — Brand profile view + edit
**Effort:** 1-2 days
- View flow (triggered from CHANGE_SETTINGS_MENU → Brand details, when profile exists):
  - Send structured field summary as text:
    ```
    Aapka brand profile:
    • Brand: Joyaa
    • Tagline: Modern heritage jewellery
    • Colors: rose gold, ivory
    • Vibe: minimalist luxury
    • Assets: 3 images, 1 PDF, website
    ```
  - 2 buttons: **Edit** / **Add more**.
- Edit flow (`BRAND_DETAILS_EDITING` state):
  - User sends natural-language instruction ("change colors to red and gold").
  - LLM call: identify which field, generate the patch. Apply directly to BrandProfile.
  - Append BrandSummaryVersion with `changeReason="user_edit: change colors to red and gold"`.
  - Confirmation: "Updated ✅\n• Colors: red, gold".
  - Stays in editing mode until user types 'done'.
- Add more flow → returns to BRAND_DETAILS_COLLECTING.

### Phase 5 — AI pipeline integration
**Effort:** 1 day
- Inject `brandProfile.summary` into [packages/ai/src/pipeline/](../../packages/ai/src/pipeline/) prompts.
- Modify the queue payload to include `brandSummary?: string` (already have `brandName` field plumbed through; extend it).
- A/B test by manually toggling brand summary inclusion on test orders — eyeball quality difference.
- Add a fallback: if BrandProfile is null, current behavior unchanged.

### Phase 6 — Free-form message FAQ
**Effort:** half day
- Add `packages/session/src/handlers/faq.ts`:
  - Keyword/intent map: price → "₹99 per image, first one free", refund → ..., help → ..., what is this → ..., turnaround → "2-5 minutes per ad".
  - Hinglish + English + Hindi variants.
- Wire into IDLE and CHANGE_SETTINGS_MENU: text matches an intent → reply + re-show menu. No match → re-show menu only.

### Phase 7 — Polish (test-001 leftovers)
**Effort:** half day
- Fix `lang === 'hi'` → `isHindi(lang)` everywhere ([images.ts:383](../../packages/session/src/handlers/images.ts:383) and any other instances). Grep audit.
- Style picker: merge double messages (checkbox state + next prompt → single).
- "Photo already received" check before sending msgSendProductPhotos again.
- Upfront copy in style picker: "Pick 1-3 styles — we'll generate 3 ads, AI fills in the rest."
- Idempotent "hi" — suppress duplicate menu sends within 30s.

---

## Touchpoints (files that change)

| Phase | Files |
|---|---|
| 0 | [packages/db/prisma/schema.prisma](../../packages/db/prisma/schema.prisma), [scripts/create-buckets.ts](../../scripts/create-buckets.ts), new truncate script |
| 1 | [packages/session/src/handlers/onboarding.ts](../../packages/session/src/handlers/onboarding.ts), [packages/session/src/machine.ts](../../packages/session/src/machine.ts), [packages/session/src/types.ts](../../packages/session/src/types.ts), [packages/session/src/messages.ts](../../packages/session/src/messages.ts) |
| 2 | onboarding.ts, machine.ts, new `change-settings.ts` handler, [packages/session/src/types.ts](../../packages/session/src/types.ts) |
| 3 | new `packages/session/src/handlers/brand-details.ts`, new `packages/ai/src/brand/` directory, [packages/queue/src/jobs.ts](../../packages/queue/src/jobs.ts) (new `brand-analysis` queue), [apps/worker/src/processors/](../../apps/worker/src/processors/) (new processor), [packages/storage/src/](../../packages/storage/src/) (new bucket name) |
| 4 | brand-details.ts, [packages/ai/src/brand/edit.ts](../../packages/ai/src/brand/edit.ts) (new) |
| 5 | [packages/ai/src/pipeline/](../../packages/ai/src/pipeline/), [packages/queue/src/jobs.ts](../../packages/queue/src/jobs.ts) (extend payload) |
| 6 | new `packages/session/src/handlers/faq.ts`, dispatcher in machine.ts |
| 7 | [packages/session/src/handlers/images.ts](../../packages/session/src/handlers/images.ts), `style.ts`, messages.ts |

---

## Test gates between phases

Each phase ends with a manual WhatsApp test logged under `docs/testing/test-NNN.md`. Don't start the next phase until the current one passes its test. **Specifically:**

- After P1: test 002 — new user, skip everything → photo → ad. New user, fill everything → photo → ad.
- After P2: test 003 — returning user, change each setting, then generate ad.
- After P3: test 004 — brand details upload (images + PDF + URL). Verify summary makes sense.
- After P4: test 005 — view profile, edit colors via natural language, verify version history.
- After P5: test 006 — same product photo, two orders (with and without brand profile). Compare output quality.
- After P6: test 007 — typed FAQ questions get sensible responses.
- After P7: test 008 — re-run test 001 scenario, verify all 7 bugs are fixed.

---

## Risks and unknowns

1. **Playwright in worker is heavy.** Adds ~300 MB image size on Railway, ~300 MB RAM per browser instance. We may end up needing a separate worker for brand scraping. Decide at P3 if memory pressure shows up.
2. **AI-generated structured edits may be wrong.** "Change colors to red and gold" is easy. "Make it more luxurious" is ambiguous. Version history is our undo, but UX of "your edit didn't land right" needs a way to revert from the WhatsApp UI — not just DB rollback. Could add a "↩ Undo last change" option after every edit confirmation.
3. **Cost on brand profile generation.** Estimated ~$0.15 per brand profile (10 file analyses + 1 summary on Gemini Flash). If users re-summarize often, costs can creep. The plan says we only re-summarize on new asset uploads, not on every edit — keep that contract.
4. **Existing users wipe.** OK during pre-launch but document it: anyone we've onboarded for testing/demos loses their profile. That's intentional.
5. **PDF coverage is shaky.** PDF text extraction works for clean PDFs but fails on scanned/image-only ones. We'll OCR via Gemini vision as a fallback. Adds cost (~$0.005 per page) but salvages quality.
6. **"Other" category recommendations.** Decided: no recommendation for Other. But the style picker still works — they just don't get a pre-highlighted "Recommended" row. Acceptable.

---

## Out of scope for this rebuild

- Payment flow changes (still ₹99 Razorpay)
- Edit/revision flow on delivered ads (separate work)
- Analytics / funnel tracking (P3-priority from audit)
- "What's new since last visit" prompts
- Rate limiting on repeat "hi" (per-user cooldown — minor polish, not blocking)

---

## Ready to start?

Once you sign off on this doc, I'll:
1. Open a feature branch: `feat/onboarding-rebuild-2026`
2. Start Phase 0 (data + cutover)
3. Send you a confirmation when each phase is mergeable, with a test script to run before we move on
