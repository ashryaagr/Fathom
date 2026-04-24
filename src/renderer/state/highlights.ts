import { create } from 'zustand';

/**
 * A single highlight mark on a page. `rects` are in PDF user-space
 * (bottom-up y, points). One rect per visual line of the selection —
 * multi-line selections produce multiple rects. `text` is kept so the
 * highlight can survive re-extraction if region ids shift.
 */
export interface Highlight {
  id: string;
  paperHash: string;
  page: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  text?: string;
  color: string;
  createdAt: number;
}

interface HighlightsState {
  /** Flat map of id → highlight. Keeps membership checks O(1) for the
   * UI's "is this rect a highlight?" query. */
  byId: Map<string, Highlight>;
  /** Secondary index: "paperHash:page" → id[]. Lets PageView render its
   * page's highlights without scanning the whole map. */
  byPage: Map<string, string[]>;

  add: (h: Highlight) => void;
  remove: (id: string) => void;
  hydrate: (highlights: Highlight[]) => void;
  /** All highlights for a (paper, page). Returns [] if none. */
  forPage: (paperHash: string, page: number) => Highlight[];
}

export const useHighlightsStore = create<HighlightsState>((set, get) => ({
  byId: new Map(),
  byPage: new Map(),

  add: (h) =>
    set((s) => {
      const byId = new Map(s.byId);
      byId.set(h.id, h);
      const key = `${h.paperHash}:${h.page}`;
      const byPage = new Map(s.byPage);
      const existing = byPage.get(key) ?? [];
      byPage.set(key, [...existing.filter((id) => id !== h.id), h.id]);
      return { byId, byPage };
    }),

  remove: (id) =>
    set((s) => {
      const target = s.byId.get(id);
      if (!target) return s;
      const byId = new Map(s.byId);
      byId.delete(id);
      const byPage = new Map(s.byPage);
      const key = `${target.paperHash}:${target.page}`;
      byPage.set(key, (byPage.get(key) ?? []).filter((hid) => hid !== id));
      return { byId, byPage };
    }),

  hydrate: (highlights) =>
    set(() => {
      const byId = new Map<string, Highlight>();
      const byPage = new Map<string, string[]>();
      for (const h of highlights) {
        byId.set(h.id, h);
        const key = `${h.paperHash}:${h.page}`;
        const existing = byPage.get(key) ?? [];
        byPage.set(key, [...existing, h.id]);
      }
      return { byId, byPage };
    }),

  forPage: (paperHash, page) => {
    const s = get();
    const ids = s.byPage.get(`${paperHash}:${page}`) ?? [];
    return ids
      .map((id) => s.byId.get(id))
      .filter((h): h is Highlight => h !== undefined);
  },
}));
