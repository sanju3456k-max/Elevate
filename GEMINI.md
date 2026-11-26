# Elevate & Multi-Institute Guardrails

- **Web vs Native APK Access:** On Web (`!isNativeAndroid() && !APP_BRAND.isLockedApk`), Guest Mode is strictly disabled and only verified Institute Admins / Master Console users (`isMasterUser`) may enter the Web App. Non-admins and students must be routed to `/apps/<slug>`. Keep Guest Mode enabled only inside native Android APKs.
- **Dynamic Tenant Scoping:** Never hardcode `'ws_primary'` or `'sanju3456k@gmail.com'` in runtime Firestore writes (`publishMasterTest`, `addBatch`, `addAnnouncement`). Always resolve via `getActiveAppInstituteIdOrPrimary()` and `APP_BRAND.ownerEmail`.
- **Non-Destructive Cloud Fallback:** Never overwrite locally created custom batches in `LmsContext` with the `INITIAL_BATCHES` (`batch_testing_01`) fallback when Firestore reads fail or return empty.
- **Tenant Isolation in Testing:** Always test new institutes against an isolated Vite output (`dist-tenants/<flavor>`) and their own `firebaseWebConfig`. Never modify or run destructive probes against Elevate's `mock-math-test` / `ws_primary`.
- **Database ID Accuracy:** Always verify whether a tenant's Firebase project uses `(default)` or a named Firestore database ID (such as `default` without parentheses) and declare `firestoreDatabaseId` in `institutes/<slug>/config.json` when non-`(default)`.
