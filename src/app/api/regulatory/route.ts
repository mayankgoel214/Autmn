import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { scrapeAllNotifications } from '@/lib/services/regulatory/scraper'

// POST — trigger a scrape of government notification sites
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const notifications = await scrapeAllNotifications()
    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    })
  } catch (error) {
    console.error('Scraping error:', error)
    return NextResponse.json({ error: 'Scraping failed' }, { status: 500 })
  }
}
