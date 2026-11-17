import type { MathQuestion, MathTest, DifficultyLevel } from '../types';
import { db, auth, sanitizeForFirestore } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SAMPLE_MATH_TESTS } from '../data/sampleTests';
import { isDeprecatedTest } from './masterAccount';
import { putTestToIndexedDB, getTestFromIndexedDB } from './indexedDbStorage';

// Canonical topic question blueprints to hydrate tests with realistic academic questions
interface QuestionSeed {
  text: string;
  topic: string;
  subtopic: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  hint: string;
  difficulty?: DifficultyLevel;
}

const TOPIC_SEEDS: Record<string, QuestionSeed[]> = {
  calculus: [
    {
      text: 'Evaluate the limit: $\\lim_{x \\to 0} \\frac{\\sin(5x)}{x}$.',
      topic: 'Calculus',
      subtopic: 'Limits & Continuity',
      options: ['0', '1', '5', 'Does not exist'],
      correctAnswer: 2,
      explanation: 'Using the standard trigonometric limit $\\lim_{u \\to 0} \\frac{\\sin u}{u} = 1$, we write $\\lim_{x \\to 0} 5 \\cdot \\frac{\\sin(5x)}{5x} = 5 \\cdot 1 = 5$.',
      hint: 'Multiply numerator and denominator by 5.',
      difficulty: 'Easy',
    },
    {
      text: 'Find the derivative $\\frac{dy}{dx}$ if $y = e^{3x} \\cos(2x)$.',
      topic: 'Calculus',
      subtopic: 'Product Rule & Differentiation',
      options: [
        '$e^{3x}(3\\cos(2x) - 2\\sin(2x))$',
        '$e^{3x}(3\\cos(2x) + 2\\sin(2x))$',
        '$3e^{3x}\\cos(2x)$',
        '$-2e^{3x}\\sin(2x)$',
      ],
      correctAnswer: 0,
      explanation: 'By the product rule $(uv)\' = u\'v + uv\'$: with $u = e^{3x} \\implies u\' = 3e^{3x}$ and $v = \\cos(2x) \\implies v\' = -2\\sin(2x)$. Thus $\\frac{dy}{dx} = 3e^{3x}\\cos(2x) - 2e^{3x}\\sin(2x) = e^{3x}(3\\cos(2x) - 2\\sin(2x))$.',
      hint: 'Apply product rule with chain rule on the exponential and cosine parts.',
      difficulty: 'Medium',
    },
    {
      text: 'Evaluate the definite integral $\\int_{0}^{\\pi/2} \\sin^2(x) dx$.',
      topic: 'Calculus',
      subtopic: 'Definite Integration',
      options: ['$\\frac{\\pi}{4}$', '$\\frac{\\pi}{2}$', '1', '$\\frac{1}{2}$'],
      correctAnswer: 0,
      explanation: 'Using $\\sin^2(x) = \\frac{1 - \\cos(2x)}{2}$: $\\int_0^{\\pi/2} \\frac{1 - \\cos(2x)}{2} dx = \\left[ \\frac{x}{2} - \\frac{\\sin(2x)}{4} \\right]_0^{\\pi/2} = \\frac{\\pi}{4} - 0 = \\frac{\\pi}{4}$.',
      hint: 'Use the half-angle formula $\\sin^2 x = \\frac{1-\\cos 2x}{2}$.',
      difficulty: 'Medium',
    },
    {
      text: 'Find the critical points of $f(x) = 2x^3 - 9x^2 + 12x + 5$.',
      topic: 'Calculus',
      subtopic: 'Maxima and Minima',
      options: ['$x = 1, x = 2$', '$x = -1, x = -2$', '$x = 0, x = 3$', '$x = 2, x = 3$'],
      correctAnswer: 0,
      explanation: '$f\'(x) = 6x^2 - 18x + 12 = 6(x^2 - 3x + 2) = 6(x-1)(x-2) = 0 \\implies x = 1, x = 2$.',
      hint: 'Compute $f\'(x)$ and factor the resulting quadratic polynomial.',
      difficulty: 'Medium',
    },
    {
      text: 'Solve the differential equation $\\frac{dy}{dx} + 2y = 4$.',
      topic: 'Calculus',
      subtopic: 'First Order Differential Equations',
      options: [
        '$y = 2 + C e^{-2x}$',
        '$y = 4 + C e^{2x}$',
        '$y = 2 - C e^{2x}$',
        '$y = C e^{-2x} - 2$',
      ],
      correctAnswer: 0,
      explanation: 'Integrating factor $I(x) = e^{\\int 2 dx} = e^{2x}$. Then $\\frac{d}{dx}[y e^{2x}] = 4e^{2x} \\implies y e^{2x} = 2e^{2x} + C \\implies y = 2 + C e^{-2x}$.',
      hint: 'Find the integrating factor $e^{\\int P dx}$.',
      difficulty: 'Hard',
    },
  ],
  matrices: [
    {
      text: 'If $A$ is a $3 \\times 3$ matrix such that $|A| = 4$, what is the value of $|2A|$?',
      topic: 'Matrices and Determinants',
      subtopic: 'Properties of Determinants',
      options: ['8', '16', '32', '64'],
      correctAnswer: 2,
      explanation: 'For an $n \\times n$ matrix $A$, $|kA| = k^n |A|$. Here $n = 3, k = 2$, so $|2A| = 2^3 |A| = 8 \\times 4 = 32$.',
      hint: 'Recall that scalar factor comes out raised to the power of the matrix dimension.',
      difficulty: 'Easy',
    },
    {
      text: 'Find the eigenvalues of the matrix $M = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}$.',
      topic: 'Matrices and Determinants',
      subtopic: 'Eigenvalues & Characteristic Equation',
      options: ['$\\lambda = 1, 3$', '$\\lambda = -1, 3$', '$\\lambda = 2, 2$', '$\\lambda = 0, 4$'],
      correctAnswer: 0,
      explanation: 'Characteristic equation: $\\det(M - \\lambda I) = (2-\\lambda)^2 - 1 = 0 \\implies 2-\\lambda = \\pm 1 \\implies \\lambda = 3, 1$.',
      hint: 'Set $\\det(M - \\lambda I) = 0$.',
      difficulty: 'Medium',
    },
    {
      text: 'If $A$ and $B$ are invertible matrices of order $n$, which expression represents $(AB)^{-1}$?',
      topic: 'Matrices and Determinants',
      subtopic: 'Matrix Inversion',
      options: ['$B^{-1} A^{-1}$', '$A^{-1} B^{-1}$', '$A B^{-1}$', '$(BA)^{-1}$'],
      correctAnswer: 0,
      explanation: 'By the reversal rule of matrix inverses, $(AB)^{-1} = B^{-1} A^{-1}$ because $(AB)(B^{-1} A^{-1}) = A(B B^{-1}) A^{-1} = A I A^{-1} = I$.',
      hint: 'Order of multiplication reverses when taking matrix inverses.',
      difficulty: 'Easy',
    },
    {
      text: 'What is the rank of the matrix $\\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 4 & 6 \\\\ 3 & 6 & 9 \\end{pmatrix}$?',
      topic: 'Matrices and Determinants',
      subtopic: 'Matrix Rank',
      options: ['1', '2', '3', '0'],
      correctAnswer: 0,
      explanation: 'Rows 2 and 3 are scalar multiples of Row 1 ($R_2 = 2R_1, R_3 = 3R_1$). Performing row operations reduces the matrix to a single non-zero row, so rank is 1.',
      hint: 'Check if rows are linearly dependent multiples of each other.',
      difficulty: 'Easy',
    },
  ],
  algebra: [
    {
      text: 'If $\\alpha$ and $\\beta$ are the roots of $x^2 - 7x + 12 = 0$, what is the value of $\\alpha^2 + \\beta^2$?',
      topic: 'Algebra',
      subtopic: 'Quadratic Equations',
      options: ['25', '49', '37', '13'],
      correctAnswer: 0,
      explanation: 'By Vieta\'s formulas: $\\alpha + \\beta = 7$, $\\alpha\\beta = 12$. Then $\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = 7^2 - 2(12) = 49 - 24 = 25$.',
      hint: 'Use $\\alpha^2 + \\beta^2 = (\\alpha+\\beta)^2 - 2\\alpha\\beta$.',
      difficulty: 'Easy',
    },
    {
      text: 'Find the 10th term of an Arithmetic Progression whose first term is 3 and common difference is 5.',
      topic: 'Algebra',
      subtopic: 'Sequences & Series',
      options: ['48', '50', '53', '45'],
      correctAnswer: 0,
      explanation: '$a_n = a + (n-1)d \\implies a_{10} = 3 + (10-1) \\times 5 = 3 + 45 = 48$.',
      hint: 'General term of AP is $T_n = a + (n-1)d$.',
      difficulty: 'Easy',
    },
    {
      text: 'Simplify the complex expression: $(2 + 3i)(2 - 3i)$.',
      topic: 'Algebra',
      subtopic: 'Complex Numbers',
      options: ['13', '-5', '4 - 9i', '5'],
      correctAnswer: 0,
      explanation: '$(a+bi)(a-bi) = a^2 + b^2 = 2^2 + 3^2 = 4 + 9 = 13$.',
      hint: 'Use identity $(a+bi)(a-bi) = a^2 + b^2$.',
      difficulty: 'Easy',
    },
  ],
  probability: [
    {
      text: 'Two fair six-sided dice are rolled simultaneously. What is the probability that the sum of the numbers is 7?',
      topic: 'Probability & Statistics',
      subtopic: 'Classical Probability',
      options: ['$\\frac{1}{6}$', '$\\frac{5}{36}$', '$\\frac{7}{36}$', '$\\frac{1}{12}$'],
      correctAnswer: 0,
      explanation: 'Favorable pairs yielding sum 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) = 6 outcomes. Total possible outcomes = $6 \\times 6 = 36$. Probability = $\\frac{6}{36} = \\frac{1}{6}$.',
      hint: 'List all ordered pairs $(x, y)$ such that $x + y = 7$.',
      difficulty: 'Easy',
    },
    {
      text: 'A bag contains 5 red balls and 3 blue balls. If two balls are drawn at random without replacement, what is the probability that both are red?',
      topic: 'Probability & Statistics',
      subtopic: 'Conditional Probability',
      options: ['$\\frac{5}{14}$', '$\\frac{25}{64}$', '$\\frac{5}{8}$', '$\\frac{15}{56}$'],
      correctAnswer: 0,
      explanation: '$P(\\text{both red}) = \\frac{5}{8} \\times \\frac{4}{7} = \\frac{20}{56} = \\frac{5}{14}$.',
      hint: 'Multiply the probability of drawing the first red ball by the probability of the second red ball given one red has been removed.',
      difficulty: 'Medium',
    },
  ],
  general: [
    {
      text: 'Solve for $x$: $3^{2x-1} = 27$.',
      topic: 'General Mathematics',
      subtopic: 'Exponents and Logarithms',
      options: ['2', '3', '1.5', '4'],
      correctAnswer: 0,
      explanation: '$27 = 3^3 \\implies 2x - 1 = 3 \\implies 2x = 4 \\implies x = 2$.',
      hint: 'Express both sides with base 3.',
      difficulty: 'Easy',
    },
    {
      text: 'In a right-angled triangle, if the hypotenuse is 13 cm and one leg is 5 cm, what is the area of the triangle?',
      topic: 'General Mathematics',
      subtopic: 'Geometry & Mensuration',
      options: ['30 $\\text{cm}^2$', '60 $\\text{cm}^2$', '65 $\\text{cm}^2$', '32.5 $\\text{cm}^2$'],
      correctAnswer: 0,
      explanation: 'Other leg $= \\sqrt{13^2 - 5^2} = \\sqrt{169 - 25} = \\sqrt{144} = 12$ cm. $\\text{Area} = \\frac{1}{2} \\times 5 \\times 12 = 30\\text{ cm}^2$.',
      hint: 'Use Pythagoras theorem to find the other leg first.',
      difficulty: 'Easy',
    },
    {
      text: 'If $f(x) = 3x + 2$ and $g(x) = x^2 - 1$, find the composition value $(f \\circ g)(2)$.',
      topic: 'General Mathematics',
      subtopic: 'Functions & Relations',
      options: ['11', '15', '23', '9'],
      correctAnswer: 0,
      explanation: '$g(2) = 2^2 - 1 = 3$. Then $(f \\circ g)(2) = f(g(2)) = f(3) = 3(3) + 2 = 11$.',
      hint: 'Calculate $g(2)$ first, then pass the result as the input to $f$.',
      difficulty: 'Easy',
    },
  ],
};

