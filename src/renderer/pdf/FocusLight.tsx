import { useEffect, useRef, useState } from 'react';
import { useRegionsStore } from '../state/regions';
import type { Region } from './extractRegions';

/**
 * Focus Light — a moving 3-word reading pacer.
 *
 * The user clicks a word. A yellow band lights up that word and the
 * next two. After (60000 / wpm) ms it slides forward by one word.
 * Repeats until the band reaches the end of the column, or the user
 * clicks somewhere else, or turns the band off. Speed is set in
 * Preferences as words-per-minute.
 *
 * Why a moving band of 3 words instead of a static line:
 * - The user explicitly asked for it (todo #41 v2). Their reasoning:
 *   reducing the focus span shrinks how much text the eye is asked
 *   to take in at once, and the auto-advance dictates the pace
 *   instead of the user having to keep dragging their cursor.
 * - Backed by classic visual-pacer / chunked-reading research
 *   (Carver, Spreeder-style RSVP — but in-place over the actual
 *   prose instead of word-by-word in a separate window, which is
 *   the dominant criticism of pure RSVP for technical content).
 *
 * Word extraction comes from the pdf.js text layer (`.textLayer >
 * span`). pdf.js typically emits one span per word for typeset PDFs
 * (academic papers, conference proceedings). We treat each span
 * inside the clicked region's bbox as one "word", sorted top-to-
 * bottom and left-to-right for reading order. This is a heuristic —
 * scanned PDFs or unusual extractors produce per-character spans —
 * but for the journals our user reads, it's fine.
 *
 * Beta opt-in only. Renders nothing unless `enabled` is true (which
 * the App.tsx layer guards on the user's persistent preference AND
 * the in-session header toggle).
 */
