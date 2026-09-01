import { ReactNode } from 'react';
import { Activity, LogOut } from 'lucide-react';
import AiBackdrop from '@/components/common/AiBackdrop';
import PanelLockToggle from '@/components/common/PanelLockToggle';

/**
 * Shared dark "AI scan" chrome for every signed-in console (admin, doctor,
 * reception, patient) — so the dashboards match the public site. Provides the
 * animated backdrop, a frosted glass header and an optional nav row. Content
 * renders through `children`.
 */
export default function DashboardShell({
  consoleName,
  userLabel,
  onLogout,
  nav,
  maxWidth = 'max-w-6xl',
  children,
}: {
  consoleName: string;
  userLabel?: string;
  onLogout: () => void;
  nav?: ReactNode;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#1b2740] text-slate-100">
      <AiBackdrop />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#1f2b48]/80 backdrop-blur-xl">
        <div className={`mx-auto flex h-16 items-center justify-between px-4 ${maxWidth}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold leading-tight text-white">HealingMonk</p>
              <p className="text-xs leading-tight text-teal-300/80">{consoleName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {userLabel && <span className="hidden text-sm text-slate-300 md:inline">{userLabel}</span>}
            <PanelLockToggle />
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {nav && (
        <div className="sticky top-16 z-20 border-b border-white/10 bg-[#1f2b48]/70 backdrop-blur-xl">
          <div className={`mx-auto flex items-center gap-1.5 overflow-x-auto px-4 py-2 ${maxWidth}`}>{nav}</div>
        </div>
      )}

      <main className="relative z-10 px-4 py-8">{children}</main>
    </div>
  );
}

/** Shared nav-tab styling for console nav rows. */
export const dashNavCls = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
    isActive
      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`;
