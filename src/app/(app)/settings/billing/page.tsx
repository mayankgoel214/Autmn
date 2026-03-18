import Link from 'next/link'

export default function BillingPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Billing</h1>

      {/* Current Plan */}
      <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Current Plan</p>
            <p className="mt-2 text-xl font-bold text-[var(--color-text)]">Free</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Company profiling, compliance calendar, deadline alerts, basic health score
            </p>
          </div>
          <Link
            href="/pricing"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Upgrade
          </Link>
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <p className="text-sm font-semibold text-[var(--color-text)]">What you get with paid plans</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[var(--color-text)]">Zoho Books integration — auto-pull invoices</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[var(--color-text)]">GST computation from real invoices</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[var(--color-text)]">GSTR-1/3B return preparation + auto-filing</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[var(--color-text)]">Investor-ready compliance PDF report</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[var(--color-text)]">Regulatory intelligence — AI-powered alerts</span>
          </div>
        </div>
      </div>
    </div>
  )
}
