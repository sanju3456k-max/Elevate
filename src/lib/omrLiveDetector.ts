/**
 * High-Precision Real-time OMR Frame Detector & Tracker
 * 
 * Uses targeted 4-corner ROI patch extraction with dual-mode fiducial detection:
 * 1. Dark hollow square component with bright center
 * 2. Enclosed white hollow core surrounded by black registration rim
 * 
 * Accurately aligns custom question paper OMR layouts, handles shadows and paper boundaries,
 * and auto-captures reliably without frame lag or false-positive snaps.
 */

import { OMR_GEOMETRY, OmrLayoutConfig, getOmrLayoutConfig } from './omrGeometry';
import type { QuadPoint } from './omrPerspectiveWarp';

export type LiveScannerStatus = 'searching' | 'tracking' | 'stabilizing' | 'locked';

export interface LiveQuadCorners {
  tl: QuadPoint;
  tr: QuadPoint;
  br: QuadPoint;
  bl: QuadPoint;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ContainerDim {
  width: number;
  height: number;
}

export interface DetectedBoxesState {
  tl: boolean;
  tr: boolean;
  br: boolean;
  bl: boolean;
  count: number;
}

export interface LiveOmrDetectionFrame {
  status: LiveScannerStatus;
  detected: boolean;
  confidence: number;
  fiducials: LiveQuadCorners;          // Screen percentage space (0-100%) for reticles
  outerCorners: LiveQuadCorners;       // Screen percentage space (0-100%) for polygon overlay
  videoFiducials: LiveQuadCorners;     // Video pixel coordinates for warp
  videoOuterCorners: LiveQuadCorners;  // Video pixel coordinates for warp
  frameCorners: LiveQuadCorners;       // Alignment frame screen percentage
  stabilityProgress: number;          // 0 to 1
  guidanceMessage: string;
  tiltAngleDeg: number;
  ratioMatchPercentage: number;
  shouldAutoSnap: boolean;
  detectedBoxes: DetectedBoxesState;
}

interface PatchCandidate {
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  score: number;
}

export class OmrLiveDetector {
  private layout: OmrLayoutConfig;
  private expectedRatio: number;
  private marginRatioX: number;
  private marginRatioTop: number;
  private marginRatioBottom: number;

  // Offscreen canvas for extracting high-res corner patches
  private patchCanvas: HTMLCanvasElement;
  private patchCtx: CanvasRenderingContext2D | null;
  // Base default patch radius (scaled dynamically per frame based on video-to-screen ratio)
  private readonly basePatchRadius = 80; 

  // Temporal coordinate smoothing & stability gate
  private smoothedVideoFiducials: LiveQuadCorners | null = null;
  private stableStreak = 0;
  // 2 consecutive stable frames (~60ms of steady alignment) allows fast, responsive auto-snap
  private readonly requiredStableFrames = 2; 
  // 30.0 screen px threshold accommodates natural human hand tremor across all resolutions (720p, 1080p, 4K)
  private readonly maxScreenJitterPx = 30.0; 
  private lastProcessTimestamp = 0;
  // 36ms interval (~27 FPS) keeps auto-detection ultra fast and responsive
  private readonly minProcessIntervalMs = 36; 

  constructor(layoutConfigOrQuestionCount: OmrLayoutConfig | number = 50) {
    if (typeof layoutConfigOrQuestionCount === 'number') {
      this.layout = getOmrLayoutConfig(layoutConfigOrQuestionCount, undefined, 'a4');
    } else {
      this.layout = layoutConfigOrQuestionCount;
    }

    this.expectedRatio = this.layout.fiducialSpanX_mm / this.layout.fiducialSpanY_mm;
    this.marginRatioX = 10 / this.layout.pageWidthMm;
    this.marginRatioTop = 10 / this.layout.pageHeightMm;
    this.marginRatioBottom = (this.layout.pageHeightMm - this.layout.bottomFiducialY_mm) / this.layout.pageHeightMm;

    this.patchCanvas = document.createElement('canvas');
    this.patchCanvas.width = 360;
    this.patchCanvas.height = 360;
    this.patchCtx = this.patchCanvas.getContext('2d', { willReadFrequently: true });
  }

  public setLayout(layoutConfigOrQuestionCount: OmrLayoutConfig | number): void {
    if (typeof layoutConfigOrQuestionCount === 'number') {
      this.layout = getOmrLayoutConfig(layoutConfigOrQuestionCount, undefined, 'a4');
    } else {
      this.layout = layoutConfigOrQuestionCount;
    }

    this.expectedRatio = this.layout.fiducialSpanX_mm / this.layout.fiducialSpanY_mm;
    this.marginRatioX = 10 / this.layout.pageWidthMm;
    this.marginRatioTop = 10 / this.layout.pageHeightMm;
    this.marginRatioBottom = (this.layout.pageHeightMm - this.layout.bottomFiducialY_mm) / this.layout.pageHeightMm;
    this.resetTracking();
  }

