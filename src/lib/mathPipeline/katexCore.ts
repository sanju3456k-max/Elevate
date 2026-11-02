/**
 * High-Performance KaTeX Core Engine
 * Synchronous speed, LRU caching, macro extensions, display style injection,
 * and graceful fallback safety for malformed equations.
 */

import katex from 'katex';

export const PIPELINE_KATEX_MACROS: Record<string, string> = {
  '\\ne': '\\neq',
  '\\nequal': '\\neq',
  '\\not=': '\\neq',
  '\\degree': '^\\circ',
  '\\deg': '^\\circ',
  '\\le': '\\leq',
  '\\ge': '\\geq',
  '\\cbrt': '\\sqrt[3]',
  '\\det': '\\operatorname{det}',
  '\\adj': '\\operatorname{adj}',
  '\\tr': '\\operatorname{tr}',
  '\\rank': '\\operatorname{rank}',
  '\\gcd': '\\operatorname{gcd}',
  '\\lcm': '\\operatorname{lcm}',
  '\\sgn': '\\operatorname{sgn}',
  '\\cosec': '\\csc',
  '\\arccot': '\\operatorname{arccot}',
  '\\arcsec': '\\operatorname{arcsec}',
  '\\arccsc': '\\operatorname{arccsc}',
  '\\sech': '\\operatorname{sech}',
  '\\csch': '\\operatorname{csch}',
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\|#1\\right\\|',
  '\\grad': '\\nabla',
  '\\curl': '\\nabla \\times',
  '\\var': '\\operatorname{Var}',
  '\\cov': '\\operatorname{Cov}',
  '\\diag': '\\operatorname{diag}',
  '\\sen': '\\sin',
  '\\tg': '\\tan',
  '\\cotg': '\\cot',
  '\\bold': '\\mathbf{#1}',
  '\\bm': '\\boldsymbol{#1}',
  '\\implies': '\\Longrightarrow',
  '\\iff': '\\Longleftrightarrow',
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\C': '\\mathbb{C}',
  '\\Q': '\\mathbb{Q}',
  '\\oiint': '\\oint\\!\\!\\!\\oint',
  '\\oiiint': '\\oint\\!\\!\\!\\oint\\!\\!\\!\\oint',
};

const LRU_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 3000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function autoScaleTallDelimiters(str: string, openChar: string, closeChar: string, leftCmd: string, rightCmd: string): string {
  let res = '';
  let i = 0;
  while (i < str.length) {
    if (str.startsWith(openChar, i)) {
      const prefix = str.slice(Math.max(0, i - 6), i);
      if (/\\(left|right)$/.test(prefix) || /\\$/.test(prefix)) {
        res += str.slice(i, i + openChar.length);
        i += openChar.length;
        continue;
      }

      let depth = 1;
      let j = i + openChar.length;
      let hasTall = false;
      while (j < str.length && depth > 0) {
        if (str[j] === '\\') {
          const rem = str.slice(j);
          if (/^\\(?:frac|dfrac|cfrac|tfrac|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|cases|array|int|iint|iiint|oint|oiint|oiiint|idotsint|sum|prod|lim)\b/.test(rem)) {
            hasTall = true;
          }
          // Move past the backslash and command word, or single symbol escape
          j++;
          if (j < str.length && /[a-zA-Z]/.test(str[j])) {
            while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
          } else if (j < str.length) {
            // Escaped special character (e.g. \{, \}, \[, \], etc.)
            j++;
          }
          continue;
        }
        if (str.startsWith(openChar, j)) {
          depth++;
          j += openChar.length;
          continue;
        } else if (str.startsWith(closeChar, j)) {
          depth--;
          j += closeChar.length;
          continue;
        }
        j++;
      }

      if (depth === 0 && hasTall) {
        const inside = str.slice(i + openChar.length, j - closeChar.length);
        res += leftCmd + autoScaleTallDelimiters(inside, openChar, closeChar, leftCmd, rightCmd) + rightCmd;
        i = j;
        continue;
      }
    }
    res += str[i];
    i++;
  }
  return res;
}

