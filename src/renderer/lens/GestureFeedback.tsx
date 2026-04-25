import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Small visual affordances for the gestures that otherwise happen silently.
 * Listens to custom events dispatched from the gesture code paths and
 * draws a brief overlay that tells the user the app registered what they did:
 *
 *   - `fathom:swipe` { dir: 'back' | 'forward' } — browser-style arrow
 *     sweeps across the screen (pointing in the direction of navigation).
 *   - `fathom:zoomCommit` — a quick ring-pulse in the center when a
 *     semantic zoom commits into a new lens.
 *   - `fathom:semanticArmed` { on: boolean } — a thin amber hairline at
 *     the edges of the viewport while ⌘ is held in the PDF view (tells
 *     the user semantic mode is active before they pinch).
 *
 * Keeping this decoupled via events means any gesture path (wheel, touch,
 * menu, button) can fire the affordance without importing this component.
 */

type SwipeDir = 'back' | 'forward';

export default function GestureFeedback() {
  const [swipe, setSwipe] = useState<{ dir: SwipeDir; nonce: number } | null>(null);
  const [zoomPulse, setZoomPulse] = useState(0);
  const [armed, setArmed] = useState(false);
  const [escHint, setEscHint] = useState(0);

  useEffect(() => {
    const onSwipe = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: SwipeDir }>).detail;
      if (!detail) return;
      setSwipe({ dir: detail.dir, nonce: Date.now() });
    };
    const onZoom = () => setZoomPulse((n) => n + 1);
    const onArmed = (e: Event) => {
      const on = (e as CustomEvent<{ on: boolean }>).detail?.on ?? false;
      setArmed(on);
    };
    const onEscHint = () => setEscHint((n) => n + 1);

    window.addEventListener('fathom:swipe', onSwipe);
    window.addEventListener('fathom:zoomCommit', onZoom);
    window.addEventListener('fathom:semanticArmed', onArmed);
    window.addEventListener('fathom:escHint', onEscHint);
    return () => {
      window.removeEventListener('fathom:swipe', onSwipe);
      window.removeEventListener('fathom:zoomCommit', onZoom);
      window.removeEventListener('fathom:semanticArmed', onArmed);
      window.removeEventListener('fathom:escHint', onEscHint);
    };
  }, []);

  return (
    <>
      {/* Swipe arrow — browser-style chevron that sweeps across the screen. */}
      <AnimatePresence>
        {swipe && (
          <motion.div
            key={swipe.nonce}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center"
            onAnimationComplete={() => {
              setTimeout(() => setSwipe(null), 380);
            }}
          >
            <motion.div
              initial={{
                x: swipe.dir === 'back' ? -160 : 160,
                scale: 0.85,
                opacity: 0,
              }}
              animate={{ x: 0, scale: 1, opacity: 0.92 }}
              exit={{ opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 360,
                damping: 22,
                duration: 0.42,
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-black/72 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm"
            >
              {swipe.dir === 'back' ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 6 L8 12 L14 18" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 6 L16 12 L10 18" />
                </svg>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom-commit pulse — a brief expanding ring at the center when a
          semantic zoom commits successfully. Confirmation without words. */}
      {zoomPulse > 0 && (
        <motion.div
          key={`zoom-${zoomPulse}`}
          initial={{ scale: 0.4, opacity: 0.55 }}
          animate={{ scale: 3.4, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="pointer-events-none fixed top-1/2 left-1/2 z-[110] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[color:var(--color-lens)]"
        />
      )}

      {/* Semantic-armed hairline — thin amber border pulses at the edges
          while ⌘ is held. Tells the user "semantic mode is on" before
          they even move their fingers. */}
      <AnimatePresence>
        {armed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[90]"
            style={{
              boxShadow: 'inset 0 0 0 2px rgba(201, 131, 42, 0.58)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Esc hint — subtle caption explaining what Esc *does* now (since
          it no longer closes). Fires on Esc press inside the lens. */}
      <AnimatePresence>
        {escHint > 0 && (
          <motion.div
            key={`esc-${escHint}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed top-14 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-black/75 px-3.5 py-1.5 text-[11.5px] font-medium text-white/95 shadow-[0_6px_18px_rgba(0,0,0,0.2)] backdrop-blur-sm"
            onAnimationComplete={() => {
              setTimeout(() => setEscHint((n) => (n === escHint ? 0 : n)), 1400);
            }}
          >
            Use the Back button (top-left) or swipe right to close
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
