import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// GET — list team members for the user's company
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company' }, { status: 400 })
  }

  const members = await prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ members })
}

// POST — invite a team member
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company' }, { status: 400 })
  }

  // Only FOUNDER and ADMIN can invite
  if (user.role !== 'FOUNDER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only founders and admins can invite team members' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, role } = body as { email: string; name: string; role: string }

  if (!email || !role) {
    return NextResponse.json({ error: 'Email and role are required' }, { status: 400 })
  }

  const validRoles = ['CA_ADVISOR', 'TEAM_MEMBER']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Use CA_ADVISOR or TEAM_MEMBER' }, { status: 400 })
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    if (existing.companyId === user.companyId) {
      return NextResponse.json({ error: 'This person is already on your team' }, { status: 400 })
    }
    // Link existing user to this company
    await prisma.user.update({
      where: { id: existing.id },
      data: { companyId: user.companyId, role: role as 'CA_ADVISOR' | 'TEAM_MEMBER' },
    })
    return NextResponse.json({ success: true, message: 'Existing user added to your team' })
  }

  // Create a placeholder user (they'll set password when they sign up)
  const bcrypt = await import('bcryptjs')
  const tempPassword = await bcrypt.hash(Math.random().toString(36), 10)

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash: tempPassword,
      role: role as 'CA_ADVISOR' | 'TEAM_MEMBER',
      companyId: user.companyId,
    },
  })

  return NextResponse.json({ success: true, message: 'Team member invited. They can sign up with this email.' })
}
