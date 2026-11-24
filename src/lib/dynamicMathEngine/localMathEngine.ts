import type { MathQuestion, DifficultyLevel } from '../../types';
import type {
  DynamicGenerationOptions,
  DynamicInstanceResult,
  MathArchetype,
} from './types';
import {
  getCognitiveConstraints,
  isValidCognitiveNumber,
  deduceVariableRange,
  PYTHAGOREAN_BASE_TRIPLES,
  CLEAN_CIRCLE_RADII,
  EXAM_PERCENTAGES,
  EXAM_SI_RATES,
  EXAM_SI_TIMES,
} from './difficultyInvariants';
import { inferMathRelation } from './relationInference';

/**
 * Cleanly format numbers removing IEEE-754 precision artifacts (e.g. 150.00000000000003 -> 150)
 */
export function formatMathNumber(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  const rounded = parseFloat(val.toFixed(4));
  return rounded.toString();
}

/**
 * Replace all {variable} or {variable = defaultVal} occurrences in template strings
 */
export function interpolateVariables(
  template: string,
  scope: Record<string, number | string> = {}
): string {
  if (!template) return '';

  // 1. Handle inline definitions: {name = defaultVal} or [name: defaultVal]
  let result = template.replace(
    /(?:\{|\[)([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*([^}\]]+)(?:\}|\])/g,
    (_, key, defaultVal) => {
      if (scope[key] !== undefined) {
        const val = scope[key];
        return typeof val === 'number' ? formatMathNumber(val) : String(val);
      }
      return defaultVal.trim();
    }
  );

  // 2. Handle plain placeholders: {name} or [name]
  result = result.replace(/(?:\{|\[)([a-zA-Z0-9_]+)(?:\}|\])/g, (match, key) => {
    if (scope[key] !== undefined) {
      const val = scope[key];
      return typeof val === 'number' ? formatMathNumber(val) : String(val);
    }
    return match;
  });

  return result;
}

/**
 * Pseudo-random number generator with optional seed support for reproducibility
 */
