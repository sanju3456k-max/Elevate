import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { syncInstitutes } from './sync-institutes.mjs';

const rawTarget = process.argv[2];

if (!rawTarget) {
  console.error('Usage: node scripts/build-tenant-pwa.mjs <slugOrFlavorName|--all>');
  process.exit(1);
}

const rootDir = process.cwd();

function buildSingleTenantPwa(targetArg) {
  const synced = syncInstitutes({ filterTarget: targetArg });
  const matched = synced.find(
    (s) => s.slug === targetArg || path.basename(s.logoUrl || '', '.png') === targetArg
  );

  let flavor = targetArg;
  let instConfig = {};
  if (matched) {
    const instCfgPath = path.join(rootDir, 'institutes', matched.slug, 'config.json');
    if (fs.existsSync(instCfgPath)) {
      instConfig = JSON.parse(fs.readFileSync(instCfgPath, 'utf-8'));
      flavor = instConfig.flavorName || targetArg;
    }
  }

  const tenantDir = path.join(rootDir, 'android', 'tenants', flavor);
  const tenantJsonPath = path.join(tenantDir, 'tenant.json');
  if (!fs.existsSync(tenantJsonPath)) {
    console.error(`Tenant config not found: ${tenantJsonPath}`);
    process.exit(1);
  }

  const tenant = JSON.parse(fs.readFileSync(tenantJsonPath, 'utf-8'));
  const slug = tenant.slug || matched?.slug || flavor;
  const pwaOutDir = path.join(rootDir, 'dist-tenants', `${slug}-pwa`);

  const fbWebPath = path.join(tenantDir, 'firebase-web-config.json');
  const fbWebJson = fs.existsSync(fbWebPath)
    ? JSON.stringify(JSON.parse(fs.readFileSync(fbWebPath, 'utf-8')))
    : '';

  const logoSrc = path.join(tenantDir, 'logo_1024.png');
  const hasLogo = fs.existsSync(logoSrc);
  const tempLogo = path.join(rootDir, 'public', 'assets', 'institute-logo.png');

  if (hasLogo) {
    fs.mkdirSync(path.dirname(tempLogo), { recursive: true });
    fs.copyFileSync(logoSrc, tempLogo);
  }

  console.log(`\n[${slug}] Building isolated iOS/Web PWA bundle for ${tenant.appName}...`);
  try {
    execSync(`npx vite build --outDir "${pwaOutDir}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_INSTITUTE_ID: tenant.instituteId,
        VITE_INSTITUTE_NAME: tenant.appName,
        VITE_INSTITUTE_LOGO: hasLogo ? './assets/institute-logo.png' : '',
        VITE_OWNER_EMAIL: tenant.ownerEmail || 'sanju3456k@gmail.com',
        VITE_FIREBASE_CONFIG_JSON: fbWebJson,
        VITE_IS_PWA_BUILD: 'true',
      },
    });
  } finally {
    if (fs.existsSync(tempLogo)) {
      try { fs.unlinkSync(tempLogo); } catch {}
    }
  }

  // Generate per-institute PWA & Apple Touch icons inside pwaOutDir
  if (hasLogo) {
    const pyScript = `
from pathlib import Path
from PIL import Image

logo = Path(r"${logoSrc}")
out = Path(r"${pwaOutDir}")
with Image.open(logo) as img:
    rgba = img.convert("RGBA")
    for fname, sz in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        bg = Image.new("RGBA", (sz, sz), (255, 255, 255, 255))
        pad = int(sz * 0.1)
        inner = sz - (pad * 2)
        fg = rgba.resize((inner, inner), Image.Resampling.LANCZOS)
        bg.paste(fg, (pad, pad), fg)
        bg.convert("RGB").save(out / fname, format="PNG", optimize=True)
    for fname, sz in [("icon-maskable-192.png", 192), ("icon-maskable-512.png", 512)]:
        bg = Image.new("RGBA", (sz, sz), (255, 255, 255, 255))
        pad = int(sz * 0.16)
        inner = sz - (pad * 2)
        fg = rgba.resize((inner, inner), Image.Resampling.LANCZOS)
        bg.paste(fg, (pad, pad), fg)
        bg.convert("RGB").save(out / fname, format="PNG", optimize=True)
`;
    execFileSync('python', ['-c', pyScript], { stdio: 'inherit' });
  }

  // Write institute-specific manifest.webmanifest
  const appName = tenant.appName || 'Institute App';
  const shortName = appName.length > 14 ? appName.slice(0, 14).trim() : appName;
  const accentColor = instConfig?.storePage?.accentColor || '#ffffff';
  const manifest = {
    name: appName,
    short_name: shortName,
    description: instConfig?.storePage?.tagline || `${appName} — Mock Tests, OMR Studio & Notes`,
    start_url: '/',
    scope: '/',
    id: `/${slug}`,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: accentColor === '#ffffff' ? '#ffffff' : '#ffffff',
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
      { src: '/icon-192.png?v=17', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=17', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png?v=17', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png?v=17', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(pwaOutDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

  // Patch index.html for iOS Home Screen title & branding
  const indexPath = path.join(pwaOutDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8');
    const safeName = appName.replace(/[<>&"]/g, '');
    html = html
      .replace(/<title>.*?<\/title>/, `<title>${safeName} — Mock Tests, OMR Studio & Notes</title>`)
      .replace(
        /<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/>/,
        `<meta name="apple-mobile-web-app-title" content="${safeName}" />`
      )
      .replace(
        /<meta name="application-name" content="[^"]*"\s*\/>/,
        `<meta name="application-name" content="${safeName}" />`
      )
      .replace(
        /<meta property="og:title" content="[^"]*"\s*\/>/,
        `<meta property="og:title" content="${safeName} — Mock Tests, OMR Studio & Notes" />`
      );
    fs.writeFileSync(indexPath, html);
    fs.copyFileSync(indexPath, path.join(pwaOutDir, '404.html'));
  }

  // Add standalone vercel.json for one-command Vercel deployment
  fs.writeFileSync(
    path.join(pwaOutDir, 'vercel.json'),
    JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2)
  );

  // Clean any APK/server artifacts from web bundle
  ['elevate.apk', 'elevate.apk.idsig', 'server.js'].forEach((f) => {
    const p = path.join(pwaOutDir, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  });

  console.log(`[${slug}] PWA ready at: ${pwaOutDir}`);
}

if (rawTarget === '--all') {
  const tenantsDir = path.join(rootDir, 'android', 'tenants');
  const tenants = fs
    .readdirSync(tenantsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(tenantsDir, d.name, 'tenant.json')))
    .map((d) => d.name);
  for (const flavor of tenants) {
    buildSingleTenantPwa(flavor);
  }
} else {
  buildSingleTenantPwa(rawTarget);
}
