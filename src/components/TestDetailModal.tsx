import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  Share2,
  Check,
  Trophy,
  X,
  FileCode,
  Clock,
  Award,
  TrendingUp,
  BookOpen,
  Calendar,
  Target,
  Percent,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Bookmark,
  BarChart2,
  Eye,
  RotateCcw,
  FileCheck2,
  Play,
} from 'lucide-react';
import type { MathTest, TestAttempt, UserProfile, TestHistoryEntry } from '../types';
import type { User } from 'firebase/auth';
import { getTestDurationMinutes } from '../utils/testFormatConverter';
import { getCachedFullTest, getLocalLeaderboardEntries, getSynchronousCachedLeaderboard } from '../lib/firebase';
import { isAttemptOmrMode, pruneAttemptsToFirstAndLast } from '../lib/storage';
import { createShareUrlAsync, formatTestShareMessage } from '../utils/shareUtils';
import { TestLeaderboardModal } from './TestLeaderboardModal';
import { TestReportAnalysisView } from './TestReportAnalysisView';
import { APP_STYLES } from './ui/AppStyles';
import { useBackHandler } from '../hooks/useBackNavigation';
import { studioBackdropVariants, studioModalVariants, gpuAcceleratedStyle } from '../lib/animationConfig';

export interface TestDetailModalProps {
  test: MathTest | null;
  onClose: () => void;
  attempts?: TestAttempt[];
  userProfile?: UserProfile | null;
  currentUser?: User | null;
  allTests?: MathTest[];
  onStartTest: (test: MathTest, mode: 'timed' | 'practice') => void;
  onStartOmrTest?: (test: MathTest) => void;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
}

