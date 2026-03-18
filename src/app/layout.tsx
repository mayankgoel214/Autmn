import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'AUTMN — Compliance Intelligence for Indian Startups',
  description: 'Know every compliance obligation your company has. Never miss a deadline. AI-powered compliance management for Indian Private Limited Companies.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AUTMN — Compliance Intelligence for Indian Startups',
    description: 'Know every compliance obligation. Never miss a deadline.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AUTMN — Compliance Intelligence',
    description: 'AI-powered compliance management for Indian startups.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
