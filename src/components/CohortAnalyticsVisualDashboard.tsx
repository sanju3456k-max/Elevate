import React, { useState, useMemo } from 'react';
import {
  BarChart2,
  BarChart3,
  TrendingUp,
  Zap,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  Award,
  Users,
  Filter,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  Check,
  X,
  Smartphone,
  BookOpen
} from 'lucide-react';
import type { MathTest, TestAttempt } from '../types';
import type { PerTestCohortAnalytics, StudentAttemptRow } from '../lib/masterAccount';

export interface CohortAnalyticsVisualDashboardProps {
  analytics: PerTestCohortAnalytics;
  test: MathTest;
  selectedTierFilter: string | null;
  onSelectTierFilter: (tier: string | null) => void;
  selectedQuadrantFilter: string | null;
  onSelectQuadrantFilter: (quadrant: string | null) => void;
  onOpenStudent360?: (student: { id: string; name: string; email?: string }) => void;
}

export const CohortAnalyticsVisualDashboard: React.FC<CohortAnalyticsVisualDashboardProps> = ({
  analytics,
  test,
  selectedTierFilter,
  onSelectTierFilter,
  selectedQuadrantFilter,
  onSelectQuadrantFilter,
  onOpenStudent360
}) => {
  const [questionViewMode, setQuestionViewMode] = useState<'bars' | 'grid'>('bars');
  const [hoveredQuestion, setHoveredQuestion] = useState<number | null>(null);

  const studentRows = analytics.studentRows || [];
  const rawTotalAttempts = analytics.totalAttempts || 0;
  const totalAttempts = Math.max(rawTotalAttempts, 1);

  // 1. Calculate Score Distribution Bins
  const scoreBins = useMemo(() => {
    const bins = [
      { id: 'top', label: '90%+', sublabel: 'Mastery', color: 'from-emerald-500 to-teal-500', barBg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', min: 90, max: 100, count: 0 },
      { id: 'good', label: '75–89%', sublabel: 'Proficient', color: 'from-blue-500 to-indigo-500', barBg: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/40', min: 75, max: 89.99, count: 0 },
      { id: 'avg', label: '60–74%', sublabel: 'Competent', color: 'from-sky-500 to-blue-400', barBg: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-50 dark:bg-sky-950/40', min: 60, max: 74.99, count: 0 },
      { id: 'dev', label: '40–59%', sublabel: 'Developing', color: 'from-amber-500 to-yellow-500', barBg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/40', min: 40, max: 59.99, count: 0 },
      { id: 'critical', label: '<40%', sublabel: 'Critical', color: 'from-rose-500 to-red-500', barBg: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/40', min: 0, max: 39.99, count: 0 },
    ];

    studentRows.forEach((r) => {
      const p = r.percentage;
      for (const b of bins) {
        if (p >= b.min && p <= b.max) {
          b.count++;
          break;
        }
      }
    });

    return bins;
  }, [studentRows]);

  const maxBinCount = useMemo(() => {
    return Math.max(...scoreBins.map(b => b.count), 1);
  }, [scoreBins]);

  // 2. Percentile Quartile Calculations (interpolated index for small & large cohorts)
  const percentiles = useMemo(() => {
    if (studentRows.length === 0) return { p90: 0, p75: 0, p50: 0, p25: 0 };
    const sorted = [...studentRows].map(r => r.percentage).sort((a, b) => a - b);
    const getP = (p: number) => {
      const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
      return Math.round(sorted[index]);
    };
    return {
      p90: getP(90),
      p75: getP(75),
      p50: getP(50),
      p25: getP(25)
    };
  }, [studentRows]);

  // 3. Cognitive Speed vs Accuracy Matrix (4 Quadrants)
  const speedAccuracyMatrix = useMemo(() => {
    const medianTime = analytics.averageTimeSeconds || 1800;
    const passThreshold = 60;

    let q1 = 0; // Fast & High Accuracy (Speed Scholars)
    let q2 = 0; // Slow & High Accuracy (Deliberate Thinkers)
    let q3 = 0; // Fast & Low Accuracy (Rushed / Guessing)
    let q4 = 0; // Slow & Low Accuracy (Struggling Group)

    studentRows.forEach((r) => {
      const isAccurate = r.percentage >= passThreshold;
      const isFast = r.timeSpentSeconds <= medianTime;

      if (isFast && isAccurate) q1++;
      else if (!isFast && isAccurate) q2++;
      else if (isFast && !isAccurate) q3++;
      else q4++;
    });

    return {
      medianTime,
      q1: { count: q1, pct: Math.round((q1 / totalAttempts) * 100) },
      q2: { count: q2, pct: Math.round((q2 / totalAttempts) * 100) },
      q3: { count: q3, pct: Math.round((q3 / totalAttempts) * 100) },
      q4: { count: q4, pct: Math.round((q4 / totalAttempts) * 100) }
    };
  }, [studentRows, analytics.averageTimeSeconds, totalAttempts]);

  // 4. Online vs OMR Comparative Breakdown
  const deliveryModeComparison = useMemo(() => {
    const onlineRows = studentRows.filter(r => r.attemptMode !== 'omr');
    const omrRows = studentRows.filter(r => r.attemptMode === 'omr');

    const avg = (rows: StudentAttemptRow[]) =>
      rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length) : 0;
    const avgTime = (rows: StudentAttemptRow[]) =>
      rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.timeSpentSeconds, 0) / (rows.length * 60)) : 0;

    return {
      online: {
        count: onlineRows.length,
        sharePct: Math.round((onlineRows.length / totalAttempts) * 100),
        avgScore: avg(onlineRows),
        avgMins: avgTime(onlineRows)
      },
      omr: {
        count: omrRows.length,
        sharePct: Math.round((omrRows.length / totalAttempts) * 100),
        avgScore: avg(omrRows),
        avgMins: avgTime(omrRows)
      }
    };
  }, [studentRows, totalAttempts]);

  // 5. Topic / Concept Mistake Distribution
  const topicAnalysis = useMemo(() => {
    const topicMap: Record<string, { topic: string; totalQuestions: number; errorCount: number; unattemptedCount: number }> = {};
    const questions = test.questions || [];

    analytics.questionErrorStats.forEach((stat) => {
      const q = questions[stat.questionIndex];
      const topicName = q?.qtopic || q?.topic || test.topic || 'General Mathematics';

      if (!topicMap[topicName]) {
        topicMap[topicName] = { topic: topicName, totalQuestions: 0, errorCount: 0, unattemptedCount: 0 };
      }
      topicMap[topicName].totalQuestions += 1;
      topicMap[topicName].errorCount += stat.wrongCount;
      topicMap[topicName].unattemptedCount += stat.unattemptedCount;
    });

    return Object.values(topicMap).map((t) => {
      const totalPossibleAttempts = t.totalQuestions * totalAttempts;
      const errorPct = totalPossibleAttempts > 0 ? Math.round(((t.errorCount + t.unattemptedCount) / totalPossibleAttempts) * 100) : 0;
      return {
        ...t,
        errorPercentage: errorPct,
        accuracyPercentage: Math.max(0, 100 - errorPct)
      };
    }).sort((a, b) => b.errorPercentage - a.errorPercentage);
  }, [test, analytics.questionErrorStats, totalAttempts]);

  // Critical Questions: Questions with >50% error rate
  const criticalQuestions = useMemo(() => {
    return analytics.questionErrorStats
      .filter(q => q.errorRatePercentage >= 50)
      .sort((a, b) => b.errorRatePercentage - a.errorRatePercentage);
  }, [analytics.questionErrorStats]);

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Row 1: Percentile & Benchmark Bar (Clean Borderless Tonal Chips) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
            Score Benchmarks
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap text-xs font-mono font-bold">
          <span className="px-3 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-0">
            P90 · {percentiles.p90}%
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-500/12 text-blue-700 dark:text-blue-300 border-0">
            P75 · {percentiles.p75}%
          </span>
          <span className="px-3 py-1 rounded-full bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-0">
            Median · {percentiles.p50}%
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border-0">
            P25 · {percentiles.p25}%
          </span>
        </div>
      </div>

      {/* Row 2: Desktop Dual Analytics Grid (Score Distribution & Cognitive Matrix) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        
        {/* GRAPH 1: Score Distribution Frequency Histogram (7 Cols) */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Cohort Score Distribution Histogram
                </h3>
              </div>
              {selectedTierFilter && (
                <button
                  type="button"
                  onClick={() => onSelectTierFilter(null)}
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-0 flex items-center gap-1 cursor-pointer transition active:scale-95"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Filter ({selectedTierFilter})</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Interactive score brackets. Click any tier bar below to filter the student list.
            </p>
          </div>

          {/* Histogram Bars Container */}
          <div className="pt-4 pb-2 px-2">
            <div className="h-44 sm:h-52 flex items-end justify-between gap-2 sm:gap-4 border-b border-slate-200/80 dark:border-zinc-800/80 pb-2">
              {scoreBins.map((bin) => {
                const heightPct = maxBinCount > 0 ? Math.max(12, Math.round((bin.count / maxBinCount) * 100)) : 12;
                const isSelected = selectedTierFilter === bin.id;
                const sharePct = totalAttempts > 0 ? Math.round((bin.count / totalAttempts) * 100) : 0;

                return (
                  <div
                    key={bin.id}
                    onClick={() => onSelectTierFilter(isSelected ? null : bin.id)}
                    className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative select-none"
                  >
                    {/* Hover Value Pill */}
                    <div className="mb-2 text-center transition-transform group-hover:-translate-y-1">
                      <span className="font-mono text-xs font-black text-slate-800 dark:text-zinc-200 block">
                        {bin.count}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                        {sharePct}%
                      </span>
                    </div>

                    {/* Animated Bar Column */}
                    <div className="w-full max-w-[54px] h-28 sm:h-36 bg-slate-100 dark:bg-zinc-800/80 rounded-2xl p-1 flex items-end justify-center transition-all group-hover:bg-slate-200 dark:group-hover:bg-zinc-700">
                      <div
                        className={`w-full rounded-xl transition-all duration-300 bg-gradient-to-t ${bin.color} ${
                          isSelected ? 'ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] shadow-md scale-[1.02]' : 'group-hover:opacity-90'
                        }`}
                        style={{ height: `${bin.count > 0 ? heightPct : 8}%` }}
                      />
                    </div>

                    {/* Bottom Category Label */}
                    <div className="mt-2 text-center">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 whitespace-nowrap">
                        {bin.label}
                      </p>
                      <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 hidden sm:block truncate max-w-[80px]">
                        {bin.sublabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-zinc-400 pt-1">
            <span>Critical Intervention (&lt;40%)</span>
            <span className="font-mono">Mean: {analytics.averagePercentage}%</span>
            <span>Mastery Tier (90%+)</span>
          </div>
        </div>

        {/* GRAPH 2: Cognitive Speed vs Accuracy Matrix (5 Cols) */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Speed vs. Accuracy Matrix
                </h3>
              </div>
              {selectedQuadrantFilter && (
                <button
                  type="button"
                  onClick={() => onSelectQuadrantFilter(null)}
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-0 cursor-pointer transition active:scale-95"
                >
                  Reset
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Quadrant segmentation based on cohort median time ({Math.round(speedAccuracyMatrix.medianTime / 60)}m).
            </p>
          </div>

          {/* 4 Quadrants Grid (Borderless Tonal Cards) */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            
            {/* Q1: Speed Scholars */}
            <div
              onClick={() => onSelectQuadrantFilter(selectedQuadrantFilter === 'q1' ? null : 'q1')}
              className={`p-3 rounded-2xl border-0 transition cursor-pointer select-none ${
                selectedQuadrantFilter === 'q1'
                  ? 'bg-emerald-500/20 ring-2 ring-emerald-500/60'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/15'
              }`}
            >
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Fast &amp; Accurate</span>
                <Zap className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                {speedAccuracyMatrix.q1.count} <span className="text-xs font-normal text-slate-500">({speedAccuracyMatrix.q1.pct}%)</span>
              </p>
              <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold mt-0.5">
                Speed Scholars
              </p>
            </div>

            {/* Q2: Deliberate Scholars */}
            <div
              onClick={() => onSelectQuadrantFilter(selectedQuadrantFilter === 'q2' ? null : 'q2')}
              className={`p-3 rounded-2xl border-0 transition cursor-pointer select-none ${
                selectedQuadrantFilter === 'q2'
                  ? 'bg-blue-500/20 ring-2 ring-blue-500/60'
                  : 'bg-blue-500/10 hover:bg-blue-500/15'
              }`}
            >
              <div className="flex items-center justify-between text-blue-700 dark:text-blue-300 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Paced &amp; Accurate</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                {speedAccuracyMatrix.q2.count} <span className="text-xs font-normal text-slate-500">({speedAccuracyMatrix.q2.pct}%)</span>
              </p>
              <p className="text-[10px] text-blue-800 dark:text-blue-300 font-semibold mt-0.5">
                Deliberate Scholars
              </p>
            </div>

            {/* Q3: Rushed Guesses */}
            <div
              onClick={() => onSelectQuadrantFilter(selectedQuadrantFilter === 'q3' ? null : 'q3')}
              className={`p-3 rounded-2xl border-0 transition cursor-pointer select-none ${
                selectedQuadrantFilter === 'q3'
                  ? 'bg-amber-500/20 ring-2 ring-amber-500/60'
                  : 'bg-amber-500/10 hover:bg-amber-500/15'
              }`}
            >
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Fast &amp; Low Acc</span>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                {speedAccuracyMatrix.q3.count} <span className="text-xs font-normal text-slate-500">({speedAccuracyMatrix.q3.pct}%)</span>
              </p>
              <p className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold mt-0.5">
                Rushed Attempts
              </p>
            </div>

            {/* Q4: Critical Support */}
            <div
              onClick={() => onSelectQuadrantFilter(selectedQuadrantFilter === 'q4' ? null : 'q4')}
              className={`p-3 rounded-2xl border-0 transition cursor-pointer select-none ${
                selectedQuadrantFilter === 'q4'
                  ? 'bg-rose-500/20 ring-2 ring-rose-500/60'
                  : 'bg-rose-500/10 hover:bg-rose-500/15'
              }`}
            >
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Slow &amp; Low Acc</span>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 font-mono">
                {speedAccuracyMatrix.q4.count} <span className="text-xs font-normal text-slate-500">({speedAccuracyMatrix.q4.pct}%)</span>
              </p>
              <p className="text-[10px] text-rose-800 dark:text-rose-300 font-semibold mt-0.5">
                Needs Support
              </p>
            </div>
          </div>

          {/* Quick Guidance Tag */}
          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-zinc-800/60 border-0 text-[10px] text-slate-600 dark:text-zinc-400 flex items-center justify-between">
            <span>Remedial Candidates: <strong>{speedAccuracyMatrix.q3.count + speedAccuracyMatrix.q4.count} students</strong></span>
            <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">Tap quadrant to filter</span>
          </div>
        </div>
      </div>

      {/* Row 3: Question Diagnostic Bar Chart & Delivery Mode Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        
        {/* GRAPH 3: Question-by-Question Diagnostic Stacked Bars (8 Cols) */}
        <div className="lg:col-span-8 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Question Diagnostic Breakdown (Accuracy vs. Error Rate)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Vertical stacked bar for all {analytics.questionErrorStats.length} questions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold font-mono">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Correct
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Skipped
                </span>
                <span className="flex items-center gap-1 text-rose-500">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Wrong
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-full border-0">
                <button
                  type="button"
                  onClick={() => setQuestionViewMode('bars')}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border-0 cursor-pointer transition ${
                    questionViewMode === 'bars'
                      ? 'bg-white dark:bg-zinc-700 text-[#0b57d0] dark:text-white shadow-2xs'
                      : 'bg-transparent text-slate-500'
                  }`}
                >
                  Bars
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionViewMode('grid')}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border-0 cursor-pointer transition ${
                    questionViewMode === 'grid'
                      ? 'bg-white dark:bg-zinc-700 text-[#0b57d0] dark:text-white shadow-2xs'
                      : 'bg-transparent text-slate-500'
                  }`}
                >
                  Grid
                </button>
              </div>
            </div>
          </div>

          {/* Critical Question Alert Banner */}
          {criticalQuestions.length > 0 && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-bold text-rose-900 dark:text-rose-200">
                  {criticalQuestions.length} High-Failure Questions (&gt;50% Error Rate):
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {criticalQuestions.slice(0, 6).map((q) => (
                    <span
                      key={q.questionNumber}
                      className="px-2 py-0.5 rounded-md font-mono font-bold bg-rose-500/20 text-rose-800 dark:text-rose-200 text-[10px]"
                    >
                      Q{q.questionNumber} ({q.errorRatePercentage}%)
                    </span>
                  ))}
                  {criticalQuestions.length > 6 && (
                    <span className="text-[10px] text-rose-600 font-bold">
                      +{criticalQuestions.length - 6} more
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                Recommended for classroom re-teaching
              </span>
            </div>
          )}

          {/* Diagnostic Visual Bars Display */}
          {questionViewMode === 'bars' ? (
            <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
              <div className="min-w-[620px] h-48 flex items-end gap-1.5 pt-4">
                {analytics.questionErrorStats.map((q) => {
                  const total = q.totalAttempts || 1;
                  const correctPct = Math.round((q.correctCount / total) * 100);
                  const wrongPct = Math.round((q.wrongCount / total) * 100);
                  const unattemptedPct = Math.max(0, 100 - correctPct - wrongPct);
                  const isHighError = q.errorRatePercentage >= 50;

                  return (
                    <div
                      key={q.questionNumber}
                      onMouseEnter={() => setHoveredQuestion(q.questionNumber)}
                      onMouseLeave={() => setHoveredQuestion(null)}
                      className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer min-w-[14px]"
                    >
                      {/* Tooltip on Hover */}
                      {hoveredQuestion === q.questionNumber && (
                        <div className="absolute bottom-full mb-2 z-20 p-2 rounded-xl bg-slate-900 text-white text-[10px] font-mono shadow-lg whitespace-nowrap pointer-events-none">
                          <p className="font-bold border-b border-zinc-700 pb-1 mb-1">
                            Question #{q.questionNumber}
                          </p>
                          <p className="text-emerald-400">Correct: {q.correctCount} ({correctPct}%)</p>
                          <p className="text-rose-400">Wrong: {q.wrongCount} ({wrongPct}%)</p>
                          <p className="text-amber-400">Skipped: {q.unattemptedCount} ({unattemptedPct}%)</p>
                        </div>
                      )}

                      {/* Stacked Vertical Bar */}
                      <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-t-lg overflow-hidden flex flex-col-reverse h-full max-h-36">
                        {/* Green: Correct */}
                        <div
                          style={{ height: `${correctPct}%` }}
                          className="w-full bg-emerald-500 transition-all"
                        />
                        {/* Amber: Skipped */}
                        <div
                          style={{ height: `${unattemptedPct}%` }}
                          className="w-full bg-amber-400 transition-all"
                        />
                        {/* Red: Wrong */}
                        <div
                          style={{ height: `${wrongPct}%` }}
                          className={`w-full transition-all ${isHighError ? 'bg-rose-600' : 'bg-rose-400'}`}
                        />
                      </div>

                      {/* Question Number Label */}
                      <span className={`text-[9px] font-mono font-bold mt-1.5 ${
                        isHighError ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-zinc-400'
                      }`}>
                        {q.questionNumber}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Compact Heatmap Grid */
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-56 overflow-y-auto pr-1">
              {analytics.questionErrorStats.map((q) => {
                const isHighError = q.errorRatePercentage >= 50;
                return (
                  <div
                    key={q.questionNumber}
                    className={`p-2 rounded-xl text-center border transition ${
                      isHighError
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-500/30'
                        : q.errorRatePercentage > 0
                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-amber-500/20'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-emerald-500/20'
                    }`}
                  >
                    <p className="text-[10px] font-bold">Q{q.questionNumber}</p>
                    <p className="text-xs font-mono font-bold mt-0.5">{q.errorRatePercentage}%</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* GRAPH 4: Exam Delivery Mode Comparison (Online vs OMR) (4 Cols) */}
        <div className="lg:col-span-4 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                Delivery Mode Analytics
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Online Computer-Based vs OMR Optical Scanner attempts.
            </p>
          </div>

          {/* Mode Participation Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">
                Online ({deliveryModeComparison.online.sharePct}%)
              </span>
              <span className="text-orange-600 dark:text-orange-400">
                OMR ({deliveryModeComparison.omr.sharePct}%)
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-zinc-800">
              <div
                style={{ width: `${deliveryModeComparison.online.sharePct}%` }}
                className="bg-[#0b57d0] h-full transition-all"
              />
              <div
                style={{ width: `${deliveryModeComparison.omr.sharePct}%` }}
                className="bg-orange-500 h-full transition-all"
              />
            </div>
          </div>

          {/* Side by side stats */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-blue-500/10 border-0">
              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                Online Exam
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-zinc-100 font-mono mt-0.5">
                {deliveryModeComparison.online.avgScore}%
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Avg: {deliveryModeComparison.online.avgMins}m duration
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-orange-500/10 border-0">
              <p className="text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider">
                OMR Scanned
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-zinc-100 font-mono mt-0.5">
                {deliveryModeComparison.omr.avgScore}%
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Avg: {deliveryModeComparison.omr.avgMins}m duration
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-zinc-800/60 border-0 text-[10.5px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
            <span>Total Attempts: <strong>{rawTotalAttempts}</strong></span>
            <span>Online: {deliveryModeComparison.online.count} | OMR: {deliveryModeComparison.omr.count}</span>
          </div>
        </div>
      </div>

      {/* Row 4: Topic & Concept Mistake Breakdown (Horizontal Bars) */}
      {topicAnalysis.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                Topic & Chapter Error Distribution
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">
              Ranked from highest mistake frequency to lowest
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {topicAnalysis.map((top) => {
              const isHighMistake = top.errorPercentage >= 40;
              return (
                <div
                  key={top.topic}
                  className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-zinc-800/50 border-0 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-zinc-200 truncate pr-2">
                      {top.topic}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                      isHighMistake
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {top.errorPercentage}% Error ({top.accuracyPercentage}% Mastery)
                    </span>
                  </div>

                  <div className="h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-zinc-800">
                    <div
                      style={{ width: `${top.errorPercentage}%` }}
                      className={`h-full rounded-full transition-all ${
                        isHighMistake ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                    <span>{top.totalQuestions} Questions in test</span>
                    <span>{top.errorCount} wrong answers</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