/**
 * Pre-processes LaTeX math string:
 * - Fixes forward slash command typos (/frac -> \frac, /int -> \int, /lim -> \lim)
 * - Converts raw unicode mathematical symbols (∫, ∬, ∭, ∮, ∑, ∏, √, ∞, ≠, ≤, ≥, etc.) to standard LaTeX commands
 * - Auto-promotes brackets around fractions & matrices to full-height \left / \right delimiters
 * - Auto-injects \displaystyle for all integration signs, fractions, limits, sums, and matrices so integrals and limits render at full truth height
 */
export function normalizeLatexMath(rawMath: string, isDisplay: boolean): string {
  let s = (rawMath || '').trim();
  if (!s) return '';

  // 1. Fix forward slash command typos (common user typing errors)
  s = s.replace(/\/(displaystyle|textstyle|frac|sqrt|sum|int|lim|infty|partial|mathbf|mathrm|text)\b/g, '\\$1');

  // 1b. Fix double-escaped backslashes before known LaTeX math commands (e.g. \\neq -> \neq, \\int -> \int)
  s = s.replace(/\\\\(?=(?:neq|ne|nequal|leq|le|geq|ge|pm|mp|times|cdot|div|approx|equiv|sim|propto|parallel|perp|in|notin|subset|subseteq|cap|cup|forall|exists|partial|nabla|sqrt|frac|dfrac|cfrac|tfrac|sum|prod|int|iint|iiint|oint|oiint|oiiint|idotsint|lim|sin|cos|tan|cot|sec|csc|cosec|log|ln|exp|det|deg|degree|circ|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|left|right|text|mathrm|mathbf)\b)/g, '\\');

  // 1c. Convert unicode mathematical symbols to standard LaTeX commands
  s = s.replace(/\u222B/g, ' \\int ');    // ∫
  s = s.replace(/\u222C/g, ' \\iint ');   // ∬
  s = s.replace(/\u222D/g, ' \\iiint ');  // ∭
  s = s.replace(/\u222E/g, ' \\oint ');   // ∮
  s = s.replace(/\u2211/g, ' \\sum ');    // ∑
  s = s.replace(/\u220F/g, ' \\prod ');   // ∏
  s = s.replace(/\u221E/g, ' \\infty ');  // ∞
  s = s.replace(/\u2260/g, ' \\neq ');    // ≠
  s = s.replace(/!=/g, ' \\neq ');
  s = s.replace(/<>/g, ' \\neq ');
  s = s.replace(/\u2264/g, ' \\leq ');    // ≤
  s = s.replace(/<=/g, ' \\leq ');
  s = s.replace(/\u2265/g, ' \\geq ');    // ≥
  s = s.replace(/>=/g, ' \\geq ');
  s = s.replace(/\u00D7/g, ' \\times ');  // ×
  s = s.replace(/\u00F7/g, ' \\div ');    // ÷
  s = s.replace(/\u00B1/g, ' \\pm ');     // ±
  s = s.replace(/\u2213/g, ' \\mp ');     // ∓
  s = s.replace(/\u2248/g, ' \\approx '); // ≈
  s = s.replace(/\u2261/g, ' \\equiv ');  // ≡
  s = s.replace(/\u2208/g, ' \\in ');     // ∈
  s = s.replace(/\u2209/g, ' \\notin ');  // ∉
  s = s.replace(/\u2282/g, ' \\subset '); // ⊂
  s = s.replace(/\u2286/g, ' \\subseteq '); // ⊆
  s = s.replace(/\u222A/g, ' \\cup ');    // ∪
  s = s.replace(/\u2229/g, ' \\cap ');    // ∩
  s = s.replace(/\u2200/g, ' \\forall '); // ∀
  s = s.replace(/\u2203/g, ' \\exists '); // ∃
  s = s.replace(/\u2202/g, ' \\partial '); // ∂
  s = s.replace(/\u2207/g, ' \\nabla ');  // ∇
  s = s.replace(/\u2220/g, ' \\angle ');  // ∠
  s = s.replace(/\u22A5/g, ' \\perp ');   // ⊥
  s = s.replace(/\u2225/g, ' \\parallel ');// ∥
  s = s.replace(/\u2192/g, ' \\to ');     // →
  s = s.replace(/\u21D2/g, ' \\implies '); // ⇒
  s = s.replace(/\u21D4/g, ' \\iff ');     // ⇔

  // 1d. Spacing before differentials at the end of integrals: e.g. f(x)dx -> f(x) \, dx
  s = s.replace(/([0-9a-zA-Z\)\}\]\|])\s*(d[xytuvz]|d\\theta|d\\phi)\b/g, '$1 \\, $2');

  // 2. Promote [ \begin{matrix} ... \end{matrix} ] to \begin{bmatrix} ... \end{bmatrix}
  s = s.replace(/(?:^|[^\\])\[\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\]/g, '\\begin{bmatrix}$1\\end{bmatrix}');
  s = s.replace(/(?:^|[^\\])\(\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\)/g, '\\begin{pmatrix}$1\\end{pmatrix}');
  s = s.replace(/(?:^|[^\\])\|\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\|/g, '\\begin{vmatrix}$1\\end{vmatrix}');

  // 3. Promote balanced ( ... \frac ... ), [ ... \frac ... ], and \{ ... \frac ... \} to full-height delimiters
  s = autoScaleTallDelimiters(s, '(', ')', '\\left(', '\\right)');
  s = autoScaleTallDelimiters(s, '[', ']', '\\left[', '\\right]');
  s = autoScaleTallDelimiters(s, '\\{', '\\}', '\\left\\{', '\\right\\}');

  // 4. Inject \displaystyle for all integration signs, fractions, sums, limits, matrices
  // This guarantees integrals (\int, \iint, \iiint, \oint) render at full display height with beautiful tall symbols
  if (!isDisplay && !s.startsWith('\\displaystyle') && !s.startsWith('\\textstyle')) {
    if (/\\(?:frac|dfrac|cfrac|tfrac|int|iint|iiint|oint|oiint|oiiint|idotsint|sum|prod|coprod|lim|limsup|liminf|bigcup|bigcap|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|cases|array)\b/.test(s)) {
      s = `\\displaystyle ${s}`;
    }
  }

  return s;
}

