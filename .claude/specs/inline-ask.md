---
spec: inline two-finger ask (in-page dive without opening a lens)
owning_team_primary: Team D — Inline Interactions
owning_team_secondary: Team B — Persistence & State
status: open · awaiting build
created: 2026-04-25
pm: pm-interpreter
---

# RESOLVED QUESTIONS (from user, 2026-04-25)

The PM's open questions have been answered by the user verbatim. Recording
the resolutions and the verbatim quote so future re-reads of this spec
can see why the build chose what it chose.

> "As for question one, point A is right; B is wrong because I do not want
>  B for double-click, two-finger double-tap; that is not what I want.
>  In my question, I did not say 'can be big'. The text area should not
>  grow from two lines to eight lines; it is always five words. The
>  focus light should only be five words at a time at maximum. The
>  answer streams inside the Lens. Once I ask a question, then the
>  answer is streaming inside the lens. I don't even care what is
>  happening, but the marker changes its color When the answer has
>  been completed"

## Q1 → resolved (a)

Single two-finger tap is the trigger. Existing macOS contextmenu
gesture. The current `PdfContextMenu` is replaced by the inline Ask
box. **No** literal "double-tap" gesture. **No** competing menu.

## Q2 → CORRECTED — small input, not large

The user explicitly disowned "can also be big" — that was an
artefact of an earlier interpretation, not their words. The input
is **single-line, fits roughly 5 words** (≈ 180–220 px wide),
fixed-size. It does NOT auto-grow. It does NOT become a textarea.

