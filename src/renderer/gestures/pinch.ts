/**
 * Detects trackpad pinch gestures via wheel events and disambiguates "visual" vs "semantic" zoom.
 *
 * On macOS, both Chromium and WebKit normalize a trackpad pinch into a stream of
 * `wheel` events with `ctrlKey === true` (synthesized by the OS, regardless of whether
 * the physical Ctrl key is held). The `metaKey` (Cmd) flag is preserved separately and
 * tells us whether the user wanted a semantic zoom.
 *
 * To avoid mid-gesture mode flips if the user presses or releases Cmd partway through a pinch,
 * we latch `metaKey` at the start of a gesture and hold it until the wheel events go quiet.
 */

export interface PinchEvent {
  /** 'in' = zoom in (deltaY < 0), 'out' = zoom out (deltaY > 0). */
  direction: 'in' | 'out';
  /** Cumulative scale delta since the last emitted event of this gesture. */
  scaleDelta: number;
  /** Cursor position at the gesture start (clientX/Y). */
  origin: { x: number; y: number };
  /** Whether Cmd was held at gesture start. */
  semantic: boolean;
}

export interface PinchHandlers {
  onPinch: (e: PinchEvent) => void;
  /** Called when the wheel events go quiet (gesture ended). */
  onPinchEnd?: (semantic: boolean) => void;
}

const QUIET_MS = 140;
const SCALE_SENSITIVITY = 0.012;

export function attachPinchListener(target: HTMLElement, handlers: PinchHandlers): () => void {
  let inGesture = false;
  let semanticLatch = false;
  let originLatch = { x: 0, y: 0 };
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  const handler = (e: WheelEvent) => {
    if (!e.ctrlKey) return; // not a pinch
    e.preventDefault();

    if (!inGesture) {
      inGesture = true;
      semanticLatch = e.metaKey;
      originLatch = { x: e.clientX, y: e.clientY };
    }

    if (endTimer !== null) clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      const wasSemantic = semanticLatch;
      inGesture = false;
      handlers.onPinchEnd?.(wasSemantic);
    }, QUIET_MS);

    handlers.onPinch({
      direction: e.deltaY < 0 ? 'in' : 'out',
      scaleDelta: Math.exp(-e.deltaY * SCALE_SENSITIVITY),
      origin: originLatch,
      semantic: semanticLatch,
    });
  };

  target.addEventListener('wheel', handler, { passive: false });
  return () => {
    target.removeEventListener('wheel', handler);
    if (endTimer !== null) clearTimeout(endTimer);
  };
}
