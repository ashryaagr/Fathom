import { useEffect, useRef, useState } from 'react';
import { useRegionsStore } from '../state/regions';
import type { Region } from './extractRegions';

/**
 * Focus Light — a yellow horizontal highlighter band that the user can
 * anchor onto a paragraph. As the cursor moves vertically inside that
 * paragraph's column, the band follows. The intent is a digital reading
 * ruler — well-supported by reading-comprehension research as a low-cost
 * focus aid for dense text. (See `todo.md #41` for the brainstorm of
 * other research-backed reading aids we considered.)
 *
 * Design rules baked in below:
 *
 *   1. **Manual placement.** The band only appears AFTER the user clicks
 *      a region. No "auto-light wherever the cursor is" — that would
 *      flicker unhelpfully across figures, captions, and metadata. The
 *      user decides where their reading attention starts.
 *
 *   2. **Column-aware.** Click a paragraph: the band's width snaps to
 *      that paragraph's bbox.width — the column the user is reading.
 *      Two-column papers don't get a full-width band that bleeds across
 *      both columns; one-column papers get a single wide band.
 *
 *   3. **Figure-aware.** When the cursor's Y is over a region whose
 *      anchor paragraph is not where the band is, we just don't update
 *      Y — the band stays put. So passing the cursor over a figure or
 *      a caption mid-read doesn't fling the band somewhere weird.
 *
 *   4. **Multi-finger gestures don't move the band.** A `wheel` event
 *      with `ctrlKey=true` (pinch) or any wheel event in the last 200 ms
 *      (scroll) suspends mouse-tracking — the user is interacting with
 *      the trackpad with two fingers, not pointing.
 *
 *   5. **Off by default, beta opt-in.** The component renders nothing
 *      unless `enabled` is true — driven by the user's preferences AND
 *      the in-session header toggle. The whole feature lives behind the
 *      `focusLightBetaEnabled` settings flag.
 *
 *   6. **Pointer-events: none.** The band never intercepts clicks; the
 *      user can keep selecting text and clicking links/markers underneath.
 *
 *   7. **`mix-blend-mode: multiply`.** The band darkens the text below it
 *      rather than washing it out, so the highlighter feels like a real
 *      yellow marker rather than an opaque overlay.
 */
