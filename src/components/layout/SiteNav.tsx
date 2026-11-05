import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Menu, X, ArrowRight } from 'lucide-react';

/** Primary marketing navigation, in the Mappingg site-header design: a solid
 *  white bar with the brand, centred links (active one underlined in forest
 *  green), and outline + solid buttons. It gains a soft shadow once scrolled.
 *  Styles: .hms-* in src/styles/mappingg-theme.css. */
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
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile panel whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  const linkCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  return (
    <header className={`hms-head${scrolled || open ? ' scrolled' : ''}`}>
      <div className="hms-wrap">
        <div className="hms-bar">
          <Link to="/" className="hms-brand" aria-label="HealingMonk home">
            <span className="hmc-mark" aria-hidden="true">
              <Activity className="h-5 w-5" />
            </span>
            <b>
              Healing<em>Monk</em>
            </b>
          </Link>

          <nav className="hms-menu" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hms-right">
            <button type="button" className="hms-btn line" onClick={() => navigate('/login')}>
              Sign in
            </button>
            <button type="button" className="hms-btn primary" onClick={() => navigate('/pricing')}>
              Subscribe <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="hms-burger"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {open && (
            <div className="hms-mobile">
              {LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                  {l.label}
                </NavLink>
              ))}
              <div className="row">
                <button type="button" className="hms-btn line" onClick={() => navigate('/login')}>
                  Sign in
                </button>
                <button type="button" className="hms-btn primary" onClick={() => navigate('/pricing')}>
                  Subscribe
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
