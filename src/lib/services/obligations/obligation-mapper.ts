'use server'

import { prisma } from '@/lib/db/prisma'
import { evaluateConditions, type CompanyProfile } from './condition-evaluator'

/**
 * Maps a company to all applicable compliance obligations.
 * Evaluates each obligation's applicability conditions against the company profile.
 * Creates CompanyObligation junction records for matches.
 */
export async function mapObligationsForCompany(companyId: string) {
  // Get company profile
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  })

  if (!company) throw new Error('Company not found')

  // Build profile for condition evaluation
  const profile: CompanyProfile = {
    entityType: company.entityType,
    mcaStatus: company.mcaStatus,
    employeeCount: company.employeeCount,
    annualTurnover: Number(company.annualTurnover || 0),
    gstRegistered: company.gstRegistered,
    gstScheme: company.gstScheme,
    pfRegistered: company.pfRegistered,
    esiRegistered: company.esiRegistered,
    hasForeignInvestment: company.hasForeignInvestment,
    dpiitRecognized: company.dpiitRecognized,
    operatingStates: (company.operatingStates as string[]) || [],
    industrySector: company.industrySector,
  }

  // Get all obligations from master table
  const allObligations = await prisma.complianceObligation.findMany()

  // Evaluate each obligation's conditions against this company
  const applicable = allObligations.filter((obligation) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluateConditions(obligation.applicableConditions as any, profile)
    } catch {
      return false
    }
  })

  // Remove existing mappings and recreate (idempotent)
  await prisma.companyObligation.deleteMany({
    where: { companyId },
  })

  // Create new mappings
  if (applicable.length > 0) {
    await prisma.companyObligation.createMany({
      data: applicable.map((obligation) => ({
        companyId,
        obligationId: obligation.id,
        isActive: true,
        activatedDate: new Date(),
      })),
    })
  }

  // Group by category for summary
  const summary = applicable.reduce(
    (acc, ob) => {
      acc[ob.category] = (acc[ob.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return {
    total: applicable.length,
    summary,
    obligations: applicable.map((ob) => ({
      code: ob.obligationCode,
      name: ob.obligationName,
      category: ob.category,
      frequency: ob.frequency,
      filingPortal: ob.filingPortal,
      penaltyDescription: ob.penaltyDescription,
    })),
  }
}

/**
 * Get all mapped obligations for a company, grouped by category.
 */
export async function getCompanyObligations(companyId: string) {
  const mappings = await prisma.companyObligation.findMany({
    where: { companyId, isActive: true },
    include: { obligation: true },
    orderBy: { obligation: { category: 'asc' } },
  })

  return mappings.map((m) => ({
    id: m.id,
    code: m.obligation.obligationCode,
    name: m.obligation.obligationName,
    category: m.obligation.category,
    frequency: m.obligation.frequency,
    filingPortal: m.obligation.filingPortal,
    penaltyDescription: m.obligation.penaltyDescription,
    requiresDsc: m.obligation.requiresDsc,
    canFileViaApi: m.obligation.canFileViaApi,
  }))
}
