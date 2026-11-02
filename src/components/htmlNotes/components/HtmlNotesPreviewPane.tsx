import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { 
  Search, ChevronUp, ChevronDown, X, ImagePlus, Sparkles, 
  AlignLeft, AlignRight, AlignCenter, Maximize2, ArrowUp, ArrowDown, Trash2 
} from 'lucide-react';
import { getDomSelectionBoundingRect, type SelectionRect } from '../utils/selectionPositionUtils';
import { HtmlNotesSlantEditPopover } from './HtmlNotesSlantEditPopover';
import { HtmlNotesZoomControls } from './HtmlNotesZoomControls';
import { compressImageForDocument } from '../utils/imageCompressor';
import { type ViewportMode } from '../types';
import { normalizeLatexMath, PIPELINE_KATEX_MACROS } from '../../../lib/mathPipeline/katexCore';
import { useDirectCanvasPen } from '../hooks/useDirectCanvasPen';
import type { PenToolType } from './HtmlNotesPenToolbar';

export interface HtmlNotesPreviewPaneHandle {
  scrollToHeading: (headingText: string, headingIndex?: number) => void;
  insertSnippetAtCaret: (snippet: string) => void;
  insertImage: (dataUrl: string, fileName?: string, align?: 'left' | 'right' | 'center' | 'full') => void;
  searchPreview?: (term: string) => void;
  getCleanHtmlForPrint?: () => string;
  getExactPrintDocument?: (docTitle?: string) => string;
  undoPenStroke?: () => void;
  redoPenStroke?: () => void;
  clearAllPenStrokes?: () => void;
}

interface HtmlNotesPreviewPaneProps {
  viewMode: 'split' | 'editor' | 'preview';
  viewportMode: ViewportMode;
  splitRatio: number;
  isDark: boolean;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  srcDoc?: string;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  applyIframeZoom?: (zoom: number) => void;
  // Search state
  isPreviewSearchOpen: boolean;
  previewSearchTerm: string;
  previewMatchCount: number;
  currentPreviewMatchIdx: number;
  previewSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onPreviewSearchChange: (val: string) => void;
  onPrevPreviewMatch: () => void;
  onNextPreviewMatch: () => void;
  onClosePreviewSearch: () => void;
  code: string;
  onCodeChange?: (newCode: string) => void;
  sideMarginMm?: number;
  verticalMarginMm?: number;
  totalLeftMarginMm?: number;
  fontSizePx?: number;
  // Image Insertion & Interaction
  onTriggerInsertImage: () => void;
  onInsertImageSnippet?: (dataUrl: string, fileName?: string) => void;
  onInsertDropdown?: () => void;
  onRefineSelection?: (selectedText: string) => void;
  onPromptAiTopicHere?: (promptText: string, charIndex?: number) => void;
  onInsertSnippetHere?: (snippet: string, charIndex?: number) => void;
  onPreviewTextSelected?: (selectedText: string) => void;
  activeSelectionPane?: 'editor' | 'preview' | null;
  isSelectRefiningModeEnabled?: boolean;
  onToggleSelectRefiningMode?: () => void;
  onSubmitSlantEdit?: (prompt: string, selectedText: string) => Promise<void>;
  isSlantLoading?: boolean;
  onOpenFullAiPanel?: (selectedText: string) => void;
  isResizing?: boolean;
  isVisualEditActive?: boolean;
  onToggleVisualEdit?: () => void;
  isPenModeActive?: boolean;
  penTool?: PenToolType;
  penColor?: string;
  penWidth?: number;
  setViewportMode?: (mode: ViewportMode) => void;
}

