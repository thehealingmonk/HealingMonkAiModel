import { useEffect, useRef, useState } from 'react';
import {
  Camera, ChevronLeft, CheckCircle2, SwitchCamera, ArrowRight, ScanSearch, SkipForward,
} from 'lucide-react';
import { openCamera } from '@/lib/camera';
import { initializePoseLandmarker, detectPose, Landmark } from '@/lib/poseDetection';
import { initializeObjectDetector, detectObjects } from '@/lib/ergo/objectDetection';
import { extractErgoAngles } from '@/lib/ergo/landmarksToAngles';
import { scoreConfidence, CONFIDENCE_COLOR } from '@/lib/ergo/ergoKnowledge';
import { DetectedObject } from '@/lib/ergo/ergoTypes';
import { ErgoWorkstationCapture } from './ergoTypes';

interface Props {
  /** Called with the captured workstation frame, or null when the user skips. */
  onComplete: (capture: ErgoWorkstationCapture | null) => void;
  onBack: () => void;
}

// Skeleton connections (MediaPipe Pose indices) — same whole-body set as the
// human capture so the overlay is consistent.
const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24], [7, 8], [0, 11], [0, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

const DRAW_POINTS = new Set<number>([0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

// Object detection is heavier than pose; run it a few times a second rather than
// every frame so the live skeleton stays smooth (spec §33).
const OBJECT_INTERVAL_MS = 300;

export default function ErgoWorkstationScan({ onComplete, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const loopGen = useRef(0);
  const disposed = useRef(false);
  const usingRvfc = useRef(false);
  const lastVideoTime = useRef(-1);
  const latestLandmarks = useRef<Landmark[] | null>(null);
  const latestObjects = useRef<DetectedObject[]>([]);
  const lastObjectRun = useRef(0);
  const objectsReady = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [status, setStatus] = useState('Loading models…');
  const [bodyDetected, setBodyDetected] = useState(false);
  const [objectCount, setObjectCount] = useState(0);
  const [flash, setFlash] = useState(false);

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
      setStatus('Scanning…');
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
    setStatus('Switching camera…');
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
        await startStream('environment');
      } catch (err) {
        setStatus('Camera setup failed. Please allow camera access.');
        console.error(err);
        return;
      }
      try {
        setStatus('Loading pose model…');
        await initializePoseLandmarker();
        setStatus('Loading object model…');
        await initializeObjectDetector();
        objectsReady.current = true;
        setStatus('Scanning…');
      } catch (err) {
        setStatus('A model failed to load. Check your connection.');
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

        // Pose every frame.
        const pose = await detectPose(video);
        if (disposed.current || gen !== loopGen.current) return;
        latestLandmarks.current = pose?.landmarks?.length ? pose.landmarks : null;
        setBodyDetected(!!latestLandmarks.current);

        // Objects a few times a second (throttled).
        if (objectsReady.current && performance.now() - lastObjectRun.current > OBJECT_INTERVAL_MS) {
          lastObjectRun.current = performance.now();
          latestObjects.current = detectObjects(video);
          setObjectCount(latestObjects.current.length);
        }

        drawScene(canvas, video, latestLandmarks.current, latestObjects.current);
      }
    } catch (err) {
      console.error('ergo workstation loop frame error', err);
    } finally {
      if (!disposed.current && gen === loopGen.current) scheduleNext(video, gen);
    }
  };

  const drawScene = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    lm: Landmark[] | null,
    objects: DetectedObject[]
  ) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // ---- Object bounding boxes + labels ----
    for (const o of objects) {
      const conf = scoreConfidence(o.score);
      const color = CONFIDENCE_COLOR[conf];
      const x = o.box.x * w;
      const y = o.box.y * h;
      const bw = o.box.w * w;
      const bh = o.box.h * h;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, bw, bh);
      const label = `${o.label} ${Math.round(o.score * 100)}%`;
      ctx.font = '600 16px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - 22), tw + 12, 22);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, x + 6, Math.max(14, y - 6));
    }

    // ---- Pose skeleton ----
    if (lm) {
      const seen = (i: number) => (lm[i]?.visibility ?? 1) > 0.3;
      for (const [a, b] of CONNECTIONS) {
        const la = lm[a];
        const lb = lm[b];
        if (!(seen(a) && seen(b) && la && lb)) continue;
        ctx.strokeStyle = 'rgba(52,211,153,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(la.x * w, la.y * h);
        ctx.lineTo(lb.x * w, lb.y * h);
        ctx.stroke();
      }
      for (let i = 0; i < lm.length; i++) {
        const p = lm[i];
        if (!p || !seen(i) || !DRAW_POINTS.has(i)) continue;
        const px = p.x * w;
        const py = p.y * h;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      }
    }
  };

  // Grab the current frame with skeleton + boxes baked in.
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

  const handleCapture = () => {
    const image = snapshot();
    if (!image) return;
    const lm = latestLandmarks.current;
    const capture: ErgoWorkstationCapture = {
      imageData: image,
      landmarks: lm,
      angles: lm ? extractErgoAngles(lm, 'side') : null,
      objects: latestObjects.current,
      timestamp: Date.now(),
    };
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    onComplete(capture);
  };

  return (
    <div className="bg-black flex flex-col min-h-screen relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      <div
        className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-40"
        style={{ opacity: flash ? 0.85 : 0 }}
      />

      {/* Detection indicators */}
      <div className="absolute top-24 right-4 z-20 flex flex-col items-end gap-2">
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
            bodyDetected ? 'bg-emerald-600 text-white' : 'bg-black/60 text-gray-300'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${bodyDetected ? 'bg-white' : 'bg-gray-400 animate-pulse'}`} />
          {bodyDetected ? 'Person detected' : 'Person not in frame'}
        </span>
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
            objectCount > 0 ? 'bg-sky-600 text-white' : 'bg-black/60 text-gray-300'
          }`}
        >
          <ScanSearch className="w-3.5 h-3.5" />
          {objectCount > 0 ? `${objectCount} object${objectCount > 1 ? 's' : ''} detected` : 'Looking for objects…'}
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

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/85 to-transparent p-4 z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onBack} className="text-white/80 text-sm flex items-center gap-1 hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => onComplete(null)} className="text-white/70 text-sm flex items-center gap-1 hover:text-white">
              Skip <SkipForward className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-white text-xl font-bold">Workstation scan</h2>
          <p className="text-gray-300 text-sm mt-0.5">
            Frame the person <span className="font-semibold">from the side</span>, seated at the desk, so the chair,
            desk and screen are all visible. We detect the objects and how the body relates to them.
          </p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 z-20">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleCapture}
            disabled={!ready}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-lg"
          >
            <Camera className="w-5 h-5" /> Capture workstation
          </button>
          <button
            onClick={() => onComplete(null)}
            className="w-full mt-3 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white"
          >
            Skip workstation analysis <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-center text-[11px] text-gray-500 mt-2 flex items-center justify-center gap-1">
            {status === 'Scanning…' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
            {status}
          </p>
        </div>
      </div>
    </div>
  );
}
