import React from 'react';
import {
  Sparkles,
  BookOpen,
  PlayCircle,
  ArrowRight,
  Layers,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Bell,
  BarChart3,
  Bot,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Flame,
  Award,
  Video,
  Play,
  FileCode
} from 'lucide-react';
import type { MathTest, TestAttempt, UserProfile } from '../../types';
import type { User } from 'firebase/auth';
import { useApp } from '../../lms/LmsContext';

interface HomeDashboardProps {
  tests: MathTest[];
  attempts: TestAttempt[];
  currentUser: User | null;
  userProfile?: UserProfile | null;
  onStartTest: (test: MathTest) => void;
  onOpenBatches: () => void;
  onSelectBatch?: (batchId: string) => void;
  onOpenAllTests: () => void;
  onOpenAnalytics?: () => void;
  onOpenNotes?: () => void;
  onOpenThetaAI?: () => void;
  onOpenOmr?: () => void;
  onOpenCustomBuilder?: () => void;
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
  const { batches, setActiveBatchId, setActiveLectureId, watchProgress } = useApp();

  const featuredTests = tests.slice(0, 2);
  const primaryBatch = batches[0];

  // Calculate Quick Stats
  const totalAttempts = attempts.length;
  const averagePercentage = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / totalAttempts)
    : 0;

  const handleBatchClick = (batchId: string) => {
    setActiveBatchId(batchId);
    setActiveLectureId(null);
    if (onSelectBatch) {
      onSelectBatch(batchId);
    } else {
      onOpenBatches();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-7 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      
      {/* 1. TOP HERO BANNER (Elevate Labs Unified Suite) */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-white via-sky-50/40 to-blue-50/30 dark:from-[#1a1c23] dark:via-[#1e2028] dark:to-[#171922] p-5 sm:p-8 lg:p-10 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] border border-slate-200/80 dark:border-zinc-800">
        {/* Subtle Decorative Ambient Glows */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/10 dark:bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-sky-400/10 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-3.5 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/60 text-[#041e49] dark:text-[#c2e7ff] text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-sky-300 fill-current" />
            <span>Elevate Labs · Smart Coaching & Assessment Platform</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-zinc-50 tracking-tight leading-tight">
            Smart Coaching & <span className="text-[#0b57d0] dark:text-[#a8c7fa]">Interactive Video</span> Classes
          </h1>

          <p className="text-slate-600 dark:text-zinc-400 text-xs sm:text-sm sm:leading-relaxed max-w-2xl">
            Master your syllabus with distraction-free cloaked video lectures, interactive timestamps, and downloadable DPP notes designed for focused learning.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
            {primaryBatch && (
              <button
                type="button"
                onClick={() => handleBatchClick(primaryBatch.id)}
                className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer border-0 outline-none active:scale-98"
              >
                <span>Open {primaryBatch.title}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenBatches}
              className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer border-0 outline-none"
            >
              <Layers className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>All Coaching Batches</span>
            </button>

            <button
              type="button"
              onClick={onOpenAllTests}
              className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer border-0 outline-none"
            >
              <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Test Library ({tests.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN RESPONSIVE DESKTOP LAYOUT (12 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        
        {/* LEFT COLUMN: BATCHES & FEATURED TESTS (8 Columns on Desktop) */}
        <div className="lg:col-span-8 space-y-6 sm:space-y-8">
          
          {/* SECTION A: COACHING BATCHES */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                    My Coaching Batches
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Curriculum folders, video lectures & verified study notes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenBatches}
                className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Batch Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  onClick={() => handleBatchClick(batch.id)}
                  className="group relative rounded-3xl bg-white dark:bg-[#1a1c23] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] border border-slate-200/80 dark:border-zinc-800 hover:border-[#0b57d0]/50 dark:hover:border-[#a8c7fa]/50 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300">
                        Interactive Batch
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Full Access</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug">
                      {batch.title}
                    </h3>

                    <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {batch.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={batch.instructor?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                        alt={batch.instructor?.name || 'Faculty'}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium truncate max-w-[130px]">
                        {batch.instructor?.name || 'Elevate Faculty'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] group-hover:translate-x-0.5 transition-transform">
                      <span>Explore</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION B: FEATURED MOCK ASSESSMENTS (Only 1-2 Tests!) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                    Featured Mock Assessments
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Handpicked tests for timed practice & instant OMR evaluation
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenAllTests}
                className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
              >
                <span>View Full Library ({tests.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1-2 Highlighted Tests Cards */}
            <div className="space-y-3">
              {featuredTests.map((test) => (
                <div
                  key={test.id}
                  className="rounded-3xl bg-white dark:bg-[#1a1c23] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-[#0b57d0]/40 dark:hover:border-[#a8c7fa]/40"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]">
                        {test.topic}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{test.durationMinutes || 15} Mins · {test.questions?.length || 0} Questions</span>
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                      {test.title}
                    </h4>

                    {test.description && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">
                        {test.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartTest(test)}
                      className="px-4 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border-0 outline-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenAllTests}
                      className="px-3.5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-xs transition-colors cursor-pointer border-0 outline-none"
                    >
                      All Tests
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION C: 3 PILLARS HIGHLIGHTS (Distraction-Free, Dynamic Watermark, CBT) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 pt-2">
            <div className="rounded-3xl bg-white dark:bg-[#1a1c23] p-4.5 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-2xl bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold">
                <PlayCircle className="w-5 h-5" />
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                Cloaked Video Player
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Zero YouTube ads or branding leaks with custom scrubber, bookmarks & speed controls.
              </p>
            </div>

            <div className="rounded-3xl bg-white dark:bg-[#1a1c23] p-4.5 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                Dynamic Watermarking
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Real-time moving student ID & phone watermark to deter unauthorized screen recordings.
              </p>
            </div>

            <div className="rounded-3xl bg-white dark:bg-[#1a1c23] p-4.5 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                Study Notes & DPP
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Download verified chapter notes, concept formulas, and solve linked mock assessments.
              </p>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: EXECUTIVE DESKTOP SIDEBAR (4 Columns on Desktop) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* 1. IMPORTANT REMINDERS & NOTICE BOARD */}
          <div className="rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/15 dark:via-zinc-900/60 dark:to-[#1a1c23] p-5 border border-amber-300/40 dark:border-amber-500/20 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs tracking-wider uppercase">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-amber-500/20" />
              <span>Important Reminders</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-zinc-100">Daily Study Target:</strong> Complete Chapter 01 video classes and attempt the linked mock assessment today.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-zinc-100">DPP Material:</strong> Formula sheets for Chapter 02 have been published under Study Notes.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-zinc-100">Security Engine:</strong> Ephemeral token verification and DevTools blackout protection are enabled.
                </p>
              </div>
            </div>
          </div>

          {/* 2. QUICK STUDY STATS */}
          <div className="rounded-3xl bg-white dark:bg-[#1a1c23] p-5 border border-slate-200/80 dark:border-zinc-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Study Activity</span>
              </h3>

              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline cursor-pointer bg-transparent border-0 outline-none"
                >
                  Analytics →
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                  Tests Attempted
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-zinc-100 mt-1">
                  {totalAttempts}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                  Average Score
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {averagePercentage}%
                </div>
              </div>
            </div>
          </div>

          {/* 3. QUICK STUDIO SHORTCUTS */}
          <div className="rounded-3xl bg-white dark:bg-[#1a1c23] p-5 border border-slate-200/80 dark:border-zinc-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Quick Tools & Studios
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              {onOpenNotes && (
                <button
                  type="button"
                  onClick={onOpenNotes}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-slate-100 dark:border-zinc-800 text-left transition-colors cursor-pointer outline-none"
                >
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">Notes Studio</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Formula Sheets</div>
                </button>
              )}

              {onOpenThetaAI && (
                <button
                  type="button"
                  onClick={onOpenThetaAI}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-slate-100 dark:border-zinc-800 text-left transition-colors cursor-pointer outline-none"
                >
                  <Bot className="w-4 h-4 text-sky-600 dark:text-sky-400 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">Theta AI</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Gemini Tutor</div>
                </button>
              )}

              {onOpenOmr && (
                <button
                  type="button"
                  onClick={onOpenOmr}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-slate-100 dark:border-zinc-800 text-left transition-colors cursor-pointer outline-none"
                >
                  <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">OMR Scanner</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Sheet Evaluation</div>
                </button>
              )}

              {onOpenCustomBuilder && (
                <button
                  type="button"
                  onClick={onOpenCustomBuilder}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-slate-100 dark:border-zinc-800 text-left transition-colors cursor-pointer outline-none"
                >
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">Custom Test</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Custom Builder</div>
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
