import { PORTFOLIO_MODE, portfolio, site } from '@/site.config';

/**
 * Says plainly that this deployment is engineering work on display, not a shop.
 * Without it the page reads as a live storefront taking ₹49 orders.
 */
export function PortfolioBanner() {
  if (!PORTFOLIO_MODE) return null;
  return (
    <div className="border-b border-ink-line bg-ink-soft px-4 py-2.5 text-center text-xs text-sand">
      <strong className="font-medium text-cream">Portfolio demo.</strong>{' '}
      {site.name} is not currently accepting orders. Built by {portfolio.author} —{' '}
      <a href={portfolio.repo} className="text-gold underline underline-offset-2" target="_blank" rel="noopener noreferrer">
        source
      </a>{' '}
      ·{' '}
      <a href={portfolio.site} className="text-gold underline underline-offset-2" target="_blank" rel="noopener noreferrer">
        portfolio
      </a>
    </div>
  );
}
