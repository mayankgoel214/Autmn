import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { mapObligationsForCompany, getCompanyObligations } from '@/lib/services/obligations/obligation-mapper'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const result = await mapObligationsForCompany(user.companyId)
  return NextResponse.json(result)
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const obligations = await getCompanyObligations(user.companyId)
  return NextResponse.json({ obligations })
}
