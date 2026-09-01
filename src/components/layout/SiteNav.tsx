import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Activity, Menu, X, ArrowRight } from 'lucide-react';

/** Primary marketing navigation. Sticky and scroll-aware: it sits transparent
 *  over the light hero at the top of every page, then turns into a solid frosted
 *  white bar once you scroll — so the links stay readable on both backdrops. */
const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/technology', label: 'Technology' },
  { to: '/assessments', label: 'Assessments' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The whole site is light; the bar just gains a frosted panel once scrolled.
  const solid = scrolled || open;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition-colors ${
      isActive ? 'font-semibold text-emerald-600' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        solid
          ? 'border-b border-slate-900/10 bg-white/80 shadow-sm backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">HealingMonk</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-slate-600 transition-colors hover:text-slate-900"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate('/pricing')}
            className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
          >
            Subscribe
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          className="rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-900/5 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-slate-900/10 bg-white/95 backdrop-blur-xl md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-6 py-3">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-2 py-2.5 text-sm ${
                    isActive ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-600 hover:bg-slate-900/5'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                navigate('/login');
              }}
              className="mt-2 rounded-lg px-2 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-900/5"
            >
              Sign in
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate('/pricing');
              }}
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25"
            >
              Subscribe
              <ArrowRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
