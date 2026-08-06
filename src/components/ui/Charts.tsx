// Lightweight, dependency-free SVG charts for the admin dashboard. Responsive
// via viewBox (w-full h-auto). Each data point exposes a <title> so hovering a
// point/bar shows its exact value.

export interface ChartPoint {
  label: string; // x-axis label / tooltip prefix
  value: number;
}

const pad = { top: 10, right: 8, bottom: 18, left: 8 };

/** Smooth line + gradient area chart. Good for a revenue / activity trend. */
export function LineAreaChart({
  points,
  color = '#10b981',
  id,
  height = 160,
  format = (n: number) => String(n),
}: {
  points: ChartPoint[];
  color?: string;
  id: string;
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 640;
  const H = height;
  if (points.length === 0) return <EmptyChart height={H} />;

  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(
    pad.top + innerH
  ).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* baseline */}
      <line x1={pad.left} y1={pad.top + innerH} x2={W - pad.right} y2={pad.top + innerH} stroke="#e2e8f0" strokeWidth="1" />
      <path d={area} fill={`url(#grad-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 0 : 2.5} fill="#fff" stroke={color} strokeWidth="1.5">
          <title>{`${p.label}: ${format(p.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Vertical bar chart. Good for daily counts (new patients, reports). */
export function BarChart({
  points,
  color = '#0ea5e9',
  height = 160,
  format = (n: number) => String(n),
}: {
  points: ChartPoint[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 640;
  const H = height;
  if (points.length === 0) return <EmptyChart height={H} />;

  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const gap = points.length > 60 ? 0.5 : 2;
  const bw = innerW / points.length - gap;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Bar chart">
      <line x1={pad.left} y1={pad.top + innerH} x2={W - pad.right} y2={pad.top + innerH} stroke="#e2e8f0" strokeWidth="1" />
      {points.map((p, i) => {
        const h = (p.value / max) * innerH;
        const bx = pad.left + i * (bw + gap);
        return (
          <rect key={i} x={bx} y={pad.top + innerH - h} width={Math.max(1, bw)} height={h} rx="1.5" fill={color} opacity="0.85">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Horizontal labelled bars — appointment status mix, top doctors, etc. */
export function HBars({
  rows,
  format = (n: number) => String(n),
}: {
  rows: { label: string; value: number; color?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">No data yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 capitalize">{r.label}</span>
            <span className="font-semibold text-slate-900">{format(r.value)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color || '#10b981' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
      No data in this range yet.
    </div>
  );
}