  public resetTracking(): void {
    this.smoothedVideoFiducials = null;
    this.stableStreak = 0;
    this.lastProcessTimestamp = 0;
  }

  /**
   * Main per-frame detection step
   */
  public processFrame(
    video: HTMLVideoElement,
    screenFrame: ScreenRect,
    containerDim: ContainerDim
  ): LiveOmrDetectionFrame | null {
    const now = performance.now();
    if (now - this.lastProcessTimestamp < this.minProcessIntervalMs) {
      return null;
    }
    this.lastProcessTimestamp = now;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = containerDim.width;
    const ch = containerDim.height;

    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0 || !this.patchCtx) {
      return null;
    }

    // 1. Compute CSS object-fit: cover mapping between screen and video
    const scale = Math.max(cw / vw, ch / vh);
    const offsetX = (vw * scale - cw) / 2;
    const offsetY = (vh * scale - ch) / 2;

    const screenToVideo = (sx: number, sy: number): QuadPoint => ({
      x: (sx + offsetX) / scale,
      y: (sy + offsetY) / scale,
    });

    const videoToScreen = (vx: number, vy: number): QuadPoint => ({
      x: vx * scale - offsetX,
      y: vy * scale - offsetY,
    });

    // 2. Alignment frame corners in screen % space (0-100)
    const frameCornersScreenPct: LiveQuadCorners = {
      tl: { x: (screenFrame.left / cw) * 100, y: (screenFrame.top / ch) * 100 },
      tr: { x: ((screenFrame.left + screenFrame.width) / cw) * 100, y: (screenFrame.top / ch) * 100 },
      br: { x: ((screenFrame.left + screenFrame.width) / cw) * 100, y: ((screenFrame.top + screenFrame.height) / ch) * 100 },
      bl: { x: (screenFrame.left / cw) * 100, y: ((screenFrame.top + screenFrame.height) / ch) * 100 },
    };

    // Expected fiducials in screen pixel coordinates
    const expScreenFiducials = {
      tl: {
        x: screenFrame.left + this.marginRatioX * screenFrame.width,
        y: screenFrame.top + this.marginRatioTop * screenFrame.height,
      },
      tr: {
        x: screenFrame.left + (1 - this.marginRatioX) * screenFrame.width,
        y: screenFrame.top + this.marginRatioTop * screenFrame.height,
      },
      br: {
        x: screenFrame.left + (1 - this.marginRatioX) * screenFrame.width,
        y: screenFrame.top + (1 - this.marginRatioBottom) * screenFrame.height,
      },
      bl: {
        x: screenFrame.left + this.marginRatioX * screenFrame.width,
        y: screenFrame.top + (1 - this.marginRatioBottom) * screenFrame.height,
      },
    };

    // Expected fiducials in video pixel coordinates
    const expVideoFiducials = {
      tl: screenToVideo(expScreenFiducials.tl.x, expScreenFiducials.tl.y),
      tr: screenToVideo(expScreenFiducials.tr.x, expScreenFiducials.tr.y),
      br: screenToVideo(expScreenFiducials.br.x, expScreenFiducials.br.y),
      bl: screenToVideo(expScreenFiducials.bl.x, expScreenFiducials.bl.y),
    };

    // Expected physical fiducial span in video pixels
    const expTopDx = expVideoFiducials.tr.x - expVideoFiducials.tl.x;
    const expTopDy = expVideoFiducials.tr.y - expVideoFiducials.tl.y;
    const expLeftDx = expVideoFiducials.bl.x - expVideoFiducials.tl.x;
    const expLeftDy = expVideoFiducials.bl.y - expVideoFiducials.tl.y;
    const expW = Math.hypot(expTopDx, expTopDy);
    const expH = Math.hypot(expLeftDx, expLeftDy);

    // Fallback frame corners in video coordinates
    const frameCornersVideo: LiveQuadCorners = {
      tl: screenToVideo(screenFrame.left, screenFrame.top),
      tr: screenToVideo(screenFrame.left + screenFrame.width, screenFrame.top),
      br: screenToVideo(screenFrame.left + screenFrame.width, screenFrame.top + screenFrame.height),
      bl: screenToVideo(screenFrame.left, screenFrame.top + screenFrame.height),
    };

    // Dynamic patch radius based on screen-to-video scale:
    // Guide container boxes on screen are 56px-64px.
    // In video coordinates, this corresponds to (guideBoxSize / scale) pixels.
    // We scale by 1.35x to provide a generous search region so markers anywhere
    // inside the UI box are reliably extracted and detected.
    const guideBoxScreenPx = 64;
    const dynamicPatchRadius = Math.max(75, Math.min(145, Math.round(((guideBoxScreenPx / 2) / scale) * 1.35)));

    // Physical fiducial size is 5.5mm
    const expectedBoxVideoPx = Math.max(16, Math.round(
      (OMR_GEOMETRY.fiducialSizeMm / this.layout.fiducialSpanX_mm) * expW
    ));

