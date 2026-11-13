import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Crown,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Users,
  Send,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  X,
  Target,
  FileCheck,
  Search,
  Filter,
  Check,
  BarChart3,
  Award,
  Zap,
  HelpCircle,
  Database,
  Download,
  Eye,
  Sun,
  Moon,
  ToggleLeft,
  ToggleRight,
  FileText,
  Activity,
  Info,
  Trash2,
  RotateCw,
  Package
} from 'lucide-react';
import type { MathTest, TestAttempt, RemedialFilterType, AssignedRemedialTest } from '../types';
import { 
  MASTER_ADMIN_EMAIL, 
  publishMasterTest, 
  unpublishMasterTest,
  toggleTestPublishStatus,
  filterMasterTests, 
  previewRemedialCohort, 
  dispatchAdaptiveRemedialTests, 
  getMasterDispatchLedger,
  fetchMasterDispatchLedgerFromCloud,
  toggleRemedialAssignmentStatus,
  deleteRemedialAssignment,
  deleteAllRemedialAssignments,
  unassignAllRemedialTests,
  isMasterTest,
  isTestPublished,
  getMasterPublishedTestIds,
  fetchPublishedMasterTestsFromCloud,
  getPerTestCohortAnalytics,
  fetchCohortAttemptsForTest,
  getAllLocalAttemptsAcrossAccounts,
  publishTestToBatchCatalog,
  type PerTestCohortAnalytics,
  type RemedialDeleteScope
} from '../lib/masterAccount';
import { loadFullTestOnDemand } from '../lib/storage';
import { APP_STYLES } from './ui/AppStyles';
import { BatchAdminStudio } from './lms/BatchAdminStudio';
import { useApp } from '../lms/LmsContext';

interface MasterConsoleViewProps {
  onBack: () => void;
  tests: MathTest[];
  attempts: TestAttempt[];
  currentUserEmail?: string | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onRefreshTests?: () => void;
}

