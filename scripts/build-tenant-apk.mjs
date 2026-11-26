import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { syncInstitutes } from './sync-institutes.mjs';

const rawTarget = process.argv[2];
const buildType = (process.argv[3] || 'Debug').toLowerCase() === 'release' ? 'Release' : 'Debug';

if (!rawTarget) {
  console.error('Usage: node scripts/build-tenant-apk.mjs <slugOrFlavorName> [Debug|Release]');
  process.exit(1);
}

const synced = syncInstitutes({ filterTarget: rawTarget });
const matched = synced.find(
  (s) => s.slug === rawTarget || path.basename(s.logoUrl || '', '.png') === rawTarget
);

const rootDir = process.cwd();
let flavor = rawTarget;
if (matched) {
  const instCfgPath = path.join(rootDir, 'institutes', matched.slug, 'config.json');
  if (fs.existsSync(instCfgPath)) {
    flavor = JSON.parse(fs.readFileSync(instCfgPath, 'utf-8')).flavorName || rawTarget;
  }
}

const tenantDir = path.join(rootDir, 'android', 'tenants', flavor);
const tenantJsonPath = path.join(tenantDir, 'tenant.json');

if (!fs.existsSync(tenantJsonPath)) {
  console.error(`Tenant config not found: ${tenantJsonPath}`);
  process.exit(1);
}

const tenant = JSON.parse(fs.readFileSync(tenantJsonPath, 'utf-8'));
const flavorSrcDir = path.join(rootDir, 'android', 'app', 'src', flavor);
fs.mkdirSync(flavorSrcDir, { recursive: true });

// 1. Copy google-services.json into android/app/src/<flavor>/
const gsSrc = path.join(tenantDir, 'google-services.json');
if (fs.existsSync(gsSrc)) {
  fs.copyFileSync(gsSrc, path.join(flavorSrcDir, 'google-services.json'));
  console.log(`[${flavor}] Copied google-services.json`);
}

// 2. Copy logo_1024.png into public/assets/institute-logo.png and generate Android mipmaps
const logoSrc = path.join(tenantDir, 'logo_1024.png');
let hasLogo = false;
if (fs.existsSync(logoSrc)) {
  hasLogo = true;
  const publicAssetsDir = path.join(rootDir, 'public', 'assets');
  fs.mkdirSync(publicAssetsDir, { recursive: true });
  fs.copyFileSync(logoSrc, path.join(publicAssetsDir, 'institute-logo.png'));

  const pyScript = `
import os
from pathlib import Path
from PIL import Image, ImageDraw

logo = Path(r"${logoSrc}")
res = Path(r"${path.join(flavorSrcDir, 'res')}")
sizes = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
with Image.open(logo) as img:
    rgba = img.convert("RGBA")
    for folder, s in sizes.items():
        d = res / folder
        d.mkdir(parents=True, exist_ok=True)
        rgba.resize((s, s), Image.Resampling.LANCZOS).save(d / "ic_launcher.png")
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, s, s), fill=255)
        rnd = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        rnd.paste(rgba.resize((s, s), Image.Resampling.LANCZOS), (0, 0), mask)
        rnd.save(d / "ic_launcher_round.png")
    dr = res / "drawable"
    dr.mkdir(parents=True, exist_ok=True)
    dr_nodpi = res / "drawable-nodpi"
    dr_nodpi.mkdir(parents=True, exist_ok=True)
    for stale in [dr / "ic_launcher_foreground.png", dr / "splash_icon_bitmap.png"]:
        if stale.exists():
            stale.unlink()

    # High-res 512x512 adaptive foreground in drawable-nodpi (prevents mdpi upscaling blur)
    fg_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    fg_inner = 340
    fg_logo = rgba.resize((fg_inner, fg_inner), Image.Resampling.LANCZOS)
    fg_canvas.paste(fg_logo, ((512 - fg_inner) // 2, (512 - fg_inner) // 2), fg_logo)
    fg_canvas.save(dr_nodpi / "ic_launcher_foreground.png", format="PNG", optimize=True)

    anydpi = res / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    xml = '<?xml version="1.0" encoding="utf-8"?>\\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\\n    <background android:drawable="@android:color/white" />\\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\\n</adaptive-icon>\\n'
    (anydpi / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")

    # High-res 1024x1024 Android 12+ splash icon bitmap in drawable-nodpi (razor sharp on xxxhdpi)
    icon_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    icon_size = 680
    logo_icon = rgba.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    icon_canvas.paste(logo_icon, ((1024 - icon_size) // 2, (1024 - icon_size) // 2), logo_icon)
    icon_canvas.save(dr_nodpi / "splash_icon_bitmap.png", format="PNG", optimize=True)

    splash_icon_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\\n'
        '    <item android:width="160dp" android:height="160dp" android:gravity="center" android:drawable="@drawable/splash_icon_bitmap" />\\n'
        '</layer-list>\\n'
    )
    (dr / "splash_icon.xml").write_text(splash_icon_xml, encoding="utf-8")
    dr_night = res / "drawable-night"
    dr_night.mkdir(parents=True, exist_ok=True)
    (dr_night / "splash_icon.xml").write_text(splash_icon_xml, encoding="utf-8")

    # Generate legacy & orientation-specific light (#ffffff) and dark (#0b0c10) splash.png drawables
    splash_specs = [
        ("drawable", (1080, 2400), (255, 255, 255, 255)),
        ("drawable-night", (1080, 2400), (11, 12, 16, 255)),
        ("drawable-port-mdpi", (480, 800), (255, 255, 255, 255)),
        ("drawable-port-hdpi", (720, 1280), (255, 255, 255, 255)),
        ("drawable-port-xhdpi", (1080, 1920), (255, 255, 255, 255)),
        ("drawable-port-xxhdpi", (1080, 2400), (255, 255, 255, 255)),
        ("drawable-port-xxxhdpi", (1440, 3200), (255, 255, 255, 255)),
        ("drawable-port-night-mdpi", (480, 800), (11, 12, 16, 255)),
        ("drawable-port-night-hdpi", (720, 1280), (11, 12, 16, 255)),
        ("drawable-port-night-xhdpi", (1080, 1920), (11, 12, 16, 255)),
        ("drawable-port-night-xxhdpi", (1080, 2400), (11, 12, 16, 255)),
        ("drawable-port-night-xxxhdpi", (1440, 3200), (11, 12, 16, 255)),
        ("drawable-land-mdpi", (800, 480), (255, 255, 255, 255)),
        ("drawable-land-hdpi", (1280, 720), (255, 255, 255, 255)),
        ("drawable-land-xhdpi", (1920, 1080), (255, 255, 255, 255)),
        ("drawable-land-xxhdpi", (2400, 1080), (255, 255, 255, 255)),
        ("drawable-land-xxxhdpi", (3200, 1440), (255, 255, 255, 255)),
        ("drawable-land-night-mdpi", (800, 480), (11, 12, 16, 255)),
        ("drawable-land-night-hdpi", (1280, 720), (11, 12, 16, 255)),
        ("drawable-land-night-xhdpi", (1920, 1080), (11, 12, 16, 255)),
        ("drawable-land-night-xxhdpi", (2400, 1080), (11, 12, 16, 255)),
        ("drawable-land-night-xxxhdpi", (3200, 1440), (11, 12, 16, 255)),
    ]
    for folder, (w, h), bg in splash_specs:
        d = res / folder
        d.mkdir(parents=True, exist_ok=True)
        canvas = Image.new("RGBA", (w, h), bg)
        logo_w = max(96, int(min(w, h) * 0.28))
        resized = rgba.resize((logo_w, logo_w), Image.Resampling.LANCZOS)
        canvas.paste(resized, ((w - logo_w) // 2, (h - logo_w) // 2), resized)
        canvas.convert("RGB").save(d / "splash.png")
`;
  execFileSync('python', ['-c', pyScript], { stdio: 'inherit' });
  console.log(`[${flavor}] Generated Android launcher, adaptive icons & light/dark splash screens`);
}