The motivation, inferred and verified against the user's overall
philosophy: a research-paper question is naturally short ("what is
softmax doing here?", "why divide by √dk?"). A small input
*forces* concision, which fits the "minimal cognitive overhead"
brief from `fathom-cog-review.md` §1 (working memory) — the user
should not be drafting a multi-paragraph prompt while reading.

If the user types longer than the visible width, the input scrolls
horizontally inside its box (does not wrap). The exact character
limit is left soft (no enforced limit) but typography signals the
intended size.

## Q3 → resolved (b) — answer streams inside the lens (background)

> "The answer streams inside the Lens. Once I ask a question, then
>  the answer is streaming inside the lens. I don't even care what
>  is happening, but the marker changes its color When the answer
>  has been completed"

So the flow is:

1. Two-finger tap → small "Dive into" input appears at the tap site.
2. User types a short question, presses Enter.
3. The input disappears immediately. A **red marker** drops at the
   tap location.
4. A lens row is created in the DB and the explain stream begins
   IN THE BACKGROUND. The full-screen lens does NOT take over the
   user's view. They keep reading the PDF.
5. When the stream completes, the marker transitions **red → gold**.
6. User clicks the gold marker (later, whenever) → the full lens
   opens with the question + streamed answer ready to read.
7. While streaming, the marker stays red — clicking it during that
   window is a no-op (or shows a small "answering…" hint;
   cognitive reviewer to decide).

This is the strict (b) reading from the original PM spec, with the
nuance that the lens is **created and streamed in the background
without auto-opening its UI**. The user's "I don't even care what
is happening" makes this clear — the lens is a vessel for the
answer, not an interruption to the read flow.

The "Open as lens" affordance previously specced for the inline
bubble is dropped — the lens IS the answer surface; clicking the
marker is the only path to view it.

---

# SPEC: inline two-finger ask — dive in place, mark when done

## QUOTED INSTRUCTION (verbatim, do not paraphrase)

> "whenever I double-click with two fingers on something, we dive into
> it and then we show the text instead. We should make the box bigger
> for the dive into and all this stuff. We should say "Dive into", and
> then it should be a text box for me to type whatever sort of question
> I want. Generally, my question can also be big, and after that we
> just put a marker there. We can click on the marker to explore more
> on that later.
>
> Perhaps initially, when it's answering, we can use a different color
> like red. Once the answer is completed, we put it like a yellow or
> golden marker that we currently have, so that we can distinguish
> that, "Okay, that answer is done." We can go back and review it now.
> That way we don't have to go again into a lens and ask. Right now,
> here itself we can go and ask and know when it's done so that we can
> dive back."

## WHAT MUST BE TRUE TO CALL THIS DONE

### Trigger
- A two-finger tap on a paragraph in the PDF (the existing macOS
  contextmenu gesture, currently handled at PdfViewer.tsx:287)
  opens an **in-page Ask bubble** anchored to that paragraph. It does
  NOT open a full-screen lens. It does NOT open the existing
  `PdfContextMenu` "Dive into …" affordance — that menu is removed in
  the same commit (one gesture, one affordance).
- The Ask bubble appears at the cursor / tap location, anchored to the
  paragraph that was hit-tested under the cursor (same hit-test as
  `findRegionUnderCursor`). If no paragraph was under the cursor, the
  bubble does not appear (silent — no error, no empty bubble — same
  as the cursor-fallthrough rule for ⌘+pinch).

### The Ask bubble (visual + interaction)
- Header strip reads exactly **"Dive into"** (sans, system font, not
  Excalifont — `fathom-communication.md` rule: navigation/labels are
  sans, handwriting is reserved for voice).
- Beneath the header: a **multi-line text input** (textarea, not a
  single-line input). Auto-grows from 2 lines up to 8 lines (~600 px),
  then scrolls inside. Width: `min(480px, column-width − 32px)`.
- Submit affordances: **Enter** submits, **Shift+Enter** inserts a
  newline (matches CLAUDE.md §2.4 keyboard-path rule and the existing
  Ask footer in `FocusView.tsx`). A small "Ask" button sits to the
  right of the textarea as a redundant click target (icon + tooltip,
  per CLAUDE.md §2.4).
- **Esc** closes the bubble *without* sending a question and *without*
  leaving a marker (a bubble that was opened but never asked is not a
  commitment — see §2.3 marker-lifecycle nuance below).
- Click outside the bubble closes it the same way (no commit).
- The bubble is mounted as a **portal-like absolute element pinned to
  the paragraph's PDF coordinates**, so it stays attached when the
  user scrolls. (Pin point: the cursor location at the moment of tap,
  in PDF user-space, so it survives zoom changes — same coordinate
  rule the amber markers already use.)
- The bubble must not push surrounding content; it floats above the
  page like the existing context menu does.

### Marker lifecycle (matches CLAUDE.md §2.3 invariants)
- **No marker is registered until the user submits a question.**
  Opening the bubble alone is not a commitment; this matches the
  existing `useLensStore.open()` rule — except that today,
  `useLensStore.open()` *does* register a marker on the moment of
  zoom (store.ts:213). The inline ask is a *different* gesture
  (typed question, not a pinch); the marker only earns its place
  once a question has been asked. **Rationale**: an opened-then-
  abandoned Ask bubble (user mistapped) should not litter the page
  with markers.
- On submit:
  1. A marker is registered immediately at the bubble's pin point.
  2. The marker renders **red** (specifically: `--color-streaming`,
     a new design token; suggested value `#d4413a`, must pass
     deuteranopia-vs-amber distinguishability — cognitive reviewer
     to confirm).
  3. The Ask bubble morphs into a **streaming Q&A bubble**: the
     question stays at the top, the streamed answer renders beneath
     it (Excalifont body, same renderer as `FocusView`'s answer
     body). User can scroll inside the bubble.
  4. When `endStream` fires for the underlying lens, the marker
     transitions from red → **gold** (`--color-lens` — the existing
     amber, ~1 frame's worth of cross-fade so the change is visible
     but not flashy).
  5. The bubble auto-closes ~2 s after the answer completes (giving
     the user time to read the last line) UNLESS the user is actively
     hovering or scrolling inside it. Auto-close leaves the marker.
- Click on a gold marker (or any non-streaming marker): re-opens the
  bubble in place with the persisted Q&A history. Re-clicking a
  gold marker on the same paragraph that already has one and was
  asked again does NOT make a second marker; instead the bubble
  shows the prior turns and the user can append a follow-up
  (one-marker-per-paragraph rule, see "Edge cases" #3).
- Click on a red (streaming) marker: re-opens the bubble showing the
  in-flight stream — same `streamDelta` subscription as the
  originating bubble.

### Diving from the bubble into a full lens (the upgrade path)
- The bubble has a small **"Open as lens"** affordance (icon button,
  top-right of the bubble) that promotes the in-place ask to a
  full-screen lens at the same anchor, carrying the question and any
  streamed turns over. This is how the user "dive[s] back" later
  for a deeper drill — re-using the existing lens infrastructure
  (`useLensStore.open()` with `origin: 'region'` and the same
  `regionId`).
- ⌘ + pinch on the same paragraph after a marker exists ALSO opens
  the full lens with the bubble's history (same anchor → same
  `lensId`). This preserves the recursion invariant in CLAUDE.md
  §2.1: "the bubble is just a thinner shell over the same lens".

### Persistence (CLAUDE.md §9 invariants — additive only)
- The bubble's question + streamed answer round-trip across sessions.
  Mechanism: **reuse the existing `lens_anchors` + `lens_turns`
  tables**. The bubble *is* a lens conceptually — same `lensId`
  format, same `origin` (`'region'` for a paragraph-anchored ask;
  `'viewport'` falls back if no paragraph hit-tested), same
  `bbox_json`. The only DELTA from the existing schema is a new
  optional column on `lens_anchors`:
  - `display_mode TEXT NOT NULL DEFAULT 'lens'` — values:
    `'lens'` | `'inline'`. Set to `'inline'` for asks that
    originated from the bubble. Used at hydration time to decide
    whether to render the marker only (lens mode) or to remember
    "this anchor was *only* ever asked inline; clicking the marker
    should restore the bubble, not the lens" (inline mode).
  - This is **additive** (CLAUDE.md §9 + Team B brief). Migration:
    `ALTER TABLE lens_anchors ADD COLUMN display_mode TEXT NOT NULL
    DEFAULT 'lens'`.
- No new table for "streaming state" — `lens_turns.body` being empty
  with a row in `lens_anchors` and an in-flight stream handle is
  already the streaming state; it is **derived**, not persisted.
  If the app is killed mid-stream, on reopen the marker is gold
  (because the row exists), the bubble shows whatever streamed text
  reached the DB before kill, and a small "stream interrupted"
  indicator appears. (No retry button in v1 — the user can manually
  ask again.)
- Same lens id for the inline ask and the eventual full lens — so
  promoting from bubble → lens does NOT duplicate a row.

## EDGE CASES THE USER IMPLIED BUT DIDN'T SAY

1. **No paragraph under the tap point** — silent no-op. Don't open
   an empty bubble; don't fall back to viewport-scope (that's the
   ⌘+pinch fallback semantics, which would be confusing for an
   in-page affordance).

