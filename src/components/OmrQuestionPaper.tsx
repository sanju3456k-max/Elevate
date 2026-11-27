import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { APP_BRAND } from '../config/appBrand';
import {
  Printer,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  MoveRight,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type { MathTest, MathQuestion, QuestionPaperLayout } from '../types';
import { triggerSystemPrint } from '../lib/omrPrintDownload';
import { MathRenderer } from './MathRenderer';
import { normalizeDiagramUrl } from '../lib/diagramPresets';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { generateOmrSheetBlueprint } from '../lib/omrGeometry';
import { OmrSheetGenerator } from './OmrSheetGenerator';

interface OmrQuestionPaperProps {
  test: MathTest;
  className?: string;
  hideHeaderContainer?: boolean;
  isEditableLayout?: boolean;
  showSolutions?: boolean;
  onUpdateQuestionLayout?: (qIndex: number, newLayout: QuestionPaperLayout) => void;
  onResetAllLayouts?: () => void;
  layoutDensity?: 'tight' | 'balanced' | 'relaxed';
  setLayoutDensity?: (density: 'tight' | 'balanced' | 'relaxed') => void;
  showBadges?: boolean;
  setShowBadges?: (show: boolean) => void;
  hideInlineDock?: boolean;
  embedOmrSheet?: boolean;
  continuousPages?: boolean;
}

export interface OptionData {
  label: string;
  text: string;
  originalIndex: number;
  imageUrl?: string;
}

export type StreamItemType = 'statement' | 'options_row' | 'single_option';

export interface StreamFlowItem {
  id: string;
  questionNumber: number;
  questionIndex?: number;
  type: StreamItemType;
  statementText?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageWidths?: (number | undefined)[];
  optionsRow?: OptionData[];
  singleOption?: OptionData;
  gridCols?: 2 | 4;
  isFirstOptionOfQuestion?: boolean;
  isLastOptionOfQuestion?: boolean;
  estimatedHeight: number;
  paperLayout?: QuestionPaperLayout;
  breakBefore?: 'none' | 'column' | 'page';
  keepTogether?: boolean;
}

export interface PaperPageLayout {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  leftColumn: StreamFlowItem[];
  rightColumn: StreamFlowItem[];
}

/**
 * Standard A4 Constants (at 96 DPI: 1mm = 3.78px, 297mm = 1122.5px)
 * Calibrated Column Height Budgets with 8mm top / 8mm bottom padding (60.5px total)
 * and safe Android Serif/Tinos font clearance (~25-35px margin above bottom border):
 * - Page 1: 915px budget
 * - Subsequent Pages: 980px budget
 */
const DEFAULT_PAGE_1_COL_HEIGHT_PX = 915;
const DEFAULT_SUBSEQUENT_PAGE_COL_HEIGHT_PX = 980;
/**
 * Extra bottom vertical height buffer (in pixels) added specifically to the in-app
 * preview canvas so that questions are never cut off at the bottom in the preview.
 * (Adjust this value anytime to increase/decrease bottom breathing room in the app preview).
 */
export const PREVIEW_BOTTOM_EXTRA_HEIGHT_PX = 0;
const ITEM_GAP_PX = 0;
const CHARS_PER_COL_LINE = 43;

export interface OptionDimensionAnalysis {
  effectiveWidthPx: number;
  isMultiLine: boolean;
  hasMatrix: boolean;
  isWideMatrix: boolean;
  isTallMatrix: boolean;
  hasFractions: boolean;
  hasIntegralOrSum: boolean;
  hasTrigOrLog: boolean;
  hasEqualOrNotEqual: boolean;
  hasInequality: boolean;
  plainTextLength: number;
}

/**
 * Detects whether an option contains any of the four inequality relation signs:
 * 1. Less than (<, \lt, \less, &lt;)
 * 2. Greater than (>, \gt, \greater, &gt;)
 * 3. Less than or equal to (<=, ≤, \le, \leq, \leqslant, \leqq, &le;)
 * 4. Greater than or equal to (>=, ≥, \ge, \geq, \geqslant, \geqq, &ge;)
 * Also covers negated inequalities (\nless, \ngtr, \nleq, \ngeq, ≮, ≯, ≰, ≱).
 *
 * If any ABCD option element contains an inequality sign, single row (4_across)
 * is disallowed. Instead, options automatically layout as a 2x2 grid or four
 * consecutive rows (stacked) according to their width and length, with full
 * manual override support via existing editing tools.
 */
export function hasInequalitySign(optText: string): boolean {
  if (!optText) return false;
  // Strip out HTML tags first so <br>, <span>, etc. don't trigger '<' or '>'
  const textWithoutHtml = optText.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
  return /(?:<=|>=|[<>]|&le;|&ge;|&lt;|&gt;|\u2264|\u2265|\u2266|\u2267|\u226a|\u226b|\u226e|\u226f|\u2270|\u2271|\\(?:le|leq|leqslant|leqq|ge|geq|geqslant|geqq|lt|gt|less|greater|nless|ngtr|nleq|ngeq)(?![a-zA-Z]))/.test(textWithoutHtml);
}

/**
 * Detects whether an option contains an equal to (=) or not equal to (≠, \ne, \neq, !=) sign,
 * specifically excluding inequality operators (<=, >=, etc.).
 * If any ABCD option element contains an equal or not equal to sign (and no inequality signs),
 * the options are rendered as 4 consecutive rows (stacked).
 */
export function hasEqualOrNotEqualSign(optText: string): boolean {
  if (!optText) return false;
  // Remove inequality patterns so <= and >= are not misidentified as pure equality
  const textClean = optText.replace(/<=|>=|&le;|&ge;/g, ' ');
  // Matches:
  // 1. Literal '=' (covers '=', '==', ':=', '!=') as long as not preceded by '<' or '>'
  // 2. Unicode NOT EQUAL TO '≠' (\u2260) or IDENTICAL TO '≡' (\u2261)
  // 3. LaTeX '\neq', '\ne', '\nequal', '\equiv' without trailing letters (avoids false matching on \newline, \negative)
  // 4. LaTeX '\not=' or '\not ='
  return /(?:(?<![<>!])=|!=|\u2260|\u2261|\\ne(?:q|qual)?(?![a-zA-Z])|\\not\s*=|\\equiv(?![a-zA-Z]))/.test(textClean);
}

export function analyzeOptionDimensions(optText: string): OptionDimensionAnalysis {
  const text = (optText || '').trim();
  if (!text) {
    return {
      effectiveWidthPx: 10,
      isMultiLine: false,
      hasMatrix: false,
      isWideMatrix: false,
      isTallMatrix: false,
      hasFractions: false,
      hasIntegralOrSum: false,
      hasTrigOrLog: false,
      hasEqualOrNotEqual: false,
      hasInequality: false,
      plainTextLength: 0,
    };
  }

  const isMultiLine = text.includes('\n');
  const hasEqualOrNotEqual = hasEqualOrNotEqualSign(text);
  const hasInequality = hasInequalitySign(text);
  const hasMatrix = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}/.test(text);
  const hasIntegralOrSum = /\\(?:int|iint|iiint|oint|sum|prod|lim|bigcup|bigcap)\b/.test(text);
  const hasTrigOrLog = /\\(?:sin|cos|tan|cot|sec|csc|log|ln|arcsin|arccos|arctan|sinh|cosh|tanh)\b/.test(text);

  let matrixWidthPx = 0;
  let isWideMatrix = false;
  let isTallMatrix = false;

  if (hasMatrix) {
    const matrixBodyMatch = text.match(/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/);
    if (matrixBodyMatch) {
      const body = matrixBodyMatch[1];
      const rows = body.split('\\\\').filter((r) => r.trim().length > 0);
      let maxCols = 1;
      let maxCellLen = 1;

      rows.forEach((r) => {
        const cells = r.split('&');
        maxCols = Math.max(maxCols, cells.length);
        cells.forEach((c) => {
          maxCellLen = Math.max(maxCellLen, c.trim().length);
        });
      });

      if (rows.length >= 3) isTallMatrix = true;
      if (maxCols >= 3 || maxCellLen > 3 || rows.length >= 3) {
        isWideMatrix = true;
      }
      matrixWidthPx = 20 + maxCols * Math.max(22, maxCellLen * 8 + 12);
    } else {
      matrixWidthPx = 110;
      isWideMatrix = true;
    }
  }

  const fracMatches: string[] = text.match(/\\(?:frac|dfrac)\{([^{}]+)\}\{([^{}]+)\}/g) || [];
  const hasFractions = fracMatches.length > 0;
  let fracWidthPx = 0;
  fracMatches.forEach((f: string) => {
    const match = f.match(/\\(?:frac|dfrac)\{([^{}]+)\}\{([^{}]+)\}/);
    if (match) {
      const numLen = match[1].replace(/\\[a-zA-Z]+/g, 'xx').length;
      const denLen = match[2].replace(/\\[a-zA-Z]+/g, 'xx').length;
      fracWidthPx += Math.max(numLen, denLen) * 7.5 + 14;
    }
  });

  const sqrtMatches = (text.match(/\\sqrt(?:\[\d+\])?\{[^{}]+\}/g) || []).length;
  const sqrtExtraWidth = sqrtMatches * 18;

  const trigMatches = (text.match(/\\(?:sin|cos|tan|cot|sec|csc|log|ln|arcsin|arccos|arctan|sinh|cosh|tanh)\b/g) || []).length;
  const trigExtraWidth = trigMatches * 26;

  const intMatches = (text.match(/\\(?:int|iint|iiint|oint)\b/g) || []).length;
  const intExtraWidth = intMatches * 44;

  const bigOpMatches = (text.match(/\\(?:sum|prod|lim)\b/g) || []).length;
  const bigOpExtraWidth = bigOpMatches * 36;

  const opMatches = (text.match(/[+\-=<>]|\\(?:pm|mp|times|cdot|div|neq|leq|le|geq|ge|leqslant|geqslant|lt|gt)\b/g) || []).length;
  const opExtraWidth = opMatches * 14;

  const cleanText = text
    .replace(/\$\$[\s\S]+?\$\$/g, ' ')
    .replace(/\\begin\{[\s\S]+?\\end\{[^\}]+\}/g, ' ')
    .replace(/\\(?:frac|dfrac)\{[^{}]+\}\{[^{}]+\}/g, ' ')
    .replace(/\\sqrt(?:\[\d+\])?\{[^{}]+\}/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[$_{}^()\[\]|]/g, '')
    .trim();

  const plainTextLength = cleanText.length;
  const baseLetterWidth = plainTextLength * 7.2;

  const totalCalculatedWidth = 
    baseLetterWidth + 
    fracWidthPx + 
    matrixWidthPx + 
    sqrtExtraWidth + 
    trigExtraWidth + 
    intExtraWidth + 
    bigOpExtraWidth + 
    opExtraWidth;

  return {
    effectiveWidthPx: Math.round(totalCalculatedWidth),
    isMultiLine,
    hasMatrix,
    isWideMatrix,
    isTallMatrix,
    hasFractions,
    hasIntegralOrSum,
    hasTrigOrLog,
    hasEqualOrNotEqual,
    hasInequality,
    plainTextLength,
  };
}

