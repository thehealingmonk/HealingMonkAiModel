import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Lock, Menu, Sparkles, X } from 'lucide-react';
import BrandLogo from '@/components/common/BrandLogo';

/** Public marketing navigation — HealingMonk teal/orange design: lotus logo,
 *  pill links (active = solid teal) and three actions:
 *    • "AI Scan"       → the full AI posture assessment (needs sign-in / plan)
 *    • "Free AI Demo"  → ErgoAI, opens directly with no login
 *    • "Book Appointment" → the online booking form (/book)
 *  Styles: .hk-* in src/styles/healingmonk-site.css. */
const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/technology', label: 'Technology' },
  { to: '/about', label: 'About Us' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/assessments', label: 'Assessments' },
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
  const toContact = () => {
    setOpen(false);
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className={`hk-head${scrolled || open ? ' scrolled' : ''}`}>
      <div className="hk-wrap">
        <div className="hk-bar">
          <BrandLogo />

          <nav className="hk-menu" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
            <a href="#contact" onClick={(e) => { e.preventDefault(); toContact(); }}>
              Contact
            </a>
          </nav>

          <div className="hk-right">
            <button
              type="button"
              className="hk-btn outline sm"
              onClick={() => go('/assessment')}
              title="Full AI posture scan — sign in required"
            >
              <Lock className="h-4 w-4" /> AI Scan
            </button>
            <button
              type="button"
              className="hk-btn ghost sm"
              onClick={() => go('/ergo')}
              title="Free AI demo — opens directly, no login"
            >
              <Sparkles className="h-4 w-4" /> Free AI Demo
            </button>
            <button type="button" className="hk-btn orange sm" onClick={() => go('/book')}>
              <CalendarDays className="h-4 w-4" /> Book Appointment <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="hk-burger"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {open && (
            <div className="hk-mobile">
              {LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                  {l.label}
                </NavLink>
              ))}
              <a href="#contact" onClick={(e) => { e.preventDefault(); toContact(); }}>
                Contact
              </a>
              <NavLink to="/login" className={linkCls}>
                Clinic sign in
              </NavLink>
              <div className="row">
                <button type="button" className="hk-btn outline sm" onClick={() => go('/assessment')}>
                  <Lock className="h-4 w-4" /> AI Scan
                </button>
                <button type="button" className="hk-btn ghost sm" onClick={() => go('/ergo')}>
                  <Sparkles className="h-4 w-4" /> Free AI Demo
                </button>
              </div>
              <button type="button" className="hk-btn orange sm" style={{ marginTop: 8 }} onClick={() => go('/book')}>
                <CalendarDays className="h-4 w-4" /> Book Appointment
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
