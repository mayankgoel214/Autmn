'use client'

import { useState } from 'react'

const plans = [
  {
    key: 'free',
    name: 'Free',
    price: '₹0',
    period: '',
    description: 'Get started with compliance tracking',
    features: [
      'Company profiling from CIN',
      'Full compliance calendar',
      'Deadline email alerts',
      'Basic health score',
    ],
    cta: 'Current Plan',
    disabled: true,
    highlighted: false,
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '₹2,000',
    period: '/month',
    description: 'For startups with active operations',
    features: [
      'Everything in Free',
      'Zoho Books integration',
      'GST computation + GSTR prep',
      'TDS rate lookup',
      'ITC reconciliation',
    ],
    cta: 'Upgrade to Starter',
    disabled: false,
    highlighted: false,
  },
  {
    key: 'growth',
    name: 'Growth',
    price: '₹6,000',
    period: '/month',
    description: 'For funded startups with complex compliance',
    features: [
      'Everything in Starter',
      'GST auto-filing via API',
      'TDS computation',
      'Advance tax estimates',
      'Investor-ready PDF reports',
      'Regulatory intelligence',
      'Team management (CA portal)',
    ],
    cta: 'Upgrade to Growth',
    disabled: false,
    highlighted: true,
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleUpgrade(planKey: string) {
    setLoading(planKey)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Billing is being set up. Contact support.')
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Pricing</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Choose the plan that fits your compliance needs
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map(plan => (
          <div
            key={plan.key}
            className={`rounded-xl border p-6 ${
              plan.highlighted
                ? 'border-[var(--color-primary)] border-2 bg-white shadow-sm'
                : 'border-[var(--color-border)] bg-white'
            }`}
          >
            {plan.highlighted && (
              <span className="inline-flex items-center rounded-full bg-[var(--color-primary)] px-3 py-0.5 text-xs font-medium text-white mb-4">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{plan.name}</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold text-[var(--color-text)]">{plan.price}</span>
              <span className="text-sm text-[var(--color-text-secondary)]">{plan.period}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{plan.description}</p>

            <ul className="mt-6 space-y-3">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[var(--color-text)]">
                  <svg className="h-4 w-4 mt-0.5 shrink-0 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => !plan.disabled && handleUpgrade(plan.key)}
              disabled={plan.disabled || loading === plan.key}
              className={`mt-8 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                plan.disabled
                  ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] cursor-default'
                  : plan.highlighted
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50'
                  : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50'
              }`}
            >
              {loading === plan.key ? 'Loading...' : plan.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
