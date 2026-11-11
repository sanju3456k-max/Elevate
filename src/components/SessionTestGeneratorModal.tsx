import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  FileText, 
  Image as ImageIcon, 
  CheckCircle2, 
  BookOpen,
  GraduationCap,
  ListOrdered
} from 'lucide-react';
import { ChatAttachment } from './GeminiChatbotView';
import { DifficultyLevel } from '../types';
import { DEFAULT_TOPICS, getSavedCustomTopics, saveCustomTopic } from '../utils/topics';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

export interface SessionTestGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  messageCount?: number;
  onGenerateTest: (config: {
    title: string;
    topic: string;
    questionCount: number;
    difficulty: DifficultyLevel;
    questionType: 'all' | 'mcq' | 'numerical';
    selectedFileNames: string[];
    additionalNotes?: string;
  }) => void;
  isDarkMode: boolean;
}

const QUESTION_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES: DifficultyLevel[] = ['Easy', 'Medium', 'Hard'];
const QUESTION_TYPES = [
  { id: 'all', label: 'Mixed' },
  { id: 'mcq', label: 'MCQ' },
  { id: 'numerical', label: 'Numerical' }
];

export const SessionTestGeneratorModal: React.FC<SessionTestGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateTest,
}) => {
  const [title, setTitle] = useState<string>('Comprehensive Practice Test');
  const [topic, setTopic] = useState<string>('Calculus');
  const [isCustomTopicActive, setIsCustomTopicActive] = useState<boolean>(false);
  const [customTopicInput, setCustomTopicInput] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState<string>('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [questionType, setQuestionType] = useState<'all' | 'mcq' | 'numerical'>('all');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => {
    return new Set(sessionFiles.map(f => f.id || f.name));
  });
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  const [savedTopicsVersion, setSavedTopicsVersion] = useState(0);

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_test_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setTitle('Comprehensive Practice Test');
      setTopic('Calculus');
      setIsCustomTopicActive(false);
      setCustomTopicInput('');
      setQuestionCount(10);
      setCustomCount('');
      setDifficulty('Medium');
      setQuestionType('all');
      setSelectedFileIds(new Set(sessionFiles.map(f => f.id || f.name)));
      setAdditionalNotes('');
    }
  }, [isOpen, sessionFiles]);

  useEffect(() => {
    const handleUpdate = () => {
      setSavedTopicsVersion((v) => v + 1);
    };
    window.addEventListener('custom-topics-updated', handleUpdate);
    return () => window.removeEventListener('custom-topics-updated', handleUpdate);
  }, []);

  const savedCustomTopics = useMemo(() => getSavedCustomTopics(), [savedTopicsVersion]);

  if (!isOpen) return null;

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCount = customCount ? Math.max(1, Math.min(50, parseInt(customCount, 10) || 10)) : questionCount;
    const selectedFiles = sessionFiles.filter(f => selectedFileIds.has(f.id || f.name));
    const selectedFileNames = selectedFiles.map(f => f.name);

    const finalTopic = isCustomTopicActive ? (customTopicInput.trim() || 'Custom Topic') : topic;
    if (isCustomTopicActive && customTopicInput.trim()) {
      saveCustomTopic(customTopicInput.trim());
    }

    onGenerateTest({
      title: title.trim() || 'Practice Test',
      topic: finalTopic.trim() || 'General Mathematics',
      questionCount: finalCount,
      difficulty,
      questionType,
      selectedFileNames,
      additionalNotes: additionalNotes.trim() || undefined
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          id="session-test-generator-modal-backdrop" 
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={`${APP_STYLES.modal.backdrop} flex items-center justify-center p-3 sm:p-4`}
          onClick={onClose}
        >
          <motion.div 
            id="session-test-generator-modal-container"
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuTransformStyle}
            className="w-full max-w-lg rounded-[28px] sm:rounded-[32px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_44px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col modal-content-smooth"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Round Modern Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:text-[#e3e3e3] bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] transition-all cursor-pointer border-0 shadow-none -ml-1 mr-0.5 active:scale-95"
                  title="Back to Chat (Esc)"
                  aria-label="Back to Chat"
                >
                  <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
                </button>
                <div className="w-10 h-10 rounded-full bg-[#d3e3fd] text-[#0b57d0] dark:bg-[#004a77] dark:text-[#c2e7ff] flex items-center justify-center shrink-0 border-0 shadow-none">
                  <GraduationCap className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="text-[15px] sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Generate Practice Test
                  </h2>
                  <p className="text-[11px] sm:text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
                    Custom questions with step-by-step LaTeX solutions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:text-[#e3e3e3] bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] transition-all cursor-pointer border-0 shadow-none active:scale-95"
              >
                <X className="w-4.5 h-4.5 stroke-[2.2]" />
              </button>
            </div>

            {/* Rounded Modern Form */}
            <form onSubmit={handleGenerate} className="p-5 space-y-4 text-left text-sm overflow-y-auto max-h-[80vh]">
              {/* Test Title & Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1.5">
                    Test Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Calculus Final Exam Review"
                    className="w-full px-4 py-2.5 rounded-full bg-[#f0f4f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/40 text-xs sm:text-[13px] transition-all border-0 shadow-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1.5">
                    Topic
                  </label>
                  <select
                    id="session-generator-topic-select"
                    value={isCustomTopicActive ? '__CUSTOM__' : topic}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        setIsCustomTopicActive(true);
                        const initialVal = DEFAULT_TOPICS.some(dt => dt.toLowerCase() === topic.toLowerCase()) ? '' : topic;
                        setCustomTopicInput(initialVal);
                      } else {
                        setIsCustomTopicActive(false);
                        setTopic(val);
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-full bg-[#f0f4f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/40 text-xs sm:text-[13px] cursor-pointer transition-all border-0 shadow-none"
                  >
                    <option value="__CUSTOM__" className="font-bold text-[#0b57d0] dark:text-[#a8c7fa]">+ Custom Topic...</option>
                    <optgroup label="Standard Topics">
                      {DEFAULT_TOPICS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                    {savedCustomTopics.length > 0 && (
                      <optgroup label="Custom Topics">
                        {savedCustomTopics.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {isCustomTopicActive && (
                    <div className="mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <input
                        id="session-generator-custom-topic-input"
                        type="text"
                        value={customTopicInput}
                        onChange={(e) => setCustomTopicInput(e.target.value)}
                        placeholder="Enter topic name..."
                        className="w-full px-4 py-2 rounded-full bg-[#d3e3fd]/40 dark:bg-[#004a77]/30 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/40 text-xs transition-all border-0 shadow-none"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Included Session Files (Only if present) */}
              {sessionFiles.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>Reference Documents ({selectedFileIds.size}/{sessionFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFileIds(new Set(sessionFiles.map(f => f.id || f.name)))}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                    >
                      Select All
                    </button>
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {sessionFiles.map((file) => {
                      const fileId = file.id || file.name;
                      const isSelected = selectedFileIds.has(fileId);
                      const isPdf = file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');

                      return (
                        <button
                          key={fileId}
                          type="button"
                          onClick={() => toggleFileSelection(fileId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer truncate max-w-full border-0 shadow-none ${
                            isSelected 
                              ? 'bg-[#0b57d0] text-white font-medium' 
                              : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b]'
                          }`}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.2]" />
                          ) : isPdf ? (
                            <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Number of Questions */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Questions Count
                </label>
                <div className="flex items-center gap-1.5">
                  {QUESTION_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        setQuestionCount(count);
                        setCustomCount('');
                      }}
                      className={`flex-1 py-2.5 rounded-full text-xs transition-all text-center cursor-pointer border-0 shadow-none ${
                        questionCount === count && !customCount
                          ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                          : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                      }`}
                    >
                      {count} Qs
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="Custom"
                    value={customCount}
                    onChange={(e) => setCustomCount(e.target.value)}
                    className={`w-20 px-3 py-2 rounded-full text-xs text-center font-medium bg-[#f0f4f9] dark:bg-[#26282e] focus:outline-none border-0 shadow-none focus:ring-2 focus:ring-[#0b57d0]/40 transition-all ${
                      customCount
                        ? 'text-[#0b57d0] dark:text-[#a8c7fa] font-bold'
                        : 'text-[#1f1f1f] dark:text-[#e3e3e3]'
                    }`}
                  />
                </div>
              </div>

              {/* Difficulty and Question Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DIFFICULTIES.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDifficulty(lvl)}
                        className={`py-2.5 rounded-full text-xs text-center transition-all cursor-pointer border-0 shadow-none ${
                          difficulty === lvl
                            ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                            : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Format
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {QUESTION_TYPES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setQuestionType(item.id as any)}
                        className={`py-2.5 rounded-full text-xs text-center transition-all cursor-pointer border-0 shadow-none ${
                          questionType === item.id
                            ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                            : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional Instructions */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Additional Directives (Optional)
                </label>
                <input
                  type="text"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="e.g. Focus on integration by parts; include edge cases"
                  className="w-full px-4 py-2.5 rounded-full bg-[#f0f4f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/40 text-xs sm:text-[13px] transition-all border-0 shadow-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-5 rounded-full text-xs sm:text-[13px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] border-0 transition-all active:scale-95 cursor-pointer shadow-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 px-6 rounded-full text-xs sm:text-[13px] font-bold text-white bg-[#0b57d0] hover:bg-[#0842a0] border-0 shadow-[0_2px_8px_rgba(11,87,208,0.3)] transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 stroke-[2.2]" />
                  <span>Generate Test</span>
                </button>
              </div>
            </form>
          </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
