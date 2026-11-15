import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Folder,
  FolderPlus,
  Video,
  Play,
  FileText,
  FilePlus,
  Award,
  Users,
  UserPlus,
  Settings,
  Sliders,
  Eye,
  Search,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  X,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  ExternalLink,
  IndianRupee,
  Clock,
  CheckSquare,
  Sparkles,
  Filter,
  Grid,
  List,
  PanelRightClose,
  PanelRightOpen,
  ArrowUpRight,
  Copy,
  RefreshCw,
  BookOpen,
  Info,
  Loader2,
} from 'lucide-react';
import { fetchVideoMetadata, extractYouTubeVideoId } from '../../../lms/videoMetadataService';
import { useApp } from '../../../lms/LmsContext';
import {
  extractYouTubeId,
  obfuscateVideoKey,
  deobfuscateVideoKey,
  buildGoogleDrivePreviewUrl,
  extractGoogleDriveId,
  formatDuration,
} from '../../../lms/security';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import { M3Switch, M3CircularProgress } from '../../ui/Material3';
import type {
  Batch,
  Chapter,
  Lecture,
  BatchEnrollment,
  BatchTestCard,
  TimelineMilestone,
  PdfNote,
} from '../../../lms/types';
import type { MathTest } from '../../../types';

export type StudioTab = 'curriculum' | 'roster' | 'tests' | 'settings';
export type ViewMode = 'grid' | 'table';

export type InspectedEntityType = 'batch' | 'folder' | 'lecture' | 'student' | 'new_folder' | 'new_lecture';

export interface InspectedEntity {
  type: InspectedEntityType;
  id?: string;
  parentId?: string | null;
}

