import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pdfjsLib } from './pdf/pdfjs';
import { useDocumentStore } from './state/document';
import { useRegionsStore } from './state/regions';
import { useLensStore } from './lens/store';
import { buildPaperIndex } from './pdf/buildIndex';
import PdfViewer from './pdf/PdfViewer';
import FocusView from './lens/FocusView';
import FirstRunTour from './lens/FirstRunTour';
import SettingsPanel from './lens/SettingsPanel';
import CoachHint from './lens/CoachHint';
import GestureFeedback from './lens/GestureFeedback';
import UpdateToast from './lens/UpdateToast';
import { useTourStore } from './lens/tourStore';

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

  // Global F1 / ⌘⇧? to toggle help. Suppress when an input/textarea/contenteditable
  // is focused so the user can actually type "?" into the Ask box.
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

  // Drag-and-drop anywhere on the window. Electron's renderer exposes the
  // absolute local path via the non-standard File.path extension, so we
  // don't need to round-trip bytes through the main process.
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
      // Electron's File objects carry a .path property (a non-standard
      // extension) that gives the absolute local path.
      const path = (file as File & { path?: string }).path;
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
  // history. Listens in the capture phase on the window so we beat the PDF
  // scroller and any other child wheel-listener to the event — they were
  // consuming horizontal wheel ticks as page-scroll and native
  // back/forward navigation on macOS (Chromium's "swipe at window edge"
  // feature). The `overscroll-behavior: none` in index.css plus capture-
  // phase intercept here together lets a swipe anywhere on the window
  // reach this handler regardless of cursor position.
  useEffect(() => {
    let accum = 0;
    let lastTime = 0;
    let committed = false;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom owns ctrlKey-wheels
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastTime > 350) {
        accum = 0;
        committed = false;
      }
      lastTime = now;
      // Only horizontal-dominant wheels concern us. Once we've decided it's
      // a swipe, preventDefault immediately so (a) the PDF scroller
      // doesn't scroll horizontally, (b) Chromium's window-edge back/forward
      // doesn't intercept. Both were causing the asymmetric "only works on
      // one side of the PDF" regression users reported.
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.4) return;
      e.preventDefault();
      accum += e.deltaX;
      if (committed) return;
      const threshold = 120;
      if (accum <= -threshold) {
        // Natural-scroll: fingers swipe RIGHT → deltaX negative → go BACK.
        committed = true;
        useLensStore.getState().back();
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'back' } }));
        if (useTourStore.getState().step === 'swipe') {
          useTourStore.getState().advance('celebrated');
        }
      } else if (accum >= threshold) {
        committed = true;
        useLensStore.getState().forward();
        window.dispatchEvent(new CustomEvent('fathom:swipe', { detail: { dir: 'forward' } }));
      }
    };
    // Capture phase — fires before any child's bubble-phase listener. The
    // PDF scroller's own wheel handler then can't consume the event.
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
          <PdfViewer />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => void openPdf()}
                disabled={loading}
                className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-black/85 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Opening…' : 'Open PDF…'}
              </button>
              {error && <div className="text-xs text-red-600">{error}</div>}
              <div className="text-xs text-black/40">
                Pinch to zoom · ⌘ + pinch on a paragraph to dive in
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Focus view overlays everything when active. */}
      <FocusView />

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
        onDone={() => {
          setShowTour(false);
          // Welcome card dismissing is the trigger for the interactive
          // coach — we don't mark tour done here; the coach does that
          // when the user reaches the swipe step (or hits Skip).
          useTourStore.getState().start();
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
