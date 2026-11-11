import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  FileSpreadsheet, 
  Table as TableIcon,
  FileCheck,
  ListOrdered,
  Sliders,
  Columns
} from 'lucide-react';
import { ChatAttachment } from './GeminiChatbotView';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

export interface SessionTableGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  onGenerateTable: (config: {
    title: string;
    topic: string;
    tableType: string;
    rowCount: number;
    customColumns?: string;
    includeContext: boolean;
    additionalNotes?: string;
  }) => void;
  isDarkMode: boolean;
}

const TABLE_PRESETS = [
  { 
    id: 'Formula & Theorem Sheet', 
    label: 'Formula Sheet', 
    columns: 'Concept / Rule | LaTeX Formula | Domain & Constraints | Example' 
  },
  { 
    id: 'Comparison Matrix', 
    label: 'Comparison Matrix', 
    columns: 'Item / Concept | Category | Core Characteristics | Pros | Cons | Best Use Case' 
  },
  { 
    id: 'Dataset & Metrics', 
    label: 'Data & Metrics', 
    columns: 'Metric Name | Measured Value | Benchmark | Delta | Unit | Status' 
  },
  { 
    id: 'Algorithm & Workflow', 
    label: 'Algorithm / Workflow', 
    columns: 'Algorithm | Time Complexity | Space Complexity | Best Case | Invariant' 
  },
];

const PRESET_ROW_COUNTS = [5, 8, 12, 20];

