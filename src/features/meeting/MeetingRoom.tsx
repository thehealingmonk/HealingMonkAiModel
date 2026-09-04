import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Sparkles, Loader2, Wifi, WifiOff,
  Activity, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import {
  getMeetingRoom, updateMeeting, endMeeting,
  MeetingRoomInfo, OnlineMeeting, Patient,
} from '@/services/api';
import { useMeetingPeer, PeerStatus } from '@/features/meeting/useMeetingPeer';
import { useMeetingLobby } from '@/features/meeting/useMeetingLobby';
import { CLINICAL_ASSESSMENTS, AssessmentCapture } from '@/lib/clinicalKnowledge';
import { listIdealPostures } from '@/services/api';
import PositionSelect from '@/features/assessment/PositionSelect';
import ClinicalCapture from '@/features/assessment/ClinicalCapture';
import DoctorReportView from '@/features/doctor/DoctorReportView';

// Attaches a MediaStream to a <video> without re-rendering when the stream is
// the same object (avoids flicker on state updates).
function StreamVideo({
  stream, muted, mirror, className,
}: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}

const STATUS_LABEL: Record<PeerStatus, string> = {
  idle: 'Starting…',
  connecting: 'Connecting…',
  waiting: 'Waiting for the other participant…',
  connected: 'Connected',
  failed: 'Connection problem',
};

type AiStage = 'off' | 'select' | 'capture' | 'report';

