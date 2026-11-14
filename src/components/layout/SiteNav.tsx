import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Menu, X } from 'lucide-react';
import BrandLogo from '@/components/common/BrandLogo';

/** Public marketing navigation — HealingMonk teal/orange design: lotus logo,
 *  pill links (active = solid teal), "Try Demo" outline + "Book Appointment"
 *  orange buttons. Styles: .hk-* in src/styles/healingmonk-site.css. */
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
            <button type="button" className="hk-btn outline sm" onClick={() => navigate('/ergo')}>
              Try Demo
            </button>
            <button type="button" className="hk-btn orange sm" onClick={() => navigate('/pricing')}>
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
                <button type="button" className="hk-btn outline sm" onClick={() => navigate('/ergo')}>
                  Try Demo
                </button>
                <button type="button" className="hk-btn orange sm" onClick={() => navigate('/pricing')}>
                  Book Now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
