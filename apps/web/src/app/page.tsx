import Link from 'next/link';
import { site, whatsappLink, PORTFOLIO_MODE } from '@/site.config';
import { Bloom } from '@/components/Bloom';
import { Menu } from '@/components/Menu';
import { WaButton } from '@/components/WaButton';
import { Reveal } from '@/components/Reveal';
import { SampleShowcase } from '@/components/SampleShowcase';
import { DesktopHero } from '@/components/DesktopHero';
import { FlipCard } from '@/components/FlipCard';
import { Ambient } from '@/components/Ambient';
import { CategoryMarquee } from '@/components/CategoryMarquee';

const GALLERY = [
  { slug: 'earrings', label: 'Jewellery' },
  { slug: 'indian-sweets', label: 'Sweets' },
  { slug: 'perfume-bottle', label: 'Fragrance' },
  { slug: 'handbag', label: 'Bags' },
  { slug: 'scented-candle', label: 'Home' },
  { slug: 'serum-bottle', label: 'Skincare' },
];

const STEPS = [
  { n: '1', t: 'Send a photo', d: 'Snap your product and send it to Marquee on WhatsApp. The phone you already use.' },
  { n: '2', t: 'Pick a style', d: 'Choose a look, or let Marquee art-direct it for you. Add a note if you like.' },
  { n: '3', t: 'Get your ads', d: 'Brand-ready ads come back in minutes. Post them, list them, sell.' },
];

const NAV = [
  { label: 'See the work', href: '#work' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
];

export default function Home() {
  return (
    <main className="relative isolate min-h-screen text-cream">
      <Ambient />
      {/* top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-line bg-ink/80 px-5 py-4 backdrop-blur sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <Bloom size={26} />
          <span className="font-heading text-[22px] font-medium">
            <span className="text-gold">Ma</span>rquee
          </span>
        </Link>
        {/* desktop nav */}
        <nav className="hidden items-center gap-9 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm text-sand transition-colors hover:text-cream">
              {n.label}
            </a>
          ))}
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-gold/50 px-5 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
          >
            {PORTFOLIO_MODE ? 'View the code' : 'Start on WhatsApp'}
          </a>
        </nav>
        {/* mobile menu */}
        <div className="lg:hidden">
          <Menu />
        </div>
      </header>

      {/* ── MOBILE HERO ─────────────────────────────────────────────── */}
      <section className="section pb-10 pt-12 lg:hidden">
        <p className="mb-5 text-sm font-medium tracking-wide text-gold">
          Made on WhatsApp. Back in minutes.
        </p>
        <h1 className="max-w-2xl font-heading text-[42px] font-medium leading-[1.05] tracking-tight">
          Send a photo.
          <br />
          Get a <span className="italic text-gold">studio ad</span> back.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-sand">
          No app. No designer. Just WhatsApp. Snap your product, pick a style, and
          Marquee returns a brand-ready ad. Your first one is free.
        </p>
        <div className="mt-12">
          <SampleShowcase />
        </div>
        <div className="mt-12 flex flex-col items-center">
          <WaButton label="Begin your first ad" />
          <p className="mt-3 text-xs text-sand-dim">
            Opens WhatsApp. {site.currency}
            {site.pricePerImage} an ad after your free one.
          </p>
        </div>
      </section>

      {/* ── DESKTOP HERO ────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <DesktopHero />
      </div>

      {/* ── CATEGORY MARQUEE (motion band) ──────────────────────────── */}
      <CategoryMarquee />

      {/* ── TRANSFORM GALLERY (shared, interactive cue cards) ───────── */}
      <section id="work" className="section py-16 lg:max-w-7xl lg:py-28">
        <Reveal>
          <h2 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl lg:text-[56px] lg:leading-[1.02]">
            Click a card. <span className="italic text-gold">Watch it transform.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sand lg:text-lg">
            Real products, shot on a phone. Tap any card to flip from the raw
            snapshot to the finished Marquee ad.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:mt-16 lg:gap-7">
          {GALLERY.map((g, i) => (
            <Reveal key={g.slug} delay={i * 70}>
              <FlipCard slug={g.slug} label={g.label} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS (shared) ───────────────────────────────────── */}
      <section id="how" className="section py-16 lg:max-w-6xl lg:py-28">
        <Reveal>
          <h2 className="font-heading text-3xl font-medium sm:text-4xl lg:text-5xl">
            Three taps. One photo. Done.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-3 lg:mt-14 lg:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div className="h-full rounded-2xl border border-ink-line bg-ink-soft p-6 lg:p-8">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 font-heading text-lg text-gold lg:h-12 lg:w-12 lg:text-xl">
                  {s.n}
                </div>
                <h3 className="font-heading text-xl text-cream lg:text-2xl">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand lg:text-base">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PRICING (shared) ────────────────────────────────────────── */}
      <section id="pricing" className="section py-16 lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-md rounded-3xl border border-gold/30 bg-ink-soft p-8 text-center shadow-gold lg:max-w-lg lg:p-12">
            <p className="text-sm uppercase tracking-[0.18em] text-sand">Pricing</p>
            <p className="mt-4 font-heading text-5xl font-medium text-cream lg:text-6xl">
              {site.currency}
              {site.pricePerImage}
              <span className="text-2xl text-sand"> / ad</span>
            </p>
            <p className="mt-3 text-sand lg:text-lg">
              Your first ad is <span className="text-gold">completely free.</span> No
              subscription, no commitment. Pay only for what you make.
            </p>
            <WaButton label="Make my first ad" className="mt-7 w-full" />
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-ink-line px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Bloom size={22} />
            <span className="font-heading text-lg">
              <span className="text-gold">Ma</span>rquee
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-sand-dim">
            <Link href="/privacy" className="hover:text-sand">Privacy</Link>
            <Link href="/terms" className="hover:text-sand">Terms</Link>
            <Link href="/refund" className="hover:text-sand">Refunds</Link>
            <Link href="/contact" className="hover:text-sand">Contact</Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-xs text-sand-dim">
          {site.currency}
          {site.pricePerImage} per ad. First one free. {site.domain}
        </p>
      </footer>

      {/* sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-line bg-ink/90 p-3 backdrop-blur lg:hidden">
        <WaButton label="Begin your first ad" className="w-full" />
      </div>
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </main>
  );
}
