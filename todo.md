# Fathom — user-instruction backlog

Every item below is an instruction the user gave that I acknowledged but
deferred in favor of shipping something else. In order received. Executed
top-to-bottom until the list is empty.

## 1. Micro-affordance animations — ✅ DONE (commit below)
- Browser-style arrow animation on two-finger swipe back/forward.
  - Swipe right (back) → arrow sweeps left-to-right pointing ← at left edge.
  - Swipe left (forward) → mirror.
- Visual zoom-commit flash when ⌘ is released and a lens actually opens.
- Subtle on-screen cue when ⌘ is held to arm semantic mode (beyond the
  existing armed-ring).
- Hint when Esc is pressed inside a lens (Esc intentionally doesn't close
  anymore; show the user what DOES close).

## 2. Visual-only coach redesign — ✅ DONE
The current CoachHint is text-heavy. User's explicit principle: *"no one
reads words to learn how to set up."*
- Replace each step's headline+body with a pictogram + one short label.
- Gate each step on the user actually doing it in a marked practice
  section, not just on a global event.
- Skip-with-confirmation: first skip press shows a warning that Fathom has
  controls that aren't discoverable by word; second press confirms.

## 3. Streaming-narrative coach copy — ✅ DONE
Inside a lens, while Claude is streaming, the coach should update to
"Claude is reading the paper for you. Ask any follow-up in the box below
any time." — narrative, not instructional.

## 4. Better sample PDF — ✅ DONE
Current sample is a hand-written 2-pager. User asked for a real short
workshop paper with figures (real research-looking content). Find a
redistributable short paper or generate a richer synthetic one with
SVG-rendered figures.

## 5. Mid-stream drill safety — ✅ DONE
When a lens is streaming, selecting text and ⌘-pinching sometimes doesn't
drill (selection cleared by DOM re-render, or Range disconnected). Guard
`getBoundingClientRect()` on the snapshot; fall back to a viewport-center
rect; log why the capture failed when it does.

