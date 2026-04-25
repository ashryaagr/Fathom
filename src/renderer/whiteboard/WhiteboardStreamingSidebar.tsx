/**
 * Pass 1 streaming sidebar — the cog reviewer's non-blocking note
 * mitigation for the 50-second silent stretch between consent and
 * Level 1 paint.
 *
 * Renders the model's incremental tokens into a small auto-scrolling
 * panel on the right while Pass 1 runs. Strictly informational;
 * collapses to nothing once Level 1 hydrates. Same visual rhythm as
 * the existing lens "▾ working" surface so the user reads it as
 * "Claude's thinking" not "the app froze".
 *
 * NB: this is NOT the eventual side-chat patch loop (deferred from v1).
 * That lives at the right rail of a *ready* whiteboard for iterative
 * refinement.
 */

import { useEffect, useRef } from 'react';
import { useWhiteboardStore } from './store';

interface Props {
  paperHash: string;
}

export default function WhiteboardStreamingSidebar({ paperHash }: Props) {
  const wb = useWhiteboardStore((s) => s.byPaper.get(paperHash));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep the latest tokens visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [wb?.understanding, wb?.pass2Stream]);

  if (!wb) return null;
  // Show during pass1 (streaming the understanding doc) AND during
  // pass2 (streaming the JSON for Level 1). Once we hit ready /
  // expanding, the diagram itself takes over and the sidebar
  // disappears.
  const showing = wb.status === 'pass1' || wb.status === 'pass2';
  if (!showing) return null;

  // Pass 1 takes ~50s; show the understanding stream.
  // Pass 2 takes ~5-10s; show the JSON stream so the wait isn't silent.
  const body = wb.status === 'pass1' ? wb.understanding : wb.pass2Stream;
  const label =
    wb.status === 'pass1'
      ? 'Reading the paper end-to-end · Opus 4.7'
      : 'Drawing the diagram · Sonnet 4.6';

  return (
    <aside
      className="pointer-events-auto absolute top-16 right-4 z-20 flex h-[calc(100%-7rem)] w-[320px] flex-col rounded-lg border border-black/10 bg-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <header className="flex items-center gap-2 border-b border-black/5 px-3 py-2 text-[11px] font-medium text-black/60">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#9f661b]" />
        <span>{label}</span>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[11.5px] leading-relaxed text-black/70"
      >
        {body || (
          <span className="text-black/35">Warming up…</span>
        )}
      </div>
      <footer className="border-t border-black/5 px-3 py-1.5 text-[10.5px] text-black/40">
        Strictly informational. The diagram appears below when ready.
      </footer>
    </aside>
  );
}
