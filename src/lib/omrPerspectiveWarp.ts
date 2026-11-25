/**
 * Perspective Warping & Homography Transformation Utility
 * 
 * Provides true 4-point perspective rectification for tilted, rotated,
 * or angled camera captures of OMR sheets. Maps the 4 user-dragged corner
 * fiducial boxes to the canonical rectangular OMR blueprint coordinates.
 */

export interface QuadPoint {
  x: number;
  y: number;
}

/**
 * Solve an 8x8 linear equation system A * x = b using Gaussian elimination with partial pivoting.
 */
function solve8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      const val = Math.abs(M[k][i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      return null; // Singular matrix
    }

    // Swap rows
    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }

    // Eliminate column below
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  // Back substitution
  const result = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * result[j];
    }
    result[i] = sum / M[i][i];
  }

  return result;
}

/**
 * Computes the 3x3 homography matrix mapping destination coordinates (u, v) 
 * to source coordinates (x, y).
 */
export function computeBackwardHomography(
  srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint], // TL, TR, BR, BL
  dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint]  // TL, TR, BR, BL
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dstQuad[i].x;
    const v = dstQuad[i].y;
    const x = srcQuad[i].x;
    const y = srcQuad[i].y;

    // Row 2*i: u*h00 + v*h01 + h02 - u*x*h20 - v*x*h21 = x
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);

    // Row 2*i + 1: u*h10 + v*h11 + h12 - u*y*h20 - v*y*h21 = y
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const sol = solve8x8(A, b);
  if (!sol) return null;

  // [h00, h01, h02, h10, h11, h12, h20, h21, 1.0]
  return [...sol, 1.0];
}

/**
 * Perform perspective warp from source image/canvas to a rectified output canvas.
 */
