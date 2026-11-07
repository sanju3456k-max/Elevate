import fs from 'fs';
import path from 'path';

// PWA icons are generated directly from the authentic Elevate static aperture emblem
// in public/assets/preplens-icon.png with pure transparent alpha boundaries (no white outer body).

async function generate() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const iconPngPath = path.join(publicDir, 'assets', 'preplens-icon.png');
  const maskablePngPath = path.join(publicDir, 'icon-maskable-192.png');
  if (fs.existsSync(iconPngPath)) {
    const pngBase64 = fs.readFileSync(iconPngPath).toString('base64');
    const maskableBase64 = fs.existsSync(maskablePngPath)
      ? fs.readFileSync(maskablePngPath).toString('base64')
      : pngBase64;
    const svgLens = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <image href="data:image/png;base64,${pngBase64}" width="192" height="192" />
</svg>
`;
    const svgMaskable = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <image href="data:image/png;base64,${maskableBase64}" width="192" height="192" />
</svg>
`;
    fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgLens, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), svgLens, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), svgLens, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'icon-maskable.svg'), svgMaskable, 'utf-8');
  }

  console.log('Verified vector SVG and PNG PWA assets in public/.');
}

generate().catch(console.error);
