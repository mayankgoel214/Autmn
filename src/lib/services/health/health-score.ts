'use server'

import { prisma } from '@/lib/db/prisma'

/**
 * Compliance Health Score (0-100)
 *
 * Weighted scoring across compliance categories:
 * - MCA Compliance: 25 points
 * - GST Compliance: 25 points
 * - Income Tax & TDS: 20 points
 * - PF/ESI/Labour: 15 points
 * - Corporate Governance: 15 points
 */

interface ScoreBreakdown {
  mca: { score: number; max: 25; issues: string[] }
  gst: { score: number; max: 25; issues: string[] }
  tax: { score: number; max: 20; issues: string[] }
  labour: { score: number; max: 15; issues: string[] }
  corporate: { score: number; max: 15; issues: string[] }
}

export interface HealthScoreResult {
  score: number
  breakdown: ScoreBreakdown
  issues: Array<{ severity: 'critical' | 'warning' | 'info'; message: string; category: string }>
  recommendations: string[]
}

export async function computeHealthScore(companyId: string): Promise<HealthScoreResult> {
  const filings = await prisma.filingInstance.findMany({
    where: { companyId },
    include: { obligation: true },
  })

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  })

  if (!company || filings.length === 0) {
    return {
      score: 0,
      breakdown: {
        mca: { score: 0, max: 25, issues: ['No filings data available'] },
        gst: { score: 0, max: 25, issues: ['No filings data available'] },
        tax: { score: 0, max: 20, issues: ['No filings data available'] },
        labour: { score: 0, max: 15, issues: ['No filings data available'] },
        corporate: { score: 0, max: 15, issues: ['No filings data available'] },
      },
      issues: [{ severity: 'info', message: 'Generate your compliance calendar to compute health score', category: 'system' }],
      recommendations: ['Generate your compliance calendar first'],
    }
  }

  // Group filings by category
  const byCategory = filings.reduce((acc, f) => {
    const cat = f.obligation.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {} as Record<string, typeof filings>)

  const issues: HealthScoreResult['issues'] = []
  const recommendations: string[] = []

  // Compute per-category scores
  function computeCategoryScore(
    category: string,
    maxScore: number,
    categoryFilings: typeof filings
  ): { score: number; categoryIssues: string[] } {
    if (categoryFilings.length === 0) return { score: maxScore, categoryIssues: [] }

    const total = categoryFilings.length
    const filed = categoryFilings.filter(f => f.status === 'filed').length
    const overdue = categoryFilings.filter(f => f.status === 'overdue').length
    const upcoming = categoryFilings.filter(f => f.status === 'upcoming').length

    const categoryIssues: string[] = []

    // Base score: proportion of filed items
    let score = Math.round((filed / total) * maxScore * 0.5) // 50% weight for filed

    // Penalty for overdue items
    const overduePenalty = Math.min(overdue * 3, maxScore * 0.4) // Up to 40% penalty
    score = Math.max(0, score - overduePenalty)

    // Bonus for no overdue
    if (overdue === 0) {
      score += Math.round(maxScore * 0.3) // 30% bonus for clean record
    }

    // Remaining points for upcoming items being on track
    if (upcoming > 0 && overdue === 0) {
      score += Math.round(maxScore * 0.2) // 20% for being on track
    }

    score = Math.min(score, maxScore) // Cap at max

    // Generate issues
    if (overdue > 0) {
      categoryFilings
        .filter(f => f.status === 'overdue')
        .forEach(f => {
          const daysOverdue = Math.ceil((Date.now() - f.dueDate.getTime()) / (1000 * 60 * 60 * 24))
          categoryIssues.push(`${f.obligation.obligationName} (${f.period}) — ${daysOverdue} days overdue`)
          issues.push({
            severity: daysOverdue > 30 ? 'critical' : 'warning',
            message: `${f.obligation.obligationName} for ${f.period} is ${daysOverdue} days overdue. ${f.obligation.penaltyDescription || ''}`,
            category,
          })
        })
    }

    return { score, categoryIssues }
  }

  const mcaResult = computeCategoryScore('mca', 25, byCategory['mca'] || [])
  const gstResult = computeCategoryScore('gst', 25, byCategory['gst'] || [])
  const tdsResult = computeCategoryScore('tds', 20, [...(byCategory['tds'] || []), ...(byCategory['income_tax'] || [])])
  const labourResult = computeCategoryScore('labour', 15, byCategory['labour'] || [])
  const stateResult = computeCategoryScore('state', 15, byCategory['state'] || [])

  const totalScore = mcaResult.score + gstResult.score + tdsResult.score + labourResult.score + stateResult.score

  // Generate recommendations
  if (mcaResult.categoryIssues.length > 0) recommendations.push('File overdue MCA returns to avoid director disqualification')
  if (gstResult.categoryIssues.length > 0) recommendations.push('File pending GST returns to stop daily penalty accrual')
  if (tdsResult.categoryIssues.length > 0) recommendations.push('Deposit overdue TDS to avoid prosecution risk under Section 276B')
  if (labourResult.categoryIssues.length > 0) recommendations.push('Clear PF/ESI arrears to avoid damages up to 100% of amount')
  if (totalScore >= 80) recommendations.push('Your compliance is in good shape. Keep filing on time.')

  if (!company.gstRegistered && (company.annualTurnover || 0) > 4000000) {
    issues.push({ severity: 'critical', message: 'Annual turnover exceeds Rs.40 lakh but GST is not registered. Registration is mandatory.', category: 'gst' })
    recommendations.push('Register for GST immediately — mandatory for turnover above Rs.40 lakh')
  }

  if (company.employeeCount >= 20 && !company.pfRegistered) {
    issues.push({ severity: 'critical', message: '20+ employees but PF is not registered. Registration is mandatory.', category: 'labour' })
    recommendations.push('Register with EPFO for PF — mandatory for 20+ employees')
  }

  if (company.employeeCount >= 10 && !company.esiRegistered) {
    issues.push({ severity: 'warning', message: '10+ employees but ESI is not registered. Registration is mandatory.', category: 'labour' })
    recommendations.push('Register with ESIC for ESI — mandatory for 10+ employees')
  }

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    breakdown: {
      mca: { score: mcaResult.score, max: 25, issues: mcaResult.categoryIssues },
      gst: { score: gstResult.score, max: 25, issues: gstResult.categoryIssues },
      tax: { score: tdsResult.score, max: 20, issues: tdsResult.categoryIssues },
      labour: { score: labourResult.score, max: 15, issues: labourResult.categoryIssues },
      corporate: { score: stateResult.score, max: 15, issues: stateResult.categoryIssues },
    },
    issues,
    recommendations,
  }
}
