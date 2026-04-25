/**
 * Whiteboard tab — the React component that wraps Excalidraw and
 * orchestrates the per-paper Pass 1 + Pass 2 + drill-in flow.
 *
 * Flow:
 *   1. On mount, ask main for status. If `idle`, show the consent
 *      affordance. If `ready`, hydrate from disk and render.
 *   2. On consent accept, kick off `whiteboardGenerate`. While Pass 1
 *      streams, show the placeholder skeleton + streaming sidebar.
 *   3. When Pass 2 done, parse the WBDiagram, run ELK, convert to
 *      Excalidraw skeletons, mount in a frame at the origin.
 *   4. On click of a drillable node:
 *        - Doherty-paint immediately: parent-frame outline + spinning
 *          ⌖ glyph on the clicked node within 50ms.
 *        - Fire `whiteboardExpand` for that node id.
 *        - When the Pass 2 result lands, parse + ELK + Excalidraw and
 *          place the new frame to the right of the parent. Animate
 *          `scrollToContent` to it (320ms cubic-bezier) so the user
 *          feels they zoomed inside the parent.
 *
 * Spec: .claude/specs/whiteboard-diagrams.md
 * Methodology: docs/methodology/whiteboard.md (kept in sync with this file)
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { convertToExcalidrawElements, exportToCanvas } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { OpenDocument } from '../state/document';
import { useWhiteboardStore, type PaperWhiteboard } from './store';
import { parseWBDiagram, type WBDiagram } from './dsl';
import { layoutDiagram } from './elkLayout';
import { diagramToSkeleton, diagramBoundingBox, type WBNodeCustomData } from './toExcalidraw';
import WhiteboardConsent from './WhiteboardConsent';
import WhiteboardBreadcrumb from './WhiteboardBreadcrumb';
import WhiteboardStreamingSidebar from './WhiteboardStreamingSidebar';

// Excalidraw is heavy (~1 MB); lazy-load it so the app shell doesn't
// pay for it until the user actually opens a Whiteboard tab.
const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then((m) => ({ default: m.Excalidraw })),
);

interface Props {
  document: OpenDocument;
  /** Callback to open a PDF lens at a given page+text — wired into the
   * citation marker click handler so ⌘+click jumps to a Fathom lens
   * on the source paragraph. Plain click jumps the PDF tab to that
   * paragraph and pulses it. */
  onJumpToPage?: (page: number, quote: string | null, openLens: boolean) => void;
}

/** Approx. horizontal slot allocated to the L1 frame at origin. Level
 * 2 frames lay out to the right of this with this much gap. */
/** Used as the x-fallback when we can't find the parent rect (e.g.
 * the Excalidraw scene was hydrated from disk but the per-element
 * customData doesn't expose `nodeId`). Picks the visual middle of a
 * "typical" 5-node Level 1 row so the dropped Level 2 doesn't fly
 * off-canvas. */
const L1_LAYOUT_WIDTH = 1200;

