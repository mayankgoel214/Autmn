import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  checkDeadlinesAndNotify,
} from '@/lib/services/notifications/notification.service'

// GET — get user's notifications
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(session.user.id),
    getUnreadCount(session.user.id),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

// POST — trigger deadline check (or mark all read)
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))

  if (body.action === 'mark_all_read') {
    await markAllAsRead(session.user.id)
    return NextResponse.json({ success: true })
  }

  if (body.action === 'check_deadlines') {
    const result = await checkDeadlinesAndNotify()
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
