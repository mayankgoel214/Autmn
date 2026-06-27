# Autmn website — the experience plan

**Status:** Design + build plan. Supersedes the lighter [motion-website-2026.md](./motion-website-2026.md) with the full "overwhelmingly stunning, design-brand" vision.
**Goal:** A landing page so visually stunning that a seller's reaction is *"I need to try this."* It must itself be the proof that Autmn is a design specialist — the site IS the portfolio.
**Brand:** Ink (#17120E) + Gold (#C99A3F) + Cream (#F7F2E9). Fraunces (serif display) + Inter (UI). The aperture-bloom mark.

---

## 1. The core idea

There's no app UI to show, so **the website demonstrates the product by being a gallery of transformations.** The whole site is one message, told as you scroll: *a plain phone photo becomes a studio-grade ad — in seconds, on WhatsApp, for ₹49.*

The signature mechanic: **scroll-driven, full-screen "scenes."** Each section pins to the viewport and transforms as you scroll (the screen *changes* rather than just sliding) — the Apple-product-page / Awwwards-SOTD feel. The hero transformation is the bloom opening like a camera shutter: a raw snapshot blooms into a finished ad.

---

## 2. Mobile-first — this is the primary canvas (LOCKED)

**Traffic comes from Instagram → almost everyone lands on the phone first.** So we design the **mobile layout first** (smallest screen, then progressively enhance up to desktop) — not a desktop site with elements hidden. The mobile experience is THE experience; desktop is the enhancement.

Mobile-first principles for Autmn:
- **Vertical, full-screen scroll-snap scenes** — each viewport is one "card" you flick through, reel-like (it should feel like a continuation of the Instagram reel that sent them here).
- **No scroll-jacking that fights native momentum scroll** — on touch, hijacking the scroll feels broken. Use scroll-*snap* + scroll-*triggered* reveals (IntersectionObserver), not scrubbed pin-jacking, on mobile. Save heavy pinned scrubbing for desktop only.
- **Kinetic typography** (the standout 2026 trend) — big Fraunces headlines that react to scroll velocity; cheap to do, feels alive.
- **Thumb-friendly** — primary CTA always reachable in the thumb zone; big tap targets; the wa.me button repeats down the page.
- **Fast or nothing** — buyers on cheap Androids / 4G. LCP < 2.5s, lazy-load every image, `prefers-reduced-motion` honored, total payload tight.
- **Desktop = enhancement** — the same scenes, larger, with the heavier pinned cinematic scrubbing layered on for capable devices.

---

## 3. The scroll narrative (section by section)

Each is a full-height "scene." Desktop pins + animates on scroll; mobile scroll-snaps.

1. **Hero — "Watch it bloom."**
   Ink canvas. A huge Fraunces headline + the bloom mark. Center: a raw phone photo of a product that, as you scroll (or on a 3s loop), the aperture-bloom *opens over it* and reveals the finished ad. The promise + the WhatsApp CTA sit immediately (fast first paint). One line: *"Send a photo. Get a studio ad back. ₹49. First one free."*

2. **The transformation reel — full-screen before→after.**
   A pinned sequence: each scroll tick swaps to a new category (jewellery → food → skincare → bags…), the raw photo on one side morphing into the Autmn ad on the other. A draggable slider on each lets the visitor *control* the reveal — interactive, addictive, undeniable proof. (Real assets from our generated set.)

3. **How it works — 3 beats, on WhatsApp.**
   Stylized WhatsApp thread that types itself out as you scroll: *send photo → pick a style → ads arrive.* Reinforces "no app, the phone you already use." Each beat pinned, then released.

4. **The range — a living wall of ads.**
   A slow horizontal marquee of finished Autmn ads across categories, each stamped with the bloom watermark. Says "we do everything" without a word.

5. **Pricing — one honest moment.**
   Calm, centered, no gimmicks. ₹49 per ad, first one free. The trust beat after the spectacle.

6. **The CTA — "Start now."**
   The number-capture (see §5). Big, confident, gold-on-ink. Below it, the footer with all legal links.

Recurring motif: the bloom shutter wipes between scenes; the gold watermark animates onto each "after" image (mirrors what users actually receive).

---

## 4. How we display the images (elegantly, not a grid)

- **Hero:** ONE perfect transformation, animated. Not a collage — restraint = premium.
- **Before/after sliders:** interactive drag-to-reveal per category. The single most convincing element; make it the centerpiece.
- **Full-bleed scenes:** the strongest ads shown edge-to-edge, one at a time, pinned — like a fashion lookbook.
- **Marquee wall:** the breadth, in motion, low cognitive load.
- **Curation > volume:** 6–8 *flawless* before/afters beat 30 average ones. We pick the best from the generated set (and prioritize real seller before/afters as we get them — they convert hardest).
- **Consistency:** every "after" carries the bloom watermark; every scene uses the same Ink/Gold/Cream system and Fraunces headlines. The site feels art-directed because it is.

---

## 5. The CTA — click-to-WhatsApp (LOCKED, dead simple)

The user taps a button → their WhatsApp opens with a message pre-filled to *our* number → they hit send → the existing bot pipeline takes over. **User-initiated, so no Meta template, no opt-in form, no approval wait — it just works.**

- Implementation: a link — **`https://wa.me/<AUTMN_NUMBER>?text=hi`** (or a friendlier prefill like *"Hi Autmn, I want to make my first ad"*).
- On mobile (the primary case) this opens the WhatsApp app instantly — one tap, zero friction. Perfect for the Instagram→site→WhatsApp path.
- On desktop it opens WhatsApp Web / the desktop app.
- Copy: *"Click here to begin"* / *"Start your first ad — free"* / *"Make my ad ✦"*.
- The button **repeats down the page** (hero, after the before/afters, after pricing, sticky footer bar on mobile) so the CTA is always a thumb-tap away.

Build requirement: just the `AUTMN_NUMBER` in `site.config.ts` and the prefill text. Nothing backend-side. (We can A/B the prefill text later.)

---

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | already standard here |
| Styling | Tailwind | already standard |
| Scroll engine | **GSAP + ScrollTrigger** | the pinned, scrub-driven full-screen scenes need timeline precision; GSAP is the award-site standard |
| Smooth scroll | **Lenis** | buttery scroll that drives the pins; keeps anchors/accessibility working |
| Component motion | **Motion** (framer) | reveals, the bloom shutter, micro-interactions, page transitions |
| Fonts | Fraunces + Inter (self-hosted/`next/font`) | premium + fast |
| 3D | **none for v1** | too heavy for our audience; revisit only if a single lightweight hero moment earns it |

**Performance rules (non-negotiable):** animate transform/opacity only; lazy-load every image with low-res placeholders; `prefers-reduced-motion` serves a calm version; pins/scrub disabled on low-power/mobile in favor of scroll-snap; LCP < 2.5s; test on a real ₹8k Android + throttled 4G.

---

## 7. Legal (required, ship with launch)

Public pages, linked in the footer: **Privacy Policy, Terms of Service, Refund/Cancellation, Contact.** Required by Razorpay + Meta. Privacy must cover image data, payments (UPI/Razorpay), WhatsApp opt-in, and DPDP. Already drafted earlier — port + restyle to Ink/Gold.

---

## 8. Build phases

1. **Foundation** — Next.js app refreshed to Ink+Gold + Fraunces + bloom; `site.config.ts` filled (WhatsApp number, entity, email).
2. **Static skeleton** — all sections laid out, real before/afters dropped in, legal pages live. Ships as a clean fast site even before motion.
3. **Motion layer** — Lenis + GSAP pins for the hero transformation, the before/after reel, the WhatsApp-thread typing, the marquee. Motion micro-interactions + bloom shutter wipes.
4. **The CTA engine** — `/api/start` + template (submit for approval in phase 1 so it's ready) + opt-in + wa.me fallback.
5. **Perf + polish** — mobile graceful-degradation, reduced-motion, Lighthouse, real-device test.
6. **Ship** — Vercel.

---

## 9. Decisions (LOCKED)
1. **Mobile-first** is the primary canvas (Instagram traffic). Desktop is the enhancement.
2. **Scroll feel:** scroll-snap + scroll-triggered reveals on mobile (no scroll-jacking on touch); heavier pinned/scrubbed cinematic only layered on for desktop.
3. **CTA:** click-to-WhatsApp `wa.me` — user taps, sends "hi", bot takes over. No template/opt-in. Repeats down the page.
4. **Assets:** launch with the generated CC0 before/afters; Mayank will mark which to swap for real ones (likely same day).
5. **Domain:** `autmn.ai`. Used in legal pages + metadata.

---

Sources: [Meta — get opt-in for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in), [Meta — template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages/), [WhatsApp API templates guide 2026](https://gurusup.com/blog/whatsapp-api-message-templates), [Awwwards — scroll/Framer Motion sites](https://www.awwwards.com/websites/framer-motion/), [Lenis](https://github.com/darkroomengineering/lenis).
