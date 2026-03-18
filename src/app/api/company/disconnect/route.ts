import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Disconnect user from current company (don't delete the company — other users might be on it)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { companyId: null },
  })

  return NextResponse.json({ success: true })
}
