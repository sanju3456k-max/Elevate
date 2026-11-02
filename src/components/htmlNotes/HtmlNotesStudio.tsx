import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  type HtmlNotesStudioProps, 
  type ViewMode, 
  type ViewportMode,
  type HtmlProject,
  type HtmlNoteItem
} from './types';
import { Minimize2, FileCode } from 'lucide-react';
import { STUDIO_CSS_STYLES } from './constants/studioStyles';
import { prepareIframeHtml, preparePrintHtml } from './utils/iframeGenerator';
import { mergeUpdatedBodyIntoFullDocument } from './utils/documentReconstructor';
import { useSplitResizer } from './hooks/useSplitResizer';
import { usePreviewZoom } from './hooks/usePreviewZoom';
import { useBackHandler } from '../../hooks/useBackNavigation';

import { useHtmlProjects } from './hooks/useHtmlProjects';
import { useHtmlNotesCloudSync } from './hooks/useHtmlNotesCloudSync';
import { useHtmlNotesSearch } from './hooks/useHtmlNotesSearch';
import { usePreviewEditorMapping } from './hooks/usePreviewEditorMapping';

import { HtmlNotesHomeView } from './components/HtmlNotesHomeView';
import { HtmlNotesHeader } from './components/HtmlNotesHeader';
import { HtmlNotesSidebar } from './components/HtmlNotesSidebar';
import { HtmlNotesWorkspace } from './components/HtmlNotesWorkspace';
import { HtmlNotesModals } from './components/HtmlNotesModals';
import { HtmlNotesVersionModal } from './components/HtmlNotesVersionModal';
import { HtmlNotesMathEditorModal } from './components/HtmlNotesMathEditorModal';
import { HtmlNotesZoomControls } from './components/HtmlNotesZoomControls';
import { HtmlNotesImageModal } from './components/HtmlNotesImageModal';
import { HtmlNotesAiPanel } from './components/HtmlNotesAiPanel';
import { replaceSelectedSnippet } from './components/ai/aiSelectionRefiner';
import { getFileVersionHistory } from './utils/versionHistory';
import type { HtmlNotesPreviewPaneHandle } from './components/HtmlNotesPreviewPane';
import { ensureStableBlockIds } from './utils/docStructureMap';
import { compressImageForDocument } from './utils/imageCompressor';
import { HtmlNotesPenToolbar, type PenToolType } from './components/HtmlNotesPenToolbar';
import { HtmlNotesErrorBoundary } from './components/HtmlNotesErrorBoundary';

