import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  ArrowLeft,
  Trash2,
  PlayCircle,
  BookOpen,
  Sparkles,
  FileText,
  ShieldCheck,
  X,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { type ActiveTab } from '../../types';
import {
  type AppNotification,
  deriveRealBatchNotifications,
  markNotificationIdAsRead,
  markAllNotificationIdsAsRead,
  dismissNotificationId,
  clearAllNotificationIds,
  resetDismissedNotifications,
  NOTIFICATIONS_EVENT,
} from '../../lib/notifications';
import { useBackHandler } from '../../hooks/useBackNavigation';
import { useApp } from '../../lms/LmsContext';
import { isMasterUser } from '../../lib/masterAccount';

interface NotificationsViewProps {
  onBack: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenBatchLecture?: (batchId: string, chapterId: string | null, lectureId: string) => void;
  onOpenBatch?: (batchId: string) => void;
  onOpenTest?: (testId: string) => void;
  isDarkMode?: boolean;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onBack,
  onNavigateTab,
  onOpenBatchLecture,
  onOpenBatch,
  onOpenTest,
}) => {
  const { user, batches, lectures, chapters, announcements, batchTests, isEnrolled } = useApp();
  const [readVersion, setReadVersion] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'lecture' | 'test'>('all');

  const isMaster = user?.role === 'admin' || (user?.role as string) === 'superadmin' || isMasterUser(user);
  const enrolledBatches = useMemo(() => batches.filter((b) => isEnrolled(b.id)), [batches, isEnrolled]);
  const enrolledBatchIds = useMemo(() => enrolledBatches.map((b) => b.id), [enrolledBatches]);

  // Real-time synchronization on read/dismissed event
  useEffect(() => {
    const handleUpdate = () => {
      setReadVersion((v) => v + 1);
    };
    window.addEventListener(NOTIFICATIONS_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Standardized Back Handler
  useBackHandler({
    isOpen: true,
    priority: 30,
    id: 'notifications_view_back',
    onBack,
  });

  // Derive authentic batch notifications directly from real curriculum data (strictly filtered by user's enrolled batches)
  const notifications = useMemo(() => {
    return deriveRealBatchNotifications({
      batches,
      lectures,
      chapters,
      announcements,
      batchTests,
      enrolledBatchIds,
      isMaster,
    });
  }, [batches, lectures, chapters, announcements, batchTests, enrolledBatchIds, isMaster, readVersion]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (selectedFilter === 'unread') return !n.read;
      if (selectedFilter === 'all') return true;
      return n.category === selectedFilter;
    });
  }, [notifications, selectedFilter]);

  const formatRelativeTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return 'Recently';

      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const handleItemClick = (notification: AppNotification) => {
    markNotificationIdAsRead(notification.id);

    // If it's a real lecture in a batch, open it directly!
    if (notification.targetLectureId && notification.targetBatchId && onOpenBatchLecture) {
      onOpenBatchLecture(
        notification.targetBatchId,
        notification.targetChapterId || null,
        notification.targetLectureId
      );
      return;
    }

    // If it's a real batch test
    if (notification.targetTestId && onOpenTest) {
      onOpenTest(notification.targetTestId);
      return;
    }

    // If it's a batch announcement or batch
    if (notification.targetBatchId && onOpenBatch) {
      onOpenBatch(notification.targetBatchId);
      return;
    }

    // Fallback tab navigation
    if (notification.actionTab) {
      onNavigateTab(notification.actionTab);
    }
  };

  const getCategoryMeta = (category: AppNotification['category']) => {
    switch (category) {
      case 'lecture':
        return {
          icon: PlayCircle,
          label: 'Course Lecture',
          badgeBg: 'bg-blue-50 dark:bg-blue-950/40 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'test':
        return {
          icon: BookOpen,
          label: 'Mock Test',
          badgeBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300',
        };
      case 'ai':
        return {
          icon: Sparkles,
          label: 'Theta AI',
          badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300',
        };
      case 'notes':
        return {
          icon: FileText,
          label: 'Study Notes',
          badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300',
        };
      case 'system':
      default:
        return {
          icon: ShieldCheck,
          label: 'Batch Update',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300',
        };
    }
  };

  return (
    <div className="w-full min-h-full bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] select-none">
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-4">
        
        {/* Top Header Matching App UI */}
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center space-x-2.5">
            <button
              id="notifications-back-btn"
              type="button"
              onClick={onBack}
              title="Back"
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 cursor-pointer shrink-0 outline-none md:hidden desktop-hide-back-btn"
              data-desktop-hide-back="true"
            >
              <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f1f1f] dark:text-[#e3e3e3]">
                Batch Updates & Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[11px] font-mono font-bold shadow-xs">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>

          {/* Action Shortcuts */}
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                id="notifications-mark-all-read-btn"
                onClick={() => markAllNotificationIdsAsRead(notifications.map((n) => n.id))}
                className="h-8.5 px-3.5 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 transition active:scale-95 cursor-pointer outline-none"
              >
                Mark all read
              </button>
            )}

            {notifications.length > 0 ? (
              <button
                type="button"
                id="notifications-clear-all-btn"
                onClick={() => clearAllNotificationIds(notifications.map((n) => n.id))}
                title="Clear all updates"
                className="w-8.5 h-8.5 rounded-full bg-white hover:bg-rose-50 dark:bg-[#1e2024] dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition active:scale-95 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 cursor-pointer outline-none"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                id="notifications-reset-defaults-btn"
                onClick={resetDismissedNotifications}
                title="Restore cleared updates"
                className="w-8.5 h-8.5 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-slate-500 hover:text-[#0b57d0] flex items-center justify-center transition active:scale-95 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 cursor-pointer outline-none"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Minimal Segmented Filter Tabs */}
        <div className="flex items-center space-x-2 border-none pb-0.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread', count: unreadCount },
            { id: 'lecture', label: 'Lectures' },
            { id: 'test', label: 'Tests' },
          ].map((tab) => {
            const isSelected = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`h-8.5 px-4 rounded-full text-xs font-semibold transition-all flex items-center space-x-2 outline-none cursor-pointer active:scale-95 border-0 ${
                  isSelected
                    ? 'bg-[#0b57d0] text-white font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                    : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-zinc-800 text-[#0b57d0] dark:text-[#a8c7fa]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Real Batch Updates Feed - App Matched Elevated Cards Without Rings */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3 pt-1">
            {filteredNotifications.map((notif) => {
              const meta = getCategoryMeta(notif.category);
              const IconComp = meta.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`group relative p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] border-0 transition-all duration-200 cursor-pointer flex items-start gap-3.5 sm:gap-4`}
                >
                  {/* Category Icon Badge */}
                  <div className={`w-10 h-10 rounded-2xl ${meta.badgeBg} flex items-center justify-center shrink-0 mt-0.5 border-0 shadow-2xs`}>
                    <IconComp className="w-5 h-5 stroke-[2]" />
                  </div>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-400 font-medium">
                      <span className="font-semibold text-slate-600 dark:text-zinc-300">{meta.label}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(notif.timestamp)}</span>
                      {!notif.read && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 text-[#0b57d0] dark:text-[#a8c7fa] text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" />
                          New
                        </span>
                      )}
                    </div>

                    <h3 className={`text-sm sm:text-[15px] tracking-tight leading-snug mt-1 ${
                      !notif.read ? 'text-slate-900 dark:text-zinc-100 font-bold' : 'text-slate-700 dark:text-zinc-300 font-semibold'
                    }`}>
                      {notif.title}
                    </h3>

                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-1 font-normal line-clamp-2">
                      {notif.message}
                    </p>
                  </div>

                  {/* Right Action Affordance */}
                  <div className="flex items-center gap-1 shrink-0 self-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissNotificationId(notif.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition border-0 bg-transparent cursor-pointer"
                      title="Dismiss"
                      aria-label="Dismiss notification"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 dark:text-zinc-600 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition">
                      <ChevronRight className="w-4.5 h-4.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Clean Empty State */
          <div className="py-24 text-center space-y-3 border-0 bg-white dark:bg-[#1e2024] rounded-[24px] shadow-[0_2px_6px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            <div className="w-12 h-12 rounded-full bg-[#f0f4f9] dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500">
              <Bell className="w-6 h-6 stroke-[1.8]" />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">
              {selectedFilter === 'unread' ? 'No unread updates' : 'No batch updates yet'}
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs mx-auto">
              When new curriculum lectures, batch announcements, or mock tests are scheduled, they will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
