/**
 * Whiteboard state store. One slice per *paper hash* — keeps the
 * Pass 1 understanding doc, the Level 1 diagram, the Level 2
 * expansions keyed by parent node id, the verifier results, and the
 * current zoom/breadcrumb stack.
 *
 * Shape mirrors the lens store's per-paper map pattern: instead of one
 * global focused thing we cache by paperHash so switching papers is a
 * cheap lookup, not a re-fetch. The actual Excalidraw scene also
 * lives in the cache so a second click on the Whiteboard tab is
 * instant.
 *
 * Spec: .claude/specs/whiteboard-diagrams.md
 * Methodology doc: docs/methodology/whiteboard.md
 */

import { create } from 'zustand';
import type { WBDiagram, WBNode } from './dsl';

export type WBPipelineStatus =
  | 'idle' // no whiteboard yet, no consent yet
  | 'consent' // user clicked Whiteboard tab; awaiting Generate confirmation
  | 'pass1' // Opus running
  | 'pass2' // Sonnet rendering Level 1
  | 'ready' // Level 1 hydrated, ready for drill-in
  | 'expanding' // Pass 2 (Level 2) running for some node
  | 'failed';

/** Per-paper whiteboard state. Keyed by paperHash. */
export interface PaperWhiteboard {
  status: WBPipelineStatus;
  /** Pass 1 markdown understanding doc — streamed in during pass1 and
   * kept in memory so the streaming sidebar can render incrementally. */
  understanding: string;
  /** Soft-verifier result for citation status. Populated after pass1
   * completes; renderer uses `quoteStatus` to flip the citation
   * marker between solid (verified) and dashed (unverified). */
  verificationRate: number | null;
  quoteStatus: Record<string, { status: 'verified' | 'soft' | 'unverified'; score: number }>;
  /** Level 1 diagram. */
  level1: WBDiagram | null;
  /** Level 2 diagrams keyed by their parent's WBNode.id. */
  level2: Map<string, WBDiagram>;
  /** Per-paper expansion-in-flight set so the canvas can render the
   * spinning ⌖ glyph on the right node while Pass 2 streams. */
  expandingNodeIds: Set<string>;
  /** Current navigation focus inside the whiteboard:
   *   - {kind:'level1'} → Level 1 frame
   *   - {kind:'level2', parentNodeId} → Level 2 frame for that node
   * The breadcrumb renders this stack. */
  focus: { kind: 'level1' } | { kind: 'level2'; parentNodeId: string };
  /** Drill history so the back button knows where to send the user. */
  history: Array<{ kind: 'level1' } | { kind: 'level2'; parentNodeId: string }>;
  /** Cost rollup mirrored from the main process for the optional cost
   * pill the methodology doc could expose. */
  costUsd: number;
  /** Last error surfaced to the renderer, if any. Cleared on retry. */
  error: string | null;
  /** Cached Excalidraw scene JSON the user last saw — kept in memory
   * so a tab-switch returns instantly without re-running ELK. Restored
   * from disk on first open via `whiteboardGet`. */
  excalidrawScene: string | null;
  /** Streaming sidebar contents — Pass 2 raw stream we tee into a
   * collapsible "▾ working" surface so the 5–10s Sonnet wait isn't
   * silent. Cleared when Pass 2 completes. */
  pass2Stream: string;
  /** Absolute path to the per-paper sidecar (`.../sidecars/<hash>/`).
   * Used to compose figure paths for embedding paper figures inside
   * whiteboard nodes. Populated on hydrate. */
  indexPath: string | null;
}

interface WhiteboardState {
  /** paperHash → state slice. */
  byPaper: Map<string, PaperWhiteboard>;
  // ---- selectors ----
  get(paperHash: string): PaperWhiteboard;
  // ---- mutators (granular for fine-grained re-renders) ----
  setStatus(paperHash: string, status: WBPipelineStatus): void;
  appendUnderstanding(paperHash: string, delta: string): void;
  setUnderstanding(paperHash: string, full: string): void;
  setVerifier(
    paperHash: string,
    info: {
      verificationRate: number;
      quoteStatus: Record<string, { status: 'verified' | 'soft' | 'unverified'; score: number }>;
    },
  ): void;
  setLevel1(paperHash: string, diagram: WBDiagram): void;
  setLevel2(paperHash: string, parentNodeId: string, diagram: WBDiagram): void;
  startExpanding(paperHash: string, nodeId: string): void;
  endExpanding(paperHash: string, nodeId: string): void;
  appendPass2Stream(paperHash: string, delta: string): void;
  clearPass2Stream(paperHash: string): void;
  setFocus(
    paperHash: string,
    focus: { kind: 'level1' } | { kind: 'level2'; parentNodeId: string },
  ): void;
  goBack(paperHash: string): void;
  setError(paperHash: string, message: string | null): void;
  setExcalidrawScene(paperHash: string, scene: string | null): void;
  setCost(paperHash: string, costUsd: number): void;
  setIndexPath(paperHash: string, indexPath: string): void;
  /** Reset everything for one paper — useful on retry after a failed
   * generation. */
  reset(paperHash: string): void;
}

const empty = (): PaperWhiteboard => ({
  status: 'idle',
  understanding: '',
  verificationRate: null,
  quoteStatus: {},
  level1: null,
  level2: new Map(),
  expandingNodeIds: new Set(),
  focus: { kind: 'level1' },
  history: [],
  costUsd: 0,
  error: null,
  excalidrawScene: null,
  pass2Stream: '',
  indexPath: null,
});

