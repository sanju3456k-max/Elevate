import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ChevronRight,
  Lock,
  Megaphone,
  Plus,
  X,
  Trash2,
  PinOff,
  Crown
} from 'lucide-react';
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
  orange: {
    container: 'bg-gradient-to-br from-[#fff7ed] via-[#ffedd5]/60 to-[#fed7aa]/20 dark:from-[#2a170a]/90 dark:via-[#1e130c] dark:to-[#17120e]',
    badge: 'bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400',
    batchBadge: 'bg-orange-500/15 dark:bg-orange-500/25 text-orange-700 dark:text-orange-300',
    dotActive: 'bg-orange-500 w-6',
  },
  blue: {
    container: 'bg-gradient-to-br from-[#eff6ff] via-[#dbeafe]/60 to-[#bfdbfe]/20 dark:from-[#0b172a]/90 dark:via-[#0c1422] dark:to-[#0f172a]',
    badge: 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-600 dark:text-blue-400',
    batchBadge: 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300',
    dotActive: 'bg-blue-500 w-6',
  },
  green: {
    container: 'bg-gradient-to-br from-[#ecfdf5] via-[#d1fae5]/60 to-[#a7f3d0]/20 dark:from-[#062419]/90 dark:via-[#0b1a14] dark:to-[#0d1f18]',
    badge: 'bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400',
    batchBadge: 'bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    dotActive: 'bg-emerald-500 w-6',
  },
  purple: {
    container: 'bg-gradient-to-br from-[#faf5ff] via-[#f3e8ff]/60 to-[#e9d5ff]/20 dark:from-[#220d33]/90 dark:via-[#190c24] dark:to-[#170e20]',
    badge: 'bg-purple-500/15 dark:bg-purple-500/25 text-purple-600 dark:text-purple-400',
    batchBadge: 'bg-purple-500/15 dark:bg-purple-500/25 text-purple-700 dark:text-purple-300',
    dotActive: 'bg-purple-500 w-6',
  },
  rose: {
    container: 'bg-gradient-to-br from-[#fff1f2] via-[#ffe4e6]/60 to-[#fecdd3]/20 dark:from-[#2e0b14]/90 dark:via-[#200c12] dark:to-[#1b0d12]',
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
  } = useApp();
  
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

  // Active Hero Announcement Banners for Home Feed (Filtered by student batch enrollment / master)
  const heroBanners = useMemo(() => {
    if (!announcements || announcements.length === 0) return [];
    return announcements.filter((ann) => {
      if (!ann.isHeroBanner) return false;
      if (isMaster) return true; // Master always sees all active banners
      if (!ann.batchId) return true; // Global broadcast
      return enrolledBatchIdSet.has(ann.batchId);
    });
  }, [announcements, isMaster, enrolledBatchIdSet]);

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
          setCurrentSlideIndex((prev) => (prev + 1) % heroBanners.length);
        } else {
          // Swipe right -> Prev slide (Infinite loop)
          setCurrentSlideIndex((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
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

  const currentTheme = BANNER_THEMES[activeHeroBanner?.themeColor || 'orange'] || BANNER_THEMES.orange;

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
    <div className="space-y-5 sm:space-y-7 pb-4 sm:pb-8 md:pb-12 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 sm:py-3">
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

      {/* Hero Announcement Banner Section (Auto-Advancing Infinite Carousel with Uniform Fixed-Height Template) */}
      {activeHeroBanner && (() => {
        const hasImage = Boolean(activeHeroBanner.imageUrl);
        const hasTitle = Boolean(activeHeroBanner.title?.trim());
        const hasMessage = Boolean(activeHeroBanner.message?.trim());
        const hasText = hasTitle || hasMessage;
        const isPosterOnly = hasImage && !hasText;

        return (
          <div className="space-y-2 mt-1">
            {/* Main Clean Banner Card with strictly UNIFORM fixed height across all templates */}
            <div
              id="hero-campus-banner-card"
              key={activeHeroBanner.id || currentSlideIndex}
              className={`relative rounded-[24px] overflow-hidden ${currentTheme.container} border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.5)] transition-all duration-300 select-none h-[220px] sm:h-[240px] md:h-[260px]`}
              onMouseEnter={() => setIsSlidePaused(true)}
              onMouseLeave={() => setIsSlidePaused(false)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* 1. CASE A: POSTER-ONLY TEMPLATE (Full-bleed image, no text) */}
              {isPosterOnly ? (
                <div className="relative w-full h-full">
                  <img
                    src={activeHeroBanner.imageUrl}
                    alt={activeHeroBanner.title || 'Campus Poster'}
                    className="w-full h-full object-cover rounded-[24px]"
                    loading="lazy"
                  />
                  {/* Floating Glass Header Badge - STRICTLY FOR MASTER CONSOLE ONLY */}
                  {isMaster && (
                    <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10.5px] font-black uppercase tracking-wider select-none border border-white/20 shadow-sm">
                        <Megaphone className="w-3 h-3 fill-current text-orange-400" />
                        <span>Campus Announcement</span>
                      </span>
                      {activeHeroBannerBatch && (
                        <span className="text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/20 px-2.5 py-0.5 rounded-full shadow-sm">
                          {activeHeroBannerBatch.title}
                        </span>
                      )}
                      {!activeHeroBanner.batchId && (
                        <span className="text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/20 px-2.5 py-0.5 rounded-full shadow-sm">
                          All Students
                        </span>
                      )}
                    </div>
                  )}

                  {/* Floating Master Admin Controls (Bottom Right) */}
                  {isMaster && (
                    <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-md">
                      <button
                        type="button"
                        onClick={() => updateAnnouncement(activeHeroBanner.id, { isHeroBanner: false })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white transition-colors cursor-pointer border-0 shadow-none outline-none"
                        title="Unpin from Home feed"
                      >
                        <PinOff className="w-3 h-3" />
                        <span>Unpin</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Delete this broadcast post?')) {
                            deleteAnnouncement(activeHeroBanner.id);
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
              ) : hasImage ? (
                /* 2. CASE B: COMBINED TEMPLATE (Text on top / image on bottom on mobile, Side-by-side on desktop) */
                <div className="w-full h-full">
                  {/* Mobile View (< md): Compact text header on top, Image fills the lower area */}
                  <div className="flex md:hidden flex-col h-full p-3.5 justify-between">
                    {/* Top Text Area */}
                    <div className="space-y-1 shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        {/* Tags strictly for Master Console Account only */}
                        {isMaster && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${currentTheme.badge} text-[10px] font-black uppercase tracking-wider select-none border-0`}
                            >
                              <Megaphone className="w-2.5 h-2.5 fill-current" />
                              <span>Campus Announcement</span>
                            </span>
                            {activeHeroBannerBatch && (
                              <span
                                className={`text-[10px] font-bold ${currentTheme.batchBadge} px-2 py-0.5 rounded-full border-0`}
                              >
                                {activeHeroBannerBatch.title}
                              </span>
                            )}
                            {!activeHeroBanner.batchId && (
                              <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full border-0">
                                All Students
                              </span>
                            )}
                          </div>
                        )}
                        {isMaster && (
                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            <button
                              type="button"
                              onClick={() => updateAnnouncement(activeHeroBanner.id, { isHeroBanner: false })}
                              className="p-1 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors border-0"
                              title="Unpin"
                            >
                              <PinOff className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Delete this broadcast post?')) {
                                  deleteAnnouncement(activeHeroBanner.id);
                                }
                              }}
                              className="p-1 rounded-full text-slate-500 hover:text-red-500 transition-colors border-0"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {hasTitle && (
                        <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#f3f4f6] leading-tight line-clamp-1">
                          {activeHeroBanner.title}
                        </h2>
                      )}
                      {hasMessage && (
                        <p className="text-[11.5px] text-slate-700 dark:text-zinc-300 line-clamp-1 leading-snug">
                          {activeHeroBanner.message}
                        </p>
                      )}
                    </div>

                    {/* Bottom Image Area */}
                    <div className="flex-1 min-h-0 w-full mt-1.5 rounded-xl overflow-hidden bg-black/5 dark:bg-black/30">
                      <img
                        src={activeHeroBanner.imageUrl}
                        alt={activeHeroBanner.title || 'Announcement'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  {/* Desktop / Tablet View (md+): Side-by-side with full height */}
                  <div className="hidden md:flex flex-row items-stretch justify-between h-full p-5 lg:p-6 gap-6">
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="space-y-2.5">
                        {/* Tags strictly for Master Console Account only */}
                        {isMaster && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${currentTheme.badge} text-[10.5px] font-black uppercase tracking-wider select-none border-0`}
                            >
                              <Megaphone className="w-3 h-3 fill-current" />
                              <span>Campus Announcement</span>
                            </span>
                            {activeHeroBannerBatch && (
                              <span
                                className={`text-[11px] font-bold ${currentTheme.batchBadge} px-2.5 py-0.5 rounded-full border-0`}
                              >
                                {activeHeroBannerBatch.title}
                              </span>
                            )}
                            {!activeHeroBanner.batchId && (
                              <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full border-0">
                                All Students
                              </span>
                            )}
                          </div>
                        )}

                        {hasTitle && (
                          <h2 className="text-lg lg:text-xl font-bold text-[#1f1f1f] dark:text-[#f3f4f6] leading-tight line-clamp-2">
                            {activeHeroBanner.title}
                          </h2>
                        )}

                        {hasMessage && (
                          <p className="text-xs sm:text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed line-clamp-3">
                            {activeHeroBanner.message}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>{activeHeroBanner.authorName || 'Master Academic Head'}</span>
                        </div>

                        {isMaster && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateAnnouncement(activeHeroBanner.id, { isHeroBanner: false })}
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
                                  deleteAnnouncement(activeHeroBanner.id);
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

                    <div className="w-72 lg:w-96 h-full rounded-2xl overflow-hidden bg-black/5 dark:bg-black/30 shrink-0">
                      <img
                        src={activeHeroBanner.imageUrl}
                        alt={activeHeroBanner.title || 'Announcement'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* 3. CASE C: TEXT-ONLY TEMPLATE (No image, fills uniform fixed height with comfortable vertical spacing) */
                <div className="flex flex-col justify-between h-full p-4.5 sm:p-5 md:p-6">
                  <div className="space-y-2">
                    {/* Tags strictly for Master Console Account only */}
                    {isMaster && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${currentTheme.badge} text-[10.5px] font-black uppercase tracking-wider select-none border-0`}
                        >
                          <Megaphone className="w-3 h-3 fill-current" />
                          <span>Campus Announcement</span>
                        </span>
                        {activeHeroBannerBatch && (
                          <span
                            className={`text-[11px] font-bold ${currentTheme.batchBadge} px-2.5 py-0.5 rounded-full border-0`}
                          >
                            {activeHeroBannerBatch.title}
                          </span>
                        )}
                        {!activeHeroBanner.batchId && (
                          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full border-0">
                            All Students
                          </span>
                        )}
                      </div>
                    )}

                    {hasTitle && (
                      <h2 className="text-[17px] sm:text-lg md:text-xl font-bold text-[#1f1f1f] dark:text-[#f3f4f6] leading-tight line-clamp-2">
                        {activeHeroBanner.title}
                      </h2>
                    )}

                    {hasMessage && (
                      <p className="text-xs sm:text-[13.5px] text-slate-700 dark:text-zinc-300 leading-relaxed line-clamp-3 sm:line-clamp-4">
                        {activeHeroBanner.message}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>{activeHeroBanner.authorName || 'Master Academic Head'}</span>
                    </div>

                    {isMaster && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateAnnouncement(activeHeroBanner.id, { isHeroBanner: false })}
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
                              deleteAnnouncement(activeHeroBanner.id);
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

            {/* Centered Minimal Carousel Pagination Bar (Pill for active, dots for inactive - Flipkart/Motorola/iPhone style) */}
            {heroBanners.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-1.5 pb-0.5">
                {heroBanners.map((b, idx) => {
                  const isActive = currentSlideIndex === idx;
                  return (
                    <button
                      key={b.id || idx}
                      type="button"
                      onClick={() => setCurrentSlideIndex(idx)}
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
                className="group cursor-pointer rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 overflow-hidden flex flex-row p-0 justify-between items-stretch relative"
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
                className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
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
                  <span>{activeView === 'my-batches' ? 'My Enrolled Batches' : 'Coaching Batches'}</span>
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
                  You are not currently enrolled in any coaching batches. Explore our available batches to get started.
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
        onStartTest={(testToStart) => {
          setDetailedTest(null);
          onStartTest(testToStart);
        }}
        onStartOmrTest={(testToStart) => {
          setDetailedTest(null);
          if (onStartOmrTest) {
            onStartOmrTest(testToStart);
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
      <div className="relative w-full aspect-video shrink-0 overflow-hidden bg-slate-900/10 dark:bg-black/40">
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

      <div className="p-4 sm:p-5 flex-1 min-w-0 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition leading-snug line-clamp-2">
            {batch.title}
          </h3>
          {batch.description && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mt-1">
              {batch.description}
            </p>
          )}
        </div>

        {/* Instructor info with faculty profile icon */}
        <div className="flex items-center space-x-2.5 pt-2.5 border-t border-[var(--md-sys-color-outline-variant)]/20">
          <img
            src={getFacultyAvatarUrl(batch.instructor?.avatarUrl)}
            alt={batch.instructor?.name || 'Faculty'}
            className="w-8 h-8 rounded-full object-cover shrink-0 border-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/assets/default-profile.png';
            }}
          />
          <div className="text-[11px] sm:text-xs min-w-0">
            <p className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">{batch.instructor?.name || 'Elevate Faculty'}</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
              {batch.instructor?.designation || 'Master Educator'}
            </p>
          </div>
        </div>

        {/* Footer: Enrolled Status & Open Batch Button */}
        <div className="flex items-center justify-between pt-1">
          {isEnrolled ? (
            <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border-0">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Full Access</span>
            </div>
          ) : (
            <div />
          )}

          {isEnrolled ? (
            <button
              type="button"
              className="h-9 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold flex items-center space-x-1.5 border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] outline-none cursor-pointer active:scale-95 transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="h-9 px-4 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-xs font-bold flex items-center space-x-1.5 border-0 outline-none cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Locked</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
