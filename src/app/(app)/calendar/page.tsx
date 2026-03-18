import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { getCalendarData } from '@/lib/services/calendar/calendar.service'
import { CalendarView } from '@/components/calendar/CalendarView'
import { GenerateCalendarClient } from '@/components/calendar/GenerateCalendarClient'
import { daysUntil } from '@/lib/utils/date'

export default async function CalendarPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null

  if (!user) return null

  const isCA = user.role === 'CA_ADVISOR'

  // CA VIEW — show deadlines across all client companies
  if (isCA) {
    return <CACalendarView userId={user.id} />
  }

  // FOUNDER VIEW — show deadlines for their own company
  if (!user.companyId) {
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

  const filingCount = await prisma.filingInstance.count({ where: { companyId: user.companyId } })

  if (filingCount === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Calendar</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Your calendar hasn&apos;t been generated yet.</p>
          <GenerateCalendarClient />
        </div>
      </div>
    )
  }

  const filings = await getCalendarData(user.companyId)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Compliance Calendar</h1>
        <StatusLegend />
      </div>
      <CalendarView filings={filings} />
    </div>
  )
}

// CA Calendar — cross-client view
async function CACalendarView({ userId }: { userId: string }) {
  const clients = await prisma.cAClient.findMany({
    where: { caUserId: userId },
    include: { company: true },
  })

  if (clients.length === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Compliance Calendar</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Add clients in the Clients tab to see their compliance deadlines here.</p>
          <a href="/ca-portal" className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
            Go to Clients
          </a>
        </div>
      </div>
    )
  }

  // Fetch all filing instances across all client companies
  const companyIds = clients.map(c => c.companyId)
  const companyNames = Object.fromEntries(clients.map(c => [c.companyId, c.company.companyName]))

  const filings = await prisma.filingInstance.findMany({
    where: { companyId: { in: companyIds } },
    include: { obligation: true },
    orderBy: { dueDate: 'asc' },
  })

  const overdueCount = filings.filter(f => f.status === 'overdue').length
  const upcomingThisWeek = filings.filter(f => {
    const days = daysUntil(f.dueDate)
    return f.status === 'upcoming' && days >= 0 && days <= 7
  }).length

  // Group by date for display
  const byDate = filings.reduce((acc, f) => {
    const dateKey = f.dueDate.toISOString().split('T')[0]
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push({
      id: f.id,
      companyName: companyNames[f.companyId] || 'Unknown',
      companyId: f.companyId,
      obligationName: f.obligation.obligationName,
      obligationCode: f.obligation.obligationCode,
      category: f.obligation.category,
      dueDate: dateKey,
      status: f.status,
      daysRemaining: daysUntil(f.dueDate),
      penaltyDescription: f.obligation.penaltyDescription,
      filingPortal: f.obligation.filingPortal,
      period: f.period,
    })
    return acc
  }, {} as Record<string, Array<{
    id: string; companyName: string; companyId: string; obligationName: string;
    obligationCode: string; category: string; dueDate: string; status: string;
    daysRemaining: number; penaltyDescription: string | null; filingPortal: string | null; period: string
  }>>)

  // Show only relevant dates (overdue + next 60 days)
  const today = new Date()
  const cutoff = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)

  const relevantDates = Object.entries(byDate)
    .filter(([dateKey]) => {
      const d = new Date(dateKey)
      return d <= cutoff
    })
    .sort(([a], [b]) => a.localeCompare(b))

  const categoryLabels: Record<string, string> = {
    gst: 'GST', tds: 'TDS', income_tax: 'IT', mca: 'MCA', labour: 'Labour', state: 'State',
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Compliance Calendar</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            All deadlines across {clients.length} client{clients.length > 1 ? 's' : ''}
          </p>
        </div>
        <StatusLegend />
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{filings.length}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Total Deadlines</p>
        </div>
        <div className="rounded-lg border border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-error)]">{overdueCount}</p>
          <p className="text-xs text-[var(--color-error)]">Overdue</p>
        </div>
        <div className="rounded-lg border border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-warning)]">{upcomingThisWeek}</p>
          <p className="text-xs text-[var(--color-warning)]">Due This Week</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 space-y-4">
        {relevantDates.map(([dateKey, items]) => {
          const d = new Date(dateKey)
          const dateLabel = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
          const isPast = d < today
          const isToday = dateKey === today.toISOString().split('T')[0]

          return (
            <div key={dateKey}>
              <div className={`flex items-center gap-2 mb-2 ${isToday ? 'text-[var(--color-primary)]' : isPast ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                <span className={`h-2 w-2 rounded-full ${isToday ? 'bg-[var(--color-primary)]' : isPast ? 'bg-[var(--color-error)]' : 'bg-[var(--color-text-muted)]'}`} />
                <span className="text-sm font-semibold">{isToday ? 'Today — ' : ''}{dateLabel}</span>
                <span className="text-xs text-[var(--color-text-muted)]">({items.length} {items.length === 1 ? 'filing' : 'filings'})</span>
              </div>
              <div className="ml-4 space-y-1.5">
                {items.map(item => (
                  <div key={item.id} className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${
                    item.status === 'overdue'
                      ? 'border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)]'
                      : item.status === 'filed'
                      ? 'border-[var(--color-success)] border-opacity-20 bg-[var(--color-success-light)]'
                      : 'border-[var(--color-border)] bg-white'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        item.category === 'gst' ? 'bg-blue-50 text-blue-600' :
                        item.category === 'tds' ? 'bg-purple-50 text-purple-600' :
                        item.category === 'mca' ? 'bg-green-50 text-green-600' :
                        item.category === 'labour' ? 'bg-orange-50 text-orange-600' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {categoryLabels[item.category] || item.category.toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm text-[var(--color-text)]">
                          <span className="font-medium">{item.obligationName}</span>
                          <span className="text-[var(--color-text-muted)]"> · {item.period}</span>
                        </p>
                        <p className="text-xs text-[var(--color-primary)]">{item.companyName}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${
                      item.status === 'overdue' ? 'text-[var(--color-error)]' :
                      item.status === 'filed' ? 'text-[var(--color-success)]' :
                      item.daysRemaining <= 3 ? 'text-[var(--color-warning)]' :
                      'text-[var(--color-text-secondary)]'
                    }`}>
                      {item.status === 'filed' ? 'Filed' :
                       item.status === 'overdue' ? `${Math.abs(item.daysRemaining)}d overdue` :
                       item.daysRemaining === 0 ? 'Due today' :
                       `${item.daysRemaining}d left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {relevantDates.length === 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">No deadlines found. Generate calendars for your clients first.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusLegend() {
  return (
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
  )
}
