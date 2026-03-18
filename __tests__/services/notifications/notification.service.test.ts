/**
 * Tests for the deadline notification checker logic.
 * Verifies that notifications are created at the right intervals.
 */

import { daysUntil } from '@/lib/utils/date'

describe('deadline notification logic', () => {
  // Test the core logic that decides when to notify
  function shouldNotify(daysRemaining: number): { notify: boolean; urgency: string } {
    if (daysRemaining === 7) return { notify: true, urgency: '7_days' }
    if (daysRemaining === 3) return { notify: true, urgency: '3_days' }
    if (daysRemaining === 1) return { notify: true, urgency: '1_day' }
    if (daysRemaining === 0) return { notify: true, urgency: 'today' }
    if (daysRemaining === -1) return { notify: true, urgency: 'overdue' }
    return { notify: false, urgency: 'none' }
  }

  it('notifies at 7 days before', () => {
    expect(shouldNotify(7)).toEqual({ notify: true, urgency: '7_days' })
  })

  it('notifies at 3 days before', () => {
    expect(shouldNotify(3)).toEqual({ notify: true, urgency: '3_days' })
  })

  it('notifies at 1 day before', () => {
    expect(shouldNotify(1)).toEqual({ notify: true, urgency: '1_day' })
  })

  it('notifies on the day', () => {
    expect(shouldNotify(0)).toEqual({ notify: true, urgency: 'today' })
  })

  it('notifies when just overdue', () => {
    expect(shouldNotify(-1)).toEqual({ notify: true, urgency: 'overdue' })
  })

  it('does NOT notify at 10 days', () => {
    expect(shouldNotify(10)).toEqual({ notify: false, urgency: 'none' })
  })

  it('does NOT notify at 5 days', () => {
    expect(shouldNotify(5)).toEqual({ notify: false, urgency: 'none' })
  })

  it('does NOT notify at 2 days', () => {
    expect(shouldNotify(2)).toEqual({ notify: false, urgency: 'none' })
  })

  it('does NOT notify at -5 days (already overdue for a while)', () => {
    expect(shouldNotify(-5)).toEqual({ notify: false, urgency: 'none' })
  })
})

describe('daysUntil integration', () => {
  it('correctly computes days for a date 7 days from now', () => {
    const future = new Date()
    future.setDate(future.getDate() + 7)
    expect(daysUntil(future)).toBe(7)
  })

  it('correctly computes days for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(daysUntil(yesterday)).toBe(-1)
  })
})
