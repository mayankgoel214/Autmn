'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateCalendarClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    try {
      await fetch('/api/calendar', { method: 'POST' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
    >
      {loading ? 'Generating...' : 'Generate Calendar'}
    </button>
  )
}
