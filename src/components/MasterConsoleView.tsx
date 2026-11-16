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
  Package,
  Menu,
  Folder,
  Settings,
  Smartphone,
  UserPlus,
  ShieldAlert,
  IndianRupee,
  Globe,
  Lock,
  ExternalLink
} from 'lucide-react';
import type { MathTest, TestAttempt, RemedialFilterType, AssignedRemedialTest } from '../types';
import { getTestDurationMinutes } from '../utils/testFormatConverter';
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
import { adminResetDeviceLock } from '../lib/deviceAuthService';
import { M3Switch } from './ui/Material3';
import { useApp } from '../lms/LmsContext';
import { auth, signInWithGoogle } from '../lib/firebase';

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
  onSignIn?: () => void;
  onOpenBatch?: (batchId: string) => void;
}

export type MasterConsoleNavTab =
  | 'roster'
  | 'remedial'
  | 'analytics'
  | 'publishing'
  | 'settings';

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
  onSignIn,
  onOpenBatch,
}) => {
  const [activeTab, setActiveTab] = useState<MasterConsoleNavTab>('roster');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // ==========================================
  // Universal Multi-Tenant Batch Context
  // ==========================================
  const {
    batches,
    chapters,
    batchTests,
    getEnrollmentsForBatch,
    loadRosterForBatch,
    enrollStudentByContact,
    revokeStudentEnrollment,
    updateBatch,
    deleteBatch,
    showSecurityToast,
    securitySettings,
    updateSecuritySettings,
    getTestsForBatch,
    addTestToBatchCatalog,
    deleteBatchTest,
    toggleTestInChapter,
    loadCurriculumForBatch,
  } = useApp();

  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => batches[0]?.id || 'batch_testing_01');

  useEffect(() => {
    if (selectedBatchId) {
      loadRosterForBatch(selectedBatchId);
      loadCurriculumForBatch(selectedBatchId);
    }
  }, [selectedBatchId, loadRosterForBatch, loadCurriculumForBatch]);

  const currentBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0] || ({
      id: 'batch_testing_01',
      title: 'Testing Batch',
      price: 999,
      isPublished: true,
      originalPrice: 1999,
      validityDays: 365,
      category: 'Mathematics',
      allowGuestAccess: true,
    } as any);
  }, [batches, selectedBatchId]);

  const currentBatchChapters = useMemo(() => {
    return chapters.filter((c) => c.batchId === selectedBatchId);
  }, [chapters, selectedBatchId]);

  const [selectedPublishChapterId, setSelectedPublishChapterId] = useState<string>('');

  useEffect(() => {
    if (currentBatchChapters.length > 0) {
      if (!selectedPublishChapterId || !currentBatchChapters.some((c) => c.id === selectedPublishChapterId)) {
        setSelectedPublishChapterId(currentBatchChapters[0].id);
      }
    } else {
      setSelectedPublishChapterId('');
    }
  }, [selectedBatchId, currentBatchChapters, selectedPublishChapterId]);

  const currentBatchEnrollments = useMemo(() => {
    return getEnrollmentsForBatch(selectedBatchId);
  }, [selectedBatchId, getEnrollmentsForBatch]);

  const currentBatchTests = useMemo(() => {
    return (batchTests || []).filter((t) => t.batchId === selectedBatchId);
  }, [selectedBatchId, batchTests]);

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
  // Roster Tab States & Actions
  // ==========================================
  const [rosterSearch, setRosterSearch] = useState('');
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [studentContactInput, setStudentContactInput] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentValidityDays, setStudentValidityDays] = useState(365);
  const [isEnrollingStudent, setIsEnrollingStudent] = useState(false);

  const filteredEnrollments = useMemo(() => {
    if (!rosterSearch.trim()) return currentBatchEnrollments;
    const q = rosterSearch.toLowerCase().trim();
    return currentBatchEnrollments.filter((e) =>
      (e.studentName && e.studentName.toLowerCase().includes(q)) ||
      (e.studentEmail && e.studentEmail.toLowerCase().includes(q)) ||
      (e.studentPhone && e.studentPhone.toLowerCase().includes(q))
    );
  }, [currentBatchEnrollments, rosterSearch]);

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentContactInput.trim() || !selectedBatchId) return;
    setIsEnrollingStudent(true);
    try {
      const result = enrollStudentByContact({
        contact: studentContactInput.trim(),
        batchId: selectedBatchId,
        name: studentNameInput.trim() || undefined,
        validityDays: Number(studentValidityDays) || 365,
      });
      if (result.success) {
        showNotification(result.message || 'Student enrolled successfully!');
        setIsAddStudentModalOpen(false);
        setStudentContactInput('');
        setStudentNameInput('');
      } else {
        alert(result.message || 'Enrollment failed.');
      }
    } catch (err: any) {
      alert('Error enrolling student: ' + (err?.message || err));
    } finally {
      setIsEnrollingStudent(false);
    }
  };

  const handleResetDeviceLock = async (userId: string, studentName: string) => {
    if (window.confirm(`Reset device lock for ${studentName}? This will allow them to bind a new phone or laptop upon their next login.`)) {
      const ok = await adminResetDeviceLock(userId);
      if (ok) {
        showNotification(`Device lock reset for ${studentName}. New device registration permitted.`);
      } else {
        alert('Failed to reset device lock. Please check permissions.');
      }
    }
  };

  const handleRevokeEnrollment = (userId: string, studentName: string) => {
    if (window.confirm(`Revoke enrollment for ${studentName}?`)) {
      revokeStudentEnrollment(userId, selectedBatchId);
      showNotification(`Enrollment revoked for ${studentName}`);
    }
  };

  // ==========================================
  // Settings Tab States & Actions
  // ==========================================
  const [batchPrice, setBatchPrice] = useState<number>(currentBatch.price || 999);
  const [batchOriginalPrice, setBatchOriginalPrice] = useState<number>(currentBatch.originalPrice || 1999);
  const [batchValidityDays, setBatchValidityDays] = useState<number>(currentBatch.validityDays || 365);
  const [batchTitleInput, setBatchTitleInput] = useState<string>(currentBatch.title || '');
  const [batchCategoryInput, setBatchCategoryInput] = useState<string>(currentBatch.category || 'Mathematics');

  useEffect(() => {
    setBatchPrice(currentBatch.price || 999);
    setBatchOriginalPrice(currentBatch.originalPrice || 1999);
    setBatchValidityDays(currentBatch.validityDays || 365);
    setBatchTitleInput(currentBatch.title || '');
    setBatchCategoryInput(currentBatch.category || 'Mathematics');
  }, [currentBatch]);

  const handleSaveBatchSettings = () => {
    updateBatch(currentBatch.id, {
      title: batchTitleInput.trim() || currentBatch.title,
      category: batchCategoryInput.trim() || currentBatch.category,
      price: Number(batchPrice) || 0,
      originalPrice: Number(batchOriginalPrice) || 0,
      validityDays: Number(batchValidityDays) || 365,
    });
    showNotification(`Settings saved for "${currentBatch.title}".`);
  };

  const handleTogglePublishBatch = (isPublished: boolean) => {
    updateBatch(currentBatch.id, { isPublished });
    showNotification(
      isPublished
        ? `Batch "${currentBatch.title}" Published! Live to students & visitors.`
        : `Batch "${currentBatch.title}" set to Draft! Locked for students.`
    );
  };

  const handleToggleGuestAccess = () => {
    const nextState = !currentBatch.allowGuestAccess;
    updateBatch(currentBatch.id, { allowGuestAccess: nextState });
    showNotification(
      nextState
        ? `Guest access enabled for "${currentBatch.title}". Open to all visitors.`
        : `Guest access restricted for "${currentBatch.title}". Official roster admission required.`
    );
  };

  const handleToggleDrmShield = () => {
    const next = !securitySettings?.enableDrmScreenProtection;
    updateSecuritySettings({ enableDrmScreenProtection: next });
    showNotification(
      next
        ? 'DRM Screen Shield activated (Snipping tool blackout enabled).'
        : 'DRM Screen Shield disabled.'
    );
  };

  const handleToggleEncryption = () => {
    const next = securitySettings?.enableStorageEncryption === false;
    updateSecuritySettings({ enableStorageEncryption: next });
    showNotification(
      next
        ? 'Offline and local storage encryption enabled.'
        : 'Storage encryption set to standard.'
    );
  };

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
      if (selectedBatchId) {
        loadCurriculumForBatch(selectedBatchId);
      }
    };
    window.addEventListener('tests-published-updated', handleUpdate);
    window.addEventListener('batch-tests-updated', handleUpdate);

    return () => {
      window.removeEventListener('tests-published-updated', handleUpdate);
      window.removeEventListener('batch-tests-updated', handleUpdate);
    };
  }, [selectedBatchId, loadCurriculumForBatch]);

  const handleTogglePublish = async (test: MathTest) => {
    const isPublishedInBatch = currentBatchTests.some(
      (t) =>
        t.testId === test.id ||
        (t as any).id === test.id ||
        (t as any).originalTestId === test.id ||
        (t.title && test.title && t.title.trim().toLowerCase() === test.title.trim().toLowerCase())
    );

    if (isPublishedInBatch) {
      // 1. Cleanly delete and unpublish from selected batch (matches by ID, originalTestId, and title)
      deleteBatchTest(selectedBatchId, test.id, test.title);

      showNotification(`"${test.title}" is now unpublished from "${currentBatch.title}".`, 'info');
    } else {
      // 1. Resolve destination chapter in the selected batch
      const targetChapterId = selectedPublishChapterId || currentBatchChapters[0]?.id || null;
      const targetChapterObj = currentBatchChapters.find((c) => c.id === targetChapterId);

      // 2. Publish to batch catalog chunk and bind to target chapter
      const dur = getTestDurationMinutes(test);
      addTestToBatchCatalog({
        testId: test.id,
        batchId: selectedBatchId,
        chapterId: targetChapterId,
        title: test.title,
        topic: test.topic || targetChapterObj?.title || 'General Mathematics',
        difficulty: (test.difficulty as any) || 'medium',
        timeLimitMinutes: dur,
        questionCount: test.questions?.length || (test as any).questionCount || 30,
        passingScorePercentage: test.passingScorePercentage || 40,
      });

      // 3. Sync strictly to batch cloud catalog (batches/{batchId}/tests/{testId})
      await publishTestToBatchCatalog(selectedBatchId, test).catch(() => {});

      const folderName = targetChapterObj?.title ? ` (Folder: ${targetChapterObj.title})` : '';
      showNotification(`"${test.title}" published into "${currentBatch.title}"${folderName}!`, 'info');
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen bg-[#f4f6fa] dark:bg-[#0d0f14] overflow-hidden flex z-30 select-none">
      
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Left Command Rail (Enterprise Academic Admin Sidebar) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-[#16181f] border-r border-slate-200/80 dark:border-zinc-800/80 flex flex-col z-50 lg:z-20 transition-transform duration-300 ease-in-out shrink-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Top: Superadmin Brand Header */}
        <div className="p-4 border-b border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-xs">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold text-[#1f1f1f] dark:text-[#f0f3f8] tracking-tight truncate">
                  Elevate Master
                </h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" title="System Live" />
              </div>
              <p className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] font-mono truncate">
                Superadmin Academic Suite
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 lg:hidden border-none cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Centralized Active Batch Context Card (Single Source of Truth) */}
        <div className="p-3 border-b border-slate-200/60 dark:border-zinc-800/60 shrink-0 bg-slate-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Active Batch Context
            </span>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              {currentBatch.isPublished ? '● Published' : '○ Draft'}
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-[#1e2026] text-xs font-bold text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 outline-none cursor-pointer shadow-xs hover:border-blue-500 transition"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} (₹{b.price})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex items-center gap-2 mt-2 px-1 text-[11px] text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1 font-semibold">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span>{currentBatchEnrollments.length} Students</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-semibold">
              <Award className="w-3.5 h-3.5 text-indigo-500" />
              <span>{currentBatchTests.length} Tests</span>
            </span>
          </div>
        </div>

        {/* Unified Navigation Menu */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 [scrollbar-width:thin]">
          {/* Direct Link to Batches Content View */}
          <div className="p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200">
              <span className="flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Course Content</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono">
                Outside
              </span>
            </div>
            <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-snug">
              Add folders, videos, files and tests directly in the Course Viewer.
            </p>
            {onOpenBatch && (
              <button
                type="button"
                onClick={() => {
                  onBack();
                  onOpenBatch(selectedBatchId);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer border-none"
              >
                <span>Manage Course Content</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Group 1: Academic Operations & Access */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-2 block mb-1">
              Roster & Security
            </span>
            <button
              type="button"
              onClick={() => { setActiveTab('roster'); setIsMobileMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-0 cursor-pointer ${
                activeTab === 'roster'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Student Roster</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-zinc-800 font-mono">
                {currentBatchEnrollments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" />
                <span>Batch Settings & DRM</span>
              </div>
            </button>
          </div>

          {/* Group 2: Intelligence & Assessments */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-2 block mb-1">
              Intelligence & Testing
            </span>
            <button
              type="button"
              onClick={() => { setActiveTab('remedial'); setIsMobileMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-0 cursor-pointer ${
                activeTab === 'remedial'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Adaptive Remedial</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                Auto
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-0 cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <span>Per-Test Analytics</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('publishing'); setIsMobileMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition border-0 cursor-pointer ${
                activeTab === 'publishing'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <span>Publish to Students</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {currentBatchTests.length}/{tests.length}
              </span>
            </button>
          </div>

          {/* Group 3: Storage & Single Instance Architecture */}
          <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-zinc-900/60 border border-slate-200/60 dark:border-zinc-800/60 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Single-Instance Engine</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono leading-tight">
              Tests (~40 KB) • Attempts (~1 KB) • Pointers (&lt;0.5 KB) • 750 KB Bin-Pack Sync
            </p>
          </div>
        </div>

        {/* Sidebar Bottom: Admin Email, Theme & Close */}
        <div className="p-3 border-t border-slate-200/60 dark:border-zinc-800/60 shrink-0 space-y-2 bg-slate-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                {currentUserName || 'Superadmin'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                {currentUserEmail || MASTER_ADMIN_EMAIL}
              </p>
            </div>
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-8 h-8 rounded-full bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 transition shadow-xs"
                title="Toggle Dark/Light Mode"
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[#0b57d0]" />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="w-full py-2 rounded-xl bg-slate-200/70 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border-none transition active:scale-98"
          >
            <X className="w-4 h-4" />
            <span>Exit Master Console</span>
          </button>
        </div>
      </aside>

      {/* Main Right Administrative Workstation */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Sleek Master Command Bar */}
        <header className="h-14 px-3 sm:px-6 bg-white dark:bg-[#16181f] border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 lg:hidden border-none cursor-pointer shrink-0"
              title="Open Navigation Menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Mobile Header Title */}
            <div className="lg:hidden flex items-center gap-1.5 min-w-0">
              <Crown className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-extrabold text-xs sm:text-sm text-[#1f1f1f] dark:text-[#f0f3f8] truncate">
                Master Console
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] font-bold truncate max-w-[110px]">
                {currentBatch.title}
              </span>
            </div>

            {/* Desktop Dynamic Breadcrumbs */}
            <div className="hidden lg:flex items-center space-x-2 text-xs font-bold truncate">
              <span className="text-slate-400 dark:text-zinc-500">Master Console</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0b57d0] dark:text-[#a8c7fa] truncate">{currentBatch.title}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-800 dark:text-zinc-200 capitalize">
                {activeTab === 'roster' && 'Student Roster & Devices'}
                {activeTab === 'settings' && 'Batch Profile & DRM Settings'}
                {activeTab === 'remedial' && 'Adaptive Remedial Engine'}
                {activeTab === 'analytics' && 'Per-Test Performance Analytics'}
                {activeTab === 'publishing' && 'Global Test Publishing Catalog'}
              </span>
            </div>
          </div>

          {/* Right Header: Content Link, Theme Toggle & Exit */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {onOpenBatch && (
              <button
                type="button"
                onClick={() => {
                  onBack();
                  onOpenBatch(selectedBatchId);
                }}
                className="h-8 px-2.5 sm:px-3 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold flex items-center gap-1 cursor-pointer border border-blue-200/60 dark:border-blue-800/40 transition active:scale-95"
                title="Manage Folders and Lectures in Course View"
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Course Content ↗</span>
              </button>
            )}

            {(!auth.currentUser || !auth.currentUser.email) && (
              <button
                type="button"
                onClick={async () => {
                  if (onSignIn) {
                    onSignIn();
                  } else {
                    try {
                      await signInWithGoogle();
                    } catch (e) {
                      console.warn('Google sign in error:', e);
                    }
                  }
                }}
                className="h-8 px-2.5 sm:px-3 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border border-slate-200 dark:border-zinc-700 flex items-center gap-1.5 text-xs font-bold cursor-pointer transition shadow-xs"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer border-none transition text-slate-700 dark:text-zinc-300"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#0b57d0]" />}
              </button>
            )}

            <button
              type="button"
              onClick={onBack}
              className="h-8 px-2.5 sm:px-3 rounded-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer border border-rose-200/60 dark:border-rose-800/40 transition active:scale-95"
              title="Exit Master Console"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </header>

        {/* Mobile Material Design 3 Horizontal Tab Strip */}
        <div className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#16181f] border-b border-slate-200/80 dark:border-zinc-800/80 overflow-x-auto scrollbar-none shrink-0 z-10">
          {[
            { id: 'roster', label: 'Roster', icon: Users, badge: currentBatchEnrollments.length },
            { id: 'remedial', label: 'Remedial', icon: Zap },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'publishing', label: 'Publish', icon: BookOpen, badge: currentBatchTests.length },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as MasterConsoleNavTab)}
                className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer border-0 outline-none ${
                  isActive
                    ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-xs'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#0b57d0] dark:text-[#a8c7fa]' : ''}`} />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-[#0b57d0]/20 text-[#041e49] dark:text-[#c2e7ff]' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global In-App Toast Notification */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 my-2 p-3 bg-white dark:bg-[#16181f] border border-blue-500/30 text-slate-900 dark:text-zinc-100 text-xs font-bold rounded-2xl flex items-center gap-2.5 shadow-md shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
              <span>{notification.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center Viewport */}
        <div className="flex-1 overflow-hidden relative">
          {/* TAB 0: STUDENT ROSTER & DEVICES */}
          {activeTab === 'roster' && (
            <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6 [scrollbar-width:thin]">
              <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
                {/* Header Card */}
                <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3 flex-wrap shadow-xs">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-500" />
                      <span>Enrolled Student Roster ({currentBatchEnrollments.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Batch: <strong>{currentBatch.title}</strong> • Manage active student enrollment, add validity days, or reset single-device locks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddStudentModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-none cursor-pointer flex items-center gap-1.5 shadow-xs transition active:scale-95"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Add Student / User</span>
                  </button>
                </div>

                {/* Batch-Wide Guest Access Policy Banner */}
                <div className="p-4 rounded-2xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3 flex-wrap shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      currentBatch?.allowGuestAccess ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                    }`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                          Guest Mode Policy for this Batch:
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          currentBatch?.allowGuestAccess ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                        }`}>
                          {currentBatch?.allowGuestAccess ? '● Allowed (Free Preview for Visitors)' : '🔒 Restricted (Official Roster Only)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {currentBatch?.allowGuestAccess
                          ? 'Visitors browsing in Guest Mode can view this course without requiring an individual student account.'
                          : 'Visitors in Guest Mode cannot access this course unless admitted by Admin or enrolled.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Allowed to Guest Users:
                    </span>
                    <M3Switch
                      checked={Boolean(currentBatch?.allowGuestAccess)}
                      onChange={handleToggleGuestAccess}
                    />
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search enrolled students by name, email or phone..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-[#16181f] text-xs font-medium text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0] transition shadow-xs"
                  />
                </div>

                {/* Roster Cards (Mobile) & Table (Desktop) */}
                <div className="rounded-2xl overflow-hidden bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 shadow-xs">
                  {/* Mobile Card List for < sm screens */}
                  <div className="sm:hidden divide-y divide-slate-100 dark:divide-zinc-800/60">
                    {filteredEnrollments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                        {currentBatchEnrollments.length === 0 ? 'No students enrolled in this batch yet.' : 'No students matching search.'}
                      </div>
                    ) : (
                      filteredEnrollments.map((enr) => (
                        <div key={enr.id} className="p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900 dark:text-zinc-100">
                              {enr.studentName || 'Student'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                              {enr.status || 'Active'}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                            {enr.studentEmail || enr.studentPhone || 'N/A'}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                              Enrolled: {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : 'Active'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                title="Reset Device Lock (Allows student to register a new phone or laptop upon login)"
                                onClick={() => handleResetDeviceLock(enr.userId, enr.studentName || 'Student')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-none cursor-pointer flex items-center gap-1 active:scale-95"
                              >
                                <Smartphone className="w-3 h-3" />
                                <span>Reset Device</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeEnrollment(enr.userId, enr.studentName || 'Student')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-none cursor-pointer active:scale-95"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Desktop Table View for >= sm screens */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 font-bold text-[11px]">
                        <tr>
                          <th className="py-2.5 px-4">Student</th>
                          <th className="py-2.5 px-3">Contact</th>
                          <th className="py-2.5 px-3">Enrolled At</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium">
                        {filteredEnrollments.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-zinc-400">
                              {currentBatchEnrollments.length === 0 ? 'No students enrolled in this batch yet.' : 'No students matching search.'}
                            </td>
                          </tr>
                        ) : (
                          filteredEnrollments.map((enr) => (
                            <tr key={enr.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                              <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-zinc-100">
                                {enr.studentName || 'Student'}
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                {enr.studentEmail || enr.studentPhone || 'N/A'}
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-zinc-400">
                                {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : 'Active'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                                  {enr.status || 'Active'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex items-center justify-end space-x-1.5">
                                  <button
                                    type="button"
                                    title="Reset Device Lock (Allows student to register a new phone or laptop upon login)"
                                    onClick={() => handleResetDeviceLock(enr.userId, enr.studentName || 'Student')}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-none bg-transparent cursor-pointer flex items-center space-x-1 transition"
                                  >
                                    <Smartphone className="w-3.5 h-3.5" />
                                    <span>Reset Device</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeEnrollment(enr.userId, enr.studentName || 'Student')}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer transition"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BATCH SETTINGS & SECURITY */}
          {activeTab === 'settings' && (
            <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6 [scrollbar-width:thin]">
              <div className="max-w-4xl mx-auto w-full space-y-5 sm:space-y-6">
                {/* Header Card */}
                <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4 flex-wrap shadow-xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                        Batch Global Configuration & Security
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Manage course publication status, student roster rules, pricing, and DRM content protection.
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 shadow-2xs ${
                    currentBatch.isPublished !== false
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}>
                    {currentBatch.isPublished !== false ? (
                      <>
                        <Globe className="w-3.5 h-3.5 text-emerald-600" />
                        <span>● Live & Published</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>🔒 Draft (Locked & Hidden)</span>
                      </>
                    )}
                  </span>
                </div>

                {/* 1. PUBLISH & VISIBILITY STATUS */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 space-y-3 shadow-xs">
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center space-x-1.5">
                      <span>Course Catalog Visibility (Live vs Draft Lock)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      When published, the course is live to students in the catalog. When set to Draft, the entire batch is strictly locked and hidden from learners.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => handleTogglePublishBatch(true)}
                      className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start space-x-3 ${
                        currentBatch.isPublished !== false
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        currentBatch.isPublished !== false ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                      }`}>
                        <Eye className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                            Published (Live to Students)
                          </h4>
                          {currentBatch.isPublished !== false && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                          Visible in All Courses catalog and open to enrolled learners.
                        </p>
                      </div>
                    </div>

                    <div
                      onClick={() => handleTogglePublishBatch(false)}
                      className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start space-x-3 ${
                        currentBatch.isPublished === false
                          ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-amber-500/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        currentBatch.isPublished === false ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                      }`}>
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                            Draft (Locked & Hidden)
                          </h4>
                          {currentBatch.isPublished === false && (
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                          Completely locked for all students and visitors while content is being prepared.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. COMMERCIALS & PRICING */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 space-y-4 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider flex items-center space-x-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-[#0b57d0]" />
                    <span>Commercials & Batch Metadata</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                        Batch Title
                      </label>
                      <input
                        type="text"
                        value={batchTitleInput}
                        onChange={(e) => setBatchTitleInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                        Category
                      </label>
                      <input
                        type="text"
                        value={batchCategoryInput}
                        onChange={(e) => setBatchCategoryInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                        Selling Price (₹)
                      </label>
                      <input
                        type="number"
                        value={batchPrice}
                        onChange={(e) => setBatchPrice(Number(e.target.value))}
                        className="w-full p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                        Original Price (₹)
                      </label>
                      <input
                        type="number"
                        value={batchOriginalPrice}
                        onChange={(e) => setBatchOriginalPrice(Number(e.target.value))}
                        className="w-full p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                        Access Validity (Days)
                      </label>
                      <input
                        type="number"
                        value={batchValidityDays}
                        onChange={(e) => setBatchValidityDays(Number(e.target.value))}
                        className="w-full p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveBatchSettings}
                      className="px-5 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-none cursor-pointer shadow-xs transition active:scale-95"
                    >
                      Save Commercial Settings
                    </button>
                  </div>
                </div>

                {/* 3. CONTENT THEFT PROTECTION & DRM SECURITY CENTER */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800/80 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                        Enterprise Content Protection & DRM Security Center
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center space-x-1">
                      <span>● Active during Videos & Live Tests</span>
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Elevate activates these security barriers strictly when a student is watching a video lecture or attempting a live test.
                  </p>

                  <div className="space-y-3 pt-1">
                    {/* Toggle: Visual DRM Screen Shield */}
                    <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/60">
                      <div className="space-y-0.5 flex-1 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                            Visual DRM Screen Shield (Snipping Tool & Focus Loss Blackout)
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            securitySettings?.enableDrmScreenProtection ? 'bg-emerald-500/15 text-emerald-600' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                          }`}>
                            {securitySettings?.enableDrmScreenProtection ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Instantly blacks out canvas whenever Snipping Tool, PrintScreen, screen recorders, or window focus loss occurs.
                        </p>
                      </div>
                      <M3Switch
                        checked={Boolean(securitySettings?.enableDrmScreenProtection)}
                        onChange={handleToggleDrmShield}
                      />
                    </div>

                    {/* Toggle: Storage Encryption */}
                    <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/60">
                      <div className="space-y-0.5 flex-1 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                            Client Offline Storage Encryption (IndexedDB / Cache)
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            securitySettings?.enableStorageEncryption !== false ? 'bg-emerald-500/15 text-emerald-600' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                          }`}>
                            {securitySettings?.enableStorageEncryption !== false ? 'Encrypted' : 'Standard'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Encrypts question blueprints, study notes, and video tokens before storing in the browser.
                        </p>
                      </div>
                      <M3Switch
                        checked={securitySettings?.enableStorageEncryption !== false}
                        onChange={handleToggleEncryption}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: ADAPTIVE REMEDIAL ENGINE */}
          {activeTab === 'remedial' && (
            <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6 [scrollbar-width:thin]">
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
                              {qCount} Qs • {getTestDurationMinutes(test)}m
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
        </div>
      )}

        {/* ============================================================ */}
        {/* TAB 2: PER-TEST PERFORMANCE ANALYTICS                        */}
        {/* ============================================================ */}
        {activeTab === 'analytics' && (
          <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6 [scrollbar-width:thin]">
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
                      {selectedAnalyticsTest?.questions?.length || 50} Questions • {getTestDurationMinutes(selectedAnalyticsTest)}m time limit
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
                              {qCount} Questions • {getTestDurationMinutes(t)}m
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
        </div>
      )}

        {/* ============================================================ */}
        {/* TAB 3: PUBLISHING & MASTER TEST BANK                         */}
        {/* ============================================================ */}
        {activeTab === 'publishing' && (
          <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6 [scrollbar-width:thin]">
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

                <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                  {currentBatchChapters.length > 0 && (
                    <div className="flex items-center gap-2 bg-[#f0f4f9] dark:bg-[#141619] px-3.5 py-1.5 rounded-full border border-gray-200/60 dark:border-gray-800/60">
                      <Folder className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">Target Folder:</span>
                      <select
                        value={selectedPublishChapterId}
                        onChange={(e) => setSelectedPublishChapterId(e.target.value)}
                        className="text-xs font-semibold bg-transparent border-0 outline-none text-[#1f1f1f] dark:text-[#e3e3e3] cursor-pointer max-w-[160px] truncate"
                      >
                        {currentBatchChapters.map((ch) => (
                          <option key={ch.id} value={ch.id} className="bg-white dark:bg-[#1e2024]">
                            {ch.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="w-full sm:w-64">
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
            </div>

            {/* Test Cards List with One-Click Publish Switch: 2 columns on tablet (md:grid-cols-2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
              {tests
                .filter((t) => t.title.toLowerCase().includes(publishingSearch.toLowerCase()) || (t.topic || '').toLowerCase().includes(publishingSearch.toLowerCase()))
                .map((test) => {
                  const linkedBatchTest = currentBatchTests.find(
                    (t) =>
                      t.testId === test.id ||
                      (t as any).id === test.id ||
                      (t as any).originalTestId === test.id ||
                      (t.title && test.title && t.title.trim().toLowerCase() === test.title.trim().toLowerCase())
                  );
                  const isPublishedInBatch = !!linkedBatchTest;
                  const targetFolder = linkedBatchTest?.chapterId
                    ? currentBatchChapters.find((c) => c.id === linkedBatchTest.chapterId)
                    : currentBatchChapters.find((c) => c.testIds?.includes(test.id));
                  const selectedTargetFolder = currentBatchChapters.find((c) => c.id === selectedPublishChapterId);
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
                          {isPublishedInBatch ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 shrink-0">
                              {targetFolder ? `LIVE • ${targetFolder.title}` : 'LIVE IN BATCH'}
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
                            <span className="leading-none">{getTestDurationMinutes(test)}m</span>
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
                            isPublishedInBatch
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                              : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                          }`}
                        >
                          {isPublishedInBatch ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Live in Batch (Click to Unpublish)</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Insert into {selectedTargetFolder?.title || 'Batch'}</span>
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
        </div>
      )}

      </div>
    </div>

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

      {/* ADD STUDENT / USER MODAL */}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 m3-fade-in">
          <div className="bg-white dark:bg-[#1e2024] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-zinc-800/60">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    Add Student / User to Batch
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[240px]">
                    {currentBatch?.title || 'Selected Course'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStudentModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 border-none bg-transparent cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnrollStudent} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Student Phone Number or Email Address *
                </label>
                <input
                  type="text"
                  required
                  value={studentContactInput}
                  onChange={(e) => setStudentContactInput(e.target.value)}
                  placeholder="e.g. student@gmail.com or +91 98765 43210"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0] font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Student Full Name (Optional)
                </label>
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="e.g. Sanju Student"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Enrollment Validity (Days)
                </label>
                <input
                  type="number"
                  value={studentValidityDays}
                  onChange={(e) => setStudentValidityDays(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 outline-none focus:border-[#0b57d0]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 border-none bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEnrollingStudent}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border-none cursor-pointer shadow-xs transition"
                >
                  {isEnrollingStudent ? 'Enrolling...' : 'Confirm Admission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
