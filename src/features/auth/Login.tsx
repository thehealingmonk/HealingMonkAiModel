import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Mail,
  Lock,
  User as UserIcon,
  ArrowLeft,
  ShieldCheck,
  ScanLine,
  Stethoscope,
  Headset,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import { Role } from '@/services/api';
import BodyScanHero from '@/components/common/BodyScanHero';
import AiBackdrop from '@/components/common/AiBackdrop';

interface Props {
  /** Return to the public home page. Defaults to navigating to "/". */
  onBack?: () => void;
}

// The four sign-in portals. Login itself hits one unified API; picking a portal
// themes the screen and, on success, we verify the account actually has that
// role — so each role gets a truly separate entry point. Only patients (users)
// can self-register; staff accounts are created by an admin.
interface Portal {
  role: Role;
  label: string;
  desc: string;
  icon: React.ReactNode;
  accent: string; // gradient for the icon tile
  ring: string; // hover ring
  canSignup?: boolean;
}

const PORTALS: Portal[] = [
  {
    role: 'patient',
    label: 'User / Patient',
    desc: 'View your reports, scans & appointments',
    icon: <UserIcon className="h-6 w-6" />,
    accent: 'from-emerald-500 to-teal-500',
    ring: 'hover:border-emerald-400/50 hover:shadow-emerald-500/20',
    canSignup: true,
  },
  {
    role: 'doctor',
    label: 'Doctor',
    desc: 'Assess patients & manage reports',
    icon: <Stethoscope className="h-6 w-6" />,
    accent: 'from-cyan-500 to-sky-500',
    ring: 'hover:border-cyan-400/50 hover:shadow-cyan-500/20',
  },
  {
    role: 'reception',
    label: 'Reception',
    desc: 'Appointments, billing & collections',
    icon: <Headset className="h-6 w-6" />,
    accent: 'from-violet-500 to-fuchsia-500',
    ring: 'hover:border-violet-400/50 hover:shadow-violet-500/20',
  },
  {
    role: 'admin',
    label: 'Super Admin',
    desc: 'Full clinic console & user management',
    icon: <ShieldCheck className="h-6 w-6" />,
    accent: 'from-amber-500 to-orange-500',
    ring: 'hover:border-amber-400/50 hover:shadow-amber-500/20',
  },
];

const ROLE_LABEL: Record<Role, string> = {
  patient: 'User / Patient',
  doctor: 'Doctor',
  reception: 'Reception',
  admin: 'Super Admin',
};

export default function Login({ onBack }: Props) {
  const { login, register, logout } = useAuth();
  const navigate = useNavigate();
  const back = onBack ?? (() => navigate('/'));

  const [portal, setPortal] = useState<Portal | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const choose = (p: Portal) => {
    setPortal(p);
    setMode('signin');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portal) return;
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        // Only the patient portal offers signup.
        await register(name.trim(), email.trim(), password);
      } else {
        const u = await login(email.trim(), password);
        // Enforce the chosen portal: a doctor can't sign in from the admin door.
        if (u.role !== portal.role) {
          logout();
          setError(
            `This is the ${portal.label} portal, but that account is a ${ROLE_LABEL[u.role]} account. Please use the ${ROLE_LABEL[u.role]} login.`
          );
          return;
        }
      }
      // On match, AppRouter re-renders straight to the role's app.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#1b2740] text-slate-100 lg:grid lg:grid-cols-2">
      <AiBackdrop />

      {/* ---------- LEFT: dark AI-scan panel (desktop) ---------- */}
      <aside className="scan-hero scan-grid relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <button
          onClick={back}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to site
        </button>

        <div className="relative flex flex-1 flex-col items-center justify-center py-8">
          <BodyScanHero className="max-w-xs" />
        </div>

        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-teal-200">
            <ScanLine className="h-3.5 w-3.5 text-emerald-400" /> HealingMonk Clinic OS
          </div>
          <p className="max-w-sm text-lg font-semibold leading-snug text-white">
            One workspace for your scans, reports, appointments &amp; payments.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Secure, role-based access for patients &amp; staff
          </p>
        </div>
      </aside>

      {/* ---------- RIGHT ---------- */}
      <div className="relative z-10 flex min-h-screen flex-col lg:min-h-0">
        <div className="px-4 py-4 lg:hidden">
          <button
            onClick={back}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          {!portal ? (
            /* ---- Portal picker ---- */
            <div className="hm-page-enter w-full max-w-md">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
                  <Activity className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Choose your login</h1>
                <p className="mt-1 text-sm text-slate-400">Select the portal that matches your role.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {PORTALS.map((p) => (
                  <button
                    key={p.role}
                    onClick={() => choose(p)}
                    className={`glass-dark group flex flex-col items-start gap-3 rounded-2xl p-5 text-left shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 ${p.ring}`}
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${p.accent} text-white shadow-md transition-transform group-hover:scale-110`}
                    >
                      {p.icon}
                    </span>
                    <span>
                      <span className="block font-semibold text-white">{p.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-400">{p.desc}</span>
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-teal-300">
                      Continue <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ---- Themed form for the chosen portal ---- */
            <div className="hm-page-enter glass-dark w-full max-w-sm rounded-3xl p-8 shadow-2xl shadow-black/40">
              <button
                onClick={() => {
                  setPortal(null);
                  setError('');
                }}
                className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change portal
              </button>

              <div className="mb-8 text-center">
                <div
                  className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${portal.accent} shadow-lg`}
                >
                  <span className="text-white">{portal.icon}</span>
                </div>
                <p className="text-xs font-medium uppercase tracking-widest text-teal-300">{portal.label} portal</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                  {mode === 'signup' ? 'Create your account' : `Sign in`}
                </h1>
                <p className="mt-1 text-sm text-slate-400">{portal.desc}</p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                {mode === 'signup' && (
                  <Field icon={<UserIcon className="h-5 w-5 text-slate-400" />} label="Full name">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder="Your name"
                      required
                    />
                  </Field>
                )}

                <Field icon={<Mail className="h-5 w-5 text-slate-400" />} label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="you@example.com"
                    required
                  />
                </Field>

                <Field icon={<Lock className="h-5 w-5 text-slate-400" />} label="Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </Field>

                {error && (
                  <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`hm-lift w-full rounded-lg bg-gradient-to-r ${portal.accent} px-4 py-2.5 font-semibold text-white shadow-lg disabled:opacity-60`}
                >
                  {loading ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
                </button>
              </form>

              {portal.canSignup ? (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => {
                      setMode(mode === 'signup' ? 'signin' : 'signup');
                      setError('');
                    }}
                    className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    {mode === 'signup'
                      ? 'Already have an account? Sign in'
                      : 'New patient? Create an account'}
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-center text-xs text-slate-500">
                  {portal.label} accounts are created by an administrator.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full pl-10 pr-4 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent transition-shadow';

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        {children}
      </div>
    </div>
  );
}
