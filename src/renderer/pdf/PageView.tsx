import { useEffect, useMemo, useRef, useState } from 'react';
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

const RENDER_DPR_CAP = 2;

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
  // 2000px rootMargin = ~3 viewport heights of prefetch, so by the time
  // the user scrolls to a page its canvas is already painted. The cost
  // is a few extra pages' worth of pdf.js work at idle; the benefit is
  // that "Rendering…" placeholders almost never appear during scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '2000px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber]);

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
      textLayerContainer.style.width = `${cssViewport.width}px`;
      textLayerContainer.style.height = `${cssViewport.height}px`;
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
  const cache = useLensStore((s) => s.cache);
  // Don't render any markers while a lens is focused. Two problems they
  // caused otherwise: (a) at z-[100] they could bleed through the lens
  // overlay and appear on top of the anchor image, looking as though the
  // markers lived on the zoomed figure itself; (b) they were still
  // clickable through the lens, which let the user recursively re-open
  // the same lens in a loop. Markers are only meaningful in the reading
  // view; the lens has its own navigation.
  const lensFocused = useLensStore((s) => s.focused !== null);
  if (lensFocused) return null;
  // Select the Map reference itself — stable when regions haven't changed — and resolve
  // the array inside useMemo. Returning `... ?? []` directly from a selector would allocate
  // a new empty array each render and cause an infinite useSyncExternalStore update loop.
  const byPage = useRegionsStore((s) => s.byPage);
  const cachedRegions = useMemo(() => {
    const regions = byPage.get(`${paperHash}:${pageNumber}`) ?? [];
    const result = regions.filter((r) => cache.has(r.id));
    // Telemetry — helps diagnose "where did my markers go?" at a glance in DevTools.
    if (regions.length > 0) {
      console.log('[Lens] CachedLensMarkers', {
        page: pageNumber,
        regionCount: regions.length,
        cachedCount: result.length,
      });
    }
    return result;
  }, [byPage, paperHash, pageNumber, cache]);

  if (cachedRegions.length === 0) return null;

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
      }
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
      turns: [{ question: null, body: '', progress: '', streaming: true }],
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
            title="Re-open lens (cached)"
            aria-label="Re-open cached lens"
          />
        );
      })}
    </>
  );
}
