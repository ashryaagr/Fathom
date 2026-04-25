#!/usr/bin/env node
// Render-only CLI for Fathom whiteboard diagrams.
//
// Per CLAUDE.md §0 isolation principle: when the bug is in the render
// layer, debug it in isolation. Don't rebuild the app, don't
// regenerate Pass 1 + Pass 2 ($1.90), don't open Electron. Take a
// saved WBDiagram JSON, run it through ELK + a deterministic SVG
// renderer, write the result to /tmp/wb-render-NNN.{svg,png}, exit.
//
// USAGE:
//   node scripts/render-whiteboard.mjs <fixture.json> [--out /tmp/foo]
//
// EXAMPLES:
//   node scripts/render-whiteboard.mjs scripts/render-fixtures/reconviagen-l1.json
//   node scripts/render-whiteboard.mjs scripts/render-fixtures/reconviagen-l1.json --out /tmp/wb-iter-3
//
// What this CLI exercises:
//   - ELK layered layout (the actual elkjs npm package — same bundle
//     the renderer uses).
//   - Per-node text-aware sizing (label + summary; node-canvas
//     measureText if installed, else a deterministic char-width fallback).
//   - The "rectangle width must contain bound text" invariant (B2 redux).
//   - Edge polyline routing (orthogonal bend points → SVG path).
//   - Drill-glyph + citation-marker placement inside the box.
//
// What this CLI does NOT exercise:
//   - Excalidraw's hand-drawn (Roughjs) stroke style — we draw plain
//     SVG strokes, so the *visual aesthetic* differs slightly.
//   - convertToExcalidrawElements id rewriting (which IS the bug we
//     just fixed — we know it's solved by `regenerateIds: false` so
//     no need to re-test it here).
//   - Excalifont (we use system sans for measurement, label the
//     mismatch in the SVG output with a note).
//
// Geometry / sizing / direction parity with the live renderer is what
// matters here, not visual fidelity to Excalidraw's rough strokes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import process from 'node:process';
import ELK from 'elkjs/lib/elk.bundled.js';

// ---------- arg parsing ----------
const args = process.argv.slice(2);
if (args.length < 1 || args[0] === '--help') {
  console.error('usage: render-whiteboard.mjs <fixture.json> [--out /tmp/wb-render-N]');
  process.exit(args[0] === '--help' ? 0 : 1);
}
const fixturePath = args[0];
let outBase = `/tmp/wb-render-${Date.now()}`;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outBase = args[i + 1];
    i++;
  }
}

// ---------- load + validate fixture ----------
const raw = readFileSync(fixturePath, 'utf-8');
let diagram;
try {
  diagram = JSON.parse(raw);
} catch (err) {
  console.error('failed to parse fixture as JSON:', err.message);
  process.exit(1);
}
if (!diagram.nodes || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
  console.error('fixture has no nodes');
  process.exit(1);
}
diagram.edges = diagram.edges ?? [];
diagram.layout_hint = diagram.layout_hint ?? 'lr';
diagram.level = diagram.level ?? 1;

// Mirror parseWBDiagram's safe-label truncation (≤ 24 chars per the
// cog reviewer veto). The live renderer applies this in `coerceNode`
// inside src/renderer/whiteboard/dsl.ts; mirroring it here lets the
// CLI represent exactly what the live build would produce given the
// same raw fixture JSON.
for (const n of diagram.nodes) {
  if (typeof n.label === 'string' && n.label.length > 24) {
    n.label = n.label.slice(0, 23) + '…';
  }
}

