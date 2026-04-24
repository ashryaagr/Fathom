#!/usr/bin/env node
/**
 * Rasterize the "Built out of necessity" section for the README.
 *
 * GitHub renders README.md in its own font stack and strips inline
 * font-family — so the only way to show the author's origin story in
 * handwriting is as an image. We generate a PNG from SVG using the
 * build machine's system handwriting fonts (same trick hero.png uses).
 *
 * Output: resources/built-out-of-necessity.png.
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const scale = 2;          // 2× for retina crispness
const width = 1200;
const height = 720;

// The background matches the app's paper tone so the image sits in
// the README without a jarring border.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#faf4e8"/>
      <stop offset="100%" stop-color="#f3ead7"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="18" fill="url(#bg)"/>
  <style>
    .hw {
      font-family: 'Bradley Hand', 'Marker Felt', 'Segoe Print',
                   'Comic Sans MS', cursive;
      font-weight: 700;
      fill: #1a1614;
      letter-spacing: -0.005em;
    }
    .heading { font-size: 56px; fill: #9f661b; }
    .body    { font-size: 30px; }
    .soft    { fill: #2a2420; }
  </style>

  <text class="hw heading" x="80" y="110">Built out of necessity.</text>

  <text class="hw body soft" x="80" y="210">
    <tspan x="80" dy="0">I'm Ashrya, an AI scientist. I read a lot of research papers,</tspan>
    <tspan x="80" dy="48">and I got tired of the same loop — hit a dense passage, paste it</tspan>
    <tspan x="80" dy="48">into Claude, ask for clarification, then clarification of the</tspan>
    <tspan x="80" dy="48">clarification, then of that — and by the time I'd surfaced,</tspan>
    <tspan x="80" dy="48">the paper was gone.</tspan>
  </text>

  <text class="hw body soft" x="80" y="512">
    <tspan x="80" dy="0">So I built the reader I always wanted. When it was polished</tspan>
    <tspan x="80" dy="48">enough for me to use daily, it felt like it might be useful</tspan>
    <tspan x="80" dy="48">to someone else.</tspan>
  </text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 * scale })
  .resize(width * scale, height * scale)
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'resources', 'built-out-of-necessity.png'));

console.log('  ✓ resources/built-out-of-necessity.png');
