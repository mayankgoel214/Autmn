import Link from 'next/link';
import { site, isPlaceholder } from '@/site.config';
import { Logo } from './Logo';
import { Footer } from './Footer';

/** Renders a config value, or a visible TODO badge if it's still a placeholder. */
export function V({ value }: { value: string }) {
  if (isPlaceholder(value)) {
    return (
      <mark className="rounded bg-gold/20 px-1.5 py-0.5 text-sm font-medium text-gold">
        [TODO: {value.replace('PLACEHOLDER_', '').replace(/_/g, ' ').toLowerCase()}]
      </mark>
    );
  }
  return <>{value}</>;
}

export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink text-cream">
      <header className="section flex items-center justify-between border-b border-ink-line py-5">
        <Link href="/">
          <Logo size={32} />
        </Link>
        <Link href="/" className="text-sm font-medium text-sand hover:text-gold">
          Back to home
        </Link>
      </header>

      <article className="section max-w-3xl py-10">
        <h1 className="font-heading text-4xl font-medium tracking-tight text-cream">{title}</h1>
        <p className="mt-2 text-sm text-sand">Last updated: {site.legalLastUpdated}</p>
        <div className="legal-prose mt-8 space-y-6">{children}</div>
      </article>

      <Footer />
    </main>
  );
}

/** Section heading used inside legal docs. */
export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-2xl font-medium text-cream" style={{ marginTop: '1.5rem' }}>
      {children}
    </h2>
  );
}
