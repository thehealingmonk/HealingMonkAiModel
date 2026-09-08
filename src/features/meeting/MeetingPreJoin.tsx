import { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Activity, Loader2, AlertTriangle,
} from 'lucide-react';

// Google-Meet-style pre-join screen. The user lands here FIRST (no camera/mic
// acquired, no waiting-room knock) until they explicitly click "Join meeting".
//
//   • Name is prefilled (from the patient record for the guest link) but stays
//     editable — it's what the host sees in the admit prompt.
//   • Camera and microphone are OFF by default; the user opts in, and a live
//     preview appears only once the camera is enabled.
//   • A denied permission or missing device is surfaced gently and never blocks
//     joining — you can still join to view/listen.
//
// This component owns ONLY a short-lived preview stream; it stops it on join /
// unmount. The real meeting media is (re)acquired by useMeetingPeer with the
// choices returned here, so there is exactly one owner of the live call media.

interface Props {
  defaultName: string;
  role: 'staff' | 'patient';
  meetingTitle: string;
  onJoin: (opts: { name: string; camOn: boolean; micOn: boolean }) => void;
}

export default function MeetingPreJoin({ defaultName, role, meetingTitle, onJoin }: Props) {
  const [name, setName] = useState(defaultName || '');
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [permError, setPermError] = useState('');
  const [starting, setStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const disposed = useRef(false);

  useEffect(() => { setName(defaultName || ''); }, [defaultName]);

  // Reconcile the preview stream to the desired {camOn, micOn}. Kept in one
  // effect so toggling either device (re)acquires exactly what's needed and
  // releases the camera the moment it's turned off.
  useEffect(() => {
    disposed.current = false;
    let cancelled = false;

    const stopPreview = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      if (!camOn && !micOn) { stopPreview(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: camOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
          audio: micOn,
        });
        if (cancelled || disposed.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        stopPreview();
        streamRef.current = stream;
        if (videoRef.current && camOn) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setPermError('');
      } catch (err) {
        console.warn('pre-join getUserMedia failed', err);
        if (!cancelled) {
          setPermError(
            'We couldn\'t access your camera/microphone. Check the browser permission (the padlock in the address bar). You can still join to view and listen.'
          );
          // Reflect the failure so the toggles don't show "on" with no preview.
          if (camOn) setCamOn(false);
          if (micOn) setMicOn(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [camOn, micOn]);

  useEffect(() => () => {
    disposed.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const join = () => {
    if (starting) return;
    setStarting(true);
    // Release the preview stream — useMeetingPeer re-acquires with these choices.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onJoin({ name: name.trim() || defaultName || (role === 'staff' ? 'Host' : 'Patient'), camOn, micOn });
  };

  const canJoin = role === 'staff' || name.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-center">
        {/* Preview */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl">
          {camOn ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3">
              <VideoOff className="w-10 h-10" />
              <p className="text-sm">Camera is off</p>
            </div>
          )}

          {/* Device toggles overlaid on the preview, Meet-style */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <button
              onClick={() => setMicOn((v) => !v)}
              title={micOn ? 'Turn off microphone' : 'Turn on microphone'}
              className={`inline-flex items-center justify-center rounded-full w-12 h-12 shadow-lg transition-colors ${
                micOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setCamOn((v) => !v)}
              title={camOn ? 'Turn off camera' : 'Turn on camera'}
              className={`inline-flex items-center justify-center rounded-full w-12 h-12 shadow-lg transition-colors ${
                camOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Join panel */}
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold">HealingMonk</span>
          </div>

          <h1 className="text-2xl font-bold">Ready to join?</h1>
          <p className="text-sm text-slate-400 mt-1 truncate">{meetingTitle}</p>

          <label className="block mt-6 text-left">
            <span className="text-xs font-semibold text-slate-400">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
          </label>

          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 justify-center md:justify-start">
            <span className="inline-flex items-center gap-1.5">
              {micOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5" />} Mic {micOn ? 'on' : 'off'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {camOn ? <VideoIcon className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5" />} Camera {camOn ? 'on' : 'off'}
            </span>
          </div>

          {permError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs px-3 py-2 text-left">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{permError}</span>
            </div>
          )}

          <button
            onClick={join}
            disabled={!canJoin || starting}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed px-6 py-3.5 font-semibold text-white shadow-lg"
          >
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {role === 'staff' ? 'Join as host' : 'Join meeting'}
          </button>
          {!canJoin && (
            <p className="text-[11px] text-slate-500 mt-2">Enter your name to continue.</p>
          )}
        </div>
      </div>
    </div>
  );
}
