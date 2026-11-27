import type { TestAttempt } from '../types';
import type { WatchProgress } from '../lms/types';

export type ActivityPeriod = '7days' | '1month' | '2months' | '3months' | '4months' | '6months';

export interface DayActivityPoint {
  dayName: string;
  dateStr: string;
  isToday: boolean;
  videosCompleted: number;
  testsAttempted: number;
  avgScore: number;
  totalTimeMinutes: number;
}

/**
 * Converts an ISO string or Date to local YYYY-MM-DD key so daily buckets match the user's timezone.
 */
export function toLocalDateKey(input?: string | Date | null): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Counts lectures completed (or meaningfully watched > 30s) without any dummy fallback.
 */
export function getCompletedVideosCount(watchProgress: Record<string, WatchProgress> | undefined): number {
  if (!watchProgress) return 0;
  return Object.values(watchProgress).filter((w) => w && (w.isCompleted || w.watchedSeconds > 30)).length;
}

/**
 * Computes consecutive daily study streak (ending today or yesterday) from real attempts and watchProgress.
 */
export function computeActiveStreakDays(
  attempts: TestAttempt[],
  watchProgress: Record<string, WatchProgress> | undefined
): number {
  const activeDates = new Set<string>();

  for (const a of attempts || []) {
    const key = toLocalDateKey(a?.completedAt || a?.createdAt);
    if (key) activeDates.add(key);
  }

  if (watchProgress) {
    for (const w of Object.values(watchProgress)) {
      if (w && (w.isCompleted || w.watchedSeconds > 10)) {
        const key = toLocalDateKey(w.lastWatchedAt);
        if (key) activeDates.add(key);
      }
    }
  }

  if (activeDates.size === 0) return 0;

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  // Streak is active if the user studied today or yesterday
  let cursor = new Date(today);
  if (todayKey && activeDates.has(todayKey)) {
    cursor = new Date(today);
  } else if (yesterdayKey && activeDates.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (true) {
    const key = toLocalDateKey(cursor);
    if (!key || !activeDates.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * Aggregates real attempts and watchProgress into 7 buckets for the requested time period.
 * Returns zeroed values when no activity exists (never synthesizes dummy data).
 */
export function computeDayWiseActivity(
  period: ActivityPeriod,
  attempts: TestAttempt[],
  watchProgress: Record<string, WatchProgress> | undefined
): DayActivityPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const progressList = Object.values(watchProgress || {}).filter(
    (w) => w && (w.isCompleted || w.watchedSeconds > 30)
  );

  // Pre-index attempts and video progress by local YYYY-MM-DD
  const attemptsByDate = new Map<string, TestAttempt[]>();
  for (const a of attempts || []) {
    const key = toLocalDateKey(a?.completedAt || a?.createdAt);
    if (!key) continue;
    const arr = attemptsByDate.get(key) || [];
    arr.push(a);
    attemptsByDate.set(key, arr);
  }

  const videosByDate = new Map<string, WatchProgress[]>();
  for (const w of progressList) {
    const key = toLocalDateKey(w.lastWatchedAt);
    if (!key) continue;
    const arr = videosByDate.get(key) || [];
    arr.push(w);
    videosByDate.set(key, arr);
  }

  if (period === '7days') {
    const points: DayActivityPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toLocalDateKey(d) || '';
      const dayAttempts = attemptsByDate.get(dateStr) || [];
      const dayVideos = videosByDate.get(dateStr) || [];

      const testsAttempted = dayAttempts.length;
      const videosCompleted = dayVideos.length;
      const avgScore =
        testsAttempted > 0
          ? Math.round(dayAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / testsAttempted)
          : 0;
      const testMins = dayAttempts.reduce((sum, a) => sum + (a.timeSpentSeconds || 0) / 60, 0);
      const videoMins = dayVideos.reduce((sum, w) => sum + (w.watchedSeconds || 0) / 60, 0);

      points.push({
        dayName: i === 0 ? 'Today' : dayLabels[d.getDay()],
        dateStr,
        isToday: i === 0,
        videosCompleted,
        testsAttempted,
        avgScore,
        totalTimeMinutes: Math.round(testMins + videoMins),
      });
    }
    return points;
  }

  const totalDaysByPeriod: Record<Exclude<ActivityPeriod, '7days'>, number> = {
    '1month': 28,
    '2months': 56,
    '3months': 91,
    '4months': 119,
    '6months': 182,
  };
  const totalDays = totalDaysByPeriod[period];
  const bucketSize = Math.ceil(totalDays / 7);
  const points: DayActivityPoint[] = [];

  for (let b = 0; b < 7; b++) {
    const endOffset = (6 - b) * bucketSize;
    const startOffset = endOffset + bucketSize - 1;
    const bucketAttempts: TestAttempt[] = [];
    const bucketVideos: WatchProgress[] = [];

    for (let offset = startOffset; offset >= endOffset; offset--) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const key = toLocalDateKey(d);
      if (!key) continue;
      const da = attemptsByDate.get(key);
      if (da) bucketAttempts.push(...da);
      const dv = videosByDate.get(key);
      if (dv) bucketVideos.push(...dv);
    }

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - startOffset);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - endOffset);

    const shortFmt = (dt: Date) =>
      dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const testsAttempted = bucketAttempts.length;
    const videosCompleted = bucketVideos.length;
    const avgScore =
      testsAttempted > 0
        ? Math.round(bucketAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / testsAttempted)
        : 0;
    const testMins = bucketAttempts.reduce((sum, a) => sum + (a.timeSpentSeconds || 0) / 60, 0);
    const videoMins = bucketVideos.reduce((sum, w) => sum + (w.watchedSeconds || 0) / 60, 0);

    points.push({
      dayName: b === 6 ? 'Recent' : shortFmt(endDate),
      dateStr: `${shortFmt(startDate)} – ${shortFmt(endDate)}`,
      isToday: b === 6,
      videosCompleted,
      testsAttempted,
      avgScore,
      totalTimeMinutes: Math.round(testMins + videoMins),
    });
  }

  return points;
}