2. **Tap inside an open Ask bubble** — does nothing (no nested
   bubble). Tap inside the textarea places the caret normally.

3. **Tap on a paragraph that already has a marker** — the existing
   bubble re-opens (showing prior turns) instead of opening a fresh
   one. This is the "click the marker to explore more later" path
   from the user's quote, fired by the redundant tap-on-paragraph
   gesture instead of click-on-marker. Both should land in the
   same place.

4. **Two simultaneous in-flight streams** (rare: user taps on one
   paragraph, then taps on another before the first finishes) —
   both bubbles stream in parallel. Both markers go red, then
   gold independently. The existing lens explain pipeline
   (`explain.ts`) supports concurrent streams keyed by `lensId`;
   no change needed there.

5. **User starts typing, then closes (Esc / click-away) without
   submitting** — bubble closes, no marker registered, no
   `lens_anchors` row written. The textarea contents are NOT
   restored if the bubble is reopened on the same paragraph (a
   draft restore would be a separate feature; flag it as a future
   nicety in `todo.md` if the user mentions it later). PM: do not
   over-build.

6. **Streaming gets aborted by a new ⌘+pinch elsewhere** — current
   `explain.ts` aborts in-flight streams when a new one starts
   (`currentHandle.abort()` at explain.ts:60). For independent
   inline bubbles this is wrong: they should NOT cancel each other.
   Build must change `currentHandle` to be a `Map<lensId, handle>`
   so per-lens streams are independent. **This is a real cross-
   cutting refactor** the user did not anticipate; flag it in the
   commit and add to `todo.md` if descoped.

