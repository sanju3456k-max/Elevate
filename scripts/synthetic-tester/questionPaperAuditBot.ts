import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBrowserExecutable(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (err) => reject(err));
    });
    this.ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'CDP Error'));
          else resolve(msg.result);
        }
      } catch {}
    });
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout on ${method}`));
        }
      }, 20000);
    });
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value as T;
  }

  async captureScreenshot(outputPath: string): Promise<boolean> {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const res = await this.send('Page.captureScreenshot', { format: 'png' });
      if (res?.data) {
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
        return true;
      }
    } catch {}
    return false;
  }

  close(): void {
    try { this.ws.close(); } catch {}
  }
}

const SAMPLE_DIAGRAM_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140" viewBox="0 0 240 140">' +
      '<rect width="240" height="140" fill="white"/>' +
      '<polygon points="30,120 210,120 120,25" fill="none" stroke="#111" stroke-width="2.5"/>' +
      '<text x="115" y="20" font-size="14" fill="#111">A</text>' +
      '<text x="18" y="132" font-size="14" fill="#111">B</text>' +
      '<text x="212" y="132" font-size="14" fill="#111">C</text>' +
    '</svg>'
  );

const OPTION_DIAGRAM_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70" viewBox="0 0 120 70">' +
      '<line x1="10" y1="60" x2="110" y2="10" stroke="#0b57d0" stroke-width="2.5"/>' +
    '</svg>'
  );

function buildSamplePapers() {
  // Sample 1: Dense Short MCQs (4-across grid rule)
  const sample1 = {
    id: 'audit_sample_1_short_4across',
    title: 'Sample 1: Short MCQ 4-Across Benchmark',
    topic: 'Algebra',
    timeLimitMinutes: 30,
    passingScorePercentage: 50,
    questions: Array.from({ length: 16 }, (_, i) => ({
      id: `s1_q${i + 1}`,
      text: `Find the value of $x + ${i + 2}$ if $2x = ${(i + 1) * 4}$.`,
      options: [`${i + 1}`, `${i + 2}`, `${i + 3}`, `${i + 4}`],
      correctOptionIndex: 1,
      topic: 'Algebra',
      type: 'mcq',
    })),
  };

  // Sample 2: Heavy KaTeX Fractions & Integrals (2x2 grid rule)
  const sample2 = {
    id: 'audit_sample_2_katex_2x2',
    title: 'Sample 2: Heavy KaTeX Fractions & Integrals',
    topic: 'Calculus',
    timeLimitMinutes: 45,
    passingScorePercentage: 50,
    questions: Array.from({ length: 10 }, (_, i) => ({
      id: `s2_q${i + 1}`,
      text: `Evaluate $\\int_0^1 \\frac{x^{${i + 1}}}{x^2 + 1}\\,dx$ and express in standard form.`,
      options: [
        `$\\frac{\\pi}{${i + 4}} - \\frac{1}{2}$`,
        `$\\frac{\\ln 2}{${i + 2}} + \\frac{1}{4}$`,
        `$\\frac{\\pi}{${i + 6}} + \\frac{\\ln 2}{2}$`,
        `$\\frac{1}{${i + 3}} - \\frac{\\pi}{8}$`,
      ],
      correctOptionIndex: 0,
      topic: 'Calculus',
      type: 'mcq',
    })),
  };

  // Sample 3: Long Options (Stacked) + Explicit paperLayout overrides
  const sample3 = {
    id: 'audit_sample_3_stacked_overrides',
    title: 'Sample 3: Long Options & Layout Overrides',
    topic: 'Coordinate Geometry',
    timeLimitMinutes: 40,
    passingScorePercentage: 50,
    questions: [
      {
        id: 's3_q1',
        text: 'Which statement is always true for a continuous differentiable function on $[a, b]$?',
        options: [
          'The function must attain both its absolute maximum and minimum inside the open interval.',
          'There exists at least one point where the tangent is parallel to the secant line.',
          'The derivative is strictly increasing throughout the entire closed interval.',
          'None of the statements hold without second-order differentiability.',
        ],
        correctOptionIndex: 1,
        topic: 'Calculus',
        type: 'mcq',
      },
      {
        id: 's3_q2',
        text: 'Forced 2x2 grid override test for short values:',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        correctOptionIndex: 0,
        topic: 'Algebra',
        type: 'mcq',
        paperLayout: { optionLayout: '2x2_grid' },
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `s3_q${i + 3}`,
        text: `Determine the locus of point $P(h, k)$ satisfying $|z - ${i + 1}| = |z + ${i + 2}i|$ in the Argand plane.`,
        options: [
          `A straight line passing through $(${i + 1}, 0)$ perpendicular to the imaginary axis`,
          `A circle centered at origin with radius $\\sqrt{${i + 5}}$ units`,
          `A parabola with vertex at $(0, ${i + 1})$ opening upwards`,
          `An ellipse with eccentricity $e = \\frac{1}{2}$ and major axis along X-axis`,
        ],
        correctOptionIndex: 0,
        topic: 'Complex Numbers',
        type: 'mcq',
      })),
    ],
  };

  // Sample 4: Diagram & Option-Image Heavy Paper
  const sample4 = {
    id: 'audit_sample_4_diagrams',
    title: 'Sample 4: Diagram & Option Images Paper',
    topic: 'Geometry',
    timeLimitMinutes: 30,
    passingScorePercentage: 50,
    questions: [
      {
        id: 's4_q1',
        text: 'In the given triangle $ABC$, find $\\angle A + \\angle B + \\angle C$.',
        imageUrl: SAMPLE_DIAGRAM_SVG,
        options: ['$90^\\circ$', '$180^\\circ$', '$270^\\circ$', '$360^\\circ$'],
        correctOptionIndex: 1,
        topic: 'Geometry',
        type: 'mcq',
      },
      {
        id: 's4_q2',
        text: 'Which graph represents $y = x$?',
        options: ['Graph A', 'Graph B', 'Graph C', 'Graph D'],
        optionImages: [OPTION_DIAGRAM_SVG, OPTION_DIAGRAM_SVG, OPTION_DIAGRAM_SVG, OPTION_DIAGRAM_SVG],
        correctOptionIndex: 0,
        topic: 'Graphs',
        type: 'mcq',
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `s4_q${i + 3}`,
        text: `Triangle diagram question #${i + 3}: compute area if base is $${i + 4}$ and height is $${i + 6}$.`,
        imageUrl: SAMPLE_DIAGRAM_SVG,
        options: [`${(i + 4) * (i + 6) / 2}`, `${i + 10}`, `${i + 12}`, `${i + 14}`],
        correctOptionIndex: 0,
        topic: 'Geometry',
        type: 'mcq',
      })),
    ],
  };

  // Sample 5: Mixed 35-Question Multi-Page + Inline OMR Sheet
  const sample5 = {
    id: 'audit_sample_5_multipage_omr',
    title: 'Sample 5: 35-Question Multi-Page + Inline OMR',
    topic: 'Full Mock',
    timeLimitMinutes: 60,
    passingScorePercentage: 50,
    questions: Array.from({ length: 35 }, (_, i) => ({
      id: `s5_q${i + 1}`,
      text:
        i % 3 === 0
          ? `Solve $\\frac{d}{dx}(\\sin(${i + 1}x) + e^{2x})$ at $x = 0$.`
          : `Question ${i + 1}: If $a = ${i + 2}, b = ${i + 3}$, find $a^2 + b^2$.`,
      options:
        i % 4 === 0
          ? [`$1$`, `$2$`, `$3$`, `$4$`]
          : [
              `Option value $\\frac{${i + 1}}{2}$`,
              `Option value $\\frac{${i + 2}}{3}$`,
              `Option value $\\frac{${i + 3}}{4}$`,
              `Option value $\\frac{${i + 4}}{5}$`,
            ],
      correctOptionIndex: 0,
      topic: 'Mixed Math',
      type: 'mcq',
      ...(i === 5 ? { diagramUrl: SAMPLE_DIAGRAM_SVG } : {}),
    })),
  };

  // Sample 6: 150-Question Revision Test Mix (3D Geometry + Vectors + Stacked '=' options)
  const sample6 = {
    id: 'audit_sample_6_revision_mix',
    title: 'Sample 6: Revision Test (150-Q 3D Geometry & Vectors Mix)',
    topic: '3D Geometry',
    timeLimitMinutes: 150,
    passingScorePercentage: 50,
    questions: Array.from({ length: 150 }, (_, i) => {
      if (i % 5 === 4) {
        return {
          id: `s6_q${i + 1}`,
          text: `The equation of a line passing through $(-3, 2, 4)$ and equally inclined to the axes, are:`,
          options: [
            '$x - 3 = y + 2 = z - 4$',
            '$x + 3 = y - 2 = z - 4$',
            '$\\frac{x+3}{1} = \\frac{y-2}{2} = \\frac{z+4}{3}$',
            '$\\frac{x-1}{-3} = \\frac{y-1}{2} = \\frac{z-1}{-4}$',
          ],
          correctOptionIndex: 0,
          topic: '3D Geometry',
          type: 'mcq',
        };
      }
      if (i % 5 === 1) {
        return {
          id: `s6_q${i + 1}`,
          text: `Distance of the point $(x, y, z)$ from y-axis is:`,
          options: ['$y$', '$\\sqrt{x^2 + y^2}$', '$\\sqrt{y^2 + z^2}$', '$\\sqrt{z^2 + x^2}$'],
          correctOptionIndex: 3,
          topic: '3D Geometry',
          type: 'mcq',
        };
      }
      return {
        id: `s6_q${i + 1}`,
        text: `Perpendicular distance of point $P(${i + 1}, b, c)$ from YZ Plane is:`,
        options: ['$a$', '$b$', '$c$', 'None'],
        correctOptionIndex: 0,
        topic: '3D Geometry',
        type: 'mcq',
      };
    }),
  };

  return [sample1, sample2, sample3, sample4, sample5, sample6];
}

