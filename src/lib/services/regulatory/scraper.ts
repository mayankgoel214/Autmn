/**
 * Regulatory Notification Scraper
 *
 * Fetches government notifications from:
 * - MCA (via RSS feed)
 * - Income Tax (via RSS feed)
 * - CBIC-GST (via HTML scraping)
 */

import axios from 'axios'
import * as cheerio from 'cheerio'

export interface ScrapedNotification {
  source: string
  title: string
  date: string
  url: string
  description?: string
}

/**
 * Scrape MCA notifications via RSS feed.
 */
export async function scrapeMCANotifications(): Promise<ScrapedNotification[]> {
  try {
    const { data } = await axios.get('https://www.mca.gov.in/content/mca/global/en/notifications-tender/rss-feeds.html', {
      timeout: 15000,
      headers: { 'User-Agent': 'AUTMN-ComplianceBot/1.0' },
    })

    const $ = cheerio.load(data)
    const notifications: ScrapedNotification[] = []

    // Try to find RSS links or notification items
    $('a[href*="notification"], a[href*="circular"]').each((_, el) => {
      const title = $(el).text().trim()
      const url = $(el).attr('href') || ''
      if (title && title.length > 10) {
        notifications.push({
          source: 'MCA',
          title: title.substring(0, 255),
          date: new Date().toISOString().split('T')[0],
          url: url.startsWith('http') ? url : `https://www.mca.gov.in${url}`,
        })
      }
    })

    return notifications.slice(0, 20)
  } catch (error) {
    console.error('MCA scraping failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Scrape CBIC GST notifications.
 */
export async function scrapeCBICNotifications(): Promise<ScrapedNotification[]> {
  try {
    const { data } = await axios.get('https://cbic-gst.gov.in/central-tax-notifications.html', {
      timeout: 15000,
      headers: { 'User-Agent': 'AUTMN-ComplianceBot/1.0' },
    })

    const $ = cheerio.load(data)
    const notifications: ScrapedNotification[] = []

    $('table tr').each((i, row) => {
      if (i === 0) return // skip header
      const cells = $(row).find('td')
      if (cells.length >= 3) {
        const number = $(cells[0]).text().trim()
        const date = $(cells[1]).text().trim()
        const subject = $(cells[2]).text().trim()
        const link = $(cells[0]).find('a').attr('href')

        if (number && subject) {
          notifications.push({
            source: 'CBIC',
            title: `Notification ${number}: ${subject}`.substring(0, 255),
            date: date || new Date().toISOString().split('T')[0],
            url: link ? (link.startsWith('http') ? link : `https://cbic-gst.gov.in/${link}`) : '',
            description: subject,
          })
        }
      }
    })

    return notifications.slice(0, 20)
  } catch (error) {
    console.error('CBIC scraping failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Scrape Income Tax notifications.
 */
export async function scrapeITNotifications(): Promise<ScrapedNotification[]> {
  try {
    const { data } = await axios.get('https://incometaxindia.gov.in/pages/communications.aspx', {
      timeout: 15000,
      headers: { 'User-Agent': 'AUTMN-ComplianceBot/1.0' },
    })

    const $ = cheerio.load(data)
    const notifications: ScrapedNotification[] = []

    $('table tr, .list-item, a[href*="circular"], a[href*="notification"]').each((_, el) => {
      const text = $(el).text().trim()
      const link = $(el).attr('href') || $(el).find('a').attr('href') || ''
      if (text && text.length > 20 && text.length < 500) {
        notifications.push({
          source: 'CBDT',
          title: text.substring(0, 255),
          date: new Date().toISOString().split('T')[0],
          url: link.startsWith('http') ? link : `https://incometaxindia.gov.in${link}`,
        })
      }
    })

    // Deduplicate
    const seen = new Set<string>()
    return notifications.filter(n => {
      if (seen.has(n.title)) return false
      seen.add(n.title)
      return true
    }).slice(0, 20)
  } catch (error) {
    console.error('IT scraping failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Scrape all sources and return combined results.
 */
export async function scrapeAllNotifications(): Promise<ScrapedNotification[]> {
  const results = await Promise.allSettled([
    scrapeMCANotifications(),
    scrapeCBICNotifications(),
    scrapeITNotifications(),
  ])

  const all: ScrapedNotification[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      all.push(...result.value)
    }
  }

  return all
}