export const HtmlNotesPreviewPane = React.forwardRef<HtmlNotesPreviewPaneHandle, HtmlNotesPreviewPaneProps>(({
  viewMode,
  viewportMode,
  splitRatio,
  isDark,
  zoomLevel,
  isResizing = false,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  isPreviewSearchOpen,
  previewSearchTerm,
  previewMatchCount,
  currentPreviewMatchIdx,
  previewSearchInputRef,
  onPreviewSearchChange,
  onPrevPreviewMatch,
  onNextPreviewMatch,
  onClosePreviewSearch,
  code,
  onCodeChange,
  sideMarginMm = 5,
  verticalMarginMm = 8,
  totalLeftMarginMm = 5,
  fontSizePx = 14,
  onTriggerInsertImage,
  onPreviewTextSelected,
  activeSelectionPane,
  onSubmitSlantEdit,
  isSlantLoading,
  onOpenFullAiPanel,
  isVisualEditActive = false,
  onToggleVisualEdit,
  isPenModeActive = false,
  penTool = 'pen',
  penColor = '#2563eb',
  penWidth = 2.5,
  setViewportMode,
}, ref) => {
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isSyncingFromCanvasRef = useRef<boolean>(false);
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMouseCoordsRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lastCaretRangeRef = useRef<Range | null>(null);
  const dropTargetInfoRef = useRef<{ targetNode: Node; insertBefore: boolean } | null>(null);

  const [previewSelection, setPreviewSelection] = useState<string>('');
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [toolbarCoords, setToolbarCoords] = useState<{ top: number; left: number } | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState<boolean>(false);
  const [dropIndicatorTop, setDropIndicatorTop] = useState<number | null>(null);
  const [resizeBadgeText, setResizeBadgeText] = useState<string | null>(null);
  const [previewCanvasWidth, setPreviewCanvasWidth] = useState<number>(1000);

  // Dynamic ResizeObserver to monitor preview canvas width and seamlessly trigger fluid flow (desktop <-> mobile/tablet)
  useEffect(() => {
    const el = canvasRef.current || scrollWrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setPreviewCanvasWidth(width);
          if (canvasRef.current) {
            const isA4 = viewportMode === 'a4';
            canvasRef.current.classList.toggle('is-compact-preview', !isA4 && width < 600);
            canvasRef.current.classList.toggle('is-mobile-preview', !isA4 && width < 480);
          }
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isVisualEditActiveRef = useRef<boolean>(isVisualEditActive);
  isVisualEditActiveRef.current = isVisualEditActive;

  // Synchronously render KaTeX math on an element using globally exposed renderMathInElement
  const renderMathSync = useCallback((container: HTMLElement) => {
    const rMath = (window as any).renderMathInElement;
    if (typeof rMath === 'function') {
      try {
        rMath(container, {
          macros: PIPELINE_KATEX_MACROS,
          preProcess: (math: string) => normalizeLatexMath(math, false),
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (e) {
        console.warn('KaTeX rendering error in direct DOM preview:', e);
      }
    }
  }, []);

  // Sync canvas HTML back into the editor (stripping UI handles & temporary editing attributes)
  const syncPreviewCanvasToEditor = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onCodeChange) return;

    const clone = canvas.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.studio-resize-handle').forEach(h => h.remove());
    clone.querySelectorAll('.studio-resize-badge').forEach(b => b.remove());
    clone.querySelectorAll('.studio-drop-indicator-line').forEach(l => l.remove());
    clone.querySelectorAll('.a4-page-badge').forEach(b => b.remove());
    clone.querySelectorAll('.studio-img-widget').forEach(w => {
      w.classList.remove('studio-selected-img');
      w.removeAttribute('draggable');
      const innerImg = w.querySelector('img');
      const el = w as HTMLElement;
      if (innerImg) {
        if (el.style && el.style.height) {
          el.style.overflow = 'hidden';
          innerImg.style.width = '100%';
          innerImg.style.height = '100%';
          innerImg.style.maxHeight = '100%';
          innerImg.style.objectFit = 'fill';
          innerImg.style.display = 'block';
        } else {
          innerImg.style.width = '100%';
          innerImg.style.height = 'auto';
        }
      }
    });
    clone.removeAttribute('contenteditable');
    clone.classList.remove('preview-editing');

    // Unwrap .a4-sheet pages so raw document code is clean and unfragmented
    const sheets = clone.querySelectorAll('.a4-sheet');
    if (sheets.length > 0) {
      const fragment = document.createDocumentFragment();
      sheets.forEach(sheet => {
        sheet.querySelectorAll('.a4-page-badge').forEach(b => b.remove());
        while (sheet.firstChild) {
          fragment.appendChild(sheet.firstChild);
        }
        sheet.remove();
      });
      clone.appendChild(fragment);
    }

    // Re-merge any split tables
    const splits = clone.querySelectorAll('[data-split-id]');
    const splitMap: Record<string, HTMLElement> = {};
    splits.forEach(el => {
      const sid = el.getAttribute('data-split-id');
      if (!sid) return;
      if (!splitMap[sid]) {
        splitMap[sid] = el as HTMLElement;
        el.removeAttribute('data-split-id');
        el.removeAttribute('data-split-tag');
      } else {
        const primary = splitMap[sid];
        const tbody = el.querySelector('tbody');
        const primaryTbody = primary.querySelector('tbody') || primary;
        if (tbody) {
          while (tbody.firstChild) primaryTbody.appendChild(tbody.firstChild);
        } else {
          while (el.firstChild) primary.appendChild(el.firstChild);
        }
        el.remove();
      }
    });

    // Remove duplicated head styles injected for preview
    const parser = new DOMParser();
    const source = parser.parseFromString(code || '', 'text/html');
    const originalHeadStyles = Array.from(source.head.querySelectorAll('style')).map(s => s.textContent);
    clone.querySelectorAll('style').forEach(s => {
      if (originalHeadStyles.includes(s.textContent)) s.remove();
    });

    let fullHtml: string;
    if (code.includes('</body>') || code.includes('<html')) {
      source.body.innerHTML = clone.innerHTML;
      fullHtml = source.documentElement.outerHTML;
    } else {
      fullHtml = clone.innerHTML;
    }

    // Clean up empty ink layers before exporting HTML and neutralize runtime styles
    clone.querySelectorAll<SVGSVGElement>('.studio-ink-layer').forEach(layer => {
      if (!layer.querySelector('.studio-ink-stroke')) {
        layer.remove();
      } else {
        layer.style.pointerEvents = 'none';
        layer.style.cursor = 'default';
        layer.style.touchAction = '';
        layer.classList.remove('pen-mode-active', 'studio-pen-eraser', 'studio-pen-active');
        layer.querySelectorAll<SVGElement>('.studio-ink-stroke').forEach(s => {
          s.style.pointerEvents = 'none';
          s.style.cursor = 'default';
        });
      }
    });

    isSyncingFromCanvasRef.current = true;
    onCodeChange(fullHtml);
  }, [code, onCodeChange]);

  // Direct DOM Stylus Pen & Highlighter Engine
  const penEngine = useDirectCanvasPen({
    canvasRef,
    isPenModeActive,
    penTool,
    penColor,
    penWidth,
    viewportMode,
    onSyncToEditor: syncPreviewCanvasToEditor
  });

  // High performance debounced sync for real-time typing with 0ms native keystroke latency
  const triggerDebouncedSync = useCallback(() => {
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
    }
    syncDebounceTimerRef.current = setTimeout(() => {
      syncPreviewCanvasToEditor();
      syncDebounceTimerRef.current = null;
    }, 350);
  }, [syncPreviewCanvasToEditor]);

  // Flush any pending debounced sync immediately on demand
  const flushPendingSync = useCallback(() => {
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
      syncDebounceTimerRef.current = null;
      syncPreviewCanvasToEditor();
    }
  }, [syncPreviewCanvasToEditor]);

  // Update floating context toolbar position relative to scroll wrapper
  const updateToolbarPosition = useCallback(() => {
    if (!selectedWidgetId || !scrollWrapperRef.current) {
      setToolbarCoords(null);
      return;
    }
    const widget = document.getElementById(selectedWidgetId);
    if (!widget) {
      setToolbarCoords(null);
      return;
    }

    const wrapper = scrollWrapperRef.current;
    const wrapperRect = wrapper.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();

    // Calculate vertical coordinate relative to wrapper's scroll top
    const widgetTopRelative = (widgetRect.top - wrapperRect.top) + wrapper.scrollTop;
    const widgetLeftRelative = (widgetRect.left - wrapperRect.left) + (widgetRect.width / 2);

    // If widget is close to top of visible wrapper, place toolbar below it
    let top = widgetTopRelative - 46;
    if (widgetRect.top - wrapperRect.top < 60) {
      top = widgetTopRelative + widgetRect.height + 12;
    }

    // Clamp horizontal center so toolbar doesn't overflow container edges
    const tbEl = document.getElementById('image-context-toolbar');
    const tbWidth = tbEl ? tbEl.offsetWidth : 260;
    const halfWidth = (tbWidth / 2) + 16;
    const clampedLeft = Math.max(halfWidth, Math.min(wrapperRect.width - halfWidth, widgetLeftRelative));

    setToolbarCoords({ top, left: clampedLeft });
  }, [selectedWidgetId]);

  const selectedWidgetIdRef = useRef<string | null>(null);
  selectedWidgetIdRef.current = selectedWidgetId;

  const updateToolbarPositionRef = useRef(updateToolbarPosition);
  updateToolbarPositionRef.current = updateToolbarPosition;

  const syncPreviewCanvasToEditorRef = useRef(syncPreviewCanvasToEditor);
  syncPreviewCanvasToEditorRef.current = syncPreviewCanvasToEditor;

  // Select an image widget and show its context toolbar
  const selectImageWidget = useCallback((widget: HTMLElement) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.querySelectorAll('.studio-img-widget').forEach(el => el.classList.remove('studio-selected-img'));
    }
    widget.classList.add('studio-selected-img');
    selectedWidgetIdRef.current = widget.id;
    setSelectedWidgetId(widget.id);
  }, []);

  const selectImageWidgetRef = useRef(selectImageWidget);
  selectImageWidgetRef.current = selectImageWidget;

  const deselectAnyImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.querySelectorAll('.studio-img-widget').forEach(el => el.classList.remove('studio-selected-img'));
    }
    selectedWidgetIdRef.current = null;
    setSelectedWidgetId(null);
    setToolbarCoords(null);
  }, []);

  // Keep toolbar position updated when widget is selected or container is scrolled
  useEffect(() => {
    updateToolbarPosition();
  }, [selectedWidgetId, updateToolbarPosition]);

  useEffect(() => {
    const wrapper = scrollWrapperRef.current;
    if (!wrapper) return;
    const onScroll = () => {
      if (selectedWidgetIdRef.current) updateToolbarPositionRef.current();
    };
    wrapper.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      wrapper.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Record active caret position inside preview-canvas for accurate string insertion & pasting
  const updateCaretTracking = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && canvasRef.current) {
      const range = sel.getRangeAt(0);
      if (canvasRef.current.contains(range.commonAncestorContainer)) {
        lastCaretRangeRef.current = range.cloneRange();
      }
    }
  }, []);

  // Bind interactive resizing and dragging on image widgets in direct DOM
  const bindInteractiveImagesInPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Unwrap any legacy <figure> tags holding images to eliminate rigid fixed containers
    canvas.querySelectorAll('figure').forEach(fig => {
      const img = fig.querySelector('img');
      if (img && fig.parentNode) {
        const wrapper = document.createElement('div');
        wrapper.id = 'studio-img-' + Math.floor(Math.random() * 1000000);
        wrapper.setAttribute('contenteditable', 'false');
        // Inherit or convert wrap mode
        const figStyle = (fig.getAttribute('style') || '').toLowerCase();
        let wrapMode = 'wrap-right';
        if (figStyle.includes('float: left') || figStyle.includes('text-align: left')) wrapMode = 'wrap-left';
        else if (figStyle.includes('width: 100%')) wrapMode = 'wrap-full';
        else if (figStyle.includes('margin: 1.5rem auto') || figStyle.includes('text-align: center')) wrapMode = 'wrap-none';
        
        wrapper.className = `studio-img-widget ${wrapMode}`;
        wrapper.style.width = (img.width ? Math.min(img.width, 360) : 280) + 'px';
        img.removeAttribute('style');
        fig.parentNode.insertBefore(wrapper, fig);
        wrapper.appendChild(img);
        fig.remove();
      }
    });

    // 2. Wrap any bare <img> inside .studio-img-widget
    canvas.querySelectorAll('img').forEach(img => {
      if (!img.closest('.studio-img-widget')) {
        const wrapper = document.createElement('div');
        wrapper.id = 'studio-img-' + Math.floor(Math.random() * 1000000);
        wrapper.setAttribute('contenteditable', 'false');
        wrapper.className = 'studio-img-widget wrap-right';
        wrapper.style.width = (img.width ? Math.min(img.width, 360) : 280) + 'px';
        img.parentNode?.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }
    });

    // 3. Attach all 8 corner and edge resize handles and dragging events to all .studio-img-widget elements
    canvas.querySelectorAll<HTMLElement>('.studio-img-widget').forEach(widget => {
      widget.setAttribute('contenteditable', 'false');
      if (widget.style.height) {
        widget.style.overflow = 'hidden';
        const img = widget.querySelector('img');
        if (img) {
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.maxHeight = '100%';
          img.style.objectFit = 'fill';
          img.style.display = 'block';
        }
      }

      const handleConfigs = [
        { cls: 'handle-nw', title: 'Top-Left: Drag to stretch both width & height' },
        { cls: 'handle-n', title: 'Top Edge: Drag to stretch height' },
        { cls: 'handle-ne', title: 'Top-Right: Drag to stretch both width & height' },
        { cls: 'handle-e', title: 'Right Edge: Drag to stretch width' },
        { cls: 'handle-se', title: 'Bottom-Right: Drag to stretch both width & height' },
        { cls: 'handle-s', title: 'Bottom Edge: Drag to stretch height' },
        { cls: 'handle-sw', title: 'Bottom-Left: Drag to stretch both width & height' },
        { cls: 'handle-w', title: 'Left Edge: Drag to stretch width' }
      ];

      handleConfigs.forEach(cfg => {
        if (!widget.querySelector(`.studio-resize-handle.${cfg.cls}`)) {
          const h = document.createElement('div');
          h.className = `studio-resize-handle ${cfg.cls}`;
          h.title = cfg.title;
          h.setAttribute('draggable', 'false');
          widget.appendChild(h);
        }
      });

      widget.setAttribute('draggable', 'true');
      widget.onclick = (e) => {
        if (!isVisualEditActiveRef.current) return;
        e.stopPropagation();
        selectImageWidgetRef.current(widget);
      };

      // Resizing logic for corner and edge handles with live dimension badge
      const handles = widget.querySelectorAll<HTMLElement>('.studio-resize-handle');
      handles.forEach(handle => {
        handle.setAttribute('draggable', 'false');

        // Prevent native HTML5 drag on parent widget from intercepting handle mouse clicks
        handle.onmouseenter = () => { widget.setAttribute('draggable', 'false'); };
        handle.onmouseleave = () => { widget.setAttribute('draggable', 'true'); };

        const onStartResize = (e: MouseEvent | TouchEvent) => {
          e.stopPropagation();
          e.preventDefault();
          widget.setAttribute('draggable', 'false');
          selectImageWidgetRef.current(widget);

          const pt = 'touches' in e ? e.touches[0] : e;
          const startX = pt.clientX;
          const startY = pt.clientY;
          const startW = widget.offsetWidth;
          const startH = widget.offsetHeight;

          // Maintain active cursor across whole window while dragging
          const originalBodyCursor = document.body.style.cursor;
          const originalBodyUserSelect = document.body.style.userSelect;
          const handleCursor = window.getComputedStyle(handle).cursor;
          document.body.style.cursor = handleCursor;
          document.body.style.userSelect = 'none';

          // Create or reuse dimension badge
          let badge = widget.querySelector<HTMLElement>('.studio-resize-badge');
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'studio-resize-badge';
            widget.appendChild(badge);
          }

          const onMoveResize = (moveEvent: MouseEvent | TouchEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const curPt = 'touches' in moveEvent ? moveEvent.touches[0] : moveEvent;
            const deltaX = curPt.clientX - startX;
            const deltaY = curPt.clientY - startY;

            let newW = startW;
            let newH = startH;

            // Handle directional stretch
            if (handle.classList.contains('handle-se')) {
              newW = startW + deltaX;
              newH = startH + deltaY;
            } else if (handle.classList.contains('handle-sw')) {
              newW = startW - deltaX;
              newH = startH + deltaY;
            } else if (handle.classList.contains('handle-ne')) {
              newW = startW + deltaX;
              newH = startH - deltaY;
            } else if (handle.classList.contains('handle-nw')) {
              newW = startW - deltaX;
              newH = startH - deltaY;
            } else if (handle.classList.contains('handle-e')) {
              newW = startW + deltaX;
            } else if (handle.classList.contains('handle-w')) {
              newW = startW - deltaX;
            } else if (handle.classList.contains('handle-s')) {
              newH = startH + deltaY;
            } else if (handle.classList.contains('handle-n')) {
              newH = startH - deltaY;
            }

            const canvasW = canvas.clientWidth || 600;
            const finalW = Math.max(50, Math.min(canvasW, newW));
            const finalH = Math.max(30, newH);

            widget.classList.remove('wrap-full');

            // Apply horizontal stretch if width changed
            const isHorizontalDrag = !handle.classList.contains('handle-n') && !handle.classList.contains('handle-s');
            if (isHorizontalDrag) {
              widget.style.width = `${finalW}px`;
            }

            // Apply vertical stretch if height changed
            const isVerticalDrag = !handle.classList.contains('handle-e') && !handle.classList.contains('handle-w');
            if (isVerticalDrag) {
              widget.style.height = `${finalH}px`;
              widget.style.overflow = 'hidden';
              const img = widget.querySelector('img');
              if (img) {
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'fill';
                img.style.display = 'block';
              }
            }

            if (badge) {
              const currentW = Math.round(widget.offsetWidth);
              const currentH = Math.round(widget.offsetHeight);
              const pct = Math.round((currentW / canvasW) * 100);
              badge.textContent = `${currentW} × ${currentH} px (${pct}%)`;
            }

            updateToolbarPositionRef.current();
          };

          const onStopResize = () => {
            document.removeEventListener('mousemove', onMoveResize, true);
            document.removeEventListener('mouseup', onStopResize, true);
            document.removeEventListener('touchmove', onMoveResize, true);
            document.removeEventListener('touchend', onStopResize, true);
            document.body.style.cursor = originalBodyCursor;
            document.body.style.userSelect = originalBodyUserSelect;
            widget.setAttribute('draggable', 'true');
            if (badge) badge.remove();
            updateToolbarPositionRef.current();
            syncPreviewCanvasToEditorRef.current();
          };

          document.addEventListener('mousemove', onMoveResize, true);
          document.addEventListener('mouseup', onStopResize, true);
          document.addEventListener('touchmove', onMoveResize, { passive: false, capture: true });
          document.addEventListener('touchend', onStopResize, true);
        };

        handle.onmousedown = onStartResize as any;
        handle.ontouchstart = onStartResize as any;
      });

      widget.ondragstart = (e) => {
        selectImageWidgetRef.current(widget);
        e.dataTransfer?.setData('text/plain', widget.id);
      };
    });

    // 4. Glowing drop indicator insertion line (●──────────●) between strings and blocks
    canvas.ondragover = (e) => {
      e.preventDefault();
      const target = (e.target as HTMLElement)?.closest('p, div.def-box, h1, h2, h3, h4, h5, h6, div.graph-card, blockquote, li');
      if (target && !target.classList.contains('studio-img-widget')) {
        const targetRect = target.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const midY = targetRect.top + targetRect.height / 2;
        const insertBefore = e.clientY < midY;

        const targetTopInCanvas = (targetRect.top - canvasRect.top);
        const lineTop = insertBefore ? (targetTopInCanvas - 2) : (targetTopInCanvas + targetRect.height + 2);

        setDropIndicatorTop(lineTop);
        dropTargetInfoRef.current = { targetNode: target, insertBefore };
      }
    };

    canvas.ondragleave = (e) => {
      if (!canvas.contains(e.relatedTarget as Node)) {
        setDropIndicatorTop(null);
        dropTargetInfoRef.current = null;
      }
    };

    canvas.ondrop = (e) => {
      e.preventDefault();
      setDropIndicatorTop(null);

      if (dropTargetInfoRef.current) {
        const selWidget = selectedWidgetIdRef.current
          ? document.getElementById(selectedWidgetIdRef.current)
          : canvas.querySelector<HTMLElement>('.studio-img-widget.studio-selected-img');
        const { targetNode, insertBefore } = dropTargetInfoRef.current;
        if (selWidget && targetNode && targetNode !== selWidget && targetNode.parentNode) {
          if (insertBefore) {
            targetNode.parentNode.insertBefore(selWidget, targetNode);
          } else {
            targetNode.parentNode.insertBefore(selWidget, targetNode.nextSibling);
          }
          updateToolbarPositionRef.current();
          syncPreviewCanvasToEditorRef.current();
        }
      }
      dropTargetInfoRef.current = null;
    };
  }, []);

  // Helper: resolve effective page margins (with studio slider settings taking direct authority)
  const getDocumentPageMargins = useCallback((
    _htmlOrCss: string,
    fallbackVertical: number,
    fallbackSide: number,
    fallbackLeft?: number
  ): { verticalMm: number; sideMm: number; leftMm: number } => {
    // Studio sidebar settings (verticalMarginMm, sideMarginMm, totalLeftMarginMm) are the authoritative source
    // for paper preview and print layout so the user's margin slider changes take effect immediately.
    const verticalMm = typeof fallbackVertical === 'number' && fallbackVertical >= 0 ? fallbackVertical : 8;
    const sideMm = typeof fallbackSide === 'number' && fallbackSide >= 0 ? fallbackSide : 8;
    const leftMm = typeof fallbackLeft === 'number' && fallbackLeft >= 0 ? fallbackLeft : sideMm;

    return { verticalMm, sideMm, leftMm };
  }, []);

  // Measure height of an element or text node in pixels within an authentic A4 measurement host
  const paginateDomIntoA4Sheets = useCallback((
    container: HTMLElement,
    stylesHtml: string,
    rawBodyHtml: string
  ) => {
    const pxPerMm = 3.779527559;
    const { verticalMm: pageVerticalMarginMm, sideMm: pageSideMarginMm, leftMm: pageLeftMarginMm } = getDocumentPageMargins(
      stylesHtml + '\n' + rawBodyHtml,
      verticalMarginMm,
      sideMarginMm,
      totalLeftMarginMm
    );

    const topMarginPx = Math.round(pageVerticalMarginMm * pxPerMm);
    const bottomMarginPx = Math.round(pageVerticalMarginMm * pxPerMm);
    // Align safety margin precisely with printable sheet bottom boundary (1px subpixel tolerance)
    const bottomSafetyMarginPx = bottomMarginPx;

    // Temporarily reset zoom to 1 during DOM measurement so getBoundingClientRect reflects authentic 1:1 hardware pixels
    const prevZoom = (container.style as any).zoom;
    (container.style as any).zoom = '1';

    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(rawBodyHtml, 'text/html');
    const sourceBody = parsedDoc.body;
    if (!sourceBody) return;

    // Merge any previous split elements
    const splits = sourceBody.querySelectorAll('[data-split-id]');
    const splitMap: Record<string, HTMLElement> = {};
    splits.forEach(el => {
      const sid = el.getAttribute('data-split-id');
      if (!sid) return;
      if (!splitMap[sid]) {
        splitMap[sid] = el as HTMLElement;
        el.removeAttribute('data-split-id');
        el.removeAttribute('data-split-tag');
      } else {
        const primary = splitMap[sid];
        const tbody = el.querySelector('tbody');
        const primaryTbody = primary.querySelector('tbody') || primary;
        if (tbody) {
          while (tbody.firstChild) primaryTbody.appendChild(tbody.firstChild);
        } else {
          while (el.firstChild) primary.appendChild(el.firstChild);
        }
        el.remove();
      }
    });

    // Remove old badges and handles
    sourceBody.querySelectorAll('.a4-page-badge, .studio-resize-handle, .studio-resize-badge, #image-context-toolbar').forEach(el => el.remove());

    // Pre-render KaTeX math ONCE across the parsed source body in memory.
    // This eliminates hundreds of redundant KaTeX invocations and forced reflows during sheet allocation!
    renderMathSync(sourceBody);

    // Helper: identify elements that are atomic visual blocks and must NEVER be stripped of their outer container
    const isAtomicStyledBlock = (el: HTMLElement): boolean => {
      if (!el || el.nodeType !== 1) return false;

      // Special widgets, slides, and charts are atomic
      if (
        el.classList.contains('studio-img-widget') ||
        el.classList.contains('slide') ||
        el.classList.contains('graph-card')
      ) {
        return true;
      }

      // Section cards, headers, and callouts must remain intact units to preserve 2-column grid layout and section margins
      if (
        el.classList.contains('section-card') ||
        el.classList.contains('academic-section') ||
        el.classList.contains('header-plain') ||
        el.classList.contains('module-header')
      ) {
        return true;
      }

      // Non-container semantic tags that must NEVER be unrolled
      const tag = el.tagName.toUpperCase();
      if ([
        'TABLE', 'FIGURE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'HR',
        'IMG', 'SVG', 'DETAILS', 'FORM', 'CANVAS', 'IFRAME',
        'HEADER', 'FOOTER', 'NAV', 'ASIDE'
      ].includes(tag)) {
        return true;
      }

      // Layout containers like .notes-layout must be unrolled so individual sections can be distributed across sheets
      if (
        el.classList.contains('notes-layout') ||
        el.classList.contains('table-wrapper')
      ) {
        return false;
      }

      // Match common classes used for true small callout boxes, alerts, badges
      const cls = (el.className || '').toLowerCase();
      if (/(panel|callout|def-box|alert|note|tip|warning|info|success|danger|error|badge|banner|quote|formula-box)/i.test(cls)) {
        return true;
      }

      // Any inline styling indicating custom background, border, shadow, padding, or layout
      const style = el.getAttribute('style') || '';
      if (/background|border|box-shadow|display\s*:\s*(grid|flex)/i.test(style)) {
        return true;
      }

      return false;
    };

    // Helper: identify generic unstyled grouping containers that can have their direct children extracted
    const isGenericWrapper = (node: Node): boolean => {
      if (!node || node.nodeType !== 1) return false;
      const el = node as HTMLElement;
      if (isAtomicStyledBlock(el)) return false;

      const tag = el.tagName.toUpperCase();
      return tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'BODY';
    };

    // Helper: recursively extract leaf/atomic blocks from nested containers
    const collectLeafBlocks = (parent: Node): Node[] => {
      const result: Node[] = [];
      Array.from(parent.childNodes).forEach(node => {
        if (node.nodeType === 3) {
          if (node.textContent?.trim()) result.push(node);
          return;
        }
        if (node.nodeType === 1) {
          const el = node as HTMLElement;
          // Never treat ink SVG layers as flow document blocks during A4 pagination
          if (el.classList.contains('studio-ink-layer') || (el.tagName.toUpperCase() === 'SVG' && el.classList.contains('studio-ink-layer'))) {
            return;
          }
          if (el.classList.contains('a4-sheet')) {
            el.querySelectorAll('.a4-page-badge').forEach(b => b.remove());
            result.push(...collectLeafBlocks(el));
            return;
          }
          if (isGenericWrapper(el) && el.children.length > 0) {
            result.push(...collectLeafBlocks(el));
            return;
          }
          result.push(el);
        }
      });
      return result;
    };

    const hasNotesLayout = sourceBody.querySelector('.notes-layout') !== null;
    const rawBlocks: Node[] = collectLeafBlocks(sourceBody);

    // Set container to hold styles and assemble live sheets
    container.innerHTML = stylesHtml;

    // Helper: create a new discrete A4 sheet
    const createSheet = (pageNum: number, withInnerLayout: boolean = hasNotesLayout): HTMLDivElement => {
      const s = document.createElement('div');
      s.className = 'a4-sheet';
      s.setAttribute('data-page-number', pageNum.toString());
      s.style.boxSizing = 'border-box';
      s.style.position = 'relative';
      s.style.width = '210mm';
      s.style.minWidth = '210mm';
      s.style.maxWidth = '210mm';
      s.style.height = '297mm';
      s.style.minHeight = '297mm';
      s.style.maxHeight = '297mm';
      s.style.containerType = 'inline-size';
      s.style.overflow = 'hidden';
      s.style.setProperty('padding-top', `${pageVerticalMarginMm}mm`, 'important');
      s.style.setProperty('padding-bottom', `${pageVerticalMarginMm}mm`, 'important');
      s.style.setProperty('padding-left', `${pageLeftMarginMm}mm`, 'important');
      s.style.setProperty('padding-right', `${pageSideMarginMm}mm`, 'important');
      const docBaseFontSize = (fontSizePx && fontSizePx !== 14) ? `${fontSizePx}px` : '9.5pt';
      s.style.fontSize = docBaseFontSize;
      s.style.setProperty('--doc-font-size', docBaseFontSize);
      s.style.setProperty('--doc-font-size-table', (fontSizePx && fontSizePx !== 14) ? `${Math.max(fontSizePx - 2, 11)}px` : '9pt');

      if (withInnerLayout) {
        const layout = document.createElement('div');
        layout.className = 'notes-layout';
        layout.style.width = '100%';
        layout.style.boxSizing = 'border-box';
        s.appendChild(layout);
      }

      container.appendChild(s);
      return s;
    };

    const getTargetContainer = (sheet: HTMLDivElement): HTMLElement => {
      return (sheet.querySelector('.notes-layout') as HTMLElement) || sheet;
    };

    // Fast path: Test if sourceBody fits completely inside a single A4 sheet
    const testSheet = createSheet(1, false);
    while (sourceBody.firstChild) {
      testSheet.appendChild(sourceBody.firstChild);
    }

    const isSinglePage = testSheet.scrollHeight <= testSheet.clientHeight + 8;

    if (isSinglePage) {
      // Document fits entirely on 1 A4 sheet without page splitting!
      // Keep notes-layout, section-cards, 2-column grid, tables, and typography 100% intact.
      const badge = document.createElement('div');
      badge.className = 'a4-page-badge';
      badge.textContent = 'Page 1 of 1';
      testSheet.appendChild(badge);
      (container.style as any).zoom = prevZoom || '';
      return;
    }

    // If multi-page: move children back to sourceBody and proceed with block-level distribution
    while (testSheet.firstChild) {
      sourceBody.appendChild(testSheet.firstChild);
    }
    testSheet.remove();

    if (rawBlocks.length === 0) {
      const blankSheet = createSheet(1, hasNotesLayout);
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      getTargetContainer(blankSheet).appendChild(p);
      (container.style as any).zoom = prevZoom || '';
      return;
    }

    const sheets: HTMLDivElement[] = [];
    let currentSheet = createSheet(1, hasNotesLayout);
    sheets.push(currentSheet);

    const queue: Node[] = [...rawBlocks];
    let safetyCounter = 0;

    // Helper: determine the minimal lead content of the next block (e.g. table header + 1st row, or list 1st item)
    // so we can test whether a heading can stay on the current sheet without creating an orphan
    const getMinLeadElement = (node: Node): HTMLElement => {
      const el = node.nodeType === 1 ? (node as HTMLElement) : null;
      if (!el) return (node.cloneNode(true) as HTMLElement);

      const tbl = el.tagName.toUpperCase() === 'TABLE' ? (el as HTMLTableElement) : el.querySelector('table');
      if (tbl) {
        const colgroup = tbl.querySelector('colgroup');
        let thead = tbl.querySelector('thead');
        let allRows = Array.from(tbl.querySelectorAll('tbody > tr'));
        if (allRows.length === 0) {
          allRows = Array.from(tbl.querySelectorAll('tr')).filter(r => !r.closest('thead'));
        }
        if (!thead) {
          const firstTr = tbl.querySelector('tr');
          if (firstTr && firstTr.querySelector('th')) {
            thead = document.createElement('thead');
            thead.appendChild(firstTr.cloneNode(true));
            allRows = allRows.filter(r => r !== firstTr);
          }
        }
        const sampleTbl = tbl.cloneNode(false) as HTMLTableElement;
        if (colgroup) sampleTbl.appendChild(colgroup.cloneNode(true));
        if (thead) sampleTbl.appendChild(thead.cloneNode(true));
        const sampleTbody = document.createElement('tbody');
        if (allRows.length > 0) {
          sampleTbody.appendChild(allRows[0].cloneNode(true));
        }
        sampleTbl.appendChild(sampleTbody);

        if (el.tagName.toUpperCase() === 'TABLE') {
          return sampleTbl;
        } else {
          const wrapper = el.cloneNode(false) as HTMLElement;
          wrapper.appendChild(sampleTbl);
          return wrapper;
        }
      }

      if (el.tagName.toUpperCase() === 'UL' || el.tagName.toUpperCase() === 'OL') {
        const sampleList = el.cloneNode(false) as HTMLElement;
        const firstLi = el.querySelector('li');
        if (firstLi) sampleList.appendChild(firstLi.cloneNode(true));
        return sampleList;
      }

      return el.cloneNode(true) as HTMLElement;
    };

    while (queue.length > 0 && safetyCounter < 5000) {
      safetyCounter++;
      const block = queue.shift();
      if (!block) continue;
      if (block.nodeType === 3 && !block.textContent?.trim()) continue;

      const isHeading = block.nodeType === 1 && (
        /^H[1-6]$/i.test((block as HTMLElement).tagName) ||
        (block as HTMLElement).classList.contains('module-header') ||
        ((block as HTMLElement).children.length === 1 && /^H[1-6]$/i.test((block as HTMLElement).children[0].tagName))
      );

      // Clone node to append into live currentSheet for authentic browser layout measurement
      const targetContainer = getTargetContainer(currentSheet);
      const appendedNode = block.cloneNode(true) as HTMLElement;
      targetContainer.appendChild(appendedNode);

      // Check real rendered bottom position inside currentSheet
      const sheetRect = currentSheet.getBoundingClientRect();
      const nodeRect = appendedNode.nodeType === 1 
        ? (appendedNode as HTMLElement).getBoundingClientRect()
        : (() => {
            const range = document.createRange();
            range.selectNodeContents(appendedNode);
            return range.getBoundingClientRect();
          })();

      const nodeBottomInSheet = nodeRect.bottom - sheetRect.top;
      const maxAllowedBottom = sheetRect.height - bottomSafetyMarginPx + 1.0;

      // Allow a minor buffer (+12px) if the block completes within bottom printable boundary before triggering page overflow
      const fitsWithTolerance = nodeBottomInSheet <= maxAllowedBottom + 12.0;

      const isFirstItemOnSheet = targetContainer.childNodes.length === 1;

      if (nodeBottomInSheet <= maxAllowedBottom || fitsWithTolerance || isFirstItemOnSheet) {
        // Fits! (Or it's the very first item on a fresh sheet, so it must stay)
        
        // Check orphan heading rule: if this is a heading and next item in queue cannot fit even its lead item, move heading to next sheet
        if (isHeading && queue.length > 0 && !isFirstItemOnSheet) {
          const nextBlock = queue[0];
          const testLead = getMinLeadElement(nextBlock);
          targetContainer.appendChild(testLead);
          const testLeadRect = testLead.getBoundingClientRect();
          const testLeadBottom = testLeadRect.bottom - sheetRect.top;
          targetContainer.removeChild(testLead);

          if (testLeadBottom > maxAllowedBottom + 12.0) {
            // Even the very first chunk / row of the next item won't fit on this sheet; move this heading to start fresh on next sheet
            targetContainer.removeChild(appendedNode);
            currentSheet = createSheet(sheets.length + 1, hasNotesLayout);
            sheets.push(currentSheet);
            queue.unshift(block);
            continue;
          }
        }

        continue;
      }

      // Does NOT fit on currentSheet!
      targetContainer.removeChild(appendedNode);

      // Check if block is a TABLE (or contains a table) that can be split across pages
      // Only multi-row tables (>= 4 rows) should split; small definition/theorem tables (<= 3 rows) must remain intact!
      const blockEl = block.nodeType === 1 ? (block as HTMLElement) : null;
      const tbl = blockEl 
        ? (blockEl.tagName.toUpperCase() === 'TABLE' ? (blockEl as HTMLTableElement) : blockEl.querySelector('table'))
        : null;

      if (tbl) {
        let thead = tbl.querySelector('thead');
        const colgroup = tbl.querySelector('colgroup');
        let allRows = Array.from(tbl.querySelectorAll('tbody > tr'));
        if (allRows.length === 0) {
          allRows = Array.from(tbl.querySelectorAll('tr')).filter(r => !r.closest('thead'));
        }
        if (!thead) {
          const firstTr = tbl.querySelector('tr');
          if (firstTr && firstTr.querySelector('th')) {
            thead = document.createElement('thead');
            thead.appendChild(firstTr.cloneNode(true));
            allRows = allRows.filter(r => r !== firstTr);
          }
        }

        // Only split larger multi-row data tables (>= 4 rows) where at least 2 rows fit on current sheet
        // and at least 2 rows remain on the next sheet (prevents awkward 1-row table orphans with duplicate headers)
        if (allRows.length >= 4) {
          const testTable = tbl.cloneNode(false) as HTMLTableElement;
          if (colgroup) testTable.appendChild(colgroup.cloneNode(true));
          if (thead) testTable.appendChild(thead.cloneNode(true));
          const testTbody = document.createElement('tbody');
          testTable.appendChild(testTbody);

          let testHost: HTMLElement = testTable;
          if (blockEl && blockEl.tagName.toUpperCase() !== 'TABLE') {
            testHost = blockEl.cloneNode(false) as HTMLElement;
            const header = blockEl.querySelector('.module-header');
            if (header) testHost.appendChild(header.cloneNode(true));
            const tblWrapper = blockEl.querySelector('.table-wrapper');
            if (tblWrapper) {
              const tw = tblWrapper.cloneNode(false) as HTMLElement;
              tw.appendChild(testTable);
              testHost.appendChild(tw);
            } else {
              testHost.appendChild(testTable);
            }
          }
          targetContainer.appendChild(testHost);

          const fittedRows: Element[] = [];
          const remainingRows: Element[] = [];

          for (let rIdx = 0; rIdx < allRows.length; rIdx++) {
            const rowClone = allRows[rIdx].cloneNode(true) as HTMLTableRowElement;
            testTbody.appendChild(rowClone);
            const hostRect = testHost.getBoundingClientRect();
            if (hostRect.bottom - sheetRect.top <= maxAllowedBottom + 6.0) {
              fittedRows.push(allRows[rIdx]);
            } else {
              testTbody.removeChild(rowClone);
              remainingRows.push(...allRows.slice(rIdx));
              break;
            }
          }

          targetContainer.removeChild(testHost);

          if (fittedRows.length >= 2 && remainingRows.length >= 2) {
            // Split table across pages!
            const splitId = 'tbl_split_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            const caption = tbl.querySelector('caption');

            const chunkTable = tbl.cloneNode(false) as HTMLTableElement;
            chunkTable.setAttribute('data-split-id', splitId);
            if (caption) chunkTable.appendChild(caption.cloneNode(true));
            if (colgroup) chunkTable.appendChild(colgroup.cloneNode(true));
            if (thead) chunkTable.appendChild(thead.cloneNode(true));
            const chunkTbody = document.createElement('tbody');
            fittedRows.forEach(r => chunkTbody.appendChild(r.cloneNode(true)));
            chunkTable.appendChild(chunkTbody);

            let chunkHost: HTMLElement = chunkTable;
            if (blockEl && blockEl.tagName.toUpperCase() !== 'TABLE') {
              chunkHost = blockEl.cloneNode(false) as HTMLElement;
              const header = blockEl.querySelector('.module-header');
              if (header) chunkHost.appendChild(header.cloneNode(true));
              const tblWrapper = blockEl.querySelector('.table-wrapper');
              if (tblWrapper) {
                const tw = tblWrapper.cloneNode(false) as HTMLElement;
                tw.appendChild(chunkTable);
                chunkHost.appendChild(tw);
              } else {
                chunkHost.appendChild(chunkTable);
              }
            }
            targetContainer.appendChild(chunkHost);

            const remainderTable = tbl.cloneNode(false) as HTMLTableElement;
            remainderTable.setAttribute('data-split-id', splitId);
            if (caption) {
              const contCap = caption.cloneNode(true) as HTMLElement;
              if (!contCap.textContent?.includes('(Cont.)')) {
                contCap.textContent = (contCap.textContent || '').trim() + ' (Cont.)';
              }
              remainderTable.appendChild(contCap);
            }
            if (colgroup) remainderTable.appendChild(colgroup.cloneNode(true));
            if (thead) remainderTable.appendChild(thead.cloneNode(true));
            const remainderTbody = document.createElement('tbody');
            remainingRows.forEach(r => remainderTbody.appendChild(r.cloneNode(true)));
            remainderTable.appendChild(remainderTbody);

            let remainderHost: HTMLElement = remainderTable;
            if (blockEl && blockEl.tagName.toUpperCase() !== 'TABLE') {
              remainderHost = blockEl.cloneNode(false) as HTMLElement;
              const header = blockEl.querySelector('.module-header');
              if (header) {
                const contH = header.cloneNode(true) as HTMLElement;
                remainderHost.appendChild(contH);
              }
              const tblWrapper = blockEl.querySelector('.table-wrapper');
              if (tblWrapper) {
                const tw = tblWrapper.cloneNode(false) as HTMLElement;
                tw.appendChild(remainderTable);
                remainderHost.appendChild(tw);
              } else {
                remainderHost.appendChild(remainderTable);
              }
            }

            currentSheet = createSheet(sheets.length + 1, hasNotesLayout);
            sheets.push(currentSheet);
            queue.unshift(remainderHost);
            continue;
          }
        }
      }

      // Check if previous element on currentSheet is an orphan heading, title, or caption:
      const lastChildOnSheet = targetContainer.lastElementChild as HTMLElement | null;
      const isOrphanHeading = lastChildOnSheet && (
        /^H[1-6]$/i.test(lastChildOnSheet.tagName) ||
        lastChildOnSheet.classList.contains('module-header') ||
        (lastChildOnSheet.querySelector('h1, h2, h3, h4, h5, h6') !== null && !lastChildOnSheet.querySelector('table, p, ul, ol')) ||
        lastChildOnSheet.classList.contains('example-title') ||
        lastChildOnSheet.classList.contains('table-caption') ||
        lastChildOnSheet.classList.contains('math-theorem-title') ||
        lastChildOnSheet.classList.contains('math-definition-title') ||
        lastChildOnSheet.style.breakAfter === 'avoid' ||
        lastChildOnSheet.style.pageBreakAfter === 'avoid'
      );

      if (isOrphanHeading && targetContainer.childNodes.length > 1) {
        targetContainer.removeChild(lastChildOnSheet);
        currentSheet = createSheet(sheets.length + 1, hasNotesLayout);
        sheets.push(currentSheet);
        queue.unshift(block);
        queue.unshift(lastChildOnSheet);
        continue;
      }

      // Normal overflow: start on next sheet!
      currentSheet = createSheet(sheets.length + 1, hasNotesLayout);
      sheets.push(currentSheet);
      queue.unshift(block);
    }

    // Add page badges to all created sheets
    const totalPages = sheets.length;
    sheets.forEach((sheet, idx) => {
      const pageNum = idx + 1;
      const badge = document.createElement('div');
      badge.className = 'a4-page-badge';
      badge.setAttribute('contenteditable', 'false');
      badge.textContent = `Page ${pageNum} of ${totalPages}`;
      sheet.appendChild(badge);
    });

    // Restore original zoom style after completing measurement and sheet assembly
    (container.style as any).zoom = prevZoom || '';

    // If any images are still loading from network, re-paginate once all images finish loading
    const pendingImgs = Array.from(container.querySelectorAll('img')).filter(img => !img.complete);
    if (pendingImgs.length > 0) {
      let loaded = 0;
      const onDone = () => {
        loaded++;
        if (loaded >= pendingImgs.length) {
          paginateDomIntoA4Sheets(container, stylesHtml, rawBodyHtml);
        }
      };
      pendingImgs.forEach(img => {
        img.addEventListener('load', onDone, { once: true });
        img.addEventListener('error', onDone, { once: true });
      });
    }
  }, [fontSizePx, sideMarginMm, totalLeftMarginMm, verticalMarginMm, renderMathSync]);

  // Render the live HTML document directly into the #preview-canvas DOM
  const renderLivePreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(code || '', 'text/html');
    const styleTags = Array.from(doc.querySelectorAll('style')).map(s => s.outerHTML).join('\n');
    const linkTags = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => l.outerHTML).join('\n');
    const styles = `${linkTags}\n${styleTags}`;
    doc.body?.querySelectorAll('style, link').forEach(s => s.remove());
    const bodyHtml = doc.body ? doc.body.innerHTML : (code || '');

    if (viewportMode === 'a4') {
      const { verticalMm: pageVMargin, sideMm: pageSMargin, leftMm: pageLMargin } = getDocumentPageMargins(
        code || '',
        verticalMarginMm,
        sideMarginMm,
        totalLeftMarginMm
      );

      // In A4 Paper Mode, extract document's @media print rules and re-target them to .a4-sheet on screen
      // so the on-screen paper preview matches the printed output font size, line height, and cell padding
      let printMediaCss = '';
      Array.from(doc.querySelectorAll('style')).forEach(s => {
        const text = s.textContent || '';
        const printMatches = text.match(/@media\s+print\s*\{([\s\S]*?)\}(?=\s*(@media|\/|$|\}))/gi) ||
                             text.match(/@media\s+print\s*\{([\s\S]*)\}/gi);
        if (printMatches) {
          printMatches.forEach(block => {
            const inner = block.replace(/^@media\s+print\s*\{/i, '').replace(/\}$/, '');
            // Strip any body/html padding or margin rules meant solely for printer paper drivers
            const sanitizedInner = inner.replace(/(\bbody\s*\{)([^}]*)(\})/gi, (_m, prefix, props, suffix) => {
              const cleanProps = props
                .replace(/(^|;)\s*padding[^;]+;?/gi, ';')
                .replace(/(^|;)\s*margin[^;]+;?/gi, ';');
              return `${prefix}${cleanProps}${suffix}`;
            });
            const transformed = sanitizedInner
              .replace(/\bbody\b/g, '.a4-sheet')
              .replace(/\bhtml\b/g, '#preview-canvas');
            printMediaCss += transformed + '\n';
          });
        }
      });

      const paperExactStyles = `
        <style id="studio-paper-exact-spec">
          ${printMediaCss}
          .preview-canvas .a4-sheet,
          #preview-canvas .a4-sheet,
          .a4-sheet {
            box-sizing: border-box !important;
            padding-top: ${pageVMargin}mm !important;
            padding-bottom: ${pageVMargin}mm !important;
            padding-left: ${pageLMargin}mm !important;
            padding-right: ${pageSMargin}mm !important;
            font-size: 9.5pt !important;
            line-height: 1.42 !important;
          }
          .a4-sheet table.classified-table th,
          .a4-sheet table.classified-table td,
          table.classified-table th,
          table.classified-table td {
            padding: 0.35rem 0.5rem !important;
            font-size: 9.25pt !important;
            line-height: 1.38 !important;
          }
          .a4-sheet .table-wrapper {
            margin: 0.25rem 0 !important;
            overflow: visible !important;
          }
          .a4-sheet .section-card {
            break-inside: auto !important;
          }
        </style>
      `;

      paginateDomIntoA4Sheets(canvas, `${styles}\n${paperExactStyles}`, bodyHtml);
    } else {
      const tempDoc = parser.parseFromString(bodyHtml, 'text/html');
      const tempBody = tempDoc.body;
      if (tempBody) {
        const sheets = tempBody.querySelectorAll('.a4-sheet');
        if (sheets.length > 0) {
          const frag = document.createDocumentFragment();
          sheets.forEach(s => {
            s.querySelectorAll('.a4-page-badge').forEach(b => b.remove());
            while (s.firstChild) frag.appendChild(s.firstChild);
            s.remove();
          });
          tempBody.appendChild(frag);
        }
        tempBody.querySelectorAll('.a4-page-badge').forEach(b => b.remove());
        canvas.innerHTML = styles + '\n' + tempBody.innerHTML;
      } else {
        canvas.innerHTML = styles + '\n' + bodyHtml;
      }
    }

    canvas.contentEditable = isVisualEditActive ? 'true' : 'false';
    canvas.classList.toggle('preview-editing', isVisualEditActive);

    // In continuous mode, render KaTeX formulas. (In A4 mode, math is pre-rendered once during pagination).
    if (viewportMode !== 'a4') {
      renderMathSync(canvas);
    }
    if (isVisualEditActive) {
      bindInteractiveImagesInPreview();
    }

    // Always synchronize ink layer pointer events and cursors to match the current pen mode state
    penEngine.ensureAllLayers();

    // Preserve selected image highlight if any
    if (selectedWidgetIdRef.current) {
      const activeEl = canvas.querySelector<HTMLElement>(`#${selectedWidgetIdRef.current}`);
      if (activeEl) {
        activeEl.classList.add('studio-selected-img');
      }
    }
  }, [
    code,
    isVisualEditActive,
    isPenModeActive,
    viewportMode,
    verticalMarginMm,
    sideMarginMm,
    totalLeftMarginMm,
    fontSizePx,
    paginateDomIntoA4Sheets,
    renderMathSync,
    bindInteractiveImagesInPreview,
    penEngine
  ]);

  const codeDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Immediate update when layout configuration (viewport mode, margins, font size) changes
  useEffect(() => {
    if (isSyncingFromCanvasRef.current) {
      isSyncingFromCanvasRef.current = false;
      return;
    }
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
      codeDebounceTimerRef.current = null;
    }
    renderLivePreview();
  }, [viewportMode, verticalMarginMm, sideMarginMm, totalLeftMarginMm, fontSizePx]);

  // Debounced update when document code changes (typing in editor) to guarantee 60 FPS typing without UI stutter
  useEffect(() => {
    if (isSyncingFromCanvasRef.current) {
      isSyncingFromCanvasRef.current = false;
      return;
    }
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
    }
    codeDebounceTimerRef.current = setTimeout(() => {
      renderLivePreview();
    }, 150);

    return () => {
      if (codeDebounceTimerRef.current) {
        clearTimeout(codeDebounceTimerRef.current);
      }
    };
  }, [code]);

  // Update canvas editing state when isVisualEditActive changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.contentEditable = isVisualEditActive ? 'true' : 'false';
    canvas.classList.toggle('preview-editing', isVisualEditActive);
    canvas.querySelectorAll<HTMLElement>('.studio-img-widget').forEach(w => {
      w.setAttribute('contenteditable', 'false');
    });
    if (!isVisualEditActive) {
      deselectAnyImage();
      flushPendingSync();
    }
  }, [isVisualEditActive, deselectAnyImage, flushPendingSync]);

  // Insert a smart interactive image widget directly at active cursor / caret or drop target
  const insertInteractiveImageWidget = useCallback((
    dataUrl: string, 
    fileName?: string, 
    align: 'left' | 'right' | 'center' | 'full' = 'center', 
    initialWidth = 280
  ) => {
    const canvas = canvasRef.current;
    const widgetId = 'studio-img-' + Date.now();
    const wrapClass = align === 'left' 
      ? 'wrap-left' 
      : (align === 'right' ? 'wrap-right' : (align === 'full' ? 'wrap-full' : 'wrap-none'));
    
    const widgetHtml = `\n<div id="${widgetId}" class="studio-img-widget ${wrapClass}" contenteditable="false" style="width: ${align === 'full' ? '100%' : `${initialWidth}px`};">\n  <img src="${dataUrl}" alt="${fileName || 'Note Diagram'}" />\n  <div class="studio-resize-handle handle-nw" draggable="false" title="Top-Left: Drag to stretch both width & height"></div>\n  <div class="studio-resize-handle handle-n" draggable="false" title="Top Edge: Drag to stretch height"></div>\n  <div class="studio-resize-handle handle-ne" draggable="false" title="Top-Right: Drag to stretch both width & height"></div>\n  <div class="studio-resize-handle handle-e" draggable="false" title="Right Edge: Drag to stretch width"></div>\n  <div class="studio-resize-handle handle-se" draggable="false" title="Bottom-Right: Drag to stretch both width & height"></div>\n  <div class="studio-resize-handle handle-s" draggable="false" title="Bottom Edge: Drag to stretch height"></div>\n  <div class="studio-resize-handle handle-sw" draggable="false" title="Bottom-Left: Drag to stretch both width & height"></div>\n  <div class="studio-resize-handle handle-w" draggable="false" title="Left Edge: Drag to stretch width"></div>\n</div>\n`;

    if (!canvas) {
      if (onCodeChange) onCodeChange((code || '') + widgetHtml);
      return;
    }

    let inserted = false;

    // 1. If user had an active caret position in text / strings, insert right at that exact location!
    if (lastCaretRangeRef.current && canvas.contains(lastCaretRangeRef.current.commonAncestorContainer)) {
      try {
        const range = lastCaretRangeRef.current;
        const temp = document.createElement('div');
        temp.innerHTML = widgetHtml;
        const newEl = temp.firstElementChild;
        if (newEl) {
          // If caret is inside a paragraph/heading block, insert right after or split it
          const blockParent = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : (range.commonAncestorContainer as HTMLElement);

          if (blockParent && blockParent !== canvas && canvas.contains(blockParent)) {
            blockParent.parentNode?.insertBefore(newEl, blockParent.nextSibling);
          } else {
            range.insertNode(newEl);
          }
          inserted = true;
        }
      } catch (e) {
        inserted = false;
      }
    }

    // 2. If a widget was currently selected, insert after it
    if (!inserted && selectedWidgetId) {
      const activeEl = document.getElementById(selectedWidgetId);
      if (activeEl) {
        activeEl.insertAdjacentHTML('afterend', widgetHtml);
        inserted = true;
      }
    }

    // 3. Fallback: insert after first heading or paragraph in the note
    if (!inserted) {
      const targetAnchor = canvas.querySelector('h2, h3, h1, p');
      if (targetAnchor) {
        targetAnchor.insertAdjacentHTML('afterend', widgetHtml);
        inserted = true;
      } else {
        canvas.insertAdjacentHTML('beforeend', widgetHtml);
      }
    }

    bindInteractiveImagesInPreview();
    syncPreviewCanvasToEditor();

    setTimeout(() => {
      const newEl = document.getElementById(widgetId);
      if (newEl) {
        selectImageWidget(newEl);
        updateToolbarPosition();
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }, [code, onCodeChange, selectedWidgetId, bindInteractiveImagesInPreview, syncPreviewCanvasToEditor, selectImageWidget, updateToolbarPosition]);

  // Handle direct image insertion from uploads, drag-and-drop, or paste
  const handleDirectInsertImage = useCallback(async (
    dataUrl: string, 
    fileName?: string, 
    align: 'left' | 'right' | 'center' | 'full' = 'right'
  ) => {
    const compressed = await compressImageForDocument(dataUrl);
    insertInteractiveImageWidget(compressed, fileName, align);
  }, [insertInteractiveImageWidget]);

  // Floating Context Toolbar Handlers
  const handleSetImageWrap = (mode: 'left' | 'right' | 'none' | 'full') => {
    if (!selectedWidgetId) return;
    const widget = document.getElementById(selectedWidgetId);
    if (!widget) return;
    widget.classList.remove('wrap-left', 'wrap-right', 'wrap-none', 'wrap-full');
    if (mode === 'full') {
      widget.classList.add('wrap-full');
      widget.style.width = '100%';
    } else {
      widget.classList.add(`wrap-${mode}`);
      if (widget.style.width === '100%') {
        widget.style.width = '360px';
      }
    }
    updateToolbarPosition();
    syncPreviewCanvasToEditor();
  };

  const handleScaleImage = (ratio: number) => {
    if (!selectedWidgetId) return;
    const widget = document.getElementById(selectedWidgetId);
    const canvas = canvasRef.current;
    if (!widget || !canvas) return;
    const canvasW = canvas.clientWidth || 600;
    widget.classList.remove('wrap-full');
    widget.style.width = `${Math.round(canvasW * ratio)}px`;
    widget.style.height = 'auto';
    const img = widget.querySelector('img');
    if (img) {
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
    }
    updateToolbarPosition();
    syncPreviewCanvasToEditor();
  };

  const handleResetImageRatio = () => {
    if (!selectedWidgetId) return;
    const widget = document.getElementById(selectedWidgetId);
    if (!widget) return;
    widget.style.height = 'auto';
    const img = widget.querySelector('img');
    if (img) {
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
    }
    updateToolbarPosition();
    syncPreviewCanvasToEditor();
  };

  const handleMoveImageUpDown = (direction: number) => {
    if (!selectedWidgetId) return;
    const widget = document.getElementById(selectedWidgetId);
    if (!widget || !widget.parentNode) return;
    const parent = widget.parentNode;
    if (direction < 0 && widget.previousElementSibling) {
      parent.insertBefore(widget, widget.previousElementSibling);
    } else if (direction > 0 && widget.nextElementSibling) {
      parent.insertBefore(widget.nextElementSibling, widget);
    }
    widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateToolbarPosition();
    syncPreviewCanvasToEditor();
  };

  const handleDeleteSelectedImage = () => {
    if (!selectedWidgetId) return;
    const widget = document.getElementById(selectedWidgetId);
    if (widget) {
      widget.remove();
      deselectAnyImage();
      syncPreviewCanvasToEditor();
    }
  };

  // Text selection tracking for Slant AI edit popover
  const handleSelectionCheck = useCallback(() => {
    // When in pen mode, completely bypass selection check to keep canvas plain and static
    if (isPenModeActive) {
      setPreviewSelection('');
      setSelectionRect(null);
      return;
    }
    updateCaretTracking();
    const sel = window.getSelection();
    const winSel = sel?.toString().trim();
    if (winSel && winSel.length > 1 && canvasRef.current) {
      const anchor = sel?.anchorNode ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
      if (anchor && canvasRef.current.contains(anchor)) {
        setPreviewSelection(winSel);
        const rect = getDomSelectionBoundingRect(canvasRef.current);
        if (rect) setSelectionRect(rect);
        if (onPreviewTextSelected) onPreviewTextSelected(winSel);
        return;
      }
    }
    setPreviewSelection('');
    setSelectionRect(null);
  }, [onPreviewTextSelected, updateCaretTracking, isPenModeActive]);

  const handleMouseUp = useCallback(() => {
    if (isPenModeActive) return;
    setTimeout(handleSelectionCheck, 60);
  }, [handleSelectionCheck, isPenModeActive]);

  useEffect(() => {
    if (activeSelectionPane !== 'preview') {
      setPreviewSelection('');
      setSelectionRect(null);
    }
  }, [activeSelectionPane]);

  // Imperative handle for parent components
  useImperativeHandle(ref, () => ({
    scrollToHeading: (headingText: string, headingIndex?: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !headingText.trim()) return;
      const cleanHead = headingText.trim().toLowerCase();
      const headings = Array.from(canvas.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      const target = headings.find((h, idx) => {
        if (headingIndex !== undefined && idx === headingIndex) return true;
        return h.textContent?.trim().toLowerCase().includes(cleanHead);
      });
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('heading-highlight-flash');
        setTimeout(() => target.classList.remove('heading-highlight-flash'), 2000);
      }
    },
    insertSnippetAtCaret: (snippet: string) => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && canvasRef.current?.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const temp = document.createElement('div');
        temp.innerHTML = snippet;
        const frag = document.createDocumentFragment();
        let node: Node | null;
        let lastNode: Node | null = null;
        while ((node = temp.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        syncPreviewCanvasToEditor();
      } else if (canvasRef.current) {
        canvasRef.current.insertAdjacentHTML('beforeend', snippet);
        syncPreviewCanvasToEditor();
      }
    },
    insertImage: (dataUrl: string, fileName?: string, align?: 'left' | 'right' | 'center' | 'full') => {
      handleDirectInsertImage(dataUrl, fileName, align);
    },
    getCleanHtmlForPrint: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      const clone = canvas.cloneNode(true) as HTMLElement;
      // Strip editor overlay UI
      clone.querySelectorAll(
        '.studio-resize-handle, .studio-resize-badge, #image-context-toolbar, .image-context-toolbar, .studio-drop-indicator-line, .a4-page-badge'
      ).forEach(el => el.remove());
      // Clean selection classes and contenteditable
      clone.classList.remove('preview-editing');
      clone.removeAttribute('contenteditable');
      clone.querySelectorAll('.studio-selected-img').forEach(el => el.classList.remove('studio-selected-img'));
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

      // Ensure exact stretched dimensions on custom-height image widgets
      clone.querySelectorAll<HTMLElement>('.studio-img-widget').forEach(w => {
        w.removeAttribute('draggable');
        const innerImg = w.querySelector('img');
        if (innerImg) {
          if (w.style.height) {
            w.style.overflow = 'hidden';
            innerImg.style.setProperty('width', '100%', 'important');
            innerImg.style.setProperty('height', '100%', 'important');
            innerImg.style.setProperty('max-height', '100%', 'important');
            innerImg.style.setProperty('object-fit', 'fill', 'important');
            innerImg.style.setProperty('display', 'block', 'important');
          } else {
            innerImg.style.width = '100%';
            innerImg.style.height = 'auto';
          }
        }
      });

      // In A4 mode, preserve .a4-sheet pages and split tables so exact preview layout is printed. In continuous mode, unwrap for flowing print.
      if (viewportMode !== 'a4') {
        const sheets = clone.querySelectorAll('.a4-sheet');
        if (sheets.length > 0) {
          const fragment = document.createDocumentFragment();
          sheets.forEach(sheet => {
            while (sheet.firstChild) {
              fragment.appendChild(sheet.firstChild);
            }
            sheet.remove();
          });
          clone.appendChild(fragment);
        }

        // Re-merge any split tables
        const splits = clone.querySelectorAll('[data-split-id]');
        const splitMap: Record<string, HTMLElement> = {};
        splits.forEach(el => {
          const sid = el.getAttribute('data-split-id');
          if (!sid) return;
          if (!splitMap[sid]) {
            splitMap[sid] = el as HTMLElement;
            el.removeAttribute('data-split-id');
            el.removeAttribute('data-split-tag');
          } else {
            const primary = splitMap[sid];
            const tbody = el.querySelector('tbody');
            const primaryTbody = primary.querySelector('tbody') || primary;
            if (tbody) {
              while (tbody.firstChild) primaryTbody.appendChild(tbody.firstChild);
            } else {
              while (el.firstChild) primary.appendChild(el.firstChild);
            }
            el.remove();
          }
        });
      }

      return clone.innerHTML;
    },
    getExactPrintDocument: (docTitle = 'Document Note') => {
      const canvas = canvasRef.current;
      if (!canvas) return '';

      const { verticalMm: pageVMargin, sideMm: pageSMargin, leftMm: pageLMargin } = getDocumentPageMargins(
        code || '',
        verticalMarginMm,
        sideMarginMm,
        totalLeftMarginMm
      );

      // STRICT USER REQUIREMENT: Always use the authentic Paper mode structure for printing,
      // regardless of whether the user is currently viewing in Fluid mode or Paper mode.
      let clone: HTMLElement;

      if (viewportMode === 'a4' && canvas.querySelector('.a4-sheet')) {
        // Already rendered in Paper mode: clone live canvas directly
        clone = canvas.cloneNode(true) as HTMLElement;
      } else {
        // In Fluid mode, Editor mode, or Split mode: synthesize the exact authentic Paper mode DOM structure
        const tempContainer = document.createElement('div');
        tempContainer.className = 'preview-canvas a4-paper-sheet';
        tempContainer.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;visibility:hidden;pointer-events:none;';
        document.body.appendChild(tempContainer);

        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(code || '', 'text/html');
          const styleTags = Array.from(doc.querySelectorAll('style')).map(s => s.outerHTML).join('\n');
          const linkTags = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => l.outerHTML).join('\n');
          const styles = `${linkTags}\n${styleTags}`;
          doc.body?.querySelectorAll('style, link').forEach(s => s.remove());
          const bodyHtml = doc.body ? doc.body.innerHTML : (code || '');

          let printMediaCss = '';
          Array.from(doc.querySelectorAll('style')).forEach(s => {
            const text = s.textContent || '';
            const printMatches = text.match(/@media\s+print\s*\{([\s\S]*?)\}(?=\s*(@media|\/|$|\}))/gi) ||
                                 text.match(/@media\s+print\s*\{([\s\S]*)\}/gi);
            if (printMatches) {
              printMatches.forEach(block => {
                const inner = block.replace(/^@media\s+print\s*\{/i, '').replace(/\}$/, '');
                // Strip any body/html padding or margin rules meant solely for printer paper drivers
                const sanitizedInner = inner.replace(/(\bbody\s*\{)([^}]*)(\})/gi, (_m, prefix, props, suffix) => {
                  const cleanProps = props
                    .replace(/(^|;)\s*padding[^;]+;?/gi, ';')
                    .replace(/(^|;)\s*margin[^;]+;?/gi, ';');
                  return `${prefix}${cleanProps}${suffix}`;
                });
                const transformed = sanitizedInner
                  .replace(/\bbody\b/g, '.a4-sheet')
                  .replace(/\bhtml\b/g, '#preview-canvas');
                printMediaCss += transformed + '\n';
              });
            }
          });

          const paperExactStyles = `
            <style id="studio-paper-exact-spec">
              ${printMediaCss}
              .preview-canvas .a4-sheet,
              #preview-canvas .a4-sheet,
              .a4-sheet {
                box-sizing: border-box !important;
                padding-top: ${pageVMargin}mm !important;
                padding-bottom: ${pageVMargin}mm !important;
                padding-left: ${pageLMargin}mm !important;
                padding-right: ${pageSMargin}mm !important;
                font-size: 9.5pt !important;
                line-height: 1.42 !important;
              }
              .a4-sheet table.classified-table th,
              .a4-sheet table.classified-table td,
              table.classified-table th,
              table.classified-table td {
                padding: 0.35rem 0.5rem !important;
                font-size: 9.25pt !important;
                line-height: 1.38 !important;
              }
              .a4-sheet .table-wrapper {
                margin: 0.25rem 0 !important;
                overflow: visible !important;
              }
              .a4-sheet .section-card {
                break-inside: auto !important;
              }
            </style>
          `;

          paginateDomIntoA4Sheets(tempContainer, `${styles}\n${paperExactStyles}`, bodyHtml);

          // Copy any ink strokes drawn in canvas to tempContainer
          const liveInkLayers = canvas.querySelectorAll<SVGSVGElement>('.studio-ink-layer');
          liveInkLayers.forEach(ink => {
            if (ink.querySelector('.studio-ink-stroke')) {
              tempContainer.appendChild(ink.cloneNode(true));
            }
          });

          clone = tempContainer.cloneNode(true) as HTMLElement;
        } finally {
          if (tempContainer.parentNode) {
            tempContainer.parentNode.removeChild(tempContainer);
          }
        }
      }

      // In Paper mode, preserve .a4-sheet containers so printed output matches the exact multi-page preview layout 1:1.
      // Strip UI page badges from sheets before printing
      clone.querySelectorAll('.a4-page-badge').forEach(b => b.remove());

      // 2. Strip editor-only overlays and UI handles
      clone.querySelectorAll(
        '.studio-resize-handle, .studio-resize-badge, #image-context-toolbar, .image-context-toolbar, .studio-drop-indicator-line, .no-print'
      ).forEach(el => el.remove());

      // 3. Clean interactive editing attributes and classes (including screen-width classes that squish print)
      clone.classList.remove('preview-editing', 'pen-mode-active', 'is-compact-preview', 'is-mobile-preview');
      clone.removeAttribute('contenteditable');
      clone.removeAttribute('suppresscontenteditablewarning');
      clone.querySelectorAll('.studio-selected-img').forEach(el => el.classList.remove('studio-selected-img'));
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

      // 4. Ensure exact stretched dimensions on custom-height image widgets
      clone.querySelectorAll<HTMLElement>('.studio-img-widget').forEach(w => {
        w.removeAttribute('draggable');
        const innerImg = w.querySelector('img');
        if (innerImg) {
          if (w.style.height) {
            w.style.overflow = 'hidden';
            innerImg.style.setProperty('width', '100%', 'important');
            innerImg.style.setProperty('height', '100%', 'important');
            innerImg.style.setProperty('max-height', '100%', 'important');
            innerImg.style.setProperty('object-fit', 'fill', 'important');
            innerImg.style.setProperty('display', 'block', 'important');
          } else {
            innerImg.style.width = '100%';
            innerImg.style.height = 'auto';
          }
        }
      });

      // 5. Ensure all ink layers have pointer-events: none and exact positioning
      clone.querySelectorAll<SVGSVGElement>('.studio-ink-layer').forEach(layer => {
        if (!layer.querySelector('.studio-ink-stroke')) {
          layer.remove();
          return;
        }
        layer.style.position = 'absolute';
        layer.style.inset = '0';
        layer.style.top = '0';
        layer.style.left = '0';
        layer.style.width = '100%';
        layer.style.height = '100%';
        layer.style.overflow = 'visible';
        layer.style.zIndex = '99';
        layer.style.pointerEvents = 'none';
      });

      // 6. Gather all <link> and <style> from document.head
      const headStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => el.outerHTML)
        .join('\n');

      const isA4 = viewportMode === 'a4' || clone.querySelectorAll('.a4-sheet').length > 0;

      // 7. Authoritative 1:1 WYSIWYG Print Stylesheet
      // Note: !important is strictly forbidden on descriptors inside @page rules per W3C spec; using it causes Chrome to discard the margin declaration!
      const printSpecCss = `
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @page :first {
          margin: 0;
        }
        @page :left {
          margin: 0;
        }
        @page :right {
          margin: 0;
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          width: 210mm !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          width: 210mm !important;
          min-width: 210mm !important;
          max-width: 210mm !important;
          font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .preview-canvas,
        #preview-canvas,
        main.preview-canvas {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          width: 210mm !important;
          min-height: auto !important;
          border: none !important;
          box-shadow: none !important;
          zoom: 1 !important;
          transform: none !important;
          font-size: ${fontSizePx}px !important;
          --doc-font-size: ${fontSizePx}px !important;
        }
        .preview-canvas .a4-sheet,
        .a4-sheet {
          position: relative !important;
          width: 210mm !important;
          min-width: 210mm !important;
          max-width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          overflow: visible !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          background: #ffffff !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          box-sizing: border-box !important;
          padding-top: ${pageVMargin}mm !important;
          padding-bottom: ${pageVMargin}mm !important;
          padding-left: ${pageLMargin}mm !important;
          padding-right: ${pageSMargin}mm !important;
          font-size: ${fontSizePx}px !important;
          --doc-font-size: ${fontSizePx}px !important;
          --doc-font-size-table: ${Math.max((fontSizePx || 14) - 2, 11)}px !important;
        }
        .preview-canvas .a4-sheet:last-child,
        .a4-sheet:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
        .notes-layout {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 1rem !important;
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .notes-layout > .full-width,
        .full-width {
          grid-column: span 2 !important;
          width: 100% !important;
        }
        .section-card {
          box-sizing: border-box !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
        }
        .section-card:not(.full-width) {
          grid-column: span 1 !important;
          width: 100% !important;
          margin: 0 !important;
        }
        /* Fallback for unrolled sheets */
        .a4-sheet > .section-card:not(.full-width),
        body > .section-card:not(.full-width) {
          display: inline-block !important;
          width: calc(50% - 6px) !important;
          vertical-align: top !important;
          margin-right: 8px !important;
          box-sizing: border-box !important;
        }
        .a4-sheet > .section-card:not(.full-width):nth-of-type(even),
        body > .section-card:not(.full-width):nth-of-type(even) {
          margin-right: 0 !important;
        }
        .table-wrapper,
        div:has(> table) {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          margin: 6px 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
          scrollbar-width: thin !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
        }
        @media print {
          .table-wrapper,
          div:has(> table) {
            overflow: visible !important;
          }
        }
        table,
        table.classified-table,
        table.academic-table {
          display: table !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          border-collapse: collapse !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
          margin-top: 4px !important;
          margin-bottom: 6px !important;
          table-layout: auto !important;
          box-sizing: border-box !important;
        }
        table th,
        table td,
        table.classified-table th,
        table.classified-table td {
          padding: 0.35rem 0.5rem !important;
          font-size: 9.25pt !important;
          line-height: 1.38 !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
          box-sizing: border-box !important;
        }
        @media (max-width: 640px) {
          table th, table td {
            padding: 4px 5px !important;
            font-size: 0.8rem !important;
          }
        }
        .is-mobile-preview table th,
        .is-mobile-preview table td {
          padding: 4px 5px !important;
          font-size: 0.8rem !important;
        }
        li {
          overflow-wrap: break-word !important;
          word-break: break-word !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .katex-display {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          max-width: 100% !important;
          -webkit-overflow-scrolling: touch !important;
          padding: 4px 0 !important;
        }
        .katex {
          max-width: 100% !important;
          white-space: normal !important;
        }
        thead {
          display: table-header-group !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        caption {
          display: table-caption !important;
          caption-side: top !important;
          text-align: left !important;
          font-weight: 700 !important;
          margin-bottom: 6px !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .preview-canvas .a4-sheet:last-of-type,
        .preview-canvas .a4-sheet:last-child,
        .a4-sheet:last-of-type,
        .a4-sheet:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
        .preview-canvas .a4-page-badge,
        .a4-page-badge {
          position: absolute !important;
          bottom: 6px !important;
          right: 14px !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          color: #94a3b8 !important;
          user-select: none !important;
          pointer-events: none !important;
          letter-spacing: 0.02em !important;
          z-index: 10 !important;
          display: block !important;
        }
        .studio-ink-layer {
          position: absolute !important;
          inset: 0 !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
          z-index: 99 !important;
          pointer-events: none !important;
        }
        .studio-ink-stroke {
          stroke-linecap: round !important;
          stroke-linejoin: round !important;
        }
        .studio-ink-stroke.is-highlighter {
          mix-blend-mode: multiply !important;
        }
        .no-print,
        .studio-resize-handle,
        .studio-resize-badge,
        .studio-drop-indicator-line,
        #image-context-toolbar {
          display: none !important;
        }
      `;

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  ${headStyles}
  <style>
    ${printSpecCss}
  </style>