export function determineOptionLayout(
  options: OptionData[],
  forcedLayout?: 'auto' | '4_across' | '2x2_grid' | 'stacked'
): '4_across' | '2x2_grid' | 'stacked' {
  // Manual adjustments via existing question paper editing tools take absolute priority
  if (forcedLayout && forcedLayout !== 'auto') {
    return forcedLayout;
  }

  if (!options || options.length !== 4) {
    return 'stacked';
  }

  // 1. Detect if options contain any of the four inequality relation signs (<, >, <=, >=, etc.)
  const hasInequality = options.some((o) => hasInequalitySign(o.text));

  // 2. Detect if options contain equal to or not equal to signs (=, ≠, !=, \neq, \equiv) excluding inequalities
  const hasEqualOrNotEqual = options.some((o) => hasEqualOrNotEqualSign(o.text));

  // If options contain equal to or not equal to signs AND NO inequality signs,
  // then those options are rendered as 4 consecutive rows (stacked)
  if (hasEqualOrNotEqual && !hasInequality) {
    return 'stacked';
  }

  const analyses = options.map((o) => analyzeOptionDimensions(o.text));

  const hasMultiLine = analyses.some((a) => a.isMultiLine);
  const hasLongSentence = analyses.some((a) => a.plainTextLength > 24);
  const hasWideMatrix = analyses.some((a) => a.isWideMatrix || a.isTallMatrix);
  
  const hasCompoundIntegral = analyses.some(
    (a) => a.hasIntegralOrSum && (a.effectiveWidthPx > 80 || a.hasFractions || a.hasTrigOrLog)
  );

  if (hasMultiLine || hasLongSentence || hasWideMatrix || hasCompoundIntegral) {
    return 'stacked';
  }

  const maxEffectiveWidth = Math.max(...analyses.map((a) => a.effectiveWidthPx));
  const hasAnyMatrix = analyses.some((a) => a.hasMatrix);
  const hasAnyIntegral = analyses.some((a) => a.hasIntegralOrSum);
  const hasComplexFraction = analyses.some((a) => a.hasFractions && a.effectiveWidthPx > 48);
  const hasOptionImages = options.some((o) => Boolean(o.imageUrl));

  // Single row (4_across):
  // Strictly disallowed if any option contains an inequality sign or option diagram image
  if (
    !hasOptionImages &&
    !hasInequality &&
    !hasAnyMatrix &&
    !hasAnyIntegral &&
    !hasComplexFraction &&
    maxEffectiveWidth <= 52 &&
    !analyses.some((a) => a.plainTextLength > 8)
  ) {
    return '4_across';
  }

  // 2x2 grid:
  // Auto-selected if options fit nicely within 2 columns (maxEffectiveWidth <= 135 and plain text length <= 18)
  if (
    maxEffectiveWidth <= 135 &&
    !analyses.some((a) => a.plainTextLength > 18)
  ) {
    return '2x2_grid';
  }

  // Otherwise, wider or longer options become 4 consecutive rows (stacked)
  return 'stacked';
}

function estimateStatementHeight(text: string): number {
  if (!text) return 20;

  let matrixExtra = 0;
  const matrixMatches = text.match(/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}[\s\S]+?\\end\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}/g);
  if (matrixMatches) {
    matrixMatches.forEach((m) => {
      const rows = (m.match(/\\\\/g) || []).length + 1;
      if (rows <= 2) {
        matrixExtra += 32;
      } else {
        matrixExtra += 20 + rows * 18;
      }
    });
  }

  const displayMathBlocks = (text.match(/\$\$[\s\S]+?\$\$/g) || []).length;
  const displayMathExtra = displayMathBlocks * 30;

  const fracMatches = (text.match(/\\(?:frac|dfrac)\{[^{}]+\}\{[^{}]+\}/g) || []).length;
  const fracExtra = fracMatches * 10;

  const cleanText = text
    .replace(/\$\$[\s\S]+?\$\$/g, ' ')
    .replace(/\\begin\{[\s\S]+?\\end\{[^\}]+\}/g, ' ')
    .replace(/\\(?:frac|dfrac|sqrt|left|right|text|times|cdot)/g, ' ');

  const paragraphs = cleanText.split('\n');
  let lineCount = 0;
  paragraphs.forEach((p) => {
    const trimmed = p.trim();
    if (!trimmed) {
      lineCount += 0.3;
    } else {
      lineCount += Math.max(1, Math.ceil(trimmed.length / CHARS_PER_COL_LINE));
    }
  });

  const baseHeight = lineCount * 18.5 + matrixExtra + displayMathExtra + fracExtra + 4;
  return Math.max(22, Math.min(500, Math.round(baseHeight)));
}

function estimateOptionRowHeight(opts: OptionData[]): number {
  let maxHeight = 20;
  opts.forEach((opt) => {
    const text = opt.text || '';
    const is3x3 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}(?:[^\\]*\\\\){2,}/.test(text);
    const is2x2 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/.test(text);
    const isFrac = /\\(?:frac|dfrac)\b/.test(text);
    const isIntOrSqrt = /\\(?:int|sqrt)\b/.test(text);

    if (is3x3) {
      maxHeight = Math.max(maxHeight, 68);
    } else if (is2x2) {
      maxHeight = Math.max(maxHeight, 46);
    } else if (isFrac || isIntOrSqrt) {
      maxHeight = Math.max(maxHeight, 28);
    } else {
      maxHeight = Math.max(maxHeight, 20);
    }
  });
  return maxHeight;
}

function estimateSingleOptionHeight(opt: OptionData): number {
  const text = opt.text || '';
  const is3x3 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}(?:[^\\]*\\\\){2,}/.test(text);
  const is2x2 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/.test(text);
  const isFrac = /\\(?:frac|dfrac)\b/.test(text);
  const isInt = /\\(?:int|iint|iiint)\b/.test(text);

  if (is3x3) return 68;
  if (is2x2) return 46;
  if (isFrac || isInt) return 34;

  const analysis = analyzeOptionDimensions(text);
  const lines = Math.max(1, Math.ceil(analysis.effectiveWidthPx / 290));

  let baseH = lines * 19;
  return Math.max(20, baseH);
}

export function cleanBlankLines(text: string): string {
  if (!text) return '';
  let res = text.replace(/(?:\\_)+/g, (match) => '_'.repeat(Math.max(4, Math.floor(match.length / 2) * 2)));
  res = res.replace(/\\_/g, '_');
  res = res.replace(/(?:[_\-–—]\s+){2,}[_\-–—]/g, '________');
  return res;
}

