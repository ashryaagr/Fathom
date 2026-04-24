import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import DOMPurify from 'dompurify';
import { useLensStore, type FocusedLens, type Turn } from './store';
import { useTourStore } from './tourStore';
import {
  streamExplanationForFocused,
  paperTextFromRegions,
  askFollowUpAndStream,
} from './explain';

export default function FocusView() {
  const focused = useLensStore((s) => s.focused);
  const backStackLen = useLensStore((s) => s.backStack.length);
  const transition = useLensStore((s) => s.transition);
  const back = useLensStore((s) => s.back);
  const closeAll = useLensStore((s) => s.closeAll);
  const clearTransition = useLensStore((s) => s.clearTransition);

  // Whenever the last turn is unstarted or streaming with empty body, trigger a stream.
  useEffect(() => {
    if (!focused) return;
    const last = focused.turns[focused.turns.length - 1];
    if (!last) return;
    if (last.streaming && last.body.length === 0) {
      console.log('[Lens] FocusView triggering stream', {
        lensId: focused.id,
        turnCount: focused.turns.length,
      });
      void streamExplanationForFocused(paperTextFromRegions(focused.paperHash));
    }
  }, [focused?.id, focused?.turns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence onExitComplete={() => clearTransition()}>
      {focused && (
        <FocusPane
          key={focused.id}
          lens={focused}
          isBackNavigation={transition === 'back'}
          back={back}
          closeAll={closeAll}
          backStackLen={backStackLen}
        />
      )}
    </AnimatePresence>
  );
}

function FocusPane({
  lens: focused,
  isBackNavigation,
  back,
  closeAll,
  backStackLen,
}: {
  lens: FocusedLens;
  isBackNavigation: boolean;
  back: () => void;
  closeAll: () => void;
  backStackLen: number;
}) {
  const drillOn = useLensStore((s) => s.drillOn);
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null);

  const motionTransition = useMemo(
    () => ({ type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }),
    [],
  );

  // Auto-scroll so the ask box + explanation are immediately visible. Context above
  // is scrolled out of view so it doesn't distract; user can scroll up to see it.
  useEffect(() => {
    const target = scrollTargetRef.current;
    const body = bodyRef.current;
    if (!target || !body) return;
    const id = setTimeout(() => {
      const tRect = target.getBoundingClientRect();
      const bRect = body.getBoundingClientRect();
      body.scrollTo({ top: tRect.top - bRect.top - 12, behavior: 'auto' });
    }, 60);
    return () => clearTimeout(id);
  }, [focused.id]);

  // Selection-drill on Cmd+pinch inside the focus view.
  //
  // Reliability note: macOS trackpad pinch gestures clear the active text
  // selection at gesture start, so by the time Cmd is released and we'd
  // look at window.getSelection(), it's empty. That was the root cause of
  // "sometimes I have to pinch multiple times" — on the first pinch the
  // selection got wiped mid-gesture; later attempts happened to land in a
  // window where the user had just re-selected.
  //
  // Fix: snapshot the selection at the *first* Cmd+wheel event (before the
  // pinch has a chance to clear it) and carry the snapshot through to the
  // Cmd release. We also listen on `window` instead of just the container
  // so gestures that drift to a different target within the lens still
  // trigger the handler.
  useEffect(() => {
    let semanticEver = false;
    let semanticAccumDeltaY = 0;
    let capturedSelection: { range: Range; text: string } | null = null;
    let visualZoom = 1;
    const VISUAL_MIN = 0.5;
    const VISUAL_MAX = 3;
    const logId = Math.random().toString(36).slice(2, 6);

    const wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // non-pinch wheel is a normal scroll
      e.preventDefault();

      // Plain pinch (no ⌘) = visual zoom of the lens body. macOS trackpad
      // emits deltaY < 0 for pinch-out (fingers apart → content should
      // grow) and deltaY > 0 for pinch-in. `Math.exp(-deltaY/180)` gives
      // a smooth multiplicative factor per wheel event so scaling feels
      // continuous across the whole gesture.
      if (!e.metaKey) {
        const factor = Math.exp(-e.deltaY / 180);
        visualZoom = Math.max(VISUAL_MIN, Math.min(VISUAL_MAX, visualZoom * factor));
        const body = bodyRef.current;
        if (body) {
          // CSS `zoom` scales content + reflows scroll (unlike
          // transform: scale, which visually scales but leaves layout
          // metrics untouched and breaks scrollable content).
          (body as HTMLElement & { style: CSSStyleDeclaration }).style.zoom = String(visualZoom);
        }
        return;
      }

      // ⌘+pinch: existing semantic-zoom / drill path.
      if (!semanticEver) {
        semanticEver = true;
        semanticAccumDeltaY = 0;
      }
      semanticAccumDeltaY += e.deltaY;
      // Snapshot selection on the first Cmd+wheel of this gesture — before
      // the pinch has a chance to clear it.
      if (!capturedSelection) {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (text && sel && sel.rangeCount > 0) {
          capturedSelection = { range: sel.getRangeAt(0).cloneRange(), text };
          console.log(
            `[LensGesture ${logId}] captured selection: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`,
          );
        }
      }
    };

    const keyupHandler = (e: KeyboardEvent) => {
      // Esc intentionally does NOT close the lens — but if the user still
      // reflexively hits it, fire a brief toast at the top so they learn
      // what DOES close. The transient hint auto-dismisses after ~1.4s
      // inside GestureFeedback.
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('fathom:escHint'));
        return;
      }
      if (e.key !== 'Meta') return;
      console.log(
        `[LensGesture ${logId}] Cmd release — semanticEver=${semanticEver} accumΔ=${semanticAccumDeltaY.toFixed(1)} capturedSel=${!!capturedSelection}`,
      );
      if (!semanticEver) {
        capturedSelection = null;
        return;
      }
      // Interpret direction from the *net* motion, not the last wheel
      // event. A trackpad pinch typically emits ~1-10 deltaY per event;
      // 30+ net positive is a firm zoom-out gesture ("take me back").
      // Anything less is considered an ambiguous-or-zoom-in gesture and
      // defaults to drill (if a phrase is selected).
      const OUT_THRESHOLD = 30;
      const isExplicitZoomOut = semanticAccumDeltaY > OUT_THRESHOLD;

      if (isExplicitZoomOut) {
        back();
      } else if (capturedSelection) {
        // Compute the source rect defensively. When Claude is mid-stream
        // and react-markdown re-renders the body, the DOM nodes under the
        // snapshotted Range can be replaced — getBoundingClientRect on a
        // disconnected Range returns zero-size, and Safari/WebKit can even
        // throw. Fall back to a viewport-center rect so the drill still
        // fires at a sensible position, and log which path we took.
        let rect: { x: number; y: number; width: number; height: number };
        try {
          const r = capturedSelection.range.getBoundingClientRect();
          if (r.width > 2 && r.height > 2) {
            rect = { x: r.left, y: r.top, width: r.width, height: r.height };
            console.log(`[LensGesture ${logId}] drill rect from range: ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
          } else {
            console.log(`[LensGesture ${logId}] range has no box (mid-stream re-render); using viewport center`);
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            rect = { x: cx - 80, y: cy - 12, width: 160, height: 24 };
          }
        } catch (err) {
          console.warn(`[LensGesture ${logId}] getBoundingClientRect threw; falling back`, err);
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          rect = { x: cx - 80, y: cy - 12, width: 160, height: 24 };
        }
        drillOn({
          sourceRect: rect,
          selection: capturedSelection.text,
        });
        window.getSelection()?.removeAllRanges();
        if (useTourStore.getState().step === 'drill') {
          useTourStore.getState().advance('swipe');
        }
      } else {
        setHint({ x: window.innerWidth / 2, y: 90, text: 'Select a phrase to dive into it' });
        setTimeout(() => setHint(null), 1500);
      }
      semanticEver = false;
      semanticAccumDeltaY = 0;
      capturedSelection = null;
    };

    window.addEventListener('wheel', wheelHandler, { passive: false });
    window.addEventListener('keyup', keyupHandler);
    return () => {
      window.removeEventListener('wheel', wheelHandler);
      window.removeEventListener('keyup', keyupHandler);
    };
  }, [back, closeAll, drillOn, backStackLen]);

  const lastTurn = focused.turns[focused.turns.length - 1];
  const anyStreaming = lastTurn?.streaming ?? false;

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-30 flex flex-col bg-[color:var(--color-paper)]"
      initial={
        isBackNavigation ? false : { opacity: 0, clipPath: rectToClip(focused.sourceRect) }
      }
      animate={{ opacity: 1, clipPath: 'inset(0 0 0 0 round 0px)' }}
      exit={{ opacity: 0, clipPath: rectToClip(focused.sourceRect) }}
      transition={motionTransition}
    >
      {/* Header — left-pad past the macOS traffic-light region so our
          controls don't overlap the native window buttons. The Back /
          Close action moves to the right side to clear the red/yellow/
          green entirely — clicks intended for macOS's close button
          were landing on our back-arrow before. */}
      <header
        className="relative z-20 flex h-11 items-center border-b border-black/5 bg-[color:var(--color-paper)]/95 pl-[92px] pr-3 text-[12px] text-black/55 backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex-1 truncate text-center select-none">
          {focused.origin === 'region' && <span>page {focused.page}</span>}
          {focused.origin === 'viewport' && <span>page {focused.page} · viewport</span>}
          {focused.origin === 'drill' && (
            <span className="text-black/70">{focused.focusPhrase ?? 'selection'}</span>
          )}
          {backStackLen > 0 && <span className="ml-2 text-black/35">· {backStackLen + 1} deep</span>}
        </div>
        <span
          className="mr-2 hidden md:inline px-2 text-[11px] tracking-wide text-black/35 uppercase"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ⌘ pinch · swipe back
        </span>
        <button
          onClick={backStackLen > 0 ? back : closeAll}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-black/70 hover:bg-black/5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label={backStackLen > 0 ? 'Back' : 'Close lens'}
          title={backStackLen > 0 ? 'Back (⌘[)' : 'Close lens (swipe right or ⌘[)'}
        >
          {backStackLen > 0 ? (
            // ← arrow
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 6 L8 12 L14 18" />
            </svg>
          ) : (
            // × close glyph
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6 L18 18 M6 18 L18 6" />
            </svg>
          )}
          <span>{backStackLen > 0 ? 'Back' : 'Close'}</span>
        </button>
      </header>

      {/* Body */}
      <main className="relative z-10 flex-1 overflow-y-auto" ref={bodyRef}>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-8 pt-8 pb-20">
          {focused.anchorImage ? (
            <figure className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <img
                src={focused.anchorImage.dataUrl}
                alt="Zoomed passage"
                className="block w-full"
                style={{ maxHeight: 360, objectFit: 'contain' }}
              />
            </figure>
          ) : focused.origin === 'drill' && focused.anchorText ? (
            // Drill origin: there's no raster capture (we drilled on a
            // selection inside the parent lens, where the content is DOM
            // text, not pixels). But the user explicitly selected a phrase
            // — show THAT as the anchor so "what did I zoom into?" is
            // immediately answered. Handwritten amber-highlighted chip,
            // same visual vocabulary the rest of the lens uses.
            <figure
              className="flex items-center justify-center rounded-lg border border-[color:var(--color-lens)]/30 bg-[color:var(--color-lens-soft)]/40 px-6 py-10 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
              aria-label="Phrase you dove into"
            >
              <span
                className="text-[17px] leading-snug text-black/80"
                style={{
                  fontFamily:
                    "'Excalifont', 'Caveat', 'Kalam', 'Bradley Hand', cursive",
                  backgroundImage:
                    'linear-gradient(transparent 62%, rgba(201,131,42,0.28) 62%)',
                  padding: '0 4px',
                  maxWidth: '44ch',
                  textAlign: 'center',
                }}
              >
                {focused.anchorText.length > 220
                  ? focused.anchorText.slice(0, 217).trimEnd() + '…'
                  : focused.anchorText}
              </span>
            </figure>
          ) : (
            // Viewport / region origin with a missing image (rare —
            // capture failure). Generic magnifying-glass placeholder
            // rather than OCR'd text, preserving the "anchor is the
            // pixels the user saw, never the extracted words" principle.
            <div className="flex items-center justify-center rounded-lg border border-[color:var(--color-lens)]/30 bg-[color:var(--color-lens-soft)]/40 px-4 py-12 shadow-[0_2px_8px_rgba(0,0,0,0.03)]" aria-label="Zoomed viewport">
              <svg
                viewBox="0 0 48 48"
                width="44"
                height="44"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[color:var(--color-lens)]/75"
              >
                <rect x="8" y="10" width="32" height="28" rx="3"/>
                <circle cx="24" cy="24" r="7"/>
                <path d="M29 29 L34 34"/>
              </svg>
            </div>
          )}

          {focused.origin === 'drill' && focused.parentBody && (
            <details className="rounded-md border border-black/5 bg-white/40 px-4 py-2 text-[13px] text-black/55">
              <summary className="cursor-pointer text-[11px] tracking-wide uppercase select-none">
                from explanation
              </summary>
              <div className="mt-2 leading-relaxed">
                <MarkdownBody body={focused.parentBody} />
              </div>
            </details>
          )}

          {/* In-lens drill markers — the recursive equivalent of
              PDF-page markers. Phase 2 surfaces them as amber pills
              at the top of the body, one per phrase the user has
              previously drilled from this lens. Click → open the
              child lens. Phase 3 will inline these next to the
              actual phrase in the prose; for now the pills are the
              visible affordance. CLAUDE.md §2.1. */}
          <DrillMarkers focused={focused} />

          {/* Auto-scroll target — on mount we land just above the first turn so the
              streaming answer is the primary thing visible. Anchor stays above for context. */}
          <div ref={scrollTargetRef} aria-hidden />

          <div className="flex flex-col gap-8">
            {focused.turns.map((turn, i) => (
              <TurnBlock key={i} turn={turn} index={i} />
            ))}
          </div>
        </div>
      </main>

      {/* Sticky Ask footer — always visible so the user can type a follow-up without
          scrolling back through a long chat history. */}
      <div className="relative z-20 border-t border-black/5 bg-[color:var(--color-paper)]/95 px-8 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-[720px]">
          <InstructionInput
            streaming={anyStreaming}
            onSubmit={(text) => {
              askFollowUpAndStream(text);
              // Interactive tour: a submitted question advances past 'ask'.
              if (useTourStore.getState().step === 'ask') {
                useTourStore.getState().advance('drill');
              }
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed z-50 rounded-full bg-black/85 px-3 py-1 text-[11px] text-white shadow-md"
            style={{
              left: Math.min(window.innerWidth - 220, Math.max(12, hint.x - 110)),
              top: Math.max(8, hint.y),
            }}
          >
            {hint.text}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TurnBlock({ turn, index }: { turn: Turn; index: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col gap-3"
    >
      {turn.question && (
        <div className="flex items-center gap-2 text-[12px] text-black/55">
          <span className="rounded-full bg-[color:var(--color-lens)]/15 px-2.5 py-1 text-[11px] text-[color:var(--color-lens)]">
            you asked: {turn.question}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] tracking-wide text-[color:var(--color-lens)] uppercase select-none">
        <span className="h-px w-6 bg-[color:var(--color-lens)]/40" />
        <span>{turn.question ? `answer ${index + 1}` : 'lens'}</span>
        {turn.streaming && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-lens)]"
          />
        )}
        <span className="h-px flex-1 bg-[color:var(--color-lens)]/15" />
      </div>

      {/* Order:
          1. Prompt to Claude (collapsed by default)
          2. Working (live tool calls / thinking deltas)
          3. Answer body (streams below) */}
      {turn.sentPrompt && <PromptPanel prompt={turn.sentPrompt} />}
      {turn.progress.length > 0 && (
        <TurnProgress progress={turn.progress} expandedByDefault={turn.body.length === 0} />
      )}

      {turn.error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{turn.error}</div>
      ) : (
        <div
          className="cursor-text text-[14px] leading-[1.65] text-black/85 select-text"
          style={{ fontFamily: 'var(--font-handwritten)' }}
        >
          <MarkdownBody
            body={turn.body || (turn.streaming ? '_thinking…_' : '')}
            streaming={turn.streaming}
          />
        </div>
      )}
    </motion.section>
  );
}

function PromptPanel({ prompt }: { prompt: string }) {
  // Collapsed by default; user expands only when they want the full prompt.
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] text-black/60"
    >
      <summary className="cursor-pointer list-none text-[10px] font-semibold tracking-wider text-[color:var(--color-lens)] uppercase select-none">
        {open ? '▾' : '▸'} prompt to Claude ({prompt.length} chars)
      </summary>
      <pre className="mt-2 max-h-[340px] overflow-auto rounded bg-black/[0.03] p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-black/75">
        {prompt}
      </pre>
    </details>
  );
}

function TurnProgress({
  progress,
  expandedByDefault,
}: {
  progress: string;
  expandedByDefault: boolean;
}) {
  const [open, setOpen] = useState(expandedByDefault);
  // If the body arrives, collapse the progress automatically the first time.
  useEffect(() => {
    if (!expandedByDefault && open) setOpen(false);
  }, [expandedByDefault]); // eslint-disable-line react-hooks/exhaustive-deps
  const tail = progress.split('\n').filter(Boolean).slice(-1)[0] ?? '';
  return (
    <div className="rounded-md border border-black/10 bg-black/3 px-3 py-1.5 text-[11px] text-black/55">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-[9px] tracking-wider uppercase">{open ? '▾' : '▸'} working</span>
        {!open && (
          <span className="flex-1 truncate font-mono text-[11px] text-black/45">{tail}</span>
        )}
      </button>
      {open && (
        <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-black/70">
          {progress}
        </pre>
      )}
    </div>
  );
}

/**
 * Mid-stream the markdown can legitimately end inside an unfinished ```svg block. If we
 * let react-markdown render that, the browser paints nothing (invalid SVG) and the reader
 * sees a blank box. Detect the unclosed svg fence and replace it with a placeholder so the
 * reader sees "⟳ generating diagram…" until the closing ``` arrives.
 */
/** Walk a React-node tree and pull out the raw text. react-markdown's `code` handler
 * can pass string, array of strings, or nested elements depending on rehype plugins. */
function extractText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in (node as { props?: unknown })) {
    return extractText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

function preprocessForStreaming(body: string, streaming: boolean): string {
  if (!streaming) return body;
  const lastOpen = body.lastIndexOf('```svg');
  if (lastOpen === -1) return body;
  const after = body.slice(lastOpen + '```svg'.length);
  // A complete block has a closing ``` somewhere after the opening fence.
  if (after.includes('\n```')) return body;
  return body.slice(0, lastOpen).trimEnd() + '\n\n*⟳ generating diagram…*\n';
}

/**
 * Render an inline SVG tolerantly.
 *
 * Failure modes the old strict-parse implementation hit and this one
 * avoids:
 *  1. Mid-stream render — Claude has started an SVG but the closing
 *     `</svg>` hasn't streamed yet. Strict parse → error. We now detect
 *     incompleteness and show a calm "rendering diagram…" placeholder.
 *  2. Ampersand in text content / attribute value not pre-escaped. The
 *     browser's SVG engine handles this fine; DOMParser's strict XML
 *     mode doesn't. We escape bare `&` that isn't already an entity.
 *  3. Minor missing attributes — xmlns, viewBox. We add defaults.
 *
 * We only fall back to the red "parse failed" box if the <img> itself
 * can't load — i.e. even the browser's lenient SVG renderer gave up.
 */
function SvgFigure({ raw, streaming: _streaming }: { raw: string; streaming?: boolean }) {
  // Mid-stream: Claude hasn't closed the <svg> tag yet, and trying to
  // parse half-finished SVG produces noise. Show a soft placeholder
  // instead of the red error box, and swap in the real render once
  // </svg> arrives.
  const isComplete = /<\/svg\s*>/i.test(raw);

  // Normalise: ensure a wrapping <svg> + xmlns (some models emit just
  // the inner markup). Escape bare ampersands that aren't part of an
  // entity reference — a frequent Claude failure mode for
  // strict parsers like DOMParser, though browsers tolerate them.
  let svg = /<svg\b/i.test(raw)
    ? raw
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">${raw}</svg>`;
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  svg = svg.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  if (!isComplete) {
    return (
      <figure className="my-3 flex min-h-[100px] items-center justify-center rounded-md border border-dashed border-[color:var(--color-lens)]/25 bg-[color:var(--color-lens-soft)]/25 px-3 py-3">
        <span className="animate-pulse text-[11px] italic text-black/40">
          rendering diagram…
        </span>
      </figure>
    );
  }

  // Inline DOM render via DOMPurify instead of the old
  // `<img src="data:image/svg+xml,…">` approach. Reasons for the swap:
  //   • `<img>` data-URL rendering silently failed for larger SVGs —
  //     the img onError fired, the red "DIAGRAM COULDN'T RENDER" box
  //     showed, and the user saw the raw source instead of a diagram.
  //   • Inline SVG in the DOM gets the browser's normal renderer, which
  //     is strictly more tolerant (matches what you'd see from a
  //     hand-written <svg> in an HTML page).
  //   • DOMPurify sanitises against injected <script>, on* handlers,
  //     and javascript: URLs — Claude is trusted but we still don't
  //     want any arbitrary-author SVG to reach DOM unsanitised.
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject'], // rare but legitimate in handwritten-style diagrams
  });

  return (
    <figure
      className="my-3 flex min-h-[100px] w-full justify-center rounded-md border border-black/5 bg-white/70 px-3 py-3 [&>svg]:h-auto [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: clean }}
      aria-label="Diagram"
    />
  );
}

function MarkdownBody({ body, streaming = false }: { body: string; streaming?: boolean }) {
  const processed = preprocessForStreaming(body, streaming);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-3">{children}</p>,
        h1: ({ children }) => <h1 className="mt-2 mb-2 text-[18px] font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-2 mb-2 text-[16px] font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-2 mb-2 text-[15px] font-semibold">{children}</h3>,
        ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-black/95 [background-image:linear-gradient(transparent_70%,var(--color-highlight)_70%)]">
            {children}
          </strong>
        ),
        em: ({ children }) => <em className="italic text-black/75">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-black/15 pl-3 italic text-black/65">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isBlock = !!className;
          // Code blocks with language "svg" render as real SVG diagrams. Properly extract
          // text from children — react-markdown passes React nodes here for some plugins,
          // and a bare `String(children)` gives "[object Object]" for array children.
          if (isBlock && /language-svg\b/.test(className ?? '')) {
            const raw = extractText(children);
            if (raw.length < 10) {
              console.log('[Lens] SVG block too short, stubbing', raw);
              return (
                <figure className="my-3 rounded-md border border-dashed border-black/10 bg-white/40 px-3 py-2 text-[11px] text-black/40 italic">
                  diagram stub
                </figure>
              );
            }
            return <SvgFigure raw={raw} />;
          }
          if (isBlock) {
            return (
              <pre className="my-3 overflow-auto rounded-md bg-black/85 px-4 py-3 font-mono text-[12px] text-zinc-100">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-black/5 px-1 py-[1px] font-mono text-[12px] text-black/80">
              {children}
            </code>
          );
        },
        a: ({ children, href }) => (
          <a
            className="text-[color:var(--color-lens)] underline-offset-2 hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-auto">
            <table className="border-collapse text-[12px]">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-black/15 px-3 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border-b border-black/5 px-3 py-1">{children}</td>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function InstructionInput({
  streaming,
  onSubmit,
}: {
  streaming: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const canSubmit = value.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(value.trim());
        setValue('');
      }}
      className="flex items-center gap-2"
    >
      <div className="flex-1 rounded-xl border border-black/10 bg-white/80 px-4 py-2.5 focus-within:border-[color:var(--color-lens)]/60 focus-within:bg-white">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What do you want to know about this?"
          autoFocus
          className="w-full bg-transparent text-[14px] text-black/85 outline-none placeholder:text-black/30"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:bg-black/85 active:scale-95 disabled:bg-black/25"
        aria-label={streaming ? 'Ask (cancels current answer)' : 'Ask'}
        title={streaming ? 'Ask — this cancels the current answer and starts a new one' : 'Ask'}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 13V3" />
          <path d="M3 8l5-5 5 5" />
        </svg>
      </button>
    </form>
  );
}

