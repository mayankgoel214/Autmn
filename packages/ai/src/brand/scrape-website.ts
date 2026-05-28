/**
 * Phase 3b — website scraping.
 *
 * Primary path: Playwright headless Chromium. Renders JS-heavy sites
 * (Shopify, Wix, React SPAs) and gives us a faithful DOM to extract from.
 *
 * Fallback path: plain `fetch` + regex. No JS execution. Good for SSR sites
 * (most WordPress and bare-metal stores) and used automatically when
 * Playwright fails to launch (e.g. browsers not installed in the runtime).
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.BRAND_SCRAPE_TIMEOUT_MS) || 30_000;

export interface ScrapeResult {
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  bodyText: string;
  /** Indicates which path produced the result — useful in logs. */
  source: 'playwright' | 'fetch';
}

export async function scrapeWebsite(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<ScrapeResult> {
  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await scrapeWithPlaywright(url, timeout);
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'brand_scrape_playwright_failed_falling_back_to_fetch',
        url,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      }),
    );
    return await fetchHtml(url, Math.min(timeout, 15_000));
  }
}

async function scrapeWithPlaywright(url: string, timeoutMs: number): Promise<ScrapeResult> {
  // Dynamic-import keeps the cold start fast when no website asset is in play
  // and avoids requiring Chromium to be installed for everyone running the
  // worker on a dev box.
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; AutmnBot/1.0; +https://autmn.com/bot)',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const title = (await page.title()) ?? '';
    const description =
      (await page
        .locator('meta[name=description]')
        .first()
        .getAttribute('content')
        .catch(() => null)) ?? '';
    const h1 = await page.locator('h1').allTextContents().catch(() => []);
    const h2 = await page.locator('h2').allTextContents().catch(() => []);
    const bodyTextRaw = (await page.locator('body').first().textContent().catch(() => '')) ?? '';

    return {
      title: title.slice(0, 200),
      description: description.slice(0, 500),
      h1: h1.map((s) => s.trim()).filter(Boolean).slice(0, 10),
      h2: h2.map((s) => s.trim()).filter(Boolean).slice(0, 10),
      bodyText: bodyTextRaw.replace(/\s+/g, ' ').trim().slice(0, 2000),
      source: 'playwright',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function fetchHtml(url: string, timeoutMs = 10_000): Promise<ScrapeResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutmnBot/1.0)' },
    });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').slice(0, 200);
    const description = (
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ?? ''
    ).slice(0, 500);
    const h1 = Array.from(html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi))
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean)
      .slice(0, 10);
    const h2 = Array.from(html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi))
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean)
      .slice(0, 10);
    const bodyText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);

    return { title, description, h1, h2, bodyText, source: 'fetch' };
  } finally {
    clearTimeout(t);
  }
}
