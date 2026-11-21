import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { setAppThemeColor } from '../lib/appThemeColor';
import { 
  Play, 
  Clock, 
  Layers, 
  SlidersHorizontal,
  Search, 
  X, 
  BookOpen, 
  ChevronDown, 
  ChevronRight,
  Check,
  FileCode,
  FileCheck2,
  Award,
  TrendingUp,
  Loader2,
  Printer,
  Share2,
  Trophy,
  Sparkles,
  Zap,
  ArrowUpRight,
  Package,
  Calendar,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Target,
  Percent,
  BarChart2,
  Eye,
  RotateCcw,
  Bookmark,
  Info,
  Crown,
  ShieldCheck
} from 'lucide-react';
import type { MathTest, TestAttempt, ActiveTestSession, UserProfile, TestHistoryEntry, AssignedRemedialTest } from '../types';
import { getAllAvailableTopics } from '../utils/topics';
import { isAttemptOmrMode, pruneAttemptsToFirstAndLast } from '../lib/storage';
import { searchCloudTests, getLocalLeaderboardEntries, getCachedFullTest, getSynchronousCachedLeaderboard } from '../lib/firebase';
import { createShareUrlAsync, formatTestShareMessage } from '../utils/shareUtils';
import { getTestDurationMinutes } from '../utils/testFormatConverter';
import type { User } from 'firebase/auth';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { TestReportAnalysisView } from './TestReportAnalysisView';
import { 
  studioStaggerContainer, 
  studioStaggerItem, 
  studioModalVariants, 
  studioDropdownVariants, 
  studioBackdropVariants, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import { M3CircularProgress } from './ui/Material3';
import { M3TestCard } from './ui/M3TestCard';
import { TestDetailModal } from './TestDetailModal';
import { TestLeaderboardModal } from './TestLeaderboardModal';
import { 
  getAssignedRemedialTestsForStudent, 
  materializeRemedialTest, 
  fetchCloudAssignedRemedialTests,
  getMasterDispatchLedger,
  isMasterTest,
  isRemedialTest,
  isGuestUser,
  isDeprecatedTest
} from '../lib/masterAccount';

interface TestListProps {
  tests: MathTest[];
  attempts?: TestAttempt[];
  currentUser: User | null;
  userProfile?: UserProfile | null;
  activeSession?: ActiveTestSession | null;
  activeSessionsMap?: Record<string, ActiveTestSession>;
  onResumeSession?: () => void;
  onStartTest: (test: MathTest, mode: 'timed' | 'practice') => void;
  onStartOmrTest?: (test: MathTest) => void;
  onEditTest: (test: MathTest) => void;
  onDeleteTest: (testId: string) => void;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
  onExportJson?: (test: MathTest, format?: 'txt' | 'json') => void;
  onCreateNew?: () => void;
  onSignIn: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  hasMoreTests?: boolean;
  isLoadingMoreTests?: boolean;
  onLoadMoreTests?: () => void;
  onOpenBulkPrint?: () => void;
  onOpenBatches?: () => void;
}

// Google Material 3 topic tokens and icons resolver
const getTopicM3Tokens = (topic?: string) => {
  const t = (topic || '').toLowerCase();
  if (t.includes('personalized') || t.includes('remedial')) {
    return {
      icon: 'auto_awesome',
      badgeClass: 'bg-[#ffe8d9] text-[#ea580c] dark:bg-[#432313] dark:text-[#ff9d5c]',
      borderClass: 'border-[#ea580c]/40',
      headerBg: 'bg-gradient-to-br from-[#fff7ed] to-[#ffe8d9] dark:from-[#2e1507] dark:to-[#432313]',
      accentColor: '#ea580c',
      tonalBg: '#ffe8d9',
      tonalText: '#ea580c',
      tonalDarkBg: '#432313',
      tonalDarkText: '#ff9d5c',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('algebra') || t.includes('linear')) {
    return {
      icon: 'functions',
      badgeClass: 'bg-[#e8ddff] text-[#21005d] dark:bg-[#381e72] dark:text-[#e8ddff]',
      borderClass: 'border-[#d0bcff]/40',
      headerBg: 'bg-gradient-to-br from-[#f3edff] to-[#e8ddff] dark:from-[#21005d] dark:to-[#381e72]',
      accentColor: '#6750a4',
      tonalBg: '#e8ddff',
      tonalText: '#21005d',
      tonalDarkBg: '#381e72',
      tonalDarkText: '#e8ddff',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('geometry') || t.includes('mensuration') || t.includes('conic')) {
    return {
      icon: 'shapes',
      badgeClass: 'bg-[#c4eed0] text-[#00210f] dark:bg-[#07381a] dark:text-[#c4eed0]',
      borderClass: 'border-[#7edab3]/40',
      headerBg: 'bg-gradient-to-br from-[#e8f8ed] to-[#c4eed0] dark:from-[#00210f] dark:to-[#07381a]',
      accentColor: '#146c2e',
      tonalBg: '#c4eed0',
      tonalText: '#00210f',
      tonalDarkBg: '#07381a',
      tonalDarkText: '#c4eed0',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('calculus') || t.includes('dynamics') || t.includes('statics')) {
    return {
      icon: 'trending_up',
      badgeClass: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
      borderClass: 'border-[#a8c7fa]/40',
      headerBg: 'bg-gradient-to-br from-[#ecf3fe] to-[#d3e3fd] dark:from-[#041e49] dark:to-[#004a77]',
      accentColor: '#0b57d0',
      tonalBg: '#d3e3fd',
      tonalText: '#041e49',
      tonalDarkBg: '#004a77',
      tonalDarkText: '#c2e7ff',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('trigonometry')) {
    return {
      icon: 'change_history',
      badgeClass: 'bg-[#ffd8e4] text-[#31111d] dark:bg-[#492532] dark:text-[#ffd8e4]',
      borderClass: 'border-[#f2b8b5]/40',
      headerBg: 'bg-gradient-to-br from-[#fdf0f4] to-[#ffd8e4] dark:from-[#31111d] dark:to-[#492532]',
      accentColor: '#b3261e',
      tonalBg: '#ffd8e4',
      tonalText: '#31111d',
      tonalDarkBg: '#492532',
      tonalDarkText: '#ffd8e4',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('statistic') || t.includes('probability')) {
    return {
      icon: 'analytics',
      badgeClass: 'bg-[#ffe088] text-[#241a00] dark:bg-[#443200] dark:text-[#ffe088]',
      borderClass: 'border-[#ffba08]/40',
      headerBg: 'bg-gradient-to-br from-[#fef7da] to-[#ffe088] dark:from-[#241a00] dark:to-[#443200]',
      accentColor: '#785900',
      tonalBg: '#ffe088',
      tonalText: '#241a00',
      tonalDarkBg: '#443200',
      tonalDarkText: '#ffe088',
      accentOn: '#ffffff',
    };
  }
  // Default general math
  return {
    icon: 'calculate',
    badgeClass: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
    borderClass: 'border-[#a8c7fa]/40',
    headerBg: 'bg-gradient-to-br from-[#edf2f7] to-[#e1e3e1] dark:from-[#1e2024] dark:to-[#282a30]',
    accentColor: '#0b57d0',
    tonalBg: '#d3e3fd',
    tonalText: '#041e49',
    tonalDarkBg: '#004a77',
    tonalDarkText: '#c2e7ff',
    accentOn: '#ffffff',
  };
};

export const TestList: React.FC<TestListProps> = ({
  tests,
  attempts = [],
  currentUser,
  userProfile,
  activeSession,
  activeSessionsMap,
  onResumeSession,
  onStartTest,
  onStartOmrTest,
  onViewAttemptResult,
  searchQuery: propSearchQuery,
  setSearchQuery: propSetSearchQuery,
  hasMoreTests,
  isLoadingMoreTests,
  onLoadMoreTests,
  onOpenBulkPrint,
  onOpenBatches,
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const setSearchQuery = propSetSearchQuery || setLocalSearchQuery;

  const [selectedTopic, setSelectedTopic] = useState('All Topics');
  const [selectedReportAttempt, setSelectedReportAttempt] = useState<TestAttempt | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isTopicPopupOpen, setIsTopicPopupOpen] = useState(false);
  const [savedTopicsVersion, setSavedTopicsVersion] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTopicPopupOpen(false);
      }
    };
    if (isTopicPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isTopicPopupOpen]);

  // Cloud search results for queries that match tests not yet in the initial loaded batch
  const [cloudSearchResults, setCloudSearchResults] = useState<MathTest[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState<boolean>(false);

  useEffect(() => {
    const handleUpdate = () => {
      setSavedTopicsVersion((v) => v + 1);
    };
    window.addEventListener('custom-topics-updated', handleUpdate);
    return () => window.removeEventListener('custom-topics-updated', handleUpdate);
  }, []);

  // Background read-only search to discover matching unloaded tests from Firestore (ZERO writes)
  useEffect(() => {
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery || cleanQuery.length < 3) {
      setCloudSearchResults([]);
      setIsSearchingCloud(false);
      return;
    }

    // Check if local tests in memory already have adequate matches
    const qLower = cleanQuery.toLowerCase();
    const localMatches = tests.filter((t) => {
      const titleMatch = (t.title || '').toLowerCase().includes(qLower);
      const topicMatch = (t.topic || '').toLowerCase().includes(qLower);
      return titleMatch || topicMatch;
    });

    if (localMatches.length >= 3) {
      setCloudSearchResults([]);
      setIsSearchingCloud(false);
      return;
    }

    setIsSearchingCloud(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCloudTests(cleanQuery, selectedTopic, 15);
        setCloudSearchResults(results);
      } catch (err) {
        console.warn('Cloud search notice:', err);
      } finally {
        setIsSearchingCloud(false);
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedTopic, tests]);

  const availableTopics = useMemo(() => {
    const rawTopics = getAllAvailableTopics(tests);
    return ['All Topics', ...rawTopics.filter((t) => t.toLowerCase() !== 'all topics')];
  }, [tests, savedTopicsVersion]);

  // Selected test for Test Details & Attempt Records Modal
  const [detailedTest, setDetailedTest] = useState<MathTest | null>(null);
  const [isCopiedDetailedTest, setIsCopiedDetailedTest] = useState<boolean>(false);
  const [leaderboardTest, setLeaderboardTest] = useState<MathTest | null>(null);
  const [testRanks, setTestRanks] = useState<Record<string, { rank: number; total?: number }>>({});

  // Adaptive Remedial Tests assigned by Master Enterprise Head
  const [remedialUpdateCounter, setRemedialUpdateCounter] = useState<number>(0);
  useEffect(() => {
    // Reactively refresh when assignments change - do NOT invoke fetchCloud inside event to prevent loops
    const handleUpdate = () => {
      setRemedialUpdateCounter((c) => c + 1);
    };

    window.addEventListener('remedial-tests-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    // Initial fetch from Cloud once on mount (only for authenticated students)
    if (!isGuestUser(currentUser)) {
      fetchCloudAssignedRemedialTests(currentUser?.uid, currentUser?.email)
        .then((cloudAssignments) => {
          if (cloudAssignments && cloudAssignments.length > 0) {
            setRemedialUpdateCounter((c) => c + 1);
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('remedial-tests-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [currentUser?.uid, currentUser?.email]);

  const assignedRemedialTests = useMemo(() => {
    // Strictly disallow guest / anonymous / logged-out users from remedial & personalized tests
    const isGuest = isGuestUser(currentUser);
    if (isGuest) return [];

    const activeUid = (currentUser?.uid || '').trim();
    const activeEmail = (currentUser?.email || '').trim().toLowerCase();
    const emailSlug = activeEmail.replace(/[@.]/g, '_');

    if (!activeUid && !activeEmail) return [];

    // Master Dispatch Ledger lookup for definitive revoked/unassigned status
    const ledger = getMasterDispatchLedger();
    const unassignedSet = new Set(ledger.filter((item) => item.isUnassigned).map((item) => item.id));

    // 1. Direct scoped storage lists for this specific student
    const directSources = [
      ...(activeUid ? getAssignedRemedialTestsForStudent(activeUid) : []),
      ...(activeEmail ? getAssignedRemedialTestsForStudent(activeEmail) : []),
      ...(emailSlug ? getAssignedRemedialTestsForStudent(emailSlug) : []),
    ];

    // 2. Lookup matches in Master Dispatch Ledger specifically targeted to this student
    const ledgerMatches = ledger.filter((item) => {
      if (!item || item.isUnassigned || unassignedSet.has(item.id)) return false;
      const targetId = (item.studentId || '').trim();
      const targetEmail = (item.studentEmail || '').trim().toLowerCase();
      if (activeUid && targetId === activeUid) return true;
      if (activeEmail && (targetId === activeEmail || targetEmail === activeEmail || targetId === emailSlug)) return true;
      return false;
    });

    const seen = new Set<string>();
    const uniqueList: AssignedRemedialTest[] = [];
    [...directSources, ...ledgerMatches].forEach((item) => {
      if (item && item.id && !seen.has(item.id) && !item.isUnassigned && !unassignedSet.has(item.id)) {
        seen.add(item.id);
        uniqueList.push(item);
      }
    });

    return uniqueList;
  }, [currentUser, remedialUpdateCounter]);

  // Materialize assigned personalized tests into full MathTests for display in the main library grid
  const materializedRemedialTests: MathTest[] = useMemo(() => {
    if (isGuestUser(currentUser)) return [];
    return assignedRemedialTests.map((assigned) => {
      const mat = materializeRemedialTest(assigned, tests);
      return {
        ...mat,
        topic: 'Personalized Test',
        isPersonalizedRemedial: true,
        remedialAssignment: assigned,
      };
    });
  }, [assignedRemedialTests, tests, currentUser]);

  const handleLaunchAssignedTest = (assigned: AssignedRemedialTest, mode: 'timed' | 'practice' = 'timed') => {
    const materialized = materializeRemedialTest(assigned, tests);
    onStartTest(materialized, mode);
  };

  const handleLaunchAssignedOmr = (assigned: AssignedRemedialTest) => {
    const materialized = materializeRemedialTest(assigned, tests);
    if (onStartOmrTest) {
      onStartOmrTest(materialized);
    } else {
      onStartTest(materialized, 'timed');
    }
  };

  // Synchronously resolve leaderboard rank for detailed test from local/cached storage (Strictly 0 cloud reads)
  // Cloud leaderboard is only read when the user explicitly clicks the Leaderboard Trophy button.
  useEffect(() => {
    if (!detailedTest || isRemedialTest(detailedTest)) return;
    const key = `${detailedTest.id || ''}:::${detailedTest.title || ''}`;

    try {
      const summary = getSynchronousCachedLeaderboard(detailedTest.id, detailedTest.title, currentUser?.uid);
      if (!summary) return;

      let rank = summary.currentUserRank || summary.currentUserEntry?.rank;
      if (!rank && summary.entries?.length) {
        const currentUid = currentUser?.uid;
        const currentName = currentUser?.displayName;
        const match = summary.entries.find(e => 
          (currentUid && e.userId === currentUid) || 
          (currentName && e.userName && e.userName.toLowerCase() === currentName.toLowerCase())
        );
        if (match?.rank) {
          rank = match.rank;
        }
      }

      if (rank) {
        setTestRanks(prev => ({
          ...prev,
          [key]: {
            rank,
            total: summary.totalParticipants || summary.entries.length
          }
        }));
      }
    } catch {}
  }, [detailedTest, currentUser?.uid, currentUser?.displayName]);

  // Helper to resolve verified leaderboard rank for an attempt card
  const getAttemptRank = (testItem: MathTest, attemptItem: TestAttempt) => {
    const key = `${testItem.id || ''}:::${testItem.title || ''}`;
    if (testRanks[key]) {
      return testRanks[key];
    }
    const entries = getLocalLeaderboardEntries(testItem.id, testItem.title);
    const uid = attemptItem.userId || currentUser?.uid;
    const uname = attemptItem.userName || currentUser?.displayName;
    let list = [...entries];
    const hasMatch = list.some(e => (uid && e.userId === uid) || (uname && e.userName === uname));
    if (!hasMatch && attemptItem.score !== undefined) {
      list.push({
        userId: uid || 'current',
        userName: uname || 'Learner',
        score: attemptItem.score,
        timeSpentSeconds: attemptItem.timeSpentSeconds || 0,
      } as any);
    }
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
    });
    const matchIdx = list.findIndex(e => (uid && e.userId === uid) || (uname && e.userName === uname));
    if (matchIdx >= 0) {
      return { rank: matchIdx + 1, total: list.length };
    }
    return null;
  };

  const handleShareDetailedTest = async (e: React.MouseEvent, testToShare: MathTest) => {
    e.stopPropagation();
    try {
      const shareUrl = await createShareUrlAsync(testToShare);
      const shareMessage = formatTestShareMessage(testToShare.title, shareUrl);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setIsCopiedDetailedTest(true);
      setTimeout(() => setIsCopiedDetailedTest(false), 2000);
    } catch (err) {
      console.warn('Failed to copy share URL:', err);
    }
  };

  // Lock body scroll strictly when full page modal is open
  useScrollLock(!!detailedTest);

  // System navigation back gesture & button handling for modals
  useBackHandler({
    isOpen: !!detailedTest,
    onBack: () => setDetailedTest(null),
    priority: 30,
    id: 'test_details_modal',
  });

  // Synchronize status bar theme-color for Detailed Test overlay to match page body (#e5e9f0 light / #0b0c10 dark)
  useEffect(() => {
    if (!detailedTest) return;
    const isDark = document.documentElement.classList.contains('dark');
    const targetColor = isDark ? '#0b0c10' : '#e5e9f0';
    setAppThemeColor(targetColor);
  }, [detailedTest]);

  // Group attempts by testId, normalized test identifier, and test title
  const attemptsByTestId = useMemo(() => {
    const map = new Map<string, TestAttempt[]>();
    attempts.forEach((att) => {
      if (!att) return;
      if (att.testId) {
        const list = map.get(att.testId) || [];
        list.push(att);
        map.set(att.testId, list);

        const normId = att.testId.replace(/[-_]/g, '').toLowerCase();
        if (normId !== att.testId) {
          const normList = map.get(normId) || [];
          normList.push(att);
          map.set(normId, normList);
        }
      }
      if (att.testTitle) {
        const titleKey = `title:${att.testTitle.trim().toLowerCase()}`;
        const titleList = map.get(titleKey) || [];
        titleList.push(att);
        map.set(titleKey, titleList);
      }
    });

    map.forEach((list) => {
      list.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());
    });
    return map;
  }, [attempts]);

  // Comprehensive resolver for a test's attempts ensuring local and cloud sources sync immediately
  const getTestAttempts = (test: MathTest | null): TestAttempt[] => {
    if (!test) return [];

    // 1. Primary Cross-Device Source: userProfile.testHistories
    let cloudHistoryEntry: TestHistoryEntry | null = null;
    if (userProfile?.testHistories) {
      const safeKey = (test.id || '').replace(/[./[\]*~#$]/g, '_');
      if (userProfile.testHistories[safeKey]) {
        cloudHistoryEntry = userProfile.testHistories[safeKey];
      } else if (userProfile.testHistories[test.id]) {
        cloudHistoryEntry = userProfile.testHistories[test.id];
      } else {
        const historiesList = (Object.values(userProfile.testHistories) as (TestHistoryEntry | undefined)[]) || [];
        const found = historiesList.find((e): e is TestHistoryEntry => {
          if (!e) return false;
          if (e.testId === test.id) return true;
          if (e.testTitle && test.title && e.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase()) return true;
          return false;
        });
        if (found) cloudHistoryEntry = found;
      }
    }

    // 2. Query pre-indexed maps
    const directMatches = attemptsByTestId.get(test.id) || [];
    const normId = test.id ? test.id.replace(/[-_]/g, '').toLowerCase() : '';
    const normMatches = normId ? attemptsByTestId.get(normId) || [] : [];
    const titleKey = test.title ? `title:${test.title.trim().toLowerCase()}` : '';
    const titleMatches = titleKey ? attemptsByTestId.get(titleKey) || [] : [];

    const fallbackMatches = (attempts || []).filter((att) => {
      if (!att) return false;
      const attId = (att.testId || '').trim();
      const attNormId = attId.replace(/[-_]/g, '').toLowerCase();
      if (attId && test.id && (attId === test.id || attNormId === normId)) return true;
      if (att.testTitle && test.title && att.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase()) return true;
      return false;
    });

    // Combine and deduplicate
    const combinedMap = new Map<string, TestAttempt>();
    if (cloudHistoryEntry?.firstAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.firstAttempt.id, cloudHistoryEntry.firstAttempt);
    }
    if (cloudHistoryEntry?.lastAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.lastAttempt.id, cloudHistoryEntry.lastAttempt);
    }

    [...directMatches, ...normMatches, ...titleMatches, ...fallbackMatches].forEach((att) => {
      if (att && att.id && !combinedMap.has(att.id)) {
        combinedMap.set(att.id, att);
      }
    });

    const list = Array.from(combinedMap.values());
    const { pruned } = pruneAttemptsToFirstAndLast(list);
    pruned.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());
    return pruned;
  };

  // Check if test was created within the last 2 days (48 hours) and has not been attempted yet
  const isTestNew = (test: MathTest): boolean => {
    if (!test) return false;
    if ((test as any).isNew) return true;
    const rawDate = test.createdAt || (test as any).timestamp;
    if (!rawDate) return false;
    const createdTime = new Date(rawDate).getTime();
    if (isNaN(createdTime) || createdTime <= 0) return false;
    const now = Date.now();
    const diffMs = now - createdTime;
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    // Must be created within the past 2 days (48 hours)
    if (diffMs < 0 || diffMs > TWO_DAYS) return false;

    // If user has already attempted this test, do not show 'New' banner
    const testAttempts = getTestAttempts(test);
    if (testAttempts.length > 0) return false;
    if (((test as any).attemptCount || 0) > 0) return false;

    return true;
  };

  const filteredTests = useMemo(() => {
    const seenIds = new Set<string>();
    const allCandidates = [...materializedRemedialTests, ...tests, ...cloudSearchResults];
    const cleanSearch = searchQuery.trim().toLowerCase();
    const cleanTopic = selectedTopic.trim().toLowerCase();

    const isGuest = isGuestUser(currentUser);

    const list = allCandidates.filter((test) => {
      if (!test || !test.id) return false;
      if (isDeprecatedTest(test)) return false;
      if (seenIds.has(test.id)) return false;
      seenIds.add(test.id);

      // Remedial personalized tests are student-specific, but all published Master tests are open
      if (isGuest && isRemedialTest(test)) {
        return false;
      }

      const matchesSearch = 
        cleanSearch === '' ||
        (test.title || '').toLowerCase().includes(cleanSearch) ||
        (test.topic || '').toLowerCase().includes(cleanSearch) ||
        (test.description || '').toLowerCase().includes(cleanSearch);

      const matchesTopic = 
        cleanTopic === 'all topics' || 
        (test.topic || '').toLowerCase() === cleanTopic;

      return matchesSearch && matchesTopic;
    });

    return [...list].sort((a, b) => {
      if ((a as any).isPersonalizedRemedial && !(b as any).isPersonalizedRemedial) return -1;
      if (!(a as any).isPersonalizedRemedial && (b as any).isPersonalizedRemedial) return 1;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [materializedRemedialTests, tests, cloudSearchResults, searchQuery, selectedTopic, currentUser]);

  if (selectedReportAttempt) {
    const targetTest = tests.find((t) => (t && t.id && t.id === selectedReportAttempt.testId) || (t && t.title && t.title === selectedReportAttempt.testTitle)) || detailedTest || undefined;
    const testAtts = targetTest ? getTestAttempts(targetTest) : [];
    const sortedAtts = [...testAtts].sort((a, b) => {
      const timeA = new Date(a.completedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.completedAt || b.createdAt || 0).getTime();
      return timeA - timeB;
    });
    const isFirst = sortedAtts.length <= 1 || sortedAtts[0]?.id === selectedReportAttempt.id;

    return (
      <TestReportAnalysisView
        attempt={selectedReportAttempt}
        test={targetTest}
        allTests={tests}
        isFirstAttempt={isFirst}
        onClose={() => setSelectedReportAttempt(null)}
        onRetakeTest={(testId) => {
          const t = tests.find((item) => item.id === testId);
          if (t && onStartTest) onStartTest(t, 'timed');
        }}
        onViewRawSolutions={onViewAttemptResult}
      />
    );
  }

  return (
    <div className="w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 pt-1 sm:pt-2 pb-28 sm:pb-28 md:pb-16 space-y-2.5 sm:space-y-3">
      {/* Google Material 3 Search & Filter Controls Header */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* ROW 1: All Topics Button (left) + Tests Available Count immediately to its right & Search on far right */}
        <div className="flex items-center justify-between gap-2.5">
          {/* Left Container: All Topics Button + Tests Available Count immediately to its right */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Simple Topic Dropdown Button (Without Grid Icon) */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                id="topic-dropdown-trigger-btn"
                onClick={() => setIsTopicPopupOpen(!isTopicPopupOpen)}
                className="inline-flex items-center gap-2 h-9 px-3.5 sm:px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] text-xs font-semibold cursor-pointer select-none transition-all duration-200 active:scale-98 outline-none relative overflow-hidden group"
              >
                <md-ripple />
                <span className="truncate max-w-[140px] sm:max-w-[220px] text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors">
                  {selectedTopic}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0 transition-transform duration-200 ${isTopicPopupOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Card Menu */}
              <AnimatePresence>
                {isTopicPopupOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white dark:bg-[#1e2024] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.65)] rounded-[24px] p-2 z-50 [scrollbar-width:thin]"
                  >
                    {availableTopics.map((topic) => {
                      const isSelected = selectedTopic === topic;
                      const topicTokens = getTopicM3Tokens(topic === 'All Topics' ? '' : topic);
                      const chipIcon = topic === 'All Topics' ? 'apps' : topicTokens.icon;
                      return (
                        <button
                          key={topic}
                          onClick={() => {
                            setSelectedTopic(topic);
                            setIsTopicPopupOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-xs text-left rounded-[20px] flex items-center justify-between gap-2.5 transition-all duration-150 cursor-pointer border-0 outline-none select-none relative overflow-hidden my-0.5 ${
                            isSelected
                              ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold shadow-xs'
                              : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] font-semibold'
                          }`}
                        >
                          <md-ripple />
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-[18px] shrink-0" style={{ color: isSelected ? undefined : topicTokens.accentColor }}>
                              {chipIcon}
                            </span>
                            <span className="truncate">{topic}</span>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#041e49] dark:text-[#c2e7ff] shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Test Numbers Count shifted immediately to the right of All Topics button */}
            <div className="flex items-center gap-1.5 select-none text-[12px] sm:text-[12.5px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">
              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{filteredTests.length}</span>
              <span>{filteredTests.length === 1 ? 'Test available' : 'Tests available'}</span>
            </div>
          </div>

          {/* Right: Search Toggle & Grid/List Toggle Button all in one row */}
          <div className="flex items-center gap-2 min-w-0 justify-end">
            {isSearchExpanded || searchQuery ? (
              <motion.div 
                initial={{ width: 40, opacity: 0 }}
                animate={{ width: '100%', opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative flex-1 max-w-xs sm:max-w-md"
              >
                <div className="h-9 w-full rounded-full bg-white dark:bg-[#1e2024] flex items-center px-3 gap-2 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all">
                  <span className="material-symbols-outlined text-[#0b57d0] dark:text-[#a8c7fa] text-[17px] shrink-0 select-none">
                    search
                  </span>
                  <input
                    id="m3-main-search-input"
                    type="text"
                    autoFocus
                    placeholder="Search mock tests, topics, or formulas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#444746]/70 dark:placeholder-[#9aa0a6]/70 border-0 outline-none focus:ring-0 font-normal"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchExpanded(false);
                    }}
                    title="Close Search"
                    className="w-6 h-6 rounded-full hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center text-[#5e5e5e] dark:text-[#9aa0a6] cursor-pointer shrink-0 transition-colors border-0 outline-none"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <button
                id="search-icon-toggle-btn"
                type="button"
                onClick={() => setIsSearchExpanded(true)}
                title="Search Tests"
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0"
              >
                <span className="material-symbols-outlined text-[17px]">search</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Indicator */}
        {isSearchingCloud && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] text-[11px] font-semibold border-0 ring-0">
              <M3CircularProgress size={13} fourColor={true} className="shrink-0" />
              <span>Searching cloud...</span>
            </div>
          </div>
        )}
      </div>

      {/* Tests Grid/List: Minor Tone Effect Google Material 3 Cards */}
      {filteredTests.length === 0 ? (
        isSearchingCloud ? (
          <div className="text-center py-20 px-4 bg-[#f8fafd] dark:bg-[#1a1d22] rounded-[24px] space-y-3.5 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            <div className="w-12 h-12 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border-0 shadow-none">
              <M3CircularProgress size={28} fourColor={true} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Searching cloud library...</h3>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto">
              Checking cloud tests for matching keywords and topics.
            </p>
          </div>
        ) : (
          <div className="text-center py-20 px-4 bg-[#f8fafd] dark:bg-[#1a1d22] rounded-[24px] space-y-3.5 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            <div className="w-12 h-12 rounded-full bg-[#edf2f8] dark:bg-[#25282f] text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center justify-center mx-auto border-0 shadow-none">
              <BookOpen className="w-5 h-5 stroke-[2.2]" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              {searchQuery ? `No mock tests found matching "${searchQuery}"` : 'No matching mock tests'}
            </h3>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto">
              {searchQuery 
                ? 'We checked all local and cloud tests. Try searching with different keywords or clearing your filters.' 
                : 'Try adjusting your search keywords or topic filter.'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
              {(searchQuery || selectedTopic !== 'All Topics') && (
                <md-filled-tonal-button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTopic('All Topics');
                  }}
                  style={{ '--md-filled-tonal-button-container-shape': '9999px' } as React.CSSProperties}
                >
                  Reset Filters
                </md-filled-tonal-button>
              )}
            </div>
          </div>
        )
      ) : (
        /* Unified Responsive Test Cards Grid (Title always in 1st row, Qs & Time always in bottom row) */
        <motion.div 
          variants={studioStaggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3"
        >
          {filteredTests.map((test, index) => (
            <M3TestCard
              key={test.id ? `test-card-${test.id}-${index}` : `test-card-index-${index}`}
              test={test}
              attempts={attempts}
              index={index}
              onClick={() => setDetailedTest(test)}
            />
          ))}
        </motion.div>
      )}

      {/* On-Demand Paginated "Load More Tests" Control with Tonal Style */}
      {hasMoreTests && onLoadMoreTests && (
        <div className="pt-3 pb-1 text-center">
          <md-filled-tonal-button
            id="load-more-tests-btn"
            onClick={() => onLoadMoreTests()}
            disabled={isLoadingMoreTests}
            style={{ '--md-filled-tonal-button-container-shape': '9999px' } as React.CSSProperties}
          >
            {isLoadingMoreTests ? (
              <>
                <M3CircularProgress size={16} fourColor={true} className="mr-2" slot="icon" />
                <span>Loading more tests...</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5 mr-1.5" slot="icon" />
                <span>Load more tests (+10)</span>
              </>
            )}
          </md-filled-tonal-button>
        </div>
      )}

      {/* DETAILED TEST & ATTEMPT RECORDS MODAL */}
      <TestDetailModal
        test={detailedTest}
        onClose={() => setDetailedTest(null)}
        attempts={attempts}
        userProfile={userProfile}
        currentUser={currentUser}
        allTests={tests}
        onStartTest={onStartTest}
        onStartOmrTest={onStartOmrTest}
        onViewAttemptResult={onViewAttemptResult}
      />

      {/* Test Leaderboard Modal */}
      <TestLeaderboardModal
        isOpen={!!leaderboardTest}
        test={leaderboardTest}
        currentUser={currentUser}
        onClose={() => setLeaderboardTest(null)}
      />
    </div>
  );
};
