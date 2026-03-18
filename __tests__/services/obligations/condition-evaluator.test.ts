import { evaluateConditions, type CompanyProfile } from '@/lib/services/obligations/condition-evaluator'

// Base profile — typical funded startup
const baseProfile: CompanyProfile = {
  entityType: 'private_limited',
  mcaStatus: 'Active',
  employeeCount: 45,
  annualTurnover: 20000000, // 2 crore
  gstRegistered: true,
  gstScheme: 'regular',
  pfRegistered: true,
  esiRegistered: true,
  hasForeignInvestment: true,
  dpiitRecognized: true,
  operatingStates: ['MH', 'KA'],
  industrySector: 'SaaS',
}

describe('evaluateConditions', () => {
  // ============================================================
  // Basic operators
  // ============================================================
  it('evaluates eq correctly', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'entity_type', op: 'eq', value: 'private_limited' }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('evaluates neq correctly', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'gst_scheme', op: 'neq', value: 'composition' }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('evaluates gte correctly', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'employee_count', op: 'gte', value: 20 }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('evaluates gt correctly', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'annual_turnover', op: 'gt', value: 10000000 }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('evaluates in correctly', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('evaluates contains correctly (array field)', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'operating_states', op: 'contains', value: 'MH' }],
    }, baseProfile)
    expect(result).toBe(true)
  })

  it('returns false for contains when state not present', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [{ field: 'operating_states', op: 'contains', value: 'DL' }],
    }, baseProfile)
    expect(result).toBe(false)
  })

  // ============================================================
  // AND / OR logic
  // ============================================================
  it('AND requires all conditions true', () => {
    const result = evaluateConditions({
      operator: 'AND',
      conditions: [
        { field: 'gst_registered', op: 'eq', value: true },
        { field: 'employee_count', op: 'gte', value: 100 }, // false — only 45
      ],
    }, baseProfile)
    expect(result).toBe(false)
  })

  it('OR requires at least one condition true', () => {
    const result = evaluateConditions({
      operator: 'OR',
      conditions: [
        { field: 'employee_count', op: 'gte', value: 100 }, // false
        { field: 'gst_registered', op: 'eq', value: true }, // true
      ],
    }, baseProfile)
    expect(result).toBe(true)
  })

  // ============================================================
  // Nested groups
  // ============================================================
  it('handles nested condition groups', () => {
    const result = evaluateConditions({
      operator: 'OR',
      conditions: [
        {
          operator: 'AND',
          conditions: [
            { field: 'annual_turnover', op: 'gt', value: 100000000 }, // > 10 crore — false
          ],
        },
        {
          operator: 'AND',
          conditions: [
            { field: 'gst_registered', op: 'eq', value: true }, // true
            { field: 'annual_turnover', op: 'gt', value: 10000000 }, // > 1 crore — true
          ],
        },
      ],
    }, baseProfile)
    expect(result).toBe(true)
  })

  // ============================================================
  // Real obligation conditions
  // ============================================================
  describe('GSTR-1 applicability', () => {
    const gstr1Conditions = {
      operator: 'AND' as const,
      conditions: [
        { field: 'gst_registered', op: 'eq' as const, value: true },
        { field: 'gst_scheme', op: 'neq' as const, value: 'composition' },
        { field: 'gst_scheme', op: 'neq' as const, value: 'qrmp' },
      ],
    }

    it('applies to regular GST-registered company', () => {
      expect(evaluateConditions(gstr1Conditions, baseProfile)).toBe(true)
    })

    it('does NOT apply to non-GST company', () => {
      expect(evaluateConditions(gstr1Conditions, { ...baseProfile, gstRegistered: false })).toBe(false)
    })

    it('does NOT apply to composition scheme', () => {
      expect(evaluateConditions(gstr1Conditions, { ...baseProfile, gstScheme: 'composition' })).toBe(false)
    })

    it('does NOT apply to QRMP scheme', () => {
      expect(evaluateConditions(gstr1Conditions, { ...baseProfile, gstScheme: 'qrmp' })).toBe(false)
    })
  })

  describe('PF applicability', () => {
    const pfConditions = {
      operator: 'AND' as const,
      conditions: [
        { field: 'employee_count', op: 'gte' as const, value: 20 },
        { field: 'pf_registered', op: 'eq' as const, value: true },
      ],
    }

    it('applies when 20+ employees and PF registered', () => {
      expect(evaluateConditions(pfConditions, baseProfile)).toBe(true)
    })

    it('does NOT apply with < 20 employees', () => {
      expect(evaluateConditions(pfConditions, { ...baseProfile, employeeCount: 15 })).toBe(false)
    })

    it('does NOT apply when not PF registered', () => {
      expect(evaluateConditions(pfConditions, { ...baseProfile, pfRegistered: false })).toBe(false)
    })

    it('applies at exactly 20 employees (boundary)', () => {
      expect(evaluateConditions(pfConditions, { ...baseProfile, employeeCount: 20 })).toBe(true)
    })

    it('does NOT apply at 19 employees (boundary)', () => {
      expect(evaluateConditions(pfConditions, { ...baseProfile, employeeCount: 19 })).toBe(false)
    })
  })

  describe('ESI applicability', () => {
    it('applies when 10+ employees and ESI registered', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'employee_count', op: 'gte', value: 10 },
          { field: 'esi_registered', op: 'eq', value: true },
        ],
      }, baseProfile)
      expect(result).toBe(true)
    })

    it('does NOT apply with < 10 employees', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'employee_count', op: 'gte', value: 10 },
          { field: 'esi_registered', op: 'eq', value: true },
        ],
      }, { ...baseProfile, employeeCount: 9 })
      expect(result).toBe(false)
    })
  })

  describe('Tax Audit applicability', () => {
    it('applies when turnover > 1 crore', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'annual_turnover', op: 'gt', value: 10000000 },
        ],
      }, baseProfile) // 2 crore
      expect(result).toBe(true)
    })

    it('does NOT apply when turnover < 1 crore', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'annual_turnover', op: 'gt', value: 10000000 },
        ],
      }, { ...baseProfile, annualTurnover: 5000000 }) // 50 lakh
      expect(result).toBe(false)
    })
  })

  describe('Professional Tax — state-specific', () => {
    it('applies Maharashtra PT when operating in MH', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'operating_states', op: 'contains', value: 'MH' },
          { field: 'employee_count', op: 'gte', value: 1 },
        ],
      }, baseProfile) // operates in MH
      expect(result).toBe(true)
    })

    it('does NOT apply Delhi PT (Delhi has no PT)', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'operating_states', op: 'contains', value: 'DL' },
        ],
      }, baseProfile) // does NOT operate in DL
      expect(result).toBe(false)
    })
  })

  describe('GSTR-9C applicability (turnover > 5 crore)', () => {
    it('does NOT apply when turnover is 2 crore', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'gst_registered', op: 'eq', value: true },
          { field: 'annual_turnover', op: 'gt', value: 50000000 },
        ],
      }, baseProfile) // 2 crore
      expect(result).toBe(false)
    })

    it('applies when turnover is 6 crore', () => {
      const result = evaluateConditions({
        operator: 'AND',
        conditions: [
          { field: 'gst_registered', op: 'eq', value: true },
          { field: 'annual_turnover', op: 'gt', value: 50000000 },
        ],
      }, { ...baseProfile, annualTurnover: 60000000 })
      expect(result).toBe(true)
    })
  })
})