</head>
<body>
  <main id="preview-canvas" class="preview-canvas a4-paper-sheet">
    ${clone.innerHTML}
  </main>
</body>
</html>`;
    },
    undoPenStroke: () => {
      penEngine.undo();
    },
    redoPenStroke: () => {
      penEngine.redo();
    },
    clearAllPenStrokes: () => {
      penEngine.clearAll();
    }
  }), [handleDirectInsertImage, syncPreviewCanvasToEditor, penEngine, viewportMode, verticalMarginMm, totalLeftMarginMm, sideMarginMm, fontSizePx, code, getDocumentPageMargins]);

  // Paste handler: inserts images directly into the strings at active caret position
  const handleContainerPaste = async (e: React.ClipboardEvent | ClipboardEvent) => {
    const clipboardData = (e as any).clipboardData;
    if (!clipboardData) return;

    updateCaretTracking();

    const items = clipboardData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            try {
              const compressed = await compressImageForDocument(file);
              handleDirectInsertImage(compressed, file.name || 'Pasted Image');
            } catch {
              const reader = new FileReader();
              reader.onload = (evt) => {
                const base64 = evt.target?.result as string;
                if (base64) handleDirectInsertImage(base64, file.name || 'Pasted Image');
              };
              reader.readAsDataURL(file);
            }
          }
          return;
        }
      }
    }

    const htmlText = clipboardData.getData('text/html');
    if (htmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const pastedImg = doc.querySelector('img');
      if (pastedImg && pastedImg.src) {
        e.preventDefault();
        handleDirectInsertImage(pastedImg.src, pastedImg.alt || 'Pasted Image');
      }
    }
  };

  // Drag and drop handlers with dropzone highlight
  const handleContainerDragOver = (e: React.DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const types = Array.from(dt.types || []);
    if (types.includes('Files') || types.includes('text/html') || types.includes('text/uri-list')) {
      e.preventDefault();
      setIsDragOverDropzone(true);
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverDropzone(false);
      setDropIndicatorTop(null);
    }
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    setIsDragOverDropzone(false);
    setDropIndicatorTop(null);
    const dt = e.dataTransfer;
    if (!dt) return;

    if (dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      if (file && file.type.indexOf('image') !== -1) {
        e.preventDefault();
        compressImageForDocument(file).then((compressed) => {
          handleDirectInsertImage(compressed, file.name);
        }).catch(() => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const base64 = evt.target?.result as string;
            if (base64) handleDirectInsertImage(base64, file.name);
          };
          reader.readAsDataURL(file);
        });
        return;
      }
    }

    const htmlText = dt.getData('text/html');
    if (htmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const draggedImg = doc.querySelector('img');
      if (draggedImg && draggedImg.src) {
        e.preventDefault();
        handleDirectInsertImage(draggedImg.src, draggedImg.alt || 'Dragged Image');
      }
    }
  };

  // Click handler to deselect images when clicking on empty canvas space
  const handleWrapperClick = (e: React.MouseEvent) => {
    if (isPenModeActive) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.studio-img-widget') && !target.closest('#image-context-toolbar')) {
      deselectAnyImage();
    }
  };

  // Prevent preview scrolling from getting trapped over wide tables, KaTeX formulas, or non-scrollable children
  const handleScrollWrapperWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isPenModeActive) return;
    const wrapper = scrollWrapperRef.current;
    if (!wrapper) return;

    // Allow pure horizontal gestures to scroll horizontal children natively
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    // Check if target is a distinct inner vertical scroll container with room to scroll
    const target = e.target as HTMLElement | null;
    const innerScroll = target?.closest('.overflow-y-auto') as HTMLElement | null;
    if (innerScroll && innerScroll !== wrapper) {
      const atTop = innerScroll.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = innerScroll.scrollTop + innerScroll.clientHeight >= innerScroll.scrollHeight - 1 && e.deltaY > 0;
      if (!atTop && !atBottom) return;
    }

    // Directly scroll the preview scroll wrapper smoothly
    if (e.deltaY !== 0) {
      wrapper.scrollTop += e.deltaY;
    }
  };

  return (
    <section 
      className="pane preview-pane"
      style={{ 
        display: viewMode === 'editor' ? 'none' : 'flex',
        flexDirection: 'column',
        width: viewMode === 'split' ? `calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        flex: viewMode === 'split' ? `0 0 calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '1 1 0%',
        maxWidth: viewMode === 'split' ? `calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Visual Canvas Edit Mode Top Banner */}
      {isVisualEditActive && (
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white text-xs font-medium z-30 shadow-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse shrink-0" />
            <span className="truncate">
              <strong>Direct DOM Edit Active:</strong> Click anywhere in strings to type inline, drag corners to resize diagrams, reorder blocks
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onTriggerInsertImage}
              className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold flex items-center gap-1 border-0 cursor-pointer transition-all active:scale-95"
              title="Insert Image into Preview Canvas"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>+ Image</span>
            </button>
            {onToggleVisualEdit && (
              <button
                type="button"
                onClick={onToggleVisualEdit}
                className="px-3 py-1 rounded-full bg-white text-emerald-900 hover:bg-emerald-50 text-[11px] font-bold border-0 cursor-pointer shadow-xs transition-all active:scale-95"
                title="Finish Visual Editing"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dedicated Preview Search Bar */}
      {isPreviewSearchOpen && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800/95 border-b border-slate-200 dark:border-zinc-700 text-xs shrink-0 z-20 shadow-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={previewSearchInputRef}
            type="text"
            value={previewSearchTerm}
            onChange={(e) => onPreviewSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) onPrevPreviewMatch();
                else onNextPreviewMatch();
              } else if (e.key === 'Escape') {
                onClosePreviewSearch();
              }
            }}
            placeholder="Find text in preview..."
            className="flex-1 min-w-[120px] px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-blue-500 text-slate-900 dark:text-white"
            autoFocus
          />
          <span className="text-[10px] text-slate-500 font-medium px-1 whitespace-nowrap">
            {previewMatchCount > 0 ? `${currentPreviewMatchIdx + 1}/${previewMatchCount}` : (previewSearchTerm ? '0/0' : '')}
          </span>
          <button
            onClick={onPrevPreviewMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Previous Match (Shift+Enter)"
            disabled={previewMatchCount === 0}
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={onNextPreviewMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Next Match (Enter)"
            disabled={previewMatchCount === 0}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={onClosePreviewSearch}
            className="round-icon"
            style={{ width: '20px', height: '20px', border: 0 }}
            title="Close Preview Search"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Direct DOM Preview Scroll Wrapper */}
      <div 
        id="preview-scroll-wrapper"
        ref={scrollWrapperRef}
        tabIndex={0}
        onClick={handleWrapperClick}
        onWheel={handleScrollWrapperWheel}
        onMouseMove={(e) => {
          lastMouseCoordsRef.current = { clientX: e.clientX, clientY: e.clientY };
        }}
        onMouseUp={handleMouseUp}
        onKeyUp={handleMouseUp}
        onPaste={handleContainerPaste}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
        className={`preview-scroll-wrapper ${viewportMode === 'a4' ? 'is-a4-mode' : ''} ${isPenModeActive ? 'pen-mode-active' : ''}`}
        data-scrollable="true"
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          flex: '1 1 0%',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          overscrollBehavior: 'contain',
          outline: 'none',
          containerType: 'inline-size',
          backgroundColor: viewportMode === 'a4' ? (isDark ? '#090d16' : '#e2e8f0') : (isDark ? '#0f172a' : '#f8fafc'),
          padding: viewportMode === 'a4' ? '28px 16px 48px' : '0',
          WebkitOverflowScrolling: 'touch',
          touchAction: isPenModeActive ? 'none' : 'pan-y pan-x',
          pointerEvents: isResizing ? 'none' : 'auto',
          userSelect: isPenModeActive ? 'none' : 'auto',
          WebkitUserSelect: isPenModeActive ? 'none' : 'auto'
        }}
      >
        {/* Visual Dropzone Overlay */}
        {isDragOverDropzone && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-500/10 dark:bg-blue-600/15 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-lg pointer-events-none transition-all duration-200">
            <div className="flex flex-col items-center gap-3 p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-800 animate-in fade-in zoom-in-95">
              <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <ImagePlus className="w-7 h-7 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Drop image here to insert</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Supports PNG, JPG, WebP, SVG, and web images</p>
              </div>
            </div>
          </div>
        )}

        {/* Glowing Drop Indicator Insertion Line (●──────────●) */}
        {dropIndicatorTop !== null && (
          <div 
            className="studio-drop-indicator-line"
            style={{ top: `${dropIndicatorTop}px` }}
          />
        )}

        {/* Direct DOM Preview Canvas (Adapts to A4 Paper 210mm x 297mm when viewportMode === 'a4') */}
        <main
          id="preview-canvas"
          ref={canvasRef}
          className={`preview-canvas ${isVisualEditActive ? 'preview-editing' : ''} ${viewportMode === 'a4' ? 'a4-paper-sheet' : ''} ${isPenModeActive ? 'pen-mode-active' : ''} ${viewportMode !== 'a4' && previewCanvasWidth < 720 ? 'is-compact-preview' : ''} ${viewportMode !== 'a4' && previewCanvasWidth < 520 ? 'is-mobile-preview' : ''}`}
          contentEditable={isVisualEditActive && !isPenModeActive ? 'true' : 'false'}
          suppressContentEditableWarning={true}
          style={{
            width: viewportMode === 'a4' ? '210mm' : '100%',
            minWidth: viewportMode === 'a4' ? '210mm' : 'auto',
            maxWidth: viewportMode === 'a4' ? 'none' : '100%',
            boxSizing: 'border-box',
            overflowX: 'visible',
            minHeight: viewportMode === 'a4' ? '297mm' : '100%',
            margin: viewportMode === 'a4' ? '0 auto' : '0',
            containerType: 'inline-size',
            backgroundColor: viewportMode === 'a4' ? 'transparent' : '#ffffff',
            color: '#0f172a',
            boxShadow: 'none',
            border: 'none',
            borderRadius: '0',
            paddingTop: viewportMode === 'a4' ? '0' : `${verticalMarginMm}mm`,
            paddingBottom: viewportMode === 'a4' ? '0' : `${verticalMarginMm}mm`,
            paddingLeft: viewportMode === 'a4' ? '0' : `${totalLeftMarginMm}mm`,
            paddingRight: viewportMode === 'a4' ? '0' : `${sideMarginMm}mm`,
            fontSize: `${fontSizePx}px`,
            zoom: `${zoomLevel}%`,
            transition: 'width 0.2s ease, margin 0.2s ease',
            userSelect: isPenModeActive ? 'none' : (isVisualEditActive ? 'text' : 'auto'),
            WebkitUserSelect: isPenModeActive ? 'none' : (isVisualEditActive ? 'text' : 'auto'),
            touchAction: isPenModeActive ? 'none' : 'auto',
            cursor: isPenModeActive 
              ? (penTool === 'eraser' ? 'pointer' : 'crosshair') 
              : (isVisualEditActive ? 'text' : 'default')
          }}
          onInput={() => {
            if (isVisualEditActive && !isPenModeActive) {
              triggerDebouncedSync();
            }
          }}
          onBlur={() => {
            if (isVisualEditActive && !isPenModeActive) {
              flushPendingSync();
            }
          }}
        />

        {/* Floating Context Toolbar for Selected Image Widget */}
        {/* Image Context Toolbar */}
        {!isPenModeActive && isVisualEditActive && selectedWidgetId && toolbarCoords && (
          <div 
            id="image-context-toolbar"
            className="image-context-toolbar"
            style={{
              top: `${toolbarCoords.top}px`,
              left: `${toolbarCoords.left}px`,
              transform: 'translateX(-50%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              onClick={() => handleSetImageWrap('left')} 
              className="toolbar-btn"
              title="Wrap Left (Text flows right)"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>Left</span>
            </button>
            <button 
              type="button" 
              onClick={() => handleSetImageWrap('none')} 
              className="toolbar-btn"
              title="Center (Standalone block)"
            >
              <AlignCenter className="w-3.5 h-3.5" />
              <span>Center</span>
            </button>
            <button 
              type="button" 
              onClick={() => handleSetImageWrap('right')} 
              className="toolbar-btn"
              title="Wrap Right (Text flows left)"
            >
              <AlignRight className="w-3.5 h-3.5" />
              <span>Right</span>
            </button>
            <button 
              type="button" 
              onClick={() => handleSetImageWrap('full')} 
              className="toolbar-btn"
              title="Full Width Diagram"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full</span>
            </button>
            <span className="toolbar-divider" />
            <button 
              type="button" 
              onClick={handleResetImageRatio} 
              className="toolbar-btn text-[10px]"
              title="Reset stretch & restore natural aspect ratio"
            >
              Auto
            </button>
            <span className="toolbar-divider" />
            <button 
              type="button" 
              onClick={() => handleMoveImageUpDown(-1)} 
              className="toolbar-btn"
              title="Move Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button 
              type="button" 
              onClick={() => handleMoveImageUpDown(1)} 
              className="toolbar-btn"
              title="Move Down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <span className="toolbar-divider" />
            <button 
              type="button" 
              onClick={handleDeleteSelectedImage} 
              className="toolbar-btn text-rose-400 hover:text-rose-300"
              title="Delete Image"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Floating Zoom Controls Pill */}
        <HtmlNotesZoomControls
          zoomLevel={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
        />

        {/* Floating Slant AI Edit Popover for Preview Canvas */}
        {!isPenModeActive && previewSelection && selectionRect && onSubmitSlantEdit && (
          <HtmlNotesSlantEditPopover
            selectedText={previewSelection}
            position={{ top: selectionRect.top, left: selectionRect.left }}
            onClose={() => {
              setPreviewSelection('');
              setSelectionRect(null);
              if (onPreviewTextSelected) onPreviewTextSelected('');
            }}
            onSubmitEdit={onSubmitSlantEdit}
            isLoading={Boolean(isSlantLoading)}
            onOpenFullAiPanel={onOpenFullAiPanel}
            paneMode="preview"
          />
        )}
      </div>
    </section>
  );
});
