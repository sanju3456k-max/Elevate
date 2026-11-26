---
name: white-label-institute-onboarding
description: >-
  Step-by-step runbook for configuring, probing, building, and verifying a new
  white-label coaching institute under institutes/<slug>/ without affecting
  Elevate Labs (ws_primary). Use when onboarding a new institute, debugging
  tenant Firestore connectivity (5 NOT_FOUND / PERMISSION_DENIED), or rebuilding
  a tenant APK.
---

# White-Label Institute Onboarding & Verification

## Steps

1. **Verify Firebase Project & Firestore Database ID:**
   - Confirm `institutes/<slug>/google-services.json` and `config.json` share the exact `projectId` and `packageName`.
   - Check the Cloud Firestore Database dropdown in Firebase Console. If the database ID is `default` (no parentheses) or a custom name instead of `(default)`, set `"firestoreDatabaseId": "<id>"` inside `firebaseWebConfig` in `institutes/<slug>/config.json`.

2. **Sync Institute Registry & Tenant Config:**
   ```powershell
   node scripts/sync-institutes.mjs
   ```
   Also add the tenant fallback logo entry to `FALLBACK_TENANT_LOGOS` in `src/config/appBrand.ts`.

3. **Build Isolated Tenant Web Bundle & Generate Tenant Rules:**
   - Run `vite build --outDir "dist-tenants/<flavor>"` with `VITE_INSTITUTE_ID`, `VITE_INSTITUTE_NAME`, `VITE_OWNER_EMAIL`, and `VITE_FIREBASE_CONFIG_JSON`.
   - **Important:** Run rules generation **after** Vite build (Vite clears `outDir`):
     ```powershell
     node scripts/generate-tenant-rules.mjs <slug>
     ```
   - Ensure the generated `dist-tenants/<flavor>/firestore.rules` (with that institute's `ownerEmail`) is published in the tenant's Firebase Console.

4. **Configure Google Auth & Cloud Console Branding (Web + Android):**
   - **Firebase Auth:** Enable **Google** provider and add `labselevate.vercel.app` & `localhost` under **Authorized domains**.
   - **Android SHA:** Add release keystore **SHA-1 & SHA-256** in Firebase Project Settings, then download updated `google-services.json` (with `oauth_client`) and add Web `oAuthClientId` to `institutes/<slug>/config.json`.
   - **Google Auth Platform -> Branding:** Fill App name, Support email, Application home page (`https://labselevate.vercel.app/apps/<slug>`), Privacy (`.../privacy`), Terms (`.../terms`), and Authorized domains.
   - **Web OAuth Client:** Add `https://labselevate.vercel.app`, `http://localhost:3000`, `https://<projectId>.firebaseapp.com` to **Authorized JavaScript origins**, and `https://<projectId>.firebaseapp.com/__/auth/handler` (+ vercel/localhost handlers) to **Authorized redirect URIs**.
   - **Audience:** Click **Publish App** (or add admin/testers under **Test users**).

5. **Run Isolated Pre-Flight Probe:**
   - Probe the tenant's Firestore (`getFirestore(app, firestoreDatabaseId)`) to verify `0` `5 NOT_FOUND` errors and `0` `PERMISSION_DENIED` errors on public reads (`batches`, `master_catalog`, `app_storefront`, `test_leaderboards`).
   - Confirm `0` network requests leak to `mock-math-test`.

6. **Build Release APK & Verify Elevate Zero-Regression:**
   ```powershell
   node scripts/build-tenant-apk.mjs <slug> Release
   npm.cmd run build
   npm.cmd run test:bot -- --skip-adb --skip-web --mode=turbo --purge-after
   ```
