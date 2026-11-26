import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, limit, query } from 'firebase/firestore';

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
  return candidates.find((p) => fs.existsSync(p)) || null;
}

class SimpleCdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  public consoleErrors: string[] = [];
  public consoleWarnings: string[] = [];
  public networkUrls: string[] = [];
  public failedRequests: Array<{ url: string; status: number; statusText?: string }> = [];

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
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          const type = msg.params?.type;
          const args = (msg.params?.args || []).map((a: any) => a.value || a.description || '').join(' ');
          if (!args) return;
          if (type === 'error') this.consoleErrors.push(args.slice(0, 300));
          else if (type === 'warning') this.consoleWarnings.push(args.slice(0, 300));
        } else if (msg.method === 'Network.requestWillBeSent') {
          const url = String(msg.params?.request?.url || '');
          if (
            url.includes('googleapis.com') ||
            url.includes('firebase') ||
            url.includes('identitytoolkit') ||
            url.includes('securetoken')
          ) {
            this.networkUrls.push(url);
          }
        } else if (msg.method === 'Network.responseReceived') {
          const url = String(msg.params?.response?.url || '');
          const status = Number(msg.params?.response?.status || 0);
          if (status >= 400 && (url.includes('googleapis.com') || url.includes('firebase'))) {
            this.failedRequests.push({
              url: url.slice(0, 220),
              status,
              statusText: msg.params?.response?.statusText,
            });
          }
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

  async eval(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Eval exception');
    }
    return res?.result?.value;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {}
  }
}

