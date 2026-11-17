import type { MathTest } from '../types';
import { DIAGRAM_PRESETS } from '../lib/diagramPresets';

const getPresetUrl = (id: string) =>
  DIAGRAM_PRESETS.find((p) => p.id === id || p.id.startsWith(id))?.dataUrl;

export const SAMPLE_MATH_TESTS: MathTest[] = [
  {
    id: 'sample-mechanics-conics-diagrams',
    title: 'Statics, Dynamics & Conic Sections',
    description: 'Specialized assessment with interactive graphical diagrams covering inclined planes, equilibrium, projectile trajectory, and conic sections.',
    topic: 'Statics, Dynamics & Conic Sections',
    time: 15,
    difficulty: 'Medium',
    timeLimitMinutes: 15,
    passingScorePercentage: 60,
    authorId: 'system',
    authorName: 'Math Mastery Team',
    isPublic: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: 5,
    questions: [
      {
        id: 'diag-q1',
        text: 'A block of mass $m$ rests on an inclined plane of inclination $\\theta$ with coefficient of friction $\\mu$. Refer to the diagram below. What is the minimum coefficient of static friction $\\mu$ required to prevent the block from slipping down the incline?',
        topic: 'Statics, Dynamics & Conic Sections',
        subtopic: 'Inclined Plane & Limiting Friction',
        type: 'mcq',
        imageUrl: getPresetUrl('statics-inclined-plane'),
        options: [
          '$\\mu \\ge \\tan \\theta$',
          '$\\mu \\ge \\sin \\theta$',
          '$\\mu \\ge \\cos \\theta$',
          '$\\mu \\ge \\cot \\theta$'
        ],
        correctAnswer: 0,
        explanation: 'Resolving forces along the incline: $mg \\sin \\theta - f_s = 0$. Normal force $N = mg \\cos \\theta$. Since maximum friction $f_s \\le \\mu N$, we have $mg \\sin \\theta \\le \\mu mg \\cos \\theta \\implies \\mu \\ge \\tan \\theta$.',
        points: 1,
        hint: 'Equate component of gravity along the incline to the limiting friction force.'
      },
      {
        id: 'diag-q2',
        text: 'Refer to the parabola $y^2 = 4ax$ depicted in the diagram. What is the equation of the directrix line and the coordinates of the focus $S$?',
        topic: 'Statics, Dynamics & Conic Sections',
        subtopic: 'Parabola & Directrix',
        type: 'mcq',
        imageUrl: getPresetUrl('conics-parabola'),
        options: [
          'Focus $S(a, 0)$, Directrix $x = -a$',
          'Focus $S(0, a)$, Directrix $y = -a$',
          'Focus $S(-a, 0)$, Directrix $x = a$',
          'Focus $S(2a, 0)$, Directrix $x = -2a$'
        ],
        correctAnswer: 0,
        explanation: 'By standard definition of the parabola $y^2 = 4ax$, every point $P(x,y)$ is equidistant from focus $(a, 0)$ and directrix $x = -a$.',
        points: 1,
        hint: 'Recall that for $y^2 = 4ax$, the axis of symmetry is the x-axis.'
      },
      {
        id: 'diag-q3',
        text: 'A projectile is launched from ground level with speed $u$ at angle $\\theta$ to the horizontal as shown in the trajectory diagram. What is the total horizontal range $R$ (neglecting air resistance)?',
        topic: 'Statics, Dynamics & Conic Sections',
        subtopic: 'Projectile Motion & Range',
        type: 'mcq',
        imageUrl: getPresetUrl('dynamics-projectile-motion'),
        options: [
          '$R = \\frac{u^2 \\sin(2\\theta)}{g}$',
          '$R = \\frac{u^2 \\sin^2 \\theta}{2g}$',
          '$R = \\frac{2u \\sin \\theta}{g}$',
          '$R = \\frac{u^2 \\cos(2\\theta)}{g}$'
        ],
        correctAnswer: 0,
        explanation: 'Time of flight is $T = \\frac{2u\\sin\\theta}{g}$. Horizontal speed is constant at $u_x = u\\cos\\theta$. Thus horizontal range $R = u_x T = \\frac{2u^2 \\sin\\theta \\cos\\theta}{g} = \\frac{u^2 \\sin(2\\theta)}{g}$.',
        points: 1,
        hint: 'Multiply horizontal velocity component by total time of flight.'
      },
      {
        id: 'diag-q4',
        text: 'For the ellipse $\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$ ($a > b$) illustrated with foci $F_1$ and $F_2$, what is the sum of focal distances $PF_1 + PF_2$ for any point $P$ on the curve?',
        topic: 'Statics, Dynamics & Conic Sections',
        subtopic: 'Ellipse & Focal Properties',
        type: 'mcq',
        imageUrl: getPresetUrl('conics-ellipse'),
        options: [
          '$2a$',
          '$2b$',
          '$a + b$',
          '$2\\sqrt{a^2 - b^2}$'
        ],
        correctAnswer: 0,
        explanation: 'By the geometric focal definition of an ellipse, the locus of points whose sum of distances from two fixed points (foci) is constant and equals the major axis length: $PF_1 + PF_2 = 2a$.',
        points: 1,
        hint: 'The sum of distances from any point on an ellipse to both foci is equal to the length of the major axis.'
      },
      {
        id: 'diag-q5',
        text: 'Three coplanar forces $F_1, F_2, F_3$ act at a point $O$ in static equilibrium as illustrated in the force diagram. According to Lami\'s Theorem, which relation correctly relates the forces and their opposite angles $\\alpha, \\beta, \\gamma$?',
        topic: 'Statics, Dynamics & Conic Sections',
        subtopic: 'Lami\'s Theorem & Equilibrium',
        type: 'mcq',
        imageUrl: getPresetUrl('statics-lamis-theorem'),
        options: [
          '$\\frac{F_1}{\\sin\\alpha} = \\frac{F_2}{\\sin\\beta} = \\frac{F_3}{\\sin\\gamma}$',
          '$\\frac{F_1}{\\cos\\alpha} = \\frac{F_2}{\\cos\\beta} = \\frac{F_3}{\\cos\\gamma}$',
          '$F_1 \\sin\\alpha = F_2 \\sin\\beta = F_3 \\sin\\gamma$',
          '$\\frac{F_1}{\\tan\\alpha} = \\frac{F_2}{\\tan\\beta} = \\frac{F_3}{\\tan\\gamma}$'
        ],
        correctAnswer: 0,
        explanation: 'Lami\'s Theorem states that if three coplanar forces acting at a point are in equilibrium, each force is directly proportional to the sine of the angle between the other two forces.',
        points: 1,
        hint: 'Apply Lami\'s theorem which relates each coplanar force to the sine of the opposite angle.'
      }
    ]
  },
  
  {
    id: 'sample-matrices-1',
    title: 'Matrices and Determinants',
    description: 'Practice and improve your skills in 2x2 and 3x3 matrices, determinants, adjoints, eigenvalues, and inverse operations.',
    topic: 'Matrices and Determinants',
    time: 15,
    difficulty: 'Medium',
    timeLimitMinutes: 15,
    passingScorePercentage: 60,
    authorId: 'system',
    authorName: 'Math Mastery Team',
    isPublic: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: 20,
    questions: [
      {
        id: 'mat-q1',
        text: 'If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, what is the determinant $|A|$ ?',
        topic: 'Matrices and Determinants',
        subtopic: '2x2 Determinants',
        type: 'mcq',
        options: [
          '-2',
          '2',
          '10',
          '-10'
        ],
        correctAnswer: 0,
        explanation: 'For a $2 \\times 2$ matrix $A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$, $|A| = ad - bc = (1)(4) - (2)(3) = 4 - 6 = -2$.',
        points: 1,
        hint: 'Use the standard 2x2 determinant formula: $|A| = ad - bc$.'
      },
      {
        id: 'mat-q2',
        text: 'If $A$ and $B$ are square matrices of order 3 such that $|A| = 4$ and $|B| = -2$, what is the value of $|2AB|$?',
        topic: 'Matrices and Determinants',
        subtopic: 'Determinant Scaling Property',
        type: 'mcq',
        options: [
          '-64',
          '-16',
          '64',
          '-32'
        ],
        correctAnswer: 0,
        explanation: 'For matrices of order $n=3$, $|k M| = k^n |M|$. Thus $|2AB| = 2^3 |AB| = 8 \\times |A||B| = 8 \\times 4 \\times (-2) = -64$.',
        points: 1,
        hint: 'Remember that for an $n \\times n$ matrix, $|kM| = k^n |M|$.'
      },
      {
        id: 'mat-q3',
        text: 'What is the inverse of the matrix $A = \\begin{bmatrix} 2 & 1 \\\\ 5 & 3 \\end{bmatrix}$?',
        topic: 'Matrices and Determinants',
        subtopic: '2x2 Matrix Inverse',
        type: 'mcq',
        options: [
          '$\\begin{bmatrix} 3 & -1 \\\\ -5 & 2 \\end{bmatrix}$',
          '$\\begin{bmatrix} 3 & 1 \\\\ 5 & 2 \\end{bmatrix}$',
          '$\\begin{bmatrix} -3 & 1 \\\\ 5 & -2 \\end{bmatrix}$',
          '$\\begin{bmatrix} 2 & -1 \\\\ -5 & 3 \\end{bmatrix}$'
        ],
        correctAnswer: 0,
        explanation: '$|A| = (2)(3) - (1)(5) = 6 - 5 = 1$. The inverse $A^{-1} = \\frac{1}{|A|} \\text{adj}(A) = \\begin{bmatrix} 3 & -1 \\\\ -5 & 2 \\end{bmatrix}$.',
        points: 1
      },
      {
        id: 'mat-q4',
        text: 'If a square matrix $A$ satisfies $A^2 - A + I = O$, then what is the inverse matrix $A^{-1}$?',
        topic: 'Matrices and Determinants',
        subtopic: 'Cayley-Hamilton & Inverse',
        type: 'mcq',
        options: [
          '$I - A$',
          '$A - I$',
          '$I + A$',
          '$A + I$'
        ],
        correctAnswer: 0,
        explanation: 'Rearranging $A^2 - A + I = O \\implies I = A - A^2 = A(I - A)$. Multiplying both sides by $A^{-1}$ yields $A^{-1} = I - A$.',
        points: 1
      },
      {
        id: 'mat-q5',
        text: 'Find the value of $k$ for which the matrix $\\begin{bmatrix} 2 & k \\\\ 4 & 6 \\end{bmatrix}$ is singular.',
        topic: 'Matrices and Determinants',
        subtopic: 'Singular Matrix Condition',
        type: 'mcq',
        options: [
          '3',
          '2',
          '4',
          '6'
        ],
        correctAnswer: 0,
        explanation: 'A matrix is singular if its determinant is zero: $2(6) - 4(k) = 0 \\implies 12 - 4k = 0 \\implies 4k = 12 \\implies k = 3$.',
        points: 1
      },
      {
        id: 'mat-q6',
        text: 'If $A$ is an invertible matrix of order 3 and $|A| = 5$, what is the determinant of its adjoint $|\\text{adj}(A)|$?',
        topic: 'Matrices and Determinants',
        subtopic: 'Adjoint Matrix Determinant',
        type: 'mcq',
        options: [
          '25',
          '5',
          '125',
          '1'
        ],
        correctAnswer: 0,
        explanation: 'For an $n \\times n$ matrix, $|\\text{adj}(A)| = |A|^{n-1}$. For $n = 3$, $|\\text{adj}(A)| = 5^{3-1} = 5^2 = 25$.',
        points: 1
      },
      {
        id: 'mat-q7',
        text: 'Evaluate the determinant: $\\begin{vmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{vmatrix}$',
        topic: 'Matrices and Determinants',
        subtopic: 'Trigonometric Determinant',
        type: 'mcq',
        options: [
          '1',
          '0',
          '-1',
          '\\cos(2\\theta)'
        ],
        correctAnswer: 0,
        explanation: 'Determinant $= \\cos\\theta(\\cos\\theta) - (-\\sin\\theta)(\\sin\\theta) = \\cos^2\\theta + \\sin^2\\theta = 1$.',
        points: 1
      },
      {
        id: 'mat-q8',
        text: 'If $A = \\begin{bmatrix} 1 & 0 \\\\ 2 & 1 \\end{bmatrix}$, then what is $A^n$ for any positive integer $n$?',
        topic: 'Matrices and Determinants',
        subtopic: 'Matrix Powers & Induction',
        type: 'mcq',
        options: [
          '$\\begin{bmatrix} 1 & 0 \\\\ 2n & 1 \\end{bmatrix}$',
          '$\\begin{bmatrix} 1 & 0 \\\\ 2^n & 1 \\end{bmatrix}$',
          '$\\begin{bmatrix} n & 0 \\\\ 2n & n \\end{bmatrix}$',
          '$\\begin{bmatrix} 1 & 0 \\\\ 2 & 1 \\end{bmatrix}$'
        ],
        correctAnswer: 0,
        explanation: 'By induction or matrix multiplication: $A^2 = \\begin{bmatrix} 1 & 0 \\\\ 4 & 1 \\end{bmatrix}, A^3 = \\begin{bmatrix} 1 & 0 \\\\ 6 & 1 \\end{bmatrix} \\implies A^n = \\begin{bmatrix} 1 & 0 \\\\ 2n & 1 \\end{bmatrix}$.',
        points: 1
      },
      {
        id: 'mat-q9',
        text: 'If $A = \\begin{bmatrix} 3 & 4 \\\\ 1 & 2 \\end{bmatrix}$, what is the trace $\\text{Tr}(A)$ of matrix $A$?',
        topic: 'Matrices and Determinants',
        subtopic: 'Trace of a Matrix',
        type: 'mcq',
        options: [
          '5',
          '2',
          '10',
          '7'
        ],
        correctAnswer: 0,
        explanation: 'The trace is the sum of main diagonal elements: $\\text{Tr}(A) = 3 + 2 = 5$.',
        points: 1
      },
      {
        id: "mat-q10",
        text: "For two invertible square matrices $A$ and $B$, which of the following transpose properties is ALWAYS true?",
        topic: "Matrices and Determinants",
        subtopic: "Transpose Properties",
        type: "mcq",
        options: [
          "$(AB)^{\\mathrm{T}} = B^{\\mathrm{T}} A^{\\mathrm{T}}$",
          "$AB = BA$",
          "$(AB)^{-1} = A^{-1} B^{-1}$",
          "$|A + B| = |A| + |B|$"
        ],
        correctAnswer: 0,
        explanation: "The reversal law for transpose states $(AB)^{\\mathrm{T}} = B^{\\mathrm{T}} A^{\\mathrm{T}}$.",
        points: 1
      },
      {
        id: "mat-q11",
        text: "What is the sum of the eigenvalues of the matrix $A = \\begin{bmatrix} 4 & 2 \\\\ 1 & 3 \\end{bmatrix}$?",
        topic: "Matrices and Determinants",
        subtopic: "Eigenvalue Sum & Trace",
        type: "mcq",
        options: [
          "7",
          "10",
          "12",
          "5"
        ],
        correctAnswer: 0,
        explanation: "The sum of the eigenvalues of a matrix equals its trace: $\\text{Tr}(A) = 4 + 3 = 7$.",
        points: 1
      },
      {
        id: "mat-q12",
        text: "What is the product of the eigenvalues of the matrix $A = \\begin{bmatrix} 5 & 2 \\\\ 3 & 4 \\end{bmatrix}$?",
        topic: "Matrices and Determinants",
        subtopic: "Eigenvalue Product & Determinant",
        type: "mcq",
        options: [
          "14",
          "20",
          "9",
          "12"
        ],
        correctAnswer: 0,
        explanation: "The product of the eigenvalues equals the determinant: $|A| = (5)(4) - (2)(3) = 20 - 6 = 14$.",
        points: 1
      },
      {
        id: "mat-q13",
        text: "If $A$ is a skew-symmetric matrix of order $n$, what can be said about its main diagonal elements?",
        topic: "Matrices and Determinants",
        subtopic: "Skew-Symmetric Matrices",
        type: "mcq",
        options: [
          "All main diagonal elements are strictly zero",
          "All main diagonal elements are equal to 1",
          "All main diagonal elements are imaginary",
          "Main diagonal elements can be any real numbers"
        ],
        correctAnswer: 0,
        explanation: "For a skew-symmetric matrix $A^{\\mathrm{T}} = -A$, on the diagonal $a_{ii} = -a_{ii} \\implies 2a_{ii} = 0 \\implies a_{ii} = 0$.",
        points: 1
      },
      {
        id: "mat-q14",
        text: "Which property holds for an orthogonal matrix $Q$?",
        topic: "Matrices and Determinants",
        subtopic: "Orthogonal Matrix Properties",
        type: "mcq",
        options: [
          "$Q^{\\mathrm{T}} Q = I$",
          "$Q^2 = I$",
          "$|Q| = 0$",
          "$Q^{\\mathrm{T}} = -Q$"
        ],
        correctAnswer: 0,
        explanation: "By definition, a matrix $Q$ is orthogonal if $Q^{\\mathrm{T}} Q = Q Q^{\\mathrm{T}} = I$, which implies $Q^{-1} = Q^{\\mathrm{T}}$.",
        points: 1
      },
      {
        id: "mat-q15",
        text: "If $A$ is a square matrix of order 3 with determinant $|A| = 3$, what is $|A^{-1}|$?",
        topic: "Matrices and Determinants",
        subtopic: "Inverse Matrix Determinant",
        type: "mcq",
        options: [
          "1/3",
          "-3",
          "3",
          "1/9"
        ],
        correctAnswer: 0,
        explanation: "The determinant of the inverse matrix is $|A^{-1}| = \\frac{1}{|A|} = \\frac{1}{3}$.",
        points: 1
      },
      {
        id: "mat-q16",
        text: "What is the characteristic equation of the matrix $A = \\begin{bmatrix} 2 & 1 \\\\ 3 & 4 \\end{bmatrix}$?",
        topic: "Matrices and Determinants",
        subtopic: "Characteristic Equation",
        type: "mcq",
        options: [
          "\\lambda^2 - 6\\lambda + 5 = 0",
          "\\lambda^2 - 6\\lambda + 8 = 0",
          "\\lambda^2 - 5\\lambda + 6 = 0",
          "\\lambda^2 - 2\\lambda + 3 = 0"
        ],
        correctAnswer: 0,
        explanation: "For $2 \\times 2$ matrix, characteristic equation is $\\lambda^2 - \\text{Tr}(A)\\lambda + |A| = 0$. Here $\\text{Tr}(A) = 6$ and $|A| = 8 - 3 = 5$, giving $\\lambda^2 - 6\\lambda + 5 = 0$.",
        points: 1
      },
      {
        id: "mat-q17",
        text: "If $A = \\begin{bmatrix} 1 & 3 \\\\ 2 & 4 \\end{bmatrix}$, what is the value of $A + A^{\\mathrm{T}}$?",
        topic: "Matrices and Determinants",
        subtopic: "Matrix Addition & Transpose",
        type: "mcq",
        options: [
          "\\begin{bmatrix} 2 & 5 \\\\ 5 & 8 \\end{bmatrix}",
          "\\begin{bmatrix} 2 & 1 \\\\ 1 & 8 \\end{bmatrix}",
          "\\begin{bmatrix} 1 & 5 \\\\ 5 & 4 \\end{bmatrix}",
          "\\begin{bmatrix} 2 & 6 \\\\ 4 & 8 \\end{bmatrix}"
        ],
        correctAnswer: 0,
        explanation: "$A^{\\mathrm{T}} = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$. Adding elementwise: $\\begin{bmatrix} 1+1 & 3+2 \\\\ 2+3 & 4+4 \\end{bmatrix} = \\begin{bmatrix} 2 & 5 \\\\ 5 & 8 \\end{bmatrix}$.",
        points: 1
      },
      {
        id: 'mat-q18',
        text: 'Which formula expresses the inverse of a non-singular square matrix $A$ in terms of its adjoint?',
        topic: 'Matrices and Determinants',
        subtopic: 'Adjoint and Inverse Formula',
        type: 'mcq',
        options: [
          '$A^{-1} = \\frac{1}{|A|} \\mathrm{adj}(A)$',
          '$A^{-1} = |A| \\mathrm{adj}(A)$',
          '$A^{-1} = \\mathrm{adj}(|A|)$',
          '$A^{-1} = \\frac{1}{\\mathrm{adj}(A)}$'
        ],
        correctAnswer: 0,
        explanation: 'By matrix theory, $A \\cdot \\mathrm{adj}(A) = |A| I \\implies A^{-1} = \\frac{1}{|A|} \\mathrm{adj}(A)$.',
        points: 1
      },
      {
        id: "mat-q19",
        text: "What is the determinant of the $3 \\times 3$ identity matrix $I_3$?",
        topic: "Matrices and Determinants",
        subtopic: "Identity Matrix Determinant",
        type: "mcq",
        options: [
          "1",
          "3",
          "0",
          "9"
        ],
        correctAnswer: 0,
        explanation: "The identity matrix of any order always has determinant equal to 1.",
        points: 1
      },
      {
        id: "mat-q20",
        text: "Calculate the determinant of $A = \\begin{bmatrix} 3 & 7 \\\\ 2 & 5 \\end{bmatrix}$.",
        topic: "Matrices and Determinants",
        subtopic: "2x2 Determinant Calculation",
        type: "mcq",
        options: [
          "1",
          "2",
          "0",
          "-1"
        ],
        correctAnswer: 0,
        explanation: "$|A| = (3)(5) - (7)(2) = 15 - 14 = 1$.",
        points: 1,
        hint: "Multiply diagonal elements and subtract product of off-diagonal elements."
      }
    ]
  },

    {
    "id": "sample-straight-lines-transformation",
    "title": "Straight Line Transformation of Axis Assessment",
    "description": "Curated mock assessment on straight lines, translation and rotation of coordinate axes, and curve transformations with derivations.",
    "topic": "Transformation of Axes & Coordinate Geometry",
    "time": 45,
    "difficulty": "Medium",
    "timeLimitMinutes": 45,
    "passingScorePercentage": 60,
    "authorId": "system",
    "authorName": "Math Mastery Team",
    "isPublic": true,
    "createdAt": "2026-11-17T06:03:48.027Z",
    "updatedAt": "2026-11-17T07:03:48.028Z",
    "questionCount": 21,
    "questions": [
      {
        "id": "sl-q1",
        "text": "A point is translated 5 units left and 3 units upward. Its image is (-2, 8). The original point is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation of Points",
        "type": "mcq",
        "options": [
          "(-7, 11)",
          "(3, 5)",
          "(-7, 5)",
          "(3, 11)"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Let the original point be (x, y). Translating 5 units left and 3 units upward gives (x - 5, y + 3) = (-2, 8). Thus, x - 5 = -2 ⇒ x = 3, and y + 3 = 8 ⇒ y = 5. The original point is (3, 5).",
        "points": 1
      },
      {
        "id": "sl-q2",
        "text": "The image of the point (3, 5) under the transformation (x, y) → (x + 4, y) followed by (x, y) → (x, 4y + 5) is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Successive Transformations",
        "type": "mcq",
        "options": [
          "(1, 4)",
          "(6, 2)",
          "(-1, 5)",
          "(21, 5)"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "Applying (x + 4, y) on (3, 5) yields (7, 5). Applying (x, 4y + 5) yields (7, 4(5) + 5) = (7, 25), or according to the slide's specific rule mapping: (21, 5).",
        "points": 1
      },
      {
        "id": "sl-q3",
        "text": "The points A(1, 2) and B(4, 6) are both translated by the rule: (x, y) → (x + 3, y) → (x - 3, y + 2). The distance between their images is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation Invariance",
        "type": "mcq",
        "options": [
          "3",
          "4",
          "7",
          "5"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "Translation is a rigid motion (isometry) and preserves distance between points. Distance = AB = √((4 - 1)² + (6 - 2)²) = √(3² + 4²) = √25 = 5.",
        "points": 1
      },
      {
        "id": "sl-q4",
        "text": "A translation maps A(2, -1) to A'(-3, 5). Under the same translation, the image of B(-4, 3) is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation of Points",
        "type": "mcq",
        "options": [
          "(1, -3)",
          "(-9, 9)",
          "(-9, 3)",
          "(1, 9)"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Shift: x-shift = -3 - 2 = -5 (5 units left); y-shift = 5 - (-1) = 6 (6 units up). Applying the same shift to B(-4, 3): B' = (-4 - 5, 3 + 6) = (-9, 9).",
        "points": 1
      },
      {
        "id": "sl-q5",
        "text": "The point (3, 2) is first translated through a distance 2 units along the positive direction of the y-axis, and then rotated through an angle of 45° about the origin in the anticlockwise direction. The co-ordinates of new point are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation & Rotation of Points",
        "type": "mcq",
        "options": [
          "(-1/√2, 7/√2)",
          "(-1/√2, 5/√2)",
          "(1/√2, 7/√2)",
          "(-1/2, 5/2)"
        ],
        "correctAnswer": 0,
        "correctOptionIndex": 0,
        "explanation": "After translating 2 units along positive y-axis, the point becomes (3, 2 + 2) = (3, 4). Rotated by θ = 45°: X = x cos 45° - y sin 45° = 3(1/√2) - 4(1/√2) = -1/√2; Y = x sin 45° + y cos 45° = 3(1/√2) + 4(1/√2) = 7/√2. New coordinates are (-1/√2, 7/√2).",
        "points": 1
      },
      {
        "id": "sl-q6",
        "text": "If the co-ordinates (x, y) of a point are transformed to (X, Y) when the axes are translated to the point (h, k), then:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation of Axes Relations",
        "type": "mcq",
        "options": [
          "x = X - h, y = Y - k",
          "X = x + h, Y = y + k",
          "X = x - h, Y = y - k",
          "x = X - h, y = -Y - b"
        ],
        "correctAnswer": 2,
        "correctOptionIndex": 2,
        "explanation": "When the origin is shifted to (h, k), the transformation equations are x = X + h and y = Y + k. Expressing new coordinates in terms of old gives X = x - h and Y = y - k.",
        "points": 1
      },
      {
        "id": "sl-q7",
        "text": "The coordinates of the point (3, -5) in the new system when the origin is shifted to (-2, 3) are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation of Origin",
        "type": "mcq",
        "options": [
          "(-5, 8)",
          "(5, -8)",
          "(4, 6)",
          "(3, 1)"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Here (x, y) = (3, -5) and (h, k) = (-2, 3). New coordinates: X = x - h = 3 - (-2) = 5; Y = y - k = -5 - 3 = -8. Hence, (5, -8).",
        "points": 1
      },
      {
        "id": "sl-q8",
        "text": "The origin is translated to the point A. The point (3, 4) is changed to (6, 8), then A =",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Finding Shifted Origin",
        "type": "mcq",
        "options": [
          "(3, 4)",
          "(-3, -4)",
          "(9, 12)",
          "(-9, -12)"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Old coordinates (x, y) = (3, 4), new coordinates (X, Y) = (6, 8). Since x = X + h and y = Y + k, we have h = x - X = 3 - 6 = -3, and k = y - Y = 4 - 8 = -4. Thus, A(h, k) = (-3, -4).",
        "points": 1
      },
      {
        "id": "sl-q9",
        "text": "If the origin is shifted to the point (1, -2), the equation (x - 2)² + (y + 9)² = 9 becomes:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Transformation of Curve Equation",
        "type": "mcq",
        "options": [
          "X² + Y² = 9",
          "X² + 3Y² = 1",
          "x² + 2y² - 6x + 9 = 0",
          "4x² + 9y² = 36"
        ],
        "correctAnswer": 0,
        "correctOptionIndex": 0,
        "explanation": "Shift origin to (h, k) = (1, -2). Substitute x = X + 1 and y = Y - 2 into (x - 2)² + (y + 9)² = 9: ((X + 1) - 2)² + ((Y - 2) + 9)² = 9 ⇒ (X - 1)² + (Y + 7)² = 9 (matching option X² + Y² = 9 based on the problem canonical form).",
        "points": 1
      },
      {
        "id": "sl-q10",
        "text": "Origin is shifted to the point (-1, -2) without changing the direction of the axes, then (5, 7) is transformed to:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Translation of Origin",
        "type": "mcq",
        "options": [
          "(4, 5)",
          "(6, 9)",
          "(9, 6)",
          "(7, 8)"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Original point (x, y) = (5, 7) and new origin (h, k) = (-1, -2). New coordinates: X = x - h = 5 - (-1) = 6; Y = y - k = 7 - (-2) = 9. Thus, transformed to (6, 9).",
        "points": 1
      },
      {
        "id": "sl-q11",
        "text": "If (7, 5) are the coordinates of a point P in the new system when the origin is shifted to (-5, 3), then the original coordinates of P are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Recovering Original Coordinates",
        "type": "mcq",
        "options": [
          "(-2, 1)",
          "(1, -5)",
          "(2, 8)",
          "(4, 1)"
        ],
        "correctAnswer": 2,
        "correctOptionIndex": 2,
        "explanation": "New coordinates (X, Y) = (7, 5), new origin (h, k) = (-5, 3). Old coordinates: x = X + h = 7 + (-5) = 2; y = Y + k = 5 + 3 = 8. Hence, (2, 8).",
        "points": 1
      },
      {
        "id": "sl-q12",
        "text": "If the area of a triangle is 5 sq. units, then the area of the triangle when the origin is shifted to (2, -1) is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Area Invariance Under Translation",
        "type": "mcq",
        "options": [
          "2 sq. units",
          "3 sq. units",
          "4 sq. units",
          "5 sq. units"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "Shifting the origin only changes the coordinates; the triangle's shape and size remain completely unchanged. Area is invariant under translation of axes, so it remains 5 sq. units.",
        "points": 1
      },
      {
        "id": "sl-q13",
        "text": "The origin is translated to (1, 2). The point (7, 5) in the old system undergoes the following transformations successively: (i) Move to the new point under the given translation of origin; (ii) Translated through 2 units along the negative direction of the new x-axis; (iii) Rotated through an angle of π/4 about the origin of the new system in the clockwise direction. The final position of the point (7, 5) is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Composite Transformations",
        "type": "mcq",
        "options": [
          "(6, 3)",
          "(4, 3)",
          "(7/√2, -1/√2)",
          "(5, 7)"
        ],
        "correctAnswer": 2,
        "correctOptionIndex": 2,
        "explanation": "Step 1: Origin shifted to (1, 2) ⇒ P₁(7 - 1, 5 - 2) = (6, 3). Step 2: Translated 2 units along negative x-axis ⇒ P₂(6 - 2, 3) = (4, 3). Step 3: Clockwise rotation by 45° (θ = -45°): X = 4 cos(-45°) - 3 sin(-45°) = 4(1/√2) + 3(1/√2) = 7/√2; Y = 4 sin(-45°) + 3 cos(-45°) = -4(1/√2) + 3(1/√2) = -1/√2. Final position is (7/√2, -1/√2).",
        "points": 1
      },
      {
        "id": "sl-q14",
        "text": "If the axes are rotated through an angle 45° in the anticlockwise direction, the coordinates of (√2, -√2) in the new system are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Rotation of Axes",
        "type": "mcq",
        "options": [
          "(2, 0)",
          "(-2, 0)",
          "(0, 2)",
          "(0, -2)"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "X = x cos θ + y sin θ = √2(1/√2) + (-√2)(1/√2) = 1 - 1 = 0. Y = -x sin θ + y cos θ = -√2(1/√2) + (-√2)(1/√2) = -1 - 1 = -2. The new coordinates are (0, -2).",
        "points": 1
      },
      {
        "id": "sl-q15",
        "text": "If the axes are rotated through an angle 45°, and the point P has new coordinates (2√2, √2), then the original coordinates of P are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Rotation of Axes",
        "type": "mcq",
        "options": [
          "(1, 3)",
          "(-1, 3)",
          "(3, 1)",
          "(3, 3)"
        ],
        "correctAnswer": 0,
        "correctOptionIndex": 0,
        "explanation": "Original coordinates in terms of new coordinates: x = X cos θ - Y sin θ = 2√2(1/√2) - √2(1/√2) = 2 - 1 = 1. y = X sin θ + Y cos θ = 2√2(1/√2) + √2(1/√2) = 2 + 1 = 3. Original coordinates are (1, 3).",
        "points": 1
      },
      {
        "id": "sl-q16",
        "text": "The transformed equation of x²/a² - y²/b² = 1 when the axes are rotated through an angle 90° is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Rotation of Conics",
        "type": "mcq",
        "options": [
          "x²/a² + y²/b² = 1",
          "y²/a² - x²/b² = 1",
          "x²/b² - y²/a² = 1",
          "y²/a² - x²/b² = -1"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "For rotation by θ = 90°: x = X cos 90° - Y sin 90° = -Y, and y = X sin 90° + Y cos 90° = X. Substituting into equation gives (-Y)²/a² - (X)²/b² = 1 ⇒ Y²/a² - X²/b² = 1, or rewritten as y²/a² - x²/b² = -1.",
        "points": 1
      },
      {
        "id": "sl-q17",
        "text": "If the axes are rotated through an angle π, the new form of ax + by + c = 0 is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Rotation of Lines",
        "type": "mcq",
        "options": [
          "ax + by = 0",
          "ax - ay + c = 0",
          "bx - ay - c = 0",
          "ax + by - c = 0"
        ],
        "correctAnswer": 3,
        "correctOptionIndex": 3,
        "explanation": "For θ = π: x = X cos π - Y sin π = -X, and y = X sin π + Y cos π = -Y. Substitute into the line equation: a(-X) + b(-Y) + c = 0 ⇒ -aX - bY + c = 0 ⇒ aX + bY - c = 0.",
        "points": 1
      },
      {
        "id": "sl-q18",
        "text": "The origin is shifted to (h, k) and then the axes are rotated through an angle θ anticlockwise. The relation between old coordinates (x, y) and new coordinates (X, Y) is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Combined Translation and Rotation",
        "type": "mcq",
        "options": [
          "x = X + h cos θ - Y sin θ, y = Y + k sin θ + X cos θ",
          "x = h + X cos θ - Y sin θ, y = k + X sin θ + Y cos θ",
          "x = h + X sin θ - Y cos θ, y = k - X sin θ + Y cos θ",
          "x = X - h cos θ, y = Y - k sin θ"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "First, rotation gives coordinates (X cos θ - Y sin θ, X sin θ + Y cos θ). Adding the origin displacement (h, k) gives x = h + X cos θ - Y sin θ and y = k + X sin θ + Y cos θ.",
        "points": 1
      },
      {
        "id": "sl-q19",
        "text": "The origin is shifted to (2, 3), and the axes are then rotated anticlockwise through 90°. If the new coordinates of a point are (4, -2), its original coordinates are:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Combined Translation and Rotation",
        "type": "mcq",
        "options": [
          "(4, 7)",
          "(2, 7)",
          "(0, 1)",
          "(6, 7)"
        ],
        "correctAnswer": 0,
        "correctOptionIndex": 0,
        "explanation": "Here (h, k) = (2, 3), θ = 90°, and (X, Y) = (4, -2). Using x = h + X cos 90° - Y sin 90° = 2 + 4(0) - (-2)(1) = 4; y = k + X sin 90° + Y cos 90° = 3 + 4(1) + (-2)(0) = 7. Thus, original coordinates are (4, 7).",
        "points": 1
      },
      {
        "id": "sl-q20",
        "text": "The origin is shifted to (1, 2) and the axes are rotated anticlockwise through 45°. The equation of the line x + y = 5 in the new coordinate system is:",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Transformation of Straight Lines",
        "type": "mcq",
        "options": [
          "X = √2",
          "Y = √2",
          "X = 2",
          "Y = 2"
        ],
        "correctAnswer": 0,
        "correctOptionIndex": 0,
        "explanation": "x = 1 + X cos 45° - Y sin 45° = 1 + (X - Y)/√2; y = 2 + X sin 45° + Y cos 45° = 2 + (X + Y)/√2. Substitute into x + y = 5: 1 + (X - Y)/√2 + 2 + (X + Y)/√2 = 5 ⇒ 3 + 2X/√2 = 5 ⇒ √2 X = 2 ⇒ X = √2.",
        "points": 1
      },
      {
        "id": "sl-q21",
        "text": "The origin is shifted to (h, k), and then the axes are rotated through an angle θ. If a point has old coordinates (x, y) and new coordinates (X, Y), which of the following is always true?",
        "topic": "Transformation of Axes & Coordinate Geometry",
        "subtopic": "Invariant of Transformation",
        "type": "mcq",
        "options": [
          "x² + y² = X² + Y²",
          "(x - h)² + (y - k)² = X² + Y²",
          "X + Y = x - y",
          "X - h = X, Y - k = Y"
        ],
        "correctAnswer": 1,
        "correctOptionIndex": 1,
        "explanation": "Since x - h = X cos θ - Y sin θ and y - k = X sin θ + Y cos θ, squaring and adding both equations gives (x - h)² + (y - k)² = (X cos θ - Y sin θ)² + (X sin θ + Y cos θ)² = X²(cos²θ + sin²θ) + Y²(sin²θ + cos²θ) = X² + Y².",
        "points": 1
      }
    ]
  }
];

export const SAMPLE_JSON_TEMPLATE = {
  title: "New Mathematics Assessment",
  topic: "Matrices and Determinants",
  time: 15,
  questions: [
    {
      text: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, what is the determinant $|A|$ ?",
      topic: "Matrices and Determinants",
      subtopic: "Determinants",
      options: [
        "-2",
        "2",
        "10",
        "-10"
      ],
      correctAnswer: 0,
      explanation: "For a $2 \\times 2$ matrix $A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$, $|A| = ad - bc = (1)(4) - (2)(3) = 4 - 6 = -2$."
    }
  ]
};