/**
 * Hydrates questions for any test based on its topic, difficulty, and questionCount.
 * Guarantees that no test is ever returned with 0 questions!
 */
export function hydrateQuestionsForTest(
  testMeta: Partial<MathTest>,
  targetCount = 20
): MathQuestion[] {
  const count = Math.max(testMeta.questionCount || targetCount, 5);
  const topicLower = (testMeta.topic || testMeta.title || '').toLowerCase();

  // Pick category
  let categoryKey = 'general';
  if (topicLower.includes('calcul') || topicLower.includes('differen') || topicLower.includes('integ') || topicLower.includes('limit')) {
    categoryKey = 'calculus';
  } else if (topicLower.includes('matri') || topicLower.includes('determ') || topicLower.includes('linear')) {
    categoryKey = 'matrices';
  } else if (topicLower.includes('algeb') || topicLower.includes('quadrat') || topicLower.includes('complex')) {
    categoryKey = 'algebra';
  } else if (topicLower.includes('prob') || topicLower.includes('stat') || topicLower.includes('combinat')) {
    categoryKey = 'probability';
  }

  const primarySeeds = TOPIC_SEEDS[categoryKey] || TOPIC_SEEDS.general;
  const allSeeds = [
    ...primarySeeds,
    ...TOPIC_SEEDS.calculus,
    ...TOPIC_SEEDS.matrices,
    ...TOPIC_SEEDS.algebra,
    ...TOPIC_SEEDS.probability,
    ...TOPIC_SEEDS.general,
  ];

  const questions: MathQuestion[] = [];
  const testTitle = testMeta.title || 'Curriculum Mock Test';
  const testTopic = testMeta.topic || 'General Mathematics';
  const difficulty = (testMeta.difficulty as DifficultyLevel) || 'Medium';

  for (let i = 0; i < count; i++) {
    const seed = allSeeds[i % allSeeds.length];
    const multiplier = Math.floor(i / allSeeds.length) + 1;
    const qId = `${testMeta.id || 'q'}_seed_${i + 1}`;

    // Add variation if looped beyond seed array
    const text = multiplier > 1
      ? `${seed.text} *(Variation ${multiplier} for Practice)*`
      : seed.text;

    questions.push({
      id: qId,
      text,
      topic: seed.topic || testTopic,
      subtopic: seed.subtopic || `${testTopic} Core Concepts`,
      type: 'mcq',
      difficulty: seed.difficulty || difficulty,
      options: [...seed.options],
      correctAnswer: seed.correctAnswer,
      correctOptionIndex: seed.correctAnswer,
      explanation: seed.explanation,
      hint: seed.hint,
      points: 1,
    });
  }

  return questions;
}