    // 3. Extract high-res patches from video and locate fiducial markers inside the 4 containers
    const candTL = this.detectCornerInPatch(video, expVideoFiducials.tl, vw, vh, dynamicPatchRadius, expectedBoxVideoPx);
    const candTR = this.detectCornerInPatch(video, expVideoFiducials.tr, vw, vh, dynamicPatchRadius, expectedBoxVideoPx);
    const candBR = this.detectCornerInPatch(video, expVideoFiducials.br, vw, vh, dynamicPatchRadius, expectedBoxVideoPx);
    const candBL = this.detectCornerInPatch(video, expVideoFiducials.bl, vw, vh, dynamicPatchRadius, expectedBoxVideoPx);

    const boxCount = (candTL ? 1 : 0) + (candTR ? 1 : 0) + (candBR ? 1 : 0) + (candBL ? 1 : 0);
    const detectedBoxes: DetectedBoxesState = {
      tl: Boolean(candTL),
      tr: Boolean(candTR),
      br: Boolean(candBR),
      bl: Boolean(candBL),
      count: boxCount,
    };

    const allDetected = boxCount === 4 && Boolean(candTL && candTR && candBR && candBL);

    if (!allDetected || !candTL || !candTR || !candBR || !candBL) {
      this.decayStreak();

      const fallbackScreenFiducials: LiveQuadCorners = {
        tl: { x: (expScreenFiducials.tl.x / cw) * 100, y: (expScreenFiducials.tl.y / ch) * 100 },
        tr: { x: (expScreenFiducials.tr.x / cw) * 100, y: (expScreenFiducials.tr.y / ch) * 100 },
        br: { x: (expScreenFiducials.br.x / cw) * 100, y: (expScreenFiducials.br.y / ch) * 100 },
        bl: { x: (expScreenFiducials.bl.x / cw) * 100, y: (expScreenFiducials.bl.y / ch) * 100 },
      };

      const guidanceMsg = boxCount === 0 
        ? 'Align 4 corner boxes with markers' 
        : `${boxCount} of 4 corners aligned...`;

      return {
        status: 'searching',
        detected: false,
        confidence: boxCount * 25,
        fiducials: fallbackScreenFiducials,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: (boxCount / 4) * 0.4,
        guidanceMessage: guidanceMsg,
        tiltAngleDeg: 0,
        ratioMatchPercentage: 0,
        shouldAutoSnap: false,
        detectedBoxes,
      };
    }

    // 4. Validate quadrilateral geometry & physical span
    const rawVideoFiducials: LiveQuadCorners = {
      tl: candTL,
      tr: candTR,
      br: candBR,
      bl: candBL,
    };

    const topDx = rawVideoFiducials.tr.x - rawVideoFiducials.tl.x;
    const topDy = rawVideoFiducials.tr.y - rawVideoFiducials.tl.y;
    const botDx = rawVideoFiducials.br.x - rawVideoFiducials.bl.x;
    const botDy = rawVideoFiducials.br.y - rawVideoFiducials.bl.y;
    const leftDx = rawVideoFiducials.bl.x - rawVideoFiducials.tl.x;
    const leftDy = rawVideoFiducials.bl.y - rawVideoFiducials.tl.y;
    const rightDx = rawVideoFiducials.br.x - rawVideoFiducials.tr.x;
    const rightDy = rawVideoFiducials.br.y - rawVideoFiducials.tr.y;

    const topLen = Math.hypot(topDx, topDy);
    const botLen = Math.hypot(botDx, botDy);
    const leftLen = Math.hypot(leftDx, leftDy);
    const rightLen = Math.hypot(rightDx, rightDy);

    const avgW = (topLen + botLen) / 2;
    const avgH = (leftLen + rightLen) / 2;

    // 4.1. Paper luminance validation at all 4 corner positions (rejects dark surfaces/tables)
    const lumaTL = this.sampleVideoAreaLuma(video, candTL.x, candTL.y, 20, vw, vh);
    const lumaTR = this.sampleVideoAreaLuma(video, candTR.x, candTR.y, 20, vw, vh);
    const lumaBR = this.sampleVideoAreaLuma(video, candBR.x, candBR.y, 20, vw, vh);
    const lumaBL = this.sampleVideoAreaLuma(video, candBL.x, candBL.y, 20, vw, vh);

