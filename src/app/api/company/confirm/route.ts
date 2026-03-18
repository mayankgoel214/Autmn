import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { linkUserToCompany } from '@/lib/services/company/company.service'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Please log out and sign up again — your session has expired.' }, { status: 401 })
  }

  // Verify the user actually exists in DB (handles DB reset case)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) {
    return NextResponse.json({ success: false, error: 'Your account was not found. Please log out and sign up again.' }, { status: 401 })
  }

  const body = await request.json()
  const { companyId } = body

  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 })
  }

  try {
    await linkUserToCompany(session.user.id, companyId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to link company:', error)
    return NextResponse.json({ success: false, error: 'Failed to link company. Please try again.' }, { status: 500 })
  }
}