export const TestDetailModal: React.FC<TestDetailModalProps> = ({
  test,
  onClose,
  attempts = [],
  userProfile,
  currentUser = null,
  allTests = [],
  onStartTest,
  onStartOmrTest,
  onViewAttemptResult,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [selectedReportAttempt, setSelectedReportAttempt] = useState<TestAttempt | null>(null);

  // Sync mobile status bar theme-color
  useEffect(() => {
    if (!test) return;
    const syncStatusBar = () => {
      try {
        const isDark = document.documentElement.classList.contains('dark');
        const targetColor = isDark ? '#0b0c10' : '#e5e9f0';
        let meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
          meta.setAttribute('content', targetColor);
        } else {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'theme-color');
          meta.setAttribute('content', targetColor);
          document.head.appendChild(meta);
        }
      } catch (err) {
        console.warn('Status bar sync error in TestDetailModal:', err);
      }
    };

    syncStatusBar();
    const observer = new MutationObserver(() => syncStatusBar());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, [test]);

  // Back Navigation handler for the modal
  useBackHandler({
    isOpen: !!test && !isLeaderboardOpen && !selectedReportAttempt,
    onBack: onClose,
    priority: 35,
    id: 'test_detail_modal',
  });

  // Group attempts by testId, normalized test identifier, and test title
  const attemptsByTestId = useMemo(() => {
    const map = new Map<string, TestAttempt[]>();
    attempts.forEach((att) => {
      if (!att) return;
      if (att.testId) {
        const list = map.get(att.testId) || [];
        list.push(att);
        map.set(att.testId, list);

        const normId = att.testId.replace(/[-_]/g, '').toLowerCase();
        if (normId !== att.testId) {
          const normList = map.get(normId) || [];
          normList.push(att);
          map.set(normId, normList);
        }
      }
      if (att.testTitle) {
        const titleKey = `title:${att.testTitle.trim().toLowerCase()}`;
        const titleList = map.get(titleKey) || [];
        titleList.push(att);
        map.set(titleKey, titleList);
      }
    });

    map.forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(a.completedAt || a.createdAt || 0).getTime() -
          new Date(b.completedAt || b.createdAt || 0).getTime()
      );
    });
    return map;
  }, [attempts]);

  // Comprehensive resolver for test attempts
  const testAttempts = useMemo(() => {
    if (!test) return [];

    let cloudHistoryEntry: TestHistoryEntry | null = null;
    if (userProfile?.testHistories) {
      const safeKey = (test.id || '').replace(/[./[\]*~#$]/g, '_');
      if (userProfile.testHistories[safeKey]) {
        cloudHistoryEntry = userProfile.testHistories[safeKey];
      } else if (userProfile.testHistories[test.id]) {
        cloudHistoryEntry = userProfile.testHistories[test.id];
      } else {
        const historiesList = (Object.values(userProfile.testHistories) as (TestHistoryEntry | undefined)[]) || [];
        const found = historiesList.find((e): e is TestHistoryEntry => {
          if (!e) return false;
          if (e.testId === test.id) return true;
          if (e.testTitle && test.title && e.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase())
            return true;
          return false;
        });
        if (found) cloudHistoryEntry = found;
      }
    }

    const directMatches = attemptsByTestId.get(test.id) || [];
    const normId = test.id ? test.id.replace(/[-_]/g, '').toLowerCase() : '';
    const normMatches = normId ? attemptsByTestId.get(normId) || [] : [];
    const titleKey = test.title ? `title:${test.title.trim().toLowerCase()}` : '';
    const titleMatches = titleKey ? attemptsByTestId.get(titleKey) || [] : [];

    const fallbackMatches = (attempts || []).filter((att) => {
      if (!att) return false;
      const attId = (att.testId || '').trim();
      const attNormId = attId.replace(/[-_]/g, '').toLowerCase();
      if (attId && test.id && (attId === test.id || attNormId === normId)) return true;
      if (att.testTitle && test.title && att.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase())
        return true;
      return false;
    });

    const combinedMap = new Map<string, TestAttempt>();
    if (cloudHistoryEntry?.firstAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.firstAttempt.id, cloudHistoryEntry.firstAttempt);
    }
    if (cloudHistoryEntry?.lastAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.lastAttempt.id, cloudHistoryEntry.lastAttempt);
    }

    [...directMatches, ...normMatches, ...titleMatches, ...fallbackMatches].forEach((att) => {
      if (att && att.id && !combinedMap.has(att.id)) {
        combinedMap.set(att.id, att);
      }
    });

    const list = Array.from(combinedMap.values());
    const { pruned } = pruneAttemptsToFirstAndLast(list);
    pruned.sort(
      (a, b) =>
        new Date(a.completedAt || a.createdAt || 0).getTime() -
        new Date(b.completedAt || b.createdAt || 0).getTime()
    );
    return pruned;
  }, [test, userProfile, attempts, attemptsByTestId]);

  if (!test) return null;

  const isRemedial = Boolean((test as any).isPersonalizedRemedial || test.topic === 'Personalized Test');

  // Share handler
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const shareUrl = await createShareUrlAsync(test);
      const text = formatTestShareMessage(test.title, shareUrl);
      if (navigator.share) {
        await navigator.share({ title: test.title, text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  // Rank calculator for first attempt
  const getAttemptRank = (att: TestAttempt) => {
    try {
      const targetId = test.id;
      const cached = getSynchronousCachedLeaderboard(targetId) || getLocalLeaderboardEntries(targetId);
      let entries: any[] = [];
      if (Array.isArray(cached)) {
        entries = cached;
      } else if (cached && Array.isArray((cached as any).entries)) {
        entries = (cached as any).entries;
      }
      if (entries.length === 0) return null;
      const myEntry = entries.find((e) => e.userId === att.userId || e.userName === att.userName);
      if (myEntry) {
        return { rank: myEntry.rank, total: entries.length };
      }
    } catch {}
    return null;
  };

  const safeKey = (test.id || '').replace(/[./[\]*~#$]/g, '_');
  const allHistories = (Object.values(userProfile?.testHistories || {}) as (TestHistoryEntry | undefined)[]) || [];
  const cloudHistory =
    userProfile?.testHistories?.[safeKey] ||
    allHistories.find((e): e is TestHistoryEntry => {
      if (!e) return false;
      return (
        e.testId === test.id ||
        Boolean(e.testTitle && test.title && e.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase())
      );
    }) ||
    null;

  const recordedAttemptCount = Math.max(cloudHistory?.attemptCount || 0, testAttempts.length);
  const first = testAttempts.length > 0 ? testAttempts[0] : cloudHistory?.firstAttempt || null;
  const rawLast = testAttempts.length > 1 ? testAttempts[testAttempts.length - 1] : cloudHistory?.lastAttempt || null;
  const hasMultipleAttempts = Boolean(first && rawLast && first.id !== rawLast.id && recordedAttemptCount > 1);
  const last = hasMultipleAttempts ? rawLast : null;
  const isAttempted = recordedAttemptCount > 0;

  const questionCount = (() => {
    if (Array.isArray(test.questions) && test.questions.length > 0) return test.questions.length;
    if (typeof test.questionCount === 'number' && test.questionCount > 0) return test.questionCount;
    try {
      const cached = getCachedFullTest(test.id);
      if (cached?.questions?.length && cached.questions.length > 0) return cached.questions.length;
      if (cached?.questionCount && cached.questionCount > 0) return cached.questionCount;
    } catch {}
    return test.timeLimitMinutes > 0 ? test.timeLimitMinutes : 50;
  })();

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Recent attempt';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recent attempt';
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const day = d.getDate();
      const yr = d.getFullYear();
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${month} ${day}, ${yr} • ${time}`;
    } catch {
      return 'Recent attempt';
    }
  };

  const formatAttemptDuration = (attemptItem: TestAttempt) => {
    let sec = attemptItem.timeSpentSeconds;
    if ((!sec || sec <= 0) && attemptItem.completedAt && attemptItem.createdAt) {
      const diff = Math.round(
        (new Date(attemptItem.completedAt).getTime() - new Date(attemptItem.createdAt).getTime()) / 1000
      );
      if (diff > 0 && diff < 86400) {
        sec = diff;
      }
    }
    if (!sec || isNaN(sec) || sec <= 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  };

  const renderAttemptCard = (attemptItem: TestAttempt, label: string, isFirstAttempt: boolean = true) => {
    const answersList = Object.values(attemptItem.answers || {}) as {
      selectedOption?: string;
      isCorrect?: boolean;
    }[];

    const totalQs = test.questions?.length || test.questionCount || answersList.length || 10;
    const correctCount =
      answersList.filter((a) => a.isCorrect).length ||
      Math.round((attemptItem.score / (attemptItem.totalPoints || 1)) * totalQs);
    const answeredCount =
      answersList.filter((a) => a.selectedOption && a.selectedOption.trim() !== '').length || correctCount;
    const wrongCount = Math.max(0, answeredCount - correctCount);
    const unansweredCount = Math.max(0, totalQs - answeredCount);
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    const precision =
      attemptItem.percentage !== undefined
        ? attemptItem.percentage
        : totalQs > 0
        ? Math.round((correctCount / totalQs) * 100)
        : 0;
    const isOmr = isAttemptOmrMode(attemptItem);
    const modeLabel = isOmr ? 'OMR' : 'Online';
    const timeTakenStr = formatAttemptDuration(attemptItem);
    const testRank = !isRemedial && isFirstAttempt ? getAttemptRank(attemptItem) : null;

    return (
      <div
        key={label}
        className="p-4 sm:p-5 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3 transition-all flex flex-col justify-between"
      >
        <div className="space-y-2.5">
          {/* Row 1: Attempt Label & Mode Tag */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-widest text-[#5e5e5e] dark:text-[#9aa0a6] uppercase truncate flex-1 min-w-0">
              {label}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] sm:text-[11px] font-bold uppercase shrink-0 border-0 outline-none ${
                isOmr
                  ? 'bg-[#ffe8d9] dark:bg-[#432313] text-[#ea580c] dark:text-[#ff9d5c]'
                  : 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]'
              }`}
            >
              {modeLabel}
            </span>
          </div>

          {/* Row 2: Date, Accuracy, Precision */}
          <div className="flex items-center gap-2 sm:gap-2.5 text-[#444746] dark:text-[#c4c7c5] text-[11px] font-bold flex-wrap">
            <div className="flex items-center gap-1.5" title="Attempt Date & Time">
              <Calendar className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
              <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                {formatDateTime(attemptItem.completedAt || attemptItem.createdAt)}
              </span>
            </div>
            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>
            <div className="flex items-center gap-1 text-[#1f1f1f] dark:text-[#e3e3e3]" title="Accuracy">
              <Target className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
              <span>Acc</span>
              <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{accuracy}%</strong>
            </div>
            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>
            <div
              className="flex items-center gap-1 text-[#1f1f1f] dark:text-[#e3e3e3]"
              title="Precision / Overall Percentage"
            >
              <Percent className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 stroke-[2.2] shrink-0" />
              <span>Precision</span>
              <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{precision}%</strong>
            </div>
          </div>

          {/* Row 3: Correct, Wrong, Skipped */}
          <div className="flex items-center gap-2 sm:gap-2.5 text-[#1f1f1f] dark:text-[#e3e3e3] text-[11px] font-medium pt-0.5 flex-wrap">
            <div className="flex items-center gap-1.5" title="Correct Questions">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
              <span>
                <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{correctCount}</strong>{' '}
                <span>correct</span>
              </span>
            </div>
            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>
            <div className="flex items-center gap-1.5" title="Incorrect Questions">
              <XCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 stroke-[2.2] shrink-0" />
              <span>
                <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{wrongCount}</strong>{' '}
                <span>wrong</span>
              </span>
            </div>
            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">•</span>
            <div className="flex items-center gap-1.5" title="Skipped / Unattempted Questions">
              <MinusCircle className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] stroke-[2.2] shrink-0" />
              <span>
                <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{unansweredCount}</strong>{' '}
                <span>skipped</span>
              </span>
            </div>
          </div>

          <div className="w-full h-px bg-slate-100 dark:bg-zinc-800/80 !mt-1.5 !mb-1.5" />

          {/* Row 4: Score, Time, Rank & Action Buttons */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 !mt-0 flex-wrap">
            <div className="inline-flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#edf2f9] dark:bg-[#26282e] border-0 shrink-0 text-[10px] sm:text-xs">
              {testRank && (
                <>
                  <div
                    className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold shrink-0"
                    title={`Standing: Rank ${testRank.rank}${testRank.total ? ` of ${testRank.total}` : ''}`}
                  >
                    <Trophy className="w-3 h-3 text-amber-500 stroke-[2.2] shrink-0" />
                    <span>Rank {testRank.rank}</span>
                  </div>
                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-zinc-600 shrink-0" />
                </>
              )}

              {timeTakenStr && (
                <>
                  <div
                    className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 font-bold font-mono shrink-0"
                    title="Time Taken"
                  >
                    <Clock className="w-3 h-3 text-purple-600 dark:text-purple-400 stroke-[2.2] shrink-0" />
                    <span>{timeTakenStr}</span>
                  </div>
                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-zinc-600 shrink-0" />
                </>
              )}

              <div className="inline-flex items-center gap-1 sm:gap-1.5 font-extrabold shrink-0" title="Score">
                <Bookmark className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                <span className="text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold text-[9.5px] sm:text-[10.5px]">
                  Score:
                </span>
                <span className="text-[11px] sm:text-sm font-black font-mono tracking-tight text-[#0b57d0] dark:text-[#a8c7fa]">
                  {correctCount}/{totalQs}
                </span>
              </div>
            </div>

            {/* Action Buttons: Analysis & Solutions */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedReportAttempt(attemptItem);
                }}
                className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1 bg-[#d3e3fd] hover:bg-[#c2e7ff] dark:bg-[#004a77] dark:hover:bg-[#005a92] active:scale-95 text-[#041e49] dark:text-[#c2e7ff] text-[10.5px] sm:text-xs font-bold rounded-full border-0 transition-all cursor-pointer whitespace-nowrap shrink-0"
                title="View detailed test report & analysis"
                aria-label="Analysis"
              >
                <BarChart2 className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                <span className="hidden sm:inline">Analysis</span>
              </button>

              {onViewAttemptResult && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onViewAttemptResult(attemptItem);
                  }}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1 bg-[#0b57d0] hover:bg-[#0842a0] text-white active:scale-95 text-[10.5px] sm:text-xs font-bold rounded-full border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] transition-all cursor-pointer whitespace-nowrap shrink-0"
                  title="View detailed test solutions"
                  aria-label="Solutions"
                >
                  <Eye className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                  <span>Solutions</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const modalContent = (
    <AnimatePresence>
      <motion.div
        variants={studioBackdropVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={gpuAcceleratedStyle}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex flex-col p-0 cursor-default"
        onClick={onClose}
      >
        <motion.div
          variants={studioModalVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className="bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] w-full h-full max-w-none max-h-none rounded-none flex flex-col shadow-none overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="px-4 sm:px-6 md:px-8 pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.55rem)] md:pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.6rem)] pb-2.5 flex items-center justify-between gap-4 bg-transparent border-0 shadow-none shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <button
                type="button"
                id="close-detailed-modal-btn"
                onClick={onClose}
                className="p-1 -ml-1 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 border-none border-0 bg-transparent shadow-none outline-none"
                title="Back"
                aria-label="Back"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
              </button>
              <div className="min-w-0">
                {isRemedial && (
                  <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 block truncate">
                    Personalized Test
                  </span>
                )}
                {(test as any).batchTitle && (
                  <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
                    Batch: {(test as any).batchTitle}
                  </span>
                )}
                <h2 className="font-bold text-base sm:text-xl text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight truncate">
                  {test.title}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <md-icon-button
                id="share-detailed-test-modal-btn"
                onClick={handleShare}
                title={isCopied ? 'Share link copied!' : 'Share Test Link'}
              >
                {isCopied ? (
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Share2 className="w-5 h-5 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                )}
              </md-icon-button>

              {!isRemedial && (
                <md-icon-button
                  id="leaderboard-detailed-test-modal-btn"
                  onClick={() => setIsLeaderboardOpen(true)}
                  title="View Test Leaderboard & Rankings"
                >
                  <Trophy className="w-5 h-5 text-amber-500 hover:text-amber-600 transition-colors" />
                </md-icon-button>
              )}
            </div>
          </div>

          {/* Full-View Scrollable Content */}
          <div className="p-3.5 sm:p-6 space-y-4 overflow-y-auto flex-1 max-w-7xl mx-auto w-full">
            {/* Overview Tiles Card */}
            <div className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200">
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
                {/* Questions */}
                <div className="p-3 sm:p-4 rounded-[20px] sm:rounded-[22px] bg-transparent flex flex-col items-center justify-center text-center transition-all hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                  <div className="text-[9.5px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-0.5 flex items-center justify-center gap-1">
                    <FileCode className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Questions</span>
                  </div>
                  <div className="text-lg sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                    {questionCount}
                  </div>
                </div>

                {/* Time */}
                <div className="p-3 sm:p-4 rounded-[20px] sm:rounded-[22px] bg-transparent flex flex-col items-center justify-center text-center transition-all hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                  <div className="text-[9.5px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-0.5 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
                    <span>Time</span>
                  </div>
                  <div className="text-lg sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                    {`${getTestDurationMinutes(test)}:00`}
                  </div>
                </div>

                {/* Total Attempts */}
                <div className="p-3 sm:p-4 rounded-[20px] sm:rounded-[22px] bg-transparent flex flex-col items-center justify-center text-center transition-all hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                  <div className="text-[9.5px] sm:text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-0.5 flex items-center justify-center gap-1">
                    <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span className="truncate">Total Attempts</span>
                  </div>
                  <div className="text-lg sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                    {recordedAttemptCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Attempt History Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  <TrendingUp className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <span>Attempt History & Metrics</span>
                </div>
              </div>

              {!first && !last && testAttempts.length === 0 ? (
                <div className="p-6 sm:p-8 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] text-center space-y-2.5">
                  <div className="w-12 h-12 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border-0">
                    <BookOpen className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <h4 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    You haven't attempted this test yet
                  </h4>
                  <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto leading-relaxed">
                    Start your first attempt to record baseline accuracy metrics, review detailed step-by-step
                    solutions, and track performance!
                  </p>
                </div>
              ) : !last ? (
                <div className="grid grid-cols-1 gap-2.5 sm:gap-3.5">
                  {first && renderAttemptCard(first, 'FIRST ATTEMPT', true)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5">
                  {first && renderAttemptCard(first, 'FIRST ATTEMPT', true)}
                  {last && renderAttemptCard(last, 'LAST ATTEMPT', false)}
                </div>
              )}
            </div>
          </div>

          {/* Footer Bar with Dual Launch Options */}
          <div className="p-4 sm:p-5 bg-transparent dark:bg-transparent border-0 flex items-center justify-end px-4 sm:px-6 shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <div className="flex flex-row items-center gap-2.5 sm:gap-3 w-full sm:w-auto justify-end">
              {onStartOmrTest && (
                <button
                  type="button"
                  id="fullview-footer-omr-test-btn"
                  onClick={() => {
                    onClose();
                    onStartOmrTest(test);
                  }}
                  className={`${APP_STYLES.button.secondary} flex-1 sm:flex-initial justify-center whitespace-nowrap`}
                >
                  {isAttempted ? (
                    <>
                      <RotateCcw className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span className="truncate">Retry OMR Mode</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span className="truncate">Attempt OMR Mode</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                id="fullview-footer-start-test-btn"
                onClick={() => {
                  onClose();
                  onStartTest(test, 'timed');
                }}
                style={{ backgroundColor: '#0b57d0' }}
                className={`${APP_STYLES.button.primary} !bg-[#0b57d0] hover:!bg-[#0842a0] active:!bg-[#063380] dark:!bg-[#0b57d0] dark:hover:!bg-[#0842a0] flex-1 sm:flex-initial justify-center whitespace-nowrap`}
              >
                {isAttempted ? (
                  <>
                    <RotateCcw className="w-4 h-4 fill-none shrink-0" />
                    <span className="truncate">Retry Online Test</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span className="truncate">Start Online Test</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      {!selectedReportAttempt && (typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent)}

      {/* Leaderboard Modal */}
      {isLeaderboardOpen && (
        <TestLeaderboardModal
          isOpen={isLeaderboardOpen}
          test={test}
          currentUser={currentUser}
          onClose={() => setIsLeaderboardOpen(false)}
        />
      )}

      {/* Performance Report Analysis View */}
      {selectedReportAttempt && (
        typeof document !== 'undefined' ? (
          createPortal(
            <TestReportAnalysisView
              attempt={selectedReportAttempt}
              test={test || allTests.find((t) => (t && t.id && t.id === selectedReportAttempt.testId) || (t && t.title && t.title === selectedReportAttempt.testTitle)) || { id: selectedReportAttempt.testId, title: selectedReportAttempt.testTitle, questions: [] }}
              allTests={allTests.length > 0 ? allTests : [test || { id: selectedReportAttempt.testId, title: selectedReportAttempt.testTitle, questions: [] }]}
              isFirstAttempt={testAttempts[0]?.id === selectedReportAttempt.id}
              onClose={() => setSelectedReportAttempt(null)}
              onRetakeTest={(t, m) => {
                setSelectedReportAttempt(null);
                onClose();
                onStartTest(t, m || 'timed');
              }}
              onViewRawSolutions={(att) => {
                setSelectedReportAttempt(null);
                onClose();
                onViewAttemptResult?.(att);
              }}
            />,
            document.body
          )
        ) : (
          <TestReportAnalysisView
            attempt={selectedReportAttempt}
            test={test || allTests.find((t) => (t && t.id && t.id === selectedReportAttempt.testId) || (t && t.title && t.title === selectedReportAttempt.testTitle)) || { id: selectedReportAttempt.testId, title: selectedReportAttempt.testTitle, questions: [] }}
            allTests={allTests.length > 0 ? allTests : [test || { id: selectedReportAttempt.testId, title: selectedReportAttempt.testTitle, questions: [] }]}
            isFirstAttempt={testAttempts[0]?.id === selectedReportAttempt.id}
            onClose={() => setSelectedReportAttempt(null)}
            onRetakeTest={(t, m) => {
              setSelectedReportAttempt(null);
              onClose();
              onStartTest(t, m || 'timed');
            }}
            onViewRawSolutions={(att) => {
              setSelectedReportAttempt(null);
              onClose();
              onViewAttemptResult?.(att);
            }}
          />
        )
      )}
    </>
  );
};
