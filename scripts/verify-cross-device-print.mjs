import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/?omr_benchmark=1';
const OUT_DIR = path.resolve('scripts/synthetic-tester/reports/print-parity');
fs.mkdirSync(OUT_DIR, { recursive: true });

const DEVICE_PROFILES = [
  {
    name: 'desktop',
    label: 'Desktop (1440x900)',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  {
    name: 'tablet',
    label: 'Tablet (768x1024)',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iphone',
    label: 'iPhone (390x844)',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'android',
    label: 'Android Phone (360x800)',
    width: 360,
    height: 800,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; motorola edge 60 fusion) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  },
];

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.on('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        on(event, fn) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(fn);
        },
        close() {
          ws.close();
        },
      });
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const fn of listeners.get(msg.method)) fn(msg.params);
      }
    });

    ws.on('error', reject);
  });
}

async function extractPdfPages(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({
      pageNumber: p,
      widthPt: Math.round(vp.width),
      heightPt: Math.round(vp.height),
      text,
    });
  }
  return pages;
}

async function run() {
  const userDataDir = path.join(OUT_DIR, '_chrome_profile');
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const chrome = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=9224',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9224/json/list');
        if (res.ok) {
          targets = await res.json();
          if (Array.isArray(targets) && targets.length > 0) break;
        }
      } catch {}
    }
    if (!targets || targets.length === 0) {
      throw new Error('Could not connect to headless Chrome CDP on port 9224');
    }

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    const cdp = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });

    const results = [];

    for (const dev of DEVICE_PROFILES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: dev.width,
        height: dev.height,
        deviceScaleFactor: dev.deviceScaleFactor,
        mobile: dev.mobile,
      });
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: dev.userAgent });

      await cdp.send('Page.navigate', { url: TARGET_URL });

      // Wait for .a4-page-item and Tinos/KaTeX fonts
      const domSnapshot = await cdp.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          for (let i = 0; i < 80; i++) {
            const pages = document.querySelectorAll('.a4-page-item');
            if (pages.length > 0) break;
            await new Promise(r => setTimeout(r, 100));
          }
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }
          await new Promise(r => setTimeout(r, 250));

          // Intercept window.print so clicking "Print / Save PDF" builds the exact portal without blocking
          window.__originalPrint = window.print;
          window.print = () => { window.__printTriggered = true; };
          const printBtn = Array.from(document.querySelectorAll('button')).find(b => /Print \\/ Save PDF/i.test(b.textContent || ''));
          if (printBtn) {
            printBtn.click();
            for (let j = 0; j < 40; j++) {
              if (window.__printTriggered && document.getElementById('omr-print-active-portal')) break;
              await new Promise(r => setTimeout(r, 100));
            }
          }

          const portal = document.getElementById('omr-print-active-portal');
          const scope = portal || document.getElementById('question-paper-printable-root') || document;
          const a4Pages = Array.from(scope.querySelectorAll('.a4-page-item'));
          if (a4Pages.length === 0) {
            throw new Error('No .a4-page-item rendered! Body: ' + (document.body?.innerText || '').slice(0, 300));
          }
          return {
            tinosLoaded: document.fonts ? document.fonts.check('16px Tinos') : false,
            portalActive: Boolean(portal),
            pageCount: a4Pages.length,
            pages: a4Pages.map((p, idx) => {
              const cols = p.querySelectorAll('.grid-cols-2 > div');
              const inner = p.querySelector('.grid-cols-2');
              const overflowPx = inner ? Math.round(inner.getBoundingClientRect().bottom - p.getBoundingClientRect().bottom) : 0;
              const leftIds = cols[0] ? Array.from(cols[0].querySelectorAll('[data-stream-id]')).map(e => e.getAttribute('data-stream-id')) : [];
              const rightIds = cols[1] ? Array.from(cols[1].querySelectorAll('[data-stream-id]')).map(e => e.getAttribute('data-stream-id')) : [];
              return {
                page: idx + 1,
                offsetWidth: p.offsetWidth,
                offsetHeight: p.offsetHeight,
                overflowPx,
                leftIds,
                rightIds,
              };
            }),
          };
        })()`,
      });

      await cdp.send('Emulation.setEmulatedMedia', { media: '' });
      const pdfRes = await cdp.send('Page.printToPDF', {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        paperWidth: 8.27, // 210mm A4
        paperHeight: 11.69, // 297mm A4
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        preferCSSPageSize: true,
      });

      const pdfBuffer = Buffer.from(pdfRes.data, 'base64');
      const pdfPath = path.join(OUT_DIR, `${dev.name}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      const pdfPages = await extractPdfPages(pdfBuffer);

      results.push({
        device: dev.name,
        label: dev.label,
        pdfPath,
        dom: domSnapshot.result.value,
        pdfPageCount: pdfPages.length,
        pdfPages,
      });
    }

    cdp.close();

    // Compare against Desktop baseline
    const baseline = results[0];
    let allIdentical = true;
    const summary = results.map((r) => {
      const domMatch = JSON.stringify(r.dom.pages) === JSON.stringify(baseline.dom.pages);
      const maxOverflowPx = Math.max(...r.dom.pages.map((p) => p.overflowPx || 0), 0);
      const noOverflow = maxOverflowPx <= 2;
      const pdfCountMatch = r.pdfPageCount === baseline.pdfPageCount;
      const pdfTextMatches = r.pdfPages.map((p, idx) => p.text === baseline.pdfPages[idx]?.text);
      const pdfMatch = pdfCountMatch && pdfTextMatches.every(Boolean);
      if (!domMatch || !pdfMatch || !noOverflow) allIdentical = false;
      return {
        device: r.label,
        tinosLoaded: r.dom.tinosLoaded,
        portalActive: r.dom.portalActive,
        domPageCount: r.dom.pageCount,
        pdfPageCount: r.pdfPageCount,
        maxOverflowPx,
        noOverflow,
        domDimensionsPx: r.dom.pages.map((p) => `${p.offsetWidth}x${p.offsetHeight}`),
        domStructureIdenticalToDesktop: domMatch,
        printedPdfIdenticalToDesktop: pdfMatch,
        pageByPagePdfTextMatch: pdfTextMatches,
      };
    });

    console.log(JSON.stringify({ allIdentical, summary }, null, 2));
    if (!allIdentical) process.exit(1);
  } finally {
    chrome.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
