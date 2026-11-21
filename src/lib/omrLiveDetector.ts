/**
 * High-Speed Real-time OMR Frame Detector & Tracker
 * 
 * Analyzes live camera video frames at 15-20 FPS using an integral-image
 * based fiducial locator, temporal EMA coordinate smoothing, and stability tracking.
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

export interface LiveOmrDetectionFrame {
  status: LiveScannerStatus;
  detected: boolean;
  confidence: number;            // 0 to 1
  fiducials: LiveQuadCorners;     // Corner fiducial center locations (0-100%)
  outerCorners: LiveQuadCorners;  // Extrapolated sheet boundary corners (0-100%)
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
  private expectedBoxToSpanX: number;

  // Offscreen processing buffers
  private workCanvas: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D | null;
  private integral: FastIntegralImage | null = null;
  private grayBuffer: Uint8Array | null = null;
  private readonly targetWorkDim = 460;

  // Temporal tracking state
  private smoothedFiducials: LiveQuadCorners | null = null;
  private smoothedOuterCorners: LiveQuadCorners | null = null;
  private stableStreak = 0;
  private readonly requiredStableFrames = 6; // ~350-450ms at 15fps
  private readonly maxMovementThresholdSq = 3.8 * 3.8; // Max movement in % space to count as stable
  private lastProcessTimestamp = 0;
  private readonly minProcessIntervalMs = 50; // Max ~20 FPS

  constructor(totalQuestions = 50) {
    this.layout = getOmrLayoutConfig(totalQuestions, undefined, 'a4');
    this.expectedRatio = this.layout.fiducialSpanX_mm / this.layout.fiducialSpanY_mm;
    this.expectedBoxToSpanX = OMR_GEOMETRY.fiducialSizeMm / this.layout.fiducialSpanX_mm;

    this.workCanvas = document.createElement('canvas');
    this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });
  }

  public setLayout(totalQuestions: number): void {
    this.layout = getOmrLayoutConfig(totalQuestions, undefined, 'a4');
    this.expectedRatio = this.layout.fiducialSpanX_mm / this.layout.fiducialSpanY_mm;
    this.expectedBoxToSpanX = OMR_GEOMETRY.fiducialSizeMm / this.layout.fiducialSpanX_mm;
    this.reset();
  }

  public reset(): void {
    this.smoothedFiducials = null;
    this.smoothedOuterCorners = null;
    this.stableStreak = 0;
    this.lastProcessTimestamp = 0;
  }

  /**
   * Process a single video frame from an active HTMLVideoElement
   */
  public processFrame(video: HTMLVideoElement, now = performance.now()): LiveOmrDetectionFrame | null {
    if (now - this.lastProcessTimestamp < this.minProcessIntervalMs) {
      return null; // Throttle to conserve CPU & battery
    }
    this.lastProcessTimestamp = now;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || vw < 100 || vh < 100 || !this.workCtx) {
      return this.createEmptyResult('Waiting for camera feed...');
    }

    // 1. Scaled dimensions
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
      // Fast integer luminance
      const g = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
      gray[i] = g;
      totalLuma += g;
    }

    const avgLuma = totalLuma / (workW * workH);
    const paperLumaEstimate = Math.min(252, Math.max(140, avgLuma * 1.15));

    // 3. Compute integral image & find corner candidates
    this.integral!.compute(gray);
    const candidates = this.findCandidates(this.integral!, workW, workH, paperLumaEstimate);

    if (candidates.length < 4) {
      this.decayStreak();
      return this.createFrameResult(
        'searching',
        false,
        0,
        this.getFallbackCorners(),
        this.getFallbackCorners(),
        0,
        'Position the 4 corner squares inside camera view',
        0,
        0,
        false
      );
    }

    // 4. Find best 4 corners matching blueprint geometry
    const detected = this.findBestQuad(candidates, workW, workH);

    if (!detected || detected.score < 0.35) {
      this.decayStreak();
      return this.createFrameResult(
        'searching',
        false,
        detected?.score || 0,
        this.getFallbackCorners(),
        this.getFallbackCorners(),
        0,
        'Align camera over the OMR sheet',
        detected?.tiltDeg || 0,
        detected?.ratioMatch || 0,
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

    // 7. Temporal Smoothing (EMA filter: 65% previous + 35% current)
    if (!this.smoothedFiducials) {
      this.smoothedFiducials = rawFiducials;
      this.smoothedOuterCorners = rawOuterCorners;
    } else {
      const alpha = 0.38;
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

    // 9. Guidance text based on tilt, size, and stability
    let guidance = '4 Corner squares detected';
    if (isLocked) {
      guidance = 'Locked! Capturing...';
    } else if (status === 'stabilizing') {
      guidance = 'Hold steady...';
    } else if (Math.abs(detected.tiltDeg) > 15) {
      guidance = detected.tiltDeg > 0 ? 'Rotate slightly counter-clockwise' : 'Rotate slightly clockwise';
    } else if (detected.ratioMatch < 70) {
      guidance = 'Tilt camera to face sheet directly';
    }

    return this.createFrameResult(
      status,
      true,
      detected.score,
      this.smoothedFiducials,
      this.smoothedOuterCorners,
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

  private createEmptyResult(msg: string): LiveOmrDetectionFrame {
    const fallback = this.getFallbackCorners();
    return this.createFrameResult('searching', false, 0, fallback, fallback, 0, msg, 0, 0, false);
  }

  private getFallbackCorners(): LiveQuadCorners {
    return {
      tl: { x: 15, y: 15 },
      tr: { x: 85, y: 15 },
      br: { x: 85, y: 85 },
      bl: { x: 15, y: 85 },
    };
  }

  private createFrameResult(
    status: LiveScannerStatus,
    detected: boolean,
    confidence: number,
    fiducials: LiveQuadCorners,
    outerCorners: LiveQuadCorners,
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
      stabilityProgress: Number(stabilityProgress.toFixed(2)),
      guidanceMessage,
      tiltAngleDeg: Math.round(tiltAngleDeg),
      ratioMatchPercentage: Math.round(ratioMatchPercentage),
      shouldAutoSnap,
    };
  }

  /**
   * Fast candidate search for square fiducial markers in integral image
   */
  private findCandidates(
    integral: FastIntegralImage,
    width: number,
    height: number,
    paperLuma: number
  ): InternalFiducialCandidate[] {
    const candidates: InternalFiducialCandidate[] = [];
    const baseDim = Math.min(width, height);

    // Multi-scale box sizes (approx 12px to 32px in 460p work space)
    const testSizes = [
      Math.max(8, Math.round(baseDim * 0.025)),
      Math.max(12, Math.round(baseDim * 0.040)),
      Math.max(16, Math.round(baseDim * 0.058)),
    ];

    const gridStep = Math.max(3, Math.round(baseDim / 100));

    for (const boxSize of testSizes) {
      const halfBox = Math.round(boxSize / 2);
      const ringMargin = Math.max(2, Math.round(boxSize * 0.45));
      const coreHalf = Math.max(1, halfBox - Math.max(1, Math.round(boxSize * 0.22)));

      const minX = halfBox + ringMargin;
      const maxX = width - 1 - halfBox - ringMargin;
      const minY = halfBox + ringMargin;
      const maxY = height - 1 - halfBox - ringMargin;

      for (let cy = minY; cy <= maxY; cy += gridStep) {
        for (let cx = minX; cx <= maxX; cx += gridStep) {
          const boxMean = integral.getRectMean(cx - halfBox, cy - halfBox, cx + halfBox, cy + halfBox);
          const outerMean = integral.getRectMean(
            cx - halfBox - ringMargin,
            cy - halfBox - ringMargin,
            cx + halfBox + ringMargin,
            cy + halfBox + ringMargin
          );

          const outerArea = (boxSize + 2 * ringMargin) * (boxSize + 2 * ringMargin);
          const innerArea = boxSize * boxSize;
          const ringSum = outerMean * outerArea - boxMean * innerArea;
          const ringMean = ringSum / Math.max(1, outerArea - innerArea);

          if (ringMean < paperLuma * 0.65 && ringMean < 120) continue;

          const innerCoreMean = integral.getRectMean(cx - coreHalf, cy - coreHalf, cx + coreHalf, cy + coreHalf);
          const coreArea = (2 * coreHalf + 1) * (2 * coreHalf + 1);
          const borderSum = boxMean * innerArea - innerCoreMean * coreArea;
          const borderMean = borderSum / Math.max(1, innerArea - coreArea);

          const isHollow = borderMean < ringMean - 20 && innerCoreMean >= borderMean + 10;
          const isSolid = boxMean < ringMean - 24;

          if (!isHollow && !isSolid) continue;

          const darkness = isHollow ? borderMean : boxMean;
          const contrast = ringMean - darkness;
          const score = Math.min(1.0, (contrast / 100) * (1.0 - darkness / 255));

          if (score > 0.25) {
            candidates.push({ x: cx, y: cy, size: boxSize, score });
          }
        }
      }
    }

    // Fast non-maximum suppression
    candidates.sort((a, b) => b.score - a.score);
    const suppressed: InternalFiducialCandidate[] = [];
    const distSqThresh = Math.pow(Math.max(8, baseDim * 0.035), 2);

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
        if (suppressed.length >= 24) break; // Limit candidate pool for combinatorial speed
      }
    }

    return suppressed;
  }

  /**
   * Search candidate combinations for the best matching A4 quad
   */
  private findBestQuad(
    cands: InternalFiducialCandidate[],
    width: number,
    height: number
  ): {
    tl: InternalFiducialCandidate;
    tr: InternalFiducialCandidate;
    br: InternalFiducialCandidate;
    bl: InternalFiducialCandidate;
    score: number;
    tiltDeg: number;
    ratioMatch: number;
  } | null {
    let best = null;
    let bestScore = 0;

    for (let i = 0; i < cands.length; i++) {
      const tl = cands[i];
      for (let j = 0; j < cands.length; j++) {
        if (j === i) continue;
        const tr = cands[j];
        if (tr.x <= tl.x + 20) continue;

        for (let k = 0; k < cands.length; k++) {
          if (k === i || k === j) continue;
          const br = cands[k];
          if (br.y <= tr.y + 20 || br.x <= tl.x + 20) continue;

          for (let l = 0; l < cands.length; l++) {
            if (l === i || l === j || l === k) continue;
            const bl = cands[l];
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

            // Minimum area & aspect ratio checks
            if (topLen < width * 0.20 || leftLen < height * 0.20) continue;

            const avgW = (topLen + botLen) / 2;
            const avgH = (leftLen + rightLen) / 2;
            const measuredRatio = avgW / avgH;

            const ratioDiff = Math.abs(measuredRatio - this.expectedRatio);
            if (ratioDiff > this.expectedRatio * 0.22) continue; // Allow up to 22% angle variance

            const ratioMatch = Math.max(0, 1.0 - ratioDiff / (this.expectedRatio * 0.22));
            const tiltDeg = (Math.atan2(topDy, topDx) * 180) / Math.PI;

            // Opposites parallelism
            const wRatio = Math.min(topLen, botLen) / Math.max(topLen, botLen);
            const hRatio = Math.min(leftLen, rightLen) / Math.max(leftLen, rightLen);
            if (wRatio < 0.60 || hRatio < 0.60) continue;

            const avgBoxScore = (tl.score + tr.score + br.score + bl.score) / 4;
            const parallelism = (wRatio + hRatio) / 2;
            const coverage = Math.min(1.0, (avgW * avgH) / (width * height * 0.35));

            const totalScore = ratioMatch * 0.40 + avgBoxScore * 0.30 + parallelism * 0.20 + coverage * 0.10;

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
   * Extrapolates from fiducial box centers to true outer A4 page corners
   */
  private extrapolateOuterCorners(fiducials: LiveQuadCorners): LiveQuadCorners {
    const marginRatioX = 10 / this.layout.fiducialSpanX_mm;
    const marginRatioTop = 10 / this.layout.fiducialSpanY_mm;
    const marginRatioBottom = (this.layout.pageHeightMm - this.layout.bottomFiducialY_mm) / this.layout.fiducialSpanY_mm;

    const topVecX = fiducials.tr.x - fiducials.tl.x;
    const topVecY = fiducials.tr.y - fiducials.tl.y;
    const botVecX = fiducials.br.x - fiducials.bl.x;
    const botVecY = fiducials.br.y - fiducials.bl.y;

    const leftVecX = fiducials.bl.x - fiducials.tl.x;
    const leftVecY = fiducials.bl.y - fiducials.tl.y;
    const rightVecX = fiducials.br.x - fiducials.tr.x;
    const rightVecY = fiducials.br.y - fiducials.tr.y;

    return {
      tl: {
        x: Math.max(0, Math.min(100, fiducials.tl.x - marginRatioX * topVecX - marginRatioTop * leftVecX)),
        y: Math.max(0, Math.min(100, fiducials.tl.y - marginRatioX * topVecY - marginRatioTop * leftVecY)),
      },
      tr: {
        x: Math.max(0, Math.min(100, fiducials.tr.x + marginRatioX * topVecX - marginRatioTop * rightVecX)),
        y: Math.max(0, Math.min(100, fiducials.tr.y + marginRatioX * topVecY - marginRatioTop * rightVecY)),
      },
      br: {
        x: Math.max(0, Math.min(100, fiducials.br.x + marginRatioX * botVecX + marginRatioBottom * rightVecX)),
        y: Math.max(0, Math.min(100, fiducials.br.y + marginRatioX * botVecY + marginRatioBottom * rightVecY)),
      },
      bl: {
        x: Math.max(0, Math.min(100, fiducials.bl.x - marginRatioX * botVecX + marginRatioBottom * leftVecX)),
        y: Math.max(0, Math.min(100, fiducials.bl.y - marginRatioX * botVecY + marginRatioBottom * leftVecY)),
      },
    };
  }
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
