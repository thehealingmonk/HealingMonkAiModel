import { useEffect, useRef, useState } from 'react';
import { openCamera } from '@/lib/camera';
import { initializePoseLandmarker, detectPose, Landmark } from '@/lib/poseDetection';
import { computePostureChain, PostureChain } from '@/lib/postureVisualizer';
import { computeClinicalPlumbLine, drawClinicalPlumbLine, ClinicalPlumbLine } from '@/lib/plumbLine';
import { computeGuidance, drawGuidanceOverlay, Guidance } from '@/lib/captureGuidance';
import { speak, stopSpeech, initializeVoice } from '@/services/voice.service';
import {
  ClinicalAssessment,
  AssessmentCapture,
  ExtraShot,
  MeasureResult,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
} from '@/lib/clinicalKnowledge';
import {
  Camera, ChevronLeft, ChevronRight, CheckCircle2, RotateCcw, SwitchCamera, Plus, X, Images,
  Volume2, VolumeX, ArrowLeft, ArrowRight, MoveHorizontal,
} from 'lucide-react';

interface Props {
  assessments: ClinicalAssessment[];
  onComplete: (captures: AssessmentCapture[], extraShots: ExtraShot[]) => void;
  onBack: () => void;
}

// Skeleton connections (MediaPipe Pose indices) — clinically relevant joints
// only. The finger fans and face-mesh links MediaPipe also returns are left out
// so the overlay stays clean and the doctor sees just the assessment skeleton.
const CONNECTIONS: [number, number][] = [
  // Torso + head
  [11, 12], [11, 23], [12, 24], [23, 24], [7, 8], [0, 11], [0, 12],
  // Arms
  [11, 13], [13, 15], [12, 14], [14, 16],
  // Legs
  [23, 25], [25, 27], [24, 26], [26, 28],
  // Feet (ankle → heel → toe, needed for side-view posture)
  [27, 29], [29, 31], [28, 30], [30, 32],
];

// Only these landmarks get a dot. MediaPipe returns 33 points including the
// mouth and individual fingers; those add visual noise with no clinical value,
// so they are hidden — the tracker still follows the whole body, we just draw
// the joints that matter for posture/ROM measurement, PLUS the eyes so the user
// can see the points sit precisely on their eyes.
const CLINICAL_POINTS = new Set<number>([
  0, 2, 5, 7, 8, // nose, left eye, right eye, ears (head reference)
  11, 12, 13, 14, 15, 16, // shoulders, elbows, wrists
  23, 24, 25, 26, 27, 28, // hips, knees, ankles
  29, 30, 31, 32, // heels, foot index
]);

// Fine facial points (eye centres). Drawn smaller than body joints so the dot
// sits ON the eye instead of covering it. These use MediaPipe's actual eye
// landmarks (2 = left_eye, 5 = right_eye) — no positional fudging.
const FACE_DOTS = new Set<number>([2, 5]);

