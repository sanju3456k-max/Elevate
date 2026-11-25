import fs from 'fs';
import path from 'path';
import { runAdbDeviceAudit } from './adbDeviceBot';
import { runCloudSwarmAudit } from './cloudSwarmBot';
import { runWebUxAudit } from './webUxAuditBot';
import { runWorkspaceIsolationAudit } from './workspaceIsolationBot';
import { purgeSyntheticTestData } from './purge';
import type {
  AuditReportData,
  FeatureCheckResult,
  GfxInfoMetrics,
  PacingMode,
} from './types';

function parseArgs() {
  const args = process.argv.slice(2);
  let mode: PacingMode = 'human';
  let device: string | undefined;
  let skipAdb = false;
  let skipWeb = false;
  let baseUrl = 'http://localhost:3000';
  let purgeAfter = false;

  for (const arg of args) {
    if (arg === '--mode=turbo' || arg === '--turbo') mode = 'turbo';
    else if (arg === '--mode=human') mode = 'human';
    else if (arg.startsWith('--device=')) device = arg.split('=')[1];
    else if (arg === '--skip-adb') skipAdb = true;
    else if (arg === '--skip-web') skipWeb = true;
    else if (arg.startsWith('--url=')) baseUrl = arg.split('=')[1];
    else if (arg === '--purge-after') purgeAfter = true;
  }

  return { mode, device, skipAdb, skipWeb, baseUrl, purgeAfter };
}

function computeUxScore(
  checks: FeatureCheckResult[],
  metrics: GfxInfoMetrics | null
): number {
  const total = checks.length || 1;
  const passedCount = checks.filter((c) => c.passed).length;
  let baseScore = (passedCount / total) * 8.0;

  if (metrics) {
    // Reward low jank percentage (up to +2.0 points)
    const jankPenalty = Math.min(2.0, (metrics.jankPercentage / 20) * 2.0);
    baseScore += Math.max(0, 2.0 - jankPenalty);
  } else {
    // Cloud-only run: scale passed checks to 10
    baseScore = (passedCount / total) * 10.0;
  }

  return Math.round(Math.min(10, Math.max(1, baseScore)) * 10) / 10;
}

