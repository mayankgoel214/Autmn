import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { computeTaxes } from '@/lib/services/taxes/tax-computation'

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default async function TaxesPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, include: { company: true } })
    : null

  if (!user?.company) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Taxes</h1>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">Set up your company to see tax computations.</p>
        </div>
      </div>
    )
  }

  const taxes = await computeTaxes(user.company.id)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Tax Computations</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {user.company.companyName} — {taxes.period}
          </p>
        </div>
      </div>

      {!taxes.hasRealData && (
        <div className="mt-4 rounded-lg border border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)] p-4">
          <p className="text-sm text-[var(--color-warning)] font-medium">Estimated amounts</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            These are estimates based on your company profile. Connect Zoho Books or TallyPrime in Settings for exact computations from your actual invoices.
          </p>
        </div>
      )}

      {/* GST Summary */}
      {user.company.gstRegistered && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">GST Liability</h2>
          <div className="grid grid-cols-3 gap-4">
            {/* Output Tax */}
            <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Output Tax</p>
              <p className="mt-3 text-2xl font-bold text-[var(--color-text)]">{fmt(taxes.gst.outputTax.total)}</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">CGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.outputTax.cgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">SGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.outputTax.sgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">IGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.outputTax.igst)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">From ~{taxes.gst.invoiceCount} invoices</p>
            </div>

            {/* ITC */}
            <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Input Tax Credit</p>
              <p className="mt-3 text-2xl font-bold text-[var(--color-success)]">{fmt(taxes.gst.inputTaxCredit.total)}</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">CGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.inputTaxCredit.cgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">SGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.inputTaxCredit.sgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">IGST</span>
                  <span className="text-[var(--color-text)] font-mono">{fmt(taxes.gst.inputTaxCredit.igst)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">From ~{taxes.gst.billCount} purchase bills</p>
            </div>

            {/* Net Payable */}
            <div className="rounded-lg border-2 border-[var(--color-primary)] bg-[var(--color-primary-light)] p-5">
              <p className="text-xs font-medium text-[var(--color-primary)] uppercase tracking-wide">Net GST Payable</p>
              <p className="mt-3 text-2xl font-bold text-[var(--color-primary)]">{fmt(taxes.gst.netPayable.total)}</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">CGST</span>
                  <span className="text-[var(--color-primary)] font-mono font-medium">{fmt(taxes.gst.netPayable.cgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">SGST</span>
                  <span className="text-[var(--color-primary)] font-mono font-medium">{fmt(taxes.gst.netPayable.sgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">IGST</span>
                  <span className="text-[var(--color-primary)] font-mono font-medium">{fmt(taxes.gst.netPayable.igst)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Output Tax - ITC = Net Payable</p>
            </div>
          </div>
        </div>
      )}

      {/* TDS Summary */}
      {taxes.tds.deductions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">TDS Deductions</h2>
          <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase">Section</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase">Payment To</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)] uppercase">TDS</th>
                </tr>
              </thead>
              <tbody>
                {taxes.tds.deductions.map((d, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-3 text-sm font-mono text-[var(--color-primary)]">{d.section}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-[var(--color-text)]">{d.payeeName}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{d.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--color-text)] font-mono">{fmt(d.amount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--color-text)]">{d.rate}%</td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--color-error)] font-mono font-medium">{fmt(d.tdsAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--color-bg-secondary)]">
                  <td colSpan={4} className="px-4 py-3 text-sm font-medium text-[var(--color-text)]">Total TDS to Deposit</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-[var(--color-error)] font-mono">{fmt(taxes.tds.totalTDS)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="px-4 py-2 bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
              TDS rates per Finance Act 2024. Deposit by 7th of next month.
            </div>
          </div>
        </div>
      )}

      {/* PF/ESI Summary */}
      {(taxes.pfEsi.totalPFEmployee > 0 || taxes.pfEsi.totalESIEmployee > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">PF & ESI Contributions</h2>
          <div className="grid grid-cols-2 gap-4">
            {taxes.pfEsi.totalPFEmployee > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Provident Fund</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">For {taxes.pfEsi.employeeCount} employees</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employee deduction (12%)</span>
                    <span className="text-[var(--color-text)] font-mono">{fmt(taxes.pfEsi.totalPFEmployee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employer contribution</span>
                    <span className="text-[var(--color-text)] font-mono">{fmt(taxes.pfEsi.totalPFEmployer)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t border-[var(--color-border)] pt-2">
                    <span className="text-[var(--color-text)]">Total PF deposit</span>
                    <span className="text-[var(--color-primary)] font-mono">{fmt(taxes.pfEsi.totalPFEmployee + taxes.pfEsi.totalPFEmployer)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">Due by 15th of next month</p>
              </div>
            )}

            {taxes.pfEsi.totalESIEmployee > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Employee State Insurance</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">For eligible employees (wages ≤ ₹21,000)</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employee deduction (0.75%)</span>
                    <span className="text-[var(--color-text)] font-mono">{fmt(taxes.pfEsi.totalESIEmployee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Employer contribution (3.25%)</span>
                    <span className="text-[var(--color-text)] font-mono">{fmt(taxes.pfEsi.totalESIEmployer)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t border-[var(--color-border)] pt-2">
                    <span className="text-[var(--color-text)]">Total ESI deposit</span>
                    <span className="text-[var(--color-primary)] font-mono">{fmt(taxes.pfEsi.totalESIEmployee + taxes.pfEsi.totalESIEmployer)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">Due by 15th of next month</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly Summary */}
      <div className="mt-8 rounded-lg border-2 border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Monthly Total Outflow</h2>
        <div className="space-y-3">
          {user.company.gstRegistered && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text)]">GST Payable</span>
              <span className="text-[var(--color-text)] font-mono font-medium">{fmt(taxes.gst.netPayable.total)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text)]">TDS to Deposit</span>
            <span className="text-[var(--color-text)] font-mono font-medium">{fmt(taxes.tds.totalTDS)}</span>
          </div>
          {taxes.pfEsi.totalPFEmployee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text)]">PF Contribution</span>
              <span className="text-[var(--color-text)] font-mono font-medium">{fmt(taxes.pfEsi.totalPFEmployee + taxes.pfEsi.totalPFEmployer)}</span>
            </div>
          )}
          {taxes.pfEsi.totalESIEmployee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text)]">ESI Contribution</span>
              <span className="text-[var(--color-text)] font-mono font-medium">{fmt(taxes.pfEsi.totalESIEmployee + taxes.pfEsi.totalESIEmployer)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t-2 border-[var(--color-border)] pt-3">
            <span className="text-[var(--color-text)]">Total Monthly Compliance Cost</span>
            <span className="text-[var(--color-primary)] font-mono">
              {fmt(
                taxes.gst.netPayable.total +
                taxes.tds.totalTDS +
                taxes.pfEsi.totalPFEmployee + taxes.pfEsi.totalPFEmployer +
                taxes.pfEsi.totalESIEmployee + taxes.pfEsi.totalESIEmployer
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