export default function ClinicalCapture({ assessments, onComplete, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Separate overlay for the guidance arrow so it is NEVER baked into a capture.
  const guideCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  // Frame-loop lifecycle guards. `loopGen` is bumped every time the stream
  // (re)starts so a stale in-flight frame from a previous camera never
  // reschedules; `disposed` stops everything on unmount. Together they guarantee
  // exactly ONE live loop and no post-unmount detection (the async rAF/rVFC
  // callback re-schedules itself, so a plain cancel alone can leak a frame).
  const loopGen = useRef(0);
  const disposed = useRef(false);
  const usingRvfc = useRef(false);
  const lastVideoTime = useRef(-1);
  const latestLandmarks = useRef<Landmark[] | null>(null);
  // Latest plumb-line result for the frame on screen, so a capture stores the
  // exact alignment the doctor saw (and the live verdict can read it).
  const latestPlumb = useRef<ClinicalPlumbLine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  // Which camera is live: 'user' = front (selfie), 'environment' = back.
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [status, setStatus] = useState('Loading pose model...');
  const [live, setLive] = useState<MeasureResult | null>(null);
  const [livePosture, setLivePosture] = useState<PostureChain | null>(null);
  const [bodyDetected, setBodyDetected] = useState(false);
  const [flash, setFlash] = useState(false);
  const [captures, setCaptures] = useState<Record<string, AssessmentCapture>>({});
  // Extra free-angle photos (multiple per pose allowed) — appended, never
  // overwritten, so the doctor can document a posture from many angles.
  const [extraShots, setExtraShots] = useState<ExtraShot[]>([]);

  // Live positioning coach: spoken cues (female English voice) + on-screen arrow.
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  // Ref so the animation loop (a stable closure) reads the latest setting.
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const lastStatusRef = useRef<string>('');
  const lastSpeakRef = useRef(0);
  const spokenPoseRef = useRef<number>(-1);

  const current = assessments[index];
  // Keep a ref of the active assessment so the animation loop always measures
  // the one currently on screen without restarting the loop each time.
  const currentRef = useRef(current);
  currentRef.current = current;

  // (Re)open the camera with the requested lens, stopping any previous stream
  // first so switching front↔back never leaves a second camera running.
  const startStream = async (mode: 'user' | 'environment') => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await openCamera(mode);
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    const begin = async () => {
      try {
        await video.play();
      } catch {
        /* autoplay may already be running */
      }
      setReady(true);
      setStatus('Tracking...');
      // Retire any previous loop and start a fresh generation for this stream.
      cancelFrame();
      lastVideoTime.current = -1;
      const gen = ++loopGen.current;
      scheduleNext(video, gen);
    };
    // Start as soon as we have data; also handle the case where the event
    // already fired before this listener was attached.
    video.addEventListener('loadeddata', begin, { once: true });
    if (video.readyState >= video.HAVE_CURRENT_DATA) begin();
  };

  // Toggle between the front (selfie) and rear camera.
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
    // Reset the dispose flag on (re)mount — StrictMode runs mount→cleanup→mount
    // on the same instance, and the cleanup above sets disposed=true.
    disposed.current = false;
    initializeVoice();
    const setup = async () => {
      // Open the camera FIRST so the live preview appears instantly, then load
      // the (multi-MB) pose model in parallel. The render loop safely returns no
      // landmarks until the model is ready, so tracking simply switches on the
      // moment the download finishes — the doctor never waits on a black screen.
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
      // Stop the loop for good: flip the dispose flag, retire the generation so
      // any in-flight async frame won't reschedule, cancel the pending frame,
      // and release the camera + speech.
      disposed.current = true;
      loopGen.current++;
      cancelFrame();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speak the current pose's instruction ("stand sideways…") whenever the pose
  // changes (or when voice is switched on), so the user knows what to do.
  useEffect(() => {
    if (!ready || !voiceOn) return;
    if (spokenPoseRef.current === index) return;
    spokenPoseRef.current = index;
    const a = assessments[index];
    if (a) speak({ text: a.instruction, lang: 'en' });
    // Hold off the next live positioning cue briefly so it doesn't cut off the
    // instruction that just started playing.
    lastSpeakRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, ready, voiceOn]);

  // React to a change in positioning status: update the banner and, if voice is
  // on, speak the cue (throttled so it never chatters frame-to-frame).
  const handleGuidance = (g: Guidance) => {
    if (g.status === lastStatusRef.current) return;
    lastStatusRef.current = g.status;
    setGuidance(g);
    if (voiceOnRef.current) {
      const now = performance.now();
      if (now - lastSpeakRef.current > 1400) {
        lastSpeakRef.current = now;
        speak({ text: g.en, lang: 'en' });
      }
    }
  };

  // Schedule the next frame. Prefer requestVideoFrameCallback — it fires exactly
  // once per PRESENTED camera frame, so pose inference runs at the true capture
  // rate (~30fps) instead of the display's rAF rate (60–120Hz), which would
  // reprocess identical frames and waste GPU. Falls back to rAF where rVFC is
  // unsupported. The generation guard makes a stale callback a no-op.
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
        // Skip inference if the video hasn't advanced (rAF fallback can fire
        // faster than the camera). rVFC only fires on new frames, so this is a
        // no-op there. Guards against reprocessing an identical frame.
        if (!usingRvfc.current && video.currentTime === lastVideoTime.current) {
          return;
        }
        lastVideoTime.current = video.currentTime;
        const result = await detectPose(video);
        if (disposed.current || gen !== loopGen.current) return;
        if (result?.landmarks && result.landmarks.length > 0) {
          latestLandmarks.current = result.landmarks;
          setBodyDetected(true);
          const aspect = (video.videoWidth / video.videoHeight) || 16 / 9;
          const measure = currentRef.current.measure(result.landmarks);
          setLive(measure);
          const chain = computePostureChain(result.landmarks, aspect);
          setLivePosture(chain);
          const plumb = computeClinicalPlumbLine(result.landmarks, currentRef.current.view, aspect);
          latestPlumb.current = plumb;
          drawScene(canvas, video, result.landmarks, measure, plumb);

          // Live positioning coach: arrow overlay + spoken cue.
          const g = computeGuidance(result.landmarks, plumb);
          if (guideCanvasRef.current) drawGuidanceOverlay(guideCanvasRef.current, video, g);
          handleGuidance(g);
        } else {
          latestLandmarks.current = null;
          latestPlumb.current = null;
          setBodyDetected(false);
          clearCanvas(canvas, video);
          if (guideCanvasRef.current) drawGuidanceOverlay(guideCanvasRef.current, video, null);
          setLive(null);
          setLivePosture(null);
          handleGuidance({ status: 'no-body', en: 'Stand in front of the camera', hi: 'कैमरे के सामने खड़े हों', arrow: null, ready: false });
        }
      }
    } catch (err) {
      // Never let a single bad frame kill the render loop.
      console.error('pose loop frame error', err);
    } finally {
      // Reschedule only while this generation is still the active one.
      if (!disposed.current && gen === loopGen.current) scheduleNext(video, gen);
    }
  };

  const clearCanvas = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  /** Draw the live skeleton; the active assessment's landmarks are highlighted
   * with the severity colour and the measured value is labelled. */
  const drawScene = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    lm: Landmark[],
    measure: MeasureResult,
    plumb: ClinicalPlumbLine | null
  ) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const active = new Set(measure.points);
    const sevColor = measure.severity ? SEVERITY_COLOR[measure.severity] : '#9ca3af';
    // Treat undefined visibility as visible so dots always render.
    const seen = (i: number) => (lm[i]?.visibility ?? 1) > 0.3;

    // Skeleton lines.
    for (const [a, b] of CONNECTIONS) {
      const la = lm[a];
      const lb = lm[b];
      if (!(seen(a) && seen(b) && la && lb)) continue;
      const highlight = active.has(a) && active.has(b);
      ctx.strokeStyle = highlight ? sevColor : 'rgba(56,189,248,0.9)'; // cyan skeleton
      ctx.lineWidth = highlight ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(la.x * w, la.y * h);
      ctx.lineTo(lb.x * w, lb.y * h);
      ctx.stroke();
    }

    // Landmark dots — only the clinically relevant joints, so the face-mesh and
    // finger points don't clutter the image the doctor reviews.
    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      if (!p || !seen(i) || !CLINICAL_POINTS.has(i)) continue;
      const isActive = active.has(i);
      const x = p.x * w;
      const y = p.y * h;
      // Eyes get a smaller dot so the marker sits ON the eye, not over it.
      const core = FACE_DOTS.has(i) ? 5 : isActive ? 11 : 7;
      // White halo so dots stand out against any clothing/background.
      ctx.beginPath();
      ctx.arc(x, y, core + 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      // Coloured core: severity colour for the active region, cyan otherwise.
      ctx.beginPath();
      ctx.arc(x, y, core, 0, 2 * Math.PI);
      ctx.fillStyle = isActive ? sevColor : '#06b6d4';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }

    // Clinical plumb line: the vertical reference + anatomical checkpoints +
    // (front view) symmetry bars — VISUAL guides only. Labels are suppressed
    // (showLabels=false) so nothing is written over the person's body; only the
    // AI pose skeleton + plumb guides show, live and in the captured image.
    if (plumb) {
      drawClinicalPlumbLine(ctx, plumb, w, h, false);
    }
  };

  // Grab the current frame as { raw (no overlay), overlay (pose points baked in) }
  // JPEG data URLs. Returns null if the video/canvas aren't ready.
  const snapshot = (): { raw: string; overlay: string } | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return null;

    const raw = document.createElement('canvas');
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    const rctx = raw.getContext('2d');
    if (!rctx) return null;
    rctx.drawImage(video, 0, 0, raw.width, raw.height);

    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(video, 0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0, out.width, out.height);

    return { raw: raw.toDataURL('image/jpeg', 0.85), overlay: out.toDataURL('image/jpeg', 0.85) };
  };

  const flashShutter = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  };

  // Capture an additional angle for the current pose. Appended to a gallery
  // (never overwrites the primary capture) so a posture can be documented from
  // as many angles as the doctor wants.
  const handleCaptureExtra = () => {
    const shot = snapshot();
    if (!shot) return;
    const count = extraShots.filter((s) => s.assessmentId === current.id).length + 1;
    setExtraShots((prev) => [
      ...prev,
      {
        id: `${current.id}-${Date.now()}`,
        assessmentId: current.id,
        label: `${current.name} · angle ${count}`,
        imageData: shot.overlay,
        rawImageData: shot.raw,
        timestamp: Date.now(),
      },
    ]);
    flashShutter();
  };

  const removeExtra = (id: string) => setExtraShots((prev) => prev.filter((s) => s.id !== id));

  const handleCapture = () => {
    const shot = snapshot();
    if (!shot) return;
    const lm = latestLandmarks.current;
    const video = videoRef.current!;

    const measure = lm
      ? current.measure(lm)
      : { value: null, severity: null, points: [], detail: 'N/A' };
    const aspect = (video.videoWidth / video.videoHeight) || 16 / 9;
    const chain = lm ? computePostureChain(lm, aspect) : null;
    // Plumb line for this exact frame — the alignment verdict shown in the report.
    const plumb = latestPlumb.current ?? (lm ? computeClinicalPlumbLine(lm, current.view, aspect) : null);
    const capture: AssessmentCapture = {
      assessmentId: current.id,
      value: measure.value,
      severity: measure.severity,
      imageData: shot.overlay,
      rawImageData: shot.raw,
      postureDeviation: chain
        ? {
            score: chain.score,
            rating: chain.rating,
            joints: chain.joints
              .filter((j) => !j.isBase)
              .map((j) => ({ name: j.name, angle: j.angle, aligned: j.aligned })),
          }
        : undefined,
      plumbLine: plumb
        ? {
            view: plumb.view,
            score: plumb.score,
            rating: plumb.rating,
            aligned: plumb.aligned,
            points: plumb.points.map((p) => ({ name: p.name, offsetPct: p.offsetPct, onLine: p.onLine })),
            symmetry: plumb.symmetry.map((s) => ({
              name: s.name,
              tiltDeg: s.tiltDeg,
              level: s.level,
              higher: s.higher,
            })),
          }
        : undefined,
      timestamp: Date.now(),
    };
    setCaptures((prev) => ({ ...prev, [current.id]: capture }));

    // Shutter flash so the doctor sees the photo was taken instantly.
    flashShutter();

    // Auto-advance to the next un-captured assessment, if any.
    const nextUncaptured = assessments.findIndex(
      (a, i) => i > index && !captures[a.id]
    );
    if (nextUncaptured !== -1) setIndex(nextUncaptured);
  };

  const captured = captures[current?.id];
  const capturedCount = Object.keys(captures).length;
  const allDone = capturedCount === assessments.length;

  const finish = () => {
    const ordered = assessments
      .map((a) => captures[a.id])
      .filter((c): c is AssessmentCapture => Boolean(c));
    onComplete(ordered, extraShots);
  };

  const currentExtras = extraShots.filter((s) => s.assessmentId === current?.id);

  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
      {/* Guidance arrow overlay — separate canvas, never captured into a photo. */}
      <canvas ref={guideCanvasRef} className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" />

      {/* Shutter flash on capture */}
      <div
        className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-40"
        style={{ opacity: flash ? 0.85 : 0 }}
      />

      {/* Live positioning coach banner — the friendly text that pairs with the
          spoken cue and the on-screen arrow. Green when ready, amber otherwise. */}
      {bodyDetected && guidance && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[92%]">
          <div
            className={`px-4 py-2 rounded-full flex items-center gap-2 shadow-lg text-sm font-bold text-white ${
              guidance.ready ? 'bg-green-600' : 'bg-amber-500'
            }`}
          >
            {guidance.arrow === 'left' ? (
              <ArrowLeft className="w-4 h-4 animate-pulse" />
            ) : guidance.arrow === 'right' ? (
              <ArrowRight className="w-4 h-4 animate-pulse" />
            ) : guidance.ready ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <MoveHorizontal className="w-4 h-4" />
            )}
            {guidance.en}
          </div>
        </div>
      )}

      {/* Body detection indicator */}
      <div className="absolute top-24 right-4 z-20 flex items-center gap-2">
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
            bodyDetected ? 'bg-green-600 text-white' : 'bg-black/60 text-gray-300'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${bodyDetected ? 'bg-white' : 'bg-gray-400 animate-pulse'}`} />
          {bodyDetected ? 'Body detected · points live' : 'Stand in frame...'}
        </span>
      </div>

      {/* Voice guidance controls: mute/unmute + language, and repeat the
          current pose's spoken instruction on demand. */}
      <div className="absolute top-24 left-4 z-30 flex items-center gap-2">
        <button
          onClick={() => {
            const next = !voiceOn;
            setVoiceOn(next);
            if (!next) stopSpeech();
          }}
          title={voiceOn ? 'Mute voice guidance' : 'Unmute voice guidance'}
          className={`p-2.5 rounded-full shadow-lg ${voiceOn ? 'bg-emerald-600 text-white' : 'bg-black/70 text-gray-300'}`}
        >
          {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        {voiceOn && (
          <button
            onClick={() => {
              const a = assessments[index];
              if (a) speak({ text: a.instruction, lang: 'en' });
            }}
            title="Repeat instruction"
            className="px-3 py-2 rounded-full bg-black/70 text-white text-xs font-semibold shadow-lg"
          >
            Repeat
          </button>
        )}
      </div>

      {/* Front/back camera toggle — floats in the clear right-middle area so it
          never sits under the top-bar text and stays easy to tap. */}
      <button
        onClick={flipCamera}
        title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
        className="absolute top-1/2 -translate-y-1/2 right-3 z-30 bg-black/70 hover:bg-black/90 active:scale-95 text-white text-sm font-semibold pl-3 pr-4 py-3 rounded-full flex items-center gap-2 shadow-lg"
      >
        <SwitchCamera className="w-5 h-5" />
        {facingMode === 'user' ? 'Front' : 'Back'}
      </button>

      {/* Top bar: current assessment + instruction */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/85 to-transparent p-4 z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onBack} className="text-white/80 text-sm flex items-center gap-1 hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-white/80 text-sm">
              {index + 1} / {assessments.length} · {capturedCount} captured
            </span>
          </div>
          <h2 className="text-white text-xl font-bold">{current?.name}</h2>
          <p className="text-gray-300 text-sm mt-0.5">{current?.instruction}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-white/15 text-white px-2 py-0.5 rounded capitalize">{current?.view} view</span>
            <span className="text-xs bg-white/15 text-white px-2 py-0.5 rounded">{current?.patientPosition}</span>
            <span className="text-xs bg-white/15 text-white px-2 py-0.5 rounded">{current?.landmarkNames.join(' · ')}</span>
          </div>
        </div>
      </div>

      {/* Live measurement readout */}
      <div className="absolute top-1/2 -translate-y-1/2 left-4 z-20 pointer-events-none">
        <div className="bg-black/55 backdrop-blur rounded-xl p-4 w-44">
          <p className="text-gray-300 text-xs">{current?.measurementName}</p>
          <p className="text-4xl font-bold text-white mt-1">
            {live?.value !== null && live?.value !== undefined ? live.detail : '--'}
          </p>
          {live?.severity ? (
            <span
              className="inline-block mt-2 text-xs font-semibold px-2 py-1 rounded text-white"
              style={{ backgroundColor: SEVERITY_COLOR[live.severity] }}
            >
              {SEVERITY_LABEL[live.severity]}
            </span>
          ) : (
            <span className="inline-block mt-2 text-xs text-gray-400">{status}</span>
          )}
        </div>

        {livePosture && (
          <div className="bg-black/55 backdrop-blur rounded-xl p-4 w-44 mt-3">
            <p className="text-gray-300 text-xs">Deviation from ideal</p>
            <p className="text-3xl font-bold text-white mt-1">{livePosture.score.toFixed(0)}°</p>
            <span
              className="inline-block mt-2 text-xs font-semibold px-2 py-1 rounded text-white"
              style={{ backgroundColor: SEVERITY_COLOR[livePosture.rating] }}
            >
              {SEVERITY_LABEL[livePosture.rating]}
            </span>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 z-20">
        <div className="max-w-4xl mx-auto">
          {/* Thumbnails of captured assessments */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
            {assessments.map((a, i) => {
              const cap = captures[a.id];
              return (
                <button
                  key={a.id}
                  onClick={() => setIndex(i)}
                  className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    i === index ? 'border-green-400' : 'border-transparent opacity-70'
                  }`}
                  style={{ width: 64, height: 48 }}
                  title={a.name}
                >
                  {cap ? (
                    <img src={cap.imageData} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-300 px-1 text-center">
                      {a.name.split(' ')[0]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Extra angle shots for THIS pose — a gallery the doctor can add to
              freely. Each is removable; all flow into the report. */}
          {currentExtras.length > 0 && (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white/70">
                <Images className="w-3.5 h-3.5" /> Extra angles ({currentExtras.length})
              </span>
              {currentExtras.map((s) => (
                <div key={s.id} className="relative flex-shrink-0" style={{ width: 56, height: 42 }}>
                  <img src={s.imageData} alt={s.label} className="w-full h-full object-cover rounded-md border border-white/20" />
                  <button
                    onClick={() => removeExtra(s.id)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 shadow"
                    title="Remove this angle"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="bg-white/15 disabled:opacity-30 text-white p-3 rounded-full"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={handleCapture}
              disabled={!ready}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-lg"
            >
              {captured ? <RotateCcw className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              {captured ? 'Re-capture' : 'Capture'}
            </button>

            <button
              onClick={handleCaptureExtra}
              disabled={!ready}
              title="Capture another angle of this pose"
              className="bg-white/15 hover:bg-white/25 disabled:opacity-30 text-white px-4 py-4 rounded-xl flex items-center gap-1.5 text-sm font-semibold"
            >
              <Plus className="w-5 h-5" /> Angle
            </button>

            <button
              onClick={() => setIndex((i) => Math.min(assessments.length - 1, i + 1))}
              disabled={index === assessments.length - 1}
              className="bg-white/15 disabled:opacity-30 text-white p-3 rounded-full"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={finish}
            disabled={capturedCount === 0}
            className={`w-full mt-3 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              allDone
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-white/15 hover:bg-white/25 text-white disabled:opacity-40'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            {allDone ? 'Generate Report' : `Generate Report (${capturedCount}/${assessments.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
