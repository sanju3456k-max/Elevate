# White-Label Multi-Institute Rules & Playbook

## Primary vs. Secondary Architecture
- **Elevate (`src/` + `android/app/src/elevatePrimary/` + `dist/`)** is the single primary codebase.
- **Secondary Institutes (`android/tenants/<slug>/` + `src/config/institutesRegistry.ts`)** share 100% of the exact same React UI, components, and logic — differing only in App Name, App Logo, `applicationId`, `google-services.json`, `firebase-web-config.json`, and `ownerEmail`.

## Rules for All Code Changes
1. **Never hardcode `"Elevate"` or `./assets/preplens-icon.svg` in user-facing UI.**
   - Always import `APP_BRAND` from `src/config/appBrand.ts` and use `APP_BRAND.name` and `APP_BRAND.logoUrl`.
2. **Never hardcode `sanju3456k@gmail.com` in feature code.**
   - Use `APP_BRAND.ownerEmail` / `MASTER_ADMIN_EMAIL` / `ROOT_SUPER_ADMIN_EMAILS`.
3. **Never overwrite `dist/` or `public/` for a secondary institute.**
   - Always use `node scripts/build-tenant-apk.mjs <flavor> [Debug|Release]` (which builds into `dist-tenants/<flavor>/` and cleans up temporary assets).

## Common Workflows
- **Create a New Institute:**
  1. Create `android/tenants/<flavor>/` with `tenant.json`, `google-services.json`, `firebase-web-config.json`, and `logo_1024.png`.
  2. Add the institute entry to `src/config/institutesRegistry.ts`.
  3. Run `node scripts/build-tenant-apk.mjs <flavor> release`.
- **Push Updates to an Institute (e.g. "push these updates to Apex"):**
  - Run `node scripts/build-tenant-apk.mjs apexAcademy release` (or `node scripts/build-all-tenants.mjs release` for all institutes).


## Privacy Policy Maintenance
- Whenever new user data fields, OAuth scopes, Android permissions, AI integrations, or payment gateways are added, update `public/privacy.html` (and `public/terms.html` if applicable) and bump its `Last Updated` date so Google OAuth Verification & Play Store disclosures stay 100% accurate.
