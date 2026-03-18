'use server'

import { prisma } from '@/lib/db/prisma'
import { daysUntil } from '@/lib/utils/date'

/**
 * Create a notification for a user.
 */
export async function createNotification(
  userId: string,
  notification: {
    type: 'deadline' | 'regulatory' | 'system'
    title: string
    body: string
    link?: string
  }
) {
  return prisma.notification.create({
    data: {
      userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
    },
  })
}

/**
 * Get notifications for a user.
 */
export async function getNotifications(userId: string, limit: number = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

/**
 * Get unread notification count.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  })
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  })
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
}

/**
 * Check deadlines for all companies and create notifications.
 * Run this daily (via cron or manual trigger).
 *
 * Creates notifications for:
 * - Items due in 7 days
 * - Items due in 3 days
 * - Items due in 1 day
 * - Items due today
 * - Items now overdue (just crossed the deadline)
 */
export async function checkDeadlinesAndNotify() {
  const companies = await prisma.company.findMany({
    include: { users: true },
  })

  let notificationsCreated = 0

  for (const company of companies) {
    const filings = await prisma.filingInstance.findMany({
      where: {
        companyId: company.id,
        status: { in: ['upcoming', 'overdue'] },
      },
      include: { obligation: true },
    })

    for (const filing of filings) {
      const days = daysUntil(filing.dueDate)
      let shouldNotify = false
      let title = ''
      let body = ''
      let type: 'deadline' | 'system' = 'deadline'

      if (days === 7) {
        shouldNotify = true
        title = `${filing.obligation.obligationName} due in 7 days`
        body = `${filing.obligation.obligationName} for ${filing.period} is due on ${filing.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Start preparing.`
      } else if (days === 3) {
        shouldNotify = true
        title = `${filing.obligation.obligationName} due in 3 days`
        body = `${filing.obligation.obligationName} for ${filing.period} is due soon. ${filing.obligation.penaltyDescription || ''}`
      } else if (days === 1) {
        shouldNotify = true
        title = `${filing.obligation.obligationName} due tomorrow`
        body = `${filing.obligation.obligationName} for ${filing.period} is due tomorrow. File today to avoid penalties.`
      } else if (days === 0) {
        shouldNotify = true
        title = `${filing.obligation.obligationName} due TODAY`
        body = `${filing.obligation.obligationName} for ${filing.period} is due today. ${filing.obligation.penaltyDescription || ''}`
      } else if (days === -1 && filing.status !== 'overdue') {
        // Just became overdue
        shouldNotify = true
        type = 'deadline'
        title = `OVERDUE: ${filing.obligation.obligationName}`
        body = `${filing.obligation.obligationName} for ${filing.period} is now overdue. ${filing.obligation.penaltyDescription || ''}`

        // Update status to overdue
        await prisma.filingInstance.update({
          where: { id: filing.id },
          data: { status: 'overdue' },
        })
      }

      if (shouldNotify) {
        // Check if we already sent this notification today (avoid duplicates)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        for (const user of company.users) {
          const existing = await prisma.notification.findFirst({
            where: {
              userId: user.id,
              title,
              createdAt: { gte: today },
            },
          })

          if (!existing) {
            await createNotification(user.id, {
              type,
              title,
              body,
              link: '/calendar',
            })
            notificationsCreated++
          }
        }
      }
    }
  }

  return { notificationsCreated }
}
