'use client'

import Image from 'next/image'

import { useState } from 'react'
import Link from 'next/link'
import { forgotPassword } from '@/lib/auth/actions'

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await forgotPassword(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Check your email</h1>
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          If an account exists with that email, we&apos;ve sent a password reset link. Check your inbox.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center text-sm font-medium text-[var(--color-primary)] hover:underline">
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
      <div className="mb-8 text-center">
        <Image src="/logo-full.svg" alt="Autmn" width={180} height={44} className="mx-auto h-11 w-auto" priority />
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Reset your password
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-[var(--color-error-light)] p-3 text-sm text-[var(--color-error)]">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text)]">Email</label>
          <input
            id="email" name="email" type="email" required
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder="mayank@acmetech.in"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
        Remember your password?{' '}
        <Link href="/login" className="font-medium text-[var(--color-primary)] hover:underline">Log in</Link>
      </p>
    </div>
  )
}