    if (lumaTL < 60 || lumaTR < 60 || lumaBR < 60 || lumaBL < 60) {
      this.decayStreak();
      const fallbackScreenFiducials: LiveQuadCorners = {
        tl: { x: (expScreenFiducials.tl.x / cw) * 100, y: (expScreenFiducials.tl.y / ch) * 100 },
        tr: { x: (expScreenFiducials.tr.x / cw) * 100, y: (expScreenFiducials.tr.y / ch) * 100 },
        br: { x: (expScreenFiducials.br.x / cw) * 100, y: (expScreenFiducials.br.y / ch) * 100 },
        bl: { x: (expScreenFiducials.bl.x / cw) * 100, y: (expScreenFiducials.bl.y / ch) * 100 },
      };

      return {
        status: 'searching',
        detected: false,
        confidence: 25,
        fiducials: fallbackScreenFiducials,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: 0.1,
        guidanceMessage: 'Ensure all 4 corners are on white paper',
        tiltAngleDeg: 0,
        ratioMatchPercentage: 0,
        shouldAutoSnap: false,
        detectedBoxes: { tl: lumaTL >= 60, tr: lumaTR >= 60, br: lumaBR >= 60, bl: lumaBL >= 60, count: boxCount },
      };
    }

    // 4.2. Sheet Interior Whitish Page Validation across 5 points
    const sheetMidX = (candTL.x + candTR.x + candBR.x + candBL.x) / 4;
    const sheetMidY = (candTL.y + candTR.y + candBR.y + candBL.y) / 4;
    const lumaCenter = this.sampleVideoAreaLuma(video, sheetMidX, sheetMidY, 20, vw, vh);
    const lumaTop = this.sampleVideoAreaLuma(video, sheetMidX, sheetMidY - (avgH * 0.25), 20, vw, vh);
    const lumaBottom = this.sampleVideoAreaLuma(video, sheetMidX, sheetMidY + (avgH * 0.25), 20, vw, vh);
    const lumaLeft = this.sampleVideoAreaLuma(video, sheetMidX - (avgW * 0.25), sheetMidY, 20, vw, vh);
    const lumaRight = this.sampleVideoAreaLuma(video, sheetMidX + (avgW * 0.25), sheetMidY, 20, vw, vh);

    if (lumaCenter < 60 || lumaTop < 60 || lumaBottom < 60 || lumaLeft < 60 || lumaRight < 60) {
      this.decayStreak();
      const fallbackScreenFiducials: LiveQuadCorners = {
        tl: { x: (expScreenFiducials.tl.x / cw) * 100, y: (expScreenFiducials.tl.y / ch) * 100 },
        tr: { x: (expScreenFiducials.tr.x / cw) * 100, y: (expScreenFiducials.tr.y / ch) * 100 },
        br: { x: (expScreenFiducials.br.x / cw) * 100, y: (expScreenFiducials.br.y / ch) * 100 },
        bl: { x: (expScreenFiducials.bl.x / cw) * 100, y: (expScreenFiducials.bl.y / ch) * 100 },
      };

      return {
        status: 'searching',
        detected: false,
        confidence: 30,
        fiducials: fallbackScreenFiducials,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: 0.1,
        guidanceMessage: 'Place entire OMR sheet inside camera',
        tiltAngleDeg: 0,
        ratioMatchPercentage: 0,
        shouldAutoSnap: false,
        detectedBoxes: { tl: true, tr: true, br: true, bl: true, count: 4 },
      };
    }

    // Physical span check: must span alignment frame within +-45% (accommodates normal hand viewing distance)
    const spanDiffW = Math.abs(avgW - expW) / Math.max(1, expW);
    const spanDiffH = Math.abs(avgH - expH) / Math.max(1, expH);
    if (spanDiffW > 0.45 || spanDiffH > 0.45) {
      this.decayStreak();
      return {
        status: 'searching',
        detected: false,
        confidence: 45,
        fiducials: frameCornersScreenPct,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: 0.3,
        guidanceMessage: 'Fit corner squares inside the 4 boxes',
        tiltAngleDeg: 0,
        ratioMatchPercentage: 0,
        shouldAutoSnap: false,
        detectedBoxes,
      };
    }

    const measuredRatio = avgW / Math.max(1, avgH);
    const ratioDiff = Math.abs(measuredRatio - this.expectedRatio);
    const maxRatioTolerance = this.expectedRatio * 0.40;

    if (ratioDiff > maxRatioTolerance) {
      this.decayStreak();
      return {
        status: 'searching',
        detected: false,
        confidence: 50,
        fiducials: frameCornersScreenPct,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: 0.4,
        guidanceMessage: 'Keep sheet flat and parallel to camera',
        tiltAngleDeg: Math.round((Math.atan2(topDy, topDx) * 180) / Math.PI),
        ratioMatchPercentage: Math.round(Math.max(0, 1 - ratioDiff / maxRatioTolerance) * 100),
        shouldAutoSnap: false,
        detectedBoxes,
      };
    }

    // Straightness check (reject severely skewed or inverted quads)
    const dotTopBot = (topDx * botDx + topDy * botDy) / Math.max(1, topLen * botLen);
    const dotLeftRight = (leftDx * rightDx + leftDy * rightDy) / Math.max(1, leftLen * rightLen);
    if (dotTopBot < 0.65 || dotLeftRight < 0.65) {
      this.decayStreak();
      return {
        status: 'searching',
        detected: false,
        confidence: 40,
        fiducials: frameCornersScreenPct,
        outerCorners: frameCornersScreenPct,
        videoFiducials: expVideoFiducials,
        videoOuterCorners: frameCornersVideo,
        frameCorners: frameCornersScreenPct,
        stabilityProgress: 0.35,
        guidanceMessage: 'Straighten camera alignment',
        tiltAngleDeg: 0,
        ratioMatchPercentage: 50,
        shouldAutoSnap: false,
        detectedBoxes,
      };
    }

