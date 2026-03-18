/**
 * Health score computation logic tests.
 * Tests the scoring algorithm independently of the database.
 */

describe('health score algorithm', () => {
  // Test the scoring logic in isolation
  function computeCategoryScore(
    total: number,
    filed: number,
    overdue: number,
    maxScore: number
  ): number {
    if (total === 0) return maxScore

    let score = Math.round((filed / total) * maxScore * 0.5)
    const overduePenalty = Math.min(overdue * 3, maxScore * 0.4)
    score = Math.max(0, score - overduePenalty)
    if (overdue === 0) score += Math.round(maxScore * 0.3)
    const upcoming = total - filed - overdue
    if (upcoming > 0 && overdue === 0) score += Math.round(maxScore * 0.2)
    return Math.min(score, maxScore)
  }

  it('returns max score when no filings exist (no obligations)', () => {
    expect(computeCategoryScore(0, 0, 0, 25)).toBe(25)
  })

  it('perfect score: all filed, no overdue', () => {
    const score = computeCategoryScore(12, 12, 0, 25)
    // 50% weight for filed (13) + 30% bonus for no overdue (8) = 21
    // No upcoming bonus since all are filed
    expect(score).toBe(21)
    expect(score).toBeGreaterThan(15) // should be high
  })

  it('zero overdue gives bonus', () => {
    const withOverdue = computeCategoryScore(12, 0, 3, 25)
    const withoutOverdue = computeCategoryScore(12, 0, 0, 25)
    expect(withoutOverdue).toBeGreaterThan(withOverdue)
  })

  it('overdue items reduce score', () => {
    const clean = computeCategoryScore(12, 6, 0, 25)
    const dirty = computeCategoryScore(12, 6, 3, 25)
    expect(dirty).toBeLessThan(clean)
  })

  it('many overdue items heavily penalize', () => {
    const score = computeCategoryScore(12, 0, 10, 25)
    expect(score).toBe(0) // penalty exceeds base score
  })

  it('score never exceeds max', () => {
    const score = computeCategoryScore(1, 1, 0, 25)
    expect(score).toBeLessThanOrEqual(25)
  })

  it('score never goes below 0', () => {
    const score = computeCategoryScore(12, 0, 12, 25)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('total health score is sum of categories', () => {
    const mca = computeCategoryScore(7, 3, 2, 25)
    const gst = computeCategoryScore(12, 8, 0, 25)
    const tax = computeCategoryScore(5, 0, 3, 20)
    const labour = computeCategoryScore(3, 1, 0, 15)
    const state = computeCategoryScore(2, 0, 1, 15)

    const total = mca + gst + tax + labour + state
    expect(total).toBeGreaterThanOrEqual(0)
    expect(total).toBeLessThanOrEqual(100)
  })
})
