import { useLensStore, type FocusedLens, type Turn } from './store';
import { useRegionsStore } from '../state/regions';
import { useDocumentStore } from '../state/document';

// Per-lens in-flight stream handles. Independent lenses (e.g. inline
// asks against different paragraphs) must NOT cancel each other —
// only a re-stream of the SAME lensId aborts the prior one. Pre-
// inline-ask, this was a single global `currentHandle`, which meant
// two background asks running in parallel would silently kill each
// other.
const handlesByLens = new Map<string, { abort: () => void; turnIndex: number }>();

const DRILL_SYSTEM_PROMPT = `You are explaining a concept that appeared in a research paper, to a curious reader who has highlighted that concept in a clarification they were already reading.

Your job:
- Treat this as a "dive into the topic": teach the concept itself, with whatever world knowledge is needed.
- Anchor the explanation in why this concept matters for the paper passage that introduced it.
- Be concrete: definitions, the key idea, a worked example or analogy when helpful.
- Be tight: 2–4 short paragraphs or a focused list. Don't over-pad.
- Begin directly with substance — no "Here's an explanation…" preamble.
- If the selection is just a citation or a bare reference, say so in one sentence.`;

const PASSAGE_SYSTEM_PROMPT = `You are explaining a passage from a research paper to a curious reader who is reading it in a PDF viewer and got stuck on this specific passage.

Your job:
- Make the passage clearer, with concrete examples and plain language.
- Preserve technical accuracy — do not invent claims the source does not support.
- If you reference math, define every symbol.
- If a term has a precise meaning in the field, briefly define it.
- Keep it tight: 2–4 short paragraphs or a focused list.
- Begin directly with substance — no "Here is an explanation…" preamble.
- Do not echo the original passage. The reader can already see it.`;

/**
 * Stream an explanation for the currently-focused lens, picking the right prompt
 * based on whether the focus is on a passage or a drilled selection.
 */
export async function streamExplanationForFocused(
  paperText: string | undefined,
): Promise<void> {
  const focused = useLensStore.getState().focused;
  if (!focused) return;
  await streamExplanationForLens(focused, paperText);
}

/**
 * Stream an explanation against any lens — focused or not. Used by the
 * inline two-finger-ask flow which dispatches a stream for a lens that
 * the user has NOT entered (no full-screen lens taking over). The
 * stream pipeline writes through the same store actions
 * (`streamDelta`, `endStream`, …) which already update the cache by
 * lensId, so the result is visible in the lens whenever the user
 * later opens it.
 */
