import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { site, PORTFOLIO_MODE } from '@/site.config';
import { PortfolioBanner } from '@/components/PortfolioBanner';
import './globals.css';

const heading = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  // On a preview/portfolio deploy the canonical domain may not resolve, and a
  // broken metadataBase means a broken link-preview card.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : site.url),
  ),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  icons: {
    icon: '/favicon.svg',
    apple: '/avatar.svg',
  },
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    url: site.url,
    siteName: site.name,
    locale: 'en_IN',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  // A demo build must not compete with, or stand in for, a real business in
  // search results.
  robots: PORTFOLIO_MODE ? { index: false, follow: true } : undefined,
};

export const viewport: Viewport = {
  themeColor: '#17120E',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-body">
        <PortfolioBanner />
        {children}
      </body>
    </html>
  );
}
