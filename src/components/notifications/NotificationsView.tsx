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
    <div className="min-h-screen bg-transparent text-[#1f1f1f] dark:text-[#e3e3e3] pb-24 md:pb-16 select-none">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        
        {/* Top Minimal Transparent Header */}
        <div className="flex items-center justify-between gap-3 pt-1 pb-1">
          <div className="flex items-center space-x-2">
            <button
              id="notifications-back-btn"
              type="button"
              onClick={onBack}
              title="Back"
              aria-label="Back"
              className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 border-none bg-transparent cursor-pointer shrink-0 outline-none"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f1f1f] dark:text-[#e3e3e3]">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" />
              )}
            </div>
          </div>

          {/* Clean Action Shortcuts */}
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                id="notifications-mark-all-read-btn"
                onClick={markAllNotificationsAsRead}
                className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline px-2.5 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition border-none bg-transparent cursor-pointer outline-none"
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
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10 transition border-none bg-transparent cursor-pointer outline-none"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                id="notifications-reset-defaults-btn"
                onClick={resetDefaultNotifications}
                title="Restore default feed"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-[#0b57d0] hover:bg-black/5 dark:hover:bg-white/10 transition border-none bg-transparent cursor-pointer outline-none"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Minimal Transparent Filter Segment */}
        <div className="flex items-center space-x-1 border-none pb-1">
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
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center space-x-1.5 border-none outline-none cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-black/8 dark:bg-white/15 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/4 dark:hover:bg-white/5 bg-transparent'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Pure Minimal Plain Notifications List */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            {filteredNotifications.map((notif) => {
              const meta = getCategoryMeta(notif.category);
              const IconComp = meta.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`group relative p-3 sm:p-3.5 rounded-2xl transition-all duration-150 cursor-pointer border-none flex items-start gap-3 ${
                    !notif.read
                      ? 'bg-white/80 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.09] shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
                      : 'bg-transparent hover:bg-black/4 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Subtle Monochrome Icon */}
                  <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-300 shrink-0 mt-0.5">
                    <IconComp className="w-4 h-4 stroke-[2]" />
                  </div>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 font-medium">
                      <span>{meta.label}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(notif.timestamp)}</span>
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] ml-0.5" />
                      )}
                    </div>

                    <h3 className={`text-[13px] sm:text-sm font-semibold tracking-tight leading-snug mt-0.5 ${
                      !notif.read ? 'text-slate-900 dark:text-zinc-100 font-bold' : 'text-slate-700 dark:text-zinc-300'
                    }`}>
                      {notif.title}
                    </h3>

                    <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mt-0.5 font-normal line-clamp-2">
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
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10 transition border-none bg-transparent cursor-pointer"
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
          /* Pure Minimal Empty State */
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
