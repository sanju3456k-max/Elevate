import React, { useState, useEffect, useMemo } from 'react';
import { setAppThemeColor } from '../lib/appThemeColor';
import {
  X,
  RotateCw,
  BarChart2,
  BookOpen,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Video,
  Award,
  ChevronRight,
  Eye,
  Calendar,
  Sparkles,
  Smartphone,
  Download,
  Flame,
  ArrowLeft,
  ChevronLeft,
  Search,
  Check,
  TrendingUp,
  Percent,
  Activity,
  ShieldCheck,
  FileText,
  Zap,
  CheckCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import type { MathTest, TestAttempt } from '../types';
import { fetchStudent360OnDemand, invalidateStudent360Cache, type Student360Profile } from '../lib/studentAnalyticsService';
import { TestReportAnalysisView } from './TestReportAnalysisView';
import { useBackHandler } from '../hooks/useBackNavigation';

export interface Student360ModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    enrolledBatches: { batchId: string; batchTitle: string; status?: string }[];
  } | null;
  allTests?: MathTest[];
  onResetDeviceLock?: (userId: string, studentName: string) => Promise<void> | void;
  isDarkMode?: boolean;
}

export const Student360Modal: React.FC<Student360ModalProps> = ({
  isOpen,
  onClose,
  student,
  allTests = [],
  onResetDeviceLock,
  isDarkMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tests' | 'videos'>('overview');
  const [profile, setProfile] = useState<Student360Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isResettingDevice, setIsResettingDevice] = useState<boolean>(false);
  const [testSearchQuery, setTestSearchQuery] = useState<string>('');
  const [selectedAttemptForView, setSelectedAttemptForView] = useState<TestAttempt | null>(null);

  // Synchronize Mobile & Web Status Bar Theme Color (Pure White #ffffff in Light, #0b0c10 in Dark)
  useEffect(() => {
    if (!isOpen) return;
    const targetColor = isDarkMode ? '#0b0c10' : '#ffffff';
    setAppThemeColor(targetColor);
    return () => {
      const restoreColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
      setAppThemeColor(restoreColor);
    };
  }, [isOpen, isDarkMode]);

  // Hardware Back Navigation (Priority 60 ensures it closes this view smoothly)
  useBackHandler({
    isOpen: isOpen && !selectedAttemptForView,
    priority: 60,
    id: 'student_360_full_screen_back',
    onBack: onClose,
  });

  // Load student profile on open strictly on-demand (Max 2 reads, cached for 10 minutes)
  useEffect(() => {
    if (!isOpen || !student) {
      setProfile(null);
      setSelectedAttemptForView(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchStudent360OnDemand(
      student.id,
      student.name,
      student.email,
      student.phone,
      student.enrolledBatches || [],
      false
    )
      .then((data) => {
        if (isMounted) {
          setProfile(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Error loading student 360 profile:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, student]);

  // Handle explicit 1-read refresh
  const handleForceRefresh = async () => {
    if (!student || isRefreshing) return;
    setIsRefreshing(true);
    invalidateStudent360Cache(student.id);

    try {
      const freshData = await fetchStudent360OnDemand(
        student.id,
        student.name,
        student.email,
        student.phone,
        student.enrolledBatches || [],
        true
      );
      setProfile(freshData);
    } catch (err) {
      console.warn('Refresh student 360 error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Hardware Device Lock Reset directly from student profile
  const handleDeviceReset = async () => {
    if (!student || !onResetDeviceLock || isResettingDevice) return;
    setIsResettingDevice(true);
    try {
      await onResetDeviceLock(student.id, student.name);
    } catch (err) {
      console.warn('Device reset error:', err);
    } finally {
      setIsResettingDevice(false);
    }
  };

  // Filter test attempts
  const filteredAttempts = useMemo(() => {
    if (!profile?.attempts) return [];
    if (!testSearchQuery.trim()) return profile.attempts;
    const q = testSearchQuery.toLowerCase();
    return profile.attempts.filter(
      (a) =>
        (a.testTitle && a.testTitle.toLowerCase().includes(q)) ||
        (a.testTopic && a.testTopic.toLowerCase().includes(q))
    );
  }, [profile?.attempts, testSearchQuery]);

  // 1. Chronological Score Progression Curve Data
  const progressionData = useMemo(() => {
    if (!profile?.attempts || profile.attempts.length === 0) return [];
    const sorted = [...profile.attempts].sort(
      (a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
    );
    return sorted.map((att, i) => {
      const dateObj = new Date(att.completedAt || 0);
      const dateStr = isNaN(dateObj.getTime())
        ? `Test ${i + 1}`
        : dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        index: i + 1,
        name: att.testTitle ? (att.testTitle.length > 15 ? att.testTitle.slice(0, 15) + '…' : att.testTitle) : `Test ${i + 1}`,
        fullTitle: att.testTitle || `Test ${i + 1}`,
        date: dateStr,
        percentage: Math.round(att.percentage || 0),
        score: att.score,
        totalPoints: att.totalPoints,
        accuracy: Math.round(att.accuracy ?? att.percentage ?? 0),
        timeMinutes: Math.round((att.timeSpentSeconds || 0) / 60),
        mode: (att.attemptMode || 'online').toUpperCase(),
        attempt: att,
      };
    });
  }, [profile?.attempts]);

  // 2. Accuracy & Question Outcome Distribution Data (Donut Chart)
  const questionDistributionData = useMemo(() => {
    if (!profile?.attempts || profile.attempts.length === 0) {
      return [
        { name: 'Correct', value: 0, color: '#10b981' },
        { name: 'Incorrect', value: 0, color: '#f43f5e' },
        { name: 'Unanswered', value: 0, color: '#94a3b8' },
      ];
    }
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    profile.attempts.forEach((a) => {
      if (typeof a.correctCount === 'number') {
        correct += a.correctCount;
      } else {
        correct += Math.round(((a.percentage || 0) / 100) * (a.totalPoints || 10));
      }

      if (typeof a.incorrectCount === 'number') {
        incorrect += a.incorrectCount;
      } else {
        incorrect += Math.max(0, (a.totalPoints || 10) - correct);
      }

      if (typeof a.unansweredCount === 'number') {
        unanswered += a.unansweredCount;
      }
    });

    const total = correct + incorrect + unanswered;
    if (total === 0) {
      return [
        { name: 'Correct', value: profile.averagePercentage || 70, color: '#10b981' },
        { name: 'Incorrect', value: 100 - (profile.averagePercentage || 70), color: '#f43f5e' },
        { name: 'Unanswered', value: 0, color: '#94a3b8' },
      ];
    }

    return [
      { name: 'Correct', value: correct, color: '#10b981' },
      { name: 'Incorrect', value: incorrect, color: '#f43f5e' },
      { name: 'Unanswered', value: unanswered, color: '#94a3b8' },
    ];
  }, [profile?.attempts, profile?.averagePercentage]);

  // 3. Speed & Time Efficiency Benchmark Data
  const speedEfficiencyData = useMemo(() => {
    if (!profile?.attempts || profile.attempts.length === 0) return [];
    return profile.attempts.slice(0, 8).map((a, i) => {
      const qCount =
        (a.correctCount || 0) + (a.incorrectCount || 0) + (a.unansweredCount || 0) ||
        (a.totalPoints || 10);
      const secPerQ = qCount > 0 ? Math.round((a.timeSpentSeconds || 0) / qCount) : 60;
      return {
        name: a.testTitle ? (a.testTitle.length > 10 ? a.testTitle.slice(0, 10) + '…' : a.testTitle) : `T${i + 1}`,
        secPerQ: Math.min(180, secPerQ),
        target: 60, // Standard target of 60 seconds per question
        percentage: a.percentage,
      };
    });
  }, [profile?.attempts]);

  if (!isOpen || !student) return null;

  // If inspecting a specific solved answer sheet drilldown
  if (selectedAttemptForView) {
    const matchedTest = allTests.find((t) => t.id === selectedAttemptForView.testId) || null;
    return (
      <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0b0c10]">
        <TestReportAnalysisView
          attempt={selectedAttemptForView}
          test={matchedTest}
          allTests={allTests}
          onClose={() => setSelectedAttemptForView(null)}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] select-none flex flex-col overflow-hidden animate-in fade-in duration-200">
      
      {/* ============================================================== */}
      {/* 1. FIXED TOP COMMAND HEADER WITH SEAMLESS STATUS BAR MATCHING   */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0b0c10]/95 backdrop-blur-md border-b border-slate-100 dark:border-zinc-800/80 shadow-none pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.45rem)] md:pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.5rem)] pb-3 px-3.5 sm:px-6 md:px-8 transition-colors shrink-0">
        <div className="max-w-[1600px] mx-auto space-y-3 w-full">
          
          {/* Top Row: Back Button, Student Avatar, Identity, Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={onClose}
                title="Back to Master Console"
                aria-label="Back to Master Console"
                className="w-9 h-9 -ml-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#1f1f1f] dark:text-[#e3e3e3] border-none bg-transparent cursor-pointer flex items-center justify-center transition active:scale-95 shrink-0"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
              </button>

              {/* Student Identity Badge */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-[#1f1f1f] dark:text-white truncate">
                      {student.name}
                    </h1>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] dark:text-[#a8c7fa] border-0 shrink-0">
                      Student 360° Profile
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                    {student.email || student.phone || student.id}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Header Actions: Reset Hardware Lock, Refresh, Close */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
              {onResetDeviceLock && (
                <button
                  type="button"
                  onClick={handleDeviceReset}
                  disabled={isResettingDevice}
                  className="h-8.5 px-3.5 rounded-full bg-[#f0f4f9] hover:bg-[#e1e7f0] dark:bg-[#1e1f20] dark:hover:bg-[#2a2b2c] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold transition active:scale-95 cursor-pointer border-0 flex items-center gap-1.5 disabled:opacity-50"
                  title="Reset student device lock (permits registering a new phone or laptop upon next login)"
                >
                  <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="hidden sm:inline">Reset Device Lock</span>
                  <span className="sm:hidden">Reset</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleForceRefresh}
                disabled={isRefreshing || isLoading}
                className="h-8.5 px-3.5 rounded-full bg-[#f0f4f9] hover:bg-[#e1e7f0] dark:bg-[#1e1f20] dark:hover:bg-[#2a2b2c] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold transition active:scale-95 cursor-pointer border-0 flex items-center gap-1.5 disabled:opacity-50"
                title="Force refresh student academic records from cloud (1 Read)"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8.5 h-8.5 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition border-none cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter / Category Pills: Optimized with responsive mobile labels & shrink-0 whitespace-nowrap */}
          <div className="flex items-center gap-1.5 sm:gap-2 border-none pb-0.5 overflow-x-auto scrollbar-none w-full max-w-full">
            {[
              { id: 'overview', label: 'Overview & Analytics', mobileLabel: 'Overview', icon: Sparkles },
              { id: 'tests', label: 'Recent Test Submissions', mobileLabel: 'Recent Tests', icon: BookOpen, count: profile?.totalTests },
              { id: 'videos', label: 'Video Streaming', mobileLabel: 'Videos', icon: Video, count: profile?.videoStats?.totalCompleted },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`h-8 sm:h-8.5 px-3 sm:px-4 rounded-full text-xs transition-all flex items-center justify-center gap-1.5 outline-none cursor-pointer active:scale-95 border-0 shrink-0 whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#062e6f] font-bold shadow-xs'
                      : 'bg-[#f0f4f9] hover:bg-[#e1e7f0] text-[#444746] hover:text-[#1f1f1f] dark:bg-[#1e1f20] dark:hover:bg-[#2a2b2c] dark:text-[#c4c7c5] dark:hover:text-white font-semibold'
                  }`}
                >
                  <TabIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums shrink-0 leading-none ${
                        isSelected
                          ? 'bg-white/25 dark:bg-[#062e6f]/25 text-white dark:text-[#062e6f]'
                          : 'bg-black/8 dark:bg-white/10 text-[#444746] dark:text-[#c4c7c5]'
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

      {/* ============================================================== */}
      {/* 2. SCROLLABLE FULL-PAGE PERFORMANCE WORKSTATION BODY           */}
      {/* ============================================================== */}
      <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 md:px-8 py-4 pb-24 sm:pb-16 [scrollbar-width:thin] bg-white dark:bg-[#0b0c10]">
        <div className="max-w-[1600px] mx-auto space-y-6 w-full">

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-28 space-y-3">
              <RotateCw className="w-8 h-8 text-[#0b57d0] animate-spin" />
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                Fetching student 360° records on-demand...
              </p>
            </div>
          ) : !profile ? (
            <div className="text-center py-24 text-slate-500 dark:text-zinc-400 text-xs">
              No performance records found for this student.
            </div>
          ) : (
            <>
              {/* ========================================================== */}
              {/* TAB 1: OVERVIEW & ADVANCED VISUAL GRAPH SUITE              */}
              {/* ========================================================== */}
              {activeTab === 'overview' && (
                <div className="space-y-6">

                  {/* 4 Minimal Borderless KPI Stats - Clean Transparent Surface */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 py-2 pb-5 border-b border-slate-100 dark:border-zinc-800/80">
                    
                    {/* Accuracy */}
                    <div className="p-3 sm:p-4 rounded-2xl hover:bg-slate-50/70 dark:hover:bg-white/5 transition flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Overall Accuracy</span>
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Target className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums tracking-tight">
                          {profile.averagePercentage}%
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                          Cross-test average accuracy
                        </p>
                      </div>
                    </div>

                    {/* Tests Completed */}
                    <div className="p-3 sm:p-4 rounded-2xl hover:bg-slate-50/70 dark:hover:bg-white/5 transition flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[#0b57d0] dark:text-[#a8c7fa] mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Tests Attempted</span>
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <BookOpen className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums tracking-tight">
                          {profile.totalTests}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                          Online & OMR exam attempts
                        </p>
                      </div>
                    </div>

                    {/* Active Study Hours */}
                    <div className="p-3 sm:p-4 rounded-2xl hover:bg-slate-50/70 dark:hover:bg-white/5 transition flex flex-col justify-between">
                      <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Total Engagement</span>
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                          <Clock className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums tracking-tight">
                          {Math.round(profile.totalStudyMinutes / 60)}h {profile.totalStudyMinutes % 60}m
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                          Active problem-solving time
                        </p>
                      </div>
                    </div>

                    {/* Video Lessons Completed */}
                    <div className="p-3 sm:p-4 rounded-2xl hover:bg-slate-50/70 dark:hover:bg-white/5 transition flex flex-col justify-between">
                      <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Videos Completed</span>
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                          <Video className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums tracking-tight">
                          {profile.videoStats.totalCompleted}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                          {profile.videoStats.totalMinutesWatched} mins watched
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* Enrolled Batches Row */}
                  <div className="py-3 flex items-center justify-between flex-wrap gap-2.5 border-b border-slate-100 dark:border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        Enrolled Cohorts & Batches:
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.enrolledBatches && profile.enrolledBatches.length > 0 ? (
                        profile.enrolledBatches.map((b) => (
                          <span
                            key={b.batchId}
                            className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#0b57d0] dark:text-[#a8c7fa]"
                          >
                            {b.batchTitle}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic">No batches enrolled</span>
                      )}
                    </div>
                  </div>

                  {/* ======================================================== */}
                  {/* VISUAL RECHARTS SUITE: SCORE PROGRESSION GRAPH           */}
                  {/* ======================================================== */}
                  <div className="py-4 space-y-4 border-b border-slate-100 dark:border-zinc-800/80">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          <span>Chronological Score Progression Curve</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          Test-to-test performance trend over time across completed attempts.
                        </p>
                      </div>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#f0f4f9] dark:bg-[#1e1f20] text-slate-700 dark:text-zinc-300 tabular-nums">
                        {progressionData.length} Test Events
                      </span>
                    </div>

                    {progressionData.length === 0 ? (
                      <div className="h-48 flex items-center justify-center text-xs text-slate-600 dark:text-zinc-300 italic">
                        Not enough test attempts recorded to render a progression curve.
                      </div>
                    ) : (
                      <div className="w-full h-64 sm:h-72 min-w-0 pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={progressionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="scoreProgressionGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0b57d0" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#0b57d0" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#27272a' : '#f1f5f9'} />
                            <XAxis
                              dataKey="date"
                              stroke={isDarkMode ? '#71717a' : '#94a3b8'}
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              domain={[0, 100]}
                              stroke={isDarkMode ? '#71717a' : '#94a3b8'}
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(val) => `${val}%`}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="p-3 bg-white dark:bg-[#1f222a] rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-800 text-xs space-y-1">
                                      <p className="font-bold text-slate-900 dark:text-zinc-100">
                                        {d.fullTitle}
                                      </p>
                                      <p className="text-[11px] text-slate-700 dark:text-zinc-300 tabular-nums">
                                        {d.date} • {d.mode}
                                      </p>
                                      <div className="pt-1 flex items-center justify-between gap-4 font-bold tabular-nums">
                                        <span className="text-[#0b57d0] dark:text-[#a8c7fa]">
                                          Percentage: {d.percentage}%
                                        </span>
                                        <span className="text-slate-700 dark:text-zinc-300">
                                          {d.score}/{d.totalPoints} Marks
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="percentage"
                              stroke="#0b57d0"
                              strokeWidth={2.5}
                              fillOpacity={1}
                              fill="url(#scoreProgressionGradient)"
                              activeDot={{ r: 6, stroke: '#0b57d0', strokeWidth: 2, fill: '#ffffff' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* ======================================================== */}
                  {/* TWO-COLUMN VISUAL SUITE: ACCURACY DONUT & SPEED BAR     */}
                  {/* ======================================================== */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-5 border-b border-slate-100 dark:border-zinc-800/80">
                    
                    {/* Donut Chart: Question Response Distribution */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-500" />
                          <span>Question Response Distribution</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          Aggregate breakdown of all questions answered across tests.
                        </p>
                      </div>

                      <div className="h-56 min-w-0 flex items-center justify-center relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={questionDistributionData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {questionDistributionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0];
                                  return (
                                    <div className="px-3 py-1.5 bg-white dark:bg-[#1f222a] rounded-xl shadow-lg border border-slate-100 dark:border-zinc-800 text-xs font-bold text-slate-900 dark:text-zinc-100">
                                      {d.name}: {d.value} questions
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>

                        {/* Center Ring Metric */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
                            {profile.averagePercentage}%
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                            Accuracy
                          </span>
                        </div>
                      </div>

                      {/* Legend Chips */}
                      <div className="flex items-center justify-center gap-4 text-xs font-medium pt-1">
                        {questionDistributionData.map((item) => (
                          <div key={item.name} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-slate-600 dark:text-zinc-400 font-bold">{item.name}</span>
                            <span className="tabular-nums text-slate-900 dark:text-zinc-100">({item.value})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bar Chart: Speed & Time per Question */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" />
                          <span>Speed vs Target Benchmark (Sec/Q)</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          Time spent per question compared against 60-second target pace.
                        </p>
                      </div>

                      {speedEfficiencyData.length === 0 ? (
                        <div className="h-56 flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400 italic">
                          No attempt speed records available yet.
                        </div>
                      ) : (
                        <div className="h-56 min-w-0 pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={speedEfficiencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#27272a' : '#f1f5f9'} />
                              <XAxis dataKey="name" stroke={isDarkMode ? '#71717a' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis stroke={isDarkMode ? '#71717a' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}s`} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const d = payload[0].payload;
                                    return (
                                      <div className="p-2.5 bg-white dark:bg-[#1f222a] rounded-xl shadow-lg border border-slate-100 dark:border-zinc-800 text-xs space-y-1">
                                        <p className="font-bold text-slate-900 dark:text-zinc-100">{d.name}</p>
                                        <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">Pace: {d.secPerQ}s / Question</p>
                                        <p className="text-[10px] text-slate-500 tabular-nums">Target: 60s benchmark</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar dataKey="secPerQ" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="flex items-center justify-center gap-4 text-xs font-medium pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <span className="text-slate-600 dark:text-zinc-400">Actual Pace (Sec/Q)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-zinc-700" />
                          <span className="text-slate-600 dark:text-zinc-400">Target (60s)</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* ======================================================== */}
                  {/* TOPIC MASTERY: WEAK AREAS VS STRONG AREAS MATRIX         */}
                  {/* ======================================================== */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-5 border-b border-slate-100 dark:border-zinc-800/80">
                    
                    {/* Weak Topics */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-zinc-100">
                            Areas Needing Remedial Focus
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                          Error Density
                        </span>
                      </div>

                      {profile.weakTopics.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-zinc-400 italic py-4 text-center">
                          No significant weak topics identified yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {profile.weakTopics.map((w, idx) => (
                            <div
                              key={w.topic + idx}
                              className="p-3 rounded-2xl bg-[#f0f4f9]/70 dark:bg-[#1e1f20]/60 hover:bg-[#e1e7f0] dark:hover:bg-[#2a2b2c] flex items-center justify-between text-xs transition"
                            >
                              <span className="font-bold text-slate-800 dark:text-zinc-200 truncate pr-2">
                                {w.topic}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0 tabular-nums">
                                {w.mistakeCount} errors
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Strong Topics */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-emerald-500" />
                          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-zinc-100">
                            Strong Mastery Areas
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                          ≥70% Accuracy
                        </span>
                      </div>

                      {profile.strongTopics.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-zinc-400 italic py-4 text-center">
                          More test attempts needed to populate mastery trends.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {profile.strongTopics.map((s, idx) => (
                            <div
                              key={s.topic + idx}
                              className="p-3 rounded-2xl bg-[#f0f4f9]/70 dark:bg-[#1e1f20]/60 hover:bg-[#e1e7f0] dark:hover:bg-[#2a2b2c] flex items-center justify-between text-xs transition"
                            >
                              <span className="font-bold text-slate-800 dark:text-zinc-200 truncate pr-2">
                                {s.topic}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 tabular-nums">
                                {s.correctCount} tests passed
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* ======================================================== */}
                  {/* RECENT TEMPTATION & RESPONSE SHEETS (QUICK VIEW)         */}
                  {/* ======================================================== */}
                  <div className="py-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          <span>Recent Response & Temptation Sheets</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          Inspect actual solved answer sheets with question-by-question explanations.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tests')}
                        className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline border-none bg-transparent cursor-pointer"
                      >
                        View all ({profile.totalTests}) →
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 pt-1">
                      {profile.attempts.slice(0, 4).map((a, i) => (
                        <div
                          key={a.id + i}
                          className="py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-white/5 px-2.5 rounded-2xl transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-800 dark:text-zinc-200 truncate text-sm">
                                {a.testTitle || 'Math Mock Test'}
                              </p>
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#f0f4f9] dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 tabular-nums">
                                {a.attemptMode || 'online'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium tabular-nums mt-0.5">
                              {new Date(a.completedAt).toLocaleDateString()} • {Math.round(a.timeSpentSeconds / 60)}m duration
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-bold tabular-nums text-slate-700 dark:text-zinc-300">
                              {a.score}/{a.totalPoints}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                                a.percentage >= 70
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : a.percentage >= 40
                                  ? 'bg-amber-500/15 text-amber-600'
                                  : 'bg-rose-500/15 text-rose-600'
                              }`}
                            >
                              {a.percentage}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedAttemptForView(a)}
                              className="h-8 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#c2e7ff] text-xs font-bold border-0 cursor-pointer flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                              title="Inspect full student answer sheet with solutions and time breakdown"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Sheet</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* ========================================================== */}
              {/* TAB 2: COMPLETE TEST ATTEMPTS & TEMPTATION SHEETS LIST     */}
              {/* ========================================================== */}
              {activeTab === 'tests' && (
                <div className="space-y-4">
                  {/* Search and Filter */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="text"
                        value={testSearchQuery}
                        onChange={(e) => setTestSearchQuery(e.target.value)}
                        placeholder="Search tests by title, topic, or paper..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-full bg-[#f0f4f9] dark:bg-[#1e1f20] text-xs font-medium text-slate-800 dark:text-zinc-200 placeholder:text-[#747775] dark:placeholder:text-[#8e918f] border-0 outline-none focus:ring-2 focus:ring-[#0b57d0]/25 transition"
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-bold tabular-nums">
                      Showing {filteredAttempts.length} of {profile.totalTests} attempts
                    </span>
                  </div>

                  {/* Attempts List - Clean Divided Layout */}
                  {filteredAttempts.length === 0 ? (
                    <div className="text-center py-20 text-xs text-slate-500 dark:text-zinc-400">
                      No matching test attempts recorded.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {filteredAttempts.map((att, i) => (
                        <div
                          key={att.id + i}
                          className="py-3.5 px-3 hover:bg-slate-50/70 dark:hover:bg-white/5 flex items-center justify-between gap-3 flex-wrap text-xs rounded-2xl transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-slate-900 dark:text-zinc-100 text-sm sm:text-base truncate">
                                {att.testTitle || 'Exam Test'}
                              </h4>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  att.attemptMode === 'omr'
                                    ? 'bg-orange-500/15 text-orange-600'
                                    : 'bg-blue-500/15 text-[#0b57d0] dark:text-[#a8c7fa]'
                                }`}
                              >
                                {att.attemptMode || 'online'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 font-medium tabular-nums mt-1 flex-wrap">
                              <span>Topic: {att.testTopic || 'General'}</span>
                              <span>• Date: {new Date(att.completedAt).toLocaleDateString()}</span>
                              <span>• Time: {Math.round(att.timeSpentSeconds / 60)}m</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-slate-900 dark:text-zinc-100 tabular-nums text-sm">
                                {att.score} / {att.totalPoints}
                              </p>
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums mt-0.5 ${
                                  att.percentage >= 70
                                    ? 'bg-emerald-500/15 text-emerald-600'
                                    : att.percentage >= 40
                                    ? 'bg-amber-500/15 text-amber-600'
                                    : 'bg-rose-500/15 text-rose-600'
                                }`}
                              >
                                {att.percentage}%
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedAttemptForView(att)}
                              className="h-8 sm:h-8.5 px-3 sm:px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#c2e7ff] text-xs font-bold border-0 cursor-pointer flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0 whitespace-nowrap"
                              title="Open full student answer sheet with solutions and time breakdown"
                            >
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span className="hidden sm:inline">View Solved Sheet</span>
                              <span className="sm:hidden">Solved Sheet</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================== */}
              {/* TAB 3: VIDEO LECTURES STREAMING PROGRESS                   */}
              {/* ========================================================== */}
              {activeTab === 'videos' && (
                <div className="space-y-4">
                  {/* Summary Banner */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-purple-500/8 dark:bg-purple-500/15 border-0 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-zinc-100">
                          Curriculum Video Streaming Analytics
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          {profile.videoStats.totalCompleted} lectures completed • {profile.videoStats.totalMinutesWatched} minutes total watch time
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300">
                      Milestone Cloud Sync
                    </span>
                  </div>

                  {/* Lecture List - Clean Divided Layout */}
                  {Object.keys(profile.videoStats?.lectures || {}).length === 0 ? (
                    <div className="text-center py-20 space-y-2">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        No video lectures completed yet by this student.
                      </p>
                      <p className="text-[11px] text-slate-500/80">
                        When the student completes lectures in the course viewer, real-time analytics stream here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {Object.values(profile.videoStats?.lectures || {}).map((lec, idx) => {
                        const pct =
                          lec.totalSeconds > 0
                            ? Math.min(100, Math.round((lec.watchedSeconds / lec.totalSeconds) * 100))
                            : 100;
                        return (
                          <div
                            key={lec.lectureId + idx}
                            className="py-3.5 px-3 hover:bg-slate-50/70 dark:hover:bg-white/5 flex items-center justify-between gap-3 text-xs rounded-2xl transition"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-zinc-200 truncate">
                                  {lec.lectureTitle || `Lecture ${lec.lectureId}`}
                                </span>
                                {lec.isCompleted && (
                                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center gap-0.5">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    <span>Completed</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium tabular-nums mt-0.5">
                                Watched: {Math.round(lec.watchedSeconds / 60)}m / {Math.round(lec.totalSeconds / 60)}m ({pct}%)
                                {lec.completedAt && ` • Finished on ${new Date(lec.completedAt).toLocaleDateString()}`}
                              </p>
                            </div>

                            <div className="w-28 bg-[#f0f4f9] dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  lec.isCompleted ? 'bg-emerald-500' : 'bg-purple-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>

    </div>
  );
};
