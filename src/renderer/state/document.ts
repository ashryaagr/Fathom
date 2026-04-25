import { create } from 'zustand';
import type { PdfDocFacade } from '../pdf/multiWorkerDoc';

export interface OpenDocument {
  name: string;
  path: string;
  /** Absolute path to the per-paper lens folder (<pdfpath>.lens/). */
  indexDir: string;
  contentHash: string;
  /** Document facade — single- or multi-worker. Callers only use
   * `numPages` and `getPage(n)`; the multi-worker variant routes
   * the latter across N pdf.js workers for parallel page renders. */
  doc: PdfDocFacade;
  numPages: number;
  /** Reading-position memory v2 (todo #42). All consumed once by
   * PdfViewer's restore effect when the paper opens.
   *   • initialScrollY  — legacy raw scrollY, fallback if v2 fields
   *                       are null
   *   • initialPage     — page number (1-indexed) the user was on
   *   • initialOffset   — fractional offset inside that page (0..1)
   *   • initialZoom     — saved zoom factor; if present, zoom is
   *                       restored BEFORE scroll so the position
   *                       lands on the right page at the right size
   */
  initialScrollY?: number;
  initialPage?: number | null;
  initialOffset?: number | null;
  initialZoom?: number | null;
}

interface DocumentState {
  document: OpenDocument | null;
  zoom: number;
  setDocument: (d: OpenDocument | null) => void;
  setZoom: (z: number) => void;
  multiplyZoom: (factor: number) => void;
}

export const MIN_ZOOM = 0.5;
// User asked to be able to zoom past the previous 400% cap — research
// papers with tiny figure captions and dense math rewards 600–800%
// zoom on a single column. Bumped to 8 (= 800%). Anything higher and
// the canvas pixel buffer at full DPR exceeds Chromium's per-canvas
// memory ceiling on multi-page docs; revisit only if a user reports
// hitting 8.
export const MAX_ZOOM = 8;

export const useDocumentStore = create<DocumentState>((set) => ({
  document: null,
  zoom: 1,
  setDocument: (d) => set({ document: d, zoom: 1 }),
  setZoom: (z) => set({ zoom: clamp(z, MIN_ZOOM, MAX_ZOOM) }),
  multiplyZoom: (factor) =>
    set((s) => ({ zoom: clamp(s.zoom * factor, MIN_ZOOM, MAX_ZOOM) })),
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
