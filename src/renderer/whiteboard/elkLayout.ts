/**
 * ELK.js auto-layout for WBDiagrams. The model emits nodes + edges
 * with no positions; we feed them into Eclipse Layout Kernel for
 * deterministic, hierarchical placement, then return the laid-out
 * coordinates the Excalidraw scene needs.
 *
 * Why ELK and not dagre / cytoscape:
 * - ELK ships a ready-built worker bundle (`elkjs/lib/elk-worker.min.js`)
 *   so layout runs off the renderer's main thread — important since
 *   we may run ≥6 layouts back-to-back during the Level 1 + Level 2
 *   hydration burst.
 * - The "layered" algorithm is the canonical Sugiyama for left-right
 *   pipelines, which is exactly what every Level 1 looks like
 *   (input → process → output).
 * - The same engine Excalidraw's own Mermaid-import path uses, so the
 *   visual rhythm matches what users have already seen elsewhere.
 *
 * Layout choices intentionally left simple — the ≤5 node ceiling
 * means pathological layouts can't happen. If a future Level 3 ever
 * lands and needs richer routing, this is the file to revisit.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ELK as ElkInstanceType } from 'elkjs/lib/elk-api';
import type { WBDiagram, WBLayoutHint } from './dsl';

// One ELK instance reused across calls. Lazily constructed on first
// layout — Electron's main thread keeps the Worker alive between
// renders, which avoids a ~50 ms startup cost on every drill-in.
let elkInstance: ElkInstanceType | null = null;
function elk(): ElkInstanceType {
  if (elkInstance) return elkInstance;
  // Use the bundled (no-worker) build so we don't fight Electron's
  // sandboxing of Worker URLs in the renderer. The bundle is small
  // (~600 KB) and runs synchronously enough for our ≤5-node layouts.
  elkInstance = new ELK();
  return elkInstance;
}

/** Approximate node dimensions used during layout. The actual
 * Excalidraw rendered widths/heights match these so the user sees the
 * laid-out positions exactly. Stays in CSS-pixel units (which
 * Excalidraw treats as scene units). v2 sizes are larger than v1
 * because (a) bound text was overflowing 160×70 boxes at 16 px
 * Excalifont — Excalidraw does not auto-shrink, it just clips — and
 * (b) summaries up to 30 words need a third line of headroom. The
 * per-node sizing in `nodeSize()` adds slack for figure-bearing nodes
 * so the embedded PNG sits in a side gutter, not inside the rect. */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 90;
const NODE_HEIGHT_WITH_SUMMARY = 130;
/** Extra horizontal slot for an embedded paper figure. The figure
 * itself is ~100 px wide; the spacing keeps it from kissing the next
 * column when ELK lays nodes out left-to-right. */
const FIGURE_SLOT_WIDTH = 120;
const SPACING_NODE_NODE = 80;
const SPACING_LAYER = 100;

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  /** Polyline points (x,y pairs) including start + end. Empty edges
   * use a straight line from source-center to target-center, drawn by
   * the Excalidraw arrow element directly. */
  points: Array<{ x: number; y: number }>;
}

export interface LaidOutDiagram {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

/**
 * Run ELK on a WBDiagram. Returns positions in CSS pixels relative to
 * the diagram's top-left.
 */
export async function layoutDiagram(d: WBDiagram): Promise<LaidOutDiagram> {
  const direction = elkDirection(d.layout_hint);
  const t0 = performance.now();

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(SPACING_NODE_NODE),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(SPACING_LAYER),
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      // Reasonable arrow routing — straight where possible, orthogonal
      // when crossings make a diagonal too cluttered.
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: d.nodes.map((n) => {
      const { w, h } = nodeSize(n.summary, !!n.figure_ref);
      return { id: n.id, width: w, height: h };
    }),
    edges: d.edges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.from],
      targets: [e.to],
    })),
  };

  let result: ElkNode;
  try {
    result = await elk().layout(graph);
  } catch (err) {
    // Fall back to a deterministic horizontal layout if ELK throws —
    // better than a blank canvas. Errors here are rare (we control
    // the input shape) but never let them break the user's flow.
    console.warn('[Whiteboard Render] ELK layout failed; using fallback line layout', err);
    return fallbackLineLayout(d);
  }

  const nodes: LaidOutNode[] = (result.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? NODE_WIDTH,
    height: c.height ?? NODE_HEIGHT,
  }));

  const edges: LaidOutEdge[] = [];
  // ELK puts edges as `result.edges` (since we gave them at root).
  type ElkRootEdge = { sources?: string[]; targets?: string[]; sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }> };
  const rawEdges = ((result as unknown as { edges?: ElkRootEdge[] }).edges ?? []) as ElkRootEdge[];
  for (const re of rawEdges) {
    const from = re.sources?.[0];
    const to = re.targets?.[0];
    if (!from || !to) continue;
    const section = re.sections?.[0];
    const points: Array<{ x: number; y: number }> = [];
    if (section) {
      points.push({ x: section.startPoint.x, y: section.startPoint.y });
      for (const bp of section.bendPoints ?? []) points.push({ x: bp.x, y: bp.y });
      points.push({ x: section.endPoint.x, y: section.endPoint.y });
    }
    edges.push({ from, to, points });
  }

  // Compute overall bounds so the caller can size the parent frame.
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const width = result.width ?? Math.max(maxX, NODE_WIDTH);
  const height = result.height ?? Math.max(maxY, NODE_HEIGHT);

  console.log(
    `[Whiteboard Render] ELK layout: ${nodes.length} nodes, ${edges.length} edges, ` +
      `${Math.round(width)}×${Math.round(height)}, t=${Math.round(performance.now() - t0)}ms`,
  );

  return { width, height, nodes, edges };
}

function elkDirection(hint: WBLayoutHint | undefined): string {
  return hint === 'tb' ? 'DOWN' : 'RIGHT';
}

/** Compute the box dimensions for a node based on whether it has a
 * summary line and an embedded paper figure. Exposed so the toExcalidraw
 * layer can size figure-bearing rects identically. */
export function nodeSize(
  summary: string | undefined,
  hasFigure: boolean,
): { w: number; h: number } {
  const baseW = summary ? NODE_WIDTH : NODE_WIDTH;
  const baseH = summary ? NODE_HEIGHT_WITH_SUMMARY : NODE_HEIGHT;
  // Figure-bearing nodes get extra horizontal slack so the embedded
  // PNG sits to the right of the rect without overlapping a sibling.
  return { w: hasFigure ? baseW + FIGURE_SLOT_WIDTH : baseW, h: baseH };
}

/** Deterministic horizontal layout used when ELK throws. Stacks nodes
 * left-to-right with simple spacing. Edges become straight lines
 * (rendered by Excalidraw with their own routing). */
function fallbackLineLayout(d: WBDiagram): LaidOutDiagram {
  const nodes: LaidOutNode[] = [];
  let x = 0;
  for (const n of d.nodes) {
    const { w, h } = nodeSize(n.summary, !!n.figure_ref);
    nodes.push({ id: n.id, x, y: 0, width: w, height: h });
    x += w + SPACING_NODE_NODE;
  }
  const width = Math.max(0, x - SPACING_NODE_NODE);
  const height = NODE_HEIGHT_WITH_SUMMARY;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LaidOutEdge[] = d.edges.map((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return { from: e.from, to: e.to, points: [] };
    return {
      from: e.from,
      to: e.to,
      points: [
        { x: a.x + a.width, y: a.y + a.height / 2 },
        { x: b.x, y: b.y + b.height / 2 },
      ],
    };
  });
  return { width, height, nodes, edges };
}
