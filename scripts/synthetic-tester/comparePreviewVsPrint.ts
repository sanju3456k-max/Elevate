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

  close(): void {
    try { this.ws.close(); } catch {}
  }
}

async function main() {
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error('Browser not found');

  const port = 9249;
  const userDataDir = path.join(os.tmpdir(), `elevate_cmp_${Date.now()}`);
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
        if (t) { wsUrl = t.webSocketDebuggerUrl; break; }
      } catch {}
      await sleep(200);
    }
    if (!wsUrl) throw new Error('CDP failed');

    cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.enable').catch(() => {});

    const sampleTest = {
      id: 'cmp_revision_test',
      title: 'REVISION TEST',
      topic: '3D Geometry',
      timeLimitMinutes: 150,
      passingScorePercentage: 50,
      questions: Array.from({ length: 24 }, (_, i) => {
        if (i % 4 === 3) {
          return {
            id: `q_${i + 1}`,
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
        return {
          id: `q_${i + 1}`,
          text: `Perpendicular distance of point $P(a, b, c)$ from YZ Plane is question ${i + 1}:`,
          options: ['$a$', '$b$', '$c$', 'None'],
          correctOptionIndex: 0,
          topic: '3D Geometry',
          type: 'mcq',
        };
      }),
    };

    await cdp.send('Page.navigate', { url: 'http://localhost:3000' });
    await sleep(500);

    await cdp.evaluate(`(() => {
      localStorage.setItem('elevate_active_app_institute_id', 'ws_primary');
      localStorage.setItem('elevate_app_institute_guest_mode', 'true');
      localStorage.setItem('elevate_audit_omr_paper_test', ${JSON.stringify(JSON.stringify(sampleTest))});
    })()`);

    await cdp.send('Page.navigate', { url: 'http://localhost:3000/?auditOmrPaper=1' });
    for (let w = 0; w < 40; w++) {
      const ok = await cdp.evaluate<boolean>(`Boolean(document.querySelector('#question-paper-printable-root .a4-page-item'))`);
      if (ok) break;
      await sleep(200);
    }
    await sleep(900);

    const inspectPageFn = `function inspectRoot(root) {
      const p = root.querySelector('.a4-page-item');
      if (!p) return null;
      const pRect = p.getBoundingClientRect();
      const cs = window.getComputedStyle(p);
      const grid = p.querySelector('.grid.grid-cols-2.gap-x-5');
      const cols = grid ? Array.from(grid.children).filter(el => el.classList.contains('flex')) : [];
      const leftCol = cols[0];
      const rightCol = cols[1];
      const lRect = leftCol ? leftCol.getBoundingClientRect() : null;
      const rRect = rightCol ? rightCol.getBoundingClientRect() : null;
      const items = Array.from(p.querySelectorAll('[data-stream-id]')).map(el => {
        const r = el.getBoundingClientRect();
        const ecs = window.getComputedStyle(el);
        return {
          id: el.getAttribute('data-stream-id'),
          relTop: Math.round((r.top - pRect.top) * 10) / 10,
          relBottom: Math.round((r.bottom - pRect.top) * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          fontSize: ecs.fontSize,
          lineHeight: ecs.lineHeight,
        };
      });
      return {
        pageW: Math.round(pRect.width * 10) / 10,
        pageH: Math.round(pRect.height * 10) / 10,
        scrollH: p.scrollHeight,
        clientH: p.clientHeight,
        padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
        fontFamily: cs.fontFamily,
        leftColH: lRect ? Math.round(lRect.height * 10) / 10 : 0,
        leftColBottom: lRect ? Math.round((lRect.bottom - pRect.top) * 10) / 10 : 0,
        rightColH: rRect ? Math.round(rRect.height * 10) / 10 : 0,
        rightColBottom: rRect ? Math.round((rRect.bottom - pRect.top) * 10) / 10 : 0,
        gridH: grid ? Math.round(grid.getBoundingClientRect().height * 10) / 10 : 0,
        itemCount: items.length,
        items,
      };
    }`;

    const previewData = await cdp.evaluate<any>(`(${inspectPageFn})(document.getElementById('question-paper-printable-root'))`);

    await cdp.evaluate(`(() => {
      window.print = () => { window.__PRINT_CALLED__ = true; };
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Print / Save PDF'));
      if (btn) btn.click();
    })()`);
    for (let w = 0; w < 30; w++) {
      const ok = await cdp.evaluate<boolean>(`Boolean(document.getElementById('omr-print-active-portal'))`);
      if (ok) break;
      await sleep(150);
    }
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }).catch(() => {});
    await sleep(300);

    const printData = await cdp.evaluate<any>(`(${inspectPageFn})(document.getElementById('omr-print-active-portal'))`);

    console.log('\n=== PAGE 1 COMPARISON: PREVIEW vs PRINT ===');
    console.log('PREVIEW PAGE:', {
      pageW: previewData.pageW,
      pageH: previewData.pageH,
      scrollH: previewData.scrollH,
      clientH: previewData.clientH,
      padding: previewData.padding,
      leftColH: previewData.leftColH,
      leftColBottom: previewData.leftColBottom,
      rightColH: previewData.rightColH,
      rightColBottom: previewData.rightColBottom,
      gridH: previewData.gridH,
      itemCount: previewData.itemCount,
    });
    console.log('PRINT PAGE:  ', {
      pageW: printData.pageW,
      pageH: printData.pageH,
      scrollH: printData.scrollH,
      clientH: printData.clientH,
      padding: printData.padding,
      leftColH: printData.leftColH,
      leftColBottom: printData.leftColBottom,
      rightColH: printData.rightColH,
      rightColBottom: printData.rightColBottom,
      gridH: printData.gridH,
      itemCount: printData.itemCount,
    });

    const diffs: any[] = [];
    for (let i = 0; i < Math.max(previewData.items.length, printData.items.length); i++) {
      const a = previewData.items[i];
      const b = printData.items[i];
      if (!a || !b || Math.abs(a.h - b.h) > 1.5 || Math.abs(a.relTop - b.relTop) > 1.5 || a.fontSize !== b.fontSize) {
        diffs.push({ idx: i, preview: a, print: b });
      }
    }
    console.log('ELEMENT DIFFS (>1.5px or fontSize):', diffs.length);
    if (diffs.length > 0) {
      console.log(JSON.stringify(diffs.slice(0, 8), null, 2));
    }
  } finally {
    cdp?.close();
    try { proc.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
