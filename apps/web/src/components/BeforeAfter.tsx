/**
 * Before/after card. Renders labeled placeholder slots until real seller assets
 * are dropped into /public/before-after/. To go live: set `beforeSrc`/`afterSrc`
 * to the real image paths — the placeholder disappears automatically.
 *
 * The launch plan calls real before/afters "the single most important piece of
 * marketing content" — these MUST be swapped for real seller shots before
 * scaling any marketing.
 */
export function BeforeAfter({
  category,
  beforeSrc,
  afterSrc,
}: {
  category: string;
  beforeSrc?: string;
  afterSrc?: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink/5">
      <div className="grid grid-cols-2">
        <Slot label="Before" kind="before" src={beforeSrc} />
        <Slot label="After" kind="after" src={afterSrc} />
      </div>
      <div className="px-4 py-3 text-center text-sm font-medium text-ink-soft">{category}</div>
    </div>
  );
}

function Slot({
  label,
  kind,
  src,
}: {
  label: string;
  kind: 'before' | 'after';
  src?: string;
}) {
  return (
    <div className="relative aspect-square">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div
          className={`flex h-full w-full flex-col items-center justify-center gap-1 ${
            kind === 'before' ? 'bg-cream-deep' : 'bg-gradient-to-br from-amber/15 to-terracotta/15'
          }`}
        >
          <span className="text-3xl opacity-30">{kind === 'before' ? '📱' : '✨'}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/70">
            {label}
          </span>
          <span className="px-2 text-center text-[10px] text-ink-soft/50">
            drop real asset
          </span>
        </div>
      )}
      <span className="absolute left-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
        {label}
      </span>
    </div>
  );
}
