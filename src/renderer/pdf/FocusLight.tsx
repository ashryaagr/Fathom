import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRegionsStore } from '../state/regions';
import type { Region } from './extractRegions';

/** One word in the focus pacer's word list. We carry the span +
 * character range instead of just the span because pdf.js often
 * emits multi-word spans, and treating each span as a word made
 * the pacer light up the whole sentence at once (the bug that
 * the user kept catching). At render time we materialise a Range
 * over (charStart, charEnd) and read its bounding rect — that's
 * one word's worth of pixels, no more. */
type Word = {
  span: HTMLElement;
  charStart: number;
  charEnd: number;
  /** Cached centre for reading-order sort at extraction time.
   * Recomputed-on-demand if zoom changes after the anchor exists. */
  cx: number;
  cy: number;
};

/** Materialise a Range over the word's character span and return its
 * bounding rect. Used at every render so the highlight follows the
 * page through scroll + zoom + textLayer rebuilds without any
 * caching of stale screen coordinates. Returns null if the underlying
 * text node has been replaced (textLayer rebuilt due to zoom) — the
 * caller treats that as "skip this band for one render." */
function wordRect(w: Word): DOMRect | null {
  const node = w.span.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = (node as Text).data ?? '';
  if (w.charStart < 0 || w.charEnd > text.length) return null;
  const range = document.createRange();
  try {
    range.setStart(node, w.charStart);
    range.setEnd(node, w.charEnd);
    const r = range.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  } catch {
    return null;
  } finally {
    range.detach?.();
  }
}

