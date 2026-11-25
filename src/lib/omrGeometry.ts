/**
 * Unified OMR Geometry and Coordinate System
 * Standard A4 Sheet: 210mm x 297mm
 * 
 * Shared between the Sheet Generator (OmrSheetGenerator) and 
 * the Optical Scanner Engine (omrScannerEngine) to guarantee 
 * 100% pixel-perfect coordinate alignment and zero bubble misplacement.
 */

export interface OmrPoint {
  x: number;
  y: number;
}

export interface OmrCorners {
  topLeft: OmrPoint;
  topRight: OmrPoint;
  bottomLeft: OmrPoint;
  bottomRight: OmrPoint;
}

export interface OmrLayoutConfig {
  totalQuestions: number;
  columnCount: number;
  questionsPerColumn: number;
  pageWidthMm: number;
  pageHeightMm: number;
  bottomFiducialY_mm: number;
  fiducialSpanX_mm: number;
  fiducialSpanY_mm: number;
  gridBottomMm: number;
  row0TopMm: number;
  row0CenterMm: number;
  isFullA4: boolean;
  sheetFormat: 'a4' | 'compact';
}

export const ISO_A4_STANDARDS = {
  name: 'ISO 216 A4',
  widthMm: 210,
  heightMm: 297,
  aspectRatio: 210 / 297, // ~0.70707
  inverseAspectRatio: 297 / 210, // ~1.41421
  widthInches: 8.27,
  heightInches: 11.69,
  fiducialTopY: 10,
  fiducialBottomY: 287,
  fiducialLeftX: 10,
  fiducialRightX: 200,
  fiducialSpanX: 190,
  fiducialSpanY: 277,
};

export const OMR_GEOMETRY = {
  // Physical width in mm (standard width 210mm)
  pageWidthMm: 210,
  // Standard full A4 height for multi-page documents or fallback
  maxPageHeightMm: 297,

  // 4 Corner Registration Fiducials (5.5mm x 5.5mm hollow squares at corner margin)
  fiducialMarginMm: 7.25,
  fiducialSizeMm: 5.5,
  
  // Top Fiducial Centers: 7.25 + 5.5/2 = 10mm
  fiducialTopLeft: { x: 10, y: 10 },
  fiducialTopRight: { x: 200, y: 10 },
  fiducialSpanX_mm: 190, // 200 - 10

  // Margins and paddings
  pagePaddingTopMm: 6.0,
  pagePaddingLeftMm: 12.0,
  pagePaddingRightMm: 12.0,
  pagePaddingBottomMm: 6.0,
  usableWidthMm: 186.0, // 210 - 24

  // Explicit vertical header blocks (in mm)
  headerHeightMm: 11.0,
  headerMarginBottomMm: 2.0,
  candidateBoxHeightMm: 7.5,
  candidateMarginBottomMm: 2.0,
  instructionsHeightMm: 6.0,
  instructionsMarginBottomMm: 2.0,
  columnHeaderHeightMm: 5.0,
  columnHeaderMarginBottomMm: 1.5,

  // Total height from top of page to Row 0 top:
  // 6.0 (pad) + 11.0 + 2.0 + 7.5 + 2.0 + 6.0 + 2.0 + 5.0 + 1.5 = 43.0mm
  row0TopMm: 43.0,
  rowHeightMm: 5.0,
  // Row 0 Center Y = 43.0 + 5.0 / 2 = 45.5mm (exact vertical center of Row 0)
  row0CenterMm: 45.5,

  // Spacing between bottom of active question bubble rows and top of bottom fiducial markers
  // Placed immediately below the last question row to minimize unused vertical height
  gapBelowGridToFiducialMm: 1.0,

  // Bubble circle metrics (3.2mm exam-grade diameter, centers preserved for zero-regression alignment)
  bubbleDiameterMm: 3.2,
  bubbleRadiusMm: 1.6,

  // 5-Column Grid Configuration (Equal 5.0mm H/V bubble pitch, columns centered symmetrically inward):
  fiveColumns: {
    columnCount: 5,
    gridMarginXMm: 15.0, // (186 - (5 * 25.2 + 4 * 7.5)) / 2 = 15.0mm equal L/R inset
    columnGapMm: 7.5,
    columnWidthMm: 25.2,
    qNumWidthMm: 5.0,
    gapToFirstBubbleMm: 1.4,
    bubblePitchMm: 5.0, // Matches rowHeightMm (5.0mm) -> equal 1.8mm H & V bubble gap
    // Exact mathematical centers of A, B, C, D from column left edge in mm (D ends at 24.6mm of 25.2mm):
    optionOffsetsMm: [8.0, 13.0, 18.0, 23.0],
  },

  // 4-Column Grid Configuration (Equal 5.0mm H/V bubble pitch, columns centered symmetrically inward):
  fourColumns: {
    columnCount: 4,
    gridMarginXMm: 24.1, // (186 - (4 * 26.2 + 3 * 11.0)) / 2 = 24.1mm equal L/R inset
    columnGapMm: 11.0,
    columnWidthMm: 26.2,
    qNumWidthMm: 6.0,
    gapToFirstBubbleMm: 1.4,
    bubblePitchMm: 5.0, // Matches rowHeightMm (5.0mm) -> equal 1.8mm H & V bubble gap
    // Exact mathematical centers of A, B, C, D from column left edge in mm (D ends at 25.6mm of 26.2mm):
    optionOffsetsMm: [9.0, 14.0, 19.0, 24.0],
  },
};

