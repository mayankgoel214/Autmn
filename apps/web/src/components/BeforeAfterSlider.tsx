'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bloom } from './Bloom';

/**
 * Draggable before/after comparison. The Autmn ad fills the frame; the raw
 * phone photo is revealed on the left up to the divider. Drag the gold handle
 * (mouse or touch) to wipe between them. Desktop centerpiece.
 */
export function BeforeAfterSlider({
  slug,
  className = '',
}: {
  slug: string;
  className?: string;
}) {
  const [pos, setPos] = useState(52); // percent revealed of "before"
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    setPos(Math.min(96, Math.max(4, p)));
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => dragging.current && setFromClientX(e.clientX);
    const touch = (e: TouchEvent) => dragging.current && e.touches[0] && setFromClientX(e.touches[0].clientX);
    const up = () => (dragging.current = false);
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', touch);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', touch);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [setFromClientX]);

  return (
    <div
      ref={frameRef}
      className={`relative select-none overflow-hidden rounded-[28px] border border-gold/40 shadow-lift ${className}`}
      style={{ aspectRatio: '4 / 5' }}
    >
      {/* after (full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/gallery/${slug}/after.jpg`}
        alt="Autmn-generated ad"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute right-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs uppercase tracking-[0.12em] text-gold backdrop-blur">
        Autmn ad
      </span>

      {/* before (clipped to the left of the divider) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pos}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/gallery/${slug}/before.jpg`}
          alt="Raw phone photo"
          draggable={false}
          className="absolute inset-0 h-full object-cover"
          style={{ width: frameRef.current ? frameRef.current.clientWidth : '100%', maxWidth: 'none' }}
        />
        <span className="absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs uppercase tracking-[0.12em] text-sand backdrop-blur">
          Your photo
        </span>
      </div>

      {/* divider + handle */}
      <div className="absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-gold/80" />
        <button
          aria-label="Drag to compare"
          onMouseDown={() => (dragging.current = true)}
          onTouchStart={() => (dragging.current = true)}
          className="absolute top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-gold/50 bg-ink/85 backdrop-blur transition-transform hover:scale-110 active:scale-95"
        >
          <Bloom size={28} />
        </button>
      </div>
    </div>
  );
}