export default function WhiteboardTab({ document: doc, onJumpToPage }: Props) {
  const paperHash = doc.contentHash;
  const wb = useWhiteboardStore((s) => s.byPaper.get(paperHash));
  const store = useWhiteboardStore();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // Generation handle so a tab-switch doesn't leak an in-flight call.
  const generateHandleRef = useRef<{ abort: () => void } | null>(null);
  const expandHandlesRef = useRef<Map<string, { abort: () => void }>>(new Map());
  // Scene-mount tracking: which nodeIds have we already laid out in
  // the canvas? Stops us from re-layouting the same diagram on every
  // re-render.
  const mountedFramesRef = useRef<Set<string>>(new Set());
  // Track per-node bounding boxes so click handlers + scrollToContent
  // can find the right rectangle without walking customData each time.
  const frameBoundsRef = useRef<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());

  // -----------------------------------------------------------------
  // Hydration: ask main for any persisted whiteboard for this paper.
  // Runs once per paperHash change. Populates the store + scene.
  // -----------------------------------------------------------------
  const hydratedForPaperRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedForPaperRef.current === paperHash) return;
    hydratedForPaperRef.current = paperHash;
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.lens.whiteboardGet(paperHash);
        if (cancelled) return;
        if (result.indexPath) store.setIndexPath(paperHash, result.indexPath);
        if (result.understanding) store.setUnderstanding(paperHash, result.understanding);
        if (result.scene) {
          store.setExcalidrawScene(paperHash, result.scene);
        }
        // Parse issues for verifier rehydration so citation markers
        // render with the right verified/unverified affordance on
        // first paint after a reopen.
        if (result.issues) {
          try {
            const parsed = JSON.parse(result.issues) as {
              verificationRate?: number;
              issues?: Array<{ quote: string; status: 'verified' | 'soft' | 'unverified'; score: number }>;
            };
            if (parsed.issues) {
              const quoteStatus: Record<
                string,
                { status: 'verified' | 'soft' | 'unverified'; score: number }
              > = {};
              for (const i of parsed.issues) {
                quoteStatus[i.quote] = { status: i.status, score: i.score };
              }
              store.setVerifier(paperHash, {
                verificationRate: parsed.verificationRate ?? 1,
                quoteStatus,
              });
            }
          } catch {
            /* malformed issues file — non-fatal */
          }
        }
        // Status: ready iff a scene exists, otherwise idle (consent
        // surface). The intermediate pass1/pass2 statuses are
        // session-scoped so we never restore them.
        if (result.scene && result.understanding) {
          store.setStatus(paperHash, 'ready');
        } else {
          store.setStatus(paperHash, 'idle');
        }
      } catch (err) {
        console.warn('[WhiteboardTab] hydrate failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperHash, store]);

  // -----------------------------------------------------------------
  // Doherty placeholder skeleton mounted on first tab visit.
  // -----------------------------------------------------------------
  const skeletonMountedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!api) return;
    if (wb?.status !== 'pass1' && wb?.status !== 'pass2') return;
    if (skeletonMountedRef.current === paperHash) return;
    skeletonMountedRef.current = paperHash;
    mountSkeleton(api);
  }, [api, wb?.status, paperHash]);

  // -----------------------------------------------------------------
  // Render Level 1 once the store has it. Then eagerly pre-warm every
  // drillable node's Level 2 expansion in parallel — each L2 call
  // hits the cached Pass 1 prefix so they're cheap (~$0.005 + ~5s
  // each), and running them concurrently turns the worst-case "user
  // clicks → wait 8 s for first L2" into "user clicks → it's already
  // there or close to it." Per the team-lead spec: "Run all Pass 2
  // expansions in parallel as Promise.all (each L2 is independent
  // given the cached prefix)." If the user closes the tab mid-warm
  // the abort controllers in expandHandlesRef cancel the in-flight
  // calls.
  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // Hydrate-from-disk fit: when a scene loads from `whiteboard.excalidraw`
  // (status='ready' but no fresh L1 mount happens), Excalidraw restores
  // the saved appState including `zoom`/`scrollX`/`scrollY` (allowlisted
  // in sanitiseAppStateForDisk so the user's pan/zoom across sessions
  // round-trips). The downside: the previous session's saved zoom
  // might be tiny (e.g. 10%) so the diagram appears as a small cluster
  // in the corner. Fire scrollToContent once after the API mounts on
  // a hydrated scene to fit the diagram cleanly. Guarded by a ref so
  // we don't fight subsequent user pan/zoom.
  // -----------------------------------------------------------------
  const hydratedFitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!api) return;
    if (!wb || wb.status !== 'ready') return;
    // Only fit on hydrate-from-disk (no live L1 mount happened this
    // session). When the L1 mount runs, IT calls scrollToContent
    // already; firing again here would fight that animation.
    if (mountedFramesRef.current.has('L1')) return;
    if (hydratedFitRef.current === paperHash) return;
    hydratedFitRef.current = paperHash;
    // Defer one tick so Excalidraw has finished applying initialData
    // (otherwise scrollToContent runs against an empty scene).
    const id = window.requestAnimationFrame(() => {
      try {
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
      } catch {
        /* api disposed mid-mount — non-fatal */
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [api, wb, paperHash]);

  useEffect(() => {
    if (!api) return;
    if (!wb?.level1) return;
    if (mountedFramesRef.current.has('L1')) return;
    void mountLevel1Frame(api, wb.level1, paperHash).then((bounds) => {
      mountedFramesRef.current.add('L1');
      if (bounds) {
        frameBoundsRef.current.set('L1', bounds);
        // First paint: scroll the canvas so Level 1 fits cleanly.
        api.scrollToContent(undefined, { fitToContent: true, animate: true, duration: 320 });
      }
      // Persist the scene to disk so a reopen restores instantly.
      void persistScene(api, paperHash, store);
      // Pre-warm Level 2 expansions for every drillable node IN
      // PARALLEL. We don't await — the per-call result handler
      // installs the L2 frame as it lands.
      const drillable = wb.level1?.nodes.filter((n) => n.drillable) ?? [];
      if (drillable.length > 0) {
        console.log(
          `[Whiteboard UI] pre-warming ${drillable.length} Level 2 expansion(s) in parallel`,
        );
        for (const node of drillable) {
          // Skip if already mounted or in flight.
          if (mountedFramesRef.current.has(`L2:${node.id}`)) continue;
          if (expandHandlesRef.current.has(node.id)) continue;
          void runExpand(paperHash, node.id, node.label, store, expandHandlesRef);
        }
      }
    });
  }, [api, wb?.level1, paperHash, store]);

  // -----------------------------------------------------------------
  // Render Level 2 when one lands. Position it to the right of L1.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!api || !wb) return;
    for (const [parentId, diagram] of wb.level2) {
      const frameKey = `L2:${parentId}`;
      if (mountedFramesRef.current.has(frameKey)) continue;
      void mountLevel2Frame(api, diagram, parentId, paperHash).then((bounds) => {
        mountedFramesRef.current.add(frameKey);
        if (bounds) frameBoundsRef.current.set(frameKey, bounds);
        // If the user is currently focused on this Level 2, animate
        // the canvas into view.
        if (
          wb.focus.kind === 'level2' &&
          wb.focus.parentNodeId === parentId &&
          bounds
        ) {
          // scrollToContent accepts an array of elements; we hand it
          // the bounding rect via a synthetic invisible rectangle.
          // Simpler: scroll the API to the bounds via a refresh +
          // scrollToContent call on the relevant elements.
          api.scrollToContent(undefined, {
            fitToContent: true,
            animate: true,
            duration: 320,
          });
        }
        void persistScene(api, paperHash, store);
      });
    }
  }, [api, wb?.level2, wb?.focus, paperHash, store, wb]);

  // -----------------------------------------------------------------
  // Focus-change → animate scrollToContent so back-clicks animate.
  // Filter by customData.level + parentId so scroll-to-focus works
  // even on hydrated scenes where frameBoundsRef isn't populated
  // (e.g. user reopens the paper, scene loads from disk, no fresh
  // mount happened).
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!api || !wb) return;
    const focus = wb.focus;
    const elements = api
      .getSceneElements()
      .filter((el) => {
        const cd = (el as { customData?: WBNodeCustomData }).customData;
        if (!cd) return false;
        if (focus.kind === 'level1') return cd.level === 1;
        return cd.level === 2 && cd.parentId === focus.parentNodeId;
      });
    if (elements.length === 0) return;
    api.scrollToContent(elements, {
      fitToContent: true,
      animate: true,
      duration: 320,
    });
  }, [api, wb?.focus, wb]);

  // -----------------------------------------------------------------
  // Click handler. Excalidraw fires onPointerDown with the active tool
  // and a PointerDownState; the hit element (if any) is at
  // `pointerDownState.hit.element`. We branch on `customData.fathomKind`:
  //   - wb-node + drillable → expand into Level 2
  //   - wb-citation → open PDF tab + jump to source paragraph
  //   - wb-drill-glyph → same as wb-node click (clickable target is
  //     larger than the rect alone)
  //
  // Excalidraw doesn't pass us the underlying React event in
  // onPointerDown for v0.18; we read modifier keys off the global
  // event via window.event as a backup so ⌘+click still resolves.
  // (Caveat: this is renderer-only — no SSR consideration.)
  // -----------------------------------------------------------------
  const handlePointerDown = useCallback(
    (
      _activeTool: unknown,
      pointerDownState: unknown,
    ) => {
      // Excalidraw types `customData` as Record<string, any> on
      // every element so we can't get a structural narrowing here —
      // cast through unknown to our WBNodeCustomData (which IS what
      // the diagram-to-skeleton converter writes).
      const hit =
        (pointerDownState as { hit?: { element?: { customData?: Record<string, unknown> } | null } })
          .hit ?? null;
      const el = hit?.element ?? null;
      const cd = el?.customData as WBNodeCustomData | undefined;
      if (!cd || !cd.fathomKind) return;
      const evt = (window as unknown as { event?: { metaKey?: boolean } }).event;
      const isMeta = !!evt?.metaKey;

      if (cd.fathomKind === 'wb-citation' && cd.citation) {
        if (typeof cd.citation.page === 'number' && onJumpToPage) {
          onJumpToPage(cd.citation.page, cd.citation.quote ?? null, isMeta);
        }
        return;
      }
      if (
        (cd.fathomKind === 'wb-node' || cd.fathomKind === 'wb-drill-glyph') &&
        cd.drillable &&
        cd.nodeId
      ) {
        store.setFocus(paperHash, { kind: 'level2', parentNodeId: cd.nodeId });
        const existing = wb?.level2.get(cd.nodeId);
        if (existing) return;
        // If a pre-warm expansion is already in flight for this node,
        // don't double-fire — the eager-prewarm Promise will install
        // the L2 frame as it lands.
        if (expandHandlesRef.current.has(cd.nodeId)) return;
        void runExpand(paperHash, cd.nodeId, getNodeLabel(wb, cd.nodeId), store, expandHandlesRef);
      }
    },
    [paperHash, store, onJumpToPage, wb],
  );

  // -----------------------------------------------------------------
  // Cleanup pending generation on unmount / paper switch.
  // -----------------------------------------------------------------
  useEffect(() => {
    return () => {
      generateHandleRef.current?.abort();
      generateHandleRef.current = null;
      const map = expandHandlesRef.current;
      for (const h of map.values()) h.abort();
      map.clear();
    };
  }, [paperHash]);

  // -----------------------------------------------------------------
  // Reset the frame-mount cache when the paper changes (different
  // paperHash → fresh canvas, fresh frames).
  // -----------------------------------------------------------------
  useEffect(() => {
    mountedFramesRef.current = new Set();
    frameBoundsRef.current = new Map();
    skeletonMountedRef.current = null;
  }, [paperHash]);

  // -----------------------------------------------------------------
  // Generate-on-consent callback wired to WhiteboardConsent.
  // -----------------------------------------------------------------
  const onConsentAccept = useCallback(
    (rememberChoice: boolean) => {
      // Persist the "remember" toggle if the user opted in.
      if (rememberChoice) {
        void window.lens.updateSettings({ whiteboardAutoGenerateOnIndex: true });
      }
      void runGenerate(paperHash, doc.path, store, generateHandleRef);
    },
    [paperHash, doc.path, store],
  );

  // -----------------------------------------------------------------
  // Auto-generate path: if the user has the "auto-generate" setting on
  // and this paper has no existing whiteboard, kick off generation
  // automatically the first time the tab mounts.
  // -----------------------------------------------------------------
  const autoCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wb) return;
    if (wb.status !== 'idle') return;
    if (autoCheckedRef.current === paperHash) return;
    autoCheckedRef.current = paperHash;
    void (async () => {
      try {
        const settings = await window.lens.getSettings();
        if (settings.whiteboardAutoGenerateOnIndex) {
          void runGenerate(paperHash, doc.path, store, generateHandleRef);
        }
      } catch {
        /* settings unreadable — falls back to consent prompt */
      }
    })();
  }, [wb, paperHash, doc.path, store]);

  // QA-harness shortcut: bypass the consent affordance and start
  // generation directly. Wired by `scripts/fathom-test.sh
  // whiteboard-generate` via the ⌘⇧F4 global shortcut → App.tsx
  // dispatches this event after switching to the Whiteboard tab.
  useEffect(() => {
    const handler = () => {
      const cur = useWhiteboardStore.getState().get(paperHash);
      if (cur.status === 'idle' || cur.status === 'consent' || cur.status === 'failed') {
        void runGenerate(paperHash, doc.path, store, generateHandleRef);
      }
    };
    window.addEventListener('fathom:qaWhiteboardGenerate', handler);
    return () => window.removeEventListener('fathom:qaWhiteboardGenerate', handler);
  }, [paperHash, doc.path, store]);

  // Render-only QA: skips Pass 1 + Pass 2, mounts a fixture WBDiagram
  // through the live render pipeline. NO Claude spend — the bug is in
  // the render layer, debug it in isolation (CLAUDE.md §0).
  useEffect(() => {
    const handler = () => {
      void runRenderOnlyFixture(paperHash, store);
    };
    window.addEventListener('fathom:qaWhiteboardRenderOnly', handler);
    return () => window.removeEventListener('fathom:qaWhiteboardRenderOnly', handler);
  }, [paperHash, store]);

  // QA: drill into the first drillable L1 node (parameterless — picks
  // the first one with `drillable: true`). Wired for the
  // `whiteboard-drill` script subcommand so automated close-the-loop
  // runs can capture L2 frames without coordinate-based clicks. If
  // there's no L1 yet or no drillable nodes, no-op (logs a warning).
  useEffect(() => {
    const handler = () => {
      const cur = useWhiteboardStore.getState().get(paperHash);
      const node = cur.level1?.nodes.find((n) => n.drillable);
      if (!node) {
        console.warn('[Whiteboard UI] qa drill-first: no drillable node found');
        return;
      }
      console.log(`[Whiteboard UI] qa drill-first: drilling into ${node.id} (${node.label})`);
      store.setFocus(paperHash, { kind: 'level2', parentNodeId: node.id });
      // If pre-warm already produced an L2, the focus change is enough.
      // Otherwise kick off expand explicitly (mirrors the click handler).
      if (cur.level2.has(node.id)) return;
      if (expandHandlesRef.current.has(node.id)) return;
      void runExpand(paperHash, node.id, node.label, store, expandHandlesRef);
    };
    window.addEventListener('fathom:qaWhiteboardDrillFirst', handler);
    return () => window.removeEventListener('fathom:qaWhiteboardDrillFirst', handler);
  }, [paperHash, store]);

  // -----------------------------------------------------------------
  // Render branches: consent / pipeline-running / ready.
  // -----------------------------------------------------------------
  if (!wb || wb.status === 'idle') {
    return (
      <WhiteboardConsent
        onAccept={onConsentAccept}
        onCancel={() => {
          // Stay on the tab; user can change their mind.
          // No-op; consent re-renders.
        }}
      />
    );
  }
  if (wb.status === 'failed' && wb.error && !wb.level1) {
    return (
      <div className="flex h-full items-center justify-center bg-[color:var(--color-paper)] p-8 text-center">
        <div className="max-w-[440px] rounded-lg border border-red-200 bg-white p-5 text-[13px] text-red-800">
          <div className="mb-2 font-medium">Whiteboard generation failed</div>
          <pre className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap text-[11.5px] text-red-700/80">
            {wb.error}
          </pre>
          <button
            onClick={() => {
              store.reset(paperHash);
              autoCheckedRef.current = null;
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[color:var(--color-paper)]">
      <Suspense fallback={<CanvasLoadingFallback />}>
        <Excalidraw
          excalidrawAPI={(a) => setApi(a)}
          // Cast through unknown — the safe-parse helper hands back a
          // structurally compatible object whose `elements` are our
          // skeleton-derived elements. Excalidraw's
          // ExcalidrawInitialDataState is too strict to express here
          // without re-typing every field; we trust our serializer.
          initialData={
            (wb.excalidrawScene
              ? (safeParseScene(wb.excalidrawScene) as unknown)
              : ({ appState: { viewBackgroundColor: '#fafaf7' } } as unknown)) as Parameters<
              typeof Excalidraw
            >[0]['initialData']
          }
          // Read-only while Pass 1/2 streams. Flips false once L1 paints
          // so the user can manipulate the canvas afterwards.
          viewModeEnabled={wb.status === 'pass1' || wb.status === 'pass2'}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              clearCanvas: false,
              changeViewBackgroundColor: false,
              export: false,
            },
            tools: { image: false },
          }}
          onPointerDown={handlePointerDown}
          name="Fathom Whiteboard"
        />
      </Suspense>
      <WhiteboardBreadcrumb paperHash={paperHash} paperTitle={doc.name} />
      {(wb.status === 'pass1' || wb.status === 'pass2') && (
        <WhiteboardStreamingSidebar paperHash={paperHash} />
      )}
      {/* Cost pill bottom-left — small, dismissable, persistent
          state change so plain text is fine here (CLAUDE.md §11
          minor principle: visual indicators for transient,
          plain text for persistent). */}
      {wb.costUsd > 0 && wb.status === 'ready' && (
        <div className="pointer-events-none absolute bottom-3 left-4 z-20 rounded-full bg-white/85 px-3 py-1 text-[11px] text-black/55 shadow-sm backdrop-blur">
          ~${wb.costUsd.toFixed(2)} ·
          {wb.verificationRate !== null
            ? ` ${(wb.verificationRate * 100).toFixed(0)}% citations verified`
            : ''}
        </div>
      )}
    </div>
  );
}

function CanvasLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center text-[12px] text-black/40">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/15 border-t-[#9f661b]" />
    </div>
  );
}

// =====================================================================
// Pipeline orchestration (kept outside the component so the closures
// don't capture stale store snapshots).
// =====================================================================

async function runGenerate(
  paperHash: string,
  pdfPath: string,
  store: ReturnType<typeof useWhiteboardStore.getState>,
  handleRef: React.MutableRefObject<{ abort: () => void } | null>,
): Promise<void> {
  store.reset(paperHash);
  store.setStatus(paperHash, 'pass1');
  console.log('[Whiteboard UI] generate begin', paperHash.slice(0, 10));
  void window.lens.logDev?.(
    'info',
    'Whiteboard UI',
    `generate begin paper=${paperHash.slice(0, 10)}`,
  );
  try {
    const handle = await window.lens.whiteboardGenerate(
      { paperHash, pdfPath },
      {
        onPass1Delta: (text) => store.appendUnderstanding(paperHash, text),
        onPass1Done: (info) => {
          console.log(
            `[Whiteboard UI] pass1 done cost=$${info.costUsd.toFixed(3)} t=${info.latencyMs}ms`,
          );
          store.setUnderstanding(paperHash, info.understanding);
          store.setStatus(paperHash, 'pass2');
          store.setCost(paperHash, info.costUsd);
        },
        onPass2Delta: (text) => store.appendPass2Stream(paperHash, text),
        onPass2Done: (info) => {
          console.log(
            `[Whiteboard UI] pass2 done cost=$${info.costUsd.toFixed(4)} cache=${info.cachedPrefixHit ? 'HIT' : 'miss'}`,
          );
          store.clearPass2Stream(paperHash);
          // Parse the model output into a WBDiagram.
          const diagram = parseWBDiagram(info.raw, { level: 1 });
          if (!diagram) {
            store.setError(
              paperHash,
              'Pass 2 returned an unparseable diagram. The raw output is in the streaming sidebar; try regenerating.',
            );
            return;
          }
          // Pass 2.5 visual critique loop. Renders the diagram to a
          // PNG, asks Opus to look at it against the layout rules,
          // patches/replaces if needed, up to 3 iterations. Detached
          // promise — `setLevel1` fires inside the loop's success
          // path so the user only sees the final iteration on canvas.
          void runCritiqueLoop(paperHash, diagram, store);
        },
        onVerifier: (info) => {
          console.log(
            `[Whiteboard UI] verifier rate=${(info.verificationRate * 100).toFixed(0)}%`,
          );
          const quoteStatus: Record<
            string,
            { status: 'verified' | 'soft' | 'unverified'; score: number }
          > = {};
          for (const [k, v] of Object.entries(info.quoteStatus)) {
            quoteStatus[k] = { status: v.status, score: v.score };
          }
          store.setVerifier(paperHash, {
            verificationRate: info.verificationRate,
            quoteStatus,
          });
        },
        onDone: (info) => {
          console.log(
            `[Whiteboard UI] generation complete total=$${info.totalCost.toFixed(3)}`,
          );
          store.setCost(paperHash, info.totalCost);
          store.setStatus(paperHash, 'ready');
        },
        onError: (message) => {
          console.error('[Whiteboard UI] generate error:', message);
          store.setError(paperHash, message);
        },
      },
    );
    handleRef.current = handle;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setError(paperHash, message);
  }
}

