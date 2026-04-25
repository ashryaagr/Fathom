import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore, MIN_ZOOM, MAX_ZOOM } from '../state/document';
import PageView from './PageView';
import { findRegionUnderCursor } from '../gestures/hitTest';
import { useLensStore, type FocusedLens } from '../lens/store';
import { useTourStore } from '../lens/tourStore';
import { useRegionsStore } from '../state/regions';
import type { Region } from './extractRegions';
import { captureScrollerViewport, captureCanvasRect } from './captureViewport';
import PdfContextMenu from './PdfContextMenu';

/** Synchronous (async IPC) zoom-image save — awaited by the commit path so the saved
 * path is guaranteed to be on the lens before any downstream explain call reads it. */
async function saveZoomImageSync(
  paperHash: string,
  lensId: string,
  dataUrl: string,
): Promise<string | undefined> {
  const comma = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const { path } = await window.lens.saveZoomImage({
    paperHash,
    lensId,
    bytes: bytes.buffer,
  });
  return path;
}

const VISUAL_ZOOM_SENSITIVITY = 0.012;
const NEIGHBOR_COUNT = 3;

export default function PdfViewer() {
  const { document: docState, zoom, multiplyZoom, setZoom } = useDocumentStore();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pageBaseSizes, setPageBaseSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [armed, setArmed] = useState(false);
  // We want to restore the saved scrollY exactly once per docState
  // change, after enough pages have been measured for the scroller's
  // scrollHeight to actually reach that Y. Re-running on every render
  // would yank the user back to the start every time they scrolled.
  const restoredScrollRef = useRef<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<
    { x: number; y: number; selection: string } | null
  >(null);

  // Restore the saved scroll position after enough pages have been
  // measured for the scroller's scrollHeight to actually reach that
  // Y. (todo #42 — reopen a paper at the position you left it.)
  // Triggers on docState change and on each page-size measurement
  // until the target Y becomes reachable, then never re-runs for
  // this document.
  useEffect(() => {
    if (!docState) return;
    if (restoredScrollRef.current === docState.contentHash) return;
    const targetY = docState.initialScrollY ?? 0;
    if (targetY <= 0) {
      restoredScrollRef.current = docState.contentHash;
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    // Wait until enough scrollable content exists to reach targetY.
    if (el.scrollHeight <= targetY + el.clientHeight) return;
    el.scrollTo({ top: targetY, behavior: 'auto' });
    restoredScrollRef.current = docState.contentHash;
  }, [docState, pageBaseSizes]);

  // Save the user's scroll position throttled (~500 ms) so reopening
  // the paper later lands them right where they were. The write IPC
  // is fire-and-forget; if it fails we don't surface anything — the
  // user just won't get position memory for that paper. (todo #42)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !docState) return;
    const hash = docState.contentHash;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      // Synchronously dispatch the most-recent scroll position so the
      // last 500 ms of scrolling before close/switch isn't lost. The
      // bug this fixes: user reported reopening landed on the wrong
      // page because the debounced timer was cleared on cleanup
      // before its callback ran. Now cleanup flushes first, THEN
      // clears.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const y = el.scrollTop;
      void window.lens.savePaperScroll?.({ paperHash: hash, scrollY: y }).catch(() => {});
    };
    const onScroll = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, 500);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Also flush when the window loses visibility (user switched
    // away mid-read) — same reason as cleanup. Using
    // visibilitychange instead of beforeunload because Electron
    // window-close on macOS goes through hide-then-quit, not
    // beforeunload.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [docState]);

  // Progressively fill in each page's base dimensions so the layout settles one page at a
  // time rather than showing a forest of 612×792 placeholders until the whole doc is measured.
  useEffect(() => {
    if (!docState) {
      setPageBaseSizes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= docState.numPages; i++) {
        const page = await docState.doc.getPage(i);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setPageBaseSizes((prev) => {
          const next = prev.slice();
          next[i - 1] = { width: viewport.width, height: viewport.height };
          return next;
        });
      }
    })().catch((err) => console.error('page sizing failed', err));
    return () => {
      cancelled = true;
    };
  }, [docState]);

  // Pinch handling:
  //   - Plain pinch → cursor-anchored visual zoom, continuously.
  //   - Cmd-held during pinch → arms semantic mode (subtle UI). Visual zoom still flows
  //     so the user can frame what they want to dive into.
  //   - Commit moment = when the user RELEASES Cmd (keyup Meta). At that moment:
  //       - If selection → focus on selection
  //       - Else → focus on whatever's in viewport right now
  //   - If the semantic pinch direction was "out" (zoomed out), release closes the
  //     current lens instead of opening a new one.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !docState || pageBaseSizes.length === 0) return;

    let semanticEver = false; // became true when any wheel event had metaKey=true
    let semanticAccumDeltaY = 0; // net deltaY during the ⌘-held phase
    let lastSemanticDir: 'in' | 'out' | null = null;
    let lastCursor: { x: number; y: number } | null = null;

    const mouseHandler = (e: MouseEvent) => {
      lastCursor = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', mouseHandler);

    const wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // When the focus view is open, all gestures belong to it — PdfViewer must not
      // commit or zoom underneath. This prevents weird "auto-zoom-out" when the user is
      // typing a follow-up with Cmd still held somewhere in their muscle memory.
      if (useLensStore.getState().focused) return;
      e.preventDefault();
      lastCursor = { x: e.clientX, y: e.clientY };

      if (e.metaKey) {
        if (!semanticEver) {
          semanticEver = true;
          semanticAccumDeltaY = 0;
          setArmed(true);
          // Tell the GestureFeedback overlay semantic mode is active so it
          // can draw the amber hairline around the viewport.
          window.dispatchEvent(
            new CustomEvent('fathom:semanticArmed', { detail: { on: true } }),
          );
        }
        semanticAccumDeltaY += e.deltaY;
        if (e.deltaY !== 0) lastSemanticDir = e.deltaY < 0 ? 'in' : 'out';
      }

      // Apply visual zoom for BOTH plain and ⌘+pinch. The earlier attempt
      // to suppress visual zoom during ⌘+pinch made it impossible for the
      // user to aim — they couldn't visually close in on the passage they
      // wanted to dive into. The whole point of "pinch to zoom then release
      // ⌘ to commit" is that the same zoom motion both narrows the target
      // and signals the commit. Restored to the original behaviour.
      applyAnchoredZoom(
        el,
        e.clientX,
        e.clientY,
        e.deltaY,
        useDocumentStore.getState().zoom,
        multiplyZoom,
      );
    };

    const keyupHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Meta') return;
      if (!semanticEver) return;
      // If a focus is open, it owns the gesture — don't commit behind its back.
      if (useLensStore.getState().focused) {
        semanticEver = false;
        semanticAccumDeltaY = 0;
        lastSemanticDir = null;
        setArmed(false);
        window.dispatchEvent(new CustomEvent('fathom:semanticArmed', { detail: { on: false } }));
        return;
      }
      // In the PDF view there's no lens to close, so any semantic gesture
      // means "open a focus here". The prior code gated on `lastSemanticDir
      // === 'in'`, which missed the common case where a user's pinch naturally
      // reverses direction mid-gesture (fingers drift outward then inward) —
      // the final wheel event was 'out', the code did nothing, the user saw
      // a silently-failed pinch. Direction-agnostic commit fixes that.
      console.log(
        `[Lens] Cmd released with semantic intent: accumΔ=${semanticAccumDeltaY.toFixed(1)} last=${lastSemanticDir ?? 'none'}`,
      );
      commitSemanticFocus(
        el,
        docState.contentHash,
        pageBaseSizes,
        useDocumentStore.getState().zoom,
        lastCursor,
      );
      // Brief ring-pulse at the viewport center — visual confirmation that
      // the pinch committed a zoom (as opposed to being silently dropped).
      window.dispatchEvent(new CustomEvent('fathom:zoomCommit'));
      window.dispatchEvent(new CustomEvent('fathom:semanticArmed', { detail: { on: false } }));
      if (useTourStore.getState().step === 'pinch') {
        useTourStore.getState().advance('ask');
      }
      semanticEver = false;
      semanticAccumDeltaY = 0;
      lastSemanticDir = null;
      setArmed(false);
    };

    el.addEventListener('wheel', wheelHandler, { passive: false });
    window.addEventListener('keyup', keyupHandler);
    return () => {
      el.removeEventListener('wheel', wheelHandler);
      window.removeEventListener('keyup', keyupHandler);
      window.removeEventListener('mousemove', mouseHandler);
    };
  }, [docState, pageBaseSizes, multiplyZoom]);

  // Keyboard shortcuts on the PDF viewer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!docState) return;
      if (e.metaKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        multiplyZoom(1.15);
      } else if (e.metaKey && e.key === '-') {
        e.preventDefault();
        multiplyZoom(1 / 1.15);
      } else if (e.metaKey && e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [docState, multiplyZoom, setZoom]);

  // Listen for the header's "Ask" button. It dispatches a custom event
  // rather than going through a zustand action so we can reuse the exact
  // commitSemanticFocus flow the trackpad gesture uses — same code path,
  // same viewport fallback, same persistence.
  useEffect(() => {
    const handler = async () => {
      const el = scrollerRef.current;
      if (!el || !docState) return;
      // No cursor — commitSemanticFocus will fall through to its viewport-
      // scope branch, which is what "Ask about what's on screen" means.
      await commitSemanticFocus(
        el,
        docState.contentHash,
        pageBaseSizes,
        useDocumentStore.getState().zoom,
        null,
      );
    };
    window.addEventListener('fathom:askCurrentViewport', handler);
    return () => window.removeEventListener('fathom:askCurrentViewport', handler);
  }, [docState, pageBaseSizes]);

  // Right-click menu: "Dive in here" (or "Dive into <selection>"). Same
  // commitSemanticFocus path as the pinch gesture; exists so users who'd
  // rather click than pinch have a first-class alternative.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      // Don't hijack right-click in inputs / textareas.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      const sel = window.getSelection()?.toString().trim() ?? '';
      setCtxMenu({ x: e.clientX, y: e.clientY, selection: sel });
    };
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  const pages = useMemo(() => {
    if (!docState) return [] as number[];
    return Array.from({ length: docState.numPages }, (_, i) => i + 1);
  }, [docState]);

  if (!docState) return null;

  return (
    <div className="relative flex h-full flex-col">
      <ZoomChrome zoom={zoom} onSet={(z) => useDocumentStore.getState().setZoom(z)} />
      {/* Armed overlay — subtle ring around the viewport so the user knows semantic mode is on */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 rounded-md transition-shadow duration-150 ${armed ? 'ring-2 ring-[color:var(--color-lens)]/60 ring-inset' : ''}`}
        aria-hidden
      />
      {armed && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[color:var(--color-lens)] px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase shadow">
          release ⌘ to dive in · selection or viewport
        </div>
      )}
      {/* `scrollbar-gutter: stable both-edges` reserves the same gutter
          on BOTH sides whether or not the vertical scrollbar is
          visible, so the `mx-auto`-centered page stays optically
          centered regardless of the user's macOS "show scrollbars"
          preference. v1.0.20 tried switching this to `flex flex-col
          items-center` to fix a separate "page hugs left edge"
          symptom — but that broke pdf.js rendering (canvases stayed
          blank, only the slot div + markers painted). Reverted; the
          centering bug is being investigated separately. */}
      <div ref={scrollerRef} className="flex-1 overflow-auto px-8 py-4 [scrollbar-gutter:stable_both-edges]" data-pdf-scroller>
        {pages.map((p) => {
          // Use the most-recently-known size as a placeholder for un-measured pages so the
          // layout doesn't flash the wrong dimensions. Most research papers are uniform-sized.
          const size = pageBaseSizes[p - 1];
          const keyed = `${docState.contentHash}:${p}`;
          if (size) {
            return (
              <PageView
                key={keyed}
                doc={docState.doc}
                pageNumber={p}
                paperHash={docState.contentHash}
                zoom={zoom}
                baseSize={size}
              />
            );
          }
          const fallback = pageBaseSizes.find(Boolean);
          if (!fallback) return null;
          return (
            <div
              key={keyed}
              className="relative mx-auto my-4 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]"
              style={{ width: fallback.width * zoom, height: fallback.height * zoom }}
            />
          );
        })}
      </div>
      {ctxMenu && (
        <PdfContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          selection={ctxMenu.selection}
          onDiveIn={() => {
            const el = scrollerRef.current;
            if (el && docState) {
              void commitSemanticFocus(
                el,
                docState.contentHash,
                pageBaseSizes,
                useDocumentStore.getState().zoom,
                { x: ctxMenu.x, y: ctxMenu.y },
              );
            }
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

/**
 * Build a FocusedLens describing whatever the user wants to dive into right now,
 * and open it in the lens store. Priority:
 *   1. If the user has a non-empty text selection — focus on that selection.
 *   2. Otherwise, use the cursor's last position to hit-test the region directly
 *      under the cursor. This is the "point at it, zoom, release Cmd → dive" flow —
 *      precise because the user is literally pointing at the thing.
 *   3. If there's no region under the cursor (e.g. the cursor sat on a figure or margin),
 *      fall back to the viewport content so figure-zooms still open a focus on that page.
 */
async function commitSemanticFocus(
  scroller: HTMLElement,
  paperHash: string,
  pageBaseSizes: Array<{ width: number; height: number }>,
  zoom: number,
  cursor: { x: number; y: number } | null,
): Promise<void> {
  const lensStore = useLensStore.getState();
  console.log('[Lens] commitSemanticFocus', {
    cursor,
    zoom,
    hasFocused: !!lensStore.focused,
    paperHashPrefix: paperHash.slice(0, 8),
  });

  // In the PDF viewer we deliberately ignore any accidental text selection made during
  // the pinch — the user's intent is "zoom in on what's in my viewport". Selection-drill
  // is a separate feature, scoped to inside the FocusView only.
  window.getSelection()?.removeAllRanges();

  // 1. Cursor-anchored: find the paragraph under the cursor and use that.
  if (cursor) {
    const hit = findRegionUnderCursor(paperHash, cursor.x, cursor.y, zoom, pageBaseSizes);
    if (hit?.region) {
      const region = hit.region;
      const pageRect = hit.pageElement.getBoundingClientRect();
      const baseSize = pageBaseSizes[hit.page - 1];
      if (baseSize) {
        const sourceRect = {
          x: pageRect.left + region.bbox.x * zoom,
          y: pageRect.top + (baseSize.height - region.bbox.y - region.bbox.height) * zoom,
          width: region.bbox.width * zoom,
          height: region.bbox.height * zoom,
        };
        const allRegions = useRegionsStore.getState().getPage(paperHash, hit.page);
        const idx = allRegions.findIndex((r) => r.id === region.id);
        const prevTexts: string[] = [];
        const nextTexts: string[] = [];
        for (let i = 1; i <= 3; i++) {
          const p = allRegions[idx - i];
          if (p) prevTexts.push(p.text);
          const n = allRegions[idx + i];
          if (n) nextTexts.push(n.text);
        }
        // The anchor image must be exactly what the user is looking at — no more, no less.
        // The viewport capture is now clipped horizontally to the scroller bounds, so it
        // excludes a non-visible column when the user has scrolled/zoomed to the other one.
        // Fall back to a region-scoped crop only if viewport capture fails.
        const anchorImage =
          captureScrollerViewport(scroller) ??
          captureCanvasRect(hit.pageElement, sourceRect) ??
          undefined;
        console.log('[Lens] opening region focus', {
          regionId: region.id,
          page: hit.page,
          textLen: region.text.length,
          hasAnchorImage: !!anchorImage,
        });
        // Save the zoom image to disk FIRST so `zoomImagePath` is populated before the
        // explain stream starts and before the row lands in SQLite. Otherwise the image
        // doesn't restore on reopen.
        let zoomImagePath: string | undefined;
        if (anchorImage) {
          try {
            zoomImagePath = await saveZoomImageSync(paperHash, region.id, anchorImage.dataUrl);
            console.log('[Lens] zoom image saved synchronously', zoomImagePath);
          } catch (err) {
            console.warn('[Lens] sync zoom save failed', err);
          }
        }
        lensStore.open({
          id: region.id,
          origin: 'region',
          paperHash,
          page: hit.page,
          bbox: region.bbox,
          sourceRect,
          anchorText: region.text,
          focusPhrase: null,
          prevTexts,
          nextTexts,
          parentBody: null,
          regionId: region.id,
          turns: [],  // chat is user-driven: empty until they ask
          anchorImage,
          zoomImagePath,
        });
        return;
      }
    }
  }

  console.log('[Lens] cursor hit-test missed, falling back to viewport scope');
  // 2. Viewport fallback — for figure-only regions (no text) and similar.
  const captured = captureViewportContent(scroller, paperHash, pageBaseSizes, zoom);
  const vpImage = captureScrollerViewport(scroller) ?? undefined;
  if (!captured) {
    // As a last resort just open a "page-level" focus with the viewport image.
    if (!vpImage) return;
    const pageEls = Array.from(scroller.querySelectorAll<HTMLElement>('[data-page]'));
    const page = findPrimaryVisiblePage(scroller, pageEls) ?? 1;
    const pageLensId = `vp:${paperHash.slice(0, 8)}:${page}:${djb2(String(Date.now()))}`;
    // Persist the captured pixels to disk so a future close-and-reopen
    // can restore the same anchor image. Without this save, the lens-
    // anchor row stores zoom_image_path = null and reopen falls
    // through to the magnifying-glass placeholder (the bug surfaced
    // by the v1.0.16 QA review). Region-origin lenses do this above
    // at line ~388; viewport-origin must do the symmetric thing.
    let zoomImagePath: string | undefined;
    try {
      zoomImagePath = await saveZoomImageSync(paperHash, pageLensId, vpImage.dataUrl);
    } catch (err) {
      console.warn('[Lens] viewport-fallback zoom save failed', err);
    }
    lensStore.open({
      id: pageLensId,
      origin: 'viewport',
      paperHash,
      page,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      sourceRect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      anchorText: '',
      focusPhrase: `visual on page ${page}`,
      prevTexts: [],
      nextTexts: [],
      parentBody: null,
      regionId: null,
      turns: [],  // chat is user-driven: empty until they ask
      anchorImage: vpImage,
      zoomImagePath,
    });
    return;
  }
  // Common viewport path. captured.id is the deterministic vp:hash:page:idHash
  // built in captureViewportContent (line ~524) — stable across sessions
  // because it's derived from the visible region ids. We save the
  // captured pixels under that lens id so reopen finds the same file.
  let vpZoomImagePath: string | undefined;
  if (vpImage) {
    try {
      vpZoomImagePath = await saveZoomImageSync(paperHash, captured.id, vpImage.dataUrl);
    } catch (err) {
      console.warn('[Lens] viewport zoom save failed', err);
    }
  }
  lensStore.open({ ...captured, anchorImage: vpImage, zoomImagePath: vpZoomImagePath });
}

function captureViewportContent(
  scroller: HTMLElement,
  paperHash: string,
  pageBaseSizes: Array<{ width: number; height: number }>,
  zoom: number,
): FocusedLens | null {
  const sRect = scroller.getBoundingClientRect();
  const pages = Array.from(scroller.querySelectorAll<HTMLElement>('[data-page]'));
  const captured: Array<{ region: Region; page: number }> = [];

  for (const pageEl of pages) {
    const pRect = pageEl.getBoundingClientRect();
    if (pRect.bottom < sRect.top || pRect.top > sRect.bottom) continue;
    const pageNumber = Number(pageEl.dataset.page);
    const baseSize = pageBaseSizes[pageNumber - 1];
    if (!baseSize) continue;

    const visibleTopCss = Math.max(0, sRect.top - pRect.top);
    const visibleBottomCss = Math.min(pRect.height, sRect.bottom - pRect.top);
    // Convert CSS y (top-down) to PDF y (bottom-up) at this page's base.
    const visiblePdfYBottom = baseSize.height - visibleBottomCss / zoom;
    const visiblePdfYTop = baseSize.height - visibleTopCss / zoom;

    const regions = useRegionsStore.getState().getPage(paperHash, pageNumber);
    for (const r of regions) {
      const rTop = r.bbox.y + r.bbox.height;
      const rBottom = r.bbox.y;
      // Region's vertical span in PDF coords [rBottom, rTop]. Viewport [visiblePdfYBottom, visiblePdfYTop].
      // They intersect if rBottom <= visiblePdfYTop AND rTop >= visiblePdfYBottom.
      if (rBottom > visiblePdfYTop || rTop < visiblePdfYBottom) continue;
      captured.push({ region: r, page: pageNumber });
    }
  }

  // If no text regions intersect the viewport (e.g., a pure figure/diagram),
  // still open a focus anchored to the page the viewport is on — Claude will
  // Read the page and describe whatever is there (figure, equation, whitespace).
  if (captured.length === 0) {
    const primaryPage = findPrimaryVisiblePage(scroller, pages);
    if (!primaryPage) return null;
    const padding = 60;
    // Anchor bbox sits in the upper-right area of the page, in PDF
    // user-space, so the registered marker actually lands on the
    // page when the user backs out (a 0,0,0,0 bbox would pin the
    // dot to the top-left corner where it's clipped). 80% across,
    // 90% up the page — close to where the user was probably
    // looking when they hit Ask.
    const baseSize = pageBaseSizes[primaryPage - 1] ?? { width: 600, height: 800 };
    const markerBbox = {
      x: baseSize.width * 0.8,
      y: baseSize.height * 0.85,
      width: baseSize.width * 0.1,
      height: baseSize.height * 0.04,
    };
    return {
      id: `page:${paperHash.slice(0, 8)}:${primaryPage}:${djb2(String(Date.now()))}`,
      origin: 'viewport',
      paperHash,
      page: primaryPage,
      bbox: markerBbox,
      sourceRect: {
        x: sRect.left + padding,
        y: sRect.top + padding,
        width: Math.max(40, sRect.width - padding * 2),
        height: Math.max(40, sRect.height - padding * 2),
      },
      anchorText: '',
      focusPhrase: `visual on page ${primaryPage}`,
      prevTexts: [],
      nextTexts: [],
      parentBody: null,
      regionId: null,
      turns: [],  // chat is user-driven: empty until they ask
    };
  }

  const text = captured.map((c) => c.region.text).join('\n\n');
  const idHash = djb2(captured.map((c) => c.region.id).join('|'));
  const id = `vp:${paperHash.slice(0, 8)}:${captured[0].page}:${idHash}`;

  // Source rect = the inner viewport area, with a little padding so the animation
  // visibly "lifts off" rather than expanding from edge to edge.
  const padding = 60;
  const sourceRect = {
    x: sRect.left + padding,
    y: sRect.top + padding,
    width: Math.max(40, sRect.width - padding * 2),
    height: Math.max(40, sRect.height - padding * 2),
  };

  // Neighbor texts = paragraphs just outside the captured viewport span.
  const firstPage = captured[0].page;
  const lastPage = captured[captured.length - 1].page;
  const firstRegions = useRegionsStore.getState().getPage(paperHash, firstPage);
  const lastRegions = useRegionsStore.getState().getPage(paperHash, lastPage);
  const firstId = captured[0].region.id;
  const lastId = captured[captured.length - 1].region.id;
  const firstIdx = firstRegions.findIndex((r) => r.id === firstId);
  const lastIdx = lastRegions.findIndex((r) => r.id === lastId);

  const prevTexts: string[] = [];
  for (let i = 1; i <= NEIGHBOR_COUNT; i++) {
    const r = firstRegions[firstIdx - i];
    if (!r) break;
    prevTexts.push(r.text);
  }
  const nextTexts: string[] = [];
  for (let i = 1; i <= NEIGHBOR_COUNT; i++) {
    const r = lastRegions[lastIdx + i];
    if (!r) break;
    nextTexts.push(r.text);
  }

  return {
    id,
    origin: 'viewport',
    paperHash,
    page: captured[0].page,
    // Use the first captured region's bbox as the marker anchor.
    // Without a real bbox the marker would render at the top-left
    // page corner (pageHeight - 0 - 0 = pageHeight) which is
    // off-screen; the captured region's bbox is the closest signal
    // to "where the user was actually looking".
    bbox: { ...captured[0].region.bbox },
    sourceRect,
    anchorText: text,
    focusPhrase: null,
    prevTexts,
    nextTexts,
    parentBody: null,
    regionId: captured.length === 1 ? captured[0].region.id : null,
    turns: [],  // chat is user-driven: empty until they ask
  };
}

/**
 * Apply a wheel-driven zoom step that keeps the document point under the cursor stationary.
 *
 * On zoom-OUT the scroller's content shrinks, and the browser immediately
 * clamps `scrollTop` / `scrollLeft` to the new maxima when our React state
 * update propagates to layout. If we read `scroller.scrollLeft` inside the
 * rAF callback AFTER the clamp, the reading is stale relative to the
 * pre-zoom cursor anchor — we'd then add `scrollDelta` onto a clamped
 * origin, producing a visible scroll jump (pages sliding under the
 * cursor rather than zooming around it). Compute absolute targets from
 * the PRE-zoom origin and assign them verbatim in rAF.
 */
function applyAnchoredZoom(
  scroller: HTMLElement,
  clientX: number,
  clientY: number,
  deltaY: number,
  oldZoom: number,
  multiplyZoom: (f: number) => void,
): void {
  const factor = Math.exp(-deltaY * VISUAL_ZOOM_SENSITIVITY);
  const targetZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
  const realFactor = targetZoom / oldZoom;
  if (realFactor === 1) return;

  const rect = scroller.getBoundingClientRect();
  const preZoomScrollLeft = scroller.scrollLeft;
  const preZoomScrollTop = scroller.scrollTop;

  // Capture the cursor's position relative to a STABLE document anchor —
  // the leftmost rendered page element. We use the page-element's
  // pre-zoom screen rect rather than the scroller-content origin
  // because the scroller has `mx-auto` on its child, so the page's
  // left edge SHIFTS as zoom changes (gutter recomputation). If we
  // anchor against the scroller-content origin like the previous code
  // did, the cursor "drifts left" because the page's left edge has
  // moved out from under the cursor — that's the bug the user reported.
  //
  // We track the cursor's offset INSIDE the page (in pre-zoom units),
  // then after zoom scroll so that same offset (× factor) lands under
  // the cursor again. Page-relative coords are immune to mx-auto
  // shifts because the page itself is the reference frame.
  const pageEls = scroller.querySelectorAll<HTMLElement>('[data-page]');
  let prePageEl: HTMLElement | null = null;
  let prePageRect: DOMRect | null = null;
  for (const el of pageEls) {
    const r = el.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) {
      prePageEl = el;
      prePageRect = r;
      break;
    }
  }
  // Fallback to the leftmost visible page if cursor isn't directly over
  // any page (the gap between pages, the bottom of the doc).
  if (!prePageEl || !prePageRect) {
    if (pageEls.length > 0) {
      prePageEl = pageEls[0];
      prePageRect = pageEls[0].getBoundingClientRect();
    }
  }

  multiplyZoom(realFactor);

  requestAnimationFrame(() => {
    if (!prePageEl || !prePageRect) {
      // No page reference — best-effort fallback to the old math.
      const cursorInScrollerX = clientX - rect.left + preZoomScrollLeft;
      const cursorInScrollerY = clientY - rect.top + preZoomScrollTop;
      scroller.scrollLeft = preZoomScrollLeft + cursorInScrollerX * (realFactor - 1);
      scroller.scrollTop = preZoomScrollTop + cursorInScrollerY * (realFactor - 1);
      return;
    }
    // Where is the same page now, after zoom + React re-layout?
    const postPageRect = prePageEl.getBoundingClientRect();
    // Cursor's offset INSIDE the page, pre-zoom (CSS pixels).
    const offsetXInPagePre = clientX - prePageRect.left;
    const offsetYInPagePre = clientY - prePageRect.top;
    // After zoom, the same offset in page-content scales by factor.
    const offsetXInPagePost = offsetXInPagePre * realFactor;
    const offsetYInPagePost = offsetYInPagePre * realFactor;
    // Where the page's left/top sit in document (scroller-content)
    // coords AFTER React's layout finished:
    const postPageDocLeft = postPageRect.left + scroller.scrollLeft - rect.left;
    const postPageDocTop = postPageRect.top + scroller.scrollTop - rect.top;
    // The point originally under the cursor sits here in doc coords:
    const targetDocX = postPageDocLeft + offsetXInPagePost;
    const targetDocY = postPageDocTop + offsetYInPagePost;
    // To put it back under the cursor, scroll so that doc coord
    // appears at (clientX - rect.left, clientY - rect.top).
    scroller.scrollLeft = targetDocX - (clientX - rect.left);
    scroller.scrollTop = targetDocY - (clientY - rect.top);
  });
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

function findPrimaryVisiblePage(scroller: HTMLElement, pages: HTMLElement[]): number | null {
  const sRect = scroller.getBoundingClientRect();
  let best: { page: number; overlap: number } | null = null;
  for (const pageEl of pages) {
    const pRect = pageEl.getBoundingClientRect();
    const overlap = Math.max(
      0,
      Math.min(sRect.bottom, pRect.bottom) - Math.max(sRect.top, pRect.top),
    );
    if (overlap <= 0) continue;
    const num = Number(pageEl.dataset.page);
    if (!Number.isFinite(num)) continue;
    if (!best || overlap > best.overlap) best = { page: num, overlap };
  }
  return best?.page ?? null;
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function ZoomChrome({ zoom, onSet }: { zoom: number; onSet: (z: number) => void }) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex gap-1">
      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-black/10 bg-white/85 px-2 py-1 text-xs text-black/70 shadow-sm backdrop-blur">
        <button
          onClick={() => onSet(Math.max(MIN_ZOOM, zoom - 0.25))}
          className="rounded px-1.5 py-0.5 hover:bg-black/5"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => onSet(1)}
          className="min-w-[44px] rounded px-1.5 py-0.5 text-center font-mono hover:bg-black/5"
          aria-label="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onSet(Math.min(MAX_ZOOM, zoom + 0.25))}
          className="rounded px-1.5 py-0.5 hover:bg-black/5"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
