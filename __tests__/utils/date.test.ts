import {
  getFY, getFYLabel, getFYBounds, getFYMonths, getFYQuarter,
  getQuarterBounds, getMonthAfterQuarterEnd,
  isSunday, isSecondOrFourthSaturday, isHoliday, getNextWorkingDay,
  formatPeriod, daysUntil,
} from '@/lib/utils/date'

describe('getFY', () => {
  it('April 2025 → FY 2025', () => {
    expect(getFY(new Date(2025, 3, 1))).toBe(2025)
  })

  it('March 2026 → FY 2025', () => {
    expect(getFY(new Date(2026, 2, 31))).toBe(2025)
  })

  it('January 2026 → FY 2025', () => {
    expect(getFY(new Date(2026, 0, 15))).toBe(2025)
  })

  it('April 2026 → FY 2026', () => {
    expect(getFY(new Date(2026, 3, 1))).toBe(2026)
  })
})

describe('getFYLabel', () => {
  it('returns "FY 2025-26" for any date in FY 2025-26', () => {
    expect(getFYLabel(new Date(2025, 5, 15))).toBe('FY 2025-26')
    expect(getFYLabel(new Date(2026, 1, 15))).toBe('FY 2025-26')
  })
})

describe('getFYMonths', () => {
  it('returns 12 months starting from April', () => {
    const months = getFYMonths(2025)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ year: 2025, month: 3 }) // April
    expect(months[11]).toEqual({ year: 2026, month: 2 }) // March
  })
})

describe('getFYQuarter', () => {
  it('April (3) → Q1', () => expect(getFYQuarter(3)).toBe(1))
  it('June (5) → Q1', () => expect(getFYQuarter(5)).toBe(1))
  it('July (6) → Q2', () => expect(getFYQuarter(6)).toBe(2))
  it('October (9) → Q3', () => expect(getFYQuarter(9)).toBe(3))
  it('January (0) → Q4', () => expect(getFYQuarter(0)).toBe(4))
  it('March (2) → Q4', () => expect(getFYQuarter(2)).toBe(4))
})

describe('getMonthAfterQuarterEnd', () => {
  it('Q1 → July', () => {
    expect(getMonthAfterQuarterEnd(1, 2025)).toEqual({ year: 2025, month: 6 })
  })
  it('Q4 → May (special)', () => {
    expect(getMonthAfterQuarterEnd(4, 2025)).toEqual({ year: 2026, month: 4 })
  })
})

describe('isSunday', () => {
  it('detects Sunday correctly', () => {
    // March 16, 2025 is a Sunday
    expect(isSunday(new Date(2025, 2, 16))).toBe(true)
    expect(isSunday(new Date(2025, 2, 17))).toBe(false) // Monday
  })
})

describe('isSecondOrFourthSaturday', () => {
  it('detects 2nd Saturday', () => {
    // Find a 2nd Saturday: Jan 2026, 2nd Saturday = Jan 10
    const date = new Date(2026, 0, 10) // Jan 10, 2026 is Saturday
    if (date.getDay() === 6) {
      expect(isSecondOrFourthSaturday(date)).toBe(true)
    }
  })

  it('non-Saturday returns false', () => {
    expect(isSecondOrFourthSaturday(new Date(2025, 3, 7))).toBe(false) // Monday
  })
})

describe('getNextWorkingDay', () => {
  it('returns same day if it is a working day', () => {
    const monday = new Date(2025, 3, 7) // April 7, 2025 is Monday
    const result = getNextWorkingDay(monday)
    expect(result.getDate()).toBe(7)
  })

  it('shifts Sunday to Monday', () => {
    const sunday = new Date(2025, 3, 6) // April 6, 2025 is Sunday
    const result = getNextWorkingDay(sunday)
    expect(result.getDay()).not.toBe(0) // Not Sunday
    expect(result.getDate()).toBe(7) // Monday
  })

  it('shifts Republic Day to next working day', () => {
    // Jan 26, 2026 is Monday — but it is a holiday
    const repDay = new Date(2026, 0, 26)
    const result = getNextWorkingDay(repDay)
    expect(result.getDate()).toBe(27) // Next day (Tuesday)
  })
})

describe('formatPeriod', () => {
  it('formats April 2025', () => {
    expect(formatPeriod(2025, 3)).toBe('Apr-2025')
  })
  it('formats March 2026', () => {
    expect(formatPeriod(2026, 2)).toBe('Mar-2026')
  })
})

describe('daysUntil', () => {
  it('returns positive for future dates', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    expect(daysUntil(future)).toBe(5)
  })

  it('returns negative for past dates', () => {
    const past = new Date()
    past.setDate(past.getDate() - 3)
    expect(daysUntil(past)).toBe(-3)
  })

  it('returns 0 for today', () => {
    expect(daysUntil(new Date())).toBe(0)
  })
})