export default function FocusLight({
  enabled,
  paperHash,
  zoom,
}: {
  enabled: boolean;
  paperHash: string;
  zoom: number;
}) {
  const byPage = useRegionsStore((s) => s.byPage);

  // The anchored region — set on click, cleared if the user clicks
  // outside any text region. Until anchored, no band shows; this is the
  // "manual placement" rule the user requested.
  const [anchor, setAnchor] = useState<{
    page: number;
    region: Region;
  } | null>(null);

  // Vertical position of the band in CSS pixels, screen-relative.
  // null = no band visible (no anchor yet, or cursor went outside the
  // anchored region).
  const [bandY, setBandY] = useState<number | null>(null);

  // Suppress mouse-tracking during/just-after wheel events so two-finger
  // pinch/scroll don't fling the band. 200 ms is the lower bound that
  // reliably clears macOS's wheel-event tail.
  const lastWheelRef = useRef(0);
  const WHEEL_LOCKOUT_MS = 200;

  const findRegionUnderClient = (clientX: number, clientY: number): {
    page: number;
    region: Region;
    pageRect: DOMRect;
  } | null => {
    const stack = document.elementsFromPoint(clientX, clientY);
    const pageEl = stack.find(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el.hasAttribute('data-page'),
    );
    if (!pageEl) return null;
    const pageNum = Number(pageEl.getAttribute('data-page'));
    if (!Number.isFinite(pageNum)) return null;
    const regions = byPage.get(`${paperHash}:${pageNum}`) ?? [];
    if (regions.length === 0) return null;

    const pageRect = pageEl.getBoundingClientRect();
    const baseHeight = pageRect.height / zoom;
    // Convert client Y to PDF user-space Y (bottom-up).
    const cssY = (clientY - pageRect.top) / zoom;
    const pdfY = baseHeight - cssY;
    const cssX = (clientX - pageRect.left) / zoom;

    // Find the smallest region whose bbox contains the cursor.
    let best: Region | null = null;
    for (const r of regions) {
      const inX = cssX >= r.bbox.x && cssX <= r.bbox.x + r.bbox.width;
      const inY = pdfY >= r.bbox.y && pdfY <= r.bbox.y + r.bbox.height;
      if (inX && inY) {
        if (
          !best ||
          r.bbox.width * r.bbox.height < best.bbox.width * best.bbox.height
        ) {
          best = r;
        }
      }
    }
    if (!best) return null;
    return { page: pageNum, region: best, pageRect };
  };

  // Click → anchor the band. Click outside any text → clear.
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (ev: MouseEvent) => {
      // Ignore clicks that hit interactive UI (buttons, inputs) — the
      // user wasn't trying to anchor.
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          'button, input, textarea, [role="button"], [contenteditable="true"], a, .fathom-drill-mark, .fathom-lens-highlight',
        )
      ) {
        return;
      }
      const hit = findRegionUnderClient(ev.clientX, ev.clientY);
      if (!hit) {
        setAnchor(null);
        setBandY(null);
        return;
      }
      setAnchor({ page: hit.page, region: hit.region });
      setBandY(ev.clientY);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [enabled, byPage, paperHash, zoom]);

  // Mousemove → if cursor is inside the anchored region, follow it
  // vertically. If outside, leave the band where it is.
  useEffect(() => {
    if (!enabled || !anchor) return;
    const onMouseMove = (ev: MouseEvent) => {
      if (Date.now() - lastWheelRef.current < WHEEL_LOCKOUT_MS) return;
      const hit = findRegionUnderClient(ev.clientX, ev.clientY);
      // Only follow when the cursor is over the SAME anchored region.
      // Different region? Hands off — user is glancing elsewhere, not
      // moving the band.
      if (!hit) return;
      if (hit.page !== anchor.page) return;
      if (hit.region.id !== anchor.region.id) return;
      setBandY(ev.clientY);
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [enabled, anchor, byPage, paperHash, zoom]);

  // Wheel events bookmark the timestamp so the mousemove handler can
  // ignore drift while the user is pinching or scrolling.
  useEffect(() => {
    if (!enabled) return;
    const onWheel = () => {
      lastWheelRef.current = Date.now();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [enabled]);

  if (!enabled || !anchor || bandY === null) return null;

  // Compute band horizontal extent from the anchored region's bbox in
  // CSS pixels. This is what makes it column-aware: a paragraph in the
  // left column gets a band over only the left column.
  const pageEl = document.querySelector<HTMLElement>(`[data-page="${anchor.page}"]`);
  if (!pageEl) return null;
  const pageRect = pageEl.getBoundingClientRect();
  const baseHeight = pageRect.height / zoom;
  const left = pageRect.left + anchor.region.bbox.x * zoom;
  const width = anchor.region.bbox.width * zoom;
  // Band height = ~one line of body text. 24 px is a forgiving default
  // for ~14 pt text at 100% zoom; scales with zoom so a zoomed-in page
  // gets a proportionally taller band.
  const bandHeight = 26 * Math.max(0.6, Math.min(zoom, 2));
  // Vertically centre the band on cursor Y, but clamp into the
  // anchored region's bbox so the band can't escape the paragraph.
  const regionTopCss =
    pageRect.top + (baseHeight - anchor.region.bbox.y - anchor.region.bbox.height) * zoom;
  const regionBottomCss = regionTopCss + anchor.region.bbox.height * zoom;
  const top = Math.max(
    regionTopCss,
    Math.min(regionBottomCss - bandHeight, bandY - bandHeight / 2),
  );

  return (
    <div
      className="fathom-focus-light"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height: bandHeight,
        background: 'rgba(255, 232, 100, 0.55)',
        // multiply darkens text below instead of washing it out — feels
        // like a real yellow highlighter, not a sticker.
        mixBlendMode: 'multiply',
        pointerEvents: 'none',
        borderRadius: 4,
        boxShadow: '0 0 12px rgba(255, 220, 60, 0.35)',
        zIndex: 35,
        transition: 'top 90ms ease-out, left 120ms ease-out, width 120ms ease-out',
      }}
    />
  );
}
