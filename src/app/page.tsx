import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="max-w-2xl text-center">
        <Image src="/logo-full.svg" alt="Autmn" width={220} height={52} className="mx-auto h-14 w-auto" priority />
        <h2 className="mt-8 text-3xl font-bold tracking-tight text-[var(--color-text)] leading-tight">
          Compliance intelligence<br />for Indian startups
        </h2>
        <p className="mt-4 text-base text-[var(--color-text-secondary)] max-w-md mx-auto">
          Know every obligation your company has. Never miss a deadline. AI-powered compliance management.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-[var(--color-primary)] px-8 py-3 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-[var(--color-border)] px-8 py-3 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Log in
          </Link>
        </div>
        <p className="mt-6 text-xs text-[var(--color-text-muted)]">
          No credit card required. Free compliance calendar for every Indian company.
        </p>
      </div>
    </div>
  )
}
