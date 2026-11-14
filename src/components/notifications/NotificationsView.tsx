import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  BellOff,
  ArrowLeft,
  CheckCheck,
  Trash2,
  PlayCircle,
  BookOpen,
  Sparkles,
  FileText,
  ShieldCheck,
  X,
  ExternalLink,
  ChevronRight,
  Filter,
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
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'lecture' | 'test' | 'ai' | 'notes' | 'system'>('all');

  // Sync state on notifications update
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
      if (diffMins < 60) return `${diffMins} mins ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const handleActionClick = (notification: AppNotification) => {
    markNotificationAsRead(notification.id);
    if (notification.actionTab) {
      onNavigateTab(notification.actionTab);
    }
  };

  const getCategoryConfig = (category: AppNotification['category']) => {
    switch (category) {
      case 'lecture':
        return {
          icon: PlayCircle,
          label: 'Video Course',
          containerClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
          badgeClass: 'text-purple-700 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
        };
      case 'test':
        return {
          icon: BookOpen,
          label: 'Practice Test',
          containerClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          badgeClass: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40',
        };
      case 'ai':
        return {
          icon: Sparkles,
          label: 'Theta AI',
          containerClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
          badgeClass: 'text-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800/40',
        };
      case 'notes':
        return {
          icon: FileText,
          label: 'Notes Studio',
          containerClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
          badgeClass: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/40',
        };
      case 'system':
      default:
        return {
          icon: ShieldCheck,
          label: 'System Update',
          containerClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          badgeClass: 'text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] pb-24 md:pb-16 transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        
        {/* Top Header with Standardized Back Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-300/60 dark:border-zinc-800">
          <div className="flex items-center space-x-3">
            <button
              id="notifications-back-btn"
              type="button"
              onClick={onBack}
              title="Back"
              aria-label="Back"
              className="w-10 h-10 rounded-full bg-white dark:bg-[#1e2024] hover:bg-slate-100 dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 shadow-[0_2px_6px_rgba(0,0,0,0.06)] border border-slate-200 dark:border-zinc-700/80 cursor-pointer shrink-0 outline-none"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Notifications
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[11px] font-bold font-mono shadow-xs">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-medium mt-0.5">
                Curriculum updates, live assessments, formula releases & study reminders.
              </p>
            </div>
          </div>

          {/* Action Buttons: Mark all read / Clear */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                id="notifications-mark-all-read-btn"
                onClick={markAllNotificationsAsRead}
                className="h-9 px-3 sm:px-4 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold shadow-xs border border-slate-200 dark:border-zinc-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none shrink-0"
              >
                <CheckCheck className="w-4 h-4 stroke-[2.2]" />
                <span>Mark all read</span>
              </button>
            )}

            {notifications.length > 0 ? (
              <button
                type="button"
                id="notifications-clear-all-btn"
                onClick={clearAllNotifications}
                className="h-9 px-3 rounded-full bg-white hover:bg-rose-50 dark:bg-[#1e2024] dark:hover:bg-rose-950/20 text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 text-xs font-bold shadow-xs border border-slate-200 dark:border-zinc-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none shrink-0"
                title="Clear all notifications"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            ) : (
              <button
                type="button"
                id="notifications-reset-defaults-btn"
                onClick={resetDefaultNotifications}
                className="h-9 px-3 rounded-full bg-white hover:bg-slate-50 dark:bg-[#1e2024] dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-bold shadow-xs border border-slate-200 dark:border-zinc-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none shrink-0"
              >
                <span>Reset demo feed</span>
              </button>
            )}
          </div>
        </div>

        {/* Material 3 Segmented Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All', count: notifications.length },
            { id: 'unread', label: 'Unread', count: unreadCount },
            { id: 'lecture', label: 'Courses', count: notifications.filter((n) => n.category === 'lecture').length },
            { id: 'test', label: 'Mock Tests', count: notifications.filter((n) => n.category === 'test').length },
            { id: 'ai', label: 'Theta AI', count: notifications.filter((n) => n.category === 'ai').length },
            { id: 'notes', label: 'Notes', count: notifications.filter((n) => n.category === 'notes').length },
            { id: 'system', label: 'System', count: notifications.filter((n) => n.category === 'system').length },
          ].map((chip) => {
            const isSelected = selectedFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedFilter(chip.id as any)}
                className={`h-8 px-3 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 border shrink-0 outline-none cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-xs'
                    : 'bg-white dark:bg-[#1e2024] text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                <span>{chip.label}</span>
                {chip.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notifications Feed */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => {
              const cfg = getCategoryConfig(notif.category);
              const IconComponent = cfg.icon;

              return (
                <div
                  key={notif.id}
                  className={`group relative rounded-2xl p-4 sm:p-5 transition-all duration-200 border ${
                    !notif.read
                      ? 'bg-white dark:bg-[#1e2024] border-[#0b57d0]/30 dark:border-[#a8c7fa]/30 shadow-[0_4px_16px_rgba(11,87,208,0.08)] ring-1 ring-[#0b57d0]/15 dark:ring-[#a8c7fa]/15'
                      : 'bg-white/85 dark:bg-[#1e2024]/85 border-slate-200/80 dark:border-zinc-800/80 shadow-xs hover:shadow-md hover:bg-white dark:hover:bg-[#1e2024]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Category Icon Badge */}
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${cfg.containerClass} shadow-xs`}
                    >
                      <IconComponent className="w-5 h-5 stroke-[2.2]" />
                    </div>

                    {/* Middle Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${cfg.badgeClass}`}
                          >
                            {cfg.label}
                          </span>
                          {!notif.read && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                              <span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] animate-pulse" />
                              New
                            </span>
                          )}
                        </div>

                        {/* Relative Timestamp */}
                        <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                          {formatRelativeTime(notif.timestamp)}
                        </span>
                      </div>

                      <h3
                        className={`text-sm sm:text-base font-bold leading-snug tracking-tight ${
                          !notif.read
                            ? 'text-slate-900 dark:text-zinc-50'
                            : 'text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        {notif.title}
                      </h3>

                      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-zinc-400 leading-relaxed font-normal">
                        {notif.message}
                      </p>

                      {/* Action CTA & Action Row */}
                      <div className="flex items-center justify-between pt-2.5">
                        {notif.actionTab ? (
                          <button
                            type="button"
                            onClick={() => handleActionClick(notif)}
                            className="h-8 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold shadow-xs border-0 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none"
                          >
                            <span>{notif.actionLabel || 'View'}</span>
                            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        ) : (
                          <div />
                        )}

                        <div className="flex items-center gap-1">
                          {!notif.read && (
                            <button
                              type="button"
                              onClick={() => markNotificationAsRead(notif.id)}
                              className="text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer border-none bg-transparent"
                              title="Mark as read"
                            >
                              Mark read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteNotification(notif.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer border-none bg-transparent"
                            title="Dismiss notification"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Delightful Material 3 Empty State */
          <div className="bg-white dark:bg-[#1e2024] rounded-3xl p-8 sm:p-12 text-center border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-100 dark:bg-zinc-800/60 text-slate-400 dark:text-zinc-500 mx-auto flex items-center justify-center shadow-inner">
              <BellOff className="w-8 h-8 sm:w-10 sm:h-10 stroke-[1.8]" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                All Caught Up!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                {selectedFilter === 'unread'
                  ? 'You have zero unread notifications. Check the other tabs or explore courses!'
                  : 'No notifications in this category. We will notify you when new tests or video lectures become available.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab('batches')}
                className="h-9 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold shadow-xs border-0 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Explore Courses</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('tests')}
                className="h-9 px-4 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold shadow-xs border-0 flex items-center gap-1.5 transition active:scale-95 cursor-pointer outline-none"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Practice Tests</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