    const ratioMatch = Math.max(0, 1.0 - ratioDiff / maxRatioTolerance);
    const tiltDeg = (Math.atan2(topDy, topDx) * 180) / Math.PI;

    // 5. Stability & timing verification (scale-independent screen-space check):
    if (this.smoothedVideoFiducials) {
      const maxJitterVideoSq = Math.max(
        distSq(this.smoothedVideoFiducials.tl, rawVideoFiducials.tl),
        distSq(this.smoothedVideoFiducials.tr, rawVideoFiducials.tr),
        distSq(this.smoothedVideoFiducials.br, rawVideoFiducials.br),
        distSq(this.smoothedVideoFiducials.bl, rawVideoFiducials.bl)
      );
      const maxJitterScreenPx = Math.sqrt(maxJitterVideoSq) * scale;

      if (maxJitterScreenPx < this.maxScreenJitterPx) {
        this.stableStreak++;
      } else {
        // Soft-decay rather than resetting completely for hand tremor
        this.stableStreak = Math.max(0, this.stableStreak - 1);
      }
    } else {
      this.stableStreak = 1;
    }

    // Smooth coordinates for steady final capture
    const smoothAlpha = 0.50;
    this.smoothedVideoFiducials = {
      tl: smoothPt(this.smoothedVideoFiducials ? this.smoothedVideoFiducials.tl : rawVideoFiducials.tl, rawVideoFiducials.tl, smoothAlpha),
      tr: smoothPt(this.smoothedVideoFiducials ? this.smoothedVideoFiducials.tr : rawVideoFiducials.tr, rawVideoFiducials.tr, smoothAlpha),
      br: smoothPt(this.smoothedVideoFiducials ? this.smoothedVideoFiducials.br : rawVideoFiducials.br, rawVideoFiducials.br, smoothAlpha),
      bl: smoothPt(this.smoothedVideoFiducials ? this.smoothedVideoFiducials.bl : rawVideoFiducials.bl, rawVideoFiducials.bl, smoothAlpha),
    };

    const isLocked = this.stableStreak >= this.requiredStableFrames;
    const stabilityProgress = Math.min(1.0, this.stableStreak / this.requiredStableFrames);

    // 6. Extrapolate outer page boundaries in video coordinates
    const mX = 10 / this.layout.fiducialSpanX_mm;
    const mTop = 10 / this.layout.fiducialSpanY_mm;
    const mBot = (this.layout.pageHeightMm - this.layout.bottomFiducialY_mm) / this.layout.fiducialSpanY_mm;

    const targetFid = this.smoothedVideoFiducials;
    const curTopDx = targetFid.tr.x - targetFid.tl.x;
    const curTopDy = targetFid.tr.y - targetFid.tl.y;
    const curBotDx = targetFid.br.x - targetFid.bl.x;
    const curBotDy = targetFid.br.y - targetFid.bl.y;
    const curLeftDx = targetFid.bl.x - targetFid.tl.x;
    const curLeftDy = targetFid.bl.y - targetFid.tl.y;
    const curRightDx = targetFid.br.x - targetFid.tr.x;
    const curRightDy = targetFid.br.y - targetFid.tr.y;

    const rawVideoOuter: LiveQuadCorners = {
      tl: {
        x: targetFid.tl.x - mX * curTopDx - mTop * curLeftDx,
        y: targetFid.tl.y - mX * curTopDy - mTop * curLeftDy,
      },
      tr: {
        x: targetFid.tr.x + mX * curTopDx - mTop * curRightDx,
        y: targetFid.tr.y + mX * curTopDy - mTop * curRightDy,
      },
      br: {
        x: targetFid.br.x + mX * curBotDx + mBot * curRightDx,
        y: targetFid.br.y + mX * curBotDy + mBot * curRightDy,
      },
      bl: {
        x: targetFid.bl.x - mX * curBotDx + mBot * curLeftDx,
        y: targetFid.bl.y - mX * curBotDy + mBot * curLeftDy,
      },
    };

    // 7. Convert video coordinates to screen % coordinates
    const screenFiducials: LiveQuadCorners = {
      tl: toScreenPct(videoToScreen(targetFid.tl.x, targetFid.tl.y), cw, ch),
      tr: toScreenPct(videoToScreen(targetFid.tr.x, targetFid.tr.y), cw, ch),
      br: toScreenPct(videoToScreen(targetFid.br.x, targetFid.br.y), cw, ch),
      bl: toScreenPct(videoToScreen(targetFid.bl.x, targetFid.bl.y), cw, ch),
    };