export interface RenderKatexOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  addScrollWrapper?: boolean;
  contentEditableFalse?: boolean;
}

/**
 * Renders a LaTeX string into KaTeX HTML with synchronous speed, LRU caching, and error safety.
 */
export function renderKatexToString(mathStr: string, options: RenderKatexOptions = {}): string {
  const isDisplay = Boolean(options.displayMode);
  const addScrollWrapper = options.addScrollWrapper !== false;
  const contentEditableFalse = options.contentEditableFalse !== false;

  const normalized = normalizeLatexMath(mathStr, isDisplay);
  if (!normalized) return '';

  const cacheKey = `${isDisplay ? 'D:' : 'I:'}${normalized}`;
  const cached = LRU_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let html = '';
  try {
    const rendered = katex.renderToString(normalized, {
      displayMode: isDisplay,
      throwOnError: false,
      strict: false,
      trust: true,
      macros: PIPELINE_KATEX_MACROS,
      output: 'html'
    });

    const editableAttr = contentEditableFalse ? ' contenteditable="false"' : '';
    const safeDataLatex = escapeHtml(mathStr);

    if (isDisplay && addScrollWrapper) {
      html = `<div class="katex-scroll-wrapper" style="overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; margin: 0.5em 0;"${editableAttr} data-latex="${safeDataLatex}"><span class="katex-display"${editableAttr}>${rendered}</span></div>`;
    } else {
      html = `<span class="${isDisplay ? 'katex-display' : 'katex-inline'}"${editableAttr} data-latex="${safeDataLatex}">${rendered}</span>`;
    }
  } catch (err) {
    // Fallback: Gracefully display escaped raw LaTeX rather than crashing the UI thread
    const safeRaw = escapeHtml(mathStr);
    const tag = isDisplay ? 'div' : 'span';
    html = `<${tag} class="katex-error-fallback" style="color: #ef4444; font-family: monospace; background: rgba(239, 68, 68, 0.08); padding: 2px 6px; border-radius: 4px;" title="KaTeX parse error">${isDisplay ? `$$${safeRaw}$$` : `$${safeRaw}$`}</${tag}>`;
  }

  if (LRU_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = LRU_CACHE.keys().next().value;
    if (firstKey) LRU_CACHE.delete(firstKey);
  }
  LRU_CACHE.set(cacheKey, html);

  return html;
}
