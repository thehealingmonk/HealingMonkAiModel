import { useEffect, useRef, useState } from 'react';
import { Save, Check, AlertCircle, Link2, Copy } from 'lucide-react';
import ClinicalReport from '@/features/assessment/ClinicalReport';
import { PatientInfo, AssessmentCapture } from '@/lib/clinicalKnowledge';
import { Patient, createReport, updateReportNotes, listIdealPostures, IdealPostureSet } from '@/services/api';
import { buildReportPayload } from '@/lib/reportBuilder';
import { createStoredReport } from '@/services/report.service';

interface Props {
  patient: Patient;
  captures: AssessmentCapture[];
  onDone: () => void;
}

// Maps a DB patient onto the PatientInfo shape ClinicalReport renders.
function toPatientInfo(p: Patient): PatientInfo {
  return {
    name: p.name,
    age: p.age != null ? String(p.age) : '',
    gender: p.gender,
    phone: p.mobile,
    email: p.email,
    height: p.height != null ? String(p.height) : '',
    weight: p.weight != null ? String(p.weight) : '',
    painAreas: p.painAreas,
    complaint: p.complaint,
  };
}

export default function DoctorReportView({ patient, captures, onDone }: Props) {
  const [reportId, setReportId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesStatus, setNotesStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [idealPostures, setIdealPostures] = useState<IdealPostureSet[]>([]);
  const created = useRef(false);

  // Persist the report once when the view mounts. Two things are saved:
  //  1. The full VISUAL report (pose images + findings) to the public store,
  //     which yields a name-based, no-auth slug and a shareable `/r/:slug` URL.
  //  2. The structured record (for dashboards / patient timeline), linked to
  //     that same slug via `shareId` so admins can open the public report.
  useEffect(() => {
    if (created.current) return;
    created.current = true;
    (async () => {
      // Auto-populate the doctor's curated ideal reference postures for this
      // patient's pain areas. Non-fatal: the report still generates without them.
      let presets: IdealPostureSet[] = [];
      try {
        if (patient.painAreas.length > 0) {
          const { sets } = await listIdealPostures(patient.painAreas);
          presets = sets.filter((s) => s.images.length > 0);
        }
      } catch {
        /* library unavailable — continue without reference images */
      }
      setIdealPostures(presets);

      // Bake the reference images into the shareable report so /r/:slug shows them too.
      const slug = createStoredReport({
        patient: toPatientInfo(patient),
        captures,
        extraShots: [],
        idealPostures: presets,
      });
      setShareUrl(`${window.location.origin}/r/${slug}`);
      try {
        const payload = { ...buildReportPayload(patient.id, captures, patient.painAreas), shareId: slug };
        const { report } = await createReport(payload);
        setReportId(report.id);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save report to the patient record');
      }
    })();
  }, [patient, captures]);

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the link is still visible to copy manually */
    }
  };

  const handleSaveNotes = async () => {
    if (!reportId) return;
    setNotesStatus('saving');
    try {
      await updateReportNotes(reportId, notes);
      setNotesStatus('saved');
      setTimeout(() => setNotesStatus('idle'), 2000);
    } catch {
      setNotesStatus('idle');
      setSaveError('Could not save notes');
    }
  };

  const notesSection = (
    <section className="mt-8 border-t border-gray-200 pt-5 print:hidden">
      {/* Shareable, no-auth public report link (name-based URL). */}
      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-emerald-700" />
          <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
            Shareable report link (no login needed)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Generating link…"
            className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono outline-none"
          />
          <button
            onClick={copyShareUrl}
            disabled={!shareUrl}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-emerald-700/80 mt-1.5">
          Anyone with this link can open this patient's report anytime — no sign-in required.
        </p>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Doctor Notes</h2>
        {reportId ? (
          <span className="text-xs text-green-600 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Report saved to {patient.patientId}
          </span>
        ) : saveError ? (
          <span className="text-xs text-red-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {saveError}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Saving report…</span>
        )}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add clinical notes, observations, and prescribed plan for this patient…"
        className="w-full min-h-[100px] border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSaveNotes}
          disabled={!reportId || notesStatus === 'saving'}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          {notesStatus === 'saving' ? (
            'Saving…'
          ) : notesStatus === 'saved' ? (
            <>
              <Check className="w-4 h-4" /> Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save notes
            </>
          )}
        </button>
      </div>
    </section>
  );

  return (
    <ClinicalReport
      patient={toPatientInfo(patient)}
      captures={captures}
      onRestart={onDone}
      restartLabel="Done"
      shareUrl={shareUrl || undefined}
      notesSection={notesSection}
      idealPostures={idealPostures}
      doctorMode
    />
  );
}
