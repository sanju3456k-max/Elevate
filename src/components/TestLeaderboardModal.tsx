import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Clock, 
  X, 
  Users, 
  RefreshCw, 
  Crown,
  Check,
  Medal,
  Award,
  Sparkles
} from 'lucide-react';
import type { MathTest, LeaderboardEntry, TestLeaderboardSummary } from '../types';
import type { User } from 'firebase/auth';
import { 
  fetchTestLeaderboard, 
  syncAllUserAttemptsToLeaderboard,
  getSynchronousCachedLeaderboard
} from '../lib/firebase';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { studioFadeVariants } from '../lib/animationConfig';

interface TestLeaderboardModalProps {
  isOpen: boolean;
  test: MathTest | null;
  currentUser: User | null;
  onClose: () => void;
}

// Deterministic vibrant avatar background color by student name
const getAvatarBgColor = (name: string) => {
  const colors = [
    'bg-indigo-600',
    'bg-purple-600',
    'bg-emerald-600',
    'bg-blue-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-teal-600',
    'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export const TestLeaderboardModal: React.FC<TestLeaderboardModalProps> = ({
  isOpen,
  test,
  currentUser,
  onClose,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose, priority: 60 });

  // 1. Immediately hydrate initial summary synchronously to prevent layout shifts & loading flashes on open
  const initialCache = useMemo(() => {
    if (!isOpen || (!test?.id && !test?.title)) return null;
    return getSynchronousCachedLeaderboard(test.id || '', test.title, currentUser?.uid);
  }, [isOpen, test?.id, test?.title, currentUser?.uid]);

  const [summary, setSummary] = useState<TestLeaderboardSummary | null>(initialCache);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCache);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [justRefreshed, setJustRefreshed] = useState<boolean>(false);
  const [modeFilter, setModeFilter] = useState<'all' | 'online' | 'omr'>('all');

  const loadLeaderboardData = useCallback(async (force = false) => {
    if (!test?.id && !test?.title) return;
    if (force) {
      setIsRefreshing(true);
    } else if (!summary) {
      setIsLoading(true);
    }

    try {
      // If forcing refresh, also push all local user attempts for this test
      if (force && currentUser?.uid) {
        await syncAllUserAttemptsToLeaderboard(currentUser.uid, test.id).catch(() => {});
      }

      const data = await fetchTestLeaderboard(test.id || '', test.title, force);
      setSummary(data);

      if (force) {
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 2500);
      }
    } catch (err) {
      console.warn('Failed to load leaderboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [test?.id, test?.title, currentUser?.uid, summary]);

  useEffect(() => {
    if (isOpen && (test?.id || test?.title)) {
      const syncData = getSynchronousCachedLeaderboard(test.id || '', test.title, currentUser?.uid);
      if (syncData) {
        setSummary(syncData);
        setIsLoading(false);
      }
      loadLeaderboardData(false);
    } else {
      setSummary(null);
    }
  }, [isOpen, test?.id, test?.title, loadLeaderboardData, currentUser?.uid]);

  // Synchronize status bar theme-color to match leaderboard page body (#ffffff light / #0c0e12 dark)
  useEffect(() => {
    if (!isOpen) return;

    const syncStatusBar = () => {
      try {
        const isDark = document.documentElement.classList.contains('dark');
        const targetColor = isDark ? '#0c0e12' : '#ffffff';

        const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
        if (metaThemeColors.length > 0) {
          metaThemeColors.forEach((el) => {
            el.removeAttribute('media');
            el.setAttribute('content', targetColor);
          });
        } else {
          const newMeta = document.createElement('meta');
          newMeta.name = 'theme-color';
          newMeta.content = targetColor;
          document.head.appendChild(newMeta);
        }

        const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (appleStatusBar) {
          appleStatusBar.setAttribute('content', isDark ? 'black-translucent' : 'default');
        }
      } catch (err) {
        console.warn('Status bar theme color sync error in Leaderboard:', err);
      }
    };

    syncStatusBar();

    const observer = new MutationObserver(() => syncStatusBar());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      try {
        const isDark = document.documentElement.classList.contains('dark');
        const defaultColor = isDark ? '#0b0c10' : '#e5e9f0';
        const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
        metaThemeColors.forEach((el) => {
          el.removeAttribute('media');
          el.setAttribute('content', defaultColor);
        });
      } catch {}
    };
  }, [isOpen]);

  const filteredEntries = useMemo(() => {
    if (!summary?.entries) return [];
    return summary.entries.filter((entry) => {
      const matchesMode = 
        modeFilter === 'all' || 
        (modeFilter === 'online' && entry.attemptMode !== 'omr') ||
        (modeFilter === 'omr' && entry.attemptMode === 'omr');
      return matchesMode;
    });
  }, [summary?.entries, modeFilter]);

  const isCurrentUserOutsideTop100 = useMemo(() => {
    if (!summary?.currentUserEntry || !currentUser?.uid) return false;
    const userRank = summary.currentUserRank || summary.currentUserEntry.rank;
    return !!(userRank && userRank > 100);
  }, [summary?.currentUserEntry, summary?.currentUserRank, currentUser?.uid]);

  const top1 = summary?.entries?.[0] || null;
  const top2 = summary?.entries?.[1] || null;
  const top3 = summary?.entries?.[2] || null;

  const formatDuration = (seconds?: number) => {
    if (typeof seconds !== 'number' || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const averageStats = useMemo(() => {
    if (!summary?.entries || summary.entries.length === 0) {
      return { avgScore: 0, avgPercentage: 0, maxPoints: 0, count: 0 };
    }
    const totalScore = summary.entries.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const totalPercent = summary.entries.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    const count = summary.entries.length;
    const maxPoints = summary.entries[0]?.totalPoints || ((test?.questions?.length || 10) * 4);
    const avgScore = Math.round((totalScore / count) * 10) / 10;
    const avgPercentage = Math.round(totalPercent / count);
    return { avgScore, avgPercentage, maxPoints, count };
  }, [summary?.entries, test?.questions?.length]);

  const getAvatarCornerRankBadge = (rank?: number) => {
    if (!rank) return null;
    if (rank === 1) {
      return (
        <span 
          title="Rank 1"
          className="absolute -bottom-1 -right-1 min-w-[18px] sm:min-w-[21px] h-[18px] sm:h-[21px] px-1 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 font-black font-mono text-[9.5px] sm:text-[11px] flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-xs"
        >
          1
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span 
          title="Rank 2"
          className="absolute -bottom-1 -right-1 min-w-[18px] sm:min-w-[21px] h-[18px] sm:h-[21px] px-1 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 font-black font-mono text-[9.5px] sm:text-[11px] flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-xs"
        >
          2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span 
          title="Rank 3"
          className="absolute -bottom-1 -right-1 min-w-[18px] sm:min-w-[21px] h-[18px] sm:h-[21px] px-1 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 text-amber-50 font-black font-mono text-[9.5px] sm:text-[11px] flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-xs"
        >
          3
        </span>
      );
    }
    return (
      <span 
        title={`Rank ${rank}`}
        className="absolute -bottom-1 -right-1 min-w-[18px] sm:min-w-[21px] h-[18px] sm:h-[21px] px-1 rounded-full bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9px] sm:text-[10.5px] font-black font-mono flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 shadow-xs"
      >
        {rank}
      </span>
    );
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && test && (
        <motion.div
          key="leaderboard-fullpage-container"
          variants={studioFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ willChange: 'opacity' }}
          className="fixed inset-0 z-[60] bg-white dark:bg-[#0c0e12] overflow-y-auto flex flex-col font-sans pb-10 select-text [scrollbar-width:thin]"
        >
          {/* Top Header - Seamless Fixed Background Without Heavy Blur Shader */}
          <header className="sticky top-0 z-20 bg-white dark:bg-[#0c0e12] border-0 shadow-none shrink-0">
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 flex items-center justify-center shadow-xs shrink-0">
                <Trophy className="w-4.5 h-4.5 sm:w-6 sm:h-6 stroke-[2.2]" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-lg md:text-xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight leading-snug truncate">
                  {test.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => loadLeaderboardData(true)}
                disabled={isRefreshing || isLoading}
                title={justRefreshed ? "Rankings refreshed & synced!" : "Sync & Refresh live rankings"}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                  justRefreshed
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/90 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200'
                }`}
              >
                {justRefreshed ? (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin text-[#0b57d0]' : ''}`} />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/90 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Sub-header Context Bar - Centered Align */}
        <div className="max-w-5xl xl:max-w-6xl w-full mx-auto px-3.5 sm:px-6 pt-2 sm:pt-3 flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 dark:text-zinc-300">
            <Users className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>{summary?.totalParticipants || 0} Students Ranked</span>
          </div>

          {averageStats.count > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-0 ring-0 shadow-none">
              <span className="text-slate-500 dark:text-zinc-400 font-medium">Average Score:</span>
              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-mono font-black">
                {averageStats.avgScore}/{averageStats.maxPoints}
              </span>
              <span className="text-slate-400 dark:text-zinc-500">•</span>
              <span className="font-mono text-slate-700 dark:text-zinc-200">{averageStats.avgPercentage}%</span>
            </div>
          )}
        </div>

        {/* Main Content Area: Centered Responsive 2-Column Split (Top Performance on Left, All Student Rankings on Right) */}
        <main className="max-w-5xl xl:max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-3.5 sm:py-5 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start w-full">
            
            {/* LEFT COLUMN (Desktop): Top Performers Podium & Your Verified Standing (Sticky on Desktop) */}
            <div className="lg:col-span-5 xl:col-span-5 space-y-4 sm:space-y-5 lg:sticky lg:top-20">
              {/* ========================================================= */}
              {/* 1. TOP PERFORMERS PODIUM (Olympic 3-Tier Podium)         */}
              {/* ========================================================= */}
              <div className="rounded-[24px] sm:rounded-[32px] bg-gradient-to-b from-amber-50/80 to-amber-100/40 dark:from-amber-950/20 dark:to-zinc-900/60 border border-amber-200/70 dark:border-amber-900/40 p-3 sm:p-4.5 lg:p-5 space-y-3 sm:space-y-4 shadow-xs">
                <div className="text-center text-[11px] sm:text-xs font-black tracking-widest uppercase text-amber-800 dark:text-amber-400 flex items-center justify-center gap-1.5">
                  <span>TOP PERFORMERS</span>
                </div>

                {/* Podium Grid */}
                <div className="flex items-end justify-center gap-1.5 sm:gap-2.5 lg:gap-3 pt-2 sm:pt-3 min-h-[210px] sm:min-h-[250px]">
                  {/* 2nd Place (Left) */}
                  <div className="flex flex-col items-center flex-1 min-w-0 max-w-[95px] sm:max-w-[125px] lg:max-w-[130px]">
                    {top2 ? (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center w-full">
                        <div className="relative mb-1.5 sm:mb-2">
                          <div className={`w-12 h-12 sm:w-15 sm:h-15 lg:w-15 lg:h-15 rounded-full ${getAvatarBgColor(top2.userName)} text-white font-black text-lg sm:text-xl flex items-center justify-center shadow-md ring-2 ring-slate-300 dark:ring-zinc-600`}>
                            {top2.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-1.5 sm:-bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[9.5px] sm:text-xs font-black bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm border border-white dark:border-zinc-800 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap">
                            <span>2nd</span>
                            <Medal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-700 dark:text-zinc-300 shrink-0" />
                          </span>
                        </div>
                        <div 
                          className="font-bold text-[11px] sm:text-xs lg:text-[12.5px] text-slate-900 dark:text-zinc-100 text-center leading-tight break-words line-clamp-2 w-full px-0.5"
                          title={top2.userName}
                        >
                          {top2.userName}
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-extrabold text-amber-700 dark:text-amber-400 font-mono">
                          {top2.percentage}%
                        </div>
                        <div className="text-[9.5px] sm:text-[10px] text-slate-500 font-mono">
                          {formatDuration(top2.timeSpentSeconds)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center text-slate-400">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center mb-1 text-xs sm:text-sm font-bold">
                          -
                        </div>
                        <span className="text-[9.5px] sm:text-[10px]">Unclaimed</span>
                      </div>
                    )}
                    <div className="w-full h-18 sm:h-22 lg:h-24 rounded-t-xl sm:rounded-t-2xl bg-gradient-to-b from-slate-200 to-slate-300/90 dark:from-zinc-700 dark:to-zinc-800/90 border border-slate-300 dark:border-zinc-600 flex items-center justify-center shadow-xs">
                      <Trophy className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-slate-700 dark:text-zinc-200 stroke-[2.2]" />
                    </div>
                  </div>

                  {/* 1st Place (Center - TALL & GOLDEN - TOPPER) */}
                  <div className="flex flex-col items-center flex-1 min-w-0 max-w-[135px] sm:max-w-[165px] lg:max-w-[175px]">
                    {top1 ? (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center w-full">
                        <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 fill-amber-400 mb-0.5 drop-shadow-xs" />
                        <div className="relative mb-1.5 sm:mb-2">
                          <div className={`w-14 h-14 sm:w-18 sm:h-18 lg:w-19 lg:h-19 rounded-full ${getAvatarBgColor(top1.userName)} text-white font-black text-xl sm:text-2xl flex items-center justify-center shadow-lg ring-3 sm:ring-4 ring-amber-400`}>
                            {top1.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs md:text-[12.5px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-md flex items-center gap-1 sm:gap-1.5 whitespace-nowrap">
                            <span>1st</span>
                            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-950 fill-amber-950 shrink-0" />
                          </span>
                        </div>
                        <div 
                          className="font-black text-xs sm:text-sm lg:text-[13.5px] text-slate-900 dark:text-zinc-100 text-center leading-tight break-words line-clamp-2 w-full px-0.5"
                          title={top1.userName}
                        >
                          {top1.userName}
                        </div>
                        <div className="text-[11px] sm:text-xs font-black text-amber-700 dark:text-amber-400 font-mono">
                          {top1.percentage}%
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-slate-500 font-mono">
                          {formatDuration(top1.timeSpentSeconds)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center text-slate-400">
                        <div className="w-12 h-12 sm:w-15 sm:h-15 rounded-full border-2 border-dashed border-amber-300 dark:border-amber-800 flex items-center justify-center mb-1 text-xs sm:text-sm font-bold">
                          <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
                        </div>
                        <span className="text-[9.5px] sm:text-[10px]">Awaiting 1st Rank</span>
                      </div>
                    )}
                    <div className="w-full h-26 sm:h-30 lg:h-32 rounded-t-xl sm:rounded-t-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 shadow-md flex items-center justify-center">
                      <Trophy className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-amber-950 stroke-[2.2]" />
                    </div>
                  </div>

                  {/* 3rd Place (Right) */}
                  <div className="flex flex-col items-center flex-1 min-w-0 max-w-[95px] sm:max-w-[125px] lg:max-w-[130px]">
                    {top3 ? (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center w-full">
                        <div className="relative mb-1.5 sm:mb-2">
                          <div className={`w-12 h-12 sm:w-15 sm:h-15 lg:w-15 lg:h-15 rounded-full ${getAvatarBgColor(top3.userName)} text-white font-black text-lg sm:text-xl flex items-center justify-center shadow-md ring-2 ring-amber-700/40`}>
                            {top3.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-1.5 sm:-bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[9.5px] sm:text-xs font-black bg-amber-700 text-amber-50 shadow-sm border border-white dark:border-zinc-800 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap">
                            <span>3rd</span>
                            <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-100 shrink-0" />
                          </span>
                        </div>
                        <div 
                          className="font-bold text-[11px] sm:text-xs lg:text-[12.5px] text-slate-900 dark:text-zinc-100 text-center leading-tight break-words line-clamp-2 w-full px-0.5"
                          title={top3.userName}
                        >
                          {top3.userName}
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-extrabold text-amber-700 dark:text-amber-400 font-mono">
                          {top3.percentage}%
                        </div>
                        <div className="text-[9.5px] sm:text-[10px] text-slate-500 font-mono">
                          {formatDuration(top3.timeSpentSeconds)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center mb-1.5 sm:mb-2 text-center text-slate-400">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center mb-1 text-xs sm:text-sm font-bold">
                          -
                        </div>
                        <span className="text-[9.5px] sm:text-[10px]">Unclaimed</span>
                      </div>
                    )}
                    <div className="w-full h-14 sm:h-16 lg:h-18 rounded-t-xl sm:rounded-t-2xl bg-gradient-to-b from-amber-600/30 to-amber-700/40 dark:from-amber-900/40 dark:to-zinc-800/80 border border-amber-600/30 dark:border-amber-800/40 flex items-center justify-center shadow-xs">
                      <Trophy className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-amber-800 dark:text-amber-300 stroke-[2.2]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* 2. YOUR VERIFIED STANDING (Optimized Modern Card)          */}
              {/* ========================================================= */}
              {summary?.currentUserEntry && (() => {
                const userRank = summary.currentUserRank || summary.currentUserEntry.rank || 1;
                const percentile = Math.max(1, Math.round((userRank / Math.max(1, summary.totalParticipants)) * 100));
                const totalPts = summary.currentUserEntry.totalPoints || ((test.questions?.length || 10) * 4);
                const isTop1 = userRank === 1;
                const isTop2 = userRank === 2;
                const isTop3 = userRank === 3;

                return (
                  <div className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 bg-gradient-to-br from-[#1a73e8] via-[#0b57d0] to-[#0842a0] dark:from-[#1558b0] dark:via-[#0b57d0] dark:to-[#073273] text-white shadow-lg border-0">
                    {/* Decorative Ambient Radial Highlights */}
                    <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                    <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-indigo-300/15 blur-xl pointer-events-none" />

                    <div className="relative z-10 space-y-3">
                      {/* Top Header Tag Row */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] sm:text-[10.5px] font-black tracking-widest text-blue-100 uppercase flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span>YOUR VERIFIED STANDING</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/15 text-white backdrop-blur-xs border border-white/15 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>{summary.currentUserEntry.attemptMode === 'omr' ? 'OMR Verified' : 'Online Verified'}</span>
                        </span>
                      </div>

                      {/* Main Standing Row */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* High-Definition Rank Badge */}
                        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white/20 dark:bg-white/15 backdrop-blur-md flex flex-col items-center justify-center shrink-0 border border-white/25 shadow-inner">
                          {isTop1 ? (
                            <Trophy className="w-4 h-4 text-amber-300 fill-amber-300 mb-0.5 shrink-0" />
                          ) : isTop2 ? (
                            <Medal className="w-4 h-4 text-slate-200 shrink-0 mb-0.5" />
                          ) : isTop3 ? (
                            <Award className="w-4 h-4 text-amber-200 shrink-0 mb-0.5" />
                          ) : (
                            <span className="text-[8px] font-black tracking-widest text-blue-200 uppercase leading-none">RANK</span>
                          )}
                          <span className="text-lg sm:text-xl font-black text-white leading-none mt-0.5 font-mono">
                            #{userRank}
                          </span>
                        </div>

                        {/* Rank Heading & Context */}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base md:text-lg font-black text-white flex items-baseline gap-1.5 flex-wrap leading-tight">
                            <span>Rank</span>
                            <span className="text-amber-300 font-mono font-black text-base sm:text-xl">
                              #{userRank}
                            </span>
                            <span className="text-blue-100/90 font-bold text-xs sm:text-sm">
                              of {summary.totalParticipants} Students
                            </span>
                          </div>

                          <div className="text-[11px] sm:text-xs text-blue-100/90 font-medium mt-0.5">
                            You outperformed <span className="font-bold text-white">{Math.max(0, 100 - percentile)}%</span> of test participants
                          </div>
                        </div>
                      </div>

                      {/* Performance Metric Badges */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 dark:bg-white/15 text-[11px] sm:text-xs font-bold text-white shadow-2xs backdrop-blur-xs border border-white/15">
                          <span className="text-amber-300">★</span>
                          <span>Top {percentile}%</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 dark:bg-white/15 text-[11px] sm:text-xs font-bold text-white font-mono shadow-2xs backdrop-blur-xs border border-white/15">
                          <span>Score: {summary.currentUserEntry.score}/{totalPts} ({summary.currentUserEntry.percentage}%)</span>
                        </span>

                        {summary.currentUserEntry.timeSpentSeconds ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 dark:bg-white/15 text-[11px] sm:text-xs font-bold text-white font-mono shadow-2xs backdrop-blur-xs border border-white/15">
                            <Clock className="w-3 h-3 text-blue-200" />
                            <span>{formatDuration(summary.currentUserEntry.timeSpentSeconds)} taken</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* RIGHT COLUMN (Desktop): All Student Rankings List */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-3">
              {/* ========================================================= */}
              {/* 3. ALL STUDENT RANKINGS LIST                             */}
              {/* ========================================================= */}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                  ALL STUDENT RANKINGS
                </h2>

                {/* Mode Filter Pills */}
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1 rounded-full shadow-xs">
                  <button
                    type="button"
                    onClick={() => setModeFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'all'
                        ? 'bg-[#0b57d0] text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeFilter('online')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'online'
                        ? 'bg-[#0b57d0] text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeFilter('omr')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'omr'
                        ? 'bg-[#0b57d0] text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    OMR
                  </button>
                </div>
              </div>

              {/* List entries */}
              {isLoading ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#0b57d0] mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">Synchronizing live student rankings...</p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-8 sm:p-12 rounded-[28px] bg-white dark:bg-zinc-900 text-center space-y-3 border border-dashed border-slate-200 dark:border-zinc-800">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    No Leaderboard Attempts Found
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Attempts submitted by students will automatically show up here with live rankings!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                {filteredEntries.map((entry) => {
                  const isCurrentUser = currentUser?.uid && entry.userId === currentUser.uid;
                  return (
                    <div
                      key={entry.userId}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 62px' }}
                      className={`p-3 sm:px-5 sm:py-3.5 rounded-[18px] sm:rounded-[22px] flex items-center justify-between gap-2.5 sm:gap-4 transition-all ${
                        isCurrentUser
                          ? 'bg-blue-50/80 border-2 border-[#0b57d0]/60 dark:bg-blue-950/25 dark:border-[#a8c7fa]/50 shadow-xs'
                          : 'bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {/* Left: Avatar with Corner Number Badge + Name + Mode */}
                      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                        {/* Avatar with corner rank number badge */}
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${getAvatarBgColor(entry.userName)} text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs`}>
                            {entry.userName.charAt(0).toUpperCase()}
                          </div>
                          {getAvatarCornerRankBadge(entry.rank)}
                        </div>

                        {/* Name & metadata */}
                        <div className="min-w-0 space-y-0.5 sm:space-y-1 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-zinc-100 truncate">
                              {entry.userName}
                            </span>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[8.5px] sm:text-[9px] font-black bg-[#0b57d0] text-white shrink-0">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            {entry.attemptMode === 'omr' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-[#ffe8d9] dark:bg-[#432313] text-[#ea580c] dark:text-[#ff9d5c] shrink-0 border-0 outline-none">
                                OMR
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shrink-0 border-0 outline-none">
                                Online
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Score (above) & Percentage + Time in single row (below) */}
                      <div className="text-right shrink-0 flex flex-col items-end justify-center">
                        <div className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-zinc-100 font-mono whitespace-nowrap">
                          Score: {entry.score}/{entry.totalPoints || ((test.questions?.length || 10) * 4)}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400 font-mono mt-0.5 whitespace-nowrap">
                          <span>{entry.percentage}%</span>
                          <span className="text-slate-300 dark:text-zinc-600">•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
                            <span>{formatDuration(entry.timeSpentSeconds)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* If the current user's rank is outside the Top 100, show an indicator separator + pinned standing */}
                {isCurrentUserOutsideTop100 && summary?.currentUserEntry && (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-center gap-2 py-1 text-slate-400 text-xs font-bold">
                      <span className="w-12 h-px bg-slate-300 dark:bg-zinc-700"></span>
                      <span>Ranked Outside Top 100</span>
                      <span className="w-12 h-px bg-slate-300 dark:bg-zinc-700"></span>
                    </div>

                    <div className="p-3.5 sm:px-5 sm:py-4 rounded-[20px] sm:rounded-[24px] flex items-center justify-between gap-2.5 sm:gap-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200/80 dark:border-blue-800/50 shadow-xs">
                      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${getAvatarBgColor(summary.currentUserEntry.userName)} text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs`}>
                            {summary.currentUserEntry.userName.charAt(0).toUpperCase()}
                          </div>
                          {getAvatarCornerRankBadge(summary.currentUserRank || summary.currentUserEntry.rank)}
                        </div>
                        <div className="min-w-0 space-y-0.5 sm:space-y-1 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-zinc-100 truncate">
                              {summary.currentUserEntry.userName}
                            </span>
                            <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[8.5px] sm:text-[9px] font-black bg-[#0b57d0] text-white shrink-0">
                              YOU
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            {summary.currentUserEntry.attemptMode === 'omr' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-[#ffe8d9] dark:bg-[#432313] text-[#ea580c] dark:text-[#ff9d5c] shrink-0 border-0 outline-none">
                                OMR
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shrink-0 border-0 outline-none">
                                Online
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end justify-center">
                        <div className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-zinc-100 font-mono whitespace-nowrap">
                          Score: {summary.currentUserEntry.score}/{summary.currentUserEntry.totalPoints || ((test.questions?.length || 10) * 4)}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400 font-mono mt-0.5 whitespace-nowrap">
                          <span>{summary.currentUserEntry.percentage}%</span>
                          <span className="text-slate-300 dark:text-zinc-600">•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
                            <span>{formatDuration(summary.currentUserEntry.timeSpentSeconds)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </main>
      </motion.div>
    )}
  </AnimatePresence>,
    document.body
  );
};
