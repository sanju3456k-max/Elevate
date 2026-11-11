import React, { useRef, useEffect, useState } from 'react';
import {
  Plus,
  Send,
  Square,
  Mic,
  MicOff,
  Radio,
  Globe,
  Code2,
  X,
  FileText,
  Sparkles,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  Image as ImageIcon,
  FileArchive,
  Loader2,
  FileCheck,
  GraduationCap
} from 'lucide-react';
import { ChatAttachment, GeminiModelTier } from './GeminiChatbotView';
import { speechEngine } from '../lib/geminiSpeechEngine';
import { useBackHandler } from '../hooks/useBackNavigation';

export interface GeminiStudioPromptBarProps {
  inputMessage: string;
  setInputMessage: (val: string | ((prev: string) => string)) => void;
  onSendMessage: (overridePrompt?: string) => void;
  isLoading: boolean;
  onCancelRequest: () => void;
  attachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreviewAttachment: (att: ChatAttachment) => void;
  // Tools & Grounding
  enableSearchGrounding: boolean;
  onToggleSearchGrounding: () => void;
  enableCodeExecution: boolean;
  onToggleCodeExecution: () => void;
  // Speech & Voice Dictation
  isDictating: boolean;
  onToggleDictation: () => void;
  // Live Talk
  isLiveTalkActive: boolean;
  liveTalkStatus: 'listening' | 'speaking' | 'paused' | 'sending';
  liveTalkTranscript: string;
  isMicMuted: boolean;
  isVoiceResponseEnabled: boolean;
  onToggleLiveTalk: () => void;
  onToggleLiveTalkMic: () => void;
  onToggleVoiceResponse: () => void;
  onSendLiveTalkPrompt: (text: string) => void;
  onStopLiveTalk: () => void;
  // Targeted Edit Mode
  editingContext: {
    type: 'test' | 'code' | 'table' | 'message' | 'image';
    data?: any;
    content?: string;
    title?: string;
    language?: string;
    targetMessageId?: string;
  } | null;
  onCancelEditMode: () => void;
  currentModel: GeminiModelTier;
  sessionFiles?: ChatAttachment[];
  onOpenSessionFilesTestGenerator?: () => void;
  onOpenImageGenerator?: () => void;
  onOpenTableGenerator?: () => void;
}