export async function streamExplanationForLens(
  focused: FocusedLens,
  paperText: string | undefined,
): Promise<void> {
  // If the last turn is already finished and non-empty, nothing to do.
  const lastTurn = focused.turns[focused.turns.length - 1];
  if (lastTurn && !lastTurn.streaming && lastTurn.body.length > 0 && !lastTurn.error) return;

  const isDrill = focused.origin === 'drill';
  const question = lastTurn?.question ?? null;

  // For drills, send the parent explanation as context so Claude knows what
  // surrounding sentence the user was reading when they selected the phrase.
  const userPrompt = isDrill
    ? buildDrillPrompt(focused, paperText)
    : buildPassagePrompt(focused, paperText);

  const docState = useDocumentStore.getState().document;
  // PDF is now accessed via the lens folder's images/ and content.md, not directly.
  // Only fall back to the raw PDF path when explicitly needed.
  const pdfPath = undefined;
  void docState;

  const targetId = focused.id;
  const turnIndex = focused.turns.length - 1;

  // Abort only a prior in-flight stream FOR THIS SAME LENS — other
  // lenses' streams (e.g. background inline asks on different
  // paragraphs) keep going.
  const existing = handlesByLens.get(targetId);
  if (existing) {
    console.log('[Lens] aborting in-flight stream', targetId);
    try {
      existing.abort();
    } catch {
      /* ignore */
    }
    handlesByLens.delete(targetId);
  }
  console.log('[Lens] streamExplanationForFocused begin', {
    lensId: targetId,
    turnIndex,
    origin: focused.origin,
    hasZoomImage: !!focused.zoomImagePath,
    page: focused.page,
    question,
  });

  // Build the chain of prior turns as context so Claude knows the conversation history.
  const priorTurns = focused.turns.slice(0, turnIndex).filter((t) => t.body.length > 0);

  // Populate a preview of the prompt immediately so the "prompt sent to Claude" panel
  // shows something the instant the user pinches — before the IPC round-trip completes.
  // Main process will overwrite with the final built prompt via onPromptSent.
  const previewPrompt = buildPromptPreview({
    anchorText: userPrompt.regionText,
    page: focused.page,
    question: question ?? null,
    zoomImagePath: focused.zoomImagePath,
    priorTurns: priorTurns.length,
    origin: focused.origin,
  });
  useLensStore.getState().setTurnPrompt(targetId, previewPrompt);
  const priorExplanations = [
    ...(userPrompt.priorExplanations ?? []),
    ...priorTurns.map<{ depth: number; body: string; focusPhrase: string | null }>((t, i) => ({
      depth: i,
      body: t.question ? `[user asked: "${t.question}"]\n${t.body}` : t.body,
      focusPhrase: t.question ?? null,
    })),
  ];

  // If this lens already has a session id from a prior turn, resume it so
  // Claude treats the entire lens as one conversation. First turn has no
  // sessionId yet; we pick one up from the onSessionId callback below.
  const resumeSessionId = focused.sessionId;

  // Always send `priorExplanations`. When the resume succeeds the main
  // process drops them before calling the SDK (the session already
  // carries the history). When the resume fails — e.g. the SDK's local
  // session store was pruned — main retries with a fresh session and
  // replays them so the user doesn't see "No conversation found".
  const priorExplanationsForRequest = priorExplanations;

  // The SDK reports session_id in its 'init' event before persisting
  // the .jsonl transcript. We hold the id here until onDone fires so
  // an aborted/errored stream doesn't stamp an unresumable id onto the
  // lens.
  let provisionalSessionId: string | null = null;

  try {
    const handle = await window.lens.explain(
      {
        paperHash: focused.paperHash,
        regionId: focused.regionId ?? undefined,
        regionText: userPrompt.regionText,
        focusPhrase: focused.focusPhrase ?? undefined,
        paperText: pdfPath ? undefined : userPrompt.paperText,
        priorExplanations: priorExplanationsForRequest,
        depth: 1,
        customInstruction: question ?? undefined,
        pdfPath,
        page: focused.page,
        zoomImagePath: focused.zoomImagePath,
        regionBbox:
          focused.bbox.width > 0 && focused.bbox.height > 0 ? focused.bbox : undefined,
        resumeSessionId,
        // Lens-keyed persistence: every lens has a stable lens id
        // (focused.id) regardless of origin. Sending it here lets
        // main write into `lens_turns`, which is the table that
        // actually round-trips across sessions for viewport- and
        // drill-origin lenses (see schema.ts and CLAUDE.md §9).
        lensId: targetId,
        turnIndex,
      },
      {
        onDelta: (delta) => {
          const state = useLensStore.getState();
          const prev = state.cache.get(targetId);
          const prevLen = prev?.[prev.length - 1]?.body.length ?? 0;
          if (prevLen === 0) console.log('[Lens] first delta for', targetId);
          state.streamDelta(targetId, delta);
        },
        onProgress: (text) => {
          console.log('[Lens] progress', targetId, text.trim().slice(0, 80));
          useLensStore.getState().appendProgress(targetId, text);
        },
        onPromptSent: (prompt) => {
          console.log('[Lens] prompt sent to Claude', targetId, '(chars:', prompt.length, ')');
          useLensStore.getState().setTurnPrompt(targetId, prompt);
        },
        onSessionId: (sessionId) => {
          // The SDK announces session_id in its first 'init' event, before any
          // text streams. But the per-session .jsonl transcript is only
          // written on stream COMPLETION — if the user aborts mid-stream
          // (closes the lens, hits Esc, regenerates) the file never lands,
          // and a future Ask resuming that id throws "No conversation found".
          // So we just stash the id locally; the onDone handler below
          // promotes it into the store once the SDK has actually persisted.
          console.log('[Lens] session id (provisional) for', targetId, '=', sessionId, resumeSessionId ? '(resumed)' : '(new)');
          provisionalSessionId = sessionId;
        },
        onDone: () => {
          console.log('[Lens] stream done', targetId);
          if (provisionalSessionId) {
            // Stream completed cleanly — the SDK has flushed the session
            // transcript to disk, so this id is safe for a follow-up Ask
            // to resume. Promote from provisional to durable.
            useLensStore.getState().setSessionId(targetId, provisionalSessionId);
          }
          useLensStore.getState().endStream(targetId);
          handlesByLens.delete(targetId);
        },
        onError: (msg) => {
          console.error('[Lens] stream error', targetId, msg);
          // Intentionally do NOT promote provisionalSessionId on error —
          // a failed/aborted run leaves no .jsonl on disk, so a stamped
          // id would just produce "No conversation found" next time.
          useLensStore.getState().setStreamError(targetId, msg);
          handlesByLens.delete(targetId);
        },
      },
    );
    handlesByLens.set(targetId, { abort: handle.abort, turnIndex });
  } catch (e) {
    useLensStore.getState().setStreamError(targetId, e instanceof Error ? e.message : String(e));
  }
  void DRILL_SYSTEM_PROMPT; // System prompt selection currently lives in main; see ai/client.ts.
  void PASSAGE_SYSTEM_PROMPT;
}