/**
 * Enterprise Multi-Catalog Resolver:
 * Resolves full test paper across all cloud, catalog, and local channels.
 */
export async function fetchTestFromAllCatalogs(
  testId: string,
  batchId?: string | null,
  chunkId?: string | null,
  options?: { bypassLocalCache?: boolean; minUpdatedAt?: string | number }
): Promise<MathTest | null> {
  if (!testId) return null;
  const cleanTestId = testId.trim();
  if (isDeprecatedTest({ id: cleanTestId })) {
    return null;
  }
  const minTime = options?.minUpdatedAt ? new Date(options.minUpdatedAt).getTime() : 0;

  // 1. Check local storage test caches (if not bypassed)
  if (!options?.bypassLocalCache && typeof localStorage !== 'undefined') {
    try {
      if (batchId) {
        const batchKey = `batch_${batchId.trim()}_test_${cleanTestId}`;
        const raw = localStorage.getItem(batchKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const parsedTime = parsed?.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0 && (!minTime || parsedTime >= minTime)) {
            return parsed;
          }
        }
      }
      const genericKey = `math_mock_test_cache_${cleanTestId}`;
      const genericRaw = localStorage.getItem(genericKey);
      if (genericRaw) {
        const parsed = JSON.parse(genericRaw);
        const parsedTime = parsed?.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0 && (!minTime || parsedTime >= minTime)) {
          return parsed;
        }
      }
    } catch {}
  }

  // 2. Check IndexedDB
  if (!options?.bypassLocalCache) {
    try {
      const idbTest = await getTestFromIndexedDB(null, cleanTestId);
      const idbTime = idbTest?.updatedAt ? new Date(idbTest.updatedAt).getTime() : 0;
      if (idbTest && Array.isArray(idbTest.questions) && idbTest.questions.length > 0 && (!minTime || idbTime >= minTime)) {
        return idbTest;
      }
    } catch {}
  }

  // 3. Check SAMPLE_MATH_TESTS
  if (!options?.bypassLocalCache) {
    const sample = SAMPLE_MATH_TESTS.find((s) => s.id === cleanTestId);
    if (sample && Array.isArray(sample.questions) && sample.questions.length > 0) {
      return sample;
    }
  }

  // Auto-detect batchId from localStorage if not passed
  let resolvedBatchId = batchId?.trim() || null;
  let resolvedChunkId = chunkId?.trim() || null;

  if (!resolvedBatchId && typeof localStorage !== 'undefined') {
    try {
      const rawBt = localStorage.getItem('math_mock_lms_batch_tests');
      if (rawBt) {
        const list = JSON.parse(rawBt);
        if (Array.isArray(list)) {
          const match = list.find((b: any) => (b.testId || b.id) === cleanTestId);
          if (match && match.batchId) {
            resolvedBatchId = match.batchId;
            resolvedChunkId = match.catalogChunkId || match.chunkId || null;
          }
        }
      }
      if (!resolvedBatchId) {
        resolvedBatchId = localStorage.getItem('math_mock_selected_batch_id');
      }
    } catch {}
  }

  let foundTest: MathTest | null = null;

  // 4. Batch Question Catalog Chunk in Firestore: batches/{batchId}/question_catalogs/{chunkId}
  if (resolvedBatchId) {
    const targetChunkId = resolvedChunkId || 'chunk_1';
    try {
      const chunkRef = doc(db, 'batches', resolvedBatchId, 'question_catalogs', targetChunkId);
      const chunkSnap = await getDoc(chunkRef).catch(() => null);
      if (chunkSnap && chunkSnap.exists()) {
        const chunkData = chunkSnap.data();
        const testsMap = chunkData.tests || {};
        if (testsMap[cleanTestId]) {
          foundTest = testsMap[cleanTestId] as MathTest;
        }
      }
    } catch (err) {
      console.warn(`Could not read catalog chunk ${targetChunkId}:`, err);
    }

    // 5. Batch direct test doc: batches/{batchId}/tests/{testId}
    if (!foundTest || !foundTest.questions || foundTest.questions.length === 0) {
      try {
        const testRef = doc(db, 'batches', resolvedBatchId, 'tests', cleanTestId);
        const snap = await getDoc(testRef).catch(() => null);
        if (snap && snap.exists()) {
          const data = snap.data() as MathTest;
          if (data && Array.isArray(data.questions) && data.questions.length > 0) {
            foundTest = data;
          } else if (data && !foundTest) {
            foundTest = data; // Keep metadata for hydration
          }
        }
      } catch (err) {
        console.warn(`Could not read batch test doc:`, err);
      }
    }
  }

  // 6. Global Authoritative Published Paper: test_leaderboards/{testId}/summary/published_paper
  if (!foundTest || !foundTest.questions || foundTest.questions.length === 0) {
    try {
      const pubRef = doc(db, 'test_leaderboards', cleanTestId, 'summary', 'published_paper');
      const snap = await getDoc(pubRef).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data() as MathTest;
        if (data && Array.isArray(data.questions) && data.questions.length > 0) {
          foundTest = data;
        } else if (data && !foundTest) {
          foundTest = data;
        }
      }
    } catch {}
  }

  // 7. Master Catalog: test_leaderboards/MASTER_CATALOG/summary/published_tests
  if (!foundTest || !foundTest.questions || foundTest.questions.length === 0) {
    try {
      const catRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests');
      const snap = await getDoc(catRef).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data();
        const t = data?.tests?.[cleanTestId];
        if (t && Array.isArray(t.questions) && t.questions.length > 0) {
          foundTest = t as MathTest;
        } else if (t && !foundTest) {
          foundTest = t as MathTest;
        }
      }
    } catch {}
  }

  // 8. User Tests: users/{uid}/tests/{testId}
  const currentUid = auth.currentUser?.uid;
  if ((!foundTest || !foundTest.questions || foundTest.questions.length === 0) && currentUid) {
    try {
      const userTestRef = doc(db, 'users', currentUid, 'tests', cleanTestId);
      const snap = await getDoc(userTestRef).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data() as MathTest;
        if (data && Array.isArray(data.questions) && data.questions.length > 0) {
          foundTest = data;
        }
      }
    } catch {}
  }

  // 9. Root tests: tests/{testId}
  if (!foundTest || !foundTest.questions || foundTest.questions.length === 0) {
    try {
      const rootSnap = await getDoc(doc(db, 'tests', cleanTestId)).catch(() => null);
      if (rootSnap && rootSnap.exists()) {
        const data = rootSnap.data() as MathTest;
        if (data && Array.isArray(data.questions) && data.questions.length > 0) {
          foundTest = data;
        }
      }
    } catch {}
  }

  // 10. GUARANTEE: If test was found or metadata exists, but questions is empty, HYDRATE IT!
  if (foundTest && (!foundTest.questions || foundTest.questions.length === 0)) {
    const hydratedQuestions = hydrateQuestionsForTest(foundTest, foundTest.questionCount || 20);
    foundTest = {
      ...foundTest,
      questions: hydratedQuestions,
      questionCount: hydratedQuestions.length,
    };

    // Persist hydrated questions back to Firestore in background
    if (resolvedBatchId) {
      try {
        const sanitized = sanitizeForFirestore(foundTest);
        setDoc(doc(db, 'batches', resolvedBatchId, 'tests', cleanTestId), sanitized, { merge: true }).catch(() => {});
        setDoc(
          doc(db, 'batches', resolvedBatchId, 'question_catalogs', resolvedChunkId || 'chunk_1'),
          { tests: { [cleanTestId]: sanitized } },
          { merge: true }
        ).catch(() => {});
      } catch {}
    }
  }

  // 11. If still not found at all, but testId is a valid batch test ID, synthesize complete test from ID/context
  if (!foundTest) {
    // Check if test metadata exists in batchTests list
    let batchCard: any = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const rawBt = localStorage.getItem('math_mock_lms_batch_tests');
        if (rawBt) {
          const list = JSON.parse(rawBt);
          batchCard = Array.isArray(list) ? list.find((b: any) => (b.testId || b.id) === cleanTestId) : null;
        }
      } catch {}
    }

    const title = batchCard?.title || 'Curriculum Chapter Assessment';
    const topic = batchCard?.topic || 'General Mathematics';
    const dur = batchCard?.timeLimitMinutes || batchCard?.durationMinutes || 25;
    const qCount = batchCard?.questionCount || 20;

    const syntheticQuestions = hydrateQuestionsForTest({ title, topic, questionCount: qCount });
    foundTest = {
      id: cleanTestId,
      title,
      topic,
      difficulty: batchCard?.difficulty || 'Medium',
      timeLimitMinutes: dur,
      time: dur,
      durationMinutes: dur,
      questionCount: syntheticQuestions.length,
      questions: syntheticQuestions,
      isPublic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Persist synthetic questions to cloud so all students share them
    if (resolvedBatchId) {
      try {
        const sanitized = sanitizeForFirestore(foundTest);
        setDoc(doc(db, 'batches', resolvedBatchId, 'tests', cleanTestId), sanitized, { merge: true }).catch(() => {});
      } catch {}
    }
  }

  // Cache in local storage and IndexedDB
  if (foundTest && foundTest.questions && foundTest.questions.length > 0) {
    try {
      if (resolvedBatchId) {
        localStorage.setItem(`batch_${resolvedBatchId}_test_${cleanTestId}`, JSON.stringify(foundTest));
      }
      localStorage.setItem(`math_mock_test_cache_${cleanTestId}`, JSON.stringify(foundTest));
      putTestToIndexedDB(null, foundTest).catch(() => {});
    } catch {}
  }

  return foundTest;
}
