import React from 'react';
import {
  ArrowLeft,
  FileText,
  FileCode,
  RefreshCw,
  Cloud,
  FolderPlus,
  Download,
  Sun,
  Moon,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { NotesStudioMode } from '../types';
import { APP_STYLES } from '../../ui/AppStyles';

interface NotesStudioHeaderProps {
  currentMode: NotesStudioMode;
  onModeChange: (mode: NotesStudioMode) => void;
  onBack: () => void;
  onAddNewNote?: () => void;
  onAddFileToProject?: () => void;
  googleToken: string | null;
  isTokenExpired: boolean;
  isConnectingDrive: boolean;
  onConnectDrive: () => void;
  onSignOutDrive: () => void;
  onCreateNewProject?: () => void;
  onImportClick?: () => void;
  isDark?: boolean;
  toggleTheme?: () => void;
  isSearchOpen?: boolean;
  onToggleSearch?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onImportDroppedFile?: (file: File) => void;
}

export const NotesStudioHeader: React.FC<NotesStudioHeaderProps> = ({
  currentMode,
  onModeChange,
  onBack,
  onAddNewNote,
  onAddFileToProject,
  googleToken,
  isTokenExpired,
  isConnectingDrive,
  onConnectDrive,
  onSignOutDrive,
  onCreateNewProject,
  onImportClick,
  isDark,
  toggleTheme,
  isSearchOpen,
  onToggleSearch,
  searchQuery,
  onSearchChange,
  onImportDroppedFile,
}) => {
  const [isDraggingImport, setIsDraggingImport] = React.useState<boolean>(false);
  return (
    <header className={`sticky top-0 z-40 px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] pb-2 flex flex-col gap-2.5 ${APP_STYLES.surface.header} shrink-0 border-0 shadow-none`}>
      {/* Top Row: Back, Title & Google Drive Sync */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-col justify-center">
            <h1 className="text-[17px] font-semibold text-slate-900 dark:text-zinc-100 tracking-tight leading-tight flex items-center gap-1.5 m-0">
              <span>Notes Studio</span>
            </h1>
          </div>
        </div>

        {/* Right Controls: Google Drive & Cloud Status */}
        <div className="shrink-0 flex items-center gap-2">
          {googleToken && !isTokenExpired ? (
            <div
              className="flex items-center gap-1.5 h-9 px-3 sm:px-3.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 text-xs font-semibold shadow-xs text-emerald-700 dark:text-emerald-300 whitespace-nowrap select-none"
              title="Google Drive & Docs Connected to Notes Studio"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] font-bold hidden sm:inline">Drive Connected</span>
              <span className="text-[11px] font-bold sm:hidden">Drive</span>
            </div>
          ) : isTokenExpired ? (
            <button
              type="button"
              onClick={onConnectDrive}
              disabled={isConnectingDrive}
              className="flex items-center gap-1.5 h-9 px-3 sm:px-3.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold shadow-xs text-amber-800 dark:text-amber-300 whitespace-nowrap cursor-pointer active:scale-95 transition-all outline-none"
              title="Click to reconnect Google Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 ${isConnectingDrive ? 'animate-spin' : ''}`} />
              <span className="text-[11px] font-bold">Reconnect Drive</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectDrive}
              disabled={isConnectingDrive}
              className="flex items-center gap-1.5 h-9 px-3 sm:px-3.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] border border-slate-200 dark:border-zinc-700 text-xs font-semibold shadow-xs text-slate-700 dark:text-zinc-200 whitespace-nowrap cursor-pointer active:scale-95 transition-all outline-none"
              title="Connect Google Drive & Docs"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[11px] font-bold">Connect Drive</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Mode Toggle Row: ONLY Notes and HTML Notes toggle button */}
      <div className="w-full flex justify-center pt-0.5">
        <nav
          aria-label="Notes Studio modes"
          className="inline-flex p-1 bg-white dark:bg-[#1e2024] rounded-[24px] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 w-full max-w-[300px] sm:max-w-[340px] mx-auto items-center"
        >
          {/* 1. Notes (Repository / Study Files) */}
          <button
            type="button"
            onClick={() => onModeChange('repository')}
            className={`flex-1 h-9 px-3 rounded-[20px] text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer border-0 outline-none select-none active:scale-[0.98] ${
              currentMode === 'repository'
                ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 bg-transparent font-medium'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2] shrink-0 ${
              currentMode === 'repository' ? 'text-white' : 'text-slate-500 dark:text-zinc-400'
            }`} />
            <span>Notes</span>
          </button>

          {/* 2. HTML Notes */}
          <button
            type="button"
            onClick={() => onModeChange('html')}
            className={`flex-1 h-9 px-3 rounded-[20px] text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer border-0 outline-none select-none active:scale-[0.98] ${
              currentMode === 'html'
                ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 bg-transparent font-medium'
            }`}
          >
            <FileCode className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2] shrink-0 ${
              currentMode === 'html' ? 'text-white' : 'text-slate-500 dark:text-zinc-400'
            }`} />
            <span>HTML Notes</span>
          </button>
        </nav>
      </div>

      {/* 3. Bottom Row under the toggle button: Actions shifted rightwards (Shown in HTML Notes mode, hidden in Notes mode) */}
      {currentMode === 'html' && (
        <div className="w-full flex items-center justify-end gap-1.5 sm:gap-2 pt-0.5 pb-0.5">
          {/* Search Button immediately left to New project button */}
          {onToggleSearch && (
            isSearchOpen ? (
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#1e2024] border border-slate-200 dark:border-zinc-700/80 rounded-full h-8.5 px-3 shadow-xs transition-all w-48 sm:w-64 focus-within:ring-2 focus-within:ring-[#0b57d0]/20 focus-within:border-[#0b57d0]">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery || ''}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  placeholder="Search projects & notes..."
                  className="bg-transparent border-0 outline-none text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 w-full"
                  autoFocus
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange?.('')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 border-0 bg-transparent cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onToggleSearch}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 border-0 bg-transparent cursor-pointer"
                    title="Close search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onToggleSearch}
                className="h-8.5 px-3.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap"
                title="Search projects and notes"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            )
          )}

          {onCreateNewProject && (
            <button
              type="button"
              onClick={onCreateNewProject}
              className="h-8.5 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap"
              title="Create a new Project Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New project</span>
            </button>
          )}
          {onImportClick && (
            <button
              type="button"
              onClick={onImportClick}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingImport(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingImport(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingImport(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  onImportDroppedFile?.(file);
                }
              }}
              className={`h-8.5 px-3.5 rounded-full font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap ${
                isDraggingImport
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-[#0b57d0] dark:text-[#a8c7fa] ring-2 ring-[#0b57d0] scale-105'
                  : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3]'
              }`}
              title="Import .html or .zip project file (Click or Drag & Drop)"
            >
              <Download className={`w-3.5 h-3.5 ${isDraggingImport ? 'animate-bounce text-[#0b57d0]' : ''}`} />
              <span>{isDraggingImport ? 'Drop to Import' : 'Import'}</span>
            </button>
          )}
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8.5 h-8.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-xs border-0 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </header>
  );
};
