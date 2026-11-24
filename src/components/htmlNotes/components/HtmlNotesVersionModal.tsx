import React, { useState } from 'react';
import {
  History,
  X,
  RotateCcw,
  Check,
  Clock,
  FileText,
  Eye,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { type NoteVersion } from '../utils/versionHistory';

interface HtmlNotesVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: NoteVersion[];
  currentCode: string;
  noteTitle: string;
  onRestoreVersion: (version: NoteVersion) => void;
}

export const HtmlNotesVersionModal: React.FC<HtmlNotesVersionModalProps> = ({
  isOpen,
  onClose,
  versions,
  currentCode,
  noteTitle,
  onRestoreVersion
}) => {
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  if (!isOpen) return null;

  const activePreviewVer = versions.find((v) => v.id === previewVersionId) || (versions.length > 0 ? versions[0] : null);

  const handleRestore = (ver: NoteVersion) => {
    onRestoreVersion(ver);
    setRestoredId(ver.id);
    setTimeout(() => {
      setRestoredId(null);
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 m3-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0b0c10] rounded-2xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[85vh] m3-dialog-in text-[#1f1f1f] dark:text-[#e3e3e3]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-6 py-4.5 bg-white dark:bg-[#16181d] border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] dark:text-[#a8c7fa] border border-blue-100/80 dark:border-blue-900/40 flex items-center justify-center shrink-0 shadow-2xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white m-0 flex items-center gap-2">
                <span>Version History</span>
                <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0b57d0] dark:bg-blue-950/70 dark:text-[#a8c7fa] border border-blue-200/60 dark:border-blue-800/40">
                  Last 2 Saved
                </span>
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 m-0 truncate max-w-xs sm:max-w-md pt-0.5">
                Note: <span className="font-semibold text-slate-700 dark:text-zinc-300">{noteTitle || 'Untitled Note'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 flex items-center justify-center border-0 cursor-pointer transition-all active:scale-95 shadow-2xs"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 scrollbar-thin">
          {versions.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 text-[#0b57d0] dark:text-[#a8c7fa] border border-blue-100/80 dark:border-blue-900/40 flex items-center justify-center mx-auto shadow-xs">
                <Clock className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-800 dark:text-zinc-200 m-0">
                No Previous Versions Saved Yet
              </h4>
              <p className="text-xs font-normal text-slate-500 dark:text-zinc-400 m-0 max-w-sm mx-auto leading-relaxed">
                Snapshots are automatically created when you edit and save changes to your document. Your last 2 versions will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* VERSIONS CARDS */}
              {versions.map((ver, idx) => {
                const isRestored = restoredId === ver.id;
                const safeCurrentCode = (currentCode || '').trim();
                const safeVerCode = (ver?.code || '').trim();
                const isCurrentCode = safeCurrentCode.length > 0 && safeCurrentCode === safeVerCode;

                return (
                  <div
                    key={ver.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 ${
                      activePreviewVer?.id === ver.id
                        ? 'border-blue-500/70 bg-blue-50/30 dark:bg-blue-950/20 shadow-md ring-1 ring-blue-500/30'
                        : 'border-slate-200/70 dark:border-zinc-800 bg-white dark:bg-[#13151b] hover:border-slate-300 dark:hover:border-zinc-700 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-200 border border-slate-200/60 dark:border-zinc-700/50 flex items-center gap-1.5 shadow-2xs">
                          <Layers className="w-3 h-3 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          <span>Version {ver.versionNumber || versions.length - idx}</span>
                        </span>
                        {isCurrentCode && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            Current Active
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{ver.dateTimeStr}</span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Saved {ver.timeAgo}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-zinc-300 font-mono bg-slate-100/80 dark:bg-zinc-900/90 border border-slate-200/50 dark:border-zinc-800 px-2.5 py-1.5 rounded-xl">
                          {ver.modificationSummary}
                        </div>
                      </div>

                      {/* CODE SNIPPET PREVIEW BOX */}
                      <div className="mt-2 text-[10.5px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-[#0c0d12] p-2.5 rounded-xl border border-slate-200/60 dark:border-zinc-800 max-h-24 overflow-hidden text-ellipsis whitespace-pre-wrap leading-tight shadow-inner">
                        {(ver?.code || '').substring(0, 180)}...
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setPreviewVersionId(ver.id)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-0 flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>

                      <button
                        onClick={() => handleRestore(ver)}
                        disabled={isRestored}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 border-0 shadow-xs cursor-pointer transition-all active:scale-95 ${
                          isRestored
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:text-[#041e49]'
                        }`}
                      >
                        {isRestored ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Restored!</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore This Version</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FULL INSPECTION PREVIEW IF SELECTED */}
          {activePreviewVer && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Inspecting Content — Version {activePreviewVer.versionNumber} ({activePreviewVer.dateTimeStr})</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activePreviewVer.charCount} chars
                </span>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap leading-snug border border-slate-800 scrollbar-thin">
                {activePreviewVer.code}
              </pre>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-[#121318] border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Last 2 versions preserved safely on demand.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold border-0 cursor-pointer transition-all active:scale-95 shadow-2xs text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
