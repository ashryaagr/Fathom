import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pdfjsLib } from './pdf/pdfjs';
import { useDocumentStore } from './state/document';
import { useRegionsStore } from './state/regions';
import { useLensStore } from './lens/store';
import { useHighlightsStore } from './state/highlights';
import { buildPaperIndex } from './pdf/buildIndex';
import PdfViewer from './pdf/PdfViewer';
import FocusView from './lens/FocusView';
import FirstRunTour from './lens/FirstRunTour';
import SettingsPanel from './lens/SettingsPanel';
import CoachHint from './lens/CoachHint';
import GestureFeedback from './lens/GestureFeedback';
import UpdateToast from './lens/UpdateToast';
import { useTourStore } from './lens/tourStore';
import { createHighlightFromSelection } from './pdf/highlightFromSelection';
import ErrorBoundary from './ErrorBoundary';

type IndexState = 'idle' | 'running' | 'done' | 'cached' | 'error';

export default function App() {
  const setDocument = useDocumentStore((s) => s.setDocument);
  const docState = useDocumentStore((s) => s.document);
  const focused = useLensStore((s) => s.focused);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [indexState, setIndexState] = useState<IndexState>('idle');
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const [showIndexToast, setShowIndexToast] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to decomposition status events from the main process.
  useEffect(() => {
    const unsubscribe = window.lens.onDecomposeStatus((status) => {
      const current = useDocumentStore.getState().document;
      if (!current || status.paperHash !== current.contentHash) return;
      setIndexState(status.state);
      setIndexMessage(status.message ?? null);
      setShowIndexToast(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (status.state === 'done' || status.state === 'cached' || status.state === 'error') {
        hideTimerRef.current = setTimeout(() => setShowIndexToast(false), 4000);
      }
    });
    return () => {
      unsubscribe();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // One shared pipeline for every "a PDF just arrived" trigger:
  //   • user clicked Open PDF… (from a button, the menu, or ⌘O)
  //   • user dragged a PDF onto the window
  //   • user ⌘-clicked a PDF in Finder and picked Open With → Fathom
  //   • user chose Open Sample Paper from the welcome dialog or menu
  // `source` is either the dialog request (no args) or a local path.
  const openPdf = useCallback(async (source?: string) => {
    setError(null);
    setLoading(true);
    try {
      const pdf = source
        ? await window.lens.openPdfAtPath(source)
        : await window.lens.openPdf();
      if (!pdf) {
        setLoading(false);
        return;
      }
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdf.bytes),
        // Relative URLs (no leading slash) so these resolve correctly both in
        // the Vite dev server (http://localhost/) and in the packaged app
        // (file:///…/app.asar/out/renderer/index.html — a leading slash would
        // resolve to filesystem root and fail). Electron serves files inside
        // app.asar transparently for file:// requests, so renderer-relative
        // paths hit the packaged pdfjs-cmaps / pdfjs-fonts / pdfjs-wasm dirs.
        cMapUrl: 'pdfjs-cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'pdfjs-fonts/',
        // WASM decoders for JPEG2000 / JBIG2. Without these (which is what
        // happened when the URL had a leading /), large figure images using
        // JP2 or JBIG2 compression silently fail to render.
        wasmUrl: 'pdfjs-wasm/',
        // No cap on image size — research papers often embed very high-res figures.
        maxImageSize: -1,
        useSystemFonts: true,
      });
      const doc = await loadingTask.promise;

      // Reset stale stores for the previous document.
      useRegionsStore.getState().clear();
      useLensStore.getState().closeAll();
      useHighlightsStore.getState().hydrate([]);
      // Clear per-lens cache AND persisted zoom paths so nothing leaks across papers.
      useLensStore.setState({ cache: new Map(), persistedZoomPaths: new Map() });

      setDocument({
        name: pdf.name,
        path: pdf.path,
        indexDir: pdf.indexDir,
        contentHash: pdf.contentHash,
        doc,
        numPages: doc.numPages,
      });

      // Skip restoring cached regions from disk — the extraction algorithm evolves (e.g.
      // column-awareness) and stale cached regions would silently override the new ones.
      // Let PageView re-extract fresh on visibility; cached *explanations* below still
      // restore (keyed by region id — old region ids simply won't show dots, acceptable).
      try {
        const state = await window.lens.paperState(pdf.contentHash);
        if (state) {
          // Hydrate the turn cache so re-opening a region restores its prior Q&A chain instantly.
          const turnsByRegion = new Map<
            string,
            Array<{ question: string | null; body: string; progress: string; streaming: boolean }>
          >();
          for (const e of state.explanations) {
            const arr = turnsByRegion.get(e.region_id) ?? [];
            arr.push({
              question: e.focus_phrase ?? null,
              body: e.body,
              progress: '',
              streaming: false,
            });
            turnsByRegion.set(e.region_id, arr);
            // First non-null zoom path for a region wins (they're all the same in practice).
            if (e.zoom_image_path) {
              useLensStore.getState().setPersistedZoomPath(e.region_id, e.zoom_image_path);
            }
          }
          for (const [regionId, turns] of turnsByRegion) {
            useLensStore.getState().setCachedTurns(regionId, turns);
          }
          // Restore persisted amber highlights for this paper. Rects were
          // stored in PDF user-space so they survive zoom changes.
          if (state.highlights && state.highlights.length > 0) {
            useHighlightsStore.getState().hydrate(
              state.highlights.map((h) => ({
                id: h.id,
                paperHash: h.paper_hash,
                page: h.page,
                rects: JSON.parse(h.rects_json) as Array<{
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                }>,
                text: h.text ?? undefined,
                color: h.color,
                createdAt: h.created_at,
              })),
            );
          }
        }
      } catch (err) {
        console.warn('failed to restore paper state', err);
      }

      // Build the full on-disk index: one content.md with the paper's text in reading
      // order + one PNG per page under images/. This alone is enough to make Claude's
      // Read/Grep/Glob useful without any RAG.
      setIndexState('running');
      setIndexMessage(null);
      setShowIndexToast(true);
      void (async () => {
        try {
          await buildPaperIndex(doc, pdf.contentHash);
          // Then kick off the deeper Claude-driven decomposition (structured digest,
          // section summaries, figure descriptions) as a background enhancement.
          await window.lens.decomposePaper({
            paperHash: pdf.contentHash,
            pdfPath: pdf.path,
            numPages: doc.numPages,
          });
        } catch (err) {
          setIndexState('error');
          setIndexMessage(err instanceof Error ? err.message : String(err));
          setShowIndexToast(true);
        }
      })();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [setDocument]);

  // Keyboard gesture alternatives. Makes the app fully operable without a
  // trackpad — which matters both for accessibility (users without
  // multi-touch hardware) and for automated testing by a computer-use
  // agent that can fire key events but can't synthesize trackpad
  // WheelEvents with ctrlKey/deltaX. Every trackpad gesture has a keyboard
  // sibling:
  //   ⌘⇧D  — Dive in (equivalent to ⌘+pinch release; opens lens at
  //           the cursor or current viewport)
  //   ⌘⇧A  — Ask about current viewport (same as the "Ask" header button)
  //   ⌘[   — Back through lens history (same as two-finger swipe right)
  //   ⌘]   — Forward through lens history
  //   F1 / ⌘⇧?  — Toggle help overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inInput) return;

      if (e.key === 'F1' || (e.key === '?' && e.metaKey && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      // ⌘⇧D — dive in. Dispatches the same event the Ask header button
      // does; PdfViewer runs commitSemanticFocus through the same path
      // the trackpad gesture uses.
      if (e.metaKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fathom:askCurrentViewport'));
        return;
      }

      // ⌘⇧A — same as above but wired to the "Ask about viewport"
      // semantics explicitly; both shortcuts available for memory.
      if (e.metaKey && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fathom:askCurrentViewport'));
        return;
      }

      // ⌘H — highlight the current text selection in amber. Matches the
      // Apple Books / Preview convention. Preserved across sessions via
      // the highlights SQLite table; rects stored in PDF user-space so
      // they restore at any zoom level.
      if (e.metaKey && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        const doc = useDocumentStore.getState().document;
        if (!doc) return;
        e.preventDefault();
        void createHighlightFromSelection(doc.contentHash);
        return;
      }

      // ⌘[ — back through lens history (swipe right equivalent).
      if (e.metaKey && !e.shiftKey && e.key === '[') {
        e.preventDefault();
        useLensStore.getState().back();
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'back' } }));
        if (useTourStore.getState().step === 'swipe') {
          useTourStore.getState().advance('celebrated');
        }
        return;
      }
      // ⌘] — forward.
      if (e.metaKey && !e.shiftKey && e.key === ']') {
        e.preventDefault();
        useLensStore.getState().forward();
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'forward' } }));
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Menu / first-run "Open PDF…" → pop the dialog.
  useEffect(() => window.lens.onOpenRequest(() => void openPdf()), [openPdf]);

  // First time a PDF is opened (sample or user's own), show the guided tour
  // unless it's already been completed. Fires on docState transition from
  // null → non-null, then settles in for the session.
  useEffect(() => {
    if (!docState) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await window.lens.getSettings();
        if (!cancelled && !settings.tourCompletedAt) setShowTour(true);
      } catch {
        /* if settings read fails, don't push a tour the user didn't ask for */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally depend on the *presence* of docState, not its identity —
    // we want the tour exactly once per session (if uncompleted), not every
    // time the user opens a new PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!docState]);

  // Help → Show Welcome Tour, or ? button → show the tour again from step 1.
  useEffect(() => window.lens.onShowTour(() => setShowTour(true)), []);

  // ⌘, or Help → Preferences… → open settings panel.
  useEffect(() => window.lens.onShowSettings(() => setShowSettings(true)), []);

  // External "here's a PDF" — drag onto dock icon, Finder Open With,
  // Open Sample Paper menu item. Path comes from the main process.
  useEffect(
    () => window.lens.onOpenExternal((path) => void openPdf(path)),
    [openPdf],
  );

  // Drag-and-drop anywhere on the window. Electron 32+ removed the
  // non-standard `File.path` extension; we resolve the filesystem path
  // via `webUtils.getPathForFile` exposed from the preload instead.
  useEffect(() => {
    const isPdfDrop = (e: DragEvent): boolean => {
      const items = e.dataTransfer?.items;
      if (!items) return false;
      for (const item of Array.from(items)) {
        if (item.kind === 'file') return true;
      }
      return false;
    };
    const onDragOver = (e: DragEvent) => {
      if (!isPdfDrop(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.name.toLowerCase().endsWith('.pdf'),
      );
      if (!file) return;
      const path = window.lens.getPathForFile(file);
      if (path) void openPdf(path);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openPdf]);

  // Two-finger horizontal swipe → browser-style back / forward through lens
  // history. The hard part is distinguishing a swipe from a pinch — both
  // land as `wheel` events on the trackpad, but a pinch carries
  // ctrlKey=true *most* of the time and ctrlKey=false for the tail
  // events that come when your fingers lift asymmetrically. Those tail
  // events previously leaked into the swipe classifier and produced a
  // phantom "back" every time you zoomed with any rightward drift.
  //
  // The mental model: **pinch wins the tie-break, always.** Any
  // ctrlKey=true event stamps `lastPinchTime`; for 400 ms after that,
  // every non-ctrlKey wheel event is treated as pinch-aftermath and the
  // swipe classifier stays cold. No user physically pinches and then
  // swipes in <400 ms — there's always a finger-lift between them.
  //
  // Three more invariants protect against spurious navigation:
  //   1. **Nav-target gate** — if there's nothing to go back/forward
  //      to, horizontal wheels pass through to the PDF scroller. No
  //      chevron, no preventDefault, nothing.
  //   2. **Horizontal-dominance** — |dx| > |dy| × 1.6 so that diagonal
  //      drift during a scroll doesn't commit.
  //   3. **Quiet gap reset** — after 180 ms of no horizontal motion,
  //      reset the accumulator so rapid back-to-back swipes each get a
  //      fresh threshold.
  //
  // Listens in the capture phase on the window so we beat the PDF
  // scroller and Chromium's native window-edge back-gesture. The CSS
  // `overscroll-behavior: none` in index.css handles the scroller side.
  //
  // Debug: set `window.__fathomGestureDebug = true` in DevTools and
  // every wheel event + classification decision streams as
  // `[Gesture] …` — so if a user reports "it swiped while I zoomed",
  // we can see exactly which event crossed the threshold.
  useEffect(() => {
    let accum = 0;
    let lastActive = 0;
    let committed = false;
    let lastPinchTime = 0;
    const PINCH_LOCKOUT_MS = 400;

    const log = (line: string) => {
      if ((window as unknown as { __fathomGestureDebug?: boolean }).__fathomGestureDebug) {
        console.log(`[Gesture] ${line}`);
      }
    };

    const handler = (e: WheelEvent) => {
      // Anything with ctrlKey=true is a pinch. Stamp the time, wipe
      // any stale horizontal accumulator so a swipe that "almost
      // committed" before the pinch started doesn't fire after.
      if (e.ctrlKey) {
        lastPinchTime = Date.now();
        if (accum !== 0 || committed) {
          accum = 0;
          committed = false;
        }
        log(`pinch dx=${e.deltaX.toFixed(1)} dy=${e.deltaY.toFixed(1)} → lockout armed`);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Pinch aftermath — fingers still lifting. ctrlKey has flickered
      // off but this is not a swipe. Keep the accumulator cold.
      const sincePinch = Date.now() - lastPinchTime;
      if (sincePinch < PINCH_LOCKOUT_MS) {
        accum = 0;
        committed = false;
        log(`aftermath dx=${e.deltaX.toFixed(1)} sincePinch=${sincePinch}ms — ignored`);
        return;
      }

      // Nav-target gate: if there's nowhere to go, horizontal wheels are
      // the PDF's to handle.
      const lens = useLensStore.getState();
      const canGoBack = lens.focused !== null || lens.backStack.length > 0;
      const canGoForward = lens.forwardStack.length > 0;
      if (!canGoBack && !canGoForward) return;

      const now = Date.now();
      const horiz = Math.abs(e.deltaX);
      if (horiz > 0.5) lastActive = now;
      if (now - lastActive > 180 || horiz < 0.5) {
        if (committed || Math.abs(accum) > 10) {
          accum = 0;
          committed = false;
        }
      }

      if (horiz < Math.abs(e.deltaY) * 1.6) return;
      accum += e.deltaX;
      if (committed) {
        e.preventDefault();
        return;
      }
      const threshold = 120;
      if (accum <= -threshold && canGoBack) {
        e.preventDefault();
        committed = true;
        accum = 0;
        lens.back();
        log(`commit BACK`);
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'back' } }));
        if (useTourStore.getState().step === 'swipe') {
          useTourStore.getState().advance('celebrated');
        }
      } else if (accum >= threshold && canGoForward) {
        e.preventDefault();
        committed = true;
        accum = 0;
        lens.forward();
        log(`commit FORWARD`);
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'forward' } }));
      } else if (Math.abs(accum) >= threshold) {
        // Crossed the threshold in a direction with no target — reset
        // silently. The gesture doesn't mean anything here.
        accum = 0;
      }
    };
    window.addEventListener('wheel', handler, { passive: false, capture: true });
    return () =>
      window.removeEventListener('wheel', handler, { capture: true } as EventListenerOptions);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header
        className="relative flex h-11 items-center justify-center border-b border-black/5 px-3 text-[13px] font-medium text-black/60 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="truncate">{docState ? docState.name : 'Fathom'}</span>
        <div
          className="absolute right-2 flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Explicit "Ask" — opens a lens on the current viewport without
              requiring the pinch gesture. The PdfViewer listens for the
              fathom:askCurrentViewport event and runs the same flow. */}
          {docState && (
            <button
              onClick={() =>
                window.dispatchEvent(new CustomEvent('fathom:askCurrentViewport'))
              }
              className="rounded px-2 py-0.5 text-xs text-black/60 hover:bg-black/5"
              title="Ask Claude about what's on screen (⌘+pinch)"
            >
              Ask
            </button>
          )}
          {docState && (
            <button
              onClick={() => void createHighlightFromSelection(docState.contentHash)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-black/55 hover:bg-[color:var(--color-lens-soft)]"
              aria-label="Highlight selection"
              title="Highlight selected text (⌘H)"
            >
              {/* marker-pen icon, thin amber strokes */}
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 13 L3 11 L10.5 3.5 L12.5 5.5 L5 13 Z" />
                <path d="M9.5 4.5 L11.5 6.5" />
                <path d="M3 13 L2 14" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-black/55 hover:bg-black/5"
            aria-label="Preferences"
            title="Preferences (⌘,)"
          >
            {/* Gear icon, minimal strokes */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="2.2"/>
              <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7 3.4 3.4"/>
            </svg>
          </button>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-black/55 hover:bg-black/5"
            aria-label="Help"
            title="Show controls (?)"
          >
            ?
          </button>
          <button
            onClick={() => void openPdf()}
            className="rounded px-2 py-0.5 text-xs text-black/60 hover:bg-black/5"
          >
            Open…
          </button>
        </div>
      </header>
      <main className="relative flex-1 overflow-hidden">
        {docState ? (
          <ErrorBoundary where="PdfViewer">
            <PdfViewer />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary where="EmptyState">
            <EmptyState loading={loading} error={error} onOpen={() => void openPdf()} onOpenPath={(p) => void openPdf(p)} />
          </ErrorBoundary>
        )}
      </main>

      {/* Focus view overlays everything when active. Its own boundary so
          a lens-render crash doesn't blank the whole document behind. */}
      <ErrorBoundary where="FocusView">
        <FocusView />
      </ErrorBoundary>

      {showHelp && (
        <HelpOverlay
          onClose={() => setShowHelp(false)}
          focused={focused != null}
          onStartTour={() => {
            setShowHelp(false);
            setShowTour(true);
          }}
        />
      )}

      <FirstRunTour
        visible={showTour}
        onDone={(startCoach) => {
          setShowTour(false);
          // Always mark the tour as seen — a user who closed the welcome
          // has decided they don't need it again. The choice below is
          // just whether they want the in-app coach to follow up.
          void window.lens.markTourDone();
          if (startCoach) {
            useTourStore.getState().start();
          }
        }}
      />

      <CoachHint />
      <GestureFeedback />
      <UpdateToast />

      <SettingsPanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Indexing toast — sticky bottom-right, non-intrusive */}
      <IndexingToast
        visible={showIndexToast && indexState !== 'idle'}
        state={indexState}
        message={indexMessage}
        onDismiss={() => setShowIndexToast(false)}
      />
    </div>
  );
}

function IndexingToast({
  visible,
  state,
  message,
  onDismiss,
}: {
  visible: boolean;
  state: IndexState;
  message: string | null;
  onDismiss: () => void;
}) {
  const pill = (() => {
    if (state === 'running')
      return { color: 'bg-black/80 text-white', icon: '⟳', label: 'Indexing paper…' };
    if (state === 'done' || state === 'cached')
      return {
        color: 'bg-emerald-600 text-white',
        icon: '✓',
        label: state === 'cached' ? 'Already indexed' : 'Paper indexed',
      };
    if (state === 'error')
      return {
        color: 'bg-red-600 text-white',
        icon: '!',
        label: 'Indexing failed — results may be less precise',
      };
    return null;
  })();
  return (
    <AnimatePresence>
      {visible && pill && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          className={`fixed right-5 bottom-5 z-50 flex ${state === 'error' ? 'max-w-md flex-col items-end' : 'max-w-sm items-center'} gap-2 rounded-xl px-4 py-2 text-[12px] font-medium shadow-lg backdrop-blur`}
          style={{ background: undefined }}
        >
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${pill.color}`}>
            <span className={state === 'running' ? 'inline-block animate-spin' : ''}>
              {pill.icon}
            </span>
            <span>{pill.label}</span>
            {state !== 'running' && (
              <button
                onClick={onDismiss}
                className="ml-2 rounded-full px-1 text-[11px] opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                ×
              </button>
            )}
          </div>
          {state === 'error' && message && (
            <div className="flex flex-col items-end gap-1 rounded-lg bg-white/95 px-3 py-2 text-[11px] leading-snug text-black/80 shadow-sm">
              <pre className="max-h-48 max-w-[26rem] overflow-auto whitespace-pre-wrap text-left font-sans text-[11px] text-black/75">
                {message}
              </pre>
              <div className="flex gap-1.5">
                <button
                  onClick={() => navigator.clipboard.writeText(message)}
                  className="rounded bg-black/5 px-2 py-0.5 text-[10.5px] text-black/70 hover:bg-black/10"
                >
                  Copy
                </button>
                <button
                  onClick={() => void window.lens.revealLogFile()}
                  className="rounded bg-black/5 px-2 py-0.5 text-[10.5px] text-black/70 hover:bg-black/10"
                >
                  Show log
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fathom's welcome screen — what the user sees on first launch after a
 * fresh install (and any later time no paper is open). Two balanced
 * choices — *Try with sample paper* and *Open your own* — laid out on a
 * warm paper-cream card with a handwritten tagline in Excalifont. The
 * entire card also accepts a dragged PDF; visible affordance beats
 * invisible ones. Drag state brightens the amber accents so the gesture
 * feels alive.
 *
 * No dashed-border "drop zone" chrome; the card *is* the drop target.
 * No "Pinch to zoom" hint either — that lives inside the lens footer
 * and in the `?` reference. This screen is about getting one paper on
 * screen; everything else is discoverable once they're reading.
 */
function EmptyState({
  loading,
  error,
  onOpen,
  onOpenPath,
}: {
  loading: boolean;
  error: string | null;
  onOpen: () => void;
  onOpenPath: (path: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);

  const openSample = useCallback(async () => {
    setSampleLoading(true);
    try {
      const result = await window.lens.openSample();
      if (result?.path) {
        // Hand off to the same pipeline a drag-drop uses. onOpenPath
        // runs openPdfAtPath → prepareOpenedPdf → pdf.js load +
        // setDocument, so the welcome card dismisses naturally.
        onOpenPath(result.path);
      } else {
        console.warn('[sample] openSample returned no path');
      }
    } catch (err) {
      console.warn('[sample] openSample failed', err);
    } finally {
      setSampleLoading(false);
    }
  }, [onOpenPath]);

  return (
    <div
      className="flex h-full items-center justify-center px-8"
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // only clear when we actually leave the card, not on inner elements
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.name.toLowerCase().endsWith('.pdf'),
        );
        if (!file) return;
        const path = window.lens.getPathForFile(file);
        if (path) onOpenPath(path);
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-[min(580px,92vw)] overflow-hidden rounded-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_64px_rgba(201,131,42,0.14)]"
        style={{
          background: '#faf4e8',
          transform: dragOver ? 'scale(1.006)' : 'scale(1)',
          transition: 'transform 140ms ease-out',
          outline: dragOver
            ? '2px solid rgba(201, 131, 42, 0.55)'
            : '1px solid rgba(224, 211, 172, 0.6)',
          outlineOffset: '-1px',
        }}
      >
        {/* Top strip — handwritten brand + tagline */}
        <div className="flex flex-col items-center gap-1 px-10 pt-11 pb-6">
          <div
            className="text-[40px] leading-none tracking-tight"
            style={{
              fontFamily:
                "'Excalifont', 'Caveat', 'Kalam', 'Bradley Hand', cursive",
              color: '#1a1614',
            }}
          >
            Fathom
          </div>
          <div
            className="text-[17px] leading-snug"
            style={{
              fontFamily:
                "'Excalifont', 'Caveat', 'Kalam', 'Bradley Hand', cursive",
              color: '#9f661b',
            }}
          >
            Dive into any paper.
          </div>
        </div>

        {/* Quiet divider */}
        <div
          aria-hidden="true"
          className="mx-auto h-px w-16"
          style={{ background: 'rgba(224, 211, 172, 0.9)' }}
        />

        {/* Choice grid */}
        <div className="grid grid-cols-1 gap-3 px-10 pt-7 pb-4 sm:grid-cols-2">
          <button
            onClick={() => void openSample()}
            disabled={sampleLoading || loading}
            className="group flex flex-col items-start gap-2 rounded-[14px] border px-5 py-5 text-left transition disabled:cursor-progress disabled:opacity-60"
            style={{
              borderColor: 'rgba(201, 131, 42, 0.35)',
              background: 'rgba(201, 131, 42, 0.06)',
            }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: 'rgba(201, 131, 42, 0.18)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="#9f661b" strokeWidth="1.7" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6" />
                <path d="M20 20 L15 15" />
              </svg>
            </div>
            <div className="text-[14.5px] font-medium leading-tight" style={{ color: '#1a1614' }}>
              {sampleLoading ? 'Opening sample…' : 'Try with sample paper'}
            </div>
            <div className="text-[12px] leading-snug" style={{ color: '#7a6a52' }}>
              <em>Attention Is All You Need</em> — Vaswani et al., the paper that introduced the Transformer. Pinch any dense passage and see what Fathom does with it.
            </div>
          </button>

          <button
            onClick={onOpen}
            disabled={loading}
            className="group flex flex-col items-start gap-2 rounded-[14px] border px-5 py-5 text-left transition hover:bg-black/[0.015] disabled:cursor-progress disabled:opacity-60"
            style={{ borderColor: 'rgba(26, 22, 20, 0.12)', background: 'transparent' }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: 'rgba(26, 22, 20, 0.06)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="#1a1614" strokeWidth="1.6" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6 L10 6 L12 8 L20 8 L20 19 L4 19 Z" />
              </svg>
            </div>
            <div className="text-[14.5px] font-medium leading-tight" style={{ color: '#1a1614' }}>
              {loading ? 'Opening…' : 'Open your own paper'}
            </div>
            <div className="text-[12px] leading-snug" style={{ color: '#7a6a52' }}>
              Browse for a PDF, or drop one onto this card. `⌘O` also works.
            </div>
          </button>
        </div>

        {/* Drop hint — only surfaces while the user is dragging */}
        <div
          className="flex items-center justify-center gap-2 px-10 pt-1 pb-7 text-[12px]"
          style={{ color: dragOver ? '#9f661b' : '#9c8b6a' }}
        >
          {dragOver ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round">
                <path d="M12 4 L12 16 M6 10 L12 16 L18 10" />
              </svg>
              <span style={{ fontFamily: "'Excalifont', 'Caveat', cursive" }}>Drop it anywhere on the card</span>
            </>
          ) : (
            <span>… or just drag a PDF onto this window.</span>
          )}
        </div>

        {error && (
          <div className="px-10 pb-6 text-center text-[12px]" style={{ color: '#b02a2a' }}>
            {error}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function HelpOverlay({
  onClose,
  focused,
  onStartTour,
}: {
  onClose: () => void;
  focused: boolean;
  onStartTour: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[420px] rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black/85">Fathom controls</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-black/40 hover:bg-black/5"
            aria-label="Close help"
          >
            ✕
          </button>
        </div>
        <dl className="flex flex-col gap-3 text-sm">
          <Row k="Pinch" v="Zoom in / out (anchored on cursor)" />
          <Row k="⌘ + pinch in" v="Dive into the paragraph under the cursor" />
          <Row k="⌘ + pinch out" v={focused ? 'Go back one level' : 'No effect (no lens open)'} />
          <Row k="Select text + ⌘ + pinch in" v="Dive into the selected concept" />
          <Row k="Swipe right (two-finger)" v="Go back through lens history" />
          <Row k="Top-left Back/Close button" v="Leave the current lens" />
          <Row k="⌘ ⇧ D" v="Dive in (keyboard alternative to ⌘+pinch)" />
          <Row k="⌘ ⇧ A" v="Ask about the current viewport" />
          <Row k="⌘ H" v="Highlight the current text selection (amber)" />
          <Row k="Click highlight" v="Remove it" />
          <Row k="⌘ [ / ⌘ ]" v="Back / forward through lens history" />
          <Row k="⌘ + 0" v="Reset zoom to 100%" />
          <Row k="⌘ + = / ⌘ + −" v="Zoom in / out" />
          <Row k="?" v="Toggle this help" />
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-black/45">
          Diving in opens a focused reading view of the paragraph with a streaming AI explanation.
          Inside that view, select any phrase you don't recognize — an algorithm name, a term, an equation —
          and ⌘+pinch on it to dive deeper into that specific concept.
        </p>
        <button
          onClick={onStartTour}
          className="mt-4 w-full rounded-full bg-[#1a1614] py-2 text-[12.5px] font-medium text-[#faf4e8] transition hover:bg-[#c9832a]"
        >
          Walk me through it again
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[170px] flex-shrink-0 font-mono text-[11px] tracking-wide text-black/55 uppercase">
        {k}
      </dt>
      <dd className="text-[13px] text-black/75">{v}</dd>
    </div>
  );
}