async function runExpand(
  paperHash: string,
  nodeId: string,
  nodeLabel: string | undefined,
  store: ReturnType<typeof useWhiteboardStore.getState>,
  handlesRef: React.MutableRefObject<Map<string, { abort: () => void }>>,
): Promise<void> {
  store.startExpanding(paperHash, nodeId);
  console.log('[Whiteboard UI] expand begin', { paperHash: paperHash.slice(0, 10), nodeId });
  void window.lens.logDev?.(
    'info',
    'Whiteboard UI',
    `expand begin paper=${paperHash.slice(0, 10)} node=${nodeId}`,
  );
  try {
    const handle = await window.lens.whiteboardExpand(
      { paperHash, nodeId, nodeLabel },
      {
        onPass2Delta: (text) => store.appendPass2Stream(paperHash, text),
        onPass2Done: (info) => {
          console.log(
            `[Whiteboard UI] expand pass2 done cost=$${info.costUsd.toFixed(4)} cache=${info.cachedPrefixHit ? 'HIT' : 'miss'}`,
          );
          store.clearPass2Stream(paperHash);
          const diagram = parseWBDiagram(info.raw, { level: 2, parent: info.parentNodeId });
          if (!diagram) {
            store.setError(
              paperHash,
              `Sonnet returned an unparseable Level 2 diagram for node ${nodeId}.`,
            );
            store.endExpanding(paperHash, nodeId);
            return;
          }
          store.setLevel2(paperHash, info.parentNodeId, diagram);
        },
        onDone: (info) => {
          store.endExpanding(paperHash, info.parentNodeId);
          store.setCost(paperHash, info.totalCost);
          // Free the in-flight handle so the click handler doesn't
          // think a new click is "already pre-warming" indefinitely.
          handlesRef.current.delete(nodeId);
        },
        onError: (message) => {
          console.error('[Whiteboard UI] expand error:', message);
          store.setError(paperHash, message);
          store.endExpanding(paperHash, nodeId);
          handlesRef.current.delete(nodeId);
        },
      },
    );
    handlesRef.current.set(nodeId, handle);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setError(paperHash, message);
    store.endExpanding(paperHash, nodeId);
    handlesRef.current.delete(nodeId);
  }
}

// =====================================================================
// Excalidraw scene mounting helpers
// =====================================================================

