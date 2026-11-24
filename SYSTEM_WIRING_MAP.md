# System Wiring Map (Electric Meter Box Chart)

This document maps every major feature circuit, configuration hub, Firestore collection, and `localStorage` key in the codebase so new features never accidentally break existing ones.

---

## 1. Central Control Room (Config & MCB)
| Module | File Path | Purpose |
| :--- | :--- | :--- |
| **Feature Switches (MCB)** | `src/config/featureSwitches.ts` | ON/OFF circuit breakers for new/experimental features |
| **App Config & Storage Registry** | `src/config/appConfig.ts` | Canonical `STORAGE_KEYS`, `FIRESTORE_COLLECTIONS`, optimization settings, and safe fallback readers |
| **Antigravity Rules** | `GEMINI.md` | Always-on engineering & safety rules for AI sessions |

---

## 2. Core Power Lines (Shared Foundation — Edit with Care)
| Circuit | Primary Files | Responsibility |
| :--- | :--- | :--- |
| **App Root & Routing** | `src/App.tsx`, `src/main.tsx` | Top-level view state, navigation, auth guards, persistent player |
| **LMS & Cloud Context** | `src/lms/LmsContext.tsx` | Batches, enrollments, announcements, guest policy, live Firestore listeners |
| **Firebase & Auth** | `src/lib/firebase.ts`, `src/lib/masterAccount.ts`, `src/lib/deviceAuthService.ts` | Firebase initialization, master account detection, device auth binding |
| **Shared Types** | `src/types.ts`, `src/types/` | Core TypeScript contracts (`MathTest`, `Batch`, `Attempt`, etc.) |
| **Sync & Cache Layer** | `src/lib/syncEngine.ts`, `src/lib/documentCache.ts`, `src/lib/listenerManager.ts`, `src/lib/smartLocalCoordinator.ts`, `src/lib/reconciliationEngine.ts` | Offline-first storage, Firestore read optimization, listener deduplication |

---

## 3. Isolated Feature Circuits (Separate Rooms)
| Feature | Entry / UI Files | Supporting Libs / Engines |
| :--- | :--- | :--- |
| **Home Dashboard & Banners** | `src/components/home/HomeDashboard.tsx` | `src/lib/bannerTemplates.ts` |
| **Course Batches & LMS** | `src/components/lms/` | `src/lib/batchCloudSync.ts`, `src/lms/LmsContext.tsx`, `src/lms/documentMetadataService.ts` |
| **Test Creator Studio** | `src/components/TestEditor.tsx`, `src/components/EditorDiagramResizable.tsx`, `src/components/DiagramCropModal.tsx` | `src/lib/questionCatalogService.ts` |
| **Custom Test Builder & Dynamic Math** | `src/components/CustomTestBuilder.tsx` | `src/lib/dynamicMathEngine/`, `src/lib/mathPipeline/` |
| **Test Runner & Attempts** | `src/components/TestRunner.tsx`, `src/components/AttemptModeModal.tsx`, `src/components/ResumeTestModal.tsx` | `src/lib/storage.ts`, `src/lib/indexedDbStorage.ts` |
| **Results, Analysis & Leaderboard** | `src/components/TestResultView.tsx`, `src/components/TestReportAnalysisView.tsx`, `src/components/PerformanceAnalytics.tsx`, `src/components/TestLeaderboardModal.tsx`, `src/components/CohortAnalyticsVisualDashboard.tsx` | `src/lib/studentAnalyticsService.ts` |
| **OMR Exam Studio** | `src/components/OmrExamStudio.tsx`, `src/components/omr/`, `src/components/OmrCropModal.tsx`, `src/components/OmrSheetGenerator.tsx` | `src/lib/omrScannerEngine.ts`, `src/lib/omrAutoCropper.ts`, `src/lib/omrLiveDetector.ts`, `src/lib/omrPerspectiveWarp.ts` |
| **Master Console & Admin** | `src/components/MasterConsoleView.tsx`, `src/components/admin/` | `src/lib/firestoreTelemetry.ts`, `src/lib/firestoreDocSizeValidator.ts` |
| **Gemini AI Chat & Canvas** | `src/components/GeminiChatbotView.tsx`, `src/components/geminiChat/` | `src/lib/geminiClientService.ts`, `src/lib/geminiChatSyncManager.ts`, `src/lib/geminiSpeechEngine.ts` |
| **Notes & HTML Studios** | `src/components/NotesRepositoryView.tsx`, `src/components/notesStudio/`, `src/components/HtmlNotesStudio.tsx`, `src/components/htmlNotes/` | `src/lib/idbNotes.ts`, `src/lib/htmlNotesCloudSyncEngine.ts`, `src/lib/htmlNotesDriveSync.ts`, `src/lib/notesManifestCoordinator.ts` |

---

## 4. Firestore Collections Registry
Top-level collections currently wired across `src/`:
- `attempts`
- `batch_enrollments`
- `batches`
- `device_reset_requests`
- `test_leaderboards`
- `tests`
- `users`

---

## 5. `localStorage` Keys Registry
Grouped by domain (never reuse or overwrite these without a fallback migration):

- **Auth & Device**: `elevatelabs_auth_profile`, `elevatelabs_user_v2`, `mockmc_had_google_auth`, `mockmc_device_id_v1`, `elevate_test_enforce_android_guard`, `ELEVATE_GUEST_ACCESS_MODE`, `elevate_native_notif_granted`
- **Batches & LMS**: `elevatelabs_batches_v2`, `elevatelabs_batch_tests_v2`, `elevatelabs_cloud_batches_cache`, `elevatelabs_enrollments_v2`, `elevatelabs_guest_enrollments`, `math_mock_batches_cache`, `math_mock_batches_cache_time`, `math_mock_lms_batch_tests`, `math_mock_selected_batch_id`
- **Tests & Attempts**: `math_mock_tests`, `math_mock_attempts`, `master_published_test_ids`
- **Notes & Drive**: `mockmc_saved_notes`, `mockmc_saved_notes_guest`, `mockmc_saved_notes_permanent`, `mockmc_html_notes_v2`, `mockmc_notes_manifest_doc_v1`, `mockmc_canonical_notes_studio_folder_id`, `elevate_canonical_root_folder_id`
- **AI / Gemini**: `elevate_gemini_api_key`, `gemini_api_key`, `gemini_chat_sessions_v1`, `gemini_chat_sessions_v2`, `gemini_chat_sessions_v3`, `gemini_user_settings_v1`, `theta_initial_prompt_pending`
- **UI & Preferences**: `math_mock_theme_v1`, `mockmc_ui_scale_config`, `elevate_mc_sidebar_collapsed`, `elevate_video_quality`, `mockmc_firebase_active_project_id`
