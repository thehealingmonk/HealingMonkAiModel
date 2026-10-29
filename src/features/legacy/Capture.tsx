import { useEffect, useRef, useState } from 'react';
import { SwitchCamera } from 'lucide-react';
import { openCamera, getPreferredLens } from '@/lib/camera';
import { initializePoseLandmarker, detectPose, drawPoseSkeleton, Landmark } from '@/lib/poseDetection';
import { analyzePosture, calculateMobilityScore, calculateStabilityScore } from '@/lib/poseAnalyzer';
import {
  analyzePostureVisually,
  analyzeCenterAlignment,
  drawPostureVisualization,
  drawCenterLine,
  isSideProfile,
  CenterAlignment,
  PostureAnalysis,
} from '@/lib/postureVisualizer';
import { supabase } from '@/lib/supabase';

interface Props {
  onComplete: (assessment: any) => void;
}

interface FrameData {
  landmarks: Landmark[];
  posture_score: number;
  mobility_score: number;
  stability_score: number;
  issues: any[];
  posture_analysis?: PostureAnalysis;
}

export default function Capture({ onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState('Initializing...');
  const [countdown, setCountdown] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [phase, setPhase] = useState<'loading' | 'positioning' | 'ready' | 'capturing' | 'processing'>('loading');
  const [detectionQuality, setDetectionQuality] = useState(0);
  const [sideReady, setSideReady] = useState(false);
  const [centerAlignment, setCenterAlignment] = useState<CenterAlignment | null>(null);
  const frameCountRef = useRef(0);
  const framesDataRef = useRef<FrameData[]>([]);
  const animationFrameRef = useRef<number>();
  const previewFrameRef = useRef<number>();

  // (Re)open the camera with the requested lens, stopping any previous stream
  // first so switching front↔back never leaves a second camera running.
  const startStream = async (mode: 'user' | 'environment') => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await openCamera(mode);
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener('loadedmetadata', () => {
        setPhase('positioning');
        setStatus('Align your body to the green line');
        renderCenterLineOnly(); // show the ideal line the moment the camera opens
        startPreview();
      }, { once: true });
    }
  };

  // Toggle between the front (selfie) and rear camera.
  const flipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    try {
      await startStream(next);
    } catch (err) {
      setStatus('Could not switch camera');
      console.error(err);
    }
  };

  useEffect(() => {
    const setup = async () => {
      try {
        // Load the model and open the camera in parallel, not one after another.
        const lens = getPreferredLens('user');
        setFacingMode(lens);
        await Promise.all([initializePoseLandmarker(), startStream(lens)]);
      } catch (err) {
        setStatus('Camera setup failed');
        console.error(err);
      }
    };
    setup();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (previewFrameRef.current) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawAnalysisFrame = (landmarks: Landmark[], videoWidth: number, videoHeight: number): CenterAlignment | null => {
    if (!canvasRef.current) return null;
    const aspect = videoWidth / videoHeight;
    // Visual posture analysis with green/red indicators + plumb line.
    const analysis = analyzePostureVisually(landmarks, aspect);
    drawPostureVisualization(canvasRef.current, landmarks, analysis, videoWidth, videoHeight);
    // Fixed green "ideal" center line + body-axis alignment on top.
    const alignment = analyzeCenterAlignment(landmarks, 0.5, aspect);
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) drawCenterLine(ctx, videoWidth, videoHeight, alignment);
    return alignment;
  };

  // Draw just the green ideal line on a cleared canvas (before any pose is seen).
  const renderCenterLineOnly = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCenterLine(ctx, video.videoWidth, video.videoHeight, null);
    }
  };

  // Live positioning preview: shows the green ideal line and declares whether
  // the body is aligned to it. Detection runs without recording any frames.
  const startPreview = () => {
    const loop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        previewFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const result = await detectPose(video);
      if (result && result.landmarks) {
        const alignment = drawAnalysisFrame(result.landmarks, video.videoWidth, video.videoHeight);
        setCenterAlignment(alignment);
        setSideReady(isSideProfile(result.landmarks, video.videoWidth / video.videoHeight));
        setStatus(alignment?.message ?? 'Align your body to the green line');
      } else {
        renderCenterLineOnly();
        setCenterAlignment(null);
        setSideReady(false);
        setStatus('Step into frame, on the green line');
      }

      previewFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const processContinuously = async () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(processContinuously);
      return;
    }

    const result = await detectPose(videoRef.current);
    if (result && result.landmarks) {
      drawAnalysisFrame(result.landmarks, videoRef.current.videoWidth, videoRef.current.videoHeight);

      const { issues, score: postureScore, confidence } = analyzePosture(result.landmarks);
      const mobilityScore = calculateMobilityScore(result.landmarks);
      const stabilityScore = calculateStabilityScore(result.landmarks);
      const postureAnalysis = analyzePostureVisually(
        result.landmarks,
        videoRef.current.videoWidth / videoRef.current.videoHeight
      );

      framesDataRef.current.push({
        landmarks: result.landmarks,
        posture_score: postureScore,
        mobility_score: mobilityScore,
        stability_score: stabilityScore,
        issues: issues,
        posture_analysis: postureAnalysis,
      });

      frameCountRef.current++;
      setDetectionQuality(Math.round(confidence));
      setStatus(`Capturing... ${frameCountRef.current} frames (Quality: ${Math.round(confidence)}%)`);
    }

    animationFrameRef.current = requestAnimationFrame(processContinuously);
  };

  const startCapture = () => {
    if (previewFrameRef.current) {
      cancelAnimationFrame(previewFrameRef.current);
    }
    setPhase('capturing');
    setCountdown(5);
    frameCountRef.current = 0;
    framesDataRef.current = [];

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(countdownInterval);
          startProcessing();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    processContinuously();
  };

  const startProcessing = async () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setPhase('processing');
    setStatus('Analyzing your posture...');

    if (framesDataRef.current.length === 0) {
      setStatus('No pose detected. Please try again.');
      return;
    }

    const avgPostureScore = Math.round(
      framesDataRef.current.reduce((sum, f) => sum + f.posture_score, 0) / framesDataRef.current.length
    );
    const avgMobilityScore = Math.round(
      framesDataRef.current.reduce((sum, f) => sum + f.mobility_score, 0) / framesDataRef.current.length
    );
    const avgStabilityScore = Math.round(
      framesDataRef.current.reduce((sum, f) => sum + f.stability_score, 0) / framesDataRef.current.length
    );

    const overallScore = Math.round((avgPostureScore + avgMobilityScore + avgStabilityScore) / 3);

    const allIssues: any[] = [];
    framesDataRef.current.forEach((frame) => {
      frame.issues.forEach((issue) => {
        const existing = allIssues.find((i) => i.type === issue.type);
        if (existing) {
          existing.count++;
        } else {
          allIssues.push({ ...issue, count: 1 });
        }
      });
    });

    const uniqueIssues = allIssues.filter((issue) => issue.count >= framesDataRef.current.length * 0.3);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: assessment } = await supabase
          .from('assessments')
          .insert([
            {
              user_id: user.id,
              overall_score: overallScore,
              posture_score: avgPostureScore,
              mobility_score: avgMobilityScore,
              stability_score: avgStabilityScore,
              assessment_type: 'posture',
            },
          ])
          .select()
          .single();

        if (assessment) {
          for (const issue of uniqueIssues) {
            await supabase.from('assessment_findings').insert([
              {
                assessment_id: assessment.id,
                finding_type: issue.type,
                severity: issue.severity,
                description: issue.description,
                recommendation: issue.recommendation,
              },
            ]);
          }

          const { data: programs } = await supabase
            .from('programs')
            .select('*')
            .limit(2);

          if (programs) {
            for (const program of programs) {
              await supabase.from('assessment_programs').insert([
                {
                  assessment_id: assessment.id,
                  program_id: program.id,
                  reason: 'Recommended based on your assessment',
                },
              ]);
            }
          }
        }
      }

      const { data: programs } = await supabase.from('programs').select('*').limit(2);

      // Get average posture analysis from frames
      const avgPostureAnalysis = framesDataRef.current.length > 0
        ? framesDataRef.current[Math.floor(framesDataRef.current.length / 2)].posture_analysis
        : undefined;

      onComplete({
        id: user?.id || 'local',
        overallScore,
        postureScore: avgPostureScore,
        mobilityScore: avgMobilityScore,
        stabilityScore: avgStabilityScore,
        findings: uniqueIssues,
        programs: programs || [],
        postureAnalysis: avgPostureAnalysis,
      });
    } catch (err) {
      console.error('Error saving assessment:', err);
      const avgPostureAnalysis = framesDataRef.current.length > 0
        ? framesDataRef.current[Math.floor(framesDataRef.current.length / 2)].posture_analysis
        : undefined;

      onComplete({
        id: 'local',
        overallScore,
        postureScore: avgPostureScore,
        mobilityScore: avgMobilityScore,
        stabilityScore: avgStabilityScore,
        findings: uniqueIssues,
        programs: [],
        postureAnalysis: avgPostureAnalysis,
      });
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover absolute inset-0"
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

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

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {phase === 'capturing' && countdown > 0 && (
          <div className="text-center bg-black bg-opacity-50 p-8 rounded-lg">
            <div className="text-white text-6xl font-bold mb-4">{countdown}</div>
            <p className="text-white text-lg">Hold steady...</p>
          </div>
        )}

        {phase === 'processing' && (
          <div className="text-center bg-black bg-opacity-50 p-8 rounded-lg">
            <div className="w-16 h-16 border-4 border-green-400 border-t-green-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg">{status}</p>
            <p className="text-green-400 text-sm mt-2">Frames analyzed: {frameCountRef.current}</p>
          </div>
        )}
      </div>

      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent p-4 z-10">
        <div className="text-white text-sm">
          {phase === 'positioning' && 'Step 1 · Stand side-on to the camera (full body in frame)'}
          {phase === 'ready' && 'Position yourself in the frame'}
          {phase === 'capturing' && `Detection Quality: ${detectionQuality}%`}
          {phase === 'processing' && 'Processing assessment...'}
        </div>

        {phase === 'positioning' && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium w-fit ${
                centerAlignment?.aligned ? 'bg-green-500/90 text-white' : 'bg-amber-500/90 text-black'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  centerAlignment?.aligned ? 'bg-white' : 'bg-black animate-pulse'
                }`}
              />
              {centerAlignment
                ? centerAlignment.aligned
                  ? 'Aligned to the ideal line ✓'
                  : centerAlignment.message
                : 'Step onto the green line'}
            </div>
            {!sideReady && (
              <span className="text-amber-300 text-xs">Tip: stand side-on for the most accurate read</span>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 z-10">
        {phase === 'positioning' && (
          <div className="space-y-2">
            <button
              onClick={startCapture}
              disabled={!centerAlignment?.aligned}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors ${
                centerAlignment?.aligned
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-300 cursor-not-allowed'
              }`}
            >
              {centerAlignment?.aligned ? 'Start 5-Second Capture' : 'Align to the green line…'}
            </button>
            {!centerAlignment?.aligned && (
              <button
                onClick={startCapture}
                className="w-full text-white/70 hover:text-white text-sm py-1"
              >
                Capture anyway
              </button>
            )}
          </div>
        )}

        {phase === 'ready' && (
          <button
            onClick={startCapture}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Start 5-Second Capture
          </button>
        )}

        {phase === 'capturing' && (
          <div className="w-full bg-green-500 h-1 rounded-full overflow-hidden">
            <div
              className="bg-green-600 h-full transition-all duration-100"
              style={{ width: `${(countdown / 5) * 100}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
}