function rectToClip(rect: { x: number; y: number; width: number; height: number }): string {
  const top = Math.max(0, rect.y);
  const left = Math.max(0, rect.x);
  const right = Math.max(0, window.innerWidth - rect.x - rect.width);
  const bottom = Math.max(0, window.innerHeight - rect.y - rect.height);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 8px)`;
}

/**
 * In-lens drill markers (Phase 2 of the recursion).
 *
 * Renders an amber pill row near the top of the lens body — one
 * pill per phrase the user has previously drilled from this lens.
 * Each pill carries the selection text (truncated) plus a small
 * sticker dot, matching the PDF-page marker visual vocabulary.
 *
 * Clicking a pill calls `useLensStore.open(child)` against the
 * already-cached child lens, opening it via the *exact same* code
 * path as a PDF marker click. That's the recursion principle in
 * code form: one open path, one render path, one persistence
 * schema, no special casing per depth.
 *
 * (Phase 3 will inline these next to the actual phrase via DOM
 * range mapping; for now the top-of-body pills are the visible
 * affordance.)
 */
function DrillMarkers({ focused }: { focused: FocusedLens }) {
  const edges = useLensStore((s) => s.drillEdges.get(focused.id) ?? []);
  const cache = useLensStore((s) => s.cache);

  if (edges.length === 0) return null;

  const reopen = (childLensId: string, selection: string) => {
    // Cached child lens turns survive across sessions — that's how
    // a click on a drill marker rehydrates the conversation rather
    // than spinning up a fresh one. If the cache is empty we fall
    // back to opening a fresh drill on the same selection.
    const cached = cache.get(childLensId);
    if (cached && cached.length > 0) {
      // Reconstruct enough of FocusedLens to call open(). The
      // store's `open` will pull turns from cache via id match.
      useLensStore.getState().open({
        id: childLensId,
        origin: 'drill',
        paperHash: focused.paperHash,
        page: focused.page,
        bbox: focused.bbox,
        sourceRect: { x: window.innerWidth / 2 - 80, y: 120, width: 160, height: 24 },
        anchorText: selection,
        focusPhrase: selection.slice(0, 64),
        prevTexts: [],
        nextTexts: [],
        parentBody: null,
        regionId: focused.regionId,
        turns: cached.map((t) => ({ ...t, streaming: false })),
      });
      return;
    }
    // Fallback: hydrate-then-drill. Same gesture path the trackpad
    // pinch goes through.
    useLensStore.getState().drillOn({
      sourceRect: { x: window.innerWidth / 2 - 80, y: 120, width: 160, height: 24 },
      selection,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[color:var(--color-lens)]/20 bg-[color:var(--color-lens-soft)]/30 px-3 py-2">
      <span className="mr-1 text-[10.5px] font-medium tracking-wider text-[color:var(--color-lens)]/85 uppercase">
        Drilled here
      </span>
      {edges.map((e) => {
        const label =
          e.selection.length > 48
            ? e.selection.slice(0, 45).trimEnd() + '…'
            : e.selection;
        return (
          <button
            key={e.childLensId}
            onClick={() => reopen(e.childLensId, e.selection)}
            className="group inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-lens)]/40 bg-white/70 px-2.5 py-0.5 text-[12px] text-black/75 transition hover:border-[color:var(--color-lens)] hover:bg-[color:var(--color-lens-soft)]/60 hover:text-black/90 active:scale-[0.97]"
            title={`Re-open: "${e.selection}"`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-lens)] shadow-[0_0_0_1.5px_rgba(255,255,255,0.85)]"
              aria-hidden="true"
            />
            <span className="truncate" style={{ maxWidth: 240 }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
