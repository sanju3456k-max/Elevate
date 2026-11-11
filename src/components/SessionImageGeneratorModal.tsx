import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  Image as ImageIcon, 
  Palette,
  Layout,
  Code2,
  FileCheck
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

export interface SessionImageGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  onGenerateImage: (config: {
    prompt: string;
    style: string;
    aspectRatio: string;
    includeContext: boolean;
    usePythonPlot: boolean;
  }) => void;
  isDarkMode: boolean;
}

const STYLE_OPTIONS = [
  { id: 'math_diagram', label: 'Diagram' },
  { id: 'infographic', label: 'Infographic' },
  { id: 'photorealistic', label: '3D Render' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'scifi', label: 'Sci-Fi / HUD' },
];

const ASPECT_RATIOS = ['Free Size', '16:9', '1:1', '4:3', '9:16', '3:2'];

export const SessionImageGeneratorModal: React.FC<SessionImageGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateImage,
}) => {
  const [prompt, setPrompt] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('math_diagram');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('Free Size');
  const [includeContext, setIncludeContext] = useState<boolean>(sessionFiles.length > 0);
  const [usePythonPlot, setUsePythonPlot] = useState<boolean>(true);

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_image_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setSelectedStyle('math_diagram');
      setSelectedAspectRatio('Free Size');
      setIncludeContext(sessionFiles.length > 0);
      setUsePythonPlot(true);
    }
  }, [isOpen, sessionFiles.length]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    onGenerateImage({
      prompt: prompt.trim(),
      style: selectedStyle,
      aspectRatio: selectedAspectRatio,
      includeContext,
      usePythonPlot,
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
            {/* Modern Rounded Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
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
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 border-0 shadow-none">
                  <ImageIcon className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-[15px] sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Generate Visual Image & 2D/3D Diagrams
                  </h3>
                  <p className="text-[11px] sm:text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
                    Mathematical diagrams, 2D/3D plots & visual graphics
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

            {/* Modern Form */}
            <form onSubmit={handleGenerate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Prompt Description */}
              <div className="space-y-1.5">
                <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Description
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. 3D surface plot of z = sin(x)*cos(y), Transformer attention map, or geometric proof..."
                  rows={3}
                  required
                  autoFocus
                  className="w-full px-4 py-3 text-xs sm:text-[13px] rounded-[22px] bg-[#f0f4f9] dark:bg-[#26282e] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all resize-none border-0 shadow-none"
                />
              </div>

              {/* Style Selector */}
              <div className="space-y-1.5">
                <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 border-0 shadow-none">
                    <Palette className="w-3 h-3" />
                  </div>
                  <span>Style</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_OPTIONS.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
                      className={`px-3.5 py-2 rounded-full text-xs transition-all cursor-pointer border-0 shadow-none ${
                        selectedStyle === style.id
                          ? 'bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-[0_2px_6px_rgba(147,51,234,0.3)]'
                          : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio & Format Row */}
              <div className="space-y-3 pt-0.5">
                {/* Aspect Ratio - With Free Size option */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 border-0 shadow-none">
                        <Layout className="w-3 h-3" />
                      </div>
                      <span>Aspect Ratio</span>
                    </label>
                    <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                      {selectedAspectRatio === 'Free Size' ? 'Auto Free Canvas Size' : selectedAspectRatio}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECT_RATIOS.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setSelectedAspectRatio(ratio)}
                        className={`px-3.5 py-2 rounded-full text-xs text-center transition-all cursor-pointer border-0 shadow-none ${
                          selectedAspectRatio === ratio
                            ? 'bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-[0_2px_6px_rgba(147,51,234,0.3)]'
                            : 'bg-[#edf2f9] dark:bg-[#26282e] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] font-semibold'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format Engine Option */}
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-[12.5px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 border-0 shadow-none">
                      <Code2 className="w-3 h-3" />
                    </div>
                    <span>Format Engine</span>
                  </label>
                  <div className="p-3 rounded-[20px] bg-purple-50/70 dark:bg-purple-950/40 flex items-center justify-between gap-3 text-xs text-purple-900 dark:text-purple-200 border-0 shadow-none">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse shrink-0" />
                      <span className="font-bold">Python Plot (Rendered Image & Code)</span>
                    </div>
                    <span className="text-[10px] font-bold bg-purple-200/60 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 px-2.5 py-0.5 rounded-full border-0 shadow-none">
                      Matplotlib
                    </span>
                  </div>
                </div>
              </div>

              {/* Context Grounding (Only if session files exist) */}
              {sessionFiles.length > 0 && (
                <label className="flex items-center justify-between p-3 rounded-full bg-[#f0f4f9] dark:bg-[#26282e] cursor-pointer hover:bg-[#e1e9f5] dark:hover:bg-[#30333b] transition-colors border-0 shadow-none">
                  <div className="flex items-center gap-2.5 min-w-0 pl-1">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 flex items-center justify-center shrink-0 border-0 shadow-none">
                      <FileCheck className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                      Reference {sessionFiles.length} uploaded file{sessionFiles.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={(e) => setIncludeContext(e.target.checked)}
                    className="rounded-full text-purple-600 focus:ring-0 h-4 w-4 cursor-pointer mr-1"
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
                  disabled={!prompt.trim()}
                  className="h-10 px-6 rounded-full text-xs sm:text-[13px] font-bold text-white bg-purple-600 hover:bg-purple-700 border-0 shadow-[0_2px_8px_rgba(147,51,234,0.3)] transition-all active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 stroke-[2.2]" />
                  <span>Generate Visual</span>
                </button>
              </div>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
