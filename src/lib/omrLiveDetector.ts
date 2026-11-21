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
  // Radius of 55 (110x110 px) covers the viewfinder container box with comfortable natural margin
  private readonly patchRadius = 55; 

  // Temporal coordinate smoothing & stability gate
  private smoothedVideoFiducials: LiveQuadCorners | null = null;
  private stableStreak = 0;
  // 2 consecutive stable frames (~140ms of steady alignment) allows fast, responsive auto-snap
  private readonly requiredStableFrames = 2; 
  // 30.0 px threshold accommodates natural human hand vibration without falsely resetting
  private readonly maxMovementThresholdSq = 30.0 * 30.0; 
  private lastProcessTimestamp = 0;
  // 70ms interval (~14 FPS) keeps CPU/GPU light, preserving smooth 60 FPS camera feed
  private readonly minProcessIntervalMs = 70; 

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
    this.patchCanvas.width = this.patchRadius * 2;
    this.patchCanvas.height = this.patchRadius * 2;
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

    // 3. Extract high-res patches from video and locate fiducial markers inside the 4 containers
    const candTL = this.detectCornerInPatch(video, expVideoFiducials.tl, vw, vh);
    const candTR = this.detectCornerInPatch(video, expVideoFiducials.tr, vw, vh);
    const candBR = this.detectCornerInPatch(video, expVideoFiducials.br, vw, vh);
    const candBL = this.detectCornerInPatch(video, expVideoFiducials.bl, vw, vh);

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

    // Physical span check: must span alignment frame within +-28%
    // Rejects false triggers on small bubble clusters or text blocks inside the sheet
    const spanDiffW = Math.abs(avgW - expW) / Math.max(1, expW);
    const spanDiffH = Math.abs(avgH - expH) / Math.max(1, expH);
    if (spanDiffW > 0.28 || spanDiffH > 0.28) {
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
    const maxRatioTolerance = this.expectedRatio * 0.25;

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

    // Straightness check (reject severely skewed or non-convex quads)
    const dotTopBot = (topDx * botDx + topDy * botDy) / Math.max(1, topLen * botLen);
    const dotLeftRight = (leftDx * rightDx + leftDy * rightDy) / Math.max(1, leftLen * rightLen);
    if (dotTopBot < 0.82 || dotLeftRight < 0.82) {
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

    // 5. Stability & timing verification:
    if (this.smoothedVideoFiducials) {
      const maxJitterSq = Math.max(
        distSq(this.smoothedVideoFiducials.tl, rawVideoFiducials.tl),
        distSq(this.smoothedVideoFiducials.tr, rawVideoFiducials.tr),
        distSq(this.smoothedVideoFiducials.br, rawVideoFiducials.br),
        distSq(this.smoothedVideoFiducials.bl, rawVideoFiducials.bl)
      );

      if (maxJitterSq < this.maxMovementThresholdSq) {
        this.stableStreak++;
      } else {
        this.stableStreak = 1;
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

    const status: LiveScannerStatus = isLocked ? 'locked' : 'stabilizing';
    const guidanceMessage = isLocked 
      ? 'All 4 corners aligned! Capturing...' 
      : 'Hold steady...';

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
   * Extract patch at target video point and detect hollow square
   */
  private detectCornerInPatch(
    video: HTMLVideoElement,
    expectedCenter: QuadPoint,
    vw: number,
    vh: number
  ): QuadPoint | null {
    if (!this.patchCtx) return null;

    const pr = this.patchRadius;
    const patchDim = pr * 2;

    const srcX = Math.max(0, Math.min(vw - patchDim, Math.round(expectedCenter.x - pr)));
    const srcY = Math.max(0, Math.min(vh - patchDim, Math.round(expectedCenter.y - pr)));

    this.patchCtx.drawImage(video, srcX, srcY, patchDim, patchDim, 0, 0, patchDim, patchDim);
    const imgData = this.patchCtx.getImageData(0, 0, patchDim, patchDim);
    const pixels = imgData.data;

    // Convert patch to grayscale
    const gray = new Uint8Array(patchDim * patchDim);
    for (let i = 0; i < patchDim * patchDim; i++) {
      const idx = i * 4;
      gray[i] = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
    }

    const cand = findHollowSquareInPatch(gray, patchDim, patchDim);
    if (!cand) return null;

    return {
      x: srcX + cand.cx,
      y: srcY + cand.cy,
    };
  }

  private decayStreak(): void {
    this.stableStreak = Math.max(0, this.stableStreak - 1);
    if (this.stableStreak === 0) {
      this.smoothedVideoFiducials = null;
    }
  }
}

/**
 * Dual-Mode Sub-Millisecond Hollow Square Detector:
 * Mode 1: Dark hollow square component with bright interior
 * Mode 2: Enclosed white hollow core surrounded by black registration rim
 */
function findHollowSquareInPatch(gray: Uint8Array, w: number, h: number): PatchCandidate | null {
  // 1. Compute integral image
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

  // 2. Binary adaptive thresholding: Dark pixels (border) & Bright pixels (hollow core)
  const binaryDark = new Uint8Array(w * h);
  const binaryBright = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const yRow = y * w;
    for (let x = 0; x < w; x++) {
      const mean = getLocalMean(x, y, 7);
      const val = gray[yRow + x];
      if (val < mean - 10) {
        binaryDark[yRow + x] = 1;
      } else if (val > mean + 4) {
        binaryBright[yRow + x] = 1;
      }
    }
  }

  const patchMidX = w / 2;
  const patchMidY = h / 2;
  const candidates: PatchCandidate[] = [];

  // Helper BFS
  const visitedDark = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    const yRow = y * w;
    for (let x = 2; x < w - 2; x++) {
      if (binaryDark[yRow + x] === 1 && visitedDark[yRow + x] === 0) {
        const queue = [x, y];
        visitedDark[yRow + x] = 1;
        let head = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        while (head < queue.length) {
          const qx = queue[head++];
          const qy = queue[head++];
          if (qx < minX) minX = qx;
          if (qx > maxX) maxX = qx;
          if (qy < minY) minY = qy;
          if (qy > maxY) maxY = qy;

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
              if (binaryDark[nidx] === 1 && visitedDark[nidx] === 0) {
                visitedDark[nidx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw / bh;

        // Dark square ring: 8px to 42px
        if (bw >= 8 && bw <= 42 && bh >= 8 && bh <= 42 && aspect >= 0.60 && aspect <= 1.65) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const distToPatchCenter = Math.hypot(cx - patchMidX, cy - patchMidY);

          if (distToPatchCenter <= w * 0.55) {
            const midXInt = Math.round(cx);
            const midYInt = Math.round(cy);
            const centerVal = gray[midYInt * w + midXInt];
            const localMean = getLocalMean(midXInt, midYInt, 6);

            // Center should be hollow (not solid filled bubble)
            if (centerVal >= localMean - 8) {
              const distScore = 1.0 / (1.0 + distToPatchCenter * 0.05);
              const aspectScore = 1.0 - Math.abs(1.0 - aspect);
              const score = distScore * 0.60 + aspectScore * 0.40;
              candidates.push({ cx, cy, bw, bh, score });
            }
          }
        }
      }
    }
  }

  // 3. Mode 2: Search for enclosed white hollow cores
  const visitedBright = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    const yRow = y * w;
    for (let x = 2; x < w - 2; x++) {
      if (binaryBright[yRow + x] === 1 && visitedBright[yRow + x] === 0) {
        const queue = [x, y];
        visitedBright[yRow + x] = 1;
        let head = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        while (head < queue.length) {
          const qx = queue[head++];
          const qy = queue[head++];
          if (qx < minX) minX = qx;
          if (qx > maxX) maxX = qx;
          if (qy < minY) minY = qy;
          if (qy > maxY) maxY = qy;

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
              if (binaryBright[nidx] === 1 && visitedBright[nidx] === 0) {
                visitedBright[nidx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw / bh;

        // White core: 5px to 28px
        if (bw >= 5 && bw <= 28 && bh >= 5 && bh <= 28 && aspect >= 0.60 && aspect <= 1.65) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const distToPatchCenter = Math.hypot(cx - patchMidX, cy - patchMidY);

          if (distToPatchCenter <= w * 0.55) {
            const midXInt = Math.round(cx);
            const midYInt = Math.round(cy);

            // Sample rim around white core to verify dark boundary
            const topRim = gray[Math.max(0, minY - 2) * w + midXInt];
            const botRim = gray[Math.min(h - 1, maxY + 2) * w + midXInt];
            const leftRim = gray[midYInt * w + Math.max(0, minX - 2)];
            const rightRim = gray[midYInt * w + Math.min(w - 1, maxX + 2)];
            const avgRim = (topRim + botRim + leftRim + rightRim) / 4;

            if (gray[midYInt * w + midXInt] > avgRim + 8) {
              const distScore = 1.0 / (1.0 + distToPatchCenter * 0.05);
              const aspectScore = 1.0 - Math.abs(1.0 - aspect);
              // Slight boost for enclosed white cores
              const score = distScore * 0.60 + aspectScore * 0.40 + 0.15;
              candidates.push({ cx, cy, bw, bh, score });
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
