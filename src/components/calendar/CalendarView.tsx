'use client'

import { useState } from 'react'

interface Filing {
  id: string
  obligationCode: string
  obligationName: string
  category: string
  frequency: string
  period: string
  dueDate: string
  daysRemaining: number
  status: string
  penaltyDescription: string | null
  filingPortal: string | null
  canFileViaApi: boolean
  requiresDsc: boolean
  filedDate: string | null
  acknowledgmentNumber: string | null
}

const CATEGORIES = ['all', 'gst', 'tds', 'income_tax', 'mca', 'labour', 'state']
const CATEGORY_LABELS: Record<string, string> = {
  all: 'All', gst: 'GST', tds: 'TDS', income_tax: 'Income Tax',
  mca: 'MCA', labour: 'Labour', state: 'State',
}

export function CalendarView({ filings }: { filings: Filing[] }) {
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<'list' | 'month'>('list')

  const filtered = filter === 'all'
    ? filings
    : filings.filter(f => f.category === filter)

  // Group by month for month view
  const byMonth = filtered.reduce((acc, f) => {
    const d = new Date(f.dueDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(f)
    return acc
  }, {} as Record<string, Filing[]>)

  const overdueCount = filtered.filter(f => f.status === 'overdue').length
  const upcomingCount = filtered.filter(f => f.status === 'upcoming').length

  return (
    <div className="mt-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{filtered.length}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Total Deadlines</p>
        </div>
        <div className="rounded-lg border border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-error)]">{overdueCount}</p>
          <p className="text-xs text-[var(--color-error)]">Overdue</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{upcomingCount}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Upcoming</p>
        </div>
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === cat
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView('list')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'list' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView('month')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'month' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
            }`}
          >
            By Month
          </button>
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-2">
          {filtered.map(f => (
            <FilingRow key={f.id} filing={f} />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-[var(--color-text-secondary)] py-8">No deadlines found for this filter.</p>
          )}
        </div>
      )}

      {/* Month View */}
      {view === 'month' && (
        <div className="space-y-6">
          {Object.entries(byMonth).sort().map(([monthKey, monthFilings]) => {
            const [y, m] = monthKey.split('-').map(Number)
            const monthName = new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
            return (
              <div key={monthKey}>
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{monthName}</h3>
                <div className="space-y-2">
                  {monthFilings.map(f => (
                    <FilingRow key={f.id} filing={f} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilingRow({ filing }: { filing: Filing }) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = getStatusColor(filing)
  const dueLabel = getDueLabel(filing)

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg-secondary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{filing.obligationName}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{filing.period} · {CATEGORY_LABELS[filing.category] || filing.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-[var(--color-text)]">{formatDateShort(filing.dueDate)}</p>
            <p className={`text-xs ${filing.status === 'overdue' ? 'text-[var(--color-error)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
              {dueLabel}
            </p>
          </div>
          <svg className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg-secondary)]">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Filing Portal</p>
              <p className="text-[var(--color-text)]">{filing.filingPortal || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Frequency</p>
              <p className="text-[var(--color-text)] capitalize">{filing.frequency}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">DSC Required</p>
              <p className="text-[var(--color-text)]">{filing.requiresDsc ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Auto-file via API</p>
              <p className="text-[var(--color-text)]">{filing.canFileViaApi ? 'Yes' : 'No'}</p>
            </div>
            {filing.penaltyDescription && (
              <div className="col-span-2">
                <p className="text-xs text-[var(--color-text-muted)]">Penalty if Missed</p>
                <p className="text-[var(--color-error)] text-xs mt-0.5">{filing.penaltyDescription}</p>
              </div>
            )}
          </div>
          {/* Mark as Filed button */}
          {filing.status !== 'filed' && (
            <MarkAsFiledButton filingId={filing.id} obligationName={filing.obligationName} />
          )}
          {filing.status === 'filed' && filing.filedDate && (
            <p className="mt-3 text-xs text-[var(--color-success)]">
              Filed on {filing.filedDate} {filing.acknowledgmentNumber ? `· ARN: ${filing.acknowledgmentNumber}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MarkAsFiledButton({ filingId, obligationName }: { filingId: string; obligationName: string }) {
  const [showForm, setShowForm] = useState(false)
  const [arn, setArn] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleMarkFiled() {
    setLoading(true)
    const res = await fetch('/api/filings/mark-filed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filingId, acknowledgmentNumber: arn || undefined }),
    })
    if (res.ok) {
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return <p className="mt-3 text-xs text-[var(--color-success)] font-medium">Marked as filed</p>
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="mt-3 rounded-lg border border-[var(--color-success)] px-3 py-1.5 text-xs font-medium text-[var(--color-success)] hover:bg-[var(--color-success-light)] transition-colors"
      >
        Mark as Filed
      </button>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        type="text"
        value={arn}
        onChange={e => setArn(e.target.value)}
        placeholder="ARN / Acknowledgment # (optional)"
        className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      <button
        onClick={handleMarkFiled}
        disabled={loading}
        className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {loading ? '...' : 'Confirm'}
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="text-xs text-[var(--color-text-muted)] hover:underline"
      >
        Cancel
      </button>
    </div>
  )
}

function getStatusColor(filing: Filing): string {
  if (filing.status === 'filed') return 'bg-[var(--color-success)]'
  if (filing.status === 'overdue') return 'bg-[var(--color-error)]'
  if (filing.daysRemaining <= 7 && filing.daysRemaining >= 0) return 'bg-[var(--color-warning)]'
  return 'bg-[var(--color-text-muted)]'
}

function getDueLabel(filing: Filing): string {
  if (filing.status === 'filed') return `Filed ${filing.filedDate || ''}`
  if (filing.status === 'overdue') return `${Math.abs(filing.daysRemaining)} days overdue`
  if (filing.daysRemaining === 0) return 'Due today'
  if (filing.daysRemaining === 1) return 'Due tomorrow'
  if (filing.daysRemaining <= 7) return `${filing.daysRemaining} days left`
  return `${filing.daysRemaining} days left`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