export const HtmlNotesStudio: React.FC<HtmlNotesStudioProps> = ({
  onBack,
  isDarkMode: initialDarkMode = false,
  toggleTheme: parentToggleTheme,
  activeStudioMode,
  onSwitchStudioMode,
  onRegisterActions,
  onViewChange,
  searchQuery,
  onClearSearch,
}) => {
  // Navigation View State
  const [studioView, setStudioView] = useState<'home' | 'editor'>('home');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [isEditorWordWrap, setIsEditorWordWrap] = useState<boolean>(true);
  const [a4Pages, setA4Pages] = useState<number>(1);

  // Full Screen Preview State
  const [isFullScreenPreview, setIsFullScreenPreview] = useState<boolean>(false);
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  const handleToggleFullScreenPreview = useCallback(() => {
    setIsFullScreenPreview((prev) => {
      const next = !prev;
      if (next) {
        prevViewModeRef.current = viewMode;
        setViewMode('preview');
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (e) {}
      } else {
        if (prevViewModeRef.current) {
          setViewMode(prevViewModeRef.current);
        }
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        } catch (e) {}
      }
      return next;
    });
  }, [viewMode]);

  // Sync Escape key & fullscreenchange event
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullScreenPreview) {
        setIsFullScreenPreview(false);
        if (prevViewModeRef.current) {
          setViewMode(prevViewModeRef.current);
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isFullScreenPreview]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreenPreview) {
        e.preventDefault();
        handleToggleFullScreenPreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenPreview, handleToggleFullScreenPreview]);


  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof initialDarkMode === 'boolean') {
      return initialDarkMode;
    }
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  // Inject STUDIO_CSS_STYLES once as a singleton in document.head to prevent CSSOM re-parsing on every render
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const STYLE_ID = 'notes-studio-singleton-styles';
    let styleTag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = STYLE_ID;
      styleTag.textContent = STUDIO_CSS_STYLES;
      document.head.appendChild(styleTag);
    }
  }, []);

  // Always synchronize isDark with app dark mode prop
  useEffect(() => {
    setIsDark(Boolean(initialDarkMode));
  }, [initialDarkMode]);

  // Synchronize isDark when document theme class mutations or theme-changed events fire
  useEffect(() => {
    const syncThemeFromDom = () => {
      if (typeof document !== 'undefined') {
        const isDocDark = document.documentElement.classList.contains('dark');
        setIsDark((prev) => (prev !== isDocDark ? isDocDark : prev));
      }
    };

    window.addEventListener('theme-changed', syncThemeFromDom);

    let observer: MutationObserver | null = null;
    if (typeof document !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(() => {
        syncThemeFromDom();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    return () => {
      window.removeEventListener('theme-changed', syncThemeFromDom);
      if (observer) observer.disconnect();
    };
  }, []);

  // Guard against narrow screen split view collapse
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 768 && viewMode === 'split') {
        setViewMode('preview');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode, setViewMode]);

  // Synchronize status bar theme-color for PWA web app in both light (#ffffff in editor / #e5e9f0 in home) and dark (#0b0c10) modes
  useEffect(() => {
    const updateThemeColor = () => {
      try {
        const isDocDark = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : isDark;
        const targetHeaderColor = isDocDark ? '#0b0c10' : (studioView === 'editor' ? '#ffffff' : '#e5e9f0');
        const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
        if (metaThemeColors.length > 0) {
          metaThemeColors.forEach((el) => {
            el.removeAttribute('media');
            el.setAttribute('content', targetHeaderColor);
          });
        } else {
          const newMeta = document.createElement('meta');
          newMeta.name = 'theme-color';
          newMeta.content = targetHeaderColor;
          document.head.appendChild(newMeta);
        }
        const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (appleStatusBar) {
          appleStatusBar.setAttribute('content', isDocDark ? 'black-translucent' : 'default');
        }
      } catch {
        // Ignore
      }
    };

    updateThemeColor();

    window.addEventListener('theme-changed', updateThemeColor);
    let observer: MutationObserver | null = null;
    if (typeof document !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(updateThemeColor);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      window.removeEventListener('theme-changed', updateThemeColor);
      if (observer) observer.disconnect();
    };
  }, [isDark, studioView, viewMode]);

  // Sidebar & AI Assistant State
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [targetPointerIndex, setTargetPointerIndex] = useState<number | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState<boolean>(false);
  const [isMathModalOpen, setIsMathModalOpen] = useState<boolean>(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState<boolean>(false);
  const [fileSummaries, setFileSummaries] = useState<Record<string, string>>({});
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'outline' | 'margins'>('files');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Mobile More Sheet & Printing State
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // DOM Refs
  const workspaceRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullScreenIframeRef = useRef<HTMLIFrameElement>(null);
  const previewPaneRef = useRef<HtmlNotesPreviewPaneHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const showDriveToastRef = useRef<((msg: string) => void) | null>(null);

  // Hook 1: Projects & Files Engine
  const {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    activeFileId,
    setActiveFileId,
    expandedProjects,
    toggleExpandProject,
    code,
    setCode,
    title,
    setTitle,
    hasUnsavedChanges,
    savedSuccess,
    historyStack,
    historyIndex,
    canUndo,
    canRedo,
    updateCodeWithHistory,
    handleUndo,
    handleRedo,
    handleSaveCurrentFile,
    checkAndSaveBeforeAction,
    handleOpenProject,
    handleOpenFile,
    handleCreateNewProject,
    handleAddFileToProject,
    handleCreateFileFromAi,
    handleUpdateFileFromAi,
    handleDeleteFile,
    handleExecuteDeleteFile,
    handleDeleteProject,
    handleExecuteDeleteProject,
    renamingProjectId,
    setRenamingProjectId,
    renamingProjectName,
    setRenamingProjectName,
    handleCommitRenameProject,
    renamingFileId,
    setRenamingFileId,
    renamingFileTitle,
    setRenamingFileTitle,
    handleStartRenameFile,
    handleCommitRenameFile,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    deleteTarget,
    setDeleteTarget,
    handleImportFile,
    handleImportDroppedFile,
    handleReorderFiles,
    handleExportHtml,
    handleExportFullProject
  } = useHtmlProjects({
    onSetStudioView: setStudioView,
    viewMode,
    setViewMode,
    onShowDriveToast: (msg) => showDriveToastRef.current?.(msg)
  });

  const activeProject = useMemo(() => {
    if (!projects || projects.length === 0) return undefined;
    return projects.find(p => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  const activeProjectFiles = useMemo(() => {
    if (!activeProject || !Array.isArray(activeProject.files)) return [];
    return activeProject.files;
  }, [activeProject]);

  const activeFile = useMemo(() => {
    if (!activeProjectFiles || activeProjectFiles.length === 0) return null;
    return activeProjectFiles.find((f) => f.id === activeFileId) || activeProjectFiles[0] || null;
  }, [activeProjectFiles, activeFileId]);

  // Background Semantic Summarization: only runs when AI Assistant panel is opened
  useEffect(() => {
    if (!isAiAssistantOpen || !activeProjectFiles || activeProjectFiles.length === 0) return;

    const generateSummaries = async () => {
      const newSummaries = { ...fileSummaries };
      let changed = false;

      for (const file of activeProjectFiles) {
        if (!newSummaries[file.id] && file.code && file.code.length > 50) {
          try {
            const res = await fetch('/api/ai/summarize-note', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: file.title, code: file.code })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.summary) {
                newSummaries[file.id] = data.summary;
                changed = true;
              }
            }
          } catch (e) {
            console.warn(`Failed to summarize file ${file.id}:`, e);
          }
        }
      }

      if (changed) {
        setFileSummaries(newSummaries);
      }
    };

    // Delay a bit to avoid hammer during rapid switching
    const timer = setTimeout(generateSummaries, 1500);
    return () => clearTimeout(timer);
  }, [isAiAssistantOpen, activeProjectFiles]);

  // Custom Margins (Defaults: 3mm side margins for mobile UI for maximum view, 8mm for desktop)
  const [sideMarginMm, setSideMarginMm] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 3;
    }
    return 8;
  });
  const [verticalMarginMm, setVerticalMarginMm] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 6;
    }
    return 8;
  });
  const [leftBindingGutterMm, setLeftBindingGutterMm] = useState<number>(0);
  const [fontSizePx, setFontSizePx] = useState<number>(14);
  const totalLeftMarginMm = sideMarginMm + leftBindingGutterMm;

  // Hook 2: Google Drive & Cloud Sync Engine
  const {
    isDriveAuth,
    driveSyncStatus,
    driveToastMessage,
    showDriveToast,
    handleConnectDrive,
    handleTriggerDriveSync,
    handleExportNoteToDrive,
    handleDeduplicateDrive
  } = useHtmlNotesCloudSync({
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    activeFileId,
    setActiveFileId,
    setTitle,
    setCode,
    code,
    studioView,
    setStudioView
  });

  showDriveToastRef.current = showDriveToast;

  // Hook 3: Selection Mapping & Cross-Highlighter
  const {
    isSelectRefiningModeEnabled,
    toggleSelectRefiningMode,
    activeSelectionPane,
    selectedTextForAi,
    setSelectedTextForAi,
    highlightedLineIdx,
    setHighlightedLineIdx,
    highlightedLineRange,
    highlightedCharRange,
    isBlinking,
    setIsBlinking,
    blinkTimeoutRef,
    handlePreviewTextSelected,
    handleEditorTextSelected,
    handleRefineSelection
  } = usePreviewEditorMapping({
    code,
    textareaRef,
    onOpenAiAssistant: () => setIsAiAssistantOpen(true)
  });

  // Hook 4: Headings Outline & In-Page Search
  const {
    isEditorSearchOpen,
    setIsEditorSearchOpen,
    editorSearchTerm,
    setEditorSearchTerm,
    editorMatches,
    currentMatchIdx,
    searchInputRef,
    handleEditorSearch,
    handleNextSearchMatch,
    handlePrevSearchMatch,
    isPreviewSearchOpen,
    setIsPreviewSearchOpen,
    previewSearchTerm,
    setPreviewSearchTerm,
    previewMatchCount,
    setPreviewMatchCount,
    currentPreviewMatchIdx,
    previewSearchInputRef,
    handlePreviewSearch,
    handleNextPreviewMatch,
    handlePrevPreviewMatch,
    clearPreviewHighlights,
    headingsList,
    handleJumpToHeading,
    activeHeadingText,
    activeHeadingId,
    activePage
  } = useHtmlNotesSearch({
    code,
    textareaRef,
    iframeRef,
    fullScreenIframeRef,
    previewPaneRef,
    setHighlightedLineIdx,
    setIsBlinking,
    blinkTimeoutRef,
    viewMode
  });

  // Hook 5 & 6: Split Resizer & Preview Zoom
  const {
    splitRatio,
    isResizing,
    isResizingRef,
    splitContainerRef,
    handleStartResize
  } = useSplitResizer();

  const {
    zoomLevel,
    setZoomLevel,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    applyIframeZoom
  } = usePreviewZoom({
    viewportMode,
    viewMode,
    isSidebarOpen,
    splitRatio,
    isResizingRef,
    iframeRef,
    fullScreenIframeRef,
    setFontSizePx
  });



  // Sync studio view changes with parent Notes Studio
  useEffect(() => {
    onViewChange?.(studioView);
  }, [studioView, onViewChange]);

  // Back button navigation: in editor mode, back goes to home view
  useBackHandler({
    isOpen: studioView === 'editor',
    onBack: () => {
      checkAndSaveBeforeAction();
      setStudioView('home');
      onViewChange?.('home');
    },
    priority: 35,
    id: 'html_notes_editor_back',
  });

  // Register parent top action handlers (Create Project, Import, Add File)
  useEffect(() => {
    if (onRegisterActions) {
      onRegisterActions({
        onCreateNewProject: handleCreateNewProject,
        onImportClick: () => fileInputRef.current?.click(),
        onAddFileToProject: handleAddFileToProject,
        onImportDroppedFile: handleImportDroppedFile,
      });
    }
  }, [onRegisterActions, handleCreateNewProject, handleAddFileToProject, handleImportDroppedFile]);

  const isSelfGeneratedIframeUpdateRef = useRef<boolean>(false);
  const cachedIframeSrcDocRef = useRef<string>('');
  const codeRef = useRef<string>(code);
  codeRef.current = code;

  const isUndoingRedoingRef = useRef<boolean>(false);
  const undoLockTimerRef = useRef<any>(null);

  const handleStudioUndo = useCallback(() => {
    if (!canUndo) return;
    if (undoLockTimerRef.current) clearTimeout(undoLockTimerRef.current);
    isUndoingRedoingRef.current = true;
    isSelfGeneratedIframeUpdateRef.current = false;
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'STUDIO_RESET_DIRTY' }, '*');
    } catch (e) {}
    handleUndo();
    undoLockTimerRef.current = setTimeout(() => {
      isUndoingRedoingRef.current = false;
      undoLockTimerRef.current = null;
    }, 1000);
  }, [handleUndo, canUndo]);

  const handleStudioRedo = useCallback(() => {
    if (!canRedo) return;
    if (undoLockTimerRef.current) clearTimeout(undoLockTimerRef.current);
    isUndoingRedoingRef.current = true;
    isSelfGeneratedIframeUpdateRef.current = false;
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'STUDIO_RESET_DIRTY' }, '*');
    } catch (e) {}
    handleRedo();
    undoLockTimerRef.current = setTimeout(() => {
      isUndoingRedoingRef.current = false;
      undoLockTimerRef.current = null;
    }, 1000);
  }, [handleRedo, canRedo]);



  // Reset live edit mode to OFF whenever active file or project changes
  useEffect(() => {
  }, [activeFileId, activeProjectId]);

  // Scroll textarea & sync line numbers
  const handleScrollTextarea = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Add sample heading
  const handleAddSampleHeading = useCallback(() => {
    const sampleHeading = `\n<section>\n  <h2>Section: Key Points</h2>\n  <p>Revision notes here...</p>\n</section>\n`;
    updateCodeWithHistory(code + sampleHeading);
  }, [code, updateCodeWithHistory]);

  // Toggle theme globally
  const toggleTheme = useCallback(() => {
    if (parentToggleTheme) {
      parentToggleTheme();
    } else if (typeof document !== 'undefined') {
      const isDocDark = document.documentElement.classList.contains('dark');
      const nextDark = !isDocDark;
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('math_mock_theme_v1', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('math_mock_theme_v1', 'light');
      }
      setIsDark(nextDark);
      window.dispatchEvent(new Event('theme-changed'));
    }
  }, [parentToggleTheme]);

  // Trigger Image Upload / Modal
  const handleTriggerInsertImage = useCallback(() => {
    setIsImageModalOpen(true);
  }, []);

  // Shared Image Insert Handler (device upload, web url, stock images, clipboard paste, drag and drop)
  const handleInsertImageSnippet = useCallback(async (
    dataUrl: string,
    fileName?: string,
    caption?: string,
    align: 'center' | 'left' | 'right' | 'full' = 'center'
  ) => {
    const cleanFileName = fileName || 'Note Image';
    const displayCaption = (caption && caption.trim()) ? caption.trim() : '';

    // Compress image to lightweight WebP/JPEG format to prevent storage quota overflow and ensure atomic persistence
    const compressedDataUrl = await compressImageForDocument(dataUrl);

    let alignStyle = 'margin: 1.5rem auto; text-align: center;';
    let imgStyle = 'width: 420px; max-width: 100%; height: auto; border-radius: 8px; display: inline-block;';

    if (align === 'left') {
      alignStyle = 'margin: 1rem 1.5rem 1rem 0; float: left; text-align: left; max-width: 50%;';
      imgStyle = 'width: 100%; height: auto; border-radius: 8px; display: block;';
    } else if (align === 'right') {
      alignStyle = 'margin: 1rem 0 1rem 1.5rem; float: right; text-align: right; max-width: 50%;';
      imgStyle = 'width: 100%; height: auto; border-radius: 8px; display: block;';
    } else if (align === 'full') {
      alignStyle = 'margin: 1.5rem 0; text-align: center; width: 100%;';
      imgStyle = 'width: 100%; height: auto; border-radius: 8px; display: block;';
    }

    const captionTag = displayCaption.trim()
      ? `\n  <figcaption style="font-size: 0.85rem; color: #64748b; margin-top: 0.4rem;">${displayCaption.trim()}</figcaption>`
      : '';

    const snippet = `\n<figure style="${alignStyle}">\n  <img src="${compressedDataUrl}" alt="${cleanFileName}" style="${imgStyle}" />${captionTag}\n</figure>\n`;

    // 1. If in Editor mode with active textarea caret, insert directly at selection
    if (viewMode === 'editor' && textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      const newCode = code.substring(0, start) + snippet + code.substring(end);
      updateCodeWithHistory(newCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + snippet.length;
          textareaRef.current.selectionEnd = start + snippet.length;
          textareaRef.current.focus();
        }
      }, 50);
      return;
    }

    // 2. In Preview or Split mode, delegate directly to preview canvas engine
    if (previewPaneRef.current) {
      const alignMode: 'left' | 'right' | 'center' | 'full' = align === 'left' ? 'left' : (align === 'full' ? 'full' : (align === 'right' ? 'right' : 'center'));
      previewPaneRef.current.insertImage(compressedDataUrl, cleanFileName, alignMode);
      return;
    }

    // 3. Fallback when iframe is unmounted: append snippet to note code
    let newCode = code;
    const headerEndMatch = newCode.match(/(<\/header>|<section[^>]*>|<p[^>]*>.*?<\/p>|<div[^>]*class=["'][^"']*(panel|dropdown-box)[^"']*["'][^>]*>)/i);
    if (headerEndMatch && headerEndMatch.index !== undefined) {
      const insertIdx = headerEndMatch.index + headerEndMatch[0].length;
      newCode = newCode.substring(0, insertIdx) + '\n' + snippet + newCode.substring(insertIdx);
    } else if (newCode.includes('</body>')) {
      const bodyEndIdx = newCode.lastIndexOf('</body>');
      newCode = newCode.substring(0, bodyEndIdx) + snippet + '\n' + newCode.substring(bodyEndIdx);
    } else {
      newCode = newCode + '\n' + snippet;
    }
    updateCodeWithHistory(newCode);
  }, [viewMode, code, updateCodeWithHistory]);

  // Visual Canvas Edit Mode state (Google Docs live preview inline editing)
  const [isVisualEditActive, setIsVisualEditActive] = useState<boolean>(false);
  const isVisualEditActiveRef = useRef<boolean>(false);
  useEffect(() => {
    isVisualEditActiveRef.current = isVisualEditActive;
  }, [isVisualEditActive]);

  // Synchronously extracts live in-memory HTML from the preview iframe and merges into React state & project file
  // Called strictly on explicit user Save, file tab switch, project switch, or when finishing Edit Mode
  const flushPreviewIframeChanges = useCallback(() => {
    try {
      const targets = [iframeRef.current, fullScreenIframeRef.current];
      for (const targetIframe of targets) {
        if (!targetIframe?.contentWindow) continue;
        const win = targetIframe.contentWindow as any;
        const liveClean = typeof win.getCleanDocumentHtml === 'function'
          ? win.getCleanDocumentHtml()
          : (typeof win.getCleanHtml === 'function' ? win.getCleanHtml(false) : null);
        if (liveClean && typeof liveClean === 'string') {
          const currentCode = codeRef.current || code;
          const merged = mergeUpdatedBodyIntoFullDocument(currentCode, liveClean);
          if (merged && merged !== currentCode) {
            isSelfGeneratedIframeUpdateRef.current = true;
            updateCodeWithHistory(merged);
          }
        }
        try {
          win.postMessage({ type: 'STUDIO_RESET_DIRTY' }, '*');
        } catch (_) {}
      }
    } catch (err) {}
  }, [code, updateCodeWithHistory]);

  const handleSaveCurrentFileWithFlush = useCallback(() => {
    if (isVisualEditActiveRef.current || isPenModeActiveRef.current) {
      flushPreviewIframeChanges();
    }
    handleSaveCurrentFile();
  }, [flushPreviewIframeChanges, handleSaveCurrentFile]);

  // Stylus Pen & Highlighter Engine State (Completely Independent from Edit Mode)
  const [isPenModeActive, setIsPenModeActive] = useState<boolean>(false);
  const isPenModeActiveRef = useRef<boolean>(false);
  useEffect(() => {
    isPenModeActiveRef.current = isPenModeActive;
  }, [isPenModeActive]);

  const [penTool, setPenTool] = useState<PenToolType>('pen');
  const [penColor, setPenColor] = useState<string>('#2563eb');
  const [penWidth, setPenWidth] = useState<number>(2.5);

  const penToolRef = useRef<PenToolType>(penTool);
  penToolRef.current = penTool;
  const penColorRef = useRef<string>(penColor);
  penColorRef.current = penColor;
  const penWidthRef = useRef<number>(penWidth);
  penWidthRef.current = penWidth;

  const broadcastPenState = useCallback((active: boolean, tool?: PenToolType, color?: string, width?: number) => {
    const currentT = tool !== undefined ? tool : penToolRef.current;
    const currentC = color !== undefined ? color : penColorRef.current;
    const currentW = width !== undefined ? width : penWidthRef.current;

    const targets = [iframeRef.current, fullScreenIframeRef.current];
    targets.forEach((targetIframe) => {
      if (targetIframe?.contentWindow) {
        try {
          const win = targetIframe.contentWindow as any;
          if (typeof win.applyPenModeState === 'function') {
            win.applyPenModeState(active, currentT, currentC, currentW);
          }
          win.postMessage({
            type: 'SET_PEN_MODE',
            active,
            tool: currentT,
            color: currentC,
            width: currentW
          }, '*');
        } catch (e) {}
      }
    });
  }, []);

  const handleSetViewModeWithFlush = useCallback((nextMode: ViewMode) => {
    if (isVisualEditActiveRef.current || isPenModeActiveRef.current) {
      flushPreviewIframeChanges();
    }
    setViewMode(nextMode);

    // If pen mode is currently on and moving between preview/split, keep pen mode active in the new view
    if (isPenModeActiveRef.current) {
      if (nextMode === 'preview' || nextMode === 'split') {
        setTimeout(() => {
          broadcastPenState(true);
        }, 60);
      } else {
        setIsPenModeActive(false);
        isPenModeActiveRef.current = false;
        broadcastPenState(false);
      }
    }
  }, [flushPreviewIframeChanges, broadcastPenState]);

  // Track active project and file changes
  const prevProjectFileRef = useRef<{ projectId: string; fileId: string }>({
    projectId: activeProjectId,
    fileId: activeFileId
  });

  // ONLY when the active project or file changes (user opens a different note), guarantee Edit Mode and Pen Mode start in OFF state
  useEffect(() => {
    const isDifferent =
      prevProjectFileRef.current.projectId !== activeProjectId ||
      prevProjectFileRef.current.fileId !== activeFileId;

    if (isDifferent) {
      prevProjectFileRef.current = { projectId: activeProjectId, fileId: activeFileId };
      setIsVisualEditActive(false);
      isVisualEditActiveRef.current = false;
      setIsPenModeActive(false);
      isPenModeActiveRef.current = false;
      broadcastPenState(false);
    }
  }, [activeProjectId, activeFileId, broadcastPenState]);

  const handleOpenFileWithFlush = useCallback((projectId: string, file: HtmlNoteItem, mode: ViewMode = 'preview') => {
    if (isVisualEditActiveRef.current || isPenModeActiveRef.current) {
      flushPreviewIframeChanges();
    }
    setIsVisualEditActive(false);
    isVisualEditActiveRef.current = false;
    setIsPenModeActive(false);
    isPenModeActiveRef.current = false;
    broadcastPenState(false);
    handleOpenFile(projectId, file, mode);
  }, [flushPreviewIframeChanges, handleOpenFile, broadcastPenState]);

  const handleOpenProjectWithFlush = useCallback((proj: HtmlProject) => {
    if (isVisualEditActiveRef.current || isPenModeActiveRef.current) {
      flushPreviewIframeChanges();
    }
    setIsVisualEditActive(false);
    isVisualEditActiveRef.current = false;
    setIsPenModeActive(false);
    isPenModeActiveRef.current = false;
    broadcastPenState(false);
    handleOpenProject(proj);
  }, [flushPreviewIframeChanges, handleOpenProject, broadcastPenState]);

  const handleToggleVisualEdit = useCallback(() => {
    setIsVisualEditActive((prev) => {
      const next = !prev;
      isVisualEditActiveRef.current = next;

      const targets = [iframeRef.current, fullScreenIframeRef.current];

      // If turning Edit Mode ON, automatically turn Pen Mode OFF so string editing and stylus don't conflict
      if (next) {
        setIsPenModeActive(false);
        targets.forEach((targetIframe) => {
          try {
            const win = targetIframe?.contentWindow as any;
            if (typeof win?.applyPenModeState === 'function') {
              win.applyPenModeState(false);
            }
            targetIframe?.contentWindow?.postMessage({
              type: 'SET_PEN_MODE',
              active: false
            }, '*');
          } catch (e) {}
        });
      } else {
        // When finishing edit mode, flush in-memory edits to the project file
        flushPreviewIframeChanges();
      }

      // Broadcast immediately to both regular preview and full-screen iframes
      targets.forEach((targetIframe) => {
        if (targetIframe?.contentWindow) {
          try {
            const win = targetIframe.contentWindow as any;
            if (typeof win.applyEditModeState === 'function') {
              win.applyEditModeState(next);
            }
            win.postMessage({
              type: 'SET_EDIT_MODE',
              active: next,
              enabled: next
            }, '*');
          } catch (e) {}
        }
      });

      return next;
    });
  }, [flushPreviewIframeChanges]);

  const handleTogglePenMode = useCallback(() => {
    setIsPenModeActive((prev) => {
      const next = !prev;

      // When activating Pen Mode, turn Edit Mode OFF immediately and flush string edits
      // This eliminates any conflicts between text cursors / contenteditable and stylus handwriting!
      if (next && isVisualEditActiveRef.current) {
        setIsVisualEditActive(false);
        isVisualEditActiveRef.current = false;
        flushPreviewIframeChanges();
        const targets = [iframeRef.current, fullScreenIframeRef.current];
        targets.forEach((targetIframe) => {
          try {
            const win = targetIframe?.contentWindow as any;
            if (typeof win?.applyEditModeState === 'function') {
              win.applyEditModeState(false);
            }
            win?.postMessage({
              type: 'SET_EDIT_MODE',
              active: false,
              enabled: false
            }, '*');
          } catch (e) {}
        });
      }

      broadcastPenState(next);
      return next;
    });
  }, [broadcastPenState, flushPreviewIframeChanges]);

  const handleSelectPenTool = useCallback((tool: PenToolType) => {
    setPenTool(tool);
    penToolRef.current = tool;
    let nextColor = penColorRef.current;
    let nextWidth = penWidthRef.current;
    if (tool === 'highlighter') {
      if (nextColor === '#1e293b' || nextColor === '#2563eb') nextColor = '#fde047';
      nextWidth = 16;
    } else if (tool === 'pen' || tool === 'fountain') {
      if (nextColor === '#fde047' || nextColor === '#38bdf8') nextColor = '#2563eb';
      nextWidth = 2.5;
    }
    setPenColor(nextColor);
    penColorRef.current = nextColor;
    setPenWidth(nextWidth);
    penWidthRef.current = nextWidth;

    // Explicitly keep pen mode on
    setIsPenModeActive(true);
    isPenModeActiveRef.current = true;
    broadcastPenState(true, tool, nextColor, nextWidth);
  }, [broadcastPenState]);

  const handleSelectPenColor = useCallback((color: string) => {
    setPenColor(color);
    penColorRef.current = color;
    setIsPenModeActive(true);
    isPenModeActiveRef.current = true;
    broadcastPenState(true, penToolRef.current, color, penWidthRef.current);
  }, [broadcastPenState]);

  const handleSelectPenWidth = useCallback((width: number) => {
    setPenWidth(width);
    penWidthRef.current = width;
    setIsPenModeActive(true);
    isPenModeActiveRef.current = true;
    broadcastPenState(true, penToolRef.current, penColorRef.current, width);
  }, [broadcastPenState]);

  const handlePenUndo = useCallback(() => {
    previewPaneRef.current?.undoPenStroke?.();
    const targets = [iframeRef.current, fullScreenIframeRef.current];
    targets.forEach((t) => t?.contentWindow?.postMessage({ type: 'PEN_UNDO' }, '*'));
  }, []);

  const handlePenRedo = useCallback(() => {
    previewPaneRef.current?.redoPenStroke?.();
    const targets = [iframeRef.current, fullScreenIframeRef.current];
    targets.forEach((t) => t?.contentWindow?.postMessage({ type: 'PEN_REDO' }, '*'));
  }, []);

  const handlePenClear = useCallback(() => {
    previewPaneRef.current?.clearAllPenStrokes?.();
    const targets = [iframeRef.current, fullScreenIframeRef.current];
    targets.forEach((t) => t?.contentWindow?.postMessage({ type: 'PEN_CLEAR' }, '*'));
  }, []);

  // Hotkey listeners (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveCurrentFileWithFlush();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!e.shiftKey) {
          e.preventDefault();
          handleStudioUndo();
        } else {
          e.preventDefault();
          handleStudioRedo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleStudioRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (viewMode === 'preview') {
          setIsPreviewSearchOpen(true);
          setTimeout(() => previewSearchInputRef.current?.focus(), 100);
        } else {
          setIsEditorSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, handleSaveCurrentFileWithFlush, handleStudioUndo, handleStudioRedo, viewMode, setIsPreviewSearchOpen, setIsEditorSearchOpen, previewSearchInputRef, searchInputRef]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedUrl = await compressImageForDocument(file);
      if (compressedUrl) {
        handleInsertImageSnippet(compressedUrl, file.name);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          handleInsertImageSnippet(base64, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Two-way synchronization: Listen for page counts, HTML updates, & image upload requests from Preview iframe
  useEffect(() => {
    const handleWindowMessage = (e: MessageEvent) => {
      if (e.data) {
        if (e.data.type === 'STUDIO_A4_PAGES_COUNT' && typeof e.data.count === 'number') {
          setA4Pages(e.data.count);
        } else if (e.data.type === 'STUDIO_TRIGGER_FILE_UPLOAD') {
          imageUploadRef.current?.click();
        } else if (e.data.type === 'STUDIO_IFRAME_READY') {
          isUndoingRedoingRef.current = false;
          if (isPenModeActiveRef.current) {
            broadcastPenState(true);
          }
        } else if (e.data.type === 'STUDIO_HTML_UPDATE' && typeof e.data.html === 'string') {
          // 1. NEVER accept updates while an undo or redo action is processing
          if (isUndoingRedoingRef.current) return;

          // 2. Accept updates when either Visual Edit Mode OR Pen Mode is enabled!
          if (!isVisualEditActiveRef.current && !isPenModeActiveRef.current) return;

          // 3. If the user is currently typing in the editor pane, do not let iframe echo overwrite the editor
          const activeEl = document.activeElement;
          const isEditorActive = Boolean(
            activeEl && (
              activeEl.tagName === 'TEXTAREA' ||
              activeEl.classList?.contains('inputarea') ||
              activeEl.closest?.('.monaco-editor') ||
              activeEl.closest?.('.studio-code-editor')
            )
          );
          if (isEditorActive) return;

          const cleanBody = e.data.html;
          const currentCode = codeRef.current || code;
          const merged = mergeUpdatedBodyIntoFullDocument(currentCode, cleanBody);
          if (merged && merged !== currentCode) {
            isSelfGeneratedIframeUpdateRef.current = true;
            updateCodeWithHistory(merged);
          }
        } else if (e.data.type === 'STUDIO_TRIGGER_UNDO') {
          handleStudioUndo();
        } else if (e.data.type === 'STUDIO_TRIGGER_REDO') {
          handleStudioRedo();
        } else if (e.data.type === 'STUDIO_OPEN_FILE' && e.data.fileId) {
          const file = activeProjectFiles.find(f => f.id === e.data.fileId);
          if (file) {
            handleOpenFileWithFlush(activeProjectId, file, viewMode);
          }
        }
      }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [activeProjectFiles, activeProjectId, handleOpenFile, viewMode, code, updateCodeWithHistory, handleStudioUndo, handleStudioRedo]);

  // Native Browser Print Trigger (Direct 1:1 WYSIWYG Printable Portal)
  const handlePrintDocument = useCallback(async () => {
    setIsPrinting(true);
    try {
      const activeFile = activeProjectFiles.find(f => f.id === activeFileId);
      const noteDocTitle = activeFile?.title || activeProject?.name || 'Document Note';

      let fullHtml = '';
      if (previewPaneRef.current?.getExactPrintDocument) {
        fullHtml = previewPaneRef.current.getExactPrintDocument(noteDocTitle);
      }

      // Fallback only if previewPaneRef is not mounted
      if (!fullHtml) {
        let currentCodeToPrint = code || '';
        const isSlideDeck = viewportMode === 'slide' || currentCodeToPrint.includes('class="slide"') || currentCodeToPrint.includes("class='slide'");
        fullHtml = preparePrintHtml({
          code: currentCodeToPrint,
          sideMarginMm,
          verticalMarginMm,
          totalLeftMarginMm,
          fontSizePx,
          isSlideMode: isSlideDeck,
          viewportMode: isSlideDeck ? 'slide' : 'a4'
        });
      }

      // Print via isolated invisible iframe to prevent main application UI from freezing, flickering, or re-laying out
      const frameId = 'studio-isolated-print-frame';
      let printFrame = document.getElementById(frameId) as HTMLIFrameElement | null;
      if (printFrame && printFrame.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }

      printFrame = document.createElement('iframe');
      printFrame.id = frameId;
      printFrame.setAttribute('aria-hidden', 'true');
      printFrame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;opacity:0;pointer-events:none;z-index:-9999;';
      document.body.appendChild(printFrame);

      const originalDocTitle = document.title;
      document.title = noteDocTitle;

      const fDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (!fDoc || !printFrame.contentWindow) {
        throw new Error('Unable to access print frame document');
      }

      fDoc.open();
      fDoc.write(fullHtml);
      fDoc.close();

      const cleanup = () => {
        document.title = originalDocTitle;
        setIsPrinting(false);
        setTimeout(() => {
          if (printFrame && printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
        }, 5000);
      };

      printFrame.contentWindow.addEventListener('afterprint', cleanup);
      window.addEventListener('afterprint', cleanup);

      // Trigger print inside the isolated iframe after allowing fonts & KaTeX to settle
      const triggerPrint = () => {
        try {
          printFrame?.contentWindow?.focus();
          printFrame?.contentWindow?.print();
        } catch (printErr) {
          console.warn('Iframe print failed, falling back to window.print:', printErr);
          window.print();
        } finally {
          setIsPrinting(false);
        }
      };

      // Wait for fonts AND all images to settle before launching print dialog
      const awaitImages = () => new Promise<void>((resolve) => {
        const frameImages = Array.from(fDoc.images);
        const pending = frameImages.filter(img => !img.complete);
        if (pending.length === 0) {
          resolve();
          return;
        }
        let done = 0;
        const check = () => {
          done++;
          if (done >= pending.length) resolve();
        };
        pending.forEach(img => {
          img.addEventListener('load', check, { once: true });
          img.addEventListener('error', check, { once: true });
        });
        setTimeout(resolve, 2000);
      });

      const awaitFonts = () => new Promise<void>((resolve) => {
        if (fDoc.fonts && typeof fDoc.fonts.ready?.then === 'function') {
          fDoc.fonts.ready.then(() => resolve()).catch(() => resolve());
          setTimeout(resolve, 1500);
        } else {
          resolve();
        }
      });

      Promise.all([awaitFonts(), awaitImages()]).then(() => {
        setTimeout(triggerPrint, 150);
      });
    } catch (err) {
      console.error('Print generation error:', err);
      setIsPrinting(false);
    }
  }, [
    code,
    viewportMode,
    sideMarginMm,
    verticalMarginMm,
    totalLeftMarginMm,
    fontSizePx,
    isVisualEditActive,
    activeProjectFiles,
    activeFileId,
    activeProject
  ]);

  // Keyboard Shortcut: Ctrl+P / Cmd+P triggers clean native print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrintDocument();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrintDocument]);

  const currentCode = code || '';
  const lineCount = useMemo(() => currentCode.split('\n').length, [currentCode]);
  const lineNumbers = useMemo(() => Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1), [lineCount]);

  const handleInsertCodeSnippetAtPointer = useCallback((snippet: string) => {
    if (!snippet) return;

    let insertedSuccessfully = false;
    const activeCode = code || '';

    // 1. Prefer targetPointerIndex if set (from context menu)
    if (typeof targetPointerIndex === 'number' && targetPointerIndex >= 0 && targetPointerIndex <= activeCode.length) {
      const before = activeCode.substring(0, targetPointerIndex);
      const after = activeCode.substring(targetPointerIndex);

      const needsPrefixNL = before && !before.endsWith('\n');
      const needsSuffixNL = after && !after.startsWith('\n');
      const formattedSnippet = `${needsPrefixNL ? '\n' : ''}${snippet}${needsSuffixNL ? '\n' : ''}`;

      const updated = before + formattedSnippet + after;
      updateCodeWithHistory(updated);
      setTargetPointerIndex(null); // Clear after use
      return;
    }

    // 2. Try Preview Pane / Canvas Caret Insertion next (if preview or split view)
    if (previewPaneRef.current) {
      try {
        previewPaneRef.current.insertSnippetAtCaret(snippet);
        insertedSuccessfully = true;
      } catch (e) {}
    }

    // 2. If in Editor mode or preview insertion didn't consume it, insert at textarea selection cursor
    if (!insertedSuccessfully && textareaRef.current) {
      const textarea = textareaRef.current;
      const isFocused = document.activeElement === textarea;
      let start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : -1;
      let end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;

      // If selection is 0, unfocused, and document is non-empty, avoid pasting at top (line 0)
      if (!isFocused && start === 0 && activeCode.trim().length > 0) {
        start = -1; // Trigger insertion before </body> or at end
      }

      if (start >= 0) {
        const before = activeCode.substring(0, start);
        const after = activeCode.substring(end);

        const needsPrefixNL = before && !before.endsWith('\n');
        const needsSuffixNL = after && !after.startsWith('\n');
        const formattedSnippet = `${needsPrefixNL ? '\n' : ''}${snippet}${needsSuffixNL ? '\n' : ''}`;

        const updated = before + formattedSnippet + after;
        updateCodeWithHistory(updated);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newPos = start + formattedSnippet.length;
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 50);

        return;
      }
    }

    // 3. Fallback: Insert before </body> tag or append at document end
    if (!insertedSuccessfully) {
      let updated = activeCode;
      if (activeCode.includes('</body>')) {
        updated = activeCode.replace('</body>', `\n${snippet}\n</body>`);
      } else {
        updated = activeCode + '\n' + snippet;
      }
      updateCodeWithHistory(updated);
    }
  }, [code, updateCodeWithHistory]);

  const handleInsertSnippetAtCharIndex = useCallback((snippet: string, charIndex?: number) => {
    if (!snippet) return;
    const activeCode = code || '';
    if (typeof charIndex === 'number' && charIndex >= 0 && charIndex <= activeCode.length) {
      const before = activeCode.substring(0, charIndex);
      const after = activeCode.substring(charIndex);
      const updated = before + snippet + after;
      updateCodeWithHistory(updated);
    } else {
      handleInsertCodeSnippetAtPointer(snippet);
    }
  }, [code, updateCodeWithHistory, handleInsertCodeSnippetAtPointer]);

  const handleInsertLatexFormula = useCallback((latexCode: string, isBlockMode: boolean) => {
    const snippet = isBlockMode ? `\n$$\n${latexCode}\n$$\n` : ` $${latexCode}$ `;
    handleInsertSnippetAtCharIndex(snippet);
  }, [handleInsertSnippetAtCharIndex]);

  const handlePromptAiTopicHere = useCallback((promptText: string, charIndex?: number) => {
    setSelectedTextForAi(promptText);
    if (typeof charIndex === 'number') {
      setTargetPointerIndex(charIndex);
    }
    setIsAiAssistantOpen(true);
  }, [setSelectedTextForAi]);

  const [isSlantLoading, setIsSlantLoading] = useState<boolean>(false);

  const handleSubmitSlantEdit = useCallback(async (promptText: string, selectedSnippet: string) => {
    if (!promptText.trim() || !selectedSnippet.trim() || isSlantLoading) return;
    setIsSlantLoading(true);

    try {
      const res = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Refine or replace the selected snippet according to this request: "${promptText}". Return ONLY the modified replacement snippet or updated HTML snippet for that selection, without markdown code fences if possible or in clean HTML. Do NOT return unrelated document parts.`,
          currentCode: code,
          currentTitle: title,
          selectedText: selectedSnippet,
          activeProjectId: activeProject?.id,
          activeFileId: activeFileId,
          activeProjectFiles: activeProjectFiles,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('AI Refine stream request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let replacement = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                replacement += parsed.text;
              }
              if (parsed.toolCall) {
                const call = parsed.toolCall;
                const toolName = (call.name || '').replace(/^default_api:/, '');
                if (toolName === 'patch_current_note' && call.args?.content) {
                  replacement = call.args.content;
                }
              }
            } catch (e) {}
          }
        }
      }

      let cleanReplacement = replacement.trim();
      if (cleanReplacement.startsWith('```html')) {
        cleanReplacement = cleanReplacement.replace(/^```html\s*/i, '').replace(/\s*```$/, '');
      } else if (cleanReplacement.startsWith('```')) {
        cleanReplacement = cleanReplacement.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
      }

      if (cleanReplacement) {
        const newCode = replaceSelectedSnippet(code, selectedSnippet, cleanReplacement);
        updateCodeWithHistory(newCode);
        showDriveToast?.('Refined selection with AI ✨');
      }
    } catch (err: any) {
      console.error('Failed to refine selection with AI:', err);
      showDriveToast?.('Failed to refine selection. Please try again.');
    } finally {
      setIsSlantLoading(false);
    }
  }, [code, title, isSlantLoading, activeProject, activeFileId, activeProjectFiles, updateCodeWithHistory, showDriveToast]);

  const prevActiveFileIdRef = useRef<string>(activeFileId);

  const iframeSrcDoc = useMemo(() => {
    // Only compute full-screen iframe srcDoc on-demand when full screen mode is active
    if (!isFullScreenPreview) {
      return '';
    }

    const activeCode = code || '';
    const generated = prepareIframeHtml({
      code: activeCode,
      sideMarginMm,
      verticalMarginMm,
      totalLeftMarginMm,
      fontSizePx,
      viewportMode,
      isDark,
      zoomLevel,
      viewMode,
      isPreviewEditMode: isVisualEditActiveRef.current
    });

    cachedIframeSrcDocRef.current = generated;
    return generated;
  }, [isFullScreenPreview, code, sideMarginMm, verticalMarginMm, totalLeftMarginMm, fontSizePx, viewportMode, isDark, zoomLevel]);

  // Memoized handlers for Header and Sidebar to keep buttons isolated from file-to-file code changes
  const handleBackToHome = useCallback(() => {
    if (isVisualEditActiveRef.current) {
      flushPreviewIframeChanges();
    }
    checkAndSaveBeforeAction();
    setStudioView('home');
    onViewChange?.('home');
  }, [flushPreviewIframeChanges, checkAndSaveBeforeAction, onViewChange]);

  const handleToggleMobileMore = useCallback(() => {
    setIsMobileMoreOpen(true);
  }, []);

  const handleToggleOutline = useCallback(() => {
    setIsSidebarOpen(true);
    setActiveSidebarTab('outline');
  }, []);

  const handleToggleSearch = useCallback(() => {
    if (viewMode === 'preview') {
      setIsPreviewSearchOpen((prev) => !prev);
    } else {
      setIsEditorSearchOpen((prev) => !prev);
    }
  }, [viewMode]);

  const handleOpenVersionHistoryModal = useCallback(() => {
    setIsVersionModalOpen(true);
  }, []);

  const handleOpenMathEditorModal = useCallback(() => {
    setIsMathModalOpen(true);
  }, []);

  const handleToggleAiAssistant = useCallback(() => {
    setIsAiAssistantOpen((prev) => !prev);
  }, []);

  const handleAddFileCurrentProject = useCallback((projId?: string) => {
    handleAddFileToProject(projId || activeProjectId);
  }, [handleAddFileToProject, activeProjectId]);

  return (
    <div className={`studio ${isDark ? 'dark' : ''} ${isResizing ? 'is-resizing' : ''} ${studioView === 'home' ? 'is-home-view' : ''}`}>

      {/* 1. OVERLEAF-STYLE HOMEPAGE */}
      {studioView === 'home' ? (
        <div key="studio-home-view" className="flex-1 flex flex-col min-h-0 overflow-hidden m3-fade-through">
          <HtmlNotesHomeView
            onBack={onBack}
            projects={projects}
            isDark={isDark}
            toggleTheme={toggleTheme}
            isDriveConnected={isDriveAuth}
            driveSyncStatus={driveSyncStatus}
            onConnectDrive={handleConnectDrive}
            onTriggerDriveSync={handleTriggerDriveSync}
            onDeduplicateDrive={handleDeduplicateDrive}
            activeNote={activeFile}
            showToast={showDriveToast}
            onOpenProject={handleOpenProjectWithFlush}
            onOpenFile={(projId, file) => handleOpenFileWithFlush(projId, file, 'preview')}
            onCreateNewProject={handleCreateNewProject}
            onImportClick={() => fileInputRef.current?.click()}
            onAddFileToProject={handleAddFileToProject}
            onDeleteProject={handleDeleteProject}
            onDeleteFile={handleDeleteFile}
            renamingProjectId={renamingProjectId}
            renamingProjectName={renamingProjectName}
            setRenamingProjectName={setRenamingProjectName}
            setRenamingProjectId={setRenamingProjectId}
            onCommitRenameProject={handleCommitRenameProject}
            expandedProjects={expandedProjects}
            toggleExpandProject={toggleExpandProject}
            onSwitchStudioMode={onSwitchStudioMode}
            activeStudioMode={activeStudioMode}
            onExportFullProject={handleExportFullProject}
            searchQuery={searchQuery}
            onClearSearch={onClearSearch}
            onImportDroppedFile={handleImportDroppedFile}
          />
        </div>
      ) : (
        /* 2. DEDICATED STUDIO EDITOR / SPLIT / PREVIEW VIEW */
        <HtmlNotesErrorBoundary onResetToHome={handleBackToHome}>
          <div key="studio-editor-view" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <HtmlNotesHeader
            onBack={handleBackToHome}
            onGoHome={handleBackToHome}
            viewMode={viewMode}
            setViewMode={handleSetViewModeWithFlush}
            viewportMode={viewportMode}
            setViewportMode={setViewportMode}
            onSaveCurrentFile={handleSaveCurrentFileWithFlush}
            savedSuccess={savedSuccess}
            hasUnsavedChanges={hasUnsavedChanges}
            onToggleMobileMore={handleToggleMobileMore}
            isDriveConnected={isDriveAuth}
            driveSyncStatus={driveSyncStatus}
            onTriggerDriveSync={handleTriggerDriveSync}
            onConnectDrive={handleConnectDrive}
            onToggleOutline={handleToggleOutline}
            headingsCount={headingsList.length}
            onUndo={handleStudioUndo}
            canUndo={canUndo}
            onRedo={handleStudioRedo}
            canRedo={canRedo}
            onToggleSearch={handleToggleSearch}
            isSearchActive={isEditorSearchOpen || isPreviewSearchOpen}
            onTriggerInsertImage={handleTriggerInsertImage}
            onOpenVersionHistory={handleOpenVersionHistoryModal}
            onOpenMathEditor={handleOpenMathEditorModal}
            isAiAssistantOpen={isAiAssistantOpen}
            onToggleAiAssistant={handleToggleAiAssistant}
            activeProject={activeProject}
            activeProjectId={activeProject?.id || activeProjectId}
            activeFileId={activeFileId}
            activeProjectFiles={activeProjectFiles}
            onOpenFile={handleOpenFileWithFlush}
            onAddFile={handleAddFileCurrentProject}
            onDeleteFile={handleDeleteFile}
            renamingFileId={renamingFileId}
            renamingFileTitle={renamingFileTitle}
            setRenamingFileTitle={setRenamingFileTitle}
            onStartRenameFile={handleStartRenameFile}
            onCommitRenameFile={handleCommitRenameFile}
            onReorderFiles={handleReorderFiles}
            onToggleFullScreenPreview={handleToggleFullScreenPreview}
            isFullScreenPreview={isFullScreenPreview}
            isVisualEditActive={isVisualEditActive}
            onToggleVisualEdit={handleToggleVisualEdit}
            isPenModeActive={isPenModeActive}
            onTogglePenMode={handleTogglePenMode}
            onPrintDocument={handlePrintDocument}
            isPrinting={isPrinting}
          />

          <main ref={workspaceRef} className="workspace relative">

            <HtmlNotesSidebar
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              activeSidebarTab={activeSidebarTab}
              setActiveSidebarTab={setActiveSidebarTab}
              searchFilter={searchFilter}
              setSearchFilter={setSearchFilter}
              projects={projects}
              activeProject={activeProject}
              activeProjectId={activeProject?.id || activeProjectId}
              activeFileId={activeFileId}
              activeProjectFiles={activeProjectFiles}
              viewMode={viewMode}
              onOpenFile={handleOpenFileWithFlush}
              onAddFileToProject={handleAddFileCurrentProject}
              onReorderFiles={handleReorderFiles}
              onDeleteFile={handleDeleteFile}
              onOpenVersionHistory={handleOpenVersionHistoryModal}
              onExportFullProject={handleExportFullProject}
              headingsList={headingsList}
              onJumpToHeading={handleJumpToHeading}
              onAddSampleHeading={handleAddSampleHeading}
              activeHeadingText={activeHeadingText}
              activeHeadingId={activeHeadingId}
              activePage={activePage}
              leftBindingGutterMm={leftBindingGutterMm}
              setLeftBindingGutterMm={setLeftBindingGutterMm}
              totalLeftMarginMm={totalLeftMarginMm}
              sideMarginMm={sideMarginMm}
              setSideMarginMm={setSideMarginMm}
              verticalMarginMm={verticalMarginMm}
              setVerticalMarginMm={setVerticalMarginMm}
              fontSizePx={fontSizePx}
              setFontSizePx={setFontSizePx}
            />

            <HtmlNotesWorkspace
              viewMode={viewMode}
              viewportMode={viewportMode}
              splitRatio={splitRatio}
              splitContainerRef={splitContainerRef}
              isResizing={isResizing}
              onStartResize={handleStartResize}
              isDark={isDark}
              lineCount={lineCount}
              isEditorWordWrap={isEditorWordWrap}
              onToggleWordWrap={() => setIsEditorWordWrap(!isEditorWordWrap)}
              isEditorSearchOpen={isEditorSearchOpen}
              editorSearchTerm={editorSearchTerm}
              editorMatches={editorMatches}
              currentMatchIdx={currentMatchIdx}
              searchInputRef={searchInputRef}
              onEditorSearchChange={handleEditorSearch}
              onPrevSearchMatch={handlePrevSearchMatch}
              onNextSearchMatch={handleNextSearchMatch}
              onCloseEditorSearch={() => {
                setIsEditorSearchOpen(false);
                setEditorSearchTerm('');
              }}
              lineNumbersRef={lineNumbersRef}
              textareaRef={textareaRef}
              code={code}
              onCodeChange={updateCodeWithHistory}
              onScrollTextarea={handleScrollTextarea}
              lineNumbers={lineNumbers}
              isBlinking={isBlinking}
              highlightedLineIdx={highlightedLineIdx}
              highlightedLineRange={highlightedLineRange}
              highlightedCharRange={highlightedCharRange}
              onInsertImageSnippet={handleInsertImageSnippet}
              activeSelectionPane={activeSelectionPane}
              isSelectRefiningModeEnabled={isSelectRefiningModeEnabled}
              onToggleSelectRefiningMode={toggleSelectRefiningMode}
              onEditorTextSelected={handleEditorTextSelected}
              onRefineSelection={handleRefineSelection}
              onPromptAiTopicHere={handlePromptAiTopicHere}
              onInsertSnippetHere={handleInsertSnippetAtCharIndex}
              onSubmitSlantEdit={handleSubmitSlantEdit}
              isSlantLoading={isSlantLoading}
              onOpenFullAiPanel={(sel) => {
                setSelectedTextForAi(sel);
                setIsAiAssistantOpen(true);
              }}
              previewPaneRef={previewPaneRef}
              iframeRef={iframeRef}
              iframeSrcDoc={iframeSrcDoc}
              zoomLevel={zoomLevel}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
              applyIframeZoom={applyIframeZoom}
              isPreviewSearchOpen={isPreviewSearchOpen}
              previewSearchTerm={previewSearchTerm}
              previewMatchCount={previewMatchCount}
              currentPreviewMatchIdx={currentPreviewMatchIdx}
              previewSearchInputRef={previewSearchInputRef}
              onPreviewSearchChange={handlePreviewSearch}
              onPrevPreviewMatch={handlePrevPreviewMatch}
              onNextPreviewMatch={handleNextPreviewMatch}
              onClosePreviewSearch={() => {
                setIsPreviewSearchOpen(false);
                setPreviewSearchTerm('');
                clearPreviewHighlights();
              }}
              sideMarginMm={sideMarginMm}
              verticalMarginMm={verticalMarginMm}
              totalLeftMarginMm={totalLeftMarginMm}
              fontSizePx={fontSizePx}
              onTriggerInsertImage={handleTriggerInsertImage}
              onPreviewTextSelected={handlePreviewTextSelected}
              onOpenMathEditor={() => setIsMathModalOpen(true)}
              title={title}
              activeNote={activeFile}
              isDriveConnected={isDriveAuth}
              onConnectDrive={handleConnectDrive}
              showToast={showDriveToast}
              isVisualEditActive={isVisualEditActive}
              onToggleVisualEdit={handleToggleVisualEdit}
              isPenModeActive={isPenModeActive}
              penTool={penTool}
              penColor={penColor}
              penWidth={penWidth}
              setViewportMode={setViewportMode}
            />

            {/* Stylus Pen & Highlighter Side Dock Toggle */}
            {isPenModeActive && (
              <HtmlNotesPenToolbar
                isOpen={isPenModeActive}
                onClose={handleTogglePenMode}
                activeTool={penTool}
                onSelectTool={handleSelectPenTool}
                currentColor={penColor}
                onSelectColor={handleSelectPenColor}
                currentWidth={penWidth}
                onSelectWidth={handleSelectPenWidth}
                onUndo={handlePenUndo}
                onRedo={handlePenRedo}
                onClearAll={handlePenClear}
              />
            )}
          </main>
        </div>
      </HtmlNotesErrorBoundary>
    )}

      {/* MODALS & OVERLAYS */}
      <HtmlNotesModals
        isMobileMoreOpen={isMobileMoreOpen}
        setIsMobileMoreOpen={setIsMobileMoreOpen}
        onImportClick={() => fileInputRef.current?.click()}
        onTriggerInsertImage={handleTriggerInsertImage}
        onExportHtml={handleExportHtml}
        onExportFullProject={() => handleExportFullProject()}
        activeProjectName={activeProject?.name}
        projectFilesCount={(activeProjectFiles || []).length}
        onPrintDocument={handlePrintDocument}
        isPrinting={isPrinting}
        onOpenDeleteModal={() => setShowDeleteConfirmModal(true)}
        toggleTheme={toggleTheme}
        isDark={isDark}
        isDriveConnected={isDriveAuth}
        driveSyncStatus={driveSyncStatus}
        onConnectDrive={handleConnectDrive}
        onTriggerDriveSync={handleTriggerDriveSync}
        onExportNoteToDrive={handleExportNoteToDrive}
        onDeduplicateDrive={handleDeduplicateDrive}
        driveToastMessage={driveToastMessage}
        onOpenVersionHistory={() => setIsVersionModalOpen(true)}
        showDeleteConfirmModal={showDeleteConfirmModal}
        setShowDeleteConfirmModal={(open) => {
          setShowDeleteConfirmModal(open);
          if (!open) {
            setTimeout(() => setDeleteTarget(null), 150);
          }
        }}
        onConfirmDelete={() => {
          const target = deleteTarget;
          setShowDeleteConfirmModal(false);
          if (target?.type === 'project') {
            handleExecuteDeleteProject(target.projectId);
          } else if (target?.type === 'file' && target.fileId) {
            handleExecuteDeleteFile(target.projectId, target.fileId);
          } else if (activeProjectId && activeFileId) {
            handleExecuteDeleteFile(activeProjectId, activeFileId);
          }
          setTimeout(() => setDeleteTarget(null), 150);
        }}
        noteTitle={deleteTarget?.title || title}
        deleteTargetType={deleteTarget?.type || 'file'}
        savedSuccess={savedSuccess}
        fileInputRef={fileInputRef}
        imageUploadRef={imageUploadRef}
        onImportFile={handleImportFile}
        onImageUpload={handleImageUpload}
      />

      {/* MAINTAIN LAST 2 VERSIONS HISTORY MODAL */}
      <HtmlNotesVersionModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        versions={getFileVersionHistory(activeProjectId, activeFileId)}
        currentCode={code}
        noteTitle={title}
        onRestoreVersion={(ver) => {
          updateCodeWithHistory(ver.code);
        }}
      />

      {/* PROFESSIONAL MATH & KATEX FORMULA STUDIO MODAL */}
      <HtmlNotesMathEditorModal
        isOpen={isMathModalOpen}
        onClose={() => setIsMathModalOpen(false)}
        onInsertLatex={handleInsertLatexFormula}
      />

      {/* RICH IMAGE UPLOAD / WEB URL / STOCK IMAGE MODAL */}
      <HtmlNotesImageModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsertImage={handleInsertImageSnippet}
        onTriggerDeviceUpload={() => imageUploadRef.current?.click()}
      />

      {/* THETA AI NOTES ASSISTANT STUDIO PANEL */}
      <HtmlNotesAiPanel
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        currentCode={code}
        currentTitle={title}
        selectedText={selectedTextForAi}
        targetPointerIndex={targetPointerIndex}
        onClearSelectedText={() => setSelectedTextForAi(null)}
        onApplyCode={(newCode) => {
          updateCodeWithHistory(newCode, true);
        }}
        onInsertCodeSnippet={(snippet) => {
          handleInsertSnippetAtCharIndex(snippet, targetPointerIndex ?? undefined);
        }}
        activeProjectId={activeProjectId}
        activeFileId={activeFileId}
        activeProjectFiles={activeProjectFiles}
        fileSummaries={fileSummaries}
        onCreateFileInProject={handleCreateFileFromAi}
        onUpdateFileInProject={handleUpdateFileFromAi}
        onDeleteFileInProject={(fileId) => {
          const target = activeProjectFiles.find(f => f.id === fileId);
          setDeleteTarget({
            type: 'file',
            projectId: activeProjectId,
            fileId,
            title: target?.title || 'this note',
          });
          setShowDeleteConfirmModal(true);
        }}
        onSelectFileInProject={(fileId) => {
          const target = activeProjectFiles.find(f => f.id === fileId);
          if (target) {
            handleOpenFile(activeProjectId, target, viewMode);
          }
        }}
      />

      {/* FULL SCREEN INTERACTIVE PREVIEW VIEW */}
      {isFullScreenPreview && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-[#0b0c10] flex flex-col overflow-hidden m3-fade-in">
          {/* Compact Top Bar directly under Device Status Bar */}
          <div className="min-h-[38px] px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.15rem)] pb-1 bg-white/95 dark:bg-[#0b0c10]/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 z-20">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-zinc-200 truncate max-w-[150px] sm:max-w-[400px]">
                {title || 'Untitled Note'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold shrink-0 hidden sm:inline">
                Full Screen Preview
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={handleZoomOut}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center text-xs font-bold border-0 cursor-pointer text-slate-700 dark:text-zinc-200 transition-colors active:scale-95"
                title="Zoom Out (-)"
              >
                -
              </button>

              <button
                type="button"
                onClick={handleZoomReset}
                className="text-xs font-bold text-slate-700 dark:text-zinc-300 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] min-w-[38px] text-center bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded-full border-0 cursor-pointer transition-colors active:scale-95"
                title="Reset Zoom (Fit / 100%)"
              >
                {Math.round(zoomLevel)}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center text-xs font-bold border-0 cursor-pointer text-slate-700 dark:text-zinc-200 transition-colors active:scale-95"
                title="Zoom In (+)"
              >
                +
              </button>

              <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 my-auto mx-0.5 sm:mx-1" />

              <button
                type="button"
                onClick={handleToggleFullScreenPreview}
                className="h-7 px-2.5 sm:px-3 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer transition-colors shadow-xs active:scale-95"
                title="Exit Full Screen Preview (Esc)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Full Screen</span>
              </button>
            </div>
          </div>

          {/* Full Screen Content Frame (Zoom managed via explicit zoom buttons) */}
          <div className="flex-1 min-h-0 w-full h-full relative overflow-auto bg-slate-100 dark:bg-zinc-950">
            <iframe
              ref={fullScreenIframeRef}
              title="Full Screen Notes Preview Engine"
              srcDoc={iframeSrcDoc}
              onLoad={() => applyIframeZoom(zoomLevel)}
              className="w-full h-full border-0 block bg-white dark:bg-[#14161d]"
              style={{ width: '100%', height: '100%', border: 0, display: 'block', touchAction: 'pan-x pan-y' }}
            />

            {/* Full Screen Stylus Pen Toolbar */}
            {isPenModeActive && (
              <HtmlNotesPenToolbar
                isOpen={isPenModeActive}
                onClose={handleTogglePenMode}
                activeTool={penTool}
                onSelectTool={handleSelectPenTool}
                currentColor={penColor}
                onSelectColor={handleSelectPenColor}
                currentWidth={penWidth}
                onSelectWidth={handleSelectPenWidth}
                onUndo={handlePenUndo}
                onRedo={handlePenRedo}
                onClearAll={handlePenClear}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
