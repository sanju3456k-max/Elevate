/**
 * High-Speed Real-time OMR Frame Detector & Tracker
 * 
 * Supports custom question paper OMR blueprints and localized 4-ROI corner search
 * aligned with the maximum on-screen viewfinder frame.
 */

import { OMR_GEOMETRY, OmrLayoutConfig, getOmrLayoutConfig } from './omrGeometry';
import type { QuadPoint } from './omrPerspectiveWarp';

export type LiveScannerStatus = 'searching' | 'tracking' | 'stabilizing' | 'locked';

export interface LiveQuadCorners {
  tl: QuadPoint; // 0 to 100% of video frame
  tr: QuadPoint;
  br: QuadPoint;
  bl: QuadPoint;
}

export interface NormalizedRect {
  x: number;      // 0 to 1
  y: number;      // 0 to 1
  width: number;  // 0 to 1
  height: number; // 0 to 1
}

export interface LiveOmrDetectionFrame {
  status: LiveScannerStatus;
  detected: boolean;
  confidence: number;            // 0 to 1
  fiducials: LiveQuadCorners;     // Corner fiducial center locations (0-100%)
  outerCorners: LiveQuadCorners;  // Extrapolated sheet boundary corners (0-100%)
  frameCorners: LiveQuadCorners;  // Guaranteed on-screen alignment frame corners (0-100%)
  stabilityProgress: number;     // 0 to 1 (fill level for auto-snap ring)
  guidanceMessage: string;
  tiltAngleDeg: number;
  ratioMatchPercentage: number;
  shouldAutoSnap: boolean;
}

interface InternalFiducialCandidate {
  x: number;
  y: number;
  size: number;
  score: number;
}

class FastIntegralImage {
  public sum: Float64Array;
  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.sum = new Float64Array((width + 1) * (height + 1));
  }

  public compute(grayData: Uint8Array): void {
    const w = this.width;
    const h = this.height;
    const stride = w + 1;

    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      const srcRowIdx = y * w;
      const dstRowIdx = (y + 1) * stride;
      const prevDstRowIdx = y * stride;

      for (let x = 0; x < w; x++) {
        rowSum += grayData[srcRowIdx + x];
        this.sum[dstRowIdx + (x + 1)] = this.sum[prevDstRowIdx + (x + 1)] + rowSum;
      }
    }
  }

  public getRectMean(x0: number, y0: number, x1: number, y1: number): number {
    const rx0 = Math.max(0, Math.min(this.width - 1, x0));
    const ry0 = Math.max(0, Math.min(this.height - 1, y0));
    const rx1 = Math.max(0, Math.min(this.width - 1, x1));
    const ry1 = Math.max(0, Math.min(this.height - 1, y1));

    if (rx1 < rx0 || ry1 < ry0) return 255;

    const stride = this.width + 1;
    const a = this.sum[ry0 * stride + rx0];
    const b = this.sum[ry0 * stride + (rx1 + 1)];
    const c = this.sum[(ry1 + 1) * stride + rx0];
    const d = this.sum[(ry1 + 1) * stride + (rx1 + 1)];

    const area = (rx1 - rx0 + 1) * (ry1 - ry0 + 1);
    if (area <= 0) return 255;
    return (d - b - c + a) / area;
  }
}

/**
 * Stateful Live Video Stream Detector
 */
export class OmrLiveDetector {
  private layout: OmrLayoutConfig;
  private expectedRatio: number;
  private marginRatioX: number;
  private marginRatioTop: number;
  private marginRatioBottom: number;

  // Offscreen processing buffers
  private workCanvas: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D | null;
  private integral: FastIntegralImage | null = null;
  private grayBuffer: Uint8Array | null = null;
  private readonly targetWorkDim = 480;

  // Temporal tracking state
  private smoothedFiducials: LiveQuadCorners | null = null;
  private smoothedOuterCorners: LiveQuadCorners | null = null;
  private stableStreak = 0;
  private readonly requiredStableFrames = 5; // ~300ms at 15-20fps
  private readonly maxMovementThresholdSq = 3.5 * 3.5; // Max movement in % space to count as stable
  private lastProcessTimestamp = 0;
  private readonly minProcessIntervalMs = 45; // ~22 FPS max

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