7. **Marker placement clash with existing lens markers** — if the
   user previously did a ⌘+pinch on the same paragraph, there's
   already a gold marker for that lens. The inline ask reuses the
   same `regionId`-derived `lensId` (region-origin asks are keyed
   by region id), so the marker is shared — no duplicate dot. Asks
   from both surfaces (lens + inline bubble) accumulate into the
   same `lens_turns` row stack, ordered by `turn_index`. Re-opening
   the lens shows all turns; re-opening the bubble shows all turns.

8. **Bubble overflow at page edges** — clamp like `PdfContextMenu`
   already does (PdfContextMenu.tsx:55–56) so the bubble never
   opens off-screen. If the paragraph is near the right edge, the
   bubble flips to anchor on the left of the cursor.

9. **⌘ + tap or middle-click** — out of scope. Spec covers the
   plain two-finger tap only.

10. **Existing right-click expectation** — power users who learned
    the existing "Dive into …" context menu will lose that path.
    The bubble is the strict superset (it dives in AND lets you
    type a custom question), so the affordance is upgraded, not
    removed. Update `?` help overlay copy and `docs/INSTALL.md`
    accordingly. The fathom-ux-review skill should reject the
    diff if the help overlay isn't updated.

## OWNING TEAMS

- **Team D — Inline Interactions** (primary): the bubble component,
  the marker red↔gold transition, the gesture trigger swap, the
  per-lens stream-handle refactor, the `?` help overlay update.
  Files in scope: `src/renderer/lens/` (new `InlineAskBubble.tsx`,
  edits to `store.ts`, `explain.ts`), `src/renderer/pdf/PdfViewer.tsx`
  (gesture rewire), `src/renderer/pdf/PdfContextMenu.tsx` (deleted
  in this spec — flag in commit).
- **Team B — Persistence & State** (secondary): the additive
  `display_mode` column migration on `lens_anchors`, hydration
  handling on paper open. Files in scope: `src/main/db/schema.ts`,
  `src/main/db/repo.ts` (LensAnchors.upsert + LensAnchors.byPaper),
  `src/main/index.ts` (the IPC payload for `lensAnchors:save` adds
  the `displayMode` field), `src/preload/index.ts` (preload type),
  `src/renderer/lens/store.ts` hydration (paper-open consumer of
  `lensAnchors:byPaper`).
- **Cognitive reviewer** (gating): must approve the red colour
  token (deuteranopia distinguishability vs. amber), the auto-
  close 2 s timing (Doherty 400 ms threshold + reading-rate
  evidence), and the marker-on-submit-not-on-open exception to the
  ⌘+pinch invariant. VETO authority per `.claude/skills/
  fathom-cog-review.md`.

## SEQUENCING

- **Build order**:
  1. Team B ships the schema migration + IPC field FIRST (additive
     migration; no behaviour change yet). Round-trips verified by
     opening an existing paper and confirming all prior anchors
     hydrate with `display_mode = 'lens'`.
  2. Team D builds the bubble + gesture + marker transitions on
     top, consuming the new field.
  3. Cognitive review runs against the integrated diff (not each
     team's slice — the colour + timing decisions only make sense
     in context).
