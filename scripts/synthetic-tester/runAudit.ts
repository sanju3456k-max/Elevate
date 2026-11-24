import fs from 'fs';
import path from 'path';
import { runAdbDeviceAudit } from './adbDeviceBot';
import { runCloudSwarmAudit } from './cloudSwarmBot';
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
  let purgeAfter = false;

  for (const arg of args) {
    if (arg === '--mode=turbo' || arg === '--turbo') mode = 'turbo';
    else if (arg === '--mode=human') mode = 'human';
    else if (arg.startsWith('--device=')) device = arg.split('=')[1];
    else if (arg === '--skip-adb') skipAdb = true;
    else if (arg === '--purge-after') purgeAfter = true;
  }

  return { mode, device, skipAdb, purgeAfter };
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
  const { mode, device, skipAdb, purgeAfter } = parseArgs();
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

  // 2. Run Real Android Device ADB Bot (if not skipped)
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

  const allChecks = [...cloudRes.checks, ...deviceRes.checks];
  const uxScore = computeUxScore(allChecks, deviceRes.metrics);

  // 3. Optional Auto-Purge
  if (purgeAfter) {
    console.log('\n🧹 [--purge-after] Cleaning up synthetic test records...');
    await purgeSyntheticTestData(manifestPath);
  }

  // 4. Generate UX Audit Report
  const reportData: AuditReportData = {
    runId,
    timestamp: new Date().toISOString(),
    pacingMode: mode,
    persona: cloudRes.manifest.persona,
    uxSmoothnessScore: uxScore,
    deviceMetrics: deviceRes.metrics,
    screenshots: deviceRes.screenshots,
    checks: allChecks,
    manifestPath,
    purgedAfterRun: purgeAfter,
  };

  const md = buildMarkdownReport(reportData);
  const reportPath = path.join(reportsDir, `ux_audit_report_${runId}.md`);
  const latestReportPath = path.join(reportsDir, 'latest_ux_audit_report.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  fs.writeFileSync(latestReportPath, md, 'utf8');

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
