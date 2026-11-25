/**
 * Elevate UI Performance & Transition Telemetry
 *
 * Lightweight zero-overhead instrumentation for:
 * - Button click -> target screen mount latency (ms)
 * - Main-thread Long Tasks (> 50ms) during active transitions
 * - Ring buffer exposed on `window.__ELEVATE_UI_PERF__` for Human/Turbo UX Audit & MCB
 */

export type UiPerfStatus = 'PASS' | 'WARN' | 'FAIL';

export interface UiTransitionRecord {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  longTasksCount: number;
  maxLongTaskMs: number;
  status: UiPerfStatus;
  meta?: Record<string, any>;
}

interface ActiveTransition {
  id: string;
  name: string;
  startedAt: number;
  longTasksCount: number;
  maxLongTaskMs: number;
}

const MAX_RECORDS = 60;
const activeTransitions = new Map<string, ActiveTransition>();
const completedRecords: UiTransitionRecord[] = [];
let observerInitialized = false;

function getThresholds(name: string): { warnMs: number; failMs: number } {
  if (name.startsWith('tab:')) {
    return { warnMs: 150, failMs: 350 };
  }
  if (name.includes('modal')) {
    return { warnMs: 200, failMs: 450 };
  }
  return { warnMs: 300, failMs: 700 };
}

function classifyTransition(name: string, durationMs: number, maxLongTaskMs: number): UiPerfStatus {
  const { warnMs, failMs } = getThresholds(name);
  if (durationMs > failMs || maxLongTaskMs > 120) return 'FAIL';
  if (durationMs > warnMs || maxLongTaskMs > 50) return 'WARN';
  return 'PASS';
}

function initLongTaskObserver(): void {
  if (observerInitialized || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }
  observerInitialized = true;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) continue;
        activeTransitions.forEach((tr) => {
          tr.longTasksCount += 1;
          if (entry.duration > tr.maxLongTaskMs) {
            tr.maxLongTaskMs = Math.round(entry.duration);
          }
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask observer not supported in all browsers/webviews
  }
}

export function startUiTransition(name: string): void {
  if (typeof performance === 'undefined') return;
  initLongTaskObserver();
  const now = performance.now();
  activeTransitions.set(name, {
    id: `${name}_${Date.now()}`,
    name,
    startedAt: now,
    longTasksCount: 0,
    maxLongTaskMs: 0,
  });
}

export function endUiTransition(name: string, meta?: Record<string, any>): UiTransitionRecord | null {
  if (typeof performance === 'undefined') return null;
  const active = activeTransitions.get(name);
  if (!active) return null;
  activeTransitions.delete(name);

  const endedAt = performance.now();
  const durationMs = Math.max(0, Math.round(endedAt - active.startedAt));
  const record: UiTransitionRecord = {
    id: active.id,
    name,
    startedAt: Math.round(active.startedAt),
    endedAt: Math.round(endedAt),
    durationMs,
    longTasksCount: active.longTasksCount,
    maxLongTaskMs: active.maxLongTaskMs,
    status: classifyTransition(name, durationMs, active.maxLongTaskMs),
    meta,
  };

  completedRecords.push(record);
  if (completedRecords.length > MAX_RECORDS) {
    completedRecords.shift();
  }
  syncGlobalBridge();
  return record;
}

export function getUiPerfRecords(): UiTransitionRecord[] {
  return [...completedRecords];
}

export function clearUiPerfRecords(): void {
  completedRecords.length = 0;
  syncGlobalBridge();
}

function syncGlobalBridge(): void {
  if (typeof window !== 'undefined') {
    (window as any).__ELEVATE_UI_PERF__ = {
      records: completedRecords,
      getRecords: getUiPerfRecords,
      clear: clearUiPerfRecords,
    };
  }
}

if (typeof window !== 'undefined') {
  initLongTaskObserver();
  syncGlobalBridge();
}
