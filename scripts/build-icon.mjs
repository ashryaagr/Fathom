// Generate every size macOS / electron-builder wants from resources/icon.svg.
// Produces PNGs in resources/iconset/ and the final resources/icon.icns.
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'resources/icon.svg'));

// macOS wants these exact sizes in the iconset.
const entries = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

const iconsetDir = join(root, 'resources/icon.iconset');
if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
mkdirSync(iconsetDir, { recursive: true });

for (const { name, size } of entries) {
  await sharp(svg).resize(size, size).png().toFile(join(iconsetDir, name));
  console.log('wrote', name);
}

// A 1024×1024 icon.png too — electron-builder picks this up directly on
// non-mac builds and it's the fallback source if icon.icns is missing.
await sharp(svg).resize(1024, 1024).png().toFile(join(root, 'resources/icon.png'));
console.log('wrote icon.png');

// Build the .icns from the iconset. `iconutil` is built into macOS.
execSync(`iconutil -c icns -o ${join(root, 'resources/icon.icns')} ${iconsetDir}`, {
  stdio: 'inherit',
});
console.log('wrote icon.icns');

// Clean up the iconset directory — we only need the .icns in the repo.
rmSync(iconsetDir, { recursive: true });
