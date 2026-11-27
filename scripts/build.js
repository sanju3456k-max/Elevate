import { execSync } from 'child_process';
import fs from 'fs';

try {
  console.log('0. Generating PWA icons & Android splash assets...');
  execSync('node scripts/generate-icons.js', { stdio: 'inherit' });
  try {
    execSync('node scripts/make-splash-vectors.js', { stdio: 'inherit' });
    execSync('python scripts/generate-android-assets.py', { stdio: 'inherit' });
  } catch (e) {
    // Graceful fallback if python/pymupdf is not available in environment
  }

  console.log('1. Building Vite frontend assets...');
  execSync('npx vite build', { stdio: 'inherit' });

  console.log('2. Bundling server.ts...');
  execSync('npx esbuild server.ts --bundle --platform=node --format=esm --outdir=dist --packages=external', { stdio: 'inherit' });

  console.log('2b. Bundling Vercel serverless function server/api.ts...');
  if (fs.existsSync('server/api.ts')) {
    execSync('npx esbuild server/api.ts --bundle --platform=node --format=esm --outfile=api/index.js --packages=external', { stdio: 'inherit' });
  }

  // Create 404.html fallback for GitHub Pages SPA routing
  if (fs.existsSync('dist/index.html')) {
    fs.copyFileSync('dist/index.html', 'dist/404.html');
  }

  console.log('3. Copying dist to build and android assets directory...');
  if (fs.existsSync('dist')) {
    fs.cpSync('dist', 'build', { recursive: true });
    const androidPublic = 'android/app/src/main/assets/public';
    if (fs.existsSync(androidPublic)) {
      fs.cpSync('dist', androidPublic, { recursive: true });
    }
  }

  // Copy bundled server.js to root server.js for node server.js fallback compatibility
  if (fs.existsSync('dist/server.js')) {
    fs.copyFileSync('dist/server.js', 'server.js');
  }

  // Clean heavy redundant binary assets from android assets directory
  const androidPublic = 'android/app/src/main/assets/public';
  if (fs.existsSync(androidPublic)) {
    fs.readdirSync(androidPublic).forEach((f) => {
      if (f.endsWith('.apk') || f.endsWith('.apk.idsig') || f === 'server.js') {
        try { fs.unlinkSync(`${androidPublic}/${f}`); } catch {}
      }
    });
  }

  console.log('Build finished successfully!');
} catch (error) {
  console.error('Build step failed:', error);
  process.exit(1);
}
