import { useEffect, useRef } from 'react';
import {
  deriveRealBatchNotifications,
  type AppNotification,
  getReadNotificationIds,
} from '../lib/notifications';
import { sendDeviceNotification } from '../lib/deviceNotificationService';
import type { Batch, Chapter, Lecture, Announcement, BatchTestCard } from '../lms/types';
import type { MathTest } from '../types';

const SEEN_POPUP_IDS_KEY = 'elevate_seen_popup_ids_v2';

function getSeenPopupIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_POPUP_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenPopupIds(set: Set<string>): void {
  try {
    // Keep max 200 IDs to avoid unbounded storage growth
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(SEEN_POPUP_IDS_KEY, JSON.stringify(arr));
  } catch {}
}

interface UseNotificationWatcherParams {
  batches: Batch[];
  lectures: Lecture[];
  chapters?: Chapter[];
  announcements?: Announcement[];
  batchTests?: BatchTestCard[];
  availableTests?: MathTest[];
  enrolledBatchIds?: string[];
  isMaster?: boolean;
  isAppLoaded: boolean;
}

export function useNotificationWatcher({
  batches,
  lectures,
  chapters,
  announcements,
  batchTests,
  availableTests,
  enrolledBatchIds,
  isMaster = false,
  isAppLoaded,
}: UseNotificationWatcherParams): void {
  const isInitialMountRef = useRef(true);
  const prevLecturesCountRef = useRef(lectures.length);
  const prevAnnouncementsCountRef = useRef((announcements || []).length);
  const prevBatchTestsCountRef = useRef((batchTests || []).length);

  useEffect(() => {
    if (!isAppLoaded) return;

    const notifs = deriveRealBatchNotifications({
      batches,
      lectures,
      chapters,
      announcements,
      batchTests,
      availableTests,
      enrolledBatchIds,
      isMaster,
    });

    if (notifs.length === 0) return;

    const seenSet = getSeenPopupIds();
    const readSet = getReadNotificationIds();

    // Check for fresh unread notifications that haven't been popped up yet
    const unreadUnseen = notifs.filter((n) => !n.read && !readSet.has(n.id) && !seenSet.has(n.id));

    if (unreadUnseen.length > 0) {
      // Sort newest first
      unreadUnseen.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // If initial app mount, only pop up the single newest unread notification
      // to greet the user without bombarding with multiple popups
      const notifsToPop = isInitialMountRef.current ? [unreadUnseen[0]] : unreadUnseen.slice(0, 2);

      notifsToPop.forEach((notif) => {
        seenSet.add(notif.id);

        sendDeviceNotification({
          id: notif.id,
          title: notif.title,
          body: notif.message,
          category: notif.category,
          targetBatchId: notif.targetBatchId,
          targetChapterId: notif.targetChapterId,
          targetLectureId: notif.targetLectureId,
          targetTestId: notif.targetTestId,
          actionLabel: notif.actionLabel,
          batchTitle: notif.batchTitle,
          timestamp: notif.timestamp,
        });
      });

      saveSeenPopupIds(seenSet);
    }

    // Update counts and clear initial mount flag
    isInitialMountRef.current = false;
    prevLecturesCountRef.current = lectures.length;
    prevAnnouncementsCountRef.current = (announcements || []).length;
    prevBatchTestsCountRef.current = (batchTests || []).length;
  }, [
    isAppLoaded,
    batches,
    lectures,
    chapters,
    announcements,
    batchTests,
    availableTests,
    enrolledBatchIds,
    isMaster,
  ]);
}
