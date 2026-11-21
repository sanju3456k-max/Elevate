import fs from 'fs';
import path from 'path';

const root = fs.existsSync(path.resolve('public', 'assets', 'elevate-icon.svg'))
  ? process.cwd()
  : path.resolve('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca');
const svgPath = path.join(root, 'public', 'assets', 'elevate-icon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const sigmaMatch = svg.match(/class="elevate-sigma"[\s\S]*?d="([\s\S]*?)"/);
const textMatch = svg.match(/class="elevate-text"[\s\S]*?d="([\s\S]*?)"/);

if (!sigmaMatch || !textMatch) {
  console.error('Failed to match SVG paths');
  process.exit(1);
}

const sigmaPathData = sigmaMatch[1].trim();
const textPathData = textMatch[1].trim();

function createVectorXml(colorHex) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="160dp"
    android:height="160dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
    <group
        android:pivotX="512"
        android:pivotY="508"
        android:scaleX="0.78"
        android:scaleY="0.78">
        <!-- Elevate Sigma Aperture Emblem -->
        <path
            android:pathData="${sigmaPathData}"
            android:strokeColor="${colorHex}"
            android:strokeWidth="73"
            android:strokeLineCap="round"
            android:strokeLineJoin="round" />
        <!-- Elevate Brand Wordmark -->
        <path
            android:pathData="${textPathData}"
            android:fillColor="${colorHex}"
            android:fillType="evenOdd" />
    </group>
</vector>
`;
}

const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');
const drawableDir = path.join(resDir, 'drawable');
const drawableNightDir = path.join(resDir, 'drawable-night');

fs.mkdirSync(drawableNightDir, { recursive: true });

// Light mode vector drawable: #FF0B57D0 (Elevate Royal Blue)
const lightVector = createVectorXml('#FF0B57D0');
fs.writeFileSync(path.join(drawableDir, 'splash_icon.xml'), lightVector, 'utf8');
console.log('Created res/drawable/splash_icon.xml (Light mode)');

// Dark mode vector drawable: #FFA8C7FA (Elevate Vibrant Light Blue for Dark Background)
const darkVector = createVectorXml('#FFA8C7FA');
fs.writeFileSync(path.join(drawableNightDir, 'splash_icon.xml'), darkVector, 'utf8');
console.log('Created res/drawable-night/splash_icon.xml (Dark mode)');

// High-definition vector layer-list for windowBackground
const splashLayerXml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background" />
    <item
        android:width="160dp"
        android:height="160dp"
        android:gravity="center"
        android:drawable="@drawable/splash_icon" />
</layer-list>
`;

fs.writeFileSync(path.join(drawableDir, 'splash_layer.xml'), splashLayerXml, 'utf8');
fs.writeFileSync(path.join(drawableNightDir, 'splash_layer.xml'), splashLayerXml, 'utf8');
console.log('Created res/drawable & drawable-night/splash_layer.xml');
