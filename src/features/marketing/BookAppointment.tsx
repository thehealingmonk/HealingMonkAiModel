import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  Video,
} from 'lucide-react';
import { bookPublic } from '@/services/api';

/**
 * Public online booking (/book). Anyone can request an in-clinic visit or an
 * online video consultation. The request lands in the admin console
 * (Appointments → "Online bookings"), where staff assign a doctor and, for video
 * visits, start the meeting — the patient gets the secure link by email.
 * Styles: .hk-book-* in src/styles/healingmonk-site.css.
 */

type Mode = 'clinic' | 'video';

const PAIN_AREAS = [
  'Neck',
  'Shoulder',
  'Upper back',
  'Lower back',
  'Hip',
  'Knee',
  'Ankle / Foot',
  'Elbow / Wrist',
  'Posture',
  'Sports injury',
];

// 30-minute slots, 9:00 AM – 7:30 PM (clinic time, IST).
const SLOTS: string[] = [];
for (let h = 9; h < 20; h++) for (const m of [0, 30]) SLOTS.push(`${String(h).padStart(2, '0')}:${m ? '30' : '00'}`);

const slotLabel = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Today's date in IST as YYYY-MM-DD (the clinic's calendar day). */
function istToday(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** ISO instant for a clinic-local (IST) date + time slot. */
const toInstant = (date: string, slot: string) => new Date(`${date}T${slot}:00+05:30`);

const PHONE_RE = /^[+\d][\d\s-]{6,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BookAppointment() {
  const [mode, setMode] = useState<Mode>('clinic');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'' | 'Male' | 'Female' | 'Other'>('');
  const [date, setDate] = useState(istToday(1));
  const [slot, setSlot] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [complaint, setComplaint] = useState('');
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ when: Date; mode: Mode } | null>(null);

  const minDate = istToday(0);
  const maxDate = istToday(60);

  // A slot is bookable if it's at least 30 minutes from now.
  const slotOpen = useMemo(() => {
    const cutoff = Date.now() + 30 * 60_000;
    return (s: string) => toInstant(date, s).getTime() > cutoff;
  }, [date]);

  const toggleArea = (a: string) =>
    setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const m = mobile.trim();
    const em = email.trim();
    if (name.trim().length < 2) return setError('Please enter your full name.');
    if (!PHONE_RE.test(m)) return setError('Please enter a valid mobile number.');
    if (mode === 'video' && !em) return setError('An email is required for a video consultation — the meeting link is sent there.');
    if (em && !EMAIL_RE.test(em)) return setError('Please enter a valid email address.');
    if (!date || date < minDate || date > maxDate) return setError('Please pick a date within the next 60 days.');
    if (!slot) return setError('Please choose a time slot.');
    if (!slotOpen(slot)) return setError('That time has passed — please choose a later slot.');
    if (!consent) return setError('Please accept the consent to continue.');

    const when = toInstant(date, slot);
    const ageNum = Number(age);
    setSubmitting(true);
    try {
      await bookPublic({
        name: name.trim(),
        mobile: m,
        email: em || undefined,
        age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : undefined,
        gender,
        mode,
        painAreas: areas,
        complaint: complaint.trim(),
        preferredAt: when.toISOString(),
      });
      setDone({ when, mode });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const whenText = done.when.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    });
    return (
      <section className="hk-section hk-book-page">
        <div className="hk-wrap">
          <div className="hk-book-done hm-page-enter">
            <span className="hk-book-done-ico">
              <CheckCircle2 className="h-10 w-10" />
            </span>
            <h1 className="hk-h2">Booking request received!</h1>
            <p className="hk-sub">
              Thank you, {name.trim().split(' ')[0]}. We&apos;ve received your request for{' '}
              <b>{done.mode === 'video' ? 'an online video consultation' : 'an in-clinic visit'}</b> on{' '}
              <b>{whenText}</b>.
            </p>
            <ol className="hk-book-next">
              <li>
                <i>1</i> Our team reviews your request and assigns the right physiotherapist.
              </li>
              <li>
                <i>2</i>{' '}
                {done.mode === 'video'
                  ? 'You receive a secure video-meeting link by email — no app needed, it opens in your browser.'
                  : 'We call you to confirm the time, and you visit the clinic.'}
              </li>
              <li>
                <i>3</i> Your physiotherapist assesses you and shares your personalised plan.
              </li>
            </ol>
            <div className="hk-cta" style={{ justifyContent: 'center' }}>
              <Link to="/" className="hk-btn outline">
                Back to home
              </Link>
              <Link to="/ergo" className="hk-btn orange">
                <Sparkles className="h-4 w-4" /> Try the free AI demo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hk-section hk-book-page">
      <div className="hk-wrap">
        <div className="hk-center" data-reveal="fade">
          <span className="hk-eyebrow center">Book Appointment</span>
          <h1 className="hk-h2 mt-3">
            Book your <span className="hk-orange">physiotherapy</span> session
          </h1>
          <p className="hk-sub">Visit the clinic or meet your physiotherapist online — pick a time that suits you.</p>
        </div>

        <div className="hk-book-grid">
          <form className="hk-book-card" onSubmit={submit} noValidate>
            {/* Visit type */}
            <fieldset>
              <legend className="hk-book-label">1. Choose visit type</legend>
              <div className="hk-book-modes" role="radiogroup" aria-label="Visit type">
                <ModeCard
                  active={mode === 'clinic'}
                  onClick={() => setMode('clinic')}
                  icon={<Building2 className="h-6 w-6" />}
                  title="In-clinic visit"
                  desc="Hands-on assessment & treatment at the clinic"
                />
                <ModeCard
                  active={mode === 'video'}
                  onClick={() => setMode('video')}
                  icon={<Video className="h-6 w-6" />}
                  title="Online video consultation"
                  desc="Meet your physiotherapist from home — link by email"
                />
              </div>
            </fieldset>

            {/* Contact */}
            <fieldset>
              <legend className="hk-book-label">2. Your details</legend>
              <div className="hk-book-fields">
                <Field label="Full name" required icon={<User className="h-4 w-4" />}>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={120} required />
                </Field>
                <Field label="Mobile number" required icon={<Phone className="h-4 w-4" />}>
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    required
                  />
                </Field>
                <Field label={mode === 'video' ? 'Email (meeting link is sent here)' : 'Email'} required={mode === 'video'} icon={<Mail className="h-4 w-4" />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={254}
                  />
                </Field>
                <div className="hk-book-two">
                  <Field label="Age">
                    <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Age" inputMode="numeric" />
                  </Field>
                  <Field label="Gender">
                    <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                      <option value="">Select</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </Field>
                </div>
              </div>
            </fieldset>

            {/* Date + time */}
            <fieldset>
              <legend className="hk-book-label">3. Pick date &amp; time</legend>
              <Field label="Date" required icon={<CalendarDays className="h-4 w-4" />}>
                <input
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot('');
                  }}
                  required
                />
              </Field>
              <div className="hk-book-slots" role="radiogroup" aria-label="Time slot">
                {SLOTS.map((s) => {
                  const open = slotOpen(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={slot === s}
                      disabled={!open}
                      className={`hk-slot${slot === s ? ' on' : ''}`}
                      onClick={() => setSlot(s)}
                    >
                      {slotLabel(s)}
                    </button>
                  );
                })}
              </div>
              <p className="hk-book-hint">
                <Clock className="h-3.5 w-3.5" /> Times are in IST. Our team confirms the final time with you.
              </p>
            </fieldset>

            {/* Concern */}
            <fieldset>
              <legend className="hk-book-label">4. What do you need help with?</legend>
              <div className="hk-book-chips">
                {PAIN_AREAS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={areas.includes(a)}
                    className={`hk-chip${areas.includes(a) ? ' on' : ''}`}
                    onClick={() => toggleArea(a)}
                  >
                    {areas.includes(a) && <Check className="h-3.5 w-3.5" />} {a}
                  </button>
                ))}
              </div>
              <Field label="Describe your problem (optional)">
                <textarea
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. Lower back pain for 2 weeks, worse after sitting long hours"
                />
              </Field>
            </fieldset>

            <label className="hk-book-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I agree to be contacted by HealingMonk about this appointment.
            </label>

            {error && (
              <div className="hk-book-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="hk-btn orange lg hk-book-submit" disabled={submitting}>
              {submitting ? (
                'Booking…'
              ) : (
                <>
                  <CalendarDays className="h-5 w-5" /> Confirm booking request <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <aside className="hk-book-side">
            <div className="hk-book-info">
              <h3>How it works</h3>
              <ul>
                <li>
                  <i><CalendarDays className="h-4 w-4" /></i>
                  <span><b>Request a slot</b> Choose clinic or video and a time that suits you.</span>
                </li>
                <li>
                  <i><Stethoscope className="h-4 w-4" /></i>
                  <span><b>We assign your physio</b> The right specialist for your concern.</span>
                </li>
                <li>
                  <i><Video className="h-4 w-4" /></i>
                  <span><b>Visit or join online</b> Video link arrives by email — opens in the browser.</span>
                </li>
              </ul>
            </div>
            <div className="hk-book-trust">
              <ShieldCheck className="h-5 w-5" />
              <span>Your details are private and only used to arrange your appointment.</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={active} className={`hk-mode${active ? ' on' : ''}`} onClick={onClick}>
      <span className="hk-mode-ico">{icon}</span>
      <span>
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      <span className="hk-mode-tick">{active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
    </button>
  );
}

function Field({
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={`hk-field${icon ? ' has-ico' : ''}`}>
      <span>
        {label}
        {required && <em> *</em>}
      </span>
      <div>
        {icon && <i>{icon}</i>}
        {children}
      </div>
    </label>
  );
}
