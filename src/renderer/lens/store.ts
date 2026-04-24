import { create } from 'zustand';

/**
 * One turn in the lens conversation: either the initial zoom-in (question=null) or a
 * follow-up question the user typed in the Ask box. Each turn has its own streaming
 * state and body — history accumulates vertically below the prior turns.
 */
export interface Turn {
  question: string | null;
  body: string;
  /** Free-form log of what Claude is doing in real time — tool invocations and thinking
   * snippets. Shown in a collapsible "Working…" section so perceived latency drops. */
  progress: string;
  /** The full user prompt sent to Claude for this turn — shown in a collapsed debug panel. */
  sentPrompt?: string;
  streaming: boolean;
  error?: string;
}

/**
 * One "focus" is a single passage being read with an AI explanation beside it.
 * Three kinds:
 *   - origin = 'region':   anchored to a single paragraph in the PDF (regionId set)
 *   - origin = 'viewport': anchored to whatever multi-paragraph span was visible in the viewport
 *                          when the user released Cmd
 *   - origin = 'drill':    anchored to a selection inside a previous focus's explanation
 */
export interface FocusedLens {
  id: string;
  origin: 'region' | 'viewport' | 'drill';
  paperHash: string;
  page: number;
  /** PDF user-space bbox of the anchor region (meaningful for 'region' only). */
  bbox: { x: number; y: number; width: number; height: number };
  /** Source rect on screen at the moment of opening (viewport coords). Used for the open animation. */
  sourceRect: { x: number; y: number; width: number; height: number };
  /** The text being focused — paragraph(s), viewport span, or selection. */
  anchorText: string;
  /** Short title — focus phrase for drills, or a viewport label. */
  focusPhrase: string | null;
  /** Up to 3 preceding paragraphs (nearest first), to give surrounding context. */
  prevTexts: string[];
  /** Up to 3 following paragraphs (nearest first). */
  nextTexts: string[];
  /** When origin = 'drill', the parent explanation body that the selection came from. */
  parentBody: string | null;
  /** When origin = 'region', the regionId from the PDF (used for caching and DB). */
  regionId: string | null;
  /** Chronological list of Q&A turns. First turn (question=null) is the initial zoom-in. */
  turns: Turn[];
  /** Thumbnail of what the user was actually looking at when they pinched — figures and all.
   * Shown at the top of the FocusView so the anchor is literally the thing they saw. */
  anchorImage?: { dataUrl: string; width: number; height: number };
  /** Absolute path to the zoom image saved on disk — sent to Claude as ground truth. */
  zoomImagePath?: string;
  /** Claude Agent SDK session id for this lens. Set after the first explain
   * turn reports it back. Subsequent Asks in the same lens pass it as
   * `resumeSessionId` so Claude keeps one continuous conversation. */
  sessionId?: string;
}

/** A marker tied to a particular lens-open. Registered the moment the
 * user zooms, whether or not they ever ask Claude anything. Keyed by
 * `paperHash:page` for cheap per-page lookup from PageView. */
export interface LensMarker {
  lensId: string;
  bbox: { x: number; y: number; width: number; height: number };
  origin: 'region' | 'viewport';
}

interface LensState {
  /** Cache of completed turns (Q&A history) keyed by focus id. Persists across open/close. */
  cache: Map<string, Turn[]>;
  /** Absolute zoom-image path per region id — hydrated from disk on paper reopen so cached
   * markers restore their visual anchor exactly. */
  persistedZoomPaths: Map<string, string>;
  /** Visual zoom-markers — the amber dots that show on the paper
   * after a user closes a lens. Registered on every open (except
   * drills, which live inside the lens, not on the PDF page). A
   * region-origin lens also appears in `cache`; viewport-origin
   * lenses used to be invisible because the marker-render path only
   * matched on `cache.has(region.id)`. Now they appear here. */
  lensMarkers: Map<string, LensMarker[]>;
  /** Currently focused lens (the one shown in FocusView). */
  focused: FocusedLens | null;
  /** Stack of previous focuses — Cmd+pinch-out / two-finger swipe right navigates back. */
  backStack: FocusedLens[];
  /** Stack of focuses we backed away from — two-finger swipe left navigates forward. */
  forwardStack: FocusedLens[];
  /**
   * Direction of the most recent transition. Read by FocusView to decide whether the
   * incoming pane should animate in (open/drill) or appear instantly (back navigation).
   */
  transition: 'open' | 'back' | null;

