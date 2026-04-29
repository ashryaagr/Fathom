// Minimal post-pivot store. The pre-pivot store had per-paper Pass 1/2/2.5
// state, scene-stream history, chat threads, expansion sets, hydration
// flags — all of which the new architecture handles inline in the
// fathom-whiteboard <Whiteboard> component. The only external consumer
// of this store now is App.tsx's status-dot indicator next to the
// "Whiteboard" tab. We keep that working with a dot-sized state shape.

import { create } from 'zustand';

type WhiteboardStatus =
  | 'idle'
  | 'consent'
  | 'pass1'
  | 'pass2'
  | 'ready'
  | 'expanding'
  | 'failed';

type PerPaper = {
  status: WhiteboardStatus;
  expandingNodeIds: Set<string>;
};

type WhiteboardStoreState = {
  byPaper: Map<string, PerPaper>;
  setStatus: (paperHash: string, status: WhiteboardStatus) => void;
};

export const useWhiteboardStore = create<WhiteboardStoreState>((set, get) => ({
  byPaper: new Map(),
  setStatus: (paperHash, status) => {
    const next = new Map(get().byPaper);
    const prev = next.get(paperHash);
    next.set(paperHash, {
      status,
      expandingNodeIds: prev?.expandingNodeIds ?? new Set(),
    });
    set({ byPaper: next });
  },
}));
