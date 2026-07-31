import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Target number to animate to. */
  value: number;
  /** Animation duration in ms. Default 900. */
  duration?: number;
  /** Optional formatter (e.g. money / thousands separators). */
  format?: (n: number) => string;
  className?: string;
}

// Counts up from 0 to `value` with an ease-out curve the first time it renders,
// and re-animates whenever the target changes (e.g. a live poll bumps a total).
// Gives dashboard stat cards that satisfying "dashboard is alive" feel.
export default function CountUp({ value, duration = 900, format, className }: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={`hm-num ${className ?? ''}`}>
      {format ? format(display) : display.toLocaleString('en-IN')}
    </span>
  );
}
