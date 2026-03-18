import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { MapObligationsButton } from '@/components/dashboard/MapObligationsButton'
import { getUpcomingDeadlines, getOverdueItems } from '@/lib/services/calendar/calendar.service'
import { daysUntil } from '@/lib/utils/date'

export default async function DashboardPage() {
  const session = await auth()

  // Check if user has a company linked
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          company: {
            include: {
              directors: true,
              companyObligations: {
                where: { isActive: true },
                include: { obligation: true },
              },
            },
          },
        },
      })
    : null

  const company = user?.company

  // Map obligations to simple objects for rendering
  const obligations = (company?.companyObligations || []).map(co => ({
    code: co.obligation.obligationCode,
    name: co.obligation.obligationName,
    category: co.obligation.category,
    frequency: co.obligation.frequency,
    filingPortal: co.obligation.filingPortal || '',
    penaltyDescription: co.obligation.penaltyDescription || '',
    canFileViaApi: co.obligation.canFileViaApi,
  }))

  // If no company linked, show setup prompt
  if (!company) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Dashboard</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Welcome, {session?.user?.name || session?.user?.email}
        </p>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
            <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">Set up your company</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Enter your CIN to get started with compliance tracking.
          </p>
          <a
            href="/onboarding/cin"
            className="mt-6 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Set up your company
          </a>
        </div>
      </div>
    )
  }

  // Company exists — show real dashboard
  const onboardingDone = company.onboardingComplete

  // Get calendar data if generated
  const filingCount = await prisma.filingInstance.count({ where: { companyId: company.id } })
  const upcoming = filingCount > 0 ? await getUpcomingDeadlines(company.id, 5) : []
  const overdue = filingCount > 0 ? await getOverdueItems(company.id) : []

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {company.companyName}
      </p>

      {/* Company Profile Card */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Company Info */}
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Company</p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">{company.companyName}</p>
          <p className="mt-1 text-sm font-mono text-[var(--color-text-secondary)]">{company.cin}</p>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Entity</span>
              <span className="text-[var(--color-text)]">{company.entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">State</span>
              <span className="text-[var(--color-text)]">{company.registeredState || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Status</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                company.mcaStatus === 'Active'
                  ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                  : 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
              }`}>
                {company.mcaStatus || 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Profile Status */}
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Profile</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${company.employeeCount > 0 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}`} />
              <span className="text-[var(--color-text)]">Employees: {company.employeeCount || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${company.gstRegistered ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}`} />
              <span className="text-[var(--color-text)]">GST: {company.gstRegistered ? (company.gstNumber || 'Registered') : 'Not registered'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${company.annualTurnover ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}`} />
              <span className="text-[var(--color-text)]">Turnover: {company.annualTurnover ? `₹${Number(company.annualTurnover).toLocaleString('en-IN')}` : 'Not set'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${company.hasForeignInvestment ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-text-muted)]'}`} />
              <span className="text-[var(--color-text)]">Foreign investment: {company.hasForeignInvestment ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${company.dpiitRecognized ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-text-muted)]'}`} />
              <span className="text-[var(--color-text)]">DPIIT: {company.dpiitRecognized ? 'Recognized' : 'Not recognized'}</span>
            </div>
          </div>
          {!onboardingDone && (
            <a
              href={`/onboarding/profile?companyId=${company.id}&companyName=${encodeURIComponent(company.companyName)}`}
              className="mt-4 inline-flex items-center text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              Complete profile →
            </a>
          )}
        </div>

        {/* Directors */}
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Directors</p>
          <div className="mt-4 space-y-3">
            {company.directors.map((d) => (
              <div key={d.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{d.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{d.designation || 'Director'}</p>
                </div>
                {d.din && (
                  <span className="text-xs font-mono text-[var(--color-text-muted)]">{d.din}</span>
                )}
              </div>
            ))}
            {company.directors.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)]">No directors on file</p>
            )}
          </div>
        </div>
      </div>

      {/* Overdue Items */}
      {overdue.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-error)] mb-3">Overdue ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{item.obligationName}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{item.period}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--color-error)]">{item.daysOverdue} days overdue</p>
                  {item.penaltyDescription && (
                    <p className="text-xs text-[var(--color-error)]">{item.penaltyDescription}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Deadlines */}
      {upcoming.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">Upcoming Deadlines</h2>
          <div className="space-y-2">
            {upcoming.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{item.obligationName}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{item.period} · {item.filingPortal}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--color-text)]">{item.dueDate}</p>
                  <p className={`text-xs font-medium ${item.daysRemaining <= 3 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'}`}>
                    {item.daysRemaining === 0 ? 'Due today' : item.daysRemaining === 1 ? 'Due tomorrow' : `${item.daysRemaining} days left`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate Calendar CTA if not generated yet */}
      {filingCount === 0 && obligations.length > 0 && (
        <div className="mt-8 rounded-lg border border-[var(--color-primary)] border-opacity-20 bg-[var(--color-primary-light)] p-6 text-center">
          <h3 className="text-sm font-semibold text-[var(--color-primary)]">Calendar not generated</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Generate your compliance calendar to see all deadlines for the year.
          </p>
          <a href="/calendar" className="mt-3 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors">
            Generate Calendar
          </a>
        </div>
      )}

      {/* Obligations Section */}
      {obligations.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Your Compliance Obligations ({obligations.length})
            </h2>
          </div>

          {/* Category summary cards */}
          <div className="grid grid-cols-2 gap-3 mb-6 md:grid-cols-5">
            {Object.entries(
              obligations.reduce((acc: Record<string, number>, ob) => {
                const label = categoryLabel(ob.category)
                acc[label] = (acc[label] || 0) + 1
                return acc
              }, {})
            ).map(([cat, count]) => (
              <div key={cat} className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
                <p className="text-2xl font-bold text-[var(--color-text)]">{count}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{cat}</p>
              </div>
            ))}
          </div>

          {/* Obligations list grouped by category */}
          {Object.entries(
            obligations.reduce((acc: Record<string, typeof obligations>, ob) => {
              const label = categoryLabel(ob.category)
              if (!acc[label]) acc[label] = []
              acc[label].push(ob)
              return acc
            }, {})
          ).map(([cat, obs]) => (
            <div key={cat} className="mb-6">
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">{cat}</h3>
              <div className="space-y-2">
                {obs.map((ob) => (
                  <div key={ob.code} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{ob.name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {ob.frequency.charAt(0).toUpperCase() + ob.frequency.slice(1)} · {ob.filingPortal}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ob.canFileViaApi && (
                        <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                          Auto-file
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        frequencyColor(ob.frequency)
                      }`}>
                        {ob.frequency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : onboardingDone ? (
        <ObligationMapper companyId={company.id} />
      ) : (
        <div className="mt-8 rounded-lg border border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-warning)]">Complete your profile</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Answer a few questions so we can identify all your compliance obligations.
          </p>
          <a
            href={`/onboarding/profile?companyId=${company.id}&companyName=${encodeURIComponent(company.companyName)}`}
            className="mt-3 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Complete profile
          </a>
        </div>
      )}
    </div>
  )
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    gst: 'GST',
    tds: 'TDS',
    income_tax: 'Income Tax',
    mca: 'MCA',
    labour: 'Labour',
    state: 'State',
  }
  return labels[cat] || cat.toUpperCase()
}

function frequencyColor(freq: string): string {
  switch (freq) {
    case 'monthly': return 'bg-red-50 text-red-600'
    case 'quarterly': return 'bg-orange-50 text-orange-600'
    case 'annual': return 'bg-green-50 text-green-600'
    case 'half_yearly': return 'bg-blue-50 text-blue-600'
    default: return 'bg-gray-50 text-gray-600'
  }
}

// Client component for triggering obligation mapping
function ObligationMapper({ companyId }: { companyId: string }) {
  'use client'
  return (
    <div className="mt-8 rounded-lg border border-[var(--color-primary)] border-opacity-20 bg-[var(--color-primary-light)] p-6 text-center">
      <h3 className="text-sm font-semibold text-[var(--color-primary)]">Profile complete</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Ready to identify your compliance obligations.
      </p>
      <MapObligationsButton companyId={companyId} />
    </div>
  )
}