function buildMarkdownReport(data: AuditReportData): string {
  const lines: string[] = [];
  lines.push(`# Elevate Autonomous UX & System Audit Report`);
  lines.push(`- **Run ID:** \`${data.runId}\``);
  lines.push(`- **Timestamp:** ${data.timestamp}`);
  lines.push(`- **Pacing Mode:** \`${data.pacingMode}\``);
  lines.push(
    `- **Synthetic Tester:** \`${data.persona.displayName}\` (\`${data.persona.email}\`)`
  );
  lines.push(`- **Overall UX Smoothness Score:** **${data.uxSmoothnessScore} / 10**`);
  lines.push('');

  lines.push(`## 1. Feature & Cloud Sync Verification Checklist`);
  lines.push(`| Check | Category | Status | Latency | Details |`);
  lines.push(`| :--- | :--- | :---: | :---: | :--- |`);
  for (const c of data.checks) {
    const badge = c.passed ? '✅ PASS' : '❌ FAIL';
    lines.push(
      `| ${c.name} | \`${c.category}\` | ${badge} | ${c.latencyMs} ms | ${c.details} |`
    );
  }
  lines.push('');

  if (data.deviceMetrics) {
    const m = data.deviceMetrics;
    lines.push(`## 2. Real Android Hardware Telemetry (\`dumpsys gfxinfo\`)`);
    lines.push(`- **Device:** ${m.deviceModel} (\`${m.deviceSerial}\`)`);
    if (m.launchTimeMs !== undefined) {
      lines.push(`- **Activity Launch Time:** ${m.launchTimeMs} ms`);
    }
    lines.push(`- **Total Frames Rendered:** ${m.totalFrames}`);
    lines.push(
      `- **Janky Frames (Lag):** ${m.jankyFrames} (${m.jankPercentage}%)`
    );
    lines.push(
      `- **Frame Render Percentiles:** 50th: \`${m.percentile50Ms}ms\` | 90th: \`${m.percentile90Ms}ms\` | 95th: \`${m.percentile95Ms}ms\` | 99th: \`${m.percentile99Ms}ms\``
    );
    lines.push('');
  }

  if (data.uiTransitions && data.uiTransitions.length > 0) {
    lines.push(`## 2b. In-App UI Transition & Long-Task Telemetry`);
    lines.push(`| Transition | Status | Duration | Long Tasks (>50ms) | Max Freeze |`);
    lines.push(`| :--- | :---: | :---: | :---: | :---: |`);
    for (const tr of data.uiTransitions) {
      lines.push(`| \`${tr.name}\` | ${tr.status} | ${tr.durationMs} ms | ${tr.longTasksCount} | ${tr.maxLongTaskMs} ms |`);
    }
    lines.push('');
  }

  if (data.screenshots.length > 0) {
    lines.push(`## 3. Captured Device Screenshots`);
    for (const s of data.screenshots) {
      lines.push(`- **${s.label}:** \`${s.path}\``);
    }
    lines.push('');
  }

  lines.push(`## 4. Synthetic Data Cleanup`);
  if (data.purgedAfterRun) {
    lines.push(
      `- **Status:** ✅ Auto-purged immediately after report generation. Database is 100% clean.`
    );
  } else {
    lines.push(
      `- **Status:** Retained for Master Console inspection (manifest saved at \`${data.manifestPath}\`).`
    );
    lines.push(
      `- **One-Click Purge Command:** \`npm run test:bot:purge\` (or \`npx tsx scripts/synthetic-tester/purge.ts\`)`
    );
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const { mode, device, skipAdb, skipWeb, baseUrl, purgeAfter } = parseArgs();
  const runId = `run_${Date.now()}`;
  const reportsDir = path.resolve(process.cwd(), 'scripts/synthetic-tester/reports');
  const screenshotsDir = path.join(reportsDir, 'screenshots');
  const manifestPath = path.resolve(
    process.cwd(),
    'scripts/synthetic-tester/last-run-manifest.json'
  );

  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  console.log('========================================================================');
  console.log(`🤖 ELEVATE AUTONOMOUS SYNTHETIC TESTER [${mode.toUpperCase()} MODE]`);
  console.log('========================================================================');

  // 1. Run Cloud & MCB Swarm Audit
  console.log('\n☁️  [Cloud & MCB Swarm Bot] Starting end-to-end backend & engine verification...');
  const cloudRes = await runCloudSwarmAudit({ pacingMode: mode, runId });
  fs.writeFileSync(manifestPath, JSON.stringify(cloudRes.manifest, null, 2));

  // 1b. Run Multi-Tenant Master Workspace & Test Sharing Isolation Audit
  console.log('\n🏢 [Workspace Isolation Bot] Verifying Two-Institute Admin & Test Sharing...');
  const wsRes = await runWorkspaceIsolationAudit();

  // 2. Run Web Visual & Timing UX Audit (if not skipped)
  let webRes: Awaited<ReturnType<typeof runWebUxAudit>> = {
    checks: [],
    uiTransitions: [],
    consoleErrors: [],
    screenshots: [],
  };
  if (!skipWeb) {
    console.log(`\n🌐 [Web UX Visual Bot] Inspecting ${baseUrl} in ${mode.toUpperCase()} mode...`);
    webRes = await runWebUxAudit({ pacingMode: mode, screenshotsDir, baseUrl });
  }

  // 3. Run Real Android Device ADB Bot (if not skipped)
  let deviceRes: Awaited<ReturnType<typeof runAdbDeviceAudit>> = {
    metrics: null,
    screenshots: [],
    checks: [],
  };
  if (!skipAdb) {
    deviceRes = await runAdbDeviceAudit({
      serial: device,
      pacingMode: mode,
      screenshotsDir,
    });
  }

  const allChecks = [...cloudRes.checks, ...wsRes.checks, ...webRes.checks, ...deviceRes.checks];
  const uxScore = computeUxScore(allChecks, deviceRes.metrics);

  // 4. Optional Auto-Purge
  if (purgeAfter) {
    console.log('\n🧹 [--purge-after] Cleaning up synthetic test records...');
    await purgeSyntheticTestData(manifestPath);
  }

  // 5. Generate UX Audit Report (Markdown + Structured JSON for MCB)
  const reportData: AuditReportData = {
    runId,
    timestamp: new Date().toISOString(),
    pacingMode: mode,
    persona: cloudRes.manifest.persona,
    uxSmoothnessScore: uxScore,
    deviceMetrics: deviceRes.metrics,
    uiTransitions: webRes.uiTransitions,
    consoleErrors: webRes.consoleErrors,
    screenshots: [...webRes.screenshots, ...deviceRes.screenshots],
    checks: allChecks,
    manifestPath,
    purgedAfterRun: purgeAfter,
  };

  const md = buildMarkdownReport(reportData);
  const reportPath = path.join(reportsDir, `ux_audit_report_${runId}.md`);
  const latestReportPath = path.join(reportsDir, 'latest_ux_audit_report.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  fs.writeFileSync(latestReportPath, md, 'utf8');

  const jsonStr = JSON.stringify(reportData, null, 2);
  fs.writeFileSync(path.join(reportsDir, `audit_${runId}.json`), jsonStr, 'utf8');
  fs.writeFileSync(path.join(reportsDir, 'latest-audit.json'), jsonStr, 'utf8');
  fs.writeFileSync(path.join(reportsDir, `latest-${mode}.json`), jsonStr, 'utf8');

  console.log('\n========================================================================');
  console.log(`✅ AUDIT COMPLETE | UX SMOOTHNESS SCORE: ${uxScore} / 10`);
  console.log(`📄 Report saved to: ${latestReportPath}`);
  console.log('========================================================================\n');
  for (const c of allChecks) {
    console.log(`${c.passed ? '✅' : '❌'} ${c.name} (${c.latencyMs}ms) -> ${c.details}`);
  }
}

main().catch((err) => {
  console.error('❌ Synthetic Audit failed:', err);
  process.exit(1);
});
