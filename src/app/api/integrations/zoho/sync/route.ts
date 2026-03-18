import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { syncZohoData } from '@/lib/services/integrations/zoho/zoho-sync'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const result = await syncZohoData(user.companyId)
  return NextResponse.json(result)
}
