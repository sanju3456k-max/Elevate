import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { FeatureCheckResult, PacingMode, UiTransitionMetric } from './types';

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

class SimpleCdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  public consoleErrors: string[] = [];

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
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const text = msg.params?.exceptionDetails?.text || 'Uncaught exception';
          this.consoleErrors.push(text);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          const args = (msg.params?.args || []).map((a: any) => a.value || a.description || '').join(' ');
          if (args) this.consoleErrors.push(args.slice(0, 220));
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
      }, 15000);
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
    try {
      this.ws.close();
    } catch {}
  }
}

export async function runWebUxAudit(options: {
  pacingMode: PacingMode;
  screenshotsDir: string;
  baseUrl?: string;
}): Promise<{
  checks: FeatureCheckResult[];
  uiTransitions: UiTransitionMetric[];
  consoleErrors: string[];
  screenshots: { label: string; path: string }[];
}> {
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const checks: FeatureCheckResult[] = [];
  const screenshots: { label: string; path: string }[] = [];
  const delayFactor = options.pacingMode === 'human' ? 1 : 0.25;

  // 1. Check if local server is reachable
  try {
    const healthRes = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3500) });
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch (err: any) {
    checks.push({
      name: 'Web Server Reachability (localhost:3000)',
      category: 'web_ux',
      passed: false,
      latencyMs: 0,
      details: `Local server not reachable at ${baseUrl} (${err?.message || 'offline'}). Start with npm run dev.`,
    });
    return { checks, uiTransitions: [], consoleErrors: [], screenshots };
  }

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    checks.push({
      name: 'Headless Browser Discovery',
      category: 'web_ux',
      passed: false,
      latencyMs: 0,
      details: 'Chrome or Edge executable not found for automated visual UX audit.',
    });
    return { checks, uiTransitions: [], consoleErrors: [], screenshots };
  }

  const port = 9239;
  const userDataDir = path.join(os.tmpdir(), `elevate_ux_audit_${Date.now()}`);
  let proc: ChildProcess | null = null;
  let cdp: SimpleCdpClient | null = null;

  try {
    proc = spawn(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--window-size=412,915',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    // Wait for CDP endpoint
    let wsUrl = '';
    for (let i = 0; i < 20; i++) {
      try {
        const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = (await listRes.json()) as any[];
        const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await sleep(250);
    }

    if (!wsUrl) throw new Error('Timed out waiting for headless browser CDP');

    cdp = new SimpleCdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Helper to wait for a DOM condition up to timeoutMs
    const waitForEval = async (expr: string, timeoutMs = 8000): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const ok = await cdp!.evaluate<boolean>(expr);
        if (ok) return true;
        await sleep(150);
      }
      return false;
    };

    // Step 1: Load App Home & measure Time-To-Interactive (until bottom nav appears)
    const tNavStart = Date.now();
    await cdp.send('Page.navigate', { url: baseUrl });
    const interactive = await waitForEval(`(() => {
      return Array.from(document.querySelectorAll('button, a')).some(b => /\\bTests\\b/i.test(b.textContent || ''));
    })()`, 10000);
    const ttiMs = Date.now() - tNavStart;
    await sleep(Math.round(400 * delayFactor));
    const homeShot = path.join(options.screenshotsDir, 'web_01_home.png');
    if (await cdp.captureScreenshot(homeShot)) {
      screenshots.push({ label: 'Web Home (Interactive)', path: homeShot });
    }
    checks.push({
      name: 'Web App Cold Load & Time-To-Interactive',
      category: 'web_ux',
      passed: interactive,
      latencyMs: ttiMs,
      details: interactive
        ? `Became interactive in ${ttiMs}ms (${options.pacingMode} mode).`
        : `Timed out waiting for Home navigation (${ttiMs}ms).`,
    });

    // Step 2: Navigate to Tests tab
    const tTestsStart = Date.now();
    const clickedTests = await cdp.evaluate<boolean>(`(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const target = btns.find(b => /\\bTests\\b/i.test(b.textContent || ''));
      if (target) { target.click(); return true; }
      return false;
    })()`);
    const testsLoaded = clickedTests && await waitForEval(`(() => {
      return document.body.innerText.includes('Tests available') ||
        Array.from(document.querySelectorAll('div, button')).some(el => /\\b\\d+\\s*Qs\\b/i.test(el.textContent || '') && (el.textContent || '').length < 220);
    })()`, 6000);
    await sleep(Math.round(350 * delayFactor));
    const testsShot = path.join(options.screenshotsDir, 'web_02_tests_tab.png');
    if (await cdp.captureScreenshot(testsShot)) {
      screenshots.push({ label: 'Web Tests Library Tab', path: testsShot });
    }
    checks.push({
      name: 'Web Navigation: Tests Library Tab',
      category: 'web_ux',
      passed: Boolean(testsLoaded),
      latencyMs: Date.now() - tTestsStart,
      details: testsLoaded ? 'Switched to Tests Library and rendered test cards.' : 'Tests tab or test cards did not render in time.',
    });

    // Step 3: Open first Test Card -> TestDetailModal
    const openedDetail = testsLoaded && await cdp.evaluate<boolean>(`(() => {
      const cards = Array.from(document.querySelectorAll('div, button')).filter(el => {
        const txt = (el.textContent || '').trim();
        const isClickable = window.getComputedStyle(el).cursor === 'pointer' || el.tagName === 'BUTTON';
        return isClickable && /\\b\\d+\\s*Qs\\b/i.test(txt) && txt.length < 220;
      });
      const testCard = cards[0];
      if (testCard) { testCard.click(); return true; }
      return false;
    })()`);
    const modalReady = openedDetail && await waitForEval(`Boolean(document.getElementById('fullview-footer-omr-test-btn'))`, 4000);
    await sleep(Math.round(350 * delayFactor));
    const detailShot = path.join(options.screenshotsDir, 'web_03_test_detail.png');
    if (modalReady && (await cdp.captureScreenshot(detailShot))) {
      screenshots.push({ label: 'Web TestDetailModal', path: detailShot });
    }

    // Step 4: Click Attempt OMR Mode + Burst Screenshots (t+80ms, t+250ms, settled)
    if (modalReady) {
      const tOmrStart = Date.now();
      const clickedOmr = await cdp.evaluate<boolean>(`(() => {
        const btn = document.getElementById('fullview-footer-omr-test-btn');
        if (btn) { btn.click(); return true; }
        return false;
      })()`);

      if (clickedOmr) {
        await sleep(80);
        const burst1 = path.join(options.screenshotsDir, 'web_04a_omr_t80ms.png');
        if (await cdp.captureScreenshot(burst1)) screenshots.push({ label: 'OMR Launch Burst (t+80ms)', path: burst1 });

        await sleep(170);
        const burst2 = path.join(options.screenshotsDir, 'web_04b_omr_t250ms.png');
        if (await cdp.captureScreenshot(burst2)) screenshots.push({ label: 'OMR Launch Burst (t+250ms)', path: burst2 });

        const omrSettled = await waitForEval(`document.body.innerText.includes('OMR Mode') || document.body.innerText.includes('OMR Bubble Sheet')`, 6000);
        await sleep(250);
        const settled = path.join(options.screenshotsDir, 'web_04c_omr_settled.png');
        if (await cdp.captureScreenshot(settled)) screenshots.push({ label: 'OMR Studio Settled', path: settled });

        checks.push({
          name: 'Web Flow: Attempt OMR Mode (Burst Capture)',
          category: 'web_ux',
          passed: omrSettled,
          latencyMs: Date.now() - tOmrStart,
          details: omrSettled
            ? 'OMR Studio opened cleanly; captured t+80ms, t+250ms, and settled frames.'
            : 'OMR Studio did not settle within timeout.',
        });
      }
    }

    // Step 5: Turbo Stress Cycling (if turbo mode)
    if (options.pacingMode === 'turbo') {
      const tStressStart = Date.now();
      await cdp.evaluate(`(() => {
        const labels = ['Home', 'Courses', 'Tests', 'Analytics', 'Home'];
        for (const lbl of labels) {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === lbl);
          if (btn) btn.click();
        }
      })()`);
      await sleep(500);
      checks.push({
        name: 'Turbo Mode: Rapid Tab Stress Cycle',
        category: 'web_ux',
        passed: cdp.consoleErrors.length === 0,
        latencyMs: Date.now() - tStressStart,
        details: cdp.consoleErrors.length === 0
          ? 'Rapid 5-tab stress cycle completed with 0 console errors.'
          : `${cdp.consoleErrors.length} console errors detected during rapid tab cycling.`,
      });
    }

    // Collect in-app UI perf telemetry records
    const uiTransitions =
      (await cdp.evaluate<UiTransitionMetric[]>(
        `window.__ELEVATE_UI_PERF__ ? window.__ELEVATE_UI_PERF__.getRecords() : []`
      )) || [];

    return {
      checks,
      uiTransitions,
      consoleErrors: cdp.consoleErrors,
      screenshots,
    };
  } catch (err: any) {
    checks.push({
      name: 'Web Visual UX Audit Execution',
      category: 'web_ux',
      passed: false,
      latencyMs: 0,
      details: `Error during Web UX audit: ${err?.message || String(err)}`,
    });
    return { checks, uiTransitions: [], consoleErrors: cdp?.consoleErrors || [], screenshots };
  } finally {
    cdp?.close();
    if (proc) {
      try {
        proc.kill();
      } catch {}
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}
