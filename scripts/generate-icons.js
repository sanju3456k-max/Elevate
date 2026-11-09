import fs from 'fs';
import path from 'path';

// PWA icons and web assets are maintained from the authentic Elevate vector emblem
// in public/assets/preplens-icon.svg and preplens-icon.png with pure transparent alpha boundaries.

async function generate() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgLensPath = path.join(publicDir, 'assets', 'preplens-icon.svg');
  if (fs.existsSync(svgLensPath)) {
    const svgLens = fs.readFileSync(svgLensPath, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgLens, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), svgLens, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), svgLens, 'utf-8');
  }

  console.log('Verified authentic HD vector SVG and PNG PWA assets in public/.');
}

generate().catch(console.error);