function mountSkeleton(api: ExcalidrawImperativeAPI): void {
  // Doherty contract: the very first paint after the user clicks
  // Generate must show 5 placeholder node outlines + a generating
  // glyph within 1 frame, so the wait doesn't feel like a freeze.
  // Every skeleton element is tagged with `fathomKind: 'wb-skeleton'`
  // (not 'wb-node') so the Level 1 mount can wholesale strip them
  // even though Excalidraw rewrites the element ids on insertion.
  const skeletons: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    skeletons.push({
      type: 'rectangle',
      x: i * 220,
      y: 0,
      width: 160,
      height: 70,
      strokeColor: '#bcaa86',
      backgroundColor: 'transparent',
      strokeWidth: 1,
      strokeStyle: 'dashed',
      roundness: { type: 3 },
      roughness: 1,
      customData: { fathomKind: 'wb-skeleton', level: 1 } as WBNodeCustomData,
    });
  }
  skeletons.push({
    type: 'text',
    x: 0,
    y: -36,
    text: 'Generating…',
    fontSize: 14,
    fontFamily: 1,
    strokeColor: '#9f661b',
    customData: { fathomKind: 'wb-skeleton', level: 1 } as WBNodeCustomData,
  });
  // CRITICAL: regenerateIds=false. Default true. With true, the
  // skeleton's `containerId: rectId` references break because
  // Excalidraw assigns FRESH ids to every element on conversion,
  // leaving the bound text pointing at non-existent containers and
  // free-floating in scene coords with the synthetic x/y we wrote.
  // This was the root cause of "summary text outside the box" the
  // PM caught — the persisted scene from the previous build showed
  // every wb-summary text element with cid pointing at a non-existent
  // synthetic id like `wb-node-L1.2-mof0q7w`. Same risk for arrow
  // start/end bindings (would un-bind on conversion). Same fix.
  const elements = convertToExcalidrawElements(
    skeletons as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
  api.updateScene({ elements });
  api.scrollToContent(undefined, { fitToContent: true, animate: false });
}

