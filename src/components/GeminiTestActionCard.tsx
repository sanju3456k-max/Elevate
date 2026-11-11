import React, { useState, useMemo, useEffect } from 'react';
import { 
  Sparkles, 
  BookOpen, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Trash2, 
  CheckCircle2, 
  GraduationCap,
  FileCheck,
  AlertCircle,
  RotateCcw,
  Maximize2,
  Loader2,
  Play,
  Check
} from 'lucide-react';
import { MathTest, normalizeQuestions, checkIsOptionCorrect } from '../types';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { APP_STYLES } from './ui/AppStyles';
import { formatTestToText } from '../utils/testFormatConverter';

export interface ParsedTestAction {
  action: 'CREATE_TEST' | 'UPDATE_TEST' | 'DELETE_TEST';
  summary?: string;
  test: MathTest;
}

interface GeminiTestActionCardProps {
  actionData: ParsedTestAction;
  existingTests?: MathTest[];
  messageId?: string;
  onSaveTest?: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  onInspectInCanvas?: (test: MathTest) => void;
  isDarkMode?: boolean;
}

export const GeminiTestActionCard: React.FC<GeminiTestActionCardProps> = ({
  actionData,
  existingTests = [],
  messageId,
  onSaveTest,
  onDeleteTest,
  onStartTest,
  onEditTest,
  onInspectInCanvas,
  isDarkMode
}) => {
  const { action, summary, test } = actionData;

  const isDelete = action === 'DELETE_TEST';
  const isUpdate = action === 'UPDATE_TEST';

  const [showInlineAiEdit, setShowInlineAiEdit] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState('');

  // Find corresponding existing test in user's library by ID or Title
  const existingTest = useMemo(() => {
    return existingTests.find(
      (t) => (test.id && t.id === test.id) || 
             (t.title && test.title && t.title.trim().toLowerCase() === test.title.trim().toLowerCase() && test.title.length > 3)
    );
  }, [existingTests, test.id, test.title]);

  // Compute reconciled test: merges question additions/edits so existing questions are never wiped out
  const effectiveTest = useMemo<MathTest>(() => {
    if (!existingTest || !isUpdate) {
      return {
        ...test,
        id: test.id || `test_${Date.now()}`,
        questions: normalizeQuestions(test.questions || [])
      };
    }

    const existingQuestions = Array.isArray(existingTest.questions) ? existingTest.questions : [];
    const proposedQuestions = Array.isArray(test.questions) ? test.questions : [];

    // Intelligently merge: update matching questions in-place and append new ones without wiping out or duplicating
    let mergedQuestions: any[] = [];
    if (proposedQuestions.length >= existingQuestions.length && proposedQuestions.length > 0) {
      // Gemini provided the complete updated test questions list (e.g. expanding from 20 to 25 questions)
      mergedQuestions = proposedQuestions.map((pq, idx) => {
        const match = existingQuestions.find(
          (eq) => (eq.id && pq.id && eq.id === pq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        );
        return {
          ...(match || {}),
          ...pq,
          id: pq.id || match?.id || `q_${existingTest.id}_${idx + 1}`
        };
      });
    } else {
      // Gemini provided only the delta questions (e.g. 5 new questions to append to existing 20)
      mergedQuestions = [...existingQuestions];
      for (const pq of proposedQuestions) {
        const matchIdx = mergedQuestions.findIndex(
          (eq) => (pq.id && eq.id && pq.id === eq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        );
        if (matchIdx >= 0) {
          mergedQuestions[matchIdx] = { ...mergedQuestions[matchIdx], ...pq };
        } else {
          mergedQuestions.push({
            ...pq,
            id: pq.id || `q_${existingTest.id}_${mergedQuestions.length + 1}`
          });
        }
      }
    }

    const finalTest: MathTest = {
      ...existingTest,
      ...test,
      id: existingTest.id,
      questions: normalizeQuestions(mergedQuestions),
      updatedAt: new Date().toISOString()
    };
    finalTest.testCode = formatTestToText(finalTest);
    return finalTest;
  }, [existingTest, isUpdate, test]);

  const questionsCount = Array.isArray(effectiveTest.questions) ? effectiveTest.questions.length : 0;
  const existingQuestionsCount = existingTest && Array.isArray(existingTest.questions) ? existingTest.questions.length : 0;
  const newlyAddedCount = isUpdate && questionsCount > existingQuestionsCount ? questionsCount - existingQuestionsCount : 0;

  // Determine if this update or test is already fully applied in existingTests
  const isAlreadyApplied = useMemo(() => {
    if (isDelete) {
      return !existingTests.some((t) => t.id === test.id);
    }
    if (isUpdate) {
      if (!existingTest) return false;
      const proposedQuestions = Array.isArray(test.questions) ? test.questions : [];
      if (proposedQuestions.length === 0) return false;
      // If library test has fewer questions than the reconciled test, it is NOT yet updated!
      if ((existingTest.questions?.length || 0) < effectiveTest.questions.length) {
        return false;
      }
      // Check if all proposed questions exist in existingTest
      return proposedQuestions.every((pq) =>
        existingTest.questions?.some(
          (eq) => (pq.id && eq.id && pq.id === eq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        )
      );
    }
    // For CREATE_TEST: true only if already present in library with matching question count
    return existingTests.some(
      (t) => (t.id === test.id || (t.title.trim().toLowerCase() === test.title.trim().toLowerCase() && test.title.length > 3)) &&
             (t.questions?.length || 0) >= (test.questions?.length || 0)
    );
  }, [existingTests, existingTest, isDelete, isUpdate, test, effectiveTest]);

  const [isSaved, setIsSaved] = useState<boolean>(isAlreadyApplied);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showAllQuestions, setShowAllQuestions] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Sync state if external existingTests updates
  useEffect(() => {
    setIsSaved(isAlreadyApplied);
  }, [isAlreadyApplied]);

  const handleSaveOrApply = () => {
    setIsApplying(true);
    setTimeout(() => {
      if (isDelete) {
        if (onDeleteTest && effectiveTest.id) {
          onDeleteTest(effectiveTest.id);
        }
        setIsSaved(true);
        setSaveSuccessNotice(`Test removed from library.`);
      } else {
        if (onSaveTest) {
          onSaveTest(effectiveTest);
        }
        setIsSaved(true);
        setSaveSuccessNotice(
          isUpdate 
            ? `Test "${effectiveTest.title}" successfully updated with ${effectiveTest.questions.length} questions!`
            : `Test "${effectiveTest.title}" saved to your test library!`
        );
      }
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      setIsApplying(false);
    }, 450);
  };

  const handleUnsaveTest = () => {
    if (onDeleteTest && effectiveTest.id) {
      onDeleteTest(effectiveTest.id);
    }
    setIsSaved(false);
    setSaveSuccessNotice(`Test removed from library.`);
    setTimeout(() => setSaveSuccessNotice(null), 3000);
  };

  const getActionBadge = () => {
    switch (action) {
      case 'CREATE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] border-0 shadow-none">
            <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>AI Test Generated</span>
          </span>
        );
      case 'UPDATE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-0 shadow-none">
            <RotateCcw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{isSaved ? 'Test Updated' : 'Test Update Proposed'}</span>
          </span>
        );
      case 'DELETE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border-0 shadow-none">
            <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span>Delete Test</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="my-3 p-4 sm:p-5 rounded-[26px] sm:rounded-[28px] bg-white dark:bg-[#1e2024] space-y-3.5 text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all">
      {/* Top Header Row with Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {getActionBadge()}
          {isSaved ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#e6f4ea] text-[#137333] dark:bg-[#0d381e] dark:text-[#81c995] border-0 shadow-none">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>{isDelete ? 'Deleted' : isUpdate ? 'Updated' : 'Saved in Library'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#fef7e0] text-[#b06000] dark:bg-[#3c2f00] dark:text-[#fdd663] border-0 shadow-none">
              <AlertCircle className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>{isDelete ? 'Ready to Delete' : isUpdate ? 'Ready to Update' : 'Ready to Save'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {effectiveTest.id && (
            <span className="text-[11px] font-mono font-bold text-[#5e5e5e] dark:text-[#9aa0a6] px-3 py-1 rounded-full bg-[#edf2f9] dark:bg-[#26282e] border-0 shadow-none">
              #{effectiveTest.id}
            </span>
          )}
        </div>
      </div>

      {/* Test Title & Description */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 mt-0.5 border-0 shadow-none">
            <BookOpen className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base sm:text-lg text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight leading-snug">
              <MathRenderer content={effectiveTest.title} />
            </h4>
            {effectiveTest.description && (
              <div className="text-xs sm:text-[12.5px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-1 font-normal leading-relaxed">
                <MathRenderer content={effectiveTest.description} />
              </div>
            )}
          </div>
        </div>

        {summary && (
          <div className="p-3.5 rounded-[20px] bg-[#f0f4f9] dark:bg-[#16181c] text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed font-medium flex items-start gap-2.5 border-0 shadow-none">
            <span className="w-6 h-6 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] flex items-center justify-center text-[10.5px] shrink-0 font-extrabold border-0">AI</span>
            <div className="flex-1"><MathRenderer content={summary} /></div>
          </div>
        )}

        {saveSuccessNotice && (
          <div className="p-3 rounded-[20px] bg-[#e6f4ea] dark:bg-[#0d381e] text-xs text-[#137333] dark:text-[#81c995] font-semibold flex items-center gap-2 animate-fade-in border-0 shadow-none">
            <CheckCircle2 className="w-4 h-4 text-[#137333] dark:text-[#81c995] shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}
      </div>

      {/* Metadata Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="px-3.5 py-1.5 rounded-full bg-[#edf2f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold flex items-center gap-1.5 border-0 shadow-none">
          <GraduationCap className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2]" />
          <span><MathRenderer content={effectiveTest.topic || 'General Math'} /></span>
        </span>

        <span className="px-3.5 py-1.5 rounded-full bg-[#edf2f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold flex items-center gap-1.5 border-0 shadow-none">
          <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 stroke-[2.2]" />
          <span>
            {questionsCount} Questions
            {newlyAddedCount > 0 && (
              <span className="ml-1 text-[11px] text-[#137333] dark:text-[#81c995] font-bold">
                (+{newlyAddedCount} new)
              </span>
            )}
          </span>
        </span>

        <span className="px-3.5 py-1.5 rounded-full bg-[#edf2f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold flex items-center gap-1.5 border-0 shadow-none">
          <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 stroke-[2.2]" />
          <span>{effectiveTest.timeLimitMinutes || effectiveTest.time || 15} mins</span>
        </span>
      </div>

      {/* Questions & Solutions Preview Section - App M3 Accordion */}
      {questionsCount > 0 && (
        <div className="rounded-[22px] bg-[#f8fafd] dark:bg-[#181a20] border-0 shadow-none overflow-hidden transition-all">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2.5 sm:py-3 flex items-center justify-between text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#edf2f9] dark:hover:bg-[#24262c] transition-colors cursor-pointer border-0 shadow-none"
          >
            <span className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2]" />
              <span>{isExpanded ? 'Hide Questions & Solutions' : `Preview Questions & Solutions (${questionsCount})`}</span>
            </span>
            <span className="flex items-center gap-1 text-[#5e5e5e] dark:text-[#9aa0a6] text-[11px]">
              {isExpanded ? <ChevronUp className="w-4 h-4 stroke-[2.2]" /> : <ChevronDown className="w-4 h-4 stroke-[2.2]" />}
            </span>
          </button>

          {isExpanded && (
            <div className="p-2.5 space-y-2.5 max-h-96 overflow-y-auto">
              {(showAllQuestions ? effectiveTest.questions : effectiveTest.questions.slice(0, 3)).map((q, idx) => {
                const isNewQuestion = isUpdate && existingTest && !existingTest.questions?.some(
                  (eq) => (eq.id && q.id && eq.id === q.id) || (eq.text && q.text && eq.text.trim().toLowerCase() === q.text.trim().toLowerCase())
                );
                return (
                  <div 
                    key={`test-action-q-${effectiveTest.id || 'test'}-${q.id || 'q'}-${idx}`}
                    className="w-full p-3.5 rounded-[20px] bg-white dark:bg-[#1e2024] text-xs space-y-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-0"
                  >
                    <div className="flex items-center justify-between font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/50 text-[#041e49] dark:text-[#c2e7ff] text-[11px] font-bold border-0 shadow-none">
                          Question {idx + 1} • {q.type === 'numerical' ? 'Numerical Answer' : 'Multiple Choice'}
                        </span>
                        {isNewQuestion && (
                          <span className="px-2.5 py-1 rounded-full bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0] text-[10px] font-bold border-0 shadow-none">
                            New Addition
                          </span>
                        )}
                      </div>
                      {q.points && (
                        <span className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono">
                          {q.points} pt{q.points > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    
                    {/* Question Text with Full LaTeX Math Rendering */}
                    <div className="text-[#1f1f1f] dark:text-[#e3e3e3] font-normal text-[13px] leading-relaxed pl-0.5">
                      <MathRenderer content={q.text} />
                    </div>

                    {/* Question Diagram / Image */}
                    {(q.imageUrl || (q as any).paperLayout?.imageUrl || (Array.isArray(q.imageUrls) && q.imageUrls.some(Boolean))) && (
                      <div className="my-2.5 max-w-full flex justify-center">
                        <QuestionDiagramViewer
                          imageUrl={q.imageUrl || (q as any).paperLayout?.imageUrl}
                          imageUrls={q.imageUrls}
                          imageWidths={q.imageWidths}
                          alt={`Question ${idx + 1} Diagram`}
                          width={q.imageWidth || (q as any).paperLayout?.imageWidth}
                          allowZoom={true}
                          className="my-0!"
                        />
                      </div>
                    )}

                    {/* Options (MCQ) with MathRenderer */}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5 w-full">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = checkIsOptionCorrect(opt, oIdx, q);
                          return (
                            <div 
                              key={oIdx} 
                              className={`p-2.5 rounded-[16px] text-xs flex items-center gap-2.5 transition-all border-0 shadow-none ${
                                isCorrect
                                  ? 'bg-[#e6f4ea] dark:bg-[#0f5223]/40 text-[#137333] dark:text-[#81c995] font-semibold'
                                  : 'bg-[#f0f4f9] dark:bg-[#16181c] text-[#1f1f1f] dark:text-[#e3e3e3]'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 border-0 ${
                                isCorrect ? 'bg-[#137333] text-white' : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5]'
                              }`}>
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <div className="truncate flex-1 font-normal"><MathRenderer content={String(opt)} /></div>
                              {isCorrect && (
                                <span className="text-[10px] uppercase font-bold text-[#137333] dark:text-[#81c995] shrink-0">
                                  Correct
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Numerical Answer with MathRenderer */}
                    {(!q.options || q.options.length === 0) && (
                      <div className="p-2.5 rounded-[16px] bg-[#e6f4ea] dark:bg-[#0f5223]/40 text-[#137333] dark:text-[#81c995] font-semibold text-xs flex items-center gap-2 w-full border-0 shadow-none">
                        <span>Correct Answer:</span>
                        <div className="font-mono px-2.5 py-0.5 rounded-full bg-white dark:bg-[#1e2024] text-[#137333] dark:text-[#81c995] shadow-xs border-0">
                          <MathRenderer content={String(q.correctAnswer)} />
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Solution with MathRenderer */}
                    {(q.explanation || q.solution) && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 text-xs text-[#444746] dark:text-[#c4c7c5] space-y-1 w-full">
                        <div className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                          <span>Step-by-Step Solution:</span>
                        </div>
                        <div className="leading-relaxed font-normal text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <MathRenderer content={q.explanation || q.solution || ''} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {effectiveTest.questions.length > 3 && (
                <button
                  onClick={() => setShowAllQuestions(!showAllQuestions)}
                  className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#edf2f9] dark:hover:bg-[#26282e] py-2.5 w-full text-center cursor-pointer transition-colors rounded-full border-0 shadow-none"
                >
                  {showAllQuestions ? 'Show fewer questions' : `Show all ${effectiveTest.questions.length} questions...`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Options Underneath - App M3 Style */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* 1. Save to Library / Update Button */}
        <button
          onClick={() => {
            if (isSaved) {
              handleUnsaveTest();
            } else {
              handleSaveOrApply();
            }
          }}
          onDoubleClick={handleUnsaveTest}
          disabled={isApplying}
          className={`h-9 px-4 sm:px-4.5 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer active:scale-95 border-0 shadow-none flex items-center gap-1.5 ${
            isApplying
              ? 'bg-[#0b57d0] text-white opacity-85 cursor-wait'
              : isSaved
              ? 'bg-[#137333] hover:bg-[#0f5223] text-white'
              : isDelete
              ? 'bg-[#b3261e] hover:bg-[#8c1d18] text-white'
              : isUpdate
              ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white'
              : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white'
          }`}
          title={
            isApplying
              ? 'Updating test...'
              : isSaved
              ? 'Saved to library (Double-click to unsave)'
              : isUpdate
              ? `Update test in library to ${effectiveTest.questions.length} questions`
              : 'Save to Library'
          }
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{isUpdate ? 'Updating...' : 'Saving...'}</span>
            </>
          ) : isSaved ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isDelete ? 'Deleted' : isUpdate ? 'Updated' : 'Saved'}</span>
            </>
          ) : isDelete ? (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete from Library</span>
            </>
          ) : isUpdate ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Update Test ({effectiveTest.questions.length} Questions)</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Save to Library</span>
            </>
          )}
        </button>

        {/* 2. Take Test Button */}
        {onStartTest && !isDelete && effectiveTest.questions.length > 0 && (
          <button
            onClick={() => onStartTest(effectiveTest, 'timed')}
            className="h-9 px-3.5 sm:px-4 rounded-full text-xs sm:text-[13px] font-bold bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] text-[#1f1f1f] dark:text-[#e3e3e3] transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 border-0 shadow-none"
            title="Take Test"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Take Test</span>
          </button>
        )}

        {/* Unified Edit in Studio with AI Button */}
        {!isDelete && (
          <button
            type="button"
            onClick={() => {
              if (onEditTest) {
                onEditTest(effectiveTest, { openAiPrompt: true });
              } else {
                window.dispatchEvent(new CustomEvent('gemini-open-test-canvas', {
                  detail: {
                    test: effectiveTest,
                    actionData,
                    messageId
                  }
                }));
              }
            }}
            className="h-9 px-4 rounded-full text-xs sm:text-[13px] font-bold bg-[#d3e3fd] hover:bg-[#c2e7ff] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 border-0 shadow-none"
            title="Edit this test in Studio with AI assistance"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Edit in Studio with AI</span>
          </button>
        )}
      </div>

      {/* Inline AI Edit Panel - Updates this specific message directly */}
      {showInlineAiEdit && (
        <div className="p-3.5 sm:p-4 rounded-[22px] bg-[#d3e3fd]/40 dark:bg-[#004a77]/25 space-y-3 animate-fadeIn border-0 shadow-none">
          <div className="flex items-center justify-between text-xs font-bold text-[#041e49] dark:text-[#c2e7ff]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>Edit this Test with AI</span>
            </span>
            <span className="text-[11px] font-normal text-[#0b57d0] dark:text-[#a8c7fa]">
              Response directly updates this message
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              placeholder="e.g. Add 5 more questions to make 25, make questions harder, add explanations..."
              className="flex-1 px-4 py-2 text-xs sm:text-[13px] rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/40 border-0 shadow-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && inlinePrompt.trim()) {
                  e.preventDefault();
                  const promptToSend = inlinePrompt.trim();
                  window.dispatchEvent(new CustomEvent('gemini-edit-element', {
                    detail: {
                      type: 'test',
                      content: JSON.stringify(effectiveTest, null, 2),
                      title: effectiveTest.title,
                      targetMessageId: messageId,
                      prompt: promptToSend
                    }
                  }));
                  setShowInlineAiEdit(false);
                  setInlinePrompt('');
                }
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                const promptToSend = inlinePrompt.trim();
                if (!promptToSend) return;
                window.dispatchEvent(new CustomEvent('gemini-edit-element', {
                  detail: {
                    type: 'test',
                    content: JSON.stringify(effectiveTest, null, 2),
                    title: effectiveTest.title,
                    targetMessageId: messageId,
                    prompt: promptToSend
                  }
                }));
                setShowInlineAiEdit(false);
                setInlinePrompt('');
              }}
              disabled={!inlinePrompt.trim()}
              className="h-9 px-4 text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full cursor-pointer disabled:opacity-50 active:scale-95 transition-all shrink-0 border-0 shadow-none"
            >
              Update Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
