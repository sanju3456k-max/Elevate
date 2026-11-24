# Project Architecture & Development Rules (Elevate / Math Mock Test Practice)

These workspace rules are automatically active in Antigravity for every session in this repository. Follow them strictly to keep existing features stable while building new ones.

## 1. Electric Meter Box (MCB) Architecture
- **Check the Wiring Map first**: Before modifying major features, storage keys, or Firestore collections, consult [`SYSTEM_WIRING_MAP.md`](./SYSTEM_WIRING_MAP.md).
- **Isolate New Features (No Monolith Bloat)**: Do NOT pack large new features directly into existing giant files (`src/components/TestEditor.tsx`, `src/components/home/HomeDashboard.tsx`, `src/components/OmrExamStudio.tsx`, `src/lms/LmsContext.tsx`). Create dedicated modules/components/hooks for new functionality and connect them cleanly with minimal, well-typed integration points.
- **Use MCB Feature Switches**: Gate major new experimental or creative features behind boolean flags in [`src/config/featureSwitches.ts`](./src/config/featureSwitches.ts) so they can be toggled off cleanly without breaking the existing experience.

## 2. Firebase & LocalStorage Data Safety (Zero Data Loss)
- **Central Config & Registry**: Register any new `localStorage` keys, Firestore collections, cache TTLs, or sync intervals in [`src/config/appConfig.ts`](./src/config/appConfig.ts) and update [`SYSTEM_WIRING_MAP.md`](./SYSTEM_WIRING_MAP.md).
- **Backward-Compatible Migrations Only**: NEVER rename, delete, or change the shape of an existing `localStorage` key or Firestore document field without keeping a read fallback / migration bridge (e.g., `safeReadStorageWithFallback` in `src/config/appConfig.ts`) so existing student/master data is never lost.
- **No Unbounded Reads/Listeners**: When optimizing Firebase, use existing cache/coordination helpers (`src/lib/documentCache.ts`, `src/lib/listenerManager.ts`, `src/lib/smartLocalCoordinator.ts`) rather than adding duplicate raw `onSnapshot` listeners.

## 3. Mandatory Pre-Flight Checks
- After any TypeScript/React code change, ALWAYS run:
  1. `npx tsc --noEmit --skipLibCheck` (catches missing imports like `useMemo` and type mismatches before runtime)
  2. `npx vite build` (verifies production bundle)
- Never report a build as clean if either command fails.

## 4. Local-First & Deployment Guardrail
- Keep all edits and builds **strictly local** unless the user explicitly instructs to push to GitHub (`git push`) or sync/deploy to the Android app (`npx cap sync`, APK build/install).
