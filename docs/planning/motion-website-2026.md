# Motion website — research & plan

**Status:** Research + plan. No build yet. Build happens AFTER the live test (we need real before/after assets first).
**Owner:** Mayank
**Built from:** launch-plan PDF Phase 4b/4c, motion-web research on 2026-06-22, the locked brand (aperture-bloom, Ink + Gold, Fraunces + Inter).

---

## 1. Is a motion website a good idea for Autmn? — Yes, but a *specific kind*

The honest answer hinges on one question the launch doc already half-answers: **who is the landing page for?**

Two audiences, pulling in opposite directions:

| Audience | What they need | Implication |
|---|---|---|
| **Buyers** — Indian micro-sellers (jewellers, home bakers, garment sellers) | Fast, trustworthy, "is this legit + how do I start" → then tap WhatsApp. The doc says **"mobile-first, your audience is 100% on phones."** Often cheap Androids, patchy 4G. | A heavy WebGL/award-site experience would *hurt* their conversion. Speed converts: research shows a 0.1s speed gain → ~26% more form submissions. |
| **Everyone else** — press, investors, partners, and the *content itself* (the site shown in Instagram reels) | "Is this a serious, modern AI company?" Credibility + wow-factor. | Motion shines here. Signals we're a real, modern image-gen product. |

**Verdict: do motion — but "purposeful motion," not "spectacle motion."**

The killer insight: **the site has no app UI, so the site itself IS the product demo.** The most creative *and* on-message thing we can do is animate the actual transformation — a plain phone photo *blooming* into a finished ad. That's motion that sells, not motion that decorates. It ties directly to our logo (the aperture-bloom literally opens like a shutter), demonstrates the value in 2 seconds, and doubles as content we can screen-record for Instagram.

What we must NOT do: a 3D/Three.js/Spline-heavy site that janks on a ₹8,000 Android or eats 15MB on a 4G connection. That trades our actual buyers for Awwwards clout.

**Recommendation:** tasteful, performant, mobile-first motion centered on the photo→ad transformation. Award-site *feel*, conversion-site *engineering*.

---

## 2. How motion websites are made (the toolkit)

The 2026 stack for the Awwwards-style sites you like:

| Layer | Tool | Role | Use for Autmn? |
|---|---|---|---|
| Framework | **Next.js** (already chosen) | pages, routing, SSG | ✅ yes |
| Styling | **Tailwind** (already chosen) | utility CSS | ✅ yes |
| Component / scroll reveals | **Motion** (formerly Framer Motion, motion.dev) | declarative React animations, `whileInView`, exit transitions, layout animations | ✅ primary — this is the "Framer/Trimmel Motion" you heard |
| Smooth scroll | **Lenis** (darkroom engineering) | buttery native-scroll wrapper; drives parallax/scroll scenes | ✅ yes, light touch (respect reduced-motion) |
| Heavy scroll sequences | **GSAP + ScrollTrigger** | timeline-precise, performance-critical scroll choreography; used by Disney/Apple/Stripe | ⚠️ only if one signature sequence needs it; otherwise skip to stay lean |
| 3D / WebGL | Three.js / R3F / Spline | immersive 3D | ❌ avoid for v1 — too heavy for our audience |

Notes from the research:
- **Motion** ≈ 30KB gz, declarative, React-native feel — perfect for reveals, the bloom animation, page transitions.
- **GSAP** core ≈ 27KB; doesn't trigger React re-renders (own rAF loop) — best for complex/perf-critical. We likely don't need it for v1.
- **Lenis** keeps `position: sticky`, anchors, and accessibility working — safe smooth-scroll.
- Learning resource: **Olivier Larose** (blog.olivierlarose.com) — his Next.js + Framer Motion + Lenis tutorials are exactly this genre (page transitions, SVG masks, parallax, Awwwards menus).

