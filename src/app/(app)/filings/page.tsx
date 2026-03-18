import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { daysUntil } from '@/lib/utils/date'

export default async function FilingsPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null

  if (!user?.companyId) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Filings</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Set up your company first.</p>
        </div>
      </div>
    )
  }

  const filings = await prisma.filingInstance.findMany({
    where: { companyId: user.companyId },
    include: { obligation: true },
    orderBy: { dueDate: 'asc' },
  })

  if (filings.length === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Filings</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Generate your compliance calendar first to see filing status.</p>
          <a href="/calendar" className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
            Go to Calendar
          </a>
        </div>
      </div>
    )
  }

  const overdue = filings.filter(f => f.status === 'overdue')
  const upcoming = filings.filter(f => f.status === 'upcoming')
  const filed = filings.filter(f => f.status === 'filed')

  // Group by obligation for a cleaner view
  const byObligation = filings.reduce((acc, f) => {
    const code = f.obligation.obligationCode
    if (!acc[code]) {
      acc[code] = {
        name: f.obligation.obligationName,
        category: f.obligation.category,
        frequency: f.obligation.frequency,
        portal: f.obligation.filingPortal,
        canFileViaApi: f.obligation.canFileViaApi,
        requiresDsc: f.obligation.requiresDsc,
        instances: [],
      }
    }
    acc[code].instances.push({
      id: f.id,
      period: f.period,
      dueDate: f.dueDate,
      status: f.status,
      daysRemaining: daysUntil(f.dueDate),
      filedDate: f.filedDate,
      acknowledgmentNumber: f.acknowledgmentNumber,
    })
    return acc
  }, {} as Record<string, { name: string; category: string; frequency: string; portal: string | null; canFileViaApi: boolean; requiresDsc: boolean; instances: Array<{ id: string; period: string; dueDate: Date; status: string; daysRemaining: number; filedDate: Date | null; acknowledgmentNumber: string | null }> }>)

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Filings</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Track all your compliance filings in one place
      </p>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-error)]">{overdue.length}</p>
          <p className="text-xs text-[var(--color-error)]">Overdue</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{upcoming.length}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Upcoming</p>
        </div>
        <div className="rounded-lg border border-[var(--color-success)] border-opacity-20 bg-[var(--color-success-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-success)]">{filed.length}</p>
          <p className="text-xs text-[var(--color-success)]">Filed</p>
        </div>
      </div>

      {/* Filing Table by Obligation */}
      <div className="mt-8 space-y-4">
        {Object.entries(byObligation).map(([code, ob]) => {
          const nextDue = ob.instances.find(i => i.status === 'upcoming' || i.status === 'overdue')
          const overdueCount = ob.instances.filter(i => i.status === 'overdue').length

          return (
            <div key={code} className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${overdueCount > 0 ? 'bg-[var(--color-error)]' : 'bg-[var(--color-success)]'}`} />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{ob.name}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {categoryLabel(ob.category)} · {ob.frequency} · {ob.portal || 'Manual'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ob.canFileViaApi && (
                    <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                      Auto-file
                    </span>
                  )}
                  {ob.requiresDsc && (
                    <span className="rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      DSC
                    </span>
                  )}
                </div>
              </div>

              {/* Instances */}
              <div className="divide-y divide-[var(--color-border)]">
                {ob.instances.slice(0, 6).map(inst => (
                  <div key={inst.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        inst.status === 'filed' ? 'bg-[var(--color-success)]' :
                        inst.status === 'overdue' ? 'bg-[var(--color-error)]' :
                        inst.daysRemaining <= 7 ? 'bg-[var(--color-warning)]' :
                        'bg-[var(--color-text-muted)]'
                      }`} />
                      <span className="text-sm text-[var(--color-text)]">{inst.period}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {inst.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className={`text-xs font-medium min-w-[80px] text-right ${
                        inst.status === 'filed' ? 'text-[var(--color-success)]' :
                        inst.status === 'overdue' ? 'text-[var(--color-error)]' :
                        inst.daysRemaining <= 3 ? 'text-[var(--color-warning)]' :
                        'text-[var(--color-text-secondary)]'
                      }`}>
                        {inst.status === 'filed' ? 'Filed' :
                         inst.status === 'overdue' ? `${Math.abs(inst.daysRemaining)}d overdue` :
                         inst.daysRemaining === 0 ? 'Due today' :
                         `${inst.daysRemaining}d left`}
                      </span>
                    </div>
                  </div>
                ))}
                {ob.instances.length > 6 && (
                  <div className="px-4 py-2 text-center">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      +{ob.instances.length - 6} more
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    gst: 'GST', tds: 'TDS', income_tax: 'Income Tax',
    mca: 'MCA', labour: 'Labour', state: 'State',
  }
  return labels[cat] || cat.toUpperCase()
}
