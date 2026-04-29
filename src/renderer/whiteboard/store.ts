// Minimal post-pivot store. The pre-pivot store had per-paper agent
// state, scene-stream history, chat threads, expansion sets, hydration
// flags — all of which the new architecture handles inline in the
// fathom-whiteboard <Whiteboard> component. The only external consumer
// of this store now is App.tsx's status-dot indicator next to the
// "Whiteboard" tab. We keep that working with a dot-sized state shape.

import { create } from 'zustand';

// 'pass2' is the in-flight wire value the SQLite Whiteboards row
// stores while the agent is generating. 'consent' / 'pass1' /
// 'expanding' are kept in the union only for compatibility with rows
// written by the pre-pivot pipeline — the new code only ever emits
// 'idle' | 'pass2' | 'ready' | 'failed'.
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
  // Vestigial. Pre-pivot tracked per-node L2 zoom expansions here;
  // there's no L2 in the post-pivot one-canvas architecture. Kept as
  // an always-empty Set so App.tsx's existing
  // `expandingNodeIds.size ?? 0` selector compiles without churn.
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
