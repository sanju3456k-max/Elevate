import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Pencil,
  Paperclip,
  ImageIcon,
  FileText,
  Tag,
  Check,
} from 'lucide-react';
import type { MathTest } from '../../../../types';
import type { UserNoteItem } from '../../../DriveFileManager';
import {
  studioBackdropVariants,
  studioModalVariants,
  gpuAcceleratedStyle,
} from '../../../../lib/animationConfig';
import { APP_STYLES } from '../../../ui/AppStyles';

interface CreateRevisionNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tests: MathTest[];
  editingNote?: UserNoteItem | null;
  onSave: (noteData: {
    id?: string;
    content: string;
    tag: 'formula' | 'trick' | 'mistake' | 'general' | 'table';
    testId: string;
    attachedFile: {
      url: string;
      name: string;
      type: 'image' | 'pdf' | 'file';
    } | null;
  }) => void;
}

export const CreateRevisionNoteModal: React.FC<CreateRevisionNoteModalProps> = ({
  isOpen,
  onClose,
  tests,
  editingNote,
  onSave,
}) => {
  const [content, setContent] = useState<string>('');
  const [tag, setTag] = useState<'formula' | 'trick' | 'mistake' | 'general' | 'table'>('general');
  const [testId, setTestId] = useState<string>('all');
  const [attachedFile, setAttachedFile] = useState<{
    url: string;
    name: string;
    type: 'image' | 'pdf' | 'file';
  } | null>(null);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNote) {
      setContent(editingNote.content || '');
      setTag(editingNote.tag || 'general');
      setTestId(editingNote.testId || 'all');
      if (editingNote.fileUrl) {
        setAttachedFile({
          url: editingNote.fileUrl,
          name: editingNote.fileName || 'Attachment',
          type: editingNote.fileType || 'file',
        });
      } else {
        setAttachedFile(null);
      }
    } else {
      setContent('');
      setTag('general');
      setTestId('all');
      setAttachedFile(null);
    }
  }, [editingNote, isOpen]);

  const processFile = (file: File) => {
    const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isImg && !isPdf) {
      alert('Supported attachment formats are Images (JPG, PNG, WebP) and PDF documents.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        url: reader.result as string,
        name: file.name,
        type: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachedFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !attachedFile) return;

    onSave({
      id: editingNote?.id,
      content: content.trim(),
      tag,
      testId,
      attachedFile,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        variants={studioBackdropVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 cursor-pointer overflow-y-auto select-none"
        onClick={onClose}
      >
        <motion.div
          variants={studioModalVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-white dark:bg-[#1e2024] rounded-[24px] sm:rounded-[28px] border-0 shadow-[0_16px_48px_rgba(0,0,0,0.22)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.7)] flex flex-col max-h-[min(92vh,740px)] cursor-default overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800/80 shrink-0 bg-white dark:bg-[#1e2024]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold shrink-0 border-0 shadow-xs">
                {editingNote ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4 stroke-[2.5]" />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 truncate">
                  {editingNote ? 'Edit Revision Note' : 'Create Revision Note'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">
                  Save formulas, tricks, shortcut methods, and attach diagrams
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 flex items-center justify-center transition-colors cursor-pointer border-0 shrink-0 select-none"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body - Scrollable so fields never cut on any screen resolution */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 [scrollbar-width:thin]">
            {/* Tag Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Note Category / Tag:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'formula', label: 'Formula' },
                  { id: 'trick', label: 'Trick' },
                  { id: 'mistake', label: 'Mistake' },
                  { id: 'general', label: 'General' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTag(item.id as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                      tag === item.id
                        ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-xs'
                        : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200/80 dark:border-zinc-700/60 hover:bg-slate-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Test Association */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Associate with Test (Optional):
              </label>
              <select
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#141619] text-[#1f1f1f] dark:text-[#e3e3e3] border border-slate-200/80 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] text-xs sm:text-sm font-medium shadow-2xs transition-all cursor-pointer"
              >
                <option value="all">General (No specific test)</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Content Textarea with Math KaTeX tips */}
            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Note Content (Supports LaTeX Math $...$):
                </label>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                  e.g., $E = mc^2$
                </span>
              </div>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your revision note, shortcuts, key formulas, or takeaways..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#141619] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-slate-400 dark:placeholder:text-zinc-500 border border-slate-200/80 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] text-xs sm:text-sm font-sans leading-relaxed shadow-2xs transition-all resize-y min-h-[96px] max-h-[200px]"
              />
            </div>

            {/* Attachment preview / upload */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Attach Image or PDF (Optional):
              </label>

              {attachedFile ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {attachedFile.type === 'image' ? (
                      <ImageIcon className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs text-slate-700 dark:text-zinc-200 font-medium truncate">
                      {attachedFile.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveAttachment}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-rose-500 transition-colors border-0 bg-transparent cursor-pointer shrink-0"
                    title="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingAttachment(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingAttachment(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingAttachment(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      processFile(file);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full py-2.5 px-3 rounded-xl border-2 border-dashed text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isDraggingAttachment
                        ? 'border-[#0b57d0] bg-blue-50/80 dark:bg-blue-950/50 text-[#0b57d0] dark:text-[#a8c7fa] scale-[1.01]'
                        : 'border-slate-300 dark:border-zinc-700 hover:border-[#0b57d0] dark:hover:border-[#a8c7fa] bg-slate-50/50 dark:bg-zinc-800/40 text-slate-600 dark:text-zinc-400 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]'
                    }`}
                  >
                    <Paperclip className={`w-4 h-4 ${isDraggingAttachment ? 'animate-bounce text-[#0b57d0]' : ''}`} />
                    <span className="truncate">{isDraggingAttachment ? 'Drop Image or PDF to Attach' : 'Upload Diagram / PDF File (or drag & drop)'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5 shrink-0 border-t border-slate-100 dark:border-zinc-800/80 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-all cursor-pointer border-0 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!content.trim() && !attachedFile}
                className="h-9 px-5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold transition-all cursor-pointer border-0 active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingNote ? 'Save Changes' : 'Create Note'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
