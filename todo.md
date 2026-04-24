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

## 22. Animated thinking indicator inside the lens — 🔄 PENDING
"Working…" / "thinking" text in the lens body during stream is
static. Should animate (pulsing dots, or a typewriter cursor on
the in-progress sentence) so the user feels progress, not stuck.
Schedule: v1.0.12 alongside the audit above.

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

## 27. Pluggable AI backend (Claude / Gemini / Codex CLI) — 🔄 PENDING
User: "be able to configure the backend whether we are using Claude
or we are using Gemini or codecs. The only requirement is that the
CLI should be there."

Design sketch:
- Settings panel gains a `backend` choice: `claude` (default),
  `gemini`, `codex`. Stored in `~/Library/Application
  Support/Fathom/settings.json` alongside the existing
  `extraDirectories` / `customInstructions`.
- `src/main/ai/client.ts` becomes a switch on the configured
  backend. Each backend has the same shape: a CLI on $PATH that
  takes a prompt + tools + auth, streams text deltas, exposes a
  session-id we can resume. Today this is hard-wired to the
  Anthropic Agent SDK (`pathToClaudeCodeExecutable`); we'd add
  parallel adapters for the Gemini CLI (`gemini`) and the OpenAI
  Codex CLI (`codex`).
- The "Claude Code installed?" startup check generalises to
  "<configured-backend> CLI installed?" — if a user picks Gemini
  in prefs but doesn't have `gemini` on PATH, surface the same
  install-instruction dialog the Claude path uses today.
- README / docs / `fathom-qa.md` get matrix-style coverage for
  all three backends. The QA missing-deps scenarios (S1/S2/S3)
  multiply per backend — one set per choice.

Open questions for the author:
- Tool-use parity. Claude's Agent SDK gives Read/Grep/Glob out
  of the box. Gemini and Codex CLIs may not. If the chosen
  backend can't ground via tools, do we degrade to "send the
  whole content.md as a prompt prefix"? Acceptable?
- Auth. Claude Code uses browser sign-in. Gemini CLI uses
  Google API keys. Codex needs OpenAI credentials. We don't
  store credentials in Fathom — we ride on whatever the CLI
  itself has cached. Document this clearly.

Schedule: v1.1.0 (it's a meaningful product surface change, not
a point release).

## 28. QA agent should not steal cursor / Space focus — 🔄 PENDING
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
