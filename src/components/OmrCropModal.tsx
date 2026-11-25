import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  X,
  RotateCcw, 
  RotateCw, 
  Move, 
  Maximize2,
  Loader2,
  Camera,
  Upload,
  Sparkles
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { 
  warpPerspectiveCanvas, 
  QuadPoint, 
  QuadCorners, 
  autoDetectFiducialsOnCanvas,
  checkFrameAlignmentQuality,
  AlignmentQualityResult
} from '../lib/omrPerspectiveWarp';
import { OmrCorners, getOmrLayoutConfig } from '../lib/omrGeometry';
import { autoDetectOmrFiducials } from '../lib/omrAutoCropper';
import { 
  studioModalVariants, 
  studioBackdropVariants, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface OmrCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApplyCrop: (croppedDataUrl: string, precalibratedFiducials?: OmrCorners) => void;
  targetWidthMm?: number;
  targetHeightMm?: number;
  bottomFiducialY_mm?: number;
  totalQuestions?: number;
  onRetake?: () => void;
  onUploadNew?: () => void;
}

type CornerId = 'tl' | 'tr' | 'br' | 'bl';
type EdgeId = 'edge-top' | 'edge-right' | 'edge-bottom' | 'edge-left';
type DragTarget = CornerId | EdgeId | 'move-all' | null;

interface DisplayLayout {
  width: number;
  height: number;
  left: number;
  top: number;
}

const DEFAULT_CORNERS: QuadCorners = {
  tl: { x: 4.8, y: 3.4 },
  tr: { x: 95.2, y: 3.4 },
  br: { x: 95.2, y: 96.6 },
  bl: { x: 4.8, y: 96.6 },
};

