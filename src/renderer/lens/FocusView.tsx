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
    const logId = Math.random().toString(36).slice(2, 6);

    const wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!e.metaKey) return;
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
        const rect = capturedSelection.range.getBoundingClientRect();
        drillOn({
          sourceRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
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
      {/* Header */}
      <header
        className="relative z-20 flex h-11 items-center border-b border-black/5 bg-[color:var(--color-paper)]/95 px-4 text-[12px] text-black/55 backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={backStackLen > 0 ? back : closeAll}
          className="rounded-md px-2 py-1 text-[13px] font-medium text-black/70 hover:bg-black/5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Back"
        >
          ← {backStackLen > 0 ? 'Back' : 'Close'}
        </button>
        <div className="flex-1 truncate text-center select-none">
          {focused.origin === 'region' && <span>page {focused.page}</span>}
          {focused.origin === 'viewport' && <span>page {focused.page} · viewport</span>}
          {focused.origin === 'drill' && (
            <span className="text-black/70">{focused.focusPhrase ?? 'selection'}</span>
          )}
          {backStackLen > 0 && <span className="ml-2 text-black/35">· {backStackLen + 1} deep</span>}
        </div>
        <span
          className="px-2 text-[11px] tracking-wide text-black/35 uppercase"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ⌘ pinch · swipe back
        </span>
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
          ) : (
            // Visual placeholder — shown only when the viewport capture
            // itself failed (rare; usually network/permissions race). A
            // small amber-tinted rectangle stands in visually rather than
            // echoing any text, preserving the "only the image, never the
            // extracted words" principle.
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
 * Render an inline SVG reliably. We use `<img src="data:image/svg+xml;…">` rather than
 * `dangerouslySetInnerHTML` because the browser treats the <img> as a first-class image
 * and renders the SVG even when it's missing width/xmlns or other attributes that trip
 * up inline-SVG-in-HTML parsers. On parse errors we fall back to showing the source so
 * the user at least sees what Claude emitted and can report it.
 */
function SvgFigure({ raw }: { raw: string }) {
  // Ensure a wrapping <svg> element and an xmlns attribute — both are required by
  // spec for a data URL to render.
  let svg = /<svg\b/i.test(raw)
    ? raw
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">${raw}</svg>`;
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // Strip scripts / event handlers (trusted source but belt-and-braces).
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  // Validate the SVG parses. If it doesn't, show the source instead of a silent white box.
  const parseDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parseErr = parseDoc.querySelector('parsererror');
  const isValid = !parseErr && parseDoc.documentElement.nodeName.toLowerCase() === 'svg';

  console.log('[Lens] SVG render', {
    rawLength: raw.length,
    svgLength: svg.length,
    isValid,
    parseErrorText: parseErr?.textContent?.slice(0, 200) ?? null,
    preview: svg.slice(0, 180),
  });

  if (!isValid) {
    return (
      <figure className="my-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold tracking-wider text-red-600 uppercase">
          diagram parse failed
        </div>
        <pre className="overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-black/70">
          {raw}
        </pre>
      </figure>
    );
  }

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return (
    <figure className="my-3 flex min-h-[100px] w-full justify-center rounded-md border border-black/5 bg-white/70 px-3 py-3">
      <img
        src={dataUrl}
        alt="Diagram"
        className="block h-auto max-w-full"
        onError={() => console.error('[Lens] SVG <img> failed to load')}
      />
    </figure>
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