async function runAudit() {
  const baseUrl = 'http://localhost:3000';
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Chrome/Edge executable not found');
  }

  const screenshotsDir = path.resolve(process.cwd(), 'scripts/synthetic-tester/reports/paper-audit');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 9245;
  const userDataDir = path.join(os.tmpdir(), `elevate_paper_audit_${Date.now()}`);
  const proc: ChildProcess = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,1000',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let cdp: CdpClient | null = null;
  try {
    let wsUrl = '';
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = (await res.json()) as any[];
        const t = targets.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
        if (t) {
          wsUrl = t.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await sleep(200);
    }
    if (!wsUrl) throw new Error('CDP connection failed');

    cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.enable').catch(() => {});

    // Initial visit to set localStorage cleanly
    await cdp.send('Page.navigate', { url: baseUrl });
    await sleep(600);

    const samples = buildSamplePapers();
    const results: any[] = [];

    for (let idx = 0; idx < samples.length; idx++) {
      const sample = samples[idx];
      await cdp.evaluate(`(() => {
        localStorage.setItem('elevate_active_app_institute_id', 'ws_primary');
        localStorage.setItem('elevate_app_institute_guest_mode', 'true');
        localStorage.setItem('elevate_audit_omr_paper_test', ${JSON.stringify(JSON.stringify(sample))});
      })()`);

      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }).catch(() => {});
      await cdp.send('Page.navigate', { url: `${baseUrl}/?auditOmrPaper=1` });

      // Wait for printable root & pagination settle
      let settled = false;
      for (let w = 0; w < 40; w++) {
        settled = await cdp.evaluate<boolean>(`(() => {
          const root = document.getElementById('question-paper-printable-root');
          return Boolean(root && root.querySelectorAll('.a4-page-item').length > 0);
        })()`);
        if (settled) break;
        await sleep(200);
      }
      await sleep(900); // allow KaTeX + measureDomHeights passes to settle

      const previewMetrics = await cdp.evaluate<any>(`(() => {
        const root = document.getElementById('question-paper-printable-root');
        if (!root) return { error: 'no_root' };
        const pages = Array.from(root.querySelectorAll('.a4-page-item'));
        const pageStats = pages.map((p, i) => {
          const rect = p.getBoundingClientRect();
          const imgs = Array.from(p.querySelectorAll('img'));
          const brokenImgs = imgs.filter(im => !im.complete || im.naturalWidth === 0).length;
          const hasWatermark = Boolean(p.querySelector('.elevate-question-watermark svg, .elevate-question-watermark img')) || p.classList.contains('omr-standalone-page');
          const overflowY = p.scrollHeight - p.clientHeight;
          const overflowX = p.scrollWidth - p.clientWidth;
          return {
            page: i + 1,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            scrollH: Math.round(p.scrollHeight),
            clientH: Math.round(p.clientHeight),
            overflowY: Math.round(overflowY),
            overflowX: Math.round(overflowX),
            brokenImgs,
            hasWatermark,
          };
        });
        const grids4 = root.querySelectorAll('.grid-cols-4').length;
        const grids2 = root.querySelectorAll('.grid-cols-2').length;
        return { pageCount: pages.length, pageStats, grids4, grids2 };
      })()`);

      await cdp.captureScreenshot(path.join(screenshotsDir, `sample_${idx + 1}_preview.png`));

      // Stub window.print so triggerSystemPrint keeps #omr-print-active-portal alive for inspection
      const clickRes = await cdp.evaluate<string>(`(() => {
        window.__ELEVATE_ORIG_PRINT__ = window.print;
        window.__ELEVATE_PRINT_CALLED__ = false;
        window.print = () => { window.__ELEVATE_PRINT_CALLED__ = true; };
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => {
          const txt = b.textContent || '';
          return txt.includes('Print / Save PDF') ||
            txt.includes('Print Question Paper') ||
            txt.includes('Print Paper');
        });
        if (btn) { btn.click(); return 'clicked:' + (btn.textContent || '').trim(); }
        return 'not_found:' + btns.map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 12).join('|');
      })()`);

      let portalReady = false;
      for (let w = 0; w < 40; w++) {
        portalReady = await cdp.evaluate<boolean>(`Boolean(document.getElementById('omr-print-active-portal'))`);
        if (portalReady) break;
        await sleep(150);
      }
      await sleep(300);
      if (!portalReady) {
        console.log('   [DEBUG] Print button:', clickRes);
      }

      await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }).catch(() => {});
      await sleep(200);

      const printMetrics = await cdp.evaluate<any>(`(() => {
        const portal = document.getElementById('omr-print-active-portal');
        if (!portal) return { error: 'no_portal' };
        const pages = Array.from(portal.querySelectorAll('.a4-page-item'));
        const pageStats = pages.map((p, i) => {
          const rect = p.getBoundingClientRect();
          const imgs = Array.from(p.querySelectorAll('img'));
          const brokenImgs = imgs.filter(im => !im.complete || im.naturalWidth === 0).length;
          const hasWatermark = Boolean(p.querySelector('.elevate-question-watermark svg, .elevate-question-watermark img')) || p.classList.contains('omr-standalone-page');
          return {
            page: i + 1,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            overflowY: Math.round(p.scrollHeight - p.clientHeight),
            overflowX: Math.round(p.scrollWidth - p.clientWidth),
            brokenImgs,
            hasWatermark,
          };
        });
        return {
          pageCount: pages.length,
          grids4: portal.querySelectorAll('.grid-cols-4').length,
          grids2: portal.querySelectorAll('.grid-cols-2').length,
          pageStats,
        };
      })()`);

      // Also generate actual A4 PDF via Chromium CDP to count real PDF pages!
      const pdfRes = await cdp.send('Page.printToPDF', {
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdfBuf = Buffer.from(pdfRes.data, 'base64');
      const pdfText = pdfBuf.toString('latin1');
      const pdfPagesMatch = pdfText.match(/\/Type\s*\/Page\b(?!s)/g);
      const pdfPageCount = pdfPagesMatch ? pdfPagesMatch.length : 0;
      fs.writeFileSync(path.join(screenshotsDir, `sample_${idx + 1}_print.pdf`), pdfBuf);

      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }).catch(() => {});

      results.push({
        id: sample.id,
        title: sample.title,
        preview: previewMetrics,
        print: printMetrics,
        pdfPageCount,
      });
    }

    console.log('\n=== A4 QUESTION PAPER & PRINT PARITY AUDIT RESULTS ===');
    for (const r of results) {
      const pCount = r.preview?.pageCount || 0;
      const prCount = r.print?.pageCount || 0;
      const parity = pCount > 0 && pCount === prCount && r.pdfPageCount === pCount;
      const previewOverflow = (r.preview?.pageStats || []).some((s: any) => s.overflowY > 4 || s.overflowX > 4);
      const printOverflow = (r.print?.pageStats || []).some((s: any) => s.overflowY > 4 || s.overflowX > 4);
      const allWatermarks = (r.print?.pageStats || []).every((s: any) => s.hasWatermark);
      const anyBrokenImg = [...(r.preview?.pageStats || []), ...(r.print?.pageStats || [])].some((s: any) => s.brokenImgs > 0);
      console.log(`\n📄 ${r.title}`);
      console.log(`   Pages -> Preview: ${pCount} | Print Portal: ${prCount} | PDF: ${r.pdfPageCount} | Parity: ${parity ? '✅' : '❌'}`);
      console.log(`   Grids -> Preview (4-col=${r.preview?.grids4}, 2-col=${r.preview?.grids2}) | Print (4-col=${r.print?.grids4}, 2-col=${r.print?.grids2})`);
      console.log(`   Overflow -> Preview=${previewOverflow ? '❌' : '✅ 0'} | Print=${printOverflow ? '❌' : '✅ 0'} | Watermarks=${allWatermarks ? '✅' : '❌'} | BrokenImgs=${anyBrokenImg ? '❌' : '✅ 0'}`);
      if (previewOverflow || printOverflow) {
        console.log('   Stats:', JSON.stringify({ preview: r.preview?.pageStats, print: r.print?.pageStats }));
      }
    }
    fs.writeFileSync(path.join(screenshotsDir, 'audit-results.json'), JSON.stringify(results, null, 2));
  } finally {
    cdp?.close();
    try { proc.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

runAudit().catch((err) => {
  console.error('❌ Question Paper Audit failed:', err);
  process.exit(1);
});
