import { create } from 'zustand';

/**
 * In-lens highlights — amber marks the user drops on text inside a lens
 * body. Different from PDF highlights:
 *
 *   - PDF highlights are stored as PDF user-space rects so they survive
 *     zoom changes. Their anchor is geometric.
 *   - Lens highlights are stored as `(lens_id, selectedText)` because
 *     the markdown body re-flows on every render — geometric rects
 *     would be invalidated. Their anchor is textual; we re-find the
 *     text on render and wrap it.
 *
 * One file, one store, one secondary index by lens_id — same shape as
 * useHighlightsStore so the two paths feel symmetric.
 */
export interface LensHighlight {
  id: string;
  lensId: string;
  paperHash: string;
  selectedText: string;
  color: string;
  createdAt: number;
}

interface LensHighlightsState {
  byId: Map<string, LensHighlight>;
  byLens: Map<string, string[]>;

  add: (h: LensHighlight) => void;
  remove: (id: string) => void;
  hydrate: (highlights: LensHighlight[]) => void;
  /** All lens highlights for a given lens. Returns [] if none. */
  forLens: (lensId: string) => LensHighlight[];
}

export const useLensHighlightsStore = create<LensHighlightsState>((set, get) => ({
  byId: new Map(),
  byLens: new Map(),

  add: (h) =>
    set((s) => {
      const byId = new Map(s.byId);
      byId.set(h.id, h);
      const byLens = new Map(s.byLens);
      const existing = byLens.get(h.lensId) ?? [];
      byLens.set(h.lensId, [...existing.filter((id) => id !== h.id), h.id]);
      return { byId, byLens };
    }),

  remove: (id) =>
    set((s) => {
      const target = s.byId.get(id);
      if (!target) return s;
      const byId = new Map(s.byId);
      byId.delete(id);
      const byLens = new Map(s.byLens);
      const list = (byLens.get(target.lensId) ?? []).filter((hid) => hid !== id);
      byLens.set(target.lensId, list);
      return { byId, byLens };
    }),

  hydrate: (highlights) =>
    set(() => {
      const byId = new Map<string, LensHighlight>();
      const byLens = new Map<string, string[]>();
      for (const h of highlights) {
        byId.set(h.id, h);
        const existing = byLens.get(h.lensId) ?? [];
        byLens.set(h.lensId, [...existing, h.id]);
      }
      return { byId, byLens };
    }),

  forLens: (lensId) => {
    const s = get();
    const ids = s.byLens.get(lensId) ?? [];
    return ids
      .map((id) => s.byId.get(id))
      .filter((h): h is LensHighlight => h !== undefined);
  },
}));
