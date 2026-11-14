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
  getStoredNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  resetDefaultNotifications,
  NOTIFICATIONS_EVENT,
} from '../../lib/notifications';
import { useBackHandler } from '../../hooks/useBackNavigation';

interface NotificationsViewProps {
  onBack: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
  isDarkMode?: boolean;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onBack,
  onNavigateTab,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(getStoredNotifications);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'lecture' | 'test'>('all');

  // Real-time synchronization
  useEffect(() => {
    const handleUpdate = () => {
      setNotifications(getStoredNotifications());
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
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const handleItemClick = (notification: AppNotification) => {
    markNotificationAsRead(notification.id);
    if (notification.actionTab) {
      onNavigateTab(notification.actionTab);
    }
  };

  const getCategoryMeta = (category: AppNotification['category']) => {
    switch (category) {
      case 'lecture':
        return { icon: PlayCircle, label: 'Course' };
      case 'test':
        return { icon: BookOpen, label: 'Mock Test' };
      case 'ai':
        return { icon: Sparkles, label: 'Theta AI' };
      case 'notes':
        return { icon: FileText, label: 'Notes' };
      case 'system':
      default:
        return { icon: ShieldCheck, label: 'Update' };
    }
  };

  return (
    <div className="w-full min-h-full bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] select-none">
      <div className="max-w-3xl mx-auto px-3.5 sm:px-6 py-3 sm:py-5 space-y-3.5">
        
        {/* Top Header Matching App UI */}
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center space-x-2.5">
            <button
              id="notifications-back-btn"
              type="button"
              onClick={onBack}
              title="Back"
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 shadow-xs border border-slate-200/80 dark:border-zinc-800 cursor-pointer shrink-0 outline-none"
            >
              <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f1f1f] dark:text-[#e3e3e3]">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[11px] font-mono font-bold shadow-xs">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>

          {/* Action Shortcuts */}
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                id="notifications-mark-all-read-btn"
                onClick={markAllNotificationsAsRead}
                className="h-8 px-3 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] shadow-2xs border border-slate-200/80 dark:border-zinc-800 transition active:scale-95 cursor-pointer outline-none"
              >
                Mark all read
              </button>
            )}

            {notifications.length > 0 ? (
              <button
                type="button"
                id="notifications-clear-all-btn"
                onClick={clearAllNotifications}
                title="Clear all notifications"
                className="w-8 h-8 rounded-full bg-white hover:bg-rose-50 dark:bg-[#1e2024] dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition active:scale-95 shadow-2xs border border-slate-200/80 dark:border-zinc-800 cursor-pointer outline-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                id="notifications-reset-defaults-btn"
                onClick={resetDefaultNotifications}
                title="Restore default feed"
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-slate-500 hover:text-[#0b57d0] flex items-center justify-center transition active:scale-95 shadow-2xs border border-slate-200/80 dark:border-zinc-800 cursor-pointer outline-none"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Minimal Segmented Filter Tabs */}
        <div className="flex items-center space-x-1.5 border-none pb-0.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread', count: unreadCount },
            { id: 'lecture', label: 'Courses' },
            { id: 'test', label: 'Tests' },
          ].map((tab) => {
            const isSelected = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center space-x-1.5 outline-none cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-[#0b57d0] text-white font-bold shadow-xs border-0'
                    : 'bg-white/80 dark:bg-[#1e2024]/80 hover:bg-white dark:hover:bg-[#1e2024] text-slate-600 dark:text-zinc-300 border border-slate-200/60 dark:border-zinc-800/60 shadow-2xs'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
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

        {/* Consistent Material 3 Cards Feed */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-2 pt-0.5">
            {filteredNotifications.map((notif) => {
              const meta = getCategoryMeta(notif.category);
              const IconComp = meta.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`group relative p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#1e2024] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border border-slate-200/80 dark:border-zinc-800/80 hover:shadow-md transition-all cursor-pointer flex items-start gap-3.5 ${
                    !notif.read ? 'ring-1 ring-[#0b57d0]/30 dark:ring-[#a8c7fa]/30' : ''
                  }`}
                >
                  {/* Subtle Icon Badge */}
                  <div className="w-9 h-9 rounded-xl bg-[#e5e9f0] dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
                    <IconComp className="w-4.5 h-4.5 stroke-[2]" />
                  </div>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-400 font-medium">
                      <span className="font-semibold text-slate-500 dark:text-zinc-300">{meta.label}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(notif.timestamp)}</span>
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] ml-0.5" />
                      )}
                    </div>

                    <h3 className={`text-sm sm:text-[14.5px] font-bold tracking-tight leading-snug mt-0.5 ${
                      !notif.read ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-700 dark:text-zinc-300 font-semibold'
                    }`}>
                      {notif.title}
                    </h3>

                    <p className="text-xs sm:text-[12.5px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5 font-normal line-clamp-2">
                      {notif.message}
                    </p>
                  </div>

                  {/* Right Action Affordance */}
                  <div className="flex items-center gap-1 shrink-0 self-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition border-none bg-transparent cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-zinc-600 group-hover:text-slate-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Clean Empty State */
          <div className="py-20 text-center space-y-2 border-none">
            <Bell className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
              {selectedFilter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
