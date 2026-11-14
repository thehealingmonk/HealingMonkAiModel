import { Link, useNavigate } from 'react-router-dom';
import {
  Accessibility,
  ArrowRight,
  Bone,
  CalendarDays,
  Camera,
  Check,
  Cpu,
  Dumbbell,
  FileText,
  HeartHandshake,
  HeartPulse,
  Play,
  ShieldCheck,
  Star,
  Target,
  Timer,
  Trophy,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import BodyVRMHero from '@/components/common/BodyVRMHero';
import Leaf from '@/components/common/Leaf';

// Physiotherapy services — each card links into the assessment library.
const SERVICES = [
  { title: 'Back & Neck\nPain Relief', icon: UserRound, tint: '#fde8dc', color: '#0f2340', dot: true },
  { title: 'Sports\nPhysiotherapy', icon: Dumbbell, tint: '#dff1f4', color: '#0d6b6e' },
  { title: 'Orthopedic\nPhysiotherapy', icon: Bone, tint: '#e2eef7', color: '#1d4f8a' },
  { title: 'Geriatric\nPhysiotherapy', icon: Accessibility, tint: '#e3f1ef', color: '#0d6b6e' },
  { title: "Women's Health\nPhysiotherapy", icon: HeartHandshake, tint: '#fde4ec', color: '#c2185b' },
  { title: 'Posture\nWellness', icon: HeartPulse, tint: '#e3f6ec', color: '#0d6b6e' },
];

export default function Home() {
  const navigate = useNavigate();
  // The AI assessment is a subscription feature — booking CTAs lead to pricing.
  const book = () => navigate('/pricing');

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="hk-hero">
        <HeroWave />
        <div className="hk-wrap">
          <div className="hk-hero-grid">
            {/* Copy */}
            <div data-reveal="left">
              <span className="hk-pill-wrap">
                <span className="hk-pill">
                  <Zap className="h-3.5 w-3.5" /> AI-Powered Physiotherapy Care
                </span>
              </span>

              <h1 className="hk-h1">
                Scan your posture &amp; movement in{' '}
                <span className="hk-swoosh">
                  minutes
                  <svg viewBox="0 0 130 22" fill="none" aria-hidden="true">
                    <path d="M3 15C40 4 92 3 127 10" stroke="#f7931e" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="hk-lead">
                Smart AI that uses just your camera gives you instant insights about your posture, movement
                and more.
              </p>

              <div className="hk-cta">
                <button type="button" onClick={book} className="hk-btn orange lg">
                  <CalendarDays className="h-5 w-5" /> Book a Health Scan <ArrowRight className="h-5 w-5" />
                </button>
                <Link to="/how-it-works" className="hk-btn outline lg">
                  <span className="hk-play"><Play className="h-3 w-3 fill-current" /></span> Watch Demo
                </Link>
              </div>

              <div className="hk-trust">
                <TrustItem icon={<ShieldCheck className="h-6 w-6" />} title="95%+" sub="Accuracy" />
                <TrustItem icon={<Zap className="h-6 w-6" />} title="In 2 Min" sub="Complete Scan" />
                <TrustItem icon={<HeartPulse className="h-6 w-6" />} title="Better You" sub="Healthier Life" />
              </div>
            </div>

            {/* Posture score card with the interactive 3D model */}
            <div className="relative" data-reveal="scale">
              <Leaf className="hk-leaf-a" />
              <div className="hk-scan-card">
                <div className="hk-scan-top">
                  <div className="hk-score">
                    <p>Posture Score</p>
                    <b>
                      84
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#1fa86b] text-white">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    </b>
                    <small>Good Posture</small>
                  </div>

                  <div className="hk-model">
                    <BodyVRMHero bare />
                  </div>

                  <div className="hk-checks">
                    {['Shoulder Aligned', 'Back Straight', 'Balanced Posture'].map((c) => (
                      <div key={c} className="hk-check">
                        <i><Check className="h-3.5 w-3.5" strokeWidth={3} /></i>
                        {c}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hk-metrics">
                  <Metric value={86} label="Balance" />
                  <Metric value={74} label="Flexibility" />
                  <Metric value={83} label="Mobility" />
                </div>
                <p className="hk-drag">Drag the model to rotate · 360° view</p>
              </div>
              <Leaf className="hk-leaf-b" />
            </div>
          </div>
        </div>
      </section>

      {/* ================= SERVICES ================= */}
      <section className="hk-section">
        <span className="hk-dots" style={{ left: '3%', top: 40 }} />
        <span className="hk-dots" style={{ right: '3%', top: 40 }} />
        <div className="hk-wrap hk-center">
          <span className="hk-eyebrow center" data-reveal="fade">Our Services</span>
          <h2 className="hk-h2 mt-3" data-reveal="fade">
            Comprehensive <span className="hk-orange">Physiotherapy</span> Solutions
          </h2>
          <p className="hk-sub" data-reveal="fade">
            Personalized treatment plans for a healthier and more active life.
          </p>

          <div className="hk-services">
            {SERVICES.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="hk-service"
                  data-reveal
                  style={{ '--reveal-delay': `${i * 70}ms` } as React.CSSProperties}
                >
                  <span className="hk-service-ico relative" style={{ background: s.tint, color: s.color }}>
                    <Icon className="h-8 w-8" strokeWidth={1.8} />
                    {s.dot && (
                      <span className="absolute right-3 top-6 h-3 w-3 rounded-full bg-[#ff6a00] shadow-[0_0_10px_3px_rgba(255,106,0,0.55)]" />
                    )}
                  </span>
                  <h3 className="whitespace-pre-line">{s.title}</h3>
                  <Link to="/assessments" className="hk-link">
                    Learn More <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
        <Leaf className="hk-leaf-c" />
      </section>

      {/* ================= ABOUT ================= */}
      <section className="hk-section">
        <div className="hk-wrap">
          <div className="hk-about">
            <div className="hk-photo" data-reveal="left">
              <div className="hk-photo-frame">
                {/* Placeholder clinic photo — swap the src for your own image later. */}
                <img
                  src="https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80"
                  alt="HealingMonk physiotherapist treating a patient"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              </div>
              <div className="hk-trusted">
                <i><Users className="h-5 w-5" /></i>
                <span>
                  Trusted by
                  <b>5000+ Patients</b>
                </span>
              </div>
            </div>

            <div data-reveal="right">
              <span className="hk-pill-wrap">
                <span className="hk-pill">
                  <HeartPulse className="h-3.5 w-3.5" /> About HealingMonk
                </span>
              </span>
              <h2 className="hk-about-h">
                Your <span className="hk-orange">Health,</span>
                <br />
                Our <span className="hk-orange">Priority</span>
              </h2>
              <p className="copy">
                At HealingMonk, we combine advanced physiotherapy techniques with compassionate care to help you
                recover faster and live a healthier, happier life.
              </p>
              <ul className="hk-ticks">
                {['Expert & Experienced Therapists', 'Personalized Treatment Plans', 'Modern & Safe Facility'].map(
                  (t) => (
                    <li key={t}>
                      <i><Check className="h-3.5 w-3.5" strokeWidth={3} /></i>
                      {t}
                    </li>
                  ),
                )}
              </ul>
              <Link to="/about" className="hk-btn orange mt-7">
                Learn More <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="hk-stats-col" data-reveal="right">
              <StatCard icon={<Trophy className="h-9 w-9" />} value="15+" label="Years Experience" />
              <StatCard icon={<Users className="h-9 w-9" />} value="5000+" label="Happy Patients" />
              <StatCard icon={<Star className="h-9 w-9 fill-current" />} value="98%" label="Success Rate" />
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="hk-section pt-6">
        <div className="hk-wrap hk-center">
          <span className="hk-eyebrow center" data-reveal="fade">How It Works</span>
          <h2 className="hk-h2 mt-2" style={{ fontSize: 'clamp(22px, 2.4vw, 28px)' }} data-reveal="fade">
            From Camera to Clarity in <span className="hk-orange">Three Steps</span>
          </h2>

          <div className="hk-steps text-left">
            <Step n="01" icon={<Camera className="h-6 w-6" />} title="Selfie or Camera" desc="Take a quick photo or video with your phone." />
            <ArrowRight className="hk-step-arrow h-6 w-6" />
            <Step n="02" icon={<Cpu className="h-6 w-6" />} title="AI Analysis" desc="Our AI analyzes your posture and movement." />
            <ArrowRight className="hk-step-arrow h-6 w-6" />
            <Step n="03" icon={<FileText className="h-6 w-6" />} title="Get Your Report" desc="Receive instant insights and personalized tips." />
          </div>
        </div>
      </section>

      {/* ================= MODEL BANNER ================= */}
      <section className="pb-4">
        <div className="hk-wrap">
          <div className="hk-banner" data-reveal="zoom">
            <div>
              <small>
                <Zap className="h-3.5 w-3.5 text-[#f7931e]" /> The HealingMonk Model
              </small>
              <h2>
                Clinical-grade movement assessment, running entirely <span className="hk-orange">in the browser</span>
              </h2>
            </div>
            <span className="hk-banner-div" />
            <div className="hk-banner-stats">
              <BannerStat icon={<Timer className="h-9 w-9" />} value="33" label="Body landmarks tracked" />
              <BannerStat icon={<Target className="h-9 w-9" />} value="60ms" label="Response Time" />
              <BannerStat icon={<ShieldCheck className="h-9 w-9" />} value="100%" label="Privacy Focus" />
              <Runner />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrustItem({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="hk-trust-item">
      <span className="hk-trust-ico">{icon}</span>
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="hk-metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="hk-stat-card">
      <i>{icon}</i>
      <div>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="hk-step" data-reveal>
      <span className="hk-step-n">{n}</span>
      <span className="hk-step-ico">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function BannerStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="hk-bstat">
      <i>{icon}</i>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** Teal wave + soft glow behind the hero card (top-right of the page). */
function HeroWave() {
  return (
    <svg className="hk-hero-wave" viewBox="0 0 600 640" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hkWave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bfe6df" />
          <stop offset="0.55" stopColor="#5cb8aa" />
          <stop offset="1" stopColor="#0d6b6e" />
        </linearGradient>
        <linearGradient id="hkWave2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3f5f1" />
          <stop offset="1" stopColor="#c9ebe4" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d="M140 0H600V640H420C300 600 330 470 250 380C170 290 60 250 110 120C130 70 120 30 140 0Z" fill="url(#hkWave2)" />
      <path d="M260 0H600V420C520 360 470 300 420 220C370 140 300 90 260 0Z" fill="url(#hkWave)" opacity="0.9" />
    </svg>
  );
}

/** Glowing "AI skeleton" runner for the model banner. */
function Runner() {
  const pts: Record<string, [number, number]> = {
    head: [88, 22], neck: [84, 38], sh: [80, 44], el: [62, 58], wr: [50, 44],
    el2: [98, 62], wr2: [112, 52], hip: [72, 84], kn: [92, 104], an: [86, 134],
    kn2: [56, 104], an2: [36, 116], toe: [98, 136], toe2: [30, 106],
  };
  const bones: [string, string][] = [
    ['neck', 'sh'], ['sh', 'el'], ['el', 'wr'], ['sh', 'el2'], ['el2', 'wr2'], ['sh', 'hip'],
    ['hip', 'kn'], ['kn', 'an'], ['an', 'toe'], ['hip', 'kn2'], ['kn2', 'an2'], ['an2', 'toe2'],
  ];
  return (
    <svg className="hk-runner" viewBox="0 0 140 150" aria-hidden="true">
      <defs>
        <filter id="hkGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#hkGlow)" strokeLinecap="round">
        {bones.map(([a, b]) => (
          <line key={a + b} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="#7dd3fc" strokeWidth="7" opacity="0.55" />
        ))}
        {bones.map(([a, b]) => (
          <line key={'c' + a + b} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="#e0f2fe" strokeWidth="2" />
        ))}
        <circle cx={pts.head[0]} cy={pts.head[1]} r="10" fill="#38bdf8" opacity="0.7" />
        {['sh', 'el', 'el2', 'hip', 'kn', 'kn2', 'an', 'an2'].map((k) => (
          <circle key={k} cx={pts[k][0]} cy={pts[k][1]} r="3.6" fill="#ff8a00" />
        ))}
      </g>
    </svg>
  );
}
