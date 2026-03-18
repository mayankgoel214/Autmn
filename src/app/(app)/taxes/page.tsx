import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { TDS_SECTIONS } from '@/lib/rules/tds-rates'
import { PF_RATES, ESI_RATES } from '@/lib/rules/pf-esi-rates'
import { computePFContribution, computeESIContribution } from '@/lib/rules/pf-esi-rates'

export default async function TaxesPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { company: true },
      })
    : null

  const company = user?.company

  if (!company) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Taxes</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Set up your company first.</p>
        </div>
      </div>
    )
  }

  // Check Zoho connection
  const zohoToken = await prisma.integrationToken.findUnique({
    where: { companyId_provider: { companyId: company.id, provider: 'zoho_books' } },
  }).catch(() => null)

  const zohoConnected = !!zohoToken

  // Sample PF/ESI computation for display (using average salary estimate)
  const avgSalary = 30000
  const pfSample = computePFContribution(avgSalary)
  const esiSample = computeESIContribution(avgSalary)

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Tax Computations</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {company.companyName} — tax rates and estimated obligations
      </p>

      {/* Data Source Status */}
      <div className={`mt-6 rounded-lg border p-4 ${zohoConnected ? 'border-[var(--color-success)] border-opacity-20 bg-[var(--color-success-light)]' : 'border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)]'}`}>
        <p className="text-sm">
          {zohoConnected ? (
            <span className="text-[var(--color-success)] font-medium">Zoho Books connected — tax computations will use your actual invoice data when synced.</span>
          ) : (
            <span className="text-[var(--color-warning)] font-medium">Connect Zoho Books in Settings to compute taxes from your actual invoices. Showing rate tables and estimates below.</span>
          )}
        </p>
      </div>

      {/* GST Section */}
      {company.gstRegistered && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">GST</h2>
          <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">GSTIN: {company.gstNumber || 'Registered'}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Filing: {company.gstScheme === 'qrmp' ? 'Quarterly (QRMP)' : 'Monthly'}</p>
                </div>
                <span className="rounded-full bg-[var(--color-success-light)] px-3 py-1 text-xs font-medium text-[var(--color-success)]">Active</span>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase mb-3">Standard GST Rates</p>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { rate: '0%', label: 'Exempt', desc: 'Essential goods' },
                  { rate: '5%', label: 'Low', desc: 'Packaged food, transport' },
                  { rate: '12%', label: 'Standard', desc: 'Processed food, mobile' },
                  { rate: '18%', label: 'Standard', desc: 'Most services, IT, SaaS' },
                  { rate: '28%', label: 'High', desc: 'Luxury, automobiles' },
                ].map(r => (
                  <div key={r.rate} className="rounded-lg border border-[var(--color-border)] p-3 text-center">
                    <p className="text-lg font-bold text-[var(--color-text)]">{r.rate}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{r.desc}</p>
                  </div>
                ))}
              </div>
              {!zohoConnected && (
                <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                  Connect Zoho Books to see your actual GST liability computed from invoices.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TDS Section */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">TDS Rates</h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase">Section</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">Rate (Individual)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">Rate (Company)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {TDS_SECTIONS.filter(s => s.section !== '192').map((s, i) => (
                <tr key={s.section} className={`border-b border-[var(--color-border)] ${i % 2 === 0 ? '' : 'bg-[var(--color-bg-secondary)]'}`}>
                  <td className="px-4 py-3 text-sm font-mono text-[var(--color-primary)]">{s.section}</td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text)]">{s.description}</td>
                  <td className="px-4 py-3 text-sm text-right text-[var(--color-text)]">{s.rateIndividual}%</td>
                  <td className="px-4 py-3 text-sm text-right text-[var(--color-text)]">{s.rateOthers}%</td>
                  <td className="px-4 py-3 text-sm text-right text-[var(--color-text-secondary)] font-mono">
                    {s.threshold > 0 ? `₹${s.threshold.toLocaleString('en-IN')}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-muted)]">
            Rates updated per Finance Act 2024. Section 206AA: 20% TDS if payee has no PAN.
          </div>
        </div>
      </div>

      {/* PF/ESI Section */}
      {(company.pfRegistered || company.esiRegistered || company.employeeCount >= 10) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">PF & ESI</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* PF */}
            {(company.pfRegistered || company.employeeCount >= 20) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
                <p className="text-sm font-semibold text-[var(--color-text)]">Provident Fund (EPF)</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">For {company.employeeCount} employees</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employee contribution</span>
                    <span className="text-[var(--color-text)] font-medium">{PF_RATES.employee}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employer contribution</span>
                    <span className="text-[var(--color-text)] font-medium">{PF_RATES.employer_total}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">EPS wage ceiling</span>
                    <span className="text-[var(--color-text)] font-mono">₹{PF_RATES.eps_wage_ceiling.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="border-t border-[var(--color-border)] pt-2 mt-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Sample (₹{avgSalary.toLocaleString('en-IN')} basic/month):</p>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-[var(--color-text-secondary)]">Employee PF</span>
                      <span className="text-[var(--color-text)] font-mono">₹{pfSample.employeePF.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--color-text-secondary)]">Employer total</span>
                      <span className="text-[var(--color-text)] font-mono">₹{pfSample.totalEmployer.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ESI */}
            {(company.esiRegistered || company.employeeCount >= 10) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
                <p className="text-sm font-semibold text-[var(--color-text)]">Employee State Insurance (ESI)</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">For employees earning ≤ ₹{ESI_RATES.wage_ceiling.toLocaleString('en-IN')}/month</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employee contribution</span>
                    <span className="text-[var(--color-text)] font-medium">{ESI_RATES.employee}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employer contribution</span>
                    <span className="text-[var(--color-text)] font-medium">{ESI_RATES.employer}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Wage ceiling</span>
                    <span className="text-[var(--color-text)] font-mono">₹{ESI_RATES.wage_ceiling.toLocaleString('en-IN')}</span>
                  </div>
                  {esiSample.isEligible && (
                    <div className="border-t border-[var(--color-border)] pt-2 mt-3">
                      <p className="text-xs text-[var(--color-text-muted)]">Sample (₹{avgSalary.toLocaleString('en-IN')} gross/month):</p>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-[var(--color-text-secondary)]">Employee ESI</span>
                        <span className="text-[var(--color-text)] font-mono">₹{esiSample.employeeESI.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Employer ESI</span>
                        <span className="text-[var(--color-text)] font-mono">₹{esiSample.employerESI.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
