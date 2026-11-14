import { Link } from 'react-router-dom';

/** HealingMonk lotus mark + wordmark ("Healing" teal, "Monk" orange) with the
 *  "Heal · Move · Live Better" tagline. `light` is the footer (dark bg) variant. */
export function LotusMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 60 48" aria-hidden="true">
      <defs>
        <linearGradient id="hkLotusA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fb59a" />
          <stop offset="1" stopColor="#0d6b6e" />
        </linearGradient>
        <linearGradient id="hkLotusB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd1b9" />
          <stop offset="1" stopColor="#1f8f85" />
        </linearGradient>
      </defs>
      {/* outer petals */}
      <path d="M30 44C18 44 6 38 2 26c10 0 20 5 28 18z" fill="url(#hkLotusB)" />
      <path d="M30 44c12 0 24-6 28-18-10 0-20 5-28 18z" fill="url(#hkLotusB)" />
      {/* side petals */}
      <path d="M30 44C20 38 13 28 14 14c9 5 15 15 16 30z" fill="url(#hkLotusA)" />
      <path d="M30 44c10-6 17-16 16-30-9 5-15 15-16 30z" fill="url(#hkLotusA)" />
      {/* centre petal */}
      <path d="M30 44c-6-8-8-20 0-40 8 20 6 32 0 40z" fill="#0d5f63" />
    </svg>
  );
}

export default function BrandLogo({ light = false, to = '/' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className={`hk-logo${light ? ' light' : ''}`} aria-label="HealingMonk home">
      <LotusMark />
      <span className="hk-logo-text">
        <b>
          Healing<em>Monk</em>
        </b>
        <small>Heal - Move - Live Better</small>
      </span>
    </Link>
  );
}
