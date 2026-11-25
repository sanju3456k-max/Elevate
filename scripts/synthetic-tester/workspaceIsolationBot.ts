import type { FeatureCheckResult } from './types';
import type { MasterWorkspace } from '../../src/lib/masterWorkspace';

function ensureNodeLocalStorage(): void {
  if (typeof (globalThis as any).localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

/**
 * Multi-Tenant Master Workspace & Test Creator Sharing Audit Bot
 * Tests Two Separate Institutes (Institute A vs Institute B), Team Admins,
 * Data/Question Sharing, Test Creator Studio Loading/Forking/Sharing, and Live Revocation.
 */
export async function runWorkspaceIsolationAudit(): Promise<{ checks: FeatureCheckResult[] }> {
  ensureNodeLocalStorage();
  const checks: FeatureCheckResult[] = [];

  const {
    PRIMARY_WORKSPACE_ID,
    getCachedMasterWorkspaces,
    saveCachedMasterWorkspaces,
    getWorkspacesForUser,
    isMasterWorkspaceMember,
    canManageWorkspaceTeam,
  } = await import('../../src/lib/masterWorkspace');
  const { formatTestToText, parseTestFromText } = await import('../../src/utils/testFormatConverter');
  const { encodeTestToShareUrl, decodeTestFromShareUrl } = await import('../../src/utils/shareUtils');

  const snapshotBefore = getCachedMasterWorkspaces();

  try {
    // WS-01: Two Separate Institutes Provisioning
    const t0 = Date.now();
    const wsA: MasterWorkspace = {
      id: PRIMARY_WORKSPACE_ID,
      name: 'Institute A (Sanju)',
      ownerEmail: 'sanju3456k@gmail.com',
      teamAdminEmails: ['admina@institutea.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const wsB: MasterWorkspace = {
      id: 'ws_institute_b_test',
      name: 'Institute B',
      ownerEmail: 'director@instituteb.com',
      teamAdminEmails: ['adminb@instituteb.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveCachedMasterWorkspaces([wsA, wsB]);

    const adminAIsMaster = isMasterWorkspaceMember('admina@institutea.com');
    const adminBIsMaster = isMasterWorkspaceMember('adminb@instituteb.com');
    const studentIsMaster = isMasterWorkspaceMember('student_random@gmail.com');
    checks.push({
      name: 'WS-01: Two-Institute Workspace Provisioning & Member Auth',
      category: 'security',
      passed: adminAIsMaster && adminBIsMaster && !studentIsMaster,
      latencyMs: Date.now() - t0,
      details: `adminA=${adminAIsMaster}, adminB=${adminBIsMaster}, studentBlocked=${!studentIsMaster}`,
    });

    // WS-02: Cross-Institute Team Admin Isolation
    const t1 = Date.now();
    const adminAWorkspaces = getWorkspacesForUser('admina@institutea.com').map((w) => w.id);
    const adminBWorkspaces = getWorkspacesForUser('adminb@instituteb.com').map((w) => w.id);
    const isolated =
      adminAWorkspaces.length === 1 &&
      adminAWorkspaces[0] === wsA.id &&
      adminBWorkspaces.length === 1 &&
      adminBWorkspaces[0] === wsB.id;
    checks.push({
      name: 'WS-02: Strict Cross-Institute Team Admin Isolation',
      category: 'security',
      passed: isolated,
      latencyMs: Date.now() - t1,
      details: `adminA=[${adminAWorkspaces.join(',')}], adminB=[${adminBWorkspaces.join(',')}]`,
    });

    // WS-03: Owner-Only Team Management Enforcement
    const t2 = Date.now();
    const ownerBCanManage = canManageWorkspaceTeam(wsB, 'director@instituteb.com');
    const teamAdminBCannotManage = !canManageWorkspaceTeam(wsB, 'adminb@instituteb.com');
    const ownerACannotManageB = !canManageWorkspaceTeam(wsB, 'otherowner@gmail.com');
    checks.push({
      name: 'WS-03: Owner-Only Team Management Permissions',
      category: 'security',
      passed: ownerBCanManage && teamAdminBCannotManage && ownerACannotManageB,
      latencyMs: Date.now() - t2,
      details: `ownerB=${ownerBCanManage}, adminBBlocked=${teamAdminBCannotManage}, outsiderBlocked=${ownerACannotManageB}`,
    });

    // WS-04: Workspace Test & Question Data Isolation + Sharing
    const t3 = Date.now();
    const sampleTests = [
      { id: 't_a1', title: 'Institute A Test', workspaceId: wsA.id, questions: [{ id: 'q1', text: 'Q A1' }] },
      { id: 't_b1', title: 'Institute B Test', workspaceId: wsB.id, questions: [{ id: 'q2', text: 'Q B1' }] },
    ];
    const adminBVisibleTests = sampleTests.filter(
      (t) => (t.workspaceId || PRIMARY_WORKSPACE_ID) === adminBWorkspaces[0]
    );
    const adminAVisibleTests = sampleTests.filter(
      (t) => (t.workspaceId || PRIMARY_WORKSPACE_ID) === adminAWorkspaces[0]
    );
    checks.push({
      name: 'WS-04: Workspace Test & Question Catalog Isolation',
      category: 'sync',
      passed:
        adminBVisibleTests.length === 1 &&
        adminBVisibleTests[0].id === 't_b1' &&
        adminAVisibleTests.length === 1 &&
        adminAVisibleTests[0].id === 't_a1',
      latencyMs: Date.now() - t3,
      details: `InstA visible=${adminAVisibleTests.map((t) => t.id).join(',')}, InstB visible=${adminBVisibleTests.map((t) => t.id).join(',')}`,
    });

    // WS-05: Test Creator Studio Text/Share Roundtrip (Questions + PaperLayout)
    const t4 = Date.now();
    const testWithLayout: any = {
      id: 't_layout_check',
      title: 'Shared Layout Assessment',
      topic: 'Calculus',
      timeLimitMinutes: 30,
      questions: [
        {
          id: 'q_1',
          text: 'Find d/dx(x^2)',
          topic: 'Calculus',
          type: 'mcq',
          options: ['x', '2x', 'x^2', '2'],
          correctAnswer: '1',
          correctOptionIndex: 1,
          paperLayout: { optionLayout: '2x2_grid', breakBefore: 'column', keepTogether: false },
        },
      ],
    };
    const serializedTxt = formatTestToText(testWithLayout);
    const parsedFromTxt = parseTestFromText(serializedTxt, 'Calculus');
    const parsedLayout = parsedFromTxt.questions?.[0]?.paperLayout;

    // Also test URL share encoding/decoding for students & members
    (globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000', pathname: '/' } };
    const shareUrl = encodeTestToShareUrl(testWithLayout);
    const parsedUrl = new URL(shareUrl);
    const shareParam =
      parsedUrl.searchParams.get('shareTest') ||
      (parsedUrl.hash.includes('shareTest=') ? parsedUrl.hash.split('shareTest=')[1].split('&')[0] : '');
    const decodedShared = decodeTestFromShareUrl(shareParam);

    const roundtripOk =
      parsedLayout?.optionLayout === '2x2_grid' &&
      parsedLayout?.breakBefore === 'column' &&
      parsedLayout?.keepTogether === false &&
      decodedShared?.questions?.length === 1 &&
      decodedShared?.questions?.[0]?.paperLayout?.optionLayout === '2x2_grid';

    checks.push({
      name: 'WS-05: Test Creator Studio Sharing, Loading & PaperLayout Roundtrip',
      category: 'ux',
      passed: Boolean(roundtripOk),
      latencyMs: Date.now() - t4,
      details: `txtLayout=${JSON.stringify(parsedLayout)}, sharedQs=${decodedShared?.questions?.length || 0}`,
    });

    // WS-06: Live Team Admin Revocation
    const t5 = Date.now();
    saveCachedMasterWorkspaces([
      wsA,
      { ...wsB, teamAdminEmails: [] },
    ]);
    const revokedAdminB = !isMasterWorkspaceMember('adminb@instituteb.com');
    checks.push({
      name: 'WS-06: Live Team Admin Revocation',
      category: 'security',
      passed: revokedAdminB,
      latencyMs: Date.now() - t5,
      details: `adminB access after removal=${!revokedAdminB}`,
    });
  } finally {
    saveCachedMasterWorkspaces(snapshotBefore);
  }

  return { checks };
}
