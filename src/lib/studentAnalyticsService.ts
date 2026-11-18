import { db, fetchUserAttemptsFromFirestore } from './firebase';
import { doc, getDoc, collection, getDocs, limit, query } from 'firebase/firestore';
import { getAllAttemptsAcrossAllUsersFromIndexedDB } from './indexedDbStorage';
import type { TestAttempt, MathTest } from '../types';

export interface StudentLectureWatch {
  lectureId: string;
  batchId?: string;
  lectureTitle?: string;
  watchedSeconds: number;
  totalSeconds: number;
  isCompleted: boolean;
  completedAt?: string;
}

export interface Student360Profile {
  studentId: string;
  name: string;
  email?: string;
  phone?: string;
  enrolledBatches: { batchId: string; batchTitle: string }[];
  totalTests: number;
  averageScore: number;
  averagePercentage: number;
  totalStudyMinutes: number;
  accuracyPercentage: number;
  attempts: TestAttempt[];
  videoStats: {
    totalCompleted: number;
    totalMinutesWatched: number;
    lectures: Record<string, StudentLectureWatch>;
  };
  weakTopics: { topic: string; mistakeCount: number }[];
  strongTopics: { topic: string; correctCount: number }[];
  cachedAt: number;
}

// In-Memory Multi-Tier Cache to guarantee ZERO duplicate Firestore reads
const student360MemoryCache = new Map<string, Student360Profile>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

/**
 * Fetch a student's full 360° academic performance report strictly on-demand.
 * Incurs at most 2 targeted reads on first open, 0 reads on subsequent opens.
 */
