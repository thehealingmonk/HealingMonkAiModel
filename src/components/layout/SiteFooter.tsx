import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

/** Marketing footer with grouped links and the clinical disclaimer. */
export default function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-white/[0.02] backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-white">HealingMonk</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-400">
              AI posture &amp; movement assessment that runs entirely in your browser — private by design.
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { to: '/technology', label: 'Technology' },
              { to: '/assessments', label: 'Assessments' },
              { to: '/how-it-works', label: 'How it works' },
              { to: '/pricing', label: 'Pricing' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { to: '/about', label: 'About' },
              { to: '/login', label: 'Clinic sign in' },
            ]}
          />
          <div>
            <p className="text-sm font-semibold text-white">Disclaimer</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Measurements are AI camera-based estimates for screening and education only. They are not medically
              verified and are not a substitute for examination by a qualified clinician.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} HealingMonk · AI Movement Assessment</p>
          <p>Powered by MediaPipe Pose · 33-point tracking</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-slate-400 transition-colors hover:text-teal-300">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
