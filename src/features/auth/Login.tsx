import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
import BodyVRMHero from '@/components/common/BodyVRMHero';
import BrandLogo, { LotusMark } from '@/components/common/BrandLogo';

// Warm the chosen panel's code while the user types their password, so the
// dashboard appears instantly after a successful sign-in (same chunks the
// router lazy-loads — webpack dedupes them).
const PREFETCH: Record<Role, () => Promise<unknown>> = {
  admin: () => import('@/features/admin/AdminApp'),
  doctor: () => import('@/features/doctor/DoctorApp'),
  reception: () => import('@/features/reception/ReceptionApp'),
  patient: () => import('@/features/patient/PatientHome'),
};

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
    accent: 'from-[#138a86] to-[#0b4f57]',
    ring: 'hover:border-[#bfe3d6] hover:shadow-[#0d6b6e]/20',
    canSignup: true,
  },
  {
    role: 'doctor',
    label: 'Doctor',
    desc: 'Assess patients & manage reports',
    icon: <Stethoscope className="h-6 w-6" />,
    accent: 'from-[#2bb673] to-[#1a8a5a]',
    ring: 'hover:border-[#bfe3d6] hover:shadow-[#1fa86b]/20',
  },
  {
    role: 'reception',
    label: 'Reception',
    desc: 'Appointments, billing & collections',
    icon: <Headset className="h-6 w-6" />,
    accent: 'from-[#2a4a72] to-[#0f2340]',
    ring: 'hover:border-[#c9d5e6] hover:shadow-[#0f2340]/20',
  },
  {
    role: 'admin',
    label: 'Super Admin',
    desc: 'Full clinic console & user management',
    icon: <ShieldCheck className="h-6 w-6" />,
    accent: 'from-[#ff9a1f] to-[#f57c00]',
    ring: 'hover:border-[#ffd9b0] hover:shadow-[#f57c00]/20',
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
    PREFETCH[p.role]().catch(() => {});
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
    <div className="hm-console relative min-h-screen lg:grid lg:grid-cols-2">
      {/* ---------- LEFT: teal brand panel (desktop) — the home page banner ---------- */}
      <aside className="hmc-login-aside sticky top-0 hidden h-screen flex-col justify-between p-10 lg:flex">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo />
          <button
            onClick={back}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/40 px-4 py-2 text-sm font-medium !text-white transition-colors hover:!bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to site
          </button>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center py-8">
          <BodyVRMHero className="max-w-xs" />
        </div>

        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.15)] px-3 py-1 text-xs font-semibold !text-white">
            <ScanLine className="h-3.5 w-3.5 !text-[#ffb35c]" /> HealingMonk Clinic OS
          </div>
          <p className="max-w-sm font-[Poppins] text-2xl font-bold leading-snug !text-white">
            One workspace for your scans, reports, appointments &amp; payments.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm !text-[#d8f1ec]">
            <ShieldCheck className="h-4 w-4 !text-[#ffb35c]" /> Secure, role-based access for patients &amp; staff
          </p>
        </div>
      </aside>

      {/* ---------- RIGHT ---------- */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:hidden">
          <BrandLogo />
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
                <div className="mx-auto mb-3 flex w-fit items-center justify-center">
                  <LotusMark size={60} />
                </div>
                <h1 className="text-[28px] font-bold tracking-tight text-white">Choose your login</h1>
                <p className="mt-1 text-sm text-slate-400">Select the portal that matches your role.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {PORTALS.map((p) => (
                  <button
                    key={p.role}
                    onClick={() => choose(p)}
                    className={`glass-dark group flex flex-col items-start gap-3 rounded-[22px] p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${p.ring}`}
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${p.accent} text-white shadow-md transition-transform group-hover:scale-110`}
                    >
                      {p.icon}
                    </span>
                    <span>
                      <span className="block font-[Poppins] font-semibold text-white">{p.label}</span>
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
            <div className="hm-page-enter glass-dark w-full max-w-sm rounded-[26px] p-8">
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

                <button type="submit" disabled={loading} className="hmc-btn w-full">
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
                    className="text-sm font-semibold text-[color:var(--forest)] hover:text-[color:var(--orange-2)]"
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
  'w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent transition-shadow';

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
