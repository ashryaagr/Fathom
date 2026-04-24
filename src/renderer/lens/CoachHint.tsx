import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTourStore } from './tourStore';
import { useLensStore } from './store';

/**
 * Interactive walkthrough — visual only.
 *
 * The rule: the user learns Fathom by DOING each thing, not by reading
 * about it. So each step shows a small pictogram of the gesture, a
 * three-word label, and the amber progress thread at the bottom. No
 * paragraphs. Advance only when the user actually completes the action
 * — event-driven via the tourStore's `advance(step)` calls from
 * PdfViewer / FocusView / App.
 *
 * Skip is a two-step confirm: first press shows a warning that the
 * app has controls that aren't discoverable by reading, because they
 * aren't — they're gestures. Second press actually skips.
 */

type Step = Exclude<import('./tourStore').TourStep, 'idle'>;

// ---- Pictograms ----
// All pictograms share the same 56×56 grid, same stroke weight and
// amber/ink palette. Keeps the tour feeling like one visual voice.

const INK = '#1a1614';
const AMBER = '#c9832a';
const PAPER = '#faf4e8';

const PinchGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    {/* ⌘ keycap */}
    <rect x="4" y="16" width="14" height="14" rx="3" fill="none" stroke={AMBER} strokeWidth="1.6"/>
    <text x="11" y="27" textAnchor="middle" fontSize="10" fontWeight="700" fill={AMBER}
          fontFamily="-apple-system, sans-serif">⌘</text>
    {/* + */}
    <path d="M22 23 L26 23 M24 21 L24 25" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
    {/* Pinch: two fingers drawing apart */}
    <g stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round">
      <circle cx="33" cy="23" r="3.5" fill={AMBER} stroke="none"/>
      <circle cx="48" cy="23" r="3.5" fill={AMBER} stroke="none"/>
      <path d="M36 23 L40 23" strokeDasharray="2 2"/>
      <path d="M45 23 L43 23" strokeDasharray="2 2"/>
      <path d="M30 28 L30 32" stroke={AMBER}/>
      <path d="M51 28 L51 32" stroke={AMBER}/>
    </g>
    <path d="M40 40 L40 46 M37 43 L40 46 L43 43" stroke={AMBER} strokeWidth="1.6" fill="none"
          strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AskGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    {/* text box with caret */}
    <rect x="6" y="26" width="44" height="14" rx="7" fill="none" stroke={AMBER} strokeWidth="1.6"/>
    <rect x="12" y="31" width="2" height="4" fill={INK}>
      <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/>
    </rect>
    <path d="M18 33 L36 33" stroke={INK} strokeWidth="1.4" strokeLinecap="round" opacity="0.4" strokeDasharray="2 2"/>
    {/* send button */}
    <circle cx="44" cy="33" r="4.5" fill={AMBER}/>
    <path d="M42 33 L44 31 L46 33 M44 31 L44 36" stroke={PAPER} strokeWidth="1.3" fill="none"
          strokeLinecap="round" strokeLinejoin="round"/>
    {/* question mark floating above */}
    <text x="28" y="18" textAnchor="middle" fontSize="14" fontWeight="700" fill={AMBER}
          fontFamily="-apple-system, sans-serif">?</text>
  </svg>
);

const DrillGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    {/* Selection highlight */}
    <rect x="8" y="20" width="40" height="7" rx="1.5" fill={AMBER} opacity="0.28"/>
    <rect x="8" y="22" width="40" height="3" rx="1" fill={INK} opacity="0.75"/>
    {/* Pinch on selection */}
    <circle cx="16" cy="23.5" r="3" fill={AMBER}/>
    <circle cx="40" cy="23.5" r="3" fill={AMBER}/>
    {/* Nested down-arrow — drilling deeper */}
    <g fill="none" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M28 32 L28 42"/>
      <path d="M24 38 L28 42 L32 38"/>
    </g>
    <rect x="18" y="43" width="20" height="9" rx="2" fill={AMBER} opacity="0.16" stroke={AMBER} strokeWidth="1"/>
  </svg>
);

const SwipeGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    {/* Two fingers */}
    <circle cx="32" cy="22" r="3" fill={AMBER}/>
    <circle cx="38" cy="22" r="3" fill={AMBER}/>
    <path d="M32 25 L32 31" stroke={AMBER} strokeWidth="2" strokeLinecap="round"/>
    <path d="M38 25 L38 31" stroke={AMBER} strokeWidth="2" strokeLinecap="round"/>
    {/* sweeping-left motion trail + big arrow */}
    <g stroke={AMBER} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 38 L44 38"/>
      <path d="M18 34 L12 38 L18 42"/>
    </g>
    <path d="M42 34 L44 36" stroke={AMBER} strokeWidth="1.2" opacity="0.4" strokeLinecap="round"/>
    <path d="M44 32 L48 34" stroke={AMBER} strokeWidth="1.2" opacity="0.3" strokeLinecap="round"/>
  </svg>
);

const DoneGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    <circle cx="28" cy="28" r="22" fill={AMBER}/>
    <path d="M17 29 L24 36 L39 20" stroke={PAPER} strokeWidth="3.2" fill="none"
          strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// A miniature PDF page with an amber sticker on the paragraph you
