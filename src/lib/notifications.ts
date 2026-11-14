import { type ActiveTab, type MathTest } from '../types';
import type { Batch, Chapter, Lecture, Announcement, BatchTestCard } from '../lms/types';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'lecture' | 'test' | 'ai' | 'notes' | 'system';
  timestamp: string;
  read: boolean;
  actionTab?: ActiveTab;
  actionLabel?: string;
  targetBatchId?: string;
  targetChapterId?: string | null;
  targetLectureId?: string;
  targetTestId?: string;
}

const READ_STORAGE_KEY = 'elevate_read_notification_ids_v2';
const DISMISSED_STORAGE_KEY = 'elevate_dismissed_notification_ids_v2';
export const NOTIFICATIONS_EVENT = 'elevate-notifications-updated';

function getStoredIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveStoredIdSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
  } catch (err) {
    console.warn('Failed to persist notification state:', err);
  }
}

export function getReadNotificationIds(): Set<string> {
  return getStoredIdSet(READ_STORAGE_KEY);
}

export function getDismissedNotificationIds(): Set<string> {
  return getStoredIdSet(DISMISSED_STORAGE_KEY);
}

export function markNotificationIdAsRead(id: string): void {
  const readSet = getReadNotificationIds();
  readSet.add(id);
  saveStoredIdSet(READ_STORAGE_KEY, readSet);
}

export function markAllNotificationIdsAsRead(ids: string[]): void {
  const readSet = getReadNotificationIds();
  ids.forEach((id) => readSet.add(id));
  saveStoredIdSet(READ_STORAGE_KEY, readSet);
}

export function dismissNotificationId(id: string): void {
  const dismissedSet = getDismissedNotificationIds();
  dismissedSet.add(id);
  saveStoredIdSet(DISMISSED_STORAGE_KEY, dismissedSet);
}

export function clearAllNotificationIds(ids: string[]): void {
  const dismissedSet = getDismissedNotificationIds();
  ids.forEach((id) => dismissedSet.add(id));
  saveStoredIdSet(DISMISSED_STORAGE_KEY, dismissedSet);
}

export function resetDismissedNotifications(): void {
  try {
    localStorage.removeItem(DISMISSED_STORAGE_KEY);
    localStorage.removeItem(READ_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
  } catch {}
}

/**
 * Safely parses any date string, timestamp number, or date object to ISO string
 * without ever throwing a RangeError: Invalid time value.
 */
export function safeDateToISO(dateVal?: unknown): string {
  if (!dateVal) return new Date().toISOString();
  try {
    const d = new Date(dateVal as any);
    const time = d.getTime();
    if (!isNaN(time) && isFinite(time)) {
      return d.toISOString();
    }
  } catch {}
  return new Date().toISOString();
}

/**
 * Derives REAL, authentic notifications from actual LMS Batches, Lectures, Chapters, Announcements & Tests.
 * Zero duplicate IDs and zero fake dummy data.
 */
export function deriveRealBatchNotifications(params: {
  batches: Batch[];
  lectures: Lecture[];
  chapters?: Chapter[];
  announcements?: Announcement[];
  batchTests?: BatchTestCard[];
  availableTests?: MathTest[];
}): AppNotification[] {
  const {
    batches = [],
    lectures = [],
    chapters = [],
    announcements = [],
    batchTests = [],
  } = params;

  const readSet = getReadNotificationIds();
  const dismissedSet = getDismissedNotificationIds();
  const notifs: AppNotification[] = [];
  const seenIds = new Set<string>();

  // 1. REAL BATCH LECTURE UPDATES
  lectures.forEach((lec) => {
    const notifId = `notif-lec-${lec.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === lec.batchId);
    const parentChapter = chapters.find((c) => c.id === lec.chapterId);
    const batchTitle = parentBatch?.title || 'Curriculum Batch';
    const chapterTitle = parentChapter?.title ? ` • ${parentChapter.title}` : '';
    const durationText = lec.durationMinutes ? ` (${lec.durationMinutes} mins)` : '';

    notifs.push({
      id: notifId,
      title: lec.title || 'New Video Lecture',
      message: `Available in ${batchTitle}${chapterTitle}${durationText}`,
      category: 'lecture',
      timestamp: safeDateToISO(lec.createdAt),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'Watch Lecture',
      targetBatchId: lec.batchId,
      targetChapterId: lec.chapterId || null,
      targetLectureId: lec.id,
    });
  });

  // 2. REAL BATCH ANNOUNCEMENTS
  announcements.forEach((ann) => {
    const notifId = `notif-ann-${ann.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === ann.batchId);
    const batchPrefix = parentBatch?.title ? `[${parentBatch.title}] ` : '';

    notifs.push({
      id: notifId,
      title: `${batchPrefix}${ann.title}`,
      message: ann.message || '',
      category: 'system',
      timestamp: safeDateToISO(ann.date),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'Open Batch',
      targetBatchId: ann.batchId,
    });
  });

  // 3. REAL BATCH TESTS & DPP ASSIGNMENTS
  batchTests.forEach((bTest) => {
    const testKey = bTest.testId || bTest.id || '';
    const notifId = `notif-btest-${testKey}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === bTest.batchId);
    const batchTitle = parentBatch?.title || 'Batch';
    const testDetails = [
      bTest.topic,
      bTest.questionCount ? `${bTest.questionCount} Questions` : '',
      bTest.timeLimitMinutes ? `${bTest.timeLimitMinutes}m` : ''
    ].filter(Boolean).join(' • ');

    notifs.push({
      id: notifId,
      title: `Mock Test: ${bTest.title}`,
      message: `Scheduled in ${batchTitle}${testDetails ? ` • ${testDetails}` : ''}`,
      category: 'test',
      timestamp: safeDateToISO(bTest.publishedAt),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'Take Test',
      targetBatchId: bTest.batchId,
      targetTestId: bTest.testId || bTest.id,
    });
  });

  // 4. REAL NEW BATCHES PUBLISHED
  batches.forEach((b) => {
    const notifId = `notif-batch-${b.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    notifs.push({
      id: notifId,
      title: `Course: ${b.title}`,
      message: b.tagline || b.description || 'Full curriculum module available for enrollment.',
      category: 'lecture',
      timestamp: safeDateToISO(b.startDate),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'View Course',
      targetBatchId: b.id,
    });
  });

  // Sort by latest timestamp first
  return notifs.sort((a, b) => {
    const tA = !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp).getTime() : 0;
    const tB = !isNaN(new Date(b.timestamp).getTime()) ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });
}
