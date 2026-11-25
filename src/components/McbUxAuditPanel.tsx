import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  Smartphone,
  Monitor,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  Zap,
  Clock,
} from 'lucide-react';
import { getUiPerfRecords, clearUiPerfRecords, type UiTransitionRecord } from '../lib/uiPerfTelemetry';

interface AuditReportJson {
  runId: string;
  timestamp: string;
  pacingMode: 'human' | 'turbo';
  uxSmoothnessScore: number;
  deviceMetrics?: {
    deviceModel: string;
    deviceSerial: string;
    totalFrames: number;
    jankyFrames: number;
    jankPercentage: number;
    percentile50Ms: number;
    percentile90Ms: number;
    percentile95Ms: number;
    percentile99Ms: number;
    launchTimeMs?: number;
  } | null;
  uiTransitions?: {
    name: string;
    durationMs: number;
    longTasksCount: number;
    maxLongTaskMs: number;
    status: 'PASS' | 'WARN' | 'FAIL';
  }[];
  consoleErrors?: string[];
  screenshots?: { label: string; path: string; url?: string }[];
  checks?: { name: string; category: string; passed: boolean; latencyMs: number; details: string }[];
}

export const McbUxAuditPanel: React.FC = () => {
  const [selectedMode, setSelectedMode] = useState<'human' | 'turbo' | 'live'>('human');
  const [reports, setReports] = useState<{ human: AuditReportJson | null; turbo: AuditReportJson | null; latest: AuditReportJson | null }>({
    human: null,
    turbo: null,
    latest: null,
  });
  const [liveRecords, setLiveRecords] = useState<UiTransitionRecord[]>(() => getUiPerfRecords());
  const [isLoading, setIsLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setLiveRecords(getUiPerfRecords());
    try {
      const res = await fetch('/api/audit-reports');
      if (res.ok) {
        const data = await res.json();
        setReports({
          human: data.human || null,
          turbo: data.turbo || null,
          latest: data.latest || null,
        });
      }
    } catch {
      // Offline or static build without Express API
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const activeReport =
    selectedMode === 'human'
      ? reports.human || reports.latest
      : selectedMode === 'turbo'
      ? reports.turbo || reports.latest
      : null;

  const badgeClass = (status: 'PASS' | 'WARN' | 'FAIL') =>
    status === 'PASS'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : status === 'WARN'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-[#0b57d0]" />
            <span>MCB UI Performance &amp; Human/Turbo Visual Audit</span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
            Run <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono">npm run test:bot</code> (Human) or{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono">npm run test:bot:turbo</code> (Turbo) to refresh telemetry &amp; burst screenshots.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(['human', 'turbo', 'live'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMode(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize cursor-pointer border-0 transition ${
                selectedMode === m
                  ? 'bg-[#0b57d0] text-white'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {m === 'live' ? `Live Session (${liveRecords.length})` : `${m} Mode`}
            </button>
          ))}
          <button
            type="button"
            onClick={loadReports}
            disabled={isLoading}
            className="p-2 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer border-0 transition"
            title="Refresh Audit Reports"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live Browser Session Telemetry Mode */}
      {selectedMode === 'live' ? (
        <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>In-App UI Transition Telemetry (Current Browser Session)</span>
            </h4>
            <button
              type="button"
              onClick={() => {
                clearUiPerfRecords();
                setLiveRecords([]);
              }}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer bg-transparent border-0"
            >
              Clear Buffer
            </button>
          </div>
          {liveRecords.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
              No UI transitions recorded in this session yet. Open a test in OMR Mode or Online Test to see live timings here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                    <th className="py-2 pr-3">Transition</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Long Tasks (&gt;50ms)</th>
                    <th className="py-2">Max Freeze</th>
                  </tr>
                </thead>
                <tbody>
                  {liveRecords.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-zinc-800/50">
                      <td className="py-2 pr-3 font-mono font-semibold text-slate-800 dark:text-zinc-200">{r.name}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums font-bold">{r.durationMs} ms</td>
                      <td className="py-2 pr-3 tabular-nums">{r.longTasksCount}</td>
                      <td className="py-2 tabular-nums">{r.maxLongTaskMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !activeReport ? (
        <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-8 text-center space-y-2">
          <Clock className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">No {selectedMode.toUpperCase()} audit report found yet</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Run <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono">npm run test:bot</code> in terminal, then click Refresh.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400">UX Smoothness Score</div>
              <div className="text-2xl font-black text-[#0b57d0] dark:text-[#a8c7fa] tabular-nums">
                {activeReport.uxSmoothnessScore} <span className="text-sm font-bold text-slate-400">/ 10</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                Mode: <strong className="uppercase">{activeReport.pacingMode}</strong> · {new Date(activeReport.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android Hardware (gfxinfo)</span>
              </div>
              {activeReport.deviceMetrics ? (
                <>
                  <div className="text-lg font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums">
                    {activeReport.deviceMetrics.jankPercentage}% Janky Frames
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                    50th: {activeReport.deviceMetrics.percentile50Ms}ms · 95th: {activeReport.deviceMetrics.percentile95Ms}ms · 99th: {activeReport.deviceMetrics.percentile99Ms}ms
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 dark:text-zinc-400 pt-1">No ADB device connected during this run</div>
              )}
            </div>

            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5" />
                <span>Console &amp; Runtime Errors</span>
              </div>
              <div className={`text-lg font-extrabold tabular-nums ${(activeReport.consoleErrors?.length || 0) === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {activeReport.consoleErrors?.length || 0} Errors
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                {(activeReport.checks || []).filter((c) => c.passed).length} / {(activeReport.checks || []).length} Audit Checks Passed
              </div>
            </div>
          </div>

          {/* Checks Table */}
          {activeReport.checks && activeReport.checks.length > 0 && (
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Feature, Web UX &amp; Sync Checks</h4>
              <div className="space-y-2">
                {activeReport.checks.map((c, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 text-xs">
                    <div className="flex items-start gap-2 min-w-0">
                      {c.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-zinc-200">{c.name}</div>
                        <div className="text-slate-500 dark:text-zinc-400 break-words">{c.details}</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-700 dark:text-zinc-300 shrink-0 tabular-nums">{c.latencyMs} ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UI Transitions Table */}
          {activeReport.uiTransitions && activeReport.uiTransitions.length > 0 && (
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">In-App UI Transition Timings &amp; Long Tasks</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                      <th className="py-2 pr-3">Transition</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Duration</th>
                      <th className="py-2 pr-3">Long Tasks</th>
                      <th className="py-2">Max Freeze</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReport.uiTransitions.map((tr, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-zinc-800/50">
                        <td className="py-2 pr-3 font-mono font-semibold">{tr.name}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass(tr.status)}`}>{tr.status}</span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums font-bold">{tr.durationMs} ms</td>
                        <td className="py-2 pr-3 tabular-nums">{tr.longTasksCount}</td>
                        <td className="py-2 tabular-nums">{tr.maxLongTaskMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Visual Inspection Screenshots */}
          {activeReport.screenshots && activeReport.screenshots.length > 0 && (
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#0b57d0]" />
                <span>Visual Inspection &amp; Burst Screenshots</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {activeReport.screenshots.map((s, idx) => (
                  <div key={idx} className="rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-900 p-2 space-y-1.5">
                    {s.url ? (
                      <img src={s.url} alt={s.label} className="w-full h-44 object-cover object-top rounded-lg" loading="lazy" />
                    ) : (
                      <div className="h-44 flex items-center justify-center text-[11px] text-slate-400">Saved locally</div>
                    )}
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 truncate" title={s.label}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeReport.consoleErrors && activeReport.consoleErrors.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/30 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Detected Console / Runtime Errors</span>
              </h4>
              <ul className="text-xs font-mono text-rose-800 dark:text-rose-200 space-y-1 list-disc pl-4">
                {activeReport.consoleErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