  setCachedTurns: (id: string, turns: Turn[]) => void;
  setPersistedZoomPath: (regionId: string, path: string) => void;
  open: (lens: FocusedLens) => void;
  drillOn: (args: {
    sourceRect: { x: number; y: number; width: number; height: number };
    selection: string;
  }) => FocusedLens | null;
  back: () => void;
  forward: () => void;
  closeAll: () => void;
  clearTransition: () => void;
  /** Begin a new turn in the currently-focused lens, returning its index in turns[]. */
  beginTurn: (lensId: string, question: string | null) => number;
  /** Append streaming text to the latest turn — accumulates into cache too. */
  streamDelta: (lensId: string, delta: string) => void;
  /** Append to the latest turn's progress log (tool calls, thinking snippets). */
  appendProgress: (lensId: string, text: string) => void;
  /** Set the full prompt that was sent to Claude for the latest turn. */
  setTurnPrompt: (lensId: string, prompt: string) => void;
  /** Remember the SDK session id for this lens so every subsequent Ask in
   * the same lens resumes the same conversation. */
  setSessionId: (lensId: string, sessionId: string) => void;
  endStream: (lensId: string) => void;
  setStreamError: (lensId: string, message: string) => void;
  /** Convenience: start a new turn from a user-typed question. */
  askFollowUp: (question: string) => void;
  /** Register a visible amber dot for the lens on its page. Safe to
   * call repeatedly (de-duplicates by lensId). */
  registerMarker: (
    paperHash: string,
    page: number,
    marker: LensMarker,
  ) => void;
  /** Read-only helper used by PageView to render amber dots. */
  markersForPage: (paperHash: string, page: number) => LensMarker[];
}

