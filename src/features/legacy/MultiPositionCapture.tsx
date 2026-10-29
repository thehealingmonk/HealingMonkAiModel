import { useEffect, useRef, useState } from 'react';
import { openCamera, getPreferredLens } from '@/lib/camera';
import { initializePoseLandmarker, detectPose, drawPoseSkeleton } from '@/lib/poseDetection';
import { analyzePosture } from '@/lib/poseAnalyzer';
import { PAIN_AREAS, PosePosition, CapturedImage } from '@/lib/painAssessment';
import { speak, stopSpeech } from '@/services/voice.service';
import { Volume2, Camera, CheckCircle2, AlertCircle, SwitchCamera } from 'lucide-react';

interface Props {
  selectedAreas: string[];
  onComplete: (images: CapturedImage[]) => void;
  onSkip: () => void;
  language?: 'en' | 'hi';
}

export default function MultiPositionCapture({ selectedAreas, onComplete, onSkip, language = 'hi' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [currentAreaIndex, setCurrentAreaIndex] = useState(0);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [status, setStatus] = useState('Loading...');
  const [phase, setPhase] = useState<'loading' | 'guidance' | 'capturing' | 'countdown' | 'complete'>('loading');
  const [countdown, setCountdown] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [quality, setQuality] = useState(0);
  const frameCountRef = useRef(0);
  const animationFrameRef = useRef<number>();

  // (Re)open the camera with the requested lens, stopping any previous stream
  // first so switching front↔back never leaves a second camera running.
  const startStream = async (mode: 'user' | 'environment', onFirstReady?: () => void) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await openCamera(mode);
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (onFirstReady) {
        videoRef.current.addEventListener('loadedmetadata', onFirstReady, { once: true });
      }
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
        await Promise.all([
          initializePoseLandmarker(),
          startStream(lens, () => {
            setPhase('guidance');
            beginAssessment();
          }),
        ]);
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentArea = () => {
    const areaId = selectedAreas[currentAreaIndex];
    return PAIN_AREAS.find((a) => a.id === areaId);
  };

  const getCurrentPosition = (): PosePosition | null => {
    const area = getCurrentArea();
    if (area && currentPositionIndex < area.positions.length) {
      return area.positions[currentPositionIndex];
    }
    return null;
  };

  const beginAssessment = async () => {
    const area = getCurrentArea();
    if (!area) return;

    setIsSpeaking(true);
    const message = language === 'hi'
      ? `हम अब आपके ${area.nameHi} का मूल्यांकन करेंगे। मैं आपको विभिन्न स्थितियों के माध्यम से गाइड करूंगा। कृपया मेरे निर्देशों का सावधानीपूर्वक पालन करें।`
      : `We will now assess your ${area.name}. I will guide you through different positions. Please follow my instructions carefully.`;

    await speak({
      text: message,
      lang: language,
    });
    setIsSpeaking(false);

    guidePosition();
  };

  const guidePosition = async () => {
    const position = getCurrentPosition();
    if (!position) {
      moveToNextArea();
      return;
    }

    const area = getCurrentArea();
    const displayName = language === 'hi' ? area?.nameHi : area?.name;
    const positionName = language === 'hi' ? position.nameHi : position.name;
    setStatus(`${displayName} - ${positionName}`);
    setPhase('guidance');
    setIsSpeaking(true);

    const voiceText = (language === 'hi' && position.voiceGuideHi) || position.voiceGuide;
    await speak({
      text: voiceText,
      lang: language,
    });

    setIsSpeaking(false);
    setPhase('countdown');
    startCountdown(position.duration);
  };

  const startCountdown = (duration: number) => {
    let remaining = 3;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining--;
      if (remaining >= 0) {
        setCountdown(remaining);
      } else {
        clearInterval(interval);
        startCapture(duration);
      }
    }, 1000);
  };

  const startCapture = async (duration: number) => {
    setPhase('capturing');
    frameCountRef.current = 0;
    let captureEndTime = Date.now() + duration * 1000;

    const processContinuously = async () => {
      if (Date.now() >= captureEndTime) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        captureFrame();
        moveToNextPosition();
        return;
      }

      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const result = await detectPose(videoRef.current);
        if (result && result.landmarks) {
          drawPoseSkeleton(canvasRef.current!, result.landmarks, videoRef.current.videoWidth, videoRef.current.videoHeight);

          const { score, confidence } = analyzePosture(result.landmarks);
          frameCountRef.current++;
          setQuality(Math.round(confidence));
          setStatus(`Capturing... ${frameCountRef.current}s - Quality: ${Math.round(confidence)}%`);
        }
      }

      animationFrameRef.current = requestAnimationFrame(processContinuously);
    };

    animationFrameRef.current = requestAnimationFrame(processContinuously);
  };

  const captureFrame = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const position = getCurrentPosition();
    const area = getCurrentArea();

    if (position && area) {
      const newImage: CapturedImage = {
        id: `${area.id}_${position.id}_${Date.now()}`,
        positionId: position.id,
        imageData,
        timestamp: new Date(),
        metadata: {
          areaName: area.name,
          positionName: position.name,
        },
      };

      setCapturedImages((prev) => [...prev, newImage]);
    }
  };

  const moveToNextPosition = async () => {
    const area = getCurrentArea();
    if (!area) return;

    if (currentPositionIndex < area.positions.length - 1) {
      setCurrentPositionIndex((prev) => prev + 1);
      setTimeout(() => guidePosition(), 1000);
    } else {
      moveToNextArea();
    }
  };

  const moveToNextArea = async () => {
    if (currentAreaIndex < selectedAreas.length - 1) {
      setCurrentAreaIndex((prev) => prev + 1);
      setCurrentPositionIndex(0);
      setIsSpeaking(true);

      const nextArea = PAIN_AREAS.find((a) => a.id === selectedAreas[currentAreaIndex + 1]);
      const message = language === 'hi'
        ? `बहुत अच्छा! अब चलिए आपके ${nextArea?.nameHi} का मूल्यांकन करते हैं।`
        : `Great! Now let's assess your ${nextArea?.name}.`;

      await speak({
        text: message,
        lang: language,
      });

      setIsSpeaking(false);
      setTimeout(() => guidePosition(), 1000);
    } else {
      completeAssessment();
    }
  };

  const completeAssessment = async () => {
    setPhase('complete');
    setIsSpeaking(true);
    const message = language === 'hi'
      ? 'उत्कृष्ट! मूल्यांकन पूरा हो गया है। हम अब आपकी अनुशंसाओं के साथ विस्तृत रिपोर्ट तैयार करेंगे।'
      : 'Excellent! The assessment is complete. We will now generate your detailed report with recommendations.';

    await speak({
      text: message,
      lang: language,
    });
    setIsSpeaking(false);
    setTimeout(() => onComplete(capturedImages), 2000);
  };

  const progress = Math.round(
    ((currentAreaIndex * 4 + currentPositionIndex) / (selectedAreas.length * 4)) * 100
  );

  return (
    <div className="min-h-screen bg-black flex flex-col">
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

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent p-4 z-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-start mb-3">
            <div className="text-white">
              <p className="text-sm opacity-75">
                {getCurrentArea()?.name} - Position {currentPositionIndex + 1} of {getCurrentArea()?.positions.length}
              </p>
              <p className="text-lg font-semibold">{getCurrentPosition()?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white opacity-75">
                Area {currentAreaIndex + 1} of {selectedAreas.length}
              </p>
              <p className="text-2xl font-bold text-green-400">{progress}%</p>
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1 overflow-hidden">
            <div
              className="bg-green-500 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Central Guidance */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {phase === 'guidance' && !isSpeaking && (
          <div className="text-center bg-black bg-opacity-60 p-8 rounded-lg backdrop-blur">
            <p className="text-white text-lg mb-2">Get Ready</p>
            <p className="text-gray-200 text-sm max-w-xs">{getCurrentPosition()?.description}</p>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="text-center">
            <div className="text-white text-7xl font-bold mb-4 drop-shadow-lg">{countdown}</div>
            <p className="text-gray-200 text-lg">Get in position...</p>
          </div>
        )}

        {phase === 'capturing' && (
          <div className="text-center">
            <Camera className="w-12 h-12 text-green-400 mx-auto mb-4 animate-pulse" />
            <p className="text-white text-lg">{status}</p>
          </div>
        )}

        {isSpeaking && (
          <div className="flex flex-col items-center gap-3">
            <Volume2 className="w-12 h-12 text-green-400 animate-bounce" />
            <p className="text-white text-center text-lg">Listening to instructions...</p>
          </div>
        )}
      </div>

      {/* Bottom Status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 z-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-800 bg-opacity-60 rounded p-3 text-center">
              <p className="text-xs text-gray-400">Images Captured</p>
              <p className="text-2xl font-bold text-white">{capturedImages.length}</p>
            </div>
            <div className="bg-gray-800 bg-opacity-60 rounded p-3 text-center">
              <p className="text-xs text-gray-400">Detection Quality</p>
              <p className={`text-2xl font-bold ${quality >= 80 ? 'text-green-400' : quality >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {quality}%
              </p>
            </div>
            <div className="bg-gray-800 bg-opacity-60 rounded p-3 text-center">
              <p className="text-xs text-gray-400">Frame Captures</p>
              <p className="text-2xl font-bold text-white">{frameCountRef.current}</p>
            </div>
          </div>

          {phase === 'complete' && (
            <div className="bg-green-600 text-white p-4 rounded-lg flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6" />
              <span className="font-semibold">Assessment Complete!</span>
            </div>
          )}
        </div>
      </div>

      {/* Skip Button */}
      <button
        onClick={onSkip}
        className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm z-30"
      >
        Skip Assessment
      </button>
    </div>
  );
}
