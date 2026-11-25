import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  CheckCircle,
  Users,
  Star,
  Clock,
  BookOpen,
  ArrowRight,
  Sparkles,
  Layers,
  BarChart3,
  CheckCircle2,
  Video,
  Flame,
  Award,
  TrendingUp,
  Calendar,
  Activity,
  Bot,
  FileText,
  FileCode,
  Target,
  Package,
  ChevronLeft,
  ChevronRight,
  Lock,
  Megaphone,
  Plus,
  X,
  Trash2,
  PinOff,
  Crown,
  RefreshCw
} from 'lucide-react';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../lib/nativeHardwareBridge';
import type { MathTest, TestAttempt, UserProfile } from '../../types';
import type { User } from 'firebase/auth';
import type { Batch } from '../../lms/types';
import { useApp, getFacultyAvatarUrl } from '../../lms/LmsContext';
import { getLectureThumbnailUrl } from '../../lms/security';
import { isMasterUser, isDeprecatedTest, DEPRECATED_TEST_IDS } from '../../lib/masterAccount';
import { getTestDurationMinutes } from '../../utils/testFormatConverter';
import { DEFAULT_HIGH_RES_BANNER } from '../lms/batches/BatchThumbnailPicker';
import { TestDetailModal } from '../TestDetailModal';

interface BannerThemeStyle {
  container: string;
  badge: string;
  batchBadge: string;
  dotActive: string;
}

const BANNER_THEMES: Record<string, BannerThemeStyle> = {
  yellow: {
    container: 'bg-[#F1E356] dark:bg-gradient-to-br dark:from-[#2a2404] dark:via-[#1e1903] dark:to-[#141102]',
    badge: 'bg-white/95 dark:bg-black/50 text-slate-950 dark:text-amber-300 shadow-xs border border-black/5 font-extrabold',
    batchBadge: 'bg-white/85 dark:bg-white/10 text-slate-950 dark:text-amber-200 border border-black/5 font-bold',
    dotActive: 'bg-[#fbc404] w-6',
  },
  orange: {
    container: 'bg-gradient-to-br from-[#fff7ed] via-[#ffedd5]/60 to-[#fed7aa]/20 dark:from-[#2a170a]/90 dark:via-[#1e130c] dark:to-[#17120e]',
    badge: 'bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400',
    batchBadge: 'bg-orange-500/15 dark:bg-orange-500/25 text-orange-700 dark:text-orange-300',
    dotActive: 'bg-orange-500 w-6',
  },
  blue: {
    container: 'bg-[#6EB9E4] dark:bg-gradient-to-br dark:from-[#0c2438] dark:via-[#081a28] dark:to-[#05111a]',
    badge: 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-600 dark:text-blue-400',
    batchBadge: 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300',
    dotActive: 'bg-blue-500 w-6',
  },
  green: {
    container: 'bg-[#96EEA9] dark:bg-gradient-to-br dark:from-[#082917] dark:via-[#061d10] dark:to-[#04140b]',
    badge: 'bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400',
    batchBadge: 'bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    dotActive: 'bg-emerald-500 w-6',
  },
  purple: {
    container: 'bg-[#CEBAE1] dark:bg-gradient-to-br dark:from-[#22102e] dark:via-[#180a22] dark:to-[#14081c]',
    badge: 'bg-purple-500/15 dark:bg-purple-500/25 text-purple-600 dark:text-purple-400',
    batchBadge: 'bg-purple-500/15 dark:bg-purple-500/25 text-purple-700 dark:text-purple-300',
    dotActive: 'bg-purple-500 w-6',
  },
  rose: {
    container: 'bg-[#E65F53] text-white dark:bg-gradient-to-br dark:from-[#36100d] dark:via-[#260b09] dark:to-[#1a0706]',
    badge: 'bg-rose-500/15 dark:bg-rose-500/25 text-rose-600 dark:text-rose-400',
    batchBadge: 'bg-rose-500/15 dark:bg-rose-500/25 text-rose-700 dark:text-rose-300',
    dotActive: 'bg-rose-500 w-6',
  },
  slate: {
    container: 'bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9]/70 to-[#e2e8f0]/30 dark:from-[#1e2024] dark:via-[#18191d] dark:to-[#141518]',
    badge: 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200',
    batchBadge: 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300',
    dotActive: 'bg-slate-700 dark:bg-zinc-300 w-6',
  },
};

interface HomeDashboardProps {
  tests: MathTest[];
  attempts: TestAttempt[];
  currentUser: User | null;
  userProfile?: UserProfile | null;
  onStartTest: (test: MathTest) => void;
  onStartOmrTest?: (test: MathTest) => void;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
  onOpenBatches: (filter?: 'all' | 'my-batches') => void;
  onSelectBatch?: (batchId: string) => void;
  onSelectLecture?: (batchId: string, lectureId: string) => void;
  onPlayLecture?: (lecture: any, batch: any) => void;
  onOpenAllTests: () => void;
  onOpenAnalytics?: () => void;
  onOpenNotes?: () => void;
  onOpenThetaAI?: () => void;
  onOpenOmr?: () => void;
  onOpenCustomBuilder?: () => void;
  onOpenCreatePost?: () => void;
}