const ACCENT_COLORS = [
  { name: 'Google Blue', hex: '#0b57d0' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' },
];

interface DesktopLmsStudioProps {
  availableTests?: MathTest[];
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  externalActiveTab?: StudioTab;
  onTabChange?: (tab: StudioTab) => void;
  externalBatchId?: string;
  onBatchSelect?: (batchId: string) => void;
  hideHeader?: boolean;
}

export const DesktopLmsStudio: React.FC<DesktopLmsStudioProps> = ({
  availableTests = [],
  onStartTest,
  externalActiveTab,
  onTabChange,
  externalBatchId,
  onBatchSelect,
  hideHeader = false,
}) => {
  const {
    batches,
    addBatch,
    updateBatch,
    deleteBatch,
    subjects,
    chapters,
    addFolder,
    updateChapter,
    deleteChapter,
    getSubfolders,
    lectures,
    addLecture,
    updateLecture,
    deleteLecture,
    enrollments,
    getEnrollmentsForBatch,
    enrollStudentByContact,
    revokeStudentEnrollment,
    loadRosterForBatch,
    loadCurriculumForBatch,
    batchTests,
    addTestToBatchCatalog,
    getTestsForBatch,
    toggleTestInChapter,
    showSecurityToast,
    globalGuestAccessMode,
    setGlobalGuestAccessMode,
    toggleBatchGuestAccess,
    user,
  } = useApp();

  // 1. Navigation & View States
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => externalBatchId || batches[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>(() => externalActiveTab || 'curriculum');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [contentFilter, setContentFilter] = useState<'all' | 'videos' | 'notes' | 'tests'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize with external props if provided
  useEffect(() => {
    if (externalBatchId && externalBatchId !== selectedBatchId) {
      setSelectedBatchId(externalBatchId);
      setSelectedFolderId(null);
    }
  }, [externalBatchId]);

  useEffect(() => {
    if (externalActiveTab && externalActiveTab !== activeTab) {
      setActiveTab(externalActiveTab);
    }
  }, [externalActiveTab]);

  const handleTabChange = useCallback((tab: StudioTab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  }, [onTabChange]);

  const handleBatchChange = useCallback((batchId: string) => {
    setSelectedBatchId(batchId);
    setSelectedFolderId(null);
    if (onBatchSelect) onBatchSelect(batchId);
  }, [onBatchSelect]);

  // 2. 3-Pane Workstation Layout Visibility States
  const [isLeftPaneCollapsed, setIsLeftPaneCollapsed] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // 3. Selection & Inspection Entity
  const [inspectedEntity, setInspectedEntity] = useState<InspectedEntity | null>(() => {
    return batches[0] ? { type: 'batch', id: batches[0].id } : null;
  });

  // Keep selectedBatchId valid
  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      const fallbackId = externalBatchId || batches[0].id;
      setSelectedBatchId(fallbackId);
    }
  }, [batches, selectedBatchId, externalBatchId]);

  // Current active batch
  const currentBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0] || null;
  }, [batches, selectedBatchId]);

  // Auto load batch curriculum and roster ONLY when selectedBatchId actually changes
  const loadedBatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedBatchId && loadedBatchIdRef.current !== selectedBatchId) {
      loadedBatchIdRef.current = selectedBatchId;
      loadCurriculumForBatch(selectedBatchId);
      loadRosterForBatch(selectedBatchId);
    }
  }, [selectedBatchId, loadCurriculumForBatch, loadRosterForBatch]);

  // Hierarchical chapters and lectures for the current batch
  const batchChapters = useMemo(() => {
    return chapters.filter((c) => c.batchId === selectedBatchId);
  }, [chapters, selectedBatchId]);

  const batchLectures = useMemo(() => {
    return lectures.filter((l) => l.batchId === selectedBatchId);
  }, [lectures, selectedBatchId]);

  const batchEnrollments = useMemo(() => {
    return selectedBatchId ? getEnrollmentsForBatch(selectedBatchId) : [];
  }, [selectedBatchId, getEnrollmentsForBatch, enrollments]);

  const batchCatalogTests = useMemo(() => {
    return selectedBatchId ? getTestsForBatch(selectedBatchId) : [];
  }, [selectedBatchId, getTestsForBatch, batchTests]);

  // Subfolders at current level
  const currentSubfolders = useMemo(() => {
    if (!selectedBatchId) return [];
    return getSubfolders(selectedBatchId, selectedFolderId);
  }, [selectedBatchId, selectedFolderId, getSubfolders, chapters]);

  // Lectures inside current folder
  const currentFolderLectures = useMemo(() => {
    if (!selectedFolderId) {
      // At root level, show unassigned lectures or root-level items
      return batchLectures.filter((l) => !l.chapterId || l.chapterId === 'root');
    }
    return batchLectures.filter((l) => l.chapterId === selectedFolderId);
  }, [batchLectures, selectedFolderId]);

  // Current folder node if nested
  const currentFolder = useMemo(() => {
    return batchChapters.find((c) => c.id === selectedFolderId) || null;
  }, [batchChapters, selectedFolderId]);

  // Dynamic Google Drive-style Breadcrumbs
  const breadcrumbTrail = useMemo(() => {
    const trail: { id: string | null; title: string }[] = [
      { id: null, title: currentBatch?.title || 'Batch Root' },
    ];
    if (!selectedFolderId) return trail;

    const visited = new Set<string>();
    let curr: Chapter | undefined = batchChapters.find((c) => c.id === selectedFolderId);
    const parents: { id: string; title: string }[] = [];

    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      parents.unshift({ id: curr.id, title: curr.title });
      curr = curr.parentId ? batchChapters.find((c) => c.id === curr!.parentId) : undefined;
    }

    return [...trail, ...parents];
  }, [currentBatch, selectedFolderId, batchChapters]);

  // Handle entity inspection selection
  const selectEntity = (entity: InspectedEntity) => {
    setInspectedEntity(entity);
    setIsInspectorOpen(true);
  };

  // Keyboard shortcut listener (Cmd/Ctrl+K, Esc, Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('studio-omni-search');
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        if (inspectedEntity) {
          setIsInspectorOpen(false);
        } else if (selectedFolderId) {
          const parent = currentFolder?.parentId || null;
          setSelectedFolderId(parent);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedEntity, selectedFolderId, currentFolder]);

  // Quick Action Handlers
  const handleTriggerNewFolder = () => {
    selectEntity({
      type: 'new_folder',
      parentId: selectedFolderId,
    });
  };

  const handleTriggerNewLecture = () => {
    selectEntity({
      type: 'new_lecture',
      parentId: selectedFolderId,
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none overflow-hidden rounded-3xl border border-[var(--md-sys-color-outline-variant)]/20 shadow-2xl">
      {/* =========================================================================
          TOP COMMAND & WORKBAR (Desktop First)
          ========================================================================= */}
      <header className="h-16 px-4 sm:px-6 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between gap-4 shrink-0 z-30">
        {/* Left: Pane 1 Toggle & Batch Switcher Dropdown */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsLeftPaneCollapsed(!isLeftPaneCollapsed)}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition border-none bg-transparent cursor-pointer"
            title={isLeftPaneCollapsed ? 'Expand Navigator' : 'Collapse Navigator'}
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Batch Selector Pill (Hidden when controlled externally by Master Console sidebar) */}
          {!externalBatchId && (
            <div className="relative group">
              <select
                value={selectedBatchId}
                onChange={(e) => {
                  const newId = e.target.value;
                  handleBatchChange(newId);
                  selectEntity({ type: 'batch', id: newId });
                }}
                className="appearance-none pl-3.5 pr-8 py-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none cursor-pointer transition shadow-xs max-w-[200px] sm:max-w-[260px] truncate"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} {b.isPublished ? '●' : '○ (Draft)'}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" />
            </div>
          )}

          {!externalBatchId && <div className="h-5 w-px bg-[var(--md-sys-color-outline-variant)]/30 hidden sm:block" />}

          {/* Quick Metrics Badge */}
          {currentBatch && (
            <div className="hidden lg:flex items-center space-x-2 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
                {currentBatch.category}
              </span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                ₹{currentBatch.price}
              </span>
              <span>•</span>
              <span>{batchEnrollments.length} Enrolled</span>
            </div>
          )}
        </div>

        {/* Center: Dynamic Interactive Breadcrumbs */}
        <div className="hidden md:flex items-center space-x-1.5 text-xs font-semibold overflow-x-auto py-1 scrollbar-none flex-1 max-w-xl mx-2">
          {selectedFolderId && (
            <button
              type="button"
              onClick={() => {
                const parent = currentFolder?.parentId || null;
                setSelectedFolderId(parent);
              }}
              className="p-1 rounded-lg hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer transition mr-1"
              title="Step up one level"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {breadcrumbTrail.map((crumb, idx) => {
            const isLast = idx === breadcrumbTrail.length - 1;
            return (
              <React.Fragment key={crumb.id || 'root'}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(crumb.id);
                    if (crumb.id) {
                      selectEntity({ type: 'folder', id: crumb.id });
                    } else if (currentBatch) {
                      selectEntity({ type: 'batch', id: currentBatch.id });
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg border-none bg-transparent cursor-pointer shrink-0 truncate max-w-[140px] text-xs transition ${
                    isLast
                      ? 'font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-high)]'
                      : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                  }`}
                  title={crumb.title}
                >
                  {crumb.title}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Right: Omni Search, View Toggle, Quick Action Pills & Inspector Toggle */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Omni Search */}
          <div className="relative w-36 sm:w-48 hidden sm:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--md-sys-color-on-surface-variant)]" />
            <input
              id="studio-omni-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search (Ctrl+K)..."
              className="w-full pl-8 pr-2.5 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)]"
            />
          </div>

          {/* Grid / Table View Switcher */}
          <div className="flex items-center bg-[var(--md-sys-color-surface-container-high)] p-0.5 rounded-full">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-full border-none cursor-pointer transition ${
                viewMode === 'grid'
                  ? 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-full border-none cursor-pointer transition ${
                viewMode === 'table'
                  ? 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-[var(--md-sys-color-outline-variant)]/30" />

          {/* Action Pills */}
          <button
            type="button"
            onClick={handleTriggerNewFolder}
            className="px-3 py-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs hover:opacity-90 active:scale-95 transition border-none cursor-pointer shrink-0"
            title="Create New Subfolder"
          >
            <FolderPlus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">+ Folder</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerNewLecture}
            className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
            title="Add Video Lecture"
          >
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">+ Lecture</span>
          </button>

          {/* Inspector Toggle */}
          <button
            type="button"
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition border-none cursor-pointer ${
              isInspectorOpen
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                : 'hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
            }`}
            title={isInspectorOpen ? 'Collapse Inspector' : 'Open Inspector'}
          >
            {isInspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN 3-PANE WORKSTATION BODY
          ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* =======================================================================
            PANE 1: TREE NAVIGATOR & ROSTER EXPLORER (Left 280px)
            ======================================================================= */}
        {!isLeftPaneCollapsed && (!externalActiveTab || activeTab === 'curriculum') && (
          <aside className="w-64 lg:w-72 bg-[var(--md-sys-color-surface-container)] border-r border-[var(--md-sys-color-outline-variant)]/20 flex flex-col shrink-0 overflow-y-auto scrollbar-none transition-all duration-200">
            {/* Batch Header Snapshot Card & Tabs (Only in standalone mode) */}
            {!externalActiveTab && (
              <>
                {currentBatch && (
                  <div
                    onClick={() => selectEntity({ type: 'batch', id: currentBatch.id })}
                    className="p-3.5 m-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer transition shadow-xs space-y-2 border border-transparent hover:border-[var(--md-sys-color-primary)]/30 group"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0 relative">
                        <img
                          src={currentBatch.bannerUrl || currentBatch.thumbnailUrl}
                          alt={currentBatch.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate group-hover:text-[var(--md-sys-color-primary)]">
                          {currentBatch.title}
                        </h3>
                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                          {currentBatch.category}
                        </p>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          currentBatch.isPublished ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        title={currentBatch.isPublished ? 'Published' : 'Draft'}
                      />
                    </div>
                  </div>
                )}

                {/* Studio Navigation Tabs */}
                <div className="px-3 pb-2 space-y-1">
                  <button
                    type="button"
                    onClick={() => handleTabChange('curriculum')}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-none cursor-pointer ${
                      activeTab === 'curriculum'
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Folder className="w-4 h-4" />
                      <span>Curriculum Tree</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-mono">
                      {batchChapters.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabChange('roster')}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-none cursor-pointer ${
                      activeTab === 'roster'
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Users className="w-4 h-4" />
                      <span>Student Roster</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-mono">
                      {batchEnrollments.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabChange('tests')}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-none cursor-pointer ${
                      activeTab === 'tests'
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Award className="w-4 h-4" />
                      <span>Test Catalogs</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-mono">
                      {batchCatalogTests.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleTabChange('settings');
                      if (currentBatch) selectEntity({ type: 'batch', id: currentBatch.id });
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-none cursor-pointer ${
                      activeTab === 'settings'
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Settings className="w-4 h-4" />
                      <span>Batch Settings</span>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Hierarchical Tree Folders */}
            <div className={`flex-1 px-3 py-2 space-y-1 overflow-y-auto ${!externalActiveTab ? 'border-t border-[var(--md-sys-color-outline-variant)]/20' : 'pt-3'}`}>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                  Folder Hierarchy
                </span>
                <button
                  type="button"
                  onClick={handleTriggerNewFolder}
                  className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] border-none bg-transparent cursor-pointer"
                  title="Add Root Folder"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Root Level Item */}
              <div
                onClick={() => {
                  setSelectedFolderId(null);
                  if (currentBatch) selectEntity({ type: 'batch', id: currentBatch.id });
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                  selectedFolderId === null && activeTab === 'curriculum'
                    ? 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-bold'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Folder className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                  <span className="truncate">Root Level</span>
                </div>
                <span className="text-[10px] opacity-70">
                  {batchChapters.filter((c) => !c.parentId).length}
                </span>
              </div>

              {/* Render chapters & nested folders */}
              {batchChapters
                .filter((c) => !c.parentId)
                .map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  const childFolders = batchChapters.filter((sub) => sub.parentId === folder.id);
                  const folderLecs = batchLectures.filter((l) => l.chapterId === folder.id);

                  return (
                    <div key={folder.id} className="space-y-0.5">
                      <div
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          selectEntity({ type: 'folder', id: folder.id });
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-bold'
                            : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate min-w-0">
                          <Folder
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: folder.color || '#0b57d0' }}
                          />
                          <span className="truncate">{folder.title}</span>
                        </div>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] ml-1">
                          {folderLecs.length}
                        </span>
                      </div>

                      {/* Nested Children */}
                      {childFolders.length > 0 && (
                        <div className="pl-4 space-y-0.5 border-l border-[var(--md-sys-color-outline-variant)]/30 ml-3">
                          {childFolders.map((child) => (
                            <div
                              key={child.id}
                              onClick={() => {
                                setSelectedFolderId(child.id);
                                selectEntity({ type: 'folder', id: child.id });
                              }}
                              className={`w-full px-2 py-1 rounded-md text-[11px] font-medium flex items-center justify-between cursor-pointer transition ${
                                selectedFolderId === child.id
                                  ? 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-bold'
                                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                              }`}
                            >
                              <span className="truncate">{child.title}</span>
                              <span className="text-[9px] opacity-70">
                                {batchLectures.filter((l) => l.chapterId === child.id).length}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </aside>
        )}

        {/* =======================================================================
            PANE 2: CONTENT CANVAS & DATA GRID (Center Flex-1)
            ======================================================================= */}
        <main className="flex-1 flex flex-col bg-[var(--md-sys-color-surface)] overflow-y-auto scrollbar-none p-4 sm:p-6 space-y-6">
          {/* TAB 1: CURRICULUM CANVAS */}
          {activeTab === 'curriculum' && (
            <div className="space-y-6">
              {/* Filter Pills Bar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center space-x-1.5 bg-[var(--md-sys-color-surface-container)] p-1 rounded-full text-xs font-bold">
                  {(['all', 'videos', 'notes', 'tests'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setContentFilter(f)}
                      className={`px-3 py-1 rounded-full capitalize transition border-none cursor-pointer ${
                        contentFilter === f
                          ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                    >
                      {f === 'all' ? 'All Content' : f}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                  {currentSubfolders.length} Folders • {currentFolderLectures.length} Lectures
                </div>
              </div>

              {/* Subfolders Grid / Table */}
              {currentSubfolders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1.5">
                    <Folder className="w-3.5 h-3.5" />
                    <span>Folders ({currentSubfolders.length})</span>
                  </h3>

                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {currentSubfolders.map((folder) => {
                        const childCount = batchChapters.filter((c) => c.parentId === folder.id).length;
                        const lectureCount = batchLectures.filter((l) => l.chapterId === folder.id).length;
                        const isInspected = inspectedEntity?.type === 'folder' && inspectedEntity.id === folder.id;

                        return (
                          <div
                            key={folder.id}
                            onClick={() => setSelectedFolderId(folder.id)}
                            onDoubleClick={() => selectEntity({ type: 'folder', id: folder.id })}
                            className={`p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition shadow-xs flex items-center justify-between group border relative ${
                              isInspected
                                ? 'border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]/20'
                                : 'border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                                style={{ backgroundColor: folder.color ? `${folder.color}20` : '#0b57d020' }}
                              >
                                <Folder
                                  className="w-5 h-5"
                                  style={{ color: folder.color || '#0b57d0' }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition truncate">
                                  {folder.title}
                                </h4>
                                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
                                  {childCount > 0 && `${childCount} Folders • `}
                                  {lectureCount} Videos
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectEntity({ type: 'folder', id: folder.id });
                              }}
                              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] transition border-none bg-transparent cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                              title="Edit Folder Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Dense Table View for Folders */
                    <div className="rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20 shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-bold text-[11px]">
                          <tr>
                            <th className="py-2.5 px-4">Folder Name</th>
                            <th className="py-2.5 px-3">Videos</th>
                            <th className="py-2.5 px-3">Subfolders</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/10 font-medium">
                          {currentSubfolders.map((folder) => (
                            <tr
                              key={folder.id}
                              onClick={() => setSelectedFolderId(folder.id)}
                              className="hover:bg-[var(--md-sys-color-surface-container-high)]/50 cursor-pointer transition"
                            >
                              <td className="py-2.5 px-4 flex items-center space-x-2.5">
                                <Folder
                                  className="w-4 h-4"
                                  style={{ color: folder.color || '#0b57d0' }}
                                />
                                <span className="font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                  {folder.title}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {batchLectures.filter((l) => l.chapterId === folder.id).length}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {batchChapters.filter((c) => c.parentId === folder.id).length}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectEntity({ type: 'folder', id: folder.id });
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-none bg-transparent cursor-pointer"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Lectures Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1.5">
                    <Video className="w-3.5 h-3.5" />
                    <span>Lectures & Media ({currentFolderLectures.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleTriggerNewLecture}
                    className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline border-none bg-transparent cursor-pointer"
                  >
                    + Add Lecture
                  </button>
                </div>

                {currentFolderLectures.length === 0 ? (
                  <div className="p-8 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)]/30 space-y-2">
                    <Video className="w-8 h-8 mx-auto text-indigo-500 opacity-60" />
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                      No Video Lectures in this folder
                    </h4>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      Publish DRM encrypted YouTube video lectures to this curriculum node.
                    </p>
                    <button
                      type="button"
                      onClick={handleTriggerNewLecture}
                      className="mt-2 px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs hover:bg-indigo-700"
                    >
                      + Add First Lecture
                    </button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentFolderLectures.map((lec) => {
                      const isInspected = inspectedEntity?.type === 'lecture' && inspectedEntity.id === lec.id;
                      return (
                        <div
                          key={lec.id}
                          onClick={() => selectEntity({ type: 'lecture', id: lec.id })}
                          className={`rounded-2xl bg-[var(--md-sys-color-surface-container)] overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between border ${
                            isInspected
                              ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                              : 'border-transparent'
                          }`}
                        >
                          <div>
                            <div className="h-32 w-full relative bg-black overflow-hidden group">
                              <img
                                src={lec.thumbnailUrl || '/assets/default-course-banner.png'}
                                alt={lec.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/80 text-white backdrop-blur-xs">
                                {lec.durationMinutes} mins
                              </span>

                              {lec.isFreePreview && (
                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white shadow-xs">
                                  Free Preview
                                </span>
                              )}
                            </div>

                            <div className="p-3.5 space-y-1">
                              <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                                {lec.title}
                              </h4>
                              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-2">
                                {lec.description || 'Curriculum recorded session'}
                              </p>
                            </div>
                          </div>

                          <div className="p-3 pt-0 flex items-center justify-between text-[10px] text-[var(--md-sys-color-on-surface-variant)] border-t border-[var(--md-sys-color-outline-variant)]/10">
                            <span className="flex items-center space-x-1 font-semibold text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>DRM Cloaked</span>
                            </span>
                            <span className="font-bold text-indigo-600 hover:underline">
                              Inspect & Edit →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Dense Table View for Lectures */
                  <div className="rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20 shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-bold text-[11px]">
                        <tr>
                          <th className="py-2.5 px-4">Lecture Title</th>
                          <th className="py-2.5 px-3">Duration</th>
                          <th className="py-2.5 px-3">Access</th>
                          <th className="py-2.5 px-3">Milestones</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/10 font-medium">
                        {currentFolderLectures.map((lec) => (
                          <tr
                            key={lec.id}
                            onClick={() => selectEntity({ type: 'lecture', id: lec.id })}
                            className="hover:bg-[var(--md-sys-color-surface-container-high)]/50 cursor-pointer transition"
                          >
                            <td className="py-2.5 px-4 flex items-center space-x-2.5">
                              <Video className="w-4 h-4 text-indigo-500 shrink-0" />
                              <div className="min-w-0">
                                <span className="font-bold text-[var(--md-sys-color-on-surface)] truncate block max-w-sm">
                                  {lec.title}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              {lec.durationMinutes}m
                            </td>
                            <td className="py-2.5 px-3">
                              {lec.isFreePreview ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                                  Free Preview
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]">
                                  Enrolled Only
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              {lec.milestones?.length || 0}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectEntity({ type: 'lecture', id: lec.id });
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border-none bg-transparent cursor-pointer"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROSTER CANVAS */}
          {activeTab === 'roster' && (
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <span>Enrolled Student Roster ({batchEnrollments.length})</span>
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    Manage active student enrollment, add validity days, or revoke access.
                  </p>
                </div>
              </div>

              {/* Roster Table */}
              <div className="rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20 shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-bold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4">Student</th>
                      <th className="py-2.5 px-3">Contact</th>
                      <th className="py-2.5 px-3">Enrolled At</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/10 font-medium">
                    {batchEnrollments.map((enr) => (
                      <tr key={enr.id} className="hover:bg-[var(--md-sys-color-surface-container-high)]/50 transition">
                        <td className="py-2.5 px-4 font-bold text-[var(--md-sys-color-on-surface)]">
                          {enr.studentName || 'Student'}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                          {enr.studentEmail || enr.studentPhone || 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : 'Active'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                            {enr.status || 'Active'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Revoke enrollment for ${enr.studentName}?`)) {
                                revokeStudentEnrollment(enr.userId, selectedBatchId);
                                showSecurityToast(`Enrollment revoked for ${enr.studentName}`);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TESTS CANVAS */}
          {activeTab === 'tests' && (
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>Mock Tests Catalog ({batchCatalogTests.length})</span>
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    Assessments and practice papers attached directly to this batch.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {batchCatalogTests.map((t) => (
                  <div
                    key={t.testId || t.id}
                    className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] space-y-3 shadow-xs border border-transparent hover:border-amber-500/30 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                        {t.title}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600">
                        {t.difficulty}
                      </span>
                    </div>

                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
                      <p>Topic: {t.topic}</p>
                      <p>{t.questionCount} Questions • {t.timeLimitMinutes} Mins</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: BATCH SETTINGS CANVAS */}
          {activeTab === 'settings' && currentBatch && (
            <div className="max-w-3xl space-y-6">
              <div className="p-6 rounded-3xl bg-[var(--md-sys-color-surface-container)] space-y-5 shadow-xs">
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                  <span>Batch Global Configuration & Commercials</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Batch Selling Price (₹)
                    </label>
                    <input
                      type="number"
                      value={currentBatch.price}
                      onChange={(e) => updateBatch(currentBatch.id, { price: Number(e.target.value) })}
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Original Strike Price (₹)
                    </label>
                    <input
                      type="number"
                      value={currentBatch.originalPrice}
                      onChange={(e) => updateBatch(currentBatch.id, { originalPrice: Number(e.target.value) })}
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Access Validity (Days)
                    </label>
                    <input
                      type="number"
                      value={currentBatch.validityDays}
                      onChange={(e) => updateBatch(currentBatch.id, { validityDays: Number(e.target.value) })}
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Publish Status
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        updateBatch(currentBatch.id, { isPublished: !currentBatch.isPublished });
                        showSecurityToast(`Batch marked as ${!currentBatch.isPublished ? 'Published' : 'Draft'}`);
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer transition ${
                        currentBatch.isPublished
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {currentBatch.isPublished ? '● Published (Live to Students)' : '○ Draft (Hidden)'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* =======================================================================
            PANE 3: LIVE CONTEXTUAL INSPECTOR PANEL (Right 400px)
            ======================================================================= */}
        {isInspectorOpen && (
          <aside className="w-80 lg:w-96 bg-[var(--md-sys-color-surface-container)] border-l border-[var(--md-sys-color-outline-variant)]/20 flex flex-col shrink-0 overflow-y-auto scrollbar-none transition-all duration-200 z-20">
            {inspectedEntity ? (
              <InspectorContent
                entity={inspectedEntity}
                currentBatch={currentBatch}
                batchChapters={batchChapters}
                onClose={() => setIsInspectorOpen(false)}
                onAddFolder={(data) => {
                  const created = addFolder({
                    batchId: selectedBatchId,
                    title: data.title,
                    parentId: data.parentId,
                    color: data.color,
                    description: data.description,
                  });
                  showSecurityToast(`Folder "${data.title}" created.`);
                  selectEntity({ type: 'folder', id: created.id });
                }}
                onUpdateFolder={(id, data) => {
                  updateChapter(id, data);
                  showSecurityToast('Folder updated.');
                }}
                onDeleteFolder={(id) => {
                  deleteChapter(id);
                  showSecurityToast('Folder deleted.');
                  setIsInspectorOpen(false);
                }}
                onAddLecture={(data) => {
                  addLecture({
                    batchId: selectedBatchId,
                    subjectId: 'sub_general',
                    chapterId: data.chapterId,
                    title: data.title,
                    description: data.description || '',
                    durationMinutes: data.durationMinutes || 45,
                    videoSourceType: 'youtube',
                    encryptedVideoId: data.encryptedVideoId,
                    thumbnailUrl: data.thumbnailUrl || currentBatch?.thumbnailUrl || '',
                    order: batchLectures.length + 1,
                    isFreePreview: Boolean(data.isFreePreview),
                    pdfNotes: [],
                    milestones: data.milestones || [],
                  });
                  showSecurityToast(`Lecture "${data.title}" published.`);
                  setIsInspectorOpen(false);
                }}
                onUpdateLecture={(id, data) => {
                  updateLecture(id, data);
                  showSecurityToast('Lecture updated.');
                }}
                onDeleteLecture={(id) => {
                  deleteLecture(id);
                  showSecurityToast('Lecture removed.');
                  setIsInspectorOpen(false);
                }}
                onUpdateBatch={(id, data) => {
                  updateBatch(id, data);
                  showSecurityToast('Batch settings saved.');
                }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[var(--md-sys-color-on-surface-variant)] space-y-2">
                <Sliders className="w-8 h-8 opacity-40" />
                <p className="text-xs font-semibold">
                  Select any folder, lecture, or batch to inspect and edit its properties.
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};

// Helper: Mathematically prevent circular parent-child loops in folder hierarchy
const isFolderDescendantOf = (folderId: string, potentialAncestorId: string, chapters: Chapter[]): boolean => {
  if (!folderId || !potentialAncestorId) return false;
  const visited = new Set<string>();
  let curr = chapters.find((c) => c.id === folderId);
  while (curr && curr.parentId && !visited.has(curr.id)) {
    visited.add(curr.id);
    if (curr.parentId === potentialAncestorId) return true;
    curr = chapters.find((c) => c.id === curr!.parentId);
  }
  return false;
};

// =========================================================================
// INSPECTOR CONTENT COMPONENT (Deep Granular Editor)
// =========================================================================
interface InspectorContentProps {
  entity: InspectedEntity;
  currentBatch: Batch | null;
  batchChapters: Chapter[];
  onClose: () => void;
  onAddFolder: (data: { title: string; parentId?: string | null; color?: string; description?: string }) => void;
  onUpdateFolder: (id: string, data: Partial<Chapter>) => void;
  onDeleteFolder: (id: string) => void;
  onAddLecture: (data: any) => void;
  onUpdateLecture: (id: string, data: Partial<Lecture>) => void;
  onDeleteLecture: (id: string) => void;
  onUpdateBatch: (id: string, data: Partial<Batch>) => void;
}

const InspectorContent: React.FC<InspectorContentProps> = ({
  entity,
  currentBatch,
  batchChapters,
  onClose,
  onAddFolder,
  onUpdateFolder,
  onDeleteFolder,
  onAddLecture,
  onUpdateLecture,
  onDeleteLecture,
  onUpdateBatch,
}) => {
  const { lectures } = useApp();

  // Find target objects
  const targetChapter = useMemo(() => {
    return entity.type === 'folder' && entity.id ? batchChapters.find((c) => c.id === entity.id) : null;
  }, [entity, batchChapters]);

  const targetLecture = useMemo(() => {
    return entity.type === 'lecture' && entity.id ? lectures.find((l) => l.id === entity.id) : null;
  }, [entity, lectures]);

  // Form local states for Batch
  const [batchTitle, setBatchTitle] = useState('');
  const [batchCategory, setBatchCategory] = useState('');
  const [batchTagline, setBatchTagline] = useState('');
  const [batchPrice, setBatchPrice] = useState(999);
  const [batchValidity, setBatchValidity] = useState(365);

  // Form local states for Folder
  const [folderTitle, setFolderTitle] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderColor, setFolderColor] = useState('#0b57d0');
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  // Form local states for Lecture
  const [lecTitle, setLecTitle] = useState('');
  const [lecDesc, setLecDesc] = useState('');
  const [lecVideoUrl, setLecVideoUrl] = useState('');
  const [lecDuration, setLecDuration] = useState(45);
  const [lecChapterId, setLecChapterId] = useState<string>('');
  const [lecIsFreePreview, setLecIsFreePreview] = useState(false);
  const [lecMilestones, setLecMilestones] = useState<TimelineMilestone[]>([]);
  const [isAutoFetchingMeta, setIsAutoFetchingMeta] = useState(false);
  const lastFetchedYtIdRef = useRef<string | null>(null);

  const handleVideoUrlChange = async (url: string, force = false) => {
    setLecVideoUrl(url);
    const ytId = extractYouTubeVideoId(url);
    if (!ytId) {
      lastFetchedYtIdRef.current = null;
      return;
    }
    if (!force && ytId === lastFetchedYtIdRef.current && lecTitle) return;
    lastFetchedYtIdRef.current = ytId;
    setIsAutoFetchingMeta(true);
    try {
      const meta = await fetchVideoMetadata(ytId, force);
      if (meta) {
        setLecTitle(meta.title);
        if (meta.durationMinutes && meta.durationMinutes > 0) {
          setLecDuration(meta.durationMinutes);
        }
      }
    } catch (err) {
      console.warn('Auto metadata fetch error:', err);
    } finally {
      setIsAutoFetchingMeta(false);
    }
  };

  // Sync state ONLY when entity identity changes (prevents keystroke resets and reversals)
  const entityKey = `${entity.type}_${entity.id || ''}_${entity.parentId || ''}`;
  const prevEntityKeyRef = useRef<string>('');

  useEffect(() => {
    if (prevEntityKeyRef.current === entityKey) return;
    prevEntityKeyRef.current = entityKey;

    if (entity.type === 'batch' && currentBatch) {
      setBatchTitle(currentBatch.title || '');
      setBatchCategory(currentBatch.category || '');
      setBatchTagline(currentBatch.tagline || '');
      setBatchPrice(currentBatch.price || 0);
      setBatchValidity(currentBatch.validityDays || 365);
    } else if (entity.type === 'folder' && targetChapter) {
      setFolderTitle(targetChapter.title);
      setFolderDesc(targetChapter.description || '');
      setFolderColor(targetChapter.color || '#0b57d0');
      setFolderParentId(targetChapter.parentId || null);
    } else if (entity.type === 'new_folder') {
      setFolderTitle('');
      setFolderDesc('');
      setFolderColor('#0b57d0');
      setFolderParentId(entity.parentId || null);
    } else if (entity.type === 'lecture' && targetLecture) {
      setLecTitle(targetLecture.title);
      setLecDesc(targetLecture.description || '');
      const rawKey = targetLecture.encryptedVideoId
        ? deobfuscateVideoKey(targetLecture.encryptedVideoId)
        : '';
      setLecVideoUrl(rawKey.length === 11 ? `https://www.youtube.com/watch?v=${rawKey}` : rawKey);
      setLecDuration(targetLecture.durationMinutes);
      setLecChapterId(targetLecture.chapterId || '');
      setLecIsFreePreview(targetLecture.isFreePreview);
      setLecMilestones(targetLecture.milestones || []);
    } else if (entity.type === 'new_lecture') {
      lastFetchedYtIdRef.current = null;
      setLecTitle('');
      setLecDesc('');
      setLecVideoUrl('');
      setLecDuration(45);
      setLecChapterId(entity.parentId || (batchChapters[0]?.id || ''));
      setLecIsFreePreview(false);
      setLecMilestones([]);
    }
  }, [entityKey, entity.type, currentBatch, targetChapter, targetLecture, batchChapters]);

  return (
    <div className="flex flex-col h-full">
      {/* Inspector Header */}
      <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
            {entity.type.replace('_', ' ')}
          </span>
          <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate max-w-[170px]">
            {targetChapter?.title || targetLecture?.title || currentBatch?.title || 'Inspector'}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition border-none bg-transparent cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector Form Body */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {/* FOLDER INSPECTOR */}
        {(entity.type === 'folder' || entity.type === 'new_folder') && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Folder Name *
              </label>
              <input
                type="text"
                required
                value={folderTitle}
                onChange={(e) => setFolderTitle(e.target.value)}
                placeholder="e.g. Chapter 01: Kinematics"
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-bold"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Parent Folder
              </label>
              <select
                value={folderParentId || ''}
                onChange={(e) => setFolderParentId(e.target.value || null)}
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none cursor-pointer"
              >
                <option value="">Root Level of Batch</option>
                {batchChapters
                  .filter((c) => c.id !== entity.id && !isFolderDescendantOf(c.id, entity.id || '', batchChapters))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1.5">
                Accent Theme Color
              </label>
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                {ACCENT_COLORS.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => setFolderColor(col.hex)}
                    style={{ backgroundColor: col.hex }}
                    className={`w-6 h-6 rounded-full border-2 transition cursor-pointer ${
                      folderColor === col.hex ? 'border-white ring-2 ring-blue-500 scale-110' : 'border-transparent'
                    }`}
                    title={col.name}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Folder Scope / Summary
              </label>
              <textarea
                rows={3}
                value={folderDesc}
                onChange={(e) => setFolderDesc(e.target.value)}
                placeholder="Brief summary of lectures, notes and tests inside this folder..."
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none resize-none"
              />
            </div>

            <div className="pt-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (!folderTitle.trim()) return;
                  if (entity.type === 'new_folder') {
                    onAddFolder({
                      title: folderTitle.trim(),
                      parentId: folderParentId,
                      color: folderColor,
                      description: folderDesc.trim(),
                    });
                  } else if (entity.id) {
                    onUpdateFolder(entity.id, {
                      title: folderTitle.trim(),
                      parentId: folderParentId,
                      color: folderColor,
                      description: folderDesc.trim(),
                    });
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#0b57d0] text-white font-bold text-xs shadow-xs hover:opacity-90 border-none cursor-pointer"
              >
                {entity.type === 'new_folder' ? 'Create Folder' : 'Save Changes'}
              </button>

              {entity.type === 'folder' && entity.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this folder and its nested items?')) {
                      onDeleteFolder(entity.id!);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition border-none cursor-pointer"
                  title="Delete Folder"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* LECTURE INSPECTOR */}
        {(entity.type === 'lecture' || entity.type === 'new_lecture') && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Lecture Title *
              </label>
              <input
                type="text"
                required
                value={lecTitle}
                onChange={(e) => setLecTitle(e.target.value)}
                placeholder="e.g. Masterclass 01: Standard Limits"
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-bold"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-between mb-1">
                <span>YouTube URL (Auto-Cloaked) *</span>
                {isAutoFetchingMeta && (
                  <span className="text-[10px] text-indigo-500 font-semibold flex items-center gap-1.5 animate-pulse">
                    <M3CircularProgress size={12} fourColor={true} />
                    <span>Auto-generating title & timing...</span>
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={lecVideoUrl}
                  onChange={(e) => handleVideoUrlChange(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted) {
                      handleVideoUrlChange(pasted, true);
                    }
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full pr-8 p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-mono text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
                {extractYouTubeVideoId(lecVideoUrl) && (
                  <button
                    type="button"
                    onClick={() => handleVideoUrlChange(lecVideoUrl, true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-indigo-600 border-none bg-transparent cursor-pointer rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)]"
                    title="Auto-fetch Title & Duration from YouTube"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAutoFetchingMeta ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center space-x-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Zero-bandwidth streaming: Protected by Elevate DRM Curtain</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Duration (Mins)
                </label>
                <input
                  type="number"
                  value={lecDuration}
                  onChange={(e) => setLecDuration(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Chapter Folder
                </label>
                <select
                  value={lecChapterId}
                  onChange={(e) => setLecChapterId(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none cursor-pointer"
                >
                  <option value="">Root Level of Batch (Unassigned)</option>
                  {batchChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Free Preview Toggle */}
            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block">
                  Free Preview Demo
                </span>
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  Allow non-enrolled guests to watch this video
                </span>
              </div>
              <M3Switch
                checked={lecIsFreePreview}
                onChange={setLecIsFreePreview}
                aria-label="Free Preview Demo"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Lecture Notes & Concepts Description
              </label>
              <textarea
                rows={3}
                value={lecDesc}
                onChange={(e) => setLecDesc(e.target.value)}
                placeholder="Comprehensive notes and conceptual curriculum summary..."
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none resize-none"
              />
            </div>

            {/* Save Actions */}
            <div className="pt-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (!lecTitle.trim() || !lecVideoUrl.trim()) return;
                  const ytId = extractYouTubeId(lecVideoUrl.trim()) || 'WUvTyaaNkzM';
                  const encKey = obfuscateVideoKey(ytId);

                  if (entity.type === 'new_lecture') {
                    onAddLecture({
                      title: lecTitle.trim(),
                      description: lecDesc.trim(),
                      encryptedVideoId: encKey,
                      durationMinutes: lecDuration || 45,
                      chapterId: lecChapterId,
                      isFreePreview: lecIsFreePreview,
                      milestones: lecMilestones,
                    });
                  } else if (entity.id) {
                    onUpdateLecture(entity.id, {
                      title: lecTitle.trim(),
                      description: lecDesc.trim(),
                      encryptedVideoId: encKey,
                      durationMinutes: lecDuration || 45,
                      chapterId: lecChapterId,
                      isFreePreview: lecIsFreePreview,
                      milestones: lecMilestones,
                    });
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs border-none cursor-pointer"
              >
                {entity.type === 'new_lecture' ? 'Publish Lecture' : 'Save Lecture'}
              </button>

              {entity.type === 'lecture' && entity.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this lecture?')) {
                      onDeleteLecture(entity.id!);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition border-none cursor-pointer"
                  title="Delete Lecture"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* BATCH INSPECTOR */}
        {entity.type === 'batch' && currentBatch && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Batch Title *
              </label>
              <input
                type="text"
                value={batchTitle}
                onChange={(e) => setBatchTitle(e.target.value)}
                placeholder="e.g. Master JEE Advance 2026"
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-1 focus:ring-[#0b57d0]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Category
              </label>
              <input
                type="text"
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
                placeholder="e.g. Mathematics, JEE, Foundation"
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-1 focus:ring-[#0b57d0]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Tagline / Subheading
              </label>
              <textarea
                rows={2}
                value={batchTagline}
                onChange={(e) => setBatchTagline(e.target.value)}
                placeholder="Brief high-impact tagline for batch card..."
                className="w-full p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none resize-none focus:ring-1 focus:ring-[#0b57d0]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Price (₹)
                </label>
                <input
                  type="number"
                  value={batchPrice}
                  onChange={(e) => setBatchPrice(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-1 focus:ring-[#0b57d0]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Validity (Days)
                </label>
                <input
                  type="number"
                  value={batchValidity}
                  onChange={(e) => setBatchValidity(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-1 focus:ring-[#0b57d0]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!batchTitle.trim()) {
                    alert('Please enter a valid Batch Title.');
                    return;
                  }
                  onUpdateBatch(currentBatch.id, {
                    title: batchTitle.trim(),
                    category: batchCategory.trim(),
                    tagline: batchTagline.trim(),
                    price: Number(batchPrice) || 0,
                    validityDays: Number(batchValidity) || 365,
                  });
                }}
                className="w-full py-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#0b57d0]/90 text-white font-bold text-xs shadow-xs transition border-none cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Save Batch Details</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
