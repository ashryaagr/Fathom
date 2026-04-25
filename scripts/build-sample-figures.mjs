#!/usr/bin/env node
/**
 * Render the sample paper's figures as PNGs. Two figures, each an inline
 * SVG rasterised via sharp at 2× density so they print cleanly when
 * embedded in the sample PDF. Output paths the PDF-building script
 * imports directly.
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = (name) => join(__dirname, '..', 'resources', `sample-fig-${name}.png`);

// Figure 1: architecture diagram — input → encoder → latent → decoder → output
const fig1Svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220">
  <style>
    .box { fill: white; stroke: #1a1614; stroke-width: 1.5; }
    .accent { fill: #faf4e8; stroke: #c9832a; stroke-width: 1.6; }
    .label { font-family: 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; fill: #1a1614; }
    .caption { font-family: 'SF Pro Text', Arial, sans-serif; font-size: 11px; fill: #6b5840; font-style: italic; }
    .arrow { stroke: #1a1614; stroke-width: 1.4; fill: none; }
  </style>
  <rect x="30" y="70" width="80" height="54" rx="6" class="box"/>
  <text x="70" y="102" text-anchor="middle" class="label">Paper</text>
  <text x="70" y="116" text-anchor="middle" class="caption">(PDF)</text>

  <path d="M 110 97 L 160 97" class="arrow"/>
  <path d="M 154 93 L 162 97 L 154 101" class="arrow"/>

  <rect x="165" y="70" width="90" height="54" rx="6" class="accent"/>
  <text x="210" y="96" text-anchor="middle" class="label">Encoder E</text>
  <text x="210" y="112" text-anchor="middle" class="caption">(pdf.js + CTM)</text>

  <path d="M 255 97 L 305 97" class="arrow"/>
  <path d="M 299 93 L 307 97 L 299 101" class="arrow"/>

  <rect x="310" y="70" width="85" height="54" rx="6" class="box"/>
  <text x="352" y="96" text-anchor="middle" class="label">Index I</text>
  <text x="352" y="112" text-anchor="middle" class="caption">(content.md)</text>

  <path d="M 395 97 L 445 97" class="arrow"/>
  <path d="M 439 93 L 447 97 L 439 101" class="arrow"/>

  <rect x="450" y="70" width="90" height="54" rx="6" class="accent"/>
  <text x="495" y="96" text-anchor="middle" class="label">Grounded</text>
  <text x="495" y="110" text-anchor="middle" class="label">answer</text>

  <text x="300" y="30" text-anchor="middle" font-family="'SF Pro Display', Helvetica, Arial, sans-serif" font-size="14" font-weight="600" fill="#1a1614">
    Figure 1: The extraction-then-grounding pipeline.
  </text>
  <text x="300" y="165" text-anchor="middle" class="caption">
    No retrieval step; no embedding space. Claude uses Read/Grep/Glob on I.
  </text>
</svg>`;

// Figure 2: results bar chart — precision comparison across three methods
const fig2Svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260">
  <style>
    .axis { stroke: #1a1614; stroke-width: 1.2; }
    .bar { stroke: #1a1614; stroke-width: 1; }
    .bar-a { fill: #ddcfb0; }
    .bar-b { fill: #b89460; }
    .bar-c { fill: #c9832a; }
    .label { font-family: 'SF Pro Text', Arial, sans-serif; font-size: 11px; fill: #1a1614; }
    .value { font-family: 'SF Pro Text', Arial, sans-serif; font-size: 11px; fill: #1a1614; font-weight: 600; }
    .title { font-family: 'SF Pro Display', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; fill: #1a1614; }
    .caption { font-family: 'SF Pro Text', Arial, sans-serif; font-size: 11px; fill: #6b5840; font-style: italic; }
  </style>
  <text x="240" y="22" text-anchor="middle" class="title">
    Figure 2: Citation-resolution precision on 50 ML papers.
  </text>

  <!-- y-axis -->
  <line x1="80" y1="60" x2="80" y2="200" class="axis"/>
  <line x1="80" y1="200" x2="420" y2="200" class="axis"/>

  <!-- y-axis labels -->
  <text x="72" y="203" text-anchor="end" class="label">0</text>
  <text x="72" y="167" text-anchor="end" class="label">25</text>
  <text x="72" y="133" text-anchor="end" class="label">50</text>
  <text x="72" y="97" text-anchor="end" class="label">75</text>
  <text x="72" y="63" text-anchor="end" class="label">100%</text>

  <!-- grid -->
  <line x1="80" y1="168" x2="420" y2="168" stroke="#e0d3ac" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="80" y1="134" x2="420" y2="134" stroke="#e0d3ac" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="80" y1="100" x2="420" y2="100" stroke="#e0d3ac" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="80" y1="66" x2="420" y2="66" stroke="#e0d3ac" stroke-width="0.6" stroke-dasharray="2 2"/>

  <!-- Bar 1: RAG baseline — 61% -->
  <rect x="110" y="117" width="80" height="83" class="bar bar-a"/>
  <text x="150" y="111" text-anchor="middle" class="value">61%</text>
  <text x="150" y="216" text-anchor="middle" class="label">RAG</text>
  <text x="150" y="230" text-anchor="middle" class="caption">(baseline)</text>

  <!-- Bar 2: RAG + rerank — 78% -->
  <rect x="210" y="94" width="80" height="106" class="bar bar-b"/>
  <text x="250" y="88" text-anchor="middle" class="value">78%</text>
  <text x="250" y="216" text-anchor="middle" class="label">RAG +</text>
  <text x="250" y="230" text-anchor="middle" class="caption">rerank</text>

  <!-- Bar 3: Grep (ours) — 94% -->
  <rect x="310" y="69" width="80" height="131" class="bar bar-c"/>
  <text x="350" y="63" text-anchor="middle" class="value">94%</text>
  <text x="350" y="216" text-anchor="middle" class="label">Grep-based</text>
  <text x="350" y="230" text-anchor="middle" class="caption">(ours)</text>

  <text x="240" y="253" text-anchor="middle" class="caption">
    Filesystem-first grounding resolves [N]-style citations deterministically.
  </text>
</svg>`;

async function render(svg, name) {
  const buf = await sharp(Buffer.from(svg), { density: 200 }).png({ compressionLevel: 9 }).toBuffer();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out(name), buf);
  console.log(`  ✓ resources/sample-fig-${name}.png (${buf.length} bytes)`);
}

console.log('Rasterising sample-paper figures…');
await render(fig1Svg, 'architecture');
await render(fig2Svg, 'results');
console.log('done.');
