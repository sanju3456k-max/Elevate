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
  Trash2
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
  type PerTestCohortAnalytics,
  type RemedialDeleteScope
} from '../lib/masterAccount';
import { loadFullTestOnDemand } from '../lib/storage';
import { APP_STYLES } from './ui/AppStyles';

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
  const [activeTab, setActiveTab] = useState<'remedial' | 'analytics' | 'publishing'>('remedial');

  // ==========================================
  // 1. Adaptive Remedial Engine State
  // ==========================================
  const [selectedSourceTestIds, setSelectedSourceTestIds] = useState<string[]>(() => {
    return tests.slice(0, 3).map((t) => t.id);
  });
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

  // Background fetch cohort student attempts for source tests with debounce and deduplication
  React.useEffect(() => {
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
  }, [selectedSourceTests, cloudCohortAttemptsMap]);

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

    return combined;
  }, [selectedSourceTests, attempts, cloudCohortAttemptsMap]);

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
    // Initial fetch from cloud Firestore (MASTER_REMEDIAL_CATALOG)
    fetchMasterDispatchLedgerFromCloud()
      .then((ledger) => {
        if (Array.isArray(ledger)) {
          setDispatchLedger(ledger);
        }
      })
      .catch(() => {});

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

  // Fetch cloud cohort student attempts for the selected analytics test
  React.useEffect(() => {
    if (!selectedAnalyticsTest || !selectedAnalyticsTest.id) return;
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
  }, [selectedAnalyticsTest, cloudCohortAttemptsMap]);

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

    return combined;
  }, [selectedAnalyticsTest, attempts, cloudCohortAttemptsMap]);

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

  // Sync published tests state reactively
  React.useEffect(() => {
    const handleUpdate = () => {
      setPublishedTestIds(getMasterPublishedTestIds());
    };
    window.addEventListener('tests-published-updated', handleUpdate);

    fetchPublishedMasterTestsFromCloud()
      .then(() => {
        setPublishedTestIds(getMasterPublishedTestIds());
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('tests-published-updated', handleUpdate);
    };
  }, []);

  const handleTogglePublish = async (test: MathTest) => {
    const res = await toggleTestPublishStatus(test);
    setPublishedTestIds(getMasterPublishedTestIds());
    onRefreshTests?.();
    showNotification(
      res.isPublished 
        ? `"${test.title}" is now published and available to all students.` 
        : `"${test.title}" is now unpublished (kept private).`,
      'info'
    );
  };

  return (
    <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30 select-none">
      
      {/* Top App Bar (Google Material 3 Authentic Header) */}
      <header className="px-4 sm:px-6 py-3 bg-white dark:bg-[#1a1d24] border-b border-slate-200 dark:border-zinc-800 shrink-0 flex items-center justify-between gap-3 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            title="Back to App"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                Master Console
              </h1>
              <span className="w-2 h-2 rounded-full bg-amber-500" title="Active Master Control" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
              Academic Control Center • {MASTER_ADMIN_EMAIL}
            </p>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title="Toggle Dark/Light Mode"
              className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#0b57d0]" />}
            </button>
          )}

          <button
            onClick={onBack}
            title="Exit Console"
            className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </header>

      {/* Tab Navigation Pill Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#f8fafd] dark:bg-[#14161b] border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('remedial')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'remedial'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'bg-white dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Adaptive Remedial Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'bg-white dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Per-Test Performance Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('publishing')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'publishing'
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'bg-white dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Publish Tests to Students ({publishedTestIds.length}/{tests.length})</span>
          </button>
        </div>

        <div className="shrink-0 hidden lg:block text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
          Single-Instance Storage: Tests (~40 KB) • Attempts (~1 KB) • Pointers (&lt;0.5 KB)
        </div>
      </div>

      {/* Global In-App Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="mx-4 sm:mx-6 mt-3 p-3 bg-white dark:bg-[#1a1d24] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-xs font-bold rounded-2xl flex items-center gap-2.5 shadow-md shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main View Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

        {/* ============================================================ */}
        {/* TAB 1: ADAPTIVE REMEDIAL ENGINE                              */}
        {/* ============================================================ */}
        {activeTab === 'remedial' && (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Step 1: Source Tests Selection */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white font-black text-xs flex items-center justify-center">
                    1
                  </span>
                  <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                    Select Source Mock Tests
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectFirstThree}
                    className="px-3 py-1 rounded-full text-xs font-bold bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Select First 3 Tests
                  </button>
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    Select All ({tests.length})
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Choose the mock tests to scan for student mistakes, skipped questions, or doubt flags.
              </p>

              {/* Source Tests Multi-Select Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {tests.map((test) => {
                  const isSelected = selectedSourceTestIds.includes(test.id);
                  const hydrated = hydratedTestsMap[test.id];
                  const qCount = hydrated?.questions?.length || test.questions?.length || (test as any).questionCount || 50;

                  return (
                    <div
                      key={test.id}
                      onClick={() => toggleSourceTest(test.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 select-none ${
                        isSelected
                          ? 'bg-[#d3e3fd]/40 dark:bg-[#004a77]/25 border-[#0b57d0] dark:border-[#a8c7fa]'
                          : 'bg-slate-50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                          {test.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                          {qCount} Questions • {test.timeLimitMinutes || 60}m
                        </p>
                      </div>

                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-[#0b57d0] border-[#0b57d0] text-white'
                          : 'border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Target Weakness Category & Settings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Category Filter */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white font-black text-xs flex items-center justify-center">
                      2
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                      Target Weakness Categories
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectAllCategories}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      All (Errors + Marked)
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectWrongOnly}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Wrong
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectUnattemptedOnly}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Skipped
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectMarkedOnly}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Marked
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectUnmarkedOnly}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Unmarked
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllFourCategories}
                      className="px-2 py-0.5 rounded-full text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      All 4
                    </button>
                  </div>
                </div>

                <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">
                  Select among <strong>Incorrect</strong>, <strong>Unattempted</strong>, <strong>Marked</strong>, and <strong>Unmarked</strong> categories. These categories are automatically selected from each user's test attempts based on their individual performance, and multiple selections are merged with zero duplicate questions.
                </p>

                <div className="space-y-2">
                  {[
                    {
                      id: 'wrong' as const,
                      title: 'Incorrect',
                      desc: 'Strictly questions attempted by student and answered incorrectly.',
                      badge: 'Attempted & Wrong',
                    },
                    {
                      id: 'unattempted' as const,
                      title: 'Unattempted',
                      desc: 'Strictly questions skipped or left unattempted across source tests.',
                      badge: 'Skipped / Unattempted',
                    },
                    {
                      id: 'marked' as const,
                      title: 'Marked',
                      desc: 'Questions marked or flagged for review (whether correct, incorrect, or skipped).',
                      badge: 'Flagged for Review',
                    },
                    {
                      id: 'unmarked' as const,
                      title: 'Unmarked',
                      desc: 'Questions not marked or flagged for review by the student.',
                      badge: 'Not Flagged',
                    },
                  ].map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <div
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-[#d3e3fd]/40 dark:bg-[#004a77]/30 border-[#0b57d0] dark:border-[#a8c7fa] font-bold'
                            : 'bg-slate-50 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected 
                              ? 'bg-[#0b57d0] border-[#0b57d0] text-white shadow-xs' 
                              : 'border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">{cat.title}</p>
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-normal">
                                {cat.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                              {cat.desc}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#0b57d0]/10 text-[#0b57d0] dark:bg-[#a8c7fa]/20 dark:text-[#a8c7fa]">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    Active filter: <strong>{selectedCategories.map((c) => c.toUpperCase()).join(' + ')}</strong> ({totalPointersInCohort} questions across cohort)
                  </span>
                </div>
              </div>

              {/* Title, Duration & Dispatch Action */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-4 flex flex-col justify-between shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                      Assigned Practice Settings
                    </h3>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Practice Title for Students
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Targeted Practice Set"
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                      Time Limit (Minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={timeLimitMinutes}
                      onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                      className="w-32 px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] font-mono font-bold"
                    />
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 ml-2">
                      (Default ~2 min/question)
                    </span>
                  </div>
                </div>

                {/* Cohort Summary Box */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-zinc-400">Selected Source Tests:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-zinc-100">
                      {selectedSourceTests.length} tests
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-zinc-400">Cohort Impact:</span>
                    <span className="font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                      {cohortPreview.length} student(s) • {totalPointersInCohort} questions
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-zinc-400">Storage Footprint:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      &lt;0.5 KB per student (Zero Redundancy)
                    </span>
                  </div>
                </div>

                {/* Dispatch Action */}
                <button
                  onClick={handleDispatchRemedial}
                  disabled={isDispatching || selectedSourceTests.length === 0 || cohortPreview.length === 0}
                  className="w-full py-3 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs sm:text-sm tracking-wide shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isDispatching
                      ? 'Dispatching Custom Practice...'
                      : cohortPreview.length === 0
                      ? 'No Students Attempted Selected Test(s)'
                      : `Dispatch Custom Practice to ${cohortPreview.length} Student(s)`}
                  </span>
                </button>
              </div>
            </div>

            {/* Step 3: Live Cohort Breakdown */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white font-black text-xs flex items-center justify-center">
                    3
                  </span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                    Cohort Error Extraction Preview
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                    1st-Ever Attempt Diagnostics
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                  {cohortPreview.length} Student Record(s) Evaluated
                </span>
              </div>

              {cohortPreview.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-zinc-900/40 border border-dashed border-slate-200 dark:border-zinc-800 space-y-1.5">
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    No student attempts found for the selected test(s) yet.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                    When students attempt any of the selected source tests, their names, IDs, and targeted weakness questions from their 1st-ever attempts will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-zinc-700">
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">Student ID / Email</th>
                        <th className="py-2.5 px-3">1st Attempt Evaluated</th>
                        <th className="py-2.5 px-3">Targeted Questions (1st Attempt)</th>
                        <th className="py-2.5 px-3 text-right">Data Overhead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-medium">
                      {cohortPreview.map((s, idx) => (
                        <tr key={s.studentId + idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-zinc-100">
                            {s.studentName}
                            {s.studentId === currentUserId && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[160px]">
                            {s.studentEmail || s.studentId}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-zinc-300">
                            {s.attemptCount} attempt(s)
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff]">
                                {s.matchingQuestionsCount} Qs
                              </span>
                              {s.matchingQuestionsCount === 0 && (
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">
                                  (No questions matching filter)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                            ~{(s.matchingQuestionsCount * 0.03).toFixed(2)} KB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Previously Dispatched Ledger */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-4 shadow-xs">
                {/* Header with Assigned/Unassigned Options immediately to the right */}
                <div className="flex items-center justify-between flex-wrap gap-2.5">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                      Dispatched Practice Ledger
                    </h3>
                    <span className="text-xs font-mono font-semibold text-slate-400 dark:text-zinc-500">
                      ({filteredDispatchLedger.length}/{dispatchLedger.length})
                    </span>
                  </div>

                  {/* Assigned / Unassigned Filter Options & Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center p-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[11px] font-bold border border-slate-200/80 dark:border-zinc-700/80">
                      <button
                        type="button"
                        onClick={() => setLedgerFilter('all')}
                        className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                          ledgerFilter === 'all'
                            ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow-xs'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        All ({dispatchLedger.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerFilter('assigned')}
                        className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                          ledgerFilter === 'assigned'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        Assigned ({assignedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerFilter('unassigned')}
                        className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                          ledgerFilter === 'unassigned'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        Unassigned ({unassignedCount})
                      </button>
                    </div>

                    {assignedCount > 0 && (
                      <button
                        type="button"
                        onClick={handleUnassignAllRemedial}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 transition-colors cursor-pointer"
                        title="Unassign all currently assigned tests from students"
                      >
                        Unassign All
                      </button>
                    )}

                    {dispatchLedger.length > 0 && (
                      <button
                        type="button"
                        onClick={openDeleteModalForBulk}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer flex items-center gap-1"
                        title="Delete all practice tests in ledger"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete All
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {dispatchLedger.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-zinc-900/40 border border-dashed border-slate-200 dark:border-zinc-800">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        No custom practice sets dispatched yet. When you dispatch a remedial practice set, it will appear here in real time.
                      </p>
                    </div>
                  ) : filteredDispatchLedger.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-zinc-900/40 border border-dashed border-slate-200 dark:border-zinc-800">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        No practice tests found matching "{ledgerFilter}".
                      </p>
                    </div>
                  ) : (
                    filteredDispatchLedger.map((d) => (
                      <div
                        key={d.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between flex-wrap gap-2 text-xs ${
                          d.isUnassigned
                            ? 'bg-slate-50/60 dark:bg-zinc-900/30 border-slate-200 dark:border-zinc-800/80 opacity-75'
                            : 'bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 shadow-xs'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-zinc-100">{d.title}</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                              {d.filterType}
                            </span>
                            {d.isUnassigned && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                                Revoked
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                            Student: <span className="font-bold text-slate-800 dark:text-zinc-200">{d.studentName}</span> ({d.studentId}) • {d.totalQuestions} Questions • {new Date(d.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {d.isCompleted && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Done ({d.completedPercentage || 0}%)
                            </span>
                          )}

                          {/* Replaced tag with interactive Assigned to Unassigned button */}
                          <button
                            type="button"
                            onClick={() => handleToggleAssignRemedial(d)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 group ${
                              !d.isUnassigned
                                ? 'bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-700 border border-emerald-300 hover:border-rose-300 dark:bg-emerald-950/40 dark:hover:bg-rose-950/40 dark:text-emerald-300 dark:hover:text-rose-300 dark:border-emerald-800'
                                : 'bg-amber-50 hover:bg-emerald-50 text-amber-700 hover:text-emerald-700 border border-amber-300 hover:border-emerald-300 dark:bg-amber-950/40 dark:hover:bg-emerald-950/40 dark:text-amber-300 dark:hover:text-emerald-300 dark:border-amber-800'
                            }`}
                            title={!d.isUnassigned ? 'Click to unassign (revoke) test from student' : 'Click to assign test back to student'}
                          >
                            {!d.isUnassigned ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:bg-rose-500 transition-colors" />
                                <span className="group-hover:hidden">Assigned</span>
                                <span className="hidden group-hover:inline text-[11px] font-extrabold text-rose-600 dark:text-rose-400">Click to Unassign</span>
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-amber-500 group-hover:bg-emerald-500 transition-colors" />
                                <span className="group-hover:hidden">Unassigned</span>
                                <span className="hidden group-hover:inline text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">Click to Assign</span>
                              </>
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => openDeleteModalForTest(d)}
                            className="px-2.5 py-1.5 rounded-full text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/50 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
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
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Top: Test Selector Dropdown */}
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Select Test for Cohort Performance Mapping</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    View every student who attempted this specific test and examine question error distributions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Gradebook CSV</span>
                  </button>
                </div>
              </div>

              {/* Enhanced Test Selector Controls (Dropdown + Search + Prev/Next + Grid Toggle) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Search Filter Input */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={analyticsTestSearchFilter}
                    onChange={(e) => setAnalyticsTestSearchFilter(e.target.value)}
                    placeholder="Search tests by title or number..."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0b57d0]"
                  />
                  {analyticsTestSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setAnalyticsTestSearchFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-xs"
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
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0b57d0] cursor-pointer"
                  >
                    {filteredAnalyticsTests.map((t) => {
                      const globalIdx = tests.findIndex((item) => item.id === t.id) + 1;
                      const qCount = t.questions?.length || (t as any).questionCount || 50;
                      return (
                        <option key={t.id} value={t.id}>
                          #{globalIdx}. {t.title} ({qCount} Questions)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Prev / Next Stepper Controls */}
                <div className="flex items-center justify-between sm:justify-start gap-1 bg-slate-50 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectPrevAnalyticsTest}
                    disabled={currentAnalyticsTestIndex <= 0}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    title="Previous test"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono font-bold px-1.5 text-slate-600 dark:text-zinc-400 select-none">
                    {currentAnalyticsTestIndex >= 0 ? currentAnalyticsTestIndex + 1 : 1}/{tests.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectNextAnalyticsTest}
                    disabled={currentAnalyticsTestIndex >= tests.length - 1}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    title="Next test"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Toggle Full Cards Grid Button */}
                <button
                  type="button"
                  onClick={() => setShowAllTestsList((prev) => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 border ${
                    showAllTestsList
                      ? 'bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff] border-[#0b57d0]'
                      : 'bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Toggle card picker list"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{showAllTestsList ? 'Hide Grid' : `All Tests (${tests.length})`}</span>
                </button>
              </div>

              {/* Active Selected Test Summary Banner */}
              <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white text-[11px] font-black flex items-center justify-center shrink-0">
                    {currentAnalyticsTestIndex >= 0 ? currentAnalyticsTestIndex + 1 : 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                      {selectedAnalyticsTest?.title || 'Selected Test'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                      {selectedAnalyticsTest?.questions?.length || 50} Questions • {selectedAnalyticsTest?.timeLimitMinutes || 60}m time limit
                    </p>
                  </div>
                </div>

                {testCohortAnalytics && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-[11px]">
                      {testCohortAnalytics.totalAttempts} Attempts
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                      {testCohortAnalytics.averagePercentage}% Avg
                    </span>
                  </div>
                )}
              </div>

              {/* Full Test Cards Grid (Expandable on demand or filtered) */}
              {showAllTestsList && (
                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Choose from all {filteredAnalyticsTests.length} tests:
                    </span>
                    {analyticsTestSearchFilter && (
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Filtering by: &quot;{analyticsTestSearchFilter}&quot;
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {filteredAnalyticsTests.map((t) => {
                      const isSelected = t.id === selectedAnalyticsTestId;
                      const globalIdx = tests.findIndex((item) => item.id === t.id) + 1;
                      const qCount = t.questions?.length || (t as any).questionCount || 50;

                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedAnalyticsTestId(t.id);
                          }}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                            isSelected
                              ? 'bg-[#d3e3fd]/40 dark:bg-[#004a77]/25 border-[#0b57d0] dark:border-[#a8c7fa]'
                              : 'bg-slate-50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                              #{globalIdx}. {t.title}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                              {qCount} Questions • {t.timeLimitMinutes || 60}m
                            </p>
                          </div>

                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shrink-0">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 font-bold">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 shadow-xs">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">Total Attempts</p>
                  <p className="text-lg font-black text-slate-900 dark:text-zinc-100 mt-1 font-mono">
                    {testCohortAnalytics.totalAttempts}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    {testCohortAnalytics.uniqueStudentsCount} unique students
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 shadow-xs">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">Average Score</p>
                  <p className="text-lg font-black text-[#0b57d0] dark:text-[#a8c7fa] mt-1 font-mono">
                    {testCohortAnalytics.averagePercentage}%
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    Avg Points: {testCohortAnalytics.averageScore}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 shadow-xs">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">Top Score</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                    {testCohortAnalytics.highestScore} pts
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    Highest recorded
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 shadow-xs">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">Average Duration</p>
                  <p className="text-lg font-black text-slate-900 dark:text-zinc-100 mt-1 font-mono">
                    {Math.round(testCohortAnalytics.averageTimeSeconds / 60)}m
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    {testCohortAnalytics.averageTimeSeconds}s total avg
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 shadow-xs col-span-2 sm:col-span-1">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">Attempt Mode</p>
                  <p className="text-lg font-black text-slate-900 dark:text-zinc-100 mt-1 font-mono">
                    {testCohortAnalytics.onlineAttemptsCount} / {testCohortAnalytics.omrAttemptsCount}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
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
                <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3.5 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                          Question Mistake Heatmap
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-mono">
                          {displayedStats.length} of {totalHeatmapQuestions} shown
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Shows question-by-question mistake rates across the student cohort.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 hidden sm:inline">
                        Red &gt; 50% Error Rate
                      </span>

                      {/* Dropdown to switch between First Row and Full View */}
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                        <label className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 shrink-0">
                          View:
                        </label>
                        <select
                          value={heatmapDisplayMode}
                          onChange={(e) => setHeatmapDisplayMode(e.target.value as 'firstRow' | 'full')}
                          className="text-xs font-bold bg-transparent text-slate-800 dark:text-zinc-100 py-0.5 pr-1 rounded-lg cursor-pointer focus:outline-none"
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
                          className={`p-2 rounded-xl text-center border transition-all ${
                            isHighError
                              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                              : q.errorRatePercentage > 0
                              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                          }`}
                        >
                          <p className="text-[11px] font-black">Q{q.questionNumber}</p>
                          <p className="text-xs font-mono font-bold mt-0.5">{q.errorRatePercentage}%</p>
                          <p className="text-[9px] text-slate-500 dark:text-zinc-400 mt-0.5">
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
                      className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-dashed border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2.5">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                    Student Performance Mapping Records
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Individual attempts with question mistake breakdown.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={analyticsSearchQuery}
                    onChange={(e) => setAnalyticsSearchQuery(e.target.value)}
                    placeholder="Search student name..."
                    className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0b57d0]"
                  />

                  <select
                    value={analyticsModeFilter}
                    onChange={(e) => setAnalyticsModeFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300"
                  >
                    <option value="all">All Modes</option>
                    <option value="online">Online Only</option>
                    <option value="omr">OMR Only</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-zinc-700">
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3">Score</th>
                      <th className="py-2.5 px-3">Percentage</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Wrong Questions</th>
                      <th className="py-2.5 px-3 text-right">Attempt Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-medium">
                    {filteredStudentRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-slate-400 dark:text-zinc-500">
                          No student attempts recorded for this test yet.
                        </td>
                      </tr>
                    ) : (
                      filteredStudentRows.map((r, i) => (
                        <tr key={r.attemptId + i} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-zinc-100">
                            {r.studentName}
                            {r.studentEmail && (
                              <span className="block text-[10px] font-normal text-slate-400 dark:text-zinc-500 font-mono">
                                {r.studentEmail}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              r.attemptMode === 'omr'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
                                : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                            }`}>
                              {r.attemptMode}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-zinc-100">
                            {r.score} / {r.totalPoints}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.percentage >= 70
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                : r.percentage >= 40
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                            }`}>
                              {r.percentage}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-zinc-400">
                            {Math.round(r.timeSpentSeconds / 60)}m
                          </td>
                          <td className="py-2.5 px-3">
                            {r.wrongQuestionNumbers.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {r.wrongQuestionNumbers.slice(0, 5).map((num) => (
                                  <span key={num} className="px-1.5 py-0.2 rounded-sm text-[9.5px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                                    Q{num}
                                  </span>
                                ))}
                                {r.wrongQuestionNumbers.length > 5 && (
                                  <span className="text-[10px] text-slate-400">
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
                          <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400 dark:text-zinc-500">
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
          <div className="max-w-6xl mx-auto space-y-6">
            
            <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                    Publish Tests to All Students
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Tests toggled as "Published" appear immediately in students' Mock Tests Library. Question papers are stored once (~40 KB) to preserve free tier storage.
                  </p>
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    value={publishingSearch}
                    onChange={(e) => setPublishingSearch(e.target.value)}
                    placeholder="Search library tests..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0b57d0]"
                  />
                </div>
              </div>
            </div>

            {/* Test Cards List with One-Click Publish Switch */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {tests
                .filter((t) => t.title.toLowerCase().includes(publishingSearch.toLowerCase()) || (t.topic || '').toLowerCase().includes(publishingSearch.toLowerCase()))
                .map((test) => {
                  const isPublished = publishedTestIds.includes(test.id);
                  const attemptsCount = attempts.filter((a) => a.testId === test.id || a.testTitle === test.title).length;

                  return (
                    <div
                      key={test.id}
                      className={`p-4 rounded-[22px] border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                        isPublished
                          ? 'bg-white dark:bg-[#1a1d24] border-emerald-500/50 dark:border-emerald-500/40 ring-1 ring-emerald-500/20'
                          : 'bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-zinc-800'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
                              {test.topic || 'General Math'}
                            </span>
                            {isPublished ? (
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                                LIVE FOR STUDENTS
                              </span>
                            ) : (
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 shrink-0">
                                PRIVATE DRAFT
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 shrink-0">
                            {test.questions?.length || 0} Qs • {test.timeLimitMinutes || 60}m
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 line-clamp-2">
                          {test.title}
                        </h3>

                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {attemptsCount} student attempt(s) recorded
                        </p>
                      </div>

                      {/* Bottom Toggle Bar */}
                      <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleTogglePublish(test)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isPublished
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                              : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs'
                          }`}
                        >
                          {isPublished ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Published (Click to Unpublish)</span>
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
                              className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                      {deleteModal.isBulk ? 'Delete All Dispatched Tests' : 'Delete Dispatched Practice Test'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Choose where you want to remove this practice test
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target Details Badge */}
              {!deleteModal.isBulk && deleteModal.target && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-zinc-300">
                      {deleteModal.target.title}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {deleteModal.target.totalQuestions} Questions
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    Student: <span className="font-medium text-slate-700 dark:text-zinc-300">{deleteModal.target.studentName}</span> ({deleteModal.target.studentEmail || deleteModal.target.studentId})
                  </div>
                </div>
              )}

              {deleteModal.isBulk && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
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
                  className="w-full text-left p-3.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/60 hover:bg-rose-100/70 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 transition-all cursor-pointer group shadow-xs active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Delete from both user and master account
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 leading-snug">
                    Completely deletes and revokes access from the student's mock tests library, cleans cloud records, and removes it from the Master Console ledger.
                  </p>
                </button>

                {/* Option 2: Delete from only master account */}
                <button
                  type="button"
                  onClick={() => handleExecuteDelete('master_only')}
                  className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white hover:bg-slate-50 dark:bg-zinc-800 dark:hover:bg-zinc-750 transition-all cursor-pointer group shadow-xs active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-amber-500" />
                      Delete from only master account
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                      Keep for student
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-snug">
                    Removes from the Master Console dispatch ledger only. The student keeps their practice test and can continue practicing.
                  </p>
                </button>
              </div>

              {/* Footer / Cancel */}
              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
