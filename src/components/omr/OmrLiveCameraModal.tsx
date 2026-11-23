import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Camera, 
  Flashlight, 
  FlashlightOff, 
  Upload, 
  Sliders, 
  AlertCircle,
  HelpCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { 
  OmrLiveDetector, 
  LiveOmrDetectionFrame, 
  LiveScannerStatus, 
  LiveQuadCorners,
  ScreenRect,
  ContainerDim
} from '../../lib/omrLiveDetector';
import { warpPerspectiveCanvas, QuadPoint } from '../../lib/omrPerspectiveWarp';
import { OmrLayoutConfig, getOmrLayoutConfig, OmrCorners } from '../../lib/omrGeometry';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBackHandler } from '../../hooks/useBackNavigation';

interface OmrLiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureRectified: (
    rectifiedDataUrl: string, 
    rawCapturedDataUrl: string, 
    precalibratedFiducials?: OmrCorners,
    rectifiedCanvas?: HTMLCanvasElement
  ) => void;
  onSwitchToManualCrop?: (rawCapturedDataUrl: string) => void;
  onUploadFile?: () => void;
  layoutConfig?: OmrLayoutConfig;
  totalQuestions?: number;
}

interface FrameLayoutMetrics {
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  containerWidth: number;
  containerHeight: number;
}