### Performance rules (non-negotiable for our audience)
From the mobile-performance research:
- Animate **only `transform` and `opacity`** (GPU-cheap). Never animate width/height/top/left.
- Trigger on visibility with **Intersection Observer** / Motion's `whileInView` — don't run offscreen animations.
- **Lazy-load** heavy assets (images, any Lottie/JSON, video) with placeholders.
- Respect **`prefers-reduced-motion`** — serve a calm, near-static version.
- **Progressive enhancement** — simpler animations (fades, small slides) on low-power devices; detect and degrade.
- Keep **LCP fast** — the hero's first paint must not wait on JS. Above-the-fold promise + CTA render immediately; motion enhances after.
- **Test on a real low-end Android + throttled 4G**, not just a MacBook.

---

## 3. The Autmn motion concept (creative direction)

**Theme: "Watch it bloom."** The site demonstrates the product by showing transformations, with the aperture-bloom as the connective motif (it opens like a shutter between states).

Section-by-section, mapped to the doc's Phase 4c prerequisites, each with a *performant* motion treatment:

1. **Hero (above the fold)** — promise headline + the click-to-WhatsApp CTA render instantly (fast LCP). Beside/below it, the signature moment: a plain phone snap that **blooms into a finished ad** on load (aperture-bloom "opens" to reveal the polished version). Loops subtly. This is the whole pitch in 2 seconds. CTA: `wa.me/<number>?text=hi`.
2. **Before → After gallery (the proof)** — scroll-triggered before/after *wipes* across 3–4 categories (jewellery, food, garments, +1). A draggable slider on each (before|after) so the visitor controls the reveal — interactive, low-cost, very convincing. (REAL assets from the live test go here.)
3. **How it works (3 steps)** — send a photo → pick a style → get your ads. Each step fades/slides in on scroll; the bloom shutter transitions between them.
4. **Pricing** — ₹49/image, first free. Clean card, gentle count-up or fade. No gimmicks here — trust moment.
5. **FAQ** — accordion, simple height/opacity reveals.
6. **Footer** — legal links (privacy/terms/refund/contact), WhatsApp CTA repeated.

Recurring motif: the **bloom watermark animates in** on each shown "after" image (mirrors what users get on real outputs) — reinforces the brand mark and the "AI-made" signature.

Signature moments to get right (and keep cheap): (a) hero photo→ad bloom-reveal, (b) the draggable before/after sliders, (c) bloom shutter section transitions. Everything else = quiet fades/slides.

---

## 4. Prerequisites checklist (from the launch doc — must all ship)

### 4c — Landing page (conversion)
- [ ] One page, **mobile-first**
- [ ] Above the fold: the promise + **click-to-WhatsApp button** (`wa.me/<number>?text=hi`)
- [ ] **One hero before/after** — a REAL seller's phone photo → generated ad (the doc: "the single most important piece of marketing content," real not AI-mocked)
- [ ] **3 more before/afters** across categories (jewellery, food, garment)
- [ ] How it works (3 steps), pricing, FAQ
- [ ] Footer with **legal links**

### 4b — Legal pages (REQUIRED by Razorpay + Meta) — already drafted, carry over
- [ ] Privacy Policy (covers image data, payments, DPDP)
- [ ] Terms of Service (₹49/image, first free, no edits)
- [ ] Refund / Cancellation policy (the manual-review flow)
- [ ] Contact page (business name, email, address)
- [ ] All four at public URLs

### Brand inputs (mostly done)
- [x] Logo / mark — aperture-bloom kit in `Autmn_Logos/`
- [x] Palette — Ink + Gold; Type — Fraunces + Inter
- [ ] **Refresh the existing `apps/web` from the old warm-terracotta palette → Ink + Gold** (flagged earlier)
- [ ] Fill `apps/web/src/site.config.ts` placeholders: WhatsApp number, legal entity, address, founder email

### The hard dependency
- [ ] **Real before/after assets** — produced by the live test. The motion site cannot be finalized until we run the test and capture outputs. This is why we test first, then build.

---

## 5. Products for the live test + comparison content

Goal: pick products we can **actually use**, in Autmn's categories, that **already have professional brand ad photography** — so one content series is **"Autmn (₹49, from a phone snap) vs the brand's real studio shoot."**

### Selection criteria
1. Likely **on-hand** for a founder (or cheaply bought today).
2. In an Autmn **category** (jewellery, food, skincare/beauty, candle/home, bags, electronics, garments).
3. Has **iconic existing ads** to compare against.
4. **Photographs well** from a phone (clear product, simple to shoot).