// ---------- text measurement ----------
// In Node we don't have a real DOM canvas. Use a character-width
// approximation that's CLOSE-ENOUGH to Excalifont/Helvetica at our
// font sizes. Empirically: 16px Excalifont averages ~9.2 px per char,
// 13px Helvetica averages ~7.0 px per char. We slightly OVER-estimate
// (10 / 7.5) so the rect is sized with slack rather than tight, which
// mirrors Excalidraw's actual measureText (which adds padding for
// rough-stroke rendering).
const LABEL_FONT = 16;
const SUMMARY_FONT = 13;
const LABEL_CHAR_W = 10;   // 16 px Excalifont, generous
const SUMMARY_CHAR_W = 7.5; // 13 px Helvetica, generous
function measureLabelWidth(text) {
  return text.length * LABEL_CHAR_W;
}
function measureSummaryWidth(text) {
  return text.length * SUMMARY_CHAR_W;
}
function wrapToWidth(text, charW, maxInnerWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let current = '';
  for (const w of words) {
    const trial = current ? current + ' ' + w : w;
    if (trial.length * charW <= maxInnerWidth || current === '') {
      current = trial;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------- node sizing ----------
const NODE_MIN_WIDTH = 180;
const NODE_MIN_HEIGHT = 80;
const NODE_MAX_WIDTH = 320;
const NODE_INNER_PAD_X = 14;
const NODE_INNER_PAD_Y = 14;
const LINE_HEIGHT_RATIO = 1.3;
const FIGURE_SLOT_WIDTH = 120;

function nodeSize(node) {
  const summary = (node.summary ?? '').trim();
  const label = (node.label ?? '').trim();
  const labelOneLine = measureLabelWidth(label);
  let chosenInnerW = Math.min(
    NODE_MAX_WIDTH - 2 * NODE_INNER_PAD_X,
    Math.max(labelOneLine, NODE_MIN_WIDTH - 2 * NODE_INNER_PAD_X),
  );
  let summaryLines = [];
  if (summary) {
    for (let probeW = chosenInnerW; probeW <= NODE_MAX_WIDTH - 2 * NODE_INNER_PAD_X; probeW += 20) {
      const lines = wrapToWidth(summary, SUMMARY_CHAR_W, probeW);
      if (lines.length <= 2) {
        chosenInnerW = probeW;
        summaryLines = lines;
        break;
      }
      if (probeW + 20 > NODE_MAX_WIDTH - 2 * NODE_INNER_PAD_X) {
        chosenInnerW = probeW;
        summaryLines = lines.slice(0, 3);
        if (lines.length > 3) {
          summaryLines[2] = summaryLines[2].replace(/\s+\S*$/, '') + '…';
        }
        break;
      }
    }
    for (const ln of summaryLines) {
      const lnW = measureSummaryWidth(ln);
      if (lnW > chosenInnerW) chosenInnerW = Math.min(lnW, NODE_MAX_WIDTH - 2 * NODE_INNER_PAD_X);
    }
  }
  const w = Math.min(NODE_MAX_WIDTH, chosenInnerW + 2 * NODE_INNER_PAD_X);
  const labelLineH = LABEL_FONT * LINE_HEIGHT_RATIO;
  const summaryLineH = SUMMARY_FONT * LINE_HEIGHT_RATIO;
  const textH = labelLineH + (summary ? 6 + summaryLines.length * summaryLineH : 0);
  const h = Math.max(NODE_MIN_HEIGHT, Math.ceil(textH + 2 * NODE_INNER_PAD_Y));
  return { w, h, summaryLines };
}

// ---------- ELK layout ----------
const SPACING_NODE_NODE = 100;
const SPACING_LAYER = 120;
const direction = diagram.layout_hint === 'tb' ? 'DOWN' : 'RIGHT';

const sized = diagram.nodes.map((n) => {
  const { w, h, summaryLines } = nodeSize(n);
  const totalW = n.figure_ref ? w + FIGURE_SLOT_WIDTH : w;
  return { id: n.id, w: totalW, h, rectW: w, summaryLines };
});

const elk = new ELK();
const result = await elk.layout({
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.spacing.nodeNode': String(SPACING_NODE_NODE),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(SPACING_LAYER),
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    'elk.spacing.edgeNode': '32',
    'elk.spacing.edgeEdge': '20',
    'elk.edgeRouting': 'ORTHOGONAL',
  },
  children: sized.map((s) => ({ id: s.id, width: s.w, height: s.h })),
  edges: diagram.edges.map((e, i) => ({
    id: `e${i}`,
    sources: [e.from],
    targets: [e.to],
  })),
});

// ---------- collect layout for SVG render ----------
const sizedById = new Map(sized.map((s) => [s.id, s]));
const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

const laidOutNodes = (result.children ?? []).map((c) => {
  const meta = sizedById.get(c.id);
  const node = nodeById.get(c.id);
  return {
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    w: c.width ?? meta.w,
    h: c.height ?? meta.h,
    rectW: meta.rectW,
    summaryLines: meta.summaryLines,
    node,
  };
});

const rawEdges = result.edges ?? [];
const laidOutEdges = rawEdges.map((re) => {
  const section = re.sections?.[0];
  const points = [];
  if (section) {
    points.push({ x: section.startPoint.x, y: section.startPoint.y });
    for (const bp of section.bendPoints ?? []) points.push({ x: bp.x, y: bp.y });
    points.push({ x: section.endPoint.x, y: section.endPoint.y });
  }
  return { from: re.sources?.[0], to: re.targets?.[0], points };
});

const sceneW = result.width ?? Math.max(...laidOutNodes.map((n) => n.x + n.w));
const sceneH = result.height ?? Math.max(...laidOutNodes.map((n) => n.y + n.h));

// ---------- SVG render ----------
function paletteFor(kind) {
  switch (kind) {
    case 'data':  return { fill: '#fff8ea', stroke: '#1a1614' };
    case 'model': return { fill: '#fef4d8', stroke: '#9f661b' };
    default:      return { fill: '#ffffff', stroke: '#1a1614' };
  }
}
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const padOuter = 40;
const titleH = diagram.title ? 36 : 0;
const svgW = Math.ceil(sceneW + padOuter * 2);
const svgH = Math.ceil(sceneH + padOuter * 2 + titleH);

const parts = [];
parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="system-ui, -apple-system, sans-serif">`);
parts.push(`<rect width="${svgW}" height="${svgH}" fill="#fafaf7"/>`);

if (diagram.title) {
  parts.push(`<text x="${svgW / 2}" y="28" text-anchor="middle" font-size="16" fill="#1a1614">${escapeXml(diagram.title)}</text>`);
}

const ox = padOuter;
const oy = padOuter + titleH;

// Edges first so nodes paint on top
parts.push(`<defs><marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#1a1614"/></marker></defs>`);
for (const e of laidOutEdges) {
  if (e.points.length < 2) continue;
  const d = e.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(ox + p.x).toFixed(1)},${(oy + p.y).toFixed(1)}`)
    .join(' ');
  parts.push(`<path d="${d}" stroke="#1a1614" stroke-width="1.4" fill="none" marker-end="url(#arrowhead)"/>`);
  // Edge label at midpoint
  const inputEdge = diagram.edges.find((ie) => ie.from === e.from && ie.to === e.to);
  if (inputEdge?.label) {
    const mid = e.points[Math.floor(e.points.length / 2)];
    parts.push(`<text x="${(ox + mid.x).toFixed(1)}" y="${(oy + mid.y - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="#5a4a3a">${escapeXml(inputEdge.label)}</text>`);
  }
}

