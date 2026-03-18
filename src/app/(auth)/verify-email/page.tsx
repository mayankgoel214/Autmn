'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { verifyEmail } from '@/lib/auth/actions'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center"><p className="text-sm text-[var(--color-text-secondary)]">Loading...</p></div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('No verification token found.')
      return
    }

    verifyEmail(token).then(result => {
      if (result.error) {
        setStatus('error')
        setError(result.error)
      } else {
        setStatus('success')
      }
    })
  }, [token])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center">
      {status === 'verifying' && (
        <>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Verifying...</h1>
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Please wait while we verify your email.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-light)]">
            <svg className="h-6 w-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Email Verified</h1>
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
            Your email has been verified. You&apos;re all set.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
            Go to Dashboard
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Verification Failed</h1>
          <p className="mt-4 text-sm text-[var(--color-error)]">{error}</p>
          <Link href="/dashboard" className="mt-6 inline-flex items-center text-sm font-medium text-[var(--color-primary)] hover:underline">
            Go to Dashboard
          </Link>
        </>
      )}
    </div>
  )
}
