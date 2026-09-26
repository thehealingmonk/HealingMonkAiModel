import { useEffect, useRef, useState } from 'react';
import {
  Camera, ChevronLeft, CheckCircle2, RotateCcw, SwitchCamera, ArrowRight,
} from 'lucide-react';
import { openCamera } from '@/lib/camera';
import { initializePoseLandmarker, detectPose, Landmark } from '@/lib/poseDetection';
import { extractErgoAngles } from '@/lib/ergo/landmarksToAngles';
import { ErgoCaptures, ErgoCapturedFrame } from './ergoTypes';

interface Props {
  /** Which views to capture. Side is always required; front adds coronal
   *  quantities (side-bend, abduction). */
  onComplete: (captures: ErgoCaptures) => void;
  onBack: () => void;
}

// The two views ErgoAI reads. Side (sagittal) drives the flexion-based scores;
// front (coronal) enriches them with side-bend / abduction and is optional.
const VIEWS: { id: 'side' | 'front'; label: string; instruction: string; required: boolean }[] = [
  {
    id: 'side',
    label: 'Side view',
    instruction: 'Stand/sit sideways to the camera so your whole profile is visible.',
    required: true,
  },
  {
    id: 'front',
    label: 'Front view (optional)',
    instruction: 'Face the camera square-on so both shoulders and hips are visible.',
    required: false,
  },
];

