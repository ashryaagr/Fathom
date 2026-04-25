import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Region } from '../pdf/extractRegions';
import { useLensStore, type FocusedLens } from './store';
import { useRegionsStore } from '../state/regions';
import { streamExplanationForLens, paperTextFromRegions } from './explain';

/** Approximate composer width — tuned to "≈ 5 words at typical typography"
 * per the resolved spec (Q2). Single-line input, no auto-grow. */
const COMPOSER_WIDTH = 220;

export interface InlineAskBubbleProps {
  /** Cursor x at the moment of two-finger tap (viewport coords). */
  x: number;
  /** Cursor y at the moment of two-finger tap (viewport coords). */
  y: number;
  /** The paragraph the user tapped on. */
  region: Region;
  page: number;
  paperHash: string;
  /** Page DOM element — used to resolve a sourceRect for the implied
   * lens (in case the user later opens it from the marker). */
  pageElement: HTMLElement;
  /** Page base size (PDF user-space dimensions at zoom=1). Needed to
   * convert region.bbox coords back to viewport pixels. */
  baseSize: { width: number; height: number };
  zoom: number;
  onClose: () => void;
}

/**
 * Tiny in-page Ask bubble. Appears at the two-finger-tap location;
 * the user types a short question (≈ 5 words wide) and presses
 * Enter. Submission:
 *   1. Closes the bubble.
 *   2. Drops a red marker on the page at the region's location
 *      (lens_anchors row with display_mode='inline').
 *   3. Kicks off the explain stream in the background — the
 *      full-screen lens does NOT take over.
 *   4. When the stream completes, the marker flips red → amber via
 *      the store's endStream → setMarkerStreaming chain.
 *
 * The user can click the marker (red or amber) to open the lens
 * with the Q&A. ⌘+pinch on the same paragraph also opens that lens
 * because the lens id derives from the regionId.
 */
export default function InlineAskBubble({
  x,
  y,
  region,
  page,
  paperHash,
  pageElement,
  baseSize,
  zoom,
  onClose,
}: InlineAskBubbleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Auto-focus the input on mount so the user can start typing
  // immediately. requestAnimationFrame defers past React's mount paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc closes without submitting; click outside the bubble does the
  // same. Both are silent — no marker, no anchor row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!submittedRef.current) onClose();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-fathom-inline-ask]')) {
        if (!submittedRef.current) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  // Clamp to viewport so the composer never opens off-screen. Mirrors
  // the rule the deleted PdfContextMenu used. Width is fixed; height
  // is small (one input + tiny header), so a 56 px floor is safe.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.offsetHeight || 56;
    const left = Math.max(8, Math.min(x, window.innerWidth - COMPOSER_WIDTH - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [x, y]);

  const submit = async () => {
    const question = value.trim();
    if (!question || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);

    const lensId = region.id;

    // Build neighbour context the same way commitSemanticFocus does
    // so a later promotion to the full lens has the same content
    // it would have had if opened directly via ⌘+pinch.
    const allRegions = useRegionsStore.getState().getPage(paperHash, page);
    const idx = allRegions.findIndex((r) => r.id === region.id);
    const prevTexts: string[] = [];
    const nextTexts: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const p = allRegions[idx - i];
      if (p) prevTexts.push(p.text);
      const n = allRegions[idx + i];
      if (n) nextTexts.push(n.text);
    }

    // sourceRect — used only if the user later opens the marker;
    // computing it now means the open path doesn't need to re-hit-
    // test a (possibly scrolled-away) cursor position.
    const pageRect = pageElement.getBoundingClientRect();
    const sourceRect = {
      x: pageRect.left + region.bbox.x * zoom,
      y: pageRect.top + (baseSize.height - region.bbox.y - region.bbox.height) * zoom,
      width: region.bbox.width * zoom,
      height: region.bbox.height * zoom,
    };

    const lens: FocusedLens = {
      id: lensId,
      origin: 'region',
      paperHash,
      page,
      bbox: region.bbox,
      sourceRect,
      anchorText: region.text,
      focusPhrase: null,
      prevTexts,
      nextTexts,
      parentBody: null,
      regionId: region.id,
      // Seed the cache with the user's question as the FIRST turn so
      // the explain pipeline streams the answer onto it. Mirrors the
      // beginTurn(question) path the focused-lens flow uses.
      turns: [
        { question, body: '', progress: '', streaming: true },
      ],
    };

    // Register the marker red. Keep streaming=true so PageView
    // renders the inline-streaming colour. endStream will flip it.
    useLensStore.getState().registerMarker(paperHash, page, {
      lensId,
      bbox: region.bbox,
      origin: 'region',
      displayMode: 'inline',
      streaming: true,
    });

    // Persist the cache so the rest of the app sees this turn (e.g.
    // PageView's `cachedRegions` filter on `cache.has(r.id)`).
    useLensStore.getState().setCachedTurns(lensId, lens.turns);

    // Persist the anchor row with displayMode='inline'. Fire-and-
    // forget; failures don't block the stream.
    void window.lens
      ?.saveLensAnchor?.({
        lensId,
        paperHash,
        origin: 'region',
        page,
        bbox: region.bbox,
        regionId: region.id,
        zoomImagePath: null,
        anchorText: region.text,
        displayMode: 'inline',
      })
      .catch((err) => console.warn('[InlineAsk] saveLensAnchor failed', err));

    // Close the bubble immediately so the user keeps reading. Stream
    // runs to completion in the background.
    onClose();

    // Kick off the stream against the freshly-created lens. Does NOT
    // call useLensStore.open() — the full-screen lens stays closed
    // per the spec ("the answer streams INSIDE A LENS in the
    // background while the user keeps reading").
    try {
      await streamExplanationForLens(lens, paperTextFromRegions(paperHash));
    } catch (err) {
      console.warn('[InlineAsk] stream failed', err);
    }
  };

  return (
    <div
      ref={containerRef}
      data-fathom-inline-ask
      className="fixed z-[150] flex flex-col gap-1 rounded-lg border border-black/10 bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        width: COMPOSER_WIDTH,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-1 text-[10.5px] font-semibold tracking-wide text-black/55 uppercase">
        Dive into
      </div>
      {/* <input type="text"> is single-line by HTML semantics — never
          wraps, never auto-grows. When the typed text exceeds the
          input width the field scrolls horizontally and the visible
          window stays anchored on the caret. That is the
          deliberately-felt constraint the cog reviewer asked for
          (Cowan 2001 / Kintsch 1998 — short propositions parse
          better; the box being visibly full teaches the user to
          tighten the question). Do NOT replace this with a textarea
          or auto-grow component. */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={submitting}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Ask…"
        aria-label="Type a question, then press Enter to dive in"
        // `min-w-0` ensures the flex parent never stretches the
        // input past its declared width (otherwise browsers default
        // an input's intrinsic min-content size to ~150 px which can
        // override `w-full` inside a tight flex container). Combined
        // with COMPOSER_WIDTH on the parent, the field stays
        // visually fixed at ~5 words.
        className="w-full min-w-0 rounded-md border border-black/10 bg-[color:var(--color-paper)]/60 px-2 py-1 text-[13px] text-[#1a1614] outline-none focus:border-[color:var(--color-lens)]/70 focus:ring-1 focus:ring-[color:var(--color-lens)]/30"
      />
    </div>
  );
}
