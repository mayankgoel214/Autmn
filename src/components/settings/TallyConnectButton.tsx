'use client'

import { useState } from 'react'

export function TallyConnectButton() {
  const [showSetup, setShowSetup] = useState(false)

  if (showSetup) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-secondary)]">Contact us for setup</span>
        <a
          href="mailto:support@autmn.ai?subject=TallyPrime Integration Setup"
          className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Request Setup
        </a>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowSetup(true)}
      className="rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
    >
      Connect
    </button>
  )
}
