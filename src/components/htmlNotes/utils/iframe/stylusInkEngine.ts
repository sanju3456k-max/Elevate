/**
 * Stylus Ink & Highlighter Engine for Notes Studio
 * 
 * Provides production-grade pointer-based freehand drawing, writing, and highlighting.
 * Operates completely independently from Edit Mode so string editing and text cursors
 * never conflict with stylus handwriting.
 */

export function getStylusInkEngineScript(): string {
  return `
<style id="studio-stylus-ink-styles">
  .studio-ink-layer {
    position: absolute;
    inset: 0;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none !important;
    cursor: default !important;
    overflow: visible;
    z-index: 1000;
  }
  body.studio-pen-active .studio-ink-layer {
    pointer-events: auto !important;
    touch-action: none !important;
    cursor: crosshair !important;
  }
  .studio-ink-stroke {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none !important;
    transition: opacity 0.12s ease;
  }
  body.studio-pen-active .studio-ink-stroke {
    pointer-events: auto !important;
  }
  .studio-ink-stroke.is-highlighter {
    mix-blend-mode: multiply;
  }
  body.dark .studio-ink-stroke.is-highlighter {
    mix-blend-mode: screen;
  }
  body.studio-pen-active {
    user-select: none !important;
    -webkit-user-select: none !important;
    touch-action: none !important;
    cursor: crosshair !important;
  }
  body.studio-pen-active * {
    user-select: none !important;
    -webkit-user-select: none !important;
    -webkit-touch-callout: none !important;
  }
  body.studio-pen-active.studio-pen-eraser,
  body.studio-pen-active.studio-pen-eraser .studio-ink-layer,
  body.studio-pen-active.studio-pen-eraser * {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='rgba(239,68,68,0.2)' stroke='%23ef4444' stroke-width='2' stroke-dasharray='3 2'/%3E%3Ccircle cx='12' cy='12' r='2' fill='%23ef4444'/%3E%3C/svg%3E") 12 12, crosshair !important;
  }
  body.studio-pen-active.studio-pen-eraser .studio-ink-stroke {
    cursor: pointer !important;
  }
  body.studio-pen-active.studio-pen-eraser .studio-ink-stroke:hover {
    opacity: 0.35 !important;
    stroke: #ef4444 !important;
  }
</style>
<script id="studio-stylus-ink-engine">
(function() {
  var isPenMode = false;
  var currentTool = 'pen'; // 'pen' | 'fountain' | 'highlighter' | 'eraser'
  var currentColor = '#2563eb';
  var currentWidth = 2.5;

  var isDrawing = false;
  var activeSvg = null;
  var activePath = null;
  var currentPoints = [];
  var undoStack = [];
  var redoStack = [];

  function ensureInkLayer(container) {
    if (!container) return null;
    
    // Ensure container has relative positioning so absolute SVG maps directly to it
    if (container !== document.body) {
      var pos = window.getComputedStyle(container).position;
      if (!pos || pos === 'static') {
        container.style.position = 'relative';
      }
    }

    var layer = container.querySelector(':scope > .studio-ink-layer');
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      layer.setAttribute('class', 'studio-ink-layer');
      layer.setAttribute('preserveAspectRatio', 'none');

      var isA4 = container.classList && (container.classList.contains('a4-sheet') || container.classList.contains('a4-container'));
      if (isA4) {
        layer.setAttribute('viewBox', '0 0 794 1123');
      } else {
        var rect = container.getBoundingClientRect();
        var w = Math.max(container.scrollWidth || rect.width || 800, 100);
        var h = Math.max(container.scrollHeight || rect.height || 1100, 100);
        layer.setAttribute('viewBox', '0 0 ' + Math.round(w) + ' ' + Math.round(h));
      }
      container.appendChild(layer);
    }
    return layer;
  }

  function setupAllInkLayers() {
    var sheets = document.querySelectorAll('.a4-sheet');
    if (sheets && sheets.length > 0) {
      sheets.forEach(function(s) {
        ensureInkLayer(s);
      });
    } else {
      var stage = document.querySelector('.a4-container') || 
                  document.querySelector('.a4-centering-stage') || 
                  document.querySelector('.preview-canvas') || 
                  document.body;
      ensureInkLayer(stage);
    }
  }

  function getLocalSvgCoordinates(svg, clientX, clientY) {
    try {
      var pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svg.getScreenCTM();
      if (ctm) {
        var inverse = ctm.inverse();
        var transformed = pt.matrixTransform(inverse);
        if (transformed && !isNaN(transformed.x) && !isNaN(transformed.y)) {
          return transformed;
        }
      }
    } catch (e) {}

    var rect = svg.getBoundingClientRect();
    var viewBox = svg.viewBox.baseVal;
    var scaleX = (viewBox && viewBox.width > 0) ? viewBox.width / rect.width : 1;
    var scaleY = (viewBox && viewBox.height > 0) ? viewBox.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function generatePathData(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      var p = points[0];
      return 'M ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' L ' + (p.x + 0.2).toFixed(1) + ' ' + (p.y + 0.2).toFixed(1);
    }
    if (points.length === 2) {
      return 'M ' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1) + ' L ' + points[1].x.toFixed(1) + ' ' + points[1].y.toFixed(1);
    }

    var d = 'M ' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    for (var i = 1; i < points.length - 1; i++) {
      var midX = (points[i].x + points[i + 1].x) / 2;
      var midY = (points[i].y + points[i + 1].y) / 2;
      d += ' Q ' + points[i].x.toFixed(1) + ' ' + points[i].y.toFixed(1) + ' ' + midX.toFixed(1) + ' ' + midY.toFixed(1);
    }
    var last = points[points.length - 1];
    d += ' L ' + last.x.toFixed(1) + ' ' + last.y.toFixed(1);
    return d;
  }

  function notifyDocChanged() {
    try {
      if (typeof window.notifyParentOfHtmlChange === 'function') {
        window.notifyParentOfHtmlChange(true);
      } else if (typeof window.getCleanHtml === 'function') {
        var clean = window.getCleanHtml(false);
        window.parent.postMessage({ type: 'STUDIO_HTML_UPDATE', html: clean, isFlush: true }, '*');
      }
    } catch(e) {}
  }

  var isErasing = false;

  function eraseStrokesNear(clientX, clientY, radius) {
    var r = radius || 20;
    var removedAny = false;
    var hitStrokes = [];

    // 1. Fast multi-point radial check using elementsFromPoint
    var offsets = [
      [0, 0],
      [-7, 0], [7, 0], [0, -7], [0, 7],
      [-14, 0], [14, 0], [0, -14], [0, 14],
      [-10, -10], [10, 10], [-10, 10], [10, -10],
      [-18, 0], [18, 0], [0, -18], [0, 18]
    ];

    for (var i = 0; i < offsets.length; i++) {
      var checkX = clientX + offsets[i][0];
      var checkY = clientY + offsets[i][1];
      var els = document.elementsFromPoint ? document.elementsFromPoint(checkX, checkY) : [];
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el && el.classList && el.classList.contains('studio-ink-stroke')) {
          if (hitStrokes.indexOf(el) === -1) {
            hitStrokes.push(el);
          }
        }
      }
    }

    // 2. High-precision geometric distance test for any strokes near the cursor bounding box
    var allStrokes = document.querySelectorAll('.studio-ink-stroke');
    for (var k = 0; k < allStrokes.length; k++) {
      var stroke = allStrokes[k];
      if (hitStrokes.indexOf(stroke) !== -1) continue;

      var b = stroke.getBoundingClientRect();
      if (clientX < b.left - r || clientX > b.right + r || clientY < b.top - r || clientY > b.bottom + r) {
        continue;
      }

      var totalLen = stroke.getTotalLength ? stroke.getTotalLength() : 0;
      if (totalLen <= 0) {
        hitStrokes.push(stroke);
        continue;
      }

      var parentSvg = stroke.closest('svg');
      if (!parentSvg) continue;
      var svgPt = getLocalSvgCoordinates(parentSvg, clientX, clientY);
      var svgRadius = r;
      try {
        var ctm = parentSvg.getScreenCTM();
        if (ctm && ctm.a > 0) {
          svgRadius = r / ctm.a;
        }
      } catch(e) {}

      var numSamples = Math.min(25, Math.max(5, Math.floor(totalLen / 12)));
      var step = totalLen / numSamples;
      var isHit = false;
      for (var s = 0; s <= totalLen; s += step) {
        var p = stroke.getPointAtLength(s);
        var dx = p.x - svgPt.x;
        var dy = p.y - svgPt.y;
        if ((dx * dx + dy * dy) <= (svgRadius * svgRadius)) {
          isHit = true;
          break;
        }
      }

      if (isHit && hitStrokes.indexOf(stroke) === -1) {
        hitStrokes.push(stroke);
      }
    }

    for (var h = 0; h < hitStrokes.length; h++) {
      var target = hitStrokes[h];
      var pSvg = target.parentNode;
      if (pSvg) {
        undoStack.push({ action: 'remove', node: target, parent: pSvg });
        redoStack = [];
        target.remove();
        removedAny = true;
      }
    }

    if (removedAny) {
      notifyDocChanged();
    }
    return removedAny;
  }

  function onPointerDown(e) {
    if (!isPenMode) return;

    // Palm rejection: Ignore finger touch if user is actively using stylus pen
    if (e.pointerType === 'touch' && e.pressure === 0 && isDrawing) {
      e.preventDefault();
      return;
    }

    // Eraser Tool Handler
    if (currentTool === 'eraser') {
      isErasing = true;
      eraseStrokesNear(e.clientX, e.clientY, 20);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Only respond to primary buttons (left click, pen tip, touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Find the nearest sheet container or fallback to document
    var container = e.target.closest('.a4-sheet') || 
                    e.target.closest('.studio-ink-layer')?.parentNode || 
                    document.querySelector('.a4-sheet') || 
                    document.querySelector('.a4-container') || 
                    document.body;

    activeSvg = ensureInkLayer(container);
    if (!activeSvg) return;

    isDrawing = true;
    currentPoints = [];

    var coords = getLocalSvgCoordinates(activeSvg, e.clientX, e.clientY);
    var pressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
    currentPoints.push({ x: coords.x, y: coords.y, pressure: pressure });

    activePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var isHighlighter = currentTool === 'highlighter';
    
    var strokeCls = 'studio-ink-stroke' + (isHighlighter ? ' is-highlighter' : '');
    activePath.setAttribute('class', strokeCls);
    activePath.setAttribute('stroke', currentColor);
    
    var effectiveWidth = currentWidth;
    if (currentTool === 'fountain') {
      effectiveWidth = Math.max(1.2, currentWidth * (0.6 + pressure * 0.8));
    }
    activePath.setAttribute('stroke-width', effectiveWidth.toString());

    if (isHighlighter) {
      activePath.setAttribute('stroke-opacity', '0.45');
    }

    activePath.setAttribute('d', generatePathData(currentPoints));
    activeSvg.appendChild(activePath);

    try {
      if (e.target && e.target.setPointerCapture) {
        e.target.setPointerCapture(e.pointerId);
      }
    } catch(err) {}

    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!isPenMode) return;

    // Eraser continuous scrubbing
    if (currentTool === 'eraser' && (isErasing || e.buttons === 1 || e.pressure > 0)) {
      eraseStrokesNear(e.clientX, e.clientY, 20);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!isDrawing || !activeSvg || !activePath) return;

    var coords = getLocalSvgCoordinates(activeSvg, e.clientX, e.clientY);
    var pressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
    
    currentPoints.push({ x: coords.x, y: coords.y, pressure: pressure });
    activePath.setAttribute('d', generatePathData(currentPoints));

    if (currentTool === 'fountain' && currentPoints.length % 3 === 0) {
      var modulatedWidth = Math.max(1.2, currentWidth * (0.6 + pressure * 0.8));
      activePath.setAttribute('stroke-width', modulatedWidth.toFixed(1));
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e) {
    isErasing = false;

    if (!isDrawing) return;
    isDrawing = false;

    if (activePath && currentPoints.length > 0) {
      activePath.setAttribute('d', generatePathData(currentPoints));
      undoStack.push({ action: 'add', node: activePath, parent: activeSvg });
      redoStack = [];
      notifyDocChanged();
    }

    activePath = null;
    currentPoints = [];

    try {
      if (e.target && e.target.releasePointerCapture) {
        e.target.releasePointerCapture(e.pointerId);
      }
    } catch(err) {}
  }

  function updatePenModeState(active, tool, color, width) {
    isPenMode = Boolean(active);
    if (tool) currentTool = tool;
    if (color) currentColor = color;
    if (typeof width === 'number') currentWidth = width;

    document.body.classList.toggle('studio-pen-active', isPenMode);
    document.body.classList.toggle('studio-pen-eraser', isPenMode && currentTool === 'eraser');

    if (!isPenMode) {
      document.body.classList.remove('studio-pen-active', 'studio-pen-eraser');
      var layers = document.querySelectorAll('.studio-ink-layer');
      layers.forEach(function(l) {
        l.style.pointerEvents = 'none';
        l.style.cursor = 'default';
      });
      var strokes = document.querySelectorAll('.studio-ink-stroke');
      strokes.forEach(function(s) {
        s.style.pointerEvents = 'none';
        s.style.cursor = 'default';
      });
    } else {
      setupAllInkLayers();
    }
  }

  window.applyPenModeState = updatePenModeState;

  function handleUndo() {
    if (undoStack.length === 0) return;
    var item = undoStack.pop();
    if (item.action === 'add' && item.node && item.node.parentNode) {
      redoStack.push({ action: 'add', node: item.node, parent: item.parent });
      item.node.remove();
      notifyDocChanged();
    } else if (item.action === 'remove' && item.node && item.parent) {
      redoStack.push({ action: 'remove', node: item.node, parent: item.parent });
      item.parent.appendChild(item.node);
      notifyDocChanged();
    }
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    var item = redoStack.pop();
    if (item.action === 'add' && item.node && item.parent) {
      undoStack.push({ action: 'add', node: item.node, parent: item.parent });
      item.parent.appendChild(item.node);
      notifyDocChanged();
    } else if (item.action === 'remove' && item.node && item.node.parentNode) {
      undoStack.push({ action: 'remove', node: item.node, parent: item.parent });
      item.node.remove();
      notifyDocChanged();
    }
  }

  function handleClearAll() {
    var strokes = Array.from(document.querySelectorAll('.studio-ink-stroke'));
    if (strokes.length === 0) return;

    strokes.forEach(function(s) {
      undoStack.push({ action: 'remove', node: s, parent: s.parentNode });
      s.remove();
    });
    redoStack = [];
    notifyDocChanged();
  }

  // Listen for commands from parent window
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var msg = e.data;

    if (msg.type === 'SET_PEN_MODE') {
      updatePenModeState(msg.active, msg.tool, msg.color, msg.width);
    } else if (msg.type === 'PEN_UNDO') {
      handleUndo();
    } else if (msg.type === 'PEN_REDO') {
      handleRedo();
    } else if (msg.type === 'PEN_CLEAR') {
      handleClearAll();
    }
  });

  // Attach global pointer listeners to document with capture so they execute first
  document.addEventListener('pointerdown', onPointerDown, { passive: false, capture: true });
  document.addEventListener('pointermove', onPointerMove, { passive: false, capture: true });
  document.addEventListener('pointerup', onPointerUp, { passive: false, capture: true });
  document.addEventListener('pointercancel', onPointerUp, { passive: false, capture: true });

  window.__stylusInkEngineInitialized = true;
})();
</script>
`;
}
