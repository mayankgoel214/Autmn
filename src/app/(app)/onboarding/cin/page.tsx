'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateCIN } from '@/lib/utils/cin-validator'

interface CompanyData {
  id: string
  companyName: string
  cin: string
  entityType: string
  dateOfIncorporation: string | null
  registeredState: string | null
  registeredAddress: string | null
  authorizedCapital: string
  paidUpCapital: string
  mcaStatus: string | null
  directors: Array<{
    name: string
    din: string | null
    designation: string | null
    beginDate: string
  }>
}

export default function CINOnboardingPage() {
  const router = useRouter()
  const [cin, setCin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<CompanyData | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function handleLookup() {
    setError(null)

    const validation = validateCIN(cin)
    if (!validation.isValid) {
      setError(validation.error || 'Invalid CIN')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/company/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cin: cin.toUpperCase().trim() }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch company data')
        return
      }

      setCompany(data.company)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!company) return
    setConfirming(true)

    try {
      const res = await fetch('/api/company/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id }),
      })

      if (res.ok) {
        router.push(`/onboarding/profile?companyId=${company.id}&companyName=${encodeURIComponent(company.companyName)}`)
      } else {
        setError('Failed to link company. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  function formatCurrency(value: string): string {
    const num = parseInt(value, 10)
    if (isNaN(num)) return value
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">
        Set up your company
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Enter your company&apos;s CIN and we&apos;ll fetch the details from MCA.
      </p>

      {/* CIN Input */}
      {!company && (
        <div className="mt-8">
          <label htmlFor="cin" className="block text-sm font-medium text-[var(--color-text)]">
            Corporate Identification Number (CIN)
          </label>
          <div className="mt-2 flex gap-3">
            <input
              id="cin"
              type="text"
              value={cin}
              onChange={(e) => setCin(e.target.value.toUpperCase())}
              maxLength={21}
              placeholder="U72200KA2020PTC045678"
              className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-mono text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              onClick={handleLookup}
              disabled={loading || cin.length !== 21}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Fetching...' : 'Look up'}
            </button>
          </div>
          {cin.length > 0 && cin.length < 21 && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {cin.length}/21 characters
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-[var(--color-error-light)] p-3 text-sm text-[var(--color-error)]">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Company Card */}
      {company && (
        <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                {company.companyName}
              </h2>
              <p className="mt-1 text-sm font-mono text-[var(--color-text-secondary)]">
                {company.cin}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              company.mcaStatus === 'Active'
                ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                : 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
            }`}>
              {company.mcaStatus}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Entity Type</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                {company.entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Incorporated</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{company.dateOfIncorporation || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Authorized Capital</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{formatCurrency(company.authorizedCapital)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Paid-up Capital</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{formatCurrency(company.paidUpCapital)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Registered Address</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{company.registeredAddress || 'N/A'}</p>
            </div>
          </div>

          {/* Directors */}
          {company.directors.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">Directors</p>
              <div className="mt-2 space-y-2">
                {company.directors.map((d, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--color-bg-secondary)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{d.name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{d.designation}</p>
                    </div>
                    {d.din && (
                      <span className="text-xs font-mono text-[var(--color-text-muted)]">
                        DIN: {d.din}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-[var(--color-error-light)] p-3 text-sm text-[var(--color-error)]">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
            >
              {confirming ? 'Confirming...' : 'Yes, this is my company'}
            </button>
            <button
              onClick={() => { setCompany(null); setCin(''); setError(null) }}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              Try different CIN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
