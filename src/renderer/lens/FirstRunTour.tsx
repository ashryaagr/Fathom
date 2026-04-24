import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * First-run welcome. Deliberately NOT a multi-step cards tour — the user
 * doesn't learn Fathom by reading a wizard, they learn it by pinching once.
 * So this single card tells them what to try and gets out of the way. The
 * rest of the app's interactions are discoverable: the `?` button shows a
 * full reference card, the sticky Ask box announces itself inside any lens,
 * and the Help menu has "Show Welcome" for anyone who wants this card again.
 *
 * A proper interactive walkthrough — coachmarks that detect when you've
 * successfully pinched, asked, and drilled, and advance accordingly — is
 * queued as its own commit. Until then, this card + the `?` reference panel
 * is the onboarding.
 */

const PALETTE = {
  ink: '#1a1614',
  amber: '#c9832a',
  paper: '#faf4e8',
  paperDim: '#f3ead7',
};

const Illustration = () => (
  <svg viewBox="0 0 320 150" width="320" height="150" aria-hidden="true">
    {/* document */}
    <rect x="20" y="20" width="280" height="115" rx="8"
          fill="white" stroke={PALETTE.amber} strokeWidth="1.3"/>
    <rect x="40" y="40" width="240" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.25"/>
    <rect x="40" y="50" width="210" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.25"/>
    {/* highlighted line — the one they'll pinch */}
    <rect x="40" y="60" width="220" height="3" rx="1.5" fill={PALETTE.amber} opacity="0.9"/>
    <rect x="40" y="70" width="180" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.25"/>
    <rect x="40" y="80" width="240" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.25"/>
    <rect x="40" y="90" width="200" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.25"/>

    {/* Two finger pinch icons around the highlighted line */}
    <circle cx="32" cy="62" r="5.5" fill={PALETTE.amber}/>
    <circle cx="268" cy="62" r="5.5" fill={PALETTE.amber}/>
    <path d="M 38 62 L 80 62" stroke={PALETTE.amber} strokeWidth="1.2" strokeDasharray="3 3"/>
    <path d="M 262 62 L 220 62" stroke={PALETTE.amber} strokeWidth="1.2" strokeDasharray="3 3"/>
  </svg>
);

export default function FirstRunTour({
  visible,
  onDone,
}: {
  visible: boolean;
  /** startCoach=true → kicks off the interactive walkthrough after
   * dismiss. =false → user opted out ("don't show again"). Either way
   * the welcome modal is remembered as seen and won't re-appear. */
  onDone: (startCoach: boolean) => void;
}) {
  // Dismiss on Enter (start coach) or Escape (skip). Both remember the
  // decision so the modal doesn't re-fire next session.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onDone(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDone(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => onDone(false)}
        >
          <motion.div
            initial={{ scale: 0.97, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-[480px] max-w-[90vw] overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            style={{ background: PALETTE.paper }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-center px-8 pt-8 pb-2"
              style={{ background: PALETTE.paperDim }}
            >
              <Illustration />
            </div>
            <div className="px-8 pt-6 pb-6">
              <h2
                className="mb-3 text-[22px] leading-tight font-medium tracking-tight"
                style={{ color: PALETTE.ink }}
              >
                Try it with a passage.
              </h2>
              <p className="mb-6 text-[14.5px] leading-relaxed" style={{ color: '#2a2420' }}>
                Hold <kbd className="rounded bg-black/5 px-1.5 py-[1px] font-mono text-[12px]">⌘</kbd>{' '}
                and pinch on any paragraph with two fingers on your trackpad. The page
                gives way to a lens — a clearer explanation of what you pinched,
                streaming in place, grounded in the paper itself.
              </p>
              <p className="mb-7 text-[13px] leading-relaxed text-black/55">
                Ask follow-ups in the sticky box at the bottom of the lens. Pinch on a
                phrase inside to go deeper. Hit{' '}
                <kbd className="rounded bg-black/5 px-1.5 py-[1px] font-mono text-[11.5px]">⌘[</kbd>{' '}
                or click the back arrow to step back. Reopen this
                card any time from the <kbd className="rounded bg-black/5 px-1.5 py-[1px] font-mono text-[11.5px]">?</kbd> in the header or
                from Help → Show Welcome.
              </p>
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => onDone(false)}
                  className="text-[12.5px] text-black/50 underline-offset-4 hover:text-black/80 hover:underline"
                  title="Dismiss and never show this walkthrough again"
                >
                  Skip — don't show again
                </button>
                <button
                  onClick={() => onDone(true)}
                  className="rounded-full px-6 py-2 text-[13px] font-medium shadow-sm transition"
                  style={{ background: PALETTE.ink, color: PALETTE.paper }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLButtonElement).style.background = PALETTE.amber)
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLButtonElement).style.background = PALETTE.ink)
                  }
                >
                  Try it now
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
