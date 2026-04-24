#!/usr/bin/env node
/**
 * Rasterize resources/dmg-background.svg into 1x and 2x PNGs for the DMG
 * window background. electron-builder picks up dmg-background.png and
 * dmg-background@2x.png automatically when the config points to
 * dmg.background=resources/dmg-background.png.
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'resources', 'dmg-background.svg');

const WIDTH_1X = 680;
const HEIGHT_1X = 460;

const svg = await readFile(svgPath);

async function render(scale, outPath) {
  await sharp(svg, { density: 96 * scale })
    .resize(WIDTH_1X * scale, HEIGHT_1X * scale)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ✓ ${outPath}`);
}

console.log('Rasterizing DMG background…');
await render(1, join(root, 'resources', 'dmg-background.png'));
await render(2, join(root, 'resources', 'dmg-background@2x.png'));
console.log('done.');