export const GeminiStudioPromptBar: React.FC<GeminiStudioPromptBarProps> = ({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isLoading,
  onCancelRequest,
  attachments,
  onRemoveAttachment,
  onFileSelect,
  onPreviewAttachment,
  enableSearchGrounding,
  onToggleSearchGrounding,
  enableCodeExecution,
  onToggleCodeExecution,
  isDictating,
  onToggleDictation,
  isLiveTalkActive,
  liveTalkStatus,
  liveTalkTranscript,
  isMicMuted,
  isVoiceResponseEnabled,
  onToggleLiveTalk,
  onToggleLiveTalkMic,
  onToggleVoiceResponse,
  onSendLiveTalkPrompt,
  onStopLiveTalk,
  editingContext,
  onCancelEditMode,
  currentModel,
  sessionFiles = [],
  onOpenSessionFilesTestGenerator,
  onOpenImageGenerator,
  onOpenTableGenerator,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Back Navigation Handlers
  useBackHandler({
    isOpen: isAddMenuOpen,
    onBack: () => setIsAddMenuOpen(false),
    priority: 18,
    id: 'gemini_promptbar_add_menu'
  });

  useBackHandler({
    isOpen: isLiveTalkActive,
    onBack: onStopLiveTalk,
    priority: 35,
    id: 'gemini_promptbar_live_talk'
  });

  // Close Add Menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
    };
    if (isAddMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAddMenuOpen]);

  // Auto-resize textarea according to Google AI Studio prompt bar behavior
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      // Single line is ~22px, expand smoothly up to 140px then scroll
      textarea.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [inputMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textVal = inputMessage.trim().toLowerCase();
      if (isLoading) {
        if (textVal === 'cancel') {
          setInputMessage('');
          onCancelRequest();
        }
      } else {
        if (inputMessage.trim() || attachments.length > 0) {
          onSendMessage();
        }
      }
    }
  };

  const getAttachmentIcon = (mime: string, name: string) => {
    if (mime.startsWith('image/')) return <ImageIcon className="w-3.5 h-3.5 text-blue-500" />;
    if (mime.includes('spreadsheet') || mime.includes('csv') || name.endsWith('.csv')) {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />;
    }
    if (mime === 'application/pdf') return <FileText className="w-3.5 h-3.5 text-red-500" />;
    if (mime.includes('zip') || mime.includes('tar')) return <FileArchive className="w-3.5 h-3.5 text-amber-500" />;
    return <FileText className="w-3.5 h-3.5 text-slate-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 md:px-8 relative">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileSelect}
        multiple
        accept="image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,.py,.js,.ts,.tsx,.cpp,.c,.java"
        className="hidden"
      />

      {/* Live Talk Voice Assistant Floating Card */}
      {isLiveTalkActive && (
        <div className="mb-3 p-3.5 sm:p-4 rounded-3xl bg-white dark:bg-[#21222e] shadow-none border border-slate-200/80 dark:border-zinc-800/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Dynamic Animated Status Visualizer */}
              <div className="relative flex items-center justify-center shrink-0">
                <div
                  className={`w-3.5 h-3.5 rounded-full ${
                    liveTalkStatus === 'speaking'
                      ? 'bg-emerald-500 animate-ping'
                      : liveTalkStatus === 'listening'
                      ? 'bg-blue-500 animate-pulse'
                      : liveTalkStatus === 'sending' || isLoading
                      ? 'bg-amber-500 animate-spin'
                      : 'bg-slate-400'
                  }`}
                />
                {(liveTalkStatus === 'sending' || isLoading) && (
                  <div className="absolute inset-0 w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                )}
              </div>

              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    Live Assistant
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-none border border-slate-200/80 dark:border-zinc-800/80 ${
                      liveTalkStatus === 'speaking'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : liveTalkStatus === 'listening'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                        : liveTalkStatus === 'sending' || isLoading
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-[#1f212a] dark:text-zinc-400'
                    }`}
                  >
                    {liveTalkStatus === 'sending' || isLoading ? 'Thinking...' : liveTalkStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-300 truncate mt-0.5 font-medium">
                  {liveTalkStatus === 'sending' || isLoading
                    ? 'Waiting for response... AI is formulating answer'
                    : liveTalkStatus === 'speaking'
                    ? 'AI is speaking response...'
                    : liveTalkStatus === 'listening'
                    ? liveTalkTranscript || 'Listening... Speak naturally'
                    : 'Microphone paused'}
                </p>
              </div>
            </div>

            {/* Live Talk Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Cancel In-Flight Response Button (Active when thinking or speaking) */}
              {(liveTalkStatus === 'sending' || isLoading || liveTalkStatus === 'speaking') && (
                <button
                  type="button"
                  onClick={onCancelRequest}
                  className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-none border border-red-200/80 dark:border-red-900/60"
                  title="Cancel response generation and resume listening"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              )}

              {/* Mic Mute/Unmute */}
              <button
                type="button"
                onClick={onToggleLiveTalkMic}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80 ${
                  isMicMuted
                    ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#282a2d] dark:hover:bg-[#35373b] text-slate-700 dark:text-zinc-200'
                }`}
                title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Voice Readout Mute/Unmute */}
              <button
                type="button"
                onClick={onToggleVoiceResponse}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80 ${
                  liveTalkStatus === 'speaking'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 animate-pulse'
                    : !isVoiceResponseEnabled
                    ? 'bg-slate-100 dark:bg-[#282a2d] text-slate-400 dark:text-zinc-500'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#282a2d] dark:hover:bg-[#35373b] text-slate-700 dark:text-zinc-200'
                }`}
                title={
                  liveTalkStatus === 'speaking'
                    ? 'Stop speaking'
                    : isVoiceResponseEnabled
                    ? 'AI Voice on (Click to mute)'
                    : 'AI Voice off (Click to enable)'
                }
              >
                {isVoiceResponseEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Send Spoken Transcript Immediately */}
              {liveTalkStatus === 'listening' && (
                <button
                  type="button"
                  onClick={() => {
                    if (liveTalkTranscript.trim()) {
                      onSendLiveTalkPrompt(liveTalkTranscript.trim());
                    }
                  }}
                  disabled={!liveTalkTranscript.trim()}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shadow-none border border-blue-500/80"
                  title="Send spoken words immediately"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Close Live Talk */}
              <button
                type="button"
                onClick={onStopLiveTalk}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                title="Close Live Talk"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Targeted Edit Mode Active Banner */}
      {editingContext && (
        <div className="mb-2 flex items-center justify-between gap-3 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-[#21222e] text-xs text-blue-700 dark:text-blue-300 shadow-none border border-blue-200/80 dark:border-blue-900/50 animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-full bg-blue-600 text-white shrink-0 shadow-none border border-blue-500/60">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="truncate">
              <span className="font-bold">
                {editingContext.targetMessageId ? 'Direct Message Update:' : 'Edit Mode:'}
              </span>{' '}
              <span className="opacity-90 font-mono text-[11px] bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full shadow-none border border-blue-200/60 dark:border-blue-800/60">
                {editingContext.type.toUpperCase()}{editingContext.language ? ` (${editingContext.language})` : ''}
              </span>
              {editingContext.title && <span className="ml-1.5 opacity-80 truncate">"{editingContext.title}"</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelEditMode}
            className="p-1 rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all cursor-pointer shrink-0 shadow-none border border-blue-200/60 dark:border-blue-800/60"
            title="Cancel Edit Mode"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unified Prompt Box Frame - Rounded Prompt Bar Container */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const text = e.dataTransfer.getData('text/plain');
          if (text) {
            setInputMessage((prev) => (prev ? `${prev}\n${text}` : text));
            textareaRef.current?.focus();
          }
        }}
        className={`flex flex-col transition-all rounded-[28px] sm:rounded-[32px] px-3.5 pt-2.5 pb-2 sm:px-4.5 sm:pt-3 sm:pb-2.5 border border-slate-200 dark:border-zinc-700 shadow-xs ${
          isDragging
            ? 'bg-blue-50/80 dark:bg-blue-950/40 ring-2 ring-blue-500'
            : 'bg-white dark:bg-[#1e2024]'
        }`}
      >
        {/* Top Attached Media Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-1 px-0.5 border-b border-slate-100 dark:border-zinc-800/60">
            {attachments.map((att) => (
              <div
                key={att.id}
                onClick={() => onPreviewAttachment(att)}
                className="group relative flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-slate-100 dark:bg-[#282a2d] text-[11px] text-slate-800 dark:text-zinc-200 transition-all cursor-pointer hover:bg-slate-200 dark:hover:bg-[#35373b] shadow-none border border-slate-200/80 dark:border-zinc-800/80"
              >
                {att.previewUrl && att.previewUrl.trim() ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name || 'Attachment'}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  getAttachmentIcon(att.mimeType, att.name)
                )}
                <div className="max-w-[130px] truncate font-semibold">
                  {att.name}
                </div>
                <span className="text-[9.5px] text-slate-400 dark:text-zinc-500">
                  {formatFileSize(att.size)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAttachment(att.id);
                  }}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors ml-0.5"
                  title="Remove attachment"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Middle Auto-Expanding Textarea with Search Icon Indicator */}
        <div className="flex items-start gap-2.5 px-0.5">
          <div className="pt-1.5 shrink-0 select-none">
            <span className="w-5.5 h-5.5 rounded-full bg-gradient-to-tr from-[#4285F4] via-[#9B72CB] to-[#EA4335] flex items-center justify-center text-white text-[10px] font-bold shadow-none">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="gemini-prompt-textarea"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              editingContext
                ? `Ask to refine ${editingContext.type}...`
                : 'Ask anything, explore theorems, generate tests, or plot with AI...'
            }
            rows={1}
            className="w-full bg-transparent text-[16px] sm:text-[17.5px] font-medium text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none resize-none py-1 max-h-[140px] overflow-y-auto leading-relaxed border-0 ring-0 shadow-none"
          />
        </div>

        {/* Bottom Toolbars & Control Row */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 pt-1.5 px-0.5">
          {/* Left Action Group */}
          <div className="flex items-center gap-1.5 flex-wrap relative" ref={addMenuRef}>
            {/* + Add Attachment / Session Tools Popover Trigger */}
            <button
              type="button"
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-transparent shadow-xs ${
                isAddMenuOpen
                  ? 'bg-blue-600 text-white rotate-45 border-blue-600'
                  : 'bg-white dark:bg-[#282a2d] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f8fafd] dark:hover:bg-[#35383f]'
              }`}
              title="Add files & AI tools (+)"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Quick Toggle Pills: Google Search & Python */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleSearchGrounding}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] sm:text-xs font-bold transition-all duration-150 cursor-pointer select-none border border-slate-200 dark:border-transparent outline-none active:scale-95 ${
                  enableSearchGrounding
                    ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] border-blue-300 dark:border-transparent shadow-xs'
                    : 'bg-white dark:bg-[#282a2d] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f8fafd] dark:hover:bg-[#35383f] shadow-xs'
                }`}
                title="Toggle Google Search Grounding"
              >
                <Globe className="w-4 h-4" />
                <span>Search</span>
              </button>

              <button
                type="button"
                onClick={onToggleCodeExecution}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] sm:text-xs font-bold transition-all duration-150 cursor-pointer select-none border border-slate-200 dark:border-transparent outline-none active:scale-95 ${
                  enableCodeExecution
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-transparent shadow-xs'
                    : 'bg-white dark:bg-[#282a2d] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f8fafd] dark:hover:bg-[#35383f] shadow-xs'
                }`}
                title="Toggle Python Code Execution Sandbox"
              >
                <Code2 className="w-4 h-4" />
                <span>Python</span>
              </button>
            </div>

            {/* Google AI Studio Add Files & Session Tools Popover Menu - App M3 Style */}
            {isAddMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2.5 w-80 sm:w-[340px] rounded-[28px] bg-white dark:bg-[#1e2024] p-2.5 sm:p-3 z-50 animate-in fade-in zoom-in-95 duration-150 select-none shadow-[0_6px_28px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_36px_rgba(0,0,0,0.55)] border-0 modal-content-smooth">
                <div className="space-y-1">
                  {/* Upload from Device */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    disabled={attachments.length >= 10}
                    className="w-full flex items-center gap-3 p-2.5 sm:p-3 rounded-[20px] hover:bg-[#edf2f9] dark:hover:bg-[#26282e] text-left transition-all cursor-pointer group disabled:opacity-50 border-0 shadow-none active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform border-0 shadow-none">
                      <Plus className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] sm:text-[13.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        Upload Files from Device
                      </div>
                      <div className="text-[11.5px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate">
                        PDFs, images, code, CSV data
                      </div>
                    </div>
                  </button>

                  {/* Generate Test from Files / Topics */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      if (onOpenSessionFilesTestGenerator) {
                        onOpenSessionFilesTestGenerator();
                      } else {
                        setInputMessage((prev) => prev ? `${prev}\nGenerate a 10-question practice test on this topic with solutions.` : 'Generate a comprehensive 10-question practice test with detailed step-by-step solutions.');
                        textareaRef.current?.focus();
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-[20px] hover:bg-[#edf2f9] dark:hover:bg-[#26282e] text-left transition-all cursor-pointer group border-0 shadow-none active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform border-0 shadow-none">
                        <GraduationCap className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-[13.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                          <span>Generate Custom Test</span>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        </div>
                        <div className="text-[11.5px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate">
                          {sessionFiles.length > 0
                            ? `Create test from ${sessionFiles.length} session file${sessionFiles.length !== 1 ? 's' : ''}`
                            : 'Test with MCQ, numerical & LaTeX'}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] text-[10.5px] font-bold shrink-0 border-0 shadow-none">
                      Test
                    </span>
                  </button>

                  {/* Generate Visual Image / Plot */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      if (onOpenImageGenerator) {
                        onOpenImageGenerator();
                      } else {
                        setInputMessage((prev) => prev ? `${prev}\nGenerate a detailed visual illustration or 3D diagram.` : 'Generate a high-detail visual illustration or 3D diagram of ');
                        textareaRef.current?.focus();
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-[20px] hover:bg-[#edf2f9] dark:hover:bg-[#26282e] text-left transition-all cursor-pointer group border-0 shadow-none active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform border-0 shadow-none">
                        <ImageIcon className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-[13.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                          <span>Generate Visual Image</span>
                          <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        </div>
                        <div className="text-[11.5px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate">
                          Diagrams, 3D math plots & visuals
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 text-[10.5px] font-bold shrink-0 border-0 shadow-none">
                      Image
                    </span>
                  </button>

                  {/* Generate Data Table */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      if (onOpenTableGenerator) {
                        onOpenTableGenerator();
                      } else {
                        setInputMessage((prev) => prev ? `${prev}\nGenerate a structured comparison markdown table.` : 'Generate a detailed comparison markdown table for ');
                        textareaRef.current?.focus();
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-[20px] hover:bg-[#edf2f9] dark:hover:bg-[#26282e] text-left transition-all cursor-pointer group border-0 shadow-none active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform border-0 shadow-none">
                        <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-[13.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                          <span>Generate Data Table</span>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        </div>
                        <div className="text-[11.5px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate">
                          Comparison matrix, formula sheets & metrics
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] text-[10.5px] font-bold shrink-0 border-0 shadow-none">
                      Table
                    </span>
                  </button>

                  {/* Grounding & Code Tools */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onToggleSearchGrounding()}
                      className={`h-9 px-3 rounded-full flex items-center justify-center gap-2 transition-all cursor-pointer border-0 shadow-none active:scale-95 ${
                        enableSearchGrounding
                          ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold'
                          : 'bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] text-[#444746] dark:text-[#c4c7c5] font-semibold'
                      }`}
                    >
                      <Globe className="w-4 h-4 shrink-0 stroke-[2.2]" />
                      <span className="truncate">Google Search</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleCodeExecution()}
                      className={`h-9 px-3 rounded-full flex items-center justify-center gap-2 transition-all cursor-pointer border-0 shadow-none active:scale-95 ${
                        enableCodeExecution
                          ? 'bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223]/50 dark:text-[#81c995] font-bold'
                          : 'bg-[#edf2f9] hover:bg-[#e1e9f5] dark:bg-[#26282e] dark:hover:bg-[#30333b] text-[#444746] dark:text-[#c4c7c5] font-semibold'
                      }`}
                    >
                      <Code2 className="w-4 h-4 shrink-0 stroke-[2.2]" />
                      <span className="truncate">Python Engine</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Action Group */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Model Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#282a2d] text-[11px] text-slate-700 dark:text-zinc-300 font-bold border border-slate-200 dark:border-zinc-700 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>{currentModel.replace('gemini-', '')}</span>
            </div>

            {/* Speech Dictation Mic Button */}
            <button
              type="button"
              onClick={onToggleDictation}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-zinc-700 shadow-xs ${
                isDictating
                  ? 'bg-red-500 text-white animate-pulse border-red-500'
                  : 'text-slate-700 dark:text-zinc-300 bg-white dark:bg-[#282a2d] hover:bg-[#f8fafd] dark:hover:bg-[#35373b]'
              }`}
              title={isDictating ? 'Stop speech dictation' : 'Speech-to-Text Dictation (Mic)'}
            >
              {isDictating ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>

            {/* Live Talk Interactive Voice Button */}
            <button
              type="button"
              onClick={onToggleLiveTalk}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-zinc-700 shadow-xs ${
                isLiveTalkActive
                  ? 'bg-blue-600 text-white animate-pulse border-blue-600'
                  : 'bg-white dark:bg-[#282a2d] hover:bg-[#f8fafd] dark:hover:bg-[#35373b] text-blue-600 dark:text-blue-400'
              }`}
              title="Live Talk Voice Assistant"
            >
              <Radio className="w-4.5 h-4.5" />
            </button>

            {/* Submit / Cancel Action Button */}
            {isLoading ? (
              <button
                type="button"
                onClick={onCancelRequest}
                className="w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 text-white transition-transform active:scale-95 cursor-pointer border-0 shadow-xs animate-pulse"
                title="Stop generating"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSendMessage()}
                disabled={!inputMessage.trim() && attachments.length === 0}
                className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all cursor-pointer border-0 shadow-xs ${
                  !inputMessage.trim() && attachments.length === 0
                    ? 'bg-slate-200 dark:bg-[#282a2d] text-slate-400 dark:text-zinc-600 cursor-not-allowed opacity-60'
                    : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white active:scale-95'
                }`}
                title="Send Prompt (Enter)"
              >
                <Send className="w-4.5 h-4.5 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