function buildLinearStreamItems(questions: MathQuestion[]): StreamFlowItem[] {
  const stream: StreamFlowItem[] = [];

  questions.forEach((q, idx) => {
    const qNumber = idx + 1;
    const qId = q.id || `q_${qNumber}`;
    const statementText = cleanBlankLines(q.text || '');
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const formattedOptions: OptionData[] = rawOptions.map((opt, oIdx) => ({
      label: String.fromCharCode(97 + oIdx),
      text: cleanBlankLines(opt || ''),
      originalIndex: oIdx,
      imageUrl: q.optionImages?.[oIdx],
    }));

    const effectiveImageUrl = q.imageUrl || q.paperLayout?.imageUrl;
    const effectiveImageWidth = q.imageWidth || q.paperLayout?.imageWidth;
    const effectiveImageWidths = q.paperLayout?.imageWidths || q.imageWidths;

    const paperLayout: QuestionPaperLayout = {
      ...q.paperLayout,
      imageUrl: effectiveImageUrl,
      imageWidth: effectiveImageWidth,
      imageWidths: effectiveImageWidths,
      keepTogether: q.paperLayout?.keepTogether ?? false,
    };
    const breakBefore = paperLayout.breakBefore || 'none';
    const keepTogether = paperLayout.keepTogether ?? true;

    const imgWidth = paperLayout.imageWidth;
    let imgExtra = effectiveImageUrl
      ? (imgWidth ? Math.min(115, Math.max(50, Math.round(imgWidth * 0.45))) : 95)
      : 0;
    if (Array.isArray(q.imageUrls)) {
      q.imageUrls.forEach((url, uIdx) => {
        if (url) {
          const uWidth = effectiveImageWidths?.[uIdx];
          imgExtra += uWidth ? Math.min(115, Math.max(50, Math.round(uWidth * 0.45))) : 95;
        }
      });
    }
    const statementHeight = estimateStatementHeight(statementText) + imgExtra;

    stream.push({
      id: `${qId}_stmt`,
      questionNumber: qNumber,
      questionIndex: idx,
      type: 'statement',
      statementText,
      imageUrl: effectiveImageUrl,
      imageUrls: q.imageUrls,
      imageWidths: effectiveImageWidths,
      estimatedHeight: statementHeight,
      paperLayout,
      breakBefore,
      keepTogether,
    });

    if (formattedOptions.length === 0) return;

    const layout = determineOptionLayout(formattedOptions, paperLayout.optionLayout);

    if (layout === '4_across') {
      stream.push({
        id: `${qId}_opts_row_4`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: formattedOptions,
        gridCols: 4,
        isFirstOptionOfQuestion: true,
        isLastOptionOfQuestion: true,
        estimatedHeight: 22,
        paperLayout,
      });
    } else if (layout === '2x2_grid') {
      const row1Opts = [formattedOptions[0], formattedOptions[1]];
      const row2Opts = [formattedOptions[2], formattedOptions[3]];

      stream.push({
        id: `${qId}_opts_row_2_1`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: row1Opts,
        gridCols: 2,
        isFirstOptionOfQuestion: true,
        isLastOptionOfQuestion: false,
        estimatedHeight: estimateOptionRowHeight(row1Opts),
        paperLayout,
      });

      stream.push({
        id: `${qId}_opts_row_2_2`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: row2Opts,
        gridCols: 2,
        isFirstOptionOfQuestion: false,
        isLastOptionOfQuestion: true,
        estimatedHeight: estimateOptionRowHeight(row2Opts),
        paperLayout,
      });
    } else {
      formattedOptions.forEach((opt, oIdx) => {
        stream.push({
          id: `${qId}_opt_${opt.label}`,
          questionNumber: qNumber,
          questionIndex: idx,
          type: 'single_option',
          singleOption: opt,
          isFirstOptionOfQuestion: oIdx === 0,
          isLastOptionOfQuestion: oIdx === formattedOptions.length - 1,
          estimatedHeight: estimateSingleOptionHeight(opt),
          paperLayout,
        });
      });
    }
  });

  return stream;
}

interface TwoColumnSplit {
  splitIndex: number;
  leftHeight: number;
  rightHeight: number;
  diff: number;
}

function findBestTwoColumnSplit(
  items: StreamFlowItem[],
  colBudget: number,
  measuredHeightsMap?: Record<string, number>
): TwoColumnSplit | null {
  if (items.length === 0) {
    return { splitIndex: 0, leftHeight: 0, rightHeight: 0, diff: 0 };
  }

  const heights = items.map((it) => measuredHeightsMap?.[it.id] ?? it.estimatedHeight);
  const totalH = heights.reduce((sum, h) => sum + h + ITEM_GAP_PX, 0);

  // If total height exceeds 2 full columns, impossible to split evenly within colBudget
  if (totalH > colBudget * 2) {
    return null;
  }

  const targetH = totalH / 2;

  // Check if any question after the first explicitly requests a column break ('column')
  const explicitColBreakIndices: number[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const currentItem = items[i];
    const nextItem = items[i + 1];
    if (nextItem.questionNumber !== currentItem.questionNumber && nextItem.breakBefore === 'column') {
      explicitColBreakIndices.push(i + 1);
    }
  }
  // A 2-column page can only honor at most 1 explicit mid-page column break
  if (explicitColBreakIndices.length > 1) {
    return null;
  }

  let bestSplit: TwoColumnSplit | null = null;
  let minDiff = Infinity;
  let accumH = 0;

  for (let i = 0; i < items.length; i++) {
    accumH += heights[i] + ITEM_GAP_PX;
    const currentItem = items[i];
    const nextItem = items[i + 1];

    const isQuestionBoundary = !nextItem || nextItem.questionNumber !== currentItem.questionNumber;
    const allowsMidQuestionSplit = currentItem.paperLayout?.keepTogether !== true;
    const forcesColBreak = Boolean(nextItem && isQuestionBoundary && nextItem.breakBefore === 'column');

    if (explicitColBreakIndices.length === 1) {
      if (i + 1 === explicitColBreakIndices[0]) {
        const leftH = accumH;
        const rightH = totalH - leftH;
        if (leftH <= colBudget && rightH <= colBudget) {
          return {
            splitIndex: i + 1,
            leftHeight: leftH,
            rightHeight: rightH,
            diff: Math.abs(leftH - targetH),
          };
        }
        return null;
      }
      continue;
    }

    if (isQuestionBoundary || allowsMidQuestionSplit || forcesColBreak) {
      const leftH = accumH;
      const rightH = totalH - leftH;

      if (leftH <= colBudget && rightH <= colBudget) {
        const diff = Math.abs(leftH - targetH);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplit = {
            splitIndex: i + 1,
            leftHeight: leftH,
            rightHeight: rightH,
            diff,
          };
        }
      }
    }
  }

  return bestSplit;
}

function paginateLinearStream(
  streamItems: StreamFlowItem[],
  measuredHeightsMap?: Record<string, number>,
  layoutDensity: 'tight' | 'balanced' | 'relaxed' = 'balanced'
): PaperPageLayout[] {
  if (!streamItems || streamItems.length === 0) {
    return [
      {
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        leftColumn: [],
        rightColumn: [],
      },
    ];
  }

  const getColBudget = (pageIdx: number) => {
    if (layoutDensity === 'tight') {
      return pageIdx === 0 ? 935 : 1000;
    }
    if (layoutDensity === 'relaxed') {
      return pageIdx === 0 ? 875 : 940;
    }
    return pageIdx === 0 ? DEFAULT_PAGE_1_COL_HEIGHT_PX : DEFAULT_SUBSEQUENT_PAGE_COL_HEIGHT_PX;
  };

  const questionUnits: { questionNumber: number; items: StreamFlowItem[]; breakBefore?: 'none' | 'column' | 'page' }[] = [];
  let lockedGroup: StreamFlowItem[] = [];
  let lockedQNum: number | null = null;

  const flushLockedGroup = () => {
    if (lockedGroup.length > 0 && lockedQNum !== null) {
      questionUnits.push({
        questionNumber: lockedQNum,
        items: lockedGroup,
        breakBefore: lockedGroup[0]?.breakBefore,
      });
      lockedGroup = [];
      lockedQNum = null;
    }
  };

  for (const item of streamItems) {
    const isLockedTogether = item.paperLayout?.keepTogether === true;
    if (isLockedTogether) {
      if (lockedQNum !== null && item.questionNumber !== lockedQNum) {
        flushLockedGroup();
      }
      lockedQNum = item.questionNumber;
      lockedGroup.push(item);
    } else {
      flushLockedGroup();
      questionUnits.push({
        questionNumber: item.questionNumber,
        items: [item],
        breakBefore: item.type === 'statement' ? item.breakBefore : 'none',
      });
    }
  }
  flushLockedGroup();

  const pages: PaperPageLayout[] = [];
  let unplacedUnits = [...questionUnits];
  let pageNumber = 1;

  while (unplacedUnits.length > 0) {
    const pageIdx = pageNumber - 1;
    const colBudget = getColBudget(pageIdx);
    const maxPageCapacity = colBudget * 2;

    let currentUnitsForPage: typeof questionUnits = [];
    let runningPageItems: StreamFlowItem[] = [];
    let runningPageHeight = 0;
    let bestSplitForPage: TwoColumnSplit | null = null;
    let unitsToIncludeCount = 0;

    for (let i = 0; i < unplacedUnits.length; i++) {
      const candidateUnit = unplacedUnits[i];

      if (i > 0 && candidateUnit.breakBefore === 'page') {
        break;
      }

      const candidateUnitHeight = candidateUnit.items.reduce(
        (sum, it) => sum + (measuredHeightsMap?.[it.id] ?? it.estimatedHeight) + ITEM_GAP_PX,
        0
      );

      // Early break: if running items + this unit exceed max capacity of 2 columns, cannot fit on this page
      if (currentUnitsForPage.length > 0 && runningPageHeight + candidateUnitHeight > maxPageCapacity + 20) {
        break;
      }

      const testItems = [...runningPageItems, ...candidateUnit.items];
      const split = findBestTwoColumnSplit(testItems, colBudget, measuredHeightsMap);

      if (split !== null) {
        currentUnitsForPage.push(candidateUnit);
        runningPageItems = testItems;
        runningPageHeight += candidateUnitHeight;
        bestSplitForPage = split;
        unitsToIncludeCount = i + 1;
      } else {
        if (currentUnitsForPage.length === 0) {
          currentUnitsForPage = [candidateUnit];
          const fallbackItems = candidateUnit.items;
          bestSplitForPage = {
            splitIndex: Math.max(1, Math.floor(fallbackItems.length / 2)),
            leftHeight: colBudget,
            rightHeight: colBudget,
            diff: 0,
          };
          unitsToIncludeCount = 1;
        }
        break;
      }
    }

    const pageItems = currentUnitsForPage.flatMap((u) => u.items);
    const splitIndex = bestSplitForPage
      ? bestSplitForPage.splitIndex
      : Math.max(1, Math.floor(pageItems.length / 2));

    const leftColumn = pageItems.slice(0, splitIndex);
    const rightColumn = pageItems.slice(splitIndex);

    pages.push({
      pageNumber,
      totalPages: 1,
      isFirstPage: pageNumber === 1,
      leftColumn,
      rightColumn,
    });

    unplacedUnits = unplacedUnits.slice(unitsToIncludeCount);
    pageNumber++;
  }

  const totalPages = pages.length;
  pages.forEach((p) => {
    p.totalPages = totalPages;
  });

  return pages;
}

