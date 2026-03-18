import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { computeHealthScore } from '@/lib/services/health/health-score'

export default async function HealthPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null

  if (!user?.companyId) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Health Score</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Set up your company first.</p>
        </div>
      </div>
    )
  }

  const health = await computeHealthScore(user.companyId)

  const scoreColor = health.score >= 70
    ? 'text-[var(--color-success)]'
    : health.score >= 40
    ? 'text-[var(--color-warning)]'
    : 'text-[var(--color-error)]'

  const scoreBg = health.score >= 70
    ? 'border-[var(--color-success)]'
    : health.score >= 40
    ? 'border-[var(--color-warning)]'
    : 'border-[var(--color-error)]'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Compliance Health Score</h1>
        <a
          href="/api/health/report"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Download Report
        </a>
      </div>

      {/* Score Display */}
      <div className="mt-8 flex items-center gap-8">
        <div className={`flex h-32 w-32 items-center justify-center rounded-full border-4 ${scoreBg}`}>
          <span className={`text-4xl font-bold ${scoreColor}`}>{health.score}</span>
        </div>
        <div>
          <p className={`text-2xl font-bold ${scoreColor}`}>
            {health.score >= 80 ? 'Excellent' : health.score >= 60 ? 'Good' : health.score >= 40 ? 'Needs Attention' : 'Critical'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Based on your filing status across all compliance categories
          </p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="mt-8 grid grid-cols-5 gap-3">
        {Object.entries(health.breakdown).map(([key, cat]) => (
          <div key={key} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase">{formatCategoryName(key)}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
              {cat.score}<span className="text-sm font-normal text-[var(--color-text-muted)]">/{cat.max}</span>
            </p>
            <div className="mt-2 h-2 rounded-full bg-[var(--color-bg-secondary)]">
              <div
                className={`h-2 rounded-full ${cat.score / cat.max >= 0.7 ? 'bg-[var(--color-success)]' : cat.score / cat.max >= 0.4 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-error)]'}`}
                style={{ width: `${(cat.score / cat.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Issues */}
      {health.issues.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">Issues ({health.issues.length})</h2>
          <div className="space-y-2">
            {health.issues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                issue.severity === 'critical'
                  ? 'border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)]'
                  : issue.severity === 'warning'
                  ? 'border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)]'
                  : 'border-[var(--color-border)] bg-white'
              }`}>
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  issue.severity === 'critical' ? 'bg-[var(--color-error)]' :
                  issue.severity === 'warning' ? 'bg-[var(--color-warning)]' :
                  'bg-[var(--color-primary)]'
                }`} />
                <div>
                  <p className="text-sm text-[var(--color-text)]">{issue.message}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 uppercase">{formatCategoryName(issue.category)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {health.recommendations.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">Recommendations</h2>
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <ul className="space-y-2">
              {health.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text)]">
                  <span className="mt-1 text-[var(--color-primary)]">-</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCategoryName(key: string): string {
  const names: Record<string, string> = {
    mca: 'MCA', gst: 'GST', tax: 'Tax & TDS', labour: 'Labour', corporate: 'State', system: 'System',
  }
  return names[key] || key.toUpperCase()
}