function startStaticServer(rootDir: string, port: number): Promise<http.Server> {
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };

  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    let filePath = path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(rootDir, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function runApexAudit() {
  const rootDir = process.cwd();
  const apexCfgPath = path.join(rootDir, 'android', 'tenants', 'apexAcademy', 'firebase-web-config.json');
  const apexDistDir = path.join(rootDir, 'dist-tenants', 'apexAcademy');

  console.log('========================================================================');
  console.log('🔬 APEX ACADEMY ISOLATED DEEP AUDIT (Zero Impact on Elevate Labs)');
  console.log('========================================================================');

  // PART A: Direct Firestore Probe against apex-academy-6941e
  const apexConfig = JSON.parse(fs.readFileSync(apexCfgPath, 'utf8'));
  const dbId = apexConfig.firestoreDatabaseId;
  console.log(`\n[1] Probing Apex Firebase project: ${apexConfig.projectId} (db=${dbId || '(default)'})`);
  const app = initializeApp(apexConfig, `apex_audit_${Date.now()}`);
  const db = dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);

  const collectionsToProbe = [
    { label: 'batches (public read)', fn: () => getDocs(query(collection(db, 'batches'), limit(10))) },
    { label: 'test/connection', fn: () => getDoc(doc(db, 'test', 'connection')) },
    { label: 'master_catalog/lms_announcements', fn: () => getDoc(doc(db, 'master_catalog', 'lms_announcements')) },
    { label: 'master_catalog/batch_catalog_meta', fn: () => getDoc(doc(db, 'master_catalog', 'batch_catalog_meta')) },
    { label: 'app_storefront/inst_apex_01', fn: () => getDoc(doc(db, 'app_storefront', 'inst_apex_01')) },
    {
      label: 'test_leaderboards/MASTER_CATALOG/summary/published_tests',
      fn: () => getDoc(doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', 'published_tests')),
    },
  ];

  for (const probe of collectionsToProbe) {
    try {
      const snap: any = await probe.fn();
      if ('size' in snap) {
        const ids = snap.docs.map((d: any) => d.id);
        console.log(`  ✅ ${probe.label}: count=${snap.size}, ids=[${ids.join(', ')}]`);
      } else {
        console.log(`  ✅ ${probe.label}: exists=${snap.exists()}`);
      }
    } catch (err: any) {
      console.log(`  ❌ ${probe.label}: ERROR -> ${err?.code || ''} ${err?.message || err}`);
    }
  }

  await deleteApp(app).catch(() => {});

  // PART B: Isolated Headless Browser Scan on dist-tenants/apexAcademy
  if (!fs.existsSync(path.join(apexDistDir, 'index.html'))) {
    console.log('\n❌ dist-tenants/apexAcademy/index.html missing. Build it first.');
    process.exit(1);
  }

  const exe = findBrowserExecutable();
  if (!exe) {
    console.log('\n❌ Chrome/Edge executable not found for browser trace.');
    process.exit(1);
  }

  const port = 4179;
  const server = await startStaticServer(apexDistDir, port);
  const debugPort = 9335;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-audit-'));
  let browserProc: ChildProcess | null = null;
  let cdp: SimpleCdpClient | null = null;

  try {
    console.log(`\n[2] Launching isolated headless browser on http://127.0.0.1:${port} ...`);
    browserProc = spawn(
      exe,
      [
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,900',
        `http://127.0.0.1:${port}/`,
      ],
      { stdio: 'ignore' }
    );

    let wsUrl = '';
    for (let i = 0; i < 30; i++) {
      await sleep(350);
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        const pages = (await res.json()) as any[];
        const target = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        if (target) {
          wsUrl = target.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) throw new Error('Could not connect to CDP WebSocket');
    cdp = new SimpleCdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');

    await sleep(2500);

    // Check gate text & inject Apex Admin cached user for Master Console UI scan
    const initialBody = await cdp.eval(`document.body.innerText.slice(0, 300)`);
    console.log(`\n[3] Initial Gate Text: ${JSON.stringify(initialBody)}`);

    // Simulate Apex Admin session (harry4444u@gmail.com) in isolated localStorage
    await cdp.eval(`(() => {
      localStorage.setItem('elevate_active_institute_id_v1', 'inst_apex_01');
      localStorage.setItem('math_mock_cached_auth_user_v1', JSON.stringify({
        uid: 'audit_harry_uid',
        email: 'harry4444u@gmail.com',
        displayName: 'Apex Admin Audit',
        photoURL: null
      }));
      localStorage.setItem('elevate_web_access_authorized_v1', 'true');
      location.reload();
    })()`);

    await sleep(3500);

    const dashboardInfo = await cdp.eval(`(() => {
      const text = document.body.innerText;
      const hasMasterBtn = Array.from(document.querySelectorAll('button')).some(b => /master console/i.test(b.innerText));
      return {
        hasMasterBtn,
        title: document.title,
        snippet: text.slice(0, 260)
      };
    })()`);
    console.log(`\n[4] Logged-in Apex Admin UI Check:`, dashboardInfo);

    // Open Master Console -> Create Batch -> Check Persistence before & after reload
    const batchCreateResult = await cdp.eval(`(async () => {
      const btns = Array.from(document.querySelectorAll('button'));
      const masterBtn = btns.find(b => /master console/i.test(b.innerText));
      if (!masterBtn) return { error: 'Master Console button not found' };
      masterBtn.click();
      await new Promise(r => setTimeout(r, 1200));

      const createBtn = Array.from(document.querySelectorAll('button')).find(b => /create.*batch|new batch/i.test(b.innerText));
      if (!createBtn) {
        return {
          error: 'Create Batch button not found',
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 25)
        };
      }
      createBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const titleInput = document.querySelector('input[placeholder*="Batch" i], input[placeholder*="Title" i], input[type="text"]');
      if (!titleInput) return { error: 'Batch title input not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(titleInput, 'Apex Audit Batch 999');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));

      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => /create batch|save batch|publish batch/i.test(b.innerText));
      if (submitBtn) submitBtn.click();
      await new Promise(r => setTimeout(r, 2000));

      const toast = document.body.innerText.match(/Warning:.*|Permission.*|successfully synced.*/i)?.[0] || '';
      const hasBatchInDom = document.body.innerText.includes('Apex Audit Batch 999');
      const lsBatchesKey = localStorage.getItem('elevatelabs_batches_v2');
      return {
        hasBatchInDom,
        hasLocalStorageBatches: Boolean(lsBatchesKey),
        toast
      };
    })()`);
    console.log(`\n[5] Master Console Create Batch Result:`, batchCreateResult);

    // Reload and check if batch survived
    await cdp.eval(`location.reload()`);
    await sleep(3500);

    const afterReload = await cdp.eval(`(() => {
      return {
        batchVisibleAfterReload: document.body.innerText.includes('Apex Audit Batch 999'),
        hasLocalStorageBatches: Boolean(localStorage.getItem('elevatelabs_batches_v2')),
        localStorageBatchesLen: (localStorage.getItem('elevatelabs_batches_v2') || '').length
      };
    })()`);
    console.log(`\n[6] After Reload Persistence Check:`, afterReload);

    // Inspect Network Traffic Routing
    const elevateLeakUrls = cdp.networkUrls.filter((u) => u.includes('mock-math-test'));
    const apexUrls = cdp.networkUrls.filter((u) => u.includes('apex-academy-6941e'));
    console.log(`\n[7] Network Request Routing Audit:`);
    console.log(`  - Requests to apex-academy-6941e: ${apexUrls.length}`);
    console.log(`  - Requests leaked to mock-math-test (Elevate): ${elevateLeakUrls.length}`);
    if (elevateLeakUrls.length > 0) {
      console.log(`  ❌ LEAKED URLs:`, elevateLeakUrls.slice(0, 5));
    }
    if (cdp.failedRequests.length > 0) {
      console.log(`  ⚠️ Failed HTTP/Firebase requests (${cdp.failedRequests.length}):`, cdp.failedRequests.slice(0, 8));
    }
    if (cdp.consoleErrors.length > 0) {
      console.log(`  ⚠️ Console errors (${cdp.consoleErrors.length}):`, cdp.consoleErrors.slice(0, 8));
    }
    if (cdp.consoleWarnings.length > 0) {
      console.log(`  ℹ️ Console warnings (${cdp.consoleWarnings.length}):`, cdp.consoleWarnings.slice(0, 8));
    }
  } finally {
    if (cdp) cdp.close();
    if (browserProc) browserProc.kill();
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runApexAudit().catch((err) => {
  console.error('Apex audit fatal error:', err);
  process.exit(1);
});
