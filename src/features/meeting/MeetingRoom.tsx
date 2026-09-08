import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Sparkles, Loader2, Wifi, WifiOff,
  Activity, ShieldCheck, AlertTriangle, MonitorUp, MessageSquare, Users, Maximize2, Minimize2,
  Send, Info, Copy, Check, Pin, PinOff, X,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import {
  getMeetingRoom, updateMeeting, endMeeting,
  MeetingRoomInfo, OnlineMeeting, Patient,
} from '@/services/api';
import { useMeetingPeer, PeerStatus, ChatMessage } from '@/features/meeting/useMeetingPeer';
import { useMeetingLobby } from '@/features/meeting/useMeetingLobby';
import MeetingPreJoin from '@/features/meeting/MeetingPreJoin';
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
  reconnecting: 'Reconnecting…',
  failed: 'Connection problem',
};

// Connection-quality pill shown in the header.
function connQuality(s: PeerStatus): { label: string; tone: string; ok: boolean } {
  switch (s) {
    case 'connected': return { label: 'Excellent', tone: 'text-emerald-400', ok: true };
    case 'waiting': return { label: 'Waiting', tone: 'text-amber-400', ok: false };
    case 'reconnecting': return { label: 'Reconnecting', tone: 'text-amber-400', ok: false };
    case 'failed': return { label: 'Poor', tone: 'text-red-400', ok: false };
    default: return { label: 'Connecting', tone: 'text-amber-400', ok: false };
  }
}

