import { useEffect, useRef, useCallback } from 'react';
import type { PenToolType } from '../components/HtmlNotesPenToolbar';

interface UseDirectCanvasPenOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  isPenModeActive: boolean;
  penTool: PenToolType;
  penColor: string;
  penWidth: number;
  viewportMode: string;
  onSyncToEditor: () => void;
}

export function useDirectCanvasPen({
  canvasRef,
  isPenModeActive,
  penTool,
  penColor,
  penWidth,
  viewportMode,
  onSyncToEditor
}: UseDirectCanvasPenOptions) {
  const isDrawingRef = useRef<boolean>(false);
  const activeSvgRef = useRef<SVGSVGElement | null>(null);
  const activePathRef = useRef<SVGPathElement | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; pressure: number }>>([]);
  const capturedElementRef = useRef<Element | null>(null);

  const undoStackRef = useRef<Array<{ action: 'add' | 'remove'; node: SVGPathElement; parent: SVGSVGElement }>>([]);
  const redoStackRef = useRef<Array<{ action: 'add' | 'remove'; node: SVGPathElement; parent: SVGSVGElement }>>([]);

  const isPenModeActiveRef = useRef<boolean>(isPenModeActive);
  isPenModeActiveRef.current = isPenModeActive;

  const penToolRef = useRef<PenToolType>(penTool);
  penToolRef.current = penTool;

  const penColorRef = useRef<string>(penColor);
  penColorRef.current = penColor;

  const penWidthRef = useRef<number>(penWidth);
  penWidthRef.current = penWidth;

  const onSyncToEditorRef = useRef<() => void>(onSyncToEditor);
  onSyncToEditorRef.current = onSyncToEditor;

  const ensureInkLayer = useCallback((container: HTMLElement): SVGSVGElement | null => {
    if (!container) return null;

    const computedPos = window.getComputedStyle(container).position;
    if (!computedPos || computedPos === 'static') {
      container.style.position = 'relative';
    }

    let layer = Array.from(container.children).find(
      (c): c is SVGSVGElement => c.tagName.toUpperCase() === 'SVG' && c.classList.contains('studio-ink-layer')
    ) || null;

    const isA4 = container.classList.contains('a4-sheet') || container.classList.contains('a4-paper-sheet');

    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      layer.setAttribute('class', 'studio-ink-layer');
      layer.setAttribute('preserveAspectRatio', 'none');

      if (isA4) {
        layer.setAttribute('viewBox', '0 0 794 1123');
      } else {
        const w = Math.max(container.clientWidth || container.offsetWidth || 800, 100);
        const h = Math.max(container.scrollHeight || container.offsetHeight || 1100, 100);
        layer.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
        layer.style.height = `${Math.round(h)}px`;
      }
      container.appendChild(layer);
    } else if (!isA4) {
      // In continuous mode, update height and viewBox dynamically as document height changes
      const w = Math.max(container.clientWidth || container.offsetWidth || 800, 100);
      const h = Math.max(container.scrollHeight || container.offsetHeight || 1100, 100);
      layer.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
      layer.style.height = `${Math.round(h)}px`;
    }

    const currentPenActive = isPenModeActiveRef.current;
    const currentTool = penToolRef.current;

    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.top = '0';
    layer.style.left = '0';
    layer.style.width = '100%';
    if (isA4) {
      layer.style.height = '100%';
    }
    layer.style.overflow = 'visible';
    layer.style.zIndex = '99';
    layer.style.touchAction = currentPenActive ? 'none' : 'auto';
    layer.style.pointerEvents = currentPenActive ? 'auto' : 'none';
    layer.style.cursor = currentPenActive 
      ? (currentTool === 'eraser' 
          ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='rgba(239,68,68,0.2)' stroke='%23ef4444' stroke-width='2' stroke-dasharray='3 2'/%3E%3Ccircle cx='12' cy='12' r='2' fill='%23ef4444'/%3E%3C/svg%3E") 12 12, crosshair` 
          : 'crosshair')
      : 'default';

    const strokes = layer.querySelectorAll<SVGElement>('.studio-ink-stroke');
    strokes.forEach(s => {
      s.style.pointerEvents = currentPenActive ? 'auto' : 'none';
      s.style.cursor = currentPenActive ? (currentTool === 'eraser' ? 'pointer' : 'crosshair') : 'default';
    });

    return layer;
  }, []);

  const ensureAllLayers = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isPenModeActiveRef.current) {
      canvas.contentEditable = 'false';
      canvas.style.userSelect = 'none';
      canvas.style.setProperty('-webkit-user-select', 'none');
      canvas.style.touchAction = 'none';
      canvas.classList.add('pen-mode-active');
      canvas.classList.remove('preview-editing');

      const sheets = canvas.querySelectorAll<HTMLElement>('.a4-sheet');
      if (sheets.length > 0) {
        sheets.forEach(s => ensureInkLayer(s));
      } else {
        ensureInkLayer(canvas);
      }
    } else {
      canvas.style.userSelect = '';
      canvas.style.removeProperty('-webkit-user-select');
      canvas.style.touchAction = '';
      canvas.classList.remove('pen-mode-active');
      canvas.classList.remove('studio-pen-eraser');
      canvas.classList.remove('studio-pen-active');

      const layers = canvas.querySelectorAll<SVGSVGElement>('.studio-ink-layer');
      layers.forEach(l => {
        l.style.pointerEvents = 'none';
        l.style.cursor = 'default';
      });
      const strokes = canvas.querySelectorAll<SVGElement>('.studio-ink-stroke');
      strokes.forEach(s => {
        s.style.pointerEvents = 'none';
        s.style.cursor = 'default';
      });
    }
  }, [canvasRef, ensureInkLayer]);

  // Synchronize canvas state when isPenModeActive or penTool changes
  useEffect(() => {
    ensureAllLayers();
  }, [isPenModeActive, penTool, ensureAllLayers]);

  const getLocalSvgCoordinates = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const transformed = pt.matrixTransform(ctm.inverse());
        if (transformed && !isNaN(transformed.x) && !isNaN(transformed.y)) {
          return { x: transformed.x, y: transformed.y };
        }
      }
    } catch (_) {}

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = (viewBox && viewBox.width > 0) ? viewBox.width / rect.width : 1;
    const scaleY = (viewBox && viewBox.height > 0) ? viewBox.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const generatePathData = (points: Array<{ x: number; y: number; pressure: number }>) => {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.2).toFixed(1)} ${(p.y + 0.2).toFixed(1)}`;
    }
    if (points.length === 2) {
      return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
    }

    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
  };

  const isErasingRef = useRef<boolean>(false);

  const eraseStrokesNear = (clientX: number, clientY: number, radius = 20): boolean => {
    let removedAny = false;
    const hitStrokes: SVGPathElement[] = [];

    // 1. Fast multi-point radial check using elementsFromPoint
    const offsets = [
      [0, 0],
      [-7, 0], [7, 0], [0, -7], [0, 7],
      [-14, 0], [14, 0], [0, -14], [0, 14],
      [-10, -10], [10, 10], [-10, 10], [10, -10],
      [-18, 0], [18, 0], [0, -18], [0, 18]
    ];

    for (let i = 0; i < offsets.length; i++) {
      const checkX = clientX + offsets[i][0];
      const checkY = clientY + offsets[i][1];
      const elements = document.elementsFromPoint(checkX, checkY);
      for (const el of elements) {
        if (el.classList?.contains('studio-ink-stroke')) {
          const svgPath = el as unknown as SVGPathElement;
          if (!hitStrokes.includes(svgPath)) {
            hitStrokes.push(svgPath);
          }
        }
      }
    }

    // 2. High-precision geometric distance test for any strokes near cursor bounding box
    const allStrokes = document.querySelectorAll<SVGPathElement>('.studio-ink-stroke');
    allStrokes.forEach((stroke) => {
      if (hitStrokes.includes(stroke)) return;

      const b = stroke.getBoundingClientRect();
      if (clientX < b.left - radius || clientX > b.right + radius || clientY < b.top - radius || clientY > b.bottom + radius) {
        return;
      }

      const totalLen = typeof stroke.getTotalLength === 'function' ? stroke.getTotalLength() : 0;
      if (totalLen <= 0) {
        hitStrokes.push(stroke);
        return;
      }

      const parentSvg = stroke.closest('svg');
      if (!parentSvg) return;
      const svgPt = getLocalSvgCoordinates(parentSvg, clientX, clientY);
      let svgRadius = radius;
      try {
        const ctm = parentSvg.getScreenCTM();
        if (ctm && ctm.a > 0) {
          svgRadius = radius / ctm.a;
        }
      } catch (_) {}

      const numSamples = Math.min(25, Math.max(5, Math.floor(totalLen / 12)));
      const step = totalLen / numSamples;
      let isHit = false;
      for (let s = 0; s <= totalLen; s += step) {
        const p = stroke.getPointAtLength(s);
        const dx = p.x - svgPt.x;
        const dy = p.y - svgPt.y;
        if ((dx * dx + dy * dy) <= (svgRadius * svgRadius)) {
          isHit = true;
          break;
        }
      }

      if (isHit && !hitStrokes.includes(stroke)) {
        hitStrokes.push(stroke);
      }
    });

    hitStrokes.forEach((stroke) => {
      const parent = stroke.closest('svg') as SVGSVGElement | null;
      if (parent) {
        undoStackRef.current.push({ action: 'remove', node: stroke, parent });
        redoStackRef.current = [];
        stroke.remove();
        removedAny = true;
      }
    });

    if (removedAny) {
      onSyncToEditorRef.current();
    }
    return removedAny;
  };

  // Pointer event handlers attached to window/document while pen mode is active
  useEffect(() => {
    if (!isPenModeActive) return;

    const handlePointerDown = (e: PointerEvent) => {
      // 1. Never intercept events on the pen toolbar or its controls
      const targetEl = e.target as HTMLElement;
      if (targetEl?.closest?.('[data-pen-toolbar="true"]') || targetEl?.closest?.('.pen-toolbar-container')) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const targetNode = e.target as Node;
      if (!canvas.contains(targetNode)) return;

      // Primary click / pen tip only
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      e.preventDefault();
      e.stopPropagation();

      // Clear any text selection immediately to keep canvas static and plain
      try {
        window.getSelection()?.removeAllRanges();
      } catch (_) {}

      // Eraser Tool Handler
      if (penToolRef.current === 'eraser') {
        isErasingRef.current = true;
        eraseStrokesNear(e.clientX, e.clientY, 20);
        return;
      }

      // Find nearest container (.a4-sheet or preview-canvas)
      const container = (targetEl.closest('.a4-sheet') || 
                         targetEl.closest('.studio-ink-layer')?.parentElement || 
                         canvas.querySelector('.a4-sheet') || 
                         canvas) as HTMLElement;

      const svg = ensureInkLayer(container);
      if (!svg) return;

      activeSvgRef.current = svg;
      isDrawingRef.current = true;
      pointsRef.current = [];

      const coords = getLocalSvgCoordinates(svg, e.clientX, e.clientY);
      const pressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
      pointsRef.current.push({ x: coords.x, y: coords.y, pressure });

      const currentTool = penToolRef.current;
      const currentColor = penColorRef.current;
      const currentWidth = penWidthRef.current;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const isHighlighter = currentTool === 'highlighter';

      path.setAttribute('class', `studio-ink-stroke ${isHighlighter ? 'is-highlighter' : ''}`);
      path.setAttribute('stroke', currentColor);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');

      let effectiveWidth = currentWidth;
      if (currentTool === 'fountain') {
        effectiveWidth = Math.max(1.2, currentWidth * (0.6 + pressure * 0.8));
      }
      path.setAttribute('stroke-width', effectiveWidth.toString());

      if (isHighlighter) {
        path.setAttribute('stroke-opacity', '0.45');
        path.style.mixBlendMode = 'multiply';
      }

      path.setAttribute('d', generatePathData(pointsRef.current));
      svg.appendChild(path);
      activePathRef.current = path;

      try {
        targetEl.setPointerCapture(e.pointerId);
        capturedElementRef.current = targetEl;
      } catch (_) {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPenModeActiveRef.current) return;

      const targetEl = e.target as HTMLElement;
      if (targetEl?.closest?.('[data-pen-toolbar="true"]') || targetEl?.closest?.('.pen-toolbar-container')) {
        return;
      }

      // Eraser continuous scrubbing
      if (penToolRef.current === 'eraser' && (isErasingRef.current || e.buttons === 1 || e.pressure > 0)) {
        eraseStrokesNear(e.clientX, e.clientY, 20);
        return;
      }

      if (!isDrawingRef.current || !activeSvgRef.current || !activePathRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      const coords = getLocalSvgCoordinates(activeSvgRef.current, e.clientX, e.clientY);
      const pressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;

      pointsRef.current.push({ x: coords.x, y: coords.y, pressure });
      activePathRef.current.setAttribute('d', generatePathData(pointsRef.current));

      if (penToolRef.current === 'fountain' && pointsRef.current.length % 3 === 0) {
        const modulated = Math.max(1.2, penWidthRef.current * (0.6 + pressure * 0.8));
        activePathRef.current.setAttribute('stroke-width', modulated.toFixed(1));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      isErasingRef.current = false;

      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (activePathRef.current && pointsRef.current.length > 0 && activeSvgRef.current) {
        activePathRef.current.setAttribute('d', generatePathData(pointsRef.current));
        undoStackRef.current.push({
          action: 'add',
          node: activePathRef.current,
          parent: activeSvgRef.current
        });
        redoStackRef.current = [];
        onSyncToEditorRef.current();
      }

      activePathRef.current = null;
      activeSvgRef.current = null;
      pointsRef.current = [];

      try {
        if (capturedElementRef.current && (capturedElementRef.current as any).hasPointerCapture?.(e.pointerId)) {
          (capturedElementRef.current as any).releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      capturedElementRef.current = null;
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
    document.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
    document.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
    document.addEventListener('pointercancel', handlePointerUp, { passive: false, capture: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('pointermove', handlePointerMove, { capture: true });
      document.removeEventListener('pointerup', handlePointerUp, { capture: true });
      document.removeEventListener('pointercancel', handlePointerUp, { capture: true });
    };
  }, [isPenModeActive, canvasRef, ensureInkLayer]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const item = undoStackRef.current.pop()!;
    if (item.action === 'add' && item.node && item.node.parentNode) {
      redoStackRef.current.push({ action: 'add', node: item.node, parent: item.parent });
      item.node.remove();
      onSyncToEditorRef.current();
    } else if (item.action === 'remove' && item.node && item.parent) {
      redoStackRef.current.push({ action: 'remove', node: item.node, parent: item.parent });
      item.parent.appendChild(item.node);
      onSyncToEditorRef.current();
    }
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const item = redoStackRef.current.pop()!;
    if (item.action === 'add' && item.node && item.parent) {
      undoStackRef.current.push({ action: 'add', node: item.node, parent: item.parent });
      item.parent.appendChild(item.node);
      onSyncToEditorRef.current();
    } else if (item.action === 'remove' && item.node && item.node.parentNode) {
      undoStackRef.current.push({ action: 'remove', node: item.node, parent: item.parent });
      item.node.remove();
      onSyncToEditorRef.current();
    }
  }, []);

  const clearAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const strokes = Array.from(canvas.querySelectorAll<SVGPathElement>('.studio-ink-stroke'));
    if (strokes.length === 0) return;

    strokes.forEach(s => {
      undoStackRef.current.push({ action: 'remove', node: s, parent: s.parentNode as SVGSVGElement });
      s.remove();
    });
    redoStackRef.current = [];
    onSyncToEditorRef.current();
  }, [canvasRef]);

  return {
    undo,
    redo,
    clearAll,
    ensureAllLayers
  };
}