    const screenOuter: LiveQuadCorners = {
      tl: toScreenPct(videoToScreen(rawVideoOuter.tl.x, rawVideoOuter.tl.y), cw, ch),
      tr: toScreenPct(videoToScreen(rawVideoOuter.tr.x, rawVideoOuter.tr.y), cw, ch),
      br: toScreenPct(videoToScreen(rawVideoOuter.br.x, rawVideoOuter.br.y), cw, ch),
      bl: toScreenPct(videoToScreen(rawVideoOuter.bl.x, rawVideoOuter.bl.y), cw, ch),
    };

    const status: LiveScannerStatus = isLocked ? 'locked' : (this.stableStreak >= 3 ? 'stabilizing' : 'tracking');
    const guidanceMessage = isLocked 
      ? 'All 4 corners aligned! Capturing...' 
      : (this.stableStreak >= 3 ? `Hold steady... (${Math.round(stabilityProgress * 100)}%)` : 'Keep sheet aligned in boxes');

    return {
      status,
      detected: true,
      confidence: Math.round(ratioMatch * 100),
      fiducials: screenFiducials,
      outerCorners: screenOuter,
      videoFiducials: targetFid,
      videoOuterCorners: rawVideoOuter,
      frameCorners: frameCornersScreenPct,
      stabilityProgress,
      guidanceMessage,
      tiltAngleDeg: Math.round(tiltDeg),
      ratioMatchPercentage: Math.round(ratioMatch * 100),
      shouldAutoSnap: isLocked,
      detectedBoxes: { tl: true, tr: true, br: true, bl: true, count: 4 },
    };
  }

  /**
   * Extract patch at target coordinate and detect hollow square
   */
  public detectCornerInPatch(
    source: CanvasImageSource,
    expectedCenter: QuadPoint,
    vw: number,
    vh: number,
    patchRadius: number,
    expectedBoxPx: number
  ): QuadPoint | null {
    if (!this.patchCtx || !expectedCenter || isNaN(expectedCenter.x) || isNaN(expectedCenter.y)) return null;

    const pr = Math.min(150, patchRadius);
    const patchDim = pr * 2;

    if (this.patchCanvas.width < patchDim || this.patchCanvas.height < patchDim) {
      this.patchCanvas.width = Math.max(360, patchDim);
      this.patchCanvas.height = Math.max(360, patchDim);
      this.patchCtx = this.patchCanvas.getContext('2d', { willReadFrequently: true });
      if (!this.patchCtx) return null;
    }

    const srcX = Math.max(0, Math.min(Math.max(0, vw - patchDim), Math.round(expectedCenter.x - pr)));
    const srcY = Math.max(0, Math.min(Math.max(0, vh - patchDim), Math.round(expectedCenter.y - pr)));

    this.patchCtx.drawImage(source, srcX, srcY, patchDim, patchDim, 0, 0, patchDim, patchDim);
    const imgData = this.patchCtx.getImageData(0, 0, patchDim, patchDim);
    const pixels = imgData.data;

    // Convert patch to grayscale
    const gray = new Uint8Array(patchDim * patchDim);
    for (let i = 0; i < patchDim * patchDim; i++) {
      const idx = i * 4;
      gray[i] = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
    }

    const cand = findHollowSquareInPatch(gray, patchDim, patchDim, expectedBoxPx);
    if (!cand) return null;

    return {
      x: srcX + cand.cx,
      y: srcY + cand.cy,
    };
  }