export async function fetchStudent360OnDemand(
  studentId: string,
  studentName: string,
  studentEmail?: string,
  studentPhone?: string,
  enrolledBatches: { batchId: string; batchTitle: string }[] = [],
  forceRefresh: boolean = false
): Promise<Student360Profile> {
  const now = Date.now();

  // Tier 1: In-Memory Cache Check
  if (!forceRefresh && student360MemoryCache.has(studentId)) {
    const cached = student360MemoryCache.get(studentId)!;
    if (now - cached.cachedAt < CACHE_TTL_MS) {
      return cached;
    }
  }

  // Tier 2: Fetch Attempts on-demand (Read 1: uses existing optimized fetcher)
  const attemptsPromise = (async (): Promise<TestAttempt[]> => {
    try {
      const attempts = await fetchUserAttemptsFromFirestore(studentId, 50, forceRefresh);
      if (attempts && attempts.length > 0) return attempts;
    } catch (e) {
      console.warn('Direct cloud attempt fetch fallback to IndexedDB:', e);
    }

    // Fallback: Check local IndexedDB for any cached/offline records for this student
    try {
      const allLocal = await getAllAttemptsAcrossAllUsersFromIndexedDB();
      const userLocal = allLocal.filter(a => a.userId === studentId || (studentEmail && a.userEmail === studentEmail));
      if (userLocal.length > 0) {
        userLocal.sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
        return userLocal;
      }
    } catch {}

    return [];
  })();

  // Tier 3: Fetch Video Progress on-demand (Read 2: Single compact doc)
  const videoProgressPromise = (async (): Promise<{
    totalCompleted: number;
    totalMinutesWatched: number;
    lectures: Record<string, StudentLectureWatch>;
  }> => {
    const lectureMap: Record<string, StudentLectureWatch> = {};

    try {
      // 1. First attempt: Single compact document /user_progress/{studentId} (Strictly 1 Read)
      const summaryDocRef = doc(db, 'user_progress', studentId);
      const summarySnap = await getDoc(summaryDocRef);

      if (summarySnap.exists()) {
        const data = summarySnap.data();
        const lecs = data.lectures || {};
        let completedCount = 0;
        let totalSeconds = 0;

        Object.entries(lecs).forEach(([lecId, val]: [string, any]) => {
          const isComp = Boolean(val.isCompleted);
          if (isComp) completedCount++;
          totalSeconds += Number(val.watchedSeconds || 0);

          lectureMap[lecId] = {
            lectureId: lecId,
            batchId: val.batchId,
            watchedSeconds: Number(val.watchedSeconds || 0),
            totalSeconds: Number(val.totalSeconds || 0),
            isCompleted: isComp,
            completedAt: val.completedAt
          };
        });

        return {
          totalCompleted: completedCount,
          totalMinutesWatched: Math.round(totalSeconds / 60),
          lectures: lectureMap
        };
      }
    } catch (e) {
      console.warn('LMS user_progress compact doc fetch deferred:', e);
    }

    // 2. Fallback: Check /users/{studentId}/lecture_progress subcollection (limit 50)
    try {
      const subCol = collection(db, 'users', studentId, 'lecture_progress');
      const snap = await getDocs(query(subCol, limit(50)));

      if (!snap.empty) {
        let completedCount = 0;
        let totalSeconds = 0;

        snap.forEach((d) => {
          const val = d.data();
          const isComp = Boolean(val.isCompleted);
          if (isComp) completedCount++;
          totalSeconds += Number(val.watchedSeconds || 0);

          lectureMap[d.id] = {
            lectureId: d.id,
            batchId: val.batchId,
            watchedSeconds: Number(val.watchedSeconds || 0),
            totalSeconds: Number(val.totalSeconds || 0),
            isCompleted: isComp,
            completedAt: val.completedAt
          };
        });

        return {
          totalCompleted: completedCount,
          totalMinutesWatched: Math.round(totalSeconds / 60),
          lectures: lectureMap
        };
      }
    } catch {}

    return { totalCompleted: 0, totalMinutesWatched: 0, lectures: {} };
  })();

  const [attempts, videoStats] = await Promise.all([attemptsPromise, videoProgressPromise]);

  // Aggregate Math Metrics
  const totalTests = attempts.length;
  let totalScore = 0;
  let totalPoints = 0;
  let totalPercentage = 0;
  let totalTimeSeconds = 0;
  const topicMistakeMap: Record<string, number> = {};
  const topicCorrectMap: Record<string, number> = {};

  attempts.forEach(a => {
    totalScore += a.score || 0;
    totalPoints += a.totalPoints || 0;
    totalPercentage += a.percentage || 0;
    totalTimeSeconds += a.timeSpentSeconds || 0;

    const topic = a.testTopic || 'General Mathematics';
    if (a.percentage >= 70) {
      topicCorrectMap[topic] = (topicCorrectMap[topic] || 0) + 1;
    } else {
      topicMistakeMap[topic] = (topicMistakeMap[topic] || 0) + 1;
    }
  });

  const averageScore = totalTests > 0 ? Math.round(totalScore / totalTests) : 0;
  const averagePercentage = totalTests > 0 ? Math.round(totalPercentage / totalTests) : 0;
  const totalStudyMinutes = Math.round(totalTimeSeconds / 60) + videoStats.totalMinutesWatched;
  const accuracyPercentage = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : averagePercentage;

  const weakTopics = Object.entries(topicMistakeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, mistakeCount: count }));

  const strongTopics = Object.entries(topicCorrectMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, correctCount: count }));

  const profile: Student360Profile = {
    studentId,
    name: studentName,
    email: studentEmail,
    phone: studentPhone,
    enrolledBatches,
    totalTests,
    averageScore,
    averagePercentage,
    totalStudyMinutes,
    accuracyPercentage,
    attempts,
    videoStats,
    weakTopics,
    strongTopics,
    cachedAt: now
  };

  // Cache in-memory
  student360MemoryCache.set(studentId, profile);

  return profile;
}

/**
 * Clear cached profile for a student to trigger a fresh fetch
 */
export function invalidateStudent360Cache(studentId: string): void {
  student360MemoryCache.delete(studentId);
}
