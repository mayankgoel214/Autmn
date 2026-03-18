import { computePFContribution, computeESIContribution, PF_RATES, ESI_RATES } from '@/lib/rules/pf-esi-rates'

describe('computePFContribution', () => {
  it('computes correctly for Rs.30,000 basic', () => {
    const result = computePFContribution(30000)
    // Employee: 12% of 30000 = 3600
    expect(result.employeePF).toBe(3600)
    // Employer total: 12% of 30000 = 3600
    // EPS: 8.33% of 15000 (capped) = 1250 (rounded)
    expect(result.employerEPS).toBe(1250)
    // EPF: 3600 - 1250 = 2350
    expect(result.employerEPF).toBe(2350)
  })

  it('caps EPS at Rs.15,000 wage ceiling', () => {
    const result = computePFContribution(50000)
    // EPS should be on 15000, not 50000
    expect(result.employerEPS).toBe(Math.round(15000 * 8.33 / 100))
  })

  it('applies minimum Rs.500 admin charge', () => {
    const result = computePFContribution(10000)
    // 0.5% of 10000 = 50, but minimum is 500
    expect(result.employerAdmin).toBe(500)
  })

  it('admin charge is 0.5% when basic is high enough', () => {
    const result = computePFContribution(200000)
    // 0.5% of 200000 = 1000
    expect(result.employerAdmin).toBe(1000)
  })

  it('employee PF is exactly 12%', () => {
    expect(computePFContribution(25000).employeePF).toBe(3000)
    expect(computePFContribution(15000).employeePF).toBe(1800)
    expect(computePFContribution(50000).employeePF).toBe(6000)
  })
})

describe('computeESIContribution', () => {
  it('computes correctly for Rs.15,000 gross', () => {
    const result = computeESIContribution(15000)
    expect(result.isEligible).toBe(true)
    // Employee: 0.75% of 15000 = 112.5 → 113
    expect(result.employeeESI).toBe(113)
    // Employer: 3.25% of 15000 = 487.5 → 488
    expect(result.employerESI).toBe(488)
  })

  it('returns zero for wages above Rs.21,000 ceiling', () => {
    const result = computeESIContribution(25000)
    expect(result.isEligible).toBe(false)
    expect(result.employeeESI).toBe(0)
    expect(result.employerESI).toBe(0)
  })

  it('is eligible at exactly Rs.21,000', () => {
    const result = computeESIContribution(21000)
    expect(result.isEligible).toBe(true)
  })

  it('is not eligible at Rs.21,001', () => {
    const result = computeESIContribution(21001)
    expect(result.isEligible).toBe(false)
  })

  it('total ESI equals employee + employer', () => {
    const result = computeESIContribution(20000)
    expect(result.totalESI).toBe(result.employeeESI + result.employerESI)
  })
})

describe('rate constants', () => {
  it('PF trigger is 20 employees', () => {
    expect(PF_RATES.trigger_employee_count).toBe(20)
  })

  it('ESI trigger is 10 employees', () => {
    expect(ESI_RATES.trigger_employee_count).toBe(10)
  })

  it('ESI wage ceiling is Rs.21,000', () => {
    expect(ESI_RATES.wage_ceiling).toBe(21000)
  })

  it('EPS wage ceiling is Rs.15,000', () => {
    expect(PF_RATES.eps_wage_ceiling).toBe(15000)
  })
})
