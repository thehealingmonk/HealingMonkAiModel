import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Sparkles,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Lock,
  Building2,
  Zap,
  BadgeCheck,
} from 'lucide-react';
import { PLANS } from '@/lib/plans';
import {
  createSubscriptionOrder,
  verifySubscription,
  setSubscription,
  isSubscribed,
} from '@/services/subscription.service';

// Loads the Razorpay Checkout script once, resolving when window.Razorpay exists.
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const FAQ = [
  {
    q: 'How does the AI assessment work?',
    a: 'You stand in front of your camera and our AI tracks 33 body landmarks in real time to measure your posture, mobility and stability — then generates a clinical-style report with a personalized program.',
  },
  {
    q: 'Is my video or data uploaded anywhere?',
    a: 'No. The pose analysis runs entirely on-device in your browser. Your camera feed never leaves your computer — only the final report is saved so you can revisit it.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Your plan simply runs for the period you paid for and then stops. There is no auto-charge — you renew only when you choose to.',
  },
  {
    q: 'Do you offer plans for clinics?',
    a: 'Yes. Clinics get a full dashboard for doctors and reception, patient records, and report management. Contact us to set up a clinic account.',
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const alreadySubscribed = isSubscribed();

  const subscribe = async (planId: string) => {
    setError(null);
    setBusyPlan(planId);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment window. Check your connection and try again.');

      const order = await createSubscriptionOrder(planId);

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'HealingMonk',
          description: `${order.planName} — AI assessment access`,
          order_id: order.orderId,
          theme: { color: '#10b981' },
          handler: async (resp: any) => {
            try {
              const result = await verifySubscription({
                subscriptionId: order.subscriptionId,
                razorpayOrderId: resp.razorpay_order_id,
                razorpayPaymentId: resp.razorpay_payment_id,
                razorpaySignature: resp.razorpay_signature,
              });
              setSubscription({ plan: result.plan, expiresAt: result.expiresAt });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        });
        rzp.on('payment.failed', (r: any) =>
          reject(new Error(r?.error?.description || 'Payment failed'))
        );
        rzp.open();
      });

      // Verified & stored — unlock and head into the assessment.
      navigate('/assessment');
    } catch (e: any) {
      if (e?.message !== 'Payment cancelled') {
        setError(e?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      {/* Hero */}
      <section className="text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
          Unlock the full AI assessment
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Simple pricing for{' '}
          <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
            clinical-grade insight
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-slate-500 sm:text-lg">
          Subscribe to run unlimited AI posture &amp; movement assessments, get full reports, and follow
          personalized programs. One flat price — no hidden fees.
        </p>

        {/* Trust row */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Secured by Razorpay
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-emerald-500" /> On-device &amp; private
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="h-4 w-4 text-emerald-500" /> No auto-renewal
          </span>
        </div>
      </section>

      {alreadySubscribed && (
        <div className="mx-auto mt-10 flex max-w-xl flex-col items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row">
          <p className="text-sm font-medium text-emerald-800">✓ Your subscription is active.</p>
          <button
            onClick={() => navigate('/assessment')}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            Start assessment
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Plans */}
      <section className="mt-14 grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm transition-shadow hover:shadow-lg ${
              plan.featured ? 'border-emerald-300 shadow-md ring-1 ring-emerald-200' : 'border-slate-200'
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-semibold text-white shadow">
                Most popular
              </span>
            )}
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.featured && <Zap className="h-4 w-4 text-emerald-500" />}
            </div>
            <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
            <div className="mt-5 flex items-end gap-1">
              <span className="text-4xl font-bold tracking-tight">₹{plan.priceINR.toLocaleString('en-IN')}</span>
              <span className="mb-1 text-sm text-slate-500">/ {plan.durationDays} days</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              ≈ ₹{Math.round(plan.priceINR / (plan.durationDays / 30)).toLocaleString('en-IN')} per month
            </p>
            <ul className="mt-6 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => subscribe(plan.id)}
              disabled={busyPlan !== null}
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 ${
                plan.featured
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-slate-900 text-white'
              }`}
            >
              {busyPlan === plan.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening secure checkout…
                </>
              ) : (
                <>
                  Subscribe
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        ))}
      </section>

      <p className="mx-auto mt-6 text-center text-xs text-slate-400">
        Payments are processed securely by Razorpay. Your subscription unlocks the assessment on this device.
      </p>

      {/* For clinics */}
      <section className="mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm">
        <div className="grid gap-8 p-8 sm:p-12 md:grid-cols-2 md:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Building2 className="h-3.5 w-3.5" /> For clinics &amp; practitioners
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Run HealingMonk inside your clinic</h2>
            <p className="mt-3 text-slate-300">
              Get a full clinic dashboard — doctor and reception logins, patient records, assessment history,
              editable clinical reports, appointments and payments. Perfect for physiotherapists, chiropractors
              and wellness centers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-transform hover:scale-[1.03]"
              >
                Clinic sign in
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="mailto:healingmonk.wellness@gmail.com?subject=Clinic%20account%20request"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Request a clinic account
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['Doctor & reception logins', 'Patient records', 'Editable reports', 'Appointments & payments'].map(
              (f) => (
                <div key={f} className="flex items-center gap-2 rounded-xl bg-white/5 p-4 text-sm font-medium">
                  <Check className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                  {f}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
        <div className="mx-auto mt-8 max-w-2xl divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {FAQ.map((item, i) => (
            <div key={item.q}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <span className="font-medium text-slate-900">{item.q}</span>
                <span className={`text-emerald-500 transition-transform ${openFaq === i ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {openFaq === i && <p className="px-6 pb-5 text-sm text-slate-500">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
