import React, { useState, useEffect, useMemo } from 'react';
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
  Search,
  Check
} from 'lucide-react';
import type { MathTest, TestAttempt } from '../types';
import { fetchStudent360OnDemand, invalidateStudent360Cache, type Student360Profile } from '../lib/studentAnalyticsService';
import { TestReportAnalysisView } from './TestReportAnalysisView';
import { APP_STYLES } from './ui/AppStyles';

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
}

export const Student360Modal: React.FC<Student360ModalProps> = ({
  isOpen,
  onClose,
  student,
  allTests = [],
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tests' | 'videos'>('overview');
  const [profile, setProfile] = useState<Student360Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [testSearchQuery, setTestSearchQuery] = useState<string>('');
  const [selectedAttemptForView, setSelectedAttemptForView] = useState<TestAttempt | null>(null);

  // Load student profile on modal open strictly on-demand
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

  if (!isOpen || !student) return null;

  // If viewing a specific solved answer sheet drilldown
  if (selectedAttemptForView) {
    const matchedTest = allTests.find((t) => t.id === selectedAttemptForView.testId) || null;
    return (
      <div className="fixed inset-0 z-[60] bg-white dark:bg-[#121418]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#16181f] text-slate-800 dark:text-zinc-100 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[850px] shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 dark:border-zinc-800/80">
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-400/15 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-base shrink-0">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 truncate">
                  {student.name}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                  Student 360° Profile
                </span>
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 truncate">
                {student.email || student.phone || student.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleForceRefresh}
              disabled={isRefreshing || isLoading}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 border-none"
              title="Force refresh student record from cloud (1 Read)"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition border-none cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-slate-100 dark:border-zinc-800/80 shrink-0 bg-white dark:bg-[#16181f]">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative border-none bg-transparent cursor-pointer ${
              activeTab === 'overview'
                ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            Overview & Metrics
            {activeTab === 'overview' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tests')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative border-none bg-transparent cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tests'
                ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <span>Test Attempts</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800 font-mono">
              {profile?.totalTests ?? 0}
            </span>
            {activeTab === 'tests' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative border-none bg-transparent cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'videos'
                ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <span>Video Lectures</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800 font-mono">
              {profile?.videoStats?.totalCompleted ?? 0}
            </span>
            {activeTab === 'videos' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RotateCw className="w-8 h-8 text-[#0b57d0] animate-spin" />
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                Fetching student performance records strictly on-demand...
              </p>
            </div>
          ) : !profile ? (
            <div className="text-center py-20 text-slate-500 dark:text-zinc-400 text-xs">
              No performance records available for this student.
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & KPIS */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/10">
                      <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Tests Taken</span>
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                        {profile.totalTests}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        Completed exam attempts
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/10">
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Avg Accuracy</span>
                        <Target className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                        {profile.averagePercentage}%
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        Overall test accuracy
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-500/10">
                      <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Videos Done</span>
                        <Video className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                        {profile.videoStats.totalCompleted}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {profile.videoStats.totalMinutesWatched} mins watched
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/10">
                      <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Active Study</span>
                        <Clock className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                        {Math.round(profile.totalStudyMinutes / 60)}h {profile.totalStudyMinutes % 60}m
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        Total engagement time
                      </p>
                    </div>
                  </div>

                  {/* Enrolled Batches Tags */}
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800/80 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Enrolled Batches:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.enrolledBatches.length > 0 ? (
                        profile.enrolledBatches.map((b) => (
                          <span
                            key={b.batchId}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          >
                            {b.batchTitle}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No batches enrolled</span>
                      )}
                    </div>
                  </div>

                  {/* Topic Mastery: Weak Areas vs Strong Areas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Weak Topics */}
                    <div className="p-4 rounded-2xl bg-rose-50/30 dark:bg-rose-950/15 border border-rose-500/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                            Areas Needing Remedial Focus
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                          High Error Count
                        </span>
                      </div>

                      {profile.weakTopics.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-2">
                          No significant weak topics identified yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {profile.weakTopics.map((w, idx) => (
                            <div
                              key={w.topic + idx}
                              className="p-2.5 rounded-xl bg-white dark:bg-[#16181f] flex items-center justify-between shadow-2xs border border-rose-500/10 text-xs"
                            >
                              <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate pr-2">
                                {w.topic}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0 font-mono">
                                {w.mistakeCount} errors
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Strong Topics */}
                    <div className="p-4 rounded-2xl bg-emerald-50/30 dark:bg-emerald-950/15 border border-emerald-500/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-emerald-500" />
                          <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                            Strong Mastery Areas
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          â‰¥70% Accuracy
                        </span>
                      </div>

                      {profile.strongTopics.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-2">
                          Take more tests to populate mastery trends.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {profile.strongTopics.map((s, idx) => (
                            <div
                              key={s.topic + idx}
                              className="p-2.5 rounded-xl bg-white dark:bg-[#16181f] flex items-center justify-between shadow-2xs border border-emerald-500/10 text-xs"
                            >
                              <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate pr-2">
                                {s.topic}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 font-mono">
                                {s.correctCount} tests passed
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Attempts Quick View */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-[#0b57d0]" />
                        <span>Recent Test Submissions</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tests')}
                        className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline border-none bg-transparent cursor-pointer"
                      >
                        View all ({profile.totalTests}) â†’
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-2xl border border-slate-100 dark:border-zinc-800/80 overflow-hidden bg-white dark:bg-[#16181f]">
                      {profile.attempts.slice(0, 3).map((a, i) => (
                        <div key={a.id + i} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-800 dark:text-zinc-200 truncate">
                              {a.testTitle || 'Math Mock Test'}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                              {new Date(a.completedAt).toLocaleDateString()} â€¢ {Math.round(a.timeSpentSeconds / 60)}m duration
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                              {a.score}/{a.totalPoints}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              a.percentage >= 70
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : a.percentage >= 40
                                ? 'bg-amber-500/15 text-amber-600'
                                : 'bg-rose-500/15 text-rose-600'
                            }`}>
                              {a.percentage}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedAttemptForView(a)}
                              className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-bold border-none cursor-pointer flex items-center gap-1 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Sheet</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TEST ATTEMPTS HISTORY */}
              {activeTab === 'tests' && (
                <div className="space-y-4">
                  {/* Search and Filter */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={testSearchQuery}
                        onChange={(e) => setTestSearchQuery(e.target.value)}
                        placeholder="Search tests by title or topic..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs font-medium text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                      Showing {filteredAttempts.length} of {profile.totalTests} attempts
                    </span>
                  </div>

                  {/* Attempts List */}
                  {filteredAttempts.length === 0 ? (
                    <div className="text-center py-14 text-xs text-slate-400 dark:text-zinc-500">
                      No matching test attempts recorded.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredAttempts.map((att, i) => (
                        <div
                          key={att.id + i}
                          className="p-4 rounded-2xl bg-white dark:bg-[#16181f] border border-slate-100 dark:border-zinc-800/80 shadow-2xs flex items-center justify-between gap-3 flex-wrap text-xs hover:border-slate-300 dark:hover:border-zinc-700 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-sm truncate">
                                {att.testTitle || 'Exam Test'}
                              </h4>
                              <span className={`px-2 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                att.attemptMode === 'omr'
                                  ? 'bg-orange-500/15 text-orange-600'
                                  : 'bg-blue-500/15 text-blue-600'
                              }`}>
                                {att.attemptMode || 'online'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-1 flex-wrap">
                              <span>Topic: {att.testTopic || 'Math'}</span>
                              <span>â€¢ Date: {new Date(att.completedAt).toLocaleDateString()}</span>
                              <span>â€¢ Time: {Math.round(att.timeSpentSeconds / 60)}m</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-slate-900 dark:text-zinc-100 font-mono text-sm">
                                {att.score} / {att.totalPoints}
                              </p>
                              <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold font-mono mt-0.5 ${
                                att.percentage >= 70
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : att.percentage >= 40
                                  ? 'bg-amber-500/15 text-amber-600'
                                  : 'bg-rose-500/15 text-rose-600'
                              }`}>
                                {att.percentage}%
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedAttemptForView(att)}
                              className="px-3.5 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-none cursor-pointer flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                              title="Open full student answer sheet with solutions and time breakdown"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Solved Sheet</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VIDEO LECTURES WATCHED */}
              {activeTab === 'videos' && (
                <div className="space-y-4">
                  {/* Summary Banner */}
                  <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                          Lecture Streaming Analytics
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {profile.videoStats.totalCompleted} lectures completed â€¢ {profile.videoStats.totalMinutesWatched} minutes total watch time
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300">
                      Milestone Cloud Sync
                    </span>
                  </div>

                  {/* Lecture List */}
                  {Object.keys(profile.videoStats.lectures).length === 0 ? (
                    <div className="text-center py-16 space-y-2">
                      <p className="text-xs text-slate-400 dark:text-zinc-500">
                        No video lectures completed yet by this student.
                      </p>
                      <p className="text-[11px] text-slate-400/80">
                        When the student watches & completes lectures in LMS, progress automatically syncs here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-2xl border border-slate-100 dark:border-zinc-800/80 overflow-hidden bg-white dark:bg-[#16181f]">
                      {Object.values(profile.videoStats.lectures).map((lec, idx) => {
                        const pct = lec.totalSeconds > 0 ? Math.min(100, Math.round((lec.watchedSeconds / lec.totalSeconds) * 100)) : 100;
                        return (
                          <div key={lec.lectureId + idx} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-zinc-200 truncate">
                                  {lec.lectureTitle || `Lecture ${lec.lectureId}`}
                                </span>
                                {lec.isCompleted && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-600 flex items-center gap-0.5">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    <span>Completed</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                                Watched: {Math.round(lec.watchedSeconds / 60)}m / {Math.round(lec.totalSeconds / 60)}m ({pct}%)
                                {lec.completedAt && ` â€¢ Finished on ${new Date(lec.completedAt).toLocaleDateString()}`}
                              </p>
                            </div>

                            <div className="w-24 bg-slate-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full ${lec.isCompleted ? 'bg-emerald-500' : 'bg-purple-500'}`}
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

        {/* Footer Bar */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50 dark:bg-zinc-900/30 text-[11px] text-slate-500 dark:text-zinc-400">
          <span>
            Zero-Waste Tier: Loaded strictly on-demand (Max 2 Firestore reads, cached 10m).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold border-none cursor-pointer transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
