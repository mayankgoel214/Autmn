export default function RegulatoryPage() {
  // Hardcoded recent regulatory updates for demo — in production these come from scraping + AI analysis
  const updates = [
    {
      id: '1',
      authority: 'CBIC',
      title: 'GST Council 55th Meeting — Key Decisions',
      summary: 'Penal charges by banks/NBFCs exempted from GST. Weather-based crop insurance exempted. Discussions on merging 12% and 18% slabs ongoing.',
      date: '2024-12-21',
      impact: 'medium',
      affectsCategories: ['gst'],
    },
    {
      id: '2',
      authority: 'CBDT',
      title: 'Finance Act 2024 — TDS Rate Reductions',
      summary: 'TDS rates reduced: Section 194H (commission) from 5% to 2%, Section 194O (e-commerce) from 1% to 0.1%. Angel tax under Section 56(2)(viib) fully abolished.',
      date: '2024-07-23',
      impact: 'high',
      affectsCategories: ['tds', 'income_tax'],
    },
    {
      id: '3',
      authority: 'CBDT',
      title: 'Finance Act 2025 — New Income Tax Regime',
      summary: 'No tax on income up to Rs.12 lakh. Standard deduction increased to Rs.75,000. New slabs: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%.',
      date: '2025-02-01',
      impact: 'high',
      affectsCategories: ['income_tax'],
    },
    {
      id: '4',
      authority: 'MCA',
      title: 'Companies Act — Small Company Threshold Enhanced',
      summary: 'Small company definition updated: paid-up capital up to Rs.4 crore AND turnover up to Rs.40 crore. Simplified filing via MGT-7A for eligible companies.',
      date: '2024-09-15',
      impact: 'medium',
      affectsCategories: ['mca'],
    },
    {
      id: '5',
      authority: 'CBIC',
      title: 'E-Invoice Threshold at Rs.5 Crore',
      summary: 'E-invoicing mandatory for businesses with aggregate turnover exceeding Rs.5 crore from August 2023. May be further reduced.',
      date: '2023-08-01',
      impact: 'medium',
      affectsCategories: ['gst'],
    },
    {
      id: '6',
      authority: 'Parliament',
      title: 'New Income Tax Bill 2025 — Introduced',
      summary: 'New bill to replace Income Tax Act 1961. If enacted (potentially April 1, 2026), all section numbers will change. Currently under parliamentary review.',
      date: '2025-02-13',
      impact: 'high',
      affectsCategories: ['income_tax', 'tds'],
    },
  ]

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Regulatory Updates</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Latest government notifications and how they affect your compliance
      </p>

      <div className="mt-6 rounded-lg border border-[var(--color-primary)] border-opacity-20 bg-[var(--color-primary-light)] p-4">
        <p className="text-sm text-[var(--color-primary)]">
          AI-powered regulatory monitoring is being set up. In production, this page will show real-time government notifications with personalized impact analysis for your company.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {updates.map(update => (
          <div key={update.id} className="rounded-lg border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                  update.impact === 'high' ? 'bg-[var(--color-error)]' :
                  update.impact === 'medium' ? 'bg-[var(--color-warning)]' :
                  'bg-[var(--color-text-muted)]'
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                      {update.authority}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{update.date}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-medium text-[var(--color-text)]">{update.title}</h3>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)] leading-relaxed">{update.summary}</p>
                  <div className="mt-2 flex gap-1.5">
                    {update.affectsCategories.map(cat => (
                      <span key={cat} className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                        {cat.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
