import type { DifficultyLevel } from '../../types';
import type { CognitiveConstraints, VariableRange } from './types';

// Standard Pythagorean triples [a, b, c] where a^2 + b^2 = c^2
export const PYTHAGOREAN_BASE_TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [9, 40, 41],
  [12, 35, 37],
  [20, 21, 29],
];

// Clean radii for circles that cancel perfectly with pi = 22/7
export const CLEAN_CIRCLE_RADII: Record<DifficultyLevel, number[]> = {
  Easy: [7, 14, 21, 28, 35, 42, 49, 70],
  Medium: [3.5, 7, 10.5, 14, 17.5, 21, 28, 35, 42],
  Hard: [2.1, 4.2, 6.3, 8.4, 10.5, 12.6, 14, 28],
  Advanced: [1.4, 2.8, 4.2, 5.6, 7, 9.8, 14, 21],
};

// Exam-friendly percentages
export const EXAM_PERCENTAGES: Record<DifficultyLevel, number[]> = {
  Easy: [5, 10, 15, 20, 25, 30, 40, 50, 75],
  Medium: [4, 6, 8, 12, 16, 24, 32, 35, 45, 60, 80],
  Hard: [2.5, 7.5, 12.5, 17.5, 22.5, 33.33, 66.67],
  Advanced: [3.25, 6.75, 11.2, 14.5, 18.75],
};

// Exam-friendly Simple Interest rates & times
export const EXAM_SI_RATES = [4, 5, 6, 8, 10, 12, 15, 20];
export const EXAM_SI_TIMES = [1, 2, 3, 4, 5];

/**
 * Returns cognitive constraints enforcing that an Easy question never becomes Hard.
 */
export function getCognitiveConstraints(difficulty: DifficultyLevel = 'Easy'): CognitiveConstraints {
  switch (difficulty) {
    case 'Easy':
      return {
        difficulty: 'Easy',
        maxDecimals: 1, // Only .5 or whole numbers allowed
        allowNegative: false,
        enforceCleanDivision: true,
        preferredMultiples: [2, 5, 10],
      };
    case 'Medium':
      return {
        difficulty: 'Medium',
        maxDecimals: 2,
        allowNegative: true,
        enforceCleanDivision: true,
        preferredMultiples: [2, 3, 5],
      };
    case 'Hard':
    case 'Advanced':
      return {
        difficulty,
        maxDecimals: 3,
        allowNegative: true,
        enforceCleanDivision: false,
      };
  }
}

/**
 * Checks whether a number conforms to the difficulty's cognitive decimal rules.
 */
export function isValidCognitiveNumber(val: number, constraints: CognitiveConstraints): boolean {
  if (isNaN(val) || !isFinite(val)) return false;
  if (!constraints.allowNegative && val < 0) return false;

  // Check decimal places
  const str = val.toString();
  if (str.includes('.')) {
    const decParts = str.split('.')[1];
    if (decParts.length > constraints.maxDecimals) return false;
    // For Easy, only allow .5 or whole numbers
    if (constraints.difficulty === 'Easy' && decParts !== '5') {
      return false;
    }
  }

  return true;
}

/**
 * Analyzes a base fixed number and deduces its scale and preferred step size.
 */
export function deduceVariableRange(baseVal: number, difficulty: DifficultyLevel = 'Easy'): VariableRange {
  const isInt = Number.isInteger(baseVal);
  const isDec5 = !isInt && (baseVal * 2) % 1 === 0; // e.g. 2.5, 3.5

  let step = 1;
  if (baseVal % 10 === 0 && Math.abs(baseVal) >= 20) {
    step = 5;
  } else if (baseVal % 5 === 0 && Math.abs(baseVal) >= 15) {
    step = 5;
  } else if (isDec5) {
    step = 0.5;
  } else if (isInt) {
    step = 1;
  } else {
    step = 0.1;
  }

  // Scaling spread based on difficulty
  const spreadFactor = difficulty === 'Easy' ? 0.4 : difficulty === 'Medium' ? 0.6 : 0.8;
  const delta = Math.max(step * 3, Math.round(Math.abs(baseVal) * spreadFactor));

  let min = Math.max(step, baseVal - delta);
  let max = baseVal + delta;

  // Align with step
  min = Math.round(min / step) * step;
  max = Math.round(max / step) * step;
  if (min <= 0 && baseVal > 0) min = step;

  return {
    min,
    max,
    step,
    mustBeInteger: isInt,
  };
}
