import React, { useState } from 'react';
import {
  Play,
  CheckCircle,
  Users,
  Star,
  Clock,
  BookOpen,
  ArrowRight,
  Sparkles,
  BookmarkCheck,
  FolderTree,
  FileText,
  PlayCircle,
  Check,
  Bell,
  BarChart3,
  Bot,
  FileCode,
  CheckCircle2,
  Layers,
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
  const { batches, lectures, watchProgress, isEnrolled, setActiveBatchId, setActiveLectureId } = useApp();
  const [activeFilter, setActiveFilter] = useState<'all' | 'batch' | 'lectures' | 'tests' | 'notes'>('all');

  const currentBatch = batches[0]; // Testing Batch
  const freeLectures = lectures.filter((l) => l.isFreePreview);
  const featuredTests = tests.slice(0, 2);

  // In-progress lectures
  const inProgressLectureIds = Object.keys(watchProgress).filter(
    (id) => !watchProgress[id]?.isCompleted && (watchProgress[id]?.watchedSeconds || 0) > 10
  );
  const continueWatchingLectures = lectures.filter((l) => inProgressLectureIds.includes(l.id));

  // Quick Study Stats
  const totalAttempts = attempts.length;
  const averagePercentage = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / totalAttempts)
    : 0;

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

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 md:pb-16 max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6">
      
      {/* 1. Category Filter Strip (Responsive Touch Pills matching Coaching App) */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'all', label: 'All Modules', icon: Sparkles },
          { id: 'batch', label: 'My Batch', icon: BookOpen },
          { id: 'lectures', label: 'Video Classes', icon: PlayCircle },
          { id: 'tests', label: 'Mock Assessments', icon: CheckCircle2 },
          { id: 'notes', label: 'Study Notes & DPP', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap border-none outline-none cursor-pointer ${
                isActive
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-sm'
                  : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Hero Learning Banner (Coaching & Classplus Concept, Borderless) */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[var(--md-sys-color-surface-container)] via-[var(--md-sys-color-surface-container)] to-[var(--md-sys-color-surface-container-high)] p-6 sm:p-10 shadow-xs border-none">
        <div className="absolute -top-16 -right-16 w-96 h-96 bg-[var(--md-sys-color-primary)]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] text-xs font-bold tracking-wide border-none">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <span>Elevate Labs Smart Coaching & CBT</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[var(--md-sys-color-on-surface)] tracking-tight leading-tight">
            Smart Coaching & <span className="text-[var(--md-sys-color-primary)]">Interactive Video</span> Classes
          </h1>

          <p className="text-[var(--md-sys-color-on-surface-variant)] text-xs sm:text-sm sm:leading-relaxed max-w-xl">
            Master your syllabus with distraction-free cloaked video lectures, interactive timestamps, downloadable DPP notes, and rigorous mock test assessments.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {currentBatch && (
              <button
                onClick={() => handleSelectBatchItem(currentBatch.id)}
                className="m3-btn-filled px-6 py-3 text-xs sm:text-sm flex items-center space-x-2 shadow-sm border-none outline-none cursor-pointer hover:scale-102 transition"
              >
                <span>Open {currentBatch.title}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onOpenBatches}
              className="m3-btn-tonal px-5 py-3 text-xs sm:text-sm flex items-center space-x-2 border-none outline-none cursor-pointer hover:scale-102 transition"
            >
              <Layers className="w-4 h-4" />
              <span>All Coaching Batches</span>
            </button>

            <button
              onClick={onOpenAllTests}
              className="m3-btn-tonal px-5 py-3 text-xs sm:text-sm flex items-center space-x-2 border-none outline-none cursor-pointer hover:scale-102 transition"
            >
              <BookOpen className="w-4 h-4" />
              <span>Test Library ({tests.length})</span>
            </button>

            <div className="flex items-center space-x-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] px-4 py-2.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)] border-none">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>Full Batch Enrolled</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 2-COLUMN RESPONSIVE LAYOUT (Main Feed 8 cols, Desktop Sidebar 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        
        {/* LEFT COLUMN: Coaching Modules (8 cols) */}
        <div className="lg:col-span-8 space-y-6 sm:space-y-8">
          
          {/* Quick Feature Highlights (Animate Mock Test app style - 3 Pillars) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Card 1 */}
            <div className="bg-[var(--md-sys-color-surface-container)] p-4 sm:p-5 rounded-3xl border-none shadow-xs space-y-2.5 transition hover:shadow-md">
              <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold">
                <PlayCircle className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Distraction-Free Video
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                Zero-delay playback with custom speed, Auto/HD quality, subtitles, and cloaked streaming.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[var(--md-sys-color-surface-container)] p-4 sm:p-5 rounded-3xl border-none shadow-xs space-y-2.5 transition hover:shadow-md">
              <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] flex items-center justify-center font-bold">
                <BookmarkCheck className="w-5 h-5 text-[var(--md-sys-color-secondary)]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                In-Video Notes
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                Create timestamped study bookmarks during lectures and jump back to exact concept seconds.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-[var(--md-sys-color-surface-container)] p-4 sm:p-5 rounded-3xl border-none shadow-xs space-y-2.5 transition hover:shadow-md">
              <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] flex items-center justify-center font-bold">
                <FolderTree className="w-5 h-5 text-[var(--md-sys-color-tertiary)]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Curriculum Hierarchy
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                Structured Subject ➔ Chapter ➔ Video Classes, DPP notes, and linked mock tests.
              </p>
            </div>
          </div>

          {/* Continue Watching (if tested/in progress) */}
          {continueWatchingLectures.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                  <span>Continue Watching</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {continueWatchingLectures.map((lec) => {
                  const progress = watchProgress[lec.id];
                  const percent = progress ? Math.round((progress.watchedSeconds / progress.totalSeconds) * 100) : 0;
                  return (
                    <div
                      key={lec.id}
                      onClick={() => handleSelectLectureItem(lec.batchId, lec.id)}
                      className="bg-[var(--md-sys-color-surface-container)] rounded-3xl overflow-hidden group cursor-pointer transition flex flex-col border-none shadow-xs hover:shadow-md"
                    >
                      <div className="relative aspect-video overflow-hidden">
                        <img
                          src={lec.thumbnailUrl}
                          alt={lec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 flex items-center justify-center transition">
                          <div className="w-11 h-11 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] flex items-center justify-center group-hover:scale-110 transition shadow-lg">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                        </div>
                        {/* Linear Progress Bar */}
                        <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/40">
                          <div
                            className="h-full bg-[var(--md-sys-color-primary)]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-[var(--md-sys-color-primary)]">
                            In Progress ({percent}%)
                          </span>
                          <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] mt-1 line-clamp-2">
                            {lec.title}
                          </h3>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{lec.durationMinutes} mins</span>
                          </span>
                          <span className="text-[var(--md-sys-color-primary)] font-bold flex items-center space-x-0.5">
                            <span>Resume</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Testing Batch Card (M3 Coaching Platform Style) */}
          {(activeFilter === 'all' || activeFilter === 'batch') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                    <span>My Enrolled Coaching Batch</span>
                  </h2>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Structured learning modules, video classes, and interactive notes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-none">
                    {batches.length} Active Batch
                  </span>
                  <button
                    onClick={onOpenBatches}
                    className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-0 outline-none"
                  >
                    <span>All Batches</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {currentBatch && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {batches.map((b) => (
                    <M3BatchCard
                      key={b.id}
                      batch={b}
                      onSelect={() => handleSelectBatchItem(b.id)}
                      isEnrolled={isEnrolled(b.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Featured Video Classes in Testing Batch */}
          {(activeFilter === 'all' || activeFilter === 'lectures') && freeLectures.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight flex items-center space-x-2">
                    <Play className="w-4 h-4 text-[var(--md-sys-color-secondary)]" />
                    <span>Featured Video Lectures</span>
                  </h2>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Direct access to core video lectures with timeline milestones
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {freeLectures.map((lec) => (
                  <div
                    key={lec.id}
                    onClick={() => handleSelectLectureItem(lec.batchId, lec.id)}
                    className="bg-[var(--md-sys-color-surface-container)] rounded-3xl overflow-hidden group cursor-pointer transition flex flex-col border-none shadow-xs hover:shadow-md"
                  >
                    <div className="relative aspect-video overflow-hidden">
                      <img
                        src={lec.thumbnailUrl}
                        alt={lec.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                      <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] font-bold text-[10px] uppercase tracking-wider border-none">
                        Core Lecture
                      </span>
                      <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 font-mono text-[11px] text-white">
                        {lec.durationMinutes}:00
                      </span>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/25">
                        <div className="w-11 h-11 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] flex items-center justify-center shadow-lg border-none">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-2">
                        {lec.title}
                      </h4>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        <span>{lec.pdfNotes?.length || 0} DPP Notes attached</span>
                        <span className="text-[var(--md-sys-color-primary)] font-bold">Watch Stream →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Featured Mock Assessments (Exact Coaching M3 Styled Cards) */}
          {(activeFilter === 'all' || activeFilter === 'tests') && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                    <span>Featured Mock Assessments</span>
                  </h2>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Handpicked tests for timed practice & instant OMR evaluation
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onOpenAllTests}
                  className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                >
                  <span>View All ({tests.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 1-2 Highlighted Tests with M3 Styled Cards */}
              <div className="space-y-3">
                {featuredTests.map((test) => (
                  <div
                    key={test.id}
                    className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 border-none shadow-xs hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-none">
                          {test.topic}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[var(--md-sys-color-outline)]" />
                          <span>{test.durationMinutes || 15} Mins · {test.questions?.length || 0} Questions</span>
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-[var(--md-sys-color-on-surface)]">
                        {test.title}
                      </h4>

                      {test.description && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-1">
                          {test.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartTest(test)}
                        className="m3-btn-filled px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm border-none outline-none cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Test</span>
                      </button>

                      <button
                        type="button"
                        onClick={onOpenAllTests}
                        className="m3-btn-tonal px-3.5 py-2 text-xs font-bold border-none outline-none cursor-pointer"
                      >
                        All Tests
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: EXECUTIVE DESKTOP SIDEBAR (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* 1. Important Reminders Notice Board (M3 Styling) */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 border-none shadow-xs hover:shadow-md transition space-y-3.5">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs tracking-wider uppercase">
              <Bell className="w-4 h-4 fill-amber-500/20" />
              <span>Important Reminders</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                <p className="text-[var(--md-sys-color-on-surface)] leading-relaxed">
                  <strong>Daily Study Target:</strong> Complete Chapter 01 video classes and attempt the linked mock assessment today.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                <p className="text-[var(--md-sys-color-on-surface)] leading-relaxed">
                  <strong>DPP Material:</strong> Formula sheets for Chapter 02 have been published under Study Notes.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[var(--md-sys-color-primary)] mt-1 shrink-0" />
                <p className="text-[var(--md-sys-color-on-surface)] leading-relaxed">
                  <strong>Security Engine:</strong> Ephemeral token verification and DevTools blackout protection are enabled.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Quick Study Stats (M3 Styling) */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 border-none shadow-xs hover:shadow-md transition space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                <span>Study Activity</span>
              </h3>

              {onOpenAnalytics && (
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer bg-transparent border-0 outline-none"
                >
                  Analytics →
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] border-none">
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-medium">
                  Tests Attempted
                </div>
                <div className="text-xl font-black text-[var(--md-sys-color-on-surface)] mt-1">
                  {totalAttempts}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] border-none">
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-medium">
                  Average Score
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {averagePercentage}%
                </div>
              </div>
            </div>
          </div>

          {/* 3. Quick Studio Shortcuts (M3 Styling) */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 border-none shadow-xs hover:shadow-md transition space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
              Quick Tools & Studios
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              {onOpenNotes && (
                <button
                  type="button"
                  onClick={onOpenNotes}
                  className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-none text-left transition-colors cursor-pointer outline-none"
                >
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
                  <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">Notes Studio</div>
                  <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Formula Sheets</div>
                </button>
              )}

              {onOpenThetaAI && (
                <button
                  type="button"
                  onClick={onOpenThetaAI}
                  className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-none text-left transition-colors cursor-pointer outline-none"
                >
                  <Bot className="w-4 h-4 text-sky-600 dark:text-sky-400 mb-1.5" />
                  <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">Theta AI</div>
                  <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Gemini Tutor</div>
                </button>
              )}

              {onOpenOmr && (
                <button
                  type="button"
                  onClick={onOpenOmr}
                  className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-none text-left transition-colors cursor-pointer outline-none"
                >
                  <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">OMR Scanner</div>
                  <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Sheet Evaluation</div>
                </button>
              )}

              {onOpenCustomBuilder && (
                <button
                  type="button"
                  onClick={onOpenCustomBuilder}
                  className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-none text-left transition-colors cursor-pointer outline-none"
                >
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1.5" />
                  <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">Custom Test</div>
                  <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Custom Builder</div>
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

// Authentic M3 Batch Card Component from Coaching App
const M3BatchCard: React.FC<{ batch: Batch; onSelect: () => void; isEnrolled: boolean }> = ({
  batch,
  onSelect,
  isEnrolled,
}) => {
  return (
    <div
      onClick={onSelect}
      className="bg-[var(--md-sys-color-surface-container)] rounded-3xl overflow-hidden group cursor-pointer transition flex flex-col border-none shadow-xs hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={batch.thumbnailUrl}
          alt={batch.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-highest)]/90 backdrop-blur-md text-[var(--md-sys-color-on-surface)] text-xs font-semibold border-none">
          {batch.category}
        </span>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
          <span className="flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span className="font-bold">{batch.rating}</span>
          </span>
          <span className="flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
            <Users className="w-3.5 h-3.5 text-slate-300" />
            <span>Interactive Cohort</span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3.5">
        <div className="space-y-1.5">
          <h3 className="text-sm sm:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition leading-snug">
            {batch.title}
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 leading-relaxed">
            {batch.tagline || batch.description}
          </p>
        </div>

        {/* Instructor info */}
        <div className="flex items-center space-x-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
          <img
            src={batch.instructor?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
            alt={batch.instructor?.name || 'Faculty'}
            className="w-9 h-9 rounded-full object-cover border-none"
          />
          <div className="text-xs">
            <p className="font-bold text-[var(--md-sys-color-on-surface)]">{batch.instructor?.name || 'Elevate Faculty'}</p>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
              {batch.instructor?.designation || 'Master Educator'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          {isEnrolled ? (
            <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border-none">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Enrolled & Ready</span>
            </div>
          ) : (
            <div>
              <span className="text-base sm:text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                ₹{batch.price}
              </span>
            </div>
          )}

          <button
            className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border-none outline-none cursor-pointer ${
              isEnrolled ? 'm3-btn-tonal' : 'm3-btn-filled'
            }`}
          >
            <span>Open Batch</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
