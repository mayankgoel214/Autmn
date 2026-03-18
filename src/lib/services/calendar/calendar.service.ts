'use server'

import { prisma } from '@/lib/db/prisma'
import { generateDeadlines } from './deadline-calculator'
import { getFY, daysUntil } from '@/lib/utils/date'

/**
 * Generate all filing instances for a company for a given FY.
 * Creates FilingInstance records in the database.
 */
export async function generateCalendar(companyId: string, fyStartYear?: number) {
  const fy = fyStartYear || getFY(new Date())

  // Get all active obligations for this company
  const mappings = await prisma.companyObligation.findMany({
    where: { companyId, isActive: true },
    include: { obligation: true },
  })

  if (mappings.length === 0) {
    return { generated: 0, message: 'No obligations mapped. Run obligation mapping first.' }
  }

  // Delete existing filing instances for this FY to regenerate (idempotent)
  const fyLabel = `FY ${fy}-${(fy + 1).toString().slice(2)}`
  await prisma.filingInstance.deleteMany({
    where: {
      companyId,
      period: { startsWith: String(fy) },
    },
  })
  // Also delete instances with FY label format and month-year format for this FY
  await prisma.filingInstance.deleteMany({
    where: {
      companyId,
      OR: [
        { period: { contains: fyLabel } },
        { period: { endsWith: `-${fy}` } },
        { period: { endsWith: `-${fy + 1}` } },
      ],
    },
  })

  // Get company creation date for new-user detection
  const company = await prisma.company.findUnique({ where: { id: companyId } })

  const instances: Array<{
    companyId: string
    obligationId: string
    period: string
    dueDate: Date
    status: string
  }> = []

  for (const mapping of mappings) {
    const rule = mapping.obligation.baseDueDateRule as Record<string, unknown>
    const frequency = mapping.obligation.frequency

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deadlines = generateDeadlines(rule as any, frequency, fy)

    for (const deadline of deadlines) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // For past deadlines: if user said they've been filing on time, mark as 'filed'
      // Otherwise mark as 'overdue'. For new companies, assume they're current.
      let status: string
      if (deadline.dueDate < today) {
        // For past deadlines: only show last 30 days as overdue
        // Older items assumed to be filed (user was presumably compliant before joining AUTMN)
        const daysPast = Math.ceil((today.getTime() - deadline.dueDate.getTime()) / (1000 * 60 * 60 * 24))
        status = daysPast <= 30 ? 'overdue' : 'filed'
      } else {
        status = 'upcoming'
      }

      instances.push({
        companyId,
        obligationId: mapping.obligation.id,
        period: deadline.period,
        dueDate: deadline.dueDate,
        status,
      })
    }
  }

  // Bulk create
  if (instances.length > 0) {
    await prisma.filingInstance.createMany({ data: instances })
  }

  return {
    generated: instances.length,
    overdue: instances.filter(i => i.status === 'overdue').length,
    upcoming: instances.filter(i => i.status === 'upcoming').length,
  }
}

/**
 * Get calendar data for a company — all filing instances with obligation details.
 */
export async function getCalendarData(
  companyId: string,
  options?: {
    month?: number // 0-indexed
    year?: number
    category?: string
    status?: string
  }
) {
  const where: Record<string, unknown> = { companyId }

  if (options?.status) {
    where.status = options.status
  }

  const filings = await prisma.filingInstance.findMany({
    where,
    include: { obligation: true },
    orderBy: { dueDate: 'asc' },
  })

  let filtered = filings

  // Filter by month/year if specified
  if (options?.month !== undefined && options?.year !== undefined) {
    filtered = filings.filter(f => {
      const d = new Date(f.dueDate)
      return d.getMonth() === options.month && d.getFullYear() === options.year
    })
  }

  // Filter by category if specified
  if (options?.category) {
    filtered = filtered.filter(f => f.obligation.category === options.category)
  }

  return filtered.map(f => ({
    id: f.id,
    obligationCode: f.obligation.obligationCode,
    obligationName: f.obligation.obligationName,
    category: f.obligation.category,
    frequency: f.obligation.frequency,
    period: f.period,
    dueDate: f.dueDate.toISOString().split('T')[0],
    dueDateObj: f.dueDate,
    status: f.status,
    daysRemaining: daysUntil(f.dueDate),
    penaltyDescription: f.obligation.penaltyDescription,
    filingPortal: f.obligation.filingPortal,
    canFileViaApi: f.obligation.canFileViaApi,
    requiresDsc: f.obligation.requiresDsc,
    filedDate: f.filedDate?.toISOString().split('T')[0] || null,
    acknowledgmentNumber: f.acknowledgmentNumber,
  }))
}

/**
 * Get upcoming deadlines (next N items).
 */
export async function getUpcomingDeadlines(companyId: string, limit: number = 5) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filings = await prisma.filingInstance.findMany({
    where: {
      companyId,
      status: 'upcoming',
      dueDate: { gte: today },
    },
    include: { obligation: true },
    orderBy: { dueDate: 'asc' },
    take: limit,
  })

  return filings.map(f => ({
    id: f.id,
    obligationCode: f.obligation.obligationCode,
    obligationName: f.obligation.obligationName,
    category: f.obligation.category,
    period: f.period,
    dueDate: f.dueDate.toISOString().split('T')[0],
    daysRemaining: daysUntil(f.dueDate),
    filingPortal: f.obligation.filingPortal,
    penaltyDescription: f.obligation.penaltyDescription,
  }))
}

/**
 * Get overdue items with accrued penalty info.
 */
export async function getOverdueItems(companyId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Update status for any items that are now past due
  await prisma.filingInstance.updateMany({
    where: {
      companyId,
      status: 'upcoming',
      dueDate: { lt: today },
    },
    data: { status: 'overdue' },
  })

  const filings = await prisma.filingInstance.findMany({
    where: { companyId, status: 'overdue' },
    include: { obligation: true },
    orderBy: { dueDate: 'asc' },
  })

  return filings.map(f => ({
    id: f.id,
    obligationCode: f.obligation.obligationCode,
    obligationName: f.obligation.obligationName,
    category: f.obligation.category,
    period: f.period,
    dueDate: f.dueDate.toISOString().split('T')[0],
    daysOverdue: Math.abs(daysUntil(f.dueDate)),
    penaltyDescription: f.obligation.penaltyDescription,
    penaltyCalculationRule: f.obligation.penaltyCalculationRule,
  }))
}
