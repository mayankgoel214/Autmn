import { getTDSRate, computeTDS } from '@/lib/rules/tds-rates'

describe('getTDSRate', () => {
  it('194C: 1% for individual, 2% for company', () => {
    expect(getTDSRate('194C', 'individual')).toBe(1)
    expect(getTDSRate('194C', 'company')).toBe(2)
  })

  it('194H: 2% (corrected from 5% by Finance Act 2024)', () => {
    expect(getTDSRate('194H')).toBe(2)
  })

  it('194O: 0.1% (corrected from 1% by Finance Act 2024)', () => {
    expect(getTDSRate('194O')).toBe(0.1)
  })

  it('194J: 10% for professional fees', () => {
    expect(getTDSRate('194J')).toBe(10)
  })

  it('194J_TECHNICAL: 2% for technical fees', () => {
    expect(getTDSRate('194J_TECHNICAL')).toBe(2)
  })

  it('194I: 10% for building rent', () => {
    expect(getTDSRate('194I')).toBe(10)
  })

  it('194A: 10% for interest', () => {
    expect(getTDSRate('194A')).toBe(10)
  })

  it('returns 0 for unknown section', () => {
    expect(getTDSRate('999')).toBe(0)
  })
})

describe('computeTDS', () => {
  it('computes TDS on contractor payment (individual)', () => {
    // Rs.50,000 to individual contractor at 1%
    expect(computeTDS('194C', 50000, 'individual')).toBe(500)
  })

  it('computes TDS on contractor payment (company)', () => {
    // Rs.50,000 to company contractor at 2%
    expect(computeTDS('194C', 50000, 'company')).toBe(1000)
  })

  it('computes TDS on professional fees at 10%', () => {
    expect(computeTDS('194J', 100000, 'individual')).toBe(10000)
  })

  it('computes TDS on rent at 10%', () => {
    expect(computeTDS('194I', 240000, 'individual')).toBe(24000)
  })

  it('computes TDS on commission at 2% (Finance Act 2024)', () => {
    expect(computeTDS('194H', 100000)).toBe(2000)
  })

  it('applies 20% when PAN not available (Section 206AA)', () => {
    // 194C rate is 1%, but without PAN it becomes 20%
    expect(computeTDS('194C', 100000, 'individual', false)).toBe(20000)
  })

  it('uses higher of rate or 20% when no PAN', () => {
    // 194J rate is 10%, without PAN it becomes 20% (higher)
    expect(computeTDS('194J', 100000, 'individual', false)).toBe(20000)
  })

  it('returns 0 for salary (per slab, not fixed rate)', () => {
    expect(computeTDS('192', 500000)).toBe(0)
  })

  it('returns 0 for unknown section', () => {
    expect(computeTDS('999', 100000)).toBe(0)
  })
})
