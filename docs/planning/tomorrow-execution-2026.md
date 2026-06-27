# Tomorrow's execution plan — content, website, social

**Goal:** Generate 20–30 real Autmn before/after ads, build the Phase-4 website around them, and stand up the first social content — all legally clean for public posting.
**Date:** starts the morning after 2026-06-22.
**Read alongside:** [content-legal-2026.md](./content-legal-2026.md) (sourcing + legal rules), [motion-website-2026.md](./motion-website-2026.md) (site concept + tooling).

---

## Ready tonight (done, no action needed)
- ✅ **Batch generator built + proven** — `scripts/batch-content.mjs`. Tested end-to-end on a fixture: input folder → Autmn ad → before/after composite. Sample output in `content/output/diet-coke/` (delete before your real run, or just add folders alongside).
- ✅ **Pipeline working** — Gemini Tier-1, ₹13.5/image, watermark auto-applied.
- ✅ **Logo kit** — `~/Downloads/Autmn-Logo-Kit.zip` + `Autmn_Logos/`.
- ✅ **Plans locked** — onboarding, post-onboarding, payments/refunds, pipeline, motion site, content/legal.

Note: content generation + website work **don't need** the WhatsApp API/worker/ngrok running — the batch tool calls the pipeline directly. Only live WhatsApp testing needs those.

---

## Track A — Content assets (do this FIRST; B and C depend on it)

### A1. Gather inputs (legally clean)
- **Shoot** the store-bought products (sweets, etc.) yourself — fully yours.
- For anything you don't have: **CC0 unbranded** from Unsplash / Pexels / Pixabay only. No Google Images. (Rules: [content-legal-2026.md §2](./content-legal-2026.md).)
- Target products: kaju katli/barfi box, laddoo, dry-fruit box, chocolate, brass idol/diya, candle, unbranded serum + cream jar, kundan earrings, ring/pendant, glass beverage bottle, honey jar, sneaker, handbag, scarf. (Full table: [content-legal-2026.md §5](./content-legal-2026.md).)

### A2. Drop into the input folder
```
content/input/<product-name>/
   1.jpg 2.jpg ...        1-5 photos (first = primary; rest = reference angles)
   category.txt           optional, e.g. "food" / "jewellery" / "skincare" (default: general)
```

### A3. Run the batch
```
node --env-file=.env scripts/batch-content.mjs
# or pick styles:
node --env-file=.env scripts/batch-content.mjs "style_clean_white,style_lifestyle,style_festive"
```
Outputs per product in `content/output/<product>/`: `before.jpg`, `<style>.jpg` (watermarked ad), `<style>__pair.jpg` (before|after for gallery). Summary + costs in `content/output/manifest.json`.
- Default 3 styles × ~15 products ≈ 45 images ≈ **~₹600** at ₹13.5 each. Trim styles/products to control spend.

### A4. Review + cull
- Keep the strongest before/after pairs (aim for 8–12 great ones for the site, more for social).
- Watch for: product-fidelity drift, garbled fine-print on labels, off-brand scenes. Re-run individual products if needed.

---

## Track B — Website (Phase 4)

Depends on Track A's assets for the hero/gallery. While the batch runs, start the non-asset parts.

- [ ] **Refresh `apps/web` palette** from the old warm-terracotta → **Ink + Gold**, swap in the new **bloom** logo (favicon/avatar already updated; audit the rest).
- [ ] **Fill `site.config.ts` placeholders**: production WhatsApp number, legal entity name, address, founder email.
- [ ] **Hero**: best real before/after + the click-to-WhatsApp CTA (`wa.me/<number>?text=hi`).
- [ ] **Gallery**: 3–4 more before/afters across categories (from Track A).
- [ ] **Sections**: how-it-works (3 steps), pricing (₹49, first free), FAQ, footer with legal links.
- [ ] **Legal pages** live at public URLs: privacy, terms, refund/cancellation, contact (required by Razorpay + Meta).
- [ ] **Motion layer** (per [motion-website-2026.md](./motion-website-2026.md)): Motion + Lenis — hero transformation reveal, draggable before/after sliders, scroll reveals. Keep it performant (transform/opacity, `whileInView`, reduced-motion, test on low-end Android).
- [ ] **Perf + deploy**: LCP < 2.5s, mobile-first, ship to Vercel.

---

## Track C — Social media

- [ ] **Stage a clean WhatsApp demo thread** (fresh conversation, Hindi/Hinglish) and capture: a tight 3–4 bubble flow (send photo → "making your ads…" → finished ad) + a **screen-recording** of one order for reels.
- [ ] **Scrub all phone numbers** (personal + business). Blur the US test number or wait for the real one. Don't screenshot known-broken UX. ([content-legal-2026.md §4](./content-legal-2026.md).)
- [ ] **First content set**: 3–5 before/after posts (own/CC0 unbranded), 1 "how it works" (chat screenshots/recording), 1 short reel.
- [ ] Brand-comparison posts (if any) → **organic only**, honest "we tried X," never their ad image, never "better than theirs."
- [ ] Schedule the set.

---

## Decisions to lock in the morning (open from prior planning)
1. **Motion scope** — purposeful motion (recommended) vs full Awwwards spectacle.
2. **Seller wedge** — which seller type to target first (jewellers? home bakers? sweet shops? garment sellers?). Drives hero copy + which before/afters lead.
3. **Site approach** — enhance the existing `apps/web` static build vs rebuild with the motion architecture.
4. (Already decided in content-legal): website/paid = own/CC0 unbranded only; brand comparisons = organic-only.

---

## Suggested order of the morning
1. Shoot/gather products (A1) → drop in folders (A2).
2. Kick off the batch (A3) — it runs while you do the next step.
3. In parallel: refresh site palette + fill config (B, non-asset parts).
4. Review/cull generated ads (A4).
5. Drop real assets into the site, build sections + motion (B).
6. Stage WhatsApp demo + capture screenshots/recording (C).
7. Deploy site (B) + schedule first social set (C).
