'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Header } from '@/components/branding/Header';
import { TumblingE, StandardTumblingE } from '@/components/optotype/TumblingE';
import {
  SupportedLanguage,
  OptotypeOrientation,
  ScreeningSession,
  EyeAcuityResult,
  ScreeningResponse,
  CalibrationData,
} from '@/lib/types';
import { TRANSLATIONS } from '@/lib/i18n';
import {
  calculateOptotypeHeightMm,
  DEFAULT_FALLBACK_PX_PER_MM,
  detectDeviceScreenType,
  ONE_METRE_6_18_HEIGHT_MM,
  ONE_METRE_6_18_STROKE_MM,
  STANDARD_1M_6_18_OPTOTYPE,
} from '@/lib/optotypeMath';
import { playChime } from '@/lib/audioService';
import { saveScreeningSession, getSavedLanguage, savePreferredLanguage } from '@/lib/storage';
import {
  PictorialOneMeter,
  PictorialCoverOneEye,
  PictorialCoverNextEye,
  PictorialPassingCriteria,
  PictorialEDirection,
} from '@/components/screening/InstructionPictorials';
import { SankaraLogo } from '@/components/branding/SankaraLogo';
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  ShieldCheck,
  RotateCcw,
  LogOut,
  Phone,
  RefreshCw,
  Database,
} from 'lucide-react';
import { DistanceGate } from '@/components/distance/DistanceGate';
import { validateIndianMobile, saveVisionTestResult } from '@/lib/visionTestService';
import { DatabaseRecordsModal } from '@/components/records/DatabaseRecordsModal';

type Step = 'mobile_number' | 'instructions' | 'distance_gate' | 'game' | 'score_store';

// Standardized 5×5 Tumbling E Optotype dimensions for 1-metre 6/18 visual acuity:
// Letter height: 4.37 mm, Letter width: 4.37 mm, Stroke thickness: 0.874 mm (15 arcminutes at 1.00 m)
const FIXED_SCREENING_SYMBOL_SIZE_MM = ONE_METRE_6_18_HEIGHT_MM; // 4.37 mm
const FIXED_STROKE_THICKNESS_MM = ONE_METRE_6_18_STROKE_MM;      // 0.874 mm

interface ScreeningSymbol {
  symbolNumber: number; // 1, 2, 3, 4, 5
  sizeMm: number;       // 4.37
  label: string;
}

// 5 Tumbling-E symbols per eye conforming strictly to 5x5 optotype geometry
const SCREENING_SYMBOLS: ScreeningSymbol[] = [
  { symbolNumber: 1, sizeMm: ONE_METRE_6_18_HEIGHT_MM, label: 'Symbol 1 of 5' },
  { symbolNumber: 2, sizeMm: ONE_METRE_6_18_HEIGHT_MM, label: 'Symbol 2 of 5' },
  { symbolNumber: 3, sizeMm: ONE_METRE_6_18_HEIGHT_MM, label: 'Symbol 3 of 5' },
  { symbolNumber: 4, sizeMm: ONE_METRE_6_18_HEIGHT_MM, label: 'Symbol 4 of 5' },
  { symbolNumber: 5, sizeMm: ONE_METRE_6_18_HEIGHT_MM, label: 'Symbol 5 of 5' },
];

const TEST_DISTANCE_MM = 1000; // Exactly 1 metre distance
const TOTAL_TEST_SYMBOLS = 5;

function getSnellenAcuityFromPassed(passedCount: number): string {
  switch (passedCount) {
    case 5:
      return '6/18 (5/5)';
    case 4:
      return '6/18 (4/5)';
    case 3:
      return '< 6/18 (3/5)';
    case 2:
      return '< 6/18 (2/5)';
    case 1:
      return '< 6/18 (1/5)';
    default:
      return '< 6/18 (0/5)';
  }
}

const ORIENTATIONS: OptotypeOrientation[] = ['up', 'down', 'left', 'right'];

function generateOpCardId(): string {
  const randNum = Math.floor(100000 + Math.random() * 900000);
  return `SEH-OP-2026-${randNum}`;
}

