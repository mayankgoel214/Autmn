import { Bloom } from './Bloom';

const ITEMS = [
  'Jewellery',
  'Sweets & mithai',
  'Fragrance',
  'Handbags',
  'Home & candles',
  'Skincare',
  'Footwear',
  'Apparel',
  'Packaged food',
  'Handmade',
];

/**
 * Quiet, always-moving band of the product categories Autmn already shoots.
 * Doubled inline so the loop is seamless. Edges fade into the ink.
 */
export function CategoryMarquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-ink-line py-5">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent"
        aria-hidden="true"
      />
      <div className="flex w-max animate-marquee items-center gap-10">
        {row.map((item, i) => (
          <div key={i} className="flex items-center gap-10 whitespace-nowrap">
            <span className="font-heading text-xl text-sand lg:text-2xl">{item}</span>
            <Bloom size={14} fill="rgba(201,154,63,0.55)" />
          </div>
        ))}
      </div>
    </div>
  );
}
