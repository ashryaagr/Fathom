import { motion, AnimatePresence } from 'framer-motion';
import { useTourStore } from './tourStore';

/**
 * A single floating hint, visible only while the interactive tour is active.
 * Content rotates based on `tourStore.step`. Sits at a fixed bottom-right
 * corner so it never covers the paragraph the user needs to pinch on or the
 * Ask footer they need to type in.
 */

const STEPS: Record<
  Exclude<import('./tourStore').TourStep, 'idle'>,
  { index: number | null; total: number; headline: string; body: string }
> = {
  pinch: {
    index: 1,
    total: 4,
    headline: 'Try pinching',
    body:
      'Hold ⌘ (Command) and pinch outward with two fingers on any paragraph below. Release ⌘ to open the lens.',
  },
  ask: {
    index: 2,
    total: 4,
    headline: 'Ask a follow-up',
    body:
      "Type a question in the box at the bottom of the lens, then press Enter. It stacks into a thread.",
  },
  drill: {
    index: 3,
    total: 4,
    headline: 'Drill into a phrase',
    body:
      "Select a phrase in the explanation you want to understand more, then Cmd+pinch on it to dive deeper.",
  },
  swipe: {
    index: 4,
    total: 4,
    headline: 'Swipe back',
    body:
      'Two-finger swipe right on your trackpad to go back through the lenses you opened, like turning a page.',
  },
  celebrated: {
    index: null,
    total: 4,
    headline: "You're in.",
    body:
      "That's the whole interaction. Open any PDF, pinch on anything. Preferences live at ⌘,.",
  },
};

export default function CoachHint() {
  const step = useTourStore((s) => s.step);
  const active = useTourStore((s) => s.active);
  const skip = useTourStore((s) => s.skip);

  const visible = active && step !== 'idle';
  const copy = visible ? STEPS[step as Exclude<typeof step, 'idle'>] : null;

  return (
    <AnimatePresence>
      {visible && copy && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          className="fixed right-6 bottom-6 z-[70] max-w-[320px] rounded-xl px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
          style={{ background: '#1a1614', color: '#faf4e8' }}
        >
          {/* Step counter + skip */}
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: '#c9832a' }}>
              {copy.index === null ? 'Tour complete' : `Step ${copy.index} of ${copy.total}`}
            </span>
            {copy.index !== null && (
              <button
                onClick={skip}
                className="text-[10.5px] text-white/35 hover:text-white/70"
              >
                Skip tour
              </button>
            )}
          </div>
          <h3 className="mb-1 text-[14px] font-medium">{copy.headline}</h3>
          <p className="text-[12.5px] leading-relaxed text-white/75">{copy.body}</p>
          {/* Progress dots */}
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-[3px] flex-1 rounded-full"
                style={{
                  background:
                    copy.index !== null && i <= copy.index
                      ? '#c9832a'
                      : 'rgba(201, 131, 42, 0.18)',
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
