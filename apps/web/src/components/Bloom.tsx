/**
 * The Autmn aperture-bloom mark. Flower + camera shutter, 6 spun blades with a
 * peek-through pinhole. `tone` controls fill; the pinhole is transparent so it
 * works on any background.
 */
const BLADES = [0, 60, 120, 180, 240, 300];
const BLADE_D = 'M50 50 L55 13 A39 39 0 0 1 83 33 Z';

export function Bloom({
  size = 28,
  className = '',
  fill = '#C99A3F',
}: {
  size?: number;
  className?: string;
  fill?: string;
}) {
  const id = `bloom-${Math.round(size)}-${fill.replace('#', '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <mask id={id}>
          <rect width="100" height="100" fill="black" />
          <g fill="white">
            {BLADES.map((a) => (
              <path key={a} d={BLADE_D} transform={`rotate(${a} 50 50)`} />
            ))}
          </g>
          <circle cx="50" cy="50" r="6" fill="black" />
        </mask>
      </defs>
      <rect width="100" height="100" fill={fill} mask={`url(#${id})`} />
    </svg>
  );
}
