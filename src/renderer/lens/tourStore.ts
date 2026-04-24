import { create } from 'zustand';

/**
 * A tiny state machine for the interactive walkthrough.
 *
 * The flow is: welcome dialog dismisses → `start()` → step === 'pinch' with a
 * floating hint shown. The app's existing event paths (lens-opened,
 * ask-submitted, drill, swipe) call `advance(next)` when the user does the
 * thing the hint asked for. After the final step lands, we write the
 * persisted `tourCompletedAt` flag and let the hint fade.
 *
 * The store is deliberately tiny so any component (App, PdfViewer,
 * FocusView) can call `.advance` or read `.step` without touching an
 * out-of-band DOM event bus.
 */

export type TourStep = 'idle' | 'pinch' | 'ask' | 'drill' | 'swipe' | 'celebrated';

interface TourState {
  step: TourStep;
  active: boolean;
  start: () => void;
  advance: (to: TourStep) => void;
  skip: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  step: 'idle',
  active: false,
  start: () => {
    if (get().active) return;
    set({ step: 'pinch', active: true });
  },
  advance: (to) => {
    const { active, step: current } = get();
    if (!active) return;
    // Ignore out-of-order events (e.g. a swipe while we're still on 'pinch').
    const order: TourStep[] = ['idle', 'pinch', 'ask', 'drill', 'swipe', 'celebrated'];
    if (order.indexOf(to) <= order.indexOf(current)) return;
    set({ step: to });
    if (to === 'celebrated') {
      void window.lens.markTourDone();
      // Give the user a beat to read the "done" hint before fading out.
      setTimeout(() => set({ active: false, step: 'idle' }), 3500);
    }
  },
  skip: () => {
    set({ step: 'idle', active: false });
    void window.lens.markTourDone();
  },
}));
