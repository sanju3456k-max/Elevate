/**
 * Central App Configuration & Storage Control Room
 * ------------------------------------------------
 * Single source of truth for Firestore collections, localStorage keys,
 * caching/sync tuning parameters, and backward-compatible storage helpers.
 */

export const FIRESTORE_COLLECTIONS = {
  ATTEMPTS: 'attempts',
  BATCH_ENROLLMENTS: 'batch_enrollments',
  BATCHES: 'batches',
  DEVICE_RESET_REQUESTS: 'device_reset_requests',
  TEST_LEADERBOARDS: 'test_leaderboards',
  TESTS: 'tests',
  USERS: 'users',
} as const;

export const STORAGE_KEYS = {
  // Auth & Device
  AUTH_PROFILE: 'elevatelabs_auth_profile',
  USER_V2: 'elevatelabs_user_v2',
  HAD_GOOGLE_AUTH: 'mockmc_had_google_auth',
  DEVICE_ID_V1: 'mockmc_device_id_v1',
  ENFORCE_ANDROID_GUARD: 'elevate_test_enforce_android_guard',
  GUEST_ACCESS_MODE: 'ELEVATE_GUEST_ACCESS_MODE',
  NATIVE_NOTIF_GRANTED: 'elevate_native_notif_granted',

  // Batches & LMS
  BATCHES_V2: 'elevatelabs_batches_v2',
  BATCH_TESTS_V2: 'elevatelabs_batch_tests_v2',
  CLOUD_BATCHES_CACHE: 'elevatelabs_cloud_batches_cache',
  ENROLLMENTS_V2: 'elevatelabs_enrollments_v2',
  GUEST_ENROLLMENTS: 'elevatelabs_guest_enrollments',
  MOCK_BATCHES_CACHE: 'math_mock_batches_cache',
  MOCK_BATCHES_CACHE_TIME: 'math_mock_batches_cache_time',
  MOCK_LMS_BATCH_TESTS: 'math_mock_lms_batch_tests',
  SELECTED_BATCH_ID: 'math_mock_selected_batch_id',

  // Tests & Attempts
  TESTS: 'math_mock_tests',
  ATTEMPTS: 'math_mock_attempts',
  MASTER_PUBLISHED_TEST_IDS: 'master_published_test_ids',

  // Notes & Drive
  SAVED_NOTES: 'mockmc_saved_notes',
  SAVED_NOTES_GUEST: 'mockmc_saved_notes_guest',
  SAVED_NOTES_PERMANENT: 'mockmc_saved_notes_permanent',
  HTML_NOTES_V2: 'mockmc_html_notes_v2',
  NOTES_MANIFEST_DOC_V1: 'mockmc_notes_manifest_doc_v1',
  CANONICAL_NOTES_FOLDER_ID: 'mockmc_canonical_notes_studio_folder_id',
  CANONICAL_ROOT_FOLDER_ID: 'elevate_canonical_root_folder_id',

  // AI / Gemini
  ELEVATE_GEMINI_API_KEY: 'elevate_gemini_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  GEMINI_CHAT_SESSIONS_V1: 'gemini_chat_sessions_v1',
  GEMINI_CHAT_SESSIONS_V2: 'gemini_chat_sessions_v2',
  GEMINI_CHAT_SESSIONS_V3: 'gemini_chat_sessions_v3',
  GEMINI_USER_SETTINGS_V1: 'gemini_user_settings_v1',
  THETA_INITIAL_PROMPT_PENDING: 'theta_initial_prompt_pending',

  // UI & Preferences
  THEME_V1: 'math_mock_theme_v1',
  UI_SCALE_CONFIG: 'mockmc_ui_scale_config',
  MC_SIDEBAR_COLLAPSED: 'elevate_mc_sidebar_collapsed',
  VIDEO_QUALITY: 'elevate_video_quality',
  ACTIVE_FIREBASE_PROJECT_ID: 'mockmc_firebase_active_project_id',
} as const;

/**
 * Centralized optimization knobs for Firebase & LocalStorage.
 * Adjust cache lifetimes and sync limits here without touching feature code.
 */
export const APP_OPTIMIZATION_CONFIG = {
  /** Default local cache freshness window for batches (ms) */
  BATCH_CACHE_TTL_MS: 5 * 60 * 1000,
  /** Minimum delay between background cloud sync writes (ms) */
  CLOUD_SYNC_DEBOUNCE_MS: 1500,
  /** Soft upper limit for single Firestore document payload size (bytes) */
  FIRESTORE_SAFE_DOC_BYTES: 900 * 1024,
  /** Current local data schema version tag */
  DATA_SCHEMA_VERSION: 2,
} as const;

/**
 * Zero-Data-Loss Migration Helper:
 * Reads from `primaryKey`. If missing, checks `legacyKeys` in order,
 * returns the found value, and silently copies it into `primaryKey`
 * without deleting legacy data.
 */
export function safeReadStorageWithFallback(
  primaryKey: string,
  legacyKeys: readonly string[] = []
): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const primary = window.localStorage.getItem(primaryKey);
    if (primary !== null) return primary;

    for (const legacyKey of legacyKeys) {
      const legacyVal = window.localStorage.getItem(legacyKey);
      if (legacyVal !== null) {
        try {
          window.localStorage.setItem(primaryKey, legacyVal);
        } catch {
          // Ignore quota errors during background copy
        }
        return legacyVal;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

/**
 * JSON variant of `safeReadStorageWithFallback` with safe parse fallback.
 */
export function safeReadJsonWithFallback<T>(
  primaryKey: string,
  legacyKeys: readonly string[],
  defaultValue: T
): T {
  const raw = safeReadStorageWithFallback(primaryKey, legacyKeys);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}
