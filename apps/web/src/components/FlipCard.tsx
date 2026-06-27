'use client';

import { useState } from 'react';
import { Bloom } from './Bloom';

/**
 * Cue card. Front = the raw phone photo, back = the Autmn ad. Click to flip
 * (3D), click again to flip back. The interactive proof: one tap turns a
 * snapshot into a studio ad.
 */
export function FlipCard({
  slug,
  label,
  className = '',
}: {
  slug: string;
  label: string;
  className?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={`${label}: tap to ${flipped ? 'see the photo' : 'reveal the Autmn ad'}`}
      className={`group block w-full [perspective:1600px] ${className}`}
      style={{ aspectRatio: '4 / 5' }}
    >
      <div
        className="relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* FRONT — your photo */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl border border-ink-line [backface-visibility:hidden]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/gallery/${slug}/before.jpg`}
            alt={`Raw phone photo of ${label.toLowerCase()}`}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />
          <span className="absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs uppercase tracking-[0.12em] text-sand backdrop-blur">
            Your photo
          </span>
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between">
            <span className="font-heading text-2xl text-cream">{label}</span>
            <span className="flex items-center gap-2 rounded-full bg-gold px-3.5 py-2 text-xs font-medium text-ink transition-transform group-hover:scale-105">
              Tap to transform <Bloom size={14} fill="#17120E" />
            </span>
          </div>
        </div>

        {/* BACK — Autmn ad */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl border border-gold/60 shadow-gold [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/gallery/${slug}/after.jpg`}
            alt={`Autmn ad for ${label.toLowerCase()}`}
            draggable={false}
            className="h-full w-full object-cover"
          />
          <span className="absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs uppercase tracking-[0.12em] text-gold backdrop-blur">
            Autmn ad
          </span>
          <span className="absolute bottom-4 right-4">
            <Bloom size={22} fill="rgba(247,242,233,0.9)" />
          </span>
          <span className="absolute inset-x-0 bottom-4 text-center text-xs text-cream/70">
            tap to flip back
          </span>
        </div>
      </div>
    </button>
  );
}