- **Parallelism**: This spec is independent of the multi-worker
  pdf.js rendering work (Task #2) and the spinner work (Task #3).
  All three can ship in parallel. It IS sequenced **after** the
  per-lens stream-handle refactor (edge case 6) — that refactor
  must land first or as the first commit of this spec.
- **No blocker on the focus pacer or any Reading-Aids work.**

## DEFINITION OF DONE

- **Demo to user**: open `samples/attention-is-all-you-need.pdf`,
  two-finger tap on the paragraph below "Scaled Dot-Product
  Attention", type "what is the role of the √dk normaliser?",
  press Enter. Show: red marker appears immediately, the answer
  streams into the bubble in place, marker turns gold when
  finished, bubble auto-closes after ~2 s, marker remains. Click
  the gold marker → same bubble re-opens with the question +
  full answer. Quit Fathom, reopen the same paper → the gold
  marker is still there, click → the same bubble re-opens with
  the persisted Q&A.
- **Reproducible test (harness step that proves it)**: extend
  `.claude/skills/fathom-e2e-test.md` with a new gesture flow:
  *"two-finger tap on a paragraph → type question → press
  Enter → wait for stream done → screenshot the marker (assert
  amber) and the bubble (assert renders question + answer)
  → close → click marker → screenshot (assert bubble re-opens
  with same content) → quit + relaunch → click marker →
  screenshot (assert content survives)"*. Test passes when
  `fathom-qa.md`'s grading rubric scores the screenshots green.
- **Code-level invariants** (cognitive reviewer + PM both
  verify against final diff):
  - One marker render path (lens-origin and inline-ask use the
    same `lens_anchors` row + same `LensMarker` shape).
  - One open path for promoting bubble → lens (same
    `useLensStore.open()`).
  - One persistence schema (additive column only).
  - Hydration round-trip verified by re-launching with an
    existing paper that has both lens-origin and inline-origin
    anchors.

---

## CROSS-REFERENCES TO CLAUDE.md (binding constraints)

- **§2.1 — recursion has one visual grammar**: the inline bubble is
  a thinner shell over the same lens primitive. Same `lens_anchors`
  row, same marker-render path, same upgrade path to a full lens.
  Build must NOT introduce a parallel "inline-only" data structure.
- **§2.3 — markers are the bookmark of the recursion**: the marker
  appears on the paper the moment a commitment is made (here:
  question submission, not bubble open). Persists after close,
  survives quit/relaunch. Click-to-reopen mandatory. Colour change
  red → gold is the new wrinkle this spec adds; cognitive reviewer
  gates the colour choice.
- **§2.4 — typography**: header strip "Dive into" is sans
  (information), answer body is Excalifont (voice). Icon button
  for "Open as lens" carries `title=` and `aria-label`.
- **§9 — persistence model**: additive `display_mode` column on
  `lens_anchors`. No new table. Streaming state is derived from
  row presence + handle, not persisted. Lens id unchanged across
  the bubble → full-lens upgrade so no row duplication.
- **§3 — semantic-zoom gesture**: the rule "Fathom does NOT
  auto-prompt Claude on zoom" still holds — the bubble does not
  send a default prompt. The user types it. Submission is the
  only path that opens a stream.
- **§0 — pre-release QA mandatory**: the fathom-qa.md screenshot
  pass must include a red-marker frame and a gold-marker frame so
  a future regression where the colour transition silently breaks
  is caught at release time, not in production.

---

## CHECKLIST FOR THE PM AT FINAL-DIFF REVIEW

(Per TEAMS.md: PM checks the spec against the final diff before
the orchestrator declares done.)

- [ ] Two-finger tap on paragraph opens the bubble (not the old
      context menu, which is deleted).
- [ ] Bubble header literally reads "Dive into".
- [ ] Textarea is multi-line, auto-grows up to 8 lines, then scrolls.
- [ ] No marker registered until question submitted.
- [ ] Marker is red while streaming, transitions to gold (existing
      `--color-lens`) on `endStream`.
- [ ] Bubble auto-closes ~2 s after stream done, marker remains.
- [ ] Click marker re-opens bubble with prior Q&A.
- [ ] "Open as lens" button promotes to full lens at same anchor;
      lens shows the same Q&A turns.
- [ ] ⌘+pinch on same paragraph after marker exists opens lens
      (not bubble) and shows same Q&A.
- [ ] `lens_anchors.display_mode` migration applied; old papers
      hydrate with `'lens'`.
- [ ] Per-lens stream-handle refactor in `explain.ts` complete
      (independent streams don't cancel each other).
- [ ] `?` help overlay updated with new gesture + new keyboard
      paths.
- [ ] `fathom-e2e-test.md` extended with the new gesture flow.
- [ ] Cognitive reviewer's verdict on red colour + 2 s auto-close
      attached to the commit description.