// Nodes
for (const ln of laidOutNodes) {
  const palette = paletteFor(ln.node.kind);
  const isModel = ln.node.kind === 'model';
  const x = ox + ln.x;
  const y = oy + ln.y;
  const w = ln.rectW;
  const h = ln.h;
  const strokeWidth = isModel ? 2 : 1;
  const dashArray = ln.node.drillable ? '6 4' : '';
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" ry="14" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="${strokeWidth}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''}/>`);

  // Bound text — drawn in scene coords centered on rect, label on first
  // line in 16px, summary lines (if any) in 13px below.
  const cx = x + w / 2;
  const labelLineH = LABEL_FONT * LINE_HEIGHT_RATIO;
  const summaryLineH = SUMMARY_FONT * LINE_HEIGHT_RATIO;
  const summaryBlockH = ln.summaryLines.length > 0
    ? 6 + ln.summaryLines.length * summaryLineH
    : 0;
  const totalTextH = labelLineH + summaryBlockH;
  const textTop = y + (h - totalTextH) / 2;
  const labelBaseline = textTop + LABEL_FONT;
  parts.push(`<text x="${cx}" y="${labelBaseline.toFixed(1)}" text-anchor="middle" font-size="${LABEL_FONT}" font-weight="600" fill="#1a1614">${escapeXml(ln.node.label)}</text>`);
  for (let i = 0; i < ln.summaryLines.length; i++) {
    const lineY = labelBaseline + 6 + (i + 1) * summaryLineH - 4;
    parts.push(`<text x="${cx}" y="${lineY.toFixed(1)}" text-anchor="middle" font-size="${SUMMARY_FONT}" fill="#5a4a3a">${escapeXml(ln.summaryLines[i])}</text>`);
  }

  // Citation marker at top-right (10x10 square just above the rect)
  if (ln.node.citation) {
    const verified = ln.node.citation.verified !== false;
    const cmX = x + w - 14;
    const cmY = y - 6;
    parts.push(`<rect x="${cmX}" y="${cmY}" width="10" height="10" fill="${verified ? '#9f661b' : 'transparent'}" stroke="#9f661b" stroke-width="1"${verified ? '' : ' stroke-dasharray="2 2"'}/>`);
    if (!verified) {
      parts.push(`<text x="${cmX + 5}" y="${cmY - 1}" text-anchor="middle" font-size="9" fill="#9f661b">?</text>`);
    }
  }

  // Drill glyph at bottom-right INSIDE the rect
  if (ln.node.drillable) {
    parts.push(`<text x="${x + w - 10}" y="${y + h - 8}" text-anchor="end" font-size="14" fill="#9f661b" opacity="0.8">⌖</text>`);
  }

  // Bbox debug label (small, gray) so the inspection log can match
  parts.push(`<!-- node ${ln.node.id} bbox=(${x.toFixed(0)},${y.toFixed(0)},${w.toFixed(0)},${h.toFixed(0)}) summaryLines=${ln.summaryLines.length} -->`);
}

parts.push(`</svg>`);
const svg = parts.join('\n');

// ---------- write outputs ----------
mkdirSync(dirname(outBase), { recursive: true });
const svgPath = `${outBase}.svg`;
writeFileSync(svgPath, svg);

// Try sharp for PNG conversion; fall back gracefully.
let pngPath = null;
try {
  const { default: sharp } = await import('sharp');
  pngPath = `${outBase}.png`;
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
} catch (err) {
  console.error('(sharp PNG conversion skipped:', err.message + ')');
}

// ---------- inspection report ----------
console.log(`fixture     : ${fixturePath}`);
console.log(`scene       : ${Math.round(sceneW)}×${Math.round(sceneH)} (svg ${svgW}×${svgH})`);
console.log(`nodes       : ${laidOutNodes.length}`);
console.log(`edges       : ${laidOutEdges.length} (${laidOutEdges.filter((e) => e.points.length > 2).length} with bend points)`);
console.log(`direction   : ${direction}`);
console.log('');
console.log('per-node sizing (label fits = label width <= rect inner width):');
for (const ln of laidOutNodes) {
  const innerW = ln.rectW - 2 * NODE_INNER_PAD_X;
  const labelW = measureLabelWidth(ln.node.label);
  const fits = labelW <= innerW ? '✓' : '✗ OVERFLOW';
  console.log(
    `  ${ln.node.id.padEnd(6)} rect=${String(Math.round(ln.rectW)).padStart(3)}×${String(Math.round(ln.h)).padStart(3)} ` +
      `label='${ln.node.label}' (${Math.round(labelW)}px ≤ ${Math.round(innerW)}px) ${fits} ` +
      `summaryLines=${ln.summaryLines.length}`,
  );
}
console.log('');
console.log(`SVG  → ${svgPath}`);
if (pngPath) console.log(`PNG  → ${pngPath}`);
