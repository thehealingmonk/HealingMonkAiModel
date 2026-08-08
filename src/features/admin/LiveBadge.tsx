import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

// "Live · updated Ns ago" pill with a manual refresh. Ticks every second so the
// relative time stays honest between polls.
export default function LiveBadge({ lastUpdated, refreshing, onRefresh }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ago = (() => {
    if (!lastUpdated) return '—';
    const secs = Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000));
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  })();

  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Live · updated {ago}
      </span>
      <button
        onClick={onRefresh}
        className="hm-lift inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-medium text-slate-200 hover:border-emerald-400/40 hover:text-white"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
      </button>
    </div>
  );
}