export const SessionTableGeneratorModal: React.FC<SessionTableGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateTable,
}) => {
  const [topic, setTopic] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('Formula & Theorem Sheet');
  const [rowCount, setRowCount] = useState<number>(8);
  const [isCustomRowsCols, setIsCustomRowsCols] = useState<boolean>(false);
  const [customRowsInput, setCustomRowsInput] = useState<string>('');
  const [customColumnCountInput, setCustomColumnCountInput] = useState<string>('');
  
  // Custom Columns Prompt Bar is blank by default and optional to fill
  const [customColumns, setCustomColumns] = useState<string>('');
  const [includeContext, setIncludeContext] = useState<boolean>(sessionFiles.length > 0);
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_table_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setTopic('');
      setTitle('');
      setSelectedPreset('Formula & Theorem Sheet');
      setRowCount(8);
      setIsCustomRowsCols(false);
      setCustomRowsInput('');
      setCustomColumnCountInput('');
      setCustomColumns('');
      setIncludeContext(sessionFiles.length > 0);
      setAdditionalNotes('');
    }
  }, [isOpen, sessionFiles.length]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const finalRowCount = isCustomRowsCols && customRowsInput.trim()
      ? Math.max(1, Math.min(100, parseInt(customRowsInput, 10) || 8))
      : rowCount;

    let finalCustomColumns = customColumns.trim();
    if (isCustomRowsCols && customColumnCountInput.trim()) {
      const colNum = parseInt(customColumnCountInput, 10);
      if (colNum > 0 && !finalCustomColumns) {
        finalCustomColumns = `Table with exactly ${colNum} customized columns`;
      }
    }

    onGenerateTable({
      title: title.trim() || topic.trim(),
      topic: topic.trim(),
      tableType: selectedPreset || 'Custom Table',
      rowCount: finalRowCount,
      customColumns: finalCustomColumns || undefined,
      includeContext,
      additionalNotes: additionalNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={`${APP_STYLES.modal.backdrop} flex items-center justify-center p-3 sm:p-4`}
          onClick={onClose}
        >
          <motion.div 
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuTransformStyle}
            className="w-full max-w-lg rounded-[28px] sm:rounded-[32px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_44px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col modal-content-smooth"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Modern Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:text-[#e3e3e3] bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] transition-all cursor-pointer -ml-1 mr-0.5 border-0 shadow-none active:scale-95"
              title="Back to Chat (Esc)"
              aria-label="Back to Chat"
            >
              <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
            <div className="w-10 h-10 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 border-0 shadow-none">
              <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-[15px] sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Generate Data Table
              </h3>
              <p className="text-[11px] sm:text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
                Formula sheets, comparison matrices & custom structured datasets
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

        {/* Form Body */}
        <form onSubmit={handleGenerate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Table Topic */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
              <span>Topic / Subject</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                if (!title || title === topic) setTitle(e.target.value);
              }}
              placeholder="e.g. Calculus Standard Derivatives & Integrals, Sorting Algorithms..."
              required
              autoFocus
              className="w-full px-4 py-2.5 text-xs sm:text-[13px] rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] shadow-none focus:outline-none focus:ring-2 focus:ring-[#137333]/40 transition-all"
            />
          </div>

          {/* Preset Structure Options */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 border-0 shadow-none">
                <TableIcon className="w-3 h-3" />
              </div>
              <span>Column Structure Presets</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TABLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-2.5 rounded-full text-xs text-center transition-all cursor-pointer truncate border-0 shadow-none ${
                    selectedPreset === preset.id
                      ? 'bg-[#137333] hover:bg-[#0f5223] text-white font-bold shadow-[0_2px_6px_rgba(19,115,51,0.25)]'
                      : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Blank / Optional Column Text Prompt Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 border-0 shadow-none">
                  <Columns className="w-3 h-3" />
                </div>
                <span>Custom Columns Text Prompt Bar</span>
              </label>
              <span className="text-[10px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#edf2f9] dark:bg-[#26282e] border-0 shadow-none">
                Optional
              </span>
            </div>
            <input
              type="text"
              value={customColumns}
              onChange={(e) => setCustomColumns(e.target.value)}
              placeholder="Leave blank or enter custom columns (e.g. Concept | Formula | Example)"
              className="w-full px-4 py-2.5 text-xs sm:text-[13px] rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] shadow-none focus:outline-none focus:ring-2 focus:ring-[#137333]/40 transition-all"
            />
            {customColumns.trim() && (
              <p className="text-[11px] text-[#137333] dark:text-[#81c995] flex items-center gap-1 pl-2 font-medium">
                <Sparkles className="w-3 h-3" />
                <span>Custom column prompt specified</span>
              </p>
            )}
          </div>

          {/* Target Rows with Custom Rows & Columns Button */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 border-0 shadow-none">
                <ListOrdered className="w-3 h-3" />
              </div>
              <span>Target Rows & Layout</span>
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_ROW_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setRowCount(count);
                    setIsCustomRowsCols(false);
                  }}
                  className={`px-3.5 py-2 rounded-full text-xs transition-all cursor-pointer border-0 shadow-none ${
                    !isCustomRowsCols && rowCount === count
                      ? 'bg-[#137333] hover:bg-[#0f5223] text-white font-bold shadow-[0_2px_6px_rgba(19,115,51,0.25)]'
                      : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                  }`}
                >
                  {count} Rows
                </button>
              ))}

              {/* Custom Rows & Columns Button */}
              <button
                type="button"
                onClick={() => setIsCustomRowsCols(true)}
                className={`px-3.5 py-2 rounded-full text-xs transition-all cursor-pointer flex items-center gap-1.5 border-0 shadow-none ${
                  isCustomRowsCols
                    ? 'bg-[#137333] hover:bg-[#0f5223] text-white font-bold shadow-[0_2px_6px_rgba(19,115,51,0.25)]'
                    : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Custom Rows / Columns</span>
              </button>
            </div>

            {/* Custom Rows & Columns Input Fields */}
            {isCustomRowsCols && (
              <div className="pt-2 animate-in fade-in duration-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium pl-1">Row Count</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={customRowsInput}
                    onChange={(e) => setCustomRowsInput(e.target.value)}
                    placeholder="Custom rows (e.g. 15)"
                    autoFocus
                    className="w-full px-4 py-2 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] shadow-none focus:outline-none focus:ring-2 focus:ring-[#137333]/40"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium pl-1">Column Count</span>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={customColumnCountInput}
                    onChange={(e) => setCustomColumnCountInput(e.target.value)}
                    placeholder="Custom columns (e.g. 5)"
                    className="w-full px-4 py-2 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] shadow-none focus:outline-none focus:ring-2 focus:ring-[#137333]/40"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Optional Additional Directives */}
          <div className="space-y-1.5 pt-0.5">
            <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              Additional Directives (Optional)
            </label>
            <input
              type="text"
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="e.g. Include 3D plot formulas, add time complexity comparison column..."
              className="w-full px-4 py-2.5 text-xs sm:text-[13px] rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] shadow-none focus:outline-none focus:ring-2 focus:ring-[#137333]/40 transition-all"
            />
          </div>

          {/* Context Grounding */}
          {sessionFiles.length > 0 && (
            <label className="flex items-center justify-between p-3 rounded-full bg-[#f0f4f9] dark:bg-[#26282e] border-0 shadow-none cursor-pointer hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] transition-colors">
              <div className="flex items-center gap-2.5 min-w-0 pl-1">
                <div className="w-6 h-6 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 border-0 shadow-none">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                  Extract from {sessionFiles.length} uploaded file{sessionFiles.length !== 1 ? 's' : ''}
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded-full text-[#137333] focus:ring-0 h-4 w-4 cursor-pointer mr-1"
              />
            </label>
          )}

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
              disabled={!topic.trim()}
              className="h-10 px-6 rounded-full text-xs sm:text-[13px] font-bold text-white bg-[#137333] hover:bg-[#0f5223] border-0 shadow-[0_2px_8px_rgba(19,115,51,0.3)] transition-all active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
              <span>Generate Table</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
