import { create } from 'zustand';
import type { PDFDocumentProxy } from '../pdf/pdfjs';

export interface OpenDocument {
  name: string;
  path: string;
  /** Absolute path to the per-paper lens folder (<pdfpath>.lens/). */
  indexDir: string;
  contentHash: string;
  doc: PDFDocumentProxy;
  numPages: number;
  /** CSS-pixel scrollY from the last reading session. Consumed once
   * by PdfViewer's scroll-restore effect. (todo #42) */
  initialScrollY?: number;
}

interface DocumentState {
  document: OpenDocument | null;
  zoom: number;
  setDocument: (d: OpenDocument | null) => void;
  setZoom: (z: number) => void;
  multiplyZoom: (factor: number) => void;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

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