// dove into — the same visual vocabulary the real markers use.
const MarkerGlyph = () => (
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    <rect x="10" y="8" width="32" height="40" rx="3" fill={PAPER} stroke={INK} strokeWidth="1.5"/>
    <line x1="16" y1="18" x2="36" y2="18" stroke={INK} strokeWidth="1.1" opacity="0.35"/>
    <line x1="16" y1="23" x2="34" y2="23" stroke={INK} strokeWidth="1.1" opacity="0.35"/>
    {/* the paragraph the user zoomed into */}
    <line x1="16" y1="28" x2="32" y2="28" stroke={AMBER} strokeWidth="1.4"/>
    <line x1="16" y1="33" x2="30" y2="33" stroke={INK} strokeWidth="1.1" opacity="0.35"/>
    <line x1="16" y1="38" x2="34" y2="38" stroke={INK} strokeWidth="1.1" opacity="0.35"/>
    {/* the sticker */}
    <circle cx="36" cy="28" r="3.6" fill={AMBER}/>
    <circle cx="36" cy="28" r="3.6" fill="none" stroke={PAPER} strokeWidth="1.2"/>
  </svg>
);

const STEPS: Record<
  Step,
  { index: number | null; total: number; label: string; glyph: () => JSX.Element; minimal: string }
> = {
  pinch:       { index: 1, total: 5, label: '⌘ + pinch',           glyph: PinchGlyph,  minimal: 'on any paragraph' },
  ask:         { index: 2, total: 5, label: 'Ask a question',      glyph: AskGlyph,    minimal: 'in the box below' },
  drill:       { index: 3, total: 5, label: 'Select + pinch',      glyph: DrillGlyph,  minimal: 'a phrase to drill' },
  swipe:       { index: 4, total: 5, label: 'Step back',           glyph: SwipeGlyph,  minimal: '⌘[ or the back arrow up top' },
  marker:      { index: 5, total: 5, label: 'Your amber sticker',  glyph: MarkerGlyph, minimal: 'click it to re-open this lens later' },
  celebrated:  { index: null, total: 5, label: "You're in",        glyph: DoneGlyph,   minimal: '⌘, for Preferences' },
};

// When step is 'ask' AND the focused lens is still streaming, swap the
// "Ask a question" prompt for this narrative variant. The user asked for
// copy that tells the story of what's happening in the product, not a
// mechanical instruction.
const STREAMING_NARRATIVE = {
  label: 'Claude is reading',
  minimal: 'ask a follow-up any time →',
};

export default function CoachHint() {
  const step = useTourStore((s) => s.step);
  const active = useTourStore((s) => s.active);
  const skip = useTourStore((s) => s.skip);

  // Read the focused lens's last-turn streaming flag so we can swap the
  // "ask" step copy for a narrative variant while Claude is still typing.
  const streaming = useLensStore((s) => {
    const t = s.focused?.turns;
    if (!t || t.length === 0) return false;
    return t[t.length - 1].streaming;
  });

  const [skipArmed, setSkipArmed] = useState(false);

  // Auto-advance `marker` → `celebrated` after a beat. The marker
  // step is a show-not-do — no user action required to finish it,
  // just "here's the sticker; here's what it's for" — so leaving
  // the tour parked on it forever isn't the right UX. Five seconds
  // is enough for the user to read the one line and see the dot on
  // the page behind the hint.
  useEffect(() => {
    if (step !== 'marker') return;
    const t = setTimeout(() => {
      useTourStore.getState().advance('celebrated');
    }, 5000);
    return () => clearTimeout(t);
  }, [step]);

  const visible = active && step !== 'idle';
  if (!visible) return null;
  const base = STEPS[step as Step];
  const isStreamingNarrative = step === 'ask' && streaming;
  const copy = {
    ...base,
    ...(isStreamingNarrative ? STREAMING_NARRATIVE : {}),
  };
  const Glyph = base.glyph;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="fixed right-6 bottom-6 z-[70] w-[240px] overflow-hidden rounded-2xl shadow-[0_16px_44px_rgba(0,0,0,0.28)]"
          style={{ background: '#1a1614', color: PAPER }}
        >
          {/* Pictogram band — icon is the primary content, not the words. */}
          <motion.div
            key={step}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="flex items-center justify-center py-5"
            style={{ background: '#231c18' }}
          >
            <Glyph />
          </motion.div>

          {/* Minimal label block — three words or fewer per line. */}
          <div className="px-5 pt-4 pb-3">
            <div className="mb-0.5 text-[10.5px] font-medium tracking-[0.14em] uppercase" style={{ color: AMBER }}>
              {copy.index === null ? 'Done' : `Step ${copy.index} / ${copy.total}`}
            </div>
            <div className="text-[15px] font-medium leading-tight">{copy.label}</div>
            <div className="mt-0.5 text-[11.5px] text-white/55">{copy.minimal}</div>
          </div>

          {/* Amber progress thread. */}
          <div className="mx-5 mb-4 flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-[3px] flex-1 rounded-full"
                style={{
                  background:
                    copy.index !== null && i <= copy.index
                      ? AMBER
                      : 'rgba(201,131,42,0.18)',
                }}
              />
            ))}
          </div>

          {/* Skip with confirmation. Intentionally tiny + low-contrast so it
              doesn't compete with the glyph, but reachable. */}
          {copy.index !== null && (
            <div className="border-t border-white/5 px-5 py-2.5">
              {!skipArmed ? (
                <button
                  onClick={() => setSkipArmed(true)}
                  className="text-[10.5px] text-white/35 hover:text-white/70"
                >
                  Skip tour
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-white/75 leading-snug">
                    These controls aren't menus — skip anyway?
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setSkipArmed(false)}
                      className="rounded px-2 py-0.5 text-white/50 hover:text-white/85"
                    >
                      Back
                    </button>
                    <button
                      onClick={skip}
                      className="rounded bg-white/10 px-2 py-0.5 text-white/85 hover:bg-white/18"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
