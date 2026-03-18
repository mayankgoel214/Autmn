'use server'

import { prisma } from '@/lib/db/prisma'
import { computeInvoiceGST, determineGSTType } from '@/lib/rules/gst-rates'
import { computeTDS, getTDSRate } from '@/lib/rules/tds-rates'
import { computePFContribution, computeESIContribution } from '@/lib/rules/pf-esi-rates'

export interface TaxComputationResult {
  hasRealData: boolean
  period: string
  gst: {
    outputTax: { cgst: number; sgst: number; igst: number; total: number }
    inputTaxCredit: { cgst: number; sgst: number; igst: number; total: number }
    netPayable: { cgst: number; sgst: number; igst: number; total: number }
    invoiceCount: number
    billCount: number
  }
  tds: {
    deductions: Array<{
      section: string
      description: string
      payeeName: string
      amount: number
      rate: number
      tdsAmount: number
    }>
    totalTDS: number
  }
  pfEsi: {
    totalPFEmployee: number
    totalPFEmployer: number
    totalESIEmployee: number
    totalESIEmployer: number
    employeeCount: number
  }
}

/**
 * Compute taxes for a company for a given month.
 * Uses real financial data if available, otherwise demo data.
 */
export async function computeTaxes(companyId: string, month?: string): Promise<TaxComputationResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Company not found')

  const currentMonth = month || new Date().toISOString().slice(0, 7) // YYYY-MM

  // Check for real financial data
  const realDataCount = await prisma.financialData.count({ where: { companyId } })

  if (realDataCount > 0) {
    return computeFromRealData(companyId, company, currentMonth)
  }

  // No real data — compute from demo invoices based on company profile
  return computeFromDemoData(company, currentMonth)
}

async function computeFromRealData(
  companyId: string,
  company: { registeredState: string | null; employeeCount: number; gstRegistered: boolean },
  period: string
): Promise<TaxComputationResult> {
  const [year, monthStr] = period.split('-').map(Number)
  const startDate = new Date(year, monthStr - 1, 1)
  const endDate = new Date(year, monthStr, 0)

  const invoices = await prisma.financialData.findMany({
    where: { companyId, dataType: 'invoice', date: { gte: startDate, lte: endDate } },
  })

  const bills = await prisma.financialData.findMany({
    where: { companyId, dataType: 'bill', date: { gte: startDate, lte: endDate } },
  })

  // Compute GST from real invoices
  let outputCgst = 0, outputSgst = 0, outputIgst = 0
  for (const inv of invoices) {
    const taxAmount = Number(inv.taxAmount || 0)
    const gstType = determineGSTType(company.registeredState || '', inv.placeOfSupply || '')
    if (gstType === 'CGST_SGST') {
      outputCgst += taxAmount / 2
      outputSgst += taxAmount / 2
    } else {
      outputIgst += taxAmount
    }
  }

  let itcCgst = 0, itcSgst = 0, itcIgst = 0
  for (const bill of bills) {
    const taxAmount = Number(bill.taxAmount || 0)
    itcCgst += taxAmount / 3
    itcSgst += taxAmount / 3
    itcIgst += taxAmount / 3
  }

  return {
    hasRealData: true,
    period,
    gst: {
      outputTax: { cgst: r(outputCgst), sgst: r(outputSgst), igst: r(outputIgst), total: r(outputCgst + outputSgst + outputIgst) },
      inputTaxCredit: { cgst: r(itcCgst), sgst: r(itcSgst), igst: r(itcIgst), total: r(itcCgst + itcSgst + itcIgst) },
      netPayable: {
        cgst: r(Math.max(0, outputCgst - itcCgst)),
        sgst: r(Math.max(0, outputSgst - itcSgst)),
        igst: r(Math.max(0, outputIgst - itcIgst)),
        total: r(Math.max(0, outputCgst - itcCgst) + Math.max(0, outputSgst - itcSgst) + Math.max(0, outputIgst - itcIgst)),
      },
      invoiceCount: invoices.length,
      billCount: bills.length,
    },
    tds: { deductions: [], totalTDS: 0 },
    pfEsi: { totalPFEmployee: 0, totalPFEmployer: 0, totalESIEmployee: 0, totalESIEmployer: 0, employeeCount: 0 },
  }
}