export const OmrLiveCameraModal: React.FC<OmrLiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCaptureRectified,
  onSwitchToManualCrop,
  onUploadFile,
  layoutConfig,
  totalQuestions = 50,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

  const activeLayout = layoutConfig || getOmrLayoutConfig(totalQuestions, undefined, 'a4');

  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<OmrLiveDetector | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const latestDetectionRef = useRef<LiveOmrDetectionFrame | null>(null);
  const lastStateUpdateRef = useRef<number>(0);
  const lastReportedBoxCountRef = useRef<number>(-1);

  // Component UI State
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [detectionState, setDetectionState] = useState<LiveOmrDetectionFrame | null>(null);
  const [isProcessingFinalWarp, setIsProcessingFinalWarp] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [frameMetrics, setFrameMetrics] = useState<FrameLayoutMetrics | null>(null);
  const frameMetricsRef = useRef<FrameLayoutMetrics | null>(null);

  useEffect(() => {
    frameMetricsRef.current = frameMetrics;
  }, [frameMetrics]);

  // Refresh scan session every time camera modal opens (retake/new scan)
  useEffect(() => {
    if (isOpen) {
      isCapturingRef.current = false;
      setIsProcessingFinalWarp(false);
      setCapturedPreview(null);
      setDetectionState(null);
      latestDetectionRef.current = null;
      setCaptureFlash(false);
      detectorRef.current?.resetTracking();
    }
  }, [isOpen]);

  // Compute maximum full-area screen frame matching sheet physical aspect ratio
  const calculateMaximumFrame = useCallback(() => {
    const container = viewportRef.current;
    if (!container) return;

    const contW = container.clientWidth;
    const contH = container.clientHeight;
    if (contW <= 50 || contH <= 50) return;

    // Physical aspect ratio of this specific test paper (e.g. 210mm / 118.25mm = 1.776, or 210mm / 297mm = 0.707)
    const sheetAspect = activeLayout.pageWidthMm / activeLayout.pageHeightMm;

    // Safe screen utilization with comfortable margins on mobile phones so corner boxes never clip
    const isMobilePortrait = contW < 600 && contH > contW;
    const maxAvailableW = isMobilePortrait 
      ? Math.min(contW - 68, contW * 0.84)
      : contW * 0.90;
    const maxAvailableH = isMobilePortrait 
      ? contH * 0.70
      : contH * 0.82;

    let fWidth = 0;
    let fHeight = 0;

    if (maxAvailableW / sheetAspect <= maxAvailableH) {
      fWidth = maxAvailableW;
      fHeight = fWidth / sheetAspect;
    } else {
      fHeight = maxAvailableH;
      fWidth = fHeight * sheetAspect;
    }

    const fLeft = Math.round((contW - fWidth) / 2);
    const fTop = Math.round((contH - fHeight) / 2);

    const metrics: FrameLayoutMetrics = {
      frameLeft: fLeft,
      frameTop: fTop,
      frameWidth: Math.round(fWidth),
      frameHeight: Math.round(fHeight),
      containerWidth: contW,
      containerHeight: contH,
    };

    setFrameMetrics(metrics);
  }, [activeLayout]);

  // Handle ResizeObserver
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      calculateMaximumFrame();
    });
    ro.observe(el);
    calculateMaximumFrame();
    return () => ro.disconnect();
  }, [calculateMaximumFrame]);

  // Play pleasant lock chime
  const playCaptureSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, []);

  // Trigger tactile vibration
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([35, 50, 45]);
      } catch {}
    }
  }, []);

  // Stop camera media stream
  const stopCameraStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    setCameraReady(false);
    setTorchEnabled(false);
  }, []);

  // Initialize Camera Stream
  const initCamera = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setCameraReady(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser environment.');
      }

      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch (e1) {
        console.warn('High-res camera constraints failed, attempting fallback:', e1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'environment' },
          });
        } catch (e2) {
          console.warn('Fallback facingMode failed, attempting basic video:', e2);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
      }

      if (!stream) {
        throw new Error('Failed to obtain camera stream.');
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        try {
          await video.play();
        } catch (playErr) {
          console.warn('video.play() failed on initial try:', playErr);
        }
        calculateMaximumFrame();

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          try {
            const caps = track.getCapabilities() as any;
            if (caps && caps.torch) {
              setHasTorchCapability(true);
            }
          } catch {}
        }

        setCameraReady(true);
      }
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      let friendlyMsg = 'Failed to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMsg = 'Camera permission was denied. Please allow camera access in browser permissions.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMsg = 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyMsg = 'Camera is currently in use by another application.';
      } else if (err.message) {
        friendlyMsg = err.message;
      }
      setCameraError(friendlyMsg);
    }
  }, [stopCameraStream, calculateMaximumFrame]);

  // Flashlight / Torch toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !torchEnabled;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchEnabled(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  // Perform full resolution snapshot and perspective rectification
  const executeCapture = useCallback(
    (targetVideoCorners?: LiveQuadCorners, targetVideoFiducials?: LiveQuadCorners) => {
      if (isCapturingRef.current) return;
      isCapturingRef.current = true;
      setIsProcessingFinalWarp(true);

      triggerHaptic();
      playCaptureSound();
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 150);

      // Execute on next animation frame so flash renders cleanly without blocking UI thread
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
          setIsProcessingFinalWarp(false);
          isCapturingRef.current = false;
          return;
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        let snapCanvas: HTMLCanvasElement | null = null;

        try {
          // 1. Grab raw full-resolution camera frame
          snapCanvas = document.createElement('canvas');
          snapCanvas.width = vw;
          snapCanvas.height = vh;
          const snapCtx = snapCanvas.getContext('2d', { willReadFrequently: true });
          if (!snapCtx) {
            throw new Error('Failed to obtain 2D canvas context for snapshot');
          }

          snapCtx.drawImage(video, 0, 0, vw, vh);

          // 2. Compute expected fiducial centers in video/canvas coordinates from UI guide containers
          const metrics = frameMetricsRef.current;
          const cw = metrics?.containerWidth || vw;
          const ch = metrics?.containerHeight || vh;
          const scale = Math.max(cw / vw, ch / vh);
          const offsetX = (vw * scale - cw) / 2;
          const offsetY = (vh * scale - ch) / 2;

          let expVideoFiducials: LiveQuadCorners;
          if (metrics) {
            const fiducialInsetX = (10 / activeLayout.pageWidthMm) * metrics.frameWidth;
            const fiducialInsetY = (10 / activeLayout.pageHeightMm) * metrics.frameHeight;
            const fiducialBotInsetY = ((activeLayout.pageHeightMm - activeLayout.bottomFiducialY_mm) / activeLayout.pageHeightMm) * metrics.frameHeight;

            expVideoFiducials = {
              tl: { x: (metrics.frameLeft + fiducialInsetX + offsetX) / scale, y: (metrics.frameTop + fiducialInsetY + offsetY) / scale },
              tr: { x: (metrics.frameLeft + metrics.frameWidth - fiducialInsetX + offsetX) / scale, y: (metrics.frameTop + fiducialInsetY + offsetY) / scale },
              br: { x: (metrics.frameLeft + metrics.frameWidth - fiducialInsetX + offsetX) / scale, y: (metrics.frameTop + metrics.frameHeight - fiducialBotInsetY + offsetY) / scale },
              bl: { x: (metrics.frameLeft + fiducialInsetX + offsetX) / scale, y: (metrics.frameTop + metrics.frameHeight - fiducialBotInsetY + offsetY) / scale },
            };
          } else {
            const mX = 10 / activeLayout.pageWidthMm;
            const mTop = 10 / activeLayout.pageHeightMm;
            const mBot = (activeLayout.pageHeightMm - activeLayout.bottomFiducialY_mm) / activeLayout.pageHeightMm;
            expVideoFiducials = {
              tl: { x: vw * mX, y: vh * mTop },
              tr: { x: vw * (1 - mX), y: vh * mTop },
              br: { x: vw * (1 - mX), y: vh * (1 - mBot) },
              bl: { x: vw * mX, y: vh * (1 - mBot) },
            };
          }

          // 3. Determine the 4 corner fiducial source coordinates:
          let finalFiducials: LiveQuadCorners | null = null;
          let isHomographyValid = false;

          // Re-locate fiducials directly on snapCanvas using targetVideoFiducials or expVideoFiducials as search centers:
          const seedFiducials = (targetVideoFiducials && !isNaN(targetVideoFiducials.tl.x))
            ? targetVideoFiducials
            : (latestDetectionRef.current?.videoFiducials || expVideoFiducials);

          if (detectorRef.current && snapCanvas) {
            const expW = Math.hypot(seedFiducials.tr.x - seedFiducials.tl.x, seedFiducials.tr.y - seedFiducials.tl.y);
            const expectedBoxVideoPx = Math.max(16, Math.round(
              (5.5 / activeLayout.fiducialSpanX_mm) * expW
            ));
            // Localized patch radius (30-55px) ensures refinement centers on corner squares without reaching internal bubbles
            const patchRadius = Math.max(30, Math.min(55, Math.round(expectedBoxVideoPx * 1.8)));

            const located = detectorRef.current.locateCornerFiducials(
              snapCanvas,
              vw,
              vh,
              seedFiducials,
              patchRadius,
              expectedBoxVideoPx
            );

            if (located && located.detectedCount === 4) {
              // Verify located quad sanity against expected ratio to prevent false bubble locks
              const topW = Math.hypot(located.fiducials.tr.x - located.fiducials.tl.x, located.fiducials.tr.y - located.fiducials.tl.y);
              const botW = Math.hypot(located.fiducials.br.x - located.fiducials.bl.x, located.fiducials.br.y - located.fiducials.bl.y);
              const leftH = Math.hypot(located.fiducials.bl.x - located.fiducials.tl.x, located.fiducials.bl.y - located.fiducials.tl.y);
              const rightH = Math.hypot(located.fiducials.br.x - located.fiducials.tr.x, located.fiducials.br.y - located.fiducials.tr.y);
              const avgW = (topW + botW) / 2;
              const avgH = (leftH + rightH) / 2;
              const ratio = avgW / Math.max(1, avgH);
              const expectedRatio = activeLayout.fiducialSpanX_mm / activeLayout.fiducialSpanY_mm;

              const maxDrift = Math.max(
                Math.hypot(located.fiducials.tl.x - seedFiducials.tl.x, located.fiducials.tl.y - seedFiducials.tl.y),
                Math.hypot(located.fiducials.tr.x - seedFiducials.tr.x, located.fiducials.tr.y - seedFiducials.tr.y),
                Math.hypot(located.fiducials.br.x - seedFiducials.br.x, located.fiducials.br.y - seedFiducials.br.y),
                Math.hypot(located.fiducials.bl.x - seedFiducials.bl.x, located.fiducials.bl.y - seedFiducials.bl.y)
              );

              if (Math.abs(ratio - expectedRatio) / expectedRatio < 0.15 && maxDrift < expectedBoxVideoPx * 1.5) {
                finalFiducials = located.fiducials;
                isHomographyValid = true;
              } else {
                // If snap refinement drifted onto bubbles, fallback to the pre-validated live tracking fiducials
                finalFiducials = seedFiducials;
                isHomographyValid = true;
              }
            } else if (seedFiducials && !isNaN(seedFiducials.tl.x)) {
              // Fallback to tracking fiducials or screen guide fiducials
              finalFiducials = seedFiducials;
              isHomographyValid = true;
            }
          }

          if (isHomographyValid && finalFiducials) {
            // 4. Target canonical rectified dimensions: 1000px width provides ideal bubble size with 50% fewer pixels
            const dstWidth = 1000;
            const dstHeight = Math.max(500, Math.round((activeLayout.pageHeightMm / activeLayout.pageWidthMm) * dstWidth));

            const fx0 = (10 / activeLayout.pageWidthMm) * dstWidth;
            const fx1 = ((activeLayout.pageWidthMm - 10) / activeLayout.pageWidthMm) * dstWidth;
            const fy0 = (10 / activeLayout.pageHeightMm) * dstHeight;
            const fy1 = (activeLayout.bottomFiducialY_mm / activeLayout.pageHeightMm) * dstHeight;

            // Canonical fiducial centers in rectified canvas pixel coordinates
            const canonicalFiducials: OmrCorners = {
              topLeft: { x: fx0, y: fy0 },
              topRight: { x: fx1, y: fy0 },
              bottomRight: { x: fx1, y: fy1 },
              bottomLeft: { x: fx0, y: fy1 },
            };

            const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
              finalFiducials.tl,
              finalFiducials.tr,
              finalFiducials.br,
              finalFiducials.bl,
            ];

            const dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
              { x: fx0, y: fy0 },
              { x: fx1, y: fy0 },
              { x: fx1, y: fy1 },
              { x: fx0, y: fy1 },
            ];

            // 5. Apply Homography Bilinear / 32-bit Perspective Rectification (<15ms)
            const warpedCanvas = warpPerspectiveCanvas(snapCanvas, srcQuad, dstWidth, dstHeight, dstQuad);

            if (warpedCanvas) {
              const rectifiedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.92);
              const rawCapturedDataUrl = snapCanvas.toDataURL('image/jpeg', 0.85);
              stopCameraStream();
              onClose();
              onCaptureRectified(rectifiedDataUrl, rawCapturedDataUrl, canonicalFiducials, warpedCanvas);
              return;
            }
          }

          // If homography or fiducials were not ready, do NOT redirect to manual crop:
          // Smoothly reset capturing state and allow live camera scanning to keep running!
          console.log('[Camera] Fiducials incomplete on capture: continuing live camera session');
          setIsProcessingFinalWarp(false);
          isCapturingRef.current = false;
          setCapturedPreview(null);
          detectorRef.current?.resetTracking();
        } catch (captureErr) {
          console.error('[Camera] executeCapture error, continuing live scan:', captureErr);
          setIsProcessingFinalWarp(false);
          isCapturingRef.current = false;
          setCapturedPreview(null);
          detectorRef.current?.resetTracking();
        }
      });
    },
    [activeLayout, playCaptureSound, triggerHaptic, onCaptureRectified, onClose, stopCameraStream]
  );

  // Main Detection Loop
  useEffect(() => {
    if (!isOpen || !cameraReady) return;

    if (!detectorRef.current) {
      detectorRef.current = new OmrLiveDetector(activeLayout);
    } else {
      detectorRef.current.setLayout(activeLayout);
    }

    let isRunning = true;

    const runDetectionStep = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const detector = detectorRef.current;
      const metrics = frameMetricsRef.current;

      if (video && detector && !isCapturingRef.current && video.readyState >= 2 && metrics) {
        const screenFrame: ScreenRect = {
          left: metrics.frameLeft,
          top: metrics.frameTop,
          width: metrics.frameWidth,
          height: metrics.frameHeight,
        };

        const containerDim: ContainerDim = {
          width: metrics.containerWidth,
          height: metrics.containerHeight,
        };

        const result = detector.processFrame(video, screenFrame, containerDim);
        if (result) {
          latestDetectionRef.current = result;

          const now = performance.now();
          const shouldUpdateUi =
            result.shouldAutoSnap ||
            result.detectedBoxes.count !== lastReportedBoxCountRef.current ||
            (now - lastStateUpdateRef.current >= 33);

          if (shouldUpdateUi) {
            lastStateUpdateRef.current = now;
            lastReportedBoxCountRef.current = result.detectedBoxes.count;
            setDetectionState(result);
          }

          if (result.shouldAutoSnap && !isCapturingRef.current) {
            executeCapture(result.videoOuterCorners, result.videoFiducials);
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(runDetectionStep);
    };

    animFrameIdRef.current = requestAnimationFrame(runDetectionStep);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isOpen, cameraReady, activeLayout, executeCapture, onClose, onSwitchToManualCrop, stopCameraStream]);

  // Lifecycle on modal open/close
  useEffect(() => {
    if (isOpen) {
      isCapturingRef.current = false;
      setIsProcessingFinalWarp(false);
      setCapturedPreview(null);
      setDetectionState(null);
      latestDetectionRef.current = null;
      if (detectorRef.current) {
        detectorRef.current.resetTracking();
      }
      initCamera();
    } else {
      stopCameraStream();
      setCapturedPreview(null);
      setDetectionState(null);
      latestDetectionRef.current = null;
    }

    return () => {
      stopCameraStream();
      setCapturedPreview(null);
      latestDetectionRef.current = null;
    };
  }, [isOpen, initCamera, stopCameraStream]);

  // Visual status indicators
  const status = detectionState?.status || 'searching';
  const streakProgress = detectionState?.stabilityProgress || 0;
  const fiducials = detectionState?.fiducials;
  const outerCorners = detectionState?.outerCorners;
  const detectedBoxes = detectionState?.detectedBoxes;
  const isTL = Boolean(detectedBoxes?.tl);
  const isTR = Boolean(detectedBoxes?.tr);
  const isBR = Boolean(detectedBoxes?.br);
  const isBL = Boolean(detectedBoxes?.bl);

  let statusBadgeBg = 'bg-white/10 text-white/90';

  if (status === 'locked') {
    statusBadgeBg = 'bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/25';
  } else if (status === 'stabilizing') {
    statusBadgeBg = 'bg-cyan-500/85 text-white shadow-lg shadow-cyan-500/20';
  } else if (status === 'tracking') {
    statusBadgeBg = 'bg-blue-500/80 text-white shadow-lg shadow-blue-500/20';
  }

  // Margin percentages within alignment frame for the 4 corner target brackets
  const marginPctX = (10 / activeLayout.pageWidthMm) * 100;
  const marginPctTop = (10 / activeLayout.pageHeightMm) * 100;
  const marginPctBottom = ((activeLayout.pageHeightMm - activeLayout.bottomFiducialY_mm) / activeLayout.pageHeightMm) * 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col select-none overflow-hidden touch-none font-sans">
      {/* 1. Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-[max(2.75rem,calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.75rem))] pb-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white/90 backdrop-blur-md transition-all cursor-pointer"
          title="Exit Live Scanner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Guidance Badge Pill */}
        <div className="flex-1 flex justify-center px-2">
          <div className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-wide flex items-center gap-2 backdrop-blur-md transition-all duration-200 ${statusBadgeBg}`}>
            {status === 'locked' ? (
              <Sparkles className="w-4 h-4 animate-spin text-emerald-300" />
            ) : status === 'stabilizing' ? (
              <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
            ) : (
              <Camera className="w-4 h-4 text-white/80" />
            )}
            <span>
              {detectionState?.guidanceMessage || 'Align 4 corner [ ■ ] squares into boxes'}
            </span>
          </div>
        </div>

        {/* Torch Toggle */}
        {hasTorchCapability ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              torchEnabled 
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/25' 
                : 'bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-md'
            }`}
            title={torchEnabled ? 'Turn flashlight off' : 'Turn flashlight on'}
          >
            {torchEnabled ? <Flashlight className="w-5 h-5 fill-current" /> : <FlashlightOff className="w-5 h-5" />}
          </button>
        ) : (
          <div className="w-11 h-11" />
        )}
      </div>

      {/* 2. Main Viewport & Video Feed */}
      <div 
        ref={viewportRef}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black"
      >
        {cameraError ? (
          <div className="px-6 text-center max-w-sm flex flex-col items-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-bold text-white mb-2">Camera Access Error</h3>
            <p className="text-xs text-zinc-300 mb-5 leading-relaxed">{cameraError}</p>
            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={initCamera}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Retry Camera
              </button>
              {onUploadFile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onUploadFile();
                  }}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Upload Photo From Gallery
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              onLoadedMetadata={() => {
                calculateMaximumFrame();
                setCameraReady(true);
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Instant Camera Shutter Flash */}
            {captureFlash && (
              <div className="absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-200" />
            )}

            {/* Frozen captured preview ONLY while processing final warp (cleared on retake/live feed) */}
            {isProcessingFinalWarp && capturedPreview && (
              <img 
                src={capturedPreview} 
                alt="Captured Frame" 
                className="absolute inset-0 w-full h-full object-cover z-25 pointer-events-none" 
              />
            )}

            {/* 3. Screen Viewfinder: Dynamic Magnetic Corner Target Boxes & Locked Quad */}
            {frameMetrics && (() => {
              const defaultTL = {
                x: frameMetrics.frameLeft + (marginPctX / 100) * frameMetrics.frameWidth,
                y: frameMetrics.frameTop + (marginPctTop / 100) * frameMetrics.frameHeight,
              };
              const defaultTR = {
                x: frameMetrics.frameLeft + ((100 - marginPctX) / 100) * frameMetrics.frameWidth,
                y: frameMetrics.frameTop + (marginPctTop / 100) * frameMetrics.frameHeight,
              };
              const defaultBR = {
                x: frameMetrics.frameLeft + ((100 - marginPctX) / 100) * frameMetrics.frameWidth,
                y: frameMetrics.frameTop + ((100 - marginPctBottom) / 100) * frameMetrics.frameHeight,
              };
              const defaultBL = {
                x: frameMetrics.frameLeft + (marginPctX / 100) * frameMetrics.frameWidth,
                y: frameMetrics.frameTop + ((100 - marginPctBottom) / 100) * frameMetrics.frameHeight,
              };

              // Keep guide containers firmly FIXED on the camera viewfinder with generous catchment zone
              const relTL = (isTL && fiducials?.tl) ? {
                x: Math.max(-24, Math.min(24, (fiducials.tl.x / 100) * frameMetrics.containerWidth - defaultTL.x)),
                y: Math.max(-24, Math.min(24, (fiducials.tl.y / 100) * frameMetrics.containerHeight - defaultTL.y)),
              } : null;
              const relTR = (isTR && fiducials?.tr) ? {
                x: Math.max(-24, Math.min(24, (fiducials.tr.x / 100) * frameMetrics.containerWidth - defaultTR.x)),
                y: Math.max(-24, Math.min(24, (fiducials.tr.y / 100) * frameMetrics.containerHeight - defaultTR.y)),
              } : null;
              const relBR = (isBR && fiducials?.br) ? {
                x: Math.max(-24, Math.min(24, (fiducials.br.x / 100) * frameMetrics.containerWidth - defaultBR.x)),
                y: Math.max(-24, Math.min(24, (fiducials.br.y / 100) * frameMetrics.containerHeight - defaultBR.y)),
              } : null;
              const relBL = (isBL && fiducials?.bl) ? {
                x: Math.max(-24, Math.min(24, (fiducials.bl.x / 100) * frameMetrics.containerWidth - defaultBL.x)),
                y: Math.max(-24, Math.min(24, (fiducials.bl.y / 100) * frameMetrics.containerHeight - defaultBL.y)),
              } : null;

              const isAllLocked = isTL && isTR && isBR && isBL;

              return (
                <div className="absolute inset-0 pointer-events-none z-10">
                  {/* Clean Corner Target Containers ONLY (Cropping frames/polygons removed as requested) */}

                  {/* Top-Left Target Box Container */}
                  <div 
                    className={`absolute w-16 h-16 sm:w-20 sm:h-20 rounded-2xl pointer-events-none transition-all duration-100 flex items-center justify-center ${
                      isTL 
                        ? (isAllLocked ? 'border-2 border-emerald-400 bg-emerald-400/30 shadow-[0_0_28px_rgba(52,211,153,0.85)] scale-105' : 'border-2 border-emerald-400 bg-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105')
                        : 'border-2 border-white/60 bg-black/20 backdrop-blur-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]'
                    }`}
                    style={{ left: `${defaultTL.x}px`, top: `${defaultTL.y}px`, transform: 'translate(-50%, -50%)' }}
                  >
                    {isTL ? (
                      <div 
                        className="w-4 h-4 rounded-sm bg-emerald-400 border-2 border-white shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"
                        style={relTL ? { transform: `translate(${relTL.x}px, ${relTL.y}px)` } : undefined}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-xs border-2 border-white/70 bg-white/10 flex items-center justify-center text-[11px] text-white/90 font-mono font-black select-none">■</div>
                    )}
                  </div>

                  {/* Top-Right Target Box Container */}
                  <div 
                    className={`absolute w-16 h-16 sm:w-20 sm:h-20 rounded-2xl pointer-events-none transition-all duration-100 flex items-center justify-center ${
                      isTR 
                        ? (isAllLocked ? 'border-2 border-emerald-400 bg-emerald-400/30 shadow-[0_0_28px_rgba(52,211,153,0.85)] scale-105' : 'border-2 border-emerald-400 bg-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105')
                        : 'border-2 border-white/60 bg-black/20 backdrop-blur-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]'
                    }`}
                    style={{ left: `${defaultTR.x}px`, top: `${defaultTR.y}px`, transform: 'translate(-50%, -50%)' }}
                  >
                    {isTR ? (
                      <div 
                        className="w-4 h-4 rounded-sm bg-emerald-400 border-2 border-white shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"
                        style={relTR ? { transform: `translate(${relTR.x}px, ${relTR.y}px)` } : undefined}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-xs border-2 border-white/70 bg-white/10 flex items-center justify-center text-[11px] text-white/90 font-mono font-black select-none">■</div>
                    )}
                  </div>

                  {/* Bottom-Right Target Box Container */}
                  <div 
                    className={`absolute w-16 h-16 sm:w-20 sm:h-20 rounded-2xl pointer-events-none transition-all duration-100 flex items-center justify-center ${
                      isBR 
                        ? (isAllLocked ? 'border-2 border-emerald-400 bg-emerald-400/30 shadow-[0_0_28px_rgba(52,211,153,0.85)] scale-105' : 'border-2 border-emerald-400 bg-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105')
                        : 'border-2 border-white/60 bg-black/20 backdrop-blur-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]'
                    }`}
                    style={{ left: `${defaultBR.x}px`, top: `${defaultBR.y}px`, transform: 'translate(-50%, -50%)' }}
                  >
                    {isBR ? (
                      <div 
                        className="w-4 h-4 rounded-sm bg-emerald-400 border-2 border-white shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"
                        style={relBR ? { transform: `translate(${relBR.x}px, ${relBR.y}px)` } : undefined}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-xs border-2 border-white/70 bg-white/10 flex items-center justify-center text-[11px] text-white/90 font-mono font-black select-none">■</div>
                    )}
                  </div>

                  {/* Bottom-Left Target Box Container */}
                  <div 
                    className={`absolute w-16 h-16 sm:w-20 sm:h-20 rounded-2xl pointer-events-none transition-all duration-100 flex items-center justify-center ${
                      isBL 
                        ? (isAllLocked ? 'border-2 border-emerald-400 bg-emerald-400/30 shadow-[0_0_28px_rgba(52,211,153,0.85)] scale-105' : 'border-2 border-emerald-400 bg-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105')
                        : 'border-2 border-white/60 bg-black/20 backdrop-blur-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]'
                    }`}
                    style={{ left: `${defaultBL.x}px`, top: `${defaultBL.y}px`, transform: 'translate(-50%, -50%)' }}
                  >
                    {isBL ? (
                      <div 
                        className="w-4 h-4 rounded-sm bg-emerald-400 border-2 border-white shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"
                        style={relBL ? { transform: `translate(${relBL.x}px, ${relBL.y}px)` } : undefined}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-xs border-2 border-white/70 bg-white/10 flex items-center justify-center text-[11px] text-white/90 font-mono font-black select-none">■</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Fullscreen processing indicator during final warp */}
            {isProcessingFinalWarp && (
              <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
                <p className="text-sm font-bold text-white">Rectifying Perspective & Unskewing...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. Bottom Control Bar */}
      <div className="relative z-30 px-6 pt-3 pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1.25rem))] bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col gap-3">
        {/* Helper Tip */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/60 font-medium tracking-wide">
          <HelpCircle className="w-3.5 h-3.5 text-white/50" />
          <span>Fit 4 corner squares inside the boxes &bull; Auto-scans when steady</span>
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-around w-full max-w-sm mx-auto">
          {/* Switch to Manual Crop Option */}
          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (video && video.videoWidth > 0 && onSwitchToManualCrop) {
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = video.videoWidth;
                snapCanvas.height = video.videoHeight;
                const ctx = snapCanvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0);
                  const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
                  stopCameraStream();
                  onClose();
                  onSwitchToManualCrop(dataUrl);
                }
              }
            }}
            className="flex flex-col items-center gap-1.5 text-white/70 hover:text-white transition-all cursor-pointer active:scale-90"
            title="Freeze frame and switch to Manual 8-handle Crop"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all">
              <Sliders className="w-5 h-5 text-white/90" />
            </div>
            <span className="text-[10px] font-medium tracking-wider text-white/60">Manual Crop</span>
          </button>

          {/* Shutter Button with Circular Stability Progress Ring */}
          <div className="relative flex items-center justify-center">
            {/* Circular Progress SVG */}
            <svg className="w-20 h-20 -rotate-90 pointer-events-none">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth="3.5"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke={status === 'locked' ? '#10b981' : '#06b6d4'}
                strokeWidth="3.5"
                fill="none"
                strokeDasharray={2 * Math.PI * 36}
                strokeDashoffset={2 * Math.PI * 36 - streakProgress * (2 * Math.PI * 36)}
                strokeLinecap="round"
                className="transition-all duration-75 ease-out"
              />
            </svg>

            {/* Inner Shutter Capture Button */}
            <button
              type="button"
              onClick={() => {
                const det = latestDetectionRef.current;
                const video = videoRef.current;
                if (!video || video.videoWidth <= 0 || isCapturingRef.current) return;

                // Execute capture with currently detected fiducials (or seed guides) without dumping to manual crop
                executeCapture(det?.videoOuterCorners, det?.videoFiducials);
              }}
              disabled={!cameraReady || isProcessingFinalWarp}
              className="absolute w-16 h-16 rounded-full bg-white hover:bg-white/90 active:scale-90 transition-all flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.35)] cursor-pointer disabled:opacity-50"
              title={status === 'locked' ? 'Capture Aligned OMR Sheet' : 'Capture OMR Sheet'}
            >
              <div className={`w-13 h-13 rounded-full transition-all duration-150 ${status === 'locked' ? 'bg-emerald-500 scale-90' : 'bg-transparent'}`} />
            </button>
          </div>

          {/* Gallery Upload Button */}
          <button
            type="button"
            onClick={() => {
              if (onUploadFile) {
                stopCameraStream();
                onClose();
                onUploadFile();
              }
            }}
            className="flex flex-col items-center gap-1.5 text-white/70 hover:text-white transition-all cursor-pointer active:scale-90"
            title="Upload pre-taken photo from device"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all">
              <Upload className="w-5 h-5 text-white/90" />
            </div>
            <span className="text-[10px] font-medium tracking-wider text-white/60">Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
};


