import { 
  type MathTest, 
  type MathQuestion, 
  type TestAttempt, 
  type AssignedRemedialTest, 
  type QuestionPointer, 
  type RemedialFilterType,
  type LeaderboardEntry,
  normalizeQuestions,
  checkIsOptionCorrect
} from '../types';
import { isOfflineLocalOnlyMode, getScopedKey, loadScopedTests } from './storage';
import { getAllAttemptsAcrossAllUsersFromIndexedDB } from './indexedDbStorage';
import { 
  auth, 
  db, 
  sanitizeForFirestore, 
  getCanonicalLeaderboardId, 
  getLocalLeaderboardEntries,
  fetchFullTestFromFirestore,
  getCachedFullTest
} from './firebase';
import { 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  limit, 
  arrayUnion, 
  arrayRemove, 
  deleteField, 
  onSnapshot, 
  writeBatch,
  type Unsubscribe 
} from 'firebase/firestore';

/**
 * Designated Master Enterprise Account Email
 * Only this email address is granted Master Enterprise & Academic Head authority.
 */
export const MASTER_ADMIN_EMAIL = 'sanju3456k@gmail.com';

/** Storage Keys */
export const MASTER_PUBLISHED_TESTS_KEY = 'elevate_master_published_test_ids';
export const GLOBAL_PUBLISHED_TESTS_KEY = 'elevate_global_published_tests';
export const MASTER_DISPATCH_LEDGER_KEY = 'elevate_master_remedial_ledger';
export const ELEVATE_DELETED_REMEDIAL_IDS_KEY = 'elevate_deleted_remedial_ids';
export const ELEVATE_MASTER_DISMISSED_LEDGER_IDS_KEY = 'elevate_master_dismissed_ledger_ids';

/**
 * Scientific Part-Chunking & Automated Backup Rules
 * 700 KB safe ceiling (70% of 1,048,576 bytes Firestore hard document limit)
 */
export const CHUNK_SAFE_THRESHOLD_BYTES = 716800; // 700 KB safe ceiling

export function estimateByteSize(data: any): number {
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return new TextEncoder().encode(str).length;
  } catch {
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 1024;
    }
  }
}

export type RemedialDeleteScope = 'both' | 'master_only';

export function getMasterDismissedLedgerIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ELEVATE_MASTER_DISMISSED_LEDGER_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function recordMasterDismissedLedgerId(id: string): void {
  try {
    const set = getMasterDismissedLedgerIds();
    set.add(id);
    localStorage.setItem(ELEVATE_MASTER_DISMISSED_LEDGER_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Retrieve the set of test IDs that have been explicitly deleted from the ledger.
 */
export function getDeletedRemedialIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ELEVATE_DELETED_REMEDIAL_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Record a deleted remedial test ID into the local persistent blacklist.
 */
export function recordDeletedRemedialId(id: string): void {
  try {
    const set = getDeletedRemedialIds();
    set.add(id);
    localStorage.setItem(ELEVATE_DELETED_REMEDIAL_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Verify whether an authenticated or cached user is the Master Enterprise Account.
 */
export function isMasterUser(user: { email?: string | null } | null | undefined): boolean {
  if (!user || !user.email) return false;
  return user.email.toLowerCase().trim() === MASTER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Check whether a user is a guest, anonymous, or unauthenticated session.
 * Master Console implements (published tests, remedial tests, cohort tracking)
 * are strictly reserved for logged-in, authenticated users.
 */
export function isGuestUser(user?: { uid?: string | null; email?: string | null; isAnonymous?: boolean } | null): boolean {
  if (!user) return true;
  if (user.isAnonymous) return true;
  const uid = (user.uid || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();

  // If neither UID nor email is provided, treat as unauthenticated / guest
  if (!uid && !email) return true;

  const isGuestUid = !uid || uid === 'guest-user' || uid === 'guest_user' || uid === 'anonymous' || uid === 'local-user';
  const isGuestEmail = !email || email === 'guest@local' || email.startsWith('guest_') || !email.includes('@');

  // Both UID and email must match guest credentials for an account to be quarantined as a guest.
  // If a user has a valid authenticated UID (e.g. Firebase Auth UID), they are NOT a guest even if email was omitted from the record.
  if (isGuestUid && isGuestEmail) {
    return true;
  }
  return false;
}

/**
 * Check if a test is explicitly published by the Master Account.
 * STRICT: Only returns true if its testId has been added to MASTER_PUBLISHED_TESTS_KEY.
 * Never defaults to true based on authorEmail alone!
 */
export function isTestPublished(testId: string): boolean {
  if (!testId) return false;
  const publishedIds = new Set(getMasterPublishedTestIds());
  return publishedIds.has(testId);
}

/**
 * Alias for isTestPublished for backwards compatibility
 */
export function isMasterTest(test: Partial<MathTest> | null | undefined): boolean {
  if (!test || !test.id) return false;
  return isTestPublished(test.id);
}

/**
 * Check if a test is a personalized remedial practice test.
 * Remedial practice sets are customized to individual students and do not participate in public rankings.
 */
export function isRemedialTest(test: Partial<MathTest> | null | undefined): boolean {
  if (!test) return false;
  return Boolean(
    (test as any).isPersonalizedRemedial ||
    test.category === 'Remedial' ||
    (test.id && String(test.id).startsWith('remedial_')) ||
    (test as any).remedialAssignment ||
    test.topic === 'Personalized Test' ||
    test.topic === 'Targeted Remedial Practice'
  );
}

/**
 * Retrieve the set of test IDs marked as Master Published.
 */
export function getMasterPublishedTestIds(): string[] {
  try {
    const raw = localStorage.getItem(MASTER_PUBLISHED_TESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get map of all published tests stored globally on this device.
 */
export function getGlobalPublishedTestsMap(): Record<string, MathTest> {
  try {
    const raw = localStorage.getItem(GLOBAL_PUBLISHED_TESTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Get array of all published tests for students.
 */
export function getGlobalPublishedTests(): MathTest[] {
  const map = getGlobalPublishedTestsMap();
  const publishedIds = new Set(getMasterPublishedTestIds());
  return Object.values(map)
    .filter((t) => t && t.id && publishedIds.has(t.id))
    .map((t) => {
      const qLen = Array.isArray(t.questions) && t.questions.length > 0 ? t.questions.length : 0;
      const count = qLen || t.questionCount || (t as any).questionsCount || t.timeLimitMinutes || 50;
      return {
        ...t,
        questionCount: count,
      };
    });
}

/**
 * Filter a list of tests down to only Master-published tests.
 */
export function filterMasterTests(allTests: MathTest[]): MathTest[] {
  const publishedIds = new Set(getMasterPublishedTestIds());
  return allTests.filter((t) => publishedIds.has(t.id));
}

/**
 * Publish a test globally for all students.
 * In a normalized architecture, this test paper is stored once globally (~40 KB)
 * and accessible by all students who create lightweight ~1 KB attempt records.
 */
export async function publishMasterTest(test: MathTest): Promise<{ success: boolean; test: MathTest }> {
  const masterTest: MathTest = {
    ...test,
    authorName: 'Academic Master',
    authorEmail: MASTER_ADMIN_EMAIL,
    isPublic: true,
    updatedAt: new Date().toISOString(),
  };
  (masterTest as any).isMasterTest = true;
  (masterTest as any).isOfficial = true;
  (masterTest as any).publishedToStudents = true;

  // 1. Update Master published IDs registry in local storage
  try {
    const ids = getMasterPublishedTestIds();
    if (!ids.includes(masterTest.id)) {
      ids.push(masterTest.id);
      localStorage.setItem(MASTER_PUBLISHED_TESTS_KEY, JSON.stringify(ids));
    }

    // 2. Save full test paper into global shared storage so any student account sees it immediately
    const globalMap = getGlobalPublishedTestsMap();
    globalMap[masterTest.id] = masterTest;
    localStorage.setItem(GLOBAL_PUBLISHED_TESTS_KEY, JSON.stringify(globalMap));
  } catch (err) {
    console.warn('Failed to save master published test to localStorage:', err);
  }

  // 3. Persist to Firestore:
  if (!isOfflineLocalOnlyMode() && auth.currentUser) {
    try {
      // Enterprise Diamond Plan: Light metadata pointer stored in catalog (~1 KB)
      const resolvedQuestions = (Array.isArray(masterTest.questions) && masterTest.questions.length > 0)
        ? masterTest.questions
        : (getCachedFullTest(masterTest.id)?.questions || []);
      const resolvedCount = resolvedQuestions.length || (masterTest as any).questionCount || masterTest.timeLimitMinutes || 50;

      const catalogPointer: MathTest = {
        ...masterTest,
        questions: [], // Stripped from catalog to prevent 1 MB overflow & heavy download bloat
        questionCount: resolvedCount,
      };
      (catalogPointer as any).hasFullPaper = true;
      const sanitizedPointer = sanitizeForFirestore(catalogPointer);
      const sanitizedFullPaper = sanitizeForFirestore(masterTest);

      // Channel A: MASTER_CATALOG summary document (stores strictly lightweight pointers)
      // Scientific Chunking: checks 700 KB safe threshold; auto-spills to Part 2 if limit reached
      const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests');
      const catalogPart2DocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests_part_2');
      const catalogBackupDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'backup', 'latest_snapshot');

      const catalogSnap = await getDoc(catalogDocRef).catch(() => null);
      let targetRef = catalogDocRef;
      let isPart2 = false;

      if (catalogSnap && catalogSnap.exists()) {
        const catData = catalogSnap.data() || {};
        const currentSize = estimateByteSize(catData);
        if (currentSize >= CHUNK_SAFE_THRESHOLD_BYTES || catData.hasPart2) {
          targetRef = catalogPart2DocRef;
          isPart2 = true;
          // Mark Part 1 with manifest metadata pointing to Part 2
          await setDoc(catalogDocRef, {
            hasPart2: true,
            totalParts: 2,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }
      }

      await setDoc(targetRef, {
        part: isPart2 ? 2 : 1,
        tests: {
          [masterTest.id]: sanitizedPointer,
        },
        publishedIds: arrayUnion(masterTest.id),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Channel B: Authoritative Full Paper (stored ONCE globally under test_leaderboards/{id}/summary/published_paper)
      const docRef = doc(db, 'test_leaderboards', masterTest.id, 'summary', 'published_paper');
      await setDoc(docRef, sanitizedFullPaper, { merge: true });

      // Channel C: Master Authoritative Library Storage
      if (isMasterUser(auth.currentUser)) {
        try {
          const masterAuthoritativeDocRef = doc(db, 'master_account', 'library', 'tests', masterTest.id);
          await setDoc(masterAuthoritativeDocRef, sanitizedFullPaper, { merge: true }).catch(() => {});
        } catch {}
      }

      // Channel D: Atomic Backup Snapshot (Mirror state for disaster recovery)
      await setDoc(catalogBackupDocRef, {
        testId: masterTest.id,
        testTitle: masterTest.title,
        snapshotAction: 'publish',
        lastPublishedTest: sanitizedPointer,
        backupTimestamp: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    } catch (err) {
      console.warn('Could not sync published test paper to cloud:', err);
    }
  }

  // 4. Notify app components that published tests have changed
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tests-published-updated', { detail: { testId: masterTest.id, isPublished: true } }));
  }

  return { success: true, test: masterTest };
}

/**
 * Unpublish a test from the Master Global library.
 */
export async function unpublishMasterTest(testId: string): Promise<void> {
  try {
    const ids = getMasterPublishedTestIds().filter((id) => id !== testId);
    localStorage.setItem(MASTER_PUBLISHED_TESTS_KEY, JSON.stringify(ids));

    const globalMap = getGlobalPublishedTestsMap();
    delete globalMap[testId];
    localStorage.setItem(GLOBAL_PUBLISHED_TESTS_KEY, JSON.stringify(globalMap));
  } catch (err) {
    console.warn('Failed to unpublish test from localStorage:', err);
  }

  // In Firestore: cleanly remove from all cloud channels
  if (!isOfflineLocalOnlyMode() && auth.currentUser) {
    try {
      // 1. Fetch current catalog and cleanly remove the test from Part 1
      const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests');
      const catalogSnap = await getDoc(catalogDocRef).catch(() => null);
      if (catalogSnap && catalogSnap.exists()) {
        const catData = catalogSnap.data() || {};
        const currentTests = { ...(catData.tests || {}) };
        delete currentTests[testId];
        const currentIds = (catData.publishedIds || []).filter((id: string) => id !== testId);
        await setDoc(catalogDocRef, {
          tests: currentTests,
          publishedIds: currentIds,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 1b. Check and remove from Part 2 if present
      try {
        const catalogPart2DocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests_part_2');
        const part2Snap = await getDoc(catalogPart2DocRef).catch(() => null);
        if (part2Snap && part2Snap.exists()) {
          const p2Data = part2Snap.data() || {};
          const p2Tests = { ...(p2Data.tests || {}) };
          if (p2Tests[testId]) {
            delete p2Tests[testId];
            const p2Ids = (p2Data.publishedIds || []).filter((id: string) => id !== testId);
            await setDoc(catalogPart2DocRef, {
              tests: p2Tests,
              publishedIds: p2Ids,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        }
      } catch {}

      // 1c. Mirror disaster recovery snapshot backup
      try {
        const catalogBackupDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'backup', 'latest_snapshot');
        await setDoc(catalogBackupDocRef, {
          testId,
          snapshotAction: 'unpublish',
          backupTimestamp: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      } catch {}

      // 2. Delete discrete paper doc under test_leaderboards
      const docRef = doc(db, 'test_leaderboards', testId, 'summary', 'published_paper');
      await deleteDoc(docRef).catch(() => {});

      // 2b. Delete from master authoritative library
      if (isMasterUser(auth.currentUser)) {
        try {
          const masterAuthoritativeDocRef = doc(db, 'master_account', 'library', 'tests', testId);
          await deleteDoc(masterAuthoritativeDocRef).catch(() => {});
        } catch {}
      }
    } catch (err) {
      console.warn('Could not complete cloud unpublish:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tests-published-updated', { detail: { testId, isPublished: false } }));
  }
}

/**
 * Toggle publish status of a test by the Master Account.
 */
export async function toggleTestPublishStatus(test: MathTest): Promise<{ isPublished: boolean; test: MathTest }> {
  const isCurrentlyPublished = isTestPublished(test.id);

  if (isCurrentlyPublished) {
    await unpublishMasterTest(test.id);
    const updatedTest = { ...test, isPublic: false };
    (updatedTest as any).isMasterTest = false;
    (updatedTest as any).isOfficial = false;
    (updatedTest as any).publishedToStudents = false;
    return { isPublished: false, test: updatedTest };
  } else {
    const result = await publishMasterTest(test);
    return { isPublished: true, test: result.test };
  }
}

/**
 * Synchronously load published master tests from local storage,
 * and asynchronously fetch / listen for real-time cloud updates.
 */
export async function fetchPublishedMasterTestsFromCloud(): Promise<MathTest[]> {
  if (isOfflineLocalOnlyMode()) return getGlobalPublishedTests();

  try {
    // 1. Primary read: MASTER_CATALOG summary (1 Read for all published tests)
    const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests');
    const snap = await getDoc(catalogDocRef).catch(() => null);

    if (snap && snap.exists()) {
      const data = snap.data();
      let rawTests = { ...(data.tests || {}) };

      // Scientific Part 2 Chunking: If hasPart2 is true, read Part 2 and merge seamlessly
      if (data.hasPart2) {
        try {
          const catalogPart2DocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests_part_2');
          const part2Snap = await getDoc(catalogPart2DocRef).catch(() => null);
          if (part2Snap && part2Snap.exists()) {
            const p2Data = part2Snap.data();
            if (p2Data && p2Data.tests) {
              rawTests = { ...rawTests, ...p2Data.tests };
            }
          }
        } catch (p2Err) {
          console.warn('Could not read published_tests_part_2:', p2Err);
        }
      }

      const list: MathTest[] = [];
      const ids: string[] = [];

      const existingMap = getGlobalPublishedTestsMap();
      const mergedMap: Record<string, MathTest> = {};

      Object.values(rawTests).forEach((t: any) => {
        if (t && t.id) {
          const existing = existingMap[t.id];
          const cached = getCachedFullTest(t.id);
          const hasQ = Array.isArray(t.questions) && t.questions.length > 0;
          const existingHasQ = existing && Array.isArray(existing.questions) && existing.questions.length > 0;
          const cachedHasQ = cached && Array.isArray(cached.questions) && cached.questions.length > 0;
          
          const resolvedQuestions = hasQ
            ? t.questions
            : (existingHasQ ? existing.questions : (cachedHasQ ? cached.questions : (t.questions || [])));

          const resolvedCount = resolvedQuestions.length || t.questionCount || (existing as any)?.questionCount || (cached as any)?.questionCount || t.timeLimitMinutes || 50;

          const testWithQuestions: MathTest = {
            ...t,
            questions: resolvedQuestions,
            questionCount: resolvedCount,
          };
          mergedMap[t.id] = testWithQuestions;
          list.push(testWithQuestions);
          ids.push(t.id);
        }
      });

      // Update local cache
      try {
        localStorage.setItem(GLOBAL_PUBLISHED_TESTS_KEY, JSON.stringify(mergedMap));
        localStorage.setItem(MASTER_PUBLISHED_TESTS_KEY, JSON.stringify(ids));
      } catch {}

      return list;
    }
  } catch (err) {
    console.warn('Failed to fetch published master tests from cloud:', err);
  }

  return getGlobalPublishedTests();
}

/**
 * Real-time subscription to published master tests for all students.
 */
export function subscribeToPublishedMasterTests(
  onUpdate: (tests: MathTest[]) => void
): () => void {
  if (isOfflineLocalOnlyMode() || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests');
    const unsubscribe = onSnapshot(
      catalogDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          let rawTests = { ...(data.tests || {}) };

          const processAndNotify = (allMap: Record<string, any>) => {
            const list: MathTest[] = [];
            const ids: string[] = [];
            const existingMap = getGlobalPublishedTestsMap();
            const mergedMap: Record<string, MathTest> = {};

            Object.values(allMap).forEach((t: any) => {
              if (t && t.id) {
                const existing = existingMap[t.id];
                const cached = getCachedFullTest(t.id);
                const hasQ = Array.isArray(t.questions) && t.questions.length > 0;
                const existingHasQ = existing && Array.isArray(existing.questions) && existing.questions.length > 0;
                const cachedHasQ = cached && Array.isArray(cached.questions) && cached.questions.length > 0;

                const resolvedQuestions = hasQ
                  ? t.questions
                  : (existingHasQ ? existing.questions : (cachedHasQ ? cached.questions : (t.questions || [])));

                const resolvedCount = resolvedQuestions.length || t.questionCount || (existing as any)?.questionCount || (cached as any)?.questionCount || t.timeLimitMinutes || 50;

                const testWithQuestions: MathTest = {
                  ...t,
                  questions: resolvedQuestions,
                  questionCount: resolvedCount,
                };
                mergedMap[t.id] = testWithQuestions;
                list.push(testWithQuestions);
                ids.push(t.id);
              }
            });
            try {
              localStorage.setItem(GLOBAL_PUBLISHED_TESTS_KEY, JSON.stringify(mergedMap));
              localStorage.setItem(MASTER_PUBLISHED_TESTS_KEY, JSON.stringify(ids));
            } catch {}
            onUpdate(list);
            window.dispatchEvent(new CustomEvent('tests-published-updated', { detail: { count: list.length } }));
          };

          if (data.hasPart2) {
            getDoc(doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests_part_2'))
              .then((p2Snap) => {
                if (p2Snap && p2Snap.exists()) {
                  const p2Data = p2Snap.data();
                  if (p2Data?.tests) {
                    rawTests = { ...rawTests, ...p2Data.tests };
                  }
                }
              })
              .catch(() => {})
              .finally(() => {
                processAndNotify(rawTests);
              });
          } else {
            processAndNotify(rawTests);
          }
        }
      },
      (error) => {
        console.warn('Published master tests subscription notice:', error?.message);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Could not establish real-time published master tests listener:', e);
    return () => {};
  }
}

/**
 * Merge published master tests into a student's tests list.
 * If user is master, returns user's tests as-is.
 * If user is guest, returns user's tests strictly without any Master-published tests or remedial tests!
 * If user is authenticated student, combines student's tests with all published master tests.
 */
export function mergePublishedMasterTests(
  userTests: MathTest[],
  isUserMaster: boolean,
  isGuest: boolean = false
): MathTest[] {
  if (isUserMaster) return userTests;

  const publishedIds = new Set(getMasterPublishedTestIds());

  // STRICT RULE: Guest users DO NOT receive or access Master Console published tests or remedial tests!
  if (isGuest) {
    return userTests.filter((t) => !publishedIds.has(t.id) && !isMasterTest(t) && !isRemedialTest(t));
  }

  const published = getGlobalPublishedTests();
  if (published.length === 0) return userTests;

  const testMap = new Map<string, MathTest>();
  // 1. Add published master tests first
  published.forEach((t) => {
    if (t && t.id) {
      const qLen = Array.isArray(t.questions) && t.questions.length > 0 ? t.questions.length : 0;
      const count = qLen || t.questionCount || (t as any).questionsCount || t.timeLimitMinutes || 50;
      testMap.set(t.id, {
        ...t,
        questionCount: count,
      });
    }
  });
  // 2. Add student tests
  userTests.forEach((t) => {
    if (t && t.id) {
      const existing = testMap.get(t.id);
      const qLen = Array.isArray(t.questions) && t.questions.length > 0
        ? t.questions.length
        : (existing && Array.isArray(existing.questions) && existing.questions.length > 0 ? existing.questions.length : 0);
      const count = qLen || t.questionCount || existing?.questionCount || (t as any).questionsCount || t.timeLimitMinutes || 50;
      testMap.set(t.id, {
        ...existing,
        ...t,
        questions: (Array.isArray(t.questions) && t.questions.length > 0) ? t.questions : (existing?.questions || []),
        questionCount: count,
      });
    }
  });

  return Array.from(testMap.values());
}

/**
 * Helper to get the assigned remedial tests key for a student.
 */
function getStudentAssignedKey(studentId: string): string {
  const sanitized = studentId || 'local-user';
  return `elevate_assigned_tests_${sanitized}`;
}

/**
 * Retrieve all remedial tests assigned to a specific student.
 * Filters out unassigned tests automatically.
 * Returns empty array for guest users.
 */
export function getAssignedRemedialTestsForStudent(studentId: string): AssignedRemedialTest[] {
  if (isGuestUser({ uid: studentId })) return [];
  try {
    const key = getStudentAssignedKey(studentId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list: AssignedRemedialTest[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((a) => !a.isUnassigned);
  } catch {
    return [];
  }
}

/**
 * Remove an assigned remedial test completely from a student's local storage.
 * Purges across specific key AND all elevate_assigned_tests_* keys.
 */
export function removeAssignedRemedialTestForStudent(assignmentId: string, studentId?: string): void {
  try {
    if (studentId) {
      const key = getStudentAssignedKey(studentId);
      const raw = localStorage.getItem(key);
      if (raw) {
        const current: AssignedRemedialTest[] = JSON.parse(raw);
        if (Array.isArray(current)) {
          const updated = current.filter((a) => a.id !== assignmentId);
          localStorage.setItem(key, JSON.stringify(updated));
        }
      }
    }

    // Also scan all elevate_assigned_tests_* keys and purge completely
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('elevate_assigned_tests_')) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const current: AssignedRemedialTest[] = JSON.parse(raw);
            if (Array.isArray(current)) {
              const updated = current.filter((a) => a.id !== assignmentId);
              localStorage.setItem(k, JSON.stringify(updated));
            }
          }
        } catch {}
      }
    }
  } catch {}
}

/**
 * Save or update an assigned remedial test for a student.
 * Guarded: NEVER saves unassigned/revoked tests, and NEVER saves for guest users!
 */
export function saveAssignedRemedialTestForStudent(assignment: AssignedRemedialTest): void {
  try {
    if (isGuestUser({ uid: assignment.studentId, email: assignment.studentEmail })) {
      return; // Strictly never save remedial assignments for guest users!
    }

    const ledger = getMasterDispatchLedger();
    const ledgerItem = ledger.find((a) => a.id === assignment.id);
    if ((ledgerItem && ledgerItem.isUnassigned) || assignment.isUnassigned) {
      // Revoked/unassigned by Master: do NOT save and ensure it is removed
      removeAssignedRemedialTestForStudent(assignment.id, assignment.studentId);
      return;
    }

    const key = getStudentAssignedKey(assignment.studentId);
    const current = getAssignedRemedialTestsForStudent(assignment.studentId);
    const index = current.findIndex((a) => a.id === assignment.id);
    if (index >= 0) {
      current[index] = assignment;
    } else {
      current.unshift(assignment);
    }
    localStorage.setItem(key, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save assigned remedial test:', err);
  }
}

/**
 * Mark an assigned remedial test as completed by a student.
 * Syncs the completion score and percentage back to Master Console catalog.
 */
export async function markRemedialTestCompleted(
  assignmentId: string, 
  studentId: string, 
  score: number, 
  percentage: number
): Promise<void> {
  const assigned = getAssignedRemedialTestsForStudent(studentId);
  const target = assigned.find((a) => a.id === assignmentId);
  if (target) {
    target.isCompleted = true;
    target.completedScore = score;
    target.completedPercentage = percentage;
    target.completedAt = new Date().toISOString();
    saveAssignedRemedialTestForStudent(target);

    // Sync only completion result back to Master Catalog
    if (!isOfflineLocalOnlyMode() && auth.currentUser) {
      try {
        const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
        const snap = await getDoc(catalogDocRef).catch(() => null);
        if (snap && snap.exists()) {
          const data = snap.data();
          const asgs = { ...(data.assignments || {}) };
          if (asgs[assignmentId]) {
            asgs[assignmentId].isCompleted = true;
            asgs[assignmentId].completedScore = score;
            asgs[assignmentId].completedPercentage = percentage;
            asgs[assignmentId].completedAt = target.completedAt;
            await setDoc(catalogDocRef, { assignments: asgs, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Failed to sync remedial completion to cloud:', err);
      }
    }
  }
}

/**
 * Read the entire Master Dispatch Ledger (all remedial tests sent by Master).
 */
export function getMasterDispatchLedger(): AssignedRemedialTest[] {
  try {
    const raw = localStorage.getItem(MASTER_DISPATCH_LEDGER_KEY);
    const parsed: AssignedRemedialTest[] = raw ? JSON.parse(raw) : [];
    const deletedIds = getDeletedRemedialIds();
    const dismissedIds = getMasterDismissedLedgerIds();
    return parsed.filter(
      (a) => a && a.id && !deletedIds.has(a.id) && !dismissedIds.has(a.id) && !(a as any).deletedFromMaster
    );
  } catch {
    return [];
  }
}

/**
 * Asynchronously fetch the entire Master Dispatch Ledger from Cloud Firestore (MASTER_REMEDIAL_CATALOG).
 * Merges with local ledger so tests dispatched across devices or sessions are never lost.
 */
export async function fetchMasterDispatchLedgerFromCloud(): Promise<AssignedRemedialTest[]> {
  const local = getMasterDispatchLedger();
  const deletedIds = getDeletedRemedialIds();
  const dismissedIds = getMasterDismissedLedgerIds();
  const filteredLocal = local.filter(
    (a) => a && a.id && !deletedIds.has(a.id) && !dismissedIds.has(a.id) && !(a as any).deletedFromMaster
  );

  if (filteredLocal.length !== local.length) {
    localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify(filteredLocal));
  }

  if (isOfflineLocalOnlyMode()) return filteredLocal;

  try {
    const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
    const snap = await getDoc(catalogDocRef).catch(() => null);
    if (snap && snap.exists()) {
      const data = snap.data();
      const allAsgs: Record<string, any> = { ...(data.assignments || {}) };

      Object.keys(data).forEach((k) => {
        if (k.startsWith('assignments.') && typeof data[k] === 'object' && data[k]?.id) {
          const subKey = k.replace('assignments.', '');
          if (!allAsgs[subKey]) allAsgs[subKey] = data[k];
        }
      });

      // Filter out deleted assignments
      let hadDeletedInCloud = false;
      Object.keys(allAsgs).forEach((k) => {
        if (deletedIds.has(k) || (allAsgs[k]?.id && deletedIds.has(allAsgs[k].id))) {
          hadDeletedInCloud = true;
          delete allAsgs[k];
        }
      });

      // If cloud contained deleted tests, clean it up in Firestore
      if (hadDeletedInCloud && auth.currentUser) {
        setDoc(catalogDocRef, { assignments: allAsgs, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      }

      const cloudLedger = (Object.values(allAsgs) as AssignedRemedialTest[]).filter(
        (a) => a && a.id && !deletedIds.has(a.id) && !dismissedIds.has(a.id) && !(a as any).deletedFromMaster
      );
      const map = new Map<string, AssignedRemedialTest>();

      // 1. Put cloud assignments (excluding deleted and dismissed ones)
      cloudLedger.forEach((a) => {
        if (a && a.id && !deletedIds.has(a.id) && !dismissedIds.has(a.id) && !(a as any).deletedFromMaster) {
          map.set(a.id, a);
        }
      });

      // 2. Merge local ledger items (preserve local unassigned status if newer)
      filteredLocal.forEach((a) => {
        if (!a || !a.id || deletedIds.has(a.id) || dismissedIds.has(a.id) || (a as any).deletedFromMaster) return;
        if (!map.has(a.id)) {
          map.set(a.id, a);
        } else if (a.isUnassigned !== undefined) {
          const cloudItem = map.get(a.id)!;
          map.set(a.id, {
            ...cloudItem,
            isUnassigned: a.isUnassigned,
            unassignedAt: a.unassignedAt || cloudItem.unassignedAt,
          });
        }
      });

      const merged = Array.from(map.values());
      // Sort newest first
      merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Could not fetch master dispatch ledger from cloud:', err);
  }

  return filteredLocal;
}

/**
 * Toggle assigned vs unassigned status of a dispatched remedial test.
 * When unassigned, it is immediately revoked from the student's mock tests library.
 */
export async function toggleRemedialAssignmentStatus(
  assignmentId: string
): Promise<{ isAssigned: boolean }> {
  try {
    const ledger = getMasterDispatchLedger();
    const item = ledger.find((a) => a.id === assignmentId);
    if (!item) return { isAssigned: false };

    const wasUnassigned = Boolean(item.isUnassigned);
    const newIsUnassigned = !wasUnassigned;

    item.isUnassigned = newIsUnassigned;
    item.unassignedAt = newIsUnassigned ? new Date().toISOString() : undefined;

    // 1. Save updated ledger locally
    localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify(ledger));

    // 2. Update local storage across ALL student keys
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('elevate_assigned_tests_')) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const list: AssignedRemedialTest[] = JSON.parse(raw);
              if (Array.isArray(list)) {
                if (newIsUnassigned) {
                  // Completely delete/revoke from student view
                  const filtered = list.filter((a) => a.id !== assignmentId);
                  localStorage.setItem(k, JSON.stringify(filtered));
                } else {
                  const idx = list.findIndex((a) => a.id === assignmentId);
                  if (idx >= 0) {
                    list[idx].isUnassigned = false;
                    delete list[idx].unassignedAt;
                  } else if (
                    k.includes(item.studentId) ||
                    (item.studentEmail && k.includes(item.studentEmail.toLowerCase().replace(/[@.]/g, '_')))
                  ) {
                    list.unshift({ ...item, isUnassigned: false });
                  }
                  localStorage.setItem(k, JSON.stringify(list));
                }
              }
            }
          } catch {}
        }
      }
    } catch {}

    // When re-assigning, ensure student gets the assigned test
    if (!newIsUnassigned) {
      saveAssignedRemedialTestForStudent({ ...item, isUnassigned: false });
    }

    // 3. Synchronize status with Firestore
    if (!isOfflineLocalOnlyMode() && auth.currentUser) {
      try {
        const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
        
        // Fetch current catalog doc to update the assignments map accurately
        const catSnap = await getDoc(catalogDocRef).catch(() => null);
        const catData = catSnap?.exists() ? catSnap.data() : {};
        const catAssignments = { ...(catData.assignments || {}) };

        // Also normalize any legacy dotted keys
        Object.keys(catData).forEach((k) => {
          if (k.startsWith('assignments.') && typeof catData[k] === 'object' && catData[k]?.id) {
            const asgKey = k.replace('assignments.', '');
            if (!catAssignments[asgKey]) catAssignments[asgKey] = catData[k];
          }
        });

        if (newIsUnassigned) {
          if (catAssignments[assignmentId]) {
            catAssignments[assignmentId].isUnassigned = true;
            catAssignments[assignmentId].unassignedAt = item.unassignedAt;
          } else {
            catAssignments[assignmentId] = { ...sanitizeForFirestore(item), isUnassigned: true, unassignedAt: item.unassignedAt };
          }
          await setDoc(catalogDocRef, {
            assignments: catAssignments,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});

          // Clean up student doc
          const safeStudentId = (item.studentId || '').replace(/[/.[\]*~#$]/g, '_');
          if (safeStudentId) {
            const studentDocRef = doc(db, 'test_leaderboards', `REMEDIAL_${safeStudentId}`, 'summary', 'assignment');
            const snap = await getDoc(studentDocRef).catch(() => null);
            if (snap && snap.exists()) {
              const d = snap.data();
              if (Array.isArray(d.assignments)) {
                const updated = d.assignments.filter((a: any) => a.id !== assignmentId);
                await setDoc(studentDocRef, { assignments: sanitizeForFirestore(updated), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
              }
            }
          }

          if (item.studentEmail) {
            const emailSlug = item.studentEmail.toLowerCase().replace(/[@.]/g, '_').replace(/[/.[\]*~#$]/g, '_');
            const emailDocRef = doc(db, 'test_leaderboards', `REMEDIAL_${emailSlug}`, 'summary', 'assignment');
            const snap = await getDoc(emailDocRef).catch(() => null);
            if (snap && snap.exists()) {
              const d = snap.data();
              if (Array.isArray(d.assignments)) {
                const updated = d.assignments.filter((a: any) => a.id !== assignmentId);
                await setDoc(emailDocRef, { assignments: sanitizeForFirestore(updated), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
              }
            }
          }

          const allRemedialDocRef = doc(db, 'test_leaderboards', 'REMEDIAL_ALL', 'summary', 'assignment');
          const allSnap = await getDoc(allRemedialDocRef).catch(() => null);
          if (allSnap && allSnap.exists()) {
            const d = allSnap.data();
            if (Array.isArray(d.assignments)) {
              const updated = d.assignments.filter((a: any) => a.id !== assignmentId);
              await setDoc(allRemedialDocRef, { assignments: sanitizeForFirestore(updated), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
            }
          }
        } else {
          // Re-assigned
          catAssignments[assignmentId] = sanitizeForFirestore({ ...item, isUnassigned: false });
          delete catAssignments[assignmentId].unassignedAt;

          await setDoc(catalogDocRef, {
            assignments: catAssignments,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('Cloud sync for toggle remedial status notice:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { assignmentId, isAssigned: !newIsUnassigned } }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'remedial-tests-updated' }));
    }

    return { isAssigned: !newIsUnassigned };
  } catch (err) {
    console.warn('Failed to toggle remedial assignment status:', err);
    return { isAssigned: false };
  }
}

/**
 * Bulk action: Unassign all dispatched remedial tests in the ledger.
 */
export async function unassignAllRemedialTests(): Promise<void> {
  const ledger = getMasterDispatchLedger();
  for (const asg of ledger) {
    if (!asg.isUnassigned) {
      await toggleRemedialAssignmentStatus(asg.id);
    }
  }
}

/**
 * Permanently delete a specific dispatched remedial practice test.
 * Scope can be:
 * - 'both': Deletes from both user/student account and Master Console ledger everywhere.
 * - 'master_only': Removes from Master Console tracking only; student keeps the test.
 */
export async function deleteRemedialAssignment(
  assignmentId: string,
  studentId?: string,
  studentEmail?: string,
  scope: RemedialDeleteScope = 'both'
): Promise<{ success: boolean }> {
  try {
    // Always dismiss from master ledger tracking
    recordMasterDismissedLedgerId(assignmentId);

    // 1. Remove from local Master Dispatch Ledger
    const ledger = getMasterDispatchLedger();
    const targetItem = ledger.find((a) => a.id === assignmentId);
    const updatedLedger = ledger.filter((a) => a.id !== assignmentId);
    localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify(updatedLedger));

    const sId = studentId || targetItem?.studentId;
    const sEmail = studentEmail || targetItem?.studentEmail;

    if (scope === 'master_only') {
      // In master_only mode, student keeps the test!
      // In cloud MASTER_REMEDIAL_CATALOG, mark deletedFromMaster: true so it never restores to master
      if (!isOfflineLocalOnlyMode() && auth.currentUser) {
        try {
          const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
          const catSnap = await getDoc(catalogDocRef).catch(() => null);
          if (catSnap && catSnap.exists()) {
            const catData = catSnap.data();
            const currentAsgs: Record<string, any> = { ...(catData.assignments || {}) };
            if (currentAsgs[assignmentId]) {
              currentAsgs[assignmentId] = {
                ...currentAsgs[assignmentId],
                deletedFromMaster: true,
              };
              await setDoc(catalogDocRef, { assignments: currentAsgs, updatedAt: new Date().toISOString() }, { merge: true });
            }
          }
        } catch (err) {
          console.warn('Master-only delete notice:', err);
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { masterDismissedId: assignmentId } }));
      }
      return { success: true };
    }

    // scope === 'both': Delete from BOTH student and master account
    // 0. Add to persistent blacklist so it can never be resurrected from cloud or cache
    recordDeletedRemedialId(assignmentId);

    // 2. Remove from student's local storage keys
    removeAssignedRemedialTestForStudent(assignmentId, sId);
    if (sEmail) {
      removeAssignedRemedialTestForStudent(assignmentId, sEmail);
      const emailSlug = sEmail.toLowerCase().replace(/[@.]/g, '_');
      removeAssignedRemedialTestForStudent(assignmentId, emailSlug);
    }

    // 3. Cloud Firestore deletion
    if (!isOfflineLocalOnlyMode() && auth.currentUser) {
      try {
        // A. Delete from MASTER_REMEDIAL_CATALOG
        const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
        const catSnap = await getDoc(catalogDocRef).catch(() => null);
        if (catSnap && catSnap.exists()) {
          const catData = catSnap.data();
          const currentAsgs: Record<string, any> = { ...(catData.assignments || {}) };

          delete currentAsgs[assignmentId];
          delete catData[`assignments.${assignmentId}`];

          // Also clean any legacy keys
          Object.keys(catData).forEach((k) => {
            if (k === `assignments.${assignmentId}` || (k.startsWith('assignments.') && catData[k]?.id === assignmentId)) {
              delete catData[k];
            }
          });

          await setDoc(catalogDocRef, {
            ...catData,
            assignments: currentAsgs,
            updatedAt: new Date().toISOString(),
          });
        }

        try {
          await updateDoc(catalogDocRef, {
            [`assignments.${assignmentId}`]: deleteField(),
          });
        } catch {}



        // C. Clean from student's personal cloud doc
        const safeStudentId = (sId || '').replace(/[/.[\]*~#$]/g, '_');
        if (safeStudentId) {
          const studentDocRef = doc(db, 'test_leaderboards', `REMEDIAL_${safeStudentId}`, 'summary', 'assignment');
          const snap = await getDoc(studentDocRef).catch(() => null);
          if (snap && snap.exists()) {
            const data = snap.data();
            const asgs = (data.assignments || []).filter((a: any) => a && a.id !== assignmentId);
            await setDoc(studentDocRef, { assignments: sanitizeForFirestore(asgs), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
          }
        }

        if (sEmail) {
          const emailSlug = sEmail.toLowerCase().replace(/[@.]/g, '_').replace(/[/.[\]*~#$]/g, '_');
          const emailDocRef = doc(db, 'test_leaderboards', `REMEDIAL_${emailSlug}`, 'summary', 'assignment');
          const snap = await getDoc(emailDocRef).catch(() => null);
          if (snap && snap.exists()) {
            const data = snap.data();
            const asgs = (data.assignments || []).filter((a: any) => a && a.id !== assignmentId);
            await setDoc(emailDocRef, { assignments: sanitizeForFirestore(asgs), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Cloud deletion of remedial assignment notice:', err);
      }
    }

    // 4. Notify UI everywhere
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { deletedId: assignmentId } }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'remedial-tests-updated' }));
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to delete remedial assignment:', err);
    return { success: false };
  }
}

/**
 * Bulk action: Permanently delete ALL dispatched remedial tests in the ledger.
 * Scope can be 'both' (everywhere) or 'master_only' (clears master view only).
 */
export async function deleteAllRemedialAssignments(
  scope: RemedialDeleteScope = 'both'
): Promise<{ count: number }> {
  const ledger = getMasterDispatchLedger();
  let count = 0;
  for (const asg of ledger) {
    recordMasterDismissedLedgerId(asg.id);
    if (scope === 'both') {
      recordDeletedRemedialId(asg.id);
    }
    count++;
  }

  // Clear local ledger
  localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify([]));

  if (scope === 'master_only') {
    // Mark deletedFromMaster: true in cloud catalog without deleting from student accounts
    if (!isOfflineLocalOnlyMode() && auth.currentUser) {
      try {
        const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
        const catSnap = await getDoc(catalogDocRef).catch(() => null);
        if (catSnap && catSnap.exists()) {
          const catData = catSnap.data();
          const currentAsgs: Record<string, any> = { ...(catData.assignments || {}) };
          Object.keys(currentAsgs).forEach((k) => {
            if (currentAsgs[k]) {
              currentAsgs[k].deletedFromMaster = true;
            }
          });
          await setDoc(catalogDocRef, { assignments: currentAsgs, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { masterCleared: true } }));
    }
    return { count };
  }

  // scope === 'both': Purge from all student keys
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('elevate_assigned_tests_')) {
      localStorage.setItem(k, JSON.stringify([]));
    }
  }

  // Clean cloud catalog
  if (!isOfflineLocalOnlyMode() && auth.currentUser) {
    try {
      const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
      await setDoc(catalogDocRef, { assignments: {}, updatedAt: new Date().toISOString() });
    } catch {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { count: 0 } }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'remedial-tests-updated' }));
  }

  return { count };
}

/**
 * Highly resilient attempt-to-test matcher.
 * Matches by exact ID, canonical leaderboard ID, normalized title, or slug.
 */
export function doesAttemptMatchTest(att: TestAttempt, test: MathTest): boolean {
  if (!att || !test) return false;

  // 1. Direct ID match
  if (att.testId && test.id && att.testId === test.id) return true;

  // 2. Canonical Leaderboard ID match
  const testCanonical = getCanonicalLeaderboardId(test.id, test.title);
  const attCanonical = getCanonicalLeaderboardId(att.testId, att.testTitle);
  if (testCanonical && (att.testId === testCanonical || attCanonical === testCanonical)) return true;

  // 3. Normalized Title match
  const normTitleTest = (test.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTitleAtt = (att.testTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normTitleTest && normTitleAtt) {
    if (normTitleTest === normTitleAtt || normTitleTest.includes(normTitleAtt) || normTitleAtt.includes(normTitleTest)) {
      return true;
    }
  }

  // 4. Normalized ID match
  const normIdTest = (test.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normIdAtt = (att.testId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normIdTest && normIdAtt) {
    if (normIdTest === normIdAtt || normIdTest.includes(normIdAtt) || normIdAtt.includes(normIdTest)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract targeted Question Pointers for a student based on their attempts across source tests.
 * Zero question duplication: stores only unique references and question data.
 * Supports multiple weakness categories simultaneously (wrong, unattempted, marked).
 */
export function extractStudentQuestionPointers(params: {
  sourceTests: MathTest[];
  studentAttempts: TestAttempt[];
  filterType: RemedialFilterType | RemedialFilterType[];
}): QuestionPointer[] {
  const { sourceTests, studentAttempts, filterType } = params;
  const pointers: QuestionPointer[] = [];
  const seenKeys = new Set<string>();

  // Normalize filter categories into an array of active categories
  const activeCategories: string[] = Array.isArray(filterType)
    ? filterType
    : (filterType === 'all_errors' ? ['wrong', 'unattempted', 'marked'] : [filterType]);

  for (const test of sourceTests) {
    let questions = normalizeQuestions(test.questions || []);

    // 1. First-tier hydration from global published tests cache
    if (questions.length === 0) {
      try {
        const globalMap = getGlobalPublishedTestsMap();
        if (globalMap[test.id]?.questions && globalMap[test.id].questions.length > 0) {
          questions = normalizeQuestions(globalMap[test.id].questions);
        }
      } catch {}
    }

    // 2. Second-tier hydration from in-memory full test cache
    if (questions.length === 0) {
      try {
        const cached = getCachedFullTest(test.id);
        if (cached?.questions && cached.questions.length > 0) {
          questions = normalizeQuestions(cached.questions);
        }
      } catch {}
    }

    // 3. Third-tier hydration from local scoped storage
    if (questions.length === 0) {
      try {
        const localList = loadScopedTests(null);
        const match = localList.find((t) => t.id === test.id);
        if (match?.questions && match.questions.length > 0) {
          questions = normalizeQuestions(match.questions);
        }
      } catch {}
    }

    // STRICT: Select ONLY the user's FIRST-EVER attempt of this test
    const matchingAttempts = studentAttempts.filter((att) => doesAttemptMatchTest(att, test));
    let attempt: TestAttempt | undefined;

    if (matchingAttempts.length > 0) {
      // 1. Look for explicit attemptNumber === 1 or isFirstAttempt === true
      const explicitFirst = matchingAttempts.find(
        (a) => (a as any).attemptNumber === 1 || (a as any).isFirstAttempt === true
      );
      if (explicitFirst) {
        attempt = explicitFirst;
      } else {
        // 2. Sort chronologically ascending: oldest is the first-ever attempt
        matchingAttempts.sort((a, b) => {
          const tA = new Date(a.completedAt || a.createdAt || 0).getTime();
          const tB = new Date(b.completedAt || b.createdAt || 0).getTime();
          return tA - tB;
        });
        attempt = matchingAttempts[0];
      }
    } else if (sourceTests.length === 1 && studentAttempts.length > 0) {
      const sorted = [...studentAttempts].sort((a, b) => {
        const tA = new Date(a.completedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.completedAt || b.createdAt || 0).getTime();
        return tA - tB;
      });
      attempt = sorted[0];
    }

    // 4. Fourth-tier synthetic fallback: If test questions have not yet loaded over the network,
    // synthesize question index stubs from the student's attempt or questionCount so diagnostics never return 0 Qs
    if (questions.length === 0) {
      const qCountFromAttempt = (attempt as any)?.answers ? Object.keys(attempt.answers).length : 0;
      const qCountFromPoints = attempt?.totalPoints ? Math.round(attempt.totalPoints / 4) : 0;
      const count = (test as any).questionCount || qCountFromAttempt || qCountFromPoints || 50;
      const ansKeys = attempt?.answers ? Object.keys(attempt.answers) : [];

      questions = Array.from({ length: count }, (_, idx) => ({
        id: ansKeys[idx] || `q_${idx + 1}`,
        questionText: `Question ${idx + 1}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
        topic: test.topic || 'General Mathematics',
        qtopic: test.topic || 'General Mathematics',
        difficulty: test.difficulty || 'medium',
      } as MathQuestion));
    }

    if (questions.length === 0) continue;

    const answersMap = attempt?.answers || {};
    const answersList = Array.isArray(answersMap) ? answersMap : Object.values(answersMap);

    questions.forEach((q, qIndex) => {
      let matchesFilter = false;

      if (!attempt) {
        // If student or master has no previous attempt on this test:
        // - 'unattempted' or 'all_errors' or 'unmarked': all questions qualify
        // - 'wrong' / 'marked': student has not attempted, so no wrong or marked questions exist
        if (activeCategories.includes('unattempted') || activeCategories.includes('all_errors') || activeCategories.includes('unmarked')) {
          matchesFilter = true;
        }
      } else {
        // Attempt exists: extract strictly from actual performance
        const qId = q.id;
        const qIdVariants = [
          qId,
          (test.questions && test.questions[qIndex]?.id) ? test.questions[qIndex].id : undefined,
          `q_${qIndex + 1}`,
          `q${qIndex + 1}`,
          String(qIndex),
          String(qIndex + 1),
          `question_${qIndex + 1}`,
        ].filter(Boolean) as string[];

        let ansObj: any = undefined;
        for (const variant of qIdVariants) {
          if (answersMap[variant] !== undefined) {
            ansObj = answersMap[variant];
            break;
          }
        }

        if (!ansObj && Array.isArray(answersList)) {
          ansObj = answersList.find((a: any) =>
            a && (
              qIdVariants.includes(a.questionId) ||
              qIdVariants.includes(a.id) ||
              a.questionIndex === qIndex
            )
          ) || answersList[qIndex];
        }

        let isAnswered = false;
        let isCorrect = false;
        let isFlagged = false;

        // 1. High-precision attempt-level index array analysis
        const hasUnattemptedArray = Array.isArray((attempt as any).unattemptedQuestionIndices);
        const hasWrongArray = Array.isArray((attempt as any).wrongQuestionIndices);

        if (hasUnattemptedArray) {
          const isExplicitlyUnattempted = (attempt as any).unattemptedQuestionIndices.some((idx: any) => Number(idx) === qIndex);
          if (isExplicitlyUnattempted) {
            isAnswered = false;
          } else {
            // Not in unattempted list = was answered/attempted!
            isAnswered = true;
            if (hasWrongArray && (attempt as any).wrongQuestionIndices.length > 0) {
              const isExplicitlyWrong = (attempt as any).wrongQuestionIndices.some((idx: any) => Number(idx) === qIndex);
              isCorrect = !isExplicitlyWrong;
            } else {
              // 0 wrong questions listed in attempt record = attempted & correct!
              isCorrect = true;
            }
          }
        }

        // Secondary check from ansObj / answersMap if index arrays were not provided
        if (!hasUnattemptedArray) {
          if (ansObj) {
            const opt = ansObj.selectedOption ?? ansObj.userAnswer ?? ansObj.answer;
            isAnswered = opt !== null && opt !== undefined && String(opt).trim() !== '';
            if (ansObj.isCorrect !== undefined) {
              isCorrect = Boolean(ansObj.isCorrect);
            } else if (isAnswered && (q.correctAnswer !== undefined || (q as any).correctOptionIndex !== undefined)) {
              isCorrect = checkIsOptionCorrect(String(opt).trim(), -1, q);
            }
          } else if (attempt.userAnswers) {
            for (const variant of qIdVariants) {
              const uAns = attempt.userAnswers[variant];
              if (uAns !== null && uAns !== undefined && String(uAns).trim() !== '') {
                isAnswered = true;
                isCorrect = checkIsOptionCorrect(String(uAns).trim(), -1, q);
                break;
              }
            }
          }
        }

        // 2. High-precision flagged / marked evaluation
        if (ansObj?.flagged || ansObj?.isFlagged || ansObj?.markedForReview || ansObj?.marked) {
          isFlagged = true;
        }
        if (
          Array.isArray((attempt as any).flaggedQuestionIndices) &&
          (attempt as any).flaggedQuestionIndices.some((idx: any) => Number(idx) === qIndex)
        ) {
          isFlagged = true;
        }
        if (Array.isArray((attempt as any).flaggedQuestions)) {
          const strFlags = (attempt as any).flaggedQuestions.map((v: any) => String(v));
          if (qIdVariants.some((v) => strFlags.includes(String(v)))) {
            isFlagged = true;
          }
        }
        if (Array.isArray((attempt as any).markedQuestions)) {
          const strMarked = (attempt as any).markedQuestions.map((v: any) => String(v));
          if (qIdVariants.some((v) => strMarked.includes(String(v)))) {
            isFlagged = true;
          }
        }

        // 3. Multi-Category evaluation with zero leakage
        for (const cat of activeCategories) {
          if (cat === 'wrong') {
            // STRICT: Must be attempted AND answered incorrectly
            if (isAnswered && !isCorrect) matchesFilter = true;
          } else if (cat === 'unattempted') {
            // STRICT: Must be skipped or unattempted
            if (!isAnswered) matchesFilter = true;
          } else if (cat === 'marked') {
            // STRICT: Must be marked/flagged for review (whether correct, incorrect, or skipped)
            if (isFlagged) matchesFilter = true;
          } else if (cat === 'unmarked') {
            // STRICT: Must NOT be marked/flagged for review by the student
            if (!isFlagged) matchesFilter = true;
          } else if (cat === 'all_errors') {
            if ((isAnswered && !isCorrect) || !isAnswered || isFlagged) matchesFilter = true;
          }
        }
      }

      if (matchesFilter) {
        const uniqueKey = `${test.id}_${qIndex}`;
        const questionKey = q.id || uniqueKey;
        if (!seenKeys.has(uniqueKey) && !seenKeys.has(questionKey)) {
          seenKeys.add(uniqueKey);
          seenKeys.add(questionKey);
          pointers.push({
            sourceTestId: test.id,
            questionIndex: qIndex,
            originalQuestionId: q.id,
            topic: q.topic || q.qtopic || test.topic,
            difficulty: q.difficulty || test.difficulty,
            sourceTestTitle: test.title,
            questionData: q,
          });
        }
      }
    });
  }

  return pointers;
}

export interface StudentCohortSummary {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  attemptCount: number;
  matchingQuestionsCount: number;
  pointers: QuestionPointer[];
}

/**
 * Preview how many questions will be assigned to each student in the cohort
 * before executing the dispatch.
 * 
 * Strict Cohort Rules:
 * 1. ALWAYS allows and includes the Master Account in the preview.
 * 2. Includes all students who attempted any of the selected source tests.
 * 3. Each recipient gets user-specific practice tailored to their error data.
 */
export function previewRemedialCohort(params: {
  sourceTests: MathTest[];
  filterType: RemedialFilterType | RemedialFilterType[];
  allAttempts: TestAttempt[];
  currentStudentId?: string;
  currentStudentName?: string;
  currentUserEmail?: string;
}): StudentCohortSummary[] {
  const { sourceTests, filterType, allAttempts, currentStudentId, currentStudentName, currentUserEmail } = params;

  if (!sourceTests || sourceTests.length === 0) return [];

  // Group attempts by student
  const studentMap = new Map<string, { name: string; email?: string; attempts: TestAttempt[] }>();

  const masterId = currentStudentId || 'master-academic-admin';
  const masterName = currentStudentName || 'Master Admin (Sanju)';
  const masterEmail = currentUserEmail || MASTER_ADMIN_EMAIL;

  // 1. Discover all students who attempted any of the selected source tests
  // STRICT: Sort chronologically ascending so the student's 1st-ever attempt is always evaluated first!
  const sortedAttempts = [...allAttempts].sort((a, b) => {
    const tA = new Date(a.completedAt || a.createdAt || 0).getTime();
    const tB = new Date(b.completedAt || b.createdAt || 0).getTime();
    return tA - tB;
  });

  sortedAttempts.forEach((att) => {
    if (!att) return;
    const matchingTest = sourceTests.find((t) => doesAttemptMatchTest(att, t));
    if (!matchingTest) return;

    const sId = (att.userId || '').trim();
    const sEmail = (att.userEmail || (att as any).studentEmail || '').trim();

    // STRICTLY DISALLOW GUESTS from cohort extraction & remedial assignments
    if (isGuestUser({ uid: sId, email: sEmail })) {
      return; // Skip guest attempt!
    }

    const sName = (att.userName || '').trim() || sEmail.split('@')[0] || 'Student';

    // If attempt belongs to Master Account
    const isMasterAttempt = (sEmail && sEmail.toLowerCase() === masterEmail.toLowerCase()) || (sId && sId === masterId);
    const resolvedId = isMasterAttempt ? masterId : (sId || sEmail);

    const existing = studentMap.get(resolvedId);
    if (existing) {
      // STRICT: For each test, only retain the student's 1st-ever attempt (ignore subsequent retakes)
      const existingIdx = existing.attempts.findIndex((a) => doesAttemptMatchTest(a, matchingTest));
      if (existingIdx === -1) {
        existing.attempts.push(att);
      } else {
        // Upgrade synthetic leaderboard attempts with authentic attempt data if available
        const curr = existing.attempts[existingIdx];
        const currIsSynthetic = (curr.id || '').startsWith('cohort_') || !curr.answers || Object.keys(curr.answers).length === 0;
        const newIsAuthentic = !(att.id || '').startsWith('cohort_') && att.answers && Object.keys(att.answers).length > 0;
        const currHasFlags = (Array.isArray((curr as any).flaggedQuestionIndices) && (curr as any).flaggedQuestionIndices.length > 0) ||
                             (curr.answers && Object.values(curr.answers).some((a: any) => a?.flagged));
        const newHasFlags = (Array.isArray((att as any).flaggedQuestionIndices) && (att as any).flaggedQuestionIndices.length > 0) ||
                            (Array.isArray((att as any).flaggedQuestions) && (att as any).flaggedQuestions.length > 0) ||
                            (att.answers && Object.values(att.answers).some((a: any) => a?.flagged));

        if ((currIsSynthetic && newIsAuthentic) || (!currHasFlags && newHasFlags)) {
          existing.attempts[existingIdx] = att;
        }
      }
      if (!existing.email && sEmail) existing.email = sEmail;
      if ((!existing.name || existing.name === 'Student') && sName && sName !== 'Student') {
        existing.name = sName;
      }
    } else {
      studentMap.set(resolvedId, { name: isMasterAttempt ? masterName : sName, email: sEmail || undefined, attempts: [att] });
    }
  });

  // If no student attempts exist for the selected tests, include Master Account so admin can test & preview solo
  if (studentMap.size === 0) {
    studentMap.set(masterId, { name: masterName, email: masterEmail, attempts: [] });
  }

  const summaries: StudentCohortSummary[] = [];

  studentMap.forEach((data, sId) => {
    const pointers = extractStudentQuestionPointers({
      sourceTests,
      studentAttempts: data.attempts,
      filterType,
    });

    summaries.push({
      studentId: sId,
      studentName: data.name,
      studentEmail: data.email,
      attemptCount: data.attempts.length,
      matchingQuestionsCount: pointers.length,
      pointers,
    });
  });

  return summaries;
}

/**
 * Master Action: Generate and dispatch personalized remedial tests to all students in the cohort.
 * Stored strictly as lightweight pointers with embedded question data.
 */
export async function dispatchAdaptiveRemedialTests(params: {
  sourceTests: MathTest[];
  filterType: RemedialFilterType | RemedialFilterType[];
  customTitle: string;
  customDescription?: string;
  timeLimitMinutes?: number;
  allAttempts: TestAttempt[];
  currentStudentId?: string;
  currentStudentName?: string;
}): Promise<{
  success: boolean;
  dispatchedCount: number;
  totalPointers: number;
  assignments: AssignedRemedialTest[];
}> {
  const {
    sourceTests,
    filterType,
    customTitle,
    customDescription,
    timeLimitMinutes,
    allAttempts,
    currentStudentId,
    currentStudentName,
  } = params;

  const cohort = previewRemedialCohort({
    sourceTests,
    filterType,
    allAttempts,
    currentStudentId,
    currentStudentName,
  });

  const sourceTestIds = sourceTests.map((t) => t.id);
  const assignments: AssignedRemedialTest[] = [];
  let totalPointers = 0;

  const filterLabel = Array.isArray(filterType) 
    ? filterType.join(' + ').toUpperCase() 
    : String(filterType).toUpperCase();

  for (const student of cohort) {
    let studentPointers = student.pointers;
    if ((!studentPointers || studentPointers.length === 0) && student.attemptCount === 0) {
      studentPointers = extractStudentQuestionPointers({
        sourceTests,
        studentAttempts: [],
        filterType,
      });
    }

    if (!studentPointers || studentPointers.length === 0) continue;

    // Lean normalized pointers for optimal cloud storage
    const normalizedPointers = studentPointers.map((p) => ({
      sourceTestId: p.sourceTestId,
      questionIndex: p.questionIndex,
      originalQuestionId: p.originalQuestionId || p.questionData?.id,
      topic: p.topic || p.questionData?.topic || p.questionData?.qtopic,
      difficulty: p.difficulty || p.questionData?.difficulty,
      sourceTestTitle: p.sourceTestTitle,
    }));

    const assignmentId = `remedial_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const assignment: AssignedRemedialTest = {
      id: assignmentId,
      studentId: student.studentId,
      studentName: student.studentName,
      studentEmail: student.studentEmail,
      title: customTitle || `Adaptive Practice (${filterLabel})`,
      description: customDescription || `Targeted practice for ${student.studentName} generated by Master Academic Head based on ${sourceTests.length} source test(s).`,
      sourceTestIds,
      filterType: Array.isArray(filterType) ? filterType.join(',') : filterType,
      categories: Array.isArray(filterType) ? filterType : [filterType],
      pointers: normalizedPointers,
      totalQuestions: normalizedPointers.length,
      timeLimitMinutes: timeLimitMinutes ?? Math.max(10, normalizedPointers.length * 2),
      createdAt: new Date().toISOString(),
      dispatchedBy: MASTER_ADMIN_EMAIL,
      isCompleted: false,
    };

    // Save locally strictly under specific student ID & email (never broadcast to all students)
    saveAssignedRemedialTestForStudent(assignment);
    if (student.studentEmail) {
      saveAssignedRemedialTestForStudent({ ...assignment, studentId: student.studentEmail });
      const emailSlug = student.studentEmail.toLowerCase().replace(/[@.]/g, '_');
      saveAssignedRemedialTestForStudent({ ...assignment, studentId: emailSlug });
    }

    assignments.push(assignment);
    totalPointers += studentPointers.length;
  }

  // Enterprise Diamond Plan: Single Atomic Batch Write for all student inboxes + Master Catalog
  if (!isOfflineLocalOnlyMode() && auth.currentUser && assignments.length > 0) {
    try {
      const batch = writeBatch(db);
      const handledDocIds = new Set<string>();

      cohort.forEach((student) => {
        const safeStudentId = (student.studentId || '').replace(/[/.[\]*~#$]/g, '_');
        const emailSlug = (student.studentEmail || '').toLowerCase().replace(/[@.]/g, '_').replace(/[/.[\]*~#$]/g, '_');
        const targetDocId = safeStudentId || emailSlug;
        if (targetDocId && !handledDocIds.has(targetDocId)) {
          handledDocIds.add(targetDocId);
          const existingAssignments = getAssignedRemedialTestsForStudent(student.studentId);
          const studentRemedialDocRef = doc(db, 'test_leaderboards', `REMEDIAL_${targetDocId}`, 'summary', 'assignment');
          batch.set(studentRemedialDocRef, {
            studentId: student.studentId,
            studentName: student.studentName,
            studentEmail: student.studentEmail,
            assignments: sanitizeForFirestore(existingAssignments),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      });

      // Master Remedial Catalog Central Hub
      const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
      const catSnap = await getDoc(catalogDocRef).catch(() => null);
      const catData = catSnap?.exists() ? catSnap.data() : {};
      const catAssignments = { ...(catData.assignments || {}) };

      assignments.forEach((asg) => {
        catAssignments[asg.id] = sanitizeForFirestore(asg);
      });

      batch.set(catalogDocRef, {
        assignments: catAssignments,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Atomically commit all student inboxes and master catalog in 1 network call!
      await batch.commit();
    } catch (err) {
      console.warn('Could not batch sync remedial assignments:', err);
    }
  }

  // Explicitly update local Master Dispatch Ledger with newly created assignments
  try {
    const rawLedger = localStorage.getItem(MASTER_DISPATCH_LEDGER_KEY);
    const ledger: AssignedRemedialTest[] = rawLedger ? JSON.parse(rawLedger) : [];
    assignments.forEach((assignment) => {
      const idx = ledger.findIndex((a) => a.id === assignment.id);
      if (idx >= 0) {
        ledger[idx] = assignment;
      } else {
        ledger.unshift(assignment);
      }
    });
    localStorage.setItem(MASTER_DISPATCH_LEDGER_KEY, JSON.stringify(ledger));
  } catch (e) {
    console.warn('Failed to update local master dispatch ledger:', e);
  }

  // Notify student and master UI components immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { count: assignments.length } }));
  }

  return {
    success: true,
    dispatchedCount: assignments.length,
    totalPointers,
    assignments,
  };
}

/**
 * Materialize an AssignedRemedialTest into a runnable MathTest.
 * Resolves question pointers against test bank, global cache, or embedded questionData.
 * Strictly guarantees ZERO duplicate questions.
 */
export function materializeRemedialTest(
  assignment: AssignedRemedialTest, 
  testBank: MathTest[]
): MathTest {
  const testMap = new Map<string, MathTest>();
  testBank.forEach((t) => {
    testMap.set(t.id, t);
  });
  const globalMap = getGlobalPublishedTestsMap();

  let pointers = assignment.pointers || [];

  // Local-level dynamic generation: if directive has source test IDs, dynamically extract student's questions locally
  if (pointers.length === 0 && assignment.sourceTestIds && assignment.sourceTestIds.length > 0) {
    const allLocalAttempts = getAllLocalAttemptsAcrossAccounts().filter(
      (a) => a.userId === assignment.studentId || (assignment.studentEmail && a.userEmail === assignment.studentEmail)
    );
    const sourceTests = assignment.sourceTestIds
      .map((id) => testMap.get(id) || globalMap[id])
      .filter((t): t is MathTest => Boolean(t));

    pointers = extractStudentQuestionPointers({
      sourceTests,
      studentAttempts: allLocalAttempts,
      filterType: (assignment.categories as any) || assignment.filterType || 'wrong',
    });
  }

  const resolvedQuestions: MathQuestion[] = [];
  const seenQKeys = new Set<string>();

  for (const ptr of pointers) {
    let sourceTest = testMap.get(ptr.sourceTestId) || globalMap[ptr.sourceTestId];
    if (!sourceTest || !sourceTest.questions || sourceTest.questions.length === 0) {
      const cached = getCachedFullTest(ptr.sourceTestId);
      if (cached?.questions && cached.questions.length > 0) {
        sourceTest = cached;
      } else {
        const local = loadScopedTests(null).find((t) => t.id === ptr.sourceTestId);
        if (local?.questions && local.questions.length > 0) {
          sourceTest = local;
        }
      }
    }
    let q: MathQuestion | null = null;

    if (sourceTest && sourceTest.questions && sourceTest.questions.length > 0) {
      // 1. Dual-Keying: First match by exact originalQuestionId
      if (ptr.originalQuestionId) {
        q = sourceTest.questions.find((item) => item.id === ptr.originalQuestionId) || null;
      }
      // 2. Fall back to questionIndex
      if (!q && sourceTest.questions[ptr.questionIndex]) {
        q = sourceTest.questions[ptr.questionIndex];
      }
    }

    // 3. Fallback to embedded questionData if present
    if (!q && ptr.questionData) {
      q = ptr.questionData;
    }

    if (q) {
      const qKey = q.id || `${ptr.sourceTestId}_${ptr.questionIndex}`;
      if (!seenQKeys.has(qKey)) {
        seenQKeys.add(qKey);
        resolvedQuestions.push({
          ...q,
          id: q.id || `remedial_q_${ptr.sourceTestId}_${ptr.questionIndex}`,
          qtopic: q.qtopic || ptr.topic || sourceTest?.topic || 'Targeted Practice',
          topic: q.topic || ptr.topic || sourceTest?.topic || 'Targeted Practice',
        });
      }
    }
  }

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    topic: 'Targeted Remedial Practice',
    category: 'Remedial',
    difficulty: 'Medium',
    timeLimitMinutes: assignment.timeLimitMinutes || Math.max(10, resolvedQuestions.length * 2),
    questions: resolvedQuestions,
    questionCount: resolvedQuestions.length,
    authorName: 'Academic Head (Master)',
    authorEmail: MASTER_ADMIN_EMAIL,
    isPublic: false,
    createdAt: assignment.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Data structures for deep Per-Test Cohort Performance Mappings.
 */
export interface StudentAttemptRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  attemptMode: 'online' | 'omr';
  score: number;
  totalPoints: number;
  percentage: number;
  timeSpentSeconds: number;
  completedAt: string;
  wrongQuestionNumbers: number[]; // 1-based question numbers: e.g. [3, 7, 12]
  unattemptedQuestionNumbers: number[];
  flaggedQuestionNumbers: number[];
}

export interface QuestionErrorStat {
  questionIndex: number; // 0-based
  questionNumber: number; // 1-based
  wrongCount: number;
  unattemptedCount: number;
  correctCount: number;
  totalAttempts: number;
  errorRatePercentage: number;
}

export interface PerTestCohortAnalytics {
  testId: string;
  testTitle: string;
  totalAttempts: number;
  uniqueStudentsCount: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  averageTimeSeconds: number;
  onlineAttemptsCount: number;
  omrAttemptsCount: number;
  studentRows: StudentAttemptRow[];
  questionErrorStats: QuestionErrorStat[];
}

/**
 * Calculate comprehensive cohort analytics for a specific test across all student attempts.
 */
export function getPerTestCohortAnalytics(
  test: MathTest,
  allAttempts: TestAttempt[]
): PerTestCohortAnalytics {
  const matchingAttempts = allAttempts.filter(
    (a) => a.testId === test.id || (test.title && a.testTitle && a.testTitle.toLowerCase().trim() === test.title.toLowerCase().trim())
  );

  const totalAttempts = matchingAttempts.length;
  const uniqueStudents = new Set<string>();
  let totalScore = 0;
  let totalPercentage = 0;
  let highestScore = 0;
  let totalTime = 0;
  let onlineCount = 0;
  let omrCount = 0;

  const questionsCount = test.questions?.length || 10;
  const questionErrorStats: QuestionErrorStat[] = Array.from({ length: questionsCount }, (_, i) => ({
    questionIndex: i,
    questionNumber: i + 1,
    wrongCount: 0,
    unattemptedCount: 0,
    correctCount: 0,
    totalAttempts: 0,
    errorRatePercentage: 0,
  }));

  const studentRows: StudentAttemptRow[] = [];

  for (const att of matchingAttempts) {
    const sId = att.userId || 'anonymous';
    uniqueStudents.add(sId);

    const score = Number(att.score) || 0;
    const totalPoints = att.totalPoints || (questionsCount * 4);
    const percentage = typeof att.percentage === 'number' ? att.percentage : (totalPoints > 0 ? (score / totalPoints) * 100 : 0);
    const timeSpent = att.timeSpentSeconds || 0;
    const isOmr = att.attemptMode === 'omr';

    totalScore += score;
    totalPercentage += percentage;
    totalTime += timeSpent;
    if (score > highestScore) highestScore = score;
    if (isOmr) omrCount++;
    else onlineCount++;

    const wrongNums: number[] = [];
    const unattemptedNums: number[] = [];
    const flaggedNums: number[] = [];

    for (let qIdx = 0; qIdx < questionsCount; qIdx++) {
      const qStat = questionErrorStats[qIdx];
      qStat.totalAttempts++;

      const q = test.questions ? test.questions[qIdx] : undefined;
      const ansObj = att.answers
        ? (q ? att.answers[q.id] : undefined) || att.answers[String(qIdx)] || (Array.isArray(att.answers) ? (att.answers as any)[qIdx] : undefined)
        : undefined;

      const isAnswered = ansObj && ansObj.selectedOption !== null && ansObj.selectedOption !== undefined && ansObj.selectedOption !== '';
      const isCorrect = ansObj ? Boolean(ansObj.isCorrect) : false;
      const isFlagged = ansObj ? Boolean(ansObj.flagged) : false;

      if (!isAnswered) {
        unattemptedNums.push(qIdx + 1);
        qStat.unattemptedCount++;
      } else if (!isCorrect) {
        wrongNums.push(qIdx + 1);
        qStat.wrongCount++;
      } else {
        qStat.correctCount++;
      }

      if (isFlagged) {
        flaggedNums.push(qIdx + 1);
      }
    }

    studentRows.push({
      attemptId: att.id || `att_${Math.random()}`,
      studentId: sId,
      studentName: att.userName || 'Student',
      studentEmail: (att as any).userEmail || undefined,
      attemptMode: isOmr ? 'omr' : 'online',
      score,
      totalPoints,
      percentage: Math.round(percentage * 10) / 10,
      timeSpentSeconds: timeSpent,
      completedAt: att.completedAt || att.createdAt || new Date().toISOString(),
      wrongQuestionNumbers: wrongNums,
      unattemptedQuestionNumbers: unattemptedNums,
      flaggedQuestionNumbers: flaggedNums,
    });
  }

  // Calculate final question error percentages
  for (const qStat of questionErrorStats) {
    if (qStat.totalAttempts > 0) {
      const totalErrors = qStat.wrongCount + qStat.unattemptedCount;
      qStat.errorRatePercentage = Math.round((totalErrors / qStat.totalAttempts) * 100);
    }
  }

  // Sort student rows by completedAt descending
  studentRows.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  return {
    testId: test.id,
    testTitle: test.title,
    totalAttempts,
    uniqueStudentsCount: uniqueStudents.size,
    averageScore: totalAttempts > 0 ? Math.round((totalScore / totalAttempts) * 10) / 10 : 0,
    averagePercentage: totalAttempts > 0 ? Math.round((totalPercentage / totalAttempts) * 10) / 10 : 0,
    highestScore,
    averageTimeSeconds: totalAttempts > 0 ? Math.round(totalTime / totalAttempts) : 0,
    onlineAttemptsCount: onlineCount,
    omrAttemptsCount: omrCount,
    studentRows,
    questionErrorStats,
  };
}

/**
 * Asynchronously fetch assigned remedial tests from the cloud for a student.
 * Single source of truth: MASTER_REMEDIAL_CATALOG.
 * Automatically purges unassigned/revoked tests from the student's local storage.
 * Strictly disallows guest users.
 */
export async function fetchCloudAssignedRemedialTests(
  studentId?: string | null,
  studentEmail?: string | null
): Promise<AssignedRemedialTest[]> {
  // Strictly disallow guest users
  if (isGuestUser({ uid: studentId, email: studentEmail })) {
    return [];
  }

  const normUid = (studentId || '').trim();
  const normEmail = (studentEmail || '').trim().toLowerCase();

  if (isOfflineLocalOnlyMode()) {
    return getAssignedRemedialTestsForStudent(normUid);
  }

  const activeForStudentMap = new Map<string, AssignedRemedialTest>();
  const emailSlug = normEmail.replace(/[@.]/g, '_').replace(/[/.[\]*~#$]/g, '_');
  const safeUid = normUid.replace(/[/.[\]*~#$]/g, '_');

  try {
    const catalogDocRef = doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments');
    const catalogSnap = await getDoc(catalogDocRef).catch(() => null);

    if (catalogSnap && catalogSnap.exists()) {
      const data = catalogSnap.data();
      const allAsgs: Record<string, any> = { ...(data.assignments || {}) };

      // Also normalize any dotted top-level keys
      Object.keys(data).forEach((k) => {
        if (k.startsWith('assignments.') && typeof data[k] === 'object' && data[k]?.id) {
          const subKey = k.replace('assignments.', '');
          if (!allAsgs[subKey]) allAsgs[subKey] = data[k];
        }
      });

      const deletedIds = getDeletedRemedialIds();
      Object.values(allAsgs).forEach((raw: any) => {
        if (!raw || !raw.id || deletedIds.has(raw.id)) return;
        const asg = raw as AssignedRemedialTest;
        const targetId = (asg.studentId || '').trim();
        const targetEmail = (asg.studentEmail || '').trim().toLowerCase();

        const isMatch =
          (normUid && (targetId === normUid || targetId === safeUid)) ||
          (normEmail && (targetId === normEmail || targetEmail === normEmail || targetId === emailSlug));

        if (!isMatch) return;

        if (asg.isUnassigned) {
          removeAssignedRemedialTestForStudent(asg.id, normUid);
          if (normEmail) removeAssignedRemedialTestForStudent(asg.id, normEmail);
        } else {
          activeForStudentMap.set(asg.id, asg);
        }
      });
    }

    // Purge any local student tests that are no longer assigned in the cloud or were deleted
    const deletedIds = getDeletedRemedialIds();
    const existingLocal = getAssignedRemedialTestsForStudent(normUid);
    existingLocal.forEach((loc) => {
      if (!activeForStudentMap.has(loc.id) || deletedIds.has(loc.id)) {
        removeAssignedRemedialTestForStudent(loc.id, normUid);
        if (normEmail) removeAssignedRemedialTestForStudent(loc.id, normEmail);
      }
    });

    const activeList = Array.from(activeForStudentMap.values());
    activeList.forEach((asg) => {
      if (normUid) saveAssignedRemedialTestForStudent({ ...asg, studentId: normUid });
      if (normEmail) saveAssignedRemedialTestForStudent({ ...asg, studentId: normEmail });
    });

    return activeList;
  } catch (err) {
    console.warn('Could not fetch cloud assigned remedial tests:', err);
    return getAssignedRemedialTestsForStudent(normUid);
  }
}

/**
 * Subscribe to cloud remedial assignments dispatched to a specific student.
 * Single source of truth: MASTER_REMEDIAL_CATALOG.
 * Automatically purges unassigned/revoked tests and notifies UI only on real changes.
 */
export function subscribeToAssignedRemedialTests(
  studentId?: string | null,
  studentEmailOrUpdate?: string | null | ((assignments: AssignedRemedialTest[]) => void),
  callback?: (assignments: AssignedRemedialTest[]) => void
): () => void {
  if (isOfflineLocalOnlyMode() || typeof window === 'undefined') {
    return () => {};
  }

  let studentEmail: string | null = null;
  let onUpdate: ((assignments: AssignedRemedialTest[]) => void) | undefined = callback;

  if (typeof studentEmailOrUpdate === 'function') {
    onUpdate = studentEmailOrUpdate;
    studentEmail = null;
  } else if (typeof studentEmailOrUpdate === 'string') {
    studentEmail = studentEmailOrUpdate;
  }

  // Strictly disallow guest users from subscriptions
  if (isGuestUser({ uid: studentId, email: studentEmail })) {
    return () => {};
  }

  const normUid = (studentId || '').trim();
  const normEmail = (studentEmail || '').trim().toLowerCase();

  const emailSlug = normEmail.replace(/[@.]/g, '_').replace(/[/.[\]*~#$]/g, '_');
  const safeUid = normUid.replace(/[/.[\]*~#$]/g, '_');
  let lastActiveHash = '';

  const handleSnap = (snap: any) => {
    if (!snap || !snap.exists()) return;
    const data = snap.data();
    const allAsgs: Record<string, any> = { ...(data.assignments || {}) };

    Object.keys(data).forEach((k) => {
      if (k.startsWith('assignments.') && typeof data[k] === 'object' && data[k]?.id) {
        const subKey = k.replace('assignments.', '');
        if (!allAsgs[subKey]) allAsgs[subKey] = data[k];
      }
    });

    const activeMap = new Map<string, AssignedRemedialTest>();
    const deletedIds = getDeletedRemedialIds();

    Object.values(allAsgs).forEach((raw: any) => {
      if (!raw || !raw.id || deletedIds.has(raw.id)) return;
      const asg = raw as AssignedRemedialTest;
      const targetId = (asg.studentId || '').trim();
      const targetEmail = (asg.studentEmail || '').trim().toLowerCase();

      const isMatch =
        (normUid && (targetId === normUid || targetId === safeUid)) ||
        (normEmail && (targetId === normEmail || targetEmail === normEmail || targetId === emailSlug));

      if (!isMatch) return;

      if (asg.isUnassigned) {
        removeAssignedRemedialTestForStudent(asg.id, normUid);
        if (normEmail) removeAssignedRemedialTestForStudent(asg.id, normEmail);
      } else {
        activeMap.set(asg.id, asg);
      }
    });

    // Clean up local student storage: purge any test that is no longer assigned or was deleted
    const existingLocal = getAssignedRemedialTestsForStudent(normUid);
    existingLocal.forEach((loc) => {
      if (!activeMap.has(loc.id) || deletedIds.has(loc.id)) {
        removeAssignedRemedialTestForStudent(loc.id, normUid);
        if (normEmail) removeAssignedRemedialTestForStudent(loc.id, normEmail);
      }
    });

    const list = Array.from(activeMap.values());
    list.forEach((asg) => {
      if (normUid) saveAssignedRemedialTestForStudent({ ...asg, studentId: normUid });
      if (normEmail) saveAssignedRemedialTestForStudent({ ...asg, studentId: normEmail });
    });

    // Notify UI ONLY when actual assignments change
    const currentHash = list.map((a) => `${a.id}_${a.isCompleted ? '1' : '0'}`).sort().join(',');
    if (currentHash !== lastActiveHash) {
      lastActiveHash = currentHash;
      onUpdate?.(list);
      window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { count: list.length } }));
    }
  };

  try {
    const isMaster = isMasterUser({ email: normEmail, uid: normUid });

    // Enterprise Diamond Plan: Discrete Student Inbox eliminates 100% of global listener fanout
    const docRefToListen = isMaster
      ? doc(db, 'test_leaderboards', 'MASTER_REMEDIAL_CATALOG', 'summary', 'assignments')
      : doc(db, 'test_leaderboards', `REMEDIAL_${safeUid || emailSlug}`, 'summary', 'assignment');

    const handleStudentInboxSnap = (snap: any) => {
      if (!snap || !snap.exists()) {
        const localList = getAssignedRemedialTestsForStudent(normUid);
        onUpdate?.(localList);
        return;
      }
      const data = snap.data();
      const rawAssignments = data.assignments || [];
      const asgList: AssignedRemedialTest[] = Array.isArray(rawAssignments) 
        ? rawAssignments 
        : Object.values(rawAssignments);

      const deletedIds = getDeletedRemedialIds();
      const activeList = asgList.filter((a) => a && a.id && !deletedIds.has(a.id) && !a.isUnassigned);

      // Save locally
      activeList.forEach((asg) => {
        if (normUid) saveAssignedRemedialTestForStudent({ ...asg, studentId: normUid });
        if (normEmail) saveAssignedRemedialTestForStudent({ ...asg, studentId: normEmail });
      });

      const currentHash = activeList.map((a) => `${a.id}_${a.isCompleted ? '1' : '0'}`).sort().join(',');
      if (currentHash !== lastActiveHash) {
        lastActiveHash = currentHash;
        onUpdate?.(activeList);
        window.dispatchEvent(new CustomEvent('remedial-tests-updated', { detail: { count: activeList.length } }));
      }
    };

    const unsub = onSnapshot(docRefToListen, isMaster ? handleSnap : handleStudentInboxSnap, () => {});
    return unsub;
  } catch (err) {
    console.warn('Could not subscribe to student remedial tests:', err);
    return () => {};
  }
}

/**
 * Scans localStorage across authenticated user accounts.
 * Strictly excludes guest sessions and guest attempts.
 */
export function getAllLocalAttemptsAcrossAccounts(): TestAttempt[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  const results: TestAttempt[] = [];
  const seenAttemptIds = new Set<string>();

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Strictly only scan authenticated account keys, ignoring guest local storage
      if (
        key.startsWith('math_mock_attempts_account_') ||
        key.startsWith('math_mock_attempts_') ||
        (key.startsWith('elevate_attempts_') && !key.includes('guest'))
      ) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((att: TestAttempt) => {
                if (att && att.id && !seenAttemptIds.has(att.id)) {
                  if (isGuestUser({ uid: att.userId, email: att.userEmail })) {
                    return; // Strictly exclude guest attempts from master console & cohort extraction
                  }

                  seenAttemptIds.add(att.id);
                  results.push(att);
                }
              });
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('Error reading local attempts across accounts:', err);
  }

  return results;
}

/**
 * In-memory & session-storage cache for cohort attempts to eliminate repetitive Firestore read spikes
 * during Master Console test selections and remedial previews.
 */
const cohortAttemptsMemoryCache = new Map<string, { timestamp: number; attempts: TestAttempt[] }>();
const activeCohortFetchPromises = new Map<string, Promise<TestAttempt[]>>();
const COHORT_CACHE_TTL_MS = 15 * 60 * 1000; // 15-minute cache

function getSessionCachedCohortAttempts(testId: string): TestAttempt[] | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(`elevate_cohort_cache_${testId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.attempts) && (Date.now() - parsed.timestamp < COHORT_CACHE_TTL_MS)) {
      return parsed.attempts;
    }
  } catch {}
  return null;
}

function setSessionCachedCohortAttempts(testId: string, attempts: TestAttempt[]): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(`elevate_cohort_cache_${testId}`, JSON.stringify({
      timestamp: Date.now(),
      attempts,
    }));
  } catch {}
}

/**
 * Convert a Firestore LeaderboardEntry into a lightweight synthetic TestAttempt
 * for Master Console cohort analytics and remedial engine.
 */
export function convertLeaderboardEntryToAttempt(e: LeaderboardEntry, test: MathTest): TestAttempt {
  // 1. BEST EFFORT: If the student took this test locally on this machine, retrieve their full authentic attempt!
  try {
    const allLocal = getAllLocalAttemptsAcrossAccounts();
    const realAtt = allLocal.find(
      (a) =>
        (a.userId === e.userId || (a.userEmail && e.userEmail && a.userEmail.toLowerCase() === e.userEmail.toLowerCase())) &&
        doesAttemptMatchTest(a, test)
    );
    if (realAtt && realAtt.answers && Object.keys(realAtt.answers).length > 0) {
      return realAtt;
    }
  } catch {}

  const answers: Record<string, any> = {};
  const questionsCount = test.questions?.length || e.questionsCount || 10;
  const hasExplicitIndices = Array.isArray(e.wrongQuestionIndices) || Array.isArray(e.unattemptedQuestionIndices);

  const wrongSet = new Set((e.wrongQuestionIndices || []).map(Number));
  const unattemptedSet = new Set((e.unattemptedQuestionIndices || []).map(Number));
  const flaggedSet = new Set(((e as any).flaggedQuestionIndices || []).map(Number));
  const flaggedQuestionsSet = new Set(
    (Array.isArray((e as any).flaggedQuestions) ? (e as any).flaggedQuestions : []).map(String)
  );

  // If explicit index arrays were NOT provided (e.g. legacy or summary leaderboard entries):
  // Reconstruct performance strictly from percentage and score:
  const correctCount = !hasExplicitIndices
    ? (e.percentage !== undefined ? Math.round((e.percentage / 100) * questionsCount) : Math.min(e.score || 0, questionsCount))
    : 0;

  const wrongIndicesList: number[] = [];
  const unattemptedIndicesList: number[] = [];
  const flaggedIndicesList: number[] = [];

  if (Array.isArray(test.questions)) {
    test.questions.forEach((q, idx) => {
      let isWrong = false;
      let isUnattempted = false;
      let isCorrect = false;

      if (hasExplicitIndices) {
        isWrong = wrongSet.has(idx);
        isUnattempted = unattemptedSet.has(idx);
        isCorrect = !isWrong && !isUnattempted;
      } else {
        if (idx < correctCount) {
          isCorrect = true;
          isUnattempted = false;
          isWrong = false;
        } else {
          isCorrect = false;
          isUnattempted = true;
          isWrong = false;
        }
      }

      if (isWrong) wrongIndicesList.push(idx);
      if (isUnattempted) unattemptedIndicesList.push(idx);

      const isFlagged = flaggedSet.has(idx) || (q.id && flaggedQuestionsSet.has(String(q.id)));
      if (isFlagged) flaggedIndicesList.push(idx);

      const userAns = e.userAnswers ? e.userAnswers[q.id] : undefined;
      const selectedOption = isUnattempted
        ? ''
        : (userAns !== undefined ? String(userAns) : (isCorrect ? String(q.correctAnswer ?? '') : ''));

      answers[q.id] = {
        questionId: q.id,
        selectedOption,
        isCorrect,
        flagged: isFlagged,
        timeSpentSeconds: e.timeSpentSeconds ? Math.round(e.timeSpentSeconds / questionsCount) : 30,
      };
    });
  }

  return {
    id: e.firstAttemptId || `cohort_${e.userId}_${test.id}`,
    testId: test.id,
    testTitle: e.testTitle || test.title,
    testTopic: test.topic || 'General Mathematics',
    userId: e.userId,
    userEmail: e.userEmail || '',
    userName: e.userName || 'Student',
    score: e.score,
    totalPoints: e.totalPoints || questionsCount * 4,
    percentage: e.percentage,
    passed: e.percentage >= (test.passingScorePercentage || 60),
    timeSpentSeconds: e.timeSpentSeconds || 0,
    answers,
    attemptMode: e.attemptMode || 'online',
    completedAt: e.completedAt,
    createdAt: e.completedAt,
    wrongQuestionIndices: e.wrongQuestionIndices || wrongIndicesList,
    unattemptedQuestionIndices: e.unattemptedQuestionIndices || unattemptedIndicesList,
    flaggedQuestionIndices: (e as any).flaggedQuestionIndices || (flaggedIndicesList.length > 0 ? flaggedIndicesList : undefined),
    flaggedQuestions: (e as any).flaggedQuestions || (flaggedIndicesList.length > 0 ? flaggedIndicesList.map((i) => test.questions?.[i]?.id).filter(Boolean) : undefined),
    userAnswers: e.userAnswers,
  } as TestAttempt;
}

export function convertCompactRecordToAttempt(rec: any, activeTest: MathTest): TestAttempt {
  const qCount = activeTest.questions?.length || (activeTest as any).questionCount || 50;
  const answersMap: Record<number, any> = {};

  if (Array.isArray(rec.wrongIndices)) {
    rec.wrongIndices.forEach((qIdx: number) => {
      answersMap[qIdx] = { selectedOption: 1, isCorrect: false };
    });
  }
  if (Array.isArray(rec.unattemptedIndices)) {
    rec.unattemptedIndices.forEach((qIdx: number) => {
      answersMap[qIdx] = { selectedOption: null, isCorrect: false };
    });
  }

  const duration = typeof rec.durationSeconds === 'number'
    ? rec.durationSeconds
    : (typeof rec.timeSpentSeconds === 'number' ? rec.timeSpentSeconds : 0);

  const completed = rec.completedAt || (rec.timestamp ? new Date(rec.timestamp).toISOString() : new Date().toISOString());

  return {
    id: `cohort_att_${rec.uid || 'user'}_${activeTest.id}`,
    testId: activeTest.id,
    testTitle: activeTest.title,
    userId: rec.uid || rec.userId || 'learner',
    userName: rec.name || rec.userName || 'Learner',
    userEmail: rec.email || rec.userEmail || '',
    score: typeof rec.score === 'number' ? rec.score : 0,
    totalPoints: typeof rec.totalPoints === 'number' ? rec.totalPoints : qCount * 4,
    percentage: typeof rec.percentage === 'number' ? rec.percentage : 0,
    timeSpentSeconds: duration,
    attemptMode: rec.mode === 'omr' ? 'omr' : 'online',
    completedAt: completed,
    createdAt: completed,
    answers: answersMap,
    wrongQuestionIndices: Array.isArray(rec.wrongIndices) ? rec.wrongIndices : undefined,
    unattemptedQuestionIndices: Array.isArray(rec.unattemptedIndices) ? rec.unattemptedIndices : undefined,
    flaggedQuestionIndices: Array.isArray(rec.flaggedIndices) ? rec.flaggedIndices : undefined,
  } as TestAttempt;
}

/**
 * Fetch all student cohort attempts for a test from available sources:
 * 1. Local storage across authenticated accounts
 * 2. High-capacity IndexedDB storage across all student accounts
 * 3. Local leaderboard entries (elevate_lb_*)
 * 4. Local server API (/api/leaderboard/:testId)
 * 5. Firestore cloud test_leaderboards (Optimized: 1 Read Top-Bucket with in-memory caching)
 *
 * Drastically minimizes Firestore reads down to 1 doc per test with 5-minute memory caching.
 */
export async function fetchCohortAttemptsForTest(test: MathTest, forceRefresh: boolean = false): Promise<TestAttempt[]> {
  if (!test || !test.id) return [];

  const cacheKey = test.id;
  const now = Date.now();
  if (!forceRefresh) {
    const cached = cohortAttemptsMemoryCache.get(cacheKey);
    if (cached && (now - cached.timestamp < COHORT_CACHE_TTL_MS)) {
      return cached.attempts;
    }
    const sessionCached = getSessionCachedCohortAttempts(cacheKey);
    if (sessionCached) {
      cohortAttemptsMemoryCache.set(cacheKey, { timestamp: now, attempts: sessionCached });
      return sessionCached;
    }
  }

  if (activeCohortFetchPromises.has(cacheKey)) {
    return activeCohortFetchPromises.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    let activeTest = test;
    if (!activeTest.questions || activeTest.questions.length === 0) {
      const cached = getCachedFullTest(test.id);
      if (cached && cached.questions && cached.questions.length > 0) {
        activeTest = cached;
      } else {
        const full = await fetchFullTestFromFirestore(test.id).catch(() => null);
        if (full && full.questions && full.questions.length > 0) {
          activeTest = full;
        }
      }
    }

    const results: TestAttempt[] = [];
    const seenUserIds = new Set<string>();

    const canonicalId = getCanonicalLeaderboardId(activeTest.id, activeTest.title);
    const targetIds = Array.from(new Set([canonicalId, activeTest.id])).filter(Boolean);

    // 1. Check local storage across all accounts and sessions on this browser
    try {
      const allLocal = getAllLocalAttemptsAcrossAccounts();
      allLocal.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());
      allLocal.forEach((att) => {
        if (!att) return;
        const matches = doesAttemptMatchTest(att, activeTest);
        if (matches && att.userId && !seenUserIds.has(att.userId)) {
          seenUserIds.add(att.userId);
          if (att.userEmail) seenUserIds.add(att.userEmail.toLowerCase());
          results.push(att);
        }
      });
    } catch (e) {
      console.warn('Local attempts extraction notice:', e);
    }

    // 2. Check IndexedDB across all accounts
    try {
      const idbAttempts = await getAllAttemptsAcrossAllUsersFromIndexedDB();
      idbAttempts.forEach((att) => {
        if (!att) return;
        const matches = doesAttemptMatchTest(att, activeTest);
        const emailKey = (att.userEmail || '').toLowerCase();
        const isAlreadySeen = (att.userId && seenUserIds.has(att.userId)) || (emailKey && seenUserIds.has(emailKey));
        if (matches && !isAlreadySeen) {
          if (att.userId) seenUserIds.add(att.userId);
          if (emailKey) seenUserIds.add(emailKey);
          results.push(att);
        }
      });
    } catch (e) {
      console.warn('IndexedDB cohort attempts notice:', e);
    }

    // 3. Check local leaderboard entries (saved by saveLocalLeaderboardEntry)
    try {
      const localLeaderboardEntries = getLocalLeaderboardEntries(activeTest.id, activeTest.title);
      localLeaderboardEntries.forEach((e) => {
        if (!e) return;
        const emailKey = (e.userEmail || '').toLowerCase();
        const isAlreadySeen = (e.userId && seenUserIds.has(e.userId)) || (emailKey && seenUserIds.has(emailKey));
        if (!isAlreadySeen) {
          if (e.userId) seenUserIds.add(e.userId);
          if (emailKey) seenUserIds.add(emailKey);
          results.push(convertLeaderboardEntryToAttempt(e, activeTest));
        }
      });
    } catch (e) {
      console.warn('Local leaderboard extraction notice:', e);
    }

    // 4. Check local backend server API (/api/leaderboard/:testId)
    try {
      const res = await fetch(`/api/leaderboard/${encodeURIComponent(canonicalId)}?title=${encodeURIComponent(activeTest.title || '')}`).catch(() => null);
      if (res && res.ok) {
        const apiData = await res.json().catch(() => null);
        if (apiData && Array.isArray(apiData.entries)) {
          apiData.entries.forEach((e: LeaderboardEntry) => {
            if (!e) return;
            const emailKey = (e.userEmail || '').toLowerCase();
            const isAlreadySeen = (e.userId && seenUserIds.has(e.userId)) || (emailKey && seenUserIds.has(emailKey));
            if (!isAlreadySeen) {
              if (e.userId) seenUserIds.add(e.userId);
              if (emailKey) seenUserIds.add(emailKey);
              results.push(convertLeaderboardEntryToAttempt(e, activeTest));
            }
          });
        }
      }
    } catch {}

    // 5. Firestore cloud test_leaderboards (Master Enterprise 1-Read Compact Bucket Architecture)
    if (!isOfflineLocalOnlyMode()) {
      try {
        let cohortFound = false;

        // A0. Compact Cohort Bucket 1 (Primary 1-Read Bucket with auto-spill Part 2)
        for (const targetId of targetIds) {
          const cohortBucketRef = doc(db, 'test_leaderboards', targetId, 'summary', 'cohort_bucket_1');
          const cohortSnap = await getDoc(cohortBucketRef).catch(() => null);
          if (cohortSnap && cohortSnap.exists()) {
            cohortFound = true;
            const cData = cohortSnap.data() || {};
            let compactList: any[] = Array.isArray(cData.attempts) ? cData.attempts : [];

            // Scientific Part 2 Chunking: If threshold exceeded, merge Part 2
            if (cData.hasPart2) {
              try {
                const cohortBucket2Ref = doc(db, 'test_leaderboards', targetId, 'summary', 'cohort_bucket_2');
                const c2Snap = await getDoc(cohortBucket2Ref).catch(() => null);
                if (c2Snap && c2Snap.exists()) {
                  const c2Data = c2Snap.data() || {};
                  if (Array.isArray(c2Data.attempts)) {
                    compactList = [...compactList, ...c2Data.attempts];
                  }
                }
              } catch {}
            }

            compactList.forEach((rec) => {
              if (!rec) return;
              const uid = rec.uid || rec.userId;
              const emailKey = (rec.email || rec.userEmail || '').toLowerCase();
              const isAlreadySeen = (uid && seenUserIds.has(uid)) || (emailKey && seenUserIds.has(emailKey));
              if (!isAlreadySeen) {
                if (uid) seenUserIds.add(uid);
                if (emailKey) seenUserIds.add(emailKey);
                results.push(convertCompactRecordToAttempt(rec, activeTest));
              }
            });
            break; // 1 Read executed successfully!
          }
        }

        let topBucketFound = cohortFound;
        if (!cohortFound) {
          for (const targetId of targetIds) {
            // A. Top bucket summary doc fallback (PACKS ALL ENTRIES INTO 1 READ)
            const bucketDocRef = doc(db, 'test_leaderboards', targetId, 'summary', 'top_bucket');
            const bucketSnap = await getDoc(bucketDocRef).catch(() => null);
            if (bucketSnap && bucketSnap.exists()) {
              topBucketFound = true;
              const data = bucketSnap.data();
              if (Array.isArray(data.entries)) {
                data.entries.forEach((e: LeaderboardEntry) => {
                  if (!e) return;
                  const emailKey = (e.userEmail || '').toLowerCase();
                  const isAlreadySeen = (e.userId && seenUserIds.has(e.userId)) || (emailKey && seenUserIds.has(emailKey));
                  if (!isAlreadySeen) {
                    if (e.userId) seenUserIds.add(e.userId);
                    if (emailKey) seenUserIds.add(emailKey);
                    results.push(convertLeaderboardEntryToAttempt(e, activeTest));
                  }
                });
              }
              break; // Top bucket found! Stop querying other IDs to save reads!
            }
          }
        }

        // B. ONLY fallback to subcollection if NO top_bucket exists at all, with small limit
        if (!topBucketFound) {
          const primaryTargetId = targetIds[0] || activeTest.id;
          try {
            const entriesCol = collection(db, 'test_leaderboards', primaryTargetId, 'entries');
            const entriesSnap = await getDocs(query(entriesCol, limit(25))).catch(() => null);
            if (entriesSnap && !entriesSnap.empty) {
              entriesSnap.docs.forEach((docSnap) => {
                const e = docSnap.data() as LeaderboardEntry;
                if (!e) return;
                const emailKey = (e.userEmail || '').toLowerCase();
                const isAlreadySeen = (e.userId && seenUserIds.has(e.userId)) || (emailKey && seenUserIds.has(emailKey));
                if (!isAlreadySeen) {
                  if (e.userId) seenUserIds.add(e.userId);
                  if (emailKey) seenUserIds.add(emailKey);
                  results.push(convertLeaderboardEntryToAttempt(e, activeTest));
                }
              });
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Could not fetch cohort attempts from cloud:', err);
      }
    }

    cohortAttemptsMemoryCache.set(cacheKey, { timestamp: Date.now(), attempts: results });
    setSessionCachedCohortAttempts(cacheKey, results);
    return results;
  })();

  activeCohortFetchPromises.set(cacheKey, fetchPromise);
  try {
    const res = await fetchPromise;
    return res;
  } finally {
    activeCohortFetchPromises.delete(cacheKey);
  }
}
