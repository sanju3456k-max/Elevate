import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  PlayCircle,
  BookOpen,
  Sparkles,
  X,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import {
  ELEVATE_INAPP_NOTIF_EVENT,
  type InAppNotificationPayload,
} from '../../lib/deviceNotificationService';
import { markNotificationIdAsRead } from '../../lib/notifications';
import { type ActiveTab } from '../../types';

interface InAppNotificationBannerProps {
  onNavigateTab?: (tab: ActiveTab) => void;
  onOpenBatchLecture?: (batchId: string, chapterId: string | null, lectureId: string) => void;
  onOpenBatch?: (batchId: string) => void;
  onOpenTest?: (testId: string) => void;
}

export const InAppNotificationBanner: React.FC<InAppNotificationBannerProps> = ({
  onNavigateTab,
  onOpenBatchLecture,
  onOpenBatch,
  onOpenTest,
}) => {
  const [currentNotif, setCurrentNotif] = useState<InAppNotificationPayload | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);

  const DURATION_MS = 6500;
  const TICK_MS = 50;

  const dismissCurrent = useCallback(() => {
    if (currentNotif?.id) {
      markNotificationIdAsRead(String(currentNotif.id));
    }
    setCurrentNotif(null);
    setProgress(100);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }, [currentNotif]);

  // Listen for in-app notification events
  useEffect(() => {
    const handleInAppNotif = (event: CustomEvent<InAppNotificationPayload>) => {
      const payload = event.detail;
      if (!payload || !payload.title) return;
      setCurrentNotif(payload);
      setProgress(100);
    };

    window.addEventListener(ELEVATE_INAPP_NOTIF_EVENT as any, handleInAppNotif);

    const handleDismissNotif = (event: CustomEvent<{ id?: string }>) => {
      const targetId = event.detail?.id;
      if (!targetId || (currentNotif && String(currentNotif.id) === String(targetId))) {
        setCurrentNotif(null);
        setProgress(100);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      }
    };
    window.addEventListener('elevate-inapp-notification-dismiss' as any, handleDismissNotif);

    return () => {
      window.removeEventListener(ELEVATE_INAPP_NOTIF_EVENT as any, handleInAppNotif);
      window.removeEventListener('elevate-inapp-notification-dismiss' as any, handleDismissNotif);
    };
  }, [currentNotif]);

  // Handle countdown & auto-dismiss
  useEffect(() => {
    if (!currentNotif) return;

    if (isHovered) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    const startTime = Date.now();
    const endTime = startTime + (progress / 100) * DURATION_MS;

    progressIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const pct = (remaining / DURATION_MS) * 100;
      setProgress(pct);

      if (remaining <= 0) {
        clearInterval(progressIntervalRef.current);
        dismissCurrent();
      }
    }, TICK_MS);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [currentNotif, isHovered, dismissCurrent]);

  const handleActionClick = () => {
    if (!currentNotif) return;

    // Execute custom onClick if provided
    if (currentNotif.onClick) {
      currentNotif.onClick();
    } else if (currentNotif.targetLectureId && currentNotif.targetBatchId && onOpenBatchLecture) {
      onOpenBatchLecture(
        currentNotif.targetBatchId,
        currentNotif.targetChapterId || null,
        currentNotif.targetLectureId
      );
    } else if (currentNotif.targetTestId && onOpenTest) {
      onOpenTest(currentNotif.targetTestId);
    } else if (currentNotif.targetBatchId && onOpenBatch) {
      onOpenBatch(currentNotif.targetBatchId);
    } else if (onNavigateTab) {
      onNavigateTab('notifications');
    }

    dismissCurrent();
  };

  const getCategoryIcon = () => {
    switch (currentNotif?.category) {
      case 'lecture':
        return <PlayCircle className="w-5 h-5 text-indigo-500 shrink-0" />;
      case 'test':
        return <BookOpen className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'ai':
        return <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />;
      default:
        return <Bell className="w-5 h-5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />;
    }
  };

  const getCategoryBadge = () => {
    switch (currentNotif?.category) {
      case 'lecture':
        return 'Video Lecture';
      case 'test':
        return 'Mock Test';
      case 'ai':
        return 'Theta AI';
      default:
        return 'Announcement';
    }
  };

  return (
    <AnimatePresence>
      {currentNotif && (
        <motion.div
          key={String(currentNotif.id || currentNotif.title)}
          initial={{ opacity: 0, y: -25, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          id="web-app-notification-popup"
          className="fixed top-4 right-4 sm:right-6 z-[99999] w-[calc(100vw-2rem)] sm:w-[410px] bg-white dark:bg-[#1e1f20] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.55)] border border-slate-200/90 dark:border-zinc-800 overflow-hidden text-[#1f1f1f] dark:text-[#e3e3e3] select-none"
        >
          {/* Header Row */}
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                {getCategoryIcon()}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa] truncate">
                {getCategoryBadge()}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">•</span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium shrink-0">
                Just now
              </span>
            </div>

            <button
              type="button"
              id="dismiss-inapp-notif-btn"
              onClick={dismissCurrent}
              aria-label="Dismiss notification"
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="px-4 pb-3">
            <h4 className="text-sm font-semibold text-[#1f1f1f] dark:text-white line-clamp-2 leading-snug">
              {currentNotif.title}
            </h4>
            {currentNotif.body && (
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                {currentNotif.body}
              </p>
            )}
          </div>

          {/* Action Row */}
          <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-white/[0.03] border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              {isHovered ? 'Paused' : 'Click to view'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="view-inapp-notif-btn"
                onClick={handleActionClick}
                className="px-3.5 py-1.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <span>{currentNotif.actionLabel || 'View'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Dynamic Progress Countdown Bar */}
          <div className="w-full h-1 bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