function withPatch(
  state: WhiteboardState,
  paperHash: string,
  patch: (prev: PaperWhiteboard) => Partial<PaperWhiteboard>,
): { byPaper: Map<string, PaperWhiteboard> } {
  const prev = state.byPaper.get(paperHash) ?? empty();
  const next: PaperWhiteboard = { ...prev, ...patch(prev) };
  const newMap = new Map(state.byPaper);
  newMap.set(paperHash, next);
  return { byPaper: newMap };
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  byPaper: new Map(),

  get(paperHash) {
    return get().byPaper.get(paperHash) ?? empty();
  },

  setStatus(paperHash, status) {
    set((state) => withPatch(state, paperHash, () => ({ status })));
  },

  appendUnderstanding(paperHash, delta) {
    set((state) =>
      withPatch(state, paperHash, (prev) => ({ understanding: prev.understanding + delta })),
    );
  },
  setUnderstanding(paperHash, full) {
    set((state) => withPatch(state, paperHash, () => ({ understanding: full })));
  },

  setVerifier(paperHash, info) {
    set((state) =>
      withPatch(state, paperHash, () => ({
        verificationRate: info.verificationRate,
        quoteStatus: info.quoteStatus,
      })),
    );
  },

  setLevel1(paperHash, diagram) {
    set((state) =>
      withPatch(state, paperHash, () => ({
        level1: applyVerifierToDiagram(diagram, state.byPaper.get(paperHash)?.quoteStatus ?? {}),
        // Default focus once L1 lands.
        focus: { kind: 'level1' },
      })),
    );
  },

  setLevel2(paperHash, parentNodeId, diagram) {
    set((state) => {
      const prev = state.byPaper.get(paperHash) ?? empty();
      const newMap = new Map(prev.level2);
      newMap.set(
        parentNodeId,
        applyVerifierToDiagram(diagram, prev.quoteStatus),
      );
      return withPatch(state, paperHash, () => ({ level2: newMap }));
    });
  },

  startExpanding(paperHash, nodeId) {
    set((state) => {
      const prev = state.byPaper.get(paperHash) ?? empty();
      const newSet = new Set(prev.expandingNodeIds);
      newSet.add(nodeId);
      return withPatch(state, paperHash, () => ({
        expandingNodeIds: newSet,
        status: 'expanding',
        pass2Stream: '',
      }));
    });
  },

  endExpanding(paperHash, nodeId) {
    set((state) => {
      const prev = state.byPaper.get(paperHash) ?? empty();
      const newSet = new Set(prev.expandingNodeIds);
      newSet.delete(nodeId);
      return withPatch(state, paperHash, () => ({
        expandingNodeIds: newSet,
        status: newSet.size === 0 ? 'ready' : 'expanding',
      }));
    });
  },

  appendPass2Stream(paperHash, delta) {
    set((state) =>
      withPatch(state, paperHash, (prev) => ({ pass2Stream: prev.pass2Stream + delta })),
    );
  },
  clearPass2Stream(paperHash) {
    set((state) => withPatch(state, paperHash, () => ({ pass2Stream: '' })));
  },

  setFocus(paperHash, focus) {
    set((state) =>
      withPatch(state, paperHash, (prev) => {
        // Idempotent — clicking the same drillable node twice shouldn't
        // bloat the history stack with duplicates.
        const same =
          prev.focus.kind === focus.kind &&
          (prev.focus.kind === 'level1'
            ? true
            : prev.focus.parentNodeId === (focus as { parentNodeId: string }).parentNodeId);
        if (same) return {};
        return {
          focus,
          history: [...prev.history, prev.focus],
        };
      }),
    );
  },

  goBack(paperHash) {
    set((state) =>
      withPatch(state, paperHash, (prev) => {
        if (prev.history.length === 0) return { focus: { kind: 'level1' as const } };
        const next = prev.history[prev.history.length - 1];
        return {
          focus: next,
          history: prev.history.slice(0, -1),
        };
      }),
    );
  },

  setError(paperHash, message) {
    set((state) =>
      withPatch(state, paperHash, () => ({
        error: message,
        ...(message ? { status: 'failed' as const } : {}),
      })),
    );
  },

  setExcalidrawScene(paperHash, scene) {
    set((state) => withPatch(state, paperHash, () => ({ excalidrawScene: scene })));
  },

  setCost(paperHash, costUsd) {
    set((state) => withPatch(state, paperHash, () => ({ costUsd })));
  },

  setIndexPath(paperHash, indexPath) {
    set((state) => withPatch(state, paperHash, () => ({ indexPath })));
  },

  reset(paperHash) {
    set((state) => {
      const newMap = new Map(state.byPaper);
      newMap.set(paperHash, empty());
      return { byPaper: newMap };
    });
  },
}));

/** Apply verifier results to a diagram so its citation markers carry
 * the right verified/unverified flag at render time. We do this at
 * setLevel1/setLevel2 time so the renderer doesn't have to re-walk
 * the diagram on every render. */
function applyVerifierToDiagram(
  diagram: WBDiagram,
  quoteStatus: Record<string, { status: 'verified' | 'soft' | 'unverified'; score: number }>,
): WBDiagram {
  if (Object.keys(quoteStatus).length === 0) return diagram;
  const nodes: WBNode[] = diagram.nodes.map((n) => {
    if (!n.citation?.quote) return n;
    const lookup = quoteStatus[n.citation.quote];
    if (!lookup) return n;
    return {
      ...n,
      citation: {
        ...n.citation,
        verified: lookup.status === 'verified' || lookup.status === 'soft',
        verifyScore: lookup.score,
      },
    };
  });
  return { ...diagram, nodes };
}