  /**
   * Sample small region average luminance to verify sheet paper brightness
   */
  private sampleVideoAreaLuma(
    source: CanvasImageSource,
    centerX: number,
    centerY: number,
    sampleSize: number,
    vw: number,
    vh: number
  ): number {
    if (!this.patchCtx) return 128;
    const half = Math.round(sampleSize / 2);
    const sx = Math.max(0, Math.min(vw - sampleSize, Math.round(centerX - half)));
    const sy = Math.max(0, Math.min(vh - sampleSize, Math.round(centerY - half)));

    this.patchCtx.drawImage(source, sx, sy, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);
    const imgData = this.patchCtx.getImageData(0, 0, sampleSize, sampleSize);
    const d = imgData.data;
    let sum = 0;
    const count = sampleSize * sampleSize;
    for (let i = 0; i < count; i++) {
      const idx = i * 4;
      sum += (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
    }
    return sum / count;
  }

  /**
   * Directly locates or refines the 4 corner fiducials on a full-resolution canvas or video frame.
   * If any corner is obscured, uses parallelogram geometry to accurately predict its location.
   */
  public locateCornerFiducials(
    source: CanvasImageSource,
    vw: number,
    vh: number,
    expFiducials: LiveQuadCorners,
    patchRadius: number,
    expectedBoxPx: number
  ): {
    fiducials: LiveQuadCorners;
    detectedCount: number;
    detectedBoxes: DetectedBoxesState;
  } {
    const cTL = this.detectCornerInPatch(source, expFiducials.tl, vw, vh, patchRadius, expectedBoxPx);
    const cTR = this.detectCornerInPatch(source, expFiducials.tr, vw, vh, patchRadius, expectedBoxPx);
    const cBR = this.detectCornerInPatch(source, expFiducials.br, vw, vh, patchRadius, expectedBoxPx);
    const cBL = this.detectCornerInPatch(source, expFiducials.bl, vw, vh, patchRadius, expectedBoxPx);

    const count = (cTL ? 1 : 0) + (cTR ? 1 : 0) + (cBR ? 1 : 0) + (cBL ? 1 : 0);
    const detectedBoxes: DetectedBoxesState = {
      tl: Boolean(cTL),
      tr: Boolean(cTR),
      br: Boolean(cBR),
      bl: Boolean(cBL),
      count,
    };

    let fTL = cTL;
    let fTR = cTR;
    let fBR = cBR;
    let fBL = cBL;

    // Parallelogram completion when 3 of 4 corners are found
    if (count === 3) {
      if (!fTL && fTR && fBL && fBR) {
        fTL = { x: fTR.x + fBL.x - fBR.x, y: fTR.y + fBL.y - fBR.y };
      } else if (!fTR && fTL && fBL && fBR) {
        fTR = { x: fTL.x + fBR.x - fBL.x, y: fTL.y + fBR.y - fBL.y };
      } else if (!fBR && fTL && fTR && fBL) {
        fBR = { x: fTR.x + fBL.x - fTL.x, y: fTR.y + fBL.y - fTL.y };
      } else if (!fBL && fTL && fTR && fBR) {
        fBL = { x: fTL.x + fBR.x - fTR.x, y: fTL.y + fBR.y - fTR.y };
      }
    }

    // Fallback any remaining missing corners to expected position
    const finalFiducials: LiveQuadCorners = {
      tl: fTL || expFiducials.tl,
      tr: fTR || expFiducials.tr,
      br: fBR || expFiducials.br,
      bl: fBL || expFiducials.bl,
    };

    return {
      fiducials: finalFiducials,
      detectedCount: count,
      detectedBoxes,
    };
  }

  private decayStreak(): void {
    this.stableStreak = Math.max(0, this.stableStreak - 2);
    if (this.stableStreak === 0) {
      this.smoothedVideoFiducials = null;
    }
  }
}

/**
 * Robust Fiducial Square Detector:
 * Validates square geometry, physical size matching printed blueprint,
 * four-sided closed dark ring, and surrounding paper contrast.
 * Rejects irregular surfaces, text blocks, wood grain, tile borders, and dark desks.
 */
function findHollowSquareInPatch(
  gray: Uint8Array, 
  w: number, 
  h: number, 
  expectedBoxPx: number
): PatchCandidate | null {
  const pixelCount = w * h;
  if (pixelCount === 0) return null;

  // 1. Absolute Patch Luminance Check: Paper under indoor lighting / shadow is >= 60.
  let patchSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    patchSum += gray[i];
  }
  const patchAvg = patchSum / pixelCount;
  if (patchAvg < 60) {
    return null;
  }

