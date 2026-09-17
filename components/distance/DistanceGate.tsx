'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  DistanceGateConfig,
  DEFAULT_DISTANCE_CONFIG,
  DistanceCalibrationParams,
  DistanceValidationResult,
  RawFaceMeasurement,
} from '@/lib/distanceConfig';
import {
  getSavedDistanceCalibration,
  DistanceStabilityTracker,
} from '@/lib/distanceEstimation';
import {
  detectDeviceDetails,
} from '@/lib/deviceDetection';
import { VisionEngine } from '@/lib/visionEngine';
import { installTfliteFilter } from '@/lib/suppressTFLiteLogs';
import { FacePositionGuide } from './FacePositionGuide';
import {
  Camera,
  CameraOff,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  ChevronLeft,
  UserCheck,
  SwitchCamera,
  Ruler,
} from 'lucide-react';

interface DistanceGateProps {
  config?: Partial<DistanceGateConfig>;
  onUnlockAndStart: (distanceMeters: number) => void;
  onBack?: () => void;
  language?: string;
  allowManualBypass?: boolean;
}

export const DistanceGate: React.FC<DistanceGateProps> = ({
  config: userConfig,
  onUnlockAndStart,
  onBack,
  language = 'en',
  allowManualBypass = true,
}) => {
  // Merge user config with defaults
  const activeConfig = useMemo<DistanceGateConfig>(() => ({
    ...DEFAULT_DISTANCE_CONFIG,
    ...userConfig,
  }), [userConfig]);

  const configRef = useRef<DistanceGateConfig>(activeConfig);
  useEffect(() => {
    configRef.current = activeConfig;
  }, [activeConfig]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const visionEngineRef = useRef<VisionEngine | null>(null);
  const stabilityTrackerRef = useRef<DistanceStabilityTracker>(new DistanceStabilityTracker());
  const previousIsReadyRef = useRef<boolean>(false);

  // Camera & permission states
  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'streaming' | 'denied' | 'unavailable'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const facingModeRef = useRef<'user' | 'environment'>('user');
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  // Auto-calibrated optical parameters for active device and lens (runs seamlessly in the background)
  const cameraLabelRef = useRef<string>('');
  const calibrationRef = useRef<DistanceCalibrationParams>(getSavedDistanceCalibration('user'));

  // Sync calibration when camera lens direction changes
  useEffect(() => {
    const base = detectDeviceDetails(facingMode, cameraLabelRef.current);
    calibrationRef.current = base.calibration;
  }, [facingMode]);

  // Ensure WASM delegate logs are silenced upon mounting DistanceGate
  useEffect(() => {
    installTfliteFilter();
  }, []);

  // Sync on window resize or orientation change without interrupting video stream
  useEffect(() => {
    const handleResize = () => {
      const mode = facingModeRef.current;
      const updatedDetails = detectDeviceDetails(mode, cameraLabelRef.current);
      calibrationRef.current = updatedDetails.calibration;
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        setVideoDimensions({
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Web Audio Lock Chime (Pleasant acoustic confirmation when 1.00m lock triggers)
  const playLockChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Note 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // Note 2: E5 (659.25 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.09);
      gain2.gain.setValueAtTime(0.15, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.28);

      // Note 3: G5 (783.99 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(783.99, now + 0.18);
      gain3.gain.setValueAtTime(0.18, now + 0.18);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.18);
      osc3.stop(now + 0.42);

      // Haptic confirmation vibration on mobile
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 50, 70]);
      }
    } catch {
      // AudioContext blocked or not supported
    }
  }, []);

  // Live validation state
  const [validation, setValidation] = useState<DistanceValidationResult>(() => ({
    isReady: false,
    estimatedDistanceMeters: 1.0,
    estimatedDistanceCm: 100,
    formattedDistance: '--',
    status: 'initializing',
    statusColor: 'slate',
    statusMessage: 'Starting camera sensor...',
    guidanceText: 'Please allow camera permission so we can verify the 1-metre testing distance.',
    isCentered: false,
    isDistanceAcceptable: false,
    stabilityProgress: 0,
    stabilityElapsedMs: 0,
    faceCount: 0,
    confidence: 0,
  }));

  const [rawMeasurement, setRawMeasurement] = useState<RawFaceMeasurement | null>(null);

  // Stop camera tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (visionEngineRef.current) {
      visionEngineRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Initialize and start camera stream with specific facing mode
  const startCamera = useCallback(async (targetMode: 'user' | 'environment' = facingModeRef.current) => {
    setCameraState('requesting');
    setErrorMessage(null);

    // Pause vision processing and stop old tracks
    if (visionEngineRef.current) {
      visionEngineRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unavailable');
      setErrorMessage('Camera access is not supported by this browser.');
      return;
    }

    try {
      // Progressive fallback chain for mobile Safari, Android Chrome, and desktop webcams
      let stream: MediaStream | null = null;
      const attempts: MediaStreamConstraints[] = [
        // Attempt 1: Optimal mobile/desktop constraints with ideal facing mode
        {
          video: {
            facingMode: { ideal: targetMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        // Attempt 2: Plain facing mode constraint
        {
          video: { facingMode: targetMode },
          audio: false,
        },
        // Attempt 3: Any video device fallback
        {
          video: true,
          audio: false,
        },
      ];

      for (const constraint of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          if (stream) break;
        } catch {
          // try next constraint in chain
        }
      }

      if (!stream) {
        throw new Error('Unable to access camera on this device.');
      }

      mediaStreamRef.current = stream;

      // Extract real hardware camera label to detect built-in vs external webcam
      const videoTrack = stream.getVideoTracks()[0];
      const cameraLabel = videoTrack?.label || '';
      cameraLabelRef.current = cameraLabel;

      // Auto-calibrate optical profile for active device and camera lens seamlessly in background
      const updatedDetails = detectDeviceDetails(targetMode, cameraLabel);
      calibrationRef.current = updatedDetails.calibration;

      if (videoRef.current) {
        const vid = videoRef.current;
        let isStarted = false;

        const onStreamReady = () => {
          if (isStarted) return;
          isStarted = true;
          vid.muted = true;
          vid.setAttribute('playsinline', 'true');
          vid.play().catch((e) => console.warn('Camera video play caught:', e));
          const w = vid.videoWidth || 640;
          const h = vid.videoHeight || 480;
          setVideoDimensions({ width: w, height: h });
          setCameraState('streaming');

          // Resume computer vision engine once stream is playing
          if (visionEngineRef.current) {
            visionEngineRef.current.start(vid);
          }
        };

        vid.onloadedmetadata = onStreamReady;
        vid.srcObject = stream;

        // If metadata is already loaded (common in Chromium/Edge on laptops/PCs)
        if (vid.readyState >= 1 && vid.videoWidth > 0) {
          onStreamReady();
        } else {
          // Safeguard timer so camera never hangs on "Opening camera sensor..."
          setTimeout(() => {
            if (!isStarted && vid.srcObject === stream) {
              onStreamReady();
            }
          }, 600);
        }
      }
    } catch (err: any) {
      console.warn('Camera permission or device error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('denied');
        setErrorMessage('Camera permission was denied. Please allow camera access in your browser address bar.');
      } else {
        setCameraState('unavailable');
        setErrorMessage(err.message || 'Unable to open camera on this device.');
      }
    }
  }, []);

  // Setup VisionEngine ONCE on mount (prevents expensive WASM re-instantiation on camera flip)
  useEffect(() => {
    const engine = new VisionEngine({
      onMeasurement: (measurement) => {
        setRawMeasurement(measurement);
        const res = stabilityTrackerRef.current.update(
          measurement,
          calibrationRef.current,
          configRef.current,
          Date.now(),
          facingModeRef.current
        );
        setValidation(res);

        // Trigger audio lock chime upon stability completion
        if (res.isReady && !previousIsReadyRef.current) {
          playLockChime();
        }
        previousIsReadyRef.current = res.isReady;
      },
      onError: (err) => {
        console.warn('Vision engine warning:', err);
      },
      onStatusChange: (status) => {
        if (status === 'loading') {
          setValidation((prev) => ({
            ...prev,
            statusMessage: 'Loading optical detection model...',
            guidanceText: 'Initializing biometric distance tracker...',
          }));
        }
      },
    });

    visionEngineRef.current = engine;

    // Start camera immediately on mount asynchronously
    const cameraTimer = setTimeout(() => {
      startCamera('user');
    }, 0);

    // Initialize vision engine in parallel; attach to video as soon as ready
    engine.initialize().then(() => {
      if (videoRef.current && videoRef.current.srcObject) {
        engine.start(videoRef.current);
      }
    }).catch((err) => {
      console.info('Vision engine fallback initialization:', err);
      if (videoRef.current && videoRef.current.srcObject) {
        engine.start(videoRef.current);
      }
    });

    return () => {
      clearTimeout(cameraTimer);
      stopCameraStream();
      engine.destroy();
      visionEngineRef.current = null;
    };
  }, [playLockChime, startCamera, stopCameraStream]);

  // Switch camera mode (front vs rear)
  const handleSelectFacingMode = (mode: 'user' | 'environment') => {
    if (mode === facingMode) return;
    setFacingMode(mode);
    facingModeRef.current = mode;
    previousIsReadyRef.current = false;
    stabilityTrackerRef.current.reset();
    startCamera(mode);
  };

  // Flip camera toggle
  const handleFlipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    handleSelectFacingMode(nextMode);
  };

  // Trigger test start when unlocked
  const handleStartTest = () => {
    if (!validation.isReady) return;
    stopCameraStream();
    onUnlockAndStart(validation.estimatedDistanceMeters);
  };

  // Optional manual override for field screenings if camera cannot open
  const handleManualConfirmation = () => {
    stopCameraStream();
    onUnlockAndStart(1.0);
  };

  const isRear = facingMode === 'environment';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" id="distance-gate-container">
      {/* Top Header & Navigation */}
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onBack();
            }}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-600 hover:text-slate-900 cursor-pointer bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs transition hover:bg-slate-50"
            id="btn-back-instructions"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            <span>Back to Instructions</span>
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* Main Vision Stage & Camera Viewport */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm space-y-4">
        {/* Title: Strictly "Position yourself at 1 meter" */}
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight" id="distance-gate-title">
            Position yourself at 1 meter
          </h2>
        </div>

        {/* Camera Lens Mode Selector: Front vs Rear View */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/90 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => handleSelectFacingMode('user')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              !isRear
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            id="tab-camera-front"
            title="Front selfie camera for self-screening"
          >
            <UserCheck className="w-4 h-4 text-orange-600" />
            <span>Front (Self-Test)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectFacingMode('environment')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              isRear
                ? 'bg-white text-teal-900 shadow-xs border border-teal-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            id="tab-camera-rear"
            title="Rear camera for examiners"
          >
            <Camera className="w-4 h-4 text-teal-600" />
            <span>Rear (Examiner Mode)</span>
          </button>
        </div>

        {/* Camera Stage Container with White Surround and Oval Aperture */}
        <div className="relative w-full aspect-[4/3] min-h-[320px] max-h-[400px] bg-white rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xs flex items-center justify-center">
          {/* Virtual Try-on Face Positioning Guide: Houses the oval aperture container */}
          <FacePositionGuide
            validation={validation}
            videoWidth={videoDimensions.width}
            videoHeight={videoDimensions.height}
            facingMode={facingMode}
          >
            {/* Live Video Preview: Front camera is mirrored (-scale-x-100), Rear camera is un-mirrored (scale-x-100) */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover transition-transform duration-300 ${
                isRear ? 'scale-x-100' : '-scale-x-100'
              }`}
              id="camera-stream-video"
            />
          </FacePositionGuide>

          {/* Camera Flip Quick Button */}
          {cameraState === 'streaming' && (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-sm flex items-center gap-1.5 text-xs font-bold transition cursor-pointer active:scale-95"
              title={isRear ? 'Switch to Front Camera' : 'Switch to Rear Camera'}
              id="btn-flip-camera"
            >
              <SwitchCamera className="w-4 h-4 text-orange-600" />
              <span className="hidden sm:inline">{isRear ? 'Use Front' : 'Use Rear'}</span>
            </button>
          )}

          {/* Rear Camera Indicator Banner */}
          {isRear && cameraState === 'streaming' && (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/90 text-white text-[10px] font-bold shadow-2xs backdrop-blur-xs">
              <Camera className="w-3 h-3" />
              <span>Rear Viewfinder Active</span>
            </div>
          )}

          {/* Privacy Badge on Camera Preview */}
          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 border border-slate-200 text-slate-600 text-[10px] font-semibold shadow-2xs">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Private: Local browser processing</span>
          </div>

          {/* Camera Permission Denied or Unavailable State */}
          {(cameraState === 'denied' || cameraState === 'unavailable') && (
            <div className="absolute inset-0 bg-white text-slate-800 flex flex-col items-center justify-center p-6 text-center z-20 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shadow-2xs">
                <CameraOff className="w-7 h-7 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {cameraState === 'denied' ? 'Camera Access Required' : 'Camera Unavailable'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-sm">
                  {errorMessage || 'Please enable camera permission in your browser to verify the 1-metre testing distance.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="py-2 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
            </div>
          )}

          {/* Loading / Requesting Camera State */}
          {cameraState === 'requesting' && (
            <div className="absolute inset-0 bg-white text-slate-800 flex flex-col items-center justify-center p-6 text-center z-20 space-y-3">
              <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-700">Opening camera sensor...</p>
            </div>
          )}
        </div>

        {/* 4. Action Button: START TEST with LOCKED state (unlocked when 1.00m reached) */}
        <div>
          {validation.isReady ? (
            <button
              type="button"
              onClick={handleStartTest}
              className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-base sm:text-lg rounded-2xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition cursor-pointer animate-pulse"
              id="btn-start-test-unlocked"
            >
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              <span>START VISION TEST (1.00 m LOCKED)</span>
              <ArrowRight className="w-5 h-5 stroke-[2]" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full py-4 px-6 bg-slate-200 text-slate-400 font-black text-base sm:text-lg rounded-2xl shadow-none flex items-center justify-center gap-2.5 cursor-not-allowed select-none transition-all"
              id="btn-start-test-locked"
            >
              <Lock className="w-5 h-5 text-slate-400" />
              <span>START TEST (LOCKED)</span>
            </button>
          )}
        </div>

        {/* 4. Estimated Distance and Target Distance shown BELOW Start Test button */}
        <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3" id="distance-target-card">
          <div className="grid grid-cols-2 gap-4 divide-x divide-slate-200">
            {/* Estimated Distance */}
            <div className="text-center sm:text-left sm:pl-2">
              <span className="text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider block">
                Estimated Distance
              </span>
              <div className="flex items-baseline justify-center sm:justify-start gap-1.5 mt-1">
                <span
                  className={`text-2xl sm:text-3xl font-black tracking-tight ${
                    validation.statusColor === 'green'
                      ? 'text-emerald-600'
                      : validation.statusColor === 'red'
                      ? 'text-rose-600'
                      : validation.statusColor === 'orange' || validation.statusColor === 'amber'
                      ? 'text-amber-600'
                      : 'text-slate-700'
                  }`}
                  id="estimated-distance-value"
                >
                  {validation.formattedDistance}
                </span>
                {validation.formattedDistance !== '--' && (
                  <span className="text-xs font-bold text-slate-400">
                    (≈ {Math.round(validation.estimatedDistanceMeters * 100)} cm)
                  </span>
                )}
              </div>
            </div>

            {/* Target Distance */}
            <div className="text-center sm:text-left pl-4">
              <span className="text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider block">
                Target Distance
              </span>
              <div className="flex items-baseline justify-center sm:justify-start gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-orange-600" id="target-distance-value">
                  1.00 m
                </span>
                <span className="text-xs font-bold text-slate-400 block sm:inline sm:ml-1.5">(100 cm)</span>
              </div>
            </div>
          </div>

          {/* Real-time Guidance Message & Stability Hold Bar */}
          <div className="pt-2.5 border-t border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    validation.statusColor === 'green'
                      ? 'bg-emerald-500 animate-pulse'
                      : validation.statusColor === 'red'
                      ? 'bg-rose-500'
                      : validation.statusColor === 'orange' || validation.statusColor === 'amber'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span
                  className={`${
                    validation.statusColor === 'green'
                      ? 'text-emerald-700'
                      : validation.statusColor === 'red'
                      ? 'text-rose-700'
                      : validation.statusColor === 'orange' || validation.statusColor === 'amber'
                      ? 'text-amber-700'
                      : 'text-slate-600'
                  }`}
                >
                  {validation.statusMessage}
                </span>
              </div>
              {validation.status === 'perfect_distance' && !validation.isReady && (
                <span className="text-emerald-700 text-[11px] font-bold">
                  Holding steady: {Math.round(validation.stabilityProgress * 100)}%
                </span>
              )}
            </div>

            {validation.status === 'perfect_distance' && !validation.isReady && (
              <div className="w-full h-1.5 rounded-full bg-emerald-200/80 overflow-hidden mt-2">
                <div
                  className="h-full bg-emerald-600 transition-all duration-100 ease-linear rounded-full"
                  style={{ width: `${validation.stabilityProgress * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 5. Highlighted Manual Ruler / Tape Bypass Button */}
        {(cameraState === 'denied' || cameraState === 'unavailable' || allowManualBypass) && (
          <div className="pt-1">
            <button
              type="button"
              onClick={handleManualConfirmation}
              className="w-full p-4 rounded-2xl bg-amber-50 hover:bg-amber-100/90 active:scale-[0.99] border-2 border-amber-300 hover:border-amber-400 text-amber-950 transition-all flex items-center justify-between gap-3 group cursor-pointer shadow-sm"
              id="btn-manual-distance-bypass"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Ruler className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-amber-950 leading-snug">
                    Measured with physical 1 meter ruler/tape?
                  </div>
                  <div className="text-xs font-bold text-amber-800 mt-0.5">
                    Tap to continue manually
                  </div>
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-amber-600 group-hover:bg-amber-700 text-white text-xs font-extrabold shrink-0 flex items-center gap-1.5 shadow-xs transition-colors">
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
