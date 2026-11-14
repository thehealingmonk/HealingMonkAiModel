/** Decorative teal leaf sprig used around the marketing hero / sections. */
export default function Leaf({ className }: { className?: string }) {
  return (
    <div className={`hk-leaf ${className ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 120 160" width="100%">
        <defs>
          <linearGradient id="hkLeafG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fd8c3" />
            <stop offset="1" stopColor="#2a9d8f" />
          </linearGradient>
        </defs>
        <path d="M60 158C58 110 52 70 34 20" stroke="#4fb3a0" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {[
          'M46 50C30 46 18 32 16 12c18 4 30 16 30 38z',
          'M50 72c6-18 22-30 44-30-4 20-20 32-44 30z',
          'M54 96C38 94 24 82 18 62c20 2 34 14 36 34z',
          'M56 118c8-18 26-28 48-26-6 20-24 30-48 26z',
          'M40 34c4-14 14-24 30-28-2 16-14 26-30 28z',
        ].map((d, i) => (
          <path key={i} d={d} fill="url(#hkLeafG)" opacity={0.75 + (i % 2) * 0.2} />
        ))}
      </svg>
    </div>
  );
}
