'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function MapObligationsButton({ companyId: _companyId }: { companyId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleMap() {
    setLoading(true)
    try {
      const res = await fetch('/api/company/obligations', { method: 'POST' })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleMap}
      disabled={loading}
      className="mt-3 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
    >
      {loading ? 'Mapping obligations...' : 'Map my obligations'}
    </button>
  )
}
