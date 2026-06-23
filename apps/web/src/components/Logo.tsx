import { site } from '@/site.config';

/**
 * Autmn logo — the aperture-bloom mark (a flower that doubles as a camera
 * shutter) in a rounded ink tile + wordmark. The icon alone is the WhatsApp
 * avatar / favicon / corner watermark, so it must read at tiny sizes:
 * 6 spun blades, gold on ink, with a peek-through pinhole center.
 *
 * Blade path is the single source of truth — mirrored in public/{favicon,
 * avatar,mark,watermark}.svg. Keep them in sync if the mark ever changes.
 */
const BLADE = 'M50 50 L55 13 A39 39 0 0 1 83 33 Z';
const ANGLES = [0, 60, 120, 180, 240, 300];

export function LogoIcon({ size = 40, tile = true }: { size?: number; tile?: boolean }) {
  const petal = tile ? '#C99A3F' : 'currentColor';
  const hole = tile ? '#17120E' : 'var(--cream, #FFFBF5)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {tile && <rect width="100" height="100" rx="26" fill="#17120E" />}
      <g fill={petal}>
        {ANGLES.map((a) => (
          <path key={a} d={BLADE} transform={`rotate(${a} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="6" fill={hole} />
    </svg>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoIcon size={size} />
      <span
        className="font-heading font-semibold tracking-tight text-ink"
        style={{ fontSize: size * 0.62 }}
      >
        {site.name}
      </span>
    </span>
  );
}
