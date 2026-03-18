'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ChangeCompanyButton() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleChange() {
    setLoading(true)
    const res = await fetch('/api/company/disconnect', { method: 'POST' })
    if (res.ok) {
      router.push('/onboarding/cin')
    }
    setLoading(false)
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-[var(--color-primary)] hover:underline"
      >
        Change
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleChange}
        disabled={loading}
        className="rounded px-2 py-1 text-xs font-medium text-white bg-[var(--color-error)] hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Switching...' : 'Confirm'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-xs text-[var(--color-text-secondary)] hover:underline"
      >
        Cancel
      </button>
    </div>
  )
}
