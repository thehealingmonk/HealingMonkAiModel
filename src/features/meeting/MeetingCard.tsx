import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Copy, Check, ExternalLink, Plus, Loader2, PhoneOff, FileText, Radio, Mail, Clock,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import {
  Patient, OnlineMeeting, MeetingStatus,
  listMeetings, createMeeting, endMeeting, sendMeetingEmail,
} from '@/services/api';

// Online-meeting panel shown on a patient's profile. S-Admin can create a
// meeting; the assigned doctor sees the same meeting automatically (no second
// creation). Both can copy the secure link (to share via WhatsApp/SMS/email) and
// join. The patient opens the very same link from anywhere.

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
  created: 'Created', waiting: 'Waiting', active: 'Live', ai_active: 'AI assessment live',
  completed: 'Report ready', ended: 'Ended', expired: 'Expired',
};

const isLiveStatus = (s: MeetingStatus) => s !== 'ended' && s !== 'expired';

export default function MeetingCard({ patient }: { patient: Patient }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<OnlineMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // Optional schedule + email-on-create controls (admin).
  const [scheduleAt, setScheduleAt] = useState('');
  const [emailOnCreate, setEmailOnCreate] = useState(true);
  // Per-meeting "email link" feedback, keyed by meeting id.
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const load = async () => {
    try {
      const { meetings } = await listMeetings(patient.id);
      setMeetings(meetings);
    } catch {
      /* non-critical panel */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id]);

  // The shared/copied link is the PATIENT link — no host flag — so whoever opens
  // it (WhatsApp/email/etc.) joins as the patient, even in a staff browser.
  const linkFor = (token: string) => `${window.location.origin}/m/${token}`;

  const create = async () => {
    setError('');
    setCreating(true);
    try {
      // datetime-local is wall-clock without a zone; send as ISO so the server
      // stores an absolute instant.
      const scheduledAt = scheduleAt ? new Date(scheduleAt).toISOString() : null;
      const { meeting } = await createMeeting(patient.id, { scheduledAt, sendEmail: emailOnCreate });
      setMeetings((prev) => [meeting, ...prev]);
      setScheduleAt('');
      if (emailOnCreate) {
        setEmailNote({
          id: meeting.id,
          ok: !!meeting.inviteSentAt,
          msg: meeting.inviteSentAt
            ? `Invite emailed to ${patient.name}`
            : 'Meeting created — no email on file for this patient.',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create meeting');
    } finally {
      setCreating(false);
    }
  };

  const emailLink = async (id: string) => {
    setEmailingId(id);
    setEmailNote(null);
    try {
      const { to } = await sendMeetingEmail(id);
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, inviteSentAt: new Date().toISOString() } : m)));
      setEmailNote({ id, ok: true, msg: `Link emailed to ${to}` });
    } catch (err) {
      setEmailNote({ id, ok: false, msg: err instanceof Error ? err.message : 'Could not send email' });
    } finally {
      setEmailingId(null);
    }
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
    } catch { /* clipboard blocked — link is still visible to copy manually */ }
  };

  const end = async (id: string) => {
    try {
      const { meeting } = await endMeeting(id);
      setMeetings((prev) => prev.map((m) => (m.id === id ? meeting : m)));
    } catch { /* ignore */ }
  };

  // Admin and doctor can both create meetings (multiple per patient allowed — a
  // fresh room per session). A doctor's meeting binds to them automatically.
  const canCreate = isAdmin || hasRole('doctor');

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">Online Meeting</h3>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {canCreate
          ? 'Create a secure video room and send the patient the link by email (with the time). You and the patient join the same link; start the AI assessment live from inside.'
          : 'Join the video room created for this patient, then start the AI assessment live.'}
      </p>

      {/* Schedule + create (admin). Set a time and email the invite in one step. */}
      {canCreate && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-gray-600 mb-1">Meeting time (optional)</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2.5">
              <input
                type="checkbox"
                checked={emailOnCreate}
                onChange={(e) => setEmailOnCreate(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              Email the patient the link
            </label>
            <button
              onClick={create}
              disabled={creating}
              className="ml-auto inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Meeting
            </button>
          </div>
          {!patient.email && emailOnCreate && (
            <p className="text-[11px] text-amber-600 mt-2">
              This patient has no email on file — the link won't be emailed. Add an email on their profile first.
            </p>
          )}
        </div>
      )}

      {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="py-6 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : meetings.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-center text-gray-500 text-sm">
          {isAdmin ? 'No online meeting yet. Create one to get a shareable link.' : 'No online meeting has been created for this patient yet.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((m) => {
            const live = isLiveStatus(m.status);
            return (
              <li key={m.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[m.status]}`}>
                    {(m.status === 'active' || m.status === 'ai_active') && <Radio className="w-3 h-3 animate-pulse" />}
                    {STATUS_LABEL[m.status]}
                  </span>
                  <span className="text-[11px] text-gray-400">{new Date(m.createdAt).toLocaleString()}</span>
                </div>

                {m.scheduledAt && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(m.scheduledAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </div>
                )}

                {live && (
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={linkFor(m.roomToken)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 font-mono outline-none"
                    />
                    <button
                      onClick={() => copy(m.roomToken)}
                      className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold py-2 px-3 rounded-lg"
                    >
                      {copiedToken === m.roomToken ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      {copiedToken === m.roomToken ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {live && (
                    <button
                      onClick={() => navigate(`/m/${m.roomToken}?host=1`)}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 px-4 rounded-lg"
                    >
                      <Video className="w-4 h-4" /> Join Meeting
                    </button>
                  )}
                  {live && canCreate && (
                    <button
                      onClick={() => emailLink(m.id)}
                      disabled={emailingId === m.id}
                      title="Email this link to the patient"
                      className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold py-2 px-3 rounded-lg"
                    >
                      {emailingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {m.inviteSentAt ? 'Resend email' : 'Email link'}
                    </button>
                  )}
                  {m.shareId && (
                    <button
                      onClick={() => window.open(`/r/${m.shareId}`, '_blank', 'noopener')}
                      className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold py-2 px-3 rounded-lg"
                    >
                      <FileText className="w-4 h-4" /> View report <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {live && (
                    <button
                      onClick={() => end(m.id)}
                      className="inline-flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold py-2 px-3 rounded-lg"
                    >
                      <PhoneOff className="w-4 h-4" /> End
                    </button>
                  )}
                </div>
                {emailNote?.id === m.id && (
                  <p className={`text-[11px] mt-2 ${emailNote.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                    {emailNote.msg}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
