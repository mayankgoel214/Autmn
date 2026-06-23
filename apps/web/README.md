# @autmn/web — marketing site + legal pages

Next.js 15 (App Router) + Tailwind. Deploys to Vercel. Covers launch-plan Phase 4
(brand, website, legal).

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page (hero, before/after gallery, how-it-works, pricing, FAQ) |
| `/privacy` | Privacy Policy (DPDP-aware) |
| `/terms` | Terms of Service |
| `/refund` | Refund & Cancellation Policy |
| `/contact` | Contact + business details |
| `/brand` | Internal brand sheet (palette, type, logo, WhatsApp profile copy) — noindex |

## Before going live — fill these in

Everything business-specific lives in **one file**: [`src/site.config.ts`](src/site.config.ts).
Any value left as `PLACEHOLDER_*` renders a visible `[TODO]` badge on the page, so
nothing fake ships silently. You must set:

- `whatsappNumber` — business number, international format, digits only (e.g. `919876543210`). Until set, every CTA shows "(set number)" instead of linking.
- `email.founder`
- `legal.entityName`, `entityType`, `address`, `city`, `state`, `pincode`, `governingLawCity`
- `legal.gstin` — only if GST-registered (leave `''` otherwise)

## Before/after assets (highest-value marketing content)

Placeholder slots render until real images exist. Drop real seller before/after
images into `/public/before-after/` and pass their paths to `<BeforeAfter beforeSrc afterSrc />`
in [`src/app/page.tsx`](src/app/page.tsx). The launch plan calls these "the single
most important piece of marketing content" — use **real** seller shots, not AI mocks.

## Brand assets

- `/public/favicon.svg` — favicon
- `/public/avatar.svg` — WhatsApp avatar (export to 512×512 PNG before uploading to WhatsApp Business)
- Logo component: [`src/components/Logo.tsx`](src/components/Logo.tsx)

## Dev

```bash
pnpm --filter @autmn/web dev    # http://localhost:3002
pnpm --filter @autmn/web build  # production build
```

## Deploy (Vercel)

Set the Vercel project root to `apps/web`. Build command `pnpm build`, output is
auto-detected (Next.js). No env vars required for the site itself — all content is
in `site.config.ts`.