### Recommended test set (start with ~8)

| # | Product | Category | Why — and the comparison angle |
|---|---|---|---|
| 1 | **boAt earbuds / headphones** | Electronics | Almost everyone owns a pair; boAt's ads are iconic and high-gloss. Great "phone snap → boAt-grade ad" comparison. |
| 2 | **Minimalist / The Derma Co serum bottle** | Skincare | Clean studio bottle ads are the category standard; tests label fidelity + reflective glass (a known hard case). |
| 3 | **The Whole Truth / Yoga Bar protein bar** | Food | Premium minimalist packaging + famous clean ads; tests text/logo preservation. |
| 4 | **Sugar / Lakmé lipstick** | Beauty | Glossy macro ads; tests small reflective product + color accuracy. |
| 5 | **Paper Boat / a glass cola bottle** | Beverage/Food | Iconic packaging and ads; tests transparency + condensation/lifestyle scenes. |
| 6 | **A sneaker (Campus / Nike / Adidas)** | Footwear/Garments | Sneaker ads are a whole genre; tests pair alignment + sole detail. |
| 7 | **A scented candle** | Candle / Home decor | Direct category fit; tests warm lighting + container + label. |
| 8 | **A handbag / backpack (Wildcraft / Baggit / Lavie)** | Bags | Catalog ads exist; tests hardware (zips, straps) + 3/4 framing. |

Optional adds if on-hand: **Amul/Cadbury chocolate** (food, iconic), **Noise smartwatch** (electronics), a **jewellery piece** (harder to match a specific brand ad — use own piece, compare to category standard).

### ⚠️ Legal note on the comparison content (important)
Using another brand's product in honest "we tried X" comparison/review content is generally fine (nominative use), **but**:
- Don't use their **logos as if they're ours**, don't imply **endorsement/partnership**, and keep claims **truthful** ("our ₹49 result" vs "their studio shoot" — factual, not disparaging).
- **Paid ads** invoke comparative-advertising rules (India's ASCI + Trademark Act) — be more careful there.
- **Recommendation:** use brand-comparison pieces as **organic** content (Instagram/reels, educational framing). For the **website hero and paid ads**, prefer **our own / generic / consenting-seller products** so there's zero trademark exposure on our highest-stakes surfaces. Best of all: real before/afters from the **friendly sellers** we onboard (Phase 6) — authentic, ours to use, and the doc says these convert best anyway.

---

## 6. Recommended build approach (when we return, post-test)

1. **Run the live test** → capture 8–12 before/after sets across categories. Save raw phone photos + Autmn outputs.
2. **Refresh `apps/web`** to Ink + Gold + new bloom (the current build uses the old warm palette).
3. **Layer in motion** with Motion + Lenis: hero bloom-reveal, draggable before/after sliders, scroll reveals, bloom section transitions. GSAP only if one sequence demands it.
4. **Drop in real assets** (hero + gallery).
5. **Fill `site.config.ts`** placeholders.
6. **Perf pass**: test on low-end Android + throttled 4G; verify reduced-motion; LCP < 2.5s.
7. Ship to Vercel.

Effort estimate: the motion layer is ~2–3 focused days on top of the existing static site, *plus* the test + asset capture.

---

## 7. Open questions for when you're back
- Confirm the motion scope: "purposeful motion" (my rec) vs full Awwwards spectacle (heavier, riskier for buyers)?
- Which categories to prioritize for the hero/gallery (depends on which wedge seller type we target first — jewellers? home bakers? garment sellers?).
- Brand-comparison content: organic-only (safer) vs also in ads (riskier)?
- Do we keep the current static `apps/web` and enhance it, or rebuild the page with the motion architecture from scratch?

Sources: [Awwwards — Framer Motion sites](https://www.awwwards.com/websites/framer-motion/), [Motion (motion.dev)](https://motion.dev/), [GSAP vs Motion 2026](https://lab.good-fella.com/blog/gsap-vs-framer-motion-vs-react-spring), [Lenis](https://github.com/darkroomengineering/lenis), [Olivier Larose tutorials](https://blog.olivierlarose.com/), [mobile animation performance](https://nitropack.io/blog/speed-up-mobile-website/).
