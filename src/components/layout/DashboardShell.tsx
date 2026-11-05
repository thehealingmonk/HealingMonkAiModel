import { ReactNode, useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, LogOut } from 'lucide-react';
import PanelLockToggle from '@/components/common/PanelLockToggle';

/**
 * Shared chrome for every signed-in console (admin, doctor, reception,
 * patient), in the Mappingg dashboard design: a white top bar with the brand
 * and an account chip, then a sticky row of pill tabs. Content renders through
 * `children`.
 *
 * The `.hm-console` class (src/styles/mappingg-theme.css) turns the screens'
 * older dark-theme utilities into the light Mappingg look. It is also put on
 * <body> while a console is open so modals portalled there match.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add('hm-console');
    return () => document.body.classList.remove('hm-console');
  }, []);

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const initials =
    (userLabel || consoleName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'HM';

  return (
    <div className="hm-console relative min-h-screen">
      <header className="hmc-top">
        <div className="hmc-brand">
          <span className="hmc-mark" aria-hidden="true">
            <Activity className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <b>
              Healing<em>Monk</em>
            </b>
            <small className="truncate">{consoleName}</small>
          </div>
        </div>

        <div className="hmc-right" ref={menuRef}>
          <PanelLockToggle />
          <button
            type="button"
            className="hmc-chip"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="who" aria-hidden="true">{initials}</span>
            <span className="who-meta">
              <b>{userLabel || 'Account'}</b>
              <small>{consoleName}</small>
            </span>
            <ChevronDown className="h-3 w-3 text-[color:var(--muted)]" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="hmc-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {nav && (
        <nav className="hmc-tabs" aria-label={`${consoleName} sections`}>
          <div className={`hmc-tabs-in ${maxWidth}`}>{nav}</div>
        </nav>
      )}

      <main className="hmc-main">{children}</main>
    </div>
  );
}

/** Shared nav-tab styling for console nav rows (Mappingg pill tabs). */
export const dashNavCls = ({ isActive }: { isActive: boolean }) => `hmc-tab${isActive ? ' active' : ''}`;
