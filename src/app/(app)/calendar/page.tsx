import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { getCalendarData } from '@/lib/services/calendar/calendar.service'
import { CalendarView } from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null

  if (!user?.companyId) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Calendar</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Set up your company first to see your compliance calendar.</p>
          <a href="/onboarding/cin" className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
            Set up company
          </a>
        </div>
      </div>
    )
  }

  // Check if calendar has been generated
  const filingCount = await prisma.filingInstance.count({ where: { companyId: user.companyId } })

  if (filingCount === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Calendar</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Your calendar hasn&apos;t been generated yet.</p>
          <GenerateCalendarButton />
        </div>
      </div>
    )
  }

  const filings = await getCalendarData(user.companyId)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Compliance Calendar</h1>
        <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-error)]" /> Overdue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" /> Due soon
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" /> Filed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-text-muted)]" /> Upcoming
          </span>
        </div>
      </div>
      <CalendarView filings={filings} />
    </div>
  )
}

function GenerateCalendarButton() {
  return <GenerateCalendarClient />
}

import { GenerateCalendarClient } from '@/components/calendar/GenerateCalendarClient'
