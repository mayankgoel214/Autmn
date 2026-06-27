import Link from 'next/link';
import { site } from '@/site.config';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t border-ink-line bg-ink-soft">
      <div className="section flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Logo size={32} />
          <p className="mt-3 text-sm text-sand">{site.tagline}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-medium text-cream">Legal</span>
          <Link href="/privacy" className="text-sand hover:text-gold">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-sand hover:text-gold">
            Terms of Service
          </Link>
          <Link href="/refund" className="text-sand hover:text-gold">
            Refund &amp; Cancellation
          </Link>
          <Link href="/contact" className="text-sand hover:text-gold">
            Contact
          </Link>
        </nav>

        <div className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-medium text-cream">Get in touch</span>
          <a href={`mailto:${site.email.support}`} className="text-sand hover:text-gold">
            {site.email.support}
          </a>
        </div>
      </div>
      <div className="section py-5 text-xs text-sand-dim">
        © {new Date().getFullYear()} {site.name}. All rights reserved.
      </div>
    </footer>
  );
}