export default function HomePage() {
  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window === 'undefined') return 'en';
    try {
      const saved = getSavedLanguage() as SupportedLanguage;
      return ['en', 'te', 'hi', 'ta', 'kn'].includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });
  const [currentStep, setCurrentStep] = useState<Step>('mobile_number');

  // Step 1: Mobile number validation and session state
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [currentTest, setCurrentTest] = useState<{ mobileNumber: string }>({ mobileNumber: '' });

  // Database save state for vision_test_results
  const [dbSaveState, setDbSaveState] = useState<{
    status: 'idle' | 'saving' | 'saved' | 'error';
    error?: string;
    savedScore?: string;
    savedMobile?: string;
  }>({ status: 'idle' });

  // Prevent duplicate database submissions across re-renders
  const savedSessionsRef = useRef<Set<string>>(new Set());

  // Database records modal toggle
  const [isRecordsModalOpen, setIsRecordsModalOpen] = useState<boolean>(false);

  const handleMobileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateIndianMobile(mobileNumber);
    if (!validation.isValid) {
      setMobileError(validation.error || 'Please enter a valid 10-digit Indian mobile number');
      return;
    }
    setMobileError(null);
    const cleanNumber = mobileNumber.trim();
    setCurrentTest({ mobileNumber: cleanNumber });
    // Reset database status for the new test session
    setDbSaveState({ status: 'idle' });
    // Proceed to existing vision test flow
    setCurrentStep('instructions');
  };

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    savePreferredLanguage(lang);
  };

  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  // Calibration & Hardware Screen Density: Automatically detects all device types (Mobile, Tablet, Laptop, Desktop)
  const [currentPxPerMm, setCurrentPxPerMm] = useState<number>(() => {
    return detectDeviceScreenType().pxPerMm;
  });

  // Automatically detects wherever the app is opened, dynamically adapting on resize or orientation change
  useEffect(() => {
    const handleDeviceUpdate = () => {
      const est = detectDeviceScreenType();
      setCurrentPxPerMm(est.pxPerMm);
    };

    window.addEventListener('resize', handleDeviceUpdate);
    window.addEventListener('orientationchange', handleDeviceUpdate);
    return () => {
      window.removeEventListener('resize', handleDeviceUpdate);
      window.removeEventListener('orientationchange', handleDeviceUpdate);
    };
  }, []);

  const calibration: CalibrationData = useMemo(() => {
    return {
      pxPerMm: currentPxPerMm,
      calibratedObjectWidthMm: ONE_METRE_6_18_HEIGHT_MM,
      userAdjustedPx: Math.round(ONE_METRE_6_18_HEIGHT_MM * currentPxPerMm),
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      screenWidth: typeof window !== 'undefined' ? window.screen.width : 1920,
      screenHeight: typeof window !== 'undefined' ? window.screen.height : 1080,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      calibratedAt: '2026-01-01T00:00:00.000Z',
      method: 'preset',
    };
  }, [currentPxPerMm]);

  // Screening ID generated for record keeping
  const [screeningId, setScreeningId] = useState<string>(() => generateOpCardId());

  // Game state
  const [gameEye, setGameEye] = useState<'right' | 'left'>('right');
  const [levelIndex, setLevelIndex] = useState(0);
  const [currentOrientation, setCurrentOrientation] = useState<OptotypeOrientation>('right');
  const [rightTrialsPassed, setRightTrialsPassed] = useState(0);
  const [leftTrialsPassed, setLeftTrialsPassed] = useState(0);
  const [rightResponses, setRightResponses] = useState<boolean[]>([]);
  const [leftResponses, setLeftResponses] = useState<boolean[]>([]);
  const [scorePoints, setScorePoints] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isCoveringFirstEye, setIsCoveringFirstEye] = useState(false);
  const [isSwitchingEyes, setIsSwitchingEyes] = useState(false);
  const [gameResponses, setGameResponses] = useState<ScreeningResponse[]>([]);

  // Stored Results
  const [savedSessionId, setSavedSessionId] = useState<string>('');
  const [rightEyeFinalAcuity, setRightEyeFinalAcuity] = useState('6/18');
  const [leftEyeFinalAcuity, setLeftEyeFinalAcuity] = useState('6/18');
  const [colourVisionOutcome, setColourVisionOutcome] = useState<'normal' | 'concern'>('normal');
  const [verifiedDistanceMeters, setVerifiedDistanceMeters] = useState<number>(1.0);

  // Fixed optotype dimension for ALL screening symbols: Exactly 4.37 mm length * breadth (0.874 mm stroke thickness)
  const currentSymbol = SCREENING_SYMBOLS[levelIndex] || SCREENING_SYMBOLS[0];
  const optotypeSizeMm = FIXED_SCREENING_SYMBOL_SIZE_MM; // 4.37 mm = Standard 6/18 optotype at 1.00 metre

  // Start vision game - first opens step to close left eye and prepare right eye
  const handleStartGame = (distance: number = 1.0) => {
    setVerifiedDistanceMeters(distance);
    setScreeningId(generateOpCardId());
    setGameEye('right');
    setLevelIndex(0);
    setRightTrialsPassed(0);
    setLeftTrialsPassed(0);
    setRightResponses([]);
    setLeftResponses([]);
    setScorePoints(0);
    setIsAdvancing(false);
    setIsCoveringFirstEye(true);
    setIsSwitchingEyes(false);
    setGameResponses([]);
    setCurrentOrientation(ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)]);
    setCurrentStep('game');
  };

  const startFirstEyeTest = () => {
    setIsCoveringFirstEye(false);
  };

  // Complete and store final session
  const finishAndStoreScreening = useCallback((odPassed: number, osPassed: number, finalRightResp?: boolean[], finalLeftResp?: boolean[]) => {
    const odAcuity = getSnellenAcuityFromPassed(odPassed);
    const osAcuity = getSnellenAcuityFromPassed(osPassed);

    setRightEyeFinalAcuity(odAcuity);
    setLeftEyeFinalAcuity(osAcuity);
    setColourVisionOutcome('normal');

    const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedSessionId(newSessionId);

    // Rule 4: If a person is reading less than 4 out 5 symbol he or she would need further eye testing
    const rightPassedThreshold = odPassed >= 4;
    const leftPassedThreshold = osPassed >= 4;
    const needsFurtherTesting = !rightPassedThreshold || !leftPassedThreshold;
    const overallStatus = needsFurtherTesting ? 'recheck' : 'normal';

    const rightEyeResult: EyeAcuityResult = {
      eye: 'right',
      smallestIdentifiedMm: optotypeSizeMm,
      snellenEquivalent: odAcuity,
      logMarEquivalent: odAcuity === '6/6' ? 0.0 : 0.18,
      trialsPassed: odPassed,
      totalTrials: TOTAL_TEST_SYMBOLS,
      passedThreshold: rightPassedThreshold,
      rawResponses: gameResponses.filter((r) => r.eye === 'right'),
    };

    const leftEyeResult: EyeAcuityResult = {
      eye: 'left',
      smallestIdentifiedMm: optotypeSizeMm,
      snellenEquivalent: osAcuity,
      logMarEquivalent: osAcuity === '6/6' ? 0.0 : 0.18,
      trialsPassed: osPassed,
      totalTrials: TOTAL_TEST_SYMBOLS,
      passedThreshold: leftPassedThreshold,
      rawResponses: gameResponses.filter((r) => r.eye === 'left'),
    };

    const session: ScreeningSession = {
      sessionId: newSessionId,
      studentId: screeningId,
      opCardId: screeningId,
      qrId: screeningId,
      schoolId: 'sankara-outreach-01',
      schoolName: 'Sankara Community Vision Screening',
      gradeClass: '1m Standard Protocol',
      section: 'A',
      deviceId: 'web-browser',
      startedAt: new Date(Date.now() - 120000).toISOString(),
      completedAt: new Date().toISOString(),
      testDistanceCm: 100,
      calibration,
      rightEyeResult,
      leftEyeResult,
      overallStatus,
      referralRequired: needsFurtherTesting,
      referralStatus: needsFurtherTesting ? 'recommended' : undefined,
      clinicalNotes: `Sankara 1m Protocol: 5 standardized Tumbling-E symbols tested per eye. First Eye (with other eye closed): ${odPassed}/5 symbols (${odAcuity}, ${rightPassedThreshold ? 'Pass' : 'Needs Further Eye Testing'}). Next Eye (with first eye closed): ${osPassed}/5 symbols (${osAcuity}, ${leftPassedThreshold ? 'Pass' : 'Needs Further Eye Testing'}). Criteria: <4/5 symbols requires further eye testing. Overall: ${needsFurtherTesting ? 'Needs Further Eye Testing at Sankara Eye Hospital' : 'Normal Vision'}.`,
      syncStatus: 'synced',
      offlineCreated: false,
      responses: gameResponses,
    };

    // Store into local and camp storage
    saveScreeningSession(session);
    playChime('celebration');
    setCurrentStep('score_store');

    // Automatically save mobile number and final score to vision_test_results database table
    const finalVisionScore = `${odPassed}/5 , ${osPassed}/5`;
    if (currentTest.mobileNumber && !savedSessionsRef.current.has(newSessionId)) {
      savedSessionsRef.current.add(newSessionId);
      setDbSaveState({
        status: 'saving',
        savedMobile: currentTest.mobileNumber,
        savedScore: finalVisionScore,
      });

      saveVisionTestResult({
        mobileNumber: currentTest.mobileNumber,
        visionScore: finalVisionScore,
      }).then((res) => {
        if (res.success) {
          setDbSaveState({
            status: 'saved',
            savedMobile: currentTest.mobileNumber,
            savedScore: finalVisionScore,
          });
        } else {
          setDbSaveState({
            status: 'error',
            error: res.error || 'Failed to save to database',
            savedMobile: currentTest.mobileNumber,
            savedScore: finalVisionScore,
          });
        }
      });
    }
  }, [optotypeSizeMm, gameResponses, screeningId, calibration, currentTest.mobileNumber]);

  // Direction answer handler in Game
  const handleDirectionAnswer = useCallback((answer: OptotypeOrientation) => {
    if (isAdvancing || isSwitchingEyes) return;

    const isCorrect = answer === currentOrientation;
    const responseRecord: ScreeningResponse = {
      responseId: `resp-${Date.now()}`,
      sessionId: savedSessionId || 'active-session',
      eye: gameEye,
      questionNumber: levelIndex + 1,
      optotypeOrientation: currentOrientation,
      optotypeSizeMm,
      snellenEquivalent: '6/18',
      expectedAnswer: currentOrientation,
      userAnswer: answer,
      correct: isCorrect,
      responseTimeMs: 850,
      timestamp: new Date().toISOString(),
    };

    setGameResponses((prev) => [...prev, responseRecord]);

    let updatedRightPassed = rightTrialsPassed;
    let updatedLeftPassed = leftTrialsPassed;
    let updatedRightResp = rightResponses;
    let updatedLeftResp = leftResponses;

    if (gameEye === 'right') {
      updatedRightResp = [...rightResponses, isCorrect];
      setRightResponses(updatedRightResp);
      if (isCorrect) {
        updatedRightPassed = rightTrialsPassed + 1;
        setRightTrialsPassed(updatedRightPassed);
      }
    } else {
      updatedLeftResp = [...leftResponses, isCorrect];
      setLeftResponses(updatedLeftResp);
      if (isCorrect) {
        updatedLeftPassed = leftTrialsPassed + 1;
        setLeftTrialsPassed(updatedLeftPassed);
      }
    }

    if (isCorrect) {
      setScorePoints((prev) => prev + 10);
    }

    setIsAdvancing(true);

    // Transition smoothly to next symbol without blocking pop-up banners
    setTimeout(() => {
      setIsAdvancing(false);
      const nextLevel = levelIndex + 1;

      if (nextLevel < TOTAL_TEST_SYMBOLS) {
        // Next symbol of 5
        setLevelIndex(nextLevel);
        const randDir = ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)];
        setCurrentOrientation(randDir);
      } else {
        // Finished all 5 symbols of current eye
        if (gameEye === 'right') {
          // Switch to Next Eye
          setIsSwitchingEyes(true);
        } else {
          // Finished both eyes -> Store and show score!
          finishAndStoreScreening(
            updatedRightPassed,
            updatedLeftPassed,
            updatedRightResp,
            updatedLeftResp
          );
        }
      }
    }, 180);
  }, [
    isAdvancing,
    isSwitchingEyes,
    currentOrientation,
    savedSessionId,
    gameEye,
    levelIndex,
    optotypeSizeMm,
    rightTrialsPassed,
    leftTrialsPassed,
    rightResponses,
    leftResponses,
    finishAndStoreScreening,
  ]);

  const startNextEye = () => {
    setIsSwitchingEyes(false);
    setGameEye('left');
    setLevelIndex(0);
    setCurrentOrientation(ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)]);
  };

  // Screen again / replay for next screening session
  const handleScreenAgain = () => {
    setDbSaveState({ status: 'idle' });
    setCurrentStep('mobile_number');
  };

  const handleRetryDbSave = async () => {
    if (!currentTest.mobileNumber) return;
    const currentScore = `${rightTrialsPassed}/5 , ${leftTrialsPassed}/5`;
    setDbSaveState({
      status: 'saving',
      savedMobile: currentTest.mobileNumber,
      savedScore: currentScore,
    });
    const res = await saveVisionTestResult({
      mobileNumber: currentTest.mobileNumber,
      visionScore: currentScore,
    });
    if (res.success) {
      setDbSaveState({
        status: 'saved',
        savedMobile: currentTest.mobileNumber,
        savedScore: currentScore,
      });
    } else {
      setDbSaveState({
        status: 'error',
        error: res.error || 'Failed to save to database',
        savedMobile: currentTest.mobileNumber,
        savedScore: currentScore,
      });
    }
  };

  // Direction answer trigger with subtle visual highlight feedback and haptic/chime
  const [activeHighlightDir, setActiveHighlightDir] = useState<OptotypeOrientation | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTriggerTimeRef = useRef<number>(0);

  const triggerAnswer = useCallback(
    (dir: OptotypeOrientation) => {
      if (isAdvancing || isSwitchingEyes || isCoveringFirstEye) return;
      const now = Date.now();
      if (now - lastTriggerTimeRef.current < 260) return;
      lastTriggerTimeRef.current = now;

      setActiveHighlightDir(dir);
      setTimeout(() => setActiveHighlightDir(null), 200);
      playChime('tap');
      handleDirectionAnswer(dir);
    },
    [isAdvancing, isSwitchingEyes, isCoveringFirstEye, handleDirectionAnswer]
  );

  // Touch screen swiping: swipe above/up, below/down, left, or right anywhere on screen
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isAdvancing || isSwitchingEyes || isCoveringFirstEye) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const minSwipeDistance = 25; // 25px threshold for responsive touch screen swipe

    if (Math.max(absX, absY) >= minSwipeDistance) {
      let dir: OptotypeOrientation;
      if (absX > absY) {
        dir = deltaX > 0 ? 'right' : 'left';
      } else {
        dir = deltaY > 0 ? 'down' : 'up';
      }
      triggerAnswer(dir);
    }
    touchStartRef.current = null;
  };

  // Pointer drag for mouse, trackpad, or stylus gestures
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.isPrimary) {
      pointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
      };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current || isAdvancing || isSwitchingEyes || isCoveringFirstEye) return;
    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const minSwipeDistance = 28;

    if (Math.max(absX, absY) >= minSwipeDistance) {
      let dir: OptotypeOrientation;
      if (absX > absY) {
        dir = deltaX > 0 ? 'right' : 'left';
      } else {
        dir = deltaY > 0 ? 'down' : 'up';
      }
      triggerAnswer(dir);
    }
    pointerStartRef.current = null;
  };

  // Keyboard arrow listeners for desktop / laptop testing
  React.useEffect(() => {
    if (currentStep !== 'game') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsCoveringFirstEye(false);
        setIsSwitchingEyes(false);
        setCurrentStep('instructions');
        return;
      }
      if (isCoveringFirstEye) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startFirstEyeTest();
        }
        return;
      }
      if (isSwitchingEyes) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startNextEye();
        }
        return;
      }
      if (isAdvancing) return;
      const key = e.key.toLowerCase();
      if (e.key === 'ArrowUp' || key === 'w') {
        e.preventDefault();
        triggerAnswer('up');
      } else if (e.key === 'ArrowDown' || key === 's') {
        e.preventDefault();
        triggerAnswer('down');
      } else if (e.key === 'ArrowLeft' || key === 'a') {
        e.preventDefault();
        triggerAnswer('left');
      } else if (e.key === 'ArrowRight' || key === 'd') {
        e.preventDefault();
        triggerAnswer('right');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, isAdvancing, isSwitchingEyes, isCoveringFirstEye, triggerAnswer]);

  return (
    <div className="min-h-screen bg-[#FFFDF9] flex flex-col justify-between selection:bg-orange-100 text-slate-900 font-sans">
      {currentStep !== 'game' && (
        <Header
          currentLanguage={language}
          onLanguageChange={handleLanguageChange}
          onOpenRecords={() => setIsRecordsModalOpen(true)}
        />
      )}

      <main className={currentStep === 'game' ? 'flex-1 w-full flex flex-col items-center justify-center' : 'max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col justify-center w-full'}>
        {/* ========================================================================= */}
        {/* STEP 1: MOBILE NUMBER ENTRY (MANDATORY)                                   */}
        {/* ========================================================================= */}
        {currentStep === 'mobile_number' && (
          <div className="w-full max-w-md mx-auto bg-white rounded-[2rem] p-6 sm:p-8 border border-orange-100 shadow-sm text-center" id="step-mobile-number">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-50 border border-orange-200/90 text-orange-600 flex items-center justify-center mb-4 shadow-xs">
              <Phone className="w-7 h-7" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight" id="title-mobile-input">
              Enter your mobile number
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 font-medium">
              Please enter your 10-digit mobile number to begin the vision test.
            </p>

            <form onSubmit={handleMobileSubmit} className="mt-6 text-left">
              <label htmlFor="input-mobile-number" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                10-digit Mobile Number <span className="text-orange-600">*</span>
              </label>

              <div className="relative">
                <input
                  type="tel"
                  id="input-mobile-number"
                  value={mobileNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setMobileNumber(val);
                    if (mobileError) setMobileError(null);
                  }}
                  placeholder="e.g. 9876543210"
                  className={`w-full px-4 py-3.5 bg-slate-50 border rounded-2xl text-base sm:text-lg font-mono tracking-wider focus:outline-none transition ${
                    mobileError
                      ? 'border-rose-400 focus:ring-2 focus:ring-rose-200 bg-rose-50/30'
                      : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
                  }`}
                  maxLength={10}
                  inputMode="numeric"
                  autoFocus
                  autoComplete="tel"
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {mobileNumber.length}/10
                </div>
              </div>

              {mobileError && (
                <p className="mt-2 text-xs font-bold text-rose-600 flex items-center gap-1.5" id="mobile-error-message">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{mobileError}</span>
                </p>
              )}

              <button
                type="submit"
                className="w-full mt-6 py-4 px-6 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-extrabold text-base sm:text-lg rounded-2xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                id="btn-start-test-mobile"
              >
                <span>Start Test</span>
                <ArrowRight className="w-5 h-5 stroke-[2]" />
              </button>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                <span>Mandatory for test session record • No OTP required</span>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* INSTRUCTIONS                                                              */}
        {/* ========================================================================= */}
        {currentStep === 'instructions' && (
          <div className="w-full max-w-2xl mx-auto bg-white rounded-[2rem] p-5 sm:p-8 border border-orange-100 shadow-sm" id="step-instructions">
            {currentTest.mobileNumber && (
              <div className="flex items-center justify-between bg-orange-50/60 border border-orange-200/80 rounded-xl px-3.5 py-2 mb-4 text-xs">
                <span className="text-slate-700 font-semibold">
                  Screening session for: <strong className="font-mono text-slate-900">{currentTest.mobileNumber}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep('mobile_number')}
                  className="text-orange-700 hover:text-orange-900 font-bold underline cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Vision Screening Instructions
              </h1>
              <p className="text-sm sm:text-base text-slate-800 font-bold mt-1.5" id="instructions-subheading">
                Please follow the four rules below:
              </p>
            </div>

            {/* Instruction Bento Cards (The 4 Rules with Pictorials) */}
            <div className="space-y-4 mb-6">
              {/* Instruction 1: 1 Meter Distance */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-orange-50/40 border border-orange-200/90 flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 transition-all hover:bg-orange-50/70">
                {/* Pictorial 1: Device kept at 1 meter distance */}
                <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-white border border-orange-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative group">
                  <PictorialOneMeter className="w-full h-full" />
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] font-black flex items-center justify-center shadow-xs">
                    1
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <div>
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                        Position yourself at 1 meter
                      </h3>
                    </div>
                    <span className="self-center sm:self-auto shrink-0 px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[10px] font-black uppercase">
                      1 Meter
                    </span>
                  </div>
                </div>
              </div>

              {/* Instruction 2: Cover Left Eye */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-orange-50/40 border border-orange-200/90 flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 transition-all hover:bg-orange-50/70">
                {/* Pictorial 2: Keep left eye closed */}
                <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-white border border-orange-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative group">
                  <PictorialCoverOneEye className="w-full h-full" />
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] font-black flex items-center justify-center shadow-xs">
                    2
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                      Close the left eye first and do the vision test
                    </h3>
                    <span className="self-center sm:self-auto shrink-0 px-2 py-0.5 rounded-md bg-green-100 text-green-800 text-[10px] font-black uppercase">
                      Test Right Eye
                    </span>
                  </div>
                </div>
              </div>

              {/* Instruction 3: Cover Right Eye */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-orange-50/40 border border-orange-200/90 flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 transition-all hover:bg-orange-50/70">
                {/* Pictorial 3: Keep the right eye closed */}
                <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-white border border-orange-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative group">
                  <PictorialCoverNextEye className="w-full h-full" />
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] font-black flex items-center justify-center shadow-xs">
                    3
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                      Next, close the right eye and do the vision test
                    </h3>
                    <span className="self-center sm:self-auto shrink-0 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                      Test Left Eye
                    </span>
                  </div>
                </div>
              </div>

              {/* Instruction 4: Identify the direction in which the “E” is facing and select the corresponding direction */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-orange-50/40 border border-orange-200/90 flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 transition-all hover:bg-orange-50/70">
                {/* Pictorial 4: Direction of the "E" and corresponding response selection */}
                <div className="w-22 h-22 sm:w-24 sm:h-24 rounded-2xl bg-white border border-orange-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative group">
                  <PictorialEDirection className="w-full h-full" />
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] font-black flex items-center justify-center shadow-xs">
                    4
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                      <span>Identify the direction in which the</span>
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white font-black text-xl sm:text-2xl shadow-sm border border-slate-700 tracking-wider">
                        E
                      </span>
                      <span>is facing and select the corresponding direction.</span>
                    </h3>
                    <span className="self-center sm:self-auto shrink-0 px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[10px] font-black uppercase">
                      Direction
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Start Vision Test Button in Sankara Orange */}
            <button
              type="button"
              onClick={() => setCurrentStep('distance_gate')}
              className="w-full py-4 px-6 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-extrabold text-base sm:text-lg rounded-2xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
              id="btn-start-game"
            >
              <span>Verify 1m Distance & Start Test</span>
              <ArrowRight className="w-5 h-5 stroke-[1.75]" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1.5: AUTOMATIC 1-METRE DISTANCE DETECTION & LOCK                     */}
        {/* ========================================================================= */}
        {currentStep === 'distance_gate' && (
          <DistanceGate
            onUnlockAndStart={(dist) => {
              handleStartGame(dist);
            }}
            onBack={() => setCurrentStep('instructions')}
            language={language}
          />
        )}

        {/* ========================================================================= */}
        {/* STEP 2: VISION TEST                                                       */}
        {/* ========================================================================= */}
        {currentStep === 'game' && (
          isCoveringFirstEye ? (
            <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-4 select-none overflow-y-auto" id="step-cover-first-eye">
              <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-orange-200 shadow-xl text-center animate-fadeIn my-auto">
                <div className="flex items-center justify-between w-full mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCoveringFirstEye(false);
                      setCurrentStep('distance_gate');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition py-1 px-2.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                    id="btn-back-to-distance-gate"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Distance Gate</span>
                  </button>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-[11px] font-black uppercase tracking-wider">
                    <span>Rule 2 • Step 1: Right Eye</span>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                  <span>1.00 m Distance Verified ({verifiedDistanceMeters.toFixed(2)} m)</span>
                </div>

                <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-2xl bg-orange-50 border border-orange-200 p-1 flex items-center justify-center overflow-hidden shadow-xs mb-3">
                  <PictorialCoverOneEye className="w-full h-full" />
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight" id="title-cover-left-eye">
                  Close the Left Eye First
                </h2>
                <p className="text-sm sm:text-base font-bold text-orange-600 mt-1">
                  Do the vision test for your Right Eye
                </p>

                <div className="my-5 p-4 rounded-2xl bg-orange-50/70 border border-orange-200 text-left space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                      ✋
                    </div>
                    <p className="text-base font-extrabold text-slate-900 leading-tight">
                      Close / Cover Left Eye
                    </p>
                  </div>

                  <div className="h-px bg-orange-200/80" />

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-green-600 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                      👁️
                    </div>
                    <p className="text-base font-extrabold text-slate-900 leading-tight">
                      Test Right Eye (5 Symbols)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startFirstEyeTest}
                  className="w-full py-4 px-6 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-black text-base sm:text-lg rounded-2xl shadow-lg shadow-orange-600/20 transition cursor-pointer flex items-center justify-center gap-2"
                  id="btn-start-first-eye-test"
                >
                  <span>Start Right Eye Test</span>
                  <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          ) : isSwitchingEyes ? (
            <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-4 select-none overflow-y-auto" id="step-switch-eye">
              <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-orange-200 shadow-xl text-center animate-fadeIn my-auto">
                <div className="flex items-center justify-between w-full mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchingEyes(false);
                      setCurrentStep('instructions');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition py-1 px-2.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                    id="btn-back-to-instructions-switch"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Instructions</span>
                  </button>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-black uppercase tracking-wider">
                    <span>Rule 3 • Step 2: Left Eye</span>
                  </div>
                </div>

                <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-2xl bg-orange-50 border border-orange-200 p-1 flex items-center justify-center overflow-hidden shadow-xs mb-3">
                  <PictorialCoverNextEye className="w-full h-full" />
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight" id="title-one-eye-completed">
                  Next, Close the Right Eye
                </h2>
                <p className="text-sm sm:text-base font-bold text-orange-600 mt-1">
                  Do the vision test for your Left Eye
                </p>

                <div className="my-5 p-4 rounded-2xl bg-orange-50/70 border border-orange-200 text-left space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                      ✋
                    </div>
                    <p className="text-base font-extrabold text-slate-900 leading-tight">
                      Close / Cover Right Eye
                    </p>
                  </div>

                  <div className="h-px bg-orange-200/80" />

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                      👁️
                    </div>
                    <p className="text-base font-extrabold text-slate-900 leading-tight">
                      Test Left Eye (5 Symbols)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startNextEye}
                  className="w-full py-4 px-6 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-black text-base sm:text-lg rounded-2xl shadow-lg shadow-orange-600/20 transition cursor-pointer flex items-center justify-center gap-2"
                  id="btn-start-next-eye"
                >
                  <span>Start Left Eye Test</span>
                  <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-4 select-none overflow-hidden touch-none"
              id="step-vision-test"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              {/* Unobtrusive exit icon in far corner */}
              <button
                type="button"
                onClick={() => {
                  setIsCoveringFirstEye(false);
                  setIsSwitchingEyes(false);
                  setCurrentStep('instructions');
                }}
                className="absolute top-4 left-4 p-2.5 text-slate-300 hover:text-slate-600 transition rounded-xl cursor-pointer"
                title="Exit vision test"
                aria-label="Exit vision test"
                id="btn-exit-test"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Central Clinical Arena: E in the center, arrow keys arranged symmetrically around it with ONLY pure colored arrows */}
              <div
                className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center select-none"
                id="clinical-symbol-arena"
              >
                {/* UP Arrow (Blue - Above the E) */}
                <button
                  type="button"
                  onClick={() => triggerAnswer('up')}
                  disabled={isAdvancing}
                  className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all active:scale-90 touch-manipulation cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    activeHighlightDir === 'up'
                      ? 'scale-125'
                      : 'hover:scale-110'
                  }`}
                  aria-label="Points Up (Blue Arrow)"
                  id="btn-direction-up"
                  title="Points Up (Blue Arrow)"
                >
                  <ArrowUp className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 stroke-[1.5]" />
                </button>

                {/* LEFT Arrow (Rose/Red - To the left of the E) */}
                <button
                  type="button"
                  onClick={() => triggerAnswer('left')}
                  disabled={isAdvancing}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all active:scale-90 touch-manipulation cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    activeHighlightDir === 'left'
                      ? 'scale-125'
                      : 'hover:scale-110'
                  }`}
                  aria-label="Points Left (Red Arrow)"
                  id="btn-direction-left"
                  title="Points Left (Red Arrow)"
                >
                  <ArrowLeft className="w-10 h-10 sm:w-12 sm:h-12 text-rose-600 stroke-[1.5]" />
                </button>

                {/* CENTER: Standardized 5x5 Tumbling E (Strictly 4.37mm x 4.37mm, stroke 0.874mm, solid black #000000 on pure white #FFFFFF, 1-metre 6/18 acuity) */}
                <div
                  className="flex items-center justify-center select-none bg-white p-2"
                  id="central-symbol-box"
                >
                  <StandardTumblingE
                    orientation={currentOrientation}
                    pxPerMm={currentPxPerMm}
                    sizeMm={FIXED_SCREENING_SYMBOL_SIZE_MM}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                    id="optotype-tumbling-e"
                  />
                </div>

                {/* RIGHT Arrow (Green/Emerald - To the right of the E) */}
                <button
                  type="button"
                  onClick={() => triggerAnswer('right')}
                  disabled={isAdvancing}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all active:scale-90 touch-manipulation cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    activeHighlightDir === 'right'
                      ? 'scale-125'
                      : 'hover:scale-110'
                  }`}
                  aria-label="Points Right (Green Arrow)"
                  id="btn-direction-right"
                  title="Points Right (Green Arrow)"
                >
                  <ArrowRight className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 stroke-[1.5]" />
                </button>

                {/* DOWN Arrow (Yellow/Amber - Below the E) */}
                <button
                  type="button"
                  onClick={() => triggerAnswer('down')}
                  disabled={isAdvancing}
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all active:scale-90 touch-manipulation cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    activeHighlightDir === 'down'
                      ? 'scale-125'
                      : 'hover:scale-110'
                  }`}
                  aria-label="Points Down (Yellow/Amber Arrow)"
                  id="btn-direction-down"
                  title="Points Down (Yellow Arrow)"
                >
                  <ArrowDown className="w-10 h-10 sm:w-12 sm:h-12 text-amber-500 stroke-[1.5]" />
                </button>
              </div>

              {/* Discreet usability guide at the bottom */}
              <p className="absolute bottom-6 text-xs text-slate-400 font-medium tracking-wide select-none pointer-events-none text-center">
                Tap arrows or swipe on screen
              </p>
            </div>
          )
        )}

        {/* ========================================================================= */}
        {/* STEP 3: GET THE SCORE & STORE                                             */}
        {/* ========================================================================= */}
        {currentStep === 'score_store' && (
          <div className="w-full max-w-xl mx-auto bg-white rounded-[2rem] p-6 sm:p-8 border border-orange-200 shadow-lg" id="step-score-store">
            {/* Protocol Status Banner based strictly on Rule 4 (< 4 of 5 needs further testing) */}
            {rightTrialsPassed >= 4 && leftTrialsPassed >= 4 ? (
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-start gap-3.5 mb-6 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-emerald-950">
                      Screening Passed — Vision Standard Met
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase">
                      ≥ 4/5 Passed
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 font-medium mt-0.5 leading-relaxed">
                    Read 4 or more out of 5 symbols correctly in both eyes at 1 meter. Record saved to storage.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3.5 mb-6 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-amber-950">
                      Needs Further Eye Testing
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 text-[10px] font-black uppercase">
                      Rule 4 Criteria
                    </span>
                  </div>
                  <p className="text-xs text-amber-900 font-medium mt-0.5 leading-relaxed">
                    <span className="font-bold">Rule 4:</span> If a person is reading less than 4 out of 5 symbols, he or she would need further eye testing. Read less than 4 symbols in one or both eyes. Record saved to storage.
                  </p>
                </div>
              </div>
            )}

            {/* Official Score Card */}
            <div className="border border-orange-200/80 rounded-3xl p-5 sm:p-7 bg-white shadow-sm mb-6 relative overflow-hidden" id="official-screening-scorecard">
              {/* Brand Color Header Accent Bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600" />

              {/* Header inside scorecard: Official Sankara Eye Foundation, India Logo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3 mb-4 pt-1">
                <div className="flex items-center">
                  <SankaraLogo variant="full" size="lg" />
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 shrink-0">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-[11px] font-black uppercase tracking-wider mb-0.5">
                    Vision Screening Report
                  </span>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Test Session & Database Record Status */}
              <div className="p-3.5 rounded-2xl bg-orange-50/50 border border-orange-200/80 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs" id="database-save-status-card">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Session & Database Record
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                    <span className="font-extrabold text-slate-800 text-sm">
                      Mobile: <span className="font-mono text-slate-900 font-bold">{currentTest.mobileNumber || 'Not recorded'}</span>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      Vision Score: <span className="font-mono text-orange-600 font-black">{rightTrialsPassed}/5 , {leftTrialsPassed}/5</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {dbSaveState.status === 'saving' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs" id="db-status-saving">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to database...</span>
                    </span>
                  )}
                  {dbSaveState.status === 'saved' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs" id="db-status-saved">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Saved to vision_test_results</span>
                    </span>
                  )}
                  {dbSaveState.status === 'error' && (
                    <div className="flex items-center gap-2" id="db-status-error">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Save failed</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleRetryDbSave}
                        className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                        id="btn-retry-save-db"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsRecordsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200/80 border border-orange-200 text-orange-800 font-bold text-xs transition cursor-pointer shrink-0"
                    id="btn-view-all-records-scorecard"
                  >
                    <Database className="w-3.5 h-3.5 text-orange-600" />
                    <span>View All Records</span>
                  </button>
                </div>
              </div>

              {/* Visual Acuity Results Bento for First Eye & Next Eye */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                {/* First Eye Card */}
                <div className={`p-4 rounded-xl border ${
                  rightTrialsPassed >= 4 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                      First Eye
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      rightTrialsPassed >= 4 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {rightTrialsPassed >= 4 ? 'Passed (≥ 4/5)' : 'Needs Testing (< 4/5)'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-slate-900">
                      {rightTrialsPassed} / 5
                    </span>
                    <span className="text-xs text-slate-500 font-bold">
                      ({rightEyeFinalAcuity})
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 mt-1">
                    Condition: <span className="font-semibold">Other eye closed</span>
                  </div>

                  {/* 5 Symbol Breakdown: Detailed Right / Wrong Result */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60">
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Symbol by Symbol Results</span>
                      <span className="font-extrabold text-slate-700">{rightTrialsPassed} Right • {5 - rightTrialsPassed} Wrong</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {SCREENING_SYMBOLS.map((sym, idx) => {
                        const passed = rightResponses[idx];
                        return (
                          <div
                            key={sym.symbolNumber}
                            className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold border transition ${
                              passed
                                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-800'
                                : 'bg-rose-100/70 border-rose-300 text-rose-800'
                            }`}
                            title={`Symbol #${sym.symbolNumber}: ${passed ? 'Right (Passed)' : 'Wrong (Missed)'}`}
                          >
                            <div className="text-[9px] text-slate-600 font-semibold">Symbol {sym.symbolNumber}</div>
                            <div className="font-black text-xs mt-0.5">{passed ? '✓ Right' : '✗ Wrong'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Next Eye Card */}
                <div className={`p-4 rounded-xl border ${
                  leftTrialsPassed >= 4 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                      Next Eye
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      leftTrialsPassed >= 4 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {leftTrialsPassed >= 4 ? 'Passed (≥ 4/5)' : 'Needs Testing (< 4/5)'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-slate-900">
                      {leftTrialsPassed} / 5
                    </span>
                    <span className="text-xs text-slate-500 font-bold">
                      ({leftEyeFinalAcuity})
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 mt-1">
                    Condition: <span className="font-semibold">First eye closed</span>
                  </div>

                  {/* 5 Symbol Breakdown: Detailed Right / Wrong Result */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60">
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Symbol by Symbol Results</span>
                      <span className="font-extrabold text-slate-700">{leftTrialsPassed} Right • {5 - leftTrialsPassed} Wrong</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {SCREENING_SYMBOLS.map((sym, idx) => {
                        const passed = leftResponses[idx];
                        return (
                          <div
                            key={sym.symbolNumber}
                            className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold border transition ${
                              passed
                                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-800'
                                : 'bg-rose-100/70 border-rose-300 text-rose-800'
                            }`}
                            title={`Symbol #${sym.symbolNumber}: ${passed ? 'Right (Passed)' : 'Wrong (Missed)'}`}
                          >
                            <div className="text-[9px] text-slate-600 font-semibold">Symbol {sym.symbolNumber}</div>
                            <div className="font-black text-xs mt-0.5">{passed ? '✓ Right' : '✗ Wrong'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Protocol Checklist Verification */}
              <div className="p-3.5 rounded-xl bg-orange-50/30 border border-orange-100 text-xs mb-4">
                <div className="font-extrabold text-slate-900 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-orange-600" />
                  <span>Protocol Verification</span>
                </div>
                <ul className="space-y-1 text-slate-600">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>1. Device kept at 1 meter distance: <strong className="text-slate-800">Camera-Verified ({verifiedDistanceMeters.toFixed(2)} m / {Math.round(verifiedDistanceMeters * 1000)} mm)</strong></span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>2. First eye recorded with other eye closed: <strong className="text-slate-800">Verified ({rightTrialsPassed}/5 symbols)</strong></span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>3. Next eye recorded with first eye closed: <strong className="text-slate-800">Verified ({leftTrialsPassed}/5 symbols)</strong></span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {rightTrialsPassed >= 4 && leftTrialsPassed >= 4 ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span>4. Pass criteria (≥ 4 of 5 symbols): <strong className={rightTrialsPassed >= 4 && leftTrialsPassed >= 4 ? "text-emerald-700" : "text-amber-800"}>
                      {rightTrialsPassed >= 4 && leftTrialsPassed >= 4 ? 'Met by both eyes' : 'Less than 4/5 achieved (Referral required)'}
                    </strong></span>
                  </li>
                </ul>
              </div>

              {/* Assessment Recommendation */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="font-extrabold text-slate-800">Recommendation: </span>
                {rightTrialsPassed >= 4 && leftTrialsPassed >= 4 ? (
                  <span className="text-slate-600">
                    Vision is within standard normal limits at 1 meter. Successfully identified 4 or more of 5 symbols in both eyes. Regular annual eye screening is recommended.
                  </span>
                ) : (
                  <span className="text-amber-900 font-semibold">
                    Further eye testing is required. Identified less than 4 out of 5 symbols in one or both eyes. Recommended for comprehensive refraction, dilated examination, and clinical ophthalmology consultation at Sankara Eye Hospital.
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons: Exit & Screen Again */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDbSaveState({ status: 'idle' });
                  setCurrentStep('mobile_number');
                }}
                className="w-full sm:w-auto py-4 px-6 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200 font-extrabold text-base rounded-2xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
                id="btn-exit"
              >
                <LogOut className="w-4 h-4 text-slate-500" />
                <span>Exit</span>
              </button>

              <button
                type="button"
                onClick={handleScreenAgain}
                className="w-full sm:flex-1 py-4 px-6 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-extrabold text-base rounded-2xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                id="btn-screen-again"
              >
                <RotateCcw className="w-5 h-5 stroke-[2.5]" />
                <span>Screen Again</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Database Records Modal */}
      <DatabaseRecordsModal
        isOpen={isRecordsModalOpen}
        onClose={() => setIsRecordsModalOpen(false)}
      />
    </div>
  );
}
