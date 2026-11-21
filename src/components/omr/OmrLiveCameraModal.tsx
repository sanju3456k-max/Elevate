import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  Flashlight, 
  FlashlightOff, 
  RotateCcw, 
  Upload, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { OmrLiveDetector, LiveOmrDetectionFrame, LiveScannerStatus } from '../../lib/omrLiveDetector';
import { warpPerspectiveCanvas, QuadPoint } from '../../lib/omrPerspectiveWarp';
import { getOmrLayoutConfig } from '../../lib/omrGeometry';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBackHandler } from '../../hooks/useBackNavigation';

interface OmrLiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureRectified: (rectifiedDataUrl: string, rawCapturedDataUrl: string) => void;
  onSwitchToManualCrop?: (rawCapturedDataUrl: string) => void;
  onUploadFile?: () => void;
  totalQuestions?: number;
}

export const OmrLiveCameraModal: React.FC<OmrLiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCaptureRectified,
  onSwitchToManualCrop,
  onUploadFile,
  totalQuestions = 50,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

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

  // Play pleasant lock chime using Web Audio API
  const playCaptureSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12); // G5
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

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps: any = track.getCapabilities();
          if (caps && caps.torch) {
            setHasTorchCapability(true);
          }
        }

        setCameraReady(true);
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
  }, [stopCameraStream]);

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

      // 2. Use detected outer page corners (or fallback)
      const currentDetection = detectionState;
      const corners = targetCorners || currentDetection?.outerCorners || {
        tl: { x: 5, y: 5 },
        tr: { x: 95, y: 5 },
        br: { x: 95, y: 95 },
        bl: { x: 5, y: 95 },
      };

      // 3. Convert percentage corners to pixel coordinates
      const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: (corners.tl.x / 100) * vw, y: (corners.tl.y / 100) * vh },
        { x: (corners.tr.x / 100) * vw, y: (corners.tr.y / 100) * vh },
        { x: (corners.br.x / 100) * vw, y: (corners.br.y / 100) * vh },
        { x: (corners.bl.x / 100) * vw, y: (corners.bl.y / 100) * vh },
      ];

      // 4. Target canonical A4 rectified dimensions (e.g., 1414 x 2000 at ~170 DPI)
      const layout = getOmrLayoutConfig(totalQuestions, undefined, 'a4');
      const dstWidth = 1414;
      const dstHeight = Math.round(dstWidth * (layout.pageHeightMm / layout.pageWidthMm));

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
        const rectifiedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.92);
        onCaptureRectified(rectifiedDataUrl, rawCapturedDataUrl);
      } else {
        // Fallback to raw if warp fails
        onCaptureRectified(rawCapturedDataUrl, rawCapturedDataUrl);
      }

      setIsProcessingFinalWarp(false);
      isCapturingRef.current = false;
    },
    [detectionState, totalQuestions, playCaptureSound, triggerHaptic, stopCameraStream, onCaptureRectified]
  );

  // Main Detection Loop
  useEffect(() => {
    if (!isOpen || !cameraReady) return;

    if (!detectorRef.current) {
      detectorRef.current = new OmrLiveDetector(totalQuestions);
    } else {
      detectorRef.current.setLayout(totalQuestions);
    }

    let isRunning = true;

    const runDetectionStep = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const detector = detectorRef.current;

      if (video && detector && !isCapturingRef.current && video.readyState >= 2) {
        const result = detector.processFrame(video);
        if (result) {
          setDetectionState(result);

          // Auto-Snap Trigger Condition
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
  }, [isOpen, cameraReady, totalQuestions, executeCapture]);

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
  let polygonFill = 'rgba(234, 179, 8, 0.05)';
  let statusBadgeBg = 'bg-amber-500/80 text-amber-100';

  if (status === 'locked') {
    polygonStroke = '#10b981'; // Green
    polygonFill = 'rgba(16, 185, 129, 0.20)';
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

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col select-none overflow-hidden touch-none font-sans">
      {/* 1. Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-3 pb-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
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
          <div className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition-all shadow-lg ${statusBadgeBg}`}>
            {status === 'locked' ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : status === 'stabilizing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>{detectionState?.guidanceMessage || 'Align 4 corner markers inside view'}</span>
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
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="px-6 text-center max-w-sm flex flex-col items-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-bold text-white mb-2">Camera Access Error</h3>
            <p className="text-xs text-zinc-300 mb-5 leading-relaxed">{cameraError}</p>
            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={initCamera}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all"
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
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
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

            {/* 3. Real-time SVG HUD Tracking Overlay */}
            {cameraReady && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" preserveAspectRatio="none">
                {/* Detected Quadrilateral Area */}
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

                {/* 4 Corner Marker Crosshair Reticles */}
                {fiducials && detectionState?.detected && (
                  <>
                    <CornerReticle x={fiducials.tl.x} y={fiducials.tl.y} stroke={polygonStroke} corner="tl" />
                    <CornerReticle x={fiducials.tr.x} y={fiducials.tr.y} stroke={polygonStroke} corner="tr" />
                    <CornerReticle x={fiducials.br.x} y={fiducials.br.y} stroke={polygonStroke} corner="br" />
                    <CornerReticle x={fiducials.bl.x} y={fiducials.bl.y} stroke={polygonStroke} corner="bl" />
                  </>
                )}

                {/* Fallback Framing Guide if sheet not yet detected */}
                {(!detectionState || !detectionState.detected) && (
                  <rect
                    x="12%"
                    y="10%"
                    width="76%"
                    height="80%"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth="1.5"
                    strokeDasharray="8 8"
                    rx="12"
                  />
                )}
              </svg>
            )}

            {/* Fullscreen processing indicator during final warp */}
            {isProcessingFinalWarp && (
              <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
                <p className="text-sm font-bold text-white">Rectifying Perspective & Unskewing...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. Bottom Control Bar */}
      <div className="relative z-30 px-6 pt-3 pb-6 bg-gradient-to-t from-black via-black/85 to-transparent flex flex-col gap-3">
        {/* Helper Tip */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
          <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
          <span>Hold steady when squares are detected for automatic capture</span>
        </div>

        {/* Shutter and Secondary Action Buttons */}
        <div className="flex items-center justify-between max-w-sm mx-auto w-full">
          {/* Switch to Manual Crop Button */}
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

          {/* Primary Shutter Button with Progress Ring */}
          <div className="relative flex items-center justify-center">
            {/* SVG Circular Progress Ring */}
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

          {/* Upload Button */}
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

/**
 * Draws a corner bracket crosshair centered at (x%, y%)
 */
const CornerReticle: React.FC<{
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
      {/* Outer Glow */}
      <circle r="4" fill={stroke} opacity="0.6" />
      {/* Center Marker Dot */}
      <circle r="2.5" fill="#ffffff" />
      {/* Bracket Path */}
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
