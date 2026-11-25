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
    getSelectedAppInstituteId,
    setSelectedAppInstituteId,
    getAppInstituteGuestMode,
    setAppInstituteGuestMode,
    canEmailUnlockInstituteWeb,
    getInstituteInviteLink,
    belongsToInstitute,
  } = await import('../../src/lib/masterWorkspace');
  const { deriveRealBatchNotifications } = await import('../../src/lib/notifications');
  const { isMasterUser } = await import('../../src/lib/masterAccount');
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

    // WS-07: App View Batch & Published Test Isolation (Institute A vs Institute B)
    const t6 = Date.now();
    saveCachedMasterWorkspaces([wsA, wsB]);
    setSelectedAppInstituteId(wsB.id);
    setAppInstituteGuestMode(true);
    const activeAppInstB = getSelectedAppInstituteId();
    const guestActive = getAppInstituteGuestMode();

    const mockBatches = [
      { id: 'b_a1', title: 'Batch Alpha (Inst A)', workspaceId: wsA.id, isPublished: true },
      { id: 'b_b1', title: 'Batch Beta (Inst B)', workspaceId: wsB.id, isPublished: true },
    ];
    const mockCatalogTests = [
      { id: 'pub_a1', title: 'Inst A Mock', workspaceId: wsA.id },
      { id: 'pub_b1', title: 'Inst B Mock', workspaceId: wsB.id },
      { id: 'personal_1', title: 'My Personal Test', isPersonal: true },
    ];
    const appBVisibleBatches = mockBatches.filter(
      (b) => (b.workspaceId || PRIMARY_WORKSPACE_ID) === activeAppInstB
    );
    const appBVisibleTests = mockCatalogTests.filter(
      (t: any) => (t.workspaceId || PRIMARY_WORKSPACE_ID) === activeAppInstB || Boolean(t.isPersonal)
    );
    const appViewIsolated =
      activeAppInstB === wsB.id &&
      guestActive &&
      appBVisibleBatches.length === 1 &&
      appBVisibleBatches[0].id === 'b_b1' &&
      appBVisibleTests.length === 2 &&
      !appBVisibleTests.some((t) => t.id === 'pub_a1');

    checks.push({
      name: 'WS-07: App View Batch & Test Isolation (Institute A vs B)',
      category: 'security',
      passed: appViewIsolated,
      latencyMs: Date.now() - t6,
      details: `activeInst=${activeAppInstB}, batches=[${appBVisibleBatches.map((b) => b.id).join(',')}], tests=[${appBVisibleTests.map((t) => t.id).join(',')}]`,
    });

    // WS-08: Web App Admin Unlock vs Student Block Per Institute
    const t7 = Date.now();
    const directorBOnB = canEmailUnlockInstituteWeb('director@instituteb.com', wsB.id);
    const adminBOnB = canEmailUnlockInstituteWeb('adminb@instituteb.com', wsB.id);
    const adminBOnA = canEmailUnlockInstituteWeb('adminb@instituteb.com', wsA.id);
    const sanjuOnB = canEmailUnlockInstituteWeb('sanju3456k@gmail.com', wsB.id);
    const studentOnA = canEmailUnlockInstituteWeb('student_random@gmail.com', wsA.id);
    const studentOnB = canEmailUnlockInstituteWeb('student_random@gmail.com', wsB.id);
    checks.push({
      name: 'WS-08: Web App Per-Institute Admin Unlock & Student Block',
      category: 'security',
      passed: directorBOnB && adminBOnB && !adminBOnA && sanjuOnB && !studentOnA && !studentOnB,
      latencyMs: Date.now() - t7,
      details: `directorBOnB=${directorBOnB}, adminBOnB=${adminBOnB}, adminBOnA=${adminBOnA}, studentBlocked=${!studentOnA && !studentOnB}`,
    });

    // WS-09: Institute Invite Link Generation
    const t8 = Date.now();
    const inviteLinkB = getInstituteInviteLink(wsB.id);
    checks.push({
      name: 'WS-09: Institute Invite Link (?institute=ws_...)',
      category: 'ux',
      passed: inviteLinkB.includes(`institute=${encodeURIComponent(wsB.id)}`),
      latencyMs: Date.now() - t8,
      details: `inviteLink=${inviteLinkB}`,
    });

    // WS-10: Same-Student Multi-Institute Data Isolation (Attempts, Sessions, WatchProgress, PersonalNotes, Announcements)
    const t9 = Date.now();
    const studentAttempts = [
      { id: 'att_legacy', testId: 't_a1', userId: 'student_multi_01', score: 40 }, // legacy without workspaceId -> ws_primary
      { id: 'att_a', testId: 't_a2', userId: 'student_multi_01', score: 50, workspaceId: wsA.id },
      { id: 'att_b', testId: 't_b1', userId: 'student_multi_01', score: 85, workspaceId: wsB.id },
    ];
    const studentNotes = [
      { id: 'note_a', lectureId: 'lec_a', seconds: 10, text: 'Inst A Note', createdAt: 'now', workspaceId: wsA.id },
      { id: 'note_b', lectureId: 'lec_b', seconds: 20, text: 'Inst B Note', createdAt: 'now', workspaceId: wsB.id },
    ];
    const studentProgress = [
      { lectureId: 'lec_a', watchedSeconds: 100, totalSeconds: 100, isCompleted: true, lastWatchedAt: 'now', workspaceId: wsA.id },
      { lectureId: 'lec_b', watchedSeconds: 50, totalSeconds: 100, isCompleted: false, lastWatchedAt: 'now', workspaceId: wsB.id },
    ];
    const globalAnnouncements = [
      { id: 'ann_a_global', title: 'Inst A Global', date: new Date().toISOString(), workspaceId: wsA.id, isHeroBanner: true },
      { id: 'ann_b_global', title: 'Inst B Global', date: new Date().toISOString(), workspaceId: wsB.id, isHeroBanner: true },
    ];

    const bAttempts = studentAttempts.filter((a) => belongsToInstitute(a, wsB.id));
    const aAttempts = studentAttempts.filter((a) => belongsToInstitute(a, wsA.id));
    const bNotes = studentNotes.filter((n) => belongsToInstitute(n, wsB.id));
    const bProgress = studentProgress.filter((p) => belongsToInstitute(p, wsB.id));
    const bAnns = globalAnnouncements.filter((a) => belongsToInstitute(a, wsB.id));

    const multiStudentIsolated =
      bAttempts.length === 1 &&
      bAttempts[0].id === 'att_b' &&
      aAttempts.length === 2 &&
      bNotes.length === 1 &&
      bNotes[0].id === 'note_b' &&
      bProgress.length === 1 &&
      bProgress[0].lectureId === 'lec_b' &&
      bAnns.length === 1 &&
      bAnns[0].id === 'ann_b_global';

    checks.push({
      name: 'WS-10: Same-Student Multi-Institute Workspace Data Isolation',
      category: 'security',
      passed: multiStudentIsolated,
      latencyMs: Date.now() - t9,
      details: `InstA attempts=${aAttempts.length}, InstB attempts=${bAttempts.length}, notes=${bNotes.length}, progress=${bProgress.length}, anns=${bAnns.length}`,
    });

    // WS-11: Cross-Institute Notification Derivation Isolation
    const t10 = Date.now();
    const nowIso = new Date().toISOString();
    const derivedForB = deriveRealBatchNotifications({
      batches: [
        { id: 'b_a1', title: 'Batch A', workspaceId: wsA.id } as any,
        { id: 'b_b1', title: 'Batch B', workspaceId: wsB.id } as any,
      ],
      lectures: [
        { id: 'lec_a1', batchId: 'b_a1', chapterId: 'c1', title: 'Lecture A', createdAt: nowIso } as any,
        { id: 'lec_b1', batchId: 'b_b1', chapterId: 'c2', title: 'Lecture B', createdAt: nowIso } as any,
      ],
      announcements: [
        { id: 'ann_a1', title: 'Notice A', date: nowIso, createdAt: Date.now(), workspaceId: wsA.id } as any,
        { id: 'ann_b1', title: 'Notice B', date: nowIso, createdAt: Date.now(), workspaceId: wsB.id } as any,
      ],
      enrolledBatchIds: ['b_a1', 'b_b1'],
      instituteId: wsB.id,
    });
    const notifIdsB = derivedForB.map((n) => n.id);
    const notifIsolated =
      !notifIdsB.some((id) => id.includes('lec_a1') || id.includes('ann_a1')) &&
      notifIdsB.some((id) => id.includes('lec_b1') || id.includes('ann_b1'));

    checks.push({
      name: 'WS-11: Cross-Institute Notification Derivation Isolation',
      category: 'security',
      passed: notifIsolated,
      latencyMs: Date.now() - t10,
      details: `InstB notifications=[${notifIdsB.join(',')}]`,
    });

    // WS-12: Institute-Scoped isMasterUser (Owner/Admin in own institute = Master, in different institute = Student)
    const t11 = Date.now();
    saveCachedMasterWorkspaces([wsA, wsB]);
    const ownerBInB = isMasterUser({ email: 'director@instituteb.com' }, wsB.id);
    const adminBInB = isMasterUser({ email: 'adminb@instituteb.com' }, wsB.id);
    const ownerBInA = isMasterUser({ email: 'director@instituteb.com' }, wsA.id);
    const sanjuInA = isMasterUser({ email: 'sanju3456k@gmail.com' }, wsA.id);
    const sanjuInB = isMasterUser({ email: 'sanju3456k@gmail.com' }, wsB.id);
    const studentInB = isMasterUser({ email: 'student_random@gmail.com' }, wsB.id);
    const scopedMasterOk =
      ownerBInB && adminBInB && !ownerBInA && sanjuInA && sanjuInB && !studentInB;

    checks.push({
      name: 'WS-12: Institute-Scoped Master Console & Admin Role',
      category: 'security',
      passed: scopedMasterOk,
      latencyMs: Date.now() - t11,
      details: `ownerBInB=${ownerBInB}, adminBInB=${adminBInB}, ownerBInA=${ownerBInA}, sanjuEverywhere=${sanjuInA && sanjuInB}, student=${studentInB}`,
    });

    setSelectedAppInstituteId(null);
  } finally {
    saveCachedMasterWorkspaces(snapshotBefore);
  }

  return { checks };
}
