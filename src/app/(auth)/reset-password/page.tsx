'use client'

import Image from 'next/image'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resetPassword } from '@/lib/auth/actions'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center"><p className="text-sm text-[var(--color-text-secondary)]">Loading...</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Invalid Link</h1>
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="mt-6 inline-flex items-center text-sm font-medium text-[var(--color-primary)] hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Password Reset</h1>
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          Your password has been reset. You can now log in with your new password.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
          Log in
        </Link>
      </div>
    )
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    formData.set('token', token!)
    const result = await resetPassword(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
      <div className="mb-8 text-center">
        <Image src="/logo-full.svg" alt="Autmn" width={180} height={44} className="mx-auto h-11 w-auto" priority />
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Choose a new password</p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-[var(--color-error-light)] p-3 text-sm text-[var(--color-error)]">{error}</div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text)]">New Password</label>
          <input
            id="password" name="password" type="password" required minLength={8}
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder="Min 8 characters"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}