export function warpPerspectiveCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint],
  dstWidth: number,
  dstHeight: number,
  dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint]
): HTMLCanvasElement | null {
  // Obtain source image data
  const srcW = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const srcH = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height;

  if (srcW <= 0 || srcH <= 0 || dstWidth <= 0 || dstHeight <= 0) return null;

  let srcCanvas: HTMLCanvasElement;
  let srcCtx: CanvasRenderingContext2D | null;

  if (source instanceof HTMLCanvasElement) {
    srcCanvas = source;
    srcCtx = srcCanvas.getContext('2d');
  } else {
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return null;
    srcCtx.drawImage(source, 0, 0);
  }

  if (!srcCtx) return null;
  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImgData.data;
  const src32 = new Uint32Array(srcData.buffer);

  // Compute Homography H (dst -> src)
  const H = computeBackwardHomography(srcQuad, dstQuad);
  if (!H) return null;

  const [h00, h01, h02, h10, h11, h12, h20, h21] = H;

  // Prepare destination canvas and buffer
  const outCanvas = document.createElement('canvas');
  outCanvas.width = dstWidth;
  outCanvas.height = dstHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return null;

  const outImgData = outCtx.createImageData(dstWidth, dstHeight);
  const out32 = new Uint32Array(outImgData.data.buffer);

  const maxSrcX = srcW - 1;
  const maxSrcY = srcH - 1;

  // High-performance single-instruction 32-bit direct pixel mapping (~100x faster than floating point 4-tap blend)
  for (let v = 0; v < dstHeight; v++) {
    let xNum = h01 * v + h02;
    let yNum = h11 * v + h12;
    let denom = h21 * v + 1;

    let outIdx = v * dstWidth;

    for (let u = 0; u < dstWidth; u++) {
      const invW = 1 / denom;
      const xs = (xNum * invW + 0.5) | 0;
      const ys = (yNum * invW + 0.5) | 0;

      xNum += h00;
      yNum += h10;
      denom += h20;

      if (xs >= 0 && xs <= maxSrcX && ys >= 0 && ys <= maxSrcY) {
        out32[outIdx++] = src32[ys * srcW + xs];
      } else {
        // Outside sheet boundary: fill opaque white
        out32[outIdx++] = 0xFFFFFFFF;
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

export interface QuadCorners {
  tl: QuadPoint; // Top-Left (0-100%)
  tr: QuadPoint; // Top-Right (0-100%)
  br: QuadPoint; // Bottom-Right (0-100%)
  bl: QuadPoint; // Bottom-Left (0-100%)
}

/**
 * Fast fiducial quadrilateral auto-detection directly from canvas.
 * Locates the 4 corner registration squares and returns their percentage coordinates (0-100%).
 */
export function autoDetectFiducialsOnCanvas(canvas: HTMLCanvasElement): QuadCorners | null {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h || w < 100 || h < 100) return null;

  // Downsample to max dimension 700 for high precision while maintaining fast <20ms execution
  const maxDim = 700;
  const scale = Math.min(1.0, maxDim / Math.max(w, h));
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);

  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, sw, sh);
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const d = imgData.data;

  // Convert to grayscale
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const idx = i * 4;
    gray[i] = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
  }

  // Integral image for fast mean computation
  const stride = sw + 1;
  const integral = new Int32Array(stride * (sh + 1));
  for (let y = 0; y < sh; y++) {
    let rowSum = 0;
    const yRow = y * sw;
    const iRow = y * stride;
    const iNext = (y + 1) * stride;
    for (let x = 0; x < sw; x++) {
      rowSum += gray[yRow + x];
      integral[iNext + x + 1] = integral[iRow + x + 1] + rowSum;
    }
  }

  const getBoxMean = (rx0: number, ry0: number, rx1: number, ry1: number) => {
    const x0 = Math.max(0, Math.min(sw - 1, rx0));
    const y0 = Math.max(0, Math.min(sh - 1, ry0));
    const x1 = Math.max(0, Math.min(sw - 1, rx1));
    const y1 = Math.max(0, Math.min(sh - 1, ry1));
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count <= 0) return 128;
    const sum =
      integral[(y1 + 1) * stride + x1 + 1] -
      integral[y0 * stride + x1 + 1] -
      integral[(y1 + 1) * stride + x0] +
      integral[y0 * stride + x0];
    return sum / count;
  };

  // Adaptive thresholding: dark registration border pixels
  // Registration fiducials are present in the 4 corner zones (outer 45% margins)
  const cornerXMargin = Math.round(sw * 0.46);
  const cornerYMargin = Math.round(sh * 0.46);
  const binaryDark = new Uint8Array(sw * sh);
  const rMean = Math.max(3, Math.round(sw * 0.015));

  for (let y = 0; y < sh; y++) {
    const isYCorner = y < cornerYMargin || y > sh - cornerYMargin;
    const yRow = y * sw;
    const y0 = y > rMean ? y - rMean : 0;
    const y1 = y + rMean < sh ? y + rMean : sh - 1;
    const rowH = y1 - y0 + 1;
    const intY0 = y0 * stride;
    const intY1 = (y1 + 1) * stride;

    for (let x = 0; x < sw; x++) {
      if (!isYCorner && (x >= cornerXMargin && x <= sw - cornerXMargin)) {
        continue;
      }

      const x0 = x > rMean ? x - rMean : 0;
      const x1 = x + rMean < sw ? x + rMean : sw - 1;
      const count = (x1 - x0 + 1) * rowH;
      const sum = integral[intY1 + x1 + 1] - integral[intY0 + x1 + 1] - integral[intY1 + x0] + integral[intY0 + x0];
      const localM = sum / count;

      if (gray[yRow + x] < localM - 12) {
        binaryDark[yRow + x] = 1;
      }
    }
  }

  // Filter connected components into 4 quadrants
  const midX = sw / 2;
  const midY = sh / 2;
  const minDim = Math.min(sw, sh);
  const maxDimSize = Math.max(sw, sh);
  const minBox = Math.max(4, Math.round(minDim * 0.012));
  const maxBox = Math.max(minBox + 10, Math.round(maxDimSize * 0.09));

  interface Cand {
    cx: number;
    cy: number;
  }
  const candsTL: Cand[] = [];
  const candsTR: Cand[] = [];
  const candsBR: Cand[] = [];
  const candsBL: Cand[] = [];

  const visited = new Uint8Array(sw * sh);
  for (let y = 2; y < sh - 2; y++) {
    const isYCorner = y < cornerYMargin || y > sh - cornerYMargin;
    const yRow = y * sw;
    for (let x = 2; x < sw - 2; x++) {
      if (!isYCorner && (x >= cornerXMargin && x <= sw - cornerXMargin)) {
        continue;
      }
      if (binaryDark[yRow + x] === 1 && visited[yRow + x] === 0) {
        let minX = x, maxX = x, minY = y, maxY = y;
        const queue = [x, y];
        visited[yRow + x] = 1;
        let head = 0;

        while (head < queue.length) {
          if (queue.length > 2000) break;
          const qx = queue[head++];
          const qy = queue[head++];
          if (qx < minX) minX = qx;
          if (qx > maxX) maxX = qx;
          if (qy < minY) minY = qy;
          if (qy > maxY) maxY = qy;
          if (maxX - minX > maxBox * 2 || maxY - minY > maxBox * 2) break;

          const nbrs = [
            [qx + 1, qy],
            [qx - 1, qy],
            [qx, qy + 1],
            [qx, qy - 1],
          ];
          for (let i = 0; i < 4; i++) {
            const nx = nbrs[i][0];
            const ny = nbrs[i][1];
            if (nx >= 0 && nx < sw && ny >= 0 && ny < sh) {
              const nidx = ny * sw + nx;
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

        if (bw >= minBox && bw <= maxBox && bh >= minBox && bh <= maxBox && aspect >= 0.55 && aspect <= 1.80) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const centerVal = gray[Math.round(cy) * sw + Math.round(cx)];
          const boxMean = getBoxMean(minX, minY, maxX, maxY);

          // Support hollow or solid dark registration squares
          const isHollow = centerVal >= boxMean + 2;
          const isSolidDark = boxMean < 140;
          if (isHollow || isSolidDark) {
            // Check quadrant position (must be in outer margin regions)
            if (cx < midX && cy < midY && (cx < sw * 0.48 || cy < sh * 0.48)) {
              candsTL.push({ cx, cy });
            } else if (cx >= midX && cy < midY && (cx > sw * 0.52 || cy < sh * 0.48)) {
              candsTR.push({ cx, cy });
            } else if (cx >= midX && cy >= midY && (cx > sw * 0.52 || cy > sh * 0.52)) {
              candsBR.push({ cx, cy });
            } else if (cx < midX && cy >= midY && (cx < sw * 0.48 || cy > sh * 0.52)) {
              candsBL.push({ cx, cy });
            }
          }
        }
      }
    }
  }

  // Quadrant geometric pairing
  let bestQuad: { tl: Cand; tr: Cand; br: Cand; bl: Cand } | null = null;
  let maxArea = 0;

  for (const tl of candsTL) {
    for (const tr of candsTR) {
      for (const br of candsBR) {
        for (const bl of candsBL) {
          const topW = tr.cx - tl.cx;
          const botW = br.cx - bl.cx;
          const leftH = bl.cy - tl.cy;
          const rightH = br.cy - tr.cy;
          const avgW = (topW + botW) / 2;
          const avgH = (leftH + rightH) / 2;
          if (avgH <= 20 || avgW <= 20) continue;

          const ratio = avgW / avgH;
          // Support portrait, landscape, sideways, compact slip (up to ~4.6:1), and perspective tilted sheet orientations
          if (ratio >= 0.25 && ratio <= 5.2 && Math.abs(topW - botW) / avgW < 0.38 && Math.abs(leftH - rightH) / avgH < 0.38) {
            const area = avgW * avgH;
            if (area > maxArea) {
              maxArea = area;
              bestQuad = { tl, tr, br, bl };
            }
          }
        }
      }
    }
  }

  if (!bestQuad) {
    // Fallback: detect document paper boundary if printed fiducials are obscured
    return detectDocumentPaperCorners(gray, sw, sh);
  }

  // Convert back to original unscaled canvas percentage (0 - 100%)
  return {
    tl: { x: Number(((bestQuad.tl.cx / sw) * 100).toFixed(2)), y: Number(((bestQuad.tl.cy / sh) * 100).toFixed(2)) },
    tr: { x: Number(((bestQuad.tr.cx / sw) * 100).toFixed(2)), y: Number(((bestQuad.tr.cy / sh) * 100).toFixed(2)) },
    br: { x: Number(((bestQuad.br.cx / sw) * 100).toFixed(2)), y: Number(((bestQuad.br.cy / sh) * 100).toFixed(2)) },
    bl: { x: Number(((bestQuad.bl.cx / sw) * 100).toFixed(2)), y: Number(((bestQuad.bl.cy / sh) * 100).toFixed(2)) },
  };
}

/**
 * Fallback detector: detects high-contrast document paper boundaries on desk
 */
function detectDocumentPaperCorners(gray: Uint8Array, sw: number, sh: number): QuadCorners | null {
  let sum = 0;
  for (let i = 0; i < sw * sh; i += 4) sum += gray[i];
  const avgLuma = sum / ((sw * sh) / 4);
  const thresh = Math.max(90, avgLuma * 0.82);

  let minX = sw, maxX = 0, minY = sh, maxY = 0;
  for (let y = 6; y < sh - 6; y += 2) {
    const row = y * sw;
    for (let x = 6; x < sw - 6; x += 2) {
      if (gray[row + x] > thresh) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const docW = maxX - minX;
  const docH = maxY - minY;
  if (docW < sw * 0.35 || docH < sh * 0.35) return null;

  // Inset 3.5% from detected paper edge to land on registration square coordinates
  const insetX = (docW * 0.035) / sw * 100;
  const insetY = (docH * 0.035) / sh * 100;
  const x0 = (minX / sw) * 100 + insetX;
  const x1 = (maxX / sw) * 100 - insetX;
  const y0 = (minY / sh) * 100 + insetY;
  const y1 = (maxY / sh) * 100 - insetY;

  return {
    tl: { x: Number(Math.max(2, x0).toFixed(2)), y: Number(Math.max(2, y0).toFixed(2)) },
    tr: { x: Number(Math.min(98, x1).toFixed(2)), y: Number(Math.max(2, y0).toFixed(2)) },
    br: { x: Number(Math.min(98, x1).toFixed(2)), y: Number(Math.min(98, y1).toFixed(2)) },
    bl: { x: Number(Math.max(2, x0).toFixed(2)), y: Number(Math.min(98, y1).toFixed(2)) },
  };
}

export interface AlignmentQualityResult {
  isGood: boolean;
  score: number;
  label: string;
}

/**
 * Fast real-time frame alignment quality evaluator for manual cropping.
 * Evaluates whether current corners accurately enclose the OMR sheet and hit real registration squares.
 */
export function checkFrameAlignmentQuality(
  canvas: HTMLCanvasElement | null, 
  corners: QuadCorners
): AlignmentQualityResult {
  if (!canvas) return { isGood: false, score: 0, label: 'Adjust corners' };
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h || w < 100 || h < 100) return { isGood: false, score: 0, label: 'Adjust corners' };

  // 1. Check quadrilateral geometry
  const pTL = { x: (corners.tl.x / 100) * w, y: (corners.tl.y / 100) * h };
  const pTR = { x: (corners.tr.x / 100) * w, y: (corners.tr.y / 100) * h };
  const pBR = { x: (corners.br.x / 100) * w, y: (corners.br.y / 100) * h };
  const pBL = { x: (corners.bl.x / 100) * w, y: (corners.bl.y / 100) * h };

  const topW = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y);
  const botW = Math.hypot(pBR.x - pBL.x, pBR.y - pBL.y);
  const leftH = Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y);
  const rightH = Math.hypot(pBR.x - pTR.x, pBR.y - pTR.y);

  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;
  if (avgW <= 50 || avgH <= 50) return { isGood: false, score: 0, label: 'Adjust corners' };

  const ratio = avgW / avgH;
  // Standard A4 OMR fiducials aspect ratio is ~190mm / 277mm = 0.686
  // Allow wide range [0.25, 3.4] to accommodate perspective projection, landscape, and sideways sheets
  const isRatioValid = ratio >= 0.25 && ratio <= 5.2;
  const isSymW = Math.abs(topW - botW) / avgW < 0.38;
  const isSymH = Math.abs(leftH - rightH) / avgH < 0.38;

  if (!isRatioValid || !isSymW || !isSymH) {
    return { isGood: false, score: 30, label: 'Keep frame rectangular' };
  }

  // 2. Sample pixel luminance at all 4 corners from canvas context
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { isGood: isRatioValid && isSymW && isSymH, score: 70, label: 'Good ✓' };

  // Sample a window sized proportionally to the expected registration square (~5.5mm on sheet)
  const sampleSize = Math.max(20, Math.min(60, Math.round(w * 0.035)));
  const halfS = Math.floor(sampleSize / 2);

  const checkCornerContrast = (pt: { x: number; y: number }): boolean => {
    const rx = Math.max(0, Math.min(w - sampleSize, Math.round(pt.x - halfS)));
    const ry = Math.max(0, Math.min(h - sampleSize, Math.round(pt.y - halfS)));
    const imgData = ctx.getImageData(rx, ry, sampleSize, sampleSize);
    const d = imgData.data;
    let minLuma = 255;
    let maxLuma = 0;
    const centerIdx = (halfS * sampleSize + halfS) * 4;
    const centerLuma = (d[centerIdx] * 77 + d[centerIdx + 1] * 150 + d[centerIdx + 2] * 29) >> 8;

    for (let i = 0; i < sampleSize * sampleSize; i += 2) {
      const idx = i * 4;
      const luma = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
    }
    // High contrast: dark printed square (<150) with white paper margin (>160)
    const hasDarkCenter = centerLuma < 150 || minLuma < 125;
    const hasContrast = (maxLuma - minLuma >= 30);
    return hasDarkCenter && hasContrast;
  };

  const cTL = checkCornerContrast(pTL);
  const cTR = checkCornerContrast(pTR);
  const cBR = checkCornerContrast(pBR);
  const cBL = checkCornerContrast(pBL);
  const contrastCount = (cTL ? 1 : 0) + (cTR ? 1 : 0) + (cBR ? 1 : 0) + (cBL ? 1 : 0);

  if (contrastCount >= 3) {
    return { isGood: true, score: 95, label: 'Perfect Alignment ✓' };
  } else if (contrastCount >= 2) {
    return { isGood: true, score: 80, label: 'Good Alignment ✓' };
  }

  return { isGood: false, score: 50, label: 'Align corners to squares' };
}
