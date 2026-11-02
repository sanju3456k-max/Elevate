export function getInteractiveCanvasScript(isPreviewEditMode: boolean = false): string {
  return `
<style id="studio-interactive-styles">
  /* In preview mode with editing active, allow overflow visible so toolbars and handles are never clipped */
  .a4-sheet,
  .a4-container,
  .a4-centering-stage,
  .doc-img-wrapper {
    overflow: visible !important;
  }

  /* Edit Mode Styles */
  body.studio-preview-editable {
    user-select: auto !important;
  }
  body.studio-preview-editable .a4-sheet,
  body.studio-preview-editable .a4-container {
    outline: none !important;
    cursor: text !important;
    user-select: text !important;
  }
  body.studio-preview-editable .doc-img-wrapper,
  body.studio-preview-editable .katex,
  body.studio-preview-editable .katex-display,
  body.studio-preview-editable .katex-html,
  body.studio-preview-editable .studio-page-break-indicator-line,
  body.studio-preview-editable .studio-page-break-indicator-label,
  body.studio-preview-editable .slide-card-header-badge {
    user-select: none !important;
    -webkit-user-select: none !important;
    cursor: default !important;
  }
  body.studio-preview-editable .doc-img-toolbar,
  body.studio-preview-editable .doc-img-toolbar *,
  body.studio-preview-editable .doc-resize-handle {
    user-select: none !important;
    -webkit-user-select: none !important;
    cursor: pointer !important;
    pointer-events: auto !important;
  }
  body:not(.studio-preview-editable) {
    user-select: auto;
    cursor: default;
  }
  body:not(.studio-preview-editable) [contenteditable] {
    contenteditable: false;
  }
  body:not(.studio-preview-editable) .doc-img-toolbar,
  body:not(.studio-preview-editable) .doc-resize-handle,
  body:not(.studio-preview-editable) #studio-slide-element-toolbar {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  .studio-preview-editable p:hover,
  .studio-preview-editable h1:hover,
  .studio-preview-editable h2:hover,
  .studio-preview-editable h3:hover,
  .studio-preview-editable h4:hover,
  .studio-preview-editable h5:hover,
  .studio-preview-editable h6:hover,
  .studio-preview-editable li:hover,
  .studio-preview-editable blockquote:hover,
  .studio-preview-editable .panel:hover,
  .studio-preview-editable .callout:hover {
    outline: 1.5px dashed rgba(37, 99, 235, 0.45) !important;
    outline-offset: 3px !important;
    cursor: text !important;
  }
  .studio-preview-editable p:focus,
  .studio-preview-editable h1:focus,
  .studio-preview-editable h2:focus,
  .studio-preview-editable h3:focus,
  .studio-preview-editable h4:focus,
  .studio-preview-editable h5:focus,
  .studio-preview-editable h6:focus,
  .studio-preview-editable li:focus,
  .studio-preview-editable blockquote:focus,
  .studio-preview-editable .panel:focus,
  .studio-preview-editable .callout:focus {
    outline: 2px solid #2563eb !important;
    outline-offset: 3px !important;
    cursor: text !important;
  }
  .studio-preview-editable .studio-active-selected-element {
    outline: 2px solid #2563eb !important;
    outline-offset: 2px !important;
    border-radius: 4px !important;
    cursor: text !important;
  }
  .katex {
    user-select: all !important;
    cursor: default !important;
    font-size: 1.08em !important;
    line-height: inherit !important;
    text-rendering: optimizeLegibility !important;
  }
  .katex-display {
    user-select: all !important;
    cursor: default !important;
    font-size: 1.15em !important;
    margin: 0.75em 0 !important;
    padding: 0.2em 0 !important;
    line-height: 1.4 !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
  }
  .katex-html {
    user-select: all !important;
    cursor: default !important;
  }
  .katex .delimsizing.size1, .katex .delimsizing.size1 * { font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important; }
  .katex .delimsizing.size2, .katex .delimsizing.size2 * { font-family: KaTeX_Size2, KaTeX_Main, sans-serif !important; }
  .katex .delimsizing.size3, .katex .delimsizing.size3 * { font-family: KaTeX_Size3, KaTeX_Main, sans-serif !important; }
  .katex .delimsizing.size4, .katex .delimsizing.size4 * { font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important; }
  .katex .delimsizing.mult .delim-size1 > span { font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important; }
  .katex .delimsizing.mult .delim-size4 > span { font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important; }
  .katex .mopen:not(.delimsizing), .katex .mclose:not(.delimsizing) { font-family: KaTeX_Main, 'Inter', sans-serif !important; }
  .katex .delimsizing { font-family: KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, sans-serif; }
  .katex .mfrac .vlist-t .vlist-r .vlist > span {
    font-size: 1em !important;
  }
  .katex .mop.op-limits > .vlist-t {
    font-size: 1em !important;
  }
  .katex .mrel {
    margin-left: 0.22em !important;
    margin-right: 0.22em !important;
  }
  .katex .mbin {
    margin-left: 0.18em !important;
    margin-right: 0.18em !important;
  }

  @media print {
    *, *::before, *::after {
      resize: none !important;
      outline: none !important;
      outline-offset: 0 !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    .studio-active-selected-element,
    p, h1, h2, h3, h4, h5, h6, li, blockquote, .panel, .callout, div, span, table, td, th {
      outline: none !important;
      outline-offset: 0 !important;
    }
    table, thead, tbody, tfoot, tr, th, td {
      resize: none !important;
      overflow: visible !important;
    }
  }
</style>
<script id="studio-interactive-canvas-script">
(function() {
  window.__useCanvasImageEngine = true;
  window.__isEditModeActive = ${Boolean(isPreviewEditMode)};

  // 1. Apply Edit Mode State across all paper sheets & body
  function applyEditModeState(active) {
    var isEdit = Boolean(active);
    window.__isEditModeActive = isEdit;
    window.__isPaperEditActive = isEdit;

    if (!isEdit) {
      try {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        if (window.getSelection) {
          var sel = window.getSelection();
          if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
      } catch(e) {}

      document.body.classList.remove('studio-preview-editable');
      document.body.contentEditable = 'false';
      document.body.removeAttribute('contenteditable');

      var allSheets = document.querySelectorAll('.a4-sheet, .a4-container, .slide');
      allSheets.forEach(function(s) {
        s.contentEditable = 'false';
        s.setAttribute('contenteditable', 'false');
      });

      teardownTableResizing();
      hideSlideElementToolbar();
      if (typeof window.deselectAllImages === 'function') {
        window.deselectAllImages();
      }
    } else {
      document.body.classList.add('studio-preview-editable');

      var sheets = document.querySelectorAll('.a4-sheet, .slide');
      if (sheets.length > 0) {
        sheets.forEach(function(sheet) {
          sheet.contentEditable = 'true';
          sheet.setAttribute('contenteditable', 'true');
          sheet.style.overflow = 'visible';
        });
        document.body.contentEditable = 'false';
      } else {
        var container = document.querySelector('.a4-container') || document.body;
        container.contentEditable = 'true';
        container.setAttribute('contenteditable', 'true');
      }

      setupTableResizing();
    }

    // Explicitly set contenteditable="false" on non-text elements and widgets
    var nonEditables = document.querySelectorAll(
      '.doc-img-wrapper, .doc-img-toolbar, .doc-resize-handle, #studio-slide-element-toolbar, ' +
      '.katex, .katex-display, .katex-html, .studio-page-break-indicator-line, .studio-page-break-indicator-label, .slide-card-header-badge'
    );
    nonEditables.forEach(function(el) {
      el.setAttribute('contenteditable', 'false');
      el.contentEditable = 'false';
    });

    if (typeof window.wrapAndAttachAllImages === 'function') {
      window.wrapAndAttachAllImages();
    }
    renderKaTeXMathInDocument();
  }

  window.applyEditModeState = applyEditModeState;

  // Listen for Live Edit Mode toggles and command messages from parent window
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'SET_EDIT_MODE' || e.data.type === 'STUDIO_SET_EDIT_MODE' || e.data.type === 'SET_PREVIEW_EDIT_MODE') {
      var act = e.data.active !== undefined ? e.data.active : (e.data.enabled !== undefined ? e.data.enabled : true);
      applyEditModeState(Boolean(act));
    } else if (e.data.type === 'STUDIO_FLUSH_CHANGES') {
      notifyParentOfHtmlChange(true);
    } else if (e.data.type === 'STUDIO_RESET_DIRTY') {
      window.__isUserPreviewDirty = false;
    }
  });

  // Track if user has made an active modification inside preview
  window.__isUserPreviewDirty = false;

  // Debounce timer for in-memory live sync
  var notifyDebounceTimer = null;

  // Local-level editing: Keep DOM modifications purely in-memory while typing!
  // Reads and writes to Firestore occur ONLY when hitting Save (Ctrl+S / button) or leaving the file.
  document.addEventListener('input', function(e) {
    if (!window.__isEditModeActive) return;
    window.__isUserPreviewDirty = true;
    if (notifyDebounceTimer) clearTimeout(notifyDebounceTimer);
    notifyDebounceTimer = setTimeout(function() {
      notifyParentOfHtmlChange(false);
    }, 250);
  }, true);

  // Instantly flush changes on blur ONLY if the user actually modified content
  document.addEventListener('blur', function(e) {
    if (!window.__isEditModeActive || !window.__isUserPreviewDirty) return;
    notifyParentOfHtmlChange(true);
  }, true);

  // Capture Undo (Ctrl+Z) & Redo (Ctrl+Y / Ctrl+Shift+Z) inside iframe
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();

      if (notifyDebounceTimer) {
        clearTimeout(notifyDebounceTimer);
        notifyDebounceTimer = null;
      }
      window.__isUserPreviewDirty = false;

      if (!e.shiftKey) {
        window.parent.postMessage({ type: 'STUDIO_TRIGGER_UNDO' }, '*');
      } else {
        window.parent.postMessage({ type: 'STUDIO_TRIGGER_REDO' }, '*');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();

      if (notifyDebounceTimer) {
        clearTimeout(notifyDebounceTimer);
        notifyDebounceTimer = null;
      }
      window.__isUserPreviewDirty = false;

      window.parent.postMessage({ type: 'STUDIO_TRIGGER_REDO' }, '*');
    }
  }, true);

  function isInteractiveEditModeActive() {
    return Boolean(
      window.__isEditModeActive ||
      window.__isPaperEditActive ||
      (document.body && document.body.classList.contains('studio-preview-editable'))
    );
  }

  function isTargetEditableElement(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  // Strict keyboard blocking when Edit Mode is OFF so user can never type into the page
  document.addEventListener('keydown', function(e) {
    if (isInteractiveEditModeActive() || isTargetEditableElement(e.target)) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Tab'].indexOf(e.key) !== -1) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // Strict paste blocking when Edit Mode is OFF
  document.addEventListener('paste', function(e) {
    if (isInteractiveEditModeActive() || isTargetEditableElement(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);


  function openFile(fileId) {
    window.parent.postMessage({ type: 'STUDIO_OPEN_FILE', fileId: fileId }, '*');
  }
  window.openFile = openFile;

  // 2. KaTeX Math Auto-Render Helper & Direct TreeWalker Engine
  function resolveKaTeX() {
    var k = window.katex;
    if (!k || typeof k.renderToString !== 'function') {
      try {
        var p = window.parent !== window ? window.parent : window.opener;
        if (p && p.katex) {
          k = (p.katex && p.katex.renderToString) ? p.katex : ((p.katex && p.katex.default) || p.katex);
          window.katex = k;
        }
      } catch(e) {}
    }
    return (k && typeof k.renderToString === 'function') ? k : null;
  }

  function resolveRenderMath() {
    var fn = window.renderMathInElement;
    if (typeof fn !== 'function') {
      if (fn && typeof fn.default === 'function') {
        fn = fn.default;
        window.renderMathInElement = fn;
        return fn;
      }
      try {
        var p = window.parent !== window ? window.parent : window.opener;
        if (p && p.renderMathInElement) {
          fn = typeof p.renderMathInElement === 'function' ? p.renderMathInElement : ((p.renderMathInElement && p.renderMathInElement.default) || p.renderMathInElement);
          if (typeof fn === 'function') {
            window.renderMathInElement = fn;
            return fn;
          }
        }
      } catch(e) {}
    }
    return typeof fn === 'function' ? fn : null;
  }

  var KATEX_CANVAS_MACROS = {
    "\\ne": "\\neq",
    "\\nequal": "\\neq",
    "\\not=": "\\neq",
    "\\degree": "^\\circ",
    "\\deg": "^\\circ",
    "\\le": "\\leq",
    "\\ge": "\\geq",
    "\\cbrt": "\\sqrt[3]",
    "\\det": "\\operatorname{det}",
    "\\adj": "\\operatorname{adj}",
    "\\tr": "\\operatorname{tr}",
    "\\rank": "\\operatorname{rank}",
    "\\gcd": "\\operatorname{gcd}",
    "\\lcm": "\\lcm",
    "\\sgn": "\\operatorname{sgn}",
    "\\cosec": "\\csc",
    "\\arccot": "\\operatorname{arccot}",
    "\\arcsec": "\\operatorname{arcsec}",
    "\\arccsc": "\\operatorname{arccsc}",
    "\\sech": "\\operatorname{sech}",
    "\\csch": "\\operatorname{csch}",
    "\\var": "\\operatorname{Var}",
    "\\cov": "\\operatorname{Cov}",
    "\\diag": "\\operatorname{diag}",
    "\\sen": "\\sin",
    "\\tg": "\\tan",
    "\\cotg": "\\cot",
    "\\oiint": "\\oint\\!\\!\\oint",
    "\\oiiint": "\\oint\\!\\!\\oint\\!\\!\\oint",
    "\\idotsint": "\\int\\!\\cdots\\!\\int",
    "\\abs": "\\left|#1\\right|",
    "\\norm": "\\left\\|#1\\right\\|",
    "\\grad": "\\nabla",
    "\\curl": "\\nabla \\times",
    "\\bold": "\\mathbf{#1}",
    "\\bm": "\\boldsymbol{#1}",
    "\\implies": "\\Longrightarrow",
    "\\iff": "\\Longleftrightarrow",
    "\\R": "\\mathbb{R}",
    "\\N": "\\mathbb{N}",
    "\\Z": "\\mathbb{Z}",
    "\\C": "\\mathbb{C}",
    "\\Q": "\\mathbb{Q}"
  };

  function normalizeMathFormula(math) {
    var s = math ? math.trim() : '';
    if (!s) return '';
    s = s.replace(/\/(displaystyle|textstyle|frac|sqrt|sum|int|lim|infty|partial|mathbf|mathrm|text)\b/g, '\\$1');
    s = s.replace(/\\\\(?=(?:neq|ne|nequal|leq|le|geq|ge|pm|mp|times|cdot|div|approx|equiv|sim|propto|parallel|perp|in|notin|subset|subseteq|cap|cup|forall|exists|partial|nabla|sqrt|frac|dfrac|cfrac|sum|prod|int|lim|sin|cos|tan|cot|sec|csc|log|ln|exp|det|deg|degree|circ|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|left|right|text|mathrm|mathbf)\b)/g, '\\');

    // Normalize unicode math symbols to standard LaTeX commands
    s = s.replace(/\u222B/g, ' \\int ');
    s = s.replace(/\u222C/g, ' \\iint ');
    s = s.replace(/\u222D/g, ' \\iiint ');
    s = s.replace(/\u222E/g, ' \\oint ');
    s = s.replace(/\u2211/g, ' \\sum ');
    s = s.replace(/\u220F/g, ' \\prod ');
    s = s.replace(/\u221E/g, ' \\infty ');
    s = s.replace(/\u2260/g, ' \\neq ');
    s = s.replace(/\u2264/g, ' \\leq ');
    s = s.replace(/\u2265/g, ' \\geq ');
    s = s.replace(/\u00D7/g, ' \\times ');
    s = s.replace(/\u00F7/g, ' \\div ');
    s = s.replace(/\u00B1/g, ' \\pm ');
    s = s.replace(/\u2213/g, ' \\mp ');
    s = s.replace(/\u2248/g, ' \\approx ');
    s = s.replace(/\u2261/g, ' \\equiv ');
    s = s.replace(/\u2208/g, ' \\in ');
    s = s.replace(/\u2209/g, ' \\notin ');
    s = s.replace(/\u2282/g, ' \\subset ');
    s = s.replace(/\u2286/g, ' \\subseteq ');
    s = s.replace(/\u222A/g, ' \\cup ');
    s = s.replace(/\u2229/g, ' \\cap ');
    s = s.replace(/\u2200/g, ' \\forall ');
    s = s.replace(/\u2203/g, ' \\exists ');
    s = s.replace(/\u2202/g, ' \\partial ');
    s = s.replace(/\u2207/g, ' \\nabla ');
    s = s.replace(/\u2220/g, ' \\angle ');
    s = s.replace(/\u22A5/g, ' \\perp ');
    s = s.replace(/\u2225/g, ' \\parallel ');
    s = s.replace(/\u2192/g, ' \\to ');
    s = s.replace(/\u21D2/g, ' \\implies ');
    s = s.replace(/\u21D4/g, ' \\iff ');

    // Differential spacing: f(x)dx -> f(x) \, dx
    s = s.replace(/([0-9a-zA-Z\)\}\]\|])\s*(d[xytuvz]|d\\theta|d\\phi)\b/g, '$1 \\, $2');

    s = s.replace(/(?:^|[^\\])\[\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\]/g, '\\begin{bmatrix}$1\\end{bmatrix}');
    s = s.replace(/(?:^|[^\\])\(\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\)/g, '\\begin{pmatrix}$1\\end{pmatrix}');
    s = s.replace(/(?:^|[^\\])\|\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\|/g, '\\begin{vmatrix}$1\\end{vmatrix}');

    function scalePairs(str, o, c, l, r) {
      var out = '', idx = 0;
      while (idx < str.length) {
        if (str.indexOf(o, idx) === idx) {
          var pfx = str.slice(Math.max(0, idx - 6), idx);
          if (/\\(left|right)$/.test(pfx) || /\\$/.test(pfx)) {
            out += str.slice(idx, idx + o.length);
            idx += o.length;
            continue;
          }
          var d = 1, j = idx + o.length, tall = false;
          while (j < str.length && d > 0) {
            if (str[j] === '\\') {
              var rem = str.slice(j);
              if (/^\\(?:frac|dfrac|cfrac|tfrac|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|cases|array|int|iint|iiint|oint|oiint|oiiint|idotsint|sum|prod|coprod|lim|limsup|liminf)\b/.test(rem)) tall = true;
              j++;
              if (j < str.length && /[a-zA-Z]/.test(str[j])) {
                while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
              } else if (j < str.length) {
                j++;
              }
              continue;
            }
            if (str.indexOf(o, j) === j) { d++; j += o.length; continue; }
            else if (str.indexOf(c, j) === j) { d--; j += c.length; continue; }
            j++;
          }
          if (d === 0 && tall) {
            var inside = str.slice(idx + o.length, j - c.length);
            out += l + scalePairs(inside, o, c, l, r) + r;
            idx = j;
            continue;
          }
        }
        out += str[idx];
        idx++;
      }
      return out;
    }

    s = scalePairs(s, '(', ')', '\\left(', '\\right)');
    s = scalePairs(s, '[', ']', '\\left[', '\\right]');
    s = scalePairs(s, '\\{', '\\}', '\\left\\{', '\\right\\}');

    if (!s.startsWith('\\displaystyle') && !s.startsWith('\\textstyle')) {
      if (/\\(?:frac|dfrac|cfrac|tfrac|int|iint|iiint|oint|oiint|oiiint|idotsint|sum|prod|coprod|lim|limsup|liminf|bigcup|bigcap|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|cases|array)\b/.test(s)) {
        s = '\\displaystyle ' + s;
      }
    }

    return s;
  }

  function directRenderMathInTree(root) {
    var k = resolveKaTeX();
    if (!k || typeof k.renderToString !== 'function' || !root) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.indexOf('$') === -1 && node.nodeValue.indexOf('\\begin') === -1) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'pre' || tag === 'code') return NodeFilter.FILTER_REJECT;
        if (p.closest('.katex, .katex-display, .katex-html')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    var mathPattern = /\\$\\$([\\s\\S]+?)\\$\\$|\\$([^\\$\\n]+?)\\$|(\\begin\{(?:(?:b|p|v|V|small)?matrix|cases|aligned|array)\}[\\s\\S]+?\\end\{(?:(?:b|p|v|V|small)?matrix|cases|aligned|array)\})/g;
    for (var i = 0; i < textNodes.length; i++) {
      var tn = textNodes[i];
      var text = tn.nodeValue;
      if (!text || (text.indexOf('$') === -1 && text.indexOf('\\begin') === -1)) continue;

      mathPattern.lastIndex = 0;
      if (!mathPattern.test(text)) continue;
      mathPattern.lastIndex = 0;

      var frag = document.createDocumentFragment();
      var lastIdx = 0;
      var match;
      var hasMatch = false;

      while ((match = mathPattern.exec(text)) !== null) {
        hasMatch = true;
        var start = match.index;
        if (start > lastIdx) {
          frag.appendChild(document.createTextNode(text.substring(lastIdx, start)));
        }
        var isDisplay = Boolean(match[1] || match[3]);
        var math = normalizeMathFormula(match[1] || match[2] || match[3] || '');

        try {
          var rendered = k.renderToString(math, {
            displayMode: isDisplay,
            macros: KATEX_CANVAS_MACROS,
            throwOnError: false
          });
          var span = document.createElement('span');
          span.innerHTML = rendered;
          var kEl = span.firstElementChild || span;
          kEl.setAttribute('contenteditable', 'false');
          frag.appendChild(kEl);
        } catch(err) {
          frag.appendChild(document.createTextNode(match[0]));
        }
        lastIdx = mathPattern.lastIndex;
      }

      if (hasMatch) {
        if (lastIdx < text.length) {
          frag.appendChild(document.createTextNode(text.substring(lastIdx)));
        }
        if (tn.parentNode) {
          tn.parentNode.replaceChild(frag, tn);
        }
      }
    }
  }

  function renderKaTeXMathInDocument() {
    var fn = resolveRenderMath();
    var k = resolveKaTeX();

    if (fn) {
      try {
        fn(document.body, {
          preProcess: function(math) {
            return normalizeMathFormula(math);
          },
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\begin{equation}', right: '\\\\end{equation}', display: true},
            {left: '\\\\begin{equation*}', right: '\\\\end{equation*}', display: true},
            {left: '\\\\begin{align}', right: '\\\\end{align}', display: true},
            {left: '\\\\begin{align*}', right: '\\\\end{align*}', display: true},
            {left: '\\\\begin{matrix}', right: '\\\\end{matrix}', display: true},
            {left: '\\\\begin{pmatrix}', right: '\\\\end{pmatrix}', display: true},
            {left: '\\\\begin{bmatrix}', right: '\\\\end{bmatrix}', display: true},
            {left: '\\\\begin{gather}', right: '\\\\end{gather}', display: true},
            {left: '\\\\begin{gather*}', right: '\\\\end{gather*}', display: true},
            {left: '\\\\begin{cases}', right: '\\\\end{cases}', display: true},
            {left: '\\\\begin{CD}', right: '\\\\end{CD}', display: true}
          ],
          macros: KATEX_CANVAS_MACROS,
          processEscapes: true,
          ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
          ignoredClasses: ["katex", "katex-display", "katex-html", "katex-mathml"],
          throwOnError: false
        });
      } catch(e) {}
    }

    // Direct walker guarantees 100% of $...$ and $$...$$ are rendered immediately
    directRenderMathInTree(document.body);

    var katexEls = document.querySelectorAll('.katex, .katex-display');
    katexEls.forEach(function(kEl) { kEl.setAttribute('contenteditable', 'false'); });

    if (!fn && !k) {
      setTimeout(renderKaTeXMathInDocument, 50);
    }
  }

  window.renderKaTeXMathInDocument = renderKaTeXMathInDocument;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    renderKaTeXMathInDocument();
  } else {
    document.addEventListener('DOMContentLoaded', renderKaTeXMathInDocument);
    window.addEventListener('load', renderKaTeXMathInDocument);
  }

  // Active DOM Mutation Observer: automatically renders math when elements are added or modified
  if (!window.__katexMutationObserver && typeof MutationObserver !== 'undefined') {
    try {
      var katexDebounceTimer = null;
      var katexObserver = new MutationObserver(function(mutations) {
        var hasNewMath = false;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1 && !n.classList.contains('katex') && !n.classList.contains('katex-display') && !n.classList.contains('doc-img-toolbar')) {
                var txt = n.textContent || '';
                if (txt.indexOf('$') !== -1 || txt.indexOf('\\\\(') !== -1 || txt.indexOf('\\\\[') !== -1) {
                  hasNewMath = true;
                  break;
                }
              }
            }
          }
          if (hasNewMath) break;
        }
        if (hasNewMath) {
          if (katexDebounceTimer) clearTimeout(katexDebounceTimer);
          katexDebounceTimer = setTimeout(renderKaTeXMathInDocument, 30);
        }
      });
      katexObserver.observe(document.body, { childList: true, subtree: true });
      window.__katexMutationObserver = katexObserver;
    } catch(e) {}
  }

  // 3. Clean HTML for export to parent without temporary UI handles
  function cleanKaTeXFromClone(clone) {
    function replaceKatexNode(el, nodeToInsert) {
      var target = el;
      var scrollWrap = el.closest ? el.closest('.katex-scroll-wrapper') : null;
      if (scrollWrap) {
        target = scrollWrap;
      } else if (el.parentNode && el.parentNode.tagName === 'SPAN' && (el.parentNode.childNodes.length === 1 || el.parentNode.classList.contains('katex-display'))) {
        target = el.parentNode;
      }
      if (target.parentNode) {
        target.parentNode.replaceChild(nodeToInsert, target);
      }
    }

    // 0. Clean and repair any KaTeX parse errors so they don't persist as corrupted strings
    var errorEls = Array.from(clone.querySelectorAll('.katex-error'));
    errorEls.forEach(function(el) {
      var raw = el.textContent || '';
      raw = raw.replace(/\\?\$\\s*\\\\frac\\{\\\\frac\\{!\\}\\[?A\\]?!\\}\\s*(?:\\\\frac\\{!\\}\\[?A\\]\\}?)+BCDS/g, '$ABCD$');
      raw = raw.replace(/\\\\frac\\{\\\\frac\\{!\\}\\[?A\\]?!\\}\\s*(?:\\\\frac\\{!\\}\\[?A\\]\\}?)+BCDS/g, '$ABCD$');
      raw = raw.replace(/\\\\frac\\{\\\\frac\\{!\\}\\[?A\\]?!\\}\\s*(?:\\\\frac\\{!\\}\\[?A\\]\\}?)+/g, 'A');
      raw = raw.replace(/(?:\\\\frac\\{!\\}\\[?A\\]\\}?){2,}/g, 'A');
      raw = raw.replace(/Drac\\{1\\}\\{\\|A\\|\\}\\|\\[A\\]\\|\\\\frac\\{1\\}\\{\\|A\\|\\}\\?\\$/g, 'DA$');
      raw = raw.replace(/Drac\\{1\\}\\{\\|A\\|\\}\\|\\[A\\]\\|\\\\frac\\{1\\}\\{\\|A\\|\\}/g, 'DA');
      raw = raw.replace(/Drac\\{1\\}\\{[^}]+\\}/g, 'DA');
      raw = raw.replace(/([a-zA-Z])rac\\{1\\}\\{\\[?A\\]?\\}/g, '$1');
      raw = raw.replace(/A\\^\\{-1\\}\\s*=\\s*(?:\\\\[fF]\\s*)+/gi, 'A^{-1} = \\\\frac{1}{|A|} \\\\cdot \\\\text{adj}(A)');
      raw = raw.replace(/(?:\\\\[fF]\\s*){2,}/gi, '');
      raw = raw.replace(/(?<![\\\\a-zA-Z])rac\\{/g, '\\\\frac{');
      raw = raw.replace(/(?<![\\\\a-zA-Z])ext\\{/g, '\\\\text{');
      raw = raw.replace(/[\\x0C\\x0B]/g, '');
      var trimmed = raw.trim();
      var hasDelim = trimmed.startsWith('$') || trimmed.startsWith('\\\\(') || trimmed.startsWith('\\\\[');
      var tn = document.createTextNode(hasDelim ? trimmed : ('$' + trimmed + '$'));
      replaceKatexNode(el, tn);
    });

    // 1. Process display math first (.katex-display)
    var displayEls = Array.from(clone.querySelectorAll('.katex-display'));
    displayEls.forEach(function(el) {
      if (!clone.contains(el)) return;
      var wrap = el.closest ? el.closest('.katex-scroll-wrapper') : null;
      var annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation');
      var tex = (wrap && wrap.getAttribute('data-latex')) || el.getAttribute('data-latex') || (annotation ? annotation.textContent.trim() : (el.textContent ? el.textContent.trim() : ''));
      if (tex) {
        tex = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        tex = tex.replace(/\\\\frac\\{\\\\frac\\{!\\}\\[?A\\]?!\\}\\s*(?:\\\\frac\\{!\\}\\[?A\\]\\}?)+/g, 'A');
        tex = tex.replace(/(?:\\\\frac\\{!\\}\\[?A\\]\\}?){2,}/g, 'A');
        tex = tex.replace(/Drac\\{1\\}\\{\\|A\\|\\}\\|\\[A\\]\\|\\\\frac\\{1\\}\\{\\|A\\|\\}\\?\\$/g, 'DA$');
        tex = tex.replace(/Drac\\{1\\}\\{[^}]+\\}/g, 'DA');
        tex = tex.replace(/([a-zA-Z])rac\\{1\\}\\{\\[?A\\]?\\}/g, '$1');
        tex = tex.replace(/A\\^\\{-1\\}\\s*=\\s*(?:\\\\[fF]\\s*)+/gi, 'A^{-1} = \\\\frac{1}{|A|} \\\\cdot \\\\text{adj}(A)');
        tex = tex.replace(/(?:\\\\[fF]\\s*){2,}/gi, '');
        tex = tex.replace(/(?<![\\\\a-zA-Z])rac\\{/g, '\\\\frac{');
        tex = tex.replace(/(?<![\\\\a-zA-Z])ext\\{/g, '\\\\text{');
        tex = tex.replace(/[\\x0C\\x0B]/g, '');
        tex = tex.replace(/^\{\\\\displaystyle\s*/, '').replace(/\}$/, '').replace(/^\\\\displaystyle\s*/, '');
        var textNode = document.createTextNode(String.fromCharCode(10) + '$$ ' + tex + ' $$' + String.fromCharCode(10));
        replaceKatexNode(el, textNode);
      }
    });

    // 2. Process inline math (.katex)
    var inlineEls = Array.from(clone.querySelectorAll('.katex'));
    inlineEls.forEach(function(el) {
      if (!clone.contains(el)) return;
      var annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation');
      var tex = el.getAttribute('data-latex') || (annotation ? annotation.textContent.trim() : (el.textContent ? el.textContent.trim() : ''));
      if (tex) {
        tex = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        tex = tex.replace(/\\\\frac\\{\\\\frac\\{!\\}\\[?A\\]?!\\}\\s*(?:\\\\frac\\{!\\}\\[?A\\]\\}?)+/g, 'A');
        tex = tex.replace(/(?:\\\\frac\\{!\\}\\[?A\\]\\}?){2,}/g, 'A');
        tex = tex.replace(/Drac\\{1\\}\\{\\|A\\|\\}\\|\\[A\\]\\|\\\\frac\\{1\\}\\{\\|A\\|\\}\\?\\$/g, 'DA$');
        tex = tex.replace(/Drac\\{1\\}\\{[^}]+\\}/g, 'DA');
        tex = tex.replace(/([a-zA-Z])rac\\{1\\}\\{\\[?A\\]?\\}/g, '$1');
        tex = tex.replace(/A\\^\\{-1\\}\\s*=\\s*(?:\\\\[fF]\\s*)+/gi, 'A^{-1} = \\\\frac{1}{|A|} \\\\cdot \\\\text{adj}(A)');
        tex = tex.replace(/(?:\\\\[fF]\\s*){2,}/gi, '');
        tex = tex.replace(/(?<![\\\\a-zA-Z])rac\\{/g, '\\\\frac{');
        tex = tex.replace(/(?<![\\\\a-zA-Z])ext\\{/g, '\\\\text{');
        tex = tex.replace(/[\\x0C\\x0B]/g, '');
        tex = tex.replace(/^\{\\\\displaystyle\s*/, '').replace(/\}$/, '').replace(/^\\\\displaystyle\s*/, '');
        var textNode = document.createTextNode('$' + tex + '$');
        replaceKatexNode(el, textNode);
      }
    });

    // 3. Clean up empty/redundant span wrappers surrounding formulas
    var spanWrappers = Array.from(clone.querySelectorAll('span'));
    spanWrappers.forEach(function(sp) {
      if (!sp.classList || sp.classList.length === 0) {
        var t = (sp.textContent || '').trim();
        if (/^\\$[^\\$]+\\$$/.test(t) || /^\\$\\$[\\s\\S]+\\$\\$$/.test(t)) {
          if (sp.parentNode) {
            sp.parentNode.replaceChild(document.createTextNode(t), sp);
          }
        }
      }
    });
  }

  function getCleanHtml(preserveRenderedKaTeX) {
    var clone = document.body.cloneNode(true);

    // Remove editor handle overlays, drop indicators, tooltips, and page break indicators
    var temporaryEls = clone.querySelectorAll('.doc-img-toolbar, .doc-resize-handle, .studio-page-break-indicator-line, .studio-page-break-indicator-label, #doc-image-drop-indicator, .doc-img-dimension-tooltip, .slide-card-header-badge');
    temporaryEls.forEach(function(el) { el.remove(); });

    // Remove active element selection classes and any lingering editor outline styles from all cloned nodes
    var activeEls = clone.querySelectorAll('.studio-active-selected-element');
    activeEls.forEach(function(el) { el.classList.remove('studio-active-selected-element'); });
    var allClonedEls = clone.querySelectorAll('*');
    allClonedEls.forEach(function(el) {
      if (el.style) {
        if (el.style.outline) el.style.outline = '';
        if (el.style.outlineOffset) el.style.outlineOffset = '';
        if (el.style.boxShadow && el.style.boxShadow.indexOf('rgba(11, 87, 208') !== -1) el.style.boxShadow = '';
        if (el.style.backgroundColor && el.style.backgroundColor.indexOf('rgba(11, 87, 208') !== -1) el.style.backgroundColor = '';
        if (!el.getAttribute('style') || !el.getAttribute('style').trim()) {
          el.removeAttribute('style');
        }
      }
    });

    // Clean up KaTeX elements back into pristine $ ... $ LaTeX only if NOT preserving rendered KaTeX
    if (!preserveRenderedKaTeX) {
      cleanKaTeXFromClone(clone);
    }

    // Strip table resizer artifacts and inline cell resize/overflow styles
    var cleanTables = clone.querySelectorAll('table');
    cleanTables.forEach(function(tbl) {
      tbl.removeAttribute('data-has-resizers');
      delete tbl.dataset.hasResizers;
      var cells = tbl.querySelectorAll('th, td');
      cells.forEach(function(c) {
        if (c.style.resize) c.style.resize = '';
        if (c.style.overflow) c.style.overflow = '';
        if (c.style.minWidth) c.style.minWidth = '';
        if (!c.getAttribute('style') || !c.getAttribute('style').trim()) {
          c.removeAttribute('style');
        }
      });
    });

    // Remove selection rings
    var selectedWrappers = clone.querySelectorAll('.doc-img-wrapper.selected');
    selectedWrappers.forEach(function(w) { w.classList.remove('selected'); });

    // Clean up .doc-img-wrapper into clean <img> or <figure> elements with preserved Google Docs text wrapping
    var wrappers = clone.querySelectorAll('.doc-img-wrapper');
    wrappers.forEach(function(w) {
      var img = w.querySelector('img');
      var figcaption = w.querySelector('figcaption');
      if (img && w.parentNode) {
        var wStyle = w.style.width || '320px';
        var hStyle = (w.style.height && w.style.height !== 'auto') ? w.style.height : 'auto';
        var fStyle = w.style.float || 'left';
        var mStyle = w.style.margin || '6px 18px 12px 0';
        var maxWStyle = w.style.maxWidth || '48%';
        var wrap = w.getAttribute('data-wrap') || 'left';
        var rot = w.dataset.rotation || '0';

        if (wrap === 'left') {
          fStyle = 'left';
          mStyle = '6px 18px 12px 0';
          maxWStyle = '48%';
        } else if (wrap === 'right') {
          fStyle = 'right';
          mStyle = '6px 0 12px 18px';
          maxWStyle = '48%';
        } else if (wrap === 'center' || wrap === 'break') {
          fStyle = 'none';
          mStyle = '16px auto';
          maxWStyle = '100%';
        } else if (wrap === 'full') {
          fStyle = 'none';
          wStyle = '100%';
          mStyle = '16px 0';
          maxWStyle = '100%';
        }

        var transformStyle = (rot && rot !== '0') ? ('transform: rotate(' + rot + 'deg);') : '';
        var hasCardFrame = w.classList.contains('doc-img-card-frame');
        var frameStyle = hasCardFrame ? 'box-shadow:0 4px 18px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.12);padding:6px;background:#ffffff;' : '';

        if (figcaption && figcaption.textContent && figcaption.textContent.trim()) {
          var fig = document.createElement('figure');
          fig.className = 'doc-image-figure' + (hasCardFrame ? ' doc-img-card-frame' : '');
          fig.setAttribute('data-wrap', wrap);
          var figDisplay = (fStyle === 'none') ? 'display:block;margin-left:auto;margin-right:auto;clear:both;' : 'display:block;';
          fig.style.cssText = 'width:' + wStyle + ';max-width:' + maxWStyle + ';float:' + fStyle + ';margin:' + mStyle + ';' + figDisplay + transformStyle + frameStyle;
          var cleanImg = img.cloneNode(true);
          cleanImg.classList.remove('doc-processed');
          cleanImg.setAttribute('data-wrap', wrap);
          cleanImg.style.cssText = 'width:100%;height:' + hStyle + ';display:block;border-radius:6px;' + (hStyle !== 'auto' ? 'object-fit:fill;' : '');
          fig.appendChild(cleanImg);
          var cleanCap = figcaption.cloneNode(true);
          fig.appendChild(cleanCap);
          w.parentNode.insertBefore(fig, w);
        } else {
          var cleanImg = img.cloneNode(true);
          cleanImg.classList.remove('doc-processed');
          cleanImg.setAttribute('data-wrap', wrap);
          if (hasCardFrame) cleanImg.classList.add('doc-img-card-frame');
          var imgDisplay = (fStyle === 'none') ? 'display:block;margin-left:auto;margin-right:auto;clear:both;' : 'display:block;';
          cleanImg.style.cssText = 'width:' + wStyle + ';max-width:' + maxWStyle + ';height:' + hStyle + ';float:' + fStyle + ';margin:' + mStyle + ';' + imgDisplay + (hStyle !== 'auto' ? 'object-fit:fill;' : '') + transformStyle + frameStyle + 'border-radius:6px;';
          w.parentNode.insertBefore(cleanImg, w);
        }
      }
      w.remove();
    });

    // Extract sheet contents if paginated
    var container = clone.querySelector('.a4-container');
    var rawHtml = '';
    var sheets = container ? container.querySelectorAll('.a4-sheet, .slide') : [];
    if (container && sheets.length > 0) {
      var isSlideMode = container.classList.contains('slide-container') || document.body.classList.contains('slide-mode') || Boolean(document.querySelector('.slide-stage'));

      sheets.forEach(function(s) {
        var sClone = s.cloneNode(true);
        var innerTemp = sClone.querySelectorAll('.studio-page-break-indicator-line, .studio-page-break-indicator-label, .doc-img-toolbar, .doc-resize-handle, #studio-slide-element-toolbar, .slide-card-header-badge, #doc-image-drop-indicator, .doc-img-dimension-tooltip');
        innerTemp.forEach(function(t) { t.remove(); });
        var editables = sClone.querySelectorAll('[contenteditable]');
        editables.forEach(function(ed) { ed.removeAttribute('contenteditable'); });
        sClone.removeAttribute('contenteditable');
        sClone.removeAttribute('style');

        var innerContent = sClone.innerHTML.trim();
        if (!innerContent) return;

        if (isSlideMode || s.classList.contains('slide')) {
          if (innerContent.indexOf('class="slide"') !== -1 || innerContent.indexOf("class='slide'") !== -1) {
            rawHtml += innerContent + '\\n\\n';
          } else {
            rawHtml += '<div class="slide">\\n' + innerContent + '\\n</div>\\n\\n';
          }
        } else {
          rawHtml += innerContent + '\\n';
        }
      });
    } else {
      var editables = clone.querySelectorAll('[contenteditable]');
      editables.forEach(function(ed) { ed.removeAttribute('contenteditable'); });

      // Strip any injected runtime scripts and style tags so they never leak into user HTML code
      var injected = clone.querySelectorAll('script, style#studio-canvas-image-engine-styles, style#studio-interactive-styles, style#studio-fluid-print-styles, style#a4-print-styles, style#a4-print-spec-style, .doc-img-toolbar, .doc-resize-handle, #doc-image-drop-indicator, .doc-img-dimension-tooltip, .studio-page-break-indicator-line, .studio-page-break-indicator-label, #studio-slide-element-toolbar, .slide-card-header-badge');
      injected.forEach(function(el) { el.remove(); });

      var contEl = clone.querySelector('.a4-container') || clone;
      rawHtml = contEl.innerHTML;
    }

    // Order-preserving re-assembly of split containers:
    // Any elements (images, paragraphs) placed between or inside split pieces maintain their exact relative order!
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawHtml.trim();

    // Strip any accidental nested A4 containers or stages
    var stagesInTemp = Array.from(tempDiv.querySelectorAll('.a4-centering-stage'));
    stagesInTemp.forEach(function(stg) {
      var c = stg.querySelector('.a4-container') || stg;
      if (stg.parentNode) {
        while (c.firstChild) stg.parentNode.insertBefore(c.firstChild, stg);
        stg.remove();
      }
    });

    var processedSplitIds = {};
    var splitEls = Array.from(tempDiv.querySelectorAll('[data-split-id]'));
    splitEls.forEach(function(el) {
      var sid = el.getAttribute('data-split-id');
      if (!sid || processedSplitIds[sid]) return;
      processedSplitIds[sid] = true;

      var pieces = Array.from(tempDiv.querySelectorAll('[data-split-id="' + sid + '"]'));
      if (pieces.length <= 1) {
        if (pieces[0]) {
          pieces[0].removeAttribute('data-split-id');
          pieces[0].removeAttribute('data-split-tag');
        }
        return;
      }

      var primary = pieces[0];
      primary.removeAttribute('data-split-id');
      primary.removeAttribute('data-split-tag');

      for (var p = 1; p < pieces.length; p++) {
        var prevPiece = pieces[p - 1];
        var currPiece = pieces[p];

        // Gather any elements inserted between prevPiece and currPiece (such as user-placed images)
        // and move them into primary at that exact boundary so linear order is perfectly maintained!
        var sib = prevPiece.nextSibling;
        while (sib && sib !== currPiece) {
          var nextS = sib.nextSibling;
          primary.appendChild(sib);
          sib = nextS;
        }

        if (primary.tagName === 'TABLE') {
          var primaryTbody = primary.querySelector('tbody') || primary;
          var currRows = currPiece.querySelectorAll('tbody > tr');
          if (currRows.length === 0) currRows = currPiece.querySelectorAll('tr:not(thead tr)');
          currRows.forEach(function(row) {
            primaryTbody.appendChild(row);
          });
          currPiece.remove();
        } else {
          while (currPiece.firstChild) {
            primary.appendChild(currPiece.firstChild);
          }
          currPiece.remove();
        }
      }
    });

    return tempDiv.innerHTML.trim();
  }
  window.getCleanHtml = getCleanHtml;
  window.getCleanDocumentHtml = function() {
    return getCleanHtml(false);
  };
  window.getCleanHtmlForPrint = function() {
    hideSlideElementToolbar();
    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (window.getSelection) {
        var sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }
      document.querySelectorAll('.studio-active-selected-element').forEach(function(el) {
        el.classList.remove('studio-active-selected-element');
        el.style.outline = '';
        el.style.outlineOffset = '';
      });
      document.querySelectorAll('*').forEach(function(el) {
        if (el.style) {
          if (el.style.outline) el.style.outline = '';
          if (el.style.outlineOffset) el.style.outlineOffset = '';
        }
      });
    } catch(e) {}
    return getCleanHtml(true);
  };

  // 4. HTML change flush notifier (only emitted when explicitly saving, exiting edit mode, or on blur)
  function notifyParentOfHtmlChange(immediate) {
    if (!window.__isEditModeActive) return;
    try {
      window.__isUserPreviewDirty = false;
      var cleanHtml = getCleanHtml(false);
      window.parent.postMessage({
        type: 'STUDIO_HTML_UPDATE',
        html: cleanHtml,
        isFlush: true
      }, '*');
    } catch(e) {}
  }
  window.notifyParentOfHtmlChange = notifyParentOfHtmlChange;

  // 5. Image interactions are handled exclusively by CanvasImageEngine
  function deselectAllImages() {
    if (typeof window.deselectAllCanvasImages === 'function') {
      window.deselectAllCanvasImages();
    } else if (typeof window.deselectAllImages === 'function' && window.deselectAllImages !== deselectAllImages) {
      window.deselectAllImages();
    }
  }
  window.deselectAllImages = deselectAllImages;

  function wrapAndAttachAllImages() {
    if (typeof window.wrapAndAttachAllCanvasImages === 'function') {
      window.wrapAndAttachAllCanvasImages();
    } else if (typeof window.wrapAndAttachAllImages === 'function' && window.wrapAndAttachAllImages !== wrapAndAttachAllImages) {
      window.wrapAndAttachAllImages();
    }
  }
  window.wrapAndAttachAllImages = wrapAndAttachAllImages;

  // Prevent typing and DOM mutations when edit mode is OFF
  document.addEventListener('beforeinput', function(e) {
    if (isInteractiveEditModeActive() || isTargetEditableElement(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);


  // Handle Drag & Drop of Image Files
  document.addEventListener('dragover', function(e) {
    if (window.__useCanvasImageEngine) return;
    if (!window.__isEditModeActive) return;
    e.preventDefault();
  });

  document.addEventListener('drop', function(e) {
    if (window.__useCanvasImageEngine) return;
    if (!window.__isEditModeActive) return;
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    var file = e.dataTransfer.files[0];
    if (file && file.type.indexOf('image') !== -1) {
      e.preventDefault();
      var reader = new FileReader();
      reader.onload = function(evt) {
        if (evt.target && evt.target.result) {
          insertImageInDocument(evt.target.result, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle Paste of Images
  document.addEventListener('paste', function(e) {
    if (window.__useCanvasImageEngine) return;
    if (!window.__isEditModeActive) return;
    if (!e.clipboardData || !e.clipboardData.items) return;
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (file) {
          var reader = new FileReader();
          reader.onload = function(evt) {
            if (evt.target && evt.target.result) {
              insertImageInDocument(evt.target.result, file.name || 'Pasted Image');
            }
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  });

  // Track last active selection range and sheet inside iframe
  var lastSavedRange = null;
  var lastActiveSheet = null;

  function recordSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      lastSavedRange = sel.getRangeAt(0).cloneRange();
      var node = lastSavedRange.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentNode;
      if (el) {
        var sheet = el.closest('.a4-sheet');
        if (sheet) lastActiveSheet = sheet;
      }
    }
  }

  document.addEventListener('selectionchange', recordSelection);
  document.addEventListener('click', recordSelection);
  document.addEventListener('keyup', recordSelection);

  function insertImageInDocument(dataUrl, altText) {
    if (targetImgToReplace) {
      targetImgToReplace.src = dataUrl;
      targetImgToReplace = null;
      notifyParentOfHtmlChange();
      return;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'doc-img-wrapper';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.style.width = '380px';
    wrapper.style.maxWidth = '100%';
    wrapper.style.display = 'block';
    wrapper.style.margin = '16px auto';

    var img = document.createElement('img');
    img.src = dataUrl;
    img.alt = altText || 'Note Image';
    img.style.width = '100%';
    img.style.height = 'auto';

    wrapper.appendChild(img);

    // Insert at current selection range or last recorded caret position
    var selection = window.getSelection();
    var range = (selection && selection.rangeCount > 0) ? selection.getRangeAt(0) : lastSavedRange;
    var inserted = false;

    if (range) {
      var node = range.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentNode;

      if (el) {
        var blockParent = el.closest('p, h1, h2, h3, h4, h5, h6, section, article, div.a4-sheet, div');
        if (blockParent && !blockParent.classList.contains('a4-container')) {
          if (blockParent.classList.contains('a4-sheet')) {
            blockParent.appendChild(wrapper);
          } else if (blockParent.parentNode) {
            blockParent.parentNode.insertBefore(wrapper, blockParent.nextSibling);
          }
          inserted = true;
        }
      }
    }

    if (!inserted) {
      // Find currently visible sheet in user's viewport so image doesn't get buried at the end!
      var targetSheet = lastActiveSheet;
      if (!targetSheet) {
        var sheets = document.querySelectorAll('.a4-sheet');
        for (var s = 0; s < sheets.length; s++) {
          var rect = sheets[s].getBoundingClientRect();
          if (rect.bottom > 60 && rect.top < window.innerHeight) {
            targetSheet = sheets[s];
            break;
          }
        }
        if (!targetSheet && sheets.length > 0) {
          targetSheet = sheets[0];
        }
      }
      if (targetSheet) {
        var visibleBlock = null;
        var sheetBlocks = targetSheet.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, table');
        for (var b = 0; b < sheetBlocks.length; b++) {
          var bRect = sheetBlocks[b].getBoundingClientRect();
          if (bRect.top >= 0 && bRect.top < window.innerHeight / 2) {
            visibleBlock = sheetBlocks[b];
            break;
          }
        }
        if (visibleBlock && visibleBlock.parentNode) {
          visibleBlock.parentNode.insertBefore(wrapper, visibleBlock.nextSibling);
        } else if (sheetBlocks.length > 0 && sheetBlocks[0].parentNode) {
          sheetBlocks[0].parentNode.insertBefore(wrapper, sheetBlocks[0].nextSibling);
        } else {
          targetSheet.appendChild(wrapper);
        }
      } else {
        document.body.appendChild(wrapper);
      }
    }

    // Activate edit mode so user can immediately resize & move inserted image
    applyEditModeState(true);

    if (typeof window.runA4Pagination === 'function') {
      window.runA4Pagination();
    }

    var allWrappers = document.querySelectorAll('.doc-img-wrapper');
    if (allWrappers.length > 0) {
      var lastWrapper = allWrappers[allWrappers.length - 1];
      attachImageHandlesAndToolbar(lastWrapper);
      selectWrapper(lastWrapper);

      // Scroll inserted image into view immediately!
      try {
        lastWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch(err) {}
    }

    notifyParentOfHtmlChange();
  }

  var savedCaretRange = null;
  function saveIframeCaret() {
    try {
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0) {
        var r = sel.getRangeAt(0);
        if (document.body && document.body.contains(r.commonAncestorContainer)) {
          savedCaretRange = r.cloneRange();
        }
      }
    } catch(e) {}
  }

  document.addEventListener('keyup', saveIframeCaret);
  document.addEventListener('mouseup', saveIframeCaret);
  document.addEventListener('selectionchange', saveIframeCaret);

  function insertSnippetInIframe(snippet) {
    if (!snippet) return;
    var temp = document.createElement('div');
    temp.innerHTML = snippet;
    var frag = document.createDocumentFragment();
    while (temp.firstChild) {
      frag.appendChild(temp.firstChild);
    }

    var inserted = false;
    var sel = window.getSelection ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0) {
      try {
        var range = sel.getRangeAt(0);
        if (document.body && document.body.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          range.insertNode(frag);
          inserted = true;
        }
      } catch(e) {}
    }

    if (!inserted && savedCaretRange) {
      try {
        savedCaretRange.deleteContents();
        savedCaretRange.insertNode(frag);
        inserted = true;
      } catch(e) {}
    }

    if (!inserted && document.body) {
      document.body.appendChild(frag);
    }

    renderKaTeXMathInDocument();
    wrapAndAttachAllImages();
    notifyParentOfHtmlChange(true);
  }

  // 7. Message Listener from Parent Frame
  window.addEventListener('message', function(e) {
    if (!e.data) return;

    if (e.data.type === 'SET_PREVIEW_EDIT_MODE' || e.data.type === 'SET_EDIT_MODE' || e.data.type === 'STUDIO_SET_EDIT_MODE') {
      var act = e.data.active !== undefined ? e.data.active : (e.data.enabled !== undefined ? e.data.enabled : true);
      applyEditModeState(Boolean(act));
    } else if (e.data.type === 'STUDIO_INSERT_IMAGE' && e.data.base64) {
      if (window.__useCanvasImageEngine) return;
      insertImageInDocument(e.data.base64, e.data.fileName);
    } else if (e.data.type === 'STUDIO_INSERT_SNIPPET' && e.data.snippet) {
      insertSnippetInIframe(e.data.snippet);
    } else if (e.data.type === 'SCROLL_TO_HEADING' && e.data.headingText) {
      var clean = e.data.headingText.trim().toLowerCase();
      var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      var matchedHeading = null;

      // 1. Direct index match for 100% precision across multi-heading notes
      if (typeof e.data.headingIndex === 'number' && e.data.headingIndex >= 0 && headings[e.data.headingIndex]) {
        matchedHeading = headings[e.data.headingIndex];
      }

      // 2. Fallback text matching
      if (!matchedHeading) {
        for (var hIdx = 0; hIdx < headings.length; hIdx++) {
          var txt = (headings[hIdx].textContent || '').trim().toLowerCase();
          if (txt === clean || txt.indexOf(clean) !== -1 || clean.indexOf(txt) !== -1) {
            matchedHeading = headings[hIdx];
            break;
          }
        }
      }

      if (!matchedHeading) {
        var cleanWords = clean.split(/\s+/).filter(function(w) { return w.length > 2; });
        if (cleanWords.length > 0) {
          for (var wIdx = 0; wIdx < headings.length; wIdx++) {
            var hTxt = (headings[wIdx].textContent || '').toLowerCase();
            var matchesAll = cleanWords.every(function(w) { return hTxt.indexOf(w) !== -1; });
            if (matchesAll) {
              matchedHeading = headings[wIdx];
              break;
            }
          }
        }
      }

      if (matchedHeading) {
        // Clear previous active heading highlight across entire document
        var prevActives = document.querySelectorAll('.studio-active-heading');
        for (var pa = 0; pa < prevActives.length; pa++) {
          prevActives[pa].classList.remove('studio-active-heading');
          try {
            prevActives[pa].style.outline = '';
            prevActives[pa].style.backgroundColor = '';
            prevActives[pa].style.boxShadow = '';
          } catch (_) {}
        }

        // Scroll heading directly into view
        matchedHeading.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });

        // Highlight and stay persistent
        matchedHeading.classList.add('studio-active-heading');
        matchedHeading.style.transition = 'all 0.25s ease-out';
        matchedHeading.style.outline = '3px solid #0b57d0';
        matchedHeading.style.outlineOffset = '4px';
        matchedHeading.style.borderRadius = '6px';
        matchedHeading.style.backgroundColor = 'rgba(11, 87, 208, 0.12)';
        matchedHeading.style.boxShadow = '0 0 16px rgba(11, 87, 208, 0.3)';

        // Fine-tune offset so heading doesn't touch top edge
        setTimeout(function() {
          try {
            var rect = matchedHeading.getBoundingClientRect();
            var currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            var targetY = Math.max(0, rect.top + currentScroll - 24);
            window.scrollTo({ top: targetY, behavior: 'smooth' });
          } catch (_) {}
        }, 120);
      }
    }
  });

  // Selection change notifier to parent window for split-mode mapping
  function notifySelectionChange() {
    try {
      var sel = window.getSelection ? window.getSelection() : null;
      var text = sel ? sel.toString().trim() : '';
      var rect = null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          rect = { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
        }
      }
      window.parent.postMessage({
        type: 'STUDIO_PREVIEW_SELECTION',
        text: text || '',
        rect: rect
      }, '*');
    } catch(e) {}
  }

  document.addEventListener('mouseup', function() {
    setTimeout(notifySelectionChange, 40);
  });
  document.addEventListener('selectionchange', function() {
    setTimeout(notifySelectionChange, 60);
  });

  // Slide Element Selection & Contextual Floating Toolbar Controls
  var activeSelectedElement = null;
  var slideElementToolbar = null;

  function createSlideElementToolbar() {
    if (slideElementToolbar) return slideElementToolbar;

    var bar = document.createElement('div');
    bar.id = 'studio-slide-element-toolbar';
    bar.setAttribute('contenteditable', 'false');
    bar.style.cssText = [
      'position: absolute !important',
      'display: none !important',
      'z-index: 2147483647 !important',
      'background: #0f172a !important',
      'color: #ffffff !important',
      'padding: 5px 10px !important',
      'border-radius: 9999px !important',
      'font-size: 11px !important',
      'font-weight: 700 !important',
      'font-family: system-ui, -apple-system, sans-serif !important',
      'box-shadow: 0 10px 25px rgba(0,0,0,0.45) !important',
      'border: 1px solid rgba(255,255,255,0.18) !important',
      'align-items: center !important',
      'gap: 4px !important',
      'pointer-events: auto !important',
      'white-space: nowrap !important',
      'user-select: none !important',
      'transform: scale(calc(1 / var(--paper-zoom, 1))) !important',
      'transform-origin: bottom center !important'
    ].join(';');

    var isSlideDeck = Boolean(document.querySelector('.slide'));
    bar.innerHTML = [
      '<button type="button" data-action="font-up" title="Increase Font Size" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:700;font-size:12px;">A+</button>',
      '<button type="button" data-action="font-down" title="Decrease Font Size" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:700;font-size:12px;">A-</button>',
      '<span style="color:rgba(255,255,255,0.25);margin:0 2px;">|</span>',
      '<button type="button" data-action="add-image" title="Insert Image Below" style="background:#2563eb;border:none;color:#fff;padding:3px 9px;border-radius:12px;cursor:pointer;font-weight:700;font-size:11px;display:inline-flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>+ Image</button>',
      '<button type="button" data-action="duplicate-el" title="Duplicate Element" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:600;font-size:11px;">Duplicate</button>',
      '<span style="color:rgba(255,255,255,0.25);margin:0 2px;">|</span>',
      (isSlideDeck ? '<button type="button" data-action="prev-slide" title="Move to Previous Slide" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:700;font-size:11px;">⬅ Slide</button><button type="button" data-action="next-slide" title="Move to Next Slide" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:700;font-size:11px;">➔ Slide</button><span style="color:rgba(255,255,255,0.25);margin:0 2px;">|</span>' : ''),
      '<button type="button" data-action="align-left" title="Align Left" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 7px;border-radius:12px;cursor:pointer;font-size:11px;">Left</button>',
      '<button type="button" data-action="align-center" title="Align Center" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 7px;border-radius:12px;cursor:pointer;font-size:11px;">Center</button>',
      '<button type="button" data-action="align-right" title="Align Right" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:3px 7px;border-radius:12px;cursor:pointer;font-size:11px;">Right</button>',
      '<span style="color:rgba(255,255,255,0.25);margin:0 2px;">|</span>',
      '<button type="button" data-action="delete-el" title="Delete Element" style="background:#ef4444;border:none;color:#fff;padding:3px 8px;border-radius:12px;cursor:pointer;font-weight:700;font-size:11px;">Trash</button>'
    ].join('');

    bar.addEventListener('click', function(evt) {
      evt.stopPropagation();
      var btn = evt.target.closest('button');
      if (!btn || !activeSelectedElement) return;

      var action = btn.dataset.action;
      var el = activeSelectedElement;

      if (action === 'add-image') {
        try {
          if (typeof window.insertImageAtPosition === 'function') {
            window.parent.postMessage({ type: 'STUDIO_TRIGGER_FILE_UPLOAD' }, '*');
          }
        } catch(err) {}
        return;
      } else if (action === 'duplicate-el') {
        var cloneEl = el.cloneNode(true);
        cloneEl.style.outline = '';
        if (el.nextSibling) el.parentNode.insertBefore(cloneEl, el.nextSibling);
        else el.parentNode.appendChild(cloneEl);
        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') window.runA4Pagination();
        return;
      } else if (action === 'font-up') {
        var compFont = parseFloat(window.getComputedStyle(el).fontSize) || 14;
        el.style.fontSize = Math.min(60, compFont + 2) + 'px';
        positionSlideElementToolbar(el);
        notifyParentOfHtmlChange();
      } else if (action === 'font-down') {
        var compFont = parseFloat(window.getComputedStyle(el).fontSize) || 14;
        el.style.fontSize = Math.max(9, compFont - 2) + 'px';
        positionSlideElementToolbar(el);
        notifyParentOfHtmlChange();
      } else if (action === 'next-slide') {
        var currentSlide = el.closest('.slide') || el.closest('.a4-sheet');
        if (currentSlide) {
          var allSlides = Array.from(document.querySelectorAll('.slide, .a4-sheet'));
          var curIdx = allSlides.indexOf(currentSlide);
          if (curIdx !== -1 && curIdx < allSlides.length - 1) {
            var targetBody = allSlides[curIdx + 1].querySelector('.slide-body') || allSlides[curIdx + 1];
            targetBody.appendChild(el);
          } else {
            // Create a brand new slide
            var newSlide = document.createElement('div');
            newSlide.className = 'slide';
            newSlide.innerHTML = '<div class="slide-header"><h1>New Slide</h1><span class="slide-badge">Slide</span></div><div class="slide-body"></div><div class="slide-footer"><span>Notes Studio</span></div>';
            currentSlide.parentNode.insertBefore(newSlide, currentSlide.nextSibling);
            newSlide.querySelector('.slide-body').appendChild(el);
          }
          positionSlideElementToolbar(el);
          notifyParentOfHtmlChange();
          if (typeof window.runA4Pagination === 'function') window.runA4Pagination();
        }
      } else if (action === 'prev-slide') {
        var currentSlide = el.closest('.slide') || el.closest('.a4-sheet');
        if (currentSlide) {
          var allSlides = Array.from(document.querySelectorAll('.slide, .a4-sheet'));
          var curIdx = allSlides.indexOf(currentSlide);
          if (curIdx > 0) {
            var targetBody = allSlides[curIdx - 1].querySelector('.slide-body') || allSlides[curIdx - 1];
            targetBody.appendChild(el);
            positionSlideElementToolbar(el);
            notifyParentOfHtmlChange();
            if (typeof window.runA4Pagination === 'function') window.runA4Pagination();
          }
        }
      } else if (action === 'align-left') {
        el.style.textAlign = 'left';
        notifyParentOfHtmlChange();
      } else if (action === 'align-center') {
        el.style.textAlign = 'center';
        notifyParentOfHtmlChange();
      } else if (action === 'align-right') {
        el.style.textAlign = 'right';
        notifyParentOfHtmlChange();
      } else if (action === 'delete-el') {
        el.remove();
        hideSlideElementToolbar();
        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') window.runA4Pagination();
      }
    });

    document.body.appendChild(bar);
    slideElementToolbar = bar;
    return bar;
  }

  function positionSlideElementToolbar(el) {
    var bar = createSlideElementToolbar();
    if (!el || !document.body.contains(el)) {
      hideSlideElementToolbar();
      return;
    }

    var rect = el.getBoundingClientRect();
    var bodyRect = document.body.getBoundingClientRect();
    var top = rect.top - bodyRect.top - 48;
    if (top < 10) top = rect.bottom - bodyRect.top + 8;
    var left = rect.left - bodyRect.left + (rect.width / 2);

    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
    bar.style.transform = 'translateX(-50%) scale(calc(1 / var(--paper-zoom, 1)))';
    bar.style.display = 'inline-flex';
  }

  function hideSlideElementToolbar() {
    if (slideElementToolbar) {
      slideElementToolbar.style.display = 'none';
    }
    if (activeSelectedElement) {
      activeSelectedElement.classList.remove('studio-active-selected-element');
      activeSelectedElement.style.outline = '';
      activeSelectedElement.style.outlineOffset = '';
      activeSelectedElement = null;
    }
    try {
      document.querySelectorAll('.studio-active-selected-element').forEach(function(el) {
        el.classList.remove('studio-active-selected-element');
        el.style.outline = '';
        el.style.outlineOffset = '';
      });
    } catch(e) {}
  }

  function attachSlideElementListeners() {
    document.addEventListener('click', function(evt) {
      if (!window.__isEditModeActive) return;
      var target = evt.target;
      if (!target || target.nodeType !== 1) return;

      if (target.closest('#studio-slide-element-toolbar') || target.closest('.doc-img-toolbar') || target.closest('.doc-resize-handle')) {
        return;
      }

      // Slide toolbar is strictly for slide deck mode (16:9 presentations).
      // In normal A4 document notes, users click text directly to place caret and type without a blocking popup!
      var isSlideDeck = Boolean(document.querySelector('.slide'));
      if (!isSlideDeck) {
        hideSlideElementToolbar();
        return;
      }

      var matchEl = target.closest('h1, h2, h3, h4, h5, h6, p, table, pre, .panel, .callout, .metric-card, details, ul, ol, div.card, div.box, figure, section');
      if (matchEl && !matchEl.classList.contains('slide') && !matchEl.classList.contains('a4-sheet') && !matchEl.classList.contains('a4-container') && !matchEl.classList.contains('slide-card-header-badge')) {
        if (activeSelectedElement && activeSelectedElement !== matchEl) {
          activeSelectedElement.classList.remove('studio-active-selected-element');
          activeSelectedElement.style.outline = '';
          activeSelectedElement.style.outlineOffset = '';
        }
        activeSelectedElement = matchEl;
        activeSelectedElement.classList.add('studio-active-selected-element');
        activeSelectedElement.style.outline = '';
        activeSelectedElement.style.outlineOffset = '';
        positionSlideElementToolbar(matchEl);
      } else {
        hideSlideElementToolbar();
      }
    });
  }

  function setupTableResizing() {
    if (!window.__isEditModeActive) return;
    var tables = document.querySelectorAll('table');
    tables.forEach(function(table) {
      if (table.dataset.hasResizers) return;
      table.dataset.hasResizers = 'true';

      // Only allow horizontal column resize on header th cells in active edit mode
      var ths = table.querySelectorAll('th');
      ths.forEach(function(th) {
        if (!th.style.position) th.style.position = 'relative';
        th.style.resize = 'horizontal';
        th.style.overflow = 'hidden';
      });
    });
  }

  function teardownTableResizing() {
    var tables = document.querySelectorAll('table');
    tables.forEach(function(table) {
      delete table.dataset.hasResizers;
      table.removeAttribute('data-has-resizers');
      var cells = table.querySelectorAll('th, td');
      cells.forEach(function(cell) {
        if (cell.style.resize) cell.style.resize = '';
        if (cell.style.overflow) cell.style.overflow = '';
        if (cell.style.minWidth) cell.style.minWidth = '';
        if (!cell.getAttribute('style') || !cell.getAttribute('style').trim()) {
          cell.removeAttribute('style');
        }
      });
    });
  }

  // Multi-touch pinch-to-zoom is disabled. Zooming is strictly controlled via zoom in/out buttons.

  // Initial setup on DOM ready
  function initDoc() {
    applyEditModeState(${Boolean(isPreviewEditMode)});
    wrapAndAttachAllImages();
    setupTableResizing();
    attachSlideElementListeners();
    renderKaTeXMathInDocument();
    try {
      window.parent.postMessage({ type: 'STUDIO_IFRAME_READY' }, '*');
    } catch(e) {}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initDoc();
  } else {
    document.addEventListener('DOMContentLoaded', initDoc);
    window.addEventListener('load', initDoc);
  }
})();
</script>
`;
}
