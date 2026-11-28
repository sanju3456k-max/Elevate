import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const institutesDir = path.join(rootDir, 'institutes');
const androidTenantsDir = path.join(rootDir, 'android', 'tenants');
const publicTenantsDir = path.join(rootDir, 'public', 'assets', 'tenants');

export function syncInstitutes({ filterTarget } = {}) {
  if (!fs.existsSync(institutesDir)) {
    console.log('[sync-institutes] No institutes/ directory found; skipping.');
    return [];
  }

  fs.mkdirSync(androidTenantsDir, { recursive: true });
  fs.mkdirSync(publicTenantsDir, { recursive: true });

  const entries = fs
    .readdirSync(institutesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'));

  const generatedEntries = [];

  for (const dir of entries) {
    const slugFolder = dir.name;
    const srcDir = path.join(institutesDir, slugFolder);
    const configPath = path.join(srcDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      console.warn(`[sync-institutes] Skipping ${slugFolder}: missing config.json`);
      continue;
    }

    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const flavor = String(cfg.flavorName || '').trim();
    const slug = String(cfg.slug || slugFolder).trim();
    if (!flavor || !cfg.instituteId || !cfg.appName || !cfg.applicationId || !cfg.ownerEmail) {
      throw new Error(`[sync-institutes] ${slugFolder}/config.json is missing required fields (flavorName, instituteId, appName, applicationId, ownerEmail).`);
    }

    // Validate google-services.json if present
    const gsPath = path.join(srcDir, 'google-services.json');
    if (!fs.existsSync(gsPath)) {
      throw new Error(`[sync-institutes] ${slugFolder}/google-services.json is missing.`);
    }
    const gsJson = JSON.parse(fs.readFileSync(gsPath, 'utf-8'));
    const gsProjectId = gsJson?.project_info?.project_id;
    const webProjectId = cfg?.firebaseWebConfig?.projectId;
    if (!webProjectId || gsProjectId !== webProjectId) {
      throw new Error(
        `[sync-institutes] Project ID mismatch in ${slugFolder}: google-services.json has "${gsProjectId}" but config.json firebaseWebConfig.projectId has "${webProjectId}".`
      );
    }

    const gsPackages = (gsJson?.client || [])
      .map((c) => c?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!gsPackages.includes(cfg.applicationId)) {
      throw new Error(
        `[sync-institutes] Package name mismatch in ${slugFolder}: config.json applicationId is "${cfg.applicationId}", but google-services.json has [${gsPackages.join(', ')}].`
      );
    }

    const shouldSyncAssets =
      !filterTarget || filterTarget === flavor || filterTarget === slug || filterTarget === slugFolder;

    const targetTenantDir = path.join(androidTenantsDir, flavor);
    fs.mkdirSync(targetTenantDir, { recursive: true });

    // Write tenant.json, google-services.json, firebase-web-config.json
    fs.writeFileSync(
      path.join(targetTenantDir, 'tenant.json'),
      JSON.stringify(
        {
          flavorName: flavor,
          instituteId: cfg.instituteId,
          appName: cfg.appName,
          applicationId: cfg.applicationId,
          ownerEmail: cfg.ownerEmail,
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    fs.copyFileSync(gsPath, path.join(targetTenantDir, 'google-services.json'));
    fs.writeFileSync(
      path.join(targetTenantDir, 'firebase-web-config.json'),
      JSON.stringify(cfg.firebaseWebConfig, null, 2) + '\n',
      'utf-8'
    );

    // Find & auto-normalize logo (png, jpg, jpeg, webp) -> 1024x1024 square PNG + 512x512 web logo
    const logoCandidates = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo_1024.png']
      .map((f) => path.join(srcDir, f))
      .filter((p) => fs.existsSync(p));

    let hasLogo = false;
    if (logoCandidates.length > 0 && shouldSyncAssets) {
      hasLogo = true;
      const logoSrc = logoCandidates[0];
      const outAndroidLogo = path.join(targetTenantDir, 'logo_1024.png');
      const outWebLogo = path.join(publicTenantsDir, `${flavor}.png`);

      const pyScript = `
from pathlib import Path
from PIL import Image, ImageFilter

src = Path(r"${logoSrc}")
out_1024 = Path(r"${outAndroidLogo}")
out_web = Path(r"${outWebLogo}")

with Image.open(src) as img:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    if w < 512 or h < 512:
        print(f"[sync-institutes] WARNING: {src.name} is low-res ({w}x{h}). Prefer >= 1024x1024 for sharpest branding.")
    if w == 1024 and h == 1024 and src.suffix.lower() == ".png":
        norm_1024 = rgba
    else:
        scale = min(920 / max(1, w), 920 / max(1, h))
        nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        resized = rgba.resize((nw, nh), Image.Resampling.LANCZOS)
        if scale > 1.0:
            resized = resized.filter(ImageFilter.UnsharpMask(radius=1.0, percent=110, threshold=3))
        norm_1024 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        norm_1024.paste(resized, ((1024 - nw) // 2, (1024 - nh) // 2), resized)
    norm_1024.save(out_1024, format="PNG", optimize=True)
    norm_1024.save(out_web, format="PNG", optimize=True)
`;
      execFileSync('python', ['-c', pyScript], { stdio: 'inherit' });
    } else if (fs.existsSync(path.join(publicTenantsDir, `${flavor}.png`))) {
      hasLogo = true;
    }

    // Sync optional screenshots from institutes/<slug>/screenshots/ -> public/assets/tenants/<flavor>/screenshots/
    const screenshotsSrcDir = path.join(srcDir, 'screenshots');
    const screenshotsOutDir = path.join(publicTenantsDir, flavor, 'screenshots');
    const syncedScreenshots = [];
    if (fs.existsSync(screenshotsSrcDir)) {
      const files = fs
        .readdirSync(screenshotsSrcDir)
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort();
      if (files.length > 0) {
        fs.mkdirSync(screenshotsOutDir, { recursive: true });
        for (const f of files) {
          fs.copyFileSync(path.join(screenshotsSrcDir, f), path.join(screenshotsOutDir, f));
          syncedScreenshots.push(`./assets/tenants/${flavor}/screenshots/${f}`);
        }
      }
    }

    const apkRel = String(cfg.apkDownloadUrl || `./${slug}.apk`).replace(/^\.\//, '');
    const localApkPath = path.join(rootDir, 'public', apkRel);
    let measuredSizeLabel = '';
    if (fs.existsSync(localApkPath)) {
      const bytes = fs.statSync(localApkPath).size;
      if (bytes > 0) {
        measuredSizeLabel = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }

    const storePage = {
      ...(cfg.storePage && typeof cfg.storePage === 'object' ? cfg.storePage : {}),
      ...(measuredSizeLabel ? { apkSizeLabel: measuredSizeLabel } : {}),
      ...(syncedScreenshots.length > 0 ? { screenshots: syncedScreenshots } : {}),
    };

    let gradleVersionName = '1.0';
    try {
      const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        const gMatch = fs.readFileSync(gradlePath, 'utf-8').match(/versionName\s+"([^"]+)"/);
        if (gMatch?.[1]) gradleVersionName = gMatch[1];
      }
    } catch {}

    generatedEntries.push({
      id: cfg.instituteId,
      name: cfg.appName,
      slug,
      ...(hasLogo ? { logoUrl: `./assets/tenants/${flavor}.png` } : {}),
      ownerEmail: String(cfg.ownerEmail).trim().toLowerCase(),
      teamAdminEmails: Array.isArray(cfg.teamAdminEmails) ? cfg.teamAdminEmails : [],
      packageName: cfg.applicationId,
      apkVersion: String(cfg.apkVersion || gradleVersionName || '1.0'),
      apkDownloadUrl:
        cfg.apkDownloadUrl ||
        `https://github.com/sanju3456k/elevate-android/releases/latest/download/${flavor}-release.apk`,
      firebaseWebConfig: cfg.firebaseWebConfig,
      ...(Object.keys(storePage).length > 0 ? { storePage } : {}),
      createdAt: cfg.createdAt || '2026-11-26T00:00:00.000Z',
      updatedAt: cfg.updatedAt || '2026-11-26T00:00:00.000Z',
    });

    console.log(`[sync-institutes] Synced ${cfg.appName} (flavor=${flavor}, project=${webProjectId}, size=${measuredSizeLabel || 'default'})`);
  }

  let elevateVersion = '1.0';
  try {
    const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      const gMatch = fs.readFileSync(gradlePath, 'utf-8').match(/versionName\s+"([^"]+)"/);
      if (gMatch?.[1]) elevateVersion = gMatch[1];
    }
  } catch {}
  let elevateSizeLabel = '9.2 MB';
  const elevateApkPath = path.join(rootDir, 'public', 'elevate.apk');
  if (fs.existsSync(elevateApkPath)) {
    const bytes = fs.statSync(elevateApkPath).size;
    if (bytes > 0) elevateSizeLabel = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const genTsPath = path.join(rootDir, 'src', 'config', 'institutesRegistry.generated.ts');
  const genContent =
    `// AUTO-GENERATED by scripts/sync-institutes.mjs — DO NOT EDIT MANUALLY.\n` +
    `import type { StaticInstituteEntry } from './institutesRegistry';\n\n` +
    `export const GENERATED_ELEVATE_APK_META = ${JSON.stringify({ apkVersion: elevateVersion, apkSizeLabel: elevateSizeLabel }, null, 2)};\n\n` +
    `export const GENERATED_INSTITUTES_REGISTRY: StaticInstituteEntry[] = ${JSON.stringify(generatedEntries, null, 2)};\n`;

  fs.writeFileSync(genTsPath, genContent, 'utf-8');
  console.log(`[sync-institutes] Updated src/config/institutesRegistry.generated.ts (${generatedEntries.length} institute(s))`);
  return generatedEntries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const filterTarget = process.argv[2];
  syncInstitutes({ filterTarget });
}