export const OmrCropModal: React.FC<OmrCropModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApplyCrop,
  targetWidthMm = 210,
  targetHeightMm = 297,
  bottomFiducialY_mm,
  totalQuestions,
  onRetake,
  onUploadNew,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

  const stageRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentLoadedUrlRef = useRef<string>('');
  const lastCachedRotRef = useRef<number>(-1);

  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imgDisplayLayout, setImgDisplayLayout] = useState<DisplayLayout>({ width: 0, height: 0, left: 0, top: 0 });

  // 4 Corner fiducial markers (percentage 0 to 100 within current rotated orientation)
  const [corners, setCorners] = useState<QuadCorners>(DEFAULT_CORNERS);
  const cornersRef = useRef<QuadCorners>(corners);
  useEffect(() => {
    cornersRef.current = corners;
  }, [corners]);

  // Drag interaction state
  const [activeDragTarget, setActiveDragTarget] = useState<DragTarget>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; isFlippedBelow?: boolean } | null>(null);
  const [isProcessingCrop, setIsProcessingCrop] = useState<boolean>(false);
  const [autoCropNotification, setAutoCropNotification] = useState<string | null>(null);
  const [alignmentResult, setAlignmentResult] = useState<AlignmentQualityResult>({
    isGood: false,
    score: 0,
    label: 'Align corners to squares',
  });

  const activeLayoutRef = useRef<DisplayLayout>({ width: 0, height: 0, left: 0, top: 0 });

  // Layout-aware fiducial detection: prioritizes blueprint-matched hollow square centers
  // (with 3-candidate recovery) and falls back to generic canvas fiducial detection.
  const detectBestFiducials = useCallback(
    (canvas: HTMLCanvasElement): QuadCorners | null => {
      const baseLayout = getOmrLayoutConfig(totalQuestions || 50, undefined, 'a4');
      const layout = {
        ...baseLayout,
        pageWidthMm: targetWidthMm || baseLayout.pageWidthMm,
        pageHeightMm: targetHeightMm || baseLayout.pageHeightMm,
        bottomFiducialY_mm: bottomFiducialY_mm || baseLayout.bottomFiducialY_mm,
        fiducialSpanX_mm: (targetWidthMm || baseLayout.pageWidthMm) - 20,
        fiducialSpanY_mm: Math.max(15, (bottomFiducialY_mm || baseLayout.bottomFiducialY_mm) - 10),
      };
      const precisionResult = autoDetectOmrFiducials(canvas, layout);
      if (precisionResult.detected && precisionResult.confidence >= 0.40) {
        return precisionResult.fiducials;
      }
      return autoDetectFiducialsOnCanvas(canvas);
    },
    [totalQuestions, targetWidthMm, targetHeightMm, bottomFiducialY_mm]
  );
  useEffect(() => {
    activeLayoutRef.current = imgDisplayLayout;
  }, [imgDisplayLayout]);

  const dragCleanupRef = useRef<(() => void) | null>(null);

  const cleanupActiveDrag = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
    setActiveDragTarget(null);
    setLoupePos(null);
  }, []);

  // Prepare rotated source canvas cache strictly for the active image
  // Downsampled to max dimension 1600px for silky-smooth response and instant auto-alignment
  const updateRotatedCanvasCache = useCallback((sourceImg?: HTMLImageElement | null) => {
    const img = sourceImg || imgRef.current;
    if (!img) return;
    if (lastCachedRotRef.current === rotationDeg && rotCanvasRef.current) {
      return;
    }

    const nw = img.naturalWidth || img.width || 800;
    const nh = img.naturalHeight || img.height || 1100;

    const maxDim = 1600;
    const scale = Math.min(1.0, maxDim / Math.max(nw, nh));
    const snw = Math.max(200, Math.round(nw * scale));
    const snh = Math.max(200, Math.round(nh * scale));

    const isRot90or270 = rotationDeg === 90 || rotationDeg === 270;
    const rw = isRot90or270 ? snh : snw;
    const rh = isRot90or270 ? snw : snh;

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.drawImage(img, -snw / 2, -snh / 2, snw, snh);

    rotCanvasRef.current = canvas;
    lastCachedRotRef.current = rotationDeg;
  }, [rotationDeg]);

  // Measure stage and calculate image display dimensions to fill maximum viewport
  const updateDisplayLayout = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || imgNaturalSize.width === 0 || imgNaturalSize.height === 0) return;

    // Full available viewport stage width and height with small padding
    const stageWidth = Math.max(10, stage.clientWidth - 16);
    const stageHeight = Math.max(10, stage.clientHeight - 16);

    if (stageWidth <= 10 || stageHeight <= 10) return;

    const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
    const effectiveNatWidth = isRotated90or270 ? imgNaturalSize.height : imgNaturalSize.width;
    const effectiveNatHeight = isRotated90or270 ? imgNaturalSize.width : imgNaturalSize.height;

    const imgAspect = effectiveNatWidth / effectiveNatHeight;
    const stageAspect = stageWidth / stageHeight;

    let dispW = 0;
    let dispH = 0;

    if (imgAspect > stageAspect) {
      dispW = stageWidth;
      dispH = stageWidth / imgAspect;
    } else {
      dispH = stageHeight;
      dispW = stageHeight * imgAspect;
    }

    const dispLeft = Math.max(0, (stage.clientWidth - dispW) / 2);
    const dispTop = Math.max(0, (stage.clientHeight - dispH) / 2);

    const layout = {
      width: Math.max(20, Math.round(dispW)),
      height: Math.max(20, Math.round(dispH)),
      left: Math.round(dispLeft),
      top: Math.round(dispTop),
    };

    setImgDisplayLayout(layout);
    activeLayoutRef.current = layout;
  }, [imgNaturalSize, rotationDeg]);

  useEffect(() => {
    if (!isOpen) {
      cleanupActiveDrag();
      setIsProcessingCrop(false);
    } else {
      setIsProcessingCrop(false);
      updateDisplayLayout();
    }
    return () => {
      cleanupActiveDrag();
    };
  }, [isOpen, cleanupActiveDrag, updateDisplayLayout]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanupActiveDrag();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, cleanupActiveDrag]);

  // Load source image
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      cleanupActiveDrag();
      setImageLoaded(false);
      setRotationDeg(0);
      imgRef.current = null;
      rotCanvasRef.current = null;
      currentLoadedUrlRef.current = '';
      return;
    }

    // Always reset stale canvas and image references when loading an image
    cleanupActiveDrag();
    setImageLoaded(false);
    setRotationDeg(0);
    imgRef.current = null;
    rotCanvasRef.current = null;
    currentLoadedUrlRef.current = '';

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoaded = () => {
      if (isCancelled) return;
      imgRef.current = img;
      currentLoadedUrlRef.current = imageUrl;
      const nw = img.naturalWidth || img.width || 800;
      const nh = img.naturalHeight || img.height || 1100;
      setImgNaturalSize({ width: nw, height: nh });

      // Automatically orient landscape phone captures (wider than tall) to upright portrait 90° clockwise
      const isLandscape = nw > nh;
      const initialRot = isLandscape ? 90 : 0;
      setRotationDeg(initialRot);
      lastCachedRotRef.current = initialRot;

      let initialCorners = DEFAULT_CORNERS;

      // Downscale to maxDim = 1600 to eliminate canvas allocation lag and speed up auto-detection
      const maxDim = 1600;
      const scale = Math.min(1.0, maxDim / Math.max(nw, nh));
      const snw = Math.max(200, Math.round(nw * scale));
      const snh = Math.max(200, Math.round(nh * scale));

      const rw = isLandscape ? snh : snw;
      const rh = isLandscape ? snw : snh;
      const canvas = document.createElement('canvas');
      canvas.width = rw;
      canvas.height = rh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isLandscape) {
          ctx.translate(rw / 2, rh / 2);
          ctx.rotate((90 * Math.PI) / 180);
          ctx.drawImage(img, -snw / 2, -snh / 2, snw, snh);
        } else {
          ctx.drawImage(img, 0, 0, snw, snh);
        }
        rotCanvasRef.current = canvas;

        // Auto-detect printed corner registration squares on image load
        const autoDetected = detectBestFiducials(canvas);
        if (autoDetected) {
          initialCorners = autoDetected;
        }
      }

      setCorners(initialCorners);
      cornersRef.current = initialCorners;
      setImageLoaded(true);
    };

    img.onload = handleLoaded;
    img.onerror = () => {
      if (isCancelled) return;
      setImgNaturalSize({ width: 800, height: 1100 });
      setImageLoaded(true);
    };

    img.src = imageUrl;
    if (img.complete && img.naturalWidth > 0) {
      handleLoaded();
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, imageUrl, cleanupActiveDrag]);

  // Sync rotated canvas when image or rotation changes
  useEffect(() => {
    if (imageLoaded && imgRef.current) {
      updateRotatedCanvasCache(imgRef.current);
    }
  }, [imageLoaded, rotationDeg, updateRotatedCanvasCache]);

  // Real-time alignment quality check when corners or rotation change
  useEffect(() => {
    if (!imageLoaded || !rotCanvasRef.current) return;
    const res = checkFrameAlignmentQuality(rotCanvasRef.current, corners);
    setAlignmentResult(res);
  }, [corners, imageLoaded, rotationDeg]);

  // ResizeObserver for dynamic fullscreen responsiveness
  useEffect(() => {
    if (!isOpen || !stageRef.current) return;

    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      updateDisplayLayout();
    });
    ro.observe(el);

    updateDisplayLayout();

    const raf = requestAnimationFrame(() => {
      updateDisplayLayout();
    });

    const timer = setTimeout(() => {
      updateDisplayLayout();
    }, 100);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isOpen, imageLoaded, updateDisplayLayout]);

  // Rotate 90 degrees clockwise and auto-detect fiducials on rotated orientation
  const handleRotate = () => {
    cleanupActiveDrag();
    const nextRot = (rotationDeg + 90) % 360;
    setRotationDeg(nextRot);
    lastCachedRotRef.current = nextRot;

    const img = imgRef.current;
    if (img) {
      const nw = img.naturalWidth || img.width || 800;
      const nh = img.naturalHeight || img.height || 1100;

      const maxDim = 1600;
      const scale = Math.min(1.0, maxDim / Math.max(nw, nh));
      const snw = Math.max(200, Math.round(nw * scale));
      const snh = Math.max(200, Math.round(nh * scale));

      const isRot90or270 = nextRot === 90 || nextRot === 270;
      const rw = isRot90or270 ? snh : snw;
      const rh = isRot90or270 ? snw : snh;

      const canvas = document.createElement('canvas');
      canvas.width = rw;
      canvas.height = rh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(rw / 2, rh / 2);
        ctx.rotate((nextRot * Math.PI) / 180);
        ctx.drawImage(img, -snw / 2, -snh / 2, snw, snh);
        rotCanvasRef.current = canvas;
        const autoDetected = detectBestFiducials(canvas);
        if (autoDetected) {
          setCorners(autoDetected);
          cornersRef.current = autoDetected;
          return;
        }
      }
    }
    setCorners(DEFAULT_CORNERS);
    cornersRef.current = DEFAULT_CORNERS;
  };

  // Auto-detect and snap crop corners to the 4 printed registration squares
  const handleAutoFitSquares = () => {
    cleanupActiveDrag();
    if (rotCanvasRef.current) {
      const detected = detectBestFiducials(rotCanvasRef.current);
      if (detected) {
        setCorners(detected);
        cornersRef.current = detected;
        setAutoCropNotification('4 Corner Squares Auto-Aligned ✓');
        setTimeout(() => setAutoCropNotification(null), 2500);
        return;
      }
    }
    setCorners(DEFAULT_CORNERS);
    cornersRef.current = DEFAULT_CORNERS;
    setAutoCropNotification('Standard OMR Frame Applied');
    setTimeout(() => setAutoCropNotification(null), 2000);
  };

  // Reset corner boxes to default balanced positions
  const handleResetCorners = () => {
    cleanupActiveDrag();
    setCorners(DEFAULT_CORNERS);
    cornersRef.current = DEFAULT_CORNERS;
    setAutoCropNotification('Corners Reset to Default');
    setTimeout(() => setAutoCropNotification(null), 2000);
  };

  // Snap crop frame to absolute 100% full image dimensions
  const handleSnapFullImage = () => {
    cleanupActiveDrag();
    const fullCorners = {
      tl: { x: 0, y: 0 },
      tr: { x: 100, y: 0 },
      br: { x: 100, y: 100 },
      bl: { x: 0, y: 100 },
    };
    setCorners(fullCorners);
    cornersRef.current = fullCorners;
    setAutoCropNotification('Full Image Frame (100%)');
    setTimeout(() => setAutoCropNotification(null), 2000);
  };

  // Extend right edge dragger all the way to 100% image width
  const handleSnapRightEdge = () => {
    cleanupActiveDrag();
    setCorners((prev) => ({
      ...prev,
      tr: { ...prev.tr, x: 100 },
      br: { ...prev.br, x: 100 },
    }));
  };

  // Update magnifier loupe canvas with concentric square reticle and hairline crosshairs
  const updateLoupe = useCallback((cornerXPercent: number, cornerYPercent: number, clientX: number, clientY: number) => {
    const rotCanvas = rotCanvasRef.current;
    const loupeCanvas = loupeCanvasRef.current;
    if (!rotCanvas || !loupeCanvas) return;

    const loupeCtx = loupeCanvas.getContext('2d');
    if (!loupeCtx) return;

    const srcW = rotCanvas.width;
    const srcH = rotCanvas.height;
    const srcCenterX = (cornerXPercent / 100) * srcW;
    const srcCenterY = (cornerYPercent / 100) * srcH;

    const loupeSize = 110;
    const zoomFactor = 2.4;
    const sliceSize = loupeSize / zoomFactor;

    loupeCtx.clearRect(0, 0, loupeSize, loupeSize);

    // Render zoomed source region
    loupeCtx.drawImage(
      rotCanvas,
      srcCenterX - sliceSize / 2,
      srcCenterY - sliceSize / 2,
      sliceSize,
      sliceSize,
      0,
      0,
      loupeSize,
      loupeSize
    );

    const isGood = alignmentResult.isGood;

    // 1. Concentric target square bracket matching 5.5mm registration square at 2.4x zoom
    const targetBoxSize = 22;
    loupeCtx.strokeStyle = isGood ? '#10b981' : '#38bdf8';
    loupeCtx.lineWidth = 1.5;
    loupeCtx.strokeRect(
      loupeSize / 2 - targetBoxSize / 2, 
      loupeSize / 2 - targetBoxSize / 2, 
      targetBoxSize, 
      targetBoxSize
    );

    // 2. Precision hairline crosshairs leading to the target square
    loupeCtx.lineWidth = 1.0;
    loupeCtx.beginPath();
    // Horizontal lines
    loupeCtx.moveTo(loupeSize / 2 - 24, loupeSize / 2);
    loupeCtx.lineTo(loupeSize / 2 - targetBoxSize / 2 - 2, loupeSize / 2);
    loupeCtx.moveTo(loupeSize / 2 + targetBoxSize / 2 + 2, loupeSize / 2);
    loupeCtx.lineTo(loupeSize / 2 + 24, loupeSize / 2);
    // Vertical lines
    loupeCtx.moveTo(loupeSize / 2, loupeSize / 2 - 24);
    loupeCtx.lineTo(loupeSize / 2, loupeSize / 2 - targetBoxSize / 2 - 2);
    loupeCtx.moveTo(loupeSize / 2, loupeSize / 2 + targetBoxSize / 2 + 2);
    loupeCtx.lineTo(loupeSize / 2, loupeSize / 2 + 24);
    loupeCtx.stroke();

    // 3. Center point indicator
    loupeCtx.fillStyle = isGood ? '#34d399' : '#38bdf8';
    loupeCtx.beginPath();
    loupeCtx.arc(loupeSize / 2, loupeSize / 2, 2, 0, Math.PI * 2);
    loupeCtx.fill();

    // Position loupe well clear of finger
    const isFlippedBelow = clientY < 150;
    const loupeY = isFlippedBelow ? clientY + 105 : clientY - 95;

    setLoupePos({ x: clientX, y: loupeY, isFlippedBelow });
  }, [alignmentResult.isGood]);

  // Pointer drag start handler
  const handlePointerDown = (e: React.PointerEvent, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();

    cleanupActiveDrag();

    const pointerId = e.pointerId;
    const targetEl = e.currentTarget as HTMLElement;
    if (targetEl && typeof targetEl.setPointerCapture === 'function') {
      try {
        targetEl.setPointerCapture(pointerId);
      } catch (err) {
        // Safe fallback if setPointerCapture is unsupported
      }
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startCorners = { ...cornersRef.current };
    
    const containerRect = imageContainerRef.current?.getBoundingClientRect();
    const layoutWidth = containerRect?.width || activeLayoutRef.current.width || 320;
    const layoutHeight = containerRect?.height || activeLayoutRef.current.height || 420;

    if (layoutWidth <= 0 || layoutHeight <= 0) return;

    setActiveDragTarget(target);

    // Initial loupe positioning
    if (target && target !== 'move-all') {
      let focusX = 50;
      let focusY = 50;
      if (target === 'edge-right') {
        focusX = (startCorners.tr.x + startCorners.br.x) / 2;
        focusY = (startCorners.tr.y + startCorners.br.y) / 2;
      } else if (target === 'edge-left') {
        focusX = (startCorners.tl.x + startCorners.bl.x) / 2;
        focusY = (startCorners.tl.y + startCorners.bl.y) / 2;
      } else if (target === 'edge-top') {
        focusX = (startCorners.tl.x + startCorners.tr.x) / 2;
        focusY = (startCorners.tl.y + startCorners.tr.y) / 2;
      } else if (target === 'edge-bottom') {
        focusX = (startCorners.bl.x + startCorners.br.x) / 2;
        focusY = (startCorners.bl.y + startCorners.br.y) / 2;
      } else {
        const cornerPt = startCorners[target];
        focusX = cornerPt.x;
        focusY = cornerPt.y;
      }
      updateLoupe(focusX, focusY, startX, startY);
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();

      const currentRect = imageContainerRef.current?.getBoundingClientRect();
      const currentWidth = currentRect?.width || layoutWidth;
      const currentHeight = currentRect?.height || layoutHeight;
      if (currentWidth <= 0 || currentHeight <= 0) return;

      const deltaXPx = moveEvt.clientX - startX;
      const deltaYPx = moveEvt.clientY - startY;

      const deltaXPercent = (deltaXPx / currentWidth) * 100;
      const deltaYPercent = (deltaYPx / currentHeight) * 100;

      // Pointer direct percentage relative to container boundary
      let pointerXPercent = 50;
      let pointerYPercent = 50;
      if (currentRect && currentRect.width > 0 && currentRect.height > 0) {
        pointerXPercent = ((moveEvt.clientX - currentRect.left) / currentRect.width) * 100;
        pointerYPercent = ((moveEvt.clientY - currentRect.top) / currentRect.height) * 100;
      }

      if (target === 'move-all') {
        // Translate all four corners in unison
        const minX = Math.min(startCorners.tl.x, startCorners.tr.x, startCorners.br.x, startCorners.bl.x);
        const maxX = Math.max(startCorners.tl.x, startCorners.tr.x, startCorners.br.x, startCorners.bl.x);
        const minY = Math.min(startCorners.tl.y, startCorners.tr.y, startCorners.br.y, startCorners.bl.y);
        const maxY = Math.max(startCorners.tl.y, startCorners.tr.y, startCorners.br.y, startCorners.bl.y);

        const clampDeltaX = Math.max(-minX, Math.min(100 - maxX, deltaXPercent));
        const clampDeltaY = Math.max(-minY, Math.min(100 - maxY, deltaYPercent));

        const nextCorners: QuadCorners = {
          tl: { x: Number((startCorners.tl.x + clampDeltaX).toFixed(2)), y: Number((startCorners.tl.y + clampDeltaY).toFixed(2)) },
          tr: { x: Number((startCorners.tr.x + clampDeltaX).toFixed(2)), y: Number((startCorners.tr.y + clampDeltaY).toFixed(2)) },
          br: { x: Number((startCorners.br.x + clampDeltaX).toFixed(2)), y: Number((startCorners.br.y + clampDeltaY).toFixed(2)) },
          bl: { x: Number((startCorners.bl.x + clampDeltaX).toFixed(2)), y: Number((startCorners.bl.y + clampDeltaY).toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
      } else if (target === 'edge-right') {
        // Right edge dragger: smoothly moves TR and BR up to 100% of the image dimension
        const minRightX = Math.max(startCorners.tl.x + 1, startCorners.bl.x + 1);
        let newRightX = Math.max(minRightX, Math.min(100, Math.max(startCorners.tr.x, startCorners.br.x) + deltaXPercent));

        // Magnetic snap: if dragged close to the right edge or pointer is near edge, snap to exact 100%
        if (newRightX >= 97.5 || pointerXPercent >= 97.5) {
          newRightX = 100.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tr: { ...startCorners.tr, x: Number(newRightX.toFixed(2)) },
          br: { ...startCorners.br, x: Number(newRightX.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe(newRightX, (startCorners.tr.y + startCorners.br.y) / 2, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-left') {
        // Left edge dragger: moves TL and BL down to 0%
        const maxLeftX = Math.min(startCorners.tr.x - 1, startCorners.br.x - 1);
        let newLeftX = Math.max(0, Math.min(maxLeftX, Math.min(startCorners.tl.x, startCorners.bl.x) + deltaXPercent));

        if (newLeftX <= 2.5 || pointerXPercent <= 2.5) {
          newLeftX = 0.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tl: { ...startCorners.tl, x: Number(newLeftX.toFixed(2)) },
          bl: { ...startCorners.bl, x: Number(newLeftX.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe(newLeftX, (startCorners.tl.y + startCorners.bl.y) / 2, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-top') {
        // Top edge dragger: moves TL and TR up to 0%
        const maxTopY = Math.min(startCorners.bl.y - 1, startCorners.br.y - 1);
        let newTopY = Math.max(0, Math.min(maxTopY, Math.min(startCorners.tl.y, startCorners.tr.y) + deltaYPercent));

        if (newTopY <= 2.5 || pointerYPercent <= 2.5) {
          newTopY = 0.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tl: { ...startCorners.tl, y: Number(newTopY.toFixed(2)) },
          tr: { ...startCorners.tr, y: Number(newTopY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe((startCorners.tl.x + startCorners.tr.x) / 2, newTopY, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-bottom') {
        // Bottom edge dragger: moves BL and BR down to 100%
        const minBottomY = Math.max(startCorners.tl.y + 1, startCorners.tr.y + 1);
        let newBottomY = Math.max(minBottomY, Math.min(100, Math.max(startCorners.bl.y, startCorners.br.y) + deltaYPercent));

        if (newBottomY >= 97.5 || pointerYPercent >= 97.5) {
          newBottomY = 100.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          bl: { ...startCorners.bl, y: Number(newBottomY.toFixed(2)) },
          br: { ...startCorners.br, y: Number(newBottomY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe((startCorners.bl.x + startCorners.br.x) / 2, newBottomY, moveEvt.clientX, moveEvt.clientY);
      } else if (target) {
        // Move single corner independently (TL, TR, BR, BL)
        const origPt = startCorners[target];
        let newX = Math.max(0, Math.min(100, origPt.x + deltaXPercent));
        let newY = Math.max(0, Math.min(100, origPt.y + deltaYPercent));

        // Magnetic snap to edges
        if (newX >= 97.5 || (target.includes('r') && pointerXPercent >= 97.5)) newX = 100.0;
        if (newX <= 2.5 || (target.includes('l') && pointerXPercent <= 2.5)) newX = 0.0;
        if (newY >= 97.5 || (target.includes('b') && pointerYPercent >= 97.5)) newY = 100.0;
        if (newY <= 2.5 || (target.includes('t') && pointerYPercent <= 2.5)) newY = 0.0;

        const nextCorners: QuadCorners = {
          ...startCorners,
          [target]: { x: Number(newX.toFixed(2)), y: Number(newY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);

        updateLoupe(newX, newY, moveEvt.clientX, moveEvt.clientY);
      }
    };

    const onPointerEnd = () => {
      if (targetEl && typeof targetEl.releasePointerCapture === 'function') {
        try {
          if (targetEl.hasPointerCapture(pointerId)) {
            targetEl.releasePointerCapture(pointerId);
          }
        } catch (err) {
          // Safe fallback
        }
      }
      cleanupActiveDrag();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onPointerEnd);

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', onPointerEnd);
    };
  };

  // Execute 4-point homography and rectify OMR image:
  // Maps corner fiducials to their exact canonical positions within the A4 page
  const executeApplyPerspectiveCrop = () => {
    cleanupActiveDrag();

    try {
      const activeImg = imgRef.current;
      // Re-generate rotated canvas cache strictly using current loaded image
      if (activeImg && currentLoadedUrlRef.current === imageUrl) {
        updateRotatedCanvasCache(activeImg);
      }

      let rotCanvas = rotCanvasRef.current;
      if (!rotCanvas && activeImg) {
        // Emergency canvas creation if cache missed
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = activeImg.naturalWidth || 800;
        fallbackCanvas.height = activeImg.naturalHeight || 1100;
        const ctx = fallbackCanvas.getContext('2d');
        if (ctx) ctx.drawImage(activeImg, 0, 0);
        rotCanvas = fallbackCanvas;
      }

      if (!rotCanvas) {
        onApplyCrop(imageUrl);
        onClose();
        return;
      }

      const rotW = rotCanvas.width || 800;
      const rotH = rotCanvas.height || 1100;

      // 1. Source points in pixels on rotated image
      const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: (corners.tl.x / 100) * rotW, y: (corners.tl.y / 100) * rotH }, // Top-Left
        { x: (corners.tr.x / 100) * rotW, y: (corners.tr.y / 100) * rotH }, // Top-Right
        { x: (corners.br.x / 100) * rotW, y: (corners.br.y / 100) * rotH }, // Bottom-Right
        { x: (corners.bl.x / 100) * rotW, y: (corners.bl.y / 100) * rotH }, // Bottom-Left
      ];

      // 2. Canonical target dimensions for rectified A4 OMR sheet
      const targetW = targetWidthMm || 210;
      const targetH = targetHeightMm || 297;
      const botFidY = bottomFiducialY_mm || (totalQuestions && totalQuestions > 100 ? 287 : 282);

      const dstWidth = 1200;
      const dstHeight = Math.max(120, Math.round((targetH / targetW) * dstWidth));

      // Canonical fiducial centers in rectified canvas pixel coordinates
      const fx0 = (10 / targetW) * dstWidth;
      const fx1 = ((targetW - 10) / targetW) * dstWidth;
      const fy0 = (10 / targetH) * dstHeight;
      const fy1 = (botFidY / targetH) * dstHeight;

      const canonicalFiducials: OmrCorners = {
        topLeft: { x: fx0, y: fy0 },
        topRight: { x: fx1, y: fy0 },
        bottomRight: { x: fx1, y: fy1 },
        bottomLeft: { x: fx0, y: fy1 },
      };

      // Destination Quad: exactly maps the 4 corner handles to their canonical positions on the A4 page!
      const dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: fx0, y: fy0 },
        { x: fx1, y: fy0 },
        { x: fx1, y: fy1 },
        { x: fx0, y: fy1 },
      ];

      // Perspective homography transformation
      const rectifiedCanvas = warpPerspectiveCanvas(rotCanvas, srcQuad, dstWidth, dstHeight, dstQuad);
      let croppedDataUrl: string | null = null;
      if (rectifiedCanvas) {
        croppedDataUrl = rectifiedCanvas.toDataURL('image/jpeg', 0.94);
      } else {
        console.warn('Perspective homography fallback to rotCanvas');
        croppedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.92);
      }

      onApplyCrop(croppedDataUrl || imageUrl, canonicalFiducials);
      onClose();
    } catch (err) {
      console.error('Cropping error:', err);
      // Fallback: apply raw imageUrl and close gracefully
      onApplyCrop(imageUrl);
      onClose();
    } finally {
      setIsProcessingCrop(false);
    }
  };

  const handleApplyClick = () => {
    if (isProcessingCrop) return;
    setIsProcessingCrop(true);
    // Let browser render the loading state on screen before executing heavy canvas warp
    setTimeout(() => {
      executeApplyPerspectiveCrop();
    }, 40);
  };

  if (!isOpen) return null;

  // Geometry calculations for on-screen SVG quad and centroid
  const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
  const imgWidth = isRotated90or270 ? (imgDisplayLayout.height || 420) : (imgDisplayLayout.width || 320);
  const imgHeight = isRotated90or270 ? (imgDisplayLayout.width || 320) : (imgDisplayLayout.height || 420);
  const imgLeft = (imgDisplayLayout.width - imgWidth) / 2;
  const imgTop = (imgDisplayLayout.height - imgHeight) / 2;

  const centroidX = (corners.tl.x + corners.tr.x + corners.br.x + corners.bl.x) / 4;
  const centroidY = (corners.tl.y + corners.tr.y + corners.br.y + corners.bl.y) / 4;

  const targetW = targetWidthMm || 210;
  const targetH = targetHeightMm || 297;
  const botFidY = bottomFiducialY_mm || (totalQuestions && totalQuestions > 100 ? 287 : 282);

  // Normalized margin proportions relative to the span between fiducial centers:
  const mX = 10 / Math.max(50, targetW - 20);
  const mTop = 10 / Math.max(15, botFidY - 10);
  const mBot = Math.max(0, targetH - botFidY) / Math.max(15, botFidY - 10);

  // Bilinear extrapolation from fiducial corners to full page edges
  const interpolateQuad = (u: number, v: number) => {
    const topX = corners.tl.x + (corners.tr.x - corners.tl.x) * u;
    const topY = corners.tl.y + (corners.tr.y - corners.tl.y) * u;
    const botX = corners.bl.x + (corners.br.x - corners.bl.x) * u;
    const botY = corners.bl.y + (corners.br.y - corners.bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  };

  const outerTL = interpolateQuad(-mX, -mTop);
  const outerTR = interpolateQuad(1 + mX, -mTop);
  const outerBR = interpolateQuad(1 + mX, 1 + mBot);
  const outerBL = interpolateQuad(-mX, 1 + mBot);

  const outerPolygonPoints = `${outerTL.x.toFixed(2)},${outerTL.y.toFixed(2)} ${outerTR.x.toFixed(2)},${outerTR.y.toFixed(2)} ${outerBR.x.toFixed(2)},${outerBR.y.toFixed(2)} ${outerBL.x.toFixed(2)},${outerBL.y.toFixed(2)}`;
  const quadPolygonPoints = `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={APP_STYLES.modal.backdrop}
        >
          <motion.div
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 w-full h-full max-h-[100dvh] rounded-none flex flex-col shadow-none overflow-hidden select-none"
          >
            {/* Minimal Header: 'Crop OMR' on Left, User Instruction badge, 'Close (X)' on Right */}
            <header className="px-4 sm:px-6 pt-[max(2.75rem,calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.75rem))] pb-2.5 bg-transparent flex items-center justify-between gap-2 shrink-0 z-30 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-zinc-100 tracking-tight select-none">
                  Crop OMR
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-semibold select-none transition-all shadow-xs ${
                    alignmentResult.isGood
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border border-black/5 dark:border-white/10'
                  }`}
                >
                  {alignmentResult.isGood ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  <span>{alignmentResult.label}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onRetake && (
                  <button
                    type="button"
                    onClick={() => {
                      cleanupActiveDrag();
                      onRetake();
                    }}
                    className="px-3.5 py-1.5 bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border border-black/5 dark:border-white/10 shadow-xs"
                    title="Take another photo with camera"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Retake</span>
                  </button>
                )}
                {onUploadNew && (
                  <button
                    type="button"
                    onClick={() => {
                      cleanupActiveDrag();
                      onUploadNew();
                    }}
                    className="px-3.5 py-1.5 bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border border-black/5 dark:border-white/10 shadow-xs"
                    title="Upload a different image"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Upload New</span>
                  </button>
                )}

                <button
                  id="close-omr-crop-modal-btn"
                  type="button"
                  onClick={() => {
                    cleanupActiveDrag();
                    onClose();
                  }}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 border border-black/5 dark:border-white/10 shadow-xs"
                  title="Close"
                >
                  <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              </div>
            </header>

            {/* ========================================================
                FULL VIEWPORT WORKSPACE STAGE (Maximum image visibility)
                ======================================================== */}
            <main
              ref={stageRef}
              className="relative flex-1 min-h-0 w-full bg-[#d0d7de]/50 dark:bg-[#06070a] flex items-center justify-center overflow-hidden p-2 sm:p-4 select-none"
              style={{ touchAction: 'none' }}
            >
              {!imageLoaded && (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center select-none animate-in fade-in duration-200">
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                    <Sparkles className="w-5 h-5 text-blue-500 absolute" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                      Auto-Aligning OMR Sheet...
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Detecting 4 corner registration squares
                    </span>
                  </div>
                </div>
              )}

        {imageLoaded && (
          <div
            ref={imageContainerRef}
            className="relative shadow-2xl"
            style={{
              width: `${imgDisplayLayout.width || 320}px`,
              height: `${imgDisplayLayout.height || 420}px`,
            }}
          >
            {/* Rendered Source Image with optional 90° rotation */}
            {imageUrl && imageUrl.trim() ? (
              <img
                src={imageUrl}
                alt="Scanned OMR Sheet"
                draggable={false}
                className="absolute pointer-events-none select-none rounded-none"
                style={{
                  width: `${imgWidth}px`,
                  height: `${imgHeight}px`,
                  left: `${imgLeft}px`,
                  top: `${imgTop}px`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `rotate(${rotationDeg}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            ) : null}

            {/* SVG Perspective Quadrilateral Overlay */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Mask to darken background desk outside the extrapolated full sheet boundary */}
                <mask id="quadMask">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <polygon points={outerPolygonPoints} fill="black" />
                </mask>
              </defs>

              {/* Outside Dark Scrim - Keeps entire page brightly illuminated */}
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="rgba(0, 0, 0, 0.48)"
                mask="url(#quadMask)"
              />

              {/* Full Page Subtle Boundary (Dashed Hairline) */}
              <polygon
                points={outerPolygonPoints}
                fill={alignmentResult.isGood ? 'rgba(16, 185, 129, 0.05)' : 'rgba(37, 99, 235, 0.04)'}
                stroke={alignmentResult.isGood ? 'rgba(16, 185, 129, 0.55)' : 'rgba(59, 130, 246, 0.45)'}
                strokeWidth="1"
                strokeDasharray="4,3"
                vectorEffect="non-scaling-stroke"
              />

              {/* Inside Fiducial Grid Highlight */}
              <polygon
                points={quadPolygonPoints}
                fill={alignmentResult.isGood ? 'rgba(16, 185, 129, 0.12)' : 'rgba(37, 99, 235, 0.08)'}
              />

              {/* 3x3 Perspective Interior Grid Lines */}
              {[0.25, 0.5, 0.75].map((t) => {
                const topX = corners.tl.x + (corners.tr.x - corners.tl.x) * t;
                const topY = corners.tl.y + (corners.tr.y - corners.tl.y) * t;
                const botX = corners.bl.x + (corners.br.x - corners.bl.x) * t;
                const botY = corners.bl.y + (corners.br.y - corners.bl.y) * t;

                const leftX = corners.tl.x + (corners.bl.x - corners.tl.x) * t;
                const leftY = corners.tl.y + (corners.bl.y - corners.tl.y) * t;
                const rightX = corners.tr.x + (corners.br.x - corners.tr.x) * t;
                const rightY = corners.tr.y + (corners.br.y - corners.tr.y) * t;

                return (
                  <g key={`guide-${t}`}>
                    <line
                      x1={topX}
                      y1={topY}
                      x2={botX}
                      y2={botY}
                      stroke={alignmentResult.isGood ? 'rgba(16, 185, 129, 0.30)' : 'rgba(37, 99, 235, 0.25)'}
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={leftX}
                      y1={leftY}
                      x2={rightX}
                      y2={rightY}
                      stroke={alignmentResult.isGood ? 'rgba(16, 185, 129, 0.30)' : 'rgba(37, 99, 235, 0.25)'}
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {/* Fiducial Frame Boundary Lines - Precision Hairline */}
              <line
                x1={corners.tl.x}
                y1={corners.tl.y}
                x2={corners.tr.x}
                y2={corners.tr.y}
                stroke={alignmentResult.isGood ? '#10b981' : '#2563eb'}
                strokeWidth={alignmentResult.isGood ? '1.5' : '1.25'}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.tr.x}
                y1={corners.tr.y}
                x2={corners.br.x}
                y2={corners.br.y}
                stroke={alignmentResult.isGood ? '#10b981' : '#2563eb'}
                strokeWidth={alignmentResult.isGood ? '1.5' : '1.25'}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.br.x}
                y1={corners.br.y}
                x2={corners.bl.x}
                y2={corners.bl.y}
                stroke={alignmentResult.isGood ? '#10b981' : '#2563eb'}
                strokeWidth={alignmentResult.isGood ? '1.5' : '1.25'}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.bl.x}
                y1={corners.bl.y}
                x2={corners.tl.x}
                y2={corners.tl.y}
                stroke={alignmentResult.isGood ? '#10b981' : '#2563eb'}
                strokeWidth={alignmentResult.isGood ? '1.5' : '1.25'}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Centroid Move-All Handle */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'move-all')}
              style={{
                left: `${centroidX}%`,
                top: `${centroidY}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/85 border border-blue-400/70 shadow-md flex items-center justify-center cursor-move z-20 hover:scale-110 active:scale-95 transition-transform"
              title="Drag to reposition all 4 corners"
            >
              <Move className="w-3.5 h-3.5 text-blue-400" />
            </div>

            {/* ========================================================
                EDGE MIDPOINT DRAGGERS (RIGHT, LEFT, TOP, BOTTOM) - SLENDER THIN DESIGN
                ======================================================== */}
            {/* 1. RIGHT Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-right')}
              onDoubleClick={handleSnapRightEdge}
              style={{
                left: `${(corners.tr.x + corners.br.x) / 2}%`,
                top: `${(corners.tr.y + corners.br.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ew-resize z-25 group py-2 px-1"
              title="Drag right border to image boundary (Double-click to snap 100%)"
            >
              <div
                className={`w-2 h-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-right'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 2. LEFT Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-left')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  tl: { ...prev.tl, x: 0 },
                  bl: { ...prev.bl, x: 0 },
                }));
              }}
              style={{
                left: `${(corners.tl.x + corners.bl.x) / 2}%`,
                top: `${(corners.tl.y + corners.bl.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ew-resize z-25 group py-2 px-1"
              title="Drag left border (Double-click to snap 0%)"
            >
              <div
                className={`w-2 h-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-left'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 3. TOP Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-top')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  tl: { ...prev.tl, y: 0 },
                  tr: { ...prev.tr, y: 0 },
                }));
              }}
              style={{
                left: `${(corners.tl.x + corners.tr.x) / 2}%`,
                top: `${(corners.tl.y + corners.tr.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ns-resize z-25 group px-2 py-1"
              title="Drag top border (Double-click to snap 0%)"
            >
              <div
                className={`h-2 w-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-top'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 4. BOTTOM Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-bottom')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  bl: { ...prev.bl, y: 100 },
                  br: { ...prev.br, y: 100 },
                }));
              }}
              style={{
                left: `${(corners.bl.x + corners.br.x) / 2}%`,
                top: `${(corners.bl.y + corners.br.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ns-resize z-25 group px-2 py-1"
              title="Drag bottom border (Double-click to snap 100%)"
            >
              <div
                className={`h-2 w-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-bottom'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* ========================================================
                4 INDEPENDENTLY DRAGGABLE CORNER SQUARE BOXES (CONCENTRIC TARGET CONTAINERS)
                ======================================================== */}
            {[
              { id: 'tl' as CornerId, label: 'TL', fullLabel: 'Top-Left', pt: corners.tl, align: 'bottom' },
              { id: 'tr' as CornerId, label: 'TR', fullLabel: 'Top-Right', pt: corners.tr, align: 'bottom' },
              { id: 'br' as CornerId, label: 'BR', fullLabel: 'Bottom-Right', pt: corners.br, align: 'top' },
              { id: 'bl' as CornerId, label: 'BL', fullLabel: 'Bottom-Left', pt: corners.bl, align: 'top' },
            ].map(({ id, label, fullLabel, pt, align }) => {
              const isActive = activeDragTarget === id;
              const isGood = alignmentResult.isGood;
              return (
                <div
                  key={id}
                  onPointerDown={(e) => handlePointerDown(e, id)}
                  style={{
                    left: `${pt.x}%`,
                    top: `${pt.y}%`,
                    touchAction: 'none',
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 group"
                  title={`${fullLabel} - drag to align with sheet registration square`}
                >
                  {/* Concentric Hollow Target Box - Sized 32x32px so printed square fits inside with even margin */}
                  <div
                    className={`relative w-8 h-8 rounded-[4px] border-2 transition-all flex items-center justify-center ${
                      isActive
                        ? isGood
                          ? 'border-emerald-300 bg-emerald-500/20 scale-125 shadow-lg shadow-emerald-500/50'
                          : 'border-blue-300 bg-blue-500/20 scale-125 shadow-lg shadow-blue-500/50'
                        : isGood
                        ? 'border-emerald-400 bg-emerald-950/15 group-hover:scale-110 group-hover:border-emerald-300'
                        : 'border-blue-400 bg-slate-950/15 group-hover:scale-110 group-hover:border-blue-300'
                    }`}
                  >
                    {/* Hairline crosshair guides */}
                    <div
                      className={`absolute w-3.5 h-px pointer-events-none ${
                        isGood ? 'bg-emerald-400/90' : 'bg-blue-400/90'
                      }`}
                    />
                    <div
                      className={`absolute h-3.5 w-px pointer-events-none ${
                        isGood ? 'bg-emerald-400/90' : 'bg-blue-400/90'
                      }`}
                    />
                    <div
                      className={`w-1.5 h-1.5 rounded-full pointer-events-none ${
                        isGood ? 'bg-emerald-300' : 'bg-blue-300'
                      }`}
                    />
                  </div>

                  {/* Corner Label Badge (Crisp & Compact) */}
                  <div
                    className={`absolute pointer-events-none select-none px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight whitespace-nowrap shadow-xs transition-opacity ${
                      align === 'top' ? '-top-5' : '-bottom-5'
                    } ${
                      isActive
                        ? isGood
                          ? 'bg-emerald-600 text-white font-extrabold opacity-100'
                          : 'bg-blue-600 text-white font-extrabold opacity-100'
                        : isGood
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 opacity-80 group-hover:opacity-100'
                        : 'bg-black/75 text-blue-300 border border-blue-500/30 opacity-70 group-hover:opacity-100'
                    }`}
                  >
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Zoom Loupe Lens */}
        {activeDragTarget && activeDragTarget !== 'move-all' && loupePos && (
          <div
            style={{
              left: `${loupePos.x}px`,
              top: `${loupePos.y}px`,
              transform: loupePos.isFlippedBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
            className="fixed pointer-events-none z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-100"
          >
            <div
              className={`w-[110px] h-[110px] rounded-full border-2 bg-slate-950 shadow-2xl overflow-hidden relative ${
                alignmentResult.isGood ? 'border-emerald-400 ring-4 ring-emerald-500/30' : 'border-blue-500 ring-4 ring-black/60'
              }`}
            >
              <canvas
                ref={loupeCanvasRef}
                width={110}
                height={110}
                className="w-full h-full block"
              />
            </div>
            <div
              className={`mt-1.5 px-2.5 py-0.5 rounded-full text-white text-[10px] font-bold shadow-md tracking-tight whitespace-nowrap transition-colors ${
                alignmentResult.isGood ? 'bg-emerald-600' : 'bg-blue-600'
              }`}
            >
              {alignmentResult.isGood ? 'Concentric Match ✓' : 'Center on OMR square'}
            </div>
          </div>
        )}
      </main>

      {/* Auto-Crop Notification Floating Badge */}
      <AnimatePresence>
        {autoCropNotification && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#041e49] dark:bg-[#c2e7ff] text-white dark:text-[#041e49] px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 pointer-events-none select-none"
          >
            <Sparkles className="w-4 h-4 text-[#a8c7fa] dark:text-[#0b57d0]" />
            <span>{autoCropNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          FULL-SCREEN FOOTER CONTROLS (Responsive & Safe Bottom Area)
          ======================================================== */}
      <footer className="px-3 sm:px-6 py-2.5 sm:py-3 border-0 bg-transparent flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 z-30 pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))]">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center sm:justify-start">
          {/* Auto-Fit Squares Button - Completely borderless, NO ring, Elevate design tokens */}
          <button
            type="button"
            id="auto-fit-squares-btn"
            onClick={handleAutoFitSquares}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold border-0 border-none ring-0 outline-none shadow-xs transition-all cursor-pointer active:scale-95 select-none"
            title="Auto-detect & snap corners to 4 printed registration squares"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Auto-Fit Squares</span>
          </button>

          {/* Rotate 90° Button */}
          <button
            type="button"
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border border-black/5 dark:border-white/10 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Rotate sheet 90° clockwise"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Rotate 90°</span>
          </button>

          {/* Reset Corners */}
          <button
            type="button"
            onClick={handleResetCorners}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border border-black/5 dark:border-white/10 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Reset corner boxes to default"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span className="hidden xs:inline">Reset</span>
          </button>

          {/* Full Image (100%) */}
          <button
            type="button"
            onClick={handleSnapFullImage}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border border-black/5 dark:border-white/10 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Expand crop frame to 100% full image"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Full Image (100%)</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              cleanupActiveDrag();
              onClose();
            }}
            className="flex-1 sm:flex-none px-4 py-2 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border border-black/5 dark:border-white/10 shadow-xs transition-all cursor-pointer text-center active:scale-95"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isProcessingCrop}
            onClick={handleApplyClick}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-white text-xs font-bold border-0 ring-0 shadow-none transition-all cursor-pointer ${
              alignmentResult.isGood
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/30'
                : 'bg-[#0b57d0] hover:bg-blue-600'
            } ${
              isProcessingCrop ? 'opacity-80 cursor-wait' : 'active:scale-95'
            }`}
          >
            {isProcessingCrop ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Cropping...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Apply & Scan</span>
              </>
            )}
          </button>
        </div>
      </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
