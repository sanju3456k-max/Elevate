/**
 * Elevate Platform - Complete Master Console Live Ingestion Engine
 * 
 * Specifically connects to Sanju's Master Console (sanju3456k@gmail.com):
 * 1. Populates cohort buckets (4,000 students) for ALL of Sanju's active tests:
 *    - test-1794902920979-1ga6z (3D Geometry, Vectors & Complex Numbers)
 *    - test-1795201864079 (Statics, Dynamics & Conic Sections)
 *    - sample-mechanics-conics-diagrams
 *    - sample-matrices-1
 * 2. Enrolls top cohort students into Sanju's active batches in `batch_enrollments`:
 *    - batch_1794899971089 ("Elevate" batch)
 *    - batch_1794900009520 ("Testing" batch)
 *    - batch_testing_01 ("Testing Batch")
 * 3. Populates `users/{studentId}/attempts` so clicking Student 360 immediately displays full test history!
 * 4. Populates `user_progress/{studentId}` so Student 360 immediately displays video watch minutes & lecture progress!
 * 5. Remedial Coaching & Remedial Dispatch are fully populated with wrong question indices!
 * 6. Holds an active 20-minute countdown timer, then purges all test data automatically.
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, deleteDoc, getDocs, 
  collection, query, writeBatch, limit 
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const TOTAL_STUDENTS = 4000;
const DURATION_MINUTES = 20;
const SESSION_ID = `mc_live_${Date.now()}`;

const TARGET_TESTS = [
  {
    id: 'test-1794902920979-1ga6z',
    canonicalId: 'test_title_3d_geometry_vectors_complex_numbers',
    title: '3D Geometry, Vectors & Complex Numbers',
    questionCount: 10,
    maxPoints: 40,
  },
  {
    id: 'test-1795201864079',
    canonicalId: 'test_title_statics_dynamics_conic_sections',
    title: 'Statics, Dynamics & Conic Sections',
    questionCount: 5,
    maxPoints: 20,
  },
  {
    id: 'sample-mechanics-conics-diagrams',
    canonicalId: 'test_title_statics_dynamics_conic_sections',
    title: 'Statics, Dynamics & Conic Sections',
    questionCount: 5,
    maxPoints: 20,
  },
  {
    id: 'sample-matrices-1',
    canonicalId: 'test_title_matrices_and_determinants',
    title: 'Matrices and Determinants',
    questionCount: 5,
    maxPoints: 20,
  }
];

const TARGET_BATCH_IDS = [
  'batch_1794899971089', // Elevate
  'batch_1794900009520', // Testing
  'batch_testing_01',    // Default
];

console.log('========================================================================');
console.log('⚡ ELEVATE MASTER CONSOLE COMPLETE 360° LIVE INGESTION ⚡');
console.log('👑 Destination: Sanju Master Console (sanju3456k@gmail.com)');
console.log('========================================================================');
console.log(`🎯 Active Live Students:       ${TOTAL_STUDENTS.toLocaleString()} real candidate profiles`);
console.log(`📊 Analytics Dashboard:        Active for ALL Sanju Tests`);
console.log(`👤 Student 360 Reports:        Full Test History + Video Watch Progress`);
console.log(`🎯 Remedial Coaching Engine:   Active with Wrong Answer Indices for Dispatch`);
console.log(`⏱️ Visibility Window:          ${DURATION_MINUTES} Minutes (Auto-Purge Scheduled)`);
console.log(`🔑 Live Session ID:            ${SESSION_ID}`);
console.log('========================================================================\n');

// 1. Initialize Firebase
let configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  configPath = path.resolve(process.cwd(), 'Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca', 'firebase-applet-config.json');
}
const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = initializeApp(fbConfig, `mc_runner_${Date.now()}`);
const db = getFirestore(app);
console.log(`🔥 Connected to Live Cloud Firestore: [${fbConfig.projectId}]\n`);

// 2. Generate 4,000 Realistic Student Records
const indianFirstNames = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Advaith', 'Aaryan', 'Dhruv', 'Kabir', 'Ritvik', 'Darsh',
  'Ananya', 'Diya', 'Gauri', 'Isha', 'Kavya', 'Khushi', 'Myra', 'Navya', 'Pari', 'Prisha',
  'Riya', 'Saanvi', 'Sanya', 'Siya', 'Tanvi', 'Vanya', 'Avni', 'Aaditri', 'Tara', 'Anika'
];
const indianLastNames = [
  'Sharma', 'Verma', 'Gupta', 'Mehta', 'Chopra', 'Malhotra', 'Bhatia', 'Saxena', 'Kapoor', 'Reddy',
  'Nair', 'Iyer', 'Patel', 'Shah', 'Deshmukh', 'Kulkarni', 'Joshi', 'Rao', 'Singh', 'Kumar',
  'Yadav', 'Mishra', 'Pandey', 'Trivedi', 'Chatterjee', 'Banerjee', 'Bose', 'Das', 'Sen', 'Dutta'
];

interface StudentRecord {
  uid: string;
  name: string;
  email: string;
  score: number;
  totalPoints: number;
  percentage: number;
  mode: 'online';
  durationSeconds: number;
  wrongIndices: number[];
  unattemptedIndices: number[];
  flaggedIndices: number[];
  timestamp: number;
  completedAt: string;
}

const allStudents: StudentRecord[] = [];

for (let i = 0; i < TOTAL_STUDENTS; i++) {
  const uid = `std_live_${String(i + 1).padStart(5, '0')}`;
  const f = indianFirstNames[i % indianFirstNames.length];
  const l = indianLastNames[Math.floor(i / indianFirstNames.length) % indianLastNames.length];
  const name = `${f} ${l} (#${i + 1})`;
  const email = `candidate_${i + 1}@elevatelabs.org`;

  const qCount = 5;
  const wrongIndices: number[] = [];
  const unattemptedIndices: number[] = [];
  const flaggedIndices: number[] = [];
  let score = 0;

  for (let q = 0; q < qCount; q++) {
    const isUnattempted = Math.random() < 0.08;
    const isFlagged = Math.random() < 0.12;
    if (isFlagged) flaggedIndices.push(q);

    if (isUnattempted) {
      unattemptedIndices.push(q);
    } else {
      const isCorrect = Math.random() < 0.65;
      if (isCorrect) {
        score += 4;
      } else {
        wrongIndices.push(q);
        score = Math.max(0, score - 1);
      }
    }
  }

  const durationSeconds = 120 + Math.floor(Math.random() * 500);
  const totalPoints = qCount * 4;
  const percentage = Math.round((score / totalPoints) * 100);

  allStudents.push({
    uid,
    name,
    email,
    score,
    totalPoints,
    percentage,
    mode: 'online',
    durationSeconds,
    wrongIndices,
    unattemptedIndices,
    flaggedIndices,
    timestamp: Date.now() - Math.floor(Math.random() * 1800000),
    completedAt: new Date(Date.now() - Math.floor(Math.random() * 1800000)).toISOString(),
  });
}

// Sort for leaderboard
allStudents.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
  return a.wrongIndices.length - b.wrongIndices.length;
});

const top100Entries = allStudents.slice(0, 100).map((s, idx) => ({
  userId: s.uid,
  userName: s.name,
  userEmail: s.email,
  score: s.score,
  totalPoints: s.totalPoints,
  percentage: s.percentage,
  timeSpentSeconds: s.durationSeconds,
  attemptMode: 'online',
  completedAt: s.completedAt,
  testTitle: '3D Geometry, Vectors & Complex Numbers',
  rank: idx + 1,
  attemptNumber: 1,
  firstAttemptId: `att_${s.uid}`,
  wrongQuestionIndices: s.wrongIndices,
  unattemptedQuestionIndices: s.unattemptedIndices,
  flaggedQuestionIndices: s.flaggedIndices,
}));

const packedTop = top100Entries.map(e =>
  `${e.userId}|${e.userName}|${e.score}|${e.totalPoints}|${e.percentage}|${e.timeSpentSeconds}|${e.attemptMode}|${e.completedAt}`
);

const part1Attempts = allStudents.slice(0, 2000);
const part2Attempts = allStudents.slice(2000, 4000);

// Cleanup function to wipe all synthetic records when 20 min finishes
async function runCleanup() {
  console.log('\n🧹 [EPHEMERAL CLEANUP] Deleting all test data from Firestore...');
  
  // Clean test buckets
  for (const t of TARGET_TESTS) {
    for (const testId of [t.id, t.canonicalId]) {
      try {
        await deleteDoc(doc(db, 'test_leaderboards', testId, 'summary', 'cohort_bucket_1'));
        await deleteDoc(doc(db, 'test_leaderboards', testId, 'summary', 'cohort_bucket_2'));
        await deleteDoc(doc(db, 'test_leaderboards', testId, 'summary', 'top_bucket'));
      } catch {}
    }
  }

  // Clean enrolled students & progress
  for (let i = 0; i < 40; i++) {
    const s = allStudents[i];
    for (const bId of TARGET_BATCH_IDS) {
      try {
        const cleanKey = s.email.replace(/[./[\]*~#$]/g, '_');
        await deleteDoc(doc(db, 'batch_enrollments', `${bId}__${cleanKey}`));
      } catch {}
    }
    try {
      await deleteDoc(doc(db, 'user_progress', s.uid));
      await deleteDoc(doc(db, 'users', s.uid, 'attempts', `att_${s.uid}`));
      await deleteDoc(doc(db, 'users', s.uid));
    } catch {}
  }
  console.log('✨ Cleanup complete! Database is 100% clean and pristine.\n');
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupted by user.');
  await runCleanup();
  process.exit(0);
});

async function main() {
  console.log('🚀 Phase 1: Ingesting 4,000 student records into test cohort buckets for Sanju...');
  const writtenTestPaths = new Set<string>();

  for (const t of TARGET_TESTS) {
    for (const testDocId of [t.id, t.canonicalId]) {
      if (writtenTestPaths.has(testDocId)) continue;
      writtenTestPaths.add(testDocId);

      console.log(`   📤 Writing cohort buckets to [test_leaderboards/${testDocId}]...`);

      // 1. cohort_bucket_1
      await setDoc(doc(db, 'test_leaderboards', testDocId, 'summary', 'cohort_bucket_1'), {
        testId: testDocId,
        testTitle: t.title,
        totalParticipants: TOTAL_STUDENTS,
        hasPart2: true,
        version: 1,
        updatedAt: new Date().toISOString(),
        sessionId: SESSION_ID,
        attempts: part1Attempts,
      });

      // 2. cohort_bucket_2
      await setDoc(doc(db, 'test_leaderboards', testDocId, 'summary', 'cohort_bucket_2'), {
        testId: testDocId,
        testTitle: t.title,
        part: 2,
        version: 1,
        updatedAt: new Date().toISOString(),
        sessionId: SESSION_ID,
        attempts: part2Attempts,
      });

      // 3. top_bucket
      await setDoc(doc(db, 'test_leaderboards', testDocId, 'summary', 'top_bucket'), {
        testId: testDocId,
        testTitle: t.title,
        totalParticipants: TOTAL_STUDENTS,
        updatedAt: new Date().toISOString(),
        version: 1,
        sessionId: SESSION_ID,
        entries: top100Entries,
        packedTop,
      });
    }
  }

  console.log('\n🚀 Phase 2: Enrolling cohort students into Sanju\'s active batch rosters...');
  // Enroll top 35 students into Sanju's active batches so they pass batch filter
  const batchStudentsCount = 35;
  for (let i = 0; i < batchStudentsCount; i++) {
    const s = allStudents[i];
    const cleanKey = s.email.replace(/[./[\]*~#$]/g, '_');

    for (const bId of TARGET_BATCH_IDS) {
      const enrollRef = doc(db, 'batch_enrollments', `${bId}__${cleanKey}`);
      await setDoc(enrollRef, {
        id: `${bId}__${cleanKey}`,
        batchId: bId,
        userId: s.uid,
        studentName: s.name,
        studentEmail: s.email,
        enrolledAt: new Date().toISOString().split('T')[0],
        expiresAt: '2028-12-31',
        status: 'active',
        sessionId: SESSION_ID,
      });
    }

    // Write user profile
    await setDoc(doc(db, 'users', s.uid), {
      uid: s.uid,
      displayName: s.name,
      email: s.email,
      enrolledBatchIds: TARGET_BATCH_IDS,
      sessionId: SESSION_ID,
    });

    // Write attempts to users/{s.uid}/attempts for Student 360 view
    const answersMap: Record<number, any> = {};
    for (let q = 0; q < 5; q++) {
      answersMap[q] = {
        selectedOption: s.wrongIndices.includes(q) ? 2 : 0,
        isCorrect: !s.wrongIndices.includes(q) && !s.unattemptedIndices.includes(q),
        flagged: s.flaggedIndices.includes(q),
      };
    }

    await setDoc(doc(db, 'users', s.uid, 'attempts', `att_${s.uid}`), {
      id: `att_${s.uid}`,
      testId: 'test-1794902920979-1ga6z',
      testTitle: '3D Geometry, Vectors & Complex Numbers',
      userId: s.uid,
      userName: s.name,
      userEmail: s.email,
      score: s.score,
      totalPoints: s.totalPoints,
      percentage: s.percentage,
      timeSpentSeconds: s.durationSeconds,
      attemptMode: 'online',
      completedAt: s.completedAt,
      createdAt: s.completedAt,
      answers: answersMap,
      wrongQuestionIndices: s.wrongIndices,
      unattemptedQuestionIndices: s.unattemptedIndices,
      flaggedQuestionIndices: s.flaggedIndices,
      sessionId: SESSION_ID,
    });

    // Write video progress to /user_progress/{s.uid} for Student 360 view
    await setDoc(doc(db, 'user_progress', s.uid), {
      studentId: s.uid,
      sessionId: SESSION_ID,
      updatedAt: new Date().toISOString(),
      lectures: {
        'lec_vectors_01': {
          batchId: 'batch_1794899971089',
          lectureId: 'lec_vectors_01',
          watchedSeconds: 1650,
          totalSeconds: 1800,
          isCompleted: true,
          completedAt: new Date().toISOString(),
        },
        'lec_3d_geom_02': {
          batchId: 'batch_1794899971089',
          lectureId: 'lec_3d_geom_02',
          watchedSeconds: 1200,
          totalSeconds: 2400,
          isCompleted: false,
        }
      }
    });
  }

  console.log(`✅ Successfully enrolled ${batchStudentsCount} students across batch rosters with full 360° analytics & video progress!\n`);

  console.log('========================================================================');
  console.log('👑 SANJU MASTER CONSOLE INSTRUCTIONS (How to verify everything):');
  console.log('========================================================================');
  console.log('1. Go to your browser: http://localhost:3000');
  console.log('2. Click the Master Console button on the top right Navbar.');
  console.log('3. Open the "Analytics" tab:');
  console.log('   - Select Batch: "Elevate" or "Testing".');
  console.log('   - Select Test: "3D Geometry, Vectors & Complex Numbers" or "Statics, Dynamics & Conic Sections".');
  console.log('   - 🌟 YOU WILL SEE: The full visual analytics dashboard, student rankings, scores, and accuracy!');
  console.log('4. Open the "Student 360" report:');
  console.log('   - In the Analytics table or Students tab, click on any student (e.g. "Ritvik Kumar" or "Aarav Sharma").');
  console.log('   - 🌟 YOU WILL SEE: Complete test history, score breakdown, video watch minutes, and lecture completion!');
  console.log('5. Open the "Adaptive Remedial Engine" tab:');
  console.log('   - 🌟 YOU WILL SEE: The students with wrong answers flagged for remedial dispatch!');
  console.log('   - You can click "Preview Remedial Test" or dispatch it directly to them!');
  console.log('========================================================================\n');

  console.log(`⏳ LIVE TIMER ACTIVE: Data will remain live in Firebase for ${DURATION_MINUTES} MINUTES.`);
  console.log('   Press Ctrl+C anytime to terminate early and trigger instant cleanup.\n');

  let remainingSec = DURATION_MINUTES * 60;
  const timer = setInterval(() => {
    remainingSec -= 10;
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    process.stdout.write(`\r⏳ Time remaining until automatic Firebase purge: ${m}m ${s}s `);

    if (remainingSec <= 0) {
      clearInterval(timer);
      runCleanup().then(() => {
        console.log('Session finished.');
        process.exit(0);
      });
    }
  }, 10000);
}

main().catch(console.error);
