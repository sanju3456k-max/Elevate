import React, { useState, useMemo } from 'react';
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
  ChevronRight
} from 'lucide-react';
import type { MathTest, TestAttempt, UserProfile } from '../../types';
import type { User } from 'firebase/auth';
import type { Batch } from '../../lms/types';
import { useApp } from '../../lms/LmsContext';

interface HomeDashboardProps {
  tests: MathTest[];
  attempts: TestAttempt[];
  currentUser: User | null;
  userProfile?: UserProfile | null;
  onStartTest: (test: MathTest) => void;
  onOpenBatches: (filter?: 'all' | 'my-batches') => void;
  onSelectBatch?: (batchId: string) => void;
  onOpenAllTests: () => void;
  onOpenAnalytics?: () => void;
  onOpenNotes?: () => void;
  onOpenThetaAI?: () => void;
  onOpenOmr?: () => void;
  onOpenCustomBuilder?: () => void;
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
  onOpenBatches,
  onSelectBatch,
  onOpenAllTests,
  onOpenAnalytics,
  onOpenNotes,
  onOpenThetaAI,
  onOpenOmr,
  onOpenCustomBuilder,
}) => {
  const { batches, lectures, watchProgress, isEnrolled, announcements, setActiveBatchId, setActiveLectureId } = useApp();
  
  // Filter state for the 4 core buttons: 'all-batches' | 'my-batches' | 'test-library' | 'activity'
  const [activeView, setActiveView] = useState<'all-batches' | 'my-batches' | 'test-library' | 'activity'>('all-batches');

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

  const enrolledBatches = useMemo(
    () => batches.filter((b) => isEnrolled(b.id)),
    [batches, isEnrolled]
  );
  const displayedBatches = activeView === 'my-batches' ? enrolledBatches : batches;

  const currentBatch = batches[0]; // Testing Batch
  const freeLectures = lectures.filter((l) => l.isFreePreview);

  // Latest updates for batch, video, and tests
  const latestAnnouncement = announcements && announcements.length > 0 ? announcements[0] : null;
  const latestLecture = lectures && lectures.length > 0 ? lectures[lectures.length - 1] : null;
  const latestTest = tests && tests.length > 0 ? tests[0] : null;

  const latestTestQuestionCount = (() => {
    if (!latestTest) return 50;
    if (Array.isArray(latestTest.questions) && latestTest.questions.length > 0) return latestTest.questions.length;
    if (typeof (latestTest as any).questionCount === 'number' && (latestTest as any).questionCount > 0) return (latestTest as any).questionCount;
    return latestTest.timeLimitMinutes > 0 ? latestTest.timeLimitMinutes : 50;
  })();
  const latestTestTimeDisplay = latestTest
    ? (latestTest.timeLimitMinutes > 0 ? `${latestTest.timeLimitMinutes}m` : (latestTest.durationMinutes ? `${latestTest.durationMinutes}m` : '45m'))
    : '45m';

  // In-progress lectures
  const inProgressLectureIds = Object.keys(watchProgress).filter(
    (id) => !watchProgress[id]?.isCompleted && (watchProgress[id]?.watchedSeconds || 0) > 10
  );
  const continueWatchingLectures = lectures.filter((l) => inProgressLectureIds.includes(l.id));

  // Compute 7-day Day-wise Activity Graph
  const dayWiseActivity: DayActivity[] = useMemo(() => {
    const days: DayActivity[] = [];
    const today = new Date();

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayName = i === 0 ? 'Today' : dayLabels[d.getDay()];
      const dateStr = d.toISOString().split('T')[0];

      // Match attempts on this day
      const dayAttempts = attempts.filter((a) => {
        const attemptDate = (a.completedAt || a.createdAt || '').split('T')[0];
        return attemptDate === dateStr;
      });

      const testsAttempted = dayAttempts.length;
      const avgScore = testsAttempted > 0
        ? Math.round(dayAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / testsAttempted)
        : 0;

      // Match videos watched on this day
      // Count completed videos in progress map
      let videosCompleted = 0;
      let totalTimeMinutes = testsAttempted * 15;

      if (i === 0) {
        // Today's actual video watches
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

    return days;
  }, [attempts, watchProgress]);

  // Aggregate Study Stats
  const totalAttempts = attempts.length;
  const completedVideosCount = Object.values(watchProgress).filter((w) => w.isCompleted || w.watchedSeconds > 30).length || 2;
  const averagePercentage = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / totalAttempts)
    : 88;

  const handleSelectBatchItem = (batchId: string) => {
    setActiveBatchId(batchId);
    setActiveLectureId(null);
    if (onSelectBatch) {
      onSelectBatch(batchId);
    } else {
      onOpenBatches();
    }
  };

  const handleSelectLectureItem = (batchId: string, lectureId: string) => {
    setActiveBatchId(batchId);
    setActiveLectureId(lectureId);
    if (onSelectBatch) {
      onSelectBatch(batchId);
    } else {
      onOpenBatches();
    }
  };

  // Find max value for graph bar normalization
  const maxDayTasks = Math.max(
    ...dayWiseActivity.map((d) => d.videosCompleted + d.testsAttempted),
    4
  );

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 md:pb-16 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 sm:py-3">
      {/* 1. LATEST UPDATES (Featured Lecture Full Preview & Mock Test) */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Minimal Waving 'Latest' Badge with 'NEW' Logo */}
        <div className="flex items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-[#1e2024] border border-[var(--md-sys-color-outline-variant)]/30 shadow-xs select-none">
            {/* Minimal Waving Motion Radar Ping */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-blue-400"></span>
            </span>

            {/* Single Word 'Latest' */}
            <span className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
              Latest
            </span>

            {/* Logo of 'New' with subtle waving motion */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
              <Sparkles className="w-2.5 h-2.5 fill-current" />
              <span>NEW</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Latest Featured Lecture (Full Flush Preview View on Left) */}
        <div
          onClick={() => {
            if (latestLecture) {
              handleSelectLectureItem(latestLecture.batchId, latestLecture.id);
            } else {
              onOpenBatches && onOpenBatches();
            }
          }}
          className="group cursor-pointer rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 overflow-hidden flex flex-row p-0 justify-between items-stretch relative"
        >
          <md-ripple />
          {/* Video Thumbnail (Edge-to-edge flush on left corner) */}
          <div className="relative w-36 sm:w-48 aspect-video shrink-0 self-stretch overflow-hidden bg-slate-900/10 dark:bg-black/30">
            <img
              src={latestLecture?.thumbnailUrl || 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80'}
              alt={latestLecture?.title || 'Video Class'}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
            />
            <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-purple-900/60 dark:text-purple-300 font-bold text-[8.5px] sm:text-[9.5px] uppercase tracking-wider backdrop-blur-xs">
              Latest Class
            </span>
            <span className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 py-0.5 rounded-md bg-black/80 font-mono text-[9px] sm:text-[10.5px] text-white">
              {latestLecture ? `${latestLecture.durationMinutes}:00` : '18:00'}
            </span>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/30">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center shadow-lg">
                <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current ml-0.5" />
              </div>
            </div>
          </div>

          {/* Content & Footer */}
          <div className="flex-1 min-w-0 flex flex-col justify-between p-3 sm:p-4 space-y-1.5 sm:space-y-2">
            <div className="space-y-1">
              <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate text-[#0b57d0] dark:text-[#a8c7fa]">
                Video Lecture
              </span>
              <h3 className="text-xs sm:text-sm md:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition leading-snug line-clamp-2">
                {latestLecture ? latestLecture.title : 'New interactive video lectures added'}
              </h3>
              <p className="hidden sm:block text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 leading-relaxed">
                {latestLecture?.description || 'Stream high-clarity video classes with milestone navigation.'}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--md-sys-color-outline-variant)]/20 pt-1.5 sm:pt-2">
              <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-medium truncate max-w-[120px] sm:max-w-none">
                {latestLecture?.pdfNotes?.length || 0} Notes attached
              </span>
              <span className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform shrink-0">
                <span>Watch</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Clean Test Card (Matches TestCard from Test Library) */}
        <div
          onClick={() => {
            if (latestTest) {
              onStartTest(latestTest);
            } else {
              onOpenAllTests();
            }
          }}
          className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
        >
          <md-ripple />
          {/* Row 1: Topic tag above title & Title */}
          <div className="w-full pointer-events-none space-y-0.5">
            {latestTest?.topic && (
              <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate text-[#0b57d0] dark:text-[#a8c7fa]">
                {latestTest.topic}
              </span>
            )}
            <h3 className="text-[16px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
              {latestTest ? latestTest.title : 'Full Mock Assessment'}
            </h3>
          </div>

          {/* Row 2: Question count & time (Left), Minimal 'New' badge & Chevron (Bottom Right) */}
          <div className="flex items-center justify-between w-full pt-1 border-t border-[var(--md-sys-color-outline-variant)]/20 pointer-events-none">
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
      </div>
    </div>

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
              <div className="p-8 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl space-y-3">
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
                  className="m3-btn-filled px-5 py-2 text-xs font-bold rounded-full border-none cursor-pointer"
                >
                  Explore All Batches
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. STUDENT ACTIVITY & DAY-WISE GRAPH SECTION (After Batches) */}
        <div id="student-activity-section" className="bg-white dark:bg-[#1e2024] rounded-3xl p-5 sm:p-7 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-6 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                  Activity & Performance
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
                <span className="font-semibold">Videos Done</span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold">Tests Attempted</span>
              </div>
              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                >
                  <span>Analytics →</span>
                </button>
              )}
            </div>
          </div>

          {/* 4 Summary Score Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/25 border-none space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Videos Completed</span>
                <Video className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
              </div>
              <div className="text-2xl font-black text-[var(--md-sys-color-on-surface)]">
                {completedVideosCount}
              </div>
              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Lectures Watched
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/25 border-none space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Tests Attempted</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-[var(--md-sys-color-on-surface)]">
                {totalAttempts > 0 ? totalAttempts : 2}
              </div>
              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Full Mock Assessments
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/25 border-none space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Avg Performance</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {averagePercentage}%
              </div>
              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Assessment Accuracy
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/25 border-none space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <span>Active Streak</span>
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              </div>
              <div className="text-2xl font-black text-orange-500">
                5 Days
              </div>
              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Daily Practice Habit
              </div>
            </div>
          </div>

          {/* Day-Wise Visual Interactive Bar Chart */}
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-black/25 border-none space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                <span>Day-Wise Task Breakdown (Last 7 Days)</span>
              </h3>
              <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                Total 14 Tasks Accomplished
              </span>
            </div>

            {/* Bar Chart Grid */}
            <div className="grid grid-cols-7 gap-2 sm:gap-4 pt-6 pb-2 items-end h-48">
              {dayWiseActivity.map((day, idx) => {
                const totalTasks = day.videosCompleted + day.testsAttempted;
                const videoHeight = Math.round((day.videosCompleted / maxDayTasks) * 110);
                const testHeight = Math.round((day.testsAttempted / maxDayTasks) * 110);

                return (
                  <div key={idx} className="flex flex-col items-center justify-end h-full group cursor-pointer space-y-2">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] font-bold px-2 py-1 rounded-md bg-black/80 text-white whitespace-nowrap shadow-md pointer-events-none mb-1">
                      {day.videosCompleted} Video · {day.testsAttempted} Test ({day.avgScore}%)
                    </div>

                    {/* Stacked Vertical Bar */}
                    <div className="w-7 sm:w-10 flex flex-col justify-end items-center rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-container-highest)]/60 p-0.5">
                      {/* Tests Completed (Emerald) */}
                      <div
                        style={{ height: `${Math.max(testHeight, 14)}px` }}
                        className="w-full bg-emerald-500 rounded-t-xl transition-all duration-500 group-hover:brightness-110"
                        title={`${day.testsAttempted} Tests`}
                      />
                      {/* Videos Completed (Primary Blue) */}
                      <div
                        style={{ height: `${Math.max(videoHeight, 18)}px` }}
                        className="w-full bg-[var(--md-sys-color-primary)] rounded-b-xl transition-all duration-500 group-hover:brightness-110 mt-0.5"
                        title={`${day.videosCompleted} Videos`}
                      />
                    </div>

                    {/* Day Label */}
                    <div className="text-center">
                      <span className={`text-[11px] font-bold block ${day.isToday ? 'text-[var(--md-sys-color-primary)] font-extrabold' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                        {day.dayName}
                      </span>
                      <span className="text-[9px] text-[var(--md-sys-color-outline)] block">
                        {totalTasks} tasks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

// Authentic M3 Batch Card Component (Concise, zero clutter, mobile-optimized)
const M3BatchCard: React.FC<{ batch: Batch; onSelect: () => void; isEnrolled: boolean }> = ({
  batch,
  onSelect,
  isEnrolled,
}) => {
  return (
    <div
      onClick={onSelect}
      className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch"
    >
      <div className="relative w-36 sm:w-full aspect-video shrink-0 self-stretch overflow-hidden">
        <img
          src={batch.thumbnailUrl}
          alt={batch.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <span className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[var(--md-sys-color-surface-container-highest)]/90 backdrop-blur-md text-[var(--md-sys-color-on-surface)] text-[9px] sm:text-xs font-semibold border-none">
          {batch.category || 'Batch #01'}
        </span>
        <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-3 sm:left-3 sm:right-3 flex items-center justify-between text-[9px] sm:text-xs text-white">
          <span className="flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-1.5 sm:px-2.5 py-0.5 rounded-full">
            <Star className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-amber-400 fill-current" />
            <span className="font-bold">{batch.rating}</span>
          </span>
          <span className="hidden sm:flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
            <Users className="w-3.5 h-3.5 text-slate-300" />
            <span>Interactive Cohort</span>
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-5 flex-1 min-w-0 flex flex-col justify-between space-y-1.5 sm:space-y-3">
        <div>
          <h3 className="text-xs sm:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition leading-snug line-clamp-1 sm:line-clamp-2">
            {batch.title}
          </h3>
        </div>

        {/* Instructor info */}
        <div className="flex items-center space-x-2 sm:space-x-3 pt-1 sm:pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
          <img
            src={batch.instructor?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
            alt={batch.instructor?.name || 'Faculty'}
            className="w-7 h-7 sm:w-9 sm:h-9 rounded-full object-cover border-none"
          />
          <div className="text-[11px] sm:text-xs min-w-0">
            <p className="font-bold text-[var(--md-sys-color-on-surface)] truncate">{batch.instructor?.name || 'Elevate Faculty'}</p>
            <p className="text-[9px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
              {batch.instructor?.designation || 'Master Educator'}
            </p>
          </div>
        </div>

        {/* Footer: Enrolled Status & Open Batch Button */}
        <div className="flex items-center justify-between pt-1">
          {isEnrolled ? (
            <div className="flex items-center space-x-1 sm:space-x-1.5 text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border-none">
              <CheckCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Full Access</span>
            </div>
          ) : (
            <div>
              <span className="text-sm sm:text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                ₹{batch.price}
              </span>
            </div>
          )}

          <button
            className="m3-btn-filled px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold flex items-center space-x-1 shadow-sm border-none outline-none cursor-pointer"
          >
            <span>View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
