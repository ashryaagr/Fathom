import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * A proactive, step-by-step walkthrough of the core Fathom interactions.
 *
 * Fires automatically the first time a PDF is opened (sample or user's own)
 * if the user hasn't completed it yet. Always re-triggerable from the `?`
 * button or from Help → Show Tour — so a user who was overwhelmed on first
 * run can come back to it.
 *
 * Each step is a centered card with one short sentence and a tiny inline-SVG
 * illustration of the gesture it describes. Not a coachmark / DOM-anchored
 * overlay — which would be fragile as the app layout evolves — just a clean
 * sequence the user can step through at their own pace.
 */

interface Step {
  title: string;
  body: string;
  cta: string;
  illustration: JSX.Element;
}

const PALETTE = {
  ink: '#1a1614',
  amber: '#c9832a',
  amberSoft: 'rgba(201, 131, 42, 0.18)',
  paperDim: '#f3ead7',
};

const PinchIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="20" y="20" width="160" height="80" rx="10"
          fill={PALETTE.paperDim} stroke={PALETTE.amber} strokeWidth="1.4"/>
    <rect x="50" y="40" width="100" height="4" rx="2" fill={PALETTE.ink} opacity="0.25"/>
    <rect x="50" y="52" width="80" height="4" rx="2" fill={PALETTE.ink} opacity="0.25"/>
    <rect x="50" y="64" width="90" height="4" rx="2" fill={PALETTE.amber} opacity="0.9"/>
    <rect x="50" y="76" width="70" height="4" rx="2" fill={PALETTE.ink} opacity="0.25"/>
    {/* Two fingers pinching inward on the amber line */}
    <circle cx="42" cy="70" r="6" fill={PALETTE.amber}/>
    <circle cx="158" cy="62" r="6" fill={PALETTE.amber}/>
    <path d="M 48 70 L 88 66" stroke={PALETTE.amber} strokeWidth="1.2" strokeDasharray="3 3"/>
    <path d="M 152 62 L 112 66" stroke={PALETTE.amber} strokeWidth="1.2" strokeDasharray="3 3"/>
  </svg>
);

const LensOpenIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="14" y="10" width="172" height="100" rx="12"
          fill="white" stroke={PALETTE.amber} strokeWidth="1.6"/>
    <rect x="28" y="24" width="144" height="30" rx="4"
          fill={PALETTE.paperDim}/>
    <rect x="28" y="62" width="60" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.4"/>
    <rect x="28" y="70" width="144" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.3"/>
    <rect x="28" y="78" width="120" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.3"/>
    <rect x="28" y="86" width="138" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.3"/>
    <rect x="28" y="94" width="70" height="3" rx="1.5" fill={PALETTE.ink} opacity="0.3"/>
    {/* animated stream cursor */}
    <rect x="100" y="92" width="2" height="7" fill={PALETTE.amber}>
      <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/>
    </rect>
  </svg>
);

const AskFooterIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="14" y="10" width="172" height="100" rx="12"
          fill="white" stroke={PALETTE.amber} strokeWidth="1.6"/>
    <rect x="28" y="24" width="100" height="4" rx="2" fill={PALETTE.ink} opacity="0.3"/>
    <rect x="28" y="34" width="144" height="4" rx="2" fill={PALETTE.ink} opacity="0.3"/>
    <rect x="28" y="44" width="110" height="4" rx="2" fill={PALETTE.ink} opacity="0.3"/>
    {/* sticky Ask box at the bottom */}
    <rect x="24" y="80" width="152" height="22" rx="11"
          fill={PALETTE.paperDim} stroke={PALETTE.amber} strokeWidth="1.3"/>
    <text x="38" y="94" fontFamily="-apple-system, sans-serif" fontSize="9"
          fill={PALETTE.ink} opacity="0.5">Ask a follow-up…</text>
    <circle cx="160" cy="91" r="7" fill={PALETTE.amber}/>
    <path d="M 157 91 L 160 88 L 163 91 M 160 88 L 160 94"
          stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
  </svg>
);

const DrillIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="14" y="10" width="172" height="100" rx="12"
          fill="white" stroke={PALETTE.ink} strokeWidth="1.2" opacity="0.35"/>
    <rect x="34" y="30" width="132" height="60" rx="9"
          fill="white" stroke={PALETTE.amber} strokeWidth="1.4"/>
    <rect x="54" y="50" width="92" height="20" rx="5"
          fill={PALETTE.amberSoft} stroke={PALETTE.amber} strokeWidth="1.4"/>
    <text x="100" y="63" textAnchor="middle"
          fontFamily="-apple-system, sans-serif" fontSize="9"
          fill={PALETTE.amber} fontWeight="600">deeper</text>
  </svg>
);

const SwipeIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="14" y="14" width="172" height="92" rx="12"
          fill="white" stroke={PALETTE.amber} strokeWidth="1.5"/>
    {/* left arrow */}
    <path d="M 60 60 L 40 60 M 40 60 L 48 52 M 40 60 L 48 68"
          stroke={PALETTE.amber} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    {/* right arrow */}
    <path d="M 140 60 L 160 60 M 160 60 L 152 52 M 160 60 L 152 68"
          stroke={PALETTE.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
    <text x="50" y="86" textAnchor="middle"
          fontFamily="-apple-system, sans-serif" fontSize="8"
          fill={PALETTE.amber} fontWeight="600">back</text>
    <text x="150" y="86" textAnchor="middle"
          fontFamily="-apple-system, sans-serif" fontSize="8"
          fill={PALETTE.ink} opacity="0.5">forward</text>
  </svg>
);

const FinishIllustration = () => (
  <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
    <rect x="28" y="14" width="144" height="92" rx="8"
          fill={PALETTE.paperDim} stroke={PALETTE.amber} strokeWidth="1.4"/>
    {/* check */}
    <circle cx="100" cy="56" r="20" fill={PALETTE.amber}/>
    <path d="M 90 56 L 97 63 L 111 49" stroke="white"
          strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="100" y="92" textAnchor="middle"
          fontFamily="-apple-system, sans-serif" fontSize="9"
          fill={PALETTE.ink} opacity="0.6">you're in</text>
  </svg>
);

const STEPS: Step[] = [
  {
    title: 'A new way to read a paper',
    body:
      "Fathom is built around one idea: zooming in on a passage zooms in on your understanding of it. Here's the whole interaction — takes a minute.",
    cta: 'Show me',
    illustration: <PinchIllustration />,
  },
  {
    title: 'Hold ⌘ and pinch',
    body:
      "Pick a paragraph you'd like to understand better. Hold the Command (⌘) key, and pinch outward with two fingers on your trackpad. The paragraph is what you'll dive into.",
    cta: 'Next',
    illustration: <PinchIllustration />,
  },
  {
    title: 'Release ⌘ — the lens opens',
    body:
      'The page gives way to a full-screen lens. An explanation streams in, grounded in the paper itself — Claude is reading the index we wrote next to your PDF.',
    cta: 'Next',
    illustration: <LensOpenIllustration />,
  },
  {
    title: 'Ask a follow-up',
    body:
      "Inside the lens, the sticky box at the bottom is always reachable. Type any follow-up question — it appends to the thread. You can ask as many as you want; typing a new one cancels the one that's still streaming.",
    cta: 'Next',
    illustration: <AskFooterIllustration />,
  },
  {
    title: 'Drill deeper',
    body:
      "See a phrase you want to understand more? Select it and ⌘ + pinch on the selection. You'll drill into that concept specifically — as deep as the paper supports.",
    cta: 'Next',
    illustration: <DrillIllustration />,
  },
  {
    title: 'Swipe back, like turning a page',
    body:
      'Two-finger swipe right on your trackpad to go back through the lenses you opened. Swipe left to go forward. Works like a browser.',
    cta: 'Next',
    illustration: <SwipeIllustration />,
  },
  {
    title: "That's it",
    body:
      "Every lens persists: close the PDF, reopen it next month, pinch the same paragraph — the thread is still there. Anytime you want this walkthrough again, click the `?` in the top right or Help → Show Tour.",
    cta: 'Start reading',
    illustration: <FinishIllustration />,
  },
];

export default function FirstRunTour({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);

  // Reset to step 0 every time the tour opens.
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  // Keyboard navigation — arrow keys + esc.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        setStep((s) => (s >= STEPS.length - 1 ? (onDone(), s) : s + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onDone]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
          onClick={onDone}
        >
          <motion.div
            key={step}
            initial={{ scale: 0.96, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.22 }}
            className="w-[460px] max-w-[90vw] overflow-hidden rounded-2xl bg-[#faf4e8] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Illustration band */}
            <div className="flex items-center justify-center bg-[#f3ead7] px-8 pt-8 pb-4">
              {current.illustration}
            </div>
            {/* Body */}
            <div className="px-8 pt-6 pb-6">
              <div className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-[#c9832a] uppercase">
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="mb-3 text-[22px] leading-tight font-medium tracking-tight text-[#1a1614]">
                {current.title}
              </h2>
              <p className="mb-6 text-[14.5px] leading-relaxed text-[#2a2420]">
                {current.body}
              </p>

              {/* Progress dots */}
              <div className="mb-5 flex gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= step ? 'bg-[#c9832a]' : 'bg-[#c9832a]/15'
                    }`}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={onDone}
                  className="text-[12px] text-black/40 hover:text-black/65"
                >
                  {isLast ? 'Close' : 'Skip tour'}
                </button>
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      className="rounded-full px-3 py-1.5 text-[12.5px] text-black/55 hover:bg-black/5"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
                    className="rounded-full bg-[#1a1614] px-5 py-2 text-[13px] font-medium text-[#faf4e8] shadow-sm transition hover:bg-[#c9832a]"
                  >
                    {current.cta}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
