/**
 * Elevate Platform - Explorer Batch & 30-Question Real Behavior Test Deployment
 * 
 * Generates:
 * 1. Batch "Explorer" (batch_explorer_01) with 4,000 enrolled students.
 * 2. 30-Question Mock Test "Explorer 30-Question Advanced Math Benchmark" (test_explorer_mock_01).
 * 3. 4,000 Realistic Student Attempts with mixed categories:
 *    - Master Scholars (~200): high accuracy, 0-2 left blank, fast
 *    - High Achievers (~800): good accuracy, 2-6 left blank
 *    - Average Performers (~1800): moderate accuracy, 6-12 left blank, mixed errors
 *    - Struggling Students (~800): low accuracy, 12-18 left blank, heavy errors
 *    - Dropouts/Time-Constrained (~400): 18-25 left blank, low score
 *    - Master User Sanju: ranked ~#260 (Top 7%, 88/120)
 * 4. Partitioned across Dynamic N-Buckets (Bucket 1: 1800, Bucket 2: 1800, Bucket 3: 400).
 * 5. Touch catalog beacon to bust client cache.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const SANJU_UID = 'B0DeZmlpyGToNoNm9laiTQ3KNqp1';
const SANJU_EMAIL = 'sanju3456k@gmail.com';
const BATCH_ID = 'batch_explorer_01';
const BATCH_TITLE = 'Explorer';
const TEST_ID = 'test_explorer_mock_01';
const TEST_TITLE = 'Explorer 30-Question Advanced Math Benchmark';
const CANONICAL_LB_ID = 'test_title_explorer_30_question_advanced_math_benchmark';

// 30 Comprehensive Math Questions
const QUESTIONS = [
  {
    id: 'exp_q1',
    text: 'Find the roots of the quadratic equation: 2x² - 7x + 3 = 0.',
    options: ['x = 1/2, 3', 'x = -1/2, -3', 'x = 2, 3/2', 'x = 1, 6'],
    correctOptionIndex: 0,
    topic: 'Algebra',
    difficulty: 'easy',
    explanation: 'Factoring: (2x - 1)(x - 3) = 0 => x = 1/2, x = 3.'
  },
  {
    id: 'exp_q2',
    text: 'Solve for (x, y): 3x + 2y = 16 and 2x - y = 6.',
    options: ['(4, 2)', '(2, 5)', '(3, 3)', '(5, 1)'],
    correctOptionIndex: 0,
    topic: 'Linear Equations',
    difficulty: 'easy',
    explanation: 'From 2nd eq: y = 2x - 6. Substitute: 3x + 2(2x - 6) = 16 => 7x = 28 => x = 4, y = 2.'
  },
  {
    id: 'exp_q3',
    text: 'Find the remainder when P(x) = x³ - 4x² + 5x - 2 is divided by (x - 2).',
    options: ['0', '1', '-2', '4'],
    correctOptionIndex: 0,
    topic: 'Polynomials',
    difficulty: 'easy',
    explanation: 'Remainder theorem: P(2) = 8 - 16 + 10 - 2 = 0.'
  },
  {
    id: 'exp_q4',
    text: 'Find the 20th term of the arithmetic progression: 3, 7, 11, 15, ...',
    options: ['79', '83', '75', '80'],
    correctOptionIndex: 0,
    topic: 'Sequences & Series',
    difficulty: 'easy',
    explanation: 'a = 3, d = 4. T₂₀ = a + 19d = 3 + 19(4) = 79.'
  },
  {
    id: 'exp_q5',
    text: 'Find the sum to infinity of the geometric series: 8, 4, 2, 1, ...',
    options: ['16', '14', '15', '18'],
    correctOptionIndex: 0,
    topic: 'Sequences & Series',
    difficulty: 'easy',
    explanation: 'a = 8, r = 1/2. S_inf = a / (1 - r) = 8 / (1/2) = 16.'
  },
  {
    id: 'exp_q6',
    text: 'What is the coefficient of x³ in the expansion of (1 + 2x)⁵?',
    options: ['80', '40', '160', '20'],
    correctOptionIndex: 0,
    topic: 'Binomial Theorem',
    difficulty: 'medium',
    explanation: 'Term is C(5, 3) * (2x)³ = 10 * 8x³ = 80x³. Coefficient is 80.'
  },
  {
    id: 'exp_q7',
    text: 'Simplify the trigonometric expression: sin²(θ) + cos²(θ) + tan²(θ).',
    options: ['sec²(θ)', '1 + sin²(θ)', 'csc²(θ)', 'tan²(θ)'],
    correctOptionIndex: 0,
    topic: 'Trigonometry',
    difficulty: 'easy',
    explanation: 'sin²(θ) + cos²(θ) = 1. 1 + tan²(θ) = sec²(θ).'
  },
  {
    id: 'exp_q8',
    text: 'Find the exact value of sin(75°).',
    options: ['(√6 + √2)/4', '(√6 - √2)/4', '(√3 + 1)/2', '(√3 - 1)/2'],
    correctOptionIndex: 0,
    topic: 'Trigonometry',
    difficulty: 'medium',
    explanation: 'sin(45° + 30°) = sin45°cos30° + cos45°sin30° = (√6 + √2)/4.'
  },
  {
    id: 'exp_q9',
    text: 'Evaluate: arcsin(1/2) + arccos(1/2).',
    options: ['π/2', 'π/3', 'π/6', 'π'],
    correctOptionIndex: 0,
    topic: 'Inverse Trigonometry',
    difficulty: 'easy',
    explanation: 'arcsin(x) + arccos(x) = π/2 for all x in [-1, 1].'
  },
  {
    id: 'exp_q10',
    text: 'Find the distance between points A(1, 2) and B(4, 6).',
    options: ['5', '6', '√17', '7'],
    correctOptionIndex: 0,
    topic: 'Coordinate Geometry',
    difficulty: 'easy',
    explanation: 'd = √((4-1)² + (6-2)²) = √(9 + 16) = √25 = 5.'
  },
  {
    id: 'exp_q11',
    text: 'Find the slope-intercept equation of a line perpendicular to y = 2x + 1 passing through (0, 3).',
    options: ['y = -1/2 x + 3', 'y = 2x + 3', 'y = -2x + 3', 'y = 1/2 x + 3'],
    correctOptionIndex: 0,
    topic: 'Coordinate Geometry',
    difficulty: 'medium',
    explanation: 'Slope m = -1/2. Passing through y-intercept (0, 3) gives y = -1/2 x + 3.'
  },
  {
    id: 'exp_q12',
    text: 'Find the center and radius of the circle: x² + y² - 4x + 6y - 12 = 0.',
    options: ['Center (2, -3), Radius 5', 'Center (-2, 3), Radius 5', 'Center (2, -3), Radius 25', 'Center (4, -6), Radius 5'],
    correctOptionIndex: 0,
    topic: 'Coordinate Geometry',
    difficulty: 'medium',
    explanation: '(x - 2)² + (y + 3)² = 12 + 4 + 9 = 25. Center (2, -3), radius 5.'
  },
  {
    id: 'exp_q13',
    text: 'Find the focus coordinates of the parabola: y² = 12x.',
    options: ['(3, 0)', '(0, 3)', '(-3, 0)', '(6, 0)'],
    correctOptionIndex: 0,
    topic: 'Conic Sections',
    difficulty: 'easy',
    explanation: '4a = 12 => a = 3. Focus is (a, 0) = (3, 0).'
  },
  {
    id: 'exp_q14',
    text: 'Find the eccentricity of the ellipse: x²/25 + y²/16 = 1.',
    options: ['3/5', '4/5', '9/25', '1/5'],
    correctOptionIndex: 0,
    topic: 'Conic Sections',
    difficulty: 'medium',
    explanation: 'b² = a²(1 - e²) => 16 = 25(1 - e²) => e² = 9/25 => e = 3/5.'
  },
  {
    id: 'exp_q15',
    text: 'Evaluate the limit: lim (x → 0) [sin(3x) / x].',
    options: ['3', '1', '0', 'Does not exist'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'easy',
    explanation: 'lim (x->0) 3 * [sin(3x)/(3x)] = 3 * 1 = 3.'
  },
  {
    id: 'exp_q16',
    text: 'Find the derivative of f(x) = x³ * e^(2x).',
    options: ['e^(2x) * (2x³ + 3x²)', '3x² * e^(2x)', '2x³ * e^(2x)', 'e^(2x) * (x³ + 3x²)'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'medium',
    explanation: 'Product rule: 3x² * e^(2x) + x³ * (2e^(2x)) = e^(2x)(2x³ + 3x²).'
  },
  {
    id: 'exp_q17',
    text: 'Differentiate y = ln(sec(x) + tan(x)).',
    options: ['sec(x)', 'tan(x)', 'sec(x)tan(x)', 'cos(x)'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'medium',
    explanation: 'y\' = (sec(x)tan(x) + sec²(x)) / (sec(x) + tan(x)) = sec(x).'
  },
  {
    id: 'exp_q18',
    text: 'Find the local minimum value of f(x) = x² - 6x + 10.',
    options: ['1 at x = 3', '10 at x = 0', '-1 at x = 3', '4 at x = 2'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'easy',
    explanation: 'f\'(x) = 2x - 6 = 0 => x = 3. f(3) = 9 - 18 + 10 = 1.'
  },
  {
    id: 'exp_q19',
    text: 'Evaluate the indefinite integral: ∫ (3x² + 2x + 1) dx.',
    options: ['x³ + x² + x + C', '3x³ + 2x² + x + C', '6x + 2 + C', 'x³ + 2x² + x + C'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'easy',
    explanation: '∫ 3x² dx = x³, ∫ 2x dx = x², ∫ 1 dx = x. Sum = x³ + x² + x + C.'
  },
  {
    id: 'exp_q20',
    text: 'Evaluate the integral: ∫ [2x / (x² + 1)] dx.',
    options: ['ln(x² + 1) + C', '2ln(x² + 1) + C', '1/(x² + 1) + C', 'arctan(x) + C'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'easy',
    explanation: 'Let u = x² + 1, du = 2x dx. ∫ (1/u) du = ln|u| + C = ln(x² + 1) + C.'
  },
  {
    id: 'exp_q21',
    text: 'Evaluate by parts: ∫ x * e^x dx.',
    options: ['e^x * (x - 1) + C', 'e^x * (x + 1) + C', 'x * e^x + C', 'e^x + C'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'medium',
    explanation: 'u = x, dv = e^x dx => du = dx, v = e^x. ∫ x e^x dx = x e^x - ∫ e^x dx = e^x(x - 1) + C.'
  },
  {
    id: 'exp_q22',
    text: 'Evaluate the definite integral: ∫[0 to 1] (4x³) dx.',
    options: ['1', '4', '1/4', '2'],
    correctOptionIndex: 0,
    topic: 'Calculus',
    difficulty: 'easy',
    explanation: '[x⁴] from 0 to 1 = 1⁴ - 0 = 1.'
  },
  {
    id: 'exp_q23',
    text: 'Solve the differential equation: dy/dx = 2xy with initial condition y(0) = 1.',
    options: ['y = e^(x²)', 'y = 2e^x - 1', 'y = x² + 1', 'y = e^(2x)'],
    correctOptionIndex: 0,
    topic: 'Differential Equations',
    difficulty: 'medium',
    explanation: 'dy/y = 2x dx => ln|y| = x² + C. At x=0, y=1 => C=0 => y = e^(x²).'
  },
  {
    id: 'exp_q24',
    text: 'Find the angle between vectors a = (1, 1, 0) and b = (0, 1, 1).',
    options: ['60° (π/3)', '45° (π/4)', '90° (π/2)', '30° (π/6)'],
    correctOptionIndex: 0,
    topic: 'Vectors',
    difficulty: 'medium',
    explanation: 'a·b = 1. |a| = √2, |b| = √2. cos(θ) = 1 / (√2 * √2) = 1/2 => θ = 60°.'
  },
  {
    id: 'exp_q25',
    text: 'Compute the magnitude of the cross product a × b where a = (2, 0, 0) and b = (0, 3, 0).',
    options: ['6', '5', '0', '12'],
    correctOptionIndex: 0,
    topic: 'Vectors',
    difficulty: 'easy',
    explanation: 'a × b = (0, 0, 6). |a × b| = 6.'
  },
  {
    id: 'exp_q26',
    text: 'Find the equation of the plane through (1, 2, 3) with normal vector n = (2, -1, 4).',
    options: ['2x - y + 4z = 12', '2x - y + 4z = 0', 'x + 2y + 3z = 12', '2x + y + 4z = 14'],
    correctOptionIndex: 0,
    topic: '3D Geometry',
    difficulty: 'medium',
    explanation: '2(x - 1) - 1(y - 2) + 4(z - 3) = 0 => 2x - y + 4z - 2 + 2 - 12 = 0 => 2x - y + 4z = 12.'
  },
  {
    id: 'exp_q27',
    text: 'If a fair 6-sided die is rolled twice, what is the probability of rolling a sum of 7?',
    options: ['1/6', '1/12', '7/36', '5/36'],
    correctOptionIndex: 0,
    topic: 'Probability',
    difficulty: 'easy',
    explanation: 'Favorable pairs: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) = 6 pairs. P = 6/36 = 1/6.'
  },
  {
    id: 'exp_q28',
    text: 'If P(A) = 0.5, P(B) = 0.4, and P(A ∩ B) = 0.2, evaluate the conditional probability P(A | B).',
    options: ['0.50', '0.40', '0.80', '0.25'],
    correctOptionIndex: 0,
    topic: 'Probability',
    difficulty: 'easy',
    explanation: 'P(A | B) = P(A ∩ B) / P(B) = 0.2 / 0.4 = 0.5.'
  },
  {
    id: 'exp_q29',
    text: 'How many distinct 3-person committees can be formed from a group of 7 candidates?',
    options: ['35', '210', '21', '42'],
    correctOptionIndex: 0,
    topic: 'Combinatorics',
    difficulty: 'easy',
    explanation: 'C(7, 3) = (7 * 6 * 5) / (3 * 2 * 1) = 35.'
  },
  {
    id: 'exp_q30',
    text: 'Find the complex modulus of z = 3 + 4i.',
    options: ['5', '7', '25', '√7'],
    correctOptionIndex: 0,
    topic: 'Complex Numbers',
    difficulty: 'easy',
    explanation: '|z| = √(3² + 4²) = √(9 + 16) = √25 = 5.'
  }
];

async function main() {
  console.log('🚀 Deploying Batch Explorer & 30-Question Real Behavior Test...');

  let configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    configPath = path.resolve(
      process.cwd(),
      'Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca',
      'firebase-applet-config.json'
    );
  }

  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `explorer_deploy_${Date.now()}`);
  const db = getFirestore(app);

  console.log(`🔥 Connected to Firestore Project: [${fbConfig.projectId}]`);

  // 1. Create Batch "Explorer" document
  console.log('📦 Step 1: Writing Batch "Explorer" metadata...');
  const batchRef = doc(db, 'batches', BATCH_ID);
  await setDoc(batchRef, {
    id: BATCH_ID,
    title: BATCH_TITLE,
    description: 'Advanced Explorer Mathematics & Analytical Problem Solving Cohort',
    category: 'MATHEMATICS',
    instructor: 'Sanju Kumar',
    price: 0,
    isEnrolled: true,
    enrolledStudentsCount: 4000,
    isPublished: true,
    status: 'published',
    chapters: [
      {
        id: 'chapter_explorer_01',
        title: 'Explorer Concept Foundation & Problem Solving',
        description: 'Core 30-question diagnostic assessments and analytical derivations',
        testIds: [TEST_ID],
        videoIds: [],
        noteIds: []
      },
      {
        id: 'chapter_explorer_02',
        title: 'Calculus, Optimization & Advanced Curves',
        description: 'Derivations, integration methods and differential modeling',
        testIds: [],
        videoIds: [],
        noteIds: []
      }
    ],
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 2. Write Roster Preview with 4,000 total students
  console.log('👥 Step 2: Writing Tier 1 preview roster with 4,000 students reported...');
  const previewStudents: Record<string, any> = {};
  for (let i = 1; i <= 500; i++) {
    const uid = `student_exp_${String(i).padStart(4, '0')}`;
    previewStudents[uid] = {
      id: uid,
      userId: uid,
      studentName: `Explorer Student ${i}`,
      studentEmail: `explorer.student${i}@exam.internal`,
      studentPhone: `+91 98765 ${String(10000 + i).slice(1)}`,
      status: 'active',
      enrolledAt: new Date(Date.now() - (4000 - i) * 60000).toISOString(),
      deviceBoundId: i % 2 === 0 ? `hw_lock_exp_${i}` : null
    };
  }
  // Include Master Sanju
  previewStudents[SANJU_UID] = {
    id: SANJU_UID,
    userId: SANJU_UID,
    studentName: 'Sanju (Master Educator)',
    studentEmail: SANJU_EMAIL,
    studentPhone: '+91 99999 88888',
    status: 'active',
    enrolledAt: new Date().toISOString(),
    deviceBoundId: 'hw_lock_master_sanju'
  };

  const rosterRef = doc(db, 'batches', BATCH_ID, 'access', 'roster');
  await setDoc(rosterRef, {
    batchId: BATCH_ID,
    totalStudents: 4000,
    totalReported: 4000,
    students: previewStudents,
    updatedAt: new Date().toISOString()
  });

  // 3. Write Test Document
  console.log('📝 Step 3: Writing 30-Question Test Document...');
  const testPayload = {
    id: TEST_ID,
    title: TEST_TITLE,
    topic: 'Advanced Mathematics & Quantitative Aptitude',
    category: 'MATHEMATICS',
    difficulty: 'medium',
    timeLimit: 45,
    durationMinutes: 45,
    totalQuestions: 30,
    totalMarks: 120,
    passingMarks: 48,
    batchId: BATCH_ID,
    enrolledBatchId: BATCH_ID,
    chapterId: 'chapter_explorer_01',
    isPublished: true,
    publishedAt: new Date().toISOString(),
    questions: QUESTIONS,
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'batches', BATCH_ID, 'tests', TEST_ID), testPayload);
  await setDoc(doc(db, 'tests', TEST_ID), testPayload);

  // 4. Generate 4,000 Realistic Student Attempts
  console.log('🧠 Step 4: Synthesizing 4,000 realistic student attempts with real behavior...');
  interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    userEmail: string;
    score: number;
    totalPoints: number;
    percentage: number;
    timeSpentSeconds: number;
    completedAt: string;
    mode: 'online' | 'omr';
    deviceBound: boolean;
  }

  interface CompactRecord {
    uid: string;
    name: string;
    email: string;
    score: number;
    percentage: number;
    durationSeconds: number;
    mode: 'online' | 'omr';
    completedAt: string;
    batchId: string;
    wrongIndices: number[];
    unattemptedIndices: number[];
  }

  const allEntries: LeaderboardEntry[] = [];
  const cohortSampleAttempts: CompactRecord[] = [];

  // Deterministic seed helper
  let seed = 42;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  let totalScoreSum = 0;
  let highestScore = 0;
  let lowestScore = 120;

  for (let i = 1; i <= 4000; i++) {
    const uid = `student_exp_${String(i).padStart(4, '0')}`;
    const name = `Explorer Student ${i}`;
    const email = `explorer.student${i}@exam.internal`;
    const mode: 'online' | 'omr' = i % 5 === 0 ? 'omr' : 'online';

    let attemptedCount: number;
    let correctCount: number;
    let wrongCount: number;
    let durationSeconds: number;

    // Realistic Category Breakdown
    if (i <= 200) {
      // Category 1: Master Scholars (Top 5%)
      attemptedCount = 28 + Math.floor(rand() * 3); // 28 - 30
      correctCount = Math.min(attemptedCount, 26 + Math.floor(rand() * 4)); // 26 - 29
      wrongCount = attemptedCount - correctCount;
      durationSeconds = 1300 + Math.floor(rand() * 550); // ~22 - 30 mins
    } else if (i <= 1000) {
      // Category 2: High Achievers (Next 20%)
      attemptedCount = 24 + Math.floor(rand() * 5); // 24 - 28
      correctCount = Math.min(attemptedCount, 19 + Math.floor(rand() * 6)); // 19 - 24
      wrongCount = attemptedCount - correctCount;
      durationSeconds = 1600 + Math.floor(rand() * 600); // ~27 - 36 mins
    } else if (i <= 2800) {
      // Category 3: Average Performers (Next 45%)
      attemptedCount = 18 + Math.floor(rand() * 7); // 18 - 24
      correctCount = Math.min(attemptedCount, 12 + Math.floor(rand() * 6)); // 12 - 17
      wrongCount = attemptedCount - correctCount;
      durationSeconds = 1900 + Math.floor(rand() * 650); // ~32 - 42 mins
    } else if (i <= 3600) {
      // Category 4: Struggling Students (Next 20%)
      attemptedCount = 12 + Math.floor(rand() * 7); // 12 - 18
      correctCount = Math.min(attemptedCount, 6 + Math.floor(rand() * 6)); // 6 - 11
      wrongCount = attemptedCount - correctCount;
      durationSeconds = 2100 + Math.floor(rand() * 550); // ~35 - 44 mins
    } else {
      // Category 5: Time-Constrained / Dropouts (Bottom 10%)
      attemptedCount = 5 + Math.floor(rand() * 8); // 5 - 12
      correctCount = Math.min(attemptedCount, 2 + Math.floor(rand() * 5)); // 2 - 6
      wrongCount = attemptedCount - correctCount;
      durationSeconds = 600 + Math.floor(rand() * 900); // ~10 - 25 mins
    }

    // Score calculation: +4 marks per correct, -1 mark per wrong, 0 for unattempted
    const rawScore = correctCount * 4 - wrongCount * 1;
    const score = Math.max(0, rawScore);
    const percentage = Number(((score / 120) * 100).toFixed(1));

    totalScoreSum += score;
    if (score > highestScore) highestScore = score;
    if (score < lowestScore) lowestScore = score;

    // Pick specific question indices
    const unattemptedIndices: number[] = [];
    const unattemptedCount = 30 - attemptedCount;
    // Leave the last questions or random questions unattempted
    for (let u = 0; u < unattemptedCount; u++) {
      unattemptedIndices.push(29 - u);
    }

    const wrongIndices: number[] = [];
    // Distribute wrong answers across attempted questions
    const attemptedIndices = Array.from({ length: 30 }, (_, idx) => idx).filter(idx => !unattemptedIndices.includes(idx));
    for (let w = 0; w < wrongCount && w < attemptedIndices.length; w++) {
      wrongIndices.push(attemptedIndices[attemptedIndices.length - 1 - w]);
    }

    const completedAt = new Date(Date.now() - (4000 - i) * 65000).toISOString();

    allEntries.push({
      rank: i,
      userId: uid,
      userName: name,
      userEmail: email,
      score,
      totalPoints: 120,
      percentage,
      timeSpentSeconds: durationSeconds,
      completedAt,
      mode,
      deviceBound: i % 2 === 0
    });

    // Store high-fidelity compact attempt record for every single student across the entire 4,000 cohort
    cohortSampleAttempts.push({
      uid,
      name,
      email,
      score,
      percentage,
      durationSeconds,
      mode,
      completedAt,
      batchId: BATCH_ID,
      wrongIndices,
      unattemptedIndices
    });
  }

  // Insert Sanju at Rank #260 (Score: 88/120, 73.3%, 27 attempted: 23 correct, 4 wrong, 3 blank)
  const sanjuStanding = {
    rank: 260,
    userId: SANJU_UID,
    userName: 'Sanju (Master Educator)',
    userEmail: SANJU_EMAIL,
    score: 88,
    totalPoints: 120,
    percentage: 73.3,
    timeSpentSeconds: 1650,
    completedAt: new Date().toISOString(),
    mode: 'online' as const,
    deviceBound: true
  };
  allEntries[259] = sanjuStanding;

  cohortSampleAttempts.push({
    uid: SANJU_UID,
    name: 'Sanju (Master Educator)',
    email: SANJU_EMAIL,
    score: 88,
    percentage: 73.3,
    durationSeconds: 1650,
    mode: 'online',
    completedAt: new Date().toISOString(),
    batchId: BATCH_ID,
    wrongIndices: [5, 11, 16, 24], // Missed Binomial, Circle, Chain Rule, Vectors
    unattemptedIndices: [13, 22, 27] // Skipped Ellipse, Diff Eq, Cond Prob
  });

  // Re-sort entries by score desc, time asc to guarantee strict continuous ranking #1 to #4000
  allEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeSpentSeconds - b.timeSpentSeconds;
  });
  allEntries.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  const avgScore = Number((totalScoreSum / 4000).toFixed(1));
  console.log(`📊 Statistics: Highest: ${highestScore}/120, Lowest: ${lowestScore}/120, Average: ${avgScore}/120 (~${((avgScore/120)*100).toFixed(1)}%)`);

  // 5. Partition into 5 Dynamic N-Buckets of 800 students each (~220 KB per bucket, safe from 1MB limit):
  // Bucket 1: 1 - 800
  // Bucket 2: 801 - 1,600
  // Bucket 3: 1,601 - 2,400
  // Bucket 4: 2,401 - 3,200
  // Bucket 5: 3,201 - 4,000
  const BUCKET_SIZE = 800;
  const TOTAL_PARTS = 5;

  const bucketsEntries = [];
  const bucketsAttempts = [];
  for (let p = 0; p < TOTAL_PARTS; p++) {
    const start = p * BUCKET_SIZE;
    const end = start + BUCKET_SIZE;
    bucketsEntries.push(allEntries.slice(start, end));
    bucketsAttempts.push(cohortSampleAttempts.slice(start, end));
  }

  console.log(`📦 Partitioning across ${TOTAL_PARTS} Dynamic N-Buckets (800 students each = 4,000 total)...`);

  const summaryMetadata = {
    testId: TEST_ID,
    canonicalId: CANONICAL_LB_ID,
    testTitle: TEST_TITLE,
    batchId: BATCH_ID,
    totalStudents: 4000,
    totalParticipants: 4000,
    totalParts: TOTAL_PARTS,
    highestScore,
    lowestScore,
    averageScore: avgScore,
    averagePercentage: Number(((avgScore / 120) * 100).toFixed(1)),
    updatedAt: new Date().toISOString()
  };

  const targetLbIds = [CANONICAL_LB_ID, TEST_ID];

  for (const lbId of targetLbIds) {
    console.log(`💾 Writing leaderboard dynamic buckets for [${lbId}]...`);
    // Summary doc
    await setDoc(doc(db, 'test_leaderboards', lbId, 'summary', 'metadata'), summaryMetadata);
    await setDoc(doc(db, 'test_leaderboards', lbId), summaryMetadata, { merge: true });

    // Buckets 1 to 5
    for (let p = 0; p < TOTAL_PARTS; p++) {
      const partIndex = p + 1;
      await setDoc(doc(db, 'test_leaderboards', lbId, 'summary', `cohort_bucket_${partIndex}`), {
        entries: bucketsEntries[p],
        attempts: bucketsAttempts[p],
        totalParticipants: 4000,
        totalParts: TOTAL_PARTS,
        partIndex,
        count: bucketsEntries[p].length,
        updatedAt: new Date().toISOString()
      });
      console.log(`   ✓ Bucket ${partIndex} written (${bucketsEntries[p].length} entries, ${bucketsAttempts[p].length} attempts)`);
    }
  }

  // Also write to batch-scoped attempt dynamic buckets
  console.log('📂 Step 5: Writing batch attempts manifest and 5 dynamic buckets...');
  const batchAttemptManifestRef = doc(db, 'batches', BATCH_ID, 'tests', TEST_ID, 'attempts', 'manifest');
  await setDoc(batchAttemptManifestRef, {
    totalAttempts: 4000,
    currentBucketIndex: TOTAL_PARTS,
    totalBuckets: TOTAL_PARTS,
    updatedAt: new Date().toISOString()
  });

  for (let p = 0; p < TOTAL_PARTS; p++) {
    const bucketNum = p + 1;
    await setDoc(doc(db, 'batches', BATCH_ID, 'tests', TEST_ID, 'attempts', `bucket_${bucketNum}`), {
      bucketIndex: bucketNum,
      attempts: bucketsAttempts[p],
      count: bucketsAttempts[p].length,
      updatedAt: new Date().toISOString()
    });
  }

  // Touch master_catalog beacon to bust client cache
  console.log('📡 Step 6: Invalidation beacon update...');
  await setDoc(doc(db, 'master_catalog', 'batch_catalog_meta'), {
    lastUpdated: Date.now(),
    updatedAt: new Date().toISOString(),
    event: 'explorer_batch_and_30q_test_published',
    batchId: BATCH_ID
  }, { merge: true });

  console.log('\n✅ Explorer Batch, 30-Question Test & 4,000 Real Attempts Deployed Successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error deploying Explorer batch and test:', err);
  process.exit(1);
});