## 6. Recursive drill context — ✅ DONE
When drilling, pass not just the parent body but the full parent chain
(parent's parent, etc.) as context so Claude can trace the lineage
of what the reader is diving into.

## 7. UpdateToast renderer UI — ✅ DONE
Auto-updater runs silently today. Add the promised toast that says
"Version X is ready — Restart to install" with a button, so the user
can trigger `quitAndInstall` proactively instead of waiting for the next
quit.

## 8. Suppress visual zoom during ⌘+pinch — ⛔ REVERTED (was wrong — visual zoom during ⌘+pinch is what lets the user aim at the target before committing. Restored to the original behaviour.)
Currently the page still visually zooms while ⌘ is held — contributes to
the mixed-gesture confusion. Semantic mode should NOT visually zoom;
reserve visual zoom for plain pinch only. (Direction-accumulation fix
already landed; this is the second half.)

## 9. Marker reliability after Back-button close — ✅ DONE (code audit: back/closeAll never touch cache; z-index/position fix from commit 2a22d4e addresses the display side)
Verify the amber marker actually appears next to the paragraph after the
user closes the lens via the Back button (not just after a swipe). Log
the cache-population path if any miss.

## 10. Intel DMG
One config flag. Ship `dist:mac-intel` alongside arm64 if the demand
warrants.

## 11. Apple Developer signing (blocked on user)
Not actionable until user enrolls in the Developer Program + provides
Developer ID cert + app-specific password. When those land: flip
`mac.identity`, enable `hardenedRuntime`, add notarize config, add CI
env-vars.

## Re-audit (from user re-asking what else I skipped)

- [x] **Highlighter tool** — ✅ DONE.
      - Schema: additive `highlights` table (id, paper_hash, page,
        rects_json, text, color, created_at) with paper-page index.
      - Repo: `Highlights.insert / byPaper / delete`.
      - IPC: `highlights:save`, `highlights:delete`; `paper:state` now
        returns `highlights` alongside regions/explanations.
      - Renderer: `useHighlightsStore` (id map + paper-page secondary
        index) and `HighlightLayer.tsx` rendering amber rects under the
        text layer via `mix-blend-mode: multiply`.
      - Entry points: ⌘H keyboard shortcut OR marker icon in the header.
        Both invoke `createHighlightFromSelection` which converts DOM
        client rects to PDF user-space, buckets by page, writes through
        to SQLite, and clears the selection as visual confirmation.
      - Click a highlight → confirm → delete.
      - Hydrated on PDF open; rects in PDF user-space so they survive
        zoom changes and re-opens.
      - v1 is amber-only; palette TBD in a follow-up.

- [x] **Visible drop zone in the empty state** — ✅ DONE in the same commit
      as this todo edit. Dashed-border centered drop target, brightens on
      drag-over, plus "Or pick from a folder" button at the bottom.

## 12. Auto-update rearchitected around install.sh — ✅ DONE
Ad-hoc signing can't satisfy Squirrel.Mac's code-requirement matching.
Rather than translate the error, we replaced Squirrel entirely: the
same `install.sh` that powers the terminal first-install also powers
in-app updates. One script, one code path, works indefinitely with
ad-hoc signing, no Apple Developer fee. See `docs/DISTRIBUTION.md`.

## 13. Agent harness (CLAUDE.md + skills) — ✅ DONE
- `CLAUDE.md` committed to the repo (removed from `.gitignore`); section
  §0 encodes the working rules (every instruction executed, deferred
  ones to todo.md, end-to-end verify shipping paths, agent harness as
  first-class artifact, UX-review on controls change).
- `.claude/skills/` has three skills:
  - `fathom-e2e-test.md` — keyboard-gesture-driven E2E test loop.
  - `fathom-release.md` — build → sign → publish → verify 1→N+1 update.
  - `fathom-ux-review.md` — design-pattern checklist for controls changes.
- No coding-specific agents.

## 14. UX design-pattern review agent — ✅ DONE
Shipped as `fathom-ux-review.md` skill. Lists 10 checks covering gesture
direction, no-op feedback suppression, platform conventions, affordance
visibility, copy, agent-testability.

## 15. Swipe-vs-pan distinction — ✅ DONE
Swipe handler now early-returns when there's no lens focused and no
history — horizontal wheels become normal PDF scrolls. Chevron only
fires when action has effect. Horizontal-dominance filter bumped from
×1.4 to ×1.6 to reject near-diagonal pinches that leaked through.

## 16. Local CLAUDE.md discipline rule — ✅ DONE
Added §0 to the project CLAUDE.md with the user-instruction-discipline
rule plus end-to-end-verify, agent-harness, and UX-review rules.

## 17. First-paint PDF render speed — ✅ DONE
- `rootMargin` bumped 600px → 2000px (~3 viewports of prefetch).
- Added `renderedZoomRef` guard so scrolling in/out of viewport at the
  same zoom no longer tears the canvas back to "Rendering…"; only zoom
  changes trigger re-render.

## 18. Two-install-path distribution — ✅ DONE
DMG + `curl | bash` both supported. Both produce the same `Fathom.app`.
Updates funnel through the in-app updater that spawns install.sh
internally. Documented in `README.md`, `docs/INSTALL.md`, and
`docs/DISTRIBUTION.md`.

## 19. Handwritten font across docs — ✅ DONE
Expanded Excalifont from hero-only to the body + all headings on the
docs site. Nav, tables, code, footer stay sans-serif for scan-ability
(handwriting in those hurts more than it helps).


## 21. Comprehensive data-model audit — ✅ DONE across v1.0.12 / .14 / .15
The user's "anchor image disappears" report opened a wider audit:
- v1.0.12: `lens_anchors` table records every lens-open by lens_id
  (regardless of origin), with bbox + zoom_image_path. Anchor
  images now survive close-and-reopen even on never-asked lenses.
- v1.0.14: `lens_turns` table records the streamed answer body
  keyed by lens_id (not region_id) — closes the gap where viewport-
  origin and drill-origin lens turns were silently dropped because
  the legacy `explanations` table is region-keyed.
- v1.0.15: `lens_highlights` table for in-lens highlights, anchored
  by lens_id + selectedText (re-found on render, since the
  markdown body re-flows).

The data model is now lens-id-keyed for everything that's lens-
specific, and region-id-keyed only for genuinely region-bound
data (regions, explanations). No more ad-hoc spreads.

## 22. Animated thinking indicator inside the lens — ✅ DONE in v1.0.12
ThinkingIndicator component (FocusView.tsx) renders three
pulsing dots plus cycling phrasing ("reading the paper",
"looking at figures", "checking citations", "pulling the right
context", "thinking it through") that rotate every ~2 seconds.
Visible the moment a turn starts streaming with empty body.

## 23. Phase 3 — inline drill markers — ✅ DONE in v1.0.15
The Phase 2 implementation (chip row at top of body) was a
placeholder violating CLAUDE.md §2.1 ("right next to the paragraph,
column-aware"). v1.0.15 ships the inline replacement: a DOM-walking
useLayoutEffect inside `MarkdownBody` walks text nodes and wraps
each previously-drilled phrase with an amber-underlined span + a
small sticker dot. Click the span → re-opens the cached child
lens via the same `useLensStore.open()` path the PDF-page markers
use (one open path, one render path, no special-casing per depth).
The chip-row `DrillMarkers` component was deleted; only `injectInline\
DrillMarkers` remains.

**Why this took four releases**: the chip row got accepted as a
visible affordance in v1.0.11 and there was no harness rule
preventing other feature work from queuing on top. Fixed in
`fathom-ux-review.md` §11 — placeholder UI for a CLAUDE.md
principle is now SHIP-BLOCKING until resolved.

## 24. Phase 4 — highlights inside the lens body — ✅ DONE in v1.0.15
v1.0.15 ships the in-lens highlighter:
- Schema: new `lens_highlights` table keyed on `lens_id` + selectedText
  (paired with paper_hash for paper-scope hydration).
- Repo: `LensHighlights.insert / delete / byPaper`.
- IPC: `lensHighlights:save`, `lensHighlights:delete`; `paper:state`
  now returns `lensHighlights` alongside the existing arrays.
- Renderer: lens body container carries `data-lens-id={focused.id}`;
  `createHighlightFromSelection` walks up from the selection's
  startContainer for that attribute and branches into the in-lens
  path when found. PDF rect math is skipped — lens bodies re-flow,
  so highlights re-anchor by text on each render.
- A `useLensHighlightsStore` mirrors the PDF-page store (byId / byLens
  secondary index). MarkdownBody runs `injectInlineLensHighlights`
  after each non-streaming render to wrap each persisted selectedText.
- Click an in-lens highlight to remove (same as PDF-page UX).

## 25. Zoom-out "sweep-over" artifact — ✅ DONE
User: "When I zoom out, some other pages don't become small
instantly. It almost gives a background sweep-over effect where
I'm scrolling over other background pages; my top layer is
moving behind the pages."

Root cause: the v1.0.12 partial fix wrote `canvas.style.width/height`
synchronously on zoom change — which forced the browser to
bilinear-resample the canvas's OLD large pixel buffer into the
NEW smaller CSS box every paint frame until the async pdf.js
re-render landed. That resample isn't subpixel-stable, so the
canvas appeared to drift over the underlying slot for several
frames — the "sweep-over" feel. A secondary contributor was
`applyAnchoredZoom` reading `scroller.scrollLeft` inside the
rAF callback, which on zoom-OUT sees a post-clamp value and
corrupts the cursor-anchored math.

Fix shipped in v1.0.13:
- `PageView.useLayoutEffect` no longer touches canvas CSS w/h
  during the gap. Instead it applies a compositor transform
  `scale(zoom / renderedZoom)` to both the canvas and the text
  layer, with `transform-origin: top left`. Compositor-only,
  GPU-accelerated, no paint invalidation — the canvas stays
  crisp and visually locked to the slot throughout the pinch.
  When the pdf.js render completes it sets the new CSS box +
  intrinsic pixel buffer + clears the transform all at once,
  so the snap from scaled → identity is atomic.
- `applyAnchoredZoom` captures pre-zoom scroll and computes the
  absolute target rather than reading post-zoom scroll inside
  the rAF.

See commit in the v1.0.13 release notes.

## 26. Initial render + scroll-to-new-page slow — 🔄 PARTIAL (rootMargin bumped in v1.0.15; worker pool deferred)
Pages take a noticeable beat to render on first load and when
scrolling to a not-yet-rendered page. We're already prefetching
2000 px ahead (commit from #17) but it's not enough.

Diagnosis path:
- Use the renderer log to time each page's render-task duration.
- Check if pdf.js is using a worker at all (it should — there's
  `pdf.worker.min.mjs` in the bundle). If not, every render
  blocks the main thread.
- If it IS in a worker, only one render runs at a time (single
  worker). Multiple cores aren't used.

Possible fixes:
- **Spawn N worker pools** for concurrent page renders. pdfjs-
  dist exposes `GlobalWorkerOptions` and we can instantiate
  multiple workers manually if needed. Even N=2 cuts initial
  multi-page render time roughly in half on the dev machine.
- Increase `rootMargin` further (4000–6000 px) — cheap, just
  makes prefetch more aggressive.
- **Reuse rendered canvases** across zoom changes: keep the
  previous canvas as a CSS-scaled fallback while the new one
  draws. Eliminates the "Rendering…" placeholder during scroll.

Schedule: v1.0.12.

## 42. Reopen PDF at last reading position — 🔄 PENDING
User: *"when we re-open a PDF, we should open it right from the
point where we were last time, not from the very top."*
Plan: persist scroll-y per paperHash (already keyed in SQLite).
On paper open, after pages mount, scroll to saved position.
Tied to #43 below.

## 43. Recent PDFs on the welcome screen — 🔄 PENDING
User: *"on the initial screen we can also give the option to the
users to load the previous PDFs that they were viewing, very much
similar to how cursor or VS Code gives the options for the previous
projects they had loaded."*
Plan: track most-recent N papers (paperHash → path → title), show
a list in EmptyState below the existing Try-sample / Open-yours
cards. Click to reopen at the saved scroll position (#42).

## 44. Multi-worker pdf.js rendering — 🔄 IN PROGRESS (se-1-rendering)
User: *"start working on the multi-threadable strategy so that
the rendering becomes faster."*
Plan: open the PDF N times with N PDFWorker instances; route
getPage(n) by `n % N` so up to N pages render in parallel. Memory
cost = N× page-cache; acceptable for typical research papers.
Default N=3.

Implementation sketch:
- New `src/renderer/pdf/multiWorkerDoc.ts`: `MultiWorkerDoc` class
  holding N `PDFDocumentProxy` instances; `getPage(n)` routes by
  `(n-1) % N`. Implements a tiny `PdfDocFacade` interface
  (`numPages`, `getPage`, `destroy`) that's the only surface the
  renderer code uses.
- `OpenDocument.doc` typed as the facade so callers don't change
  shape.
- `App.tsx` openPdf builds the facade behind a `MULTI_WORKER_RENDER`
  constant (N=3 when on, falls back to single-worker path when off).
- `PageView.tsx`: wrap the `page.render()` call in performance.now()
  and emit one `[render p=N t=Xms zoom=Z]` line per finished render
  via `window.lens.logDev` so before/after timing lands in
  fathom.log without DevTools.

## 45. Replace "Rendering…" text with a small spinner — 🔄 PENDING
User: *"if the rendering does take time, we can show more than
the word 'rendering', and let's not show the word 'rendering' at
all. Perhaps just a small cycle that says that it is loading is
better."*
PageView's slot placeholder currently shows the literal string
"Rendering…". Replace with a small CSS-spun ring or progress
dot, no text.

## 46. Minor principle: visual > text for transient UI — 🔄 PENDING
User: *"sometimes just text visual effects are better. And maybe
that is one of the principles to put one of the minority
principles, not the major."*
Add a "Minor principles" section to CLAUDE.md (distinct from
major design principles). First entry: prefer brief visual
indicators (spinners, pulses, glyphs) over short status text
("Rendering…", "Loading", "Working") for transient UI states —
text adds visual weight and reading load that the eye doesn't
need for a state that resolves in milliseconds.

## 53. SSH-based remote grounding + experiment execution — 🔄 PENDING (LOW PRIORITY)
User 2026-04-25 (in same conversation as `.claude/specs/github-repo-grounding.md`): *"ideally I would also want to be able to use SSH so that I can configure this to work with my desktop. It can run grep and all those commands simply by SSH, so whatever code, etc., it needs, it can connect there and maybe even run experiments while I'm inside the paper. It can answer my questions, run experiments, and everything... But for now, I feel like running experiments is just secondary; I can put that in a future plan somewhere in any document, low priority for me."*

Two scope expansions deferred from the GitHub-repo-grounding v1 spec:

1. **SSH-based remote grounding.** Instead of cloning a repo locally, configure Fathom to SSH into a desktop / dev machine and run Read / Grep / Glob there over an SSH tunnel. Useful when the user's actual code + data lives on a workstation they never want to copy to the laptop they're reading on. Implementation sketch: new IPC + `ssh` shell-out with key-based auth; the Claude Code tool calls (`Bash`, `Read`, `Grep`) get a "remote-prefix" mode that wraps each call in `ssh user@host -- <cmd>`. Risks: latency on every grep, key management, partial-failure UX (what if SSH drops mid-explain?).
2. **Run experiments / execute commands in the cloned repo.** Currently the grounding directory is read-only (Claude Read/Grep/Glob it). Allowing `Bash` execution against a cloned repo turns Fathom into a research notebook: "run the training script with these hyperparameters and tell me the result while I keep reading." Risks: arbitrary code execution, sandboxing, credential leakage, long-running processes. Needs a careful permission model — explicit per-repo opt-in, sandbox boundary, output-truncation, kill-switch.

Pick this up after the v1 GitHub-repo-grounding spec ships and we have data on whether the user actually uses local clones often enough to justify the SSH/exec complexity.

## 51. Harness coverage for the inline two-finger ask — 🔄 PENDING
The inline-ask flow is the only user-facing feature whose
release-time validation is currently MANUAL (see
`.claude/skills/fathom-e2e-test.md` "Inline two-finger ask"
section). To make it fully agent-driven we need three new
`scripts/fathom-test.sh` subcommands:

- `inline-ask <question>` — synthesize a `contextmenu` event at
  the centre of the current viewport (or coords passed as 2nd
  arg), wait for the bubble, type the question, press Enter.
  Likely path: register a global ⌘⇧Fn shortcut in the main
  process that opens the bubble at the viewport centre — same
  pattern as the existing `dive` / `ask` aliases.
- `click-marker [n]` — click the n-th rendered lens marker on
  the visible page. Same pattern as `click <label>` but targets
  by data-attribute instead of accessibility label.
- `quit` — clean ⌘Q on Fathom (we currently rely on `pkill -x
  Fathom` in `launch`, which is destructive enough to mask save-
  on-quit bugs).

Per CLAUDE.md §0 ("Agent harness is a first-class artefact"),
this is a release-readiness gap, not a nice-to-have. Until it
lands, the QA flow falls back to manual validation of the inline
red→amber transition and the persistence round-trip.

## 52. Easy WPM calibration for the focus pacer — 🔄 PENDING
User 2026-04-25: *"We also need to think about that we might not
always get the right speed for the user. There is going to be
experimentation involved, and the experimentation or determination
of users' reading speed should be easy. Not that it is something
you have to do for now, but maybe in the future."*

Today the user has to drag a 10–150 WPM slider in Preferences and
re-test by reading. Friction is high enough that they probably
never tune it after first install — and a wrong WPM is the single
biggest reason the pacer feels broken (too slow → user thinks the
gate is stuck; too fast → user falls behind and disables it).

Approaches worth prototyping when this comes up:

1. **Inline calibration mode.** A one-shot "calibrate" button in
   the Focus Light preferences that opens a known-length passage
   (or uses the current visible passage), starts a timer, asks the
   user to read at their natural pace, and computes WPM = words
   / elapsed-seconds × 60. Two-tap setup, no slider math.

2. **Adaptive WPM from observed behaviour.** While the pacer is
   running, watch for user override signals — manual click-ahead
   of the band ("too slow, I'm faster than this") or click-back
   ("too fast, I missed that"). Each override nudges WPM by ±5–10
   with a short cool-down so the pacer settles toward the user's
   real speed without thrashing.

3. **Header-bar +/− nudge buttons.** Two tiny "felt too slow /
   too fast" controls next to the Focus toggle. Each click bumps
   WPM by ±10. No need to open Preferences.

4. **Per-paper WPM memory.** Reading speed varies by density (a
   methods section is slower than a related-work section). Store
   per-paper WPM on top of the global default; user nudges only
   change the per-paper value.

Pick #1 + #3 together as the v1: explicit calibration ONCE per
install, plus quick header nudges for in-the-moment tuning. #2 is
the elegant ML-flavoured answer but risks feeling like the pacer
is "fighting" the user; defer until #1 and #3 ship and we have
data on whether they're enough. #4 is mostly free if #2 ships.

Cross-references: `.claude/skills/fathom-cog-review.md` §1
(working memory — calibration shouldn't ask the user to remember
their own reading rate), §3 (Doherty's threshold — calibration
must complete in <400 ms perceived latency once the user signals
"done").

## 41. Focus Light + research-backed reading aids — ✅ DONE (Focus Light, opt-in beta) / 🔄 the rest tracked here

User asked for the Focus Light feature *and* a wider brainstorm
of "scientific approaches to helping me read faster." Quick
research summary first (to ground future work in this area),
then the spec for what shipped.

### Reading-aid research summary

- **Visual pacers / reading rulers** — moving the eye with a
  finger, pen, cursor, or horizontal band. Long literature
  going back to Carver's reading-rate work; Schneps et al.
  (2013) showed measurable gains for dyslexic readers using
  small-text presentations and line-trackers. Fits Fathom's
  trackpad-driven UX cleanly. **This is what the Focus Light
  implements.**
- **Bionic Reading** (bolding word prefixes). Mixed evidence —
  some studies find no comprehension or speed gain; others
  report subjective focus improvement. Low cost to ship as an
  opt-in toggle if there's demand.
- **Density gradient / typography contrast** — colouring
  paragraphs by jargon density so the reader can route attention
  to the heaviest passages. Speculative — would need cognitive-
  load proxies (math symbol density, term-novelty score).
- **Vocabulary preload / glossary panel** — surface unfamiliar
  terms before the user hits them. The paper digest already
  extracts a glossary; we could expose it as a hover panel.
- **Active reading affordances** (highlighting, asking,
  annotating). Strong evidence from cognitive science. Fathom
  already does this via the lens (semantic zoom = active asking)
  and the highlighter. The Focus Light complements rather than
  replaces.
- **Reading-position memory across sessions** — small but real
  win. We persist lens markers but not "where the user last
  scrolled to." Easy follow-up.
- **Read-aloud / TTS for the focused line** — macOS has built-in
  TTS; could speak the band's current sentence on a key combo.
- **Eye-rest reminders (20-20-20 rule)** — every 20 min, prompt
  to look 20 ft away for 20 s. Cheap to add; opt-in.
- **Skim mode** — render the paper at a high zoom with topic
  sentences emphasized so the user can scan structure. Different
  surface area; defer.
- **Spaced repetition for highlighted phrases** — terms the user
  highlights become a flashcard set. Out of scope of "reader",
  more of a "learner" feature.

### Focus Light spec — what shipped

Beta opt-in only. Two layers of activation:

1. **Preferences → Beta features → "Focus Light".** Off by
   default. When checked, the header gets a button.
2. **Header → "Focus Light" button.** Click to toggle the band
   on/off for the current session. Off by default at launch
   even when the beta is enabled — so the user opts in
   deliberately each session.

Behaviour while on:

- **Manual placement** (per the user's refined spec): nothing
  happens until the user clicks a paragraph. Clicking on text
  anchors the band to that paragraph's column.
- **Column-aware**: the band's WIDTH = the clicked region's
  bbox width. Two-column papers get a per-column band; one-
  column papers get a wide band. Clicking a different column
  re-anchors and resizes.
- **Figure-aware**: when the cursor moves over a region that
  isn't the anchored region (a figure, the other column, a
  caption), the band stays put — we just don't update its Y.
  No flinging across figures.
- **Vertical tracking inside the column**: cursor Y inside the
  anchored region → band Y follows. Clamped to the region's
  bbox so the band can't escape the paragraph.
- **Two-finger gestures don't move the band**. A wheel event
  (scroll or pinch) suspends mouse-tracking for 200 ms — that's
  the tail-window of trackpad wheel events, beyond which it's
  safe to assume the user is back to one-finger pointing.
- **Click outside any text region** clears the anchor.
- **Visuals**: yellow band (rgba(255,232,100,0.55)) with
  `mix-blend-mode: multiply` so it darkens text rather than
  washing it out; soft glow shadow; rounded corners; eased
  transitions on top/left/width so re-anchoring feels natural.
- **Pointer-events: none** — the band never intercepts clicks,
  so highlight-selecting and marker-clicks underneath still
  work.
- **z-index 35** — above the PDF (z-10) and armed-overlay
  (z-20), below the lens overlay (z-30) … wait no, must be
  above the lens too — but currently set to 35, which is above
  z-30. Lens shows over the focus light when both are open;
  closing the lens reveals the band again. Acceptable.

Files added/changed:
- `src/renderer/pdf/FocusLight.tsx` — new component, ~190 lines
  including the design-rule comments.
- `src/renderer/lens/SettingsPanel.tsx` — new "Beta features"
  section with the toggle.
- `src/renderer/App.tsx` — header button (only when beta is
  enabled), state, settings load + reload-on-save.
- `src/main/index.ts` + `src/preload/index.ts` — the new
  `focusLightBetaEnabled` settings field.

### Follow-ups (open)

- **Per-line snapping** — instead of band Y = cursor Y, snap
  the band to actual text-line baselines via the text layer.
  More precise; defer.
- **Bionic Reading** — opt-in toggle; defer until/if asked.
- **Reading-position memory** across sessions — easy win, defer.
- **TTS for the band's current sentence** — defer.
- **20-20-20 eye-rest reminders** — defer.

## 27. Pluggable AI backend — ⛔ DROPPED
User asked why we even need this. Reasoned: the product is
Claude-shaped (filesystem-as-index needs Read/Grep/Glob; prompt
caching is the cost story; session-resume is the lens-as-one-
conversation model; system prompts are tuned to Claude's style).
Pluggable would be either a half-measure or a major dilution.
Removed from scope. README's "Powered by Claude" stands.

## 28. QA agent should not steal cursor / Space focus — ✅ DONE in v1.0.13
User: "When the QA agent is working on my system, it directly pulls
me back to the screen where it's working. It should isolate itself
there. If I want to work on a different screen, I should not be
pulled to that screen."

Root: `osascript -e 'tell application "Fathom" to activate'` calls
in `scripts/fathom-test.sh` (legacy `shot`, plus the global-shortcut
sender path) bring Fathom to the foreground / pull you back to its
Space. The user's mental model is that the QA agent should drive
Fathom *as if* it were on a separate machine — no cursor effects on
their actual workspace.

Real constraint: macOS routes synthetic key events to the FRONT
process, period. There's only one "active" app per Space. The QA
agent's keystroke for ⌘⇧F9 (open sample) and ⌘⇧F10 (capture) only
reaches Fathom's `globalShortcut` handler if the OS routes the
keypress globally (which it does for `globalShortcut.register`,
regardless of frontmost). So the keystrokes themselves are *fine*
— they don't need Fathom in front. The issue is `tell app to
activate` calls that DO yank focus.

Fixes available without leaving the user's machine:
1. **Drop every `activate` call from the harness.** The global
   shortcuts work without it; the only reason `activate` was added
   was to make the legacy `screencapture -x` path work. Now that
   `capture` uses offscreen `webContents.capturePage`, it's
   unnecessary.
2. **Run Fathom in a hidden Space.** macOS supports invisible
   Spaces via `Mission Control` configuration; Fathom can be
   pinned to one Space and never pulled forward. Requires user
   setup — document in fathom-qa.md as a setup step.
3. **Spawn a separate Fathom instance for QA.** Two Fathom
   processes, same userData (need separate sidecar dirs), one in
   the user's foreground, one in a hidden state for the QA agent
   to drive. Possible via Electron's `--user-data-dir` flag.

Quick win: scrub all `activate` calls from `scripts/fathom-test.sh`.
That alone should stop the focus-steal for the post-v1.0.7 test
runs that use `capture` / `sample`. Schedule v1.0.13.

## 29. lens_turns persistence — ✅ DONE in v1.0.14
QA agent reported a 5071-char streamed answer that completed
successfully in the renderer but never appeared in the
`explanations` table. Root cause was structural: the schema
enforces `region_id NOT NULL` with a regions FK, and
`main/index.ts` gates persistence on `if (req.regionId)`. Every
viewport-origin and drill-origin lens — both of which carry
`regionId = null` — silently dropped its answer.

Fix shipped in v1.0.14:
- New `lens_turns` table keyed on `(lens_id, turn_index)` with
  ON CONFLICT replace, joined to `lens_anchors` for paper-scope
  lookup.
- `LensTurns.upsert` / `byPaper` repo.
- `ExplainRequest` extended with `lensId` + `turnIndex`; the
  renderer's `streamExplanationForFocused` already had both as
  locals so the wire-up is one line.
- Main writes to BOTH tables on stream complete: the legacy
  `explanations` row when `regionId` is set (back-compat for
  existing region-keyed cache hydration and cached-region
  marker clicks), AND a `lens_turns` row whenever `lensId` is
  set (the universal path).
- `App.tsx` hydrates the cache from `state.lensTurns` after
  the existing region-keyed pass, so viewport- and drill-
  origin lenses now round-trip across sessions.

Note: the fallback paths in `PdfViewer.tsx:426,501` still use
`Date.now()` in the lens id, so a "captured nothing"-fallback
viewport lens will write a row that orphans on next session.
The common path (`captureViewportContent` returning a real
result) uses `djb2(captured.map(r=>r.id).join('|'))` which IS
stable, so the typical user case round-trips. Stabilising the
fallback id is a follow-up; tracked as a future cleanup.

## 31. Open With → Fathom — ✅ DONE in v1.0.15
Plist had `CFBundleTypeExtensions=[pdf]` but no `LSItemContentTypes`.
Modern macOS (Mojave+) routes "Open With" via UTI (`com.adobe.pdf`),
and the legacy extension list isn't always honored — especially
after a DMG drag-drop or install.sh install where LaunchServices
doesn't get a fresh registration pass. `electron-builder.config.cjs`
now patches the plist via PlistBuddy in `afterSign` (before the
codesign call) to add `LSItemContentTypes`.

Race side: preload's `onOpenExternal` registered its
`ipcRenderer.on` listener inside the function body, so messages
fired before React mounted reached preload but never reached the
renderer's handler. Added a module-level early listener that
buffers paths until the real handler attaches; on attach, drains
via `queueMicrotask`.

## 32. Swipe-left back-gesture — ✅ DONE in v1.0.15
User reported swipe-left didn't fire. Two bugs:

1. **Quiet-gap reset was too aggressive**: the original handler
   reset the accumulator on any individual mostly-vertical event
   (`if (horiz < 0.5) reset`), which killed slow swipes whose
   per-event delta was small even when cumulative motion was
   clearly horizontal. Now resets only after 250 ms of *no*
   horizontal motion.

2. **Threshold too high for natural flicks**: 120 px required
   sustained motion. Lowered to 80 px.

Plus instrumentation: every commit/reject decision now logs to
`fathom.log` via `window.lens.logDev` so future "swipe didn't fire"
reports are triageable from logs alone — no DevTools required at
the moment of frustration. Skill rule §12 codifies this for all
gesture classifiers going forward.

## 34. Universal control panel — ✅ DONE in v1.0.16
The header (Ask, Highlight, Preferences, Help, Open) was at default
z so the lens overlay (z-30) covered it completely once a lens
opened. Header is now `z-[50]` with `bg-[var(--color-paper)]/95
backdrop-blur`, and the lens is `top-12` so the header stays
visually above. Same controls clickable from the PDF, from a lens,
and from a deep drill — only the *target* changes.

The Ask button is now context-aware: dispatches `fathom:askInLens`
when a lens is focused (FocusView listens and focuses the
InstructionInput's input), `fathom:askCurrentViewport` otherwise
(PdfViewer listens and dives into the viewport). Highlight and
Preferences already worked at every depth after v1.0.15.

## 38. Multi-PDF support (multiple windows) — ✅ DONE
Shipped: registry helpers (`activeWindow`, `safeSendActive`,
`safeBroadcast`, `createWindow(initialPath?)`); Open With spawns
a new window per file; `Cmd+N` opens a fresh window;
globalShortcuts target the focused window; auto-updater inits
once and broadcasts to all windows; Help → Check for Updates
dialog anchors to the active window.

Per-window Zustand store isolation works automatically since
Electron gives each BrowserWindow its own renderer process.

Defer (later): browser-style tabs inside a single window, a
custom Window menu listing open papers by title.

## 40. README — link to the docs site — ✅ DONE in this commit
The README's nav line linked to individual docs pages (`./docs/INSTALL.md`,
`./docs/PRINCIPLES.md`) but never to the rendered docs site at
`https://ashryaagr.github.io/Fathom/` (built from `/docs` on `main`
via GitHub Pages). Added it as the first link in the nav row so
the docs-site landing is the primary discovery path.

## 39. Font strategy in lens responses — ✅ DONE in this commit
User instruction: *"change our font strategy when we are
responding to a question, instead of using all handwritten font.
Only for an overview of the answer, we use the handwritten font.
[…] for the first paragraph that summarizes the answer, or
perhaps towards the end, we have a handwritten component so that
it is basically like a person telling the answer. The rest is
more context elaborated upon […] We can have regular font […]
just not handwritten, because too much of handwritten font can
be unreadable."*

Implementation:
- Removed the blanket `fontFamily: var(--font-handwritten)` from
  the lens body wrapper in `FocusView.tsx`.
- Added a `lens-prose` class to MarkdownBody's container.
- New CSS rules in `index.css` target the FIRST direct paragraph
  (and any leading h1/h2/h3) in handwritten Excalifont — that's
  the overview voice. Subsequent paragraphs, lists, tables, code
  blocks render in the system sans stack for scan-readability.
- Blockquotes also render in handwritten — Claude can use
  blockquotes as a closing-thought container if it wants to give
  the answer a personal-voice ending.
- Diagrams (inline SVG via `language-svg` code blocks) remain
  unchanged.

Why first-of-type only: the user's heuristic — "first paragraph
that summarizes the answer" — is a pure structural rule; we don't
need Claude to mark anything specially. Rendering the first
paragraph in handwritten gives every answer a consistent voiced
opener regardless of how Claude structured the rest.

## 37. Two-finger swipe back/forward — ⛔ DISABLED in v1.0.18 (beta)
User pulled the gesture into beta pending UX refinement: *"these
gestures need more work because it's not intuitive right now how
you switch across screens by using the two-finger gestures."*

The wheel handler in `App.tsx` is gated behind a single
`SWIPE_GESTURE_ENABLED = false` flag at the top of its useEffect;
the rest of the classifier is preserved unchanged so the re-enable
is one line. Pinch (visual) and ⌘+pinch (semantic dive) are
unaffected — those are the product.

Replacement navigation paths (all already wired):
- **⌘[ / ⌘]** — back / forward through lens history
- **Back arrow** in the lens header (top-left)
- **Click an amber marker** on the PDF page — re-opens the lens
- **Click an inline drill marker** in a lens body — re-opens the
  child lens
- **Esc** — does NOT close (per CLAUDE.md); the lens header's
  back button is the canonical close path

User-visible copy updated:
- Help (`?`) overlay no longer shows "Swipe right (two-finger)"
- Lens header subtitle now reads "⌘ pinch · ⌘[ back" (was "⌘
  pinch · swipe back")
- Lens header back-button title now "Close lens (⌘[)" (was
  "Close lens (swipe right or ⌘[)")
- First-run tour copy updated: "Hit ⌘[ or click the back arrow"
- Coach hint step 4 label changed from "Swipe to return" to
  "Step back" with minimal hint "⌘[ or the back arrow up top"
- Tour 'swipe' step now advances on ⌘[ keypress *or* back-button
  click — both paths handled.

When we revisit the gesture: design a single direction
convention up front (per `fathom-ux-review.md` §13 — user mental
model wins), build a discoverable affordance, run the canonical
fathom-qa flow, then flip the flag.

## 36. Viewport-origin lenses didn't persist their figure — ✅ DONE in v1.0.17
QA agent caught a real gap that v1.0.16 missed: the viewport-origin
fresh ⌘+pinch path in `PdfViewer.tsx` opened the lens without
ever calling `saveZoomImageSync`. So `zoomImagePath` was undefined,
the `lens_anchors` row stored `zoom_image_path: null`, and reopen
fell through to the magnifying-glass placeholder regardless of
the v1.0.16 hydration fix — there was nothing to load.

Now both viewport-fallback paths (the page-level fallback at the
old line 425 and the common viewport open at the old line 443)
await `saveZoomImageSync(paperHash, lensId, dataUrl)` and pass
the path into `lensStore.open`. The captured viewport's lens id
is deterministic (`vp:${paperHash}:${page}:${djb2(regionIds)}`)
so the file lands at the same path on every reopen of the same
viewport.

Also added `.claude/skills/fathom-qa.md` Step 8 — a mandatory
anchor-image-survival check that runs on every release. The user
flagged this regression class as "getting wrong frequently"; the
check is now a permanent ship-blocker.

## 35. Anchor image lost on reopen — ✅ DONE in v1.0.16
User report: first zoom shows the figure; close + reopen via
marker shows the magnifying-glass placeholder. Two bugs:

1. **persistedZoomPaths was hydration-only.** The map was
   populated only on paper-open hydration; in-session lens close +
   reopen had an empty map, so `openCached` couldn't find the
   zoom path and rendered the placeholder. `store.open()` now
   writes to the map immediately when a lens opens with a
   `zoomImagePath`.

2. **Hydration skipped viewport-origin lenses.** App.tsx had
   `if (a.zoom_image_path && a.region_id)` — the `&& region_id`
   silently filtered out every viewport- and drill-origin row.
   Now keys by `lens_id` (which equals `region.id` for region-
   origin and a synthetic id otherwise) so all origins
   round-trip equally.

Plus: viewport markers had no click handler (purely decorative).
Now they're clickable buttons that call `openCachedViewport`,
which reuses `persistedZoomPaths.get(lens.id)` to restore the
saved figure. PageView's reopen paths log to fathom.log via
logDev when the path lookup misses or when readAssetAsDataUrl
throws — future "image disappeared" reports diagnosable from
logs alone (per skill rule §12).

## 33. Harness retrospective — ✅ DONE in v1.0.15
User asked: "Where exactly did our hardening break?" The diagnosis:

- Phase 2 chip-row markers shipped in v1.0.11 as a placeholder for
  CLAUDE.md §2.1's "next to the paragraph, column-aware" rule.
  todo.md #23 logged Phase 3 as PENDING.
- Four releases passed (.12 / .13 / .14) without delivering Phase 3.
  The harness had no rule preventing other feature work from
  queuing on top.

Fix in `.claude/skills/fathom-ux-review.md`:
- §11 ("Principle gate"): placeholder UI acknowledged as violating
  a CLAUDE.md principle is SHIP-BLOCKING until resolved. New
  feature work cannot ship while a principle-violation entry sits
  in todo.md.
- §12 ("Gesture instrumentation must reach fathom.log, not just
  DevTools"): every gesture classifier must `logDev` its commit/
  reject decisions unconditionally so a user-reported gesture
  bug can be triaged from logs alone.
- §13 ("Selector convention vs user mental model"): when a
  gesture's direction is ambiguous between macOS browser
  convention and the user's mental model, the user wins.

## 30. Harness capture path mismatch — ✅ DONE in v1.0.14
`scripts/fathom-test.sh` polls `/tmp/fathom-shots/` but
main/index.ts wrote to `os.tmpdir() + 'fathom-shots'`, which
on macOS is `/var/folders/.../T/fathom-shots`. The harness
silently never saw new captures.

Both write sites in `main/index.ts` now hard-code `/tmp/
fathom-shots/`. Rationale: these are debug screenshots only
used by the QA harness; `/tmp` is a predictable shared path
that the bash harness can poll without inheriting the app's
environment. World-writable on macOS, no PII concern.

## 54. Whiteboard Diagrams — side chat / patch loop — 🔄 DEFERRED FROM v1
The v1 build (slice "b" — Level 1 + Level 2 only) intentionally
omits the right-rail side chat. Spec
(`.claude/specs/whiteboard-diagrams.md` §"Side chat (unchanged
from v1 design)") describes it: 320 px collapsible right rail,
4 controls (Hick's Law), patch-mode by default with typed ops
(`add_node`, `relabel`, `split_node`, `merge_nodes`,
`add_edge`, `change_kind`), regenerate-mode escape when the
user explicitly asks for "from scratch" or the change touches
>40% of nodes. Per-frame scoping (Level 1 of paper vs Level 2
of Encoder = separate threads).

Current "regenerate" path: user clicks "Try again" on a failed
run → `whiteboardGenerate` re-runs Pass 1 + Pass 2 from scratch
and replaces the saved understanding doc + scene. Per-node
patches are not yet wired.

Pick this up after dogfooding the diagram pipeline on real
papers. Open question: does the side chat materially change
the user's mental model of "the whiteboard is generated, now I
read it" vs "the whiteboard is editable, now I'm in a tool"?
Cog-review when we get there.

## 55. Whiteboard Diagrams — Level 3 (algorithm napkin cards) — 🔄 DEFERRED FROM v1
Spec (`whiteboard-diagrams-research-visual-abstraction.md` §3)
calls for Level 3 = annotated pseudocode card / flowchart /
state diagram per algorithm shape, with a hand-drawn rectangle
+ 5–8 lines of monospaced-but-Excalifont-styled text + one
inline mini-diagram on the right. Three templates picked by
what the algorithm IS (sequential / branching / state).

Deferred because the v1 slice is Level 1 + Level 2 to validate
the recursion grammar before adding the third surface. Level
3's UI mode is meaningfully different (napkin card, not
hierarchical zoom) so it's better isolated.

Pick this up after the v1 whiteboard is shipping reliably and
we have signal on whether users want to drill from Level 2
into algorithm interiors at all. Today their fallback is
⌘+pinch on the underlying PDF passage to open a Fathom lens
on the algorithm — which already does most of what Level 3
would.

## 56. Whiteboard Diagrams — Sonnet-Lite cost-tier toggle — 🔄 DEFERRED FROM v1
Spec §"Cost-tier option (cog reviewer non-blocking note)" calls
for a one-tap "Lite (~$0.50, Sonnet only)" alternative next to
the Generate button if dogfood acceptance drops below ~60% on
the default $1.50 Opus-priced version (Johnson & Goldstein
2003 — defaults stick).

Implementer reserved the schema (`whiteboardSonnetLite` in
settings) so the toggle lands additively when we wire it.
Actual Sonnet-only Pass 1 path is not implemented; today
flipping the boolean is a no-op.

Pick this up after observing first-paper acceptance rates in
dogfood. Per the spec: "instrument first, build later" — don't
pre-build the Lite path when the cost story may not need it.

## 57. Whiteboard Diagrams — chunked Pass 1 for >80k token papers — 🔄 DEFERRED FROM v1
Spec §"Pass 1" notes: "for longer papers/surveys: chunk by
section using `digest.json`, run Pass 1 per super-section,
merge in a thin synthesis step." V1 ships the single-call path
because most research papers fit comfortably in Opus 4.7's 1M
context. Survey papers (>80k tokens) and book chapters are
known long-tail; today they may produce a degraded
understanding doc as Opus's long-context attention degrades
past the RULER benchmark's 80k threshold.

Pick this up the first time a user reports a degraded
understanding doc on a long paper. The chunking surface is
the digest.json's section index — same plumbing the lens
uses for figure references, no new index work needed.

## 58. Fix preload type for whiteboardWriteRenderPng + whiteboardCritique — RESPECCED 2026-04-27
~~Currently TS-erroring in `src/renderer/whiteboard/WhiteboardTab.tsx` (lines ~1050 and ~1061). The two methods exist on the runtime preload bridge but are missing from the `Window['api']` type declaration.~~ **Premise was wrong** — preload-fix-impl audited and found the runtime methods don't exist anywhere on the preload bridge; only call sites + comments reference them. The original todo was a type-only fix; the actual gap is implementation.

Two paths (user picks):
- **(A) Implement Pass 2.5 critique loop IPC.** Add `ipcMain.handle('whiteboard:writeRenderPng', ...)` (main-side, writes base64 PNG to per-paper sidecar) + `ipcMain.handle('whiteboard:critique', ...)` (main-side, vision Claude call returning typed verdict). Add matching `whiteboardWriteRenderPng` + `whiteboardCritique` methods to `src/preload/index.ts`'s `api` object. Real implementation — needs AI scientist (critique prompt + model choice + cost), SE (IPC contract), implementer (`src/main/ai/` + `src/main/index.ts` + `src/preload/index.ts`).
- **(B) Comment out the call site.** Guard `runCritiqueLoop` invocation in WhiteboardTab.tsx with a feature flag (or comment out). TS errors disappear; the in-app Pass 2.5 critique loop is dropped until the IPC ships. Cheap.

## 59. Component-as-answer framing — universal explanation principle (added 2026-04-27) — ✅ DONE (4 of 4 surfaces)
User instruction (verbatim): *"when we are listing the modules or different components, it might help to understand things in a way that asks what is the answer that each component is answering. For example… cross-attention to dyno v3 patches helps us answer: what does the 3D point look like in each photo? Sparse self-attention can help answer in this specific problem… how does this point relate to its neighbors? Which view should I trust here? … the user is very much focused and oriented towards how everything connects to the ground problem rather than just how these details are interconnected."*

The principle: every component, module, equation, or sub-system mentioned in an explanation must be framed as **the answer to a specific question**, where that question traces back to **the ground problem the paper is solving**.

Status of the 4 surfaces (parallel-dispatched 2026-04-27):
1. ✅ **Whiteboard PASS2_SYSTEM** — done by wb-impl-2 round 8. Added PASS A steps 0 (ground-problem sentence) and 6 (per-node question-as-answer) at `src/main/ai/whiteboard-pass2-system.ts:32-65` with WRONG/RIGHT examples + 5 worked ReconViaGen cases. MCP wrapper extended with `question` param; AC-COMPONENT-HAS-QUESTION enforces.
2. ✅ **Whiteboard critic rubric** — done by orchestrator. New rule at `.claude/critics/whiteboard.md:254-289` with the canonical DINOv3 cross-attention example.
3. ✅ **Lens explainer prompt** — done by lens-prompt-impl. New rule #2 in `src/main/ai/client.ts` SYSTEM_PROMPT (~lines 114-136) with three modality examples (ReconViaGen/DINOv2/Mamba) + per-component arrow framing. Existing rules renumbered (3-7).
4. ✅ **Cog-review check** — done by cog-review-impl. New §9 in `.claude/skills/fathom-cog-review.md`: "Components must terminate at the ground problem, not at each other." Three failure modes; REQUEST REVISION default, VETO for default-shown surfaces.

## 60. Digest field for ground problem (added 2026-04-27, flagged by lens-prompt-impl)
Currently both lens prompt + whiteboard PASS2_SYSTEM derive the ground-problem sentence each call from `digest.title` + `digest.abstract` + content.md grep. This works but is redundant — the same one-sentence end-goal is computed N times across all lens calls + every whiteboard regen.

Cleaner: add `groundProblem: string` to the digest schema, derive it ONCE during paper segmentation (`src/main/ai/segmentPaper.ts`), persist in `papers.digest_json`. Then whiteboard PASS A step 0 + lens prompt rule 2 both consume the same field — guaranteed consistency, fewer tokens per call.

Cost: one re-decompose of all indexed papers (cache miss). Schema migration: trivial — add field with fallback to derive-on-the-fly if absent (so old digests still work).

## 61. AC-PARAGRAPH-WIDTH-FIT vs wb-node-question wrap mismatch (added 2026-04-27, surfaced by wb-impl-2 round 8)
Real residual FAIL on round-8 render: `wb-question-034` ("→ what is each voxel's colour, and does it re-render to match the photos?", 73 chars) sized to node width 320 px. Wrapper's `wrapToWidth` correctly wraps to 2 visual lines for height computation, but the element's `text` field still contains the full single-line string. AC-PARAGRAPH-WIDTH-FIT predicts width from raw `text` × char-width and FAILs because 73×7.5 = 548 > 320.

Fix: wrapper should re-flow the original `text` field with explicit `\n` line breaks matching the wrap layout, so AC's per-line width prediction matches what the renderer draws. One-file change in `src/main/mcp/whiteboard-mcp.ts` (the `create_node_with_fitted_text` wrapper's question-emission block, ~70 lines added in round 8).

Also: AC-FREE-TEXT-CLEAR doesn't whitelist wb-node-question (one-line whitelist add). AC-CONTAINER-TEXT-FIT zone-label rounding artifact (overflow by 2px — widen zone height by 4px or relax bottom-edge tolerance from 1 to 4).

All non-load-bearing for the round-8 structural ask but worth a hardening round.

## 65. Whiteboard persists across sessions — load on PDF reopen, only explicit clear deletes (added 2026-04-27, user instruction)
User instruction (verbatim): *"Once I have generated the whiteboard, the whiteboard should be there even the next time when I open it. I shouldn't have to remake it. We should save the whiteboard, and unless the user clears the whiteboard, we should not delete that whiteboard. We should see that the next time I open it or close it."*

Extends CLAUDE.md §1 "Zooming persists" product principle from lens to whiteboard. Per CLAUDE.md §9 the existing persistence pattern uses `~/Library/Application Support/Fathom/sidecars/<contentHash>/` + SQLite. The whiteboard scene should follow the same pattern.

Audit + implementation for round 13 (after round-12 side-chat fix lands):
1. **Audit save**: when `whiteboard:generate` completes, is the scene JSON persisted? Where? Same for `whiteboard:chat-send` after chat refinement.
2. **Audit load**: when a PDF is reopened, does the renderer query for an existing whiteboard scene? If present, hydrate `wb.status = 'ready'` + `wb.elements = saved` skipping regeneration.
3. **Add missing pieces**: scene JSON + cost + status + last-modified timestamp to per-paper sidecar (`<sidecar>/whiteboard.scene.json`); atomic write; on tab mount, check sidecar and hydrate.
4. **"Clear whiteboard" affordance**: the only path to deletion. Wire to existing regenerate OR add dedicated menu item.
5. **End-to-end verify**: generate → quit → relaunch → reopen PDF → whiteboard appears without regenerating. Test cross-PDF isolation. Test clear deletes from in-memory + disk.

Possible coupling with the in-flight round-12 side-chat invisibility fix: if `wb.status` gets stuck in 'pass2' after generation, save-on-completion likely also doesn't fire (same root cause). If the round-12 fix is a transition fix, persistence may partially-work as side effect.

## 64. Round-9 critic-missed structural defects + harness rebuild (added 2026-04-27, user critique)
User critique (verbatim, partial — sentence cut off mid-thought; this is what landed): *"The whiteboard is still not good. Also, I'm hoping that we are improving the AI agent pipeline entirely and not just optimizing for this one case. We need to think fundamentally about how we can reshape our tools so that we never get problems like these that I see. Wrong is that the inputs box, the light purple box that is there, only covers part of the multi-view blue box. Also, part of the text in the multi-view box is going outside the box, and the arrow for the 3D mesh from slat flow plus RVC overlaps with the text that is written below. These all things should have been caught by the AI agent when it sees the screenshot. The AI agent that is actually generating the whiteboard isolates the different steps in the whiteboarding process and sees which one is performing wrongly. This should be one of your methods for building the product and the isolating principle that I have already mentioned and that is already there in your instructions or document. One of these isolating principles is also to isolate within the isolated components to see which individual part is performing wrongly and, in order to diagnose"*

Three specific defects on `/tmp/wb-render-r9-1777264183.canvas.png` that critic APPROVED through:
1. INPUTS (light purple) zone only covers PART of the multi-view (blue) zone — zone-vs-zone partial overlap.
2. Multi-view box body text overflows outside the box — text-vs-container.
3. Arrow from SLAT Flow + RVC → 3D mesh crosses text written below — arrow-path-vs-text crossing.

CLAUDE.md §8 has been updated with the new core principle "The in-product agent must close its own visual loop with per-stage isolation — and a critic APPROVED is not a substitute." Critic rubric updated with mandatory geometric checklist (zone-overlap, text-overflow, arrow-path-cross, element-overlap) + the requirement that any structural defect verdict must include a tool-layer rejection ask.

Three parallel tracks for the harness rebuild + the symptoms:

**Track A — wb-impl-2 round 10**: tool-layer rejections for the 3 user-visible defects:
- `create_background_zone` (or `create_section`/zone primitive) must reject calls where the new zone bbox would partially overlap an existing wb-zone bbox. Auto-snap to non-overlap (shift x/y or shrink) OR reject with precise error stating which zone overlaps and by how much.
- `create_node_with_fitted_text` must reject calls where the node bbox + its required wrapped-text height would extend past the parent section's bbox. Auto-shrink width to fit OR reject with: "node at (x,y) size (w,h) wraps body text to N lines × line-h = required H'; total bbox extends Δpx past section right/bottom edge. Reduce width to ≤W' or shorten body to ≤K chars."
- `connect_nodes` arrow-path computation must check the arrow's POLYLINE (not just the label bbox) against every text element on the canvas; if the polyline crosses a text bbox, reject with: "arrow path from (x1,y1)→(x2,y2) crosses text element <id> ('<text>') at (Tx,Ty). Pass `routePoints: [...]` to route around it, OR move endpoints."

**Track B — pass25-impl (new teammate)**: build the in-product Pass 2.5 visual self-loop. This is todo #58 path A — IPC + visual critique call. Spec:
- Main-side `ipcMain.handle('whiteboard:writeRenderPng', ...)`: persist base64 PNG to per-paper sidecar at `<sidecar>/wb-iter-<n>.png`.
- Main-side `ipcMain.handle('whiteboard:critique', ...)`: vision Claude call that takes (PNG path, scene JSON, paper digest) and returns typed verdict {pass: bool, defects: [{kind, stage_attribution, location, fix_suggestion}]}. The critique MUST include stage attribution per defect (Pass 1 narrative / Pass A planning / Pass B placement / wrapper / renderer) so the agent knows which stage to re-run.
- Preload bridge methods on `src/preload/index.ts`: `whiteboardWriteRenderPng`, `whiteboardCritique` matching the IPC.
- Renderer wiring in WhiteboardTab.tsx already exists at lines 1050,1061 — call sites are pre-built; this work fills in the back end.

**Track C — isolation-impl (new teammate)**: build per-stage isolation tooling so the in-product agent (and the team) can re-run only the broken stage when Pass 2.5 attributes a defect. Specifically:
- Each pipeline stage (Pass 1 narrative, Pass A planning, Pass B placement, wrapper geometry, renderer) must have a CLI entry that takes the prior stage's saved output as input and produces just its own output, with no upstream re-execution. Some of this exists (`scripts/wb-render-current.mts` for the render stage); finish for the missing stages.
- Document the per-stage CLI in `docs/methodology/whiteboard.md` so the in-product agent's Pass 2.5 hook can call them.
- The in-product Pass 2.5 hook, when it detects a defect at stage K, re-runs only stage K with a focused fix prompt and re-renders.

Tracks A, B, C run in parallel. All three must land before the next render is shown to the user — partial fixes don't satisfy the harness-rebuild ask.

## 63. Round-8 structural defects — fix at tool layer, NOT prompt layer (added 2026-04-27, user critique)
User critique (verbatim): *"The text on the arrow on the generate column in the first one overlaps with the text that has been written below ssflow. This is written in section three in the key idea box; the fourth line is going out of the box. We should have structural ways to prevent this, or tools can just simply do the computation and let the tool know when it's going to get out of the box or when something's going to overlap, so that these kinds of problems don't happen. We need to fundamentally think, rather than just improving the prompt, on how we can make better tools and patient, bid better agent harnesses for the agent to make the whiteboard and address the concerns that we see. This should be part of one of our core philosophies and the way we work."*

Two specific defects on `/tmp/wb-render-r8-1777262957.canvas.png`:
1. **Arrow label on GENERATE column overlaps text below SS Flow node.**
2. **Section 3 KEY IDEA box: 4th line of body text extends past the box bottom.**

CLAUDE.md §8 has been updated with the new core principle "Tools enforce constraints; prompts only guide intent." `.claude/critics/whiteboard.md` updated with matching grading rule. The principle: for any structural defect (overflow, overlap, collision), the fix MUST land in the MCP tool wrapper as compute-then-reject — NOT in the prompt as another rule the agent has to follow.

Round 9 work — tool-level changes ONLY. Do NOT touch PASS2_SYSTEM:

A. **Arrow-label collision check** in `src/main/mcp/whiteboard-mcp.ts` `connect_nodes` (or wherever arrows are emitted). Compute the label's predicted bbox at its placement point. Iterate every existing element bbox in `state.elements`; if the label collides with any, reject the call with: "label '<label-text>' at (x,y) collides with element <id> ('<element-text>') at (ox,oy)–(ox+w,oy+h). Choose `labelOffset: {dx, dy}` to shift, OR shorten the label to ≤N chars to fit a free spot." Optionally auto-search for a free position in a small grid around the midpoint and suggest it in the error.

B. **Callout body grow-or-reject** in `src/main/mcp/whiteboard-mcp.ts` `create_callout_box`. Round 7 already does width-aware wrap. Strengthen: after wrapping, if the wrapped body height + headerH + paddings exceeds the supplied callout height, the wrapper must EITHER (preferred) auto-grow the callout to the required height with a debug log showing old vs new dimensions, OR if the author explicitly fixed the height, reject with: "body wraps to N lines × 24px lineH = Hpx, but callout height is Mpx (excludes M-Hpx); supply height ≥ M+Hpx or shorten body to ≤K chars." This is the round-7 fix taken to its conclusion.

C. **Generalise the pattern** — sketch a doc note at `.claude/skills/fathom-tool-design.md` (new) that captures the pattern: "every wrapper that takes geometric inputs (width, height, x, y) must compute the resulting bbox + collision check + content-fit check before emitting; on impossibility, return a precise error stating which constraint failed and what would satisfy it. ACs are the fallback layer that catches what the wrapper missed; the goal over time is to reduce AC FAILs to zero by pushing checks into wrappers."

D. **Re-render and re-grade.** After A and B, run smoke + render + critic. Critic will grade against the updated rubric (which now grades critic recommendations on the strong-vs-weak ask axis).

Round 9 budget: 90 min. Three files (whiteboard-mcp.ts, the new skill doc, plus whatever supporting changes). NO prompt edits. NO AC edits unless a NEW class of defect is uncovered that doesn't fit the wrapper-rejection pattern.

## 62. Whiteboard PASS A spine — embody question-as-answer, not decorate (added 2026-04-27, surfaced by wb-impl-2 framing-check)
Round 8 added PASS A step 0 (ground-problem sentence) and step 6 (per-node question). The structural code shipped clean and the render APPROVED. **But** PASS A's planning spine (steps 1-5 — section breakdown, element listing, x/y layout, container rules, text budgets) still reasons in pure layout-mechanics language — questions are bolted on at step 0 and step 6, not woven through the planning. The agent reads PASS A as "plan the layout, then add questions" rather than "decompose the question chain, then place answers."

User's "the way I wanna learn" framing requires PASS A's spine to BECOME question-as-answer reasoning:
- Currently step 1: "Section breakdown — how many sections, in what order, each section's modality."
- User-aligned: "Question breakdown — the paper answers ONE ground-problem question through 2-4 sub-questions. List the sub-questions in the order a curious reader would ask them. Each becomes a section."
- Currently step 2: "Per section — list every element you will emit (zones, nodes, equations, callouts)."
- User-aligned: "For the section's sub-question — what 2-4 sub-sub-questions does answering it require? Each becomes a node, equation, or callout. Element TYPE follows from what kind of answer the question wants — workflow if 'how does data flow?', math if 'what's the formula?', callout if 'why does this work?'."
- Currently step 3: "Per section — rough x/y layout strategy."
- User-aligned: "Layout strategy — arrange the answers in the order the question chain runs (sub-question 1 → sub-question 2 → ... → ground-problem answer). Spatial position encodes question-chain ordering."

Round 9 work: rewrite PASS A steps 1-3 in `src/main/ai/whiteboard-pass2-system.ts`. Steps 4-5 (containers, text budgets) become subordinate "while placing answers, respect these container rules." CODE behavior unchanged — the wrapper + AC don't need to change. The agent's *planning trace* should read questions-first, not layout-first.

Also: rubric should grade whether section headers READ as sub-questions (not "Architecture overview" but "How do we get from photos to 3D?"). Add to `.claude/critics/whiteboard.md` if pursuing this round.

## 65. Dev-loop discipline — prefer `npm run dev` over `dist:mac` for iteration (added 2026-04-27, user instruction)
User's exact instruction: *"let's switch to `npm run dev` for the next iteration. Let's make a note that when developing, we should use `npm run dev` or a faster method."*

**Default to `npm run dev`** for any change that doesn't depend on the bundled, signed, installed app. `electron-vite dev` runs with HMR — code edits hot-reload in <1s, the renderer process picks up changes without a restart, no zip/install cycle.

**Only build `dist:mac` when** you actually need to exercise:
- The install path (`install.sh --from-zip`) — first-install, update flow, code-signing.
- `app.isPackaged` branches (different file paths, ASAR resources, auto-updater hooks).
- File associations (`.pdf` Open With → Fathom).
- The dock icon, the bundled `Info.plist`, native macOS LaunchServices behavior.
- A change that only manifests after `electron-builder` packs the app (rare, but happens with native modules and the `extraResources` glob).

**Cost we paid before this rule was written**: tonight's whiteboard side-chat + regen-button + guidance work could have been validated in 4-5 dev-mode hot-reloads. Instead it ran through three full `dist:mac` cycles (~80-135s wall-clock each) plus an aborted-and-restarted build that lost ~3 min to the bash supervisor terminating a piped `tee` pipeline. The user explicitly flagged this: builds were eating ~10 min cumulative for renderer-only changes that don't touch any of the bullets above.

**Operational rule for the implementer agent**: when a task is renderer-only (`src/renderer/**`, prompt copy, store wiring, UI components), open `npm run dev` once at session start and iterate against it. Reserve `dist:mac` for the *end* of the session when handing the artifact to the user, or for explicit "build a new installer" dispatches.

Future ergonomic wins (not blocking, log-only):
- Drop the DMG target from `electron-builder.config.cjs`. We install via `--from-zip`; the DMG is unused and adds ~25-30s of compression to every build.
- Investigate why `@electron/rebuild` of `better-sqlite3` re-runs every build (~5s); native module hash cache should make this a no-op when headers/version unchanged.

## 66. Whiteboard: dynamic-structure-per-paper + hard overlap constraints + side-chat chart visibility (added 2026-04-27, user directive)

User's exact message (verbatim, with image of whiteboard showing 3-section template + chat saying "applied to canvas" but no new chart frame visible):

> *"I asked on the site chat a question. It said that it had generated the chart to answer that question, but I don't see anything on the whiteboard. Additionally, we are following a specific template every time for every paper. We should not do that. We should let the explanations be dynamic enough so that they work. Have you hard coded a template somewhere that we have to first do this, this, and this? We should adapt the structure of the whiteboard explanations to match the paper. But at the very same time, we should put constraints on the generated whiteboards such that their boxes don't overlap, their text doesn't overlap, and their things don't overlap. We have to think of a strategy for this. Consult with a new team mate who is a Visual and whiteboarding expert. An expert in Excalibur internal code."*

Three threads to weave:

**(A) Side-chat "applied to canvas" → no visible chart bug.** The side-chat panel said it generated a chart for "how do their o-voxels work" with a "Jump to chart →" affordance, but the whiteboard canvas only shows the original 3-section template; no new chart frame appears. Suspect causes (untested, need diagnosis):
- The chat's `create_chat_frame` MCP primitive is failing silently and not adding elements to scene.
- Elements ARE being added but to coordinates outside the current viewport, and "Jump to chart" navigation is broken.
- Scene-merge from the chat path back into the main `whiteboard.store.ts` is not propagating, so `excalidrawAPI.updateScene` never sees the new elements.
- The chat path runs against a separate `WhiteboardSideChat`-internal scene that never integrates with the main whiteboard surface.

**(B) Hardcoded template across every paper.** Looking at every render this session — round 6, 7, 8, 9, 10, 11, 12 — the whiteboard always emits exactly 3 sections: §1 Architecture, §2 Math, §3 Thesis/Key Idea. This is too rigid for a paper-agnostic explanation surface. Need to audit `src/main/ai/whiteboard-pass2-system.ts` and the Pass 1 narrative prompt for hardcoded section archetypes vs paper-driven structure. Pass A's planning spine should choose section count/topics from the paper's actual question chain (per todo #62 framing), not from a "every paper has Architecture+Math+Thesis" template.

**(C) Hard overlap constraints alongside dynamic structure.** Dynamic structure cannot cost the geometric quality bar. The same wrapper-layer constraint principle from rounds 9-12 (AC-NODE-VS-NODE-OVERLAP, AC-MATH-ZONE-TEXT-FIT, AC-CONTAINER-TEXT-FIT) must extend to hold across whatever section layout the agent chooses — flexible geometry, rigid no-overlap. Strategy must specify: (i) how the agent declares section topology dynamically, (ii) how the wrapper enforces non-overlap regardless of what topology was chosen, (iii) how the overlap checks compose with text-fit checks now that section sizes are paper-driven not template-driven.

**Dispatch**: spawn `excalidraw-expert` (research-only, no edits) on whiteboard-build team. Brief includes:
1. Audit PASS2_SYSTEM + Pass 1 narrative for hardcoded template.
2. Diagnose side-chat → canvas integration bug (read `WhiteboardSideChat.tsx`, `whiteboard-chat.ts`, scene-merge path).
3. Propose strategy for dynamic-structure + hard-overlap-constraints, citing Excalidraw element schema, `convertToExcalidrawElements` sugar, ELK layout integration where relevant.
4. Output: ONE structured proposal ≤2500 words via SendMessage to team-lead. No code edits.

After teammate proposal lands, decompose into round-13 implementation asks for wb-impl-2 (or successor). Persistence work (todo #65 was renumbered above; new entry below) is queued behind this.

## 67. Whiteboard persists across sessions (added 2026-04-27 — re-numbered from prior #65 to avoid collision with dev-loop entry)

User's exact instruction: *"Once I have generated the whiteboard, the whiteboard should be there even the next time when I open it. I shouldn't have to remake it. We should save the whiteboard, and unless the user clears the whiteboard, we should not delete that whiteboard. We should see that the next time I open it or close it."*

Wire whiteboard persistence into the existing sidecar architecture. Save scene + Pass 1 narrative + Pass A plan + Pass B placement under `~/Library/Application Support/Fathom/sidecars/<contentHash>/whiteboard/`. On PDF reopen, load the saved scene before running any Pass; render directly from cache. Only an explicit "clear whiteboard" user action deletes it. Composes with #66 — once #66 lands, persistence keys on the dynamic structure and stores it verbatim. Queued for round 14.

## 68. Whiteboard: mid-tier template library — explanation patterns (added 2026-04-27, user directive)

User's exact instruction (verbatim):

> *"Yes, we can do whatever we want. We can have whatever organization and structure we want to best explain the paper. One other thing that might help is having a set of templates from the library for workflows. Perhaps we can use templates for different individual components and then see which of them best suits so that we are not essentially drawing everything from scratch; we are just boring. Perhaps there is a time chain workflow, but you have to see whether such components exist. These are not like box-level components; these are not the entire whiteboard-level components. These are individual explanation pieces. For example: a time chain, a flow chart, just anything. An explanation medium. We can group these all together to explain the entire paper. We can select which of them is the best."*

**Architectural insight**: between box-level primitives (rectangles, text, arrows) and whole-whiteboard sections, there's a missing mid-tier — **parameterized explanation patterns** the agent picks from rather than authoring from scratch. Each pattern owns its own geometry, so wrapper-layer overlap rejection (todo #66 thread C) shrinks to "primitives-only mode" used for the rare custom annotation outside any template.

**Seed pattern vocabulary** (excalidraw-expert refining via follow-up dispatch):
- time-chain / timeline
- flow-chart / pipeline
- taxonomy / hierarchy
- comparison-matrix / table
- definition-plus-proof-sketch
- axis / number-line
- before-after / two-panel
- input-output-with-internals
- causal-graph / DAG
- callout-with-key-insight

**Key research questions** (in flight with excalidraw-expert):
- Does Excalidraw have a native `.excalidrawlib` primitive we can use vs synthesizing at the tool layer?
- Does the community library at libraries.excalidraw.com offer reusable items?
- Tool-level API: `instantiate_template({ templateId, args, anchorX?, anchorY? })`?
- How does the agent SELECT a template — prompt-shaped, content-shape classifier, or two-stage generator+verifier?
- Composition with section-grid, frame-based sections, Pass 2.5 critique?

**Round 13 implication**: this **supersedes** todo #66 thread B (template-diversification of the worked example) and **narrows** thread C (overlap-constraint surgery). Round 13 implementation now: chat bug fix + template-library MVP (3-4 templates) + worked examples that demonstrate template-selection across paper shapes + wrapper-overlap-rejection only for primitives-mode adds.

User explicitly confirmed: structure is fully paper-driven (no MANDATORY MINIMUM architecture section); modality-as-tool-arg is approved; "do whatever we want" for organization.

---

## 2026-04-29 — pre-existing PdfViewer.tsx typecheck error

`npm run typecheck:web` fails with one pre-existing, non-blocking error:

```
src/renderer/pdf/PdfViewer.tsx(641,27): error TS18047: 'selectionSnapshot' is possibly 'null'.
```

Surfaced by fathom-wb-impl during Build 4 wiring; not introduced by their session. PdfViewer.tsx is committed clean (last touched in b7c28d2 by Whiteboard scaffolding). Cleanup pass: add a null-guard at line 641. Not blocking distribution since the renderer bundle still builds; flagged so it doesn't slip past the next typecheck-clean commit.

