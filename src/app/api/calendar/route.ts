import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { generateCalendar, getCalendarData } from '@/lib/services/calendar/calendar.service'

// POST — generate calendar for the current FY
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const result = await generateCalendar(user.companyId)
  return NextResponse.json(result)
}

// GET — get calendar data with optional filters
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const url = new URL(request.url)
  const month = url.searchParams.get('month')
  const year = url.searchParams.get('year')
  const category = url.searchParams.get('category')
  const status = url.searchParams.get('status')

  const data = await getCalendarData(user.companyId, {
    month: month !== null ? parseInt(month) : undefined,
    year: year !== null ? parseInt(year) : undefined,
    category: category || undefined,
    status: status || undefined,
  })

  return NextResponse.json({ filings: data })
}
