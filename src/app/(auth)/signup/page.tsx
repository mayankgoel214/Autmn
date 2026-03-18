'use client'

import Image from 'next/image'
import { useState } from 'react'
import Link from 'next/link'
import { signup, googleSignIn } from '@/lib/auth/actions'

export default function SignupPage() {
  const [role, setRole] = useState<'FOUNDER' | 'CA_ADVISOR' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    formData.set('role', role || 'FOUNDER')
    const result = await signup(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  // Step 1: Role selection
  if (!role) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <Image src="/logo-full.svg" alt="Autmn" width={180} height={44} className="mx-auto h-11 w-auto" priority />
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            How will you use Autmn?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setRole('FOUNDER')}
            className="w-full rounded-lg border-2 border-[var(--color-border)] p-5 text-left hover:border-[var(--color-primary)] transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">I have a company</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  Track compliance for my own company. See deadlines, obligations, and tax computations.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('CA_ADVISOR')}
            className="w-full rounded-lg border-2 border-[var(--color-border)] p-5 text-left hover:border-[var(--color-primary)] transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warning-light)] text-[var(--color-warning)]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">I manage companies for clients</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  CA, CS, or accountant managing compliance for multiple client companies.
                </p>
              </div>
            </div>
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[var(--color-primary)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    )
  }

  // Step 2: Account creation
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <Image src="/logo-full.svg" alt="Autmn" width={180} height={44} className="mx-auto h-11 w-auto" priority />
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {role === 'CA_ADVISOR' ? 'Create your CA account' : 'Create your account'}
        </p>
      </div>

      {/* Role badge */}
      <div className="mb-4 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
          role === 'CA_ADVISOR'
            ? 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
            : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
        }`}>
          {role === 'CA_ADVISOR' ? 'CA / Accountant' : 'Company Founder'}
        </span>
        <button onClick={() => setRole(null)} className="text-xs text-[var(--color-primary)] hover:underline">
          Change
        </button>
      </div>

      {/* Google OAuth */}
      <form action={googleSignIn}>
        <input type="hidden" name="role" value={role} />
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--color-border)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-[var(--color-text-muted)]">or</span>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="role" value={role} />
        {error && (
          <div className="rounded-lg bg-[var(--color-error-light)] p-3 text-sm text-[var(--color-error)]">{error}</div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)]">Full name</label>
          <input id="name" name="name" type="text" required
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder={role === 'CA_ADVISOR' ? 'CA Firm or Your Name' : 'Your Name'}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text)]">Email</label>
          <input id="email" name="email" type="email" required
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder={role === 'CA_ADVISOR' ? 'ca@firm.in' : 'you@company.in'}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text)]">Password</label>
          <input id="password" name="password" type="password" required
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder="Min 8 chars, 1 uppercase, 1 number"
          />
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-[var(--color-primary)] hover:underline">Log in</Link>
      </p>
    </div>
  )
}
