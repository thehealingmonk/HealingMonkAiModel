import { lazy, Suspense, useEffect, useState, ReactElement } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import MarketingLayout from '@/components/layout/MarketingLayout';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import type { PatientInfo } from '@/lib/clinicalKnowledge';
import type { StoredReport } from '@/services/report.service';
import {
  createStoredReport,
  getStoredReport,
  updateStoredReport,
  fetchStoredReport,
} from '@/services/report.service';
import { isSubscribed } from '@/services/subscription.service';

// Route components are lazy-loaded so each screen ships in its own chunk. In
// particular the capture/report screens (which pull in MediaPipe and jsPDF)
// download only when the user actually reaches them — the marketing site and
// intake stay lightweight.
const Home = lazy(() => import('@/features/marketing/Home'));
const Technology = lazy(() => import('@/features/marketing/Technology'));
const Assessments = lazy(() => import('@/features/marketing/Assessments'));
const HowItWorks = lazy(() => import('@/features/marketing/HowItWorks'));
const About = lazy(() => import('@/features/marketing/About'));
const Pricing = lazy(() => import('@/features/marketing/Pricing'));
const PatientIntake = lazy(() => import('@/features/assessment/PatientIntake'));
const PositionSelect = lazy(() => import('@/features/assessment/PositionSelect'));
const ClinicalCapture = lazy(() => import('@/features/assessment/ClinicalCapture'));
const ClinicalReport = lazy(() => import('@/features/assessment/ClinicalReport'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6faf8]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
    </div>
  );
}

// The AI assessment is a paid feature: guests without an active subscription are
// sent to the pricing page. Once subscribed (verified Razorpay payment stored
// locally), the flow runs normally.
function RequireSubscription({ children }: { children: ReactElement }) {
  if (!isSubscribed()) return <Navigate to="/pricing" replace />;
  return children;
}