export default function FocusLight({
  enabled,
  paperHash,
  zoom,
  wpm,
}: {
  enabled: boolean;
  paperHash: string;
  zoom: number;
  wpm: number;
}) {
  const byPage = useRegionsStore((s) => s.byPage);

  // Anchor: the active reading session. Holds the resolved word list
  // for the column the user clicked, plus the index into that list of
  // the leading word in the 3-word window.
  const [anchor, setAnchor] = useState<{
    page: number;
    region: Region;
    spans: HTMLElement[];
    wordIndex: number;
  } | null>(null);

  // Force a re-render every animation tick so getBoundingClientRect
  // sees the current scroll position. Cheap — only when active.
  const [, setTick] = useState(0);

  // Skip mouse-tracked re-anchoring during/just-after a wheel event
  // (pinch-zoom or scroll). Without this, scrolling looks like a
  // mouse "click" sometimes due to event ordering on macOS trackpads.
  const lastWheelRef = useRef(0);
  const WHEEL_LOCKOUT_MS = 250;

  // Find which region (paragraph) is under a screen point, and the
  // page element + page number that owns it. Reused by the click
  // handler and word-rect computation.
  const findRegionAt = (
    clientX: number,
    clientY: number,
  ): { page: number; region: Region; pageEl: HTMLElement } | null => {
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
    const cssY = (clientY - pageRect.top) / zoom;
    const pdfY = baseHeight - cssY;
    const cssX = (clientX - pageRect.left) / zoom;

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
    return { page: pageNum, region: best, pageEl };
  };

  // Pull the text-layer spans whose centre falls inside a region's
  // bbox, sorted in reading order (top-to-bottom, then left-to-right).
  // pdf.js produces one span per word for typeset papers, so this list
  // ≈ the words of that paragraph.
  const extractWordSpans = (
    pageEl: HTMLElement,
    region: Region,
  ): HTMLElement[] => {
    const textLayer = pageEl.querySelector<HTMLElement>('.textLayer');
    if (!textLayer) return [];
    const pageRect = pageEl.getBoundingClientRect();
    const baseHeight = pageRect.height / zoom;
    const result: Array<{ el: HTMLElement; cx: number; cy: number }> = [];
    for (const span of textLayer.querySelectorAll<HTMLElement>('span')) {
      const text = span.textContent ?? '';
      if (!text.trim()) continue;
      const sRect = span.getBoundingClientRect();
      if (sRect.width <= 0 || sRect.height <= 0) continue;
      // Span centre in CSS coords relative to the page.
      const cssCx = (sRect.left + sRect.width / 2 - pageRect.left) / zoom;
      const cssCy = (sRect.top + sRect.height / 2 - pageRect.top) / zoom;
      const pdfY = baseHeight - cssCy;
      const inX = cssCx >= region.bbox.x && cssCx <= region.bbox.x + region.bbox.width;
      const inY = pdfY >= region.bbox.y && pdfY <= region.bbox.y + region.bbox.height;
      if (inX && inY) {
        result.push({ el: span, cx: cssCx, cy: cssCy });
      }
    }
    // Reading order: sort by Y first (line). Spans within ~0.5 line
    // height of each other are considered the same line; tie-break
    // by X. The 6 px line-tolerance was eyeballed against the sample
    // paper (NIPS 2017 template at 100% zoom).
    const lineTol = 6 / zoom;
    result.sort((a, b) => {
      if (Math.abs(a.cy - b.cy) > lineTol) return a.cy - b.cy;
      return a.cx - b.cx;
    });
    return result.map((r) => r.el);
  };

  // Pick the span closest to a click within a span list — this is the
  // word the user clicked, used as the starting wordIndex.
  const pickClickedSpanIndex = (
    spans: HTMLElement[],
    clientX: number,
    clientY: number,
  ): number => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < spans.length; i++) {
      const r = spans[i].getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - clientX) ** 2 + (cy - clientY) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  // Click → anchor the band on the clicked word, OR clear if click was
  // outside any text region.
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (ev: MouseEvent) => {
      // Don't anchor when the user clicks on UI controls.
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          'button, input, textarea, [role="button"], [contenteditable="true"], a, .fathom-drill-mark, .fathom-lens-highlight',
        )
      ) {
        return;
      }
      const hit = findRegionAt(ev.clientX, ev.clientY);
      if (!hit) {
        setAnchor(null);
        return;
      }
      const spans = extractWordSpans(hit.pageEl, hit.region);
      if (spans.length === 0) {
        setAnchor(null);
        return;
      }
      const wordIndex = pickClickedSpanIndex(spans, ev.clientX, ev.clientY);
      setAnchor({ page: hit.page, region: hit.region, spans, wordIndex });
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [enabled, byPage, paperHash, zoom]);

  // Auto-advance: every (60000 / wpm) ms, slide the window forward by
  // one word until the end of the region.
  useEffect(() => {
    if (!enabled || !anchor) return;
    const intervalMs = Math.max(40, Math.round(60000 / Math.max(40, wpm)));
    const id = window.setInterval(() => {
      setAnchor((current) => {
        if (!current) return current;
        // Stop one word before the end so the trailing slot doesn't
        // empty mid-pace; the user can re-click to continue into a
        // new region.
        if (current.wordIndex >= current.spans.length - 3) return current;
        return { ...current, wordIndex: current.wordIndex + 1 };
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, anchor, wpm]);

  // While anchored, force re-renders so the highlight rects track
  // scroll. rAF-throttled to keep cost negligible.
  useEffect(() => {
    if (!enabled || !anchor) return;
    let raf = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      setTick((t) => (t + 1) % 1000);
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [enabled, anchor]);

  // Wheel events suppress mouse-tracked anchoring briefly so two-finger
  // pinches/scrolls aren't mistaken for clicks (event ordering on
  // macOS trackpads is sometimes ambiguous).
  useEffect(() => {
    if (!enabled) return;
    const onWheel = () => {
      lastWheelRef.current = Date.now();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [enabled]);

  if (!enabled || !anchor) return null;

  // Compute the per-line rectangles for the 3-word window. If the
  // window straddles a line break, we render multiple bands so the
  // highlight stays visually attached to text.
  const visibleSpans = anchor.spans.slice(anchor.wordIndex, anchor.wordIndex + 3);
  if (visibleSpans.length === 0) return null;

  const lineTolPx = 6;
  const bands: Array<{ left: number; top: number; width: number; height: number }> = [];
  let current: { left: number; right: number; top: number; bottom: number } | null = null;
  for (const span of visibleSpans) {
    const r = span.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (
      current &&
      Math.abs(r.top - current.top) < lineTolPx &&
      Math.abs(r.bottom - current.bottom) < lineTolPx
    ) {
      // Same line — extend horizontally.
      current.left = Math.min(current.left, r.left);
      current.right = Math.max(current.right, r.right);
    } else {
      if (current) {
        bands.push({
          left: current.left,
          top: current.top,
          width: current.right - current.left,
          height: current.bottom - current.top,
        });
      }
      current = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
  }
  if (current) {
    bands.push({
      left: current.left,
      top: current.top,
      width: current.right - current.left,
      height: current.bottom - current.top,
    });
  }
  if (bands.length === 0) return null;

  const padX = 3;
  const padY = 2;
  return (
    <>
      {bands.map((b, i) => (
        <div
          key={`${anchor.wordIndex}-${i}`}
          className="fathom-focus-light-band"
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: b.left - padX,
            top: b.top - padY,
            width: b.width + padX * 2,
            height: b.height + padY * 2,
            background: 'rgba(255, 232, 100, 0.65)',
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            borderRadius: 4,
            boxShadow: '0 0 10px rgba(255, 220, 60, 0.4)',
            zIndex: 35,
            // Smooth slide for in-line moves; cross-line jumps land
            // immediately because both top and left change at once and
            // the eye reads them as a discrete next-line jump.
            transition: 'left 110ms ease-out, top 110ms ease-out, width 110ms ease-out',
          }}
        />
      ))}
    </>
  );
}