async function mountLevel1Frame(
  api: ExcalidrawImperativeAPI,
  diagram: WBDiagram,
  paperHash: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const layout = await layoutDiagram(diagram);
  const origin = { x: 0, y: 0 };
  // Resolve any figure_refs to fileIds before generating skeletons —
  // see resolveFigureBindings for the disk-IO + addFiles dance. Done
  // first so the figure-image skeletons reference fileIds Excalidraw
  // already knows about (otherwise the image element renders as a
  // grey "missing file" placeholder until the next render tick).
  const figureBindings = await resolveFigureBindings(api, diagram, paperHash);
  const sceneSkeletons = diagramToSkeleton(diagram, layout, origin, figureBindings);
  const newElements = convertToExcalidrawElements(
    sceneSkeletons as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
  // Replace ALL skeleton elements with the real Level 1. The filter
  // matches `customData.fathomKind === 'wb-skeleton'` rather than the
  // element id — convertToExcalidrawElements regenerates ids on
  // insertion (regenerateIds defaults to true), so id-prefix filtering
  // never matched. This was the root of the "empty boxes still painted
  // behind real nodes" bug the PM screenshot caught.
  const surviving = api
    .getSceneElements()
    .filter((el) => {
      const cd = (el as { customData?: WBNodeCustomData }).customData;
      if (!cd) return true; // user-drawn — keep
      if (cd.fathomKind === 'wb-skeleton') return false;
      return true;
    });
  api.updateScene({ elements: [...surviving, ...newElements] });
  console.log(
    `[Whiteboard UI] L1 mounted: ${newElements.length} elements, ${diagram.nodes.length} nodes ` +
      `(${figureBindings.size} figures embedded), removed ${api.getSceneElements().length - surviving.length - newElements.length} skeleton elements`,
  );
  return diagramBoundingBox(diagram, layout, origin);
}

async function mountLevel2Frame(
  api: ExcalidrawImperativeAPI,
  diagram: WBDiagram,
  parentNodeId: string,
  paperHash: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const layout = await layoutDiagram(diagram);
  // VERTICAL drill — the Level 2 frame sits BELOW its parent Level 1
  // node, not to the right. The user's mental model is "zooming into
  // a node moves you DOWN the page, not across." Per the team-lead
  // brief 2026-04-25: same recursion grammar applies if Level 3 ever
  // ships. We find the parent node's rectangle in the live scene
  // (placed by mountLevel1Frame), center the new frame's x on the
  // parent's x-midpoint, and stack vertically with VERTICAL_GAP px
  // of breathing room.
  const VERTICAL_GAP = 140;
  const FALLBACK_BELOW_L1_Y = 600;
  const parentRect = api
    .getSceneElements()
    .find((el) => {
      const cd = (el as { customData?: WBNodeCustomData }).customData;
      return (
        cd?.fathomKind === 'wb-node' && cd.level === 1 && cd.nodeId === parentNodeId
      );
    });
  // If a Level 2 frame for a *different* parent has already been
  // placed below the L1 row, stack subsequent L2 frames below it
  // again rather than crashing into it. Each L2 frame's bottom edge
  // becomes the next placement's top reference.
  let baseY: number;
  let centerX: number;
  if (parentRect) {
    const px = (parentRect as unknown as { x: number; y: number; width: number; height: number }).x;
    const py = (parentRect as unknown as { x: number; y: number; width: number; height: number }).y;
    const pw = (parentRect as unknown as { x: number; y: number; width: number; height: number }).width;
    const ph = (parentRect as unknown as { x: number; y: number; width: number; height: number }).height;
    centerX = px + pw / 2;
    baseY = py + ph + VERTICAL_GAP;
  } else {
    centerX = L1_LAYOUT_WIDTH / 2;
    baseY = FALLBACK_BELOW_L1_Y;
  }
  // Stack against any already-placed L2 frames so two simultaneous
  // pre-warm drills don't overlap each other.
  const placedLevel2Frames = api
    .getSceneElements()
    .filter((el) => {
      const cd = (el as { customData?: WBNodeCustomData }).customData;
      return cd?.level === 2 && cd.fathomKind === 'wb-frame';
    }) as Array<{ x: number; y: number; width: number; height: number }>;
  for (const f of placedLevel2Frames) {
    const fBottom = f.y + f.height;
    if (fBottom + VERTICAL_GAP > baseY) baseY = fBottom + VERTICAL_GAP;
  }
  const origin = { x: centerX - layout.width / 2, y: baseY };
  const figureBindings = await resolveFigureBindings(api, diagram, paperHash);
  const sceneSkeletons = diagramToSkeleton(diagram, layout, origin, figureBindings);
  const newElements = convertToExcalidrawElements(
    sceneSkeletons as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
  const existing = api.getSceneElements();
  api.updateScene({ elements: [...existing, ...newElements] });
  console.log(
    `[Whiteboard UI] L2 mounted parent=${parentNodeId} at (${Math.round(origin.x)}, ${Math.round(origin.y)}): ` +
      `${newElements.length} elements, ${diagram.nodes.length} nodes ` +
      `(${figureBindings.size} figures embedded)`,
  );
  return diagramBoundingBox(diagram, layout, origin);
}

// =====================================================================
// Render-only QA fixture (CLAUDE.md §0 isolation)
// =====================================================================
//
// Skip Pass 1 + Pass 2. Mount a hand-written WBDiagram (or one
// loaded from `<sidecar>/whiteboard-test-diagram.json` if it exists)
// through the live render pipeline so we can iterate on the render
// layer in ~2s per round, with NO Claude spend. Fires on the
// `fathom:qaWhiteboardRenderOnly` custom event, dispatched by App.tsx
// when ⌘⇧F3 lands.
//
// Derived from the actual whiteboard-understanding.md the live
// pipeline produced for the bundled sample paper (ReconViaGen). Node
// labels + summaries reflect realistic worst-case widths so the
// text-fits-in-box fix is exercised against representative content.

const RENDER_ONLY_FIXTURE: WBDiagram = {
  level: 1,
  title: 'ReconViaGen — pose-free 3D reconstruction',
  nodes: [
    {
      id: 'L1.1',
      label: 'VGGT Encoder',
      kind: 'input',
      summary:
        'Pre-trained pose-free MVS transformer, LoRA-tuned on Objaverse; outputs multi-layer features ϕ_vggt from layers 4/11/17/23.',
      drillable: false,
      citation: { page: 4, quote: 'we use scaled dot-product attention' },
    },
    {
      id: 'L1.2',
      label: 'Reconstruction Conditioning',
      kind: 'process',
      summary:
        'Condition Net (4 cross-attn blocks) distills VGGT features into Global Geometry Condition (GGC) + Per-View Conditions (PVC).',
      drillable: true,
      citation: { page: 5, quote: 'condition net cross-attention' },
    },
    {
      id: 'L1.3',
      label: 'Coarse-to-Fine Generation',
      kind: 'model',
      summary:
        'TRELLIS SS Flow generates sparse voxels conditioned on GGC; SLAT Flow generates per-voxel latents conditioned on PVC.',
      drillable: true,
      citation: { page: 6, quote: 'rectified flow transformer' },
    },
    {
      id: 'L1.4',
      label: 'Camera Pose Refinement',
      kind: 'process',
      summary:
        'VGGT estimates poses from 30 auxiliary views; refined via image-matching + PnP/RANSAC against partial-generation renders.',
      drillable: false,
    },
    {
      id: 'L1.5',
      label: 'Velocity Compensation',
      kind: 'output',
      summary:
        'When t<0.5, decode SLAT to mesh, render from refined poses, compute SSIM+LPIPS+DreamSim loss, derive Δv added to next step.',
      drillable: true,
      citation: { page: 6, quote: 'rendering aware velocity correction' },
    },
  ],
  edges: [
    { from: 'L1.1', to: 'L1.2', label: 'ϕ_vggt' },
    { from: 'L1.2', to: 'L1.3', label: 'GGC, PVC' },
    { from: 'L1.1', to: 'L1.4', label: 'poses' },
    { from: 'L1.4', to: 'L1.5', label: 'refined poses' },
    { from: 'L1.3', to: 'L1.5', label: 'partial mesh' },
  ],
  layout_hint: 'lr',
};

async function runRenderOnlyFixture(
  paperHash: string,
  store: ReturnType<typeof useWhiteboardStore.getState>,
): Promise<void> {
  console.log('[Whiteboard UI] render-only fixture begin', paperHash.slice(0, 10));
  // Try a per-paper fixture file first; fall back to the hardcoded
  // ReconViaGen one. The file path lets a tester drop a custom JSON
  // into the sidecar without rebuilding.
  let diagram: WBDiagram = RENDER_ONLY_FIXTURE;
  try {
    const result = await window.lens.whiteboardGet(paperHash);
    if (result.indexPath) {
      // Best-effort: try to read a fixture from the sidecar via the
      // asset-read IPC. If absent, the catch falls through to the
      // hardcoded fixture.
      const fixturePath = `${result.indexPath}/whiteboard-test-diagram.json`;
      try {
        const dataUrl = await window.lens.readAssetAsDataUrl(fixturePath);
        if (dataUrl && dataUrl.startsWith('data:')) {
          // dataURL of a JSON file decodes to base64 of the JSON.
          const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
          const json = atob(b64);
          const parsed = parseWBDiagram(json, { level: 1 });
          if (parsed) {
            diagram = parsed;
            console.log('[Whiteboard UI] render-only loaded fixture from disk');
          }
        }
      } catch {
        /* fixture absent — using hardcoded */
      }
    }
  } catch {
    /* whiteboardGet failed — using hardcoded */
  }
  // Skip Pass 1 + Pass 2. Reset state, set status straight to ready,
  // and feed the fixture diagram into setLevel1 — the existing mount
  // effect picks it up and renders to the live canvas.
  store.reset(paperHash);
  store.setStatus(paperHash, 'pass2'); // so the skeleton paints first
  // Defer the setLevel1 call so the user sees the skeleton-tear-down
  // animation work end-to-end (this exercises the wb-skeleton filter
  // bug fix too).
  setTimeout(() => {
    store.setLevel1(paperHash, diagram);
    store.setStatus(paperHash, 'ready');
    store.setCost(paperHash, 0); // explicitly $0 — render-only
    console.log('[Whiteboard UI] render-only setLevel1 done; mount effect will fire');
  }, 200);
}

// =====================================================================
// Pass 2.5 — visual critique loop (renderer side)
// =====================================================================
//
// "AI agents that produce visual artefacts must see-and-iterate." After
// Pass 2 emits a WBDiagram we:
//   1. Lay it out via ELK + diagramToSkeleton + convertToExcalidrawElements.
//   2. Render the resulting elements to a PNG via Excalidraw's
//      `exportToCanvas` — DOES NOT mount in the live scene; it's a
//      headless rasterise that returns a Canvas we read as PNG.
//   3. Write the PNG to the per-paper sidecar via the
//      `whiteboard:writeRenderPng` IPC.
//   4. Call `whiteboard:critique` with the PNG path + the diagram JSON.
//   5. If verdict is {ok: true}, ship the diagram to the live scene.
//      If {fix: 'patch'}, apply the typed ops and loop.
//      If {fix: 'replace'}, swap to the new diagram and loop.
//   6. Cap at 3 iterations to bound spend + latency. After 3, ship the
//      best diagram we have (the latest, even if not "ok") so the user
//      never sees a permanent stall.

const CRITIQUE_MAX_ITERATIONS = 3;

interface CritiqueVerdict {
  ok?: boolean;
  fix?: 'patch' | 'replace';
  ops?: Array<{
    op: 'shorten_summary' | 'rename_label' | 'drop_node' | 'drop_edge' | 'set_drillable' | 'set_figure_ref';
    node_id?: string;
    to?: string;
    from?: string;
    drillable?: boolean;
    figure_ref?: { page: number; figure: number };
  }>;
  diagram?: unknown;
  reason?: string;
}

async function runCritiqueLoop(
  paperHash: string,
  initialDiagram: WBDiagram,
  store: ReturnType<typeof useWhiteboardStore.getState>,
): Promise<void> {
  let current = initialDiagram;
  for (let iter = 1; iter <= CRITIQUE_MAX_ITERATIONS; iter++) {
    let verdict: CritiqueVerdict | null = null;
    try {
      // Render to PNG (off-screen — does not touch the live canvas).
      const pngBase64 = await renderDiagramToPng(current, paperHash);
      if (!pngBase64) {
        console.warn(
          `[Whiteboard UI] Pass2.5 iter=${iter} render failed; shipping current diagram unchanged`,
        );
        break;
      }
      // Write to sidecar so the critique prompt can Read it.
      const writeResult = await window.lens.whiteboardWriteRenderPng(
        paperHash,
        iter,
        pngBase64,
      );
      if (!writeResult.ok || !writeResult.path) {
        console.warn(
          `[Whiteboard UI] Pass2.5 iter=${iter} writeRenderPng failed: ${writeResult.error ?? 'unknown'}; shipping current`,
        );
        break;
      }
      const critique = await window.lens.whiteboardCritique(
        paperHash,
        JSON.stringify(current),
        writeResult.path,
        iter,
      );
      console.log(
        `[Whiteboard UI] Pass2.5 iter=${iter} verdict=${critique.verdict ? JSON.stringify(critique.verdict).slice(0, 80) : 'unparseable'} cost=$${critique.costUsd.toFixed(4)}`,
      );
      verdict = critique.verdict as CritiqueVerdict | null;
    } catch (err) {
      console.warn(
        `[Whiteboard UI] Pass2.5 iter=${iter} threw: ${err instanceof Error ? err.message : err}; shipping current`,
      );
      break;
    }
    if (!verdict || verdict.ok === true) {
      // Approved (or unparseable verdict — treat as approved to never
      // block on a critique parse bug).
      break;
    }
    if (verdict.fix === 'patch' && Array.isArray(verdict.ops) && verdict.ops.length > 0) {
      const next = applyOpsToDiagram(current, verdict.ops);
      if (!next) {
        console.warn('[Whiteboard UI] Pass2.5 patch produced an unusable diagram; shipping pre-patch');
        break;
      }
      current = next;
      continue;
    }
    if (verdict.fix === 'replace' && verdict.diagram) {
      // Re-run the tolerant parser against the model's replacement
      // diagram. parseWBDiagram only takes a string — so re-stringify
      // the verdict's diagram object, then parse.
      const replaced = parseWBDiagram(JSON.stringify(verdict.diagram), {
        level: current.level,
        parent: current.parent,
      });
      if (!replaced) {
        console.warn('[Whiteboard UI] Pass2.5 replace produced an unparseable diagram; shipping pre-replace');
        break;
      }
      current = replaced;
      continue;
    }
    // Unrecognised verdict shape — bail.
    break;
  }
  // Ship the diagram (original or after up to 3 iterations) to the
  // store. The mount effect picks it up and renders to the live
  // canvas + kicks off L2 pre-warm.
  store.setLevel1(paperHash, current);
}

/** Apply a list of typed ops to a WBDiagram. Returns null if the
 * patched diagram has zero usable nodes (e.g. all nodes dropped),
 * which is a no-op signal to the caller. */
function applyOpsToDiagram(d: WBDiagram, ops: NonNullable<CritiqueVerdict['ops']>): WBDiagram | null {
  let nodes = [...d.nodes];
  let edges = [...d.edges];
  for (const op of ops) {
    if (op.op === 'shorten_summary' && op.node_id && typeof op.to === 'string') {
      nodes = nodes.map((n) => (n.id === op.node_id ? { ...n, summary: op.to } : n));
    } else if (op.op === 'rename_label' && op.node_id && typeof op.to === 'string') {
      const safe = op.to.length > 28 ? op.to.slice(0, 27) + '…' : op.to;
      nodes = nodes.map((n) => (n.id === op.node_id ? { ...n, label: safe } : n));
    } else if (op.op === 'drop_node' && op.node_id) {
      nodes = nodes.filter((n) => n.id !== op.node_id);
      edges = edges.filter((e) => e.from !== op.node_id && e.to !== op.node_id);
    } else if (op.op === 'drop_edge' && op.from && op.node_id) {
      // Note: critique JSON uses {from, to} for edges; we accept
      // either {from, to} or {from, node_id} pairing.
      const target = op.node_id;
      edges = edges.filter((e) => !(e.from === op.from && e.to === target));
    } else if (op.op === 'set_drillable' && op.node_id && typeof op.drillable === 'boolean') {
      nodes = nodes.map((n) => (n.id === op.node_id ? { ...n, drillable: op.drillable } : n));
    } else if (op.op === 'set_figure_ref' && op.node_id && op.figure_ref) {
      nodes = nodes.map((n) => (n.id === op.node_id ? { ...n, figure_ref: op.figure_ref } : n));
    }
  }
  if (nodes.length === 0) return null;
  return { ...d, nodes, edges };
}

/** Off-screen render the (laid-out) diagram to a PNG. Uses
 * Excalidraw's `exportToCanvas` so we DON'T need to mount the diagram
 * in the live scene during critique. Returns a base64-encoded PNG
 * (without the data: prefix), ready to ship through IPC. Returns
 * null on any failure — the critique loop treats null as "skip this
 * iteration, ship as-is." */
async function renderDiagramToPng(
  diagram: WBDiagram,
  paperHash: string,
): Promise<string | null> {
  try {
    const layout = await layoutDiagram(diagram);
    // Build BOTH the BinaryFiles map (for exportToCanvas) AND the
    // nodeId→fileId bindings (for diagramToSkeleton) in a single
    // walk — same fileId format on both sides means the rendered
    // image element references a file the canvas will render.
    const { files, bindings } = await collectFiguresForExport(diagram, paperHash);
    const skeletons = diagramToSkeleton(diagram, layout, { x: 0, y: 0 }, bindings);
    const elements = convertToExcalidrawElements(
      skeletons as Parameters<typeof convertToExcalidrawElements>[0],
      { regenerateIds: false },
    );
    const canvas = await exportToCanvas({
      elements,
      appState: { viewBackgroundColor: '#fafaf7' } as Parameters<typeof exportToCanvas>[0]['appState'],
      files: files as Parameters<typeof exportToCanvas>[0]['files'],
      getDimensions: (w: number, h: number) => ({
        width: Math.max(800, w),
        height: Math.max(400, h),
        scale: 1,
      }),
      exportPadding: 24,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn(`[Whiteboard UI] renderDiagramToPng failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Walk every node with a figure_ref and read its PNG via the asset
 * IPC, packing into BOTH the BinaryFiles map (keyed by fileId, the
 * shape `exportToCanvas` expects) AND the nodeId→fileId bindings
 * (the shape `diagramToSkeleton` expects). Same file id format
 * (`wb-fig-<8 of hash>-p<NNN>-f<K>`) keeps the two in sync. */
async function collectFiguresForExport(
  diagram: WBDiagram,
  paperHash: string,
): Promise<{
  files: Record<string, { mimeType: 'image/png'; id: string; dataURL: string; created: number }>;
  bindings: Map<string, string>;
}> {
  const files: Record<
    string,
    { mimeType: 'image/png'; id: string; dataURL: string; created: number }
  > = {};
  const bindings = new Map<string, string>();
  const indexPath = useWhiteboardStore.getState().get(paperHash).indexPath;
  if (!indexPath) return { files, bindings };
  for (const node of diagram.nodes) {
    const ref = node.figure_ref;
    if (!ref) continue;
    const padded = String(ref.page).padStart(3, '0');
    const absPath = `${indexPath}/images/page-${padded}-fig-${ref.figure}.png`;
    try {
      const dataUrl = await window.lens.readAssetAsDataUrl(absPath);
      if (!dataUrl || !dataUrl.startsWith('data:image/')) continue;
      const fileId = `wb-fig-${paperHash.slice(0, 8)}-p${padded}-f${ref.figure}`;
      files[fileId] = { mimeType: 'image/png', id: fileId, dataURL: dataUrl, created: Date.now() };
      bindings.set(node.id, fileId);
    } catch {
      /* missing on disk — silently fall back to text-only */
    }
  }
  return { files, bindings };
}

/**
 * For every node with a `figure_ref`, read the cropped figure PNG from
 * the per-paper sidecar (`<indexPath>/images/page-NNN-fig-K.png`),
 * register it with Excalidraw via `addFiles`, and return a map from
 * nodeId → fileId. Nodes whose figure file doesn't exist are silently
 * skipped — the renderer falls back to text-only.
 *
 * The renderer never lists the images directory itself (no embeddings,
 * no semantic search, just a deterministic path computed from the
 * model's `figure_ref`). This preserves CLAUDE.md §6's no-RAG rule.
 */
async function resolveFigureBindings(
  api: ExcalidrawImperativeAPI,
  diagram: WBDiagram,
  paperHash: string,
): Promise<Map<string, string>> {
  const bindings = new Map<string, string>();
  const indexPath = useWhiteboardStore.getState().get(paperHash).indexPath;
  if (!indexPath) {
    if (diagram.nodes.some((n) => n.figure_ref)) {
      console.warn(
        '[Whiteboard UI] figure_refs present but no indexPath in store — skipping figure embed',
      );
    }
    return bindings;
  }
  const filesToAdd: Array<{
    mimeType: 'image/png';
    id: string;
    dataURL: string;
    created: number;
  }> = [];
  for (const node of diagram.nodes) {
    const ref = node.figure_ref;
    if (!ref) continue;
    const padded = String(ref.page).padStart(3, '0');
    const filename = `images/page-${padded}-fig-${ref.figure}.png`;
    const absPath = `${indexPath}/${filename}`;
    try {
      const dataUrl = await window.lens.readAssetAsDataUrl(absPath);
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        console.warn(`[Whiteboard UI] figure missing or invalid: ${absPath}`);
        continue;
      }
      // FileId is content-addressed via a stable hash of the figure
      // filename — the same node→figure mapping across renders maps to
      // the same fileId, so re-renders don't duplicate files in the
      // BinaryFiles store. (We rely on the page+fig uniqueness within a
      // paper; collisions across papers don't matter, the BinaryFiles
      // map is per-scene.)
      const fileId = `wb-fig-${paperHash.slice(0, 8)}-p${padded}-f${ref.figure}`;
      filesToAdd.push({
        mimeType: 'image/png',
        id: fileId,
        dataURL: dataUrl,
        created: Date.now(),
      });
      bindings.set(node.id, fileId);
    } catch (err) {
      console.warn(
        `[Whiteboard UI] figure read failed for ${absPath}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (filesToAdd.length > 0) {
    api.addFiles(
      filesToAdd as unknown as Parameters<ExcalidrawImperativeAPI['addFiles']>[0],
    );
    console.log(`[Whiteboard UI] embedded ${filesToAdd.length} paper figure(s)`);
  }
  return bindings;
}

async function persistScene(
  api: ExcalidrawImperativeAPI,
  paperHash: string,
  store: ReturnType<typeof useWhiteboardStore.getState>,
): Promise<void> {
  try {
    const elements = api.getSceneElements();
    const appState = api.getAppState?.();
    // Strip transient/runtime-only appState fields before persisting.
    // Excalidraw uses a JS `Map` for `collaborators` internally, but
    // JSON.stringify silently turns it into `{}`; on restore Excalidraw
    // calls `appState.collaborators.forEach(...)` and crashes inside
    // its render loop with "forEach is not a function" — caught by
    // the React error boundary, the whole Whiteboard tab goes dark.
    // Same risk for other non-serialisable fields (selectedElementIds,
    // openMenu, contextMenu, draggingElement, etc.). Cheapest robust
    // fix: persist only the small set of `appState` fields that are
    // both plain-data AND useful across reloads. Anything else,
    // Excalidraw will re-initialise to a sane default.
    const persistableAppState = sanitiseAppStateForDisk(appState);
    const scene = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'fathom-whiteboard',
      elements,
      appState: persistableAppState,
      files: api.getFiles?.() ?? {},
    });
    store.setExcalidrawScene(paperHash, scene);
    await window.lens.whiteboardSaveScene(paperHash, scene);
  } catch (err) {
    console.warn('[Whiteboard UI] persistScene failed', err);
  }
}

/** Filter Excalidraw's appState down to the JSON-safe subset we care
 * about across reloads. Anything not in the allowlist gets dropped
 * because (a) most appState fields are runtime-only — selection,
 * dragging, hover, menu open state — and (b) some are non-JSON-safe
 * (Map, Set, DOM refs) that round-trip badly. */
function sanitiseAppStateForDisk(
  appState: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const a = (appState ?? {}) as Record<string, unknown>;
  const allow = [
    'viewBackgroundColor',
    'gridSize',
    'theme',
    'zoom',
    'scrollX',
    'scrollY',
    'currentItemFontFamily',
    'currentItemFontSize',
  ];
  const out: Record<string, unknown> = { viewBackgroundColor: '#fafaf7' };
  for (const k of allow) {
    if (k in a && a[k] !== undefined) out[k] = a[k];
  }
  return out;
}

function safeParseScene(raw: string): { elements?: unknown[]; appState?: Record<string, unknown> } {
  try {
    const parsed = JSON.parse(raw) as { elements?: unknown[]; appState?: Record<string, unknown> };
    // Re-sanitise on restore as well — defensive against scenes that
    // were saved before the persist-side fix landed (existing users
    // may have a corrupt whiteboard.excalidraw on disk from a prior
    // version of this code that JSON.stringify'd `collaborators: {}`).
    return {
      elements: parsed.elements ?? [],
      appState: sanitiseAppStateForDisk(parsed.appState),
    };
  } catch {
    return { appState: { viewBackgroundColor: '#fafaf7' } };
  }
}

function getNodeLabel(wb: PaperWhiteboard | undefined, nodeId: string): string | undefined {
  if (!wb || !wb.level1) return undefined;
  return wb.level1.nodes.find((n) => n.id === nodeId)?.label;
}
