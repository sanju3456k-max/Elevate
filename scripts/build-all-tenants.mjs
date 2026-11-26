import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const buildType = (process.argv[2] || 'Debug').toLowerCase() === 'release' ? 'Release' : 'Debug';
const tenantsDir = path.join(process.cwd(), 'android', 'tenants');

if (!fs.existsSync(tenantsDir)) {
  console.log('No android/tenants directory found.');
  process.exit(0);
}

const tenants = fs
  .readdirSync(tenantsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(tenantsDir, d.name, 'tenant.json')))
  .map((d) => d.name);

for (const flavor of tenants) {
  console.log(`\n=== Building ${flavor} (${buildType}) ===`);
  execSync(`node scripts/build-tenant-apk.mjs ${flavor} ${buildType}`, { stdio: 'inherit' });
}
