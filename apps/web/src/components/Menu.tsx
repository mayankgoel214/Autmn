'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { WaButton } from './WaButton';

const NAV = [
  { label: 'See the work', href: '#work' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
];

const LEGAL = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refund' },
  { label: 'Contact', href: '/contact' },
];

export function Menu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists on the client. The overlay must render into
  // document.body (not inside the backdrop-blur header, whose filter creates a
  // containing block that would clip a `fixed` child to the header height).
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const overlay = (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between px-6 py-5">
        <span className="font-heading text-xl text-cream">
          <span className="text-gold">Ma</span>rquee
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="flex h-9 w-9 items-center justify-center text-3xl leading-none text-sand hover:text-cream"
        >
          ×
        </button>
      </div>

      <nav className="flex flex-1 flex-col justify-center gap-3 px-6">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className="font-heading text-4xl text-cream transition-colors hover:text-gold"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="px-6 pb-10">
        <WaButton label="Start on WhatsApp" className="mb-8 w-full" />
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-sand-dim">
          {LEGAL.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="hover:text-sand"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center text-2xl leading-none text-sand transition-colors hover:text-cream"
      >
        ☰
      </button>
      {open && mounted && createPortal(overlay, document.body)}
    </>
  );
}