function computeFromDemoData(
  company: {
    companyName: string
    registeredState: string | null
    employeeCount: number
    annualTurnover: bigint | null
    gstRegistered: boolean
    operatingStates: unknown
  },
  period: string
): TaxComputationResult {
  const monthlyRevenue = Number(company.annualTurnover || 0) / 12
  const sellerState = company.registeredState || 'MH'

  // Simulate realistic invoice distribution
  const intraStateRevenue = monthlyRevenue * 0.6 // 60% intra-state
  const interStateRevenue = monthlyRevenue * 0.4 // 40% inter-state

  const intraGST = computeInvoiceGST(intraStateRevenue, 18, sellerState, sellerState)
  const interGST = computeInvoiceGST(interStateRevenue, 18, sellerState, sellerState === 'MH' ? 'KA' : 'MH')

  const outputCgst = intraGST.cgst
  const outputSgst = intraGST.sgst
  const outputIgst = interGST.igst
  const outputTotal = outputCgst + outputSgst + outputIgst

  // ITC from purchases (assume 70% of output tax is claimable)
  const itcTotal = outputTotal * 0.7
  const itcCgst = outputCgst * 0.7
  const itcSgst = outputSgst * 0.7
  const itcIgst = outputIgst * 0.7

  // TDS deductions — simulate common payments
  const avgSalary = monthlyRevenue > 10000000 ? 60000 : 35000
  const monthlyRent = monthlyRevenue > 5000000 ? 150000 : 50000
  const caFees = 25000
  const contractorPayment = monthlyRevenue * 0.05

  const tdsDeductions = [
    {
      section: '194I',
      description: 'Rent (building)',
      payeeName: 'Office Landlord',
      amount: monthlyRent,
      rate: getTDSRate('194I'),
      tdsAmount: computeTDS('194I', monthlyRent),
    },
    {
      section: '194J',
      description: 'Professional fees (CA)',
      payeeName: 'Chartered Accountant',
      amount: caFees,
      rate: getTDSRate('194J'),
      tdsAmount: computeTDS('194J', caFees),
    },
    {
      section: '194C',
      description: 'Contractor payments',
      payeeName: 'Various contractors',
      amount: r(contractorPayment),
      rate: getTDSRate('194C', 'company'),
      tdsAmount: r(computeTDS('194C', contractorPayment, 'company')),
    },
  ]

  // PF/ESI computation
  const employeeCount = company.employeeCount || 0
  const pfPerEmployee = employeeCount >= 20 ? computePFContribution(avgSalary) : null
  const esiPerEmployee = employeeCount >= 10 ? computeESIContribution(avgSalary) : null

  return {
    hasRealData: false,
    period,
    gst: {
      outputTax: { cgst: r(outputCgst), sgst: r(outputSgst), igst: r(outputIgst), total: r(outputTotal) },
      inputTaxCredit: { cgst: r(itcCgst), sgst: r(itcSgst), igst: r(itcIgst), total: r(itcTotal) },
      netPayable: {
        cgst: r(Math.max(0, outputCgst - itcCgst)),
        sgst: r(Math.max(0, outputSgst - itcSgst)),
        igst: r(Math.max(0, outputIgst - itcIgst)),
        total: r(Math.max(0, outputTotal - itcTotal)),
      },
      invoiceCount: Math.round(monthlyRevenue / 50000), // estimated
      billCount: Math.round(monthlyRevenue / 80000),
    },
    tds: {
      deductions: tdsDeductions,
      totalTDS: r(tdsDeductions.reduce((sum, d) => sum + d.tdsAmount, 0)),
    },
    pfEsi: {
      totalPFEmployee: pfPerEmployee ? r(pfPerEmployee.employeePF * employeeCount) : 0,
      totalPFEmployer: pfPerEmployee ? r(pfPerEmployee.totalEmployer * employeeCount) : 0,
      totalESIEmployee: esiPerEmployee?.isEligible ? r(esiPerEmployee.employeeESI * employeeCount) : 0,
      totalESIEmployer: esiPerEmployee?.isEligible ? r(esiPerEmployee.employerESI * employeeCount) : 0,
      employeeCount,
    },
  }
}

function r(n: number): number {
  return Math.round(n * 100) / 100
}
