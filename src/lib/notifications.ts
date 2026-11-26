import { type ActiveTab, type MathTest } from '../types';
import type { Batch, Chapter, Lecture, Announcement, BatchTestCard } from '../lms/types';
import { APP_BRAND } from '../config/appBrand';
import { belongsToInstitute, getActiveAppInstituteIdOrPrimary } from './masterWorkspace';

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
const APP_INSTALL_TIMESTAMP_KEY = 'elevate_app_install_timestamp_v2';
export const NOTIFICATIONS_EVENT = 'elevate-notifications-updated';

export function getAppInstallTimestamp(): number {
  try {
    const stored = localStorage.getItem(APP_INSTALL_TIMESTAMP_KEY);
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num > 0) return num;
    }
    const now = Date.now();
    localStorage.setItem(APP_INSTALL_TIMESTAMP_KEY, now.toString());
    return now;
  } catch {
    return Date.now();
  }
}

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
  instituteId?: string | null;
}): AppNotification[] {
  const {
    batches: rawBatches = [],
    lectures: rawLectures = [],
    chapters = [],
    announcements: rawAnnouncements = [],
    batchTests: rawBatchTests = [],
    enrolledBatchIds,
    isMaster = false,
    instituteId,
  } = params;

  const targetInstituteId = instituteId || getActiveAppInstituteIdOrPrimary();
  const batches = rawBatches.filter((b) => belongsToInstitute(b, targetInstituteId));
  const instituteBatchIds = new Set(batches.map((b) => b.id));
  const lectures = rawLectures.filter((l) => instituteBatchIds.has(l.batchId));
  const announcements = rawAnnouncements.filter(
    (a) => belongsToInstitute(a, targetInstituteId) && (!a.batchId || instituteBatchIds.has(a.batchId))
  );
  const batchTests = rawBatchTests.filter((bt) => instituteBatchIds.has(bt.batchId));

  const enrolledSet = enrolledBatchIds ? new Set(enrolledBatchIds) : null;
  const isEnrolledBatch = (bId?: string | null): boolean => {
    if (isMaster) return true;
    if (!enrolledSet) return true;
    if (!bId) return false;
    return enrolledSet.has(bId);
  };

  const readSet = getReadNotificationIds();
  const dismissedSet = getDismissedNotificationIds();
  const installTime = getAppInstallTimestamp();

  // Helper: Returns true if content was created on or after app installation (with 2-min clock skew buffer)
  const isAfterInstall = (dateVal?: unknown): boolean => {
    if (!dateVal) return false;
    try {
      const d = new Date(dateVal as any);
      const t = d.getTime();
      if (!isNaN(t) && isFinite(t)) {
        return t >= installTime - 120000;
      }
    } catch {}
    return false;
  };

  const notifs: AppNotification[] = [];
  const seenIds = new Set<string>();

  // 1. REAL BATCH LECTURE UPDATES (Only newly published lectures since app installation)
  lectures.forEach((lec) => {
    if (!isEnrolledBatch(lec.batchId)) return;
    if (!isAfterInstall(lec.createdAt)) return;
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

  // 2. REAL BATCH ANNOUNCEMENTS & MASTER BROADCAST POSTS (Welcome post & new broadcasts)
  announcements.forEach((ann) => {
    // Auto-expiry check: skip if banner/post duration has elapsed
    if (ann.expiresAt && typeof ann.expiresAt === 'number' && Date.now() > ann.expiresAt) return;
    if (ann.batchId && !isEnrolledBatch(ann.batchId)) return;

    // Filter out old historical announcements unless it's the official Welcome announcement or marked important
    const isWelcomeOrImportant = ann.id === 'ann_welcome_1' || ann.id === 'ann_test_1' || ann.isImportant;
    if (!isWelcomeOrImportant && !isAfterInstall(ann.date || ann.createdAt)) return;

    const notifId = `notif-ann-${ann.id}`;
    if (seenIds.has(notifId) || dismissedSet.has(notifId)) return;
    seenIds.add(notifId);

    const parentBatch = batches.find((b) => b.id === ann.batchId);

    // Transform legacy testing environment post to Welcome to <Brand>
    let cleanTitle = (ann.title || '').trim();
    let cleanMessage = ann.message || '';
    if (ann.id === 'ann_test_1' || cleanTitle.includes('Testing Environment Active')) {
      cleanTitle = '🎉 Welcome to Act Elevate';
      cleanMessage = `Welcome to ${APP_BRAND.name}! Explore your course batches, practice interactive mock tests, and track your progress seamlessly.`;
    }

    const bracketMatch = cleanTitle.match(/^\[(.*?)\]\s*(.*)$/);
    if (bracketMatch) {
      const insideBracket = bracketMatch[1].trim();
      const rest = bracketMatch[2].trim();
      if (!rest || rest.toLowerCase() === insideBracket.toLowerCase()) {
        cleanTitle = insideBracket;
      } else {
        cleanTitle = rest;
      }
    }

    // Determine final title: display only the clean name without closed brackets
    let finalTitle = cleanTitle;
    if (!finalTitle && parentBatch?.title) {
      finalTitle = parentBatch.title;
    } else if (finalTitle && parentBatch?.title) {
      if (finalTitle.toLowerCase() === parentBatch.title.toLowerCase()) {
        finalTitle = parentBatch.title;
      }
    } else if (!finalTitle) {
      finalTitle = 'Campus Update';
    }

    notifs.push({
      id: notifId,
      title: finalTitle,
      message: cleanMessage,
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

  // 3. REAL BATCH TESTS & DPP ASSIGNMENTS (Only newly assigned tests since installation)
  batchTests.forEach((bTest) => {
    if (!isEnrolledBatch(bTest.batchId)) return;
    if (!isAfterInstall(bTest.publishedAt || (bTest as any).createdAt)) return;
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

  // Sort by latest timestamp first
  return notifs.sort((a, b) => {
    const tA = !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp).getTime() : 0;
    const tB = !isNaN(new Date(b.timestamp).getTime()) ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });
}
