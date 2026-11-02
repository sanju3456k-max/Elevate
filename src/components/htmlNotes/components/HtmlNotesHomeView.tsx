import React from 'react';
import {
  FolderOpen,
  Edit2,
  FileText,
  Clock,
  FileCode,
  Eye,
  Code,
  Trash2,
  Cloud,
  RefreshCw,
  Sparkles,
  ExternalLink,
  FolderArchive,
  Download,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { type HtmlProject, type HtmlNoteItem } from '../../../lib/htmlNotesSync';
import { type DriveSyncStatus } from '../../../lib/htmlNotesDriveSync';
import { type ViewMode } from '../types';
import { DriveSyncBanner } from './DriveSyncBanner';

interface HtmlNotesHomeViewProps {
  onBack?: () => void;
  projects: HtmlProject[];
  isDark?: boolean;
  toggleTheme?: () => void;
  onCreateNewProject?: () => void;
  onImportClick?: () => void;
  onOpenProject: (proj: HtmlProject) => void;
  onOpenFile: (projectId: string, file: HtmlNoteItem, mode: ViewMode) => void;
  onAddFileToProject?: (projectId: string) => void;
  onDeleteFile: (e: React.MouseEvent, projectId: string, fileId: string) => void;
  onDeleteProject?: (e: React.MouseEvent, projectId: string) => void;
  onExportFullProject?: (projectId: string) => void;
  // Google Drive
  isDriveConnected?: boolean;
  driveSyncStatus?: DriveSyncStatus;
  onConnectDrive?: () => void;
  onTriggerDriveSync?: () => void;
  onDeduplicateDrive?: () => void;
  activeNote?: HtmlNoteItem;
  showToast?: (msg: string) => void;
  // Project expansion state
  expandedProjects: Record<string, boolean>;
  toggleExpandProject: (e: React.MouseEvent, projectId: string) => void;
  // Renaming project state
  renamingProjectId: string | null;
  setRenamingProjectId: (id: string | null) => void;
  renamingProjectName: string;
  setRenamingProjectName: (name: string) => void;
  onCommitRenameProject: (projectId: string) => void;
  // Notes Studio Mode Switching
  activeStudioMode?: 'notes' | 'repository' | 'html';
  onSwitchStudioMode?: (mode: 'notes' | 'repository' | 'html') => void;
  hideTopBar?: boolean;
  // Search
  searchQuery?: string;
  onClearSearch?: () => void;
  onImportDroppedFile?: (file: File) => void;
}

const formatUpdatedDateTime = (timestamp?: number): string => {
  if (!timestamp) return 'Just now';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return 'Recently';
  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${dateStr} at ${timeStr}`;
};

export const HtmlNotesHomeView: React.FC<HtmlNotesHomeViewProps> = ({
  projects,
  onCreateNewProject,
  onImportClick,
  onImportDroppedFile,
  onOpenProject,
  onOpenFile,
  onAddFileToProject,
  onDeleteFile,
  onDeleteProject,
  onExportFullProject,
  expandedProjects,
  toggleExpandProject,
  renamingProjectId,
  setRenamingProjectId,
  renamingProjectName,
  setRenamingProjectName,
  onCommitRenameProject,
  isDriveConnected = false,
  driveSyncStatus,
  onConnectDrive,
  onTriggerDriveSync,
  onDeduplicateDrive,
  activeNote,
  showToast,
  searchQuery,
  onClearSearch,
}) => {
  const isSearching = Boolean(searchQuery && searchQuery.trim());
  const cleanQuery = (searchQuery || '').trim().toLowerCase();

  const [isDraggingOverHome, setIsDraggingOverHome] = React.useState(false);

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverHome) setIsDraggingOverHome(true);
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOverHome(false);
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverHome(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0 && onImportDroppedFile) {
      onImportDroppedFile(droppedFiles[0]);
    }
  };

  // Sort projects with newest / last-updated on top
  const sortedProjects = React.useMemo(() => {
    return [...projects].sort((a, b) => {
      const timeA = a.updatedAt || a.createdAt || 0;
      const timeB = b.updatedAt || b.createdAt || 0;
      return timeB - timeA;
    });
  }, [projects]);

  // Filter projects & their files if search is active
  const filteredProjects = React.useMemo(() => {
    if (!isSearching) return sortedProjects;
    return sortedProjects
      .map((proj) => {
        const matchProjectName = (proj.name || '').toLowerCase().includes(cleanQuery);
        const matchingFiles = (Array.isArray(proj.files) ? proj.files : []).filter((f) =>
          (f.title || '').toLowerCase().includes(cleanQuery) ||
          (f.code || '').toLowerCase().includes(cleanQuery)
        );

        if (matchProjectName || matchingFiles.length > 0) {
          return {
            ...proj,
            // If project matched files specifically, only show matching files when searching
            files: matchingFiles.length > 0 ? matchingFiles : proj.files,
            _hasMatchingFiles: matchingFiles.length > 0,
            _matchProjectName: matchProjectName,
          };
        }
        return null;
      })
      .filter(Boolean) as (HtmlProject & { _hasMatchingFiles?: boolean; _matchProjectName?: boolean })[];
  }, [sortedProjects, isSearching, cleanQuery]);

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden bg-[#e5e9f0] dark:bg-[#0b0c10] relative transition-colors duration-200 ${
        isDraggingOverHome ? 'ring-4 ring-[#0b57d0] ring-inset bg-blue-50/50 dark:bg-blue-950/30' : ''
      }`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOverHome && (
        <div className="absolute inset-0 z-50 bg-[#0b57d0]/10 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none p-4">
          <div className="px-6 py-4 rounded-2xl bg-white dark:bg-[#1e2024] shadow-xl border-2 border-dashed border-[#0b57d0] flex items-center gap-3 animate-bounce">
            <Download className="w-8 h-8 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white m-0">Drop file to Import</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 m-0">Supports .html, .htm, .txt, or .zip project packages</p>
            </div>
          </div>
        </div>
      )}

      {/* Project List / Overleaf Document Explorer */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-4 scrollbar-thin">

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white m-0">Your Projects & Chapters</h2>
            <p className="text-xs font-medium text-slate-500 m-0">
              {isSearching
                ? `Showing search results for "${searchQuery}"`
                : 'Click dropdown to view notes inside each project.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isSearching && onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1 border-0 bg-transparent cursor-pointer p-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear search</span>
              </button>
            )}
            <div className="text-xs font-semibold text-slate-400">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
            </div>
          </div>
        </div>

        {/* Project Cards or Empty State */}
        {isSearching && filteredProjects.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-[24px] bg-white dark:bg-[#1e2024] border border-dashed border-slate-300 dark:border-zinc-700 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200 m-0">No matching projects or notes</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-0">No results found matching "{searchQuery}". Try searching another title or keyword.</p>
            </div>
            {onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="mt-2 px-4 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs border-0 cursor-pointer active:scale-95 transition-all shadow-xs"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : projects.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-[24px] bg-white dark:bg-[#1e2024] border border-dashed border-slate-300 dark:border-zinc-700 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:bg-[#a8c7fa]/15 dark:text-[#a8c7fa] flex items-center justify-center">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200 m-0">No projects yet</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-0">Create your first chapter project or import an HTML document to get started.</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {onCreateNewProject && (
                <button
                  type="button"
                  onClick={onCreateNewProject}
                  className="px-4 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs border-0 cursor-pointer active:scale-95 transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Project</span>
                </button>
              )}
              {onImportClick && (
                <button
                  type="button"
                  onClick={onImportClick}
                  className="px-4 py-2 rounded-full bg-white dark:bg-[#282a30] hover:bg-[#f0f4f9] dark:hover:bg-[#32353c] text-slate-800 dark:text-zinc-200 font-bold text-xs border border-slate-200 dark:border-zinc-700 cursor-pointer active:scale-95 transition-all shadow-xs flex items-center gap-1.5"
                  title="Import Project (Supports Drag & Drop)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Import Project</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
          {filteredProjects.map((proj) => {
            const hasMatchingFiles = Boolean((proj as any)._hasMatchingFiles);
            // Optimized Search Expansion: ONLY auto-expand if this project contains notes matching the search query!
            // If the project matched solely by its project name, it stays cleanly collapsed unless clicked.
            const isExpanded = isSearching ? (hasMatchingFiles || !!expandedProjects[proj.id]) : !!expandedProjects[proj.id];
            const isRenaming = renamingProjectId === proj.id;

            return (
              <div
                key={proj.id}
                className="bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] rounded-[24px] overflow-hidden transition-all duration-200 relative group"
              >
                {/* Project Folder Header Row */}
                <div
                  onClick={() => onOpenProject(proj)}
                  className="p-3.5 sm:p-4 bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] cursor-pointer transition-all select-none"
                  title="Open project in editor"
                >
                  <div className="flex items-center justify-between w-full pb-1">
                    <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                      Chapter
                    </span>
                  </div>

                  <div className="my-1.5 sm:my-2 flex items-center justify-between gap-2">
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renamingProjectName}
                        onChange={(e) => setRenamingProjectName(e.target.value)}
                        onBlur={() => onCommitRenameProject(proj.id)}
                        onKeyDown={(e) => e.key === 'Enter' && onCommitRenameProject(proj.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="px-2.5 py-1 text-sm font-bold rounded-lg border border-[#0b57d0] bg-white dark:bg-zinc-900 text-[#1f1f1f] dark:text-[#e3e3e3] outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FolderOpen className="w-5 h-5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                        <h3 className="text-[15px] sm:text-base font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug tracking-tight truncate m-0">
                          {proj.name}
                        </h3>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingProjectId(proj.id);
                            setRenamingProjectName(proj.name);
                          }}
                          className="text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] cursor-pointer p-1 rounded-full hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] transition-colors"
                          title="Rename project"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </span>

                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportFullProject?.(proj.id);
                          }}
                          className="text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] cursor-pointer p-1 rounded-full hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] transition-colors"
                          title="Download full project with all files (.zip)"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </span>

                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject?.(e, proj.id);
                          }}
                          className="text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-1 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddFileToProject?.(proj.id);
                          }}
                          className="h-7 px-2.5 rounded-full bg-[#0b57d0]/10 hover:bg-[#0b57d0] text-[#0b57d0] hover:text-white dark:bg-[#a8c7fa]/15 dark:hover:bg-[#a8c7fa] dark:text-[#a8c7fa] dark:hover:text-[#041e49] text-[11px] font-bold border-0 flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ml-1"
                          title="Create new note in this project"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Note</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="w-full border-t border-[#edf0f5] dark:border-[#2f3238] my-1.5 pointer-events-none" />

                  {/* Bottom Footer: Stats & Dropdown Chevron */}
                  <div className="pt-0.5 flex items-center justify-between gap-2 text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-medium">
                    <div className="flex items-center gap-2 pointer-events-none text-[11px] sm:text-xs text-[#444746] dark:text-[#c4c7c5]">
                      <span className="font-mono tabular-nums">
                        {(Array.isArray(proj.files) ? proj.files : []).length} {(Array.isArray(proj.files) ? proj.files : []).length === 1 ? 'file' : 'files'}
                      </span>
                      {isSearching && hasMatchingFiles && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-[#0b57d0] dark:text-[#a8c7fa] text-[10px] font-bold">
                          {(proj.files || []).length} matching {(proj.files || []).length === 1 ? 'note' : 'notes'}
                        </span>
                      )}
                      <span className="text-slate-300 dark:text-zinc-700">·</span>
                      <span className="font-mono tabular-nums">
                        Updated {formatUpdatedDateTime(proj.updatedAt || proj.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandProject(e, proj.id);
                        }}
                        className="w-7 h-7 rounded-full bg-[#f0f4f9] hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#32353c] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border-0 p-0"
                        title={isExpanded ? 'Collapse files list' : 'Expand files list'}
                        aria-label={isExpanded ? 'Collapse files list' : 'Expand files list'}
                      >
                        <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'} shrink-0`}>
                          chevron_right
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Files inside this project */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 sm:px-4 sm:pb-4 pt-1 space-y-2 bg-transparent m3-slide-down-in">
                    <div className="w-full border-t border-[#edf0f5] dark:border-[#2f3238] mb-2.5" />
                    {(!Array.isArray(proj.files) || proj.files.length === 0) ? (
                      <div className="p-4 rounded-[20px] bg-[#f8fafd] dark:bg-[#1a1d24] border border-dashed border-slate-300 dark:border-zinc-700 text-center flex flex-col items-center justify-center gap-2">
                        <p className="text-xs text-slate-500 dark:text-zinc-400 m-0">No notes in this chapter yet.</p>
                        <button
                          type="button"
                          onClick={() => onAddFileToProject?.(proj.id)}
                          className="px-3.5 py-1.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-0 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create First Note</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {[...(Array.isArray(proj.files) ? proj.files : [])]
                          .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
                          .map((file) => (
                          <div
                            key={file.id}
                            className="p-3 sm:p-3.5 rounded-[20px] bg-[#f8fafd] dark:bg-[#1a1d24] hover:bg-[#f0f4f9] dark:hover:bg-[#232730] border border-slate-300 dark:border-zinc-700 shadow-none flex flex-col gap-2.5 transition-all relative overflow-hidden group"
                            style={{ borderWidth: '1px' }}
                          >
                            <div
                              onClick={() => onOpenFile(proj.id, file, 'preview')}
                              className="flex items-start gap-2.5 min-w-0 w-full cursor-pointer"
                            >
                              <div className="w-8 h-8 rounded-full bg-white dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                                <FileCode className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors break-words leading-snug">
                                  {file.title || 'Untitled Note'}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6] mt-1 font-mono tabular-nums">
                                  <span>{(file.code || '').split('\n').length} lines</span>
                                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                                  <span>Updated {formatUpdatedDateTime(file.updatedAt || file.createdAt)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-0.5 w-full">
                              <button
                                onClick={() => onOpenFile(proj.id, file, 'preview')}
                                className="h-7.5 px-3 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-xs border-0 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                                title="Open in Live Preview Mode"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Preview</span>
                              </button>

                              <button
                                onClick={() => onOpenFile(proj.id, file, 'editor')}
                                className="h-7.5 px-3 rounded-full bg-[#e8edf5] hover:bg-[#dce3ee] dark:bg-[#282a30] dark:hover:bg-[#32353c] text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold text-xs border-0 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                                title="Open in Code Editor"
                              >
                                <Code className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={(e) => onDeleteFile(e, proj.id, file.id)}
                                className="w-7.5 h-7.5 rounded-full bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-500 border-0 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                                title="Delete Note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => onAddFileToProject?.(proj.id)}
                          className="w-full py-2.5 px-3 rounded-[18px] bg-slate-50 hover:bg-[#0b57d0]/10 dark:bg-zinc-800/40 dark:hover:bg-[#a8c7fa]/10 border border-dashed border-slate-300 hover:border-[#0b57d0] dark:border-zinc-700 dark:hover:border-[#a8c7fa] text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-98"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add New Note</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
};
