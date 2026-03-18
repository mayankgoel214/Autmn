/**
 * Tests for regulatory notification scraper.
 * Uses mocked HTTP responses to avoid hitting government sites in CI.
 */

jest.mock('axios')

import axios from 'axios'
const mockedAxios = axios as jest.Mocked<typeof axios>

import { scrapeCBICNotifications, scrapeAllNotifications } from '@/lib/services/regulatory/scraper'

describe('scrapeCBICNotifications', () => {
  it('parses notification table correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: `
        <html><body>
          <table>
            <tr><th>No.</th><th>Date</th><th>Subject</th></tr>
            <tr>
              <td><a href="/pdf/ct-2024-001.pdf">01/2024</a></td>
              <td>15/03/2024</td>
              <td>Amendment to CGST Rules 2017</td>
            </tr>
            <tr>
              <td><a href="/pdf/ct-2024-002.pdf">02/2024</a></td>
              <td>20/03/2024</td>
              <td>E-invoice threshold reduced to Rs.5 crore</td>
            </tr>
          </table>
        </body></html>
      `,
    })

    const results = await scrapeCBICNotifications()
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].source).toBe('CBIC')
    expect(results[0].title).toContain('01/2024')
  })

  it('returns empty array on network error', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'))
    const results = await scrapeCBICNotifications()
    expect(results).toEqual([])
  })
})

describe('scrapeAllNotifications', () => {
  it('continues even if one source fails', async () => {
    // All three calls — first fails, others return empty
    mockedAxios.get
      .mockRejectedValueOnce(new Error('MCA down'))
      .mockResolvedValueOnce({ data: '<html></html>' })
      .mockResolvedValueOnce({ data: '<html></html>' })

    const results = await scrapeAllNotifications()
    // Should not throw, returns whatever succeeded
    expect(Array.isArray(results)).toBe(true)
  })
})