export const MasterConsoleView: React.FC<MasterConsoleViewProps> = ({
  onBack,
  tests,
  attempts,
  currentUserEmail,
  currentUserId,
  currentUserName,
  isDarkMode,
  onToggleTheme,
  onStartTest,
  onRefreshTests,
}) => {
  const [activeTab, setActiveTab] = useState<'batches' | 'remedial' | 'analytics' | 'publishing'>('batches');

  // ==========================================
  // Universal Multi-Tenant Batch Context
  // ==========================================
  const {
    batches,
    getEnrollmentsForBatch,
    getTestsForBatch,
    addTestToBatchCatalog,
  } = useApp();

  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => batches[0]?.id || 'batch_testing_01');

  const currentBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0] || {
      id: 'batch_testing_01',
      title: 'Testing Batch',
      price: 999,
    };
  }, [batches, selectedBatchId]);

  const currentBatchEnrollments = useMemo(() => {
    return getEnrollmentsForBatch(selectedBatchId);
  }, [selectedBatchId, getEnrollmentsForBatch]);

  const currentBatchTests = useMemo(() => {
    return getTestsForBatch(selectedBatchId);
  }, [selectedBatchId, getTestsForBatch]);

  const batchEnrolledUids = useMemo(() => {
    return new Set(currentBatchEnrollments.map((e) => e.userId));
  }, [currentBatchEnrollments]);

  const batchEnrolledEmails = useMemo(() => {
    const set = new Set<string>();
    currentBatchEnrollments.forEach((e) => {
      if (e.studentEmail) set.add(e.studentEmail.toLowerCase());
    });
    return set;
  }, [currentBatchEnrollments]);

  // ==========================================
  // 1. Adaptive Remedial Engine State
  // ==========================================
  const [selectedSourceTestIds, setSelectedSourceTestIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<('wrong' | 'unattempted' | 'marked' | 'unmarked')[]>(['wrong', 'unattempted', 'marked']);
  const [customTitle, setCustomTitle] = useState<string>('Custom Practice Set');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(30);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const toggleCategory = (catId: 'wrong' | 'unattempted' | 'marked' | 'unmarked') => {
    setSelectedCategories((prev) => {
      if (prev.includes(catId)) {
        if (prev.length === 1) return prev; // Keep at least one category selected
        return prev.filter((c) => c !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(['wrong', 'unattempted', 'marked']);
  };

  const handleSelectWrongOnly = () => {
    setSelectedCategories(['wrong']);
  };

  const handleSelectMarkedOnly = () => {
    setSelectedCategories(['marked']);
  };

  const handleSelectUnattemptedOnly = () => {
    setSelectedCategories(['unattempted']);
  };

  const handleSelectUnmarkedOnly = () => {
    setSelectedCategories(['unmarked']);
  };

  const handleSelectAllFourCategories = () => {
    setSelectedCategories(['wrong', 'unattempted', 'marked', 'unmarked']);
  };

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Hydrated tests map for source tests (ensures full questions are loaded when test comes as lean pointer)
  const [hydratedTestsMap, setHydratedTestsMap] = useState<Record<string, MathTest>>({});

  // Background hydration for selected tests that have empty questions
  React.useEffect(() => {
    selectedSourceTestIds.forEach((id) => {
      const existing = tests.find((t) => t.id === id);
      const needsHydration = !existing?.questions || existing.questions.length === 0;
      if (needsHydration && !hydratedTestsMap[id]) {
        loadFullTestOnDemand(id, tests, currentUserId)
          .then((fullTest) => {
            if (fullTest && fullTest.questions && fullTest.questions.length > 0) {
              setHydratedTestsMap((prev) => ({ ...prev, [id]: fullTest }));
            }
          })
          .catch(() => {});
      }
    });
  }, [selectedSourceTestIds, tests, currentUserId, hydratedTestsMap]);

  const selectedSourceTests = useMemo(() => {
    return tests
      .filter((t) => selectedSourceTestIds.includes(t.id))
      .map((t) => {
        const hydrated = hydratedTestsMap[t.id];
        if (hydrated && Array.isArray(hydrated.questions) && hydrated.questions.length > 0) {
          return hydrated;
        }
        return t;
      });
  }, [tests, selectedSourceTestIds, hydratedTestsMap]);

  // Cache of cloud student attempts fetched from Firestore test_leaderboards
  const [cloudCohortAttemptsMap, setCloudCohortAttemptsMap] = useState<Record<string, TestAttempt[]>>({});
  const [isLoadingCohort, setIsLoadingCohort] = useState<boolean>(false);
  const fetchingTestIdsRef = useRef<Set<string>>(new Set());

  // Background fetch cohort student attempts for source tests with debounce and deduplication (Only on remedial tab)
  React.useEffect(() => {
    if (activeTab !== 'remedial') return;
    if (selectedSourceTests.length === 0) return;

    selectedSourceTests.forEach((t) => {
      if (t && t.id && !cloudCohortAttemptsMap[t.id] && !fetchingTestIdsRef.current.has(t.id)) {
        fetchingTestIdsRef.current.add(t.id);
        fetchCohortAttemptsForTest(t)
          .then((cloudList) => {
            setCloudCohortAttemptsMap((prev) => ({
              ...prev,
              [t.id]: cloudList || [],
            }));
          })
          .catch(() => {
            setCloudCohortAttemptsMap((prev) => ({
              ...prev,
              [t.id]: [],
            }));
          })
          .finally(() => {
            fetchingTestIdsRef.current.delete(t.id);
          });
      }
    });
  }, [selectedSourceTests, cloudCohortAttemptsMap, activeTab]);

  const combinedRemedialAttempts = useMemo(() => {
    const seenIds = new Set<string>();
    const combined: TestAttempt[] = [];

    // 1. Add all local student attempts across all accounts & guest profiles on this device
    try {
      const allLocal = getAllLocalAttemptsAcrossAccounts();
      allLocal.forEach((a) => {
        if (a && a.id && !seenIds.has(a.id)) {
          seenIds.add(a.id);
          combined.push(a);
        }
      });
    } catch {}

    // 2. Add fetched cohort student attempts (cloud + local leaderboards)
    selectedSourceTests.forEach((t) => {
      const cohortList = cloudCohortAttemptsMap[t.id] || [];
      cohortList.forEach((a) => {
        if (a && a.id && !seenIds.has(a.id)) {
          seenIds.add(a.id);
          combined.push(a);
        }
      });
    });

    // 3. Add passed-in master attempts
    attempts.forEach((a) => {
      if (a && a.id && !seenIds.has(a.id)) {
        seenIds.add(a.id);
        combined.push(a);
      }
    });

    // STRICT: Sort all attempts chronologically ascending so earliest (1st-ever) attempts are prioritized
    combined.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());

    // Filter attempts strictly by the enrolled students in the active batch
    if (batchEnrolledUids.size > 0 || batchEnrolledEmails.size > 0) {
      return combined.filter((a) => {
        return (
          (a.userId && batchEnrolledUids.has(a.userId)) ||
          (a.userEmail && batchEnrolledEmails.has(a.userEmail.toLowerCase())) ||
          a.userId === currentUserId
        );
      });
    }

    return combined;
  }, [selectedSourceTests, attempts, cloudCohortAttemptsMap, batchEnrolledUids, batchEnrolledEmails, currentUserId]);

  const cohortPreview = useMemo(() => {
    return previewRemedialCohort({
      sourceTests: selectedSourceTests,
      filterType: selectedCategories,
      allAttempts: combinedRemedialAttempts,
      currentStudentId: currentUserId || 'master-academic-admin',
      currentStudentName: currentUserName || 'Master Admin (Sanju)',
      currentUserEmail: currentUserEmail || MASTER_ADMIN_EMAIL,
    });
  }, [selectedSourceTests, selectedCategories, combinedRemedialAttempts, currentUserId, currentUserName, currentUserEmail]);

  const totalPointersInCohort = useMemo(() => {
    return cohortPreview.reduce((sum, s) => sum + s.matchingQuestionsCount, 0);
  }, [cohortPreview]);

  const [dispatchLedger, setDispatchLedger] = useState<AssignedRemedialTest[]>(() => {
    return getMasterDispatchLedger();
  });

  // Keep dispatch ledger reactively in sync across cloud and local events
  React.useEffect(() => {
    // Only pull from cloud if local ledger is completely empty (0 reads if already cached)
    const local = getMasterDispatchLedger();
    if (!local || local.length === 0) {
      fetchMasterDispatchLedgerFromCloud()
        .then((ledger) => {
          if (Array.isArray(ledger) && ledger.length > 0) {
            setDispatchLedger(ledger);
          }
        })
        .catch(() => {});
    }

    const handleLedgerUpdate = () => {
      setDispatchLedger(getMasterDispatchLedger());
    };
    window.addEventListener('remedial-tests-updated', handleLedgerUpdate);
    window.addEventListener('storage', handleLedgerUpdate);
    return () => {
      window.removeEventListener('remedial-tests-updated', handleLedgerUpdate);
      window.removeEventListener('storage', handleLedgerUpdate);
    };
  }, []);

  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const filteredDispatchLedger = useMemo(() => {
    return dispatchLedger.filter((d) => {
      if (ledgerFilter === 'assigned') return !d.isUnassigned;
      if (ledgerFilter === 'unassigned') return Boolean(d.isUnassigned);
      return true;
    });
  }, [dispatchLedger, ledgerFilter]);

  const assignedCount = useMemo(() => {
    return dispatchLedger.filter((d) => !d.isUnassigned).length;
  }, [dispatchLedger]);

  const unassignedCount = useMemo(() => {
    return dispatchLedger.filter((d) => d.isUnassigned).length;
  }, [dispatchLedger]);

  const handleToggleAssignRemedial = async (asg: AssignedRemedialTest) => {
    const res = await toggleRemedialAssignmentStatus(asg.id);
    setDispatchLedger(getMasterDispatchLedger());
    showNotification(
      res.isAssigned
        ? `"${asg.title}" is now Assigned to ${asg.studentName}.`
        : `"${asg.title}" is now Unassigned (revoked from student).`,
      'info'
    );
  };

  const handleUnassignAllRemedial = async () => {
    if (!window.confirm('Are you sure you want to unassign all dispatched practice sets from students?')) {
      return;
    }
    await unassignAllRemedialTests();
    setDispatchLedger(getMasterDispatchLedger());
    showNotification('All practice sets have been unassigned from students.', 'info');
  };

  // Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    isBulk: boolean;
    target?: AssignedRemedialTest | null;
  } | null>(null);

  const openDeleteModalForTest = (asg: AssignedRemedialTest) => {
    setDeleteModal({
      isOpen: true,
      isBulk: false,
      target: asg,
    });
  };

  const openDeleteModalForBulk = () => {
    setDeleteModal({
      isOpen: true,
      isBulk: true,
      target: null,
    });
  };

  const handleExecuteDelete = async (scope: RemedialDeleteScope) => {
    if (!deleteModal) return;
    const { isBulk, target } = deleteModal;
    setDeleteModal(null);

    if (isBulk) {
      const res = await deleteAllRemedialAssignments(scope);
      setDispatchLedger(getMasterDispatchLedger());
      showNotification(
        scope === 'both'
          ? `Deleted all ${res.count} practice tests from both student accounts and Master Console.`
          : `Removed all ${res.count} practice tests from Master Console ledger (students keep access).`,
        'info'
      );
    } else if (target) {
      const res = await deleteRemedialAssignment(target.id, target.studentId, target.studentEmail, scope);
      if (res.success) {
        setDispatchLedger(getMasterDispatchLedger());
        showNotification(
          scope === 'both'
            ? `Deleted "${target.title}" from both user and master account.`
            : `Removed "${target.title}" from master account only (student keeps access).`,
          'info'
        );
      } else {
        alert('Failed to delete practice test. Please try again.');
      }
    }
  };

  const toggleSourceTest = (testId: string) => {
    setSelectedSourceTestIds((prev) => {
      if (prev.includes(testId)) {
        return prev.filter((id) => id !== testId);
      } else {
        return [...prev, testId];
      }
    });
  };

  const handleSelectFirstThree = () => {
    setSelectedSourceTestIds(tests.slice(0, 3).map((t) => t.id));
  };

  const handleSelectAll = () => {
    setSelectedSourceTestIds(tests.map((t) => t.id));
  };

  const handleClearSelection = () => {
    setSelectedSourceTestIds([]);
  };

  const handleDispatchRemedial = async () => {
    if (selectedSourceTests.length === 0) {
      alert('Please select at least 1 source test.');
      return;
    }

    setIsDispatching(true);
    try {
      const categoryLabel = selectedCategories.map((c) => c.toUpperCase()).join(' + ');
      const result = await dispatchAdaptiveRemedialTests({
        sourceTests: selectedSourceTests,
        filterType: selectedCategories,
        customTitle: customTitle.trim() || `Custom Practice Set (${categoryLabel})`,
        timeLimitMinutes: Number(timeLimitMinutes) || 30,
        allAttempts: combinedRemedialAttempts,
        currentStudentId: currentUserId || 'master-academic-admin',
        currentStudentName: currentUserName || 'Master Admin (Sanju)',
      });

      if (result.success) {
        setDispatchLedger(getMasterDispatchLedger());
        showNotification(
          `Dispatched personalized practice to ${result.dispatchedCount} student(s) with ${result.totalPointers} questions.`
        );
      }
    } catch (err: any) {
      console.error('Dispatch error:', err);
      alert('Failed to dispatch tests: ' + (err?.message || err));
    } finally {
      setIsDispatching(false);
    }
  };

  // ==========================================
  // 2. Per-Test Cohort Performance State
  // ==========================================
  const [selectedAnalyticsTestId, setSelectedAnalyticsTestId] = useState<string>(() => {
    return tests[0]?.id || '';
  });
  const [analyticsSearchQuery, setAnalyticsSearchQuery] = useState<string>('');
  const [analyticsModeFilter, setAnalyticsModeFilter] = useState<'all' | 'online' | 'omr'>('all');
  const [analyticsTestSearchFilter, setAnalyticsTestSearchFilter] = useState<string>('');
  const [showAllTestsList, setShowAllTestsList] = useState<boolean>(false);
  const [heatmapDisplayMode, setHeatmapDisplayMode] = useState<'firstRow' | 'full'>('firstRow');

  const filteredAnalyticsTests = useMemo(() => {
    if (!analyticsTestSearchFilter.trim()) return tests;
    const q = analyticsTestSearchFilter.toLowerCase().trim();
    return tests.filter((t) => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.id && t.id.toLowerCase().includes(q))
    );
  }, [tests, analyticsTestSearchFilter]);

  const currentAnalyticsTestIndex = useMemo(() => {
    return tests.findIndex((t) => t.id === selectedAnalyticsTestId);
  }, [tests, selectedAnalyticsTestId]);

  const handleSelectPrevAnalyticsTest = () => {
    if (currentAnalyticsTestIndex > 0) {
      setSelectedAnalyticsTestId(tests[currentAnalyticsTestIndex - 1].id);
    }
  };

  const handleSelectNextAnalyticsTest = () => {
    if (currentAnalyticsTestIndex < tests.length - 1 && currentAnalyticsTestIndex >= 0) {
      setSelectedAnalyticsTestId(tests[currentAnalyticsTestIndex + 1].id);
    }
  };

  const selectedAnalyticsTest = useMemo(() => {
    return tests.find((t) => t.id === selectedAnalyticsTestId) || tests[0] || null;
  }, [tests, selectedAnalyticsTestId]);

  // Fetch cloud cohort student attempts for the selected analytics test (Only when viewing Analytics tab)
  React.useEffect(() => {
    if (!selectedAnalyticsTest || !selectedAnalyticsTest.id) return;
    if (activeTab !== 'analytics') return;
    const testId = selectedAnalyticsTest.id;
    if (cloudCohortAttemptsMap[testId]) return;

    setIsLoadingCohort(true);
    fetchCohortAttemptsForTest(selectedAnalyticsTest)
      .then((cloudList) => {
        setCloudCohortAttemptsMap((prev) => ({
          ...prev,
          [testId]: cloudList,
        }));
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingCohort(false);
      });
  }, [selectedAnalyticsTest, cloudCohortAttemptsMap, activeTab]);

  const [isRefreshingCohort, setIsRefreshingCohort] = useState<boolean>(false);

  const handleRefreshAnalyticsCohort = async () => {
    if (!selectedAnalyticsTest || !selectedAnalyticsTest.id) return;
    const testId = selectedAnalyticsTest.id;
    setIsRefreshingCohort(true);
    try {
      const cloudList = await fetchCohortAttemptsForTest(selectedAnalyticsTest, true);
      setCloudCohortAttemptsMap((prev) => ({
        ...prev,
        [testId]: cloudList,
      }));
      showNotification(`Refreshed student attempts for "${selectedAnalyticsTest.title}".`, 'info');
    } catch {
      alert('Could not refresh attempts. Please try again.');
    } finally {
      setIsRefreshingCohort(false);
    }
  };

  const combinedAnalyticsAttempts = useMemo(() => {
    if (!selectedAnalyticsTest) return attempts;
    const cloudList = cloudCohortAttemptsMap[selectedAnalyticsTest.id] || [];
    const seenIds = new Set<string>();
    const combined: TestAttempt[] = [];

    cloudList.forEach((a) => {
      if (a && a.id && !seenIds.has(a.id)) {
        seenIds.add(a.id);
        combined.push(a);
      }
    });

    attempts.forEach((a) => {
      if (a && a.id && !seenIds.has(a.id)) {
        seenIds.add(a.id);
        combined.push(a);
      }
    });

    // Filter attempts strictly by the enrolled students in the active batch
    if (batchEnrolledUids.size > 0 || batchEnrolledEmails.size > 0) {
      return combined.filter((a) => {
        return (
          (a.userId && batchEnrolledUids.has(a.userId)) ||
          (a.userEmail && batchEnrolledEmails.has(a.userEmail.toLowerCase())) ||
          a.userId === currentUserId
        );
      });
    }

    return combined;
  }, [selectedAnalyticsTest, attempts, cloudCohortAttemptsMap, batchEnrolledUids, batchEnrolledEmails, currentUserId]);

  const testCohortAnalytics: PerTestCohortAnalytics | null = useMemo(() => {
    if (!selectedAnalyticsTest) return null;
    return getPerTestCohortAnalytics(selectedAnalyticsTest, combinedAnalyticsAttempts);
  }, [selectedAnalyticsTest, combinedAnalyticsAttempts]);

  const filteredStudentRows = useMemo(() => {
    if (!testCohortAnalytics) return [];
    return testCohortAnalytics.studentRows.filter((row) => {
      const matchesSearch = row.studentName.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
        (row.studentEmail && row.studentEmail.toLowerCase().includes(analyticsSearchQuery.toLowerCase()));
      const matchesMode = analyticsModeFilter === 'all' || row.attemptMode === analyticsModeFilter;
      return matchesSearch && matchesMode;
    });
  }, [testCohortAnalytics, analyticsSearchQuery, analyticsModeFilter]);

  const handleExportCsv = () => {
    if (!testCohortAnalytics || testCohortAnalytics.studentRows.length === 0) {
      alert('No attempt records to export for this test.');
      return;
    }

    const headers = ['Student Name', 'Student Email', 'Attempt Mode', 'Score', 'Total Points', 'Percentage', 'Time Spent (s)', 'Wrong Questions', 'Completed Date'];
    const rows = testCohortAnalytics.studentRows.map((r) => [
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${(r.studentEmail || '').replace(/"/g, '""')}"`,
      r.attemptMode.toUpperCase(),
      r.score,
      r.totalPoints,
      `${r.percentage}%`,
      r.timeSpentSeconds,
      `"${r.wrongQuestionNumbers.join(', ')}"`,
      `"${new Date(r.completedAt).toLocaleString()}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${testCohortAnalytics.testTitle.replace(/\s+/g, '_')}_cohort_performance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // 3. Publishing & Test Bank State
  // ==========================================
  const [publishingSearch, setPublishingSearch] = useState<string>('');
  const [publishedTestIds, setPublishedTestIds] = useState<string[]>(() => {
    return getMasterPublishedTestIds();
  });

  // Sync published tests state reactively (0 reads on mount, kept synced by App.tsx real-time listener)
  React.useEffect(() => {
    const handleUpdate = () => {
      setPublishedTestIds(getMasterPublishedTestIds());
    };
    window.addEventListener('tests-published-updated', handleUpdate);

    return () => {
      window.removeEventListener('tests-published-updated', handleUpdate);
    };
  }, []);

  const handleTogglePublish = async (test: MathTest) => {
    const isAlreadyInBatch = currentBatchTests.some((t) => t.testId === test.id);
    if (!isAlreadyInBatch) {
      addTestToBatchCatalog({
        batchId: selectedBatchId,
        title: test.title,
        topic: test.topic || 'General Mathematics',
        difficulty: (test.difficulty as any) || 'medium',
        timeLimitMinutes: test.timeLimitMinutes || 60,
        questionCount: test.questions?.length || 30,
        passingScorePercentage: test.passingScorePercentage || 40,
      });
      await publishTestToBatchCatalog(selectedBatchId, test).catch(() => {});
    }

    const res = await toggleTestPublishStatus(test);
    setPublishedTestIds(getMasterPublishedTestIds());
    onRefreshTests?.();
    showNotification(
      res.isPublished 
        ? `"${test.title}" is now published to "${currentBatch.title}" (750 KB Bin-Packed).` 
        : `"${test.title}" is now unpublished from "${currentBatch.title}".`,
      'info'
    );
  };

  return (
    <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30 select-none">
      
      {/* Top App Bar (Google Material 3 Seamless Header - Color-matched to mobile status bar with 0 border line) */}
      <header className="px-4 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+0.45rem)] pb-2 bg-[#e5e9f0] dark:bg-[#0b0c10] shrink-0 flex items-center justify-between gap-3 z-10 border-0 shadow-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] text-amber-500 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0">
            <Crown className="w-4.5 h-4.5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                Master Console
              </h1>
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] shrink-0" title="Active Master Control" />
            </div>
            <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono truncate">
              Academic Control Center • {MASTER_ADMIN_EMAIL}
            </p>
          </div>
        </div>

        {/* Right Header Controls: Theme toggle and Close Button */}
        <div className="flex items-center gap-2 shrink-0">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title="Toggle Dark/Light Mode"
              className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center transition-all cursor-pointer active:scale-95 outline-none select-none"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#0b57d0]" />}
            </button>
          )}

          {/* Close Button */}
          <button
            onClick={onBack}
            title="Close Console"
            aria-label="Close Console"
            className="h-9 px-3.5 sm:px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all active:scale-95 outline-none select-none"
          >
            <X className="w-4 h-4 text-[#5e5e5e] dark:text-[#9aa0a6]" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </header>

      {/* Universal Sticky Batch Context Selector Bar */}
      <div className="px-4 sm:px-6 md:px-8 py-2.5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-purple-950/40 border-b border-slate-200/50 dark:border-zinc-800/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-xl bg-[#0b57d0] text-white shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider block">
              Active Batch Context
            </span>
            <div className="flex items-center space-x-1.5">
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="text-xs font-extrabold bg-transparent text-[#1f1f1f] dark:text-[#e3e3e3] border-none outline-none cursor-pointer pr-3"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {b.title} (₹{b.price})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-semibold text-[#5e5e5e] dark:text-[#9aa0a6]">
          <span className="px-3 py-1 rounded-full bg-white dark:bg-[#1e2024] shadow-xs flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            <span>{currentBatchEnrollments.length} Enrolled Students</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-white dark:bg-[#1e2024] shadow-xs flex items-center space-x-1">
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>{currentBatchTests.length} Batch Mock Tests</span>
          </span>
        </div>
      </div>

      {/* Tab Navigation Pill Bar (Seamless M3 Segmented Tabs - No partition line, border-0) */}
      <div className="px-4 sm:px-6 md:px-8 pb-3 pt-0 bg-[#e5e9f0] dark:bg-[#0b0c10] flex items-center justify-between gap-3 overflow-x-auto shrink-0 border-0 shadow-none no-scrollbar">
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#1e2024] rounded-full border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 border-0 outline-none ${
              activeTab === 'batches'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batches & Authoring</span>
          </button>

          <button
            onClick={() => setActiveTab('remedial')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 border-0 outline-none ${
              activeTab === 'remedial'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Adaptive Remedial Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 border-0 outline-none ${
              activeTab === 'analytics'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Per-Test Performance Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('publishing')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 border-0 outline-none ${
              activeTab === 'publishing'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Publish Tests to Students ({publishedTestIds.length}/{tests.length})</span>
          </button>
        </div>

        <div className="shrink-0 hidden lg:flex items-center gap-2 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono bg-white dark:bg-[#1e2024] px-4 py-2 rounded-full border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
          <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span>Single-Instance Storage: Tests (~40 KB) • Attempts (~1 KB) • Pointers (&lt;0.5 KB)</span>
        </div>
      </div>

      {/* Global In-App Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="mx-4 sm:mx-6 md:mx-8 mb-2 p-3 bg-white dark:bg-[#16181f] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-xs font-bold rounded-2xl flex items-center gap-2.5 shadow-md shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main View Body */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pb-[calc(max(1.5rem,env(safe-area-inset-bottom,0px))+0.5rem)] pt-1 space-y-6">

        {/* ============================================================ */}
        {/* TAB 0: BATCH AUTHORING & LMS MANAGEMENT                      */}
        {/* ============================================================ */}
        {activeTab === 'batches' && (
          <div className="max-w-7xl mx-auto w-full">
            <BatchAdminStudio />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: ADAPTIVE REMEDIAL ENGINE                              */}
        {/* ============================================================ */}
        {activeTab === 'remedial' && (
          <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
            
            {/* Batch Context Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border border-blue-500/20 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa]">Target Batch:</span>
                <span className="font-extrabold">{currentBatch.title}</span>
                <span className="text-[11px] opacity-75">• {currentBatchEnrollments.length} enrolled students</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full">
                Batch Error Isolation Active
              </span>
            </div>

            {/* Top Responsive Grid: Configuration (Left: Tests & Categories | Right: Dispatch Settings) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 items-start">
              
              {/* Left Column (8 cols on desktop): Step 1 & Step 2 */}
              <div className="xl:col-span-8 space-y-4 sm:space-y-5">
                
                {/* Step 1: Source Tests Selection */}
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-[#0b57d0] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                        1
                      </span>
                      <div>
                        <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                          Select Source Mock Tests
                        </h2>
                        <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                          Pick source tests to scan for student mistakes, skipped questions, or doubt flags.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectFirstThree}
                        className={`h-8 px-3.5 rounded-full text-xs font-semibold border-0 cursor-pointer active:scale-95 transition-all outline-none ${
                          selectedSourceTestIds.length === 3 && tests.slice(0, 3).every((t) => selectedSourceTestIds.includes(t.id))
                            ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                            : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3]'
                        }`}
                      >
                        Select First 3
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className={`h-8 px-3.5 rounded-full text-xs font-semibold border-0 cursor-pointer active:scale-95 transition-all outline-none ${
                          selectedSourceTestIds.length === tests.length && tests.length > 0
                            ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                            : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3]'
                        }`}
                      >
                        All ({tests.length})
                      </button>
                      {selectedSourceTestIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="h-8 px-3.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-0 cursor-pointer active:scale-95 transition-all outline-none"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Source Tests Multi-Select Grid: 2 columns on tablet (md:grid-cols-2) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-2.5 sm:gap-3 pt-1 max-h-[460px] overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {tests.map((test) => {
                      const isSelected = selectedSourceTestIds.includes(test.id);
                      const hydrated = hydratedTestsMap[test.id];
                      const qCount = hydrated?.questions?.length || test.questions?.length || (test as any).questionCount || 50;

                      return (
                        <div
                          key={test.id}
                          onClick={() => toggleSourceTest(test.id)}
                          className={`p-3.5 rounded-[20px] transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.99] border-0 ${
                            isSelected
                              ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-[0_2px_6px_rgba(11,87,208,0.25)] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                              : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3] ring-1 ring-inset ring-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">
                              {test.title}
                            </p>
                            <p className={`text-[11px] font-mono mt-0.5 ${isSelected ? 'text-[#041e49]/70 dark:text-[#c2e7ff]/70' : 'text-[#5e5e5e] dark:text-[#9aa0a6]'}`}>
                              {qCount} Qs • {test.timeLimitMinutes || 60}m
                            </p>
                          </div>

                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-0 transition-all ${
                            isSelected
                              ? 'bg-[#0b57d0] text-white shadow-xs'
                              : 'bg-white dark:bg-[#25282f] text-transparent'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Target Weakness Categories */}
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-[#0b57d0] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                        2
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                          Target Weakness Categories
                        </h3>
                        <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                          Extracted from each student's 1st-ever attempts with zero duplicate questions.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        const isAllErrorsAndMarked = selectedCategories.length === 3 && ['wrong', 'unattempted', 'marked'].every((c) => selectedCategories.includes(c as any));
                        const isWrongOnly = selectedCategories.length === 1 && selectedCategories.includes('wrong');
                        const isSkippedOnly = selectedCategories.length === 1 && selectedCategories.includes('unattempted');
                        const isMarkedOnly = selectedCategories.length === 1 && selectedCategories.includes('marked');
                        const isUnmarkedOnly = selectedCategories.length === 1 && selectedCategories.includes('unmarked');
                        const isAllFour = selectedCategories.length === 4;

                        return (
                          <>
                            <button
                              type="button"
                              onClick={handleSelectAllCategories}
                              className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isAllErrorsAndMarked
                                  ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                                  : 'text-[#0b57d0] dark:text-[#a8c7fa] bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 hover:bg-[#d3e3fd]'
                              }`}
                            >
                              All (Errors + Marked)
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectWrongOnly}
                              className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isWrongOnly
                                  ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                                  : 'text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                              }`}
                            >
                              Wrong
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectUnattemptedOnly}
                              className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isSkippedOnly
                                  ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                                  : 'text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                              }`}
                            >
                              Skipped
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectMarkedOnly}
                              className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isMarkedOnly
                                  ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                                  : 'text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                              }`}
                            >
                              Marked
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectUnmarkedOnly}
                              className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isUnmarkedOnly
                                  ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                                  : 'text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                              }`}
                            >
                              Unmarked
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectAllFourCategories}
                              className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                                isAllFour
                                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200 ring-2 ring-inset ring-emerald-600 dark:ring-emerald-400'
                                  : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100'
                              }`}
                            >
                              All 4
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Categories Grid: 2 columns on tablet (md:grid-cols-2) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {[
                      {
                        id: 'wrong' as const,
                        title: 'Incorrect',
                        desc: 'Strictly questions attempted and answered incorrectly.',
                        badge: 'Attempted & Wrong',
                      },
                      {
                        id: 'unattempted' as const,
                        title: 'Unattempted',
                        desc: 'Strictly questions skipped across source tests.',
                        badge: 'Skipped / Left Blank',
                      },
                      {
                        id: 'marked' as const,
                        title: 'Marked',
                        desc: 'Questions flagged for review by the student.',
                        badge: 'Flagged for Review',
                      },
                      {
                        id: 'unmarked' as const,
                        title: 'Unmarked',
                        desc: 'Questions not flagged for review by the student.',
                        badge: 'Not Flagged',
                      },
                    ].map((cat) => {
                      const isSelected = selectedCategories.includes(cat.id);
                      return (
                        <div
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={`p-3.5 rounded-[20px] transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.99] border-0 ${
                            isSelected
                              ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-[0_2px_6px_rgba(11,87,208,0.25)] ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                              : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3] ring-1 ring-inset ring-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-0 transition-all ${
                              isSelected 
                                ? 'bg-[#0b57d0] text-white shadow-xs' 
                                : 'bg-white dark:bg-[#25282f] text-transparent'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold">{cat.title}</p>
                                <span className={`text-[10px] px-2 py-0.2 rounded-full font-normal border-0 ${
                                  isSelected 
                                    ? 'bg-[#0b57d0]/15 dark:bg-[#a8c7fa]/20 text-[#041e49] dark:text-[#c2e7ff]' 
                                    : 'bg-white/80 dark:bg-[#25282f] text-[#5e5e5e] dark:text-[#9aa0a6]'
                                }`}>
                                  {cat.badge}
                                </span>
                              </div>
                              <p className={`text-[11px] mt-0.5 line-clamp-1 ${
                                isSelected 
                                  ? 'text-[#041e49]/80 dark:text-[#c2e7ff]/80' 
                                  : 'text-[#5e5e5e] dark:text-[#9aa0a6]'
                              }`}>
                                {cat.desc}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#0b57d0] text-white shrink-0 shadow-xs border-0">
                              ACTIVE
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-[20px] bg-[#d3e3fd]/40 dark:bg-[#004a77]/30 border-0 text-[11.5px] text-[#041e49] dark:text-[#c2e7ff] flex items-center gap-2.5">
                    <Info className="w-4 h-4 shrink-0 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>
                      Active filter: <strong>{selectedCategories.map((c) => c.toUpperCase()).join(' + ')}</strong> ({totalPointersInCohort} questions across cohort)
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Column (4 cols on desktop): Sticky Step 3 Practice Settings & Live Dispatch */}
              <div className="xl:col-span-4 xl:sticky xl:top-4 space-y-4 sm:space-y-5">
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-[#0b57d0] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      3
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        Assigned Practice Settings
                      </h3>
                      <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                        Configure title, timer, and launch instant dispatch.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <label className="text-xs font-bold text-[#444746] dark:text-[#c4c7c5] block mb-1.5">
                        Practice Title for Students
                      </label>
                      <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="e.g. Targeted Practice Set"
                        className="w-full px-4 py-2.5 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-medium"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-[#444746] dark:text-[#c4c7c5]">
                          Time Limit
                        </label>
                        <span className="text-[11px] font-mono text-[#5e5e5e] dark:text-[#9aa0a6]">
                          {timeLimitMinutes} minutes
                        </span>
                      </div>

                      {/* Quick Duration Pills */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {[15, 30, 45, 60, 90].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setTimeLimitMinutes(mins)}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer border-0 outline-none ${
                              timeLimitMinutes === mins
                                ? 'bg-[#0b57d0] text-white shadow-xs ring-2 ring-offset-1 ring-[#0b57d0] dark:ring-offset-[#1e2024] dark:ring-[#a8c7fa]'
                                : 'bg-[#f0f4f9] dark:bg-[#141619] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                            }`}
                          >
                            {mins}m
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                          className="w-28 px-3.5 py-1.5 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-mono font-bold"
                        />
                        <span className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                          min (~2 min/Q suggested)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cohort Summary Box */}
                  <div className="p-3.5 rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">Source Tests:</span>
                      <span className="font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        {selectedSourceTests.length} selected
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">Cohort Impact:</span>
                      <span className="font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                        {cohortPreview.length} student(s) • {totalPointersInCohort} Qs
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">Storage Footprint:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        &lt;0.5 KB / student
                      </span>
                    </div>
                  </div>

                  {/* Dispatch Action */}
                  <button
                    onClick={handleDispatchRemedial}
                    disabled={isDispatching || selectedSourceTests.length === 0 || cohortPreview.length === 0}
                    className="w-full h-11 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs sm:text-sm tracking-wide border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {isDispatching
                        ? 'Dispatching Practice Sets...'
                        : cohortPreview.length === 0
                        ? 'No Student Attempts in Cohort'
                        : `Dispatch to ${cohortPreview.length} Student(s)`}
                    </span>
                  </button>
                </div>
              </div>

            </div>

            {/* Step 4: Live Cohort Breakdown */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-7 h-7 rounded-full bg-[#0b57d0] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                    4
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      Cohort Error Extraction Preview
                    </h3>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                      1st-ever attempt diagnostics per student for target weakness questions.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-0">
                    1st Attempt Diagnostics
                  </span>
                  <span className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-mono">
                    {cohortPreview.length} Student Record(s)
                  </span>
                </div>
              </div>

              {cohortPreview.length === 0 ? (
                <div className="p-8 text-center rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0 space-y-2">
                  <p className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    No student attempts found for the selected test(s) yet.
                  </p>
                  <p className="text-[11.5px] text-[#5e5e5e] dark:text-[#9aa0a6] max-w-md mx-auto">
                    When students attempt any of the selected source tests, their names, IDs, and targeted weakness questions from their 1st-ever attempts will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[20px] bg-[#f0f4f9]/50 dark:bg-[#141619]/50 border-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f0f4f9] dark:bg-[#141619] text-[#444746] dark:text-[#c4c7c5] font-bold uppercase text-[10px] tracking-wider border-0">
                        <th className="py-3 px-3.5">Student Name</th>
                        <th className="py-3 px-3.5">Student ID / Email</th>
                        <th className="py-3 px-3.5">1st Attempt Evaluated</th>
                        <th className="py-3 px-3.5">Targeted Questions (1st Attempt)</th>
                        <th className="py-3 px-3.5 text-right">Data Overhead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eef6] dark:divide-[#202329] font-medium">
                      {cohortPreview.map((s, idx) => (
                        <tr key={s.studentId + idx} className="hover:bg-white/60 dark:hover:bg-[#1e2024]/60 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            {s.studentName}
                            {s.studentId === currentUserId && (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] border-0">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] truncate max-w-[160px]">
                            {s.studentEmail || s.studentId}
                          </td>
                          <td className="py-3 px-3.5 text-[#5e5e5e] dark:text-[#c4c7c5]">
                            {s.attemptCount} attempt(s)
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] border-0">
                                {s.matchingQuestionsCount} Qs
                              </span>
                              {s.matchingQuestionsCount === 0 && (
                                <span className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] font-normal">
                                  (No questions matching filter)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                            ~{(s.matchingQuestionsCount * 0.03).toFixed(2)} KB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Step 5: Dispatched Practice Ledger */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              {/* Header with Assigned/Unassigned Options */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
                      <span>Dispatched Practice Ledger</span>
                      <span className="text-xs font-mono font-semibold text-[#5e5e5e] dark:text-[#9aa0a6]">
                        ({filteredDispatchLedger.length}/{dispatchLedger.length})
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                      Manage dispatched custom practice sets, toggle assignment, or revoke access.
                    </p>
                  </div>
                </div>

                {/* Assigned / Unassigned Filter Options & Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center p-1 rounded-full bg-[#f0f4f9] dark:bg-[#141619] text-[11px] font-bold border-0">
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('all')}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer border-0 outline-none ${
                        ledgerFilter === 'all'
                          ? 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-xs'
                          : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3]'
                      }`}
                    >
                      All ({dispatchLedger.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('assigned')}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer border-0 outline-none ${
                        ledgerFilter === 'assigned'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3]'
                      }`}
                    >
                      Assigned ({assignedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('unassigned')}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer border-0 outline-none ${
                        ledgerFilter === 'unassigned'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3]'
                      }`}
                    >
                      Unassigned ({unassignedCount})
                    </button>
                  </div>

                  {assignedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleUnassignAllRemedial}
                      className="h-8 px-3.5 rounded-full text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 transition-colors cursor-pointer active:scale-95 border-0 outline-none"
                      title="Unassign all currently assigned tests from students"
                    >
                      Unassign All
                    </button>
                  )}

                  {dispatchLedger.length > 0 && (
                    <button
                      type="button"
                      onClick={openDeleteModalForBulk}
                      className="h-8 px-3.5 rounded-full text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95 border-0 outline-none"
                      title="Delete all practice tests in ledger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {dispatchLedger.length === 0 ? (
                  <div className="p-8 text-center rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0 space-y-1.5">
                    <p className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      No custom practice sets dispatched yet.
                    </p>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                      When you dispatch a remedial practice set, it will appear here in real time.
                    </p>
                  </div>
                ) : filteredDispatchLedger.length === 0 ? (
                  <div className="p-8 text-center rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0">
                    <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
                      No practice tests found matching "{ledgerFilter}".
                    </p>
                  </div>
                ) : (
                  filteredDispatchLedger.map((d) => (
                    <div
                      key={d.id}
                      className={`p-3.5 sm:p-4 rounded-[20px] border-0 transition-all flex items-center justify-between flex-wrap gap-3 text-xs ${
                        d.isUnassigned
                          ? 'bg-[#f0f4f9]/60 dark:bg-[#141619]/40 opacity-75'
                          : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#202329]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{d.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white dark:bg-[#1e2024] text-[#5e5e5e] dark:text-[#9aa0a6] border-0">
                            {d.filterType}
                          </span>
                          {d.isUnassigned && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
                              Revoked
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                          Student: <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{d.studentName}</span> ({d.studentId}) • {d.totalQuestions} Questions • {new Date(d.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {d.isCompleted && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] flex items-center gap-1 border-0">
                            <CheckCircle2 className="w-3 h-3" />
                            Done ({d.completedPercentage || 0}%)
                          </span>
                        )}

                        {/* Interactive Assigned to Unassigned button */}
                        <button
                          type="button"
                          onClick={() => handleToggleAssignRemedial(d)}
                          className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 group border-0 outline-none ${
                            !d.isUnassigned
                              ? 'bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-700 dark:bg-emerald-950/40 dark:hover:bg-rose-950/40 dark:text-emerald-300 dark:hover:text-rose-300'
                              : 'bg-amber-50 hover:bg-emerald-50 text-amber-700 hover:text-emerald-700 dark:bg-amber-950/40 dark:hover:bg-emerald-950/40 dark:text-amber-300 dark:hover:text-emerald-300'
                          }`}
                          title={!d.isUnassigned ? 'Click to unassign (revoke) test from student' : 'Click to assign test back to student'}
                        >
                          {!d.isUnassigned ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:bg-rose-500 transition-colors" />
                              <span className="group-hover:hidden">Assigned</span>
                              <span className="hidden group-hover:inline text-[11px] font-bold text-rose-600 dark:text-rose-400">Click to Unassign</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-amber-500 group-hover:bg-emerald-500 transition-colors" />
                              <span className="group-hover:hidden">Unassigned</span>
                              <span className="hidden group-hover:inline text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Click to Assign</span>
                            </>
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => openDeleteModalForTest(d)}
                          className="h-8 px-3 rounded-full text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 bg-rose-50 dark:bg-rose-950/40 transition-all flex items-center gap-1 cursor-pointer active:scale-95 border-0 outline-none"
                          title="Delete this practice test"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: PER-TEST PERFORMANCE ANALYTICS                        */}
        {/* ============================================================ */}
        {activeTab === 'analytics' && (
          <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
            
            {/* Batch Context Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border border-blue-500/20 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa]">Batch Scope:</span>
                <span className="font-extrabold">{currentBatch.title}</span>
                <span className="text-[11px] opacity-75">• Student Roster: {currentBatchEnrollments.length}</span>
              </div>
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 px-2.5 py-0.5 rounded-full">
                {combinedAnalyticsAttempts.length} Batch Attempts Filtered
              </span>
            </div>

            {/* Top: Test Selector Dropdown */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 flex items-center justify-center text-[#0b57d0] dark:text-[#a8c7fa]">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      Select Test for Cohort Performance Mapping
                    </h2>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                      View every student who attempted this test and examine question error distributions.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleRefreshAnalyticsCohort}
                    disabled={isRefreshingCohort || isLoadingCohort}
                    className="h-8 px-3.5 rounded-full text-xs font-semibold bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95 border-0 outline-none"
                    title="Fetch latest student attempt records for this test from cloud (Strictly 1 Read)"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isRefreshingCohort || isLoadingCohort ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingCohort || isLoadingCohort ? 'Refreshing...' : 'Refresh Attempts'}</span>
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="h-8 px-3.5 rounded-full text-xs font-semibold bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border-0 outline-none"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Enhanced Test Selector Controls (Dropdown + Search + Prev/Next + Grid Toggle) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Search Filter Input */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5e5e5e] dark:text-[#9aa0a6] pointer-events-none" />
                  <input
                    type="text"
                    value={analyticsTestSearchFilter}
                    onChange={(e) => setAnalyticsTestSearchFilter(e.target.value)}
                    placeholder="Search tests by title or number..."
                    className="w-full pl-9 pr-3.5 py-2 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#5e5e5e]/80 dark:placeholder:text-[#9aa0a6]/80 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-medium"
                  />
                  {analyticsTestSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setAnalyticsTestSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5e5e5e] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] text-xs border-0 outline-none cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Primary Test Selector Dropdown */}
                <div className="flex-[1.5] min-w-[240px]">
                  <select
                    value={selectedAnalyticsTestId}
                    onChange={(e) => setSelectedAnalyticsTestId(e.target.value)}
                    className="w-full px-4 py-2 text-xs font-semibold rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-[#0b57d0] cursor-pointer"
                  >
                    {filteredAnalyticsTests.map((t) => {
                      const qCount = t.questions?.length || (t as any).questionCount || 50;
                      return (
                        <option key={t.id} value={t.id}>
                          {t.title} ({qCount} Questions)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Prev / Next Stepper Controls */}
                <div className="flex items-center justify-between sm:justify-start gap-1 bg-[#f0f4f9] dark:bg-[#141619] p-1 rounded-full border-0 shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectPrevAnalyticsTest}
                    disabled={currentAnalyticsTestIndex <= 0}
                    className="p-1.5 rounded-full hover:bg-white dark:hover:bg-[#25282f] disabled:opacity-30 disabled:pointer-events-none text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors cursor-pointer border-0 outline-none"
                    title="Previous test"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono font-bold px-2 text-[#5e5e5e] dark:text-[#9aa0a6] select-none">
                    {currentAnalyticsTestIndex >= 0 ? currentAnalyticsTestIndex + 1 : 1}/{tests.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectNextAnalyticsTest}
                    disabled={currentAnalyticsTestIndex >= tests.length - 1}
                    className="p-1.5 rounded-full hover:bg-white dark:hover:bg-[#25282f] disabled:opacity-30 disabled:pointer-events-none text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors cursor-pointer border-0 outline-none"
                    title="Next test"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Toggle Full Cards Grid Button */}
                <button
                  type="button"
                  onClick={() => setShowAllTestsList((prev) => !prev)}
                  className={`h-8 px-3.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 border-0 outline-none ${
                    showAllTestsList
                      ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]'
                      : 'bg-[#f0f4f9] dark:bg-[#141619] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e9eef6] dark:hover:bg-[#22252a]'
                  }`}
                  title="Toggle card picker list"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{showAllTestsList ? 'Hide Grid' : `All Tests (${tests.length})`}</span>
                </button>
              </div>

              {/* Active Selected Test Summary Banner */}
              <div className="p-3.5 rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {currentAnalyticsTestIndex >= 0 ? currentAnalyticsTestIndex + 1 : 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                      {selectedAnalyticsTest?.title || 'Selected Test'}
                    </p>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono mt-0.5">
                      {selectedAnalyticsTest?.questions?.length || 50} Questions • {selectedAnalyticsTest?.timeLimitMinutes || 60}m time limit
                    </p>
                  </div>
                </div>

                {testCohortAnalytics && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-[11px] border-0 shadow-xs">
                      {testCohortAnalytics.totalAttempts} Attempts
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] border-0">
                      {testCohortAnalytics.averagePercentage}% Avg
                    </span>
                  </div>
                )}
              </div>

              {/* Full Test Cards Grid: 2 columns on tablet (md:grid-cols-2) */}
              {showAllTestsList && (
                <div className="pt-2 border-t border-[#f0f4f9] dark:border-[#25282f]">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      Choose from all {filteredAnalyticsTests.length} tests:
                    </span>
                    {analyticsTestSearchFilter && (
                      <span className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                        Filtering by: &quot;{analyticsTestSearchFilter}&quot;
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {filteredAnalyticsTests.map((t) => {
                      const isSelected = t.id === selectedAnalyticsTestId;
                      const qCount = t.questions?.length || (t as any).questionCount || 50;

                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedAnalyticsTestId(t.id);
                          }}
                          className={`p-3 rounded-[18px] border-0 transition-all cursor-pointer flex items-center justify-between gap-2 select-none active:scale-[0.99] ${
                            isSelected
                              ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-xs ring-2 ring-inset ring-[#0b57d0] dark:ring-[#a8c7fa]'
                              : 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-[#1f1f1f] dark:text-[#e3e3e3] ring-1 ring-inset ring-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate">
                              {t.title}
                            </p>
                            <p className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-[#041e49]/70 dark:text-[#c2e7ff]/70' : 'text-[#5e5e5e] dark:text-[#9aa0a6]'}`}>
                              {qCount} Questions • {t.timeLimitMinutes || 60}m
                            </p>
                          </div>

                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shrink-0 border-0">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0 font-bold">
                              Select
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Test KPI Summary Cards */}
            {testCohortAnalytics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <p className="text-[10.5px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">Total Attempts</p>
                  <p className="text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-1 font-mono">
                    {testCohortAnalytics.totalAttempts}
                  </p>
                  <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    {testCohortAnalytics.uniqueStudentsCount} unique students
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <p className="text-[10.5px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">Average Score</p>
                  <p className="text-xl font-bold text-[#0b57d0] dark:text-[#a8c7fa] mt-1 font-mono">
                    {testCohortAnalytics.averagePercentage}%
                  </p>
                  <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    Avg Points: {testCohortAnalytics.averageScore}
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <p className="text-[10.5px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">Top Score</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                    {testCohortAnalytics.highestScore} pts
                  </p>
                  <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    Highest recorded
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                  <p className="text-[10.5px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">Avg Duration</p>
                  <p className="text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-1 font-mono">
                    {Math.round(testCohortAnalytics.averageTimeSeconds / 60)}m
                  </p>
                  <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    {testCohortAnalytics.averageTimeSeconds}s total avg
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] col-span-2 sm:col-span-1">
                  <p className="text-[10.5px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">Attempt Mode</p>
                  <p className="text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-1 font-mono">
                    {testCohortAnalytics.onlineAttemptsCount} / {testCohortAnalytics.omrAttemptsCount}
                  </p>
                  <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    Online vs. OMR
                  </p>
                </div>
              </div>
            )}

            {/* Question Error Rate Heatmap */}
            {testCohortAnalytics && testCohortAnalytics.questionErrorStats.length > 0 && (() => {
              const totalHeatmapQuestions = testCohortAnalytics.questionErrorStats.length;
              const displayedStats = heatmapDisplayMode === 'firstRow'
                ? testCohortAnalytics.questionErrorStats.slice(0, 10)
                : testCohortAnalytics.questionErrorStats;

              return (
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                          Question Mistake Heatmap
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f4f9] dark:bg-[#141619] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono border-0">
                          {displayedStats.length} of {totalHeatmapQuestions} shown
                        </span>
                      </div>
                      <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                        Shows question-by-question mistake rates across the student cohort.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-mono text-[#5e5e5e] dark:text-[#9aa0a6] hidden sm:inline">
                        Red &gt; 50% Error Rate
                      </span>

                      {/* Dropdown to switch between First Row and Full View */}
                      <div className="flex items-center gap-1.5 bg-[#f0f4f9] dark:bg-[#141619] px-3 py-1 rounded-full border-0">
                        <label className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">
                          View:
                        </label>
                        <select
                          value={heatmapDisplayMode}
                          onChange={(e) => setHeatmapDisplayMode(e.target.value as 'firstRow' | 'full')}
                          className="text-xs font-semibold bg-transparent text-[#1f1f1f] dark:text-[#e3e3e3] py-0.5 pr-1 rounded-lg cursor-pointer focus:outline-none border-0"
                        >
                          <option value="firstRow">First Row Only (Q1–Q10)</option>
                          <option value="full">Full Heatmap (All {totalHeatmapQuestions} Questions)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 pt-1">
                    {displayedStats.map((q) => {
                      const isHighError = q.errorRatePercentage >= 50;
                      return (
                        <div
                          key={q.questionNumber}
                          className={`p-2.5 rounded-[16px] text-center border-0 transition-all ${
                            isHighError
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                              : q.errorRatePercentage > 0
                              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                          }`}
                        >
                          <p className="text-[11px] font-bold">Q{q.questionNumber}</p>
                          <p className="text-xs font-mono font-bold mt-0.5">{q.errorRatePercentage}%</p>
                          <p className="text-[9.5px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                            {q.wrongCount + q.unattemptedCount} err
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Toggle Bottom Expand/Collapse Action Banner */}
                  {totalHeatmapQuestions > 10 && (
                    <button
                      type="button"
                      onClick={() => setHeatmapDisplayMode((prev) => (prev === 'firstRow' ? 'full' : 'firstRow'))}
                      className="w-full py-2.5 px-3 rounded-full bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-0 outline-none"
                    >
                      {heatmapDisplayMode === 'firstRow' ? (
                        <>
                          <ChevronDown className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          <span>Show Full Heatmap (Expand {totalHeatmapQuestions - 10} more questions: Q11–Q{totalHeatmapQuestions})</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          <span>Collapse to First Row Only (Q1–Q10)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Detailed Student Attempt Mappings Table */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Student Performance Mapping Records
                  </h3>
                  <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                    Individual attempts with question mistake breakdown.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={analyticsSearchQuery}
                    onChange={(e) => setAnalyticsSearchQuery(e.target.value)}
                    placeholder="Search student name..."
                    className="px-4 py-1.5 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-medium"
                  />

                  <select
                    value={analyticsModeFilter}
                    onChange={(e) => setAnalyticsModeFilter(e.target.value as any)}
                    className="px-3 py-1.5 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold cursor-pointer"
                  >
                    <option value="all">All Modes</option>
                    <option value="online">Online Only</option>
                    <option value="omr">OMR Only</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-[20px] bg-[#f0f4f9]/50 dark:bg-[#141619]/50 border-0">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#f0f4f9] dark:bg-[#141619] text-[#444746] dark:text-[#c4c7c5] font-bold uppercase text-[10px] tracking-wider border-0">
                      <th className="py-3 px-3.5">Student</th>
                      <th className="py-3 px-3.5">Mode</th>
                      <th className="py-3 px-3.5">Score</th>
                      <th className="py-3 px-3.5">Percentage</th>
                      <th className="py-3 px-3.5">Duration</th>
                      <th className="py-3 px-3.5">Wrong Questions</th>
                      <th className="py-3 px-3.5 text-right">Attempt Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e9eef6] dark:divide-[#202329] font-medium">
                    {filteredStudentRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-[#5e5e5e] dark:text-[#9aa0a6]">
                          No student attempts recorded for this test yet.
                        </td>
                      </tr>
                    ) : (
                      filteredStudentRows.map((r, i) => (
                        <tr key={r.attemptId + i} className="hover:bg-white/60 dark:hover:bg-[#1e2024]/60 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            {r.studentName}
                            {r.studentEmail && (
                              <span className="block text-[10px] font-normal text-[#5e5e5e] dark:text-[#9aa0a6] font-mono">
                                {r.studentEmail}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border-0 ${
                              r.attemptMode === 'omr'
                                ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
                                : 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]'
                            }`}>
                              {r.attemptMode}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-mono font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            {r.score} / {r.totalPoints}
                          </td>
                          <td className="py-3 px-3.5 font-mono">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border-0 ${
                              r.percentage >= 70
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : r.percentage >= 40
                                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}>
                              {r.percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[#5e5e5e] dark:text-[#9aa0a6]">
                            {Math.round(r.timeSpentSeconds / 60)}m
                          </td>
                          <td className="py-3 px-3.5">
                            {r.wrongQuestionNumbers.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {r.wrongQuestionNumbers.slice(0, 5).map((num) => (
                                  <span key={num} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-0">
                                    Q{num}
                                  </span>
                                ))}
                                {r.wrongQuestionNumbers.length > 5 && (
                                  <span className="text-[10.5px] text-[#5e5e5e] dark:text-[#9aa0a6] font-bold">
                                    +{r.wrongQuestionNumbers.length - 5}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                None (100% correct)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                            {new Date(r.completedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: PUBLISHING & MASTER TEST BANK                         */}
        {/* ============================================================ */}
        {activeTab === 'publishing' && (
          <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
            
            {/* Batch Context Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-blue-500/15 border border-emerald-500/20 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Target Batch Catalog:</span>
                <span className="font-extrabold">{currentBatch.title}</span>
                <span className="text-[11px] opacity-75">• 750 KB Bin-Packed Chunk Engine</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full">
                {currentBatchTests.length} Tests in {currentBatch.title}
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
                      <span>Publish Mock Tests to Batch: <strong>{currentBatch.title}</strong></span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-0">
                        {currentBatchTests.length} Batch Tests Live
                      </span>
                    </h2>
                    <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5">
                      Tests are bin-packed into 750 KB safe question catalog chunks for {currentBatch.title}. Enrolled students receive 1-read manifest hydration.
                    </p>
                  </div>
                </div>

                <div className="w-full sm:w-72">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5e5e5e] dark:text-[#9aa0a6] pointer-events-none" />
                    <input
                      type="text"
                      value={publishingSearch}
                      onChange={(e) => setPublishingSearch(e.target.value)}
                      placeholder="Search mock tests library..."
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#141619] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#5e5e5e]/80 dark:placeholder:text-[#9aa0a6]/80 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Test Cards List with One-Click Publish Switch: 2 columns on tablet (md:grid-cols-2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
              {tests
                .filter((t) => t.title.toLowerCase().includes(publishingSearch.toLowerCase()) || (t.topic || '').toLowerCase().includes(publishingSearch.toLowerCase()))
                .map((test) => {
                  const isPublished = publishedTestIds.includes(test.id);
                  const attemptsCount = attempts.filter((a) => a.testId === test.id || a.testTitle === test.title).length;

                  return (
                    <div
                      key={test.id}
                      className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
                    >
                      <div className="w-full space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider block truncate text-[#0b57d0] dark:text-[#a8c7fa]">
                            {test.topic || 'General Math'}
                          </span>
                          {isPublished ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 shrink-0">
                              LIVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#f0f4f9] dark:bg-[#141619] text-[#5e5e5e] dark:text-[#9aa0a6] border-0 shrink-0">
                              DRAFT
                            </span>
                          )}
                        </div>

                        <h3 className="text-[16px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
                          {test.title}
                        </h3>

                        <div className="flex items-center gap-1.5 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium leading-none pt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                            <Package className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" strokeWidth={2.2} />
                            <span className="leading-none">{test.questions?.length || 0} Qs</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                            <Clock className="w-3.5 h-3.5 text-[#6750a4] dark:text-[#d0bcff] shrink-0" strokeWidth={2.2} />
                            <span className="leading-none">{test.timeLimitMinutes || 60}m</span>
                          </span>
                          <span className="ml-auto text-[10.5px] text-[#5e5e5e] dark:text-[#9aa0a6]">
                            {attemptsCount} attempt{attemptsCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Toggle Bar */}
                      <div className="pt-2 border-t border-[#f0f4f9] dark:border-[#25282f] flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleTogglePublish(test)}
                          className={`h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border-0 outline-none ${
                            isPublished
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                              : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                          }`}
                        >
                          {isPublished ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Live (Click to Unpublish)</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Publish to Students</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          {onStartTest && (
                            <button
                              onClick={() => onStartTest(test, 'timed')}
                              className="h-9 px-3.5 rounded-full text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] transition-colors cursor-pointer active:scale-95 border-0 outline-none"
                            >
                              Preview
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

          </div>
        )}

      </main>

      {/* Delete Confirmation Modal (Both User and Master vs Master Only) */}
      <AnimatePresence>
        {deleteModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-white dark:bg-[#1e2024] border-0 rounded-[28px] max-w-lg w-full p-5 sm:p-6 shadow-[0_8px_28px_rgba(0,0,0,0.2)] space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      {deleteModal.isBulk ? 'Delete All Dispatched Tests' : 'Delete Dispatched Practice Test'}
                    </h3>
                    <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
                      Choose where you want to remove this practice test
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  className="w-8 h-8 rounded-full bg-[#f0f4f9] dark:bg-[#141619] text-[#444746] hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:text-[#e3e3e3] flex items-center justify-center cursor-pointer transition-colors border-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target Details Badge */}
              {!deleteModal.isBulk && deleteModal.target && (
                <div className="p-3.5 rounded-[20px] bg-[#f0f4f9] dark:bg-[#141619] border-0 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      {deleteModal.target.title}
                    </span>
                    <span className="text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                      {deleteModal.target.totalQuestions} Questions
                    </span>
                  </div>
                  <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] truncate">
                    Student: <span className="font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">{deleteModal.target.studentName}</span> ({deleteModal.target.studentEmail || deleteModal.target.studentId})
                  </div>
                </div>
              )}

              {deleteModal.isBulk && (
                <div className="p-3.5 rounded-[20px] bg-amber-50 dark:bg-amber-950/30 border-0 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>You have selected to delete all <strong>{dispatchLedger.length}</strong> practice tests currently listed in the Dispatched Practice Ledger.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {/* Option 1: Delete from both user and master account */}
                <button
                  type="button"
                  onClick={() => handleExecuteDelete('both')}
                  className="w-full text-left p-3.5 rounded-[20px] border-0 bg-rose-50/80 hover:bg-rose-100/90 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 transition-all cursor-pointer group active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Delete from both user and master account
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 border-0">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 mt-1 leading-snug">
                    Completely deletes and revokes access from the student's mock tests library, cleans cloud records, and removes it from the Master Console ledger.
                  </p>
                </button>

                {/* Option 2: Delete from only master account */}
                <button
                  type="button"
                  onClick={() => handleExecuteDelete('master_only')}
                  className="w-full text-left p-3.5 rounded-[20px] border-0 bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] transition-all cursor-pointer group active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-amber-500" />
                      Delete from only master account
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] border-0">
                      Keep for student
                    </span>
                  </div>
                  <p className="text-[11px] text-[#444746] dark:text-[#c4c7c5] mt-1 leading-snug">
                    Removes from the Master Console dispatch ledger only. The student keeps their practice test and can continue practicing.
                  </p>
                </button>
              </div>

              {/* Footer / Cancel */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  className="h-9 px-4 rounded-full text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#141619] transition-colors cursor-pointer border-0"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
