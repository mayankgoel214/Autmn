'use client'

import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

interface TopBarProps {
  userEmail?: string | null
  userName?: string | null
}

export function TopBar({ userEmail, userName }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 z-30 h-16 border-b border-[var(--color-border)] bg-white">
      <div className="flex h-full items-center justify-between px-4 lg:px-6 pl-14 lg:pl-6">
        <div />

        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-sm text-[var(--color-text-secondary)]">
            {userName || userEmail}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
