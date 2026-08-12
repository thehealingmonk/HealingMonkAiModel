/**
 * Site-wide animated "AI" backdrop. Sits fixed behind every marketing section:
 * a soft light base, a slowly panning tech grid, two drifting glow orbs and a
 * scatter of floating particle nodes — so the whole site feels like one live
 * scan surface, not just the hero. Pure CSS, pointer-events-none, and it fully
 * stops when the user prefers reduced motion.
 */

// Fixed pseudo-random scatter of particles (x%, y%, size px, delay s).
const NODES: [number, number, number, number][] = [
  [8, 20, 3, 0], [18, 62, 2, 1.2], [27, 34, 4, 2.4], [38, 78, 2, 0.6],
  [46, 18, 3, 3], [55, 50, 2, 1.8], [63, 82, 4, 0.9], [72, 28, 3, 2.1],
  [80, 66, 2, 1.5], [88, 40, 3, 0.3], [92, 14, 2, 2.7], [14, 88, 3, 1.1],
  [34, 8, 2, 3.3], [68, 12, 2, 2.5], [50, 92, 3, 0.4], [84, 86, 2, 1.9],
];

export default function AiBackdrop() {
  return (
    <div className="light-base light-grid pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* drifting glow orbs — soft sky/emerald tints on white */}
      <div className="ai-orb absolute -left-24 top-10 h-[420px] w-[420px] rounded-full bg-sky-400/20 blur-[130px]" />
      <div className="ai-orb-2 absolute -right-24 top-1/3 h-[460px] w-[460px] rounded-full bg-emerald-400/15 blur-[140px]" />
      <div className="ai-orb absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-teal-400/15 blur-[150px]" />

      {/* floating particle nodes */}
      {NODES.map(([x, y, s, d], i) => (
        <span
          key={i}
          className="ai-node absolute rounded-full bg-sky-400"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: s,
            height: s,
            animationDelay: `${d}s`,
            boxShadow: '0 0 8px 1px rgba(56,189,248,0.6)',
          }}
        />
      ))}
    </div>
  );
}
