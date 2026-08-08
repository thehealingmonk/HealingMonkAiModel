/**
 * The centerpiece "AI body scan" visual for the marketing heroes.
 *
 * A glowing 33-landmark human figure on a dark tech panel, with an animated
 * scan beam sweeping down the body and floating score chips — the sci-fi look
 * of a real posture-scan engine. Pure SVG + CSS, so it's crisp at any size,
 * needs no image assets, and re-themes with the emerald/cyan palette.
 */

// Front-view layout of the 33 MediaPipe landmarks in a 120 × 180 viewBox
// (mirrors the reference in Landmark33Diagram).
const POINTS: [number, number][] = [
  [60, 24], [63, 20], [66, 20], [69, 20], [57, 20], [54, 20], [51, 20],
  [73, 23], [47, 23], [63, 29], [57, 29],
  [78, 46], [42, 46], [85, 68], [35, 68], [89, 89], [31, 89],
  [91, 97], [29, 97], [87, 98], [33, 98], [84, 94], [36, 94],
  [70, 94], [50, 94], [72, 127], [48, 127], [74, 154], [46, 154],
  [72, 161], [48, 161], [81, 160], [39, 160],
];

const CONNECTIONS: [number, number][] = [
  [0, 7], [0, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32],
];

// Key anatomical points get a larger, brighter node.
const KEY_NODES = new Set([0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

interface Props {
  className?: string;
}

export default function BodyScanHero({ className }: Props) {
  return (
    <div className={`relative mx-auto w-full max-w-md ${className ?? ''}`}>
      {/* Ambient halo behind the panel */}
      <div className="scan-halo pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_40%,rgba(45,212,191,0.35),transparent_65%)] blur-2xl" />

      <div className="glass-dark relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/40">
        {/* Panel header — "live" status */}
        <div className="mb-4 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-teal-200/90">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live posture scan
          </span>
          <span className="font-mono text-teal-300/70">33 / 33 landmarks</span>
        </div>

        {/* The scan stage */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[#0f1830] ring-1 ring-white/5">
          {/* grid backdrop */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(rgba(45,212,191,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.10) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          {/* corner brackets */}
          <Brackets />

          {/* scan beam */}
          <div className="scan-sweep pointer-events-none absolute inset-x-0 top-0 h-24">
            <div className="h-full w-full bg-[linear-gradient(180deg,transparent,rgba(34,211,238,0.18)_60%,rgba(110,231,183,0.55))]" />
            <div className="h-px w-full bg-cyan-300 shadow-[0_0_18px_4px_rgba(34,211,238,0.8)]" />
          </div>

          {/* the figure */}
          <svg
            viewBox="0 0 120 180"
            className="absolute inset-0 h-full w-full p-4"
            role="img"
            aria-label="AI body scan — 33 tracked landmarks"
          >
            <defs>
              <linearGradient id="bone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* skeleton */}
            <g stroke="url(#bone)" strokeWidth={1.6} strokeLinecap="round" filter="url(#glow)" opacity={0.9}>
              {CONNECTIONS.map(([a, b], i) => (
                <line key={i} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />
              ))}
            </g>

            {/* plumb line reference */}
            <line x1="60" y1="12" x2="60" y2="168" stroke="rgba(148,163,184,0.35)" strokeWidth={0.6} strokeDasharray="2 3" />

            {/* landmark nodes */}
            {POINTS.map(([x, y], i) => {
              const key = KEY_NODES.has(i);
              return (
                <g key={i} className="scan-node" style={{ animationDelay: `${(i % 8) * 0.18}s` }}>
                  <circle cx={x} cy={y} r={key ? 2.6 : 1.6} fill={key ? '#a7f3d0' : '#5eead4'} filter="url(#glow)" />
                  {key && <circle cx={x} cy={y} r={4.6} fill="none" stroke="#2dd4bf" strokeWidth={0.5} opacity={0.5} />}
                </g>
              );
            })}
          </svg>

          {/* overall score badge */}
          <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Overall</p>
            <p className="scan-glow-text text-2xl font-bold leading-none">84</p>
          </div>
        </div>

        {/* floating metric chips */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Metric label="Posture" value={86} delay />
          <Metric label="Mobility" value={74} />
          <Metric label="Stability" value={91} delay />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, delay }: { label: string; value: number; delay?: boolean }) {
  return (
    <div className={`glass-dark rounded-xl p-3 ${delay ? 'scan-float-delayed' : 'scan-float'}`}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="hm-num mt-0.5 text-lg font-semibold text-white">{value}</p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Decorative viewfinder corner brackets.
function Brackets() {
  const c = 'absolute h-5 w-5 border-teal-300/50';
  return (
    <>
      <span className={`${c} left-2 top-2 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${c} right-2 top-2 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${c} bottom-2 left-2 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${c} bottom-2 right-2 rounded-br-md border-b-2 border-r-2`} />
    </>
  );
}
