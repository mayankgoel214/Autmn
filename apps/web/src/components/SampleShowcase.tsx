'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Bloom } from './Bloom';

type Sample = { slug: string; category: string };

const SAMPLES: Sample[] = [
  { slug: 'earrings', category: 'Jewellery' },
  { slug: 'indian-sweets', category: 'Sweets' },
  { slug: 'perfume-bottle', category: 'Fragrance' },
  { slug: 'handbag', category: 'Bags' },
  { slug: 'scented-candle', category: 'Home' },
  { slug: 'serum-bottle', category: 'Skincare' },
  { slug: 'white-sneakers', category: 'Footwear' },
];

/**
 * The interactive proof. Two cards (your photo, Autmn ad) for one product.
 * Tapping the centre bloom cycles to the next product, and the new pair blooms
 * in. This is the page's "try me" moment.
 */
export function SampleShowcase() {
  const [i, setI] = useState(0);
  const s = SAMPLES[i];
  const next = () => setI((v) => (v + 1) % SAMPLES.length);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-sand">
        <span>Your photo</span>
        <span className="text-gold">→</span>
        <span>Autmn ad</span>
      </div>

      {/* the pair — re-keyed so each new sample blooms in */}
      <div
        key={i}
        className="animate-bloomIn relative mx-auto h-[340px] w-full max-w-[480px] sm:h-[420px]"
      >
        {/* before: tilted, behind */}
        <div className="absolute left-1 top-9 w-[44%] max-w-[180px] -rotate-[7deg] overflow-hidden rounded-2xl border border-white/10 bg-ink-raised shadow-lift sm:left-4">
          <div className="relative aspect-[3/4]">
            <Image
              src={`/gallery/${s.slug}/before.jpg`}
              alt={`Raw phone photo of ${s.category.toLowerCase()}`}
              fill
              sizes="200px"
              className="object-cover opacity-90"
            />
          </div>
          <span className="absolute bottom-1.5 left-2 text-[10px] text-white/55">
            your photo
          </span>
        </div>

        {/* after: bigger, in front */}
        <div className="absolute right-0 top-0 w-[58%] max-w-[260px] overflow-hidden rounded-[18px] border border-gold bg-cream-deep shadow-gold">
          <div className="relative aspect-[3/4]">
            <Image
              src={`/gallery/${s.slug}/after.jpg`}
              alt={`Autmn-generated ad for ${s.category.toLowerCase()}`}
              fill
              sizes="(min-width: 640px) 260px, 60vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
          <span className="absolute left-3 top-2.5 text-[10px] uppercase tracking-[0.1em] text-gold-dark">
            Autmn ad
          </span>
          <span className="absolute bottom-2.5 right-2.5">
            <Bloom size={20} fill="rgba(23,18,14,0.55)" />
          </span>
        </div>

        {/* centre bloom button — cycles samples */}
        <button
          onClick={next}
          aria-label="Show another sample"
          className="group absolute left-[42%] top-[46%] z-10 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-gold/40 bg-ink/90 backdrop-blur transition-transform duration-300 hover:scale-110 active:scale-95"
        >
          <span className="transition-transform duration-500 group-hover:rotate-[30deg]">
            <Bloom size={34} />
          </span>
        </button>
      </div>

      {/* category + progress */}
      <div className="mt-6 flex items-center gap-4">
        <span className="font-heading text-lg text-cream">{s.category}</span>
        <div className="flex gap-1.5">
          {SAMPLES.map((x, idx) => (
            <button
              key={x.slug}
              onClick={() => setI(idx)}
              aria-label={`Show ${x.category}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? 'w-5 bg-gold' : 'w-1.5 bg-sand/40'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-sand-dim">
        Tap the bloom to see more. All made from a single phone photo.
      </p>
    </div>
  );
}
