'use client';

import { useState } from 'react';
import { site } from '@/site.config';
import { WaButton } from './WaButton';
import { BeforeAfterSlider } from './BeforeAfterSlider';

const PRODUCTS = [
  { slug: 'earrings', label: 'Jewellery' },
  { slug: 'indian-sweets', label: 'Sweets' },
  { slug: 'perfume-bottle', label: 'Fragrance' },
  { slug: 'handbag', label: 'Bags' },
  { slug: 'scented-candle', label: 'Home' },
  { slug: 'serum-bottle', label: 'Skincare' },
  { slug: 'white-sneakers', label: 'Footwear' },
];

export function DesktopHero() {
  const [slug, setSlug] = useState('earrings');

  return (
    <section className="mx-auto grid min-h-[88vh] max-w-7xl grid-cols-2 items-center gap-16 px-12 py-10">
      {/* left: copy */}
      <div>
        <p className="mb-7 text-base font-medium tracking-wide text-gold">
          Made on WhatsApp. Back in minutes.
        </p>
        <h1 className="font-heading text-[88px] font-medium leading-[0.98] tracking-tight">
          Send a photo.
          <br />
          Get a <span className="italic text-gold">studio ad.</span>
        </h1>
        <p className="mt-8 max-w-md text-xl leading-relaxed text-sand">
          No app. No designer. Just WhatsApp. Snap your product, pick a style, and
          Autmn returns a brand-ready ad. Your first one is free.
        </p>

        <div className="mt-10 flex items-center gap-5">
          <WaButton label="Begin your first ad" />
          <span className="text-sm text-sand-dim">
            {site.currency}
            {site.pricePerImage} an ad after your free one.
          </span>
        </div>

        {/* product switcher */}
        <div className="mt-12 flex flex-wrap gap-2.5">
          {PRODUCTS.map((p) => (
            <button
              key={p.slug}
              onClick={() => setSlug(p.slug)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                slug === p.slug
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-ink-line text-sand hover:border-gold/40 hover:text-cream'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* right: the draggable slider */}
      <div className="flex justify-end">
        <BeforeAfterSlider slug={slug} className="w-full max-w-[440px]" />
      </div>
    </section>
  );
}
