import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  Flashlight, 
  FlashlightOff, 
  Upload, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { OmrLiveDetector, LiveOmrDetectionFrame, LiveScannerStatus, NormalizedRect } from '../../lib/omrLiveDetector';
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
  // Screen pixel dimensions of the maximum frame
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  // Normalized 0..1 coordinates relative to the underlying video feed
  normX: number;
  normY: number;
  normWidth: number;
  normHeight: number;
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
  const [frameMetrics, setFrameMetrics] = useState<FrameLayoutMetrics | null>(null);
  const frameMetricsRef = useRef<FrameLayoutMetrics | null>(null);

  // Update layout metrics reference
  useEffect(() => {
    frameMetricsRef.current = frameMetrics;
  }, [frameMetrics]);

  // Compute maximum full-area screen frame matching sheet physical aspect ratio
  const calculateMaximumFrame = useCallback(() => {
    const container = viewportRef.current;
    const video = videoRef.current;
    if (!container) return;

    const contW = container.clientWidth;
    const contH = container.clientHeight;
    if (contW <= 50 || contH <= 50) return;

    // Physical aspect ratio of this specific test paper (e.g. 210mm / 125mm = 1.68, or 210mm / 297mm = 0.707)
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

    // Map screen frame to underlying video normalized coordinates [0..1]
    let normX = fLeft / contW;
    let normY = fTop / contH;
    let normWidth = fWidth / contW;
    let normHeight = fHeight / contH;

    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const videoAspect = vw / vh;
      const contAspect = contW / contH;

      // Handle CSS object-cover transformation
      let renderedW = contW;
      let renderedH = contH;
      let offsetX = 0;
      let offsetY = 0;

      if (videoAspect > contAspect) {
        renderedW = contH * videoAspect;
        offsetX = (renderedW - contW) / 2;
      } else {
        renderedH = contW / videoAspect;
        offsetY = (renderedH - contH) / 2;
      }

      normX = Math.max(0, Math.min(1, (fLeft + offsetX) / renderedW));
      normY = Math.max(0, Math.min(1, (fTop + offsetY) / renderedH));
      normWidth = Math.max(0.1, Math.min(1, fWidth / renderedW));
      normHeight = Math.max(0.1, Math.min(1, fHeight / renderedH));
    }

    const metrics: FrameLayoutMetrics = {
      frameLeft: fLeft,
      frameTop: fTop,
      frameWidth: Math.round(fWidth),
      frameHeight: Math.round(fHeight),
      normX,
      normY,
      normWidth,
      normHeight,
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

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 15 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps: any = track.getCapabilities();
          if (caps && caps.torch) {
            setHasTorchCapability(true);
          }
        }

        setCameraReady(true);
        calculateMaximumFrame();
      }
    } catch (err: any) {
      console.error('Error starting live camera stream:', err);
      let errorMsg = 'Unable to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission was denied. Please allow camera access in your device settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No rear camera found on this device.';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Camera is currently in use by another app.';
      }
      setCameraError(errorMsg);
    }
  }, [stopCameraStream, calculateMaximumFrame]);

  // Toggle Torch/Flashlight
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
    async (targetCorners?: { tl: QuadPoint; tr: QuadPoint; br: QuadPoint; bl: QuadPoint }) => {
      if (isCapturingRef.current) return;
      isCapturingRef.current = true;
      setIsProcessingFinalWarp(true);

      triggerHaptic();
      playCaptureSound();

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

      // 2. Determine source corners:
      // Prefer detected outer corners; if unconfirmed, snap to the exact on-screen alignment frame!
      const currentDetection = detectionState;
      const metrics = frameMetricsRef.current;

      let corners = targetCorners;
      if (!corners && currentDetection?.detected && currentDetection.outerCorners) {
        corners = currentDetection.outerCorners;
      }

      if (!corners) {
        // Fallback to exact on-screen frame normalized to video
        if (metrics) {
          corners = {
            tl: { x: metrics.normX * 100, y: metrics.normY * 100 },
            tr: { x: (metrics.normX + metrics.normWidth) * 100, y: metrics.normY * 100 },
            br: { x: (metrics.normX + metrics.normWidth) * 100, y: (metrics.normY + metrics.normHeight) * 100 },
            bl: { x: metrics.normX * 100, y: (metrics.normY + metrics.normHeight) * 100 },
          };
        } else {
          corners = {
            tl: { x: 10, y: 10 },
            tr: { x: 90, y: 10 },
            br: { x: 90, y: 90 },
            bl: { x: 10, y: 90 },
          };
        }
      }

      // 3. Convert percentage corners to pixel coordinates
      const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: (corners.tl.x / 100) * vw, y: (corners.tl.y / 100) * vh },
        { x: (corners.tr.x / 100) * vw, y: (corners.tr.y / 100) * vh },
        { x: (corners.br.x / 100) * vw, y: (corners.br.y / 100) * vh },
        { x: (corners.bl.x / 100) * vw, y: (corners.bl.y / 100) * vh },
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

      if (video && detector && !isCapturingRef.current && video.readyState >= 2) {
        const frameNormalized: NormalizedRect | undefined = metrics
          ? {
              x: metrics.normX,
              y: metrics.normY,
              width: metrics.normWidth,
              height: metrics.normHeight,
            }
          : undefined;

        const result = detector.processFrame(video, frameNormalized);
        if (result) {
          setDetectionState(result);

          if (result.shouldAutoSnap && !isCapturingRef.current) {
            isRunning = false;
            executeCapture(result.outerCorners);
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

  if (!isOpen) return null;

  const status: LiveScannerStatus = detectionState?.status || 'searching';
  const progress = detectionState?.stabilityProgress || 0;
  const fiducials = detectionState?.fiducials;
  const outerCorners = detectionState?.outerCorners;

  // Determine HUD line color based on status
  let polygonStroke = '#eab308'; // Yellow for searching
  let polygonFill = 'rgba(234, 179, 8, 0.04)';
  let statusBadgeBg = 'bg-amber-500/85 text-amber-100';

  if (status === 'locked') {
    polygonStroke = '#10b981'; // Green
    polygonFill = 'rgba(16, 185, 129, 0.22)';
    statusBadgeBg = 'bg-emerald-600 text-white';
  } else if (status === 'stabilizing') {
    polygonStroke = '#06b6d4'; // Cyan
    polygonFill = 'rgba(6, 182, 212, 0.14)';
    statusBadgeBg = 'bg-cyan-600 text-white';
  } else if (status === 'tracking') {
    polygonStroke = '#3b82f6'; // Blue
    polygonFill = 'rgba(59, 130, 246, 0.08)';
    statusBadgeBg = 'bg-blue-600 text-white';
  }

  // Margin percentages within frame for the 4 corner target brackets
  const marginPctX = (10 / activeLayout.pageWidthMm) * 100;
  const marginPctTop = (10 / activeLayout.pageHeightMm) * 100;
  const marginPctBottom = ((activeLayout.pageHeightMm - activeLayout.bottomFiducialY_mm) / activeLayout.pageHeightMm) * 100;

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
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* 3. Screen Viewfinder Vignette & Frame Guide Overlay */}
            {cameraReady && frameMetrics && (
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

                {/* Corner Guide Reticles positioned inside the frame */}
                <div 
                  className="absolute"
                  style={{
                    left: `${frameMetrics.frameLeft}px`,
                    top: `${frameMetrics.frameTop}px`,
                    width: `${frameMetrics.frameWidth}px`,
                    height: `${frameMetrics.frameHeight}px`,
                  }}
                >
                  {/* Top-Left Target Bracket */}
                  <div 
                    className="absolute w-8 h-8 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg pointer-events-none transition-all"
                    style={{ left: `${marginPctX}%`, top: `${marginPctTop}%`, transform: 'translate(-50%, -50%)' }}
                  />
                  {/* Top-Right Target Bracket */}
                  <div 
                    className="absolute w-8 h-8 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg pointer-events-none transition-all"
                    style={{ left: `${100 - marginPctX}%`, top: `${marginPctTop}%`, transform: 'translate(50%, -50%)' }}
                  />
                  {/* Bottom-Right Target Bracket */}
                  <div 
                    className="absolute w-8 h-8 border-b-3 border-r-3 border-emerald-400 rounded-br-lg pointer-events-none transition-all"
                    style={{ left: `${100 - marginPctX}%`, top: `${100 - marginPctBottom}%`, transform: 'translate(50%, 50%)' }}
                  />
                  {/* Bottom-Left Target Bracket */}
                  <div 
                    className="absolute w-8 h-8 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg pointer-events-none transition-all"
                    style={{ left: `${marginPctX}%`, top: `${100 - marginPctBottom}%`, transform: 'translate(-50%, 50%)' }}
                  />
                </div>
              </div>
            )}

            {/* 4. Real-time SVG Tracking Polygon (Over Video Feed) */}
            {cameraReady && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" preserveAspectRatio="none">
                {outerCorners && detectionState?.detected && (
                  <polygon
                    points={`
                      ${outerCorners.tl.x}%,${outerCorners.tl.y}% 
                      ${outerCorners.tr.x}%,${outerCorners.tr.y}% 
                      ${outerCorners.br.x}%,${outerCorners.br.y}% 
                      ${outerCorners.bl.x}%,${outerCorners.bl.y}%
                    `}
                    fill={polygonFill}
                    stroke={polygonStroke}
                    strokeWidth={status === 'locked' ? '4' : '2.5'}
                    strokeDasharray={status === 'searching' ? '6 4' : 'none'}
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

        {/* Shutter and Secondary Action Buttons */}
        <div className="flex items-center justify-between max-w-sm mx-auto w-full">
          {/* Switch to Manual 8-Handle Crop Button */}
          <button
            type="button"
            onClick={async () => {
              const video = videoRef.current;
              if (video && video.videoWidth > 0 && onSwitchToManualCrop) {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0);
                  const rawUrl = canvas.toDataURL('image/jpeg', 0.95);
                  stopCameraStream();
                  onClose();
                  onSwitchToManualCrop(rawUrl);
                  return;
                }
              }
              onClose();
            }}
            className="flex flex-col items-center gap-1 text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer"
            title="Switch to manual 8-handle crop"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900/90 border border-zinc-700/80 flex items-center justify-center shadow-md">
              <Sliders className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold">Manual Crop</span>
          </button>

          {/* Primary Shutter Button with Radial Progress Ring */}
          <div className="relative flex items-center justify-center">
            <svg className="w-20 h-20 -rotate-90 pointer-events-none absolute" viewBox="0 0 80 80">
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
                strokeDashoffset={(1 - progress) * 2 * Math.PI * 36}
                strokeLinecap="round"
                className="transition-all duration-100 ease-out"
              />
            </svg>

            {/* Tap to Snap Button */}
            <button
              type="button"
              onClick={() => executeCapture()}
              disabled={!cameraReady || isProcessingFinalWarp}
              className="w-16 h-16 rounded-full bg-white hover:bg-zinc-200 active:scale-90 transition-all flex items-center justify-center shadow-lg border-2 border-zinc-900 cursor-pointer disabled:opacity-50"
              title="Capture OMR Sheet Now"
            >
              <div className={`w-13 h-13 rounded-full transition-all ${status === 'locked' ? 'bg-emerald-500 scale-95' : 'bg-white'}`} />
            </button>
          </div>

          {/* Gallery Upload Button */}
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
              if (onUploadFile) onUploadFile();
            }}
            className="flex flex-col items-center gap-1 text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer"
            title="Upload from gallery"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900/90 border border-zinc-700/80 flex items-center justify-center shadow-md">
              <Upload className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold">Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const ScreenReticle: React.FC<{
  x: number;
  y: number;
  stroke: string;
  corner: 'tl' | 'tr' | 'br' | 'bl';
}> = ({ x, y, stroke, corner }) => {
  const armLen = 14;
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
    <g transform={`translate(${x}%, ${y}%)`}>
      <circle r="4" fill={stroke} opacity="0.6" />
      <circle r="2.5" fill="#ffffff" />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};
