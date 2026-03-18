import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// GET — get all clients for this CA
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user || (user.role !== 'CA_ADVISOR' && user.role !== 'ADMIN' && user.role !== 'FOUNDER')) {
    return NextResponse.json({ error: 'Not authorized as CA' }, { status: 403 })
  }

  const clients = await prisma.cAClient.findMany({
    where: { caUserId: session.user.id },
    include: {
      company: {
        include: {
          directors: true,
          companyObligations: { where: { isActive: true }, include: { obligation: true } },
          filingInstances: {
            where: { status: { in: ['overdue', 'upcoming'] } },
            include: { obligation: true },
            orderBy: { dueDate: 'asc' },
            take: 5,
          },
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  })

  const clientData = clients.map(c => {
    const overdueCount = c.company.filingInstances.filter(f => f.status === 'overdue').length
    const upcomingCount = c.company.filingInstances.filter(f => f.status === 'upcoming').length
    const totalObligations = c.company.companyObligations.length

    return {
      id: c.id,
      companyId: c.company.id,
      companyName: c.company.companyName,
      cin: c.company.cin,
      entityType: c.company.entityType,
      employeeCount: c.company.employeeCount,
      gstRegistered: c.company.gstRegistered,
      gstNumber: c.company.gstNumber,
      mcaStatus: c.company.mcaStatus,
      overdueCount,
      upcomingCount,
      totalObligations,
      nextDeadline: c.company.filingInstances[0] ? {
        name: c.company.filingInstances[0].obligation.obligationName,
        dueDate: c.company.filingInstances[0].dueDate.toISOString().split('T')[0],
        status: c.company.filingInstances[0].status,
      } : null,
      notes: c.notes,
      addedAt: c.addedAt.toISOString(),
    }
  })

  return NextResponse.json({ clients: clientData })
}

// POST — add a client company by CIN
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Update user role to CA_ADVISOR if they're adding clients
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.role === 'TEAM_MEMBER') {
    return NextResponse.json({ error: 'Team members cannot manage clients' }, { status: 403 })
  }

  const body = await request.json()
  const { cin, notes } = body as { cin: string; notes?: string }

  if (!cin) {
    return NextResponse.json({ error: 'CIN is required' }, { status: 400 })
  }

  // Find or create the company
  let company = await prisma.company.findUnique({ where: { cin: cin.toUpperCase() } })

  if (!company) {
    // Try to fetch from MCA API
    try {
      const { lookupCompanyByCIN } = await import('@/lib/services/company/company.service')
      const result = await lookupCompanyByCIN(cin)
      if (result.success && result.company) {
        company = await prisma.company.findUnique({ where: { id: result.company.id } })
      } else {
        return NextResponse.json({ error: result.error || 'Company not found' }, { status: 404 })
      }
    } catch {
      return NextResponse.json({ error: 'Failed to fetch company data' }, { status: 500 })
    }
  }

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Check if already added
  const existing = await prisma.cAClient.findUnique({
    where: { caUserId_companyId: { caUserId: session.user.id, companyId: company.id } },
  })

  if (existing) {
    return NextResponse.json({ error: 'This company is already in your client list' }, { status: 400 })
  }

  // Add as client
  await prisma.cAClient.create({
    data: {
      caUserId: session.user.id,
      companyId: company.id,
      notes: notes || null,
    },
  })

  // Update user role to CA_ADVISOR if not already
  if (user.role === 'FOUNDER') {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: 'CA_ADVISOR' },
    })
  }

  // Auto-map obligations and generate calendar for the new client
  try {
    const { mapObligationsForCompany } = await import('@/lib/services/obligations/obligation-mapper')
    const { generateCalendar } = await import('@/lib/services/calendar/calendar.service')

    // Check if obligations are already mapped
    const existingObs = await prisma.companyObligation.count({ where: { companyId: company.id } })
    if (existingObs === 0) {
      await mapObligationsForCompany(company.id)
    }

    // Check if calendar is already generated
    const existingFilings = await prisma.filingInstance.count({ where: { companyId: company.id } })
    if (existingFilings === 0) {
      await generateCalendar(company.id)
    }
  } catch (e) {
    console.error('Auto-mapping failed for client:', e)
    // Don't fail the add-client operation — mapping can be done manually
  }

  return NextResponse.json({ success: true, companyName: company.companyName })
}
