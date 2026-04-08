import { create } from 'zustand';
import type { Region } from '../pdf/extractRegions';

interface RegionsState {
  /** Map: `${paperHash}:${page}` → regions in document order. */
  byPage: Map<string, Region[]>;
  setPage: (paperHash: string, page: number, regions: Region[]) => void;
  getPage: (paperHash: string, page: number) => Region[];
  clear: () => void;
}

export const useRegionsStore = create<RegionsState>((set, get) => ({
  byPage: new Map(),
  setPage: (paperHash, page, regions) =>
    set((s) => {
      const next = new Map(s.byPage);
      next.set(`${paperHash}:${page}`, regions);
      return { byPage: next };
    }),
  getPage: (paperHash, page) => get().byPage.get(`${paperHash}:${page}`) ?? [],
  clear: () => set({ byPage: new Map() }),
}));

/**
 * Find the smallest region containing a point. Coordinates are in PDF user space.
 * Returns null if no region contains the point.
 */
export function hitTest(regions: Region[], x: number, y: number): Region | null {
  let best: Region | null = null;
  let bestArea = Infinity;
  for (const r of regions) {
    if (
      x >= r.bbox.x &&
      x <= r.bbox.x + r.bbox.width &&
      y >= r.bbox.y &&
      y <= r.bbox.y + r.bbox.height
    ) {
      const area = r.bbox.width * r.bbox.height;
      if (area < bestArea) {
        best = r;
        bestArea = area;
      }
    }
  }
  return best;
}
