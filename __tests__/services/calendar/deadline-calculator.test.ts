import { generateDeadlines } from '@/lib/services/calendar/deadline-calculator'

describe('generateDeadlines', () => {
  const FY = 2025 // FY 2025-26

  describe('monthly obligations (fixed_day_of_month)', () => {
    const gstr1Rule = {
      type: 'fixed_day_of_month' as const,
      day: 11,
      relative_to: 'next_month',
      holiday_rule: 'next_working_day',
    }

    it('generates 12 deadlines for monthly obligations', () => {
      const deadlines = generateDeadlines(gstr1Rule, 'monthly', FY)
      expect(deadlines).toHaveLength(12)
    })

    it('GSTR-1 for April 2025 is due May 11 or next working day', () => {
      const deadlines = generateDeadlines(gstr1Rule, 'monthly', FY)
      const april = deadlines[0]
      expect(april.period).toBe('Apr-2025')
      expect(april.dueDate.getMonth()).toBe(4) // May
      // May 11, 2025 is Sunday, May 12 is Buddha Purnima → shifted to May 13 (Tuesday)
      expect(april.originalDueDate.getDate()).toBe(11)
      expect(april.dueDate.getDate()).toBeGreaterThanOrEqual(12) // holiday-adjusted
      expect(april.dueDate.getDay()).not.toBe(0) // not a Sunday
    })

    it('GSTR-1 for March 2026 is due April 11, 2026', () => {
      const deadlines = generateDeadlines(gstr1Rule, 'monthly', FY)
      const march = deadlines[11]
      expect(march.period).toBe('Mar-2026')
      expect(march.dueDate.getMonth()).toBe(3) // April
      expect(march.dueDate.getFullYear()).toBe(2026)
    })

    it('TDS deposit is due 7th of next month', () => {
      const tdsRule = { type: 'fixed_day_of_month' as const, day: 7, relative_to: 'next_month', holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(tdsRule, 'monthly', FY)
      const april = deadlines[0]
      expect(april.dueDate.getDate()).toBe(7)
      expect(april.dueDate.getMonth()).toBe(4) // May
    })

    it('PF payment is due 15th of next month', () => {
      const pfRule = { type: 'fixed_day_of_month' as const, day: 15, relative_to: 'next_month', holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(pfRule, 'monthly', FY)
      expect(deadlines[0].dueDate.getDate()).toBe(15)
    })
  })

  describe('quarterly obligations', () => {
    it('generates 4 deadlines for TDS returns', () => {
      const tdsReturnRule = {
        type: 'fixed_day_of_month' as const,
        day: 31,
        relative_to: 'month_after_quarter',
        quarter_end_months: [6, 9, 12, 3],
        exceptions: { q4_due_month: 5, q4_due_day: 31 },
        holiday_rule: 'next_working_day',
      }
      const deadlines = generateDeadlines(tdsReturnRule, 'quarterly', FY)
      expect(deadlines).toHaveLength(4)
    })

    it('advance tax generates 4 deadlines on specific dates', () => {
      const advTaxRule = {
        type: 'specific_dates' as const,
        dates: [
          { month: 6, day: 15 },
          { month: 9, day: 15 },
          { month: 12, day: 15 },
          { month: 3, day: 15 },
        ],
        holiday_rule: 'next_working_day',
      }
      const deadlines = generateDeadlines(advTaxRule, 'quarterly', FY)
      expect(deadlines).toHaveLength(4)

      // Q1: June 15, 2025 is Sunday → shifted to June 16
      expect(deadlines[0].dueDate.getMonth()).toBe(5) // June (0-indexed)
      expect(deadlines[0].dueDate.getDay()).not.toBe(0) // not Sunday

      // Q4: March 15 of next year
      expect(deadlines[3].dueDate.getMonth()).toBe(2) // March
      expect(deadlines[3].dueDate.getFullYear()).toBe(2026)
    })
  })

  describe('annual obligations (fixed_date)', () => {
    it('DIR-3 KYC due September 30', () => {
      const rule = { type: 'fixed_date' as const, month: 9, day: 30, holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(rule, 'annual', FY)
      expect(deadlines).toHaveLength(1)
      expect(deadlines[0].dueDate.getMonth()).toBe(8) // September
      expect(deadlines[0].dueDate.getDate()).toBe(30)
      expect(deadlines[0].dueDate.getFullYear()).toBe(2025)
    })

    it('ITR due October 31', () => {
      const rule = { type: 'fixed_date' as const, month: 10, day: 31, holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(rule, 'annual', FY)
      expect(deadlines[0].dueDate.getMonth()).toBe(9) // October
      expect(deadlines[0].dueDate.getDate()).toBe(31)
    })

    it('GSTR-9 due December 31', () => {
      const rule = { type: 'fixed_date' as const, month: 12, day: 31, holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(rule, 'annual', FY)
      expect(deadlines[0].dueDate.getMonth()).toBe(11) // December
      expect(deadlines[0].dueDate.getDate()).toBe(31)
    })

    it('ITR (January-March FY dates) maps to next calendar year', () => {
      const rule = { type: 'fixed_date' as const, month: 1, day: 31, holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(rule, 'annual', FY)
      expect(deadlines[0].dueDate.getFullYear()).toBe(2026) // Jan falls in 2026 for FY 2025-26
    })
  })

  describe('AGM-relative obligations', () => {
    it('AOC-4 due 30 days after AGM', () => {
      const rule = { type: 'relative_to_event' as const, event: 'agm_date', offset_days: 30, holiday_rule: 'next_working_day' }
      const agm = new Date(2025, 8, 15) // Sep 15, 2025
      const deadlines = generateDeadlines(rule, 'annual', FY, agm)
      expect(deadlines).toHaveLength(1)
      expect(deadlines[0].dueDate.getMonth()).toBe(9) // October
      expect(deadlines[0].dueDate.getDate()).toBe(15) // Sep 15 + 30 = Oct 15
    })

    it('MGT-7 due 60 days after AGM', () => {
      const rule = { type: 'relative_to_event' as const, event: 'agm_date', offset_days: 60, holiday_rule: 'next_working_day' }
      const agm = new Date(2025, 8, 15) // Sep 15, 2025
      const deadlines = generateDeadlines(rule, 'annual', FY, agm)
      expect(deadlines[0].dueDate.getMonth()).toBe(10) // November
      expect(deadlines[0].dueDate.getDate()).toBe(14) // Sep 15 + 60 = Nov 14
    })

    it('defaults to Sep 30 AGM when no AGM date provided', () => {
      const rule = { type: 'relative_to_event' as const, event: 'agm_date', offset_days: 30, holiday_rule: 'next_working_day' }
      const deadlines = generateDeadlines(rule, 'annual', FY)
      expect(deadlines).toHaveLength(1)
      // Sep 30 + 30 = Oct 30
      expect(deadlines[0].dueDate.getMonth()).toBe(9) // October
      expect(deadlines[0].dueDate.getDate()).toBe(30)
    })
  })

  describe('event-triggered obligations', () => {
    it('returns empty array (no fixed schedule)', () => {
      const rule = { type: 'event_triggered' as const, trigger: 'director_change', deadline_days: 30 }
      const deadlines = generateDeadlines(rule, 'event_based', FY)
      expect(deadlines).toHaveLength(0)
    })
  })

  describe('half-yearly obligations', () => {
    it('MSME-1 generates 2 deadlines', () => {
      const rule = {
        type: 'specific_dates' as const,
        dates: [{ month: 4, day: 30 }, { month: 10, day: 31 }],
        holiday_rule: 'next_working_day',
      }
      const deadlines = generateDeadlines(rule, 'half_yearly', FY)
      expect(deadlines).toHaveLength(2)
    })
  })
})
