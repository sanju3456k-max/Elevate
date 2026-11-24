import type { InferredMathRelation, MathArchetype, DistractorRule } from './types';

const EPSILON = 0.001;

function isClose(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * Automatically infers the mathematical relationship and formula
 * between the fixed variables without requiring any code from the author.
 */
export function inferMathRelation(
  rawVars: Record<string, number | string>,
  questionText: string = ''
): InferredMathRelation {
  // Convert numeric entries
  const numVars: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawVars)) {
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    if (!isNaN(num)) {
      numVars[k] = num;
    }
  }

  const keys = Object.keys(numVars);

  // 1. Determine the target answer key
  let outputKey = keys.find((k) => /^(ans|answer|result|correct|sol)$/i.test(k));
  if (!outputKey) {
    // Check if there is an 'opt_a' or 'a' or first option key
    outputKey = keys.find((k) => /^(opt_a|a)$/i.test(k)) || keys[0] || 'ans';
  }

  const ansVal = numVars[outputKey] ?? 0;

  // Separate inputs from distractors (Distractor keys must have opt_, option_, or distractor/wrong prefix)
  const distractorKeys = keys.filter(
    (k) => /^(opt_[b-h]|option_[b-h]|choice_[b-h]|distractor\d*|wrong\d*)$/i.test(k) && k !== outputKey
  );
  const inputKeys = keys.filter((k) => k !== outputKey && !distractorKeys.includes(k));

  const lowerText = questionText.toLowerCase();

  // Test Archetypes in order of specificity

  // 1. Circle Area / Perimeter
  const radiusKey = inputKeys.find((k) => /^(r|radius|rad)$/i.test(k));
  if (radiusKey) {
    const r = numVars[radiusKey];
    if (isClose(ansVal, (22 / 7) * r * r) || isClose(ansVal, Math.PI * r * r)) {
      return buildRelation('circle_area', [radiusKey], outputKey, distractorKeys, numVars, 'Circle Area: pi * r^2');
    }
    if (isClose(ansVal, 2 * (22 / 7) * r) || isClose(ansVal, 2 * Math.PI * r)) {
      return buildRelation('circle_perimeter', [radiusKey], outputKey, distractorKeys, numVars, 'Circle Circumference: 2 * pi * r');
    }
  }

  // 2. Simple Interest: SI = (P * R * T) / 100
  const pKey = inputKeys.find((k) => /^(p|principal|sum|amount)$/i.test(k));
  const rKey = inputKeys.find((k) => /^(r|rate)$/i.test(k));
  const tKey = inputKeys.find((k) => /^(t|time|years?)$/i.test(k));
  if (pKey && rKey && tKey) {
    const expectedSI = (numVars[pKey] * numVars[rKey] * numVars[tKey]) / 100;
    if (isClose(ansVal, expectedSI)) {
      return buildRelation('simple_interest', [pKey, rKey, tKey], outputKey, distractorKeys, numVars, 'Simple Interest: (P * R * T) / 100');
    }
  }

  // 3. Pythagorean Triples: c = sqrt(a^2 + b^2) or b = sqrt(c^2 - a^2)
  if (inputKeys.length >= 2) {
    for (let i = 0; i < inputKeys.length; i++) {
      for (let j = i + 1; j < inputKeys.length; j++) {
        const k1 = inputKeys[i];
        const k2 = inputKeys[j];
        const v1 = numVars[k1];
        const v2 = numVars[k2];
        if (isClose(ansVal, Math.sqrt(v1 * v1 + v2 * v2))) {
          return buildRelation('pythagorean_hypotenuse', [k1, k2], outputKey, distractorKeys, numVars, 'Pythagorean Hypotenuse: sqrt(a^2 + b^2)');
        }
        if (v2 > v1 && isClose(ansVal, Math.sqrt(v2 * v2 - v1 * v1))) {
          return buildRelation('pythagorean_leg', [k1, k2], outputKey, distractorKeys, numVars, 'Pythagorean Leg: sqrt(hyp^2 - leg^2)');
        }
      }
    }
  }

  // 4. Quadratic Factoring: roots r1, r2 -> b = r1 + r2, c = r1 * r2
  const r1Key = inputKeys.find((k) => /^(r1|root1|x1)$/i.test(k));
  const r2Key = inputKeys.find((k) => /^(r2|root2|x2)$/i.test(k));
  if (r1Key && r2Key) {
    return buildRelation('quadratic_factoring', [r1Key, r2Key], outputKey, distractorKeys, numVars, 'Quadratic Roots Factoring: (x - r1)(x - r2)');
  }

  // 5. Binary Operations between pairs of inputs: product, quotient, sum, difference, percentage
  if (inputKeys.length >= 2) {
    for (let i = 0; i < inputKeys.length; i++) {
      for (let j = 0; j < inputKeys.length; j++) {
        if (i === j) continue;
        const k1 = inputKeys[i];
        const k2 = inputKeys[j];
        const v1 = numVars[k1];
        const v2 = numVars[k2];

        // Product (e.g. Speed * Time, Length * Width)
        if (isClose(ansVal, v1 * v2)) {
          return buildRelation('product', [k1, k2], outputKey, distractorKeys, numVars, `Product: ${k1} * ${k2}`);
        }
        // Triangle Area: 0.5 * base * height
        if (isClose(ansVal, 0.5 * v1 * v2)) {
          return buildRelation('product', [k1, k2], outputKey, distractorKeys, numVars, `Area of Triangle: 0.5 * ${k1} * ${k2}`);
        }
        // Quotient (e.g. Distance / Time, Total / Rate)
        if (v2 !== 0 && isClose(ansVal, v1 / v2)) {
          return buildRelation('quotient', [k1, k2], outputKey, distractorKeys, numVars, `Quotient: ${k1} / ${k2}`);
        }
        // Percentage part: (v1 * v2) / 100
        if (isClose(ansVal, (v1 * v2) / 100)) {
          return buildRelation('percentage_part', [k1, k2], outputKey, distractorKeys, numVars, `Percentage Part: (${k1} * ${k2}) / 100`);
        }
        // Percentage change: v1 * (1 + v2/100) or v1 * (1 - v2/100)
        if (isClose(ansVal, v1 * (1 + v2 / 100))) {
          return buildRelation('percentage_change', [k1, k2], outputKey, distractorKeys, numVars, `Profit / Increase: ${k1} * (1 + ${k2}/100)`);
        }
        if (isClose(ansVal, v1 * (1 - v2 / 100))) {
          return buildRelation('percentage_change', [k1, k2], outputKey, distractorKeys, numVars, `Discount / Loss: ${k1} * (1 - ${k2}/100)`);
        }
        // Sum
        if (isClose(ansVal, v1 + v2)) {
          return buildRelation('sum', [k1, k2], outputKey, distractorKeys, numVars, `Sum: ${k1} + ${k2}`);
        }
        // Difference
        if (isClose(ansVal, v1 - v2)) {
          return buildRelation('difference', [k1, k2], outputKey, distractorKeys, numVars, `Difference: ${k1} - ${k2}`);
        }
      }
    }
  }

  // 6. Proportional Scaling Fallback
  // If no exact closed-form relation matches, scale inputs and outputs proportionally
  return buildRelation(
    'proportional_scale',
    inputKeys.length > 0 ? inputKeys : keys,
    outputKey,
    distractorKeys,
    numVars,
    'Proportional Scaling: Preserves exact cognitive ratios and difficulty'
  );
}

