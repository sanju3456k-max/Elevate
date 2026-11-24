import { type ActiveTab, type MathTest } from '../types';
import type { Batch, Chapter, Lecture, Announcement, BatchTestCard } from '../lms/types';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'lecture' | 'test' | 'ai' | 'notes' | 'system' | 'post';
  timestamp: string;
  read: boolean;
  actionTab?: ActiveTab;
  actionLabel?: string;
  targetBatchId?: string;
  targetChapterId?: string | null;
  targetLectureId?: string;
  targetTestId?: string;
  batchTitle?: string;
  folderPath?: string;
  folderSegments?: string[];
  durationText?: string;
  testDetails?: string;
  imageUrl?: string;
  authorName?: string;
  authorRole?: string;
  announcementId?: string;
}

/**
 * Traverses parentId upwards recursively to construct the full folder path hierarchy:
 * e.g. [ParentFolder, SubFolder, LeafFolder]
 */
export function getFolderHierarchyPath(
  chapterId: string | null | undefined,
  chapters: Chapter[] = []
): string[] {
  if (!chapterId || !chapters || chapters.length === 0) return [];
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = chapterId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const chapter = chapters.find((c) => c.id === currentId);
    if (!chapter) break;
    if (chapter.title) {
      path.unshift(chapter.title.trim());
    }
    currentId = chapter.parentId;
  }
  return path;
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
  enrolledBatchIds?: string[];
  isMaster?: boolean;
}): AppNotification[] {
  const {
    batches = [],
    lectures = [],
    chapters = [],
    announcements = [],
    batchTests = [],
    enrolledBatchIds,
    isMaster = false,
  } = params;

  const enrolledSet = enrolledBatchIds ? new Set(enrolledBatchIds) : null;
  const isEnrolledBatch = (bId?: string | null): boolean => {
    if (isMaster) return true;
    if (!enrolledSet) return true;
    if (!bId) return false;
    return enrolledSet.has(bId);
  };

  const readSet = getReadNotificationIds();
  const dismissedSet = getDismissedNotificationIds();
  const notifs: AppNotification[] = [];
  const seenIds = new Set<string>();

  // 1. REAL BATCH LECTURE UPDATES (Only for enrolled batches for students)
  lectures.forEach((lec) => {
    if (!isEnrolledBatch(lec.batchId)) return;
    const notifId = `notif-lec-${lec.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === lec.batchId);
    const parentChapter = chapters.find((c) => c.id === lec.chapterId);
    const fallbackBatch = parentChapter ? batches.find((b) => b.id === parentChapter.batchId) : null;
    const effectiveBatch = parentBatch || fallbackBatch || batches[0];
    const batchTitle = effectiveBatch?.title || 'Testing';

    const folderSegments = getFolderHierarchyPath(lec.chapterId, chapters);
    const folderPath = folderSegments.join('.');
    const durationText = lec.durationMinutes ? `(${lec.durationMinutes} mins)` : '';

    const location = folderSegments.length > 0 ? `${batchTitle} • ${folderSegments.join(' • ')}` : batchTitle;
    const fullMessage = durationText ? `${location} ${durationText}` : location;

    const cleanLecTitle = (lec.title || 'Video Lecture')
      .replace(/^Course\s+Lecture\s*[:-]?\s*/i, '')
      .trim();

    notifs.push({
      id: notifId,
      title: cleanLecTitle,
      message: fullMessage,
      category: 'lecture',
      timestamp: safeDateToISO(lec.createdAt),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'Watch Video',
      targetBatchId: lec.batchId,
      targetChapterId: lec.chapterId || null,
      targetLectureId: lec.id,
      batchTitle,
      folderPath,
      folderSegments,
      durationText,
    });
  });

  // 2. REAL BATCH ANNOUNCEMENTS & MASTER BROADCAST POSTS
  announcements.forEach((ann) => {
    if (ann.batchId && !isEnrolledBatch(ann.batchId)) return;
    const notifId = `notif-ann-${ann.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === ann.batchId);
    const batchPrefix = parentBatch?.title ? `[${parentBatch.title}] ` : '';

    notifs.push({
      id: notifId,
      title: `${batchPrefix}${ann.title || 'Campus Update'}`,
      message: ann.message || '',
      category: 'post',
      timestamp: safeDateToISO(ann.date || (ann.createdAt ? new Date(ann.createdAt).toISOString() : new Date().toISOString())),
      read: readSet.has(notifId),
      actionTab: ann.batchId ? 'batches' : undefined,
      actionLabel: ann.batchId ? 'Open Batch' : undefined,
      targetBatchId: ann.batchId,
      batchTitle: parentBatch?.title,
      imageUrl: ann.imageUrl,
      authorName: ann.authorName,
      authorRole: ann.authorRole,
      announcementId: ann.id,
    });
  });

  // 3. REAL BATCH TESTS & DPP ASSIGNMENTS (Only for enrolled batches for students)
  batchTests.forEach((bTest) => {
    if (!isEnrolledBatch(bTest.batchId)) return;
    const testKey = bTest.testId || bTest.id || '';
    const notifId = `notif-btest-${testKey}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === bTest.batchId);
    const parentChapter = chapters.find((c) => c.id === (bTest.chapterId || bTest.folderId));
    const fallbackBatch = parentChapter ? batches.find((b) => b.id === parentChapter.batchId) : null;
    const effectiveBatch = parentBatch || fallbackBatch || batches[0];
    const batchTitle = effectiveBatch?.title || 'Testing';

    const folderSegments = getFolderHierarchyPath(bTest.chapterId || bTest.folderId, chapters);
    const folderPath = folderSegments.join('.');
    const location = folderSegments.length > 0 ? `${batchTitle} • ${folderSegments.join(' • ')}` : batchTitle;
    const testDetails = [
      bTest.questionCount ? `${bTest.questionCount} Questions` : '',
      bTest.timeLimitMinutes ? `${bTest.timeLimitMinutes}m` : ''
    ].filter(Boolean).join(' • ');

    const fullMessage = testDetails ? `${location} • ${testDetails}` : location;

    // Clean test title so it does not repeat "Mock Test" prefix
    const cleanTestTitle = (bTest.title || 'Test')
      .replace(/^\[?Mock\s+Test\]?\s*[:-]?\s*/i, '')
      .trim();

    notifs.push({
      id: notifId,
      title: cleanTestTitle,
      message: fullMessage,
      category: 'test',
      timestamp: safeDateToISO(bTest.publishedAt),
      read: readSet.has(notifId),
      actionTab: 'batches',
      actionLabel: 'Take Test',
      targetBatchId: bTest.batchId,
      targetTestId: bTest.testId || bTest.id,
      batchTitle,
      folderPath,
      folderSegments,
      testDetails,
    });
  });

  // 4. REAL NEW BATCHES PUBLISHED (Enrolled courses for enrolled students, or all if master)
  batches.forEach((b) => {
    if (!isMaster && enrolledSet && !enrolledSet.has(b.id)) return;
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