function createRandom(seed?: number) {
  let s = seed !== undefined ? Math.abs((seed ^ 0x6c62272e) % 2147483647) : Math.floor(Math.random() * 2147483647);
  if (s === 0) s = 123456789;
  // Warm up LCG
  for (let i = 0; i < 4; i++) {
    s = (s * 16807) % 2147483647;
  }
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randIntInRange(min: number, max: number, step: number, rng: () => number): number {
  const stepsCount = Math.floor((max - min) / step);
  const pickedStep = Math.floor(rng() * (stepsCount + 1));
  const val = min + pickedStep * step;
  return parseFloat(val.toFixed(2));
}

/**
 * Checks if a question has fixedVars or template placeholders
 */
export function isQuestionDynamicEligible(q: MathQuestion): boolean {
  if (q.fixedVars && Object.keys(q.fixedVars).length > 0) return true;
  if (/\{[a-zA-Z0-9_]+\}/.test(q.text)) return true;
  if (Array.isArray(q.options) && q.options.some((opt) => /\{[a-zA-Z0-9_]+\}/.test(opt))) return true;
  return false;
}

/**
 * Generates a dynamic instance of a MathQuestion preserving cognitive difficulty.
 */
export function instantiateQuestion(
  q: MathQuestion,
  options?: DynamicGenerationOptions | number
): MathQuestion {
  // If question is not dynamic eligible, return unmodified
  if (!isQuestionDynamicEligible(q)) {
    return q;
  }

  const rawFixedVars = q.fixedVars || {};
  if (Object.keys(rawFixedVars).length === 0) {
    return q;
  }

  const optObj: DynamicGenerationOptions = typeof options === 'number' ? { seed: options } : (options || {});
  const difficulty: DifficultyLevel = optObj.difficulty || q.difficulty || 'Easy';
  const constraints = getCognitiveConstraints(difficulty);
  const rng = createRandom(optObj.seed);

  const relation = inferMathRelation(rawFixedVars, q.text);
  const newScope: Record<string, number | string> = {};

  // Numeric version of base vars
  const baseNumVars: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawFixedVars)) {
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    if (!isNaN(num)) baseNumVars[k] = num;
  }

  // Generate new variables based on Archetype
  switch (relation.archetype) {
    case 'circle_area':
    case 'circle_perimeter': {
      const radiusKey = relation.inputKeys[0] || 'r';
      const cleanRadii = CLEAN_CIRCLE_RADII[difficulty] || CLEAN_CIRCLE_RADII.Easy;
      const r = pickRandom(cleanRadii, rng);
      newScope[radiusKey] = r;

      if (relation.archetype === 'circle_area') {
        newScope[relation.outputKey] = Math.round((22 / 7) * r * r);
      } else {
        newScope[relation.outputKey] = Math.round(2 * (22 / 7) * r);
      }
      break;
    }

    case 'simple_interest': {
      const pKey = relation.inputKeys[0] || 'p';
      const rKey = relation.inputKeys[1] || 'r';
      const tKey = relation.inputKeys[2] || 't';

      const baseP = baseNumVars[pKey] || 1000;
      const pMultiplier = pickRandom([0.5, 0.8, 1, 1.2, 1.5, 2], rng);
      const newP = Math.round((baseP * pMultiplier) / 100) * 100;
      const newR = pickRandom(EXAM_SI_RATES, rng);
      const newT = pickRandom(EXAM_SI_TIMES, rng);

      newScope[pKey] = newP;
      newScope[rKey] = newR;
      newScope[tKey] = newT;
      newScope[relation.outputKey] = Math.round((newP * newR * newT) / 100);
      break;
    }

    case 'pythagorean_hypotenuse':
    case 'pythagorean_leg': {
      const triple = pickRandom(PYTHAGOREAN_BASE_TRIPLES, rng);
      const k = difficulty === 'Easy' ? pickRandom([1, 2, 3, 4], rng) : pickRandom([1, 2, 3, 5, 6], rng);
      const a = triple[0] * k;
      const b = triple[1] * k;
      const c = triple[2] * k;

      const [k1, k2] = relation.inputKeys;
      if (relation.archetype === 'pythagorean_hypotenuse') {
        newScope[k1] = a;
        newScope[k2] = b;
        newScope[relation.outputKey] = c;
      } else {
        newScope[k1] = a;
        newScope[k2] = c;
        newScope[relation.outputKey] = b;
      }
      break;
    }

    case 'quadratic_factoring': {
      const [r1Key, r2Key] = relation.inputKeys;
      const r1 = randIntInRange(2, 6, 1, rng);
      const r2 = randIntInRange(r1 + 1, 9, 1, rng);
      newScope[r1Key] = r1;
      newScope[r2Key] = r2;
      newScope['b'] = r1 + r2;
      newScope['c'] = r1 * r2;
      newScope[relation.outputKey] = `${r1}, ${r2}`;
      break;
    }

    case 'quotient': {
      // Invariant: Generate quotient and divisor first so dividend divides with ZERO remainder!
      const [dividendKey, divisorKey] = relation.inputKeys;
      const baseDivisor = baseNumVars[divisorKey] || 5;
      const baseQuotient = baseNumVars[relation.outputKey] || 10;

      const divRange = deduceVariableRange(baseDivisor, difficulty);
      const newDivisor = randIntInRange(divRange.min, divRange.max, divRange.step, rng);

      const quotRange = deduceVariableRange(baseQuotient, difficulty);
      const newQuotient = randIntInRange(quotRange.min, quotRange.max, quotRange.step, rng);

      const newDividend = parseFloat((newDivisor * newQuotient).toFixed(2));
      newScope[divisorKey] = newDivisor;
      newScope[dividendKey] = newDividend;
      newScope[relation.outputKey] = newQuotient;
      break;
    }

    case 'product': {
      const [k1, k2] = relation.inputKeys;
      const v1Range = deduceVariableRange(baseNumVars[k1] || 10, difficulty);
      const v2Range = deduceVariableRange(baseNumVars[k2] || 2, difficulty);

      const v1 = randIntInRange(v1Range.min, v1Range.max, v1Range.step, rng);
      const v2 = randIntInRange(v2Range.min, v2Range.max, v2Range.step, rng);

      newScope[k1] = v1;
      newScope[k2] = v2;
      newScope[relation.outputKey] = parseFloat((v1 * v2).toFixed(2));
      break;
    }

    case 'percentage_part': {
      const [wholeKey, pctKey] = relation.inputKeys;
      const pct = pickRandom(EXAM_PERCENTAGES[difficulty], rng);
      const baseWhole = baseNumVars[wholeKey] || 200;
      const whole = Math.round(baseWhole * pickRandom([0.5, 0.8, 1, 1.2, 1.5, 2], rng));

      newScope[pctKey] = pct;
      newScope[wholeKey] = whole;
      newScope[relation.outputKey] = parseFloat(((whole * pct) / 100).toFixed(2));
      break;
    }

    case 'sum': {
      const [k1, k2] = relation.inputKeys;
      const v1 = randIntInRange(baseNumVars[k1] * 0.7, baseNumVars[k1] * 1.4, 1, rng);
      const v2 = randIntInRange(baseNumVars[k2] * 0.7, baseNumVars[k2] * 1.4, 1, rng);
      newScope[k1] = v1;
      newScope[k2] = v2;
      newScope[relation.outputKey] = v1 + v2;
      break;
    }

    case 'difference': {
      const [k1, k2] = relation.inputKeys;
      const v2 = randIntInRange(baseNumVars[k2] * 0.7, baseNumVars[k2] * 1.4, 1, rng);
      const diff = randIntInRange(baseNumVars[relation.outputKey] * 0.7, baseNumVars[relation.outputKey] * 1.4, 1, rng);
      const v1 = v2 + diff;
      newScope[k1] = v1;
      newScope[k2] = v2;
      newScope[relation.outputKey] = diff;
      break;
    }

    case 'proportional_scale':
    default: {
      // Proportional scale factor preserving cognitive scale
      const cleanFactors = difficulty === 'Easy' ? [0.8, 1.2, 1.4, 1.5, 2] : [0.6, 0.75, 1.25, 1.5, 1.75, 2];
      const factor = pickRandom(cleanFactors, rng);

      for (const k of relation.inputKeys) {
        const base = baseNumVars[k] ?? 1;
        const scaled = Number.isInteger(base) ? Math.round(base * factor) : parseFloat((base * factor).toFixed(2));
        newScope[k] = scaled;
      }
      const baseAns = baseNumVars[relation.outputKey] ?? 0;
      newScope[relation.outputKey] = Number.isInteger(baseAns)
        ? Math.round(baseAns * factor)
        : parseFloat((baseAns * factor).toFixed(2));
      break;
    }
  }

  // Calculate Distractor Values
  const ansVal = typeof newScope[relation.outputKey] === 'number'
    ? (newScope[relation.outputKey] as number)
    : parseFloat(String(newScope[relation.outputKey]));

  const usedDistractorVals = new Set<number>([ansVal]);

  for (const dRule of relation.distractorRules) {
    let dVal: number;
    if (dRule.relationType === 'offset') {
      dVal = ansVal + dRule.param;
    } else if (dRule.relationType === 'ratio') {
      dVal = parseFloat((ansVal * dRule.param).toFixed(1));
    } else {
      dVal = ansVal + 10;
    }

    // Ensure distractor is unique and does not introduce unwanted non-positive numbers if original was strictly positive
    const origDistractorVal = rawFixedVars[dRule.targetKey];
    const origWasPositive = typeof origDistractorVal === 'number' ? origDistractorVal > 0 : (parseFloat(String(origDistractorVal)) > 0);
    const isDisallowedNonPositive = origWasPositive && dVal <= 0;
    if (isDisallowedNonPositive || usedDistractorVals.has(dVal)) {
      dVal = ansVal + (usedDistractorVals.size * (Math.abs(ansVal) > 50 ? 10 : 2));
    }

    usedDistractorVals.add(dVal);
    newScope[dRule.targetKey] = dVal;
  }

  // Any remaining fixedVars that weren't dynamic keep their original values
  for (const [k, v] of Object.entries(rawFixedVars)) {
    if (newScope[k] === undefined) {
      newScope[k] = v;
    }
  }

  // Perform Interpolation
  const renderedText = interpolateVariables(q.text, newScope);
  const renderedExplanation = interpolateVariables(q.explanation || q.solution || '', newScope);
  const renderedHint = q.hint ? interpolateVariables(q.hint, newScope) : undefined;

  const renderedOptions = (q.options || []).map((opt) => interpolateVariables(opt, newScope));

  return {
    ...q,
    text: renderedText,
    options: renderedOptions,
    explanation: renderedExplanation,
    solution: renderedExplanation,
    hint: renderedHint,
    fixedVars: rawFixedVars,
    isDynamic: true,
  };
}

/**
 * Generates N preview variations for Test Creator
 */
export function previewVariations(q: MathQuestion, count = 3): MathQuestion[] {
  const variations: MathQuestion[] = [];
  for (let i = 0; i < count; i++) {
    variations.push(instantiateQuestion(q, { seed: 1000 + i * 4999 }));
  }
  return variations;
}