    this.workCanvas = document.createElement('canvas');
    this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });
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
    this.reset();
  }

  public reset(): void {
    this.smoothedFiducials = null;
    this.smoothedOuterCorners = null;
    this.stableStreak = 0;
    this.lastProcessTimestamp = 0;
  }

  /**
   * Process a single video frame with an optional normalized on-screen alignment frame
   */
  public processFrame(
    video: HTMLVideoElement,
    frameNormalizedRect?: NormalizedRect,
    now = performance.now()
  ): LiveOmrDetectionFrame | null {
    if (now - this.lastProcessTimestamp < this.minProcessIntervalMs) {
      return null; // Throttle to conserve CPU & battery
    }
    this.lastProcessTimestamp = now;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || vw < 100 || vh < 100 || !this.workCtx) {
      return this.createEmptyResult('Waiting for camera feed...', frameNormalizedRect);
    }

    // Default frame to 85% centered if not provided
    const frame = frameNormalizedRect || this.calculateDefaultNormalizedFrame(vw, vh);

    const frameCorners: LiveQuadCorners = {
      tl: { x: frame.x * 100, y: frame.y * 100 },
      tr: { x: (frame.x + frame.width) * 100, y: frame.y * 100 },
      br: { x: (frame.x + frame.width) * 100, y: (frame.y + frame.height) * 100 },
      bl: { x: frame.x * 100, y: (frame.y + frame.height) * 100 },
    };

    // Expected fiducials in normalized % space
    const expectedFiducials: LiveQuadCorners = {
      tl: {
        x: (frame.x + this.marginRatioX * frame.width) * 100,
        y: (frame.y + this.marginRatioTop * frame.height) * 100,
      },
      tr: {
        x: (frame.x + (1 - this.marginRatioX) * frame.width) * 100,
        y: (frame.y + this.marginRatioTop * frame.height) * 100,
      },
      br: {
        x: (frame.x + (1 - this.marginRatioX) * frame.width) * 100,
        y: (frame.y + (1 - this.marginRatioBottom) * frame.height) * 100,
      },
      bl: {
        x: (frame.x + this.marginRatioX * frame.width) * 100,
        y: (frame.y + (1 - this.marginRatioBottom) * frame.height) * 100,
      },
    };

    // 1. Scaled work dimensions
    const scale = Math.min(1.0, this.targetWorkDim / Math.max(vw, vh));
    const workW = Math.max(100, Math.round(vw * scale));
    const workH = Math.max(100, Math.round(vh * scale));

    if (this.workCanvas.width !== workW || this.workCanvas.height !== workH) {
      this.workCanvas.width = workW;
      this.workCanvas.height = workH;
      this.grayBuffer = new Uint8Array(workW * workH);
      this.integral = new FastIntegralImage(workW, workH);
    }

    // 2. Draw frame and extract grayscale
    this.workCtx.drawImage(video, 0, 0, workW, workH);
    const imgData = this.workCtx.getImageData(0, 0, workW, workH);
    const pixels = imgData.data;
    const gray = this.grayBuffer!;
    let totalLuma = 0;

    for (let i = 0; i < workW * workH; i++) {
      const idx = i * 4;
      const g = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
      gray[i] = g;
      totalLuma += g;
    }

    const avgLuma = totalLuma / (workW * workH);
    const paperLumaEstimate = Math.min(252, Math.max(140, avgLuma * 1.15));

    // 3. Compute integral image
    this.integral!.compute(gray);

    // 4. Targeted 4-ROI corner search
    const detected = this.searchCornersInROIs(
      this.integral!,
      workW,
      workH,
      expectedFiducials,
      paperLumaEstimate
    );

    if (!detected || detected.score < 0.35) {
      this.decayStreak();
      return this.createFrameResult(
        'searching',
        false,
        detected?.score || 0,
        expectedFiducials,
        frameCorners,
        frameCorners,
        0,
        'Align OMR sheet inside the frame',
        0,
        0,
        false
      );
    }

    // 5. Convert detected quad into percentage space [0..100]
    const rawFiducials: LiveQuadCorners = {
      tl: { x: (detected.tl.x / workW) * 100, y: (detected.tl.y / workH) * 100 },
      tr: { x: (detected.tr.x / workW) * 100, y: (detected.tr.y / workH) * 100 },
      br: { x: (detected.br.x / workW) * 100, y: (detected.br.y / workH) * 100 },
      bl: { x: (detected.bl.x / workW) * 100, y: (detected.bl.y / workH) * 100 },
    };

    // 6. Extrapolate outer page boundary corners
    const rawOuterCorners = this.extrapolateOuterCorners(rawFiducials);

    // 7. Temporal coordinate smoothing
    if (!this.smoothedFiducials) {
      this.smoothedFiducials = rawFiducials;
      this.smoothedOuterCorners = rawOuterCorners;
    } else {
      const alpha = 0.40;
      this.smoothedFiducials = {
        tl: smoothPt(this.smoothedFiducials.tl, rawFiducials.tl, alpha),
        tr: smoothPt(this.smoothedFiducials.tr, rawFiducials.tr, alpha),
        br: smoothPt(this.smoothedFiducials.br, rawFiducials.br, alpha),
        bl: smoothPt(this.smoothedFiducials.bl, rawFiducials.bl, alpha),
      };
      this.smoothedOuterCorners = {
        tl: smoothPt(this.smoothedOuterCorners.tl, rawOuterCorners.tl, alpha),
        tr: smoothPt(this.smoothedOuterCorners.tr, rawOuterCorners.tr, alpha),
        br: smoothPt(this.smoothedOuterCorners.br, rawOuterCorners.br, alpha),
        bl: smoothPt(this.smoothedOuterCorners.bl, rawOuterCorners.bl, alpha),
      };
    }

    // 8. Stability Check: Measure movement from smoothed position
    const maxMovementSq = Math.max(
      distSq(rawFiducials.tl, this.smoothedFiducials.tl),
      distSq(rawFiducials.tr, this.smoothedFiducials.tr),
      distSq(rawFiducials.br, this.smoothedFiducials.br),
      distSq(rawFiducials.bl, this.smoothedFiducials.bl)
    );

    const isStable = maxMovementSq < this.maxMovementThresholdSq;
    if (isStable) {
      this.stableStreak = Math.min(this.requiredStableFrames, this.stableStreak + 1);
    } else {
      this.stableStreak = Math.max(0, this.stableStreak - 2);
    }

    const progress = this.stableStreak / this.requiredStableFrames;
    const isLocked = this.stableStreak >= this.requiredStableFrames;
    const status: LiveScannerStatus = isLocked ? 'locked' : (this.stableStreak > 1 ? 'stabilizing' : 'tracking');

    // 9. Guidance text
    let guidance = '4 Corner markers detected';
    if (isLocked) {
      guidance = 'Locked! Auto-scanning...';
    } else if (status === 'stabilizing') {
      guidance = 'Hold steady...';
    } else if (Math.abs(detected.tiltDeg) > 12) {
      guidance = detected.tiltDeg > 0 ? 'Rotate slightly counter-clockwise' : 'Rotate slightly clockwise';
    }

    return this.createFrameResult(
      status,
      true,
      detected.score,
      this.smoothedFiducials,
      this.smoothedOuterCorners,
      frameCorners,
      progress,
      guidance,
      detected.tiltDeg,
      detected.ratioMatch,
      isLocked
    );
  }

  private decayStreak(): void {
    this.stableStreak = Math.max(0, this.stableStreak - 2);
  }

  private calculateDefaultNormalizedFrame(vw: number, vh: number): NormalizedRect {
    const targetAspect = this.layout.pageWidthMm / this.layout.pageHeightMm;
    const videoAspect = vw / vh;

    let fw: number;
    let fh: number;

    if (videoAspect > targetAspect) {
      fh = 0.85;
      fw = (fh * targetAspect) / videoAspect;
    } else {
      fw = 0.85;
      fh = (fw * videoAspect) / targetAspect;
    }

    return {
      x: (1 - fw) / 2,
      y: (1 - fh) / 2,
      width: fw,
      height: fh,
    };
  }

  private createEmptyResult(msg: string, frameRect?: NormalizedRect): LiveOmrDetectionFrame {
    const fallback = {
      tl: { x: 10, y: 10 },
      tr: { x: 90, y: 10 },
      br: { x: 90, y: 90 },
      bl: { x: 10, y: 90 },
    };
    return this.createFrameResult('searching', false, 0, fallback, fallback, fallback, 0, msg, 0, 0, false);
  }

  private createFrameResult(
    status: LiveScannerStatus,
    detected: boolean,
    confidence: number,
    fiducials: LiveQuadCorners,
    outerCorners: LiveQuadCorners,
    frameCorners: LiveQuadCorners,
    stabilityProgress: number,
    guidanceMessage: string,
    tiltAngleDeg: number,
    ratioMatchPercentage: number,
    shouldAutoSnap: boolean
  ): LiveOmrDetectionFrame {
    return {
      status,
      detected,
      confidence: Number(confidence.toFixed(2)),
      fiducials,
      outerCorners,
      frameCorners,
      stabilityProgress: Number(stabilityProgress.toFixed(2)),
      guidanceMessage,
      tiltAngleDeg: Math.round(tiltAngleDeg),
      ratioMatchPercentage: Math.round(ratioMatchPercentage),
      shouldAutoSnap,
    };
  }

  /**
   * Search for 4 fiducials inside localized ROI corner windows centered around expected positions
   */
  private searchCornersInROIs(
    integral: FastIntegralImage,
    workW: number,
    workH: number,
    expectedFiducials: LiveQuadCorners,
    paperLuma: number
  ): {
    tl: InternalFiducialCandidate;
    tr: InternalFiducialCandidate;
    br: InternalFiducialCandidate;
    bl: InternalFiducialCandidate;
    score: number;
    tiltDeg: number;
    ratioMatch: number;
  } | null {
    // ROI Search radius: approx 15% of frame dimensions
    const roiRadiusX = Math.round(workW * 0.12);
    const roiRadiusY = Math.round(workH * 0.12);

    const tlCenter = { x: (expectedFiducials.tl.x / 100) * workW, y: (expectedFiducials.tl.y / 100) * workH };
    const trCenter = { x: (expectedFiducials.tr.x / 100) * workW, y: (expectedFiducials.tr.y / 100) * workH };
    const brCenter = { x: (expectedFiducials.br.x / 100) * workW, y: (expectedFiducials.br.y / 100) * workH };
    const blCenter = { x: (expectedFiducials.bl.x / 100) * workW, y: (expectedFiducials.bl.y / 100) * workH };

    const tlCands = this.findCandidatesInWindow(integral, workW, workH, tlCenter.x, tlCenter.y, roiRadiusX, roiRadiusY, paperLuma);
    const trCands = this.findCandidatesInWindow(integral, workW, workH, trCenter.x, trCenter.y, roiRadiusX, roiRadiusY, paperLuma);
    const brCands = this.findCandidatesInWindow(integral, workW, workH, brCenter.x, brCenter.y, roiRadiusX, roiRadiusY, paperLuma);
    const blCands = this.findCandidatesInWindow(integral, workW, workH, blCenter.x, blCenter.y, roiRadiusX, roiRadiusY, paperLuma);

    if (tlCands.length === 0 || trCands.length === 0 || brCands.length === 0 || blCands.length === 0) {
      return null;
    }

    // Pick best quad from ROI candidates
    let best = null;
    let bestScore = 0;

    for (const tl of tlCands) {
      for (const tr of trCands) {
        if (tr.x <= tl.x + 20) continue;

        for (const br of brCands) {
          if (br.y <= tr.y + 20 || br.x <= tl.x + 20) continue;

          for (const bl of blCands) {
            if (bl.y <= tl.y + 20 || br.x <= bl.x + 20) continue;

            const topDx = tr.x - tl.x;
            const topDy = tr.y - tl.y;
            const botDx = br.x - bl.x;
            const botDy = br.y - bl.y;
            const leftDx = bl.x - tl.x;
            const leftDy = bl.y - tl.y;
            const rightDx = br.x - tr.x;
            const rightDy = br.y - tr.y;

            const topLen = Math.hypot(topDx, topDy);
            const botLen = Math.hypot(botDx, botDy);
            const leftLen = Math.hypot(leftDx, leftDy);
            const rightLen = Math.hypot(rightDx, rightDy);

            const avgW = (topLen + botLen) / 2;
            const avgH = (leftLen + rightLen) / 2;
            const measuredRatio = avgW / avgH;

            const ratioDiff = Math.abs(measuredRatio - this.expectedRatio);
            if (ratioDiff > this.expectedRatio * 0.25) continue; // Allow up to 25% tilt angle

            const ratioMatch = Math.max(0, 1.0 - ratioDiff / (this.expectedRatio * 0.25));
            const tiltDeg = (Math.atan2(topDy, topDx) * 180) / Math.PI;

            const wRatio = Math.min(topLen, botLen) / Math.max(topLen, botLen);
            const hRatio = Math.min(leftLen, rightLen) / Math.max(leftLen, rightLen);
            if (wRatio < 0.55 || hRatio < 0.55) continue;

            const avgBoxScore = (tl.score + tr.score + br.score + bl.score) / 4;
            const parallelism = (wRatio + hRatio) / 2;

            const totalScore = ratioMatch * 0.45 + avgBoxScore * 0.35 + parallelism * 0.20;

            if (totalScore > bestScore) {
              bestScore = totalScore;
              best = {
                tl,
                tr,
                br,
                bl,
                score: totalScore,
                tiltDeg,
                ratioMatch: Math.round(ratioMatch * 100),
              };
            }
          }
        }
      }
    }

    return best;
  }

  /**
   * Search for square fiducial candidates within a specific bounding window
   */
  private findCandidatesInWindow(
    integral: FastIntegralImage,
    width: number,
    height: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    paperLuma: number
  ): InternalFiducialCandidate[] {
    const candidates: InternalFiducialCandidate[] = [];
    const baseDim = Math.min(width, height);

    const minX = Math.max(8, Math.round(cx - rx));
    const maxX = Math.min(width - 9, Math.round(cx + rx));
    const minY = Math.max(8, Math.round(cy - ry));
    const maxY = Math.min(height - 9, Math.round(cy + ry));

    const testSizes = [
      Math.max(8, Math.round(baseDim * 0.024)),
      Math.max(12, Math.round(baseDim * 0.038)),
      Math.max(16, Math.round(baseDim * 0.052)),
    ];

    const gridStep = 3;

    for (const boxSize of testSizes) {
      const halfBox = Math.round(boxSize / 2);
      const ringMargin = Math.max(2, Math.round(boxSize * 0.45));
      const coreHalf = Math.max(1, halfBox - Math.max(1, Math.round(boxSize * 0.22)));

      for (let y = minY; y <= maxY; y += gridStep) {
        for (let x = minX; x <= maxX; x += gridStep) {
          const boxMean = integral.getRectMean(x - halfBox, y - halfBox, x + halfBox, y + halfBox);
          const outerMean = integral.getRectMean(
            x - halfBox - ringMargin,
            y - halfBox - ringMargin,
            x + halfBox + ringMargin,
            y + halfBox + ringMargin
          );

          const outerArea = (boxSize + 2 * ringMargin) * (boxSize + 2 * ringMargin);
          const innerArea = boxSize * boxSize;
          const ringSum = outerMean * outerArea - boxMean * innerArea;
          const ringMean = ringSum / Math.max(1, outerArea - innerArea);

          if (ringMean < paperLuma * 0.60 && ringMean < 115) continue;

          const innerCoreMean = integral.getRectMean(x - coreHalf, y - coreHalf, x + coreHalf, y + coreHalf);
          const coreArea = (2 * coreHalf + 1) * (2 * coreHalf + 1);
          const borderSum = boxMean * innerArea - innerCoreMean * coreArea;
          const borderMean = borderSum / Math.max(1, innerArea - coreArea);

          const isHollow = borderMean < ringMean - 18 && innerCoreMean >= borderMean + 8;
          const isSolid = boxMean < ringMean - 22;

          if (!isHollow && !isSolid) continue;

          const darkness = isHollow ? borderMean : boxMean;
          const contrast = ringMean - darkness;
          const score = Math.min(1.0, (contrast / 90) * (1.0 - darkness / 255));

          if (score > 0.22) {
            candidates.push({ x, y, size: boxSize, score });
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const suppressed: InternalFiducialCandidate[] = [];
    const distSqThresh = Math.pow(Math.max(6, baseDim * 0.025), 2);

    for (const cand of candidates) {
      let overlap = false;
      for (const kept of suppressed) {
        const dx = cand.x - kept.x;
        const dy = cand.y - kept.y;
        if (dx * dx + dy * dy < distSqThresh) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        suppressed.push(cand);
        if (suppressed.length >= 6) break; // Keep top 6 candidates in this local corner ROI
      }
    }

    return suppressed;
  }

  /**
   * Extrapolates from fiducial box centers to true outer A4 page corners
   */
  private extrapolateOuterCorners(fiducials: LiveQuadCorners): LiveQuadCorners {
    const topVecX = fiducials.tr.x - fiducials.tl.x;
    const topVecY = fiducials.tr.y - fiducials.tl.y;
    const botVecX = fiducials.br.x - blPercentX(fiducials);
    const botVecY = fiducials.br.y - blPercentY(fiducials);

    const leftVecX = fiducials.bl.x - fiducials.tl.x;
    const leftVecY = fiducials.bl.y - fiducials.tl.y;
    const rightVecX = fiducials.br.x - fiducials.tr.x;
    const rightVecY = fiducials.br.y - fiducials.tr.y;

    const mX = this.marginRatioX;
    const mTop = this.marginRatioTop;
    const mBot = this.marginRatioBottom;

    return {
      tl: {
        x: Math.max(0, Math.min(100, fiducials.tl.x - mX * topVecX - mTop * leftVecX)),
        y: Math.max(0, Math.min(100, fiducials.tl.y - mX * topVecY - mTop * leftVecY)),
      },
      tr: {
        x: Math.max(0, Math.min(100, fiducials.tr.x + mX * topVecX - mTop * rightVecX)),
        y: Math.max(0, Math.min(100, fiducials.tr.y + mX * topVecY - mTop * rightVecY)),
      },
      br: {
        x: Math.max(0, Math.min(100, fiducials.br.x + mX * botVecX + mBot * rightVecX)),
        y: Math.max(0, Math.min(100, fiducials.br.y + mX * botVecY + mBot * rightVecY)),
      },
      bl: {
        x: Math.max(0, Math.min(100, fiducials.bl.x - mX * botVecX + mBot * leftVecX)),
        y: Math.max(0, Math.min(100, fiducials.bl.y - mX * botVecY + mBot * leftVecY)),
      },
    };
  }
}

function blPercentX(f: LiveQuadCorners): number {
  return f.bl.x;
}
function blPercentY(f: LiveQuadCorners): number {
  return f.bl.y;
}

function smoothPt(prev: QuadPoint, curr: QuadPoint, alpha: number): QuadPoint {
  return {
    x: prev.x * (1 - alpha) + curr.x * alpha,
    y: prev.y * (1 - alpha) + curr.y * alpha,
  };
}

function distSq(a: QuadPoint, b: QuadPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
