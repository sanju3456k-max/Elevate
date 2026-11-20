import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  ChevronLeft,
  Trash2,
  PlayCircle,
  BookOpen,
  Sparkles,
  FileText,
  ShieldCheck,
  X,
  ChevronRight,
  RotateCcw,
  CheckCheck,
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
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'test':
        return {
          icon: BookOpen,
          label: 'Mock Test',
          badgeBg: 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300',
        };
      case 'ai':
        return {
          icon: Sparkles,
          label: 'Theta AI',
          badgeBg: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300',
        };
      case 'notes':
        return {
          icon: FileText,
          label: 'Study Notes',
          badgeBg: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300',
        };
      case 'system':
      default:
        return {
          icon: ShieldCheck,
          label: 'Batch Update',
          badgeBg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300',
        };
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All', icon: Sparkles },
    { id: 'unread', label: 'Unread', icon: Bell, count: unreadCount },
    { id: 'lecture', label: 'Lectures', icon: PlayCircle },
    { id: 'test', label: 'Tests', icon: BookOpen },
  ];

  return (
    <div className="w-full min-h-screen bg-white dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] select-none flex flex-col">
      {/* Fixed Sticky Header without any partial line or border - Transparent/Pure White */}
      <header className="sticky top-0 z-30 bg-white dark:bg-[#0b0c10] border-0 border-none shadow-none pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+1.2rem)] md:pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+1.2rem)] pb-3 px-3.5 sm:px-6 transition-colors">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Top Row: Back Arrow, Title, Count, Actions */}
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center space-x-2">
              <button
                id="notifications-back-btn"
                type="button"
                onClick={onBack}
                title="Back"
                aria-label="Back"
                className="p-1.5 -ml-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#1f1f1f] dark:text-[#e3e3e3] border-none bg-transparent cursor-pointer flex items-center justify-center transition active:scale-95 shrink-0"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
              </button>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1f1f1f] dark:text-white">
                  Updates
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-xs font-mono font-bold shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Action Header: Mark All as Read (Delete button removed so users cannot mistakenly delete updates) */}
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  id="notifications-mark-all-read-btn"
                  onClick={() => markAllNotificationIdsAsRead(notifications.map((n) => n.id))}
                  title="Mark all updates as read"
                  aria-label="Mark all updates as read"
                  className="h-8 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold transition active:scale-95 cursor-pointer outline-none border-0 flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCheck className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                  <span>Mark All as Read</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs using the Official Solid Blue Active Toggle of App UI with Round Pill Shape */}
          <div className="flex items-center space-x-1.5 border-none pb-0.5 overflow-x-auto scrollbar-none">
            {filterTabs.map((tab) => {
              const isSelected = selectedFilter === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedFilter(tab.id as any)}
                  className={`h-8 px-4 rounded-full text-xs transition-all flex items-center space-x-1.5 outline-none cursor-pointer active:scale-95 border-0 ${
                    isSelected
                      ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#062e6f] font-bold shadow-xs'
                      : 'bg-transparent text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 font-semibold'
                  }`}
                >
                  <TabIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        isSelected
                          ? 'bg-white/25 dark:bg-[#062e6f]/25 text-white dark:text-[#062e6f]'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Scrollable Notification List Messages Body */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 pb-28 sm:pb-28 md:pb-16 pt-1">

        {/* Real Batch Updates Feed - Transparent Cards with Optimized Full Width & Round Icons */}
        {filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 pt-1">
            {filteredNotifications.map((notif) => {
              const meta = getCategoryMeta(notif.category);
              const IconComp = meta.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className="group relative p-3 sm:p-3.5 rounded-2xl bg-transparent dark:bg-transparent hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 border-0 transition-all duration-150 cursor-pointer flex items-start gap-3 sm:gap-3.5"
                >
                  {/* Category Icon Badge with Round Icon Shape */}
                  <div className={`w-10 h-10 rounded-full ${meta.badgeBg} flex items-center justify-center shrink-0 mt-0.5 border-0 shadow-2xs`}>
                    <IconComp className="w-5 h-5 stroke-[2.2]" />
                  </div>

                  {/* Middle Content - Maximized Width to Fill Empty Space */}
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold text-slate-900 dark:text-zinc-100 text-[11px] sm:text-xs uppercase tracking-wide">
                        {meta.label}
                      </span>
                      {!notif.read && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[10px] font-bold shadow-xs shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#041e49]" />
                          New
                        </span>
                      )}
                    </div>

                    <h3 className={`text-sm sm:text-base tracking-tight leading-snug mt-1 font-bold ${
                      !notif.read ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-zinc-200'
                    }`}>
                      {notif.title}
                    </h3>

                    <p className="text-xs sm:text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed mt-0.5 font-normal line-clamp-2">
                      {notif.message}
                    </p>

                    {/* Action Pill Chip utilizing horizontal space */}
                    {notif.actionLabel && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 px-3 py-1 rounded-full group-hover:bg-[#0b57d0] group-hover:text-white dark:group-hover:bg-[#a8c7fa] dark:group-hover:text-[#062e6f] transition-all">
                          {notif.actionLabel}
                          <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Far Right Column: Time tag shifted completely rightwards to top-right edge, Chevron at bottom-right */}
                  <div className="flex flex-col items-end justify-between shrink-0 self-stretch pt-0.5 pl-1.5">
                    <span className="text-slate-600 dark:text-zinc-400 font-bold text-[11px] sm:text-xs whitespace-nowrap text-right">
                      {formatRelativeTime(notif.timestamp)}
                    </span>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 dark:text-zinc-500 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition mt-auto">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Clean Empty State */
          <div className="py-24 text-center space-y-3 bg-transparent border-0 shadow-none">
            <div className="w-12 h-12 rounded-full bg-[#f0f4f9] dark:bg-zinc-800/80 flex items-center justify-center mx-auto text-slate-500 dark:text-zinc-400">
              <Bell className="w-6 h-6 stroke-[2]" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">
              {selectedFilter === 'unread' ? 'No unread updates' : 'No batch updates yet'}
            </p>
            <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-xs mx-auto font-medium">
              When new curriculum lectures, batch announcements, or mock tests are scheduled, they will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
