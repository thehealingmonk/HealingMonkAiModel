import { Link } from 'react-router-dom';

/**
 * The HealingMonk lotus — traced from the official logo: a broad centre petal
 * with a flame-shaped cut-out, two green side petals leaning outward and two
 * low blue-teal outer leaves. Pure SVG, so it stays crisp at every size.
 * `light` is the variant for dark / teal backgrounds (footer, login panel).
 */
export function LotusMark({ size = 44, light = false }: { size?: number; light?: boolean }) {
  // Gradient ids are shared by every instance of a variant (identical defs),
  // so duplicates on one page are harmless.
  const v = light ? 'L' : 'D';
  const c = light
    ? { outer: ['#bfeee2', '#7fd1b9'], side: ['#ffffff', '#b8ecdd'], centre: ['#e6faf4', '#9fe0cc'] }
    : { outer: ['#13879a', '#0b5f6e'], side: ['#1fae8a', '#0f7a72'], centre: ['#0d6b78', '#14917f'] };
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`hkLotusO${v}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.outer[0]} />
          <stop offset="1" stopColor={c.outer[1]} />
        </linearGradient>
        <linearGradient id={`hkLotusS${v}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.side[0]} />
          <stop offset="1" stopColor={c.side[1]} />
        </linearGradient>
        <linearGradient id={`hkLotusC${v}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.centre[0]} />
          <stop offset="1" stopColor={c.centre[1]} />
        </linearGradient>
      </defs>
      {/* outer leaves */}
      <path d="M1 61C14 53 32 55 46 73C31 80 13 76 1 61Z" fill={`url(#hkLotusO${v})`} />
      <path d="M99 61C86 53 68 55 54 73C69 80 87 76 99 61Z" fill={`url(#hkLotusO${v})`} />
      {/* side petals */}
      <path d="M41 70C28 65 17 50 14 25C25 27 33 33 37 41C39 50 40 60 41 70Z" fill={`url(#hkLotusS${v})`} />
      <path d="M59 70C72 65 83 50 86 25C75 27 67 33 63 41C61 50 60 60 59 70Z" fill={`url(#hkLotusS${v})`} />
      {/* centre petal with the flame cut-out */}
      <path
        fillRule="evenodd"
        d="M50 0C59 12 66 29 65 46C64 58 60 66 57 72L43 72C40 66 36 58 35 46C34 29 41 12 50 0ZM50 37C55 47 58 60 57 72L43 72C42 60 45 47 50 37Z"
        fill={`url(#hkLotusC${v})`}
      />
    </svg>
  );
}

/** Lotus mark + "Healing" (navy) "Monk" (orange) wordmark with the
 *  "Heal - Move - Live Better" tagline. `light` is the dark-background variant. */
export default function BrandLogo({ light = false, to = '/' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className={`hk-logo${light ? ' light' : ''}`} aria-label="HealingMonk home">
      <LotusMark light={light} />
      <span className="hk-logo-text">
        <b>
          Healing<em>Monk</em>
        </b>
        <small>Heal - Move - Live Better</small>
      </span>
    </Link>
  );
}