const RenderStreamItem: React.FC<{
  item: StreamFlowItem;
  isEditableLayout?: boolean;
  showBadges?: boolean;
  onUpdateQuestionLayout?: (qIndex: number, newLayout: QuestionPaperLayout) => void;
}> = React.memo(({ item, isEditableLayout, showBadges = true, onUpdateQuestionLayout }) => {
  if (item.type === 'statement') {
    return (
      <div 
        data-stream-id={item.id} 
        className="pt-1.5 first:pt-0 text-black text-[10.5pt] leading-[1.32] relative group"
      >
        {isEditableLayout && showBadges && onUpdateQuestionLayout && typeof item.questionIndex === 'number' && (
          <div className="print:hidden pointer-events-auto absolute -top-3.5 right-0 z-30 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2 py-1 rounded-full shadow-md border border-slate-200/80 select-none transition-colors max-w-full overflow-x-auto">
            <span className="text-slate-600 font-extrabold px-1 text-[11px] uppercase tracking-wider shrink-0 whitespace-nowrap">
              Q{item.questionNumber}:
            </span>

            {/* Grid Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextGridMap: Record<string, 'auto' | '4_across' | '2x2_grid' | 'stacked'> = {
                  auto: '4_across',
                  '4_across': '2x2_grid',
                  '2x2_grid': 'stacked',
                  stacked: 'auto',
                };
                const currentGrid = item.paperLayout?.optionLayout || 'auto';
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  optionLayout: nextGridMap[currentGrid] || 'auto',
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                item.paperLayout?.optionLayout && item.paperLayout.optionLayout !== 'auto'
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
              }`}
              title="Toggle option layout grid (Auto -> 4 Across -> 2x2 Grid -> Stacked)"
            >
              <LayoutGrid className={`w-3 h-3 shrink-0 ${item.paperLayout?.optionLayout && item.paperLayout.optionLayout !== 'auto' ? 'text-slate-900' : 'text-slate-600'}`} />
              <span className="leading-none whitespace-nowrap">
                {item.paperLayout?.optionLayout === '4_across'
                  ? '4 Across'
                  : item.paperLayout?.optionLayout === '2x2_grid'
                  ? '2x2 Grid'
                  : item.paperLayout?.optionLayout === 'stacked'
                  ? 'Stacked'
                  : 'Auto Grid'}
              </span>
            </button>

            {/* Break Before Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextBreakMap: Record<string, 'none' | 'column' | 'page'> = {
                  none: 'column',
                  column: 'page',
                  page: 'none',
                };
                const currentBreak = item.paperLayout?.breakBefore || 'none';
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  breakBefore: nextBreakMap[currentBreak] || 'none',
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                item.paperLayout?.breakBefore && item.paperLayout.breakBefore !== 'none'
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
              }`}
              title="Force break before this question (None -> Push Col -> Push Page)"
            >
              <MoveRight className={`w-3 h-3 shrink-0 ${item.paperLayout?.breakBefore && item.paperLayout.breakBefore !== 'none' ? 'text-slate-900' : 'text-slate-600'}`} />
              <span className="leading-none whitespace-nowrap">
                {item.paperLayout?.breakBefore === 'column'
                  ? 'Push Col'
                  : item.paperLayout?.breakBefore === 'page'
                  ? 'Push Page'
                  : 'No Break'}
              </span>
            </button>

            {/* Keep Together / Split Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const currentKeep = item.paperLayout?.keepTogether ?? true;
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  keepTogether: !currentKeep,
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                (item.paperLayout?.keepTogether ?? true)
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-amber-100/90 text-amber-800 font-bold border border-amber-300 hover:bg-amber-200/80'
              }`}
              title="Lock question statement and options together in one column (No Break / Keep Together)"
            >
              {(item.paperLayout?.keepTogether ?? true) ? (
                <Lock className="w-3 h-3 shrink-0 text-slate-900" />
              ) : (
                <Unlock className="w-3 h-3 shrink-0 text-amber-700" />
              )}
              <span className="leading-none whitespace-nowrap">
                {(item.paperLayout?.keepTogether ?? true) ? 'No Break' : 'Allow Split'}
              </span>
            </button>

            {/* Diagram Resize Button in Paper Toolbar */}
            {(item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls.some(Boolean))) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextSizes: (number | undefined)[] = [undefined, 140, 200, 280];
                  const currentSize = item.paperLayout?.imageWidth;
                  const currentIdx = nextSizes.indexOf(currentSize);
                  const nextSize = nextSizes[(currentIdx + 1) % nextSizes.length];

                  const numExtras = Array.isArray(item.imageUrls) ? item.imageUrls.filter(Boolean).length : 0;
                  const nextWidths = numExtras > 0 ? Array(numExtras).fill(nextSize) : undefined;

                  onUpdateQuestionLayout(item.questionIndex!, {
                    ...item.paperLayout,
                    imageWidth: nextSize,
                    imageWidths: nextWidths,
                  });
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                  item.paperLayout?.imageWidth
                    ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                    : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                }`}
                title="Toggle diagram size in question paper (Auto -> 140px -> 200px -> 280px)"
              >
                <ImageIcon className="w-3 h-3 shrink-0 text-slate-700" />
                <span className="leading-none whitespace-nowrap">
                  {item.paperLayout?.imageWidth ? `${item.paperLayout.imageWidth}px` : 'Img: Auto'}
                </span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-start gap-1.5">
          <span className="font-semibold text-[10.5pt] shrink-0 select-none">
            {item.questionNumber}.
          </span>
          <div className="flex-1 min-w-0 font-normal text-black text-[10.5pt] tracking-normal">
            <MathRenderer 
              text={item.statementText || ''} 
              className="text-black font-normal text-[10.5pt] leading-[1.32]" 
            />
          </div>
        </div>

        {(item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls.some(Boolean))) && (
          <div className="relative group/diagram my-1 flex flex-col items-center justify-center w-full [mix-blend-mode:multiply] bg-transparent">
            <QuestionDiagramViewer
              imageUrl={item.imageUrl}
              imageUrls={item.imageUrls}
              imageWidths={item.paperLayout?.imageWidths || item.imageWidths}
              alt={`Diagram Q${item.questionNumber}`}
              width={item.paperLayout?.imageWidth}
              maxHeightClass="max-h-28"
              allowZoom={true}
              className="!my-0 print:!my-0 [mix-blend-mode:multiply] bg-transparent"
              showSizeControls={Boolean(isEditableLayout && showBadges && onUpdateQuestionLayout && typeof item.questionIndex === 'number')}
              onUpdateWidth={(photoIndex, newWidth) => {
                if (!onUpdateQuestionLayout || typeof item.questionIndex !== 'number') return;
                if (photoIndex === 0) {
                  onUpdateQuestionLayout(item.questionIndex, {
                    ...item.paperLayout,
                    imageWidth: newWidth,
                  });
                } else {
                  const extraIdx = photoIndex - 1;
                  const currentWidths = Array.isArray(item.paperLayout?.imageWidths)
                    ? [...item.paperLayout.imageWidths]
                    : (Array.isArray(item.imageWidths) ? [...item.imageWidths] : []);
                  while (currentWidths.length <= extraIdx) {
                    currentWidths.push(undefined);
                  }
                  currentWidths[extraIdx] = newWidth;
                  onUpdateQuestionLayout(item.questionIndex, {
                    ...item.paperLayout,
                    imageWidths: currentWidths,
                  });
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'options_row') {
    const opts = item.optionsRow || [];
    const colsClass = item.gridCols === 4 ? 'grid-cols-4' : 'grid-cols-2';
    const topPaddingClass = item.isFirstOptionOfQuestion ? 'pt-0.5' : 'pt-0';
    const bottomPaddingClass = item.isLastOptionOfQuestion ? 'pb-1' : 'pb-0.5';

    return (
      <div data-stream-id={item.id} className={`pl-4 ${topPaddingClass} ${bottomPaddingClass} text-[10pt] leading-[1.35]`}>
        <div className={`grid ${colsClass} gap-x-3 gap-y-1 text-[10pt] leading-[1.35] tracking-normal`}>
          {opts.map((opt) => (
            <div key={opt.originalIndex} className="flex flex-col gap-1 min-w-0 overflow-visible select-none">
              <div className="flex items-start gap-1 min-w-0 overflow-visible select-none">
                <span className="font-semibold text-[10pt] shrink-0 select-none pt-[1px]">({opt.label})</span>
                <span className="text-black inline-block break-words overflow-visible">
                  <MathRenderer text={opt.text} className="inline-block text-[10pt] break-words" />
                </span>
              </div>
              {opt.imageUrl && normalizeDiagramUrl(opt.imageUrl) ? (
                <div className="pl-4 pt-0.5">
                  <img
                    src={normalizeDiagramUrl(opt.imageUrl)}
                    alt={`Option (${opt.label}) diagram`}
                    className="max-h-[60px] max-w-full object-contain rounded [mix-blend-mode:multiply] bg-transparent"
                    style={{
                      mixBlendMode: 'multiply',
                      backgroundColor: 'transparent',
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (item.type === 'single_option' && item.singleOption) {
    const opt = item.singleOption;
    const topPaddingClass = item.isFirstOptionOfQuestion ? 'pt-0.5' : 'pt-0';
    const bottomPaddingClass = item.isLastOptionOfQuestion ? 'pb-1' : 'pb-0.5';

    return (
      <div data-stream-id={item.id} className={`pl-4 ${topPaddingClass} ${bottomPaddingClass} text-[10pt] leading-[1.35] tracking-normal`}>
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="font-semibold text-[10pt] shrink-0 select-none pt-[1px]">({opt.label})</span>
          <div className="flex-1 min-w-0">
            <span className="text-black inline-block leading-[1.35]">
              <MathRenderer text={opt.text} className="inline-block text-[10pt] leading-[1.35]" />
            </span>
            {opt.imageUrl && normalizeDiagramUrl(opt.imageUrl) ? (
              <div className="pt-1">
                <img
                  src={normalizeDiagramUrl(opt.imageUrl)}
                  alt={`Option (${opt.label}) diagram`}
                  className="max-h-[60px] max-w-full object-contain rounded [mix-blend-mode:multiply] bg-transparent"
                  style={{
                    mixBlendMode: 'multiply',
                    backgroundColor: 'transparent',
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
});

// Module-level cache + sessionStorage persistence to keep measured DOM heights instant and consistent across navigations
const SESSION_CACHE_PREFIX = 'elevate_omr_heights_v3_';
const GLOBAL_MEASURED_HEIGHTS_CACHE = new Map<string, Record<string, number>>();

function getCachedHeights(testKey: string): Record<string, number> | null {
  if (GLOBAL_MEASURED_HEIGHTS_CACHE.has(testKey)) {
    return GLOBAL_MEASURED_HEIGHTS_CACHE.get(testKey)!;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(SESSION_CACHE_PREFIX + testKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          GLOBAL_MEASURED_HEIGHTS_CACHE.set(testKey, parsed);
          return parsed;
        }
      }
    } catch {}
  }
  return null;
}

function setCachedHeights(testKey: string, heights: Record<string, number>) {
  GLOBAL_MEASURED_HEIGHTS_CACHE.set(testKey, heights);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(SESSION_CACHE_PREFIX + testKey, JSON.stringify(heights));
    } catch {}
  }
}

export const OmrQuestionPaper: React.FC<OmrQuestionPaperProps> = ({
  test,
  className = '',
  hideHeaderContainer = false,
  isEditableLayout = false,
  onUpdateQuestionLayout,
  onResetAllLayouts,
  layoutDensity: propLayoutDensity,
  setLayoutDensity: propSetLayoutDensity,
  showBadges: propShowBadges,
  setShowBadges: propSetShowBadges,
  hideInlineDock = false,
  embedOmrSheet = false,
  continuousPages = false,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [localShowBadges, setLocalShowBadges] = useState<boolean>(true);
  const [localLayoutDensity, setLocalLayoutDensity] = useState<'tight' | 'balanced' | 'relaxed'>('balanced');
  const [isDockExpanded, setIsDockExpanded] = useState<boolean>(false);

  const showBadges = propShowBadges !== undefined ? propShowBadges : localShowBadges;
  const setShowBadges = propSetShowBadges !== undefined ? propSetShowBadges : setLocalShowBadges;
  const layoutDensity = propLayoutDensity !== undefined ? propLayoutDensity : localLayoutDensity;
  const setLayoutDensity = propSetLayoutDensity !== undefined ? propSetLayoutDensity : setLocalLayoutDensity;

  const cleanTitle = (test.title || 'Question_Paper').replace(/[^a-zA-Z0-9_-]/g, '_');
  const totalQuestions = test.questions?.length || 0;
  const timeAllowed = test.timeLimitMinutes > 0 ? test.timeLimitMinutes : (test.time > 0 ? test.time : (totalQuestions || 60));
  const maxMarks = test.questions?.length ? test.questions.reduce((acc, q) => acc + (q.points || 1), 0) : (test.totalMarks || totalQuestions);

  const MM_TO_PX = 96 / 25.4;
  const pageWPx = 210 * MM_TO_PX;
  const pageHPx = 297 * MM_TO_PX;

  const containerRef = useRef<HTMLDivElement>(null);
  const [userZoom, setUserZoom] = useState<number>(1.0);
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const padding = window.innerWidth < 640 ? 24 : 32;
      const availableW = Math.max(200, Math.min(1400, window.innerWidth - padding));
      const targetW = 210 * (96 / 25.4);
      if (availableW < targetW) {
        return availableW / targetW;
      }
    }
    return 1;
  });

  const effectiveScale = scale * userZoom;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measureAndSetScale = () => {
      const availableWidth = el.clientWidth;
      if (availableWidth > 50) {
        const targetW = pageWPx;
        const nextScale = availableWidth < targetW ? availableWidth / targetW : 1;
        setScale((prev) => (Math.abs(prev - nextScale) > 0.002 ? nextScale : prev));
      }
    };

    measureAndSetScale();

    const ro = new ResizeObserver(() => {
      measureAndSetScale();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [pageWPx]);

  const streamItems = useMemo(() => {
    return buildLinearStreamItems(test.questions || []);
  }, [test.questions]);

  const testIdKey = useMemo(() => {
    const qCount = test.questions?.length || 0;
    const tId = test.id || test.title || 'test';
    return `${tId}_${qCount}_${layoutDensity}_${showBadges ? 'bdg' : 'nobdg'}`;
  }, [test.id, test.title, test.questions?.length, layoutDensity, showBadges]);

  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>(() => {
    if (testIdKey) {
      const cached = getCachedHeights(testIdKey);
      if (cached) return { ...cached };
    }
    return {};
  });

  const heightsRef = useRef(measuredHeights);
  useEffect(() => {
    heightsRef.current = measuredHeights;
  }, [measuredHeights]);

  useEffect(() => {
    let isCancelled = false;
    let passesCompleted = 0;
    const maxPasses = 2;

    const measureDomHeights = (force = false) => {
      if (isCancelled || (!force && passesCompleted >= maxPasses)) return false;
      const root = document.getElementById('question-paper-printable-root');
      if (!root) return false;

      const elements = root.querySelectorAll<HTMLElement>('[data-stream-id]');
      if (elements.length === 0) return false;

      let hasSignificantDiff = false;
      let totalDiffPx = 0;
      const nextHeights: Record<string, number> = { ...heightsRef.current };

      elements.forEach((el) => {
        const id = el.getAttribute('data-stream-id');
        if (id) {
          const h = el.offsetHeight;
          if (h > 0) {
            const oldH = heightsRef.current[id];
            if (oldH === undefined) {
              nextHeights[id] = h;
              hasSignificantDiff = true;
              totalDiffPx += h;
            } else if (Math.abs(oldH - h) >= 4) {
              nextHeights[id] = h;
              hasSignificantDiff = true;
              totalDiffPx += Math.abs(oldH - h);
            }
          }
        }
      });

      // Avoid triggering re-render for negligible micro-differences (< 8px total across all items)
      if (hasSignificantDiff && !isCancelled && totalDiffPx >= 8) {
        passesCompleted++;
        heightsRef.current = nextHeights;
        if (testIdKey) {
          setCachedHeights(testIdKey, nextHeights);
        }
        setMeasuredHeights(nextHeights);
      }
      return hasSignificantDiff;
    };

    const hasCached = Boolean(testIdKey && getCachedHeights(testIdKey));
    const timers: any[] = [];
    let rafId: number | null = null;

    if (!hasCached) {
      // Pass 1: measure once DOM is mounted
      rafId = requestAnimationFrame(() => {
        if (!isCancelled) {
          measureDomHeights();
        }
      });

      // Pass 2: secondary pass after math rendering settles
      timers.push(
        setTimeout(() => {
          if (!isCancelled) {
            measureDomHeights();
          }
        }, 300)
      );
    } else {
      // If already cached from sessionStorage, initial layout is already 100% accurate.
      // Single deferred check (600ms) only to ensure consistency.
      timers.push(
        setTimeout(() => {
          if (!isCancelled) {
            measureDomHeights();
          }
        }, 600)
      );
    }

    // Font ready hook (Tinos & KaTeX finished) - force re-measure so device fallback fonts never lock layout
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready
        .then(() => {
          if (!isCancelled) {
            measureDomHeights(true);
          }
        })
        .catch(() => {});
    }

    return () => {
      isCancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      timers.forEach((t) => clearTimeout(t));
    };
  }, [streamItems, layoutDensity, testIdKey]);

  const activePageLayouts = useMemo(() => {
    return paginateLinearStream(streamItems, measuredHeights, layoutDensity);
  }, [streamItems, measuredHeights, layoutDensity]);

  const getPagePreviewHeightPx = (page: PaperPageLayout) => {
    const leftColH = page.leftColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const rightColH = page.rightColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const maxColH = Math.max(leftColH, rightColH);

    const headerOverheadPx = page.isFirstPage ? 104 : 40;
    const pagePaddingOverheadPx = 61; // 8mm top + 8mm bottom
    const footerOverheadPx = 6;

    const calculatedContentHeight = Math.ceil(
      headerOverheadPx + maxColH + pagePaddingOverheadPx + footerOverheadPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX
    );

    const baseMinHeight = Math.ceil(pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX);
    return Math.max(baseMinHeight, calculatedContentHeight);
  };

  const omrPlacement = useMemo(() => {
    if (!embedOmrSheet || activePageLayouts.length === 0) {
      return { enabled: false, fitsOnLastPage: false };
    }
    const totalQs = Math.max(1, test.questions?.length || test.questionCount || 50);
    const compactBp = generateOmrSheetBlueprint(totalQs, undefined, 'compact');
    const lastPage = activePageLayouts[activePageLayouts.length - 1];
    const leftColH = lastPage.leftColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const rightColH = lastPage.rightColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const maxColH = Math.max(leftColH, rightColH);
    const headerOverheadPx = lastPage.isFirstPage ? 150 : 55;
    const pagePaddingOverheadPx = 60;
    const footerOverheadPx = 40;
    const usedHeightPx = headerOverheadPx + maxColH + pagePaddingOverheadPx + footerOverheadPx;
    const remainingHeightMm = (pageHPx - usedHeightPx) / (96 / 25.4);
    return {
      enabled: true,
      fitsOnLastPage: remainingHeightMm >= compactBp.layout.pageHeightMm + 4,
    };
  }, [embedOmrSheet, activePageLayouts, measuredHeights, test.questions?.length, test.questionCount, pageHPx]);

  const handlePrint = async () => {
    try {
      setDownloadError(null);
      setIsPrinting(true);

      await new Promise((resolve) => setTimeout(resolve, 60));

      await triggerSystemPrint(
        'question-paper-printable-root',
        `${cleanTitle}_Question_Paper_A4`,
        210,
        297
      );
      setDownloadSuccess('Print dialog opened. Select physical printer or "Save as PDF".');
      setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err: any) {
      console.error('System print error:', err);
      setDownloadError(err?.message || 'Failed to open printer interface.');
      setTimeout(() => setDownloadError(null), 5000);
    } finally {
      setTimeout(() => setIsPrinting(false), 1200);
    }
  };

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      {!hideHeaderContainer && (
        <div className="w-full max-w-[1400px] mx-auto mb-2.5 bg-white dark:bg-[#21222e] rounded-3xl p-3.5 sm:p-5 shadow-none border-0 ring-0 print:hidden space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/60">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold tracking-widest text-[#0b57d0] dark:text-[#a8c7fa] uppercase font-mono block">
                Question Paper
              </span>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                {test.title || 'Question Paper'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate">
                Portion: {test.topic || 'Mathematics Assessment'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
              <span className="px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold">
                {maxMarks} Marks
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                {timeAllowed} Mins
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300">
                {totalQuestions} Questions
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300">
                {activePageLayouts.length} {activePageLayouts.length === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 flex-wrap pt-1">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#222634] p-1 rounded-full text-xs font-semibold border-0 ring-0 shadow-none">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-bold px-2.5 shrink-0 select-none">
                Page Usage:
              </span>
              <button
                type="button"
                onClick={() => setLayoutDensity('tight')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'tight'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Tight Fit: Maximizes space utilization per column so questions fit comfortably in Column 1"
              >
                Max Fit
              </button>
              <button
                type="button"
                onClick={() => setLayoutDensity('balanced')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'balanced'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Balanced Fit: Calibrated standard A4 layout"
              >
                Balanced
              </button>
              <button
                type="button"
                onClick={() => setLayoutDensity('relaxed')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'relaxed'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Relaxed Fit: Adds extra vertical padding"
              >
                Spacious
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] active:scale-95 transition-all shadow-none border-0 ring-0 cursor-pointer disabled:opacity-50"
                title="Open system print dialog"
              >
                {isPrinting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}
                <span>{isPrinting ? 'Printing...' : 'Print'}</span>
              </button>
            </div>
          </div>

          {downloadSuccess && (
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 border-0 ring-0 shadow-none">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{downloadSuccess}</span>
            </div>
          )}

          {downloadError && (
            <div className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 border-0 ring-0 shadow-none">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>
      )}

      <div 
        ref={containerRef}
        className={`w-full max-w-[1400px] mx-auto relative flex flex-col items-center justify-start ${continuousPages ? 'py-0' : 'pb-12 pt-2'}`}
      >
        {isEditableLayout && !hideInlineDock && (
          <motion.div 
            drag
            dragMomentum={false}
            className="print:hidden absolute right-3 top-[32px] sm:top-[38px] z-[150] flex flex-col items-end select-none cursor-grab active:cursor-grabbing"
          >
            <div className="bg-white/95 dark:bg-[#21222e]/95 backdrop-blur-md p-1 rounded-full shadow-none flex flex-col gap-1.5 items-center border border-slate-200/80 dark:border-zinc-800/60 ring-0">
              <button
                type="button"
                onClick={() => setUserZoom((prev) => Math.max(0.6, Number((prev - 0.2).toFixed(1))))}
                disabled={userZoom <= 0.6}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
                title="Zoom Out Question Paper (-20%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setUserZoom(1.0)}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] transition-colors cursor-pointer flex items-center justify-center"
                title="Reset Zoom to 100% Fit Width"
              >
                {Math.round(userZoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setUserZoom((prev) => Math.min(2.5, Number((prev + 0.2).toFixed(1))))}
                disabled={userZoom >= 2.5}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
                title="Zoom In Question Paper (+20%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-5 h-px bg-slate-200 dark:bg-zinc-700 my-0.5" />

              <button
                type="button"
                onClick={() => setIsDockExpanded(!isDockExpanded)}
                className={`w-9 h-9 rounded-full transition-all cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                  isDockExpanded
                    ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200'
                }`}
                title={isDockExpanded ? "Collapse layout options" : "Expand layout options"}
              >
                {isDockExpanded ? (
                  <ChevronUp className="w-4 h-4 animate-bounce" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {isDockExpanded && (
                <div className="flex flex-col gap-1.5 items-center mt-0.5 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMap: Record<string, 'tight' | 'balanced' | 'relaxed'> = {
                        balanced: 'tight',
                        tight: 'relaxed',
                        relaxed: 'balanced',
                      };
                      setLayoutDensity(nextMap[layoutDensity] || 'balanced');
                    }}
                    className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center text-[9px] font-extrabold border-0 ring-0 outline-none shadow-none ${
                      layoutDensity === 'tight'
                        ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                        : layoutDensity === 'relaxed'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                    }`}
                    title={`Page Density: ${layoutDensity.toUpperCase()} (Click to toggle Tight -> Relaxed -> Balanced)`}
                  >
                    {layoutDensity === 'tight' ? 'MAX' : layoutDensity === 'relaxed' ? 'PAD' : 'BAL'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBadges(!showBadges)}
                    className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                      showBadges
                        ? 'bg-slate-200 dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 font-bold'
                        : 'bg-slate-100 dark:bg-[#222634] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                    }`}
                    title={showBadges ? 'Hide Edit Badges (Clean Preview)' : 'Show Edit Badges'}
                  >
                    {showBadges ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />}
                  </button>

                  {onResetAllLayouts && (
                    <button
                      type="button"
                      onClick={onResetAllLayouts}
                      className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                      title="Reset all question paper layout overrides to Auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300 group-hover:-rotate-45 transition-transform" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={isPrinting}
                    className="w-8.5 h-8.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                    title="Print A4 / Save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5 text-white dark:text-[#041e49] group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div id="question-paper-printable-root" className={`w-full flex flex-col ${continuousPages ? 'gap-0 py-0' : 'gap-8 py-2'} print:gap-0 items-center mx-auto px-0 touch-auto [webkit-overflow-scrolling:touch]`}>
          {activePageLayouts.map((page) => {
            const isLastPage = page.pageNumber === page.totalPages;
            const currentPageHPx = getPagePreviewHeightPx(page);

            return (
              <div
                key={`page_wrap_${page.pageNumber}`}
                data-page-wrapper="true"
                className="relative mx-auto shrink-0 print:p-0 print:m-0 print:w-[210mm] print:h-[297mm] print:pb-0 a4-page-wrapper-virtualized"
                style={{
                  width: `${pageWPx * effectiveScale}px`,
                  maxWidth: '100%',
                  height: `${currentPageHPx * effectiveScale}px`,
                  minHeight: `${(pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX) * effectiveScale}px`,
                }}
              >
                <div
                  key={`page_${page.pageNumber}`}
                  className={`a4-page-item bg-white text-black ${continuousPages ? 'shadow-none rounded-none ring-0' : 'shadow-2xl rounded-xs ring-1 ring-slate-900/10'} print:shadow-none select-text box-border flex flex-col justify-start print:ring-0 print:border-none print:transform-none print:relative print:left-auto print:top-auto print:w-[210mm] print:h-[297mm] print:min-h-[297mm] print:max-h-[297mm] touch-auto overflow-hidden relative`}
                  style={{
                    width: '210mm',
                    minWidth: '210mm',
                    maxWidth: '210mm',
                    height: `${currentPageHPx}px`,
                    minHeight: `${pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX}px`,
                    padding: '8mm 12mm 8mm 12mm',
                    fontFamily: "'Tinos', 'Times New Roman', Times, 'Liberation Serif', serif",
                    WebkitTextSizeAdjust: '100%',
                    textSizeAdjust: '100%',
                    boxSizing: 'border-box',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    transform: `translateX(-50%) scale(${effectiveScale})`,
                    transformOrigin: 'top center',
                    overflow: 'hidden',
                  }}
                >
                  <div className="shrink-0 mb-2 relative z-1">
                    {page.isFirstPage ? (
                      <div className="border-b-2 border-black pb-1.5 relative">
                        {/* Page indicator positioned in top-right corner without changing header flow or page structure */}
                        <div className="absolute top-0.5 right-0 text-[8.5pt] font-extrabold text-black uppercase tracking-wide select-none leading-normal">
                          PAGE {page.pageNumber} OF {page.totalPages}
                        </div>

                        <h1 className="text-center font-semibold text-[14pt] tracking-wide uppercase text-black leading-tight mb-1 px-20">
                          {test.title || 'MIX ASSESSMENT TEST'}
                        </h1>

                        <div className="flex justify-between items-center text-[8.5pt] font-bold border-y border-black py-0.5 px-1 mb-1">
                          <span>TIME ALLOWED: {timeAllowed} MINUTES</span>
                          <span>TOTAL QUESTIONS: {totalQuestions}</span>
                          <span>MAXIMUM MARKS: {maxMarks}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[8.5pt] font-semibold">
                          <div className="flex items-baseline gap-1.5">
                            <span className="shrink-0">Candidate Name:</span>
                            <div className="flex-1 border-b border-black border-dotted h-3.5" />
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="shrink-0">Roll No:</span>
                            <div className="flex-1 border-b border-black border-dotted h-3.5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pt-0.5 pb-1 border-b-2 border-black text-[8.5pt] font-bold text-black uppercase tracking-wide leading-normal">
                        <span className="truncate max-w-[70%]">{test.title || 'MATHEMATICS EXAMINATION'}</span>
                        <span className="shrink-0 font-extrabold">PAGE {page.pageNumber} OF {page.totalPages}</span>
                      </div>
                    )}
                  </div>

                  <div className={`relative mb-2 flex flex-col justify-start z-1 ${isLastPage ? 'flex-none' : 'flex-1'}`}>
                    <div className={`grid grid-cols-2 gap-x-5 text-black relative ${isLastPage ? '' : 'flex-1'}`}>
                      <div className="flex flex-col justify-start pr-2">
                        {page.leftColumn.map((item) => (
                          <RenderStreamItem
                            key={item.id}
                            item={item}
                            isEditableLayout={isEditableLayout}
                            showBadges={showBadges}
                            onUpdateQuestionLayout={onUpdateQuestionLayout}
                          />
                        ))}
                      </div>

                      {page.rightColumn.length > 0 && (
                        <div className="absolute top-0 bottom-0 left-1/2 w-[0.75pt] bg-black -translate-x-1/2 pointer-events-none" />
                      )}

                      <div className="flex flex-col justify-start pl-2">
                        {page.rightColumn.map((item) => (
                          <RenderStreamItem
                            key={item.id}
                            item={item}
                            isEditableLayout={isEditableLayout}
                            showBadges={showBadges}
                            onUpdateQuestionLayout={onUpdateQuestionLayout}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {isLastPage ? (
                    <div className="shrink-0 border-t-[1.5pt] border-black mt-3 mb-1 relative z-1" />
                  ) : (
                    <div className="shrink-0 border-t-[1.5pt] border-black mt-auto relative z-1" />
                  )}

                  {omrPlacement.enabled && isLastPage && omrPlacement.fitsOnLastPage && (
                    <div className="shrink-0 -mx-[12mm] mt-1 relative z-30">
                      <OmrSheetGenerator
                        test={test}
                        hideHeaderContainer={true}
                        embedded={true}
                        embeddedFormat="compact"
                      />
                    </div>
                  )}

                  {/* Authentic Elevate Central Transparent App Logo Watermark on Question Pages (scoped above OMR Sheet when inline OMR fits) */}
                  {(() => {
                    const hasInlineOmr = Boolean(omrPlacement.enabled && isLastPage && omrPlacement.fitsOnLastPage);
                    const omrReserveMm = hasInlineOmr && omrPlacement.blueprint ? Math.min(165, Math.ceil(omrPlacement.blueprint.layout.pageHeightMm + 10)) : 0;
                    return (
                  <div
                    className="elevate-question-watermark absolute inset-0 flex items-center justify-center pointer-events-none select-none z-25 overflow-hidden"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: hasInlineOmr ? '14mm' : 0,
                      left: 0,
                      right: 0,
                      bottom: hasInlineOmr ? `${omrReserveMm}mm` : 0,
                      width: '100%',
                      height: hasInlineOmr ? `calc(100% - ${omrReserveMm + 14}mm)` : '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 25,
                    }}
                  >
                    {APP_BRAND.isWhiteLabel ? (
                      <img
                        src={APP_BRAND.logoUrl}
                        alt={APP_BRAND.name}
                        className="elevate-watermark-img pointer-events-none select-none"
                        style={{
                          width: hasInlineOmr ? '82mm' : '126mm',
                          height: hasInlineOmr ? '82mm' : '126mm',
                          maxWidth: hasInlineOmr ? '310px' : '490px',
                          maxHeight: hasInlineOmr ? '310px' : '490px',
                          objectFit: 'contain',
                          opacity: 0.12,
                          pointerEvents: 'none',
                          userSelect: 'none',
                          printColorAdjust: 'exact',
                          WebkitPrintColorAdjust: 'exact',
                        }}
                      />
                    ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 1024 1024"
                      className="elevate-watermark-img pointer-events-none select-none"
                      aria-hidden="true"
                      style={{
                        width: hasInlineOmr ? '82mm' : '126mm',
                        height: hasInlineOmr ? '82mm' : '126mm',
                        maxWidth: hasInlineOmr ? '310px' : '490px',
                        maxHeight: hasInlineOmr ? '310px' : '490px',
                        objectFit: 'contain',
                        opacity: 0.17,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        printColorAdjust: 'exact',
                        WebkitPrintColorAdjust: 'exact',
                      }}
                    >
                      <circle cx="512" cy="512" r="510" fill="#c3defd" />
                      <path
                        d="M 688 274 L 688 197.5 L 338 197.5 L 488 407 L 338 616.5 L 688 616.5 L 688 540"
                        fill="none"
                        stroke="#0b57d0"
                        strokeWidth="73"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M 341.5 699.0 C 344.5 698.8, 347.0 698.7, 350.0 698.5 C 351.4 699.2, 352.6 699.8, 354.0 700.5 C 355.6 702.8, 356.9 704.7, 358.5 707.0 C 358.5 742.7, 358.5 773.3, 358.5 809.0 C 357.8 810.4, 357.2 811.6, 356.5 813.0 C 354.2 814.6, 352.3 815.9, 350.0 817.5 C 347.2 817.5, 344.8 817.5, 342.0 817.5 C 340.6 816.8, 339.4 816.2, 338.0 815.5 C 336.4 813.6, 335.1 811.9, 333.5 810.0 C 333.5 774.3, 333.5 743.7, 333.5 708.0 C 334.6 705.9, 335.4 704.1, 336.5 702.0 C 338.1 701.1, 339.4 700.4, 341.0 699.5 L 341.5 699.0 Z M 233.5 703.0 C 259.2 702.8, 281.3 702.7, 307.0 702.5 C 308.9 704.1, 310.6 705.4, 312.5 707.0 C 312.5 711.2, 312.5 714.8, 312.5 719.0 C 311.3 720.6, 310.2 721.9, 309.0 723.5 C 307.6 724.2, 306.4 724.8, 305.0 725.5 C 287.1 725.5, 271.9 725.5, 254.0 725.5 L 252.5 727.0 C 252.7 734.2, 252.8 740.3, 253.0 747.5 C 269.1 747.9, 282.9 748.1, 299.0 748.5 C 300.9 749.7, 302.6 750.8, 304.5 752.0 C 305.2 753.8, 305.8 755.3, 306.5 757.0 C 306.1 759.8, 305.9 762.2, 305.5 765.0 C 302.5 766.9, 300.0 768.6, 297.0 770.5 C 281.9 770.5, 269.1 770.5, 254.0 770.5 L 252.5 772.0 C 252.5 779.4, 252.5 785.6, 252.5 793.0 C 253.7 793.9, 254.8 794.6, 256.0 795.5 C 273.1 795.1, 287.9 794.9, 305.0 794.5 C 306.8 795.2, 308.3 795.8, 310.0 796.5 C 311.2 798.1, 312.3 799.4, 313.5 801.0 C 313.9 803.8, 314.1 806.2, 314.5 809.0 C 313.8 810.4, 313.2 811.6, 312.5 813.0 C 310.9 814.2, 309.6 815.3, 308.0 816.5 C 281.8 816.5, 259.3 816.5, 233.0 816.5 C 231.1 814.9, 229.4 813.6, 227.5 812.0 C 227.2 776.6, 226.8 746.4, 226.5 711.0 L 227.5 708.0 C 229.4 706.4, 231.1 705.1, 233.0 703.5 L 233.5 703.0 Z M 669.5 707.0 C 671.1 706.8, 672.4 706.7, 674.0 706.5 C 677.0 708.4, 679.5 710.1, 682.5 712.0 C 683.4 718.5, 684.1 724.0, 685.0 730.5 C 690.3 730.5, 694.8 730.5, 700.0 730.5 C 702.6 733.1, 704.9 735.4, 707.5 738.0 C 707.5 740.1, 707.5 741.9, 707.5 744.0 C 706.3 745.9, 705.2 747.6, 704.0 749.5 C 699.1 750.2, 694.9 750.8, 690.0 751.5 C 688.6 751.1, 687.4 750.9, 686.0 750.5 L 684.5 752.0 C 684.1 755.9, 683.9 759.1, 683.5 763.0 L 684.5 793.0 C 686.8 794.6, 688.7 795.9, 691.0 797.5 C 694.5 797.1, 697.5 796.9, 701.0 796.5 C 702.4 797.2, 703.6 797.8, 705.0 798.5 C 705.9 800.1, 706.6 801.4, 707.5 803.0 C 707.5 805.1, 707.5 806.9, 707.5 809.0 C 706.8 810.4, 706.2 811.6, 705.5 813.0 C 701.1 814.9, 697.4 816.6, 693.0 818.5 C 688.8 818.5, 685.2 818.5, 681.0 818.5 C 676.5 816.8, 672.5 815.3, 668.0 813.5 C 665.7 810.2, 663.8 807.3, 661.5 804.0 C 660.8 801.5, 660.2 799.5, 659.5 797.0 L 659.5 753.0 C 655.6 751.3, 652.4 749.8, 648.5 748.0 C 648.1 743.8, 647.9 740.2, 647.5 736.0 C 649.1 734.4, 650.4 733.1, 652.0 731.5 C 654.6 730.6, 656.9 729.9, 659.5 729.0 C 659.5 724.1, 659.5 719.9, 659.5 715.0 C 660.7 713.1, 661.8 711.4, 663.0 709.5 C 665.1 708.8, 666.9 708.2, 669.0 707.5 L 669.5 707.0 Z M 413.5 729.0 C 419.6 729.5, 424.9 730.0, 431.0 730.5 C 434.1 731.9, 436.9 733.1, 440.0 734.5 L 448.0 740.5 L 453.5 747.0 L 458.5 757.0 L 460.5 763.0 C 460.5 767.2, 460.5 770.8, 460.5 775.0 C 459.8 776.4, 459.2 777.6, 458.5 779.0 C 456.6 780.2, 454.9 781.3, 453.0 782.5 C 434.8 782.5, 419.2 782.5, 401.0 782.5 L 399.5 784.0 C 399.9 785.4, 400.1 786.6, 400.5 788.0 C 402.8 790.6, 404.7 792.9, 407.0 795.5 C 409.1 796.5, 410.9 797.5, 413.0 798.5 C 415.8 798.9, 418.2 799.1, 421.0 799.5 L 428.0 798.5 C 431.9 796.0, 435.1 794.0, 439.0 791.5 C 440.8 791.1, 442.3 790.9, 444.0 790.5 C 446.6 792.4, 448.9 794.1, 451.5 796.0 C 452.2 797.4, 452.8 798.6, 453.5 800.0 C 453.1 802.1, 452.9 803.9, 452.5 806.0 C 450.6 807.9, 448.9 809.6, 447.0 811.5 C 443.5 813.3, 440.5 814.8, 437.0 816.5 L 429.0 818.5 L 410.0 818.5 C 406.5 817.5, 403.5 816.5, 400.0 815.5 L 391.0 810.5 C 386.6 805.4, 382.9 801.1, 378.5 796.0 C 376.8 789.0, 375.3 783.0, 373.5 776.0 L 373.5 770.0 L 378.5 752.0 C 380.3 749.5, 381.8 747.5, 383.5 745.0 L 397.0 733.5 C 399.4 732.5, 401.6 731.5, 404.0 730.5 C 407.1 730.1, 409.9 729.9, 413.0 729.5 L 413.5 729.0 Z M 595.5 729.0 C 599.9 729.2, 603.6 729.3, 608.0 729.5 L 618.0 732.5 L 626.0 737.5 C 628.6 741.2, 630.9 744.3, 633.5 748.0 C 634.5 751.9, 635.5 755.1, 636.5 759.0 C 636.1 777.5, 635.9 793.5, 635.5 812.0 C 633.9 813.6, 632.6 814.9, 631.0 816.5 C 628.9 817.2, 627.1 817.8, 625.0 818.5 C 621.9 817.5, 619.1 816.5, 616.0 815.5 C 614.6 813.0, 613.4 811.0, 612.0 808.5 C 609.5 810.6, 607.5 812.4, 605.0 814.5 C 602.5 815.5, 600.5 816.5, 598.0 817.5 C 591.7 817.9, 586.3 818.1, 580.0 818.5 C 576.9 817.5, 574.1 816.5, 571.0 815.5 C 568.5 813.8, 566.5 812.3, 564.0 810.5 C 561.7 806.8, 559.8 803.7, 557.5 800.0 C 557.1 796.1, 556.9 792.9, 556.5 789.0 C 557.2 786.2, 557.8 783.8, 558.5 781.0 C 561.8 777.0, 564.7 773.5, 568.0 769.5 C 572.5 767.8, 576.5 766.3, 581.0 764.5 C 591.7 764.3, 600.8 764.2, 611.5 764.0 C 610.8 760.9, 610.2 758.1, 609.5 755.0 C 607.6 753.4, 605.9 752.1, 604.0 750.5 C 599.1 750.1, 594.9 749.9, 590.0 749.5 C 584.8 751.6, 580.3 753.4, 575.0 755.5 C 573.6 755.5, 572.4 755.5, 571.0 755.5 C 568.4 752.9, 566.1 750.6, 563.5 748.0 C 563.5 745.5, 563.5 743.5, 563.5 741.0 C 566.1 738.4, 568.4 736.1, 571.0 733.5 C 574.1 732.5, 576.9 731.5, 580.0 730.5 L 595.0 729.5 L 595.5 729.0 Z M 752.5 729.0 C 755.8 728.8, 758.7 728.7, 762.0 728.5 L 772.0 730.5 C 776.9 733.3, 781.1 735.7, 786.0 738.5 C 789.3 742.5, 792.2 746.0, 795.5 750.0 L 800.5 761.0 C 800.5 766.6, 800.5 771.4, 800.5 777.0 C 798.2 778.9, 796.3 780.6, 794.0 782.5 C 775.1 782.5, 758.9 782.5, 740.0 782.5 L 739.5 786.0 C 740.2 787.4, 740.8 788.6, 741.5 790.0 C 743.4 791.9, 745.1 793.6, 747.0 795.5 C 749.5 796.5, 751.5 797.5, 754.0 798.5 C 758.9 798.5, 763.1 798.5, 768.0 798.5 C 773.6 795.7, 778.4 793.3, 784.0 790.5 C 787.0 792.8, 789.5 794.7, 792.5 797.0 C 792.5 800.1, 792.5 802.9, 792.5 806.0 C 789.9 808.3, 787.6 810.2, 785.0 812.5 C 780.8 814.3, 777.2 815.8, 773.0 817.5 C 764.6 817.9, 757.4 818.1, 749.0 818.5 C 743.0 816.0, 738.0 814.0, 732.0 811.5 C 727.3 806.4, 723.2 802.1, 718.5 797.0 C 716.8 791.4, 715.3 786.6, 713.5 781.0 C 713.5 776.1, 713.5 771.9, 713.5 767.0 L 717.5 753.0 C 719.6 749.9, 721.4 747.1, 723.5 744.0 L 733.0 735.5 C 736.9 733.8, 740.1 732.3, 744.0 730.5 C 746.8 730.1, 749.2 729.9, 752.0 729.5 L 752.5 729.0 Z M 473.5 731.0 C 476.8 730.8, 479.7 730.7, 483.0 730.5 C 485.6 732.4, 487.9 734.1, 490.5 736.0 C 497.0 753.3, 502.5 768.2, 509.0 785.5 L 511.5 784.0 C 518.1 766.5, 523.9 751.5, 530.5 734.0 C 532.4 732.8, 534.1 731.7, 536.0 730.5 C 539.1 730.5, 541.9 730.5, 545.0 730.5 C 547.3 732.4, 549.2 734.1, 551.5 736.0 C 551.5 739.5, 551.5 742.5, 551.5 746.0 C 541.4 769.5, 532.6 789.5, 522.5 813.0 C 519.2 814.9, 516.3 816.6, 513.0 818.5 C 510.2 818.5, 507.8 818.5, 505.0 818.5 C 502.0 816.9, 499.5 815.6, 496.5 814.0 C 486.0 788.8, 477.0 767.2, 466.5 742.0 C 466.9 739.9, 467.1 738.1, 467.5 736.0 C 469.4 734.4, 471.1 733.1, 473.0 731.5 L 473.5 731.0 Z M 415.0 748.5 C 411.7 750.1, 408.8 751.4, 405.5 753.0 C 404.1 754.8, 402.9 756.3, 401.5 758.0 C 400.8 760.5, 400.2 762.5, 399.5 765.0 C 409.1 765.5, 417.4 766.0, 427.0 766.5 L 435.5 765.0 C 434.8 762.2, 434.2 759.8, 433.5 757.0 C 430.2 754.4, 427.3 752.1, 424.0 749.5 C 421.2 749.1, 418.8 748.9, 416.0 748.5 L 415.0 748.5 Z M 755.0 748.5 C 751.3 750.4, 748.2 752.1, 744.5 754.0 C 742.4 757.5, 740.6 760.5, 738.5 764.0 L 741.0 766.5 C 750.5 766.5, 758.5 766.5, 768.0 766.5 C 771.0 765.6, 773.5 764.9, 776.5 764.0 C 775.8 761.9, 775.2 760.1, 774.5 758.0 C 772.9 756.1, 771.6 754.4, 770.0 752.5 C 766.9 751.1, 764.1 749.9, 761.0 748.5 C 759.3 748.5, 757.8 748.5, 756.0 748.5 L 755.0 748.5 Z M 592.0 779.5 C 589.9 780.2, 588.1 780.8, 586.0 781.5 C 584.1 784.5, 582.4 787.0, 580.5 790.0 C 580.9 792.1, 581.1 793.9, 581.5 796.0 C 582.7 797.2, 583.8 798.3, 585.0 799.5 C 587.5 800.2, 589.5 800.8, 592.0 801.5 C 595.1 801.1, 597.9 800.9, 601.0 800.5 C 603.1 799.5, 604.9 798.5, 607.0 797.5 C 608.6 795.2, 609.9 793.3, 611.5 791.0 C 611.9 788.5, 612.1 786.5, 612.5 784.0 L 612.5 782.0 C 611.3 781.1, 610.2 780.4, 609.0 779.5 C 603.4 779.5, 598.6 779.5, 593.0 779.5 L 592.0 779.5 Z"
                        fill="#0b57d0"
                        fillRule="evenodd"
                      />
                    </svg>
                    )}
                  </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {omrPlacement.enabled && !omrPlacement.fitsOnLastPage && (
            <div
              key="page_wrap_embedded_omr"
              data-page-wrapper="true"
              className="relative mx-auto shrink-0 print:p-0 print:m-0 print:w-[210mm] print:h-[297mm] print:pb-0 a4-page-wrapper-virtualized"
              style={{
                width: `${pageWPx * effectiveScale}px`,
                maxWidth: '100%',
                height: `${pageHPx * effectiveScale}px`,
                minHeight: `${pageHPx * effectiveScale}px`,
              }}
            >
              <div
                className={`a4-page-item omr-standalone-page bg-white text-black ${continuousPages ? 'shadow-none rounded-none ring-0' : 'shadow-2xl rounded-xs ring-1 ring-slate-900/10'} print:shadow-none select-none box-border print:ring-0 print:border-none print:transform-none print:relative print:left-auto print:top-auto print:w-[210mm] print:h-[297mm] overflow-hidden`}
                style={{
                  width: '210mm',
                  minWidth: '210mm',
                  maxWidth: '210mm',
                  height: '297mm',
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  transform: `translateX(-50%) scale(${effectiveScale})`,
                  transformOrigin: 'top center',
                }}
              >
                <OmrSheetGenerator
                  test={test}
                  hideHeaderContainer={true}
                  embedded={true}
                  embeddedFormat="a4"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};