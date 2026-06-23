import { site } from '@/site.config';
import { Logo } from '@/components/Logo';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { BeforeAfter } from '@/components/BeforeAfter';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <Gallery />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="section flex items-center justify-between py-5">
      <Logo size={34} />
      <WhatsAppButton label="Try it free" className="hidden px-5 py-2.5 text-sm sm:inline-flex" />
    </header>
  );
}

function Hero() {
  return (
    <section className="warm-gradient">
      <div className="section grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber/15 px-3 py-1 text-sm font-medium text-terracotta-dark">
            ✨ First image free
          </span>
          <h1 className="mt-5 font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {site.tagline}
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink-soft">
            Send a product photo on WhatsApp. Get a brand-ready ad back in minutes.
            No app, no studio, no design skills — just the phone you already use.
          </p>
          <p className="mt-2 max-w-md text-base text-ink-soft/80">
            Photo bhejiye, professional ad wapas paaiye. {site.currency}
            {site.pricePerImage} per image.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <WhatsAppButton label="Make my first ad — free" />
            <span className="text-sm text-ink-soft">No sign-up. Works on WhatsApp.</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-amber/20 to-terracotta/20 blur-2xl" />
          <BeforeAfter category="Your product → a ready-to-post ad" />
          <p className="mt-3 text-center text-xs text-ink-soft/60">
            Real seller example coming soon
          </p>
        </div>
      </div>
    </section>
  );
}

function Gallery() {
  const categories = ['Jewellery', 'Food', 'Garments'];
  return (
    <section className="section py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          One photo in. A whole catalogue out.
        </h2>
        <p className="mt-3 text-ink-soft">
          Every category, every style — lifestyle, clean studio, festive, and more.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {categories.map((c) => (
          <BeforeAfter key={c} category={c} />
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Send a photo',
      body: 'Message us on WhatsApp with a photo of your product — even a plain phone snap works.',
    },
    {
      n: '2',
      title: 'Pick a style',
      body: 'Choose up to 3 looks, or let our AI pick the best. Add instructions by text or voice.',
    },
    {
      n: '3',
      title: 'Get your ads',
      body: `Professional, ready-to-post images back in minutes. ${site.currency}${site.pricePerImage} each — first one free.`,
    },
  ];
  return (
    <section className="bg-cream-deep py-16 sm:py-24">
      <div className="section">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-ink-soft">Three steps. All inside WhatsApp.</p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="text-center sm:text-left">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta font-heading text-xl font-semibold text-cream sm:mx-0">
                {s.n}
              </div>
              <h3 className="mt-4 font-heading text-xl font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="section py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-4xl bg-white p-8 text-center shadow-card ring-1 ring-ink/5">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-ink">
          Simple pricing
        </h2>
        <div className="mt-6 flex items-end justify-center gap-1">
          <span className="font-heading text-6xl font-semibold text-terracotta">
            {site.currency}
            {site.pricePerImage}
          </span>
          <span className="mb-2 text-ink-soft">/ image</span>
        </div>
        <p className="mt-2 font-medium text-olive">Your first image is completely free.</p>
        <ul className="mt-6 space-y-3 text-left text-ink-soft">
          {[
            'Pay only for the images you keep',
            'Up to 3 styles per product',
            'Add instructions by text or voice',
            'Delivered in minutes, right on WhatsApp',
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 text-olive">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <WhatsAppButton label="Start free" className="mt-8 w-full" />
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    {
      q: 'Do I need to download an app?',
      a: 'No. Autmn works entirely inside WhatsApp on the phone you already use.',
    },
    {
      q: 'How much does it cost?',
      a: `${site.currency}${site.pricePerImage} per finished image, and your very first one is free so you can try it risk-free.`,
    },
    {
      q: 'How long does it take?',
      a: 'Most ads are ready within a few minutes of sending your photo.',
    },
    {
      q: 'What if I don’t like the result?',
      a: 'If something went wrong with your order, you can request a refund right in the chat and our team will review it.',
    },
    {
      q: 'What kinds of products work?',
      a: 'Jewellery, food, garments, skincare, candles, bags, and more — anything you sell.',
    },
  ];
  return (
    <section className="bg-cream-deep py-16 sm:py-24">
      <div className="section mx-auto max-w-2xl">
        <h2 className="text-center font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Questions
        </h2>
        <div className="mt-10 space-y-4">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5"
            >
              <summary className="cursor-pointer list-none font-heading text-lg font-medium text-ink marker:hidden">
                {f.q}
              </summary>
              <p className="mt-2 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 text-center">
          <WhatsAppButton label="Make my first ad — free" />
        </div>
      </div>
    </section>
  );
}