function buildPassagePrompt(focused: FocusedLens, paperText: string | undefined) {
  return {
    regionText: focused.anchorText,
    paperText,
    priorExplanations: undefined,
  };
}

function buildDrillPrompt(focused: FocusedLens, paperText: string | undefined) {
  // focused.parentBody already encodes the full ancestor chain (root
  // explanation → drill 1 → drill 2 → …) built by drillOn(). Flatten it
  // into one block Claude sees up front so the new explanation is
  // anchored not just in the paper, but in the reader's own trail of
  // clarifications that got them here.
  const priorExplanations: Array<{ depth: number; body: string; focusPhrase: string | null }> =
    focused.parentBody
      ? [
          {
            depth: 0,
            body:
              `Here is the chain of clarifications the reader has followed ` +
              `to arrive at this drill. Treat this as context — do not ` +
              `repeat any of it; extend it by explaining the selected ` +
              `phrase in depth.\n\n${focused.parentBody}`,
            focusPhrase: null,
          },
        ]
      : [];
  return {
    regionText: focused.anchorText,
    paperText,
    priorExplanations,
  };
}

function buildPromptPreview(args: {
  anchorText: string;
  page: number;
  question: string | null;
  zoomImagePath: string | undefined;
  priorTurns: number;
  origin: string;
}): string {
  const parts = [
    `[preview — what the renderer is about to send]`,
    `origin: ${args.origin}`,
    `page: ${args.page}`,
    args.question ? `question: ${args.question}` : 'question: (initial zoom, no user question)',
    args.zoomImagePath ? `zoomImagePath: ${args.zoomImagePath}` : '(no zoom image yet)',
    `priorTurns: ${args.priorTurns}`,
    '',
    '<passage>',
    args.anchorText,
    '</passage>',
  ];
  return parts.join('\n');
}

// Add a new turn and let the FocusView's turn-length effect trigger the stream — calling
// streamExplanationForFocused here too would double-fire (the effect re-runs because
// turns.length changed). The store's askFollowUp adds a streaming empty turn.
export function askFollowUpAndStream(question: string): void {
  const state = useLensStore.getState();
  if (!state.focused) return;
  state.askFollowUp(question);
}

export type { Turn };

/**
 * Stitch the paper's full plain text from cached regions for grounding.
 */
export function paperTextFromRegions(paperHash: string): string {
  const all = useRegionsStore.getState().byPage;
  const pages: number[] = [];
  for (const key of all.keys()) {
    if (key.startsWith(`${paperHash}:`)) {
      const p = Number(key.slice(paperHash.length + 1));
      if (Number.isFinite(p)) pages.push(p);
    }
  }
  pages.sort((a, b) => a - b);
  const parts: string[] = [];
  for (const p of pages) {
    const regions = all.get(`${paperHash}:${p}`) ?? [];
    parts.push(`--- Page ${p} ---`);
    for (const r of regions) parts.push(r.text);
  }
  return parts.join('\n\n');
}
