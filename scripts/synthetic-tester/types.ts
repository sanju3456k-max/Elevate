export type PacingMode = 'human' | 'turbo';

export interface SyntheticPersona {
  uid: string;
  email: string;
  displayName: string;
}

export const DEFAULT_SYNTHETIC_PERSONA: SyntheticPersona = {
  uid: 'synthetic_tester_bot_01',
  email: 'synthetic_tester_01@elevate.internal',
  displayName: 'Synthetic UX Bot 01',
};

export interface CreatedRecordRef {
  collectionPath: string;
  docId: string;
  description: string;
}

export interface SyntheticRunManifest {
  runId: string;
  startedAt: string;
  persona: SyntheticPersona;
  createdRecords: CreatedRecordRef[];
  modifiedBatchId?: string;
}

export interface GfxInfoMetrics {
  deviceSerial: string;
  deviceModel: string;
  totalFrames: number;
  jankyFrames: number;
  jankPercentage: number;
  percentile50Ms: number;
  percentile90Ms: number;
  percentile95Ms: number;
  percentile99Ms: number;
  launchTimeMs?: number;
  rawSummary: string;
}

export interface FeatureCheckResult {
  name: string;
  category: 'cloud' | 'engine' | 'device' | 'sync' | 'web_ux';
  passed: boolean;
  latencyMs: number;
  details: string;
}

export interface UiTransitionMetric {
  name: string;
  durationMs: number;
  longTasksCount: number;
  maxLongTaskMs: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  meta?: Record<string, any>;
}

export interface AuditReportData {
  runId: string;
  timestamp: string;
  pacingMode: PacingMode;
  persona: SyntheticPersona;
  uxSmoothnessScore: number;
  deviceMetrics: GfxInfoMetrics | null;
  uiTransitions?: UiTransitionMetric[];
  consoleErrors?: string[];
  screenshots: { label: string; path: string }[];
  checks: FeatureCheckResult[];
  manifestPath: string;
  purgedAfterRun: boolean;
}