// 3. Build Vite frontend into isolated dist-tenants/<flavor> so main dist/ (Elevate) is never overwritten
const fbWebPath = path.join(tenantDir, 'firebase-web-config.json');
const fbWebJson = fs.existsSync(fbWebPath)
  ? JSON.stringify(JSON.parse(fs.readFileSync(fbWebPath, 'utf-8')))
  : '';
const tenantOutDir = path.join(rootDir, 'dist-tenants', flavor);

console.log(`[${flavor}] Building isolated Vite bundle for ${tenant.appName}...`);
try {
  execSync(`npx vite build --outDir "${tenantOutDir}"`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_INSTITUTE_ID: tenant.instituteId,
      VITE_INSTITUTE_NAME: tenant.appName,
      VITE_INSTITUTE_LOGO: hasLogo ? './assets/institute-logo.png' : '',
      VITE_OWNER_EMAIL: tenant.ownerEmail || 'sanju3456k@gmail.com',
      VITE_FIREBASE_CONFIG_JSON: fbWebJson,
    },
  });
} finally {
  const tempLogo = path.join(rootDir, 'public', 'assets', 'institute-logo.png');
  if (fs.existsSync(tempLogo)) {
    try { fs.unlinkSync(tempLogo); } catch {}
  }
}

// 4. Copy isolated dist-tenants/<flavor>/ into android/app/src/<flavor>/assets/public/
const flavorPublicDir = path.join(flavorSrcDir, 'assets', 'public');
fs.rmSync(flavorPublicDir, { recursive: true, force: true });
fs.mkdirSync(flavorPublicDir, { recursive: true });
fs.cpSync(tenantOutDir, flavorPublicDir, { recursive: true });
['elevate.apk', 'elevate.apk.idsig', 'server.js'].forEach((f) => {
  const p = path.join(flavorPublicDir, f);
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
});

// 5. Build Capacitor Android APK
const capFlavor = flavor.charAt(0).toUpperCase() + flavor.slice(1);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const taskName = `assemble${capFlavor}${buildType}`;
console.log(`[${flavor}] Running ${gradlew} ${taskName}...`);
execSync(`${gradlew} ${taskName}`, {
  cwd: path.join(rootDir, 'android'),
  stdio: 'inherit',
});

console.log(`[${flavor}] Done! APK is in android/app/build/outputs/apk/${flavor}/${buildType.toLowerCase()}/`);
