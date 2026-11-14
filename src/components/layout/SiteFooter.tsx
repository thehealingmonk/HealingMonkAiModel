import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from 'lucide-react';
import BrandLogo from '@/components/common/BrandLogo';
import { InstallAppButton } from '@/components/common/InstallAppButton';
import { SITE } from '@/lib/seo';

// Clinic contact details shown in the footer — update these to the real ones.
const CONTACT = {
  phone: '+91 98765 43210',
  email: SITE.email,
  city: 'Pune, Maharashtra',
};

const SERVICES = [
  'Back & Neck Pain',
  'Sports Physiotherapy',
  'Orthopedic Care',
  'Geriatric Care',
  'Women Health',
  'Posture Wellness',
];

/** Navy marketing footer: brand + socials, quick links, services, contact,
 *  and the orange "Book Appointment" card. */
export default function SiteFooter() {
  const navigate = useNavigate();
  return (
    <footer id="contact" className="hk-foot">
      <div className="hk-wrap">
        <div className="hk-foot-grid">
          <div className="hk-foot-brand">
            <BrandLogo light />
            <p className="about">Your trusted partner for advanced physiotherapy and rehabilitation.</p>
            <div className="hk-social">
              <a href="#" aria-label="Facebook"><Facebook className="h-4 w-4" /></a>
              <a href="#" aria-label="YouTube"><Youtube className="h-4 w-4" /></a>
              <a href="#" aria-label="Instagram"><Instagram className="h-4 w-4" /></a>
              <a href="#" aria-label="LinkedIn"><Linkedin className="h-4 w-4" /></a>
            </div>
            <div className="mt-4">
              <InstallAppButton />
            </div>
          </div>

          <div>
            <h4>Quick Links</h4>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/about">About Us</Link></li>
              <li><Link to="/assessments">Our Services</Link></li>
              <li><Link to="/technology">Technology</Link></li>
              <li><Link to="/pricing">Pricing</Link></li>
              <li><Link to="/login">Clinic Sign In</Link></li>
            </ul>
          </div>

          <div>
            <h4>Our Services</h4>
            <ul>
              {SERVICES.map((s) => (
                <li key={s}><Link to="/assessments">{s}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Contact Us</h4>
            <ul className="hk-contact">
              <li><Phone className="h-4 w-4" /><a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a></li>
              <li><Mail className="h-4 w-4" /><a href={`mailto:${CONTACT.email}`} className="break-all">{CONTACT.email}</a></li>
              <li><MapPin className="h-4 w-4" />{CONTACT.city}</li>
            </ul>
          </div>

          <div className="hk-book">
            <h4><CalendarDays className="h-5 w-5" /> Book Appointment</h4>
            <p>Take the first step towards a pain-free life.</p>
            <button type="button" className="hk-btn white sm" onClick={() => navigate('/pricing')}>
              Book Now <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="hk-foot-note">
          Disclaimer: measurements are AI camera-based estimates for screening and education only. They are not
          medically verified and are not a substitute for examination by a qualified clinician.
        </p>

        <div className="hk-foot-bottom">
          <p>© {new Date().getFullYear()} HealingMonk. All Rights Reserved.</p>
          <nav aria-label="Legal">
            <Link to="/about">Privacy Policy</Link> | <Link to="/about">Terms &amp; Conditions</Link> |{' '}
            <a href="/sitemap.xml">Sitemap</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
