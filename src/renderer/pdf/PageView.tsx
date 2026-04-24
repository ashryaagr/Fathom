import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pdfjsLib, type PDFDocumentProxy } from './pdfjs';
import { extractRegions, type Region } from './extractRegions';
import { useRegionsStore } from '../state/regions';
import { useLensStore, type FocusedLens } from '../lens/store';
import HighlightLayer from './HighlightLayer';

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  paperHash: string;
  zoom: number;
  /** Base page dimensions at zoom=1, in CSS pixels. Used so unmounted pages keep their slot. */
  baseSize: { width: number; height: number };
}

// Higher DPR cap → sharper figure pixels on retina + XDR displays.
// 3× covers Pro Display XDR (DPR=3); on standard retina (DPR=2)
// the cap is a no-op since we use Math.min(devicePixelRatio, cap).
const RENDER_DPR_CAP = 3;

export default function PageView({ doc, pageNumber, paperHash, zoom, baseSize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [renderedAt, setRenderedAt] = useState<number | null>(null);
  /** The zoom the currently-painted canvas was rendered at. If the page
   * scrolls out of view and back in at the same zoom, we skip the whole
   * render pipeline and reuse the existing canvas pixels. Without this,
   * every scroll oscillation tore the canvas back down to "Rendering…"
   * and the UX felt much slower than native Preview. */
  const renderedZoomRef = useRef<number | null>(null);
  const setRegions = useRegionsStore((s) => s.setPage);

  // Visibility tracking — render well before the page scrolls into view.
  // 4000 px rootMargin = ~5–6 viewport heights of prefetch (was 2000 in
  // v1.0.7+; bumped in v1.0.15 because the user kept hitting "Rendering…"
  // placeholders during fast scrolls on a 16" laptop). Cost is a few
  // extra pages' worth of pdf.js work at idle, which is fine because
  // the worker is otherwise idle. Real fix to "many pages render
  // serially on one worker" is todo.md #26 (worker pool / canvas reuse)
  // — this bump is the cheap part.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '4000px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber]);

  // Zoom-lag fix (v2, supersedes the CSS-width-write in v1.0.12):
  //
  // The slot div `baseSize * zoom` reflows synchronously on every zoom
  // change (React re-render), so neighboring pages resize instantly —
  // that part is fine. The problem is the CANVAS inside the slot: its
  // intrinsic pixel buffer (`canvas.width`/`canvas.height`) stays at
  // `renderedZoom * DPR` until the async pdf.js render finishes, which
  // can be 100-600 ms per page at higher zooms and much longer when
  // multiple pages re-render in parallel during a pinch.
  //
  // v1.0.12 tried to hide the gap by setting `canvas.style.width` to the
  // new slot width the instant `zoom` changed. That forced the browser
  // to bilinear-resample a large pixel buffer into a small CSS box every
  // frame — visually soft, and on zoom-OUT specifically, the slot and
  // canvas appeared to lag behind each other for a frame because the
  // resample isn't subpixel-stable. That's the "sweep-over" the user
  // sees: the top-layer canvas drifts over the underlying slot geometry
  // as the browser recomputes its resampled downscale across paint
  // frames. It also meant several pages' worth of heavy bitmap scaling
  // ran on the main thread simultaneously during a wheel-driven pinch.
  //
  // The fix: don't touch canvas CSS w/h during the gap. Apply a compositor
  // transform instead — `transform: scale(zoom / renderedZoom)` with
  // `transform-origin: top left`. The canvas's CSS box stays 1:1 with its
  // backing store (no resample), and the compositor cheaply scales the
  // already-painted pixels to fit the new slot — GPU path, no paint
  // invalidation, stable across frames. On first mount (no renderedZoom
  // yet) we sync canvas CSS to the current zoom so there's nothing to
  // scale. When the pdf.js render below completes, it sets the new
  // intrinsic buffer + CSS dimensions + renderedZoomRef all at once;
  // the effect re-runs on the next zoom tick and snaps transform to
  // identity. Text layer gets the same treatment: its span positions
  // are baked in px at render time, so we transform the container to
  // keep it visually locked to the canvas during the gap.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;
    if (!canvas || !textLayerContainer) return;
    const rendered = renderedZoomRef.current;
    if (rendered === null) {
      // Not rendered yet — align CSS box with the slot so the eventual
      // first render has no transform jump. Pixel buffer will be set
      // inside the render effect below.
      const cssWidth = baseSize.width * zoom;
      const cssHeight = baseSize.height * zoom;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      textLayerContainer.style.width = `${cssWidth}px`;
      textLayerContainer.style.height = `${cssHeight}px`;
      textLayerContainer.style.transform = '';
      textLayerContainer.style.transformOrigin = '';
      textLayerContainer.style.setProperty('--total-scale-factor', String(zoom));
      return;
    }
    if (rendered === zoom) {
      // Post-render (or idle at same zoom): identity.
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      textLayerContainer.style.transform = '';
      textLayerContainer.style.transformOrigin = '';
      return;
    }
    // Zoom has changed but the new pdf.js render hasn't landed yet.
    // Scale from rendered → current via compositor transform. No bitmap
    // resampling, no paint invalidation — the sweep-over artifact goes
    // away because the browser is composing an already-painted layer,
    // not redrawing one whose source and destination sizes disagree.
    const scale = zoom / rendered;
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `scale(${scale})`;
    textLayerContainer.style.transformOrigin = 'top left';
    textLayerContainer.style.transform = `scale(${scale})`;
  }, [zoom, baseSize.width, baseSize.height]);

  // Canvas + text layer + region extraction. One effect so they stay in sync as zoom changes.
  useEffect(() => {
    if (!visible) return;
    // If we already painted this page at this zoom, don't tear it down.
    // Scrolling in/out of viewport shouldn't kick a re-render; zoom
    // changes still do (renderedZoomRef !== zoom).
    if (renderedZoomRef.current === zoom) return;
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;
    if (!canvas || !textLayerContainer) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null;

    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, RENDER_DPR_CAP);
      const renderScale = zoom * dpr;
      const cssScale = zoom;

      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const renderViewport = page.getViewport({ scale: renderScale });
      const cssViewport = page.getViewport({ scale: cssScale });

      // ceil avoids the edge-of-page case where a half-pixel of the viewport falls
      // outside the canvas grid and clips raster image XObjects on the right/bottom.
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      // Clear the compositor transform from the zoom-lag useLayoutEffect:
      // the pixel buffer now matches the current zoom, so we want a 1:1
      // display with no transform. If we don't clear it here, a prior
      // scale(zoom/renderedZoom) would linger and double-scale the
      // freshly-rendered pixels.
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      textLayerContainer.style.width = `${cssViewport.width}px`;
      textLayerContainer.style.height = `${cssViewport.height}px`;
      textLayerContainer.style.transform = '';
      textLayerContainer.style.transformOrigin = '';
      // CSS variable consumed by pdfjs-dist text-layer styles.
      textLayerContainer.style.setProperty('--total-scale-factor', String(cssScale));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      renderTask = page.render({
        canvas,
        viewport: renderViewport,
        intent: 'display',
      });
      const textContentPromise = page.getTextContent();

      try {
        await renderTask.promise;
      } catch (err) {
        if (!cancelled) console.error(`page ${pageNumber} render failed`, err);
        return;
      }
      if (cancelled) return;
      setRenderedAt(Date.now());
      renderedZoomRef.current = zoom;

      const textContent = await textContentPromise;
      if (cancelled) return;

      // Fresh container for the text layer each time to avoid stale spans on re-render.
      textLayerContainer.innerHTML = '';
      textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerContainer,
        viewport: cssViewport,
      });
      try {
        await textLayer.render();
      } catch (err) {
        if (!cancelled) console.warn(`text layer render failed for page ${pageNumber}`, err);
      }
      if (cancelled) return;

      // Region extraction reuses the same TextContent — no second fetch.
      // Skip if cached regions for this page were already restored from disk.
      const alreadyHave = useRegionsStore.getState().getPage(paperHash, pageNumber).length > 0;
      if (!alreadyHave) {
        try {
          const regions = await extractRegions(page, pageNumber, paperHash, textContent);
          if (!cancelled) {
            setRegions(paperHash, pageNumber, regions);
            window.lens
              .saveRegions(
                regions.map((r) => ({
                  id: r.id,
                  paperHash: r.paperHash,
                  page: r.page,
                  parentId: r.parentId,
                  bbox: r.bbox,
                  text: r.text,
                  ordinal: r.ordinal,
                })),
              )
              .catch((err) => console.warn('saveRegions failed', err));
          }
        } catch (err) {
          console.error(`region extraction failed for page ${pageNumber}`, err);
        }
      }
    })().catch((err) => {
      if (!cancelled) console.error(`page ${pageNumber} pipeline failed`, err);
    });

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        /* ignore */
      }
      try {
        textLayer?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [doc, pageNumber, paperHash, zoom, visible, setRegions]);

  const slotWidth = baseSize.width * zoom;
  const slotHeight = baseSize.height * zoom;

  return (
    <div
      ref={containerRef}
      className="relative mx-auto my-4 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ width: slotWidth, height: slotHeight }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0 block" />
      <HighlightLayer
        paperHash={paperHash}
        pageNumber={pageNumber}
        pageHeight={baseSize.height}
        zoom={zoom}
      />
      <div ref={textLayerRef} className="textLayer absolute top-0 left-0" />
      <CachedLensMarkers
        paperHash={paperHash}
        pageNumber={pageNumber}
        pageHeight={baseSize.height}
        zoom={zoom}
        getPageRect={() => containerRef.current?.getBoundingClientRect() ?? null}
      />
      {renderedAt === null && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-black/30 select-none">
          {visible ? 'Rendering…' : ''}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a small clickable marker in the left margin next to every region whose
 * explanation has been cached. Clicking re-opens that focus instantly with the
 * cached body shown.
 */
function CachedLensMarkers({
  paperHash,
  pageNumber,
  pageHeight,
  zoom,
  getPageRect,
}: {
  paperHash: string;
  pageNumber: number;
  pageHeight: number;
  zoom: number;
  getPageRect: () => DOMRect | null;
}) {
  // HOOKS FIRST, EARLY RETURNS AFTER. All useX calls must execute in the
  // same order every render — React enforces this with error #300
  // ("Maximum update depth exceeded") when an early return changes how
  // many hooks a component runs. Previous layout had `if (lensFocused)
  // return null` placed BEFORE the useRegionsStore + useMemo hooks,
  // which tripped the boundary on every dive; the QA agent surfaced it
  // in v1.0.3.
  const cache = useLensStore((s) => s.cache);
  const lensFocused = useLensStore((s) => s.focused !== null);
  const lensMarkersMap = useLensStore((s) => s.lensMarkers);
  // Map reference is stable when regions haven't changed; resolving
  // inside useMemo avoids allocating a new `[]` on every render (which
  // would itself cause a useSyncExternalStore re-render loop).
  const byPage = useRegionsStore((s) => s.byPage);
  const cachedRegions = useMemo(() => {
    const regions = byPage.get(`${paperHash}:${pageNumber}`) ?? [];
    const result = regions.filter((r) => cache.has(r.id));
    if (regions.length > 0) {
      console.log('[Lens] CachedLensMarkers', {
        page: pageNumber,
        regionCount: regions.length,
        cachedCount: result.length,
      });
    }
    return result;
  }, [byPage, paperHash, pageNumber, cache]);
  // Viewport-origin markers — users who pinched without a region
  // directly under the cursor. These aren't in `regions` at all; they
  // live only in the store's lensMarkers map. Filter out any that
  // also have a matching region marker to avoid doubling up.
  const viewportMarkers = useMemo(() => {
    const list = lensMarkersMap.get(`${paperHash}:${pageNumber}`) ?? [];
    const regionIds = new Set(cachedRegions.map((r) => r.id));
    return list.filter((m) => m.origin === 'viewport' && !regionIds.has(m.lensId));
  }, [lensMarkersMap, paperHash, pageNumber, cachedRegions]);

  // Hide markers while the lens is focused. Two problems they caused
  // otherwise: (a) at z-[100] they could bleed through the lens overlay
  // and appear on top of the anchor image; (b) they were still
  // clickable through the lens, letting the user recursively re-open
  // the same lens in a loop.
  if (lensFocused) return null;
  if (cachedRegions.length === 0 && viewportMarkers.length === 0) return null;

  const openCachedViewport = async (m: { lensId: string; bbox: { x: number; y: number; width: number; height: number }; origin: string }) => {
    const pageRect = getPageRect();
    if (!pageRect) return;
    const sourceRect = {
      x: pageRect.left + m.bbox.x * zoom,
      y: pageRect.top + (pageHeight - m.bbox.y - m.bbox.height) * zoom,
      width: Math.max(20, m.bbox.width * zoom),
      height: Math.max(20, m.bbox.height * zoom),
    };
    let anchorImage: FocusedLens['anchorImage'];
    // persistedZoomPaths is keyed by lens.id (== m.lensId here), so
    // the previously-saved image rehydrates regardless of whether the
    // lens was region-origin or viewport-origin. The bug fixed in
    // v1.0.16 was specifically that this lookup keyed by region.id
    // missed for viewport-origin lenses (no region) and silently
    // showed the magnifying-glass placeholder.
    const zoomPath = useLensStore.getState().persistedZoomPaths.get(m.lensId);
    if (zoomPath) {
      try {
        const dataUrl = await window.lens.readAssetAsDataUrl(zoomPath);
        anchorImage = { dataUrl, width: 0, height: 0 };
      } catch (err) {
        console.warn('failed to load cached viewport zoom image', err);
        void window.lens.logDev?.(
          'warn',
          'Lens',
          `viewport marker reopen: readAssetAsDataUrl failed for ${zoomPath}`,
        );
      }
    } else {
      void window.lens.logDev?.(
        'info',
        'Lens',
        `viewport marker reopen: no persistedZoomPath for ${m.lensId} — placeholder will show`,
      );
    }
    const lens: FocusedLens = {
      id: m.lensId,
      origin: 'viewport',
      paperHash,
      page: pageNumber,
      bbox: m.bbox,
      sourceRect,
      anchorText: '',
      focusPhrase: `visual on page ${pageNumber}`,
      prevTexts: [],
      nextTexts: [],
      parentBody: null,
      regionId: null,
      turns: [],
      anchorImage,
      zoomImagePath: zoomPath,
    };
    useLensStore.getState().open(lens);
  };

  const openCached = async (region: Region) => {
    const pageRect = getPageRect();
    if (!pageRect) return;
    const sourceRect = {
      x: pageRect.left + region.bbox.x * zoom,
      y: pageRect.top + (pageHeight - region.bbox.y - region.bbox.height) * zoom,
      width: region.bbox.width * zoom,
      height: region.bbox.height * zoom,
    };
    const allRegions = useRegionsStore.getState().getPage(paperHash, pageNumber);
    const idx = allRegions.findIndex((r) => r.id === region.id);
    const prevTexts: string[] = [];
    const nextTexts: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const p = allRegions[idx - i];
      if (p) prevTexts.push(p.text);
      const n = allRegions[idx + i];
      if (n) nextTexts.push(n.text);
    }
    // Restore the zoom image from disk if we have a cached path.
    let anchorImage: FocusedLens['anchorImage'];
    const zoomPath = useLensStore.getState().persistedZoomPaths.get(region.id);
    if (zoomPath) {
      try {
        const dataUrl = await window.lens.readAssetAsDataUrl(zoomPath);
        anchorImage = { dataUrl, width: 0, height: 0 };
      } catch (err) {
        console.warn('failed to load cached zoom image', err);
        void window.lens.logDev?.(
          'warn',
          'Lens',
          `region marker reopen: readAssetAsDataUrl failed for ${zoomPath}`,
        );
      }
    } else {
      void window.lens.logDev?.(
        'info',
        'Lens',
        `region marker reopen: no persistedZoomPath for ${region.id} — placeholder will show`,
      );
    }
    const lens: FocusedLens = {
      id: region.id,
      origin: 'region',
      paperHash,
      page: pageNumber,
      bbox: region.bbox,
      sourceRect,
      anchorText: region.text,
      focusPhrase: null,
      prevTexts,
      nextTexts,
      parentBody: null,
      regionId: region.id,
      turns: [], // user-driven chat; empty until they ask
      anchorImage,
      zoomImagePath: zoomPath,
    };
    useLensStore.getState().open(lens);
  };

  return (
    <>
      {cachedRegions.map((r) => {
        const topCss = (pageHeight - r.bbox.y - r.bbox.height) * zoom;
        const rightEdge = (r.bbox.x + r.bbox.width) * zoom;
        // Place the marker INSIDE the top-right corner of the region, not
        // outside it. For text regions the outside-the-column position was
        // fine, but for full-width figure regions the marker ended up
        // beyond the page edge and was clipped / hidden. Inside + a white
        // ring + a generous z-index keeps it visible on top of any figure
        // pixel color, always.
        return (
          <button
            key={r.id}
            onClick={() => openCached(r)}
            className="absolute z-[100] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[color:var(--color-lens)] shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.25)] transition-transform hover:scale-125 focus:outline-none"
            style={{ left: rightEdge - 14, top: topCss + 4 }}
            title="Re-open lens"
            aria-label="Re-open lens"
          />
        );
      })}
      {viewportMarkers.map((m) => {
        // Viewport origin: bbox may span a wide area or be approximate.
        // Pin the dot to the bbox's top-right corner so it sits near
        // the section the user was looking at without intruding on
        // body text.
        const topCss = Math.max(0, (pageHeight - m.bbox.y - m.bbox.height) * zoom);
        const rightEdge = (m.bbox.x + m.bbox.width) * zoom;
        return (
          <button
            key={m.lensId}
            onClick={() => void openCachedViewport(m)}
            className="absolute z-[100] h-3.5 w-3.5 cursor-pointer rounded-full bg-[color:var(--color-lens)] shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.25)] opacity-80 transition hover:scale-110 hover:opacity-100"
            style={{ left: rightEdge - 14, top: topCss + 4 }}
            title="Reopen this zoom"
            aria-label="Reopen previous zoom"
          />
        );
      })}
    </>
  );
}