/**
 * Get layout configuration for a given question count.
 * Defaults to Full ISO A4 Sheet (210mm x 297mm) with corner fiducials anchored at 10mm margins,
 * with optional support for compact slips.
 */
export function getOmrLayoutConfig(
  totalQuestions: number,
  forcedColumnCount?: number,
  sheetFormat: 'a4' | 'compact' = 'a4'
): OmrLayoutConfig {
  const total = Math.max(1, totalQuestions);
  // Default view is always 5 columns
  const columnCount = forcedColumnCount || 5;
  const questionsPerColumn = Math.max(1, Math.ceil(total / columnCount));
  
  // Height from top to the bottom edge of the last question row
  const gridBottomMm = OMR_GEOMETRY.row0TopMm + questionsPerColumn * OMR_GEOMETRY.rowHeightMm;

  // Dynamic variable height based on question count, matching standard A4 width (210mm)
  const bottomFiducialTopMm = gridBottomMm + OMR_GEOMETRY.gapBelowGridToFiducialMm;
  const bottomFiducialY_mm = bottomFiducialTopMm + OMR_GEOMETRY.fiducialSizeMm / 2; // Center Y

  const calculatedPageHeightMm = bottomFiducialTopMm + OMR_GEOMETRY.fiducialSizeMm + OMR_GEOMETRY.fiducialMarginMm;
  const pageHeightMm = Math.min(OMR_GEOMETRY.maxPageHeightMm, calculatedPageHeightMm);

  const adjustedBottomFiducialY_mm = bottomFiducialY_mm;

  const fiducialSpanX_mm = OMR_GEOMETRY.fiducialSpanX_mm;
  const fiducialSpanY_mm = adjustedBottomFiducialY_mm - OMR_GEOMETRY.fiducialTopLeft.y;

  return {
    totalQuestions: total,
    columnCount,
    questionsPerColumn,
    pageWidthMm: OMR_GEOMETRY.pageWidthMm, // Always standard A4 width (210mm)
    pageHeightMm,
    bottomFiducialY_mm: adjustedBottomFiducialY_mm,
    fiducialSpanX_mm,
    fiducialSpanY_mm,
    gridBottomMm,
    row0TopMm: OMR_GEOMETRY.row0TopMm,
    row0CenterMm: OMR_GEOMETRY.row0CenterMm,
    isFullA4: false, // Variable height, no signatures or rough work boxes
    sheetFormat,
  };
}

/**
 * Get exact normalized coordinates [0..1, 0..1] relative to the 4 fiducials
 * for a specific question and option index (0 = A, 1 = B, 2 = C, 3 = D)
 */
