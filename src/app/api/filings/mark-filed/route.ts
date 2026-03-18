import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { filingId, acknowledgmentNumber } = body as {
    filingId: string
    acknowledgmentNumber?: string
  }

  if (!filingId) {
    return NextResponse.json({ error: 'Filing ID required' }, { status: 400 })
  }

  // Verify the filing belongs to the user's company (or CA's client)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const filing = await prisma.filingInstance.findUnique({
    where: { id: filingId },
  })

  if (!filing) {
    return NextResponse.json({ error: 'Filing not found' }, { status: 404 })
  }

  // Check access — user's own company or CA's client
  let hasAccess = filing.companyId === user?.companyId
  if (!hasAccess && user) {
    const caClient = await prisma.cAClient.findUnique({
      where: { caUserId_companyId: { caUserId: user.id, companyId: filing.companyId } },
    })
    hasAccess = !!caClient
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  await prisma.filingInstance.update({
    where: { id: filingId },
    data: {
      status: 'filed',
      filedDate: new Date(),
      acknowledgmentNumber: acknowledgmentNumber || null,
      filedBy: user?.role === 'CA_ADVISOR' ? 'ca' : 'founder',
    },
  })

  return NextResponse.json({ success: true })
}