type AiStage = 'off' | 'select' | 'capture' | 'report';
type MainKey = 'remote' | 'self' | 'localScreen';
type SidePanel = 'chat' | 'people' | null;

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

  // Pre-join gate: nothing (media, knock, connection) happens until the user
  // explicitly joins from the pre-join screen.
  const [joined, setJoined] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joinCam, setJoinCam] = useState(false);
  const [joinMic, setJoinMic] = useState(false);

  // AI (staff only) overlay state machine.
  const [aiStage, setAiStage] = useState<AiStage>('off');
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<AssessmentCapture[]>([]);
  const [reportSaved, setReportSaved] = useState(false);
  // Patient-side banner, driven by the staff's app signal.
  const [patientAiActive, setPatientAiActive] = useState(false);

  // Meet-style UI state.
  const [side, setSide] = useState<SidePanel>(null);
  const [pin, setPin] = useState<MainKey | null>(null);
  const [messages, setMessages] = useState<(ChatMessage & { mine?: boolean })[]>([]);
  const [unread, setUnread] = useState(0);
  const [remoteSharing, setRemoteSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [draft, setDraft] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const statusPatched = useRef<string>('');
  // Read-through ref so the chat callback (fired from the poll loop) can tell
  // whether the chat panel is open without re-subscribing.
  const sideRef = useRef<SidePanel>(null);
  sideRef.current = side;

  // Resolve the room by its link token. Role is decided by the server. The
  // shared Atlas cluster can cold-start, so a first attempt may transiently
  // fail — retry a few times with backoff before showing an error.
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

  // Patient's display name (for the host's admit prompt / default pre-join name).
  const roomPatientName =
    room && typeof room.meeting === 'object'
      ? 'patientName' in room.meeting
        ? (room.meeting as any).patientName
        : typeof (room.meeting as any).patient === 'object'
        ? (room.meeting as any).patient.name
        : ''
      : '';

  // Waiting room: the patient must be admitted by the host before connecting.
  // The name the patient typed on the pre-join screen is what the host sees.
  const lobby = useMeetingLobby({
    token,
    role,
    patientName: joinName || roomPatientName,
    enabled: joined && joinable && !left,
  });

  // Media connects immediately for the host; for the patient only after admit.
  const peerEnabled = joined && joinable && !left && (role === 'staff' || lobby.admitted);

  const onChat = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    if (sideRef.current !== 'chat') setUnread((u) => u + 1);
  }, []);

  const peer = useMeetingPeer({
    token,
    role,
    iceServers: room?.iceServers ?? [],
    enabled: peerEnabled,
    initialMicOn: joinMic,
    initialCamOn: joinCam,
    onAppSignal: (d) => setPatientAiActive(!!d?.aiActive),
    onChat,
    onRemoteScreen: (sharing) => setRemoteSharing(sharing),
  });

  // Keep chat scrolled to the newest message.
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [messages, side]);

  // Clear the unread badge when the chat panel is opened.
  useEffect(() => { if (side === 'chat') setUnread(0); }, [side]);

  // Track fullscreen changes (incl. the user pressing Esc).
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Staff: reflect live connection into the stored meeting status (best-effort,
  // deduped). AI transitions are handled explicitly.
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

  // ---- Staff AI controls (unchanged behaviour) ----
  const startAi = async () => {
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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen().catch(() => {});
  };

  const selfName = role === 'staff' ? (user?.name || 'Host') : (joinName || 'You');
  const patientName = typeof room?.meeting === 'object' && 'patient' in (room?.meeting ?? {}) && typeof (room!.meeting as any).patient === 'object'
    ? (room!.meeting as any).patient.name
    : (room?.meeting as any)?.patientName || 'Patient';
  const remoteName = role === 'staff' ? patientName : 'Consultation host';

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const at = Date.now();
    peer.sendChat({ name: selfName, text, at });
    setMessages((prev) => [...prev, { from: role, name: selfName, text, at, mine: true }]);
    setDraft('');
  };

  const meetingLink = staffMeeting ? `${window.location.origin}/m/${staffMeeting.roomToken}` : '';
  const copyLink = async () => {
    if (!meetingLink) return;
    try { await navigator.clipboard.writeText(meetingLink); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
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
        action={<button onClick={() => { setLeft(false); setJoined(false); }} className="mt-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 font-semibold text-white">Rejoin</button>}
      />
    );
  }

  // Pre-join screen (both roles) — the entry point before any media/knock.
  if (!joined) {
    return (
      <MeetingPreJoin
        defaultName={role === 'staff' ? (user?.name || 'Host') : roomPatientName}
        role={role}
        meetingTitle={role === 'staff' ? `Consultation · ${patientName}` : 'HealingMonk Consultation'}
        onJoin={({ name, camOn, micOn }) => {
          setJoinName(name); setJoinCam(camOn); setJoinMic(micOn); setJoined(true);
        }}
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
        body={`Your request to join has been sent${joinName ? ` as ${joinName}` : ''}. Please keep this page open — the doctor will admit you shortly.`}
      />
    );
  }

  // ----- Tiles / main-stage resolution -----
  const tiles: { key: MainKey; stream: MediaStream | null; label: string; mirror: boolean; muted: boolean; on: boolean }[] = [];
  if (peer.sharingScreen && peer.screenStream) tiles.push({ key: 'localScreen', stream: peer.screenStream, label: 'Your screen', mirror: false, muted: true, on: true });
  if (peer.remoteStream) tiles.push({ key: 'remote', stream: peer.remoteStream, label: remoteSharing ? `${remoteName} · screen` : remoteName, mirror: false, muted: false, on: true });
  tiles.push({ key: 'self', stream: peer.localStream, label: `${selfName} (You)`, mirror: !peer.sharingScreen, muted: true, on: peer.camOn });

  const autoMain: MainKey = peer.sharingScreen ? 'localScreen' : remoteSharing && peer.remoteStream ? 'remote' : peer.remoteStream ? 'remote' : 'self';
  const mainKey: MainKey = (pin && tiles.some((t) => t.key === pin)) ? pin : autoMain;
  const mainTile = tiles.find((t) => t.key === mainKey) ?? tiles[0];
  const stripTiles = tiles.filter((t) => t.key !== mainTile.key);

  const q = connQuality(peer.status);

  return (
    <div ref={rootRef} className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-white/10 bg-slate-900/70 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex-shrink-0">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {role === 'staff' ? `Consultation · ${patientName}` : 'HealingMonk Consultation'}
            </p>
            <p className="text-[11px] flex items-center gap-1">
              {q.ok ? <Wifi className={`w-3 h-3 ${q.tone}`} /> : <WifiOff className={`w-3 h-3 ${q.tone}`} />}
              <span className={q.tone}>{q.label}</span>
              <span className="text-slate-500">· {STATUS_LABEL[peer.status]}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aiStage !== 'off' && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-3 py-1">
              <Sparkles className="w-3.5 h-3.5" /> AI assessment active
            </span>
          )}
          <button onClick={() => setShowInfo((v) => !v)} title="Meeting information" className="rounded-full w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10">
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meeting info popover */}
      {showInfo && (
        <div className="absolute top-14 right-3 z-50 w-[92%] max-w-sm rounded-xl bg-slate-800 border border-white/10 shadow-2xl p-4 text-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">Meeting information</p>
            <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <dl className="space-y-1.5 text-slate-300">
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Participant</dt><dd className="truncate">{role === 'staff' ? patientName : selfName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Started</dt><dd>{new Date().toLocaleTimeString()}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Status</dt><dd className="capitalize">{peer.status}</dd></div>
          </dl>
          {role === 'staff' && meetingLink && (
            <div className="mt-3">
              <p className="text-xs text-slate-400 mb-1">Invite link</p>
              <div className="flex items-center gap-2">
                <input readOnly value={meetingLink} onFocus={(e) => e.currentTarget.select()} className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono outline-none" />
                <button onClick={copyLink} className="rounded-lg border border-white/15 hover:bg-white/10 px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Host: incoming join requests (admit / deny). */}
      {role === 'staff' && lobby.requests.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md space-y-2">
          {lobby.requests.map((r) => (
            <div key={r.reqId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/95 border border-white/10 shadow-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm truncate"><span className="font-semibold">{r.name}</span><span className="text-slate-400"> wants to join</span></p>
                <p className="text-[11px] text-slate-500">{new Date(r.at).toLocaleTimeString()}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => lobby.deny(r.reqId)} className="rounded-lg border border-white/15 hover:bg-white/10 text-slate-200 text-sm font-semibold px-3 py-1.5">Deny</button>
                <button onClick={() => lobby.admit(r.reqId)} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1.5">Admit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Body: stage + optional side panel */}
      <div className="flex-1 min-h-0 flex">
        {/* Video stage */}
        <div className="relative flex-1 min-w-0">
          {/* Main tile */}
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            {mainTile?.stream && mainTile.on ? (
              <StreamVideo stream={mainTile.stream} muted={mainTile.muted} mirror={mainTile.mirror} className="w-full h-full object-contain" />
            ) : mainTile?.stream && !mainTile.on ? (
              <TileFallback label={mainTile.label} />
            ) : (
              <div className="text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-400" />
                <p className="text-sm">{peer.error || STATUS_LABEL[peer.status]}</p>
                {role === 'staff' && <p className="text-xs text-slate-500 mt-1">Share the link so the patient can join.</p>}
              </div>
            )}
            {/* Main tile label + pin control */}
            {mainTile && (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="rounded-md bg-black/50 px-2 py-1 text-xs font-medium">{mainTile.label}</span>
                {pin === mainTile.key && (
                  <button onClick={() => setPin(null)} title="Unpin" className="rounded-md bg-black/50 hover:bg-black/70 px-2 py-1 text-xs inline-flex items-center gap-1">
                    <PinOff className="w-3 h-3" /> Unpin
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Thumbnail strip (other participants / your screen / self) */}
          {stripTiles.length > 0 && (
            <div className="absolute bottom-3 right-3 flex flex-col gap-2 z-10">
              {stripTiles.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPin(t.key)}
                  title={`Pin ${t.label}`}
                  className="group relative w-32 sm:w-44 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-slate-800"
                >
                  {t.stream && t.on ? (
                    <StreamVideo stream={t.stream} muted={t.muted} mirror={t.mirror} className="w-full h-full object-cover" />
                  ) : (
                    <TileFallback label={t.label} small />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] truncate max-w-[90%]">{t.label}</span>
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/30 flex items-center justify-center transition-opacity">
                    <Pin className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Patient-side banner while the doctor runs the AI assessment */}
          {role === 'patient' && patientAiActive && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-[92%] rounded-full bg-emerald-600/90 px-4 py-2 text-sm font-semibold shadow-lg flex items-center gap-2 z-20">
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

        {/* Side panel: chat or participants */}
        {side && (
          <div className="w-full sm:w-80 max-w-[85%] sm:max-w-none absolute sm:relative inset-y-0 right-0 z-30 bg-slate-900 border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-semibold">{side === 'chat' ? 'In-meeting chat' : 'Participants'}</p>
              <button onClick={() => setSide(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {side === 'chat' ? (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center mt-6">No messages yet. Say hello 👋</p>
                  ) : messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                      <span className="text-[11px] text-slate-400">{m.name} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`mt-0.5 rounded-2xl px-3 py-2 text-sm max-w-[90%] break-words ${m.mine ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-100'}`}>{m.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="p-3 border-t border-white/10 flex items-center gap-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message" className="flex-1 rounded-full bg-slate-800 border border-white/10 px-4 py-2 text-sm outline-none focus:border-emerald-500" />
                  <button type="submit" disabled={!draft.trim()} className="rounded-full w-10 h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700"><Send className="w-4 h-4" /></button>
                </form>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {tiles.map((t) => (
                  <div key={t.key} className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">{t.label.charAt(0).toUpperCase()}</span>
                      <span className="text-sm truncate">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                      {t.key === 'self' ? (peer.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-red-400" />) : null}
                      {t.on ? <VideoIcon className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-red-400" />}
                      <button onClick={() => setPin(t.key)} title="Pin" className="hover:text-white"><Pin className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 border-t border-white/10 bg-slate-900/80 backdrop-blur flex-wrap">
        <CtrlButton on={peer.micOn} onClick={peer.toggleMic} onIcon={<Mic className="w-5 h-5" />} offIcon={<MicOff className="w-5 h-5" />} label="Mic" />
        <CtrlButton on={peer.camOn} onClick={peer.toggleCam} onIcon={<VideoIcon className="w-5 h-5" />} offIcon={<VideoOff className="w-5 h-5" />} label="Camera" />
        <CtrlButton on={peer.sharingScreen} activeTone onClick={peer.toggleScreenShare} onIcon={<MonitorUp className="w-5 h-5" />} offIcon={<MonitorUp className="w-5 h-5" />} label="Share screen" />
        <CtrlButton
          on={side === 'chat'} activeTone
          onClick={() => setSide((s) => (s === 'chat' ? null : 'chat'))}
          onIcon={<span className="relative"><MessageSquare className="w-5 h-5" />{unread > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread}</span>}</span>}
          offIcon={<span className="relative"><MessageSquare className="w-5 h-5" />{unread > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread}</span>}</span>}
          label="Chat"
        />
        <CtrlButton on={side === 'people'} activeTone onClick={() => setSide((s) => (s === 'people' ? null : 'people'))} onIcon={<Users className="w-5 h-5" />} offIcon={<Users className="w-5 h-5" />} label="Participants" />
        <CtrlButton on={isFullscreen} activeTone onClick={toggleFullscreen} onIcon={<Minimize2 className="w-5 h-5" />} offIcon={<Maximize2 className="w-5 h-5" />} label="Fullscreen" />

        {role === 'staff' && aiStage === 'off' && (
          <button
            onClick={startAi}
            disabled={!peer.remoteStream}
            title={peer.remoteStream ? 'Start AI assessment on the patient camera' : 'Waiting for the patient to join'}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed px-4 sm:px-5 py-3 font-semibold text-white shadow-lg"
          >
            <Sparkles className="w-5 h-5" /> <span className="hidden sm:inline">Start AI</span>
          </button>
        )}
        {role === 'staff' && aiStage !== 'off' && aiStage !== 'report' && (
          <button onClick={stopAi} className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg">
            <VideoIcon className="w-5 h-5" /> <span className="hidden sm:inline">Stop AI</span>
          </button>
        )}

        {role === 'staff' ? (
          <button onClick={handleEnd} className="inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg">
            <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">End</span>
          </button>
        ) : (
          <button onClick={handleLeave} className="inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-4 sm:px-5 py-3 font-semibold text-white shadow-lg">
            <PhoneOff className="w-5 h-5" /> <span className="hidden sm:inline">Leave</span>
          </button>
        )}
      </div>
    </div>
  );
}

function TileFallback({ label, small }: { label: string; small?: boolean }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400 gap-2">
      <div className={`rounded-full bg-slate-700 flex items-center justify-center font-semibold ${small ? 'h-8 w-8 text-sm' : 'h-16 w-16 text-2xl'}`}>
        {label.charAt(0).toUpperCase()}
      </div>
      {!small && <VideoOff className="w-5 h-5" />}
    </div>
  );
}

function CtrlButton({
  on, onClick, onIcon, offIcon, label, activeTone,
}: { on: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string; activeTone?: boolean }) {
  // Media buttons (mic/cam): red when OFF. Panel/tool buttons (activeTone): green
  // when ON, neutral otherwise.
  const cls = activeTone
    ? on ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
    : on ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white';
  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex items-center justify-center rounded-full w-11 h-11 sm:w-12 sm:h-12 shadow-lg transition-colors ${cls}`}
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
