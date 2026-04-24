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


## 21. Comprehensive data-model audit — 🔄 PENDING
User reports anchor image disappears 1-2 min after closing a lens.
Root cause: zoom_image_path is persisted only on the `explanations`
table, and with the new no-auto-prompt model an opened-but-never-
asked lens has no explanation row → no persistence path. Fix is a
new `lens_anchors` table that records every lens open (lens_id,
paper_hash, origin, page, bbox_json, region_id, parent_lens_id,
zoom_image_path, selection, created_at). Markers + drill edges +
zoom paths all derive from it. Replaces the current ad-hoc spread
across regions / explanations / lensMarkers / drill_edges.
Schedule: v1.0.12.

## 22. Animated thinking indicator inside the lens — 🔄 PENDING
"Working…" / "thinking" text in the lens body during stream is
static. Should animate (pulsing dots, or a typewriter cursor on
the in-progress sentence) so the user feels progress, not stuck.
Schedule: v1.0.12 alongside the audit above.

## 23. Phase 3 — inline drill markers — 🔄 PENDING
The Phase 2 implementation (chip row at top of body) is the
visible affordance. Phase 3 inlines them: wrap the drilled phrase
in the parent body with an amber span + sticker dot in the right
gutter, so the marker is RIGHT NEXT TO the phrase (matching the
PDF-page-marker visual rule). Requires DOM range mapping over the
react-markdown output. Schedule: v1.0.13.

## 24. Phase 4 — highlights inside the lens body — 🔄 PENDING
Highlighter currently only works on the PDF text layer (key:
`[data-page]` ancestor). Extend `createHighlightFromSelection` to
detect "selection inside a lens body" and tag the highlight with
lens_id instead of page. Renderer renders highlights both on PDF
pages AND in lens bodies through the same store. Same UI
component, different selector. Schedule: v1.0.13.

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

## 26. Initial render + scroll-to-new-page slow — 🔄 PENDING
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