  // 2. Compute integral image for O(1) rectangle luminance checks
  const integral = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const yRow = y * w;
    const iRow = y * (w + 1);
    const iNext = (y + 1) * (w + 1);
    for (let x = 0; x < w; x++) {
      rowSum += gray[yRow + x];
      integral[iNext + x + 1] = integral[iRow + x + 1] + rowSum;
    }
  }

  function getLocalMean(x: number, y: number, r: number): number {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(w - 1, x + r);
    const y1 = Math.min(h - 1, y + r);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    const sum =
      integral[(y1 + 1) * (w + 1) + x1 + 1] -
      integral[y0 * (w + 1) + x1 + 1] -
      integral[(y1 + 1) * (w + 1) + x0] +
      integral[y0 * (w + 1) + x0];
    return sum / count;
  }

  function getRectMean(rx0: number, ry0: number, rx1: number, ry1: number): number {
    const x0 = Math.max(0, Math.min(w - 1, Math.round(rx0)));
    const y0 = Math.max(0, Math.min(h - 1, Math.round(ry0)));
    const x1 = Math.max(0, Math.min(w - 1, Math.round(rx1)));
    const y1 = Math.max(0, Math.min(h - 1, Math.round(ry1)));
    if (x1 < x0 || y1 < y0) return 0;
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    const sum =
      integral[(y1 + 1) * (w + 1) + x1 + 1] -
      integral[y0 * (w + 1) + x1 + 1] -
      integral[(y1 + 1) * (w + 1) + x0] +
      integral[y0 * (w + 1) + x0];
    return sum / count;
  }

  // 3. Binary adaptive thresholding for dark registration borders
  const binaryDark = new Uint8Array(pixelCount);
  for (let y = 0; y < h; y++) {
    const yRow = y * w;
    for (let x = 0; x < w; x++) {
      const mean = getLocalMean(x, y, 7);
      const val = gray[yRow + x];
      // Border pixels must be dark and significantly lower than local background
      if (val < mean - 10 && val < patchAvg * 0.90) {
        binaryDark[yRow + x] = 1;
      }
    }
  }

  const patchMidX = w / 2;
  const patchMidY = h / 2;
  const candidates: PatchCandidate[] = [];

  const minBox = Math.max(8, Math.round(expectedBoxPx * 0.45));
  const maxBox = Math.min(90, Math.round(expectedBoxPx * 1.65));

  // Connected component labeling on binaryDark
  const visited = new Uint8Array(pixelCount);
  for (let y = 3; y < h - 3; y++) {
    const yRow = y * w;
    for (let x = 3; x < w - 3; x++) {
      if (binaryDark[yRow + x] === 1 && visited[yRow + x] === 0) {
        const queue = [x, y];
        visited[yRow + x] = 1;
        let head = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        while (head < queue.length) {
          if (queue.length > 2500) break; // early exit for giant dark blobs/tables
          const qx = queue[head++];
          const qy = queue[head++];
          if (qx < minX) minX = qx;
          if (qx > maxX) maxX = qx;
          if (qy < minY) minY = qy;
          if (qy > maxY) maxY = qy;
          if (maxX - minX > maxBox * 2 || maxY - minY > maxBox * 2) break; // early exit if blob exceeds fiducial bounds

          const nbrs = [
            [qx + 1, qy],
            [qx - 1, qy],
            [qx, qy + 1],
            [qx, qy - 1],
          ];
          for (let i = 0; i < 4; i++) {
            const nx = nbrs[i][0];
            const ny = nbrs[i][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (binaryDark[nidx] === 1 && visited[nidx] === 0) {
                visited[nidx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw / bh;

        // Must be a square matching physical fiducial scale
        if (bw >= minBox && bw <= maxBox && bh >= minBox && bh <= maxBox && aspect >= 0.70 && aspect <= 1.40) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const distToPatchCenter = Math.hypot(cx - patchMidX, cy - patchMidY);

          // Must be positioned inside the UI guide container
          if (distToPatchCenter <= w * 0.44) {
            const margin = Math.max(3, Math.round(bw * 0.35));

            // Check surrounding white paper margins on all 4 individual sides
            const outerTop = getRectMean(minX - margin, minY - margin, maxX + margin, minY);
            const outerBot = getRectMean(minX - margin, maxY, maxX + margin, maxY + margin);
            const outerLeft = getRectMean(minX - margin, minY - margin, minX, maxY + margin);
            const outerRight = getRectMean(maxX, minY - margin, maxX + margin, maxY + margin);

            const minMargin = Math.min(outerTop, outerBot, outerLeft, outerRight);
            // Rejects candidates at dark table edge, surface borders, or non-white backgrounds
            if (minMargin >= 65) {
              const boxMean = getRectMean(minX, minY, maxX, maxY);
              const ringMean = (outerTop + outerBot + outerLeft + outerRight) / 4;

              if (ringMean - boxMean >= 14) {
                // Four-sided border check: borders must be darker than surrounding paper
                const topBorder = getRectMean(minX, minY, maxX, minY + 2);
                const botBorder = getRectMean(minX, maxY - 2, maxX, maxY);
                const leftBorder = getRectMean(minX, minY, minX + 2, maxY);
                const rightBorder = getRectMean(maxX - 2, minY, maxX, maxY);
                const maxBorder = Math.max(topBorder, botBorder, leftBorder, rightBorder);

                if (maxBorder <= ringMean - 8) {
                  const centerVal = gray[Math.round(cy) * w + Math.round(cx)];
                  const isHollow = centerVal >= boxMean + 8;
                  const isSolid = boxMean < ringMean - 25;

                  if (isHollow || isSolid) {
                    const distScore = 1.0 / (1.0 + distToPatchCenter * 0.03);
                    const aspectScore = 1.0 - Math.abs(1.0 - aspect) * 1.2;
                    const contrastScore = Math.min(1.0, (ringMean - boxMean) / 60);
                    const score = distScore * 0.40 + aspectScore * 0.35 + contrastScore * 0.25;

                    if (score >= 0.48) {
                      candidates.push({ cx, cy, bw, bh, score });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function smoothPt(prev: QuadPoint, target: QuadPoint, alpha: number): QuadPoint {
  return {
    x: prev.x + (target.x - prev.x) * alpha,
    y: prev.y + (target.y - prev.y) * alpha,
  };
}

function distSq(p1: QuadPoint, p2: QuadPoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function toScreenPct(pt: QuadPoint, cw: number, ch: number): QuadPoint {
  return {
    x: Math.max(0, Math.min(100, (pt.x / cw) * 100)),
    y: Math.max(0, Math.min(100, (pt.y / ch) * 100)),
  };
}