/**
 * Focus Light — a moving 3-word reading pacer.
 *
 * The user clicks a word. A dark-yellow band lights up that word
 * with very-light-yellow neighbours immediately before and after (a
 * 3-word window centered on the pointer). After (60000 / wpm) ms it
 * slides forward by one word. Repeats until the band reaches the end
 * of the region, or the user clicks somewhere else, or turns the
 * band off. Speed is set in Preferences as words-per-minute.
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

  // Anchor: the active reading session. `words` is a list of WORD-
  // level entries (not span-level — pdf.js text-layer spans often
  // contain multiple words per span; treating spans as words made
  // the pacer "highlight everything" instead of 5 words). Each Word
  // is a (span, charStart, charEnd) triple; the rect is recomputed
  // from a Range at render time so it stays correct under scroll
  // and zoom.
  const [anchor, setAnchor] = useState<{
    page: number;
    region: Region;
    words: Word[];
    middleIndex: number;
  } | null>(null);

  // Pause state — explicit, toggled by SPACEBAR. Used in addition
  // to (not instead of) the mousemove-activity gate below.
  const [paused, setPaused] = useState(false);

  // Wheel-event lockout. Two-finger pinch or scroll suspends the
  // pacer for 250 ms so it doesn't march forward under the user's
  // gesture.
  const lastWheelRef = useRef(0);
  const WHEEL_LOCKOUT_MS = 250;

  // Mousemove-activity gate — REMOVED in v1.0.21. The mousemove
  // proxy was silently skipping ticks whenever the user was reading
  // without moving the cursor, which made the pacer feel much slower
  // than the configured WPM. macOS won't surface finger-resting
  // events, so the proxy can't tell "finger off trackpad" from
  // "finger on trackpad, eyes tracking with text." The user's
  // current pacing complaint takes precedence over the older
  // finger-detection request: pacer now ticks at the configured
  // WPM continuously; SPACEBAR is the explicit pause control. The
  // ref is retained because other touch-points still set it; future
  // implementations of finger-detection (e.g. a trackpad-touch
  // private API or a hold-to-pace key) can re-enable the gate
  // without restructuring callers.
  const lastMouseMoveRef = useRef(Date.now());

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

  // Extract WORD-level entries from the text layer, scoped to a
  // region's bbox. For each text-layer span, split its textContent
  // by whitespace and create a (span, charStart, charEnd) triple
  // per word. This is the fix for "the pacer is highlighting all
  // the words" — pdf.js often packs multiple words into one span,
  // so per-span granularity wasn't actually per-word.
  const extractWords = (pageEl: HTMLElement, region: Region): Word[] => {
    const textLayer = pageEl.querySelector<HTMLElement>('.textLayer');
    if (!textLayer) return [];
    const pageRect = pageEl.getBoundingClientRect();
    const baseHeight = pageRect.height / zoom;
    const result: Word[] = [];
    for (const span of textLayer.querySelectorAll<HTMLElement>('span')) {
      const text = span.textContent ?? '';
      if (!text.trim()) continue;
      const sRect = span.getBoundingClientRect();
      if (sRect.width <= 0 || sRect.height <= 0) continue;
      // Quick bbox-cull: skip spans entirely outside the region.
      const sCxPage = (sRect.left + sRect.width / 2 - pageRect.left) / zoom;
      const sCyPage = (sRect.top + sRect.height / 2 - pageRect.top) / zoom;
      const sPdfY = baseHeight - sCyPage;
      const inRegionRoughly =
        sCxPage >= region.bbox.x - 4 &&
        sCxPage <= region.bbox.x + region.bbox.width + 4 &&
        sPdfY >= region.bbox.y - 4 &&
        sPdfY <= region.bbox.y + region.bbox.height + 4;
      if (!inRegionRoughly) continue;
      // Walk word boundaries inside the span's text. \S+ matches a
      // run of non-whitespace = one word.
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const re = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const charStart = match.index;
        const charEnd = match.index + match[0].length;
        // Get this word's screen rect via Range to confirm it's
        // inside the region's bbox (per-word check, not per-span).
        const range = document.createRange();
        try {
          range.setStart(node, charStart);
          range.setEnd(node, charEnd);
          const wRect = range.getBoundingClientRect();
          if (wRect.width <= 0 || wRect.height <= 0) continue;
          const cx = (wRect.left + wRect.width / 2 - pageRect.left) / zoom;
          const cy = (wRect.top + wRect.height / 2 - pageRect.top) / zoom;
          const pdfY = baseHeight - cy;
          const inX = cx >= region.bbox.x && cx <= region.bbox.x + region.bbox.width;
          const inY = pdfY >= region.bbox.y && pdfY <= region.bbox.y + region.bbox.height;
          if (inX && inY) {
            result.push({ span, charStart, charEnd, cx, cy });
          }
        } catch {
          /* range error → skip word */
        } finally {
          range.detach?.();
        }
      }
    }
    // Reading order: top-to-bottom, then left-to-right. Same line
    // tolerance as before (~0.5 line height at the source's zoom).
    const lineTol = 6 / zoom;
    result.sort((a, b) => {
      if (Math.abs(a.cy - b.cy) > lineTol) return a.cy - b.cy;
      return a.cx - b.cx;
    });
    return result;
  };

  // Pick the word in the list closest to the click — used as the
  // starting middleIndex. Uses each word's live rect so the choice
  // reflects what the user actually saw, not stale cached coords.
  const pickClickedWordIndex = (
    words: Word[],
    clientX: number,
    clientY: number,
  ): number => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < words.length; i++) {
      const r = wordRect(words[i]);
      if (!r) continue;
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
      const words = extractWords(hit.pageEl, hit.region);
      if (words.length === 0) {
        setAnchor(null);
        return;
      }
      const middleIndex = pickClickedWordIndex(words, ev.clientX, ev.clientY);
      setAnchor({ page: hit.page, region: hit.region, words, middleIndex });
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [enabled, byPage, paperHash, zoom]);

  // mousemove tracker retained as a no-op stub: the auto-advance
  // gate that consumed `lastMouseMoveRef` was removed in v1.0.21
  // (see the ref's declaration for rationale). Future re-additions
  // of finger-detection can wire it back in without restructuring.
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
      // Selecting text? Working WITH a selection — pacing forward
      // would yank focus from the selection.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
      setAnchor((current) => {
        if (!current) return current;
        if (current.middleIndex >= current.words.length - 1) return current;
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

  // 3-word window per user request 2026-04-25 (revised from the
  // earlier 5-word draft):
  //   m-1 : side    light  yellow  rgba(255,235,140, 0.30)
  //   m   : middle  dark   yellow  rgba(245,180,20,  0.85)
  //   m+1 : side    light  yellow  rgba(255,235,140, 0.30)
  // The strong contrast between dark-middle and very-light-sides
  // pulls the eye onto the focal word at a glance; the sides give
  // just enough peripheral context for the eye to anticipate the next
  // saccade target. Edge cases: at the start/end of a region missing
  // slots are simply skipped — the user gets a smaller window for the
  // first/last few words. Acceptable per "less is okay, but not more."
  const m = anchor.middleIndex;
  type Slot = { word: Word; role: 'side' | 'middle'; offset: -1 | 0 | 1 };
  const slots: Slot[] = [];
  for (const off of [-1, 0, 1] as const) {
    const idx = m + off;
    if (idx < 0 || idx >= anchor.words.length) continue;
    const word = anchor.words[idx];
    if (!word) continue;
    slots.push({ word, role: off === 0 ? 'middle' : 'side', offset: off });
  }
  if (slots.length === 0) return null;

  const padX = 2;
  const padY = 2;
  // SUB-SACCADE SLIDE between word advances. The earlier pure-snap
  // build (cog-audit-focus-pacer.md §5 Option A) was rejected by the
  // user as abrupt → cognitively fatiguing — which trumps the
  // saccade-rhythm theory the snap was protecting. Reconciliation:
  // make the slide complete WITHIN one saccade window (~225 ms per
  // Rayner 1998). A slide that finishes faster than a single
  // fixation cannot compete with the saccade rhythm because the eye
  // hasn't yet decided where to land next. So the slide reads as
  // continuous motion (no abrupt jump) without setting up the
  // smooth-pursuit competition the cog reviewer was worried about.
  //
  // Also scale-with-tempo: at low WPM the per-word interval is long
  // (1000 ms at 60 wpm), so a 220 ms slide plus 780 ms rest reads as
  // "the band glides into place, then waits." At high WPM (≤ 400 ms
  // intervals) we cap the slide at 35% of the interval so the next
  // tick doesn't fire mid-slide. Easing is `cubic-bezier(0.4, 0,
  // 0.2, 1)` (Material "decelerate") — quick start, gentle landing,
  // matches how the eye actually decelerates onto a fixation point.
  const intervalMs = Math.max(40, Math.round(60000 / Math.max(10, wpm)));
  const transitionMs = Math.min(220, Math.max(120, Math.round(intervalMs * 0.35)));
  const transitionEase = 'cubic-bezier(0.4, 0, 0.2, 1)';

  return createPortal(
    <>
      {slots.map((slot) => {
        const r = wordRect(slot.word);
        if (!r) return null;
        const left = r.left - pageRect.left - padX;
        const top = r.top - pageRect.top - padY;
        const width = r.width + padX * 2;
        const height = r.height + padY * 2;
        // Two channels for "scope" and "anchor" instead of stacking
        // both on color-saturation. v1 used dark-yellow middle vs
        // very-light-yellow sides — the high inter-word contrast
        // created an attention spike on every fixation (Itti & Koch
        // 2001 visual saliency: high-saturation patches against
        // neutral backgrounds trigger involuntary orienting that the
        // brain must actively suppress = cognitive load). Pattern
        // borrowed from iA Writer / Hemingway / MS Immersive Reader:
        // they all *dim outside* rather than *brighten inside*. We
        // split the difference here — keep a faint scope wash so the
        // user can see the 3-word window, but drop the inner
        // contrast entirely.
        //
        //   • Scope (all 3 words): identical very-faint amber wash,
        //     no multiply blend (multiply was compounding saturation
        //     against the white paper).
        //   • Anchor (middle only): thin 2px amber underline
        //     beneath the middle word. Underline is a low-load
        //     "you are here" signal readers already know from links.
        //
        // The two channels use different visual mechanisms (color
        // wash vs. line shape) so the brain doesn't have to disambig-
        // uate two different intensities of the same color cue.
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
              background: 'rgba(255, 215, 60, 0.16)',
              pointerEvents: 'none',
              borderRadius: 3,
              // Anchor underline ONLY on the middle word. Sits at
              // the bottom of the slot, 2px tall, semi-transparent
              // amber. Visible enough to mark the focal word, faint
              // enough not to add saliency.
              borderBottom: isMiddle
                ? '2px solid rgba(220, 160, 30, 0.55)'
                : 'none',
              boxShadow: 'none',
              zIndex: 6,
              transition: `left ${transitionMs}ms ${transitionEase}, top ${transitionMs}ms ${transitionEase}, width ${transitionMs}ms ${transitionEase}`,
            }}
          />
        );
      })}
    </>,
    pageEl,
  );
}
