/**
 * Indian Financial Year Date Utilities
 *
 * India's FY: April 1 to March 31
 * FY 2025-26 = April 1, 2025 to March 31, 2026
 */

/**
 * Get the financial year for a given date.
 * Returns the starting year (e.g., 2025 for FY 2025-26)
 */
export function getFY(date: Date): number {
  const month = date.getMonth() // 0-indexed
  const year = date.getFullYear()
  return month >= 3 ? year : year - 1 // April (3) onwards = current year's FY
}

/**
 * Get FY label string (e.g., "FY 2025-26")
 */
export function getFYLabel(date: Date): string {
  const fy = getFY(date)
  return `FY ${fy}-${(fy + 1).toString().slice(2)}`
}

/**
 * Get the start and end dates of a financial year.
 */
export function getFYBounds(fyStartYear: number): { start: Date; end: Date } {
  return {
    start: new Date(fyStartYear, 3, 1), // April 1
    end: new Date(fyStartYear + 1, 2, 31), // March 31
  }
}

/**
 * Get all 12 months in a financial year as {year, month} pairs.
 * Month is 0-indexed (0=Jan, 3=Apr, etc.)
 */
export function getFYMonths(fyStartYear: number): Array<{ year: number; month: number }> {
  const months = []
  for (let i = 0; i < 12; i++) {
    const month = (3 + i) % 12 // Start from April (3)
    const year = month >= 3 ? fyStartYear : fyStartYear + 1
    months.push({ year, month })
  }
  return months
}

/**
 * Get the quarter (1-4) for a given month in FY context.
 * Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar
 */
export function getFYQuarter(month: number): number {
  if (month >= 3 && month <= 5) return 1 // Apr-Jun
  if (month >= 6 && month <= 8) return 2 // Jul-Sep
  if (month >= 9 && month <= 11) return 3 // Oct-Dec
  return 4 // Jan-Mar
}

/**
 * Get quarter boundaries for a given FY quarter.
 */
export function getQuarterBounds(fyStartYear: number, quarter: number): { start: Date; end: Date } {
  const quarterMonths: Record<number, { startMonth: number; endMonth: number; startYear: number; endYear: number }> = {
    1: { startMonth: 3, endMonth: 5, startYear: fyStartYear, endYear: fyStartYear },
    2: { startMonth: 6, endMonth: 8, startYear: fyStartYear, endYear: fyStartYear },
    3: { startMonth: 9, endMonth: 11, startYear: fyStartYear, endYear: fyStartYear },
    4: { startMonth: 0, endMonth: 2, startYear: fyStartYear + 1, endYear: fyStartYear + 1 },
  }
  const q = quarterMonths[quarter]
  const lastDay = new Date(q.endYear, q.endMonth + 1, 0).getDate()
  return {
    start: new Date(q.startYear, q.startMonth, 1),
    end: new Date(q.endYear, q.endMonth, lastDay),
  }
}

/**
 * Get the month after quarter end (for TDS return due dates).
 * Q1 (Apr-Jun) → Jul, Q2 (Jul-Sep) → Oct, Q3 (Oct-Dec) → Jan, Q4 (Jan-Mar) → May (special)
 */
export function getMonthAfterQuarterEnd(quarter: number, fyStartYear: number): { year: number; month: number } {
  switch (quarter) {
    case 1: return { year: fyStartYear, month: 6 } // July
    case 2: return { year: fyStartYear, month: 9 } // October
    case 3: return { year: fyStartYear + 1, month: 0 } // January
    case 4: return { year: fyStartYear + 1, month: 4 } // May (Q4 special)
    default: throw new Error(`Invalid quarter: ${quarter}`)
  }
}

/**
 * Format a period label.
 */
export function formatPeriod(year: number, month: number): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[month]}-${year}`
}

export function formatQuarter(quarter: number, fyStartYear: number): string {
  return `Q${quarter}-${getFYLabel(new Date(fyStartYear, 3, 1)).replace('FY ', '')}`
}

/**
 * Indian national holidays and bank holidays.
 * These cause government offices to be closed.
 * Returns dates for a given calendar year.
 */
export function getIndianHolidays(year: number): Date[] {
  // Fixed national holidays (same every year)
  const fixed = [
    new Date(year, 0, 26),  // Republic Day — Jan 26
    new Date(year, 3, 14),  // Ambedkar Jayanti — Apr 14
    new Date(year, 4, 1),   // May Day — May 1
    new Date(year, 7, 15),  // Independence Day — Aug 15
    new Date(year, 9, 2),   // Gandhi Jayanti — Oct 2
    new Date(year, 11, 25), // Christmas — Dec 25
  ]

  // Variable holidays by year (from DOPT gazette notifications)
  const variable: Record<number, Date[]> = {
    2025: [
      new Date(2025, 2, 14),  // Holi — Mar 14
      new Date(2025, 3, 10),  // Mahavir Jayanti — Apr 10
      new Date(2025, 3, 18),  // Good Friday — Apr 18
      new Date(2025, 4, 12),  // Buddha Purnima — May 12
      new Date(2025, 9, 20),  // Diwali — Oct 20
      new Date(2025, 10, 5),  // Guru Nanak Jayanti — Nov 5
    ],
    2026: [
      new Date(2026, 2, 4),   // Holi — Mar 4
      new Date(2026, 2, 26),  // Ram Navami — Mar 26
      new Date(2026, 3, 3),   // Good Friday — Apr 3
      new Date(2026, 4, 1),   // Buddha Purnima — May 1
      new Date(2026, 9, 20),  // Dussehra — Oct 20
      new Date(2026, 10, 8),  // Diwali — Nov 8
      new Date(2026, 10, 24), // Guru Nanak Jayanti — Nov 24
    ],
    2027: [
      new Date(2027, 2, 22),  // Holi — Mar 22 (approximate)
      new Date(2027, 3, 2),   // Good Friday — Apr 2
      new Date(2027, 9, 10),  // Dussehra — Oct 10 (approximate)
      new Date(2027, 9, 29),  // Diwali — Oct 29 (approximate)
    ],
  }

  return [...fixed, ...(variable[year] || [])]
}

/**
 * Check if a date is a Sunday.
 */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0
}

/**
 * Check if a date is a second or fourth Saturday (bank holiday in India).
 */
export function isSecondOrFourthSaturday(date: Date): boolean {
  if (date.getDay() !== 6) return false
  const dayOfMonth = date.getDate()
  const weekNumber = Math.ceil(dayOfMonth / 7)
  return weekNumber === 2 || weekNumber === 4
}

/**
 * Check if a date is a holiday (Sunday, 2nd/4th Saturday, or national holiday).
 */
export function isHoliday(date: Date): boolean {
  if (isSunday(date)) return true
  if (isSecondOrFourthSaturday(date)) return true

  const holidays = getIndianHolidays(date.getFullYear())
  return holidays.some(h =>
    h.getFullYear() === date.getFullYear() &&
    h.getMonth() === date.getMonth() &&
    h.getDate() === date.getDate()
  )
}

/**
 * Get the next working day if the given date is a holiday.
 * Per Section 10, General Clauses Act 1897.
 */
export function getNextWorkingDay(date: Date): Date {
  const result = new Date(date)
  while (isHoliday(result)) {
    result.setDate(result.getDate() + 1)
  }
  return result
}

/**
 * Format date as DD MMM YYYY (e.g., "11 Apr 2026")
 */
export function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Get days remaining until a date. Negative if past.
 */
export function daysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
