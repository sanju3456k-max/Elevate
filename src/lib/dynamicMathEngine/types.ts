import type { DifficultyLevel, MathQuestion } from '../../types';

export type MathArchetype =
  | 'product' // e.g. Speed * Time = Distance, Area = Length * Width
  | 'quotient' // e.g. Distance / Time = Speed, Total / Items = Rate
  | 'sum' // e.g. Total = A + B
  | 'difference' // e.g. Profit = SP - CP, Remaining = A - B
  | 'percentage_part' // e.g. Part = Whole * (Percent / 100)
  | 'percentage_change' // e.g. SP = CP * (1 + Profit / 100)
  | 'simple_interest' // SI = (P * R * T) / 100
  | 'quadratic_factoring' // x^2 - (r1+r2)x + r1*r2 = 0
  | 'pythagorean_hypotenuse' // c = sqrt(a^2 + b^2)
  | 'pythagorean_leg' // b = sqrt(c^2 - a^2)
  | 'circle_area' // Area = pi * r^2 (using 22/7)
  | 'circle_perimeter' // Circumference = 2 * pi * r
  | 'average' // Avg = (a + b + ...) / n
  | 'ratio_proportion' // a:b = c:d
  | 'linear_equation' // ax + b = c
  | 'proportional_scale'; // Fallback: scale all numbers by clean factor k

export interface DistractorRule {
  targetKey: string; // e.g. 'opt_b'
  relationType: 'offset' | 'ratio' | 'operation_swap' | 'fixed';
  param: number;
}

export interface InferredMathRelation {
  archetype: MathArchetype;
  confidence: number;
  inputKeys: string[];
  outputKey: string; // usually 'ans' or correct option
  distractorRules: DistractorRule[];
  description: string;
}

export interface VariableRange {
  min: number;
  max: number;
  step: number;
  mustBeInteger: boolean;
  allowedValues?: number[];
}

export interface CognitiveConstraints {
  difficulty: DifficultyLevel;
  maxDecimals: number;
  allowNegative: boolean;
  enforceCleanDivision: boolean;
  preferredMultiples?: number[];
}

export interface DynamicGenerationOptions {
  difficulty?: DifficultyLevel;
  seed?: number;
  preserveFixedOptionPosition?: boolean;
}

export interface DynamicInstanceResult {
  question: MathQuestion;
  resolvedVars: Record<string, number | string>;
  archetype: MathArchetype;
}