// Skeleton connections (MediaPipe Pose indices) — the whole-body joints the
// ergonomic standards care about.
const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24], [7, 8], [0, 11], [0, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

const DRAW_POINTS = new Set<number>([
  0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28,
]);

export default function ErgoCapture({ onComplete, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const loopGen = useRef(0);
  const disposed = useRef(false);
  const usingRvfc = useRef(false);
  const lastVideoTime = useRef(-1);
  const latestLandmarks = useRef<Landmark[] | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [status, setStatus] = useState('Loading pose model...');
  const [bodyDetected, setBodyDetected] = useState(false);
  const [flash, setFlash] = useState(false);
  const [captures, setCaptures] = useState<ErgoCaptures>({ side: null, front: null });

  const current = VIEWS[index];
  const currentRef = useRef(current);
  currentRef.current = current;

  const startStream = async (mode: 'user' | 'environment') => {
    const video = videoRef.current;
    if (!video) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await openCamera(mode);
    streamRef.current = stream;
    video.srcObject = stream;
    const begin = async () => {
      try {
        await video.play();
      } catch {
        /* autoplay may already be running */
      }
      setReady(true);
      setStatus('Tracking...');
      cancelFrame();
      lastVideoTime.current = -1;
      const gen = ++loopGen.current;
      scheduleNext(video, gen);
    };
    video.addEventListener('loadeddata', begin, { once: true });
    if (video.readyState >= video.HAVE_CURRENT_DATA) begin();
  };

  const flipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    setReady(false);
    setStatus('Switching camera...');
    try {
      await startStream(next);
    } catch (err) {
      setStatus('Could not switch camera.');
      console.error(err);
    }
  };

  useEffect(() => {
    disposed.current = false;
    const setup = async () => {
      try {
        await startStream('user');
      } catch (err) {
        setStatus('Camera setup failed. Please allow camera access.');
        console.error(err);
        return;
      }
      try {
        setStatus('Loading pose model...');
        await initializePoseLandmarker();
        setStatus('Tracking...');
      } catch (err) {
        setStatus('Pose model failed to load. Check your connection.');
        console.error(err);
      }
    };
    setup();

    return () => {
      disposed.current = true;
      loopGen.current++;
      cancelFrame();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleNext = (video: HTMLVideoElement, gen: number) => {
    const run = () => {
      if (disposed.current || gen !== loopGen.current) return;
      void tick(video, gen);
    };
    const anyVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      usingRvfc.current = true;
      animationRef.current = anyVideo.requestVideoFrameCallback(run);
    } else {
      usingRvfc.current = false;
      animationRef.current = requestAnimationFrame(run);
    }
  };

  const cancelFrame = () => {
    if (animationRef.current === undefined) return;
    const video = videoRef.current as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (h: number) => void;
    }) | null;
    if (usingRvfc.current && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(animationRef.current);
    } else if (!usingRvfc.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = undefined;
  };

  const tick = async (video: HTMLVideoElement, gen: number) => {
    const canvas = canvasRef.current;
    try {
      if (video && canvas && video.videoWidth > 0 && video.readyState >= video.HAVE_CURRENT_DATA) {
        if (!usingRvfc.current && video.currentTime === lastVideoTime.current) return;
        lastVideoTime.current = video.currentTime;
        const result = await detectPose(video);
        if (disposed.current || gen !== loopGen.current) return;
        if (result?.landmarks && result.landmarks.length > 0) {
          latestLandmarks.current = result.landmarks;
          setBodyDetected(true);
          drawScene(canvas, video, result.landmarks);
        } else {
          latestLandmarks.current = null;
          setBodyDetected(false);
          clearCanvas(canvas, video);
        }
      }
    } catch (err) {
      console.error('ergo pose loop frame error', err);
    } finally {
      if (!disposed.current && gen === loopGen.current) scheduleNext(video, gen);
    }
  };

  const clearCanvas = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const drawScene = (canvas: HTMLCanvasElement, video: HTMLVideoElement, lm: Landmark[]) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const seen = (i: number) => (lm[i]?.visibility ?? 1) > 0.3;

    for (const [a, b] of CONNECTIONS) {
      const la = lm[a];
      const lb = lm[b];
      if (!(seen(a) && seen(b) && la && lb)) continue;
      ctx.strokeStyle = 'rgba(52,211,153,0.9)'; // emerald skeleton
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(la.x * w, la.y * h);
      ctx.lineTo(lb.x * w, lb.y * h);
      ctx.stroke();
    }

    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      if (!p || !seen(i) || !DRAW_POINTS.has(i)) continue;
      const x = p.x * w;
      const y = p.y * h;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }
  };

  // Grab the current frame with the skeleton overlay baked in.
  const snapshot = (): string | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return null;
    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(video, 0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.85);
  };

  const flashShutter = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  };

  const handleCapture = () => {
    const lm = latestLandmarks.current;
    const image = snapshot();
    if (!lm || !image) return;
    const view = currentRef.current.id;
    const frame: ErgoCapturedFrame = {
      view,
      angles: extractErgoAngles(lm, view),
      imageData: image,
      timestamp: Date.now(),
    };
    setCaptures((prev) => ({ ...prev, [view]: frame }));
    flashShutter();
    // Auto-advance to the next view once the required one is taken.
    if (index < VIEWS.length - 1) setIndex(index + 1);
  };

  const captured = captures[current.id];
  const canFinish = !!captures.side; // side is the minimum for a result

  return (
    <div className="bg-black flex flex-col min-h-screen relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      <div
        className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-40"
        style={{ opacity: flash ? 0.85 : 0 }}
      />

      {/* Body detection indicator */}
      <div className="absolute top-24 right-4 z-20 flex items-center gap-2">
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
            bodyDetected ? 'bg-emerald-600 text-white' : 'bg-black/60 text-gray-300'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${bodyDetected ? 'bg-white' : 'bg-gray-400 animate-pulse'}`} />
          {bodyDetected ? 'Body detected · points live' : 'Stand in frame...'}
        </span>
      </div>

      {/* Front/back camera toggle */}
      <button
        onClick={flipCamera}
        title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
        className="absolute top-1/2 -translate-y-1/2 right-3 z-30 bg-black/70 hover:bg-black/90 active:scale-95 text-white text-sm font-semibold pl-3 pr-4 py-3 rounded-full flex items-center gap-2 shadow-lg"
      >
        <SwitchCamera className="w-5 h-5" />
        {facingMode === 'user' ? 'Front' : 'Back'}
      </button>

      {/* Top bar: current view + instruction */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/85 to-transparent p-4 z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onBack} className="text-white/80 text-sm flex items-center gap-1 hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-white/80 text-sm">
              {index + 1} / {VIEWS.length} · {(captures.side ? 1 : 0) + (captures.front ? 1 : 0)} captured
            </span>
          </div>
          <h2 className="text-white text-xl font-bold">{current.label}</h2>
          <p className="text-gray-300 text-sm mt-0.5">{current.instruction}</p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 z-20">
        <div className="max-w-4xl mx-auto">
          {/* View thumbnails */}
          <div className="flex gap-2 pb-3 mb-3">
            {VIEWS.map((v, i) => {
              const cap = captures[v.id];
              return (
                <button
                  key={v.id}
                  onClick={() => setIndex(i)}
                  className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    i === index ? 'border-emerald-400' : 'border-transparent opacity-70'
                  }`}
                  style={{ width: 64, height: 48 }}
                  title={v.label}
                >
                  {cap ? (
                    <img src={cap.imageData} alt={v.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-300 px-1 text-center">
                      {v.label.split(' ')[0]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCapture}
              disabled={!ready || !bodyDetected}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-lg"
            >
              {captured ? <RotateCcw className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              {captured ? `Re-capture ${current.label.split(' ')[0].toLowerCase()}` : `Capture ${current.label.split(' ')[0].toLowerCase()}`}
            </button>
          </div>

          <button
            onClick={() => onComplete(captures)}
            disabled={!canFinish}
            className="w-full mt-3 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40 disabled:bg-white/15"
          >
            {canFinish ? <CheckCircle2 className="w-5 h-5" /> : null}
            Continue to details <ArrowRight className="w-4 h-4" />
          </button>
          {!canFinish && (
            <p className="text-center text-xs text-gray-400 mt-2">Capture at least the side view to continue.</p>
          )}
          <p className="text-center text-[11px] text-gray-500 mt-1">{status}</p>
        </div>
      </div>
    </div>
  );
}
