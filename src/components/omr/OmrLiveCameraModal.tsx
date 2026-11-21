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
import { OmrLayoutConfig, getOmrLayoutConfig } from '../../lib/omrGeometry';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBackHandler } from '../../hooks/useBackNavigation';

interface OmrLiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureRectified: (rectifiedDataUrl: string, rawCapturedDataUrl: string) => void;
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

  // Component UI State
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [detectionState, setDetectionState] = useState<LiveOmrDetectionFrame | null>(null);
  const [isProcessingFinalWarp, setIsProcessingFinalWarp] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [frameMetrics, setFrameMetrics] = useState<FrameLayoutMetrics | null>(null);
  const frameMetricsRef = useRef<FrameLayoutMetrics | null>(null);

  useEffect(() => {
    frameMetricsRef.current = frameMetrics;
  }, [frameMetrics]);

  // Compute maximum full-area screen frame matching sheet physical aspect ratio
  const calculateMaximumFrame = useCallback(() => {
    const container = viewportRef.current;
    if (!container) return;

    const contW = container.clientWidth;
    const contH = container.clientHeight;
    if (contW <= 50 || contH <= 50) return;

    // Physical aspect ratio of this specific test paper (e.g. 210mm / 118.25mm = 1.776, or 210mm / 297mm = 0.707)
    const sheetAspect = activeLayout.pageWidthMm / activeLayout.pageHeightMm;

    // Safe maximum screen utilization (up to 92% width or 82% height)
    const maxAvailableW = contW * 0.92;
    const maxAvailableH = contH * 0.82;

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
    (targetVideoCorners?: LiveQuadCorners) => {
      if (isCapturingRef.current) return;
      isCapturingRef.current = true;
      setIsProcessingFinalWarp(true);

      triggerHaptic();
      playCaptureSound();
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 200);

      const video = videoRef.current;
      if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
        setIsProcessingFinalWarp(false);
        isCapturingRef.current = false;
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // 1. Grab raw full-resolution camera frame
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = vw;
      snapCanvas.height = vh;
      const snapCtx = snapCanvas.getContext('2d');
      if (!snapCtx) {
        setIsProcessingFinalWarp(false);
        isCapturingRef.current = false;
        return;
      }

      snapCtx.drawImage(video, 0, 0, vw, vh);
      const rawCapturedDataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);

      // 2. Determine source corners in VIDEO PIXEL coordinates:
      let videoCorners = targetVideoCorners;
      const currentDetection = detectionState;
      const metrics = frameMetricsRef.current;

      if (!videoCorners && currentDetection?.detected && currentDetection.videoOuterCorners) {
        videoCorners = currentDetection.videoOuterCorners;
      }

      // If no corner lock, fallback to on-screen alignment frame mapped to video pixels
      if (!videoCorners && metrics) {
        const cw = metrics.containerWidth;
        const ch = metrics.containerHeight;
        const scale = Math.max(cw / vw, ch / vh);
        const offsetX = (vw * scale - cw) / 2;
        const offsetY = (vh * scale - ch) / 2;

        videoCorners = {
          tl: { x: (metrics.frameLeft + offsetX) / scale, y: (metrics.frameTop + offsetY) / scale },
          tr: { x: (metrics.frameLeft + metrics.frameWidth + offsetX) / scale, y: (metrics.frameTop + offsetY) / scale },
          br: { x: (metrics.frameLeft + metrics.frameWidth + offsetX) / scale, y: (metrics.frameTop + metrics.frameHeight + offsetY) / scale },
          bl: { x: (metrics.frameLeft + offsetX) / scale, y: (metrics.frameTop + metrics.frameHeight + offsetY) / scale },
        };
      }

      if (!videoCorners) {
        videoCorners = {
          tl: { x: vw * 0.05, y: vh * 0.10 },
          tr: { x: vw * 0.95, y: vh * 0.10 },
          br: { x: vw * 0.95, y: vh * 0.90 },
          bl: { x: vw * 0.05, y: vh * 0.90 },
        };
      }

      // 3. Define quad points in video pixel space
      const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        videoCorners.tl,
        videoCorners.tr,
        videoCorners.br,
        videoCorners.bl,
      ];

      // 4. Target canonical rectified dimensions strictly matching this active test paper's layout!
      const dstWidth = 1414;
      const dstHeight = Math.round(dstWidth * (activeLayout.pageHeightMm / activeLayout.pageWidthMm));

      const dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: 0, y: 0 },
        { x: dstWidth, y: 0 },
        { x: dstWidth, y: dstHeight },
        { x: 0, y: dstHeight },
      ];

      // 5. Apply Homography Bilinear Perspective Rectification
      const warpedCanvas = warpPerspectiveCanvas(snapCanvas, srcQuad, dstWidth, dstHeight, dstQuad);

      stopCameraStream();

      if (warpedCanvas) {
        const rectifiedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.94);
        onCaptureRectified(rectifiedDataUrl, rawCapturedDataUrl);
      } else {
        onCaptureRectified(rawCapturedDataUrl, rawCapturedDataUrl);
      }

      setIsProcessingFinalWarp(false);
      isCapturingRef.current = false;
    },
    [detectionState, activeLayout, playCaptureSound, triggerHaptic, stopCameraStream, onCaptureRectified]
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
          setDetectionState(result);

          if (result.shouldAutoSnap && !isCapturingRef.current) {
            isRunning = false;
            executeCapture(result.videoOuterCorners);
            return;
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
  }, [isOpen, cameraReady, activeLayout, executeCapture]);

  // Lifecycle on modal open/close
  useEffect(() => {
    if (isOpen) {
      isCapturingRef.current = false;
      setIsProcessingFinalWarp(false);
      initCamera();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
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

  let polygonStroke = '#eab308'; // Yellow searching
  let polygonFill = 'rgba(234, 179, 8, 0.05)';
  let statusBadgeBg = 'bg-zinc-800/80 text-zinc-300';

  if (status === 'locked') {
    polygonStroke = '#10b981'; // Emerald
    polygonFill = 'rgba(16, 185, 129, 0.16)';
    statusBadgeBg = 'bg-emerald-600 text-white';
  } else if (status === 'stabilizing') {
    polygonStroke = '#06b6d4'; // Cyan
    polygonFill = 'rgba(6, 182, 212, 0.12)';
    statusBadgeBg = 'bg-cyan-600 text-white';
  } else if (status === 'tracking') {
    polygonStroke = '#3b82f6'; // Blue
    polygonFill = 'rgba(59, 130, 246, 0.08)';
    statusBadgeBg = 'bg-blue-600 text-white';
  }

  // Margin percentages within alignment frame for the 4 corner target brackets
  const marginPctX = (10 / activeLayout.pageWidthMm) * 100;
  const marginPctTop = (10 / activeLayout.pageHeightMm) * 100;
  const marginPctBottom = ((activeLayout.pageHeightMm - activeLayout.bottomFiducialY_mm) / activeLayout.pageHeightMm) * 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col select-none overflow-hidden touch-none font-sans">
      {/* 1. Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-3 pb-3 bg-gradient-to-b from-black/85 via-black/50 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 flex items-center justify-center text-white transition-all cursor-pointer border border-white/10 active:scale-95"
          title="Exit Live Scanner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Guidance Badge Pill */}
        <div className="flex-1 flex justify-center px-2">
          <div className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition-all shadow-lg ${statusBadgeBg}`}>
            {status === 'locked' ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : status === 'stabilizing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>{detectionState?.guidanceMessage || 'Align OMR sheet inside frame'}</span>
          </div>
        </div>

        {/* Torch Toggle */}
        {hasTorchCapability ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer border active:scale-95 ${
              torchEnabled 
                ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-400/30' 
                : 'bg-black/40 backdrop-blur-md text-white border-white/10 hover:bg-black/60'
            }`}
            title={torchEnabled ? 'Turn flashlight off' : 'Turn flashlight on'}
          >
            {torchEnabled ? <Flashlight className="w-5 h-5 fill-current" /> : <FlashlightOff className="w-5 h-5" />}
          </button>
        ) : (
          <div className="w-10 h-10" />
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

            {/* 3. Screen Viewfinder Vignette & Frame Guide Overlay */}
            {frameMetrics && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* SVG Mask: darkens the area outside the maximum sheet frame */}
                <svg className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <mask id="omr-viewfinder-mask">
                      <rect width="100%" height="100%" fill="white" />
                      <rect 
                        x={frameMetrics.frameLeft} 
                        y={frameMetrics.frameTop} 
                        width={frameMetrics.frameWidth} 
                        height={frameMetrics.frameHeight} 
                        rx="16" 
                        fill="black" 
                      />
                    </mask>
                  </defs>

                  {/* Darkened outer vignette */}
                  <rect 
                    width="100%" 
                    height="100%" 
                    fill="rgba(0, 0, 0, 0.60)" 
                    mask="url(#omr-viewfinder-mask)" 
                  />

                  {/* Viewfinder Frame Border */}
                  <rect 
                    x={frameMetrics.frameLeft} 
                    y={frameMetrics.frameTop} 
                    width={frameMetrics.frameWidth} 
                    height={frameMetrics.frameHeight} 
                    rx="16" 
                    fill="none" 
                    stroke="rgba(255, 255, 255, 0.75)" 
                    strokeWidth="2.5" 
                  />
                </svg>

                {/* 4 Corner Target Boxes & Alignment Guides */}
                <div 
                  className="absolute pointer-events-none"
                  style={{
                    left: `${frameMetrics.frameLeft}px`,
                    top: `${frameMetrics.frameTop}px`,
                    width: `${frameMetrics.frameWidth}px`,
                    height: `${frameMetrics.frameHeight}px`,
                  }}
                >
                  {/* Top Guide Indicator */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-[11px] font-bold text-white uppercase tracking-wider select-none">
                    Top
                  </div>

                  {/* Top-Left Target Box */}
                  <div 
                    className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-xl pointer-events-none transition-all duration-150 flex items-center justify-center ${
                      isTL 
                        ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_16px_rgba(52,211,153,0.6)] scale-105' 
                        : 'border-2 border-white/80 bg-black/35 shadow-md'
                    }`}
                    style={{ left: `${marginPctX}%`, top: `${marginPctTop}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    {isTL ? (
                      <div className="w-4 h-4 bg-emerald-400 rounded-xs shadow-sm animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 border border-dashed border-white/40 rounded-xs" />
                    )}
                  </div>

                  {/* Top-Right Target Box */}
                  <div 
                    className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-xl pointer-events-none transition-all duration-150 flex items-center justify-center ${
                      isTR 
                        ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_16px_rgba(52,211,153,0.6)] scale-105' 
                        : 'border-2 border-white/80 bg-black/35 shadow-md'
                    }`}
                    style={{ left: `${100 - marginPctX}%`, top: `${marginPctTop}%`, transform: 'translate(50%, -50%)' }}
                  >
                    {isTR ? (
                      <div className="w-4 h-4 bg-emerald-400 rounded-xs shadow-sm animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 border border-dashed border-white/40 rounded-xs" />
                    )}
                  </div>

                  {/* Bottom-Right Target Box */}
                  <div 
                    className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-xl pointer-events-none transition-all duration-150 flex items-center justify-center ${
                      isBR 
                        ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_16px_rgba(52,211,153,0.6)] scale-105' 
                        : 'border-2 border-white/80 bg-black/35 shadow-md'
                    }`}
                    style={{ left: `${100 - marginPctX}%`, top: `${100 - marginPctBottom}%`, transform: 'translate(50%, 50%)' }}
                  >
                    {isBR ? (
                      <div className="w-4 h-4 bg-emerald-400 rounded-xs shadow-sm animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 border border-dashed border-white/40 rounded-xs" />
                    )}
                  </div>

                  {/* Bottom-Left Target Box */}
                  <div 
                    className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-xl pointer-events-none transition-all duration-150 flex items-center justify-center ${
                      isBL 
                        ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_16px_rgba(52,211,153,0.6)] scale-105' 
                        : 'border-2 border-white/80 bg-black/35 shadow-md'
                    }`}
                    style={{ left: `${marginPctX}%`, top: `${100 - marginPctBottom}%`, transform: 'translate(-50%, 50%)' }}
                  >
                    {isBL ? (
                      <div className="w-4 h-4 bg-emerald-400 rounded-xs shadow-sm animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 border border-dashed border-white/40 rounded-xs" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Real-time SVG Tracking Polygon (Over Video Feed with viewBox 0 0 100 100) */}
            {cameraReady && (
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none z-20" 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
              >
                {outerCorners && detectionState?.detected && (
                  <polygon
                    points={`${outerCorners.tl.x},${outerCorners.tl.y} ${outerCorners.tr.x},${outerCorners.tr.y} ${outerCorners.br.x},${outerCorners.br.y} ${outerCorners.bl.x},${outerCorners.bl.y}`}
                    fill={polygonFill}
                    stroke={polygonStroke}
                    strokeWidth={status === 'locked' ? '0.7' : '0.4'}
                    strokeDasharray={status === 'searching' ? '1.5 1' : 'none'}
                    className="transition-all duration-100 ease-out"
                  />
                )}

                {fiducials && detectionState?.detected && (
                  <>
                    <ScreenReticle x={fiducials.tl.x} y={fiducials.tl.y} stroke={polygonStroke} corner="tl" />
                    <ScreenReticle x={fiducials.tr.x} y={fiducials.tr.y} stroke={polygonStroke} corner="tr" />
                    <ScreenReticle x={fiducials.br.x} y={fiducials.br.y} stroke={polygonStroke} corner="br" />
                    <ScreenReticle x={fiducials.bl.x} y={fiducials.bl.y} stroke={polygonStroke} corner="bl" />
                  </>
                )}
              </svg>
            )}

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
      <div className="relative z-30 px-6 pt-3 pb-6 bg-gradient-to-t from-black via-black/85 to-transparent flex flex-col gap-3">
        {/* Helper Tip */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
          <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
          <span>Align the sheet in the frame &bull; Auto-scans when steady or tap Shutter</span>
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
            className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95"
            title="Freeze frame and switch to Manual 8-handle Crop"
          >
            <div className="w-11 h-11 rounded-full bg-zinc-800/80 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-zinc-700">
              <Sliders className="w-5 h-5 text-zinc-300" />
            </div>
            <span className="text-[10px] font-semibold tracking-wide">Manual Crop</span>
          </button>

          {/* Shutter Button with Circular Stability Progress Ring */}
          <div className="relative flex items-center justify-center">
            {/* Circular Progress SVG */}
            <svg className="w-20 h-20 -rotate-90 pointer-events-none">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke={status === 'locked' ? '#10b981' : '#06b6d4'}
                strokeWidth="4"
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
              onClick={() => executeCapture()}
              disabled={!cameraReady || isProcessingFinalWarp}
              className="absolute w-16 h-16 rounded-full bg-white hover:bg-zinc-200 active:scale-90 transition-all flex items-center justify-center shadow-lg border-2 border-zinc-900 cursor-pointer disabled:opacity-50"
              title="Capture OMR Sheet Now"
            >
              <div className={`w-13 h-13 rounded-full transition-all ${status === 'locked' ? 'bg-emerald-500 scale-95' : 'bg-white'}`} />
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
            className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95"
            title="Upload pre-taken photo from device"
          >
            <div className="w-11 h-11 rounded-full bg-zinc-800/80 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-zinc-700">
              <Upload className="w-5 h-5 text-zinc-300" />
            </div>
            <span className="text-[10px] font-semibold tracking-wide">Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Screen corner reticle indicator in SVG percentage space
 */
const ScreenReticle: React.FC<{
  x: number;
  y: number;
  stroke: string;
  corner: 'tl' | 'tr' | 'br' | 'bl';
}> = ({ x, y, stroke, corner }) => {
  const armLen = 2.5; // in % viewBox units
  let d = '';

  switch (corner) {
    case 'tl':
      d = `M ${armLen} 0 L 0 0 L 0 ${armLen}`;
      break;
    case 'tr':
      d = `M ${-armLen} 0 L 0 0 L 0 ${armLen}`;
      break;
    case 'br':
      d = `M ${-armLen} 0 L 0 0 L 0 ${-armLen}`;
      break;
    case 'bl':
      d = `M ${armLen} 0 L 0 0 L 0 ${-armLen}`;
      break;
  }

  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="0.8" fill={stroke} opacity="0.6" />
      <circle r="0.5" fill="#ffffff" />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};