export const useLensStore = create<LensState>((set, get) => ({
  cache: new Map(),
  persistedZoomPaths: new Map(),
  lensMarkers: new Map(),
  focused: null,
  backStack: [],
  forwardStack: [],
  transition: null,

  setCachedTurns: (id, turns) =>
    set((s) => {
      const next = new Map(s.cache);
      next.set(id, turns);
      return { cache: next };
    }),

  setPersistedZoomPath: (regionId: string, path: string) =>
    set((s) => {
      const next = new Map(s.persistedZoomPaths);
      next.set(regionId, path);
      return { persistedZoomPaths: next };
    }),

  open: (lens) =>
    set((s) => {
      const cached = s.cache.get(lens.id);
      const turns: Turn[] =
        cached && cached.length > 0
          ? cached.map((t) => ({ ...t, streaming: false }))
          : lens.turns;
      const next: FocusedLens = { ...lens, turns };
      const backStack = s.focused ? [...s.backStack, finalize(s.focused)] : s.backStack;
      const cache = new Map(s.cache);
      if (!cached || cached.length === 0) cache.set(lens.id, turns);
      // Register the marker now — the moment the user dives — so it
      // appears on the paper as soon as they navigate back, regardless
      // of whether they've asked Claude anything. Drills live inside a
      // lens, not on a PDF page, so they don't get a paper-level marker.
      let lensMarkers = s.lensMarkers;
      if (lens.origin !== 'drill') {
        const key = `${lens.paperHash}:${lens.page}`;
        const existing = s.lensMarkers.get(key) ?? [];
        if (!existing.some((m) => m.lensId === lens.id)) {
          lensMarkers = new Map(s.lensMarkers);
          lensMarkers.set(key, [
            ...existing,
            {
              lensId: lens.id,
              bbox: lens.bbox,
              origin: lens.origin === 'viewport' ? 'viewport' : 'region',
            },
          ]);
        }
      }
      // Opening a fresh lens invalidates any forward history — just like a browser.
      return {
        cache,
        focused: next,
        backStack,
        forwardStack: [],
        transition: 'open',
        lensMarkers,
      };
    }),

  drillOn: (args) => {
    const { focused } = get();
    if (!focused) return null;
    const selection = args.selection.trim().slice(0, 1000);
    if (!selection) return null;
    // Parent body for a drill is the RECURSIVE ancestor chain, not just the
    // immediate parent. If the current focused lens is itself a drill, its
    // own parentBody already encodes grandparent context; we append this
    // lens's turns underneath so Claude sees the full lineage:
    //
    //   <root explanation>
    //     → <drill level 1 explanation>
    //       → <drill level 2 explanation>   ← new lens drills from this
    //
    // Gives "recursive context of where its parent was" that the user
    // asked for explicitly.
    const thisLensTurns = focused.turns
      .filter((t) => t.body.length > 0)
      .map((t) => (t.question ? `[Q: ${t.question}]\n${t.body}` : t.body))
      .join('\n\n');
    const parentBody = focused.parentBody
      ? `${focused.parentBody}\n\n--- The reader then zoomed into a phrase inside that explanation, which produced: ---\n\n${thisLensTurns}`
      : thisLensTurns;
    const focusPhrase = shorten(selection, 64);
    const id = drillId(focused.id, selection);
    const newLens: FocusedLens = {
      id,
      origin: 'drill',
      paperHash: focused.paperHash,
      page: focused.page,
      bbox: focused.bbox,
      sourceRect: args.sourceRect,
      anchorText: selection,
      focusPhrase,
      prevTexts: [],
      nextTexts: [],
      parentBody,
      regionId: focused.regionId,
      turns: [], // user-driven chat; empty until they ask
    };
    set((s) => {
      const cached = s.cache.get(id);
      const turns: Turn[] =
        cached && cached.length > 0
          ? cached.map((t) => ({ ...t, streaming: false }))
          : newLens.turns;
      const cache = new Map(s.cache);
      if (!cached || cached.length === 0) cache.set(id, turns);
      return {
        cache,
        focused: { ...newLens, turns },
        backStack: [...s.backStack, finalize(focused)],
        forwardStack: [],
        transition: 'open',
      };
    });
    return newLens;
  },

  back: () =>
    set((s) => {
      const stack = s.backStack;
      const forwardStack: FocusedLens[] = s.focused
        ? [...s.forwardStack, finalize(s.focused)]
        : s.forwardStack;
      if (stack.length === 0) {
        return { focused: null, forwardStack, transition: 'back' };
      }
      const prev = stack[stack.length - 1];
      return {
        focused: prev,
        backStack: stack.slice(0, -1),
        forwardStack,
        transition: 'back',
      };
    }),

  forward: () =>
    set((s) => {
      const stack = s.forwardStack;
      if (stack.length === 0) return s;
      const next = stack[stack.length - 1];
      const backStack: FocusedLens[] = s.focused
        ? [...s.backStack, finalize(s.focused)]
        : s.backStack;
      return {
        focused: next,
        backStack,
        forwardStack: stack.slice(0, -1),
        transition: 'open',
      };
    }),

  closeAll: () =>
    set({ focused: null, backStack: [], forwardStack: [], transition: 'back' }),

  clearTransition: () => set({ transition: null }),

  beginTurn: (lensId, question) => {
    let index = 0;
    set((s) => {
      const cacheTurns = s.cache.get(lensId) ?? [];
      const newTurn: Turn = { question, body: '', progress: '', streaming: true };
      const nextTurns = [...cacheTurns, newTurn];
      index = nextTurns.length - 1;
      const cache = new Map(s.cache);
      cache.set(lensId, nextTurns);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: nextTurns }
          : s.focused;
      return { cache, focused };
    });
    return index;
  },

  streamDelta: (lensId, delta) =>
    set((s) => {
      const prev = s.cache.get(lensId) ?? [
        { question: null, body: '', progress: '', streaming: true },
      ];
      if (prev.length === 0) {
        prev.push({ question: null, body: '', progress: '', streaming: true });
      }
      const last = prev[prev.length - 1];
      const updatedLast = { ...last, body: last.body + delta, streaming: true };
      const nextTurns = [...prev.slice(0, -1), updatedLast];
      const cache = new Map(s.cache);
      cache.set(lensId, nextTurns);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: nextTurns }
          : s.focused;
      return { cache, focused };
    }),

  setTurnPrompt: (lensId: string, prompt: string) =>
    set((s) => {
      const prev = s.cache.get(lensId) ?? [];
      if (prev.length === 0) return s;
      const updated = [...prev.slice(0, -1), { ...prev[prev.length - 1], sentPrompt: prompt }];
      const cache = new Map(s.cache);
      cache.set(lensId, updated);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: updated }
          : s.focused;
      return { cache, focused };
    }),

  setSessionId: (lensId: string, sessionId: string) =>
    set((s) => {
      // Only stamp the sessionId on a lens that's currently focused — once a
      // lens is closed and lives in a stack, its session is settled and a
      // late-arriving sessionId event shouldn't mutate it. Silently no-ops
      // when the focused lens has drifted (user moved on before sid arrived).
      if (!s.focused || s.focused.id !== lensId) return s;
      if (s.focused.sessionId === sessionId) return s;
      return { focused: { ...s.focused, sessionId } };
    }),

  appendProgress: (lensId: string, text: string) =>
    set((s) => {
      const prev = s.cache.get(lensId) ?? [
        { question: null, body: '', progress: '', streaming: true },
      ];
      if (prev.length === 0) {
        prev.push({ question: null, body: '', progress: '', streaming: true });
      }
      const last = prev[prev.length - 1];
      const updatedLast = { ...last, progress: last.progress + text };
      const nextTurns = [...prev.slice(0, -1), updatedLast];
      const cache = new Map(s.cache);
      cache.set(lensId, nextTurns);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: nextTurns }
          : s.focused;
      return { cache, focused };
    }),

  endStream: (lensId) =>
    set((s) => {
      const prev = s.cache.get(lensId);
      if (!prev || prev.length === 0) return s;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false };
      const cache = new Map(s.cache);
      cache.set(lensId, updated);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: updated }
          : s.focused;
      return { cache, focused };
    }),

  setStreamError: (lensId, message) =>
    set((s) => {
      const prev = s.cache.get(lensId) ?? [];
      const updated: Turn[] =
        prev.length === 0
          ? [{ question: null, body: '', progress: '', streaming: false, error: message }]
          : [
              ...prev.slice(0, -1),
              { ...prev[prev.length - 1], streaming: false, error: message },
            ];
      const cache = new Map(s.cache);
      cache.set(lensId, updated);
      const focused: FocusedLens | null =
        s.focused && s.focused.id === lensId
          ? { ...s.focused, turns: updated }
          : s.focused;
      return { cache, focused };
    }),

  askFollowUp: (question) => {
    const { focused } = get();
    if (!focused) return;
    const q = question.trim();
    if (!q) return;
    get().beginTurn(focused.id, q);
  },

  registerMarker: (paperHash, page, marker) =>
    set((s) => {
      const key = `${paperHash}:${page}`;
      const existing = s.lensMarkers.get(key) ?? [];
      if (existing.some((m) => m.lensId === marker.lensId)) return s;
      const lensMarkers = new Map(s.lensMarkers);
      lensMarkers.set(key, [...existing, marker]);
      return { lensMarkers };
    }),

  markersForPage: (paperHash, page) => {
    const s = get();
    return s.lensMarkers.get(`${paperHash}:${page}`) ?? [];
  },
}));

function finalize(lens: FocusedLens): FocusedLens {
  return {
    ...lens,
    turns: lens.turns.map((t) => ({ ...t, streaming: false })),
  };
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

// Kept for compatibility with call sites that haven't migrated to `Turn` yet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _unusedShorten(...args: Parameters<typeof shorten>) {
  return shorten(...args);
}

function drillId(parentId: string, selection: string): string {
  // djb2 over normalized selection — stable, no async needed.
  const normalized = selection.replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  return `${parentId}>${(h >>> 0).toString(16).padStart(8, '0')}`;
}
