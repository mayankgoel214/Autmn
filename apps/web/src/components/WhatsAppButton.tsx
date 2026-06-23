import { site, whatsappLink, isPlaceholder } from '@/site.config';

const WhatsAppGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.54-3.69 8.24-8.23 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
  </svg>
);

export function WhatsAppButton({
  label = 'Start on WhatsApp',
  variant = 'primary',
  className = '',
}: {
  label?: string;
  variant?: 'primary' | 'light';
  className?: string;
}) {
  const disabled = isPlaceholder(site.whatsappNumber);
  const base =
    'inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-base font-semibold transition-transform active:scale-[0.98]';
  const styles =
    variant === 'primary'
      ? 'bg-terracotta text-cream shadow-warm hover:bg-terracotta-dark'
      : 'bg-cream text-terracotta ring-1 ring-terracotta/20 hover:bg-cream-deep';

  if (disabled) {
    // Renders a visible reminder rather than a dead link while the number is unset.
    return (
      <span
        className={`${base} cursor-not-allowed bg-ink-soft/20 text-ink-soft ${className}`}
        title="Set site.whatsappNumber in src/site.config.ts"
      >
        <WhatsAppGlyph />
        {label} (set number)
      </span>
    );
  }

  return (
    <a href={whatsappLink()} className={`${base} ${styles} ${className}`}>
      <WhatsAppGlyph />
      {label}
    </a>
  );
}
