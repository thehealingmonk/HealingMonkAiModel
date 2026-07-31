interface Props {
  /** Number of placeholder rows to show. Default 6. */
  rows?: number;
  /** Number of columns to mimic. Default 5. */
  cols?: number;
}

// Shimmer placeholder that mirrors a data table's shape so switching from
// "loading" to "loaded" doesn't jump the layout — makes the app feel instant.
export default function TableSkeleton({ rows = 6, cols = 5 }: Props) {
  return (
    <div className="p-4" aria-hidden>
      <div className="hm-skeleton mb-4 h-9 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4" style={{ '--reveal-delay': `${r * 40}ms` } as React.CSSProperties}>
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="hm-skeleton h-4 rounded"
                style={{ width: c === 0 ? '12%' : c === cols - 1 ? '14%' : `${18 + ((r + c) % 3) * 6}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
