import React from 'react';
import { motion } from 'framer-motion';
import { Package, Clock, ChevronRight, Trash2 } from 'lucide-react';
import type { MathTest, TestAttempt } from '../../types';
import { getTestDurationMinutes } from '../../utils/testFormatConverter';
import { getCachedFullTest } from '../../lib/firebase';
import { studioStaggerItem, gpuAcceleratedStyle } from '../../lib/animationConfig';

export interface M3TestCardProps {
  test: MathTest;
  attempts?: TestAttempt[];
  onClick: () => void;
  index?: number;
  batchBadge?: string | null;
  isMaster?: boolean;
  onDelete?: () => void;
}

export const M3TestCard: React.FC<M3TestCardProps> = ({
  test,
  attempts = [],
  onClick,
  index = 0,
  batchBadge,
  isMaster = false,
  onDelete,
}) => {
  const questionCount = (() => {
    if (Array.isArray(test.questions) && test.questions.length > 0) return test.questions.length;
    if (typeof test.questionCount === 'number' && test.questionCount > 0) return test.questionCount;
    if (typeof (test as any).questionsCount === 'number' && (test as any).questionsCount > 0) return (test as any).questionsCount;
    if (typeof (test as any).totalQuestions === 'number' && (test as any).totalQuestions > 0) return (test as any).totalQuestions;
    try {
      const cached = getCachedFullTest(test.id);
      if (cached?.questions?.length && cached.questions.length > 0) return cached.questions.length;
      if (cached?.questionCount && cached.questionCount > 0) return cached.questionCount;
    } catch {}
    try {
      const atts = attempts.filter((a) => a.testId === test.id);
      if (atts.length > 0) {
        const ansCount = atts[0].answers ? Object.keys(atts[0].answers).length : 0;
        if (ansCount > 0) return ansCount;
        if (atts[0].totalPoints && atts[0].totalPoints > 0) return Math.round(atts[0].totalPoints / 4);
      }
    } catch {}
    return getTestDurationMinutes(test);
  })();

  const timeDisplay = `${getTestDurationMinutes(test)}m`;
  const isPersonalized = Boolean((test as any).isPersonalizedRemedial || test.topic === 'Personalized Test');

  const isTestNew = (): boolean => {
    if (!test) return false;
    if ((test as any).isNew) return true;
    const rawDate = test.createdAt || (test as any).timestamp;
    if (!rawDate) return false;
    try {
      const createdTime = new Date(rawDate).getTime();
      const now = Date.now();
      const isWithin48h = now - createdTime < 48 * 60 * 60 * 1000;
      if (!isWithin48h) return false;
      const hasAttempted = attempts.some((a) => a.testId === test.id);
      return !hasAttempted;
    } catch {
      return false;
    }
  };

  const isNew = isTestNew();
  const displayBatchBadge = batchBadge || (test as any).batchTitle || null;

  return (
    <motion.div
      key={test.id ? `test-card-${test.id}-${index}` : `test-card-index-${index}`}
      id={`test-row-${test.id || index}`}
      variants={studioStaggerItem}
      style={gpuAcceleratedStyle}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
    >
      <md-ripple />

      {/* Row 1: Topic tag & Batch Badge above title, Title, and Master Delete Button */}
      <div className="w-full space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {test.topic && (
              <span
                className={`text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate ${
                  isPersonalized ? 'text-orange-600 dark:text-orange-400' : 'text-[#0b57d0] dark:text-[#a8c7fa]'
                }`}
              >
                {isPersonalized ? 'Personalized Test' : test.topic}
              </span>
            )}

            {displayBatchBadge && (
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wide bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0 shrink-0">
                Batch: {displayBatchBadge}
              </span>
            )}
          </div>

          {isMaster && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border-0 bg-transparent cursor-pointer shrink-0"
              title="Delete / Unlink Test"
              aria-label="Delete Test"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <h3 className="text-[17px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
          {test.title}
        </h3>
      </div>

      {/* Row 2: Question count & time (Left), Minimal Badge & Chevron (Bottom Right) */}
      <div className="flex items-center justify-between w-full pt-0.5 pointer-events-none">
        <div className="flex items-center gap-1.5 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium leading-none">
          <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
            <Package className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" strokeWidth={2.2} />
            <span className="leading-none">{questionCount} Qs</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
            <Clock className="w-3.5 h-3.5 text-[#6750a4] dark:text-[#d0bcff] shrink-0" strokeWidth={2.2} />
            <span className="leading-none">{timeDisplay}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isPersonalized ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold tracking-wide uppercase bg-orange-500/15 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400 border-0 shadow-none shrink-0"
              title="Personalized Practice Set assigned by Academic Head"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:orange-400 shrink-0 inline-block" />
              <span>Personalized</span>
            </span>
          ) : isNew ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-0 shadow-none shrink-0"
              title="New Assessment"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0 inline-block" />
              <span>New</span>
            </span>
          ) : null}

          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#5e5e5e] dark:text-[#9aa0a6] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] group-hover:translate-x-0.5 transition-all">
            <ChevronRight className="w-4 h-4 stroke-[2.2]" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
