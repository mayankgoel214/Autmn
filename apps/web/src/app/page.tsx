import Link from 'next/link';
import { site } from '@/site.config';
import { Bloom } from '@/components/Bloom';
import { Menu } from '@/components/Menu';
import { WaButton } from '@/components/WaButton';
import { SampleShowcase } from '@/components/SampleShowcase';

const AFTERS = [
  'earrings',
  'indian-sweets',
  'perfume-bottle',
  'handbag',
  'scented-candle',
  'serum-bottle',
  'white-sneakers',
];

const STEPS = [
  { n: '1', t: 'Send a photo', d: 'Snap your product and send it to Autmn on WhatsApp. The phone you already use.' },
  { n: '2', t: 'Pick a style', d: 'Choose a look, or let Autmn art-direct it for you. Add a note if you like.' },
  { n: '3', t: 'Get your ads', d: 'Brand-ready ads come back in minutes. Post them, list them, sell.' },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-cream">
      {/* top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-line bg-ink/80 px-5 py-4 backdrop-blur sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Bloom size={26} />
          <span className="font-heading text-[22px] font-medium">
            <span className="text-gold">Au</span>tmn
          </span>
        </Link>
        <Menu />
      </header>

      {/* hero */}
      <section className="section pb-10 pt-12 sm:pt-16">
        <p className="mb-5 text-sm font-medium tracking-wide text-gold">
          Made on WhatsApp. Back in minutes.
        </p>
        <h1 className="max-w-2xl font-heading text-[42px] font-medium leading-[1.05] tracking-tight sm:text-6xl">
          Send a photo.
          <br />
          Get a <span className="italic text-gold">studio ad</span> back.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-sand sm:text-lg">
          No app. No designer. Just WhatsApp. Snap your product, pick a style, and
          Autmn returns a brand-ready ad. Your first one is free.
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

      {/* marquee wall of ads */}
      <section id="work" className="overflow-hidden py-10">
        <div className="flex w-max animate-marquee gap-4 pl-4">
          {[...AFTERS, ...AFTERS].map((slug, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${slug}-${idx}`}
              src={`/gallery/${slug}/after.jpg`}
              alt=""
              loading="lazy"
              className="h-[200px] w-auto rounded-xl border border-ink-line object-cover sm:h-[260px]"
            />
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="section py-16">
        <h2 className="font-heading text-3xl font-medium sm:text-4xl">
          Three taps. One photo. Done.
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-ink-line bg-ink-soft p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 font-heading text-lg text-gold">
                {s.n}
              </div>
              <h3 className="font-heading text-xl text-cream">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sand">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="section py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-gold/30 bg-ink-soft p-8 text-center shadow-gold">
          <p className="text-sm uppercase tracking-[0.18em] text-sand">Pricing</p>
          <p className="mt-4 font-heading text-5xl font-medium text-cream">
            {site.currency}
            {site.pricePerImage}
            <span className="text-2xl text-sand"> / ad</span>
          </p>
          <p className="mt-3 text-sand">
            Your first ad is <span className="text-gold">completely free.</span> No
            subscription, no commitment. Pay only for what you make.
          </p>
          <WaButton label="Make my first ad" className="mt-7 w-full" />
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-ink-line px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Bloom size={22} />
            <span className="font-heading text-lg">
              <span className="text-gold">Au</span>tmn
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-sand-dim">
            <Link href="/privacy" className="hover:text-sand">Privacy</Link>
            <Link href="/terms" className="hover:text-sand">Terms</Link>
            <Link href="/refund" className="hover:text-sand">Refunds</Link>
            <Link href="/contact" className="hover:text-sand">Contact</Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-5xl text-xs text-sand-dim">
          {site.currency}
          {site.pricePerImage} per ad. First one free. {site.domain}
        </p>
      </footer>

      {/* sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-line bg-ink/90 p-3 backdrop-blur sm:hidden">
        <WaButton label="Begin your first ad" className="w-full" />
      </div>
      <div className="h-20 sm:hidden" aria-hidden="true" />
    </main>
  );
}
