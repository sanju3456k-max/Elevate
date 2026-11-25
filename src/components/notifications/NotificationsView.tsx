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
  Check,
  Megaphone,
  Plus,
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
import {
  getDeviceNotificationPermission,
  getDeviceNotificationPermissionSync,
  requestDeviceNotificationPermission,
  sendDeviceNotification,
} from '../../lib/deviceNotificationService';
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
  isDrawer?: boolean;
  onOpenCreatePost?: () => void;
}

interface ParsedLocation {
  batch: string;
  folders: string[];
  duration?: string;
  details?: string;
  rawFallback?: string;
}

function cleanBatchName(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const match = trimmed.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    const inside = match[1].trim();
    const rest = match[2].trim();
    return (!rest || rest.toLowerCase() === inside.toLowerCase()) ? inside : rest;
  }
  return trimmed.replace(/^\[(.*?)\]$/, '$1').trim();
}

function parseLocation(notif: AppNotification): ParsedLocation {
  const prefixRegex = /^(?:Course\s+Lecture|Lecture|Mock\s+Test|Test|Course)\b\s*[:•-]?\s*/i;

  let batch = cleanBatchName(notif.batchTitle || '');
  // Only blank out batch if it's purely one of the generic placeholder words
  if (/^(?:Lecture|Course|Test|Mock Test)$/i.test(batch)) {
    batch = '';
  } else if (/^(?:Course\s+Lecture|Lecture|Mock\s+Test|Course)\b\s*[:•-]/i.test(batch)) {
    batch = cleanBatchName(batch.replace(prefixRegex, '').trim());
  }

  if (batch) {
    const rawFolders = (
      notif.folderSegments && notif.folderSegments.length > 0
        ? notif.folderSegments
        : notif.folderPath
        ? notif.folderPath.split('.').filter(Boolean)
        : []
    );
    const folders = rawFolders
      .map(f => (/^(?:Lecture|Course)\b\s*[:•-]/i.test(f) ? f.replace(prefixRegex, '').trim() : f.trim()))
      .filter(f => Boolean(f) && !/^(?:Lecture|Course|Mock\s+Test|Test)$/i.test(f));

    return {
      batch,
      folders,
      duration: notif.durationText,
      details: notif.testDetails,
    };
  }

  // Fallback: parse raw message
  let raw = (notif.message || '').trim();
  raw = raw.replace(/^(?:Available\s+in|Scheduled\s+in|In)\s+/i, '');
  while (/^(?:Course\s+Lecture|Lecture|Mock\s+Test|Test|Course)\b\s*[:•-]?\s*/i.test(raw)) {
    raw = raw.replace(/^(?:Course\s+Lecture|Lecture|Mock\s+Test|Test|Course)\b\s*[:•-]?\s*/i, '').trim();
  }

  let duration: string | undefined;
  const durationMatch = raw.match(/\((\d+\s*(?:mins?|m|hours?|h))\)/i);
  if (durationMatch) {
    duration = durationMatch[0];
    raw = raw.replace(durationMatch[0], '').trim();
  }

  let details: string | undefined;
  const testDetailsMatch = raw.match(/[•\s]+(\d+\s*Questions?.*)$/i);
  if (testDetailsMatch) {
    details = testDetailsMatch[1].trim();
    raw = raw.replace(testDetailsMatch[0], '').trim();
  }

  let rawSegments: string[] = [];
  if (raw.includes('•')) {
    rawSegments = raw.split('•').flatMap(s => s.includes('.') ? s.split('.') : s).map(s => s.trim()).filter(Boolean);
  } else if (raw.includes('.')) {
    rawSegments = raw.split('.').map(s => s.trim()).filter(Boolean);
  } else if (raw.includes('/')) {
    rawSegments = raw.split('/').map(s => s.trim()).filter(Boolean);
  } else if (raw) {
    rawSegments = [raw];
  }

  const cleanSegments = rawSegments
    .map(s => s.replace(prefixRegex, '').trim())
    .filter(s => Boolean(s) && !/^(?:Lecture|Course|Mock\s+Test|Test)$/i.test(s));

  if (cleanSegments.length > 0) {
    return {
      batch: cleanBatchName(cleanSegments[0]),
      folders: cleanSegments.slice(1),
      duration,
      details,
    };
  }

  return {
    batch: '',
    folders: [],
    rawFallback: notif.message,
  };
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onBack,
  onNavigateTab,
  onOpenBatchLecture,
  onOpenBatch,
  onOpenTest,
  isDrawer = false,
  onOpenCreatePost,
}) => {
  const { user, batches, lectures, chapters, announcements, batchTests, isEnrolled, deleteAnnouncement } = useApp();
  const [readVersion, setReadVersion] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'lecture' | 'test' | 'post'>('all');
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default'>(() => {
    return getDeviceNotificationPermissionSync();
  });
  const [hasCheckedPermission, setHasCheckedPermission] = useState<boolean>(() => {
    return getDeviceNotificationPermissionSync() === 'granted';
  });
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getDeviceNotificationPermission().then((status) => {
      if (isMounted) {
        setNotifPermission(status);
        setHasCheckedPermission(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleEnableNotifications = async () => {
    setIsRequestingPermission(true);
    try {
      const granted = await requestDeviceNotificationPermission();
      if (granted) {
        setNotifPermission('granted');
        await sendDeviceNotification({
          title: 'Elevate Updates Enabled',
          body: 'You will receive instant alerts for new curriculum lectures, mock tests, and announcements.',
          id: 101,
        });
        showToast('Notifications enabled on your device!');
      } else {
        setNotifPermission('denied');
        showToast('Notification permission was not granted.');
      }
    } catch (err) {
      console.warn('Failed to enable notifications:', err);
    } finally {
      setIsRequestingPermission(false);
    }
  };

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
    priority: isDrawer ? 45 : 30,
    id: isDrawer ? 'notifications_drawer_back' : 'notifications_view_back',
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
      if (isDrawer) onBack();
      return;
    }

    // If it's a real batch test
    if (notification.targetTestId && onOpenTest) {
      onOpenTest(notification.targetTestId);
      if (isDrawer) onBack();
      return;
    }

    // If it's a batch announcement or batch
    if (notification.targetBatchId && onOpenBatch) {
      onOpenBatch(notification.targetBatchId);
      if (isDrawer) onBack();
      return;
    }

    // Fallback tab navigation
    if (notification.actionTab) {
      onNavigateTab(notification.actionTab);
      if (isDrawer) onBack();
    }
  };

  const getCategoryMeta = (category: AppNotification['category']) => {
    switch (category) {
      case 'lecture':
        return {
          icon: PlayCircle,
          label: 'Videos',
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'test':
        return {
          icon: BookOpen,
          label: 'Test',
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'ai':
        return {
          icon: Sparkles,
          label: 'Theta AI',
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'notes':
        return {
          icon: FileText,
          label: 'Study Notes',
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
      case 'post':
        return {
          icon: Megaphone,
          label: 'Post',
          badgeBg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300',
        };
      case 'system':
      default:
        return {
          icon: ShieldCheck,
          label: 'Batch Update',
          badgeBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa]',
        };
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All', icon: Sparkles },
    { id: 'unread', label: 'Unread', icon: Bell, count: unreadCount },
    { id: 'lecture', label: 'Videos', icon: PlayCircle },
    { id: 'test', label: 'Tests', icon: BookOpen },
    { id: 'post', label: 'Posts', icon: Megaphone },
  ];

  return (
    <div className={`w-full ${isDrawer ? 'h-full bg-white dark:bg-[#121316]' : 'h-full min-h-[100dvh] bg-white dark:bg-[#0b0c10]'} text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col overflow-hidden touch-pan-y`}>
      {/* Fixed Sticky Header without any partition line or border */}
      <header className={`sticky top-0 z-30 bg-white dark:bg-[#121316] ${
        isDrawer 
          ? 'border-0 border-none shadow-none p-3 sm:p-4 pb-2.5 space-y-2.5 shrink-0' 
          : 'border-0 border-none shadow-none pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.55rem)] md:pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.6rem)] pb-3 px-2.5 sm:px-6 shrink-0'
      } transition-colors select-none`}>
        <div className={`${isDrawer ? 'w-full space-y-2.5' : 'max-w-4xl mx-auto space-y-3'}`}>
          {/* Top Row: Back Arrow / Bell Icon, Title, Count, Actions */}
          <div className="flex items-center justify-between gap-2.5 pt-0.5">
            <div className="flex items-center space-x-2 min-w-0">
              {!isDrawer ? (
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
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 flex items-center justify-center text-[#0b57d0] dark:text-[#a8c7fa] shrink-0">
                  <Bell className="w-4 h-4 stroke-[2.2]" />
                </div>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <h1 className={`${isDrawer ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'} font-extrabold tracking-tight text-[#1f1f1f] dark:text-white truncate`}>
                  Updates
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-xs font-mono font-bold shadow-xs shrink-0">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Action Header: Allow Notifications, Mark All as Read & Drawer Close Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isMaster && onOpenCreatePost && (
                <button
                  type="button"
                  id="notifications-create-post-btn"
                  onClick={onOpenCreatePost}
                  title="Create Broadcast Post"
                  aria-label="Create Broadcast Post"
                  className="h-7.5 px-3 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold transition cursor-pointer outline-none border-0 flex items-center gap-1.5 shadow-xs select-none"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.8] text-white" />
                  <span className={isDrawer ? 'hidden sm:inline' : ''}>New Post</span>
                </button>
              )}

              {hasCheckedPermission && notifPermission !== 'granted' && (
                <button
                  type="button"
                  id="notifications-allow-btn"
                  onClick={handleEnableNotifications}
                  disabled={isRequestingPermission}
                  title="Allow instant notifications"
                  aria-label="Allow instant notifications"
                  className="h-7.5 px-3 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold transition active:scale-95 cursor-pointer outline-none border-0 flex items-center gap-1.5 shadow-xs"
                >
                  <Bell className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                  <span className={isDrawer ? 'hidden sm:inline' : ''}>{isRequestingPermission ? 'Enabling...' : 'Allow'}</span>
                </button>
              )}

              {unreadCount > 0 && (
                <button
                  type="button"
                  id="notifications-mark-all-read-btn"
                  onClick={() => markAllNotificationIdsAsRead(notifications.map((n) => n.id))}
                  title="Mark all updates as read"
                  aria-label="Mark all updates as read"
                  className="h-7.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold transition active:scale-95 cursor-pointer outline-none border-0 flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                  <span className={isDrawer ? 'hidden sm:inline' : ''}>Mark Read</span>
                </button>
              )}

              {isDrawer && (
                <button
                  type="button"
                  id="notifications-drawer-close-btn"
                  onClick={onBack}
                  title="Close Updates"
                  aria-label="Close Updates"
                  className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 border-none bg-transparent cursor-pointer flex items-center justify-center transition active:scale-95 shrink-0"
                >
                  <X className="w-5 h-5 stroke-[2.2]" />
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
                  className={`h-7.5 sm:h-8 px-3 sm:px-4 rounded-full text-xs transition-all flex items-center space-x-1.5 outline-none cursor-pointer active:scale-95 border-0 shrink-0 ${
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
      <div 
        className={`flex-1 min-h-0 ${isDrawer ? 'w-full px-2.5 sm:px-4 pb-16 pt-1' : 'max-w-4xl w-full mx-auto px-2 sm:px-6 pb-28 sm:pb-28 md:pb-16 pt-1'} overflow-y-auto overscroll-contain touch-pan-y`}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y'
        }}
      >
        {/* Floating Toast Alert */}
        {toastMessage && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900/90 dark:bg-white/95 text-white dark:text-slate-900 text-xs font-bold shadow-lg flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 stroke-[2.5]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Permission Request Prompt Banner if notifications not yet enabled */}
        {hasCheckedPermission && notifPermission !== 'granted' && (
          <div className="mb-3.5 p-3 sm:p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-center justify-between gap-3 transition-all">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 flex items-center justify-center shrink-0 text-[#0b57d0] dark:text-[#a8c7fa]">
                <Bell className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-tight">
                  Allow Real-Time Notifications
                </p>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 truncate">
                  Get instant device alerts for newly published lectures and mock tests.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={isRequestingPermission}
              className="h-7 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold shrink-0 transition active:scale-95 cursor-pointer border-0 shadow-xs"
            >
              {isRequestingPermission ? 'Enabling...' : 'Allow'}
            </button>
          </div>
        )}

        {/* Real Batch Updates Feed - Transparent Cards with Optimized Full Width & Round Icons */}
        {filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 pt-1">
            {filteredNotifications.map((notif) => {
              const meta = getCategoryMeta(notif.category);
              const IconComp = meta.icon;

              let rawTitle = (notif.title || '').trim();
              const bracketMatch = rawTitle.match(/^\[(.*?)\]\s*(.*)$/);
              if (bracketMatch) {
                const inside = bracketMatch[1].trim();
                const rest = bracketMatch[2].trim();
                rawTitle = (!rest || rest.toLowerCase() === inside.toLowerCase()) ? inside : rest;
              }

              const displayTitle = notif.category === 'test'
                ? rawTitle.replace(/^\[?Mock\s+Test\]?\s*[:-]?\s*/i, '').replace(/^Test\s*[:-]?\s*/i, '').trim() || 'Test'
                : notif.category === 'lecture'
                ? rawTitle.replace(/^Course\s+Lecture\s*[:-]?\s*/i, '').replace(/^Lecture\s*[:-]?\s*/i, '').trim() || 'Lecture'
                : rawTitle;

              const loc = parseLocation(notif);

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className="cv-auto-row group relative px-2.5 sm:px-3.5 py-3 rounded-2xl bg-transparent dark:bg-transparent hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 border-0 transition-[background-color,opacity,transform] duration-150 cursor-pointer flex items-start gap-2.5 sm:gap-3.5 touch-manipulation"
                >
                  {/* Category Icon Badge with Round Icon Shape */}
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full ${meta.badgeBg} flex items-center justify-center shrink-0 mt-0.5 border-0 shadow-2xs`}>
                    <IconComp className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
                  </div>

                  {/* Middle Content - Maximized Width to Fill Empty Space */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] text-[11px] sm:text-xs uppercase tracking-wide truncate">
                          {meta.label}
                        </span>
                        {!notif.read && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-[10px] font-bold shadow-xs shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#041e49]" />
                            New
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 dark:text-zinc-400 font-semibold text-[11px] sm:text-xs whitespace-nowrap shrink-0">
                        {formatRelativeTime(notif.timestamp)}
                      </span>
                    </div>

                    <h3 className={`text-sm sm:text-base tracking-tight leading-snug mt-1 font-bold ${
                      !notif.read ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-zinc-200'
                    }`}>
                      {displayTitle}
                    </h3>

                    {/* Location line: starts with Batch name in blue, partition blue dot, folder name, and further subfolders */}
                    <div className="text-xs sm:text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed mt-0.5 font-normal line-clamp-2">
                      {loc.batch ? (
                        <span className="inline-flex items-center flex-wrap">
                          <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">
                            {loc.batch}
                          </span>

                          {loc.folders.map((segment, idx) => (
                            <React.Fragment key={idx}>
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-black mx-1 sm:mx-1.5 select-none">
                                •
                              </span>
                              <span className="text-slate-700 dark:text-zinc-300 font-medium">
                                {segment}
                              </span>
                            </React.Fragment>
                          ))}

                          {loc.duration ? (
                            <span className="text-slate-500 dark:text-zinc-400 font-normal ml-1.5">
                              {loc.duration}
                            </span>
                          ) : null}

                          {loc.details ? (
                            <span className="text-slate-500 dark:text-zinc-400 font-normal inline-flex items-center">
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-black mx-1 sm:mx-1.5 select-none">•</span>
                              {loc.details}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span>{loc.rawFallback || notif.message}</span>
                      )}
                    </div>

                    {/* Attached Image Preview (if present) */}
                    {notif.imageUrl && (
                      <div className="mt-2 rounded-xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 max-h-60 sm:max-h-80">
                        <img
                          src={notif.imageUrl}
                          alt={notif.title}
                          className="w-full h-auto max-h-60 sm:max-h-80 object-cover rounded-xl"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Author badge if available */}
                    {notif.authorName && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-300">
                        <span>By {notif.authorName}</span>
                      </div>
                    )}

                    {/* Action Pill Chip set to the far right corner & optional Master Delete */}
                    <div className="mt-2 flex items-center justify-between">
                      {isMaster && notif.announcementId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this broadcast post?')) {
                              deleteAnnouncement(notif.announcementId!);
                            }
                          }}
                          className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete broadcast post"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : <span />}

                      {notif.actionLabel && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 px-3 py-1 rounded-full group-hover:bg-[#0b57d0] group-hover:text-white dark:group-hover:bg-[#a8c7fa] dark:group-hover:text-[#062e6f] transition-all">
                          {notif.actionLabel}
                          <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                        </span>
                      )}
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
