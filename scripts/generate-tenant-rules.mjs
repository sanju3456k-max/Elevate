import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const shouldDeploy = args.includes('--deploy');

if (!target) {
  console.error('Usage: node scripts/generate-tenant-rules.mjs <slugOrFlavorName> [--deploy]');
  process.exit(1);
}

const rootDir = process.cwd();
let flavor = target;
let projectId = '';
let ownerEmail = '';

// 1. Check unified institutes/<slug>/config.json first
const instituteCfgPath = path.join(rootDir, 'institutes', target, 'config.json');
if (fs.existsSync(instituteCfgPath)) {
  const cfg = JSON.parse(fs.readFileSync(instituteCfgPath, 'utf-8'));
  flavor = cfg.flavorName || target;
  projectId = cfg?.firebaseWebConfig?.projectId || '';
  ownerEmail = String(cfg.ownerEmail || '').trim().toLowerCase();
} else {
  // 2. Fallback to android/tenants/<flavor>/
  const tenantJsonPath = path.join(rootDir, 'android', 'tenants', target, 'tenant.json');
  if (!fs.existsSync(tenantJsonPath)) {
    console.error(`Tenant not found in institutes/${target} or android/tenants/${target}`);
    process.exit(1);
  }
  const tenant = JSON.parse(fs.readFileSync(tenantJsonPath, 'utf-8'));
  flavor = tenant.flavorName || target;
  ownerEmail = String(tenant.ownerEmail || '').trim().toLowerCase();
  const fbWebPath = path.join(rootDir, 'android', 'tenants', flavor, 'firebase-web-config.json');
  if (fs.existsSync(fbWebPath)) {
    projectId = JSON.parse(fs.readFileSync(fbWebPath, 'utf-8')).projectId || '';
  }
}

if (!ownerEmail) {
  console.error('ownerEmail missing in tenant config');
  process.exit(1);
}

const baseRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
const tenantRules = baseRules.replace(/sanju3456k@gmail\.com/gi, ownerEmail);

const outDir = path.join(rootDir, 'dist-tenants', flavor);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'firestore.rules');
fs.writeFileSync(outPath, tenantRules, 'utf-8');
console.log(`Generated ${outPath} with ownerEmail=${ownerEmail}`);

if (process.platform === 'win32') {
  try {
    execSync(`powershell -NoProfile -Command "Get-Content -Raw '${outPath}' | Set-Clipboard"`, {
      stdio: 'inherit',
    });
    console.log('Copied tenant firestore.rules to Windows clipboard!');
  } catch {
    // Ignore clipboard error
  }
}

if (shouldDeploy) {
  if (!projectId) {
    console.error('Cannot deploy: firebaseWebConfig.projectId missing.');
    process.exit(1);
  }
  const tempFirebaseJson = path.join(outDir, 'firebase.json');
  fs.writeFileSync(
    tempFirebaseJson,
    JSON.stringify({ firestore: { rules: 'firestore.rules' } }, null, 2),
    'utf-8'
  );
  const firebaseBin = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
  console.log(`Deploying firestore.rules to Firebase project "${projectId}"...`);
  try {
    execSync(`${firebaseBin} deploy --only firestore:rules --project ${projectId}`, {
      cwd: outDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn(`Firebase CLI deploy failed (rules are still copied to clipboard for manual paste): ${err?.message || err}`);
    process.exitCode = 1;
  }
}
