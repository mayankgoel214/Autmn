import Link from 'next/link';
import { site } from '@/site.config';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-cream-deep">
      <div className="section flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Logo size={32} />
          <p className="mt-3 text-sm text-ink-soft">{site.tagline}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-semibold text-ink">Legal</span>
          <Link href="/privacy" className="text-ink-soft hover:text-terracotta">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-ink-soft hover:text-terracotta">
            Terms of Service
          </Link>
          <Link href="/refund" className="text-ink-soft hover:text-terracotta">
            Refund &amp; Cancellation
          </Link>
          <Link href="/contact" className="text-ink-soft hover:text-terracotta">
            Contact
          </Link>
        </nav>

        <div className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-semibold text-ink">Get in touch</span>
          <a href={`mailto:${site.email.support}`} className="text-ink-soft hover:text-terracotta">
            {site.email.support}
          </a>
        </div>
      </div>
      <div className="section py-5 text-xs text-ink-soft/70">
        © {new Date().getFullYear()} {site.name}. All rights reserved.
      </div>
    </footer>
  );
}