export function getBubbleNormalizedCoordinates(
  questionIndex: number, // 0-based question index (0 to totalQuestions - 1)
  optionIndex: number,   // 0 to 3
  layout: OmrLayoutConfig
): { normX: number; normY: number; colIndex: number; rowIndex: number; physXMm: number; physYMm: number } {
  const colIndex = Math.min(
    layout.columnCount - 1,
    Math.floor(questionIndex / layout.questionsPerColumn)
  );
  const rowIndex = questionIndex % layout.questionsPerColumn;

  const colConfig = layout.columnCount === 4 ? OMR_GEOMETRY.fourColumns : OMR_GEOMETRY.fiveColumns;

  // Column left edge in mm from page left
  const colLeftMm =
    OMR_GEOMETRY.pagePaddingLeftMm +
    colConfig.gridMarginXMm +
    colIndex * (colConfig.columnWidthMm + colConfig.columnGapMm);

  // Bubble physical center X in mm
  const physXMm = colLeftMm + colConfig.optionOffsetsMm[optionIndex];

  // Bubble physical center Y in mm
  const physYMm = layout.row0CenterMm + rowIndex * OMR_GEOMETRY.rowHeightMm;

  // Normalized to fiducial centers:
  // normX = 0 at left fiducials (x = 10mm), 1 at right fiducials (x = 200mm)
  // normY = 0 at top fiducials (y = 10mm), 1 at bottom fiducials (y = layout.bottomFiducialY_mm)
  const normX = (physXMm - OMR_GEOMETRY.fiducialTopLeft.x) / layout.fiducialSpanX_mm;
  const normY = (physYMm - OMR_GEOMETRY.fiducialTopLeft.y) / layout.fiducialSpanY_mm;

  return { normX, normY, colIndex, rowIndex, physXMm, physYMm };
}

export interface OmrBubbleCoordinateRecord {
  questionIndex: number;      // 0-based
  questionNumber: number;     // 1-based (e.g. 1 to 50)
  optionIndex: number;        // 0 to 3
  optionLetter: string;       // 'A', 'B', 'C', 'D'
  colIndex: number;           // 0 to 4
  rowIndex: number;           // 0 to N-1
  physXMm: number;            // mm from page left
  physYMm: number;            // mm from page top
  normX: number;              // normalized to fiducial span [0..1]
  normY: number;              // normalized to fiducial span [0..1]
  pageNormX: number;          // normalized to full cropped sheet width [0..1]
  pageNormY: number;          // normalized to full cropped sheet height [0..1]
}

export interface OmrSheetBlueprint {
  totalQuestions: number;
  layout: OmrLayoutConfig;
  fiducials: OmrCorners;
  columnConfig: typeof OMR_GEOMETRY.fiveColumns | typeof OMR_GEOMETRY.fourColumns;
  bubbleRecords: OmrBubbleCoordinateRecord[];
  bubbleMap: Record<string, OmrBubbleCoordinateRecord>; // key: `${qIndex}_${optIndex}`
}

/**
 * Generates the immutable ground-truth blueprint containing the exact coordinate record
 * of all fiducials and bubble circles for any OMR sheet.
 */
export function generateOmrSheetBlueprint(
  totalQuestions: number,
  forcedColumnCount?: number,
  sheetFormat: 'a4' | 'compact' = 'a4'
): OmrSheetBlueprint {
  const layout = getOmrLayoutConfig(totalQuestions, forcedColumnCount, sheetFormat);
  const columnConfig = layout.columnCount === 4 ? OMR_GEOMETRY.fourColumns : OMR_GEOMETRY.fiveColumns;
  const options = ['A', 'B', 'C', 'D'];
  const bubbleRecords: OmrBubbleCoordinateRecord[] = [];
  const bubbleMap: Record<string, OmrBubbleCoordinateRecord> = {};

  for (let qIdx = 0; qIdx < layout.totalQuestions; qIdx++) {
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const { normX, normY, colIndex, rowIndex, physXMm, physYMm } = getBubbleNormalizedCoordinates(qIdx, optIdx, layout);
      const pageNormX = physXMm / layout.pageWidthMm;
      const pageNormY = physYMm / layout.pageHeightMm;

      const record: OmrBubbleCoordinateRecord = {
        questionIndex: qIdx,
        questionNumber: qIdx + 1,
        optionIndex: optIdx,
        optionLetter: options[optIdx],
        colIndex,
        rowIndex,
        physXMm,
        physYMm,
        normX,
        normY,
        pageNormX,
        pageNormY,
      };
      bubbleRecords.push(record);
      bubbleMap[`${qIdx}_${optIdx}`] = record;
    }
  }

  return {
    totalQuestions: layout.totalQuestions,
    layout,
    fiducials: {
      topLeft: OMR_GEOMETRY.fiducialTopLeft,
      topRight: OMR_GEOMETRY.fiducialTopRight,
      bottomLeft: { x: OMR_GEOMETRY.fiducialTopLeft.x, y: layout.bottomFiducialY_mm },
      bottomRight: { x: OMR_GEOMETRY.fiducialTopRight.x, y: layout.bottomFiducialY_mm },
    },
    columnConfig,
    bubbleRecords,
    bubbleMap,
  };
}
