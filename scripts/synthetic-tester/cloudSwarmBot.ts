import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  limit,
  query,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_SYNTHETIC_PERSONA,
  type FeatureCheckResult,
  type PacingMode,
  type SyntheticRunManifest,
} from './types';
import {
  instantiateQuestion,
  interpolateVariables,
} from '../../src/lib/dynamicMathEngine/localMathEngine';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCloudSwarmAudit(options: {
  pacingMode: PacingMode;
  runId: string;
}): Promise<{
  checks: FeatureCheckResult[];
  manifest: SyntheticRunManifest;
}> {
  const checks: FeatureCheckResult[] = [];
  const persona = DEFAULT_SYNTHETIC_PERSONA;
  const manifest: SyntheticRunManifest = {
    runId: options.runId,
    startedAt: new Date().toISOString(),
    persona,
    createdRecords: [],
  };

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    checks.push({
      name: 'Firebase Config & Cloud Initialization',
      category: 'cloud',
      passed: false,
      latencyMs: 0,
      details: 'firebase-applet-config.json not found in workspace root.',
    });
    return { checks, manifest };
  }

  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `synthetic_audit_${options.runId}`);
  const db = getFirestore(app);

  try {
    // 1. Master Catalog & Batch Discovery
    const tCatStart = Date.now();
    let activeTestId = '';
    let activeTestTitle = '';
    let activeTestQuestions: any[] = [];
    let activeBatchId = '';

    try {
      const batchesSnap = await getDocs(query(collection(db, 'batches'), limit(5)));
      if (!batchesSnap.empty) {
        activeBatchId = batchesSnap.docs[0].id;
      }

      const catalogSnap = await getDoc(doc(db, 'master_catalog', 'tests'));
      const catalogTests: any[] = catalogSnap.exists() ? (catalogSnap.data()?.list || []) : [];

      if (catalogTests.length > 0) {
        const candidate = catalogTests[0];
        activeTestId = candidate.id;
        activeTestTitle = candidate.title || 'Published Mock Test';
      } else {
        const rootTestsSnap = await getDocs(query(collection(db, 'tests'), limit(3)));
        if (!rootTestsSnap.empty) {
          const d = rootTestsSnap.docs[0];
          activeTestId = d.id;
          activeTestTitle = d.data()?.title || 'Root Mock Test';
          activeTestQuestions = d.data()?.questions || [];
        }
      }

      checks.push({
        name: 'MCB Catalog & Batch Discovery',
        category: 'cloud',
        passed: Boolean(activeTestId),
        latencyMs: Date.now() - tCatStart,
        details: activeTestId
          ? `Discovered test "${activeTestTitle}" (${activeTestId})${activeBatchId ? ` and batch ${activeBatchId}` : ''}`
          : 'No published tests found in master_catalog or tests collection.',
      });
    } catch (err) {
      checks.push({
        name: 'MCB Catalog & Batch Discovery',
        category: 'cloud',
        passed: false,
        latencyMs: Date.now() - tCatStart,
        details: `Catalog read error: ${(err as Error).message}`,
      });
    }

    if (!activeTestId) {
      return { checks, manifest };
    }

    // 2. Published Paper & Solution Rehydration Verification
    const tPaperStart = Date.now();
    try {
      const paperSnap = await getDoc(
        doc(db, 'test_leaderboards', activeTestId, 'summary', 'published_paper')
      );
      if (paperSnap.exists()) {
        const paperData = paperSnap.data();
        if (Array.isArray(paperData?.questions) && paperData.questions.length > 0) {
          activeTestQuestions = paperData.questions;
        }
      }

      if (activeTestQuestions.length === 0) {
        const rootSnap = await getDoc(doc(db, 'tests', activeTestId));
        if (rootSnap.exists() && Array.isArray(rootSnap.data()?.questions)) {
          activeTestQuestions = rootSnap.data()!.questions;
        }
      }

      const withSolutions = activeTestQuestions.filter(
        (q) => Boolean(q?.explanation || q?.solution)
      ).length;

      checks.push({
        name: 'Published Paper & Solutions Rehydration',
        category: 'sync',
        passed: activeTestQuestions.length > 0,
        latencyMs: Date.now() - tPaperStart,
        details:
          activeTestQuestions.length > 0
            ? `Rehydrated ${activeTestQuestions.length} questions (${withSolutions} with step-by-step solutions)`
            : 'Questions array empty across published_paper and root tests.',
      });
    } catch (err) {
      checks.push({
        name: 'Published Paper & Solutions Rehydration',
        category: 'sync',
        passed: false,
        latencyMs: Date.now() - tPaperStart,
        details: `Paper fetch failed: ${(err as Error).message}`,
      });
    }

    // 3. Local Dynamic Math Engine & Variable Interpolation Verification
    const tEngineStart = Date.now();
    let enginePassed = true;
    let engineDetails = '';
    try {
      const sampleDynamicQ = activeTestQuestions.find((q) => q?.isDynamic || q?.fixedVars) || {
        id: 'syn_dyn_q1',
        text: 'What is the value of $i^{{n}} + i^{{n}+1} + i^{{n}+2} + i^{{n}+3}$?',
        topic: 'Complex Numbers',
        type: 'mcq' as const,
        options: ['$0$', '$1$', '$-1$', '$i$'],
        correctAnswer: '0',
        correctOptionIndex: 0,
        explanation: 'For $n = {n}$, the sum of 4 consecutive powers of $i$ is $0$.',
        fixedVars: { n: 2026 },
        isDynamic: true,
        points: 1,
      };

      const inst = instantiateQuestion(sampleDynamicQ, {
        seed: 202611,
        difficulty: 'Medium',
      });
      const renderedText = interpolateVariables(
        inst.text,
        inst.fixedVars || { n: 2026 }
      );
      const hasBrokenToken = /undefined|NaN/.test(renderedText);
      enginePassed = Boolean(renderedText) && !hasBrokenToken;
      engineDetails = enginePassed
        ? `Instantiated dynamic template cleanly: "${renderedText.slice(0, 75)}..."`
        : `Broken token detected in rendered output: ${renderedText}`;
    } catch (err) {
      enginePassed = false;
      engineDetails = `Dynamic math engine error: ${(err as Error).message}`;
    }
    checks.push({
      name: 'Dynamic Math Engine & Solution Interpolation',
      category: 'engine',
      passed: enginePassed,
      latencyMs: Date.now() - tEngineStart,
      details: engineDetails,
    });

    // 4. Simulated Student Test Taking & Cloud Sync Write/Read Verification
    const tSubmitStart = Date.now();
    const attemptId = `attempt_syn_${Date.now()}`;
    const answers: Record<string, any> = {};
    let score = 0;

    const questionsToSimulate = activeTestQuestions.slice(0, Math.min(5, activeTestQuestions.length));
    for (let i = 0; i < questionsToSimulate.length; i++) {
      const q = questionsToSimulate[i];
      const qId = q.id || `q_${i + 1}`;
      const isCorrect = i % 2 === 0; // Mix of correct & incorrect for realistic analytics
      const selectedOpt = isCorrect
        ? String(q.correctAnswer ?? '0')
        : String(((Number(q.correctOptionIndex ?? 0) + 1) % 4));
      if (isCorrect) score += q.points || 1;

      answers[qId] = {
        questionId: qId,
        selectedOption: selectedOpt,
        isCorrect,
        timeSpentSeconds: options.pacingMode === 'human' ? 12 + i * 3 : 2,
        flagged: i === 1,
        topic: q.topic || 'Mathematics',
        subtopic: q.subtopic || 'General',
      };

      if (options.pacingMode === 'human') {
        await sleep(350);
      }
    }

    const totalPoints = Math.max(1, questionsToSimulate.length);
    const percentage = Math.round((score / totalPoints) * 100);

    const syntheticAttempt = {
      id: attemptId,
      testId: activeTestId,
      testTitle: activeTestTitle,
      testTopic: 'Synthetic Audit',
      userId: persona.uid,
      userEmail: persona.email,
      userName: persona.displayName,
      score,
      totalPoints,
      percentage,
      passed: percentage >= 40,
      timeSpentSeconds: options.pacingMode === 'human' ? 65 : 8,
      answers,
      attemptMode: 'online',
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isSyntheticBot: true,
      syntheticRunId: options.runId,
    };

    try {
      // Write synthetic user profile & attempt history
      const profileRef = doc(db, 'user_profiles', persona.uid);
      await setDoc(
        profileRef,
        {
          uid: persona.uid,
          email: persona.email,
          displayName: persona.displayName,
          isSyntheticBot: true,
          syntheticRunId: options.runId,
          updatedAt: new Date().toISOString(),
          attempts: [syntheticAttempt],
          testHistories: {
            [activeTestId]: {
              testId: activeTestId,
              testTitle: activeTestTitle,
              firstAttempt: syntheticAttempt,
              lastAttempt: syntheticAttempt,
              attemptCount: 1,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        { merge: true }
      );
      manifest.createdRecords.push({
        collectionPath: 'user_profiles',
        docId: persona.uid,
        description: 'Synthetic Tester Profile & Attempt History',
      });

      // Write synthetic leaderboard entry
      const lbEntryPath = `test_leaderboards/${activeTestId}/entries`;
      const lbEntryRef = doc(db, lbEntryPath, persona.uid);
      await setDoc(lbEntryRef, {
        userId: persona.uid,
        userEmail: persona.email,
        userName: persona.displayName,
        testId: activeTestId,
        score,
        totalPoints,
        percentage,
        timeSpentSeconds: syntheticAttempt.timeSpentSeconds,
        completedAt: syntheticAttempt.completedAt,
        isSyntheticBot: true,
        syntheticRunId: options.runId,
      });
      manifest.createdRecords.push({
        collectionPath: lbEntryPath,
        docId: persona.uid,
        description: `Synthetic Leaderboard Entry for ${activeTestTitle}`,
      });

      // Read-back verification to confirm real cloud sync persistence
      const readBackProfile = await getDoc(profileRef);
      const readBackLb = await getDoc(lbEntryRef);
      const syncVerified =
        readBackProfile.exists() &&
        readBackLb.exists() &&
        readBackProfile.data()?.attempts?.[0]?.id === attemptId;

      checks.push({
        name: 'Cloud Sync Write & Read-Back Integrity',
        category: 'sync',
        passed: syncVerified,
        latencyMs: Date.now() - tSubmitStart,
        details: syncVerified
          ? `Attempt (${score}/${totalPoints}, ${percentage}%) synced & verified across user_profiles + test_leaderboards`
          : 'Read-back verification failed after Firestore write.',
      });

      // 5. Guest Mode Leaderboard Sync Check (unauthenticated guest_entries for guest-enabled batches)
      const tGuestStart = Date.now();
      try {
        const guestBatchesSnap = await getDocs(query(collection(db, 'batches'), limit(50)));
        const guestEnabledBatch = guestBatchesSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .find((b) => Boolean(b.allowGuestAccess && b.enableGuestTestRankings));

        if (!guestEnabledBatch) {
          checks.push({
            name: 'Guest Mode Leaderboard Cloud Sync',
            category: 'sync',
            passed: true,
            latencyMs: Date.now() - tGuestStart,
            details: 'No batch currently has both allowGuestAccess and enableGuestTestRankings enabled (skipped).',
          });
        } else {
          const guestCanonicalId = `test_title_bot_guest_sync_${options.runId}`;
          const guestUid = `guest_bot_${options.runId}`;
          const guestEntryId = `${guestUid}_${guestCanonicalId}`.slice(0, 150);
          const guestRef = doc(db, 'test_leaderboards', guestCanonicalId, 'guest_entries', guestEntryId);
          await setDoc(guestRef, {
            id: guestEntryId,
            userId: guestUid,
            displayName: 'Bot Guest Runner',
            score: 42,
            maxScore: 150,
            accuracy: 28,
            timeTakenSeconds: 95,
            batchId: guestEnabledBatch.id,
            testId: guestCanonicalId,
            testTitle: `Bot Guest Sync ${options.runId}`,
            isGuest: true,
            submittedAt: new Date().toISOString(),
          });
          const guestReadBack = await getDoc(guestRef);
          const guestOk =
            guestReadBack.exists() &&
            guestReadBack.data()?.isGuest === true &&
            guestReadBack.data()?.batchId === guestEnabledBatch.id;
          checks.push({
            name: 'Guest Mode Leaderboard Cloud Sync',
            category: 'sync',
            passed: guestOk,
            latencyMs: Date.now() - tGuestStart,
            details: guestOk
              ? `Guest entry synced & read back for batch "${guestEnabledBatch.title || guestEnabledBatch.id}"`
              : 'Guest entry read-back verification failed.',
          });
        }
      } catch (guestErr) {
        checks.push({
          name: 'Guest Mode Leaderboard Cloud Sync',
          category: 'sync',
          passed: false,
          latencyMs: Date.now() - tGuestStart,
          details: `Guest leaderboard sync failed: ${(guestErr as Error).message}`,
        });
      }
    } catch (err) {
      checks.push({
        name: 'Cloud Sync Write & Read-Back Integrity',
        category: 'sync',
        passed: false,
        latencyMs: Date.now() - tSubmitStart,
        details: `Cloud sync write failed: ${(err as Error).message}`,
      });
    }
  } finally {
    await deleteApp(app).catch(() => {});
  }

  return { checks, manifest };
}