function buildRelation(
  archetype: MathArchetype,
  inputKeys: string[],
  outputKey: string,
  distractorKeys: string[],
  numVars: Record<string, number>,
  description: string
): InferredMathRelation {
  const ans = numVars[outputKey] ?? 0;
  const distractorRules: DistractorRule[] = [];

  for (const dKey of distractorKeys) {
    const dVal = numVars[dKey];
    if (dVal !== undefined && ans !== 0) {
      const offset = dVal - ans;
      const ratio = dVal / ans;
      // If offset is a clean small integer or round number, use offset
      if (Math.abs(offset) < Math.abs(ans) && Number.isInteger(offset)) {
        distractorRules.push({
          targetKey: dKey,
          relationType: 'offset',
          param: offset,
        });
      } else if (Math.abs(ratio - 1) > 0.05 && Math.abs(ratio - 1) < 2) {
        distractorRules.push({
          targetKey: dKey,
          relationType: 'ratio',
          param: parseFloat(ratio.toFixed(3)),
        });
      } else {
        distractorRules.push({
          targetKey: dKey,
          relationType: 'offset',
          param: offset,
        });
      }
    }
  }

  return {
    archetype,
    confidence: archetype === 'proportional_scale' ? 0.75 : 0.98,
    inputKeys,
    outputKey,
    distractorRules,
    description,
  };
}
