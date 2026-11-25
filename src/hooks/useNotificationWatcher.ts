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
  const appOpenedAtRef = useRef<number>(Date.now());
  const isHydrationSettledRef = useRef<boolean>(false);

  // Allow initial local + Firestore hydration (batches, lectures, batchTests, announcements)
  // to settle for 5 seconds after app load before treating any new arrival as a live pop-up.
  useEffect(() => {
    if (!isAppLoaded) return;
    isHydrationSettledRef.current = false;
    const timer = setTimeout(() => {
      isHydrationSettledRef.current = true;
    }, 5000);
    return () => clearTimeout(timer);
  }, [isAppLoaded]);

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

    // During initial app open / cloud hydration, silently mark existing pending updates as seen
    // so they appear cleanly in the Updates tab WITHOUT firing pop-up notifications on app launch.
    if (!isHydrationSettledRef.current) {
      let added = false;
      notifs.forEach((n) => {
        if (!seenSet.has(n.id)) {
          seenSet.add(n.id);
          added = true;
        }
      });
      if (added) saveSeenPopupIds(seenSet);
      return;
    }

    // After hydration settles, only pop up genuinely live updates created around/after app open
    const liveThresholdMs = appOpenedAtRef.current - 2 * 60 * 1000;
    const unreadUnseen = notifs.filter((n) => {
      if (n.read || readSet.has(n.id) || seenSet.has(n.id)) return false;
      const ts = new Date(n.timestamp).getTime();
      return Number.isFinite(ts) && ts >= liveThresholdMs;
    });

    // Silently record any older unseen items so they don't re-trigger later
    let hasSilentAdditions = false;
    notifs.forEach((n) => {
      if (!seenSet.has(n.id) && !unreadUnseen.some((u) => u.id === n.id)) {
        seenSet.add(n.id);
        hasSilentAdditions = true;
      }
    });

    if (unreadUnseen.length > 0) {
      unreadUnseen.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const notifsToPop = unreadUnseen.slice(0, 2);

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
    } else if (hasSilentAdditions) {
      saveSeenPopupIds(seenSet);
    }
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
