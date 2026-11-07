/**
 * notePrintUtility.ts
 * 
 * Provides publication-grade, isolated multi-page printing for notes, AI responses,
 * math derivations, tables, and study documents.
 * 
 * Generates an isolated hidden print iframe that prevents viewport truncation,
 * preserves KaTeX mathematical typography, and enables natural CSS pagination across
 * as many A4/Letter pages as required.
 */

export interface PrintNoteDocumentOptions {
  title: string;
  element?: HTMLElement | null;
  htmlContent?: string;
  createdAt?: string;
  tag?: string;
}

export function printNoteDocument(options: PrintNoteDocumentOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve();
      return;
    }

    try {
      const cleanTitle = (options.title || 'Document Note').trim();
      let innerBodyHtml = '';

      if (options.element) {
        // Clone element to sanitize any buttons, interactive copy controls, or transient state
        const clone = options.element.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.no-print, button, [role="button"]').forEach((el) => {
          // If it's not a heading or title, remove interactive controls
          if (!el.tagName.toLowerCase().startsWith('h') && !el.classList.contains('print-keep')) {
            el.remove();
          }
        });
        innerBodyHtml = clone.innerHTML;
      } else if (options.htmlContent) {
        innerBodyHtml = options.htmlContent;
      } else {
        window.print();
        resolve();
        return;
      }

      // Collect all active stylesheets and font declarations from the host document
      const stylesheetsHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((el) => el.outerHTML)
        .join('\n');

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle.replace(/"/g, '&quot;')}</title>
  ${stylesheetsHtml}
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 16mm 18mm 16mm;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        height: auto !important;
        width: 100% !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print, button, [role="button"], .print\\:hidden {
        display: none !important;
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      font-size: 11pt;
      line-height: 1.6;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      height: auto !important;
      -webkit-font-smoothing: antialiased;
    }
    .print-document-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      height: auto !important;
    }
    /* Typography & Hierarchy */
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid !important;
      break-after: avoid-page !important;
      color: #0f172a !important;
      font-weight: 700 !important;
      margin-top: 1.3em !important;
      margin-bottom: 0.5em !important;
      line-height: 1.3 !important;
    }
    h1 { font-size: 18pt !important; }
    h2 { font-size: 14pt !important; }
    h3 { font-size: 12pt !important; }
    p {
      margin: 0.6em 0 !important;
      orphans: 3;
      widows: 3;
      color: #1e293b !important;
    }
    /* Mathematical formulas */
    .katex-display {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin: 1.1em 0 !important;
      overflow-x: visible !important;
    }
    .katex {
      font-size: 1.05em !important;
      color: #0f172a !important;
    }
    /* Tables */
    table {
      border-collapse: collapse !important;
      width: 100% !important;
      margin: 1.2em 0 !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
      font-size: 9.5pt !important;
    }
    thead {
      display: table-header-group !important;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    th, td {
      border: 1px solid #cbd5e1 !important;
      padding: 7px 10px !important;
      text-align: left !important;
      vertical-align: top !important;
      color: #1e293b !important;
    }
    th {
      background-color: #f8fafc !important;
      font-weight: 700 !important;
    }
    /* Images & Visual Plots */
    img {
      max-width: 100% !important;
      height: auto !important;
      max-height: 520px !important;
      object-fit: contain !important;
      border-radius: 8px !important;
      margin: 12px auto !important;
      display: block !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    /* Code Blocks */
    pre, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    }
    pre {
      background-color: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 6px !important;
      padding: 10px 14px !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
      font-size: 9pt !important;
      color: #0f172a !important;
    }
    /* Quotes */
    blockquote {
      border-left: 3.5px solid #0084ff !important;
      padding-left: 12px !important;
      margin: 0.8em 0 !important;
      color: #475569 !important;
      font-style: italic !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    /* Lists */
    ul, ol {
      margin: 0.5em 0 !important;
      padding-left: 20px !important;
    }
    li {
      margin: 0.25em 0 !important;
      color: #1e293b !important;
    }
  </style>
</head>
<body>
  <div class="print-document-container">
    ${innerBodyHtml}
  </div>
</body>
</html>`;

      const frameId = 'note-doc-isolated-print-frame';
      let printFrame = document.getElementById(frameId) as HTMLIFrameElement | null;
      if (printFrame && printFrame.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }

      printFrame = document.createElement('iframe');
      printFrame.id = frameId;
      printFrame.setAttribute('aria-hidden', 'true');
      printFrame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;opacity:0;pointer-events:none;z-index:-9999;';
      document.body.appendChild(printFrame);

      const fDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (!fDoc || !printFrame.contentWindow) {
        window.print();
        resolve();
        return;
      }

      fDoc.open();
      fDoc.write(fullHtml);
      fDoc.close();

      const cleanup = () => {
        setTimeout(() => {
          if (printFrame && printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
          resolve();
        }, 1500);
      };

      printFrame.contentWindow.addEventListener('afterprint', cleanup);
      window.addEventListener('afterprint', cleanup);

      // Wait for fonts & images to settle before triggering the print dialog
      const awaitImages = () => new Promise<void>((imgResolve) => {
        const frameImages = Array.from(fDoc.images);
        const pending = frameImages.filter((img) => !img.complete);
        if (pending.length === 0) {
          imgResolve();
          return;
        }
        let done = 0;
        const checkDone = () => {
          done++;
          if (done >= pending.length) imgResolve();
        };
        pending.forEach((img) => {
          img.addEventListener('load', checkDone);
          img.addEventListener('error', checkDone);
        });
        setTimeout(imgResolve, 2500); // 2.5s fallback
      });

      const awaitFonts = () => {
        if (fDoc.fonts && fDoc.fonts.ready) {
          return fDoc.fonts.ready.catch(() => {});
        }
        return Promise.resolve();
      };

      Promise.all([awaitFonts(), awaitImages()]).then(() => {
        setTimeout(() => {
          try {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print failed, falling back to window.print():', err);
            window.print();
          }
        }, 200);
      });
    } catch (e) {
      console.warn('printNoteDocument failed, falling back to window.print():', e);
      window.print();
      resolve();
    }
  });
}
