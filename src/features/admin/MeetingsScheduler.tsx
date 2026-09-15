import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock, Search, Plus, Trash2, Loader2, Mail, Copy, Check, Video,
  FileText, ExternalLink, Clock, Users, Radio,
} from 'lucide-react';
import {
  Patient, OnlineMeeting, MeetingStatus,
  listPatients, listMeetings, createMeetingsBulk, sendMeetingEmail, BulkMeetingRow,
} from '@/services/api';

// Admin "Schedule Meetings": create online-consultation links for many patients
// at once — each with its own date & time — and email every patient their link
// in one action. Below the builder, all meetings are listed schedule-wise (by
// time) with per-meeting copy / email / view-report shortcuts.

const STATUS_STYLE: Record<MeetingStatus, string> = {
  created: 'bg-slate-100 text-slate-600',
  waiting: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700',
  ai_active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  ended: 'bg-gray-200 text-gray-600',
  expired: 'bg-gray-200 text-gray-500',
};
const STATUS_LABEL: Record<MeetingStatus, string> = {
  created: 'Created', waiting: 'Waiting', active: 'Live', ai_active: 'AI live',
  completed: 'Report ready', ended: 'Ended', expired: 'Expired',
};

// One editable row in the builder.
interface Row {
  patient: Patient;
  scheduleAt: string; // datetime-local value
  sendEmail: boolean;
}

function patientLabel(p: OnlineMeeting['patient']): string {
  return p && typeof p === 'object' ? p.name : '—';
}
function doctorLabel(m: OnlineMeeting): string | null {
  return m.assignedDoctor && typeof m.assignedDoctor === 'object' ? m.assignedDoctor.name : null;
}