// Loads a saved report by its URL id and renders it (doctor-editable). The
// report is fetched from the local cache first, then the server — so the URL
// opens on any browser or device. Doctor edits persist back to both.
function ReportRoute({ onRestart }: { onRestart: () => void }) {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<StoredReport | null>(null);
  // 'loading' until we know whether the report exists anywhere.
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!id) {
      setStatus('missing');
      return;
    }
    let active = true;
    setStatus('loading');
    fetchStoredReport(id).then((r) => {
      if (!active) return;
      setReport(r);
      setStatus(r ? 'ready' : 'missing');
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (status === 'loading') return <RouteFallback />;
  if (!id || !report) return <Navigate to="/assessment" replace />;

  return (
    <ClinicalReport
      patient={report.patient}
      captures={report.captures}
      extraShots={report.extraShots}
      onRestart={onRestart}
      doctorMode
      shareUrl={window.location.href}
      doctorData={report.findingData}
      onDoctorDataChange={(assessmentId, data) => {
        const current = getStoredReport(id);
        updateStoredReport(id, {
          findingData: { ...(current?.findingData ?? {}), [assessmentId]: data },
        });
      }}
      notesSection={
        <DoctorNotesSection
          reportId={id}
          initialNotes={report.doctorNotes}
          initialPoints={report.doctorPoints}
        />
      }
    />
  );
}

// Overall doctor notes + key points for the report. Edits are persisted to the
// stored report (localStorage) so they survive a refresh and reopen later. The
// per-posture scores persist the same way.
function DoctorNotesSection({
  reportId,
  initialNotes,
  initialPoints,
}: {
  reportId: string;
  initialNotes: string;
  initialPoints: string[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [points, setPoints] = useState<string[]>(initialPoints);
  const [draft, setDraft] = useState('');

  const saveNotes = (v: string) => {
    setNotes(v);
    updateStoredReport(reportId, { doctorNotes: v });
  };
  const savePoints = (next: string[]) => {
    setPoints(next);
    updateStoredReport(reportId, { doctorPoints: next });
  };

  const addPoint = () => {
    const p = draft.trim();
    if (!p) return;
    savePoints([...points, p]);
    setDraft('');
  };

  return (
    <section className="mt-8 border-t border-gray-200 pt-5">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="w-4 h-4 text-blue-700" />
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Doctor Notes &amp; Key Points</h2>
        <span className="ml-auto text-[10px] text-blue-500 font-medium print:hidden">To be filled by the doctor</span>
      </div>

      {/* Overall clinical notes */}
      <label className="block text-xs text-gray-600 mb-1">Clinical notes</label>
      <textarea
        value={notes}
        onChange={(e) => saveNotes(e.target.value)}
        placeholder="Add clinical notes, observations, and prescribed plan for this patient…"
        className="w-full min-h-[100px] border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />

      {/* Key points list */}
      <label className="block text-xs text-gray-600 mt-4 mb-1">Key points</label>
      {points.length > 0 && (
        <ul className="list-disc pl-5 mb-2 space-y-1">
          {points.map((p, i) => (
            <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
              <span className="flex-1">{p}</span>
              <button
                type="button"
                onClick={() => savePoints(points.filter((_, idx) => idx !== i))}
                className="text-xs text-red-500 hover:text-red-700 print:hidden"
                aria-label="Remove point"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 print:hidden">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addPoint();
            }
          }}
          placeholder="Add a key point and press Enter…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <button
          type="button"
          onClick={addPoint}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
        >
          Add point
        </button>
      </div>
    </section>
  );
}

// The public (guest) experience with real URLs. Marketing pages share the nav +
// footer via MarketingLayout; the assessment flow is a focused, chrome-less flow.
// Flow state is held here; a hard refresh mid-flow returns the user to the start.
export default function PublicApp() {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);

  const restart = () => {
    setPatient(null);
    setAssessmentIds([]);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#f6faf8]">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Marketing site — shares the nav bar + footer */}
          <Route element={<MarketingLayout />}>
            <Route index element={<Home />} />
            <Route path="technology" element={<Technology />} />
            <Route path="assessments" element={<Assessments />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="about" element={<About />} />
            <Route path="pricing" element={<Pricing />} />
          </Route>

          {/* Focused assessment flow */}
          <Route
            path="assessment"
            element={
              <RequireSubscription>
                <PatientIntake
                  initial={patient}
                  onNext={(info) => {
                    setPatient(info);
                    navigate('/assessment/positions');
                  }}
                />
              </RequireSubscription>
            }
          />

          <Route
            path="assessment/positions"
            element={
              <RequireSubscription>
                <PositionSelect
                  initial={assessmentIds}
                  onBack={() => navigate('/assessment')}
                  onStart={(ids) => {
                    setAssessmentIds(ids);
                    navigate('/assessment/capture');
                  }}
                />
              </RequireSubscription>
            }
          />

          <Route
            path="assessment/capture"
            element={
              !isSubscribed() ? (
                <Navigate to="/pricing" replace />
              ) : assessmentIds.length > 0 ? (
                <ClinicalCapture
                  assessments={CLINICAL_ASSESSMENTS.filter((a) => assessmentIds.includes(a.id))}
                  onBack={() => navigate('/assessment/positions')}
                  onComplete={(caps, extras) => {
                    if (!patient) {
                      navigate('/assessment');
                      return;
                    }
                    // Persist the report and open it at its own permanent,
                    // name-based, no-auth URL (/r/:slug) — revisitable anytime,
                    // on any device.
                    const id = createStoredReport({ patient, captures: caps, extraShots: extras });
                    navigate(`/r/${id}`);
                  }}
                />
              ) : (
                <Navigate to="/assessment" replace />
              )
            }
          />

          {/* Each generated report lives at its own permanent, name-based,
              NO-AUTH URL. `/r/:slug` is the short shareable form used by both
              the guest flow and the doctor/admin panels; `/assessment/report/:id`
              is kept as a back-compat alias. */}
          <Route path="r/:id" element={<ReportRoute onRestart={restart} />} />
          <Route path="assessment/report/:id" element={<ReportRoute onRestart={restart} />} />
          {/* Legacy/bare report URL — nothing to show without an id. */}
          <Route path="assessment/report" element={<Navigate to="/assessment" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
