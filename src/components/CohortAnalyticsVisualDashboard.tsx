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
  BookOpen,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { MathTest, TestAttempt } from '../types';
import { getQuestionExplanation } from '../types';
import type { PerTestCohortAnalytics, StudentAttemptRow } from '../lib/masterAccount';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';

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
  const [hoveredQuestionData, setHoveredQuestionData] = useState<{
    questionNumber: number;
    correctCount: number;
    wrongCount: number;
    unattemptedCount: number;
    correctPct: number;
    wrongPct: number;
    unattemptedPct: number;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredScoreBin, setHoveredScoreBin] = useState<{
    label: string;
    sublabel: string;
    count: number;
    sharePct: number;
    isSelected: boolean;
    x: number;
    y: number;
  } | null>(null);
  const [inspectedQuestionNumber, setInspectedQuestionNumber] = useState<number | null>(null);

  const inspectedQuestionData = useMemo(() => {
    if (inspectedQuestionNumber === null) return null;
    const stat = analytics.questionErrorStats.find((s) => s.questionNumber === inspectedQuestionNumber) || null;
    const qObj = Array.isArray(test.questions) ? test.questions[inspectedQuestionNumber - 1] || null : null;
    return { stat, question: qObj };
  }, [inspectedQuestionNumber, analytics.questionErrorStats, test.questions]);

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
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap text-xs tabular-nums font-bold">
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

          {/* Histogram Bars Container (Minimal M3 Style) */}
          <div className="pt-3 pb-1 px-1 sm:px-2">
            <div className="relative h-44 sm:h-52 flex items-end justify-between gap-3 sm:gap-5 border-b border-slate-200/70 dark:border-zinc-800/80 pb-2.5">
              {/* Subtle horizontal reference gridlines */}
              <div className="pointer-events-none absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between">
                <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
                <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
                <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
              </div>

              {scoreBins.map((bin) => {
                const rawPct = maxBinCount > 0 ? Math.round((bin.count / maxBinCount) * 100) : 0;
                const heightPct = bin.count > 0 ? Math.max(10, rawPct) : 4;
                const isSelected = selectedTierFilter === bin.id;
                const isDimmed = Boolean(selectedTierFilter && !isSelected);
                const sharePct = totalAttempts > 0 ? Math.round((bin.count / totalAttempts) * 100) : 0;

                return (
                  <button
                    key={bin.id}
                    type="button"
                    onClick={() => onSelectTierFilter(isSelected ? null : bin.id)}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredScoreBin({
                        label: bin.label,
                        sublabel: bin.sublabel,
                        count: bin.count,
                        sharePct,
                        isSelected,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8
                      });
                    }}
                    onMouseLeave={() => setHoveredScoreBin(null)}
                    className={`relative z-10 flex-1 flex flex-col items-center h-full justify-end cursor-pointer group select-none border-0 bg-transparent p-0 transition-opacity duration-200 ${
                      isDimmed ? 'opacity-40 hover:opacity-80' : 'opacity-100'
                    }`}
                  >
                    {/* Minimal Value Label */}
                    <div className="mb-1.5 text-center">
                      <span className="tabular-nums text-xs font-bold text-slate-800 dark:text-zinc-100 leading-none">
                        {bin.count}
                      </span>
                      <span className="block text-[10px] tabular-nums text-slate-400 dark:text-zinc-500 mt-0.5">
                        {sharePct}%
                      </span>
                    </div>

                    {/* Clean Minimal Bar */}
                    <div className="w-full max-w-[42px] h-28 sm:h-34 flex items-end justify-center">
                      <div
                        className={`w-full rounded-t-xl rounded-b-sm transition-all duration-200 ${bin.barBg} ${
                          bin.count === 0 ? 'opacity-25 group-hover:opacity-45' : isSelected ? 'shadow-md brightness-105' : 'opacity-85 group-hover:opacity-100 group-hover:brightness-105'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>

                    {/* Bottom Category Label */}
                    <div className="mt-2 text-center">
                      <p className={`text-[11px] font-bold whitespace-nowrap transition-colors ${
                        isSelected ? 'text-[#0b57d0] dark:text-[#a8c7fa]' : 'text-slate-700 dark:text-zinc-200'
                      }`}>
                        {bin.label}
                      </p>
                      <p className="text-[9.5px] text-slate-400 dark:text-zinc-500 hidden sm:block truncate max-w-[76px]">
                        {bin.sublabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-zinc-400 pt-1">
            <span>Critical Intervention (&lt;40%)</span>
            <span className="tabular-nums">Mean: {analytics.averagePercentage}%</span>
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
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
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
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
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
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
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
              <p className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
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
                Click any bar or grid tile to preview the question &amp; cohort breakdown.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold tabular-nums">
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
                    <button
                      key={q.questionNumber}
                      type="button"
                      onClick={() => setInspectedQuestionNumber(q.questionNumber)}
                      className="px-2 py-0.5 rounded-md tabular-nums font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-800 dark:text-rose-200 text-[10px] border-0 cursor-pointer transition"
                      title={`Preview Question #${q.questionNumber}`}
                    >
                      Q{q.questionNumber} ({q.errorRatePercentage}%)
                    </button>
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
              <div className="relative min-w-[640px] h-48 flex items-end gap-2 pt-5 pb-1 border-b border-slate-200/70 dark:border-zinc-800/80">
                {/* Subtle horizontal percentage gridlines */}
                <div className="pointer-events-none absolute inset-x-0 top-5 bottom-6 flex flex-col justify-between">
                  <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
                  <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
                  <div className="border-t border-dashed border-slate-200/70 dark:border-zinc-800/70 w-full" />
                </div>

                {analytics.questionErrorStats.map((q) => {
                  const total = q.totalAttempts || 1;
                  const correctPct = Math.round((q.correctCount / total) * 100);
                  const wrongPct = Math.round((q.wrongCount / total) * 100);
                  const unattemptedPct = Math.max(0, 100 - correctPct - wrongPct);
                  const isHighError = q.errorRatePercentage >= 50;

                  return (
                    <button
                      key={q.questionNumber}
                      type="button"
                      onClick={() => {
                        setHoveredQuestionData(null);
                        setInspectedQuestionNumber(q.questionNumber);
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredQuestionData({
                          questionNumber: q.questionNumber,
                          correctCount: q.correctCount,
                          wrongCount: q.wrongCount,
                          unattemptedCount: q.unattemptedCount,
                          correctPct,
                          wrongPct,
                          unattemptedPct,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8
                        });
                      }}
                      onMouseLeave={() => setHoveredQuestionData(null)}
                      className="relative z-10 flex-1 flex flex-col items-center h-full justify-end group cursor-pointer min-w-[18px] border-0 bg-transparent p-0"
                    >
                      {/* Stacked Vertical Bar */}
                      <div className="w-full max-w-[26px] bg-slate-100/80 dark:bg-zinc-800/70 rounded-lg overflow-hidden flex flex-col-reverse h-full max-h-36 transition-transform duration-150 group-hover:scale-x-110 group-hover:shadow-sm">
                        {/* Green: Correct */}
                        <div
                          style={{ height: `${correctPct}%` }}
                          className="w-full bg-emerald-500/90 group-hover:bg-emerald-500 transition-all"
                        />
                        {/* Amber: Skipped */}
                        <div
                          style={{ height: `${unattemptedPct}%` }}
                          className="w-full bg-amber-400/90 group-hover:bg-amber-400 transition-all"
                        />
                        {/* Red: Wrong */}
                        <div
                          style={{ height: `${wrongPct}%` }}
                          className={`w-full transition-all ${isHighError ? 'bg-rose-500' : 'bg-rose-400/90'}`}
                        />
                      </div>

                      {/* Question Number Label */}
                      <span className={`text-[9.5px] tabular-nums font-bold mt-1.5 transition-colors ${
                        isHighError
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-zinc-400 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa]'
                      }`}>
                        {q.questionNumber}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Interactive Accuracy Heatmap Grid (Click to Preview Question) */
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-60 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {analytics.questionErrorStats.map((q) => {
                const total = q.totalAttempts || 1;
                const accuracyPct = Math.round((q.correctCount / total) * 100);
                const isHighError = q.errorRatePercentage >= 50;
                return (
                  <button
                    key={q.questionNumber}
                    type="button"
                    onClick={() => setInspectedQuestionNumber(q.questionNumber)}
                    title={`Click to view Question #${q.questionNumber} (${accuracyPct}% accuracy)`}
                    className={`group p-2 rounded-2xl text-center border-0 transition-all cursor-pointer hover:scale-[1.03] active:scale-95 ${
                      isHighError
                        ? 'bg-rose-500/12 hover:bg-rose-500/20 text-rose-800 dark:text-rose-200'
                        : q.errorRatePercentage > 0
                        ? 'bg-amber-500/12 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200'
                        : 'bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] font-bold">Q{q.questionNumber}</span>
                      <Eye className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs tabular-nums font-bold mt-0.5">{accuracyPct}%</p>
                    <p className="text-[8.5px] opacity-65 font-medium">acc</p>
                  </button>
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
              <p className="text-lg font-black text-slate-900 dark:text-zinc-100 tabular-nums mt-0.5">
                {deliveryModeComparison.online.avgScore}%
              </p>
              <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                Avg: {deliveryModeComparison.online.avgMins}m duration
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-orange-500/10 border-0">
              <p className="text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider">
                OMR Scanned
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-zinc-100 tabular-nums mt-0.5">
                {deliveryModeComparison.omr.avgScore}%
              </p>
              <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">
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
                    <span className={`px-2 py-0.5 rounded-full tabular-nums font-bold text-[10px] ${
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

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 tabular-nums">
                    <span>{top.totalQuestions} Questions in test</span>
                    <span>{top.errorCount} wrong answers</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Score Distribution Tooltip (Unclipped, White M3 Card) */}
      {hoveredScoreBin && (
        <div
          className="fixed z-[60] px-3 py-2.5 rounded-2xl bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] text-[11px] tabular-nums shadow-[0_6px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_6px_24px_rgba(0,0,0,0.45)] border border-slate-200/80 dark:border-zinc-700/80 whitespace-nowrap pointer-events-none text-left"
          style={{
            left: `${hoveredScoreBin.x}px`,
            top: `${hoveredScoreBin.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <p className="font-bold text-slate-900 dark:text-zinc-100 border-b border-slate-100 dark:border-zinc-800 pb-1 mb-1">
            {hoveredScoreBin.sublabel} ({hoveredScoreBin.label})
          </p>
          <p className="font-semibold text-[#0b57d0] dark:text-[#a8c7fa]">
            Students: {hoveredScoreBin.count} ({hoveredScoreBin.sharePct}%)
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {hoveredScoreBin.isSelected ? 'Click to clear filter' : 'Click to filter list'}
          </p>
        </div>
      )}

      {/* Floating Question Diagnostic Tooltip (Unclipped, White M3 Card) */}
      {hoveredQuestionData && (
        <div
          className="fixed z-[60] px-3 py-2.5 rounded-2xl bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] text-[11px] tabular-nums shadow-[0_6px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_6px_24px_rgba(0,0,0,0.45)] border border-slate-200/80 dark:border-zinc-700/80 whitespace-nowrap pointer-events-none text-left"
          style={{
            left: `${hoveredQuestionData.x}px`,
            top: `${hoveredQuestionData.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <p className="font-bold text-slate-900 dark:text-zinc-100 border-b border-slate-100 dark:border-zinc-800 pb-1 mb-1">
            Question #{hoveredQuestionData.questionNumber}
          </p>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            Correct: {hoveredQuestionData.correctCount} ({hoveredQuestionData.correctPct}%)
          </p>
          <p className="font-semibold text-rose-600 dark:text-rose-400">
            Wrong: {hoveredQuestionData.wrongCount} ({hoveredQuestionData.wrongPct}%)
          </p>
          <p className="font-semibold text-amber-600 dark:text-amber-400">
            Skipped: {hoveredQuestionData.unattemptedCount} ({hoveredQuestionData.unattemptedPct}%)
          </p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">
            Click bar to preview question
          </p>
        </div>
      )}

      {/* Question Preview Modal */}
      {inspectedQuestionNumber !== null && inspectedQuestionData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-5"
          onClick={() => setInspectedQuestionNumber(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#1e2024] p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]">
                  Question #{inspectedQuestionNumber}
                </span>
                {inspectedQuestionData.question?.topic && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                    {inspectedQuestionData.question.topic}
                  </span>
                )}
                {inspectedQuestionData.stat && (
                  <div className="flex items-center gap-1.5 text-[11px] tabular-nums font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                      {Math.round((inspectedQuestionData.stat.correctCount / (inspectedQuestionData.stat.totalAttempts || 1)) * 100)}% Correct
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-700 dark:text-rose-300">
                      {inspectedQuestionData.stat.wrongCount} Wrong
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300">
                      {inspectedQuestionData.stat.unattemptedCount} Skipped
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={inspectedQuestionNumber <= 1}
                  onClick={() => setInspectedQuestionNumber((n) => (n && n > 1 ? n - 1 : n))}
                  className="p-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-0 cursor-pointer disabled:opacity-35"
                  title="Previous Question"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={inspectedQuestionNumber >= analytics.questionErrorStats.length}
                  onClick={() => setInspectedQuestionNumber((n) => (n && n < analytics.questionErrorStats.length ? n + 1 : n))}
                  className="p-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-0 cursor-pointer disabled:opacity-35"
                  title="Next Question"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedQuestionNumber(null)}
                  className="p-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-0 cursor-pointer ml-1"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Question Content */}
            {inspectedQuestionData.question ? (
              <div className="space-y-4">
                <div className="text-sm sm:text-base text-slate-900 dark:text-zinc-100 leading-relaxed">
                  <MathRenderer content={inspectedQuestionData.question.text} />
                </div>

                {(inspectedQuestionData.question.imageUrl || (inspectedQuestionData.question.imageUrls && inspectedQuestionData.question.imageUrls.length > 0)) && (
                  <QuestionDiagramViewer
                    imageUrl={inspectedQuestionData.question.imageUrl}
                    imageUrls={inspectedQuestionData.question.imageUrls}
                    imageWidths={inspectedQuestionData.question.imageWidths}
                  />
                )}

                {Array.isArray(inspectedQuestionData.question.options) && inspectedQuestionData.question.options.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {inspectedQuestionData.question.options.map((opt, idx) => {
                      const qObj = inspectedQuestionData.question!;
                      const isCorrect =
                        typeof qObj.correctOptionIndex === 'number'
                          ? qObj.correctOptionIndex === idx
                          : String(qObj.correctAnswer) === String(idx) || String(qObj.correctAnswer) === String(opt);
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-2xl text-xs sm:text-sm flex items-start gap-2.5 ${
                            isCorrect
                              ? 'bg-emerald-500/12 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500/40 font-semibold'
                              : 'bg-slate-50 dark:bg-zinc-800/70 text-slate-800 dark:text-zinc-200'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200'
                          }`}>
                            {letter}
                          </span>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <MathRenderer content={opt} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-500/12 text-emerald-900 dark:text-emerald-100 text-xs font-semibold">
                    Correct Answer: <span className="tabular-nums font-bold">{String(inspectedQuestionData.question.correctAnswer)}</span>
                  </div>
                )}

                {getQuestionExplanation(inspectedQuestionData.question) && (
                  <div className="p-3.5 rounded-2xl bg-[#f0f4f9] dark:bg-[#141619] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa]">
                      Solution / Explanation
                    </p>
                    <div className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                      <MathRenderer content={getQuestionExplanation(inspectedQuestionData.question)} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-zinc-400">
                Question text is not hydrated yet for this test. Open or refresh the test to view full question details.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