export default function MeetingsScheduler() {
  const navigate = useNavigate();

  // ── Patient picker ──────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Builder rows ────────────────────────────────────────────────
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  // ── Existing meetings list ──────────────────────────────────────
  const [meetings, setMeetings] = useState<OnlineMeeting[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const loadMeetings = async () => {
    setLoadingList(true);
    try {
      const { meetings } = await listMeetings();
      setMeetings(meetings);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);

  // Debounced patient search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const { patients } = await listPatients({ q, scope: 'all' });
        setResults(patients.slice(0, 8));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const addRow = (p: Patient) => {
    setRows((prev) => (prev.some((r) => r.patient.id === p.id) ? prev : [...prev, { patient: p, scheduleAt: '', sendEmail: true }]));
    setQuery('');
    setResults([]);
  };
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.patient.id !== id));
  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.patient.id === id ? { ...r, ...patch } : r)));

  const link = (token: string) => `${window.location.origin}/m/${token}`;

  const submit = async () => {
    if (rows.length === 0) return;
    setError('');
    setSummary(null);
    setSubmitting(true);
    try {
      const payload: BulkMeetingRow[] = rows.map((r) => ({
        patientId: r.patient.id,
        scheduledAt: r.scheduleAt ? new Date(r.scheduleAt).toISOString() : null,
        sendEmail: r.sendEmail,
      }));
      const { meetings: created, failed } = await createMeetingsBulk(payload);
      setSummary({ ok: created.length, failed: failed.length });
      setRows([]);
      loadMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create meetings');
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async (m: OnlineMeeting) => {
    try {
      await navigator.clipboard.writeText(link(m.roomToken));
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const email = async (m: OnlineMeeting) => {
    setEmailingId(m.id);
    setNote(null);
    try {
      const { to } = await sendMeetingEmail(m.id);
      setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, inviteSentAt: new Date().toISOString() } : x)));
      setNote({ id: m.id, ok: true, msg: `Link emailed to ${to}` });
    } catch (err) {
      setNote({ id: m.id, ok: false, msg: err instanceof Error ? err.message : 'Could not send email' });
    } finally {
      setEmailingId(null);
    }
  };

  // Sort meetings schedule-wise: those with a planned time first (soonest first),
  // then unscheduled ones by creation time.
  const sorted = useMemo(() => {
    return [...meetings].sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [meetings]);

  const emailableCount = rows.filter((r) => r.sendEmail && r.patient.email).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-emerald-600" /> Schedule Meetings
        </h2>
        <p className="text-gray-500 text-sm">
          Create online-consultation links for one or many patients, set each time, and email the links directly.
        </p>
      </div>

      {/* ── Builder ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
        {/* Patient search */}
        <label className="block text-sm font-medium text-gray-700 mb-1">Add patients</label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients by name, code or mobile…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {(results.length > 0 || searching) && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {searching && <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addRow(p)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between gap-2"
                >
                  <span className="text-sm text-gray-800">
                    {p.name} <span className="font-mono text-[11px] text-gray-400">{p.patientId}</span>
                  </span>
                  <span className="text-[11px] text-gray-400">{p.email || 'no email'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="mt-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-center text-gray-500 text-sm">
            <Users className="w-6 h-6 mx-auto mb-1 text-gray-400" />
            Search and add patients above to schedule their meetings.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {rows.map((r) => (
              <div key={r.patient.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-[9rem] flex-1">
                  <p className="text-sm font-medium text-gray-900">{r.patient.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {r.patient.email || <span className="text-amber-600">no email on file</span>}
                  </p>
                </div>
                <input
                  type="datetime-local"
                  value={r.scheduleAt}
                  onChange={(e) => patchRow(r.patient.id, { scheduleAt: e.target.value })}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={r.sendEmail}
                    onChange={(e) => patchRow(r.patient.id, { sendEmail: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                    disabled={!r.patient.email}
                  />
                  Email link
                </label>
                <button
                  onClick={() => removeRow(r.patient.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-md"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
        {summary && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2">
            <Check className="w-4 h-4" />
            {summary.ok} meeting{summary.ok === 1 ? '' : 's'} created
            {summary.failed > 0 && <span className="text-amber-700">· {summary.failed} failed</span>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">
              {rows.length} patient{rows.length === 1 ? '' : 's'} · {emailableCount} will be emailed
            </span>
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create {rows.length} meeting{rows.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>

      {/* ── All meetings (schedule-wise) ─────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">All meetings</h3>
        <span className="text-xs text-gray-400">{meetings.length}</span>
      </div>

      {loadingList ? (
        <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
          No meetings yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => {
            const live = m.status !== 'ended' && m.status !== 'expired';
            const doctor = doctorLabel(m);
            return (
              <li key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[10rem]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{patientLabel(m.patient)}</p>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[m.status]}`}>
                        {(m.status === 'active' || m.status === 'ai_active') && <Radio className="w-3 h-3 animate-pulse" />}
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      {m.scheduledAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(m.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      ) : (
                        <span className="text-gray-400">No time set</span>
                      )}
                      {doctor && <span>· Dr. {doctor}</span>}
                      {m.inviteSentAt && <span className="text-emerald-600 inline-flex items-center gap-1"><Check className="w-3 h-3" /> emailed</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {live && (
                      <button
                        onClick={() => copy(m)}
                        className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-1.5 px-2.5 rounded-lg"
                      >
                        {copiedId === m.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </button>
                    )}
                    {live && (
                      <button
                        onClick={() => email(m)}
                        disabled={emailingId === m.id}
                        className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-semibold py-1.5 px-2.5 rounded-lg"
                      >
                        {emailingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        {m.inviteSentAt ? 'Resend' : 'Email'}
                      </button>
                    )}
                    {live && (
                      <button
                        onClick={() => navigate(`/m/${m.roomToken}?host=1`)}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-2.5 rounded-lg"
                      >
                        <Video className="w-3.5 h-3.5" /> Join
                      </button>
                    )}
                    {m.shareId && (
                      <button
                        onClick={() => window.open(`/r/${m.shareId}`, '_blank', 'noopener')}
                        className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-1.5 px-2.5 rounded-lg"
                      >
                        <FileText className="w-3.5 h-3.5" /> Report <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {note?.id === m.id && (
                  <p className={`text-[11px] mt-2 ${note.ok ? 'text-emerald-700' : 'text-red-600'}`}>{note.msg}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
