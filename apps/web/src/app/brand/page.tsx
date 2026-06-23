import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/site.config';
import { Logo, LogoIcon } from '@/components/Logo';

export const metadata: Metadata = { title: 'Brand Sheet', robots: { index: false } };

const colors = [
  { name: 'Terracotta', hex: '#C2410C', role: 'Primary brand', cls: 'bg-terracotta' },
  { name: 'Amber', hex: '#F59E0B', role: 'Secondary brand', cls: 'bg-amber' },
  { name: 'Olive', hex: '#4D7C0F', role: 'Accent (free/success)', cls: 'bg-olive' },
  { name: 'Cream', hex: '#FFFBF5', role: 'Background', cls: 'bg-cream ring-1 ring-ink/10' },
  { name: 'Ink', hex: '#2B1A10', role: 'Text', cls: 'bg-ink' },
];

export default function Brand() {
  return (
    <main className="min-h-screen">
      <header className="section flex items-center justify-between py-5">
        <Link href="/">
          <Logo size={32} />
        </Link>
        <span className="text-sm text-ink-soft">Internal brand sheet</span>
      </header>

      <div className="section max-w-3xl space-y-12 py-10">
        <section>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-ink">
            {site.name} brand sheet
          </h1>
          <p className="mt-2 text-ink-soft">
            One page so every asset stays consistent. Warm, premium, autumn.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold text-ink">Logo</h2>
          <div className="mt-4 flex flex-wrap items-center gap-8 rounded-3xl bg-cream-deep p-8">
            <Logo size={48} />
            <LogoIcon size={56} />
            <div className="rounded-2xl bg-ink p-4">
              <Logo size={36} />
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            The icon (leaf-in-rounded-square) is the WhatsApp avatar &amp; favicon — it must read at
            tiny sizes. Files: <code>/public/favicon.svg</code>, <code>/public/avatar.svg</code>.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold text-ink">Colour</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {colors.map((c) => (
              <div key={c.name}>
                <div className={`h-20 rounded-2xl ${c.cls}`} />
                <p className="mt-2 text-sm font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink-soft">{c.hex}</p>
                <p className="text-xs text-ink-soft/70">{c.role}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold text-ink">Type</h2>
          <div className="mt-4 space-y-4 rounded-3xl bg-cream-deep p-8">
            <div>
              <p className="font-heading text-3xl font-semibold text-ink">Fraunces — headings</p>
              <p className="text-sm text-ink-soft">Warm serif. Premium, characterful.</p>
            </div>
            <div>
              <p className="font-body text-xl text-ink">Inter — body</p>
              <p className="text-sm text-ink-soft">Clean, highly legible for EN + Hinglish.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold text-ink">WhatsApp business profile</h2>
          <div className="mt-4 space-y-2 rounded-3xl bg-cream-deep p-8 text-ink-soft">
            <p>
              <strong className="text-ink">Avatar:</strong> /public/avatar.svg (export to 512×512
              PNG for upload)
            </p>
            <p>
              <strong className="text-ink">Name:</strong> {site.name}
            </p>
            <p>
              <strong className="text-ink">Category:</strong> Graphic &amp; Design / Advertising
            </p>
            <p>
              <strong className="text-ink">About:</strong> Professional product photos on WhatsApp.
              Send a photo, get a brand-ready ad in minutes. First one free.
            </p>
            <p>
              <strong className="text-ink">Website:</strong> {site.url}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
