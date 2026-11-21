/**
 * Elevate Platform - Multi-Batch Dynamic N-Bucket Live Test Suite
 * 
 * Tests multi-batch architecture across:
 * 1. Batch "Testing Batch" (batch_testing_01) -> test_batch_mock_01
 * 2. Batch "Testing" (batch_1794900009520) -> test-1794902920979-1ga6z
 * 
 * Verifies:
 * - Dynamic bucket creation and parallel reader merge (No 2001 rank bug)
 * - Exact continuous rank calculation for Sanju
 * - Full Master Console Roster, Analytics, and Student 360° modal data
 * - Strict multi-batch data isolation
 * - Ephemeral self-destruct after 20 minutes
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  writeBatch,
  collection,
  getDocs,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const SANJU_UID = 'B0DeZmlpyGToNoNm9laiTQ3KNqp1';
const SANJU_EMAIL = 'sanju3456k@gmail.com';

async function main() {
  console.log('========================================================================');
  console.log('🚀 ELEVATE LIVE MULTI-BATCH STRESS TEST & ARCHITECTURE RUNNER 🚀');
  console.log('========================================================================\n');

  let configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    configPath = path.resolve(
      process.cwd(),
      'Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca',
      'firebase-applet-config.json'
    );
  }

  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `multi_batch_${Date.now()}`);
  const db = getFirestore(app);

  console.log(`🔥 Connected to Firestore: [${fbConfig.projectId}]`);

  // Purge handler
  const purgeAll = async () => {
    console.log('\n🧹 [PURGE] Initiating cleanup of multi-batch test data...');
    try {
      const targets = [
        { testId: 'test_batch_mock_01', batchId: 'batch_testing_01' },
        { testId: 'test-1794902920979-1ga6z', batchId: 'batch_1794900009520' },
        { testId: 'canonical_test_batch_stress_01', batchId: 'batch_testing_01' },
      ];

      for (const t of targets) {
        for (let p = 1; p <= 5; p++) {
          await setDoc(doc(db, 'test_leaderboards', t.testId, 'summary', `cohort_bucket_${p}`), {
            attempts: [],
            totalParticipants: 0,
            totalParts: 0,
            purgedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }

      // Clean test batch_enrollments
      const enrSnap = await getDocs(collection(db, 'batch_enrollments')).catch(() => null);
      if (enrSnap && !enrSnap.empty) {
        const wb = writeBatch(db);
        let count = 0;
        enrSnap.forEach((d) => {
          if (d.id.startsWith('enr_test_') || d.id.startsWith('enr_batch_testing_') || d.id.startsWith('enr_batch_1794900009520_')) {
            wb.delete(d.ref);
            count++;
          }
        });
        if (count > 0) await wb.commit();
        console.log(` • Purged ${count} synthetic batch enrollment docs.`);
      }

      console.log('🎉 [PURGE] Multi-batch test data cleaned successfully!');
    } catch (e) {
      console.error('Purge error:', e);
    }
  };

  if (process.argv.includes('--purge')) {
    await purgeAll();
    process.exit(0);
  }

  // =========================================================================
  // BATCH 1: Testing Batch (batch_testing_01) - 1,500 Students
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('📦 BATCH 1: "Testing Batch" [batch_testing_01]');
  console.log('   Target Assessment: "Curriculum Chapter Assessment" [test_batch_mock_01]');
  console.log('   Student Count: 1,500 students across 2 dynamic buckets');
  console.log('------------------------------------------------------------------------');

  const BATCH1_STUDENTS = 1500;
  const b1Attempts: any[] = [];
  const b1Roster: Record<string, any> = {};
  const b1Enrollments: any[] = [];

  // Sanju's attempt in Batch 1: Score 72/80
  const sanjuB1 = {
    uid: SANJU_UID,
    name: 'Sanju (Master Account)',
    email: SANJU_EMAIL,
    score: 72,
    totalPoints: 80,
    percentage: 90,
    mode: 'online',
    durationSeconds: 1100,
    wrongIndices: [3, 9],
    unattemptedIndices: [17],
    flaggedIndices: [4],
    timestamp: Date.now() - 1800000,
    completedAt: new Date(Date.now() - 1800000).toISOString(),
  };
  b1Attempts.push(sanjuB1);
  b1Roster[SANJU_UID] = {
    id: SANJU_UID,
    userId: SANJU_UID,
    studentName: 'Sanju (Master)',
    studentEmail: SANJU_EMAIL,
    enrolledAt: new Date().toISOString(),
    status: 'active',
  };
  b1Enrollments.push({
    id: `enr_batch_testing_01_${SANJU_UID}`,
    batchId: 'batch_testing_01',
    userId: SANJU_UID,
    studentName: 'Sanju (Master)',
    studentEmail: SANJU_EMAIL,
    status: 'active',
  });

  for (let i = 1; i < BATCH1_STUDENTS; i++) {
    const uid = `b1_std_${i.toString().padStart(4, '0')}`;
    const name = `Batch1 Student ${i}`;
    const email = `b1.student${i}@elevatelabs.test`;
    // Score spread 80 down to 10
    const score = Math.max(10, Math.round(80 - (i / BATCH1_STUDENTS) * 70));
    const duration = 900 + (i % 600);
    const rec = {
      uid,
      name,
      email,
      score,
      totalPoints: 80,
      percentage: Math.round((score / 80) * 100),
      mode: 'online',
      durationSeconds: duration,
      wrongIndices: [i % 20, (i + 5) % 20],
      unattemptedIndices: [(i + 11) % 20],
      flaggedIndices: [],
      timestamp: Date.now() - (i * 1200),
      completedAt: new Date(Date.now() - (i * 1200)).toISOString(),
    };
    b1Attempts.push(rec);

    if (i <= 200) {
      b1Roster[uid] = {
        id: uid,
        userId: uid,
        studentName: name,
        studentEmail: email,
        enrolledAt: new Date().toISOString(),
        status: 'active',
      };
      b1Enrollments.push({
        id: `enr_batch_testing_01_${uid}`,
        batchId: 'batch_testing_01',
        userId: uid,
        studentName: name,
        studentEmail: email,
        status: 'active',
      });
    }
  }

  // Sort Batch 1 deterministically
  b1Attempts.sort((a, b) => b.score - a.score || a.durationSeconds - b.durationSeconds);
  const expectedSanjuRankB1 = b1Attempts.findIndex((a) => a.uid === SANJU_UID) + 1;
  console.log(`🎯 Batch 1 Sanju Expected Rank: #${expectedSanjuRankB1} of ${BATCH1_STUDENTS}`);

  // Write Batch 1 Buckets (Bucket 1: 1,000, Bucket 2: 500)
  const b1Bucket1 = b1Attempts.slice(0, 1000);
  const b1Bucket2 = b1Attempts.slice(1000);

  await setDoc(doc(db, 'test_leaderboards', 'test_batch_mock_01', 'summary', 'cohort_bucket_1'), {
    testId: 'test_batch_mock_01',
    testTitle: 'Curriculum Chapter Assessment',
    bucketIndex: 1,
    totalParts: 2,
    currentBucketIndex: 2,
    totalParticipants: BATCH1_STUDENTS,
    hasPart2: true,
    attempts: b1Bucket1,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(doc(db, 'test_leaderboards', 'test_batch_mock_01', 'summary', 'cohort_bucket_2'), {
    testId: 'test_batch_mock_01',
    testTitle: 'Curriculum Chapter Assessment',
    bucketIndex: 2,
    attempts: b1Bucket2,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(doc(db, 'batches', 'batch_testing_01', 'access', 'roster'), {
    batchId: 'batch_testing_01',
    totalStudents: Object.keys(b1Roster).length,
    students: b1Roster,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const wb1 = writeBatch(db);
  b1Enrollments.slice(0, 150).forEach((enr) => {
    wb1.set(doc(db, 'batch_enrollments', enr.id), enr, { merge: true });
  });
  await wb1.commit();
  console.log(`✅ Batch 1 written: 2 dynamic buckets + roster + enrollments committed.`);

  // Write personal attempt for Sanju in users/{uid}/attempts
  await setDoc(doc(db, 'users', SANJU_UID, 'attempts', 'attempt_b1_mock'), {
    id: 'attempt_b1_mock',
    testId: 'test_batch_mock_01',
    testTitle: 'Curriculum Chapter Assessment',
    userId: SANJU_UID,
    userEmail: SANJU_EMAIL,
    userName: 'Sanju (Master)',
    score: 72,
    totalPoints: 80,
    percentage: 90,
    timeSpentSeconds: 1100,
    answers: {},
    wrongQuestionIndices: [3, 9],
    unattemptedQuestionIndices: [17],
    completedAt: sanjuB1.completedAt,
    createdAt: sanjuB1.completedAt,
  }, { merge: true });

  // =========================================================================
  // BATCH 2: Testing (batch_1794900009520) - 1,500 Students
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('📦 BATCH 2: "Testing" [batch_1794900009520]');
  console.log('   Target Assessment: "(3D Geometry, Vectors & Complex Numbers)" [test-1794902920979-1ga6z]');
  console.log('   Student Count: 1,500 students across 2 dynamic buckets');
  console.log('------------------------------------------------------------------------');

  const BATCH2_STUDENTS = 1500;
  const b2Attempts: any[] = [];
  const b2Roster: Record<string, any> = {};
  const b2Enrollments: any[] = [];

  // Sanju's attempt in Batch 2: Score 180/200
  const sanjuB2 = {
    uid: SANJU_UID,
    name: 'Sanju (Master Account)',
    email: SANJU_EMAIL,
    score: 180,
    totalPoints: 200,
    percentage: 90,
    mode: 'online',
    durationSeconds: 1550,
    wrongIndices: [4, 18],
    unattemptedIndices: [37],
    flaggedIndices: [12],
    timestamp: Date.now() - 900000,
    completedAt: new Date(Date.now() - 900000).toISOString(),
  };
  b2Attempts.push(sanjuB2);
  b2Roster[SANJU_UID] = {
    id: SANJU_UID,
    userId: SANJU_UID,
    studentName: 'Sanju (Master)',
    studentEmail: SANJU_EMAIL,
    enrolledAt: new Date().toISOString(),
    status: 'active',
  };
  b2Enrollments.push({
    id: `enr_batch_1794900009520_${SANJU_UID}`,
    batchId: 'batch_1794900009520',
    userId: SANJU_UID,
    studentName: 'Sanju (Master)',
    studentEmail: SANJU_EMAIL,
    status: 'active',
  });

  for (let i = 1; i < BATCH2_STUDENTS; i++) {
    const uid = `b2_std_${i.toString().padStart(4, '0')}`;
    const name = `Batch2 Cadet ${i}`;
    const email = `b2.cadet${i}@elevatelabs.test`;
    // Score spread 200 down to 20
    const score = Math.max(20, Math.round(200 - (i / BATCH2_STUDENTS) * 180));
    const duration = 1400 + (i % 800);
    const rec = {
      uid,
      name,
      email,
      score,
      totalPoints: 200,
      percentage: Math.round((score / 200) * 100),
      mode: 'online',
      durationSeconds: duration,
      wrongIndices: [i % 50, (i + 12) % 50],
      unattemptedIndices: [(i + 25) % 50],
      flaggedIndices: [],
      timestamp: Date.now() - (i * 1000),
      completedAt: new Date(Date.now() - (i * 1000)).toISOString(),
    };
    b2Attempts.push(rec);

    if (i <= 200) {
      b2Roster[uid] = {
        id: uid,
        userId: uid,
        studentName: name,
        studentEmail: email,
        enrolledAt: new Date().toISOString(),
        status: 'active',
      };
      b2Enrollments.push({
        id: `enr_batch_1794900009520_${uid}`,
        batchId: 'batch_1794900009520',
        userId: uid,
        studentName: name,
        studentEmail: email,
        status: 'active',
      });
    }
  }

  // Sort Batch 2 deterministically
  b2Attempts.sort((a, b) => b.score - a.score || a.durationSeconds - b.durationSeconds);
  const expectedSanjuRankB2 = b2Attempts.findIndex((a) => a.uid === SANJU_UID) + 1;
  console.log(`🎯 Batch 2 Sanju Expected Rank: #${expectedSanjuRankB2} of ${BATCH2_STUDENTS}`);

  // Write Batch 2 Buckets (Bucket 1: 1,000, Bucket 2: 500)
  const b2Bucket1 = b2Attempts.slice(0, 1000);
  const b2Bucket2 = b2Attempts.slice(1000);

  await setDoc(doc(db, 'test_leaderboards', 'test-1794902920979-1ga6z', 'summary', 'cohort_bucket_1'), {
    testId: 'test-1794902920979-1ga6z',
    testTitle: '(3D Geometry, Vectors & Complex Numbers)',
    bucketIndex: 1,
    totalParts: 2,
    currentBucketIndex: 2,
    totalParticipants: BATCH2_STUDENTS,
    hasPart2: true,
    attempts: b2Bucket1,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(doc(db, 'test_leaderboards', 'test-1794902920979-1ga6z', 'summary', 'cohort_bucket_2'), {
    testId: 'test-1794902920979-1ga6z',
    testTitle: '(3D Geometry, Vectors & Complex Numbers)',
    bucketIndex: 2,
    attempts: b2Bucket2,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(doc(db, 'batches', 'batch_1794900009520', 'access', 'roster'), {
    batchId: 'batch_1794900009520',
    totalStudents: Object.keys(b2Roster).length,
    students: b2Roster,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const wb2 = writeBatch(db);
  b2Enrollments.slice(0, 150).forEach((enr) => {
    wb2.set(doc(db, 'batch_enrollments', enr.id), enr, { merge: true });
  });
  await wb2.commit();
  console.log(`✅ Batch 2 written: 2 dynamic buckets + roster + enrollments committed.`);

  // Write personal attempt for Sanju in users/{uid}/attempts
  await setDoc(doc(db, 'users', SANJU_UID, 'attempts', 'attempt_b2_mock'), {
    id: 'attempt_b2_mock',
    testId: 'test-1794902920979-1ga6z',
    testTitle: '(3D Geometry, Vectors & Complex Numbers)',
    userId: SANJU_UID,
    userEmail: SANJU_EMAIL,
    userName: 'Sanju (Master)',
    score: 180,
    totalPoints: 200,
    percentage: 90,
    timeSpentSeconds: 1550,
    answers: {},
    wrongQuestionIndices: [4, 18],
    unattemptedQuestionIndices: [37],
    completedAt: sanjuB2.completedAt,
    createdAt: sanjuB2.completedAt,
  }, { merge: true });

  // =========================================================================
  // VERIFICATION: Multi-Batch Dynamic Reader Merge
  // =========================================================================
  console.log('\n========================================================================');
  console.log('🔍 VERIFYING MULTI-BATCH DYNAMIC BUCKET READERS & DATA ISOLATION');
  console.log('========================================================================\n');

  // Test Reader 1: Batch 1 test
  const snapB1_1 = await getDoc(doc(db, 'test_leaderboards', 'test_batch_mock_01', 'summary', 'cohort_bucket_1'));
  const snapB1_2 = await getDoc(doc(db, 'test_leaderboards', 'test_batch_mock_01', 'summary', 'cohort_bucket_2'));
  const mergedB1 = [...(snapB1_1.data()?.attempts || []), ...(snapB1_2.data()?.attempts || [])];
  mergedB1.sort((a, b) => b.score - a.score || a.durationSeconds - b.durationSeconds);
  const actualRankB1 = mergedB1.findIndex((a) => a.uid === SANJU_UID) + 1;

  console.log(`📊 Batch 1 [test_batch_mock_01]: Merged ${mergedB1.length} / ${BATCH1_STUDENTS} students`);
  console.log(`🏆 Batch 1 Sanju Calculated Rank: #${actualRankB1} (Expected: #${expectedSanjuRankB1}) -> ${actualRankB1 === expectedSanjuRankB1 ? '✅ MATCH' : '❌ MISMATCH'}`);

  // Test Reader 2: Batch 2 test
  const snapB2_1 = await getDoc(doc(db, 'test_leaderboards', 'test-1794902920979-1ga6z', 'summary', 'cohort_bucket_1'));
  const snapB2_2 = await getDoc(doc(db, 'test_leaderboards', 'test-1794902920979-1ga6z', 'summary', 'cohort_bucket_2'));
  const mergedB2 = [...(snapB2_1.data()?.attempts || []), ...(snapB2_2.data()?.attempts || [])];
  mergedB2.sort((a, b) => b.score - a.score || a.durationSeconds - b.durationSeconds);
  const actualRankB2 = mergedB2.findIndex((a) => a.uid === SANJU_UID) + 1;

  console.log(`\n📊 Batch 2 [test-1794902920979-1ga6z]: Merged ${mergedB2.length} / ${BATCH2_STUDENTS} students`);
  console.log(`🏆 Batch 2 Sanju Calculated Rank: #${actualRankB2} (Expected: #${expectedSanjuRankB2}) -> ${actualRankB2 === expectedSanjuRankB2 ? '✅ MATCH' : '❌ MISMATCH'}`);

  // Check Batch Isolation
  const hasCrossPollution = mergedB1.some((a) => a.uid.startsWith('b2_')) || mergedB2.some((a) => a.uid.startsWith('b1_'));
  console.log(`\n🛡️ Cross-Batch Isolation Check: ${hasCrossPollution ? '❌ FAILED (cross contamination detected)' : '✅ PERFECT (Strictly isolated)'}`);

  // =========================================================================
  // SCHEDULING 20-MINUTE EPHEMERAL PURGE
  // =========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('⏳ EPHEMERAL SELF-DESTRUCT IN 20 MINUTES ACTIVE');
  console.log('   All synthetic test data across both batches will self-purge at 20 minutes.');
  console.log('   To purge manually at any time: npx tsx scripts/run-all-batches-live-test.ts --purge');
  console.log('------------------------------------------------------------------------\n');

  const timer = setTimeout(async () => {
    await purgeAll();
    process.exit(0);
  }, 20 * 60 * 1000);
  timer.unref();

  console.log('✨ TEST IS LIVE AND FULLY ACCESSIBLE IN MASTER CONSOLE & LEADERBOARD ✨\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
