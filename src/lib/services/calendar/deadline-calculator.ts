/**
 * Deadline Calculator
 *
 * Interprets the due_date_rule JSON from compliance obligations
 * and computes actual filing dates for a given financial year.
 */

import {
  getFYMonths,
  getMonthAfterQuarterEnd,
  getNextWorkingDay,
  formatPeriod,
  formatQuarter,
} from '@/lib/utils/date'

interface DueDateRule {
  type: 'fixed_day_of_month' | 'fixed_date' | 'relative_to_event' | 'specific_dates' | 'event_triggered'
  day?: number
  month?: number
  relative_to?: string
  quarter_end_months?: number[]
  exceptions?: { q4_due_month?: number; q4_due_day?: number }
  dates?: Array<{ month: number; day: number }>
  event?: string
  offset_days?: number
  trigger?: string
  deadline_days?: number
  holiday_rule?: string
  one_time?: boolean
}

export interface GeneratedDeadline {
  period: string
  dueDate: Date
  originalDueDate: Date // before holiday adjustment
}

/**
 * Generate all filing deadlines for one obligation for a given FY.
 */
export function generateDeadlines(
  rule: DueDateRule,
  frequency: string,
  fyStartYear: number,
  agmDate?: Date
): GeneratedDeadline[] {
  switch (rule.type) {
    case 'fixed_day_of_month':
      return generateFixedDayOfMonth(rule, frequency, fyStartYear)
    case 'fixed_date':
      return generateFixedDate(rule, fyStartYear)
    case 'specific_dates':
      return generateSpecificDates(rule, fyStartYear)
    case 'relative_to_event':
      return generateRelativeToEvent(rule, fyStartYear, agmDate)
    case 'event_triggered':
      return [] // Event-triggered obligations don't have fixed deadlines
    default:
      return []
  }
}

function applyHolidayRule(date: Date, rule?: string): Date {
  if (rule === 'next_working_day') {
    return getNextWorkingDay(date)
  }
  return date
}

/**
 * Monthly obligations: generate 12 deadlines for FY
 * Quarterly obligations: generate 4 deadlines
 */
function generateFixedDayOfMonth(
  rule: DueDateRule,
  frequency: string,
  fyStartYear: number
): GeneratedDeadline[] {
  const deadlines: GeneratedDeadline[] = []

  if (frequency === 'monthly') {
    const months = getFYMonths(fyStartYear)
    for (const { year, month } of months) {
      // "next_month" means the obligation for period X is due in month X+1
      let dueYear = year
      let dueMonth = month
      if (rule.relative_to === 'next_month') {
        dueMonth = month + 1
        if (dueMonth > 11) {
          dueMonth = 0
          dueYear = year + 1
        }
      }

      const day = Math.min(rule.day!, new Date(dueYear, dueMonth + 1, 0).getDate())
      const originalDate = new Date(dueYear, dueMonth, day)
      const adjustedDate = applyHolidayRule(originalDate, rule.holiday_rule)

      deadlines.push({
        period: formatPeriod(year, month),
        dueDate: adjustedDate,
        originalDueDate: originalDate,
      })
    }
  } else if (frequency === 'quarterly') {
    // For quarterly with fixed_day_of_month (like TDS returns)
    for (let q = 1; q <= 4; q++) {
      const afterQuarter = getMonthAfterQuarterEnd(q, fyStartYear)

      // Handle Q4 special case (TDS Q4 return due in May, not April)
      let dueMonth = afterQuarter.month
      let dueYear = afterQuarter.year
      let dueDay = rule.day!

      if (q === 4 && rule.exceptions?.q4_due_month) {
        dueMonth = rule.exceptions.q4_due_month - 1 // Convert 1-indexed to 0-indexed
        dueDay = rule.exceptions.q4_due_day || rule.day!
      }

      dueDay = Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
      const originalDate = new Date(dueYear, dueMonth, dueDay)
      const adjustedDate = applyHolidayRule(originalDate, rule.holiday_rule)

      deadlines.push({
        period: formatQuarter(q, fyStartYear),
        dueDate: adjustedDate,
        originalDueDate: originalDate,
      })
    }
  }

  return deadlines
}

/**
 * Annual obligations with a fixed date (e.g., DIR-3 KYC due Sep 30)
 */
function generateFixedDate(rule: DueDateRule, fyStartYear: number): GeneratedDeadline[] {
  const month = rule.month! - 1 // Convert 1-indexed to 0-indexed
  // Determine which calendar year this falls in based on FY
  const year = month >= 3 ? fyStartYear : fyStartYear + 1

  const day = Math.min(rule.day!, new Date(year, month + 1, 0).getDate())
  const originalDate = new Date(year, month, day)
  const adjustedDate = applyHolidayRule(originalDate, rule.holiday_rule)

  const fyLabel = `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`

  return [{
    period: fyLabel,
    dueDate: adjustedDate,
    originalDueDate: originalDate,
  }]
}

/**
 * Obligations with multiple specific dates in a year (e.g., Advance Tax)
 */
function generateSpecificDates(rule: DueDateRule, fyStartYear: number): GeneratedDeadline[] {
  if (!rule.dates) return []

  return rule.dates.map((d, i) => {
    const month = d.month - 1 // Convert 1-indexed to 0-indexed
    const year = month >= 3 ? fyStartYear : fyStartYear + 1
    const day = Math.min(d.day, new Date(year, month + 1, 0).getDate())

    const originalDate = new Date(year, month, day)
    const adjustedDate = applyHolidayRule(originalDate, rule.holiday_rule)

    // For advance tax: Q1, Q2, Q3, Q4
    const quarter = i + 1

    return {
      period: `Q${quarter}-${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`,
      dueDate: adjustedDate,
      originalDueDate: originalDate,
    }
  })
}

/**
 * Obligations relative to an event (e.g., AOC-4 = AGM + 30 days)
 */
function generateRelativeToEvent(
  rule: DueDateRule,
  fyStartYear: number,
  agmDate?: Date
): GeneratedDeadline[] {
  if (rule.event === 'agm_date') {
    // If AGM date is known, compute from it. Otherwise, assume Sep 30 (last possible date)
    const baseDate = agmDate || new Date(fyStartYear, 8, 30) // Sep 30
    const dueDate = new Date(baseDate)
    dueDate.setDate(dueDate.getDate() + (rule.offset_days || 0))

    const adjustedDate = applyHolidayRule(dueDate, rule.holiday_rule)
    const fyLabel = `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`

    return [{
      period: fyLabel,
      dueDate: adjustedDate,
      originalDueDate: dueDate,
    }]
  }

  return []
}