interface DayActivity {
  dayName: string;
  dateStr: string;
  isToday: boolean;
  videosCompleted: number;
  testsAttempted: number;
  avgScore: number;
  totalTimeMinutes: number;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  tests,
  attempts,
  currentUser,
  userProfile,
  onStartTest,
  onStartOmrTest,
  onViewAttemptResult,
  onOpenBatches,
  onSelectBatch,
  onSelectLecture,
  onPlayLecture,
  onOpenAllTests,
  onOpenAnalytics,
  onOpenNotes,
  onOpenThetaAI,
  onOpenOmr,
  onOpenCustomBuilder,
  onOpenCreatePost,
}) => {
  const {
    batches,
    lectures,
    chapters,
    batchTests,
    watchProgress,
    isEnrolled,
    announcements,
    setActiveBatchId,
    setActiveLectureId,
    isGuestAllowedForBatch,
    enrollAsGuest,
    showSecurityToast,
    updateAnnouncement,
    deleteAnnouncement,
    refreshCloudContent,
  } = useApp();

  // YouTube-style Pull-to-Refresh state for Home Page
  const homeRootRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const pullStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    hapticFired: boolean;
    distance: number;
  }>({ active: false, startX: 0, startY: 0, hapticFired: false, distance: 0 });
  const isRefreshingRef = useRef<boolean>(false);
  isRefreshingRef.current = isRefreshing;

  const PULL_THRESHOLD = 64;

  const triggerHomeRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    setIsRefreshing(true);
    setPullDistance(56);
    try {
      await Promise.all([
        refreshCloudContent(),
        new Promise((r) => setTimeout(r, 550)),
      ]);
      triggerSuccessHaptic();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [refreshCloudContent]);

  useEffect(() => {
    const el = homeRootRef.current;
    if (!el) return;

    const getTopScroll = () =>
      Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0, el.scrollTop || 0);

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current || e.touches.length !== 1) return;
      if (getTopScroll() <= 2) {
        pullStateRef.current = {
          active: true,
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          hapticFired: false,
          distance: 0,
        };
      } else {
        pullStateRef.current.active = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const ps = pullStateRef.current;
      if (!ps.active || isRefreshingRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - ps.startX;
      const dy = e.touches[0].clientY - ps.startY;
      // Cancel pull-to-refresh if scrolling up or swiping horizontally (e.g. hero banner)
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 1.1 || getTopScroll() > 4) {
        if (ps.distance > 0) {
          ps.distance = 0;
          setPullDistance(0);
        }
        if (dy < -8 || Math.abs(dx) > 14) ps.active = false;
        return;
      }
      e.preventDefault();
      const damped = Math.min(108, Math.round(dy * 0.45));
      ps.distance = damped;
      setPullDistance(damped);
      if (damped >= PULL_THRESHOLD && !ps.hapticFired) {
        ps.hapticFired = true;
        triggerLightHaptic();
      }
    };

    const onTouchEnd = () => {
      const ps = pullStateRef.current;
      if (!ps.active) return;
      ps.active = false;
      if (ps.distance >= PULL_THRESHOLD) {
        triggerHomeRefresh();
      } else {
        ps.distance = 0;
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [triggerHomeRefresh]);
  
  // Selected test for Test Details & Dual Mode (OMR + Online) Modal
  const [detailedTest, setDetailedTest] = useState<MathTest | null>(null);

  // Slideshow state for hero announcement banners
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isSlidePaused, setIsSlidePaused] = useState(false);

  // Filter state for the 4 core buttons: 'all-batches' | 'my-batches' | 'test-library' | 'activity'
  const [activeView, setActiveView] = useState<'all-batches' | 'my-batches' | 'test-library' | 'activity'>('all-batches');

  const isMaster = isMasterUser(currentUser) || (userProfile as any)?.role === 'admin';

  // Check if test was created within the last 2 days (48 hours) and has not been attempted yet
  const isTestNew = (test: MathTest | null): boolean => {
    if (!test) return false;
    if ((test as any).isNew) return true;
    const rawDate = test.createdAt || (test as any).timestamp;
    if (!rawDate) return false;
    const createdTime = new Date(rawDate).getTime();
    if (isNaN(createdTime) || createdTime <= 0) return false;
    const now = Date.now();
    const diffMs = now - createdTime;
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    if (diffMs < 0 || diffMs > TWO_DAYS) return false;

    const hasAttempted = attempts.some((att) => att.testId === test.id);
    if (hasAttempted) return false;
    if (((test as any).attemptCount || 0) > 0) return false;

    return true;
  };

  const visibleBatches = useMemo(() => {
    if (isMaster) return batches;
    return batches.filter((b) => {
      // An officially enrolled student can ALWAYS see their enrolled course, even if Draft or Secret Roster-Only!
      if (isEnrolled(b.id)) return true;
      // Non-enrolled visitors and guests can NEVER see Draft or Secret Roster-Only courses:
      if (b.isPublished === false) return false;
      if (b.isPrivateRosterOnly === true) return false;
      return true;
    });
  }, [batches, isMaster, isEnrolled]);

  const enrolledBatches = useMemo(
    () => visibleBatches.filter((b) => isEnrolled(b.id)),
    [visibleBatches, isEnrolled]
  );
  const enrolledBatchIdSet = useMemo(
    () => new Set(enrolledBatches.map((b) => b.id)),
    [enrolledBatches]
  );
  const displayedBatches = activeView === 'my-batches' ? enrolledBatches : visibleBatches;

  // Real-time ticker to auto-expire announcements dynamically without page refresh
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Format remaining time for live banners
  const getRemainingTimeBadge = useCallback((expiresAt?: number | null) => {
    if (!expiresAt) return null;
    const diff = expiresAt - currentTime;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) {
      const remHours = hours % 24;
      return `${days}d ${remHours}h left`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${Math.max(1, minutes)}m left`;
  }, [currentTime]);

  // Active Hero Announcement Banners for Home Feed (Filtered by student batch enrollment / master and live duration)
  const heroBanners = useMemo(() => {
    if (!announcements || announcements.length === 0) return [];
    return announcements.filter((ann) => {
      if (!ann.isHeroBanner) return false;
      // Auto-expiry check: remove banner if live duration has lapsed
      if (ann.expiresAt && typeof ann.expiresAt === 'number' && currentTime > ann.expiresAt) {
        return false;
      }
      if (isMaster) return true; // Master sees all unexpired active banners
      if (!ann.batchId) return true; // Global broadcast
      return enrolledBatchIdSet.has(ann.batchId);
    });
  }, [announcements, isMaster, enrolledBatchIdSet, currentTime]);

  // Keep index within bounds if heroBanners count changes
  useEffect(() => {
    if (currentSlideIndex >= heroBanners.length && heroBanners.length > 0) {
      setCurrentSlideIndex(0);
    }
  }, [heroBanners.length, currentSlideIndex]);

  // Slideshow auto-advance every 4.5 seconds if multiple banners (Infinite repeating loop)
  useEffect(() => {
    if (heroBanners.length <= 1 || isSlidePaused) return;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % heroBanners.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [heroBanners.length, isSlidePaused]);

  const handlePrevSlide = () => {
    if (heroBanners.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
  };

  const handleNextSlide = () => {
    if (heroBanners.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev + 1) % heroBanners.length);
  };

  const handlePrevDesktop = () => {
    handlePrevSlide();
  };

  const handleNextDesktop = () => {
    handleNextSlide();
  };

  // Touch swipe handling for mobile devices
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsSlidePaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current !== null) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      if (Math.abs(deltaX) > 35 && heroBanners.length > 1) {
        if (deltaX < 0) {
          // Swipe left -> Next slide (Infinite loop)
          handleNextSlide();
        } else {
          // Swipe right -> Prev slide (Infinite loop)
          handlePrevSlide();
        }
      }
      touchStartXRef.current = null;
    }
    setIsSlidePaused(false);
  };

  const activeHeroBanner = heroBanners[currentSlideIndex] || null;

  const activeHeroBannerBatch = useMemo(() => {
    if (!activeHeroBanner?.batchId) return null;
    return batches.find((b) => b.id === activeHeroBanner.batchId) || null;
  }, [batches, activeHeroBanner]);

  const currentTheme = BANNER_THEMES[activeHeroBanner?.themeColor || 'yellow'] || BANNER_THEMES.yellow || BANNER_THEMES.orange;

  const currentBatch = batches[0]; // Testing Batch
  const freeLectures = lectures.filter((l) => l.isFreePreview);

  // Latest updates for batch video & tests: STRICTLY scoped to student's enrolled batches
  const latestAnnouncement = announcements && announcements.length > 0 ? announcements[0] : null;

  const eligibleLectures = useMemo(() => {
    if (isMaster) return lectures;
    return lectures.filter((l) => enrolledBatchIdSet.has(l.batchId));
  }, [lectures, enrolledBatchIdSet, isMaster]);

  const latestLecture = eligibleLectures.length > 0 ? eligibleLectures[eligibleLectures.length - 1] : null;

  const latestLectureBatchTitle = useMemo(() => {
    if (!latestLecture?.batchId) return '';
    const b = batches.find((batch) => batch.id === latestLecture.batchId);
    return b ? b.title : '';
  }, [batches, latestLecture]);

  // Derive latest test strictly for student's enrolled batches (or all if master)
  const latestTest = useMemo(() => {
    if (isMaster) {
      return tests && tests.length > 0 ? tests[0] : null;
    }

    if (enrolledBatchIdSet.size === 0) {
      return null;
    }

    // Collect all test IDs belonging to the student's enrolled batches
    const enrolledBatchTestIds = new Set<string>();
    (batchTests || []).forEach((bt) => {
      if (isDeprecatedTest(bt)) return;
      if (enrolledBatchIdSet.has(bt.batchId)) {
        if (bt.testId) enrolledBatchTestIds.add(bt.testId);
        if (bt.id) enrolledBatchTestIds.add(bt.id);
      }
    });

    (chapters || []).forEach((c) => {
      if (enrolledBatchIdSet.has(c.batchId) && Array.isArray(c.testIds)) {
        c.testIds.forEach((tid) => {
          if (!DEPRECATED_TEST_IDS.has(tid) && !tid.includes('mix_test') && !tid.includes('imported-1789747440687')) {
            enrolledBatchTestIds.add(tid);
          }
        });
      }
    });

    // Find the latest test in tests matching enrolled batch test IDs
    const matched = tests.find(
      (t) => !isDeprecatedTest(t) && (enrolledBatchTestIds.has(t.id) || Boolean((t as any).batchId && enrolledBatchIdSet.has((t as any).batchId)))
    );
    if (matched) return matched;

    // If a batch test exists in batchTests but isn't yet in available tests array, synthesize a test card object
    const latestBatchTestCard = (batchTests || []).find((bt) => !isDeprecatedTest(bt) && enrolledBatchIdSet.has(bt.batchId));
    if (latestBatchTestCard) {
      const resolvedMinutes = getTestDurationMinutes(latestBatchTestCard);
      const synthTest: MathTest = {
        id: latestBatchTestCard.testId || latestBatchTestCard.id || 'batch_test',
        title: latestBatchTestCard.title || 'Batch Mock Assessment',
        topic: latestBatchTestCard.topic || 'General Practice',
        timeLimitMinutes: resolvedMinutes,
        durationMinutes: resolvedMinutes,
        questionCount: latestBatchTestCard.questionCount || 25,
        questions: [],
        createdAt: latestBatchTestCard.publishedAt || Date.now(),
      };
      return synthTest;
    }

    return null;
  }, [tests, batchTests, chapters, enrolledBatchIdSet, isMaster]);

  const latestTestQuestionCount = (() => {
    if (!latestTest) return 50;
    if (Array.isArray(latestTest.questions) && latestTest.questions.length > 0) return latestTest.questions.length;
    if (typeof (latestTest as any).questionCount === 'number' && (latestTest as any).questionCount > 0) return (latestTest as any).questionCount;
    return getTestDurationMinutes(latestTest) || 50;
  })();
  const latestTestTimeDisplay = latestTest
    ? `${getTestDurationMinutes(latestTest)}m`
    : '45m';

  // In-progress lectures
  const inProgressLectureIds = Object.keys(watchProgress).filter(
    (id) => !watchProgress[id]?.isCompleted && (watchProgress[id]?.watchedSeconds || 0) > 10
  );
  const continueWatchingLectures = lectures.filter((l) => inProgressLectureIds.includes(l.id));

  type ActivityPeriod = '7days' | '1month' | '2months' | '3months' | '4months' | '6months';
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('7days');

  // Compute 7-entry Activity Graph based on selected period
  const dayWiseActivity: DayActivity[] = useMemo(() => {
    const days: DayActivity[] = [];
    const today = new Date();

    if (activityPeriod === '7days') {
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dayName = i === 0 ? 'Today' : dayLabels[d.getDay()];
        const dateStr = d.toISOString().split('T')[0];

        const dayAttempts = attempts.filter((a) => {
          const attemptDate = (a.completedAt || a.createdAt || '').split('T')[0];
          return attemptDate === dateStr;
        });

        const testsAttempted = dayAttempts.length;
        const avgScore = testsAttempted > 0
          ? Math.round(dayAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / testsAttempted)
          : 0;

        let videosCompleted = 0;
        let totalTimeMinutes = testsAttempted * 15;

        if (i === 0) {
          const completedCount = Object.values(watchProgress).filter((w) => w.isCompleted || w.watchedSeconds > 30).length;
          videosCompleted = Math.max(completedCount, 1);
          totalTimeMinutes += videosCompleted * 15;
        } else if (i === 1) {
          videosCompleted = 1;
          totalTimeMinutes += 20;
        } else if (i === 2) {
          videosCompleted = 2;
          totalTimeMinutes += 30;
        } else if (i === 4) {
          videosCompleted = 1;
          totalTimeMinutes += 15;
        }

        days.push({
          dayName,
          dateStr,
          isToday: i === 0,
          videosCompleted,
          testsAttempted: Math.max(testsAttempted, i === 0 ? Math.max(attempts.length, 1) : (i % 2 === 0 ? 1 : 0)),
          avgScore: avgScore > 0 ? avgScore : (85 + (i * 3) % 15),
          totalTimeMinutes: Math.max(totalTimeMinutes, 25),
        });
      }
    } else if (activityPeriod === '1month') {
      const bucketLabels = ['Day 1-4', 'Day 5-8', 'Day 9-12', 'Day 13-16', 'Day 17-21', 'Day 22-26', 'Recent'];
      const videoMocks = [3, 2, 4, 3, 5, 2, Math.max(Object.values(watchProgress).length, 3)];
      const testMocks = [1, 2, 1, 3, 2, 1, Math.max(attempts.length, 2)];
      const scores = [82, 85, 90, 88, 92, 86, 94];

      bucketLabels.forEach((label, idx) => {
        days.push({
          dayName: label,
          dateStr: `Bucket ${idx + 1}`,
          isToday: idx === 6,
          videosCompleted: videoMocks[idx],
          testsAttempted: testMocks[idx],
          avgScore: scores[idx],
          totalTimeMinutes: (videoMocks[idx] + testMocks[idx]) * 20,
        });
      });
    } else if (activityPeriod === '2months') {
      const bucketLabels = ['W1-2', 'W3-4', 'W5-6', 'W7-8', 'W9-10', 'W11-12', 'Latest'];
      const videoMocks = [5, 4, 6, 5, 7, 4, Math.max(Object.values(watchProgress).length, 4)];
      const testMocks = [2, 3, 2, 4, 3, 2, Math.max(attempts.length, 3)];
      const scores = [80, 84, 86, 89, 91, 87, 95];

      bucketLabels.forEach((label, idx) => {
        days.push({
          dayName: label,
          dateStr: `Bucket ${idx + 1}`,
          isToday: idx === 6,
          videosCompleted: videoMocks[idx],
          testsAttempted: testMocks[idx],
          avgScore: scores[idx],
          totalTimeMinutes: (videoMocks[idx] + testMocks[idx]) * 25,
        });
      });
    } else if (activityPeriod === '3months') {
      const bucketLabels = ['BiW 1', 'BiW 2', 'BiW 3', 'BiW 4', 'BiW 5', 'BiW 6', 'Current'];
      const videoMocks = [6, 5, 7, 6, 8, 5, Math.max(Object.values(watchProgress).length, 5)];
      const testMocks = [3, 4, 3, 5, 4, 3, Math.max(attempts.length, 3)];
      const scores = [78, 83, 85, 88, 90, 88, 93];

      bucketLabels.forEach((label, idx) => {
        days.push({
          dayName: label,
          dateStr: `Bucket ${idx + 1}`,
          isToday: idx === 6,
          videosCompleted: videoMocks[idx],
          testsAttempted: testMocks[idx],
          avgScore: scores[idx],
          totalTimeMinutes: (videoMocks[idx] + testMocks[idx]) * 25,
        });
      });
    } else if (activityPeriod === '4months') {
      const bucketLabels = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Recent'];
      const videoMocks = [8, 7, 9, 8, 10, 7, Math.max(Object.values(watchProgress).length, 6)];
      const testMocks = [4, 5, 4, 6, 5, 4, Math.max(attempts.length, 4)];
      const scores = [76, 81, 84, 87, 91, 89, 94];

      bucketLabels.forEach((label, idx) => {
        days.push({
          dayName: label,
          dateStr: `Bucket ${idx + 1}`,
          isToday: idx === 6,
          videosCompleted: videoMocks[idx],
          testsAttempted: testMocks[idx],
          avgScore: scores[idx],
          totalTimeMinutes: (videoMocks[idx] + testMocks[idx]) * 30,
        });
      });
    } else {
      const monthNames = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
      const videoMocks = [10, 9, 12, 11, 14, 10, Math.max(Object.values(watchProgress).length, 8)];
      const testMocks = [5, 6, 6, 8, 7, 5, Math.max(attempts.length, 5)];
      const scores = [75, 80, 83, 86, 89, 92, 95];

      monthNames.forEach((month, idx) => {
        days.push({
          dayName: month,
          dateStr: `Month ${idx + 1}`,
          isToday: idx === 6,
          videosCompleted: videoMocks[idx],
          testsAttempted: testMocks[idx],
          avgScore: scores[idx],
          totalTimeMinutes: (videoMocks[idx] + testMocks[idx]) * 35,
        });
      });
    }

    return days;
  }, [activityPeriod, attempts, watchProgress]);

  // Aggregate Study Stats
  const totalAttempts = attempts.length;
  const completedVideosCount = Object.values(watchProgress).filter((w) => w.isCompleted || w.watchedSeconds > 30).length || 2;
  const averagePercentage = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / totalAttempts)
    : 88;

  const handleSelectBatchItem = (batchId: string) => {
    const target = batches.find((b) => b.id === batchId);
    if (!target) return;
    const hasEnrollment = isEnrolled(batchId);
    const guestAllowed = isGuestAllowedForBatch(batchId);

    // Rule 1: Draft or Secret Roster course strictly requires official roster enrollment
    if (!isMaster && (target.isPublished === false || target.isPrivateRosterOnly === true) && !hasEnrollment) {
      showSecurityToast(`Access Locked: "${target.title}" is private. Official student roster admission is required.`);
      return;
    }

    // Rule 2: Live course with non-enrolled user
    if (!isMaster && !hasEnrollment) {
      if (guestAllowed) {
        enrollAsGuest(batchId);
      }
      // If not guestAllowed, user is allowed to proceed to the batch detail view to explore the curriculum structure!
    }

    setActiveBatchId(batchId);
    setActiveLectureId(null);
    if (onSelectBatch) {
      onSelectBatch(batchId);
    } else {
      onOpenBatches('all');
    }
  };

  const handleSelectLectureItem = (batchId: string, lectureId: string) => {
    const targetBatch = batches.find((b) => b.id === batchId);
    const targetLec = lectures.find((l) => l.id === lectureId);
    const hasEnrollment = isEnrolled(batchId);
    const guestAllowed = isGuestAllowedForBatch(batchId);

    if (!isMaster && !hasEnrollment) {
      if (targetBatch && (targetBatch.isPublished === false || targetBatch.isPrivateRosterOnly === true)) {
        showSecurityToast(`Access Locked: This course is private. Official student roster admission is required.`);
        return;
      }
      if (guestAllowed) {
        enrollAsGuest(batchId);
      } else if (!targetLec?.isFreePreview) {
        showSecurityToast(`Access Locked: "${targetLec?.title || 'This lecture'}" requires full course enrollment.`);
        return;
      }
    }

    setActiveBatchId(batchId);
    setActiveLectureId(lectureId);
    if (targetLec && targetBatch && onPlayLecture) {
      onPlayLecture(targetLec, targetBatch);
      return;
    }
    if (onSelectLecture) {
      onSelectLecture(batchId, lectureId);
    } else if (onSelectBatch) {
      onSelectBatch(batchId);
    } else {
      onOpenBatches();
    }
  };

  const totalTasksAccomplished = useMemo(
    () => dayWiseActivity.reduce((sum, d) => sum + d.videosCompleted + d.testsAttempted, 0),
    [dayWiseActivity]
  );

  // Find max value for graph bar normalization
  const maxDayTasks = Math.max(
    ...dayWiseActivity.map((d) => d.videosCompleted + d.testsAttempted),
    4
  );

  return (
    <div
      ref={homeRootRef}
      className="relative space-y-5 sm:space-y-7 pb-4 sm:pb-8 md:pb-12 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 sm:py-3"
      style={{
        transform: pullDistance > 0 ? `translateY(${Math.round(pullDistance * 0.35)}px)` : undefined,
        transition: pullStateRef.current.active ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {/* YouTube-Style Floating Circular Pull-to-Refresh Indicator */}
      {(pullDistance > 8 || isRefreshing) && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none flex items-center justify-center"
          style={{
            top: `calc(var(--android-status-bar-height, 0px) + ${Math.min(76, 12 + pullDistance * 0.72)}px)`,
            opacity: isRefreshing ? 1 : Math.min(1, pullDistance / 42),
            transition: pullStateRef.current.active ? 'none' : 'all 200ms ease-out',
          }}
        >
          <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1e2024] shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-slate-200/70 dark:border-white/10 flex items-center justify-center">
            <RefreshCw
              className={`w-5 h-5 ${
                isRefreshing
                  ? 'animate-spin text-[#0b57d0] dark:text-[#a8c7fa]'
                  : pullDistance >= PULL_THRESHOLD
                    ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                    : 'text-slate-500 dark:text-zinc-400'
              }`}
              style={!isRefreshing ? { transform: `rotate(${pullDistance * 4}deg)` } : undefined}
            />
          </div>
        </div>
      )}
      {/* Master Admin Top Right 'New Post' Action Button (Clean dedicated row with full clearance, no overlap) */}
      {isMaster && onOpenCreatePost && (
        <div className="w-full flex items-center justify-end pt-1 pb-2 relative z-30">
          <button
            id="home-master-new-post-btn"
            type="button"
            onClick={onOpenCreatePost}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white font-bold text-xs sm:text-[13px] shadow-sm shadow-orange-500/25 hover:shadow-md transition-all cursor-pointer border-0 outline-none select-none shrink-0"
            title="Create Broadcast Post or Home Screen Banner"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.8]" />
            <span>New Post</span>
          </button>
        </div>
      )}

                  {/* Hero Announcement Banner Section (Strict 1200x500 Dimension Ratio across Mobile, Tablet, and Desktop) */}
      {heroBanners.length > 0 && (() => {
        const renderBannerCard = (banner: Announcement, idx: number, isGrid: boolean = false) => {
          const bTheme = BANNER_THEMES[banner.themeColor || 'yellow'] || BANNER_THEMES.yellow || BANNER_THEMES.orange;
          const bBatch = banner.batchId ? batches.find((b) => b.id === banner.batchId) || null : null;
          const hasImage = Boolean(banner.imageUrl);
          const hasTitle = Boolean(banner.title?.trim());
          const hasMessage = Boolean(banner.message?.trim());
          const hasText = hasTitle || hasMessage;

          return (
            <div
              id={`hero-campus-banner-card-${idx}`}
              key={banner.id || idx}
              onClick={() => {
                if (banner.batchId && onSelectBatch) {
                  onSelectBatch(banner.batchId);
                }
              }}
              className={`relative rounded-[24px] overflow-hidden ${hasImage ? "bg-slate-950 dark:bg-black" : bTheme.container} border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.5)] transition-all duration-300 select-none w-full aspect-[1200/500] ${banner.batchId ? 'cursor-pointer group/batch hover:ring-2 hover:ring-[#0b57d0]/40' : ''}`}
              style={{ aspectRatio: '1200 / 500' }}
              onMouseEnter={() => setIsSlidePaused(true)}
              onMouseLeave={() => setIsSlidePaused(false)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {hasImage ? (
                /* BANNER WITH IMAGE: Strict 1200x500px Dimension Ratio - 100% Full Image with ZERO side cutting */
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  {/* Subtle ambient backdrop layer matching image colors */}
                  <img
                    src={banner.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 dark:opacity-25 scale-110 pointer-events-none select-none"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/10 dark:bg-black/30 pointer-events-none" />

                  {/* Authentic 1200x500 Full Banner Graphic - object-contain guarantees full image without cutting sides */}
                  <img
                    src={banner.imageUrl}
                    alt={banner.title || 'Campus Banner'}
                    className="relative z-10 w-full h-full object-cover rounded-[24px]"
                    style={{ aspectRatio: '1200 / 500' }}
                    loading="lazy"
                  />

                  {/* Floating Header Badges - Master Badges or Course Badge */}
                  {isMaster ? (
                    <div className="absolute top-2 left-2 sm:top-3.5 sm:left-3.5 z-20 flex items-center gap-1.5 flex-wrap pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[9.5px] sm:text-[10.5px] font-black uppercase tracking-wider select-none border border-white/20 shadow-sm">
                        <Megaphone className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current text-amber-400" />
                        <span>Campus Announcement</span>
                      </span>
                      {bBatch && (
                        <span className="text-[9.5px] sm:text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/20 px-2 py-0.5 rounded-full shadow-sm">
                          {bBatch.title}
                        </span>
                      )}
                      {!banner.batchId && (
                        <span className="text-[9.5px] sm:text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/20 px-2 py-0.5 rounded-full shadow-sm">
                          All Students
                        </span>
                      )}
                      {/* Live duration / remaining time badge - Matching Campus Announcement pill style without border rings */}
                      {banner.expiresAt ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[9.5px] sm:text-[10.5px] font-bold select-none border border-white/20 shadow-sm">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                          <span>{getRemainingTimeBadge(banner.expiresAt)}</span>
                        </span>
                      ) : (
                        isMaster && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[9.5px] sm:text-[10.5px] font-bold select-none border border-white/20 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Always Live</span>
                          </span>
                        )
                      )}
                    </div>
                  ) : bBatch ? (
                    <div className="absolute top-2 left-2 sm:top-3.5 sm:left-3.5 z-20 flex items-center gap-1.5 flex-wrap pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0b57d0]/90 backdrop-blur-md text-white text-[9.5px] sm:text-[10.5px] font-bold uppercase tracking-wider select-none border border-white/20 shadow-sm">
                        <BookOpen className="w-3 h-3 fill-current" />
                        <span>Course: {bBatch.title}</span>
                      </span>
                    </div>
                  ) : null}

                  {/* Interactive Bottom-Right Action Buttons: Open Course CTA & Master Unpin Controls */}
                  <div className="absolute bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5 z-30 flex items-center gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    {bBatch && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectBatch) onSelectBatch(banner.batchId!);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-black/90 hover:bg-white dark:hover:bg-black text-[#0b57d0] dark:text-[#a8c7fa] text-[11px] sm:text-xs font-bold backdrop-blur-md shadow-lg border border-black/10 dark:border-white/15 active:scale-95 transition-all cursor-pointer select-none"
                      >
                        <span>Open Course</span>
                        <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    )}

                    {isMaster && (
                      <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 sm:py-1.5 rounded-full border border-white/20 shadow-md">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateAnnouncement(banner.id, { isHeroBanner: false });
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90 hover:text-white transition-colors cursor-pointer border-0 shadow-none outline-none"
                          title="Unpin from Home feed"
                        >
                          <PinOff className="w-3 h-3" />
                          <span>Unpin</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this broadcast post?')) {
                              deleteAnnouncement(banner.id);
                            }
                          }}
                          className="p-1 rounded-full text-white/70 hover:text-red-400 transition-colors cursor-pointer border-0 shadow-none outline-none"
                          title="Delete broadcast post"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* If text is provided, display bottom scrim overlay so 1200x500 banner is never squished or cut */}
                  {hasText && (
                    <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-2.5 sm:p-4 md:p-5 pt-6 sm:pt-10 rounded-b-[24px] pointer-events-none">
                      <div className="space-y-0.5 sm:space-y-1 max-w-[55%] sm:max-w-[62%]">
                        {hasTitle && (
                          <h2 className="text-xs sm:text-base md:text-lg font-bold text-white leading-tight line-clamp-1 drop-shadow-sm">
                            {banner.title}
                          </h2>
                        )}
                        {hasMessage && (
                          <p className="text-[10px] sm:text-xs md:text-[13px] text-zinc-200 line-clamp-1 sm:line-clamp-2 leading-tight drop-shadow-xs">
                            {banner.message}
                          </p>
                        )}
                      </div>
                      <div className="pt-0.5 sm:pt-1 flex items-center justify-between text-[9.5px] sm:text-xs text-zinc-300">
                        <div className="flex items-center gap-1 font-medium">
                          <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span>{banner.authorName || 'Master Academic Head'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* TEXT-ONLY TEMPLATE: Respects 1200x500 Aspect Ratio with comfortable layout */
                <div className="flex flex-col justify-between h-full p-4 sm:p-5 md:p-6 lg:p-7 relative overflow-hidden">

                  <div className="space-y-1 sm:space-y-2">
                    {isMaster && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${bTheme.badge} text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider select-none border-0`}>
                          <Megaphone className="w-3 h-3 fill-current" />
                          <span>Campus Announcement</span>
                        </span>
                        {bBatch && (
                          <span className={`text-[10px] sm:text-[11px] font-bold ${bTheme.batchBadge} px-2.5 py-0.5 rounded-full border-0`}>
                            {bBatch.title}
                          </span>
                        )}
                        {!banner.batchId && (
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-zinc-300 bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full border-0">
                            All Students
                          </span>
                        )}
                        {/* Live duration / remaining time badge */}
                        {banner.expiresAt ? (
                          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border-0 px-2.5 py-0.5 rounded-full">
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>{getRemainingTimeBadge(banner.expiresAt)}</span>
                          </span>
                        ) : (
                          isMaster && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border-0 px-2.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Always Live</span>
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {hasTitle && (
                      <h2 className="text-sm sm:text-lg md:text-xl font-bold text-[#1f1f1f] dark:text-[#f3f4f6] leading-tight line-clamp-2">
                        {banner.title}
                      </h2>
                    )}
                    {hasMessage && (
                      <p className="text-xs sm:text-[13px] md:text-sm text-slate-900 dark:text-zinc-300 font-medium leading-relaxed line-clamp-2 sm:line-clamp-3 md:line-clamp-4">
                        {banner.message}
                      </p>
                    )}
                  </div>
                  <div className="pt-1.5 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
                    <div className="flex items-center gap-1.5 font-medium text-[11px] sm:text-xs">
                      <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>{banner.authorName || 'Master Academic Head'}</span>
                    </div>
                    {isMaster && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateAnnouncement(banner.id, { isHeroBanner: false })}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 shadow-none outline-none"
                          title="Unpin from Home feed"
                        >
                          <PinOff className="w-3 h-3" />
                          <span>Unpin from Home</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this broadcast post?')) {
                              deleteAnnouncement(banner.id);
                            }
                          }}
                          className="p-1.5 rounded-full text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer border-0 shadow-none outline-none"
                          title="Delete broadcast post"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        };

        const isMultiple = heroBanners.length > 1;
        const desktopHasGrid = heroBanners.length >= 2;
        const firstDesktopBanner = heroBanners[currentSlideIndex % heroBanners.length];
        const secondDesktopBanner = heroBanners[(currentSlideIndex + 1) % heroBanners.length];

        return (
          <div className="space-y-2 mt-1">
            {/* Desktop & Tablet Landscape View (lg+): 2 Banner Templates Side-by-Side with full Touch Swipe support */}
            {desktopHasGrid ? (
              <div
                className="hidden lg:block relative group"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className="grid grid-cols-2 gap-4 lg:gap-6">
                  {renderBannerCard(firstDesktopBanner, currentSlideIndex % heroBanners.length, true)}
                  {renderBannerCard(secondDesktopBanner, (currentSlideIndex + 1) % heroBanners.length, true)}
                </div>

                {/* Desktop Left / Right Navigation Buttons (When more than 2 banners exist) */}
                {heroBanners.length > 2 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevDesktop}
                      className="absolute -left-3.5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-md border border-slate-200 dark:border-zinc-700 flex items-center justify-center transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                      title="Previous announcements"
                    >
                      <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextDesktop}
                      className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-md border border-slate-200 dark:border-zinc-700 flex items-center justify-center transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                      title="Next announcements"
                    >
                      <ChevronRight className="w-5 h-5 stroke-[2.2]" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Single Banner on Desktop (Maintains exact 1200x500 Aspect Ratio) */
              <div className="hidden lg:block max-w-5xl mx-auto">
                {renderBannerCard(heroBanners[0], 0, false)}
              </div>
            )}

            {/* Mobile & Tablet View (< lg): Single card with strict 1200x500 Aspect Ratio */}
            <div className="block lg:hidden relative group">
              {renderBannerCard(heroBanners[currentSlideIndex], currentSlideIndex, false)}

              {/* Floating Left/Right Arrow Buttons on Mobile/Tablet */}
              {isMultiple && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevSlide}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 active:scale-95 text-white flex items-center justify-center backdrop-blur-md shadow-md transition-all border-0 cursor-pointer"
                    title="Previous announcement"
                  >
                    <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextSlide}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 active:scale-95 text-white flex items-center justify-center backdrop-blur-md shadow-md transition-all border-0 cursor-pointer"
                    title="Next announcement"
                  >
                    <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </>
              )}
            </div>

            {/* Centered Minimal Carousel Pagination Bar (Pill for active, dots for inactive) */}
            {isMultiple && (
              <div className="flex items-center justify-center gap-1.5 pt-1.5 pb-0.5">
                {heroBanners.map((b, idx) => {
                  const isActive = currentSlideIndex === idx;
                  return (
                    <button
                      key={b.id || idx}
                      type="button"
                      onClick={() => {
                        setCurrentSlideIndex(idx);
                      }}
                      className={`transition-all duration-300 rounded-full cursor-pointer border-0 outline-none p-0 ${
                        isActive
                          ? 'w-7 sm:w-8 h-1.5 sm:h-2 bg-slate-800 dark:bg-white shadow-xs'
                          : 'w-1.5 sm:w-2 h-1.5 sm:h-2 bg-slate-300/80 dark:bg-zinc-700/80 hover:bg-slate-400 dark:hover:bg-zinc-500'
                      }`}
                      title={`Go to announcement ${idx + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

{/* 1. LATEST UPDATES (Featured Lecture Full Preview & Mock Test) - Strictly shown for enrolled batches only */}
      {(latestLecture || latestTest) && (
        <div className="space-y-2.5 sm:space-y-3">
          {/* Minimal 'NEW' Badge */}
          <div className="flex items-center">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 text-[11px] font-black uppercase tracking-wider animate-pulse select-none">
              <Sparkles className="w-3 h-3 fill-current" />
              <span>NEW</span>
            </span>
          </div>

          <div className={`grid grid-cols-1 ${latestLecture && latestTest ? 'md:grid-cols-2' : ''} gap-4`}>
            {/* Card 1: Latest Featured Lecture (Full Flush Preview View on Left) */}
            {latestLecture && (
              <div
                onClick={() => {
                  handleSelectLectureItem(latestLecture.batchId, latestLecture.id);
                }}
                className="cv-auto-card group cursor-pointer rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-[transform,opacity,background-color] duration-150 overflow-hidden flex flex-row p-0 justify-between items-stretch relative"
              >
                <md-ripple />
                {/* Video Thumbnail (Edge-to-edge flush on left corner) */}
                <div className="relative w-36 sm:w-48 aspect-video shrink-0 self-stretch overflow-hidden bg-slate-900/10 dark:bg-black/30">
                  <img
                    src={getLectureThumbnailUrl(latestLecture)}
                    alt={latestLecture.title || 'Video Class'}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (target.src.includes('i.ytimg.com')) {
                        target.src = target.src.replace('i.ytimg.com', 'img.youtube.com');
                      } else if (!target.src.includes('default-course-banner.png')) {
                        target.src = '/assets/default-course-banner.png';
                      }
                    }}
                  />
                  <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-purple-900/60 dark:text-purple-300 font-bold text-[8.5px] sm:text-[9.5px] uppercase tracking-wider backdrop-blur-xs">
                    Latest Class
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 py-0.5 rounded-md bg-black/80 font-mono text-[9px] sm:text-[10.5px] text-white">
                    {latestLecture.durationMinutes ? `${latestLecture.durationMinutes}:00` : '18:00'}
                  </span>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/30">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center shadow-lg">
                      <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Content: Batch Name above Lecture Title Name */}
                <div className="flex-1 min-w-0 flex flex-col justify-start p-3.5 sm:p-4 space-y-0.5 pointer-events-none">
                  {latestLectureBatchTitle && (
                    <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate text-[#0b57d0] dark:text-[#a8c7fa]">
                      {latestLectureBatchTitle}
                    </span>
                  )}
                  <h3 className="text-sm sm:text-base font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug line-clamp-2">
                    {latestLecture.title}
                  </h3>
                </div>
              </div>
            )}

            {/* Card 2: Clean Test Card (Matches TestCard from Test Library) */}
            {latestTest && (
              <div
                onClick={() => {
                  setDetailedTest(latestTest);
                }}
                className="cv-auto-card p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-[transform,opacity,background-color] duration-150 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
              >
                <md-ripple />
                {/* Row 1: Topic tag above title & Title */}
                <div className="w-full pointer-events-none space-y-0.5">
                  {latestTest.topic && (
                    <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate text-[#0b57d0] dark:text-[#a8c7fa]">
                      {latestTest.topic}
                    </span>
                  )}
                  <h3 className="text-[16px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
                    {latestTest.title}
                  </h3>
                </div>

                {/* Row 2: Question count & time (Left), Minimal 'New' badge & Chevron (Bottom Right) */}
                <div className="flex items-center justify-between w-full pt-0.5 pointer-events-none">
                  <div className="flex items-center gap-2 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium leading-none">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                      <Package className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none">{latestTestQuestionCount} Qs</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                      <Clock className="w-3.5 h-3.5 text-[#6750a4] dark:text-[#d0bcff] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none">{latestTestTimeDisplay}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isTestNew(latestTest) ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold tracking-wide uppercase bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 border-0 shadow-none shrink-0"
                        title="New test created within the last 2 days"
                      >
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500 dark:bg-orange-400"></span>
                        </span>
                        <span>New</span>
                      </span>
                    ) : null}
                    <ChevronRight className="w-3.5 h-3.5 text-[#747775] dark:text-[#8e918f] group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT TABS / MODULES */}
      <div className="space-y-6 sm:space-y-8">
        
        {/* COACHING BATCHES SECTION (Shown when 'all-batches' or 'my-batches') */}
        {(activeView === 'all-batches' || activeView === 'my-batches') && (
          <div id="coaching-batches-section" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                  <span>{activeView === 'my-batches' ? 'My Enrolled Batches' : 'Course Batches'}</span>
                </h2>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {activeView === 'my-batches'
                    ? 'Batches you are actively enrolled in with complete class access'
                    : 'Structured curriculum folders, video lectures, and verified notes'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenBatches && onOpenBatches(activeView === 'my-batches' ? 'my-batches' : 'all')}
                className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
              >
                <span>All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {displayedBatches.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedBatches.map((b) => (
                  <M3BatchCard
                    key={b.id}
                    batch={b}
                    onSelect={() => handleSelectBatchItem(b.id)}
                    isEnrolled={isEnrolled(b.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3">
                <BookOpen className="w-10 h-10 text-[var(--md-sys-color-outline)] mx-auto opacity-50" />
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                  No Enrolled Batches
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-sm mx-auto">
                  You are not currently enrolled in any course batches. Explore our available batches to get started.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('all-batches');
                    if (onOpenBatches) onOpenBatches('all');
                  }}
                  className="px-5 py-2 text-xs font-bold rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white border-none cursor-pointer shadow-sm transition"
                >
                  Explore All Batches
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. STUDENT ACTIVITY & DAY-WISE GRAPH SECTION (After Batches) */}
        <div id="student-activity-section" className="bg-white dark:bg-[#1e2024] rounded-3xl p-3.5 sm:p-7 pt-4 sm:pt-6 pb-4 sm:pb-7 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                  Activity & Performance
                </h2>
              </div>
              {/* On mobile: Arrow right in the top right corner of header */}
              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="sm:hidden p-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-slate-800 dark:text-zinc-100 flex items-center justify-center transition active:scale-95 cursor-pointer border-0 outline-none"
                  title="View Full Analytics"
                  aria-label="View Full Analytics"
                >
                  <ArrowRight className="w-4 h-4 text-slate-800 dark:text-zinc-100 stroke-[2.5]" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
                <span className="font-semibold">Videos Done</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold">Tests Attempted</span>
              </div>
              {/* On tablet/desktop: Arrow right next to legend */}
              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="hidden sm:flex p-2 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-slate-800 dark:text-zinc-100 items-center justify-center transition active:scale-95 cursor-pointer border-0 outline-none"
                  title="View Full Analytics"
                  aria-label="View Full Analytics"
                >
                  <ArrowRight className="w-4 h-4 text-slate-800 dark:text-zinc-100 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>

          {/* 4 Summary Score Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-2xl bg-slate-100 hover:bg-slate-200/70 dark:bg-[#282a30] transition-colors border-0 space-y-1">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Videos Completed</span>
                <Video className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-[var(--md-sys-color-on-surface)]">
                {completedVideosCount}
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Lectures Watched
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-100 hover:bg-slate-200/70 dark:bg-[#282a30] transition-colors border-0 space-y-1">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Tests Attempted</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-[var(--md-sys-color-on-surface)]">
                {totalAttempts > 0 ? totalAttempts : 2}
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Full Mock Assessments
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-100 hover:bg-slate-200/70 dark:bg-[#282a30] transition-colors border-0 space-y-1">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Avg Performance</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {averagePercentage}%
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Assessment Accuracy
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-100 hover:bg-slate-200/70 dark:bg-[#282a30] transition-colors border-0 space-y-1">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Active Streak</span>
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-orange-500">
                5 Days
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Daily Practice Habit
              </div>
            </div>
          </div>

          {/* Day-Wise Visual Interactive Bar Chart */}
          <div className="p-3 sm:p-6 pb-3 sm:pb-6 rounded-2xl sm:rounded-3xl bg-slate-100 dark:bg-[#282a30] border-0 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  Task Breakdown
                </h3>
                {/* Time Range Dropdown */}
                <select
                  value={activityPeriod}
                  onChange={(e) => setActivityPeriod(e.target.value as any)}
                  className="text-[10.5px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white dark:bg-[#1e2024] border border-[var(--md-sys-color-outline-variant)]/40 text-[var(--md-sys-color-on-surface)] cursor-pointer outline-none hover:border-[var(--md-sys-color-primary)] transition"
                >
                  <option value="7days">Last 7 Days (Week)</option>
                  <option value="1month">Last 1 Month</option>
                  <option value="2months">Last 2 Months</option>
                  <option value="3months">Last 3 Months</option>
                  <option value="4months">Last 4 Months</option>
                  <option value="6months">Last 6 Months</option>
                </select>
              </div>

              <span className="text-[10.5px] sm:text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] self-start sm:self-auto">
                Total {totalTasksAccomplished} Tasks Accomplished
              </span>
            </div>

            {/* Bar Chart Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-4 pt-2 sm:pt-4 pb-1 sm:pb-2 items-end h-36 sm:h-48">
              {dayWiseActivity.map((day, idx) => {
                const totalTasks = day.videosCompleted + day.testsAttempted;
                const maxBarH = 75;
                const barH = maxDayTasks > 0 ? Math.round((totalTasks / maxDayTasks) * maxBarH) : 0;
                const testH = totalTasks > 0 ? Math.round((day.testsAttempted / totalTasks) * barH) : 0;
                const videoH = totalTasks > 0 ? barH - testH : 0;

                return (
                  <div key={idx} className="relative flex flex-col items-center justify-end h-full group cursor-pointer space-y-1.5 sm:space-y-2">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] font-bold px-2 py-1 rounded-md bg-black/80 text-white whitespace-nowrap shadow-md pointer-events-none z-20">
                      {day.videosCompleted} Video · {day.testsAttempted} Test ({day.avgScore}%)
                    </div>

                    {/* Stacked Vertical Bar */}
                    <div className="w-5 sm:w-10 flex flex-col justify-end items-center rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-container-highest)]/60 p-0.5">
                      {/* Tests Completed (Emerald) */}
                      {testH > 0 ? (
                        <div
                          style={{ height: `${Math.max(testH, 8)}px` }}
                          className="w-full bg-emerald-500 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                          title={`${day.testsAttempted} Tests`}
                        />
                      ) : null}
                      {/* Videos Completed (Primary Blue) */}
                      {videoH > 0 ? (
                        <div
                          style={{ height: `${Math.max(videoH, 10)}px` }}
                          className={`w-full bg-[var(--md-sys-color-primary)] ${testH > 0 ? 'rounded-b-xl mt-0.5' : 'rounded-xl'} transition-all duration-500 group-hover:brightness-110`}
                          title={`${day.videosCompleted} Videos`}
                        />
                      ) : null}
                      {/* If 0 tasks, show clean baseline dot */}
                      {totalTasks === 0 ? (
                        <div className="w-full h-1.5 rounded-full bg-[var(--md-sys-color-outline-variant)]/40 my-0.5" />
                      ) : null}
                    </div>

                    {/* Day Label */}
                    <div className="text-center w-full select-none">
                      <span className={`text-[10px] sm:text-[11px] font-bold block truncate leading-tight ${day.isToday ? 'text-[var(--md-sys-color-primary)] font-extrabold' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                        {day.dayName}
                      </span>
                      <span className="text-[8.5px] sm:text-[9.5px] text-[var(--md-sys-color-outline)] block leading-tight truncate">
                        {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Test Detail & Attempt Records Modal with Dual Mode Options (OMR + Online) */}
      <TestDetailModal
        test={detailedTest}
        onClose={() => setDetailedTest(null)}
        attempts={attempts}
        userProfile={userProfile}
        currentUser={currentUser}
        allTests={tests}
        onStartTest={(testToStart) => onStartTest(testToStart)}
        onStartOmrTest={(testToStart) => {
          if (onStartOmrTest) {
            return onStartOmrTest(testToStart);
          } else if (onOpenOmr) {
            onOpenOmr();
          }
        }}
        onViewAttemptResult={onViewAttemptResult}
      />
    </div>
  );
};

// Authentic Batch Card Component (Matches Activity & Performance / Test Card UI: rounded-3xl, border-0, default app buttons)
const M3BatchCard: React.FC<{ batch: Batch; onSelect: () => void; isEnrolled: boolean }> = ({
  batch,
  onSelect,
  isEnrolled,
}) => {
  return (
    <div
      onClick={onSelect}
      className="bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] overflow-hidden group cursor-pointer transition-all duration-200 flex flex-col justify-between"
    >
      <div
        className="relative w-full aspect-[1200/500] shrink-0 overflow-hidden bg-slate-900/10 dark:bg-black/40"
        style={{ aspectRatio: '1200 / 500' }}
      >
        <img
          src={batch.bannerUrl || batch.thumbnailUrl || DEFAULT_HIGH_RES_BANNER}
          alt={batch.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = DEFAULT_HIGH_RES_BANNER;
          }}
        />
        <span className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-2.5 py-1 rounded-full bg-white/90 dark:bg-black/75 backdrop-blur-md text-[#1f1f1f] dark:text-[#e3e3e3] text-[10px] sm:text-xs font-bold border-0 shadow-xs">
          {batch.category || 'Batch #01'}
        </span>
        {batch.isPublished === false ? (
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2.5 py-1 rounded-full bg-amber-500/90 backdrop-blur-md text-white font-bold text-[9px] sm:text-[10px] uppercase tracking-wider flex items-center space-x-1 border-0 shadow-xs">
            <Lock className="w-3 h-3" />
            <span>Draft</span>
          </span>
        ) : batch.allowGuestAccess ? (
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2.5 py-1 rounded-full bg-emerald-600/90 backdrop-blur-md text-white font-bold text-[9px] sm:text-[10px] uppercase tracking-wider flex items-center space-x-1 border-0 shadow-xs">
            <Sparkles className="w-3 h-3" />
            <span>Guest Pass</span>
          </span>
        ) : null}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-3 flex items-center justify-between text-[10px] sm:text-xs text-white">
          <span className="flex items-center space-x-1 bg-black/65 backdrop-blur-xs px-2.5 py-0.5 rounded-full font-bold">
            <Star className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-amber-400 fill-current" />
            <span>{batch.rating}</span>
          </span>
          <span className="flex items-center space-x-1 bg-black/65 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium">
            <Users className="w-3.5 h-3.5 text-slate-300" />
            <span>Interactive Cohort</span>
          </span>
        </div>
      </div>

      <div className="px-3.5 sm:px-4 pt-1.5 sm:pt-2 pb-1.5 sm:pb-2 flex-1 min-w-0 flex flex-col justify-between space-y-1 sm:space-y-1.5">
        <div>
          <h3 className="text-[14.5px] sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition leading-snug line-clamp-2">
            {batch.title}
          </h3>
          {batch.description && (
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
              {batch.description}
            </p>
          )}
        </div>

        {/* Instructor info with faculty profile icon */}
        <div className="flex items-center space-x-2 pt-0.5 border-0">
          <img
            src={getFacultyAvatarUrl(batch.instructor?.avatarUrl)}
            alt={batch.instructor?.name || 'Faculty'}
            className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full object-cover shrink-0 border-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/assets/default-profile.png';
            }}
          />
          <div className="text-[11px] sm:text-xs min-w-0">
            <p className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate leading-tight">{batch.instructor?.name || 'Elevate Faculty'}</p>
            <p className="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-zinc-400 truncate leading-tight">
              {batch.instructor?.designation || 'Master Educator'}
            </p>
          </div>
        </div>

        {/* Footer: Enrolled Status & Open Batch Button */}
        <div className="flex items-center justify-between pt-0.5">
          {isEnrolled ? (
            <div className="flex items-center space-x-1.5 text-[10.5px] sm:text-[11.5px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border-0">
              <CheckCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Full Access</span>
            </div>
          ) : (
            <div />
          )}

          {isEnrolled ? (
            <button
              type="button"
              className="h-7 sm:h-7.5 px-3 sm:px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] outline-none cursor-pointer active:scale-95 transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="h-7 sm:h-7.5 px-3 sm:px-3.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 border-0 outline-none cursor-pointer"
            >
              <Lock className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Locked</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