export default function MeetingRoom() {
  const { token = '' } = useParams();
  const [searchParams] = useSearchParams();
  // Only the dashboard "Join Meeting" action requests the host (staff) view.
  const wantsHost = searchParams.get('host') === '1';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState<MeetingRoomInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [left, setLeft] = useState(false);

  // AI (staff only) overlay state machine.
  const [aiStage, setAiStage] = useState<AiStage>('off');
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<AssessmentCapture[]>([]);
  const [reportSaved, setReportSaved] = useState(false);
  // Patient-side banner, driven by the staff's app signal.
  const [patientAiActive, setPatientAiActive] = useState(false);

  const statusPatched = useRef<string>('');

  // Resolve the room by its link token. Role is decided by the server. The
  // shared Atlas cluster can cold-start, so a first attempt may transiently
  // fail — retry a few times with backoff before showing an error, so the
  // patient's link "just works" instead of flashing a 500.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const delays = [0, 700, 1500, 2500];
      let lastErr: unknown;
      for (const wait of delays) {
        if (cancelled) return;
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          const r = await getMeetingRoom(token, wantsHost);
          if (!cancelled) setRoom(r);
          return;
        } catch (err) {
          lastErr = err;
          // Don't retry a genuine "not found" — the link is wrong/deleted.
          if (err instanceof Error && /not found/i.test(err.message)) break;
        }
      }
      if (!cancelled) {
        setLoadError(lastErr instanceof Error ? lastErr.message : 'Could not open meeting');
      }
    })();
    return () => { cancelled = true; };
  }, [token, wantsHost]);

  const role = room?.role ?? 'patient';
  const meetingStatus = room?.meeting.status;
  const joinable = !!room && meetingStatus !== 'ended' && meetingStatus !== 'expired';
  const staffMeeting = role === 'staff' ? (room?.meeting as OnlineMeeting) : null;
  const meetingId = staffMeeting?.id;

  // Patient's display name (for the host's admit prompt).
  const roomPatientName =
    room && typeof room.meeting === 'object'
      ? 'patientName' in room.meeting
        ? (room.meeting as any).patientName
        : typeof (room.meeting as any).patient === 'object'
        ? (room.meeting as any).patient.name
        : ''
      : '';

  // Waiting room: the patient must be admitted by the host before connecting;
  // the host sees and admits/denies incoming requests.
  const lobby = useMeetingLobby({
    token,
    role,
    patientName: roomPatientName,
    enabled: joinable && !left,
  });

  // Media connects immediately for the host; for the patient only after admit.
  const peerEnabled = joinable && !left && (role === 'staff' || lobby.admitted);

  const peer = useMeetingPeer({
    token,
    role,
    iceServers: room?.iceServers ?? [],
    enabled: peerEnabled,
    onAppSignal: (d) => setPatientAiActive(!!d?.aiActive),
  });

  // Staff: reflect live connection into the stored meeting status (best-effort,
  // deduped so we don't spam the API). AI transitions are handled explicitly.
  useEffect(() => {
    if (role !== 'staff' || !meetingId) return;
    if (aiStage !== 'off') return;
    const target = peer.status === 'connected' ? 'active' : peer.status === 'waiting' ? 'waiting' : '';
    if (target && statusPatched.current !== target) {
      statusPatched.current = target;
      updateMeeting(meetingId, { status: target as any }).catch(() => {});
    }
  }, [role, meetingId, peer.status, aiStage]);

  // Build a Patient record from the staff meeting payload for the report flow.
  const patientForReport: Patient | null =
    staffMeeting && typeof staffMeeting.patient === 'object'
      ? ({ ...staffMeeting.patient, assignedDoctor: staffMeeting.assignedDoctor, createdAt: staffMeeting.createdAt } as Patient)
      : null;

  const backToDashboard = useCallback(() => {
    const pid = patientForReport?.id;
    if (user?.role === 'admin' && pid) navigate(`/admin/patient/${pid}`);
    else if (user?.role === 'doctor' && pid) navigate(`/doctor/patient/${pid}`);
    else navigate('/');
  }, [user, patientForReport, navigate]);

  // ---- Staff AI controls ----
  const startAi = async () => {
    // Pre-select the default full-body poses plus any the doctor curated for
    // this patient's pain areas (mirrors the in-clinic flow).
    const preset = new Set(CLINICAL_ASSESSMENTS.filter((a) => a.defaultSelected).map((a) => a.id));
    if (patientForReport?.painAreas?.length) {
      try {
        const { sets } = await listIdealPostures(patientForReport.painAreas);
        for (const s of sets) for (const id of s.poses ?? []) preset.add(id);
      } catch { /* fall back to defaults */ }
    }
    setAssessmentIds(CLINICAL_ASSESSMENTS.filter((a) => preset.has(a.id)).map((a) => a.id));
    setAiStage('select');
  };

  const beginCapture = (ids: string[]) => {
    setAssessmentIds(ids);
    setCaptures([]);
    setReportSaved(false);
    setAiStage('capture');
    if (meetingId) updateMeeting(meetingId, { status: 'ai_active', selectedPositions: ids }).catch(() => {});
    peer.sendApp({ aiActive: true });
  };

  const stopAi = () => {
    setAiStage('off');
    statusPatched.current = '';
    if (meetingId) updateMeeting(meetingId, { status: 'active' }).catch(() => {});
    peer.sendApp({ aiActive: false });
  };

  const onCaptureComplete = (caps: AssessmentCapture[]) => {
    setCaptures(caps);
    setAiStage('report');
  };

  const onReportSaved = (info: { reportId: string; shareId: string }) => {
    setReportSaved(true);
    if (meetingId) updateMeeting(meetingId, { reportId: info.reportId, shareId: info.shareId }).catch(() => {});
  };

  const closeReport = () => {
    // Return to the live consultation — generating a report does NOT end the call.
    setAiStage('off');
    statusPatched.current = '';
    peer.sendApp({ aiActive: false });
    if (meetingId) updateMeeting(meetingId, { status: 'active' }).catch(() => {});
  };

  const handleEnd = async () => {
    if (meetingId) { try { await endMeeting(meetingId); } catch { /* ignore */ } }
    backToDashboard();
  };

  const handleLeave = () => {
    setLeft(true);
    if (role === 'staff') backToDashboard();
  };

  // ---- Render guards ----
  if (loadError) {
    return <CenterCard icon={<AlertTriangle className="w-8 h-8 text-amber-400" />} title="Can't open this meeting" body={loadError} />;
  }
  if (!room) {
    return <CenterCard icon={<Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />} title="Opening meeting…" />;
  }
  if (!joinable) {
    return (
      <CenterCard
        icon={<ShieldCheck className="w-8 h-8 text-slate-400" />}
        title={meetingStatus === 'expired' ? 'This meeting link has expired' : 'This meeting has ended'}
        body="Please contact the clinic if you need a new link."
      />
    );
  }
  if (left && role === 'patient') {
    return (
      <CenterCard
        icon={<PhoneOff className="w-8 h-8 text-slate-400" />}
        title="You left the meeting"
        body="You can rejoin using the same link."
        action={<button onClick={() => { setLeft(false); window.location.reload(); }} className="mt-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 font-semibold text-white">Rejoin</button>}
      />
    );
  }
  if (role === 'patient' && lobby.denied) {
    return (
      <CenterCard
        icon={<ShieldCheck className="w-8 h-8 text-red-400" />}
        title="The host declined your request"
        body="Please contact the clinic if you believe this is a mistake."
      />
    );
  }
  // Patient waiting room — knock sent, waiting for the host to admit.
  if (role === 'patient' && !lobby.admitted) {
    return (
      <CenterCard
        icon={<Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />}
        title="Waiting for the host to let you in…"
        body={`Your request to join has been sent${roomPatientName ? ` as ${roomPatientName}` : ''}. Please keep this page open — the doctor will admit you shortly.`}
      />
    );
  }

  const patientName = typeof room.meeting === 'object' && 'patient' in room.meeting && typeof (room.meeting as any).patient === 'object'
    ? (room.meeting as any).patient.name
    : (room.meeting as any).patientName || 'Patient';

  // Who is the "main" (large) tile: the OTHER person's camera.
  const mainStream = peer.remoteStream;
  const selfStream = peer.localStream;
  const remoteReady = !!peer.remoteStream;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-900/70 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {role === 'staff' ? `Consultation · ${patientName}` : 'HealingMonk Consultation'}
            </p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              {peer.status === 'connected' ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
              {STATUS_LABEL[peer.status]}
            </p>
          </div>
        </div>
        {aiStage !== 'off' && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-3 py-1">
            <Sparkles className="w-3.5 h-3.5" /> AI assessment active
          </span>
        )}
      </div>

      {/* Host: incoming join requests (admit / deny). */}
      {role === 'staff' && lobby.requests.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md space-y-2">
          {lobby.requests.map((r) => (
            <div key={r.reqId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/95 border border-white/10 shadow-xl px-4 py-3">
              <p className="text-sm min-w-0 truncate">
                <span className="font-semibold">{r.name}</span>
                <span className="text-slate-400"> wants to join</span>
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => lobby.deny(r.reqId)}
                  className="rounded-lg border border-white/15 hover:bg-white/10 text-slate-200 text-sm font-semibold px-3 py-1.5"
                >
                  Deny
                </button>
                <button
                  onClick={() => lobby.admit(r.reqId)}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1.5"
                >
                  Admit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video stage */}
      <div className="relative flex-1 min-h-0">
        {/* Main (other participant) */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {mainStream ? (
            <StreamVideo stream={mainStream} className="w-full h-full object-contain" />
          ) : (
            <div className="text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-400" />
              <p className="text-sm">{peer.error || STATUS_LABEL[peer.status]}</p>
              {role === 'staff' && (
                <p className="text-xs text-slate-500 mt-1">Share the link so the patient can join.</p>
              )}
            </div>
          )}
        </div>

        {/* Self PiP */}
        <div className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-slate-800">
          {selfStream ? (
            <StreamVideo stream={selfStream} muted mirror className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">Your camera</div>
          )}
          {!peer.camOn && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
              <VideoOff className="w-5 h-5 text-slate-400" />
            </div>
          )}
        </div>

        {/* Patient-side banner while the doctor runs the AI assessment */}
        {role === 'patient' && patientAiActive && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-[92%] rounded-full bg-emerald-600/90 px-4 py-2 text-sm font-semibold shadow-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Assessment in progress — please follow the doctor's instructions.
          </div>
        )}

        {/* ===== AI overlays (staff only) — layered ON TOP of the live call so
             the WebRTC connection persists underneath and Stop AI returns to
             normal video. ===== */}
        {role === 'staff' && aiStage === 'select' && (
          <div className="absolute inset-0 z-30 bg-slate-950 overflow-auto">
            <PositionSelect initial={assessmentIds} onBack={stopAi} onStart={beginCapture} />
          </div>
        )}
        {role === 'staff' && aiStage === 'capture' && patientForReport && (
          <div className="absolute inset-0 z-30">
            <ClinicalCapture
              embedded
              externalStream={peer.remoteStream}
              assessments={CLINICAL_ASSESSMENTS.filter((a) => assessmentIds.includes(a.id))}
              onBack={stopAi}
              onComplete={onCaptureComplete}
            />
          </div>
        )}
        {role === 'staff' && aiStage === 'report' && patientForReport && (
          <div className="absolute inset-0 z-30 bg-white overflow-auto">
            <DoctorReportView patient={patientForReport} captures={captures} onSaved={onReportSaved} onDone={closeReport} />
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 border-t border-white/10 bg-slate-900/80 backdrop-blur">
        <CtrlButton on={peer.micOn} onClick={peer.toggleMic} onIcon={<Mic className="w-5 h-5" />} offIcon={<MicOff className="w-5 h-5" />} label="Mic" />
        <CtrlButton on={peer.camOn} onClick={peer.toggleCam} onIcon={<VideoIcon className="w-5 h-5" />} offIcon={<VideoOff className="w-5 h-5" />} label="Camera" />

        {role === 'staff' && aiStage === 'off' && (
          <button
            onClick={startAi}
            disabled={!remoteReady}
            title={remoteReady ? 'Start AI assessment on the patient camera' : 'Waiting for the patient to join'}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed px-4 sm:px-5 py-3 font-semibold text-white shadow-lg"
          >
            <Sparkles className="w-5 h-5" /> <span className="hidden sm:inline">Start AI</span>
          </button>
        )}
        {role === 'staff' && aiStage !== 'off' && aiStage !== 'report' && (
          <button
            onClick={stopAi}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg"
          >
            <VideoIcon className="w-5 h-5" /> <span className="hidden sm:inline">Stop AI</span>
          </button>
        )}

        {role === 'staff' ? (
          <button
            onClick={handleEnd}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg"
          >
            <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">End</span>
          </button>
        ) : (
          <button
            onClick={handleLeave}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg"
          >
            <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">Leave</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CtrlButton({
  on, onClick, onIcon, offIcon, label,
}: { on: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={`${on ? 'Turn off' : 'Turn on'} ${label.toLowerCase()}`}
      className={`inline-flex items-center justify-center rounded-full w-12 h-12 shadow-lg transition-colors ${
        on ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      {on ? onIcon : offIcon}
    </button>
  );
}

function CenterCard({
  icon, title, body, action,
}: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">{icon}</div>
        <h1 className="text-lg font-bold">{title}</h1>
        {body && <p className="text-sm text-slate-400 mt-2">{body}</p>}
        {action}
      </div>
    </div>
  );
}
