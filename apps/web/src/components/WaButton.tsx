import { whatsappLink, PORTFOLIO_MODE } from '@/site.config';

/**
 * Click-to-WhatsApp CTA. Opens the user's WhatsApp with "hi" pre-filled to the
 * Autmn number, which starts the bot pipeline. No backend, no template.
 */
export function WaButton({
  label = 'Begin your first ad',
  size = 'lg',
  className = '',
}: {
  label?: string;
  size?: 'lg' | 'md';
  className?: string;
}) {
  // In the portfolio build there is no order pipeline to begin, so the CTA
  // says what it actually does rather than promising a product.
  const text = PORTFOLIO_MODE ? 'View the code on GitHub' : label;
  const pad = size === 'lg' ? 'px-6 py-4 text-[15px]' : 'px-5 py-3 text-sm';
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-gold font-medium text-ink transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${pad} ${className}`}
    >
      <span aria-hidden="true">✦</span>
      {text}
    </a>
  );
}
