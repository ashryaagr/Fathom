import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // for the column the user clicked, plus the index of the MIDDLE word
  // in the 3-word window (the bright "pointer"). The window spans
  // [middleIndex-1, middleIndex, middleIndex+1] — the middle is what
  // the user is reading right now, the sides are the just-read tail
  // and the about-to-read lead-in.
  const [anchor, setAnchor] = useState<{
    page: number;
    region: Region;
    spans: HTMLElement[];
    middleIndex: number;
  } | null>(null);

  // Force a re-render every animation tick so getBoundingClientRect
  // sees the current scroll position. Cheap — only when active.
  const [, setTick] = useState(0);

  // Pause state — explicit, toggled by SPACEBAR. Used in addition
  // to (not instead of) the mousemove-activity gate below.
  const [paused, setPaused] = useState(false);

  // Wheel-event lockout. Two-finger pinch or scroll suspends the
  // pacer for 250 ms so it doesn't march forward under the user's
  // gesture.
  const lastWheelRef = useRef(0);
  const WHEEL_LOCKOUT_MS = 250;

  // Mousemove-activity gate — best-effort approximation for "is the
  // user's finger active on the trackpad?" macOS does NOT expose
  // touch-without-movement events; when a finger rests perfectly
  // still on the trackpad, no event fires and the OS state is
  // indistinguishable from "no finger." This is an upstream limit.
  // Best we can do: while the cursor is moving (even tiny micro-
  // drifts), assume the user is engaged; after FINGER_IDLE_MS of
  // zero motion, assume the finger is off and pause.
  //
  // Threshold history:
  //   • 150 ms (v1)  — too aggressive, killed the pacer between
  //                    natural micro-pauses.
  //   • removed (v2) — pacer ran forever, user reported "moves
  //                    even when finger off trackpad."
  //   • 400 ms (v3)  — current. Lenient enough to bridge natural
  //                    pauses, tight enough to feel like the pacer
  //                    "follows the finger."
  // Spacebar remains the explicit pause for the genuinely-still
  // case (finger resting deliberately).
  const lastMouseMoveRef = useRef(Date.now());
  const FINGER_IDLE_MS = 400;

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
      const middleIndex = pickClickedSpanIndex(spans, ev.clientX, ev.clientY);
      setAnchor({ page: hit.page, region: hit.region, spans, middleIndex });
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [enabled, byPage, paperHash, zoom]);

  // Track every mousemove so the auto-advance can gate on "did the
  // user move the cursor recently?" — best-effort proxy for "one
  // finger on the trackpad, engaged."
  useEffect(() => {
    if (!enabled) return;
    const onMove = () => {
      lastMouseMoveRef.current = Date.now();
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled]);

  // Spacebar toggles pause/resume. Standard pacer convention. We
  // only intercept Space when the user isn't typing in an input —
  // the lens's Ask box, search fields, etc. need Space to mean
  // "space character", not "pause the pacer."
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  // Auto-advance interval. Ticks at WPM cadence. Skips ticks when:
  //   • a wheel event fired within WHEEL_LOCKOUT_MS (mid pinch /
  //     scroll — the pacer would jump under the user's gesture)
  //   • the user has live text selected (working WITH the
  //     selection — copying, dragging into the lens — pacing
  //     forward would yank focus from what they're holding)
  //   • paused (spacebar)
  // Notably we do NOT gate on "is the user's finger on the trackpad"
  // because macOS doesn't surface finger-resting-without-movement
  // events at all — the user reported (and verified) that after
  // 5-10 s of a still finger the OS stops emitting any signal even
  // though the finger is still touching. That's an upstream limit;
  // best the renderer can do is let the pacer run continuously and
  // give the user an explicit pause control (spacebar).
  useEffect(() => {
    if (!enabled || !anchor) return;
    if (paused) return;
    const intervalMs = Math.max(40, Math.round(60000 / Math.max(10, wpm)));
    const id = window.setInterval(() => {
      const now = Date.now();
      // Two-finger gesture in progress?
      if (now - lastWheelRef.current < WHEEL_LOCKOUT_MS) return;
      // Finger off the trackpad? (no recent cursor movement)
      if (now - lastMouseMoveRef.current > FINGER_IDLE_MS) return;
      // Selecting text? Working WITH a selection — pacing forward
      // would yank focus from the selection.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
      setAnchor((current) => {
        if (!current) return current;
        if (current.middleIndex >= current.spans.length - 1) return current;
        return { ...current, middleIndex: current.middleIndex + 1 };
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, anchor, wpm, paused]);

  // No rAF re-render loop. v1 of FocusLight ran a requestAnimationFrame
  // loop because the bands were `position: fixed` and their screen
  // coordinates had to be recomputed every frame to stay glued to the
  // text underneath as the user scrolled. The user reported
  // "perceptible lag — band stays where it was when I scroll." That
  // was the rAF loop catching up frame-by-frame to the scroll.
  //
  // Fix is structural, not throttling: we now `createPortal` the
  // bands INTO the page's `<div data-page="N">` element, with
  // `position: absolute` relative to that div. The page scrolls; the
  // bands inside the page scroll with it natively, no JS bookkeeping.
  // Re-renders only happen when the pacer state actually changes
  // (anchor / middleIndex / paused / wpm) — which is the only time
  // band geometry needs recalculation anyway.
  void setTick; // reference kept so the existing import survives;
                // can drop the state declaration below if no other
                // code path needs it.

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

  // Look up the page element to portal into. If the page has been
  // unmounted (rare — virtualization keeps slots in the DOM, but
  // belt-and-suspenders), bail out cleanly.
  const pageEl = document.querySelector<HTMLElement>(`[data-page="${anchor.page}"]`);
  if (!pageEl) return null;
  const pageRect = pageEl.getBoundingClientRect();

  // FIVE-word window with Gaussian opacity falloff (per user spec —
  // "five words at a time", "the middle word should be brighter",
  // "Gaussian pyramid style"). Slots, in reading order:
  //   m-2 : outer left   (faint   — opacity 0.20)
  //   m-1 : inner left   (medium  — opacity 0.45)
  //   m   : middle       (bright  — opacity 0.85, plus glow)
  //   m+1 : inner right  (medium  — opacity 0.45)
  //   m+2 : outer right  (faint   — opacity 0.20)
  // Edge cases: at start/end of region, missing slots are simply
  // skipped — the user gets a smaller window for the first/last
  // few words. Acceptable per "less is okay, but not more."
  const m = anchor.middleIndex;
  type Slot = { span: HTMLElement; role: 'outer' | 'inner' | 'middle'; offset: -2 | -1 | 0 | 1 | 2 };
  const slots: Slot[] = [];
  for (const off of [-2, -1, 0, 1, 2] as const) {
    const idx = m + off;
    if (idx < 0 || idx >= anchor.spans.length) continue;
    const span = anchor.spans[idx];
    if (!span) continue;
    if (off === 0) slots.push({ span, role: 'middle', offset: off });
    else if (off === -1 || off === 1) slots.push({ span, role: 'inner', offset: off });
    else slots.push({ span, role: 'outer', offset: off });
  }
  if (slots.length === 0) return null;

  const padX = 2;
  const padY = 2;
  // Transition duration matches one tick of the WPM cadence (capped
  // for the very-slow end so a 10-wpm tick doesn't take 6 s to
  // animate). This is what makes the band feel "continuously
  // moving" instead of jumping every word.
  const tickMs = Math.max(40, Math.round(60000 / Math.max(10, wpm)));
  const transitionMs = Math.max(80, Math.min(tickMs - 30, 600));

  return createPortal(
    <>
      {slots.map((slot) => {
        const r = slot.span.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        const left = r.left - pageRect.left - padX;
        const top = r.top - pageRect.top - padY;
        const width = r.width + padX * 2;
        const height = r.height + padY * 2;
        const opacity =
          slot.role === 'middle' ? 0.85 : slot.role === 'inner' ? 0.45 : 0.20;
        const isMiddle = slot.role === 'middle';
        return (
          <div
            // Stable key per offset (NOT per middleIndex) so React
            // reuses the same DOM node across ticks → CSS transition
            // animates the slide from word N to word N+1 smoothly.
            key={`offset-${slot.offset}`}
            className={`fathom-focus-light-${slot.role}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              background: `rgba(255, 215, 60, ${opacity})`,
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
              borderRadius: 4,
              boxShadow: isMiddle ? '0 0 8px 1px rgba(220, 160, 30, 0.35)' : 'none',
              zIndex: 6,
              transition: `left ${transitionMs}ms linear, top ${transitionMs}ms linear, width ${transitionMs}ms linear`,
            }}
          />
        );
      })}
    </>,
    pageEl,
  );
}
