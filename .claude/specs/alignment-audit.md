---
audit: alignment check — full sweep of user requirements vs shipped state
auditor: alignment-checker
date: 2026-04-25
scope: every user instruction visible in this session, cross-referenced against
       the working tree, recent commits, todo.md, the team task list, and the
       spec cards under .claude/specs/.
---

# Audit run #2: 2026-04-25 (post cog-fix + word-extraction + inline-ask shipping)

Team-lead reported four updates since pass #1: cog §5 fix applied,
word-level extraction in, inline-ask schema/IPC/per-lens stream handle
landed, plus `InlineAskBubble.tsx` and gesture rewire that landed
between my re-checks. Verified each against the working tree below.

## Re-grade summary (deltas only)

| Item | Pass #1 | Pass #2 | Why |
|---|---|---|---|
| **Cog-audit §5 (saccade conflict)** | ⏳ REQUEST REVISION unaddressed | ✓ SATISFIED | `FocusLight.tsx:461` — `transitionMs = 60` (was the variable that produced 750 ms slides at 80 wpm). Comment block 452–460 cites the cog-audit and Rayner 1998. 60 ms is below the smooth-pursuit floor → reads as a discrete snap with a soft edge = Option A from the audit. |
| **Word-level extraction (5 actual words, not 5 spans)** | ✓ (already) | ✓ (re-confirmed) | `Word = { span, charStart, charEnd, cx, cy }` (FocusLight.tsx:13–21). `extractWords` (lines 188–249) splits each text-layer span on `\S+`, materialises a Range per word. `wordRect` (lines 29–45) re-materialises at render time. |
| **Reading-position v2 (page + offset + zoom)** | ✓ (already) | ✓ (re-confirmed) | `PdfViewer.tsx:66–123` (restore — applies zoom first, defers via `pageBaseSizes`, then scrolls to `top + offset*h`); `PdfViewer.tsx:129–195` (save on scroll/visibilitychange/cleanup); `schema.ts:179–187` additive ALTER TABLE for `last_page`/`last_offset_in_page`/`last_zoom`. |
| **Inline two-finger ask: schema + IPC + per-lens streams** | ✗ → ⏳ | ✓ SATISFIED | `schema.ts:204–206` ALTER TABLE adds `display_mode`. `repo.ts:223, 239–261` carries the field through INSERT and ON CONFLICT UPDATE. `explain.ts:5–11` replaces global `currentHandle` with `handlesByLens = new Map<string, …>()`; per-lens abort at lines 81–93. |
| **Inline two-finger ask: bubble + gesture rewire** | ✗ MISSING | ⏳ PARTIAL — see findings below | `InlineAskBubble.tsx` (240 LOC) exists. `PdfViewer.tsx:10` imports it; `PdfViewer.tsx:376–417` wires `contextmenu` → `setInlineAsk(...)` → renders bubble at line 477. PdfContextMenu wiring removed from PdfViewer. **However**: marker red-while-streaming color is not visually rendered, `PdfContextMenu.tsx` file still on disk, `?` help overlay not updated, `fathom-e2e-test.md` not extended. |

---

## What's working in the inline-ask flow (verified)

- **Two-finger tap → bubble appears at the tap site, anchored to the
  tapped paragraph.** `PdfViewer.tsx:386–414` — the contextmenu handler
  hit-tests via `findRegionUnderCursor` and stores `{x, y, region, page,
  pageElement}` in `inlineAsk` state. The bubble (`InlineAskBubble.tsx:206–
  236`) renders with `position: fixed` clamped to the viewport.
- **Header strip "Dive into" + small single-line input** (≈ 5 words wide).
  `InlineAskBubble.tsx:9` — `COMPOSER_WIDTH = 220`, single `<input>` (not
  textarea) at line 221, header strip at line 218. Matches the resolved
  spec Q2 ("≈ 5 words at typical typography").
- **Enter submits, Esc closes silently, click-outside closes silently.**
  `InlineAskBubble.tsx:72–91` — `onKey` handles Esc (only closes if not
  yet submitted, line 76), `onMouseDown` closes on outside-click.
  `submit` runs on Enter (line 228).
- **Marker registered on submit, not on bubble open.** `InlineAskBubble.tsx:
  162–168` — `useLensStore.registerMarker(..., displayMode: 'inline',
  streaming: true)` runs only inside `submit`. Bubble close paths (Esc,
  click-out) are short-circuited by `submittedRef.current` checks.
- **Background streaming — full-screen lens does NOT take over.**
  `InlineAskBubble.tsx:192` calls `onClose()` BEFORE `streamExplanationForLens
  (lens, …)` (line 199). The store action used is the un-`open()` path —
  the lens is created, cached, and streamed but never focused.
- **Per-lens stream handle.** `explain.ts:5–11` `handlesByLens` Map keyed by
  lensId; abort logic at lines 81–93 only cancels streams for the SAME
  `lensId`. Independent inline asks don't kill each other (spec edge
  case 6 satisfied).
- **Schema migration is additive.** `schema.ts:204–206` — `ALTER TABLE
  lens_anchors ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'lens'` ⇒ all
  pre-existing rows hydrate as `'lens'`. CLAUDE.md §9 invariant preserved.
- **Streaming flag clears on endStream.** `store.ts:496–512` (per grep) —
  `endStream` walks the marker map and flips `streaming: false` on the
  matching marker. So the *data layer* of red→amber is wired.

## What's STILL missing or partial in the inline-ask flow

1. **Red marker is not visually rendered.** `PageView.tsx:511–550` — both
   region markers (line 526) and viewport markers (line 544) hard-code
   `bg-[color:var(--color-lens)]` (amber). The streaming flag is computed
   into `markerByLensId` (PageView.tsx:370–375) but **never read in the
   render**. So in practice every inline-ask marker renders amber from
   the moment it's registered — the user never sees the "red while
   answering, gold when done" affordance the spec promises (and the user
   explicitly asked for in the resolved-questions quote: "the marker
   changes its color When the answer has been completed"). This is the
   most user-visible gap.

2. **`PdfContextMenu.tsx` not deleted.** Still on disk at
   `src/renderer/pdf/PdfContextMenu.tsx`. Comments in `PdfViewer.tsx:46`
   and `PdfViewer.tsx:377` say *"deleted in this commit"* but the file is
   present. No live import (PdfViewer's import was rewired to
   InlineAskBubble) so it's dead code, but the spec's "PdfContextMenu.tsx
   (deleted in this commit — flag in commit)" item is unfulfilled.

3. **`?` help overlay still describes the right-click menu / no
   inline-ask gesture.** `App.tsx:1450–1463` — the keyboard rows enumerate
   ⌘+pinch, ⌘⇧D, ⌘[, ⌘], ⌘H but say nothing about two-finger tap
   opening the inline ask. Spec edge-case 10 explicitly required this
   update; `fathom-ux-review.md` is supposed to reject the diff if the
   help overlay isn't updated.

4. **`fathom-e2e-test.md` not extended.** Only one mention of
   "Dive into" appears (Step 3 — the viewport dive). Spec §DEFINITION OF
   DONE required a new gesture flow: "two-finger tap → type question →
   press Enter → wait for stream done → screenshot the marker (assert
   amber) and the bubble (assert renders question + answer) → close →
   click marker → screenshot (assert bubble re-opens with same content)
   → quit + relaunch → click marker → screenshot (assert content
   survives)". Not present.

5. **Click marker → re-open bubble path.** PageView opens markers via
   `useLensStore.open()` (full lens), not by re-summoning the
   InlineAskBubble with prior turns. Spec §"Click on a gold marker"
   expected: "the bubble re-opens in place with the persisted Q&A
   history". Currently clicking an inline-mode marker promotes straight
   to the full lens. This may be the intended fallback, but the spec
   said the bubble re-opens; flagging for the user/PM to confirm.

6. **"Open as lens" affordance on the bubble.** Spec §"Diving from the
   bubble into a full lens" required an icon button top-right that
   promotes to the full lens. The current `InlineAskBubble` has only the
   header strip + input — no such button. (⌘+pinch on the same paragraph
   still works because the lens id is `region.id`, but the discoverable
   affordance is missing.)

These six items are the gap between "the spec demo runs" and "the spec
is satisfied". Severity, in user-visible order: #1 (color transition)
and #5 (click marker reopens bubble) are the two the user explicitly
asked for; the others are spec-completeness items.

## What's STILL stale (carried from pass #1, low-severity)

- **`SettingsPanel.tsx:255`** still says "A 3-word reading pacer". Engine
  is 5. User-visible misleader.
- **`FocusLight.tsx:48, 56`** docstring still says "moving 3-word reading
  pacer" / "Why a moving band of 3 words instead". Code-internal.
- **Unused `setTick` ghost state** at `FocusLight.tsx:107, 394` (Discrepancy
  B from the cog-audit follow-ups). Can drop now that the rAF model is
  fully gone.

These can be a one-commit cleanup at any point.

---

## Updated totals

- ✓ **24 SATISFIED** (was 22 — +cog-§5, +inline-ask infrastructure)
- ⏳ **4 PARTIAL** (was 3 — the inline-ask user surface joins the three
  stale-copy items)
- ✗ **0 MISSING** (was 1 — inline ask is no longer outright missing)

## Verdict

**Not yet ship-ready for the inline-ask demo in `inline-ask.md` §DEFINITION
OF DONE.** The plumbing is in. The two demo-blocking gaps are (i) the
red→gold marker color transition isn't visually wired in `PageView.tsx`
even though the data layer supports it, and (ii) clicking a marker
opens the full lens instead of re-summoning the bubble per the spec.

Cog reviewer's §5 is now SATISFIED. The focus pacer can ship as a beta
without further work. Stale copy can ship in any commit; not a blocker.

---

## Recommended next dispatches (re-prioritised)

1. **Team D — single small commit**: in `PageView.tsx`, consume
   `markerByLensId` in the region-marker render so `streaming === true`
   maps to a red dot (`#d4413a` per the spec, deuteranopia-checked by
   cog reviewer). This is the user-visible gap that matters most.
2. **Team D — same commit or follow-up**: change the marker's `onClick`
   on inline-mode markers to re-summon `InlineAskBubble` with cached
   Q&A turns rather than calling `useLensStore.open()`. Add the
   "Open as lens" icon button on the bubble for the upgrade path.
3. **Team D — housekeeping**: delete `PdfContextMenu.tsx`. Update the
   `?` help overlay (`App.tsx:1449–1463`) to add a row for "Two-finger
   tap on a paragraph: Inline 'Dive into…' question". Extend
   `.claude/skills/fathom-e2e-test.md` with the new gesture flow per
   spec §DEFINITION OF DONE.
4. **Team A — one-line copy fix**: `SettingsPanel.tsx:255` 3→5;
   `FocusLight.tsx:48, 56` docstring 3→5; drop `setTick`. Bundle into
   the next focus-pacer commit.
5. **Alignment-checker re-run**: required before shipping the next
   user-facing build per `TEAMS.md:351–356`. Specifically verify items
   #1, #5, #6 above against the diff.

The team-lead's "I will NOT rebuild/install until you confirm everything
is satisfied" — confirming: **NOT yet satisfied for an inline-ask demo;
SATISFIED for everything else (focus pacer, position memory, multi-window,
multi-worker, welcome restyle, zoom fix, spinner, team architecture)**.

---

# Audit run #1 (original) — preserved below for reference

The alignment checker enumerates every user requirement currently in flight,
cites the proof of satisfaction (file:line, commit hash, or test), and tags
each one ✓ SATISFIED, ⏳ PARTIAL, or ✗ MISSING. Read-only by charter; no source
edits.

## Sources read for this pass

- `todo.md` (full, 200+ lines)
- `git log --oneline -50`
- `git diff --stat HEAD~6 HEAD`
- `.claude/TEAMS.md`
- `.claude/specs/inline-ask.md` (with resolved questions block)
- `.claude/specs/cog-audit-focus-pacer.md`
- `src/renderer/pdf/FocusLight.tsx`
- `src/renderer/pdf/PdfViewer.tsx`
- `src/renderer/pdf/PageView.tsx`
- `src/renderer/state/document.ts`
- `src/renderer/lens/SettingsPanel.tsx`
- `src/renderer/App.tsx`
- `src/main/index.ts` (multi-window, open-with, position-memory IPC)
- `src/main/db/schema.ts`, `src/main/db/repo.ts`
- `src/renderer/lens/explain.ts` (per-lens stream handle)
- `CLAUDE.md` §11 (visual > text for transient UI)
- `electron-builder.config.cjs` (Open With registration)

---

## Per-requirement table

| # | Requirement (user instruction) | Verdict | Evidence | Owner / next step |
|---|---|---|---|---|
| 1 | Focus pacer: **5 words clearly lit at a time** (NOT 5 lines, NOT all words) | ✓ | `FocusLight.tsx:419–447` — slot loop is `[-2, -1, 0, 1, 2]` with role tags `outer / inner / middle`; rendered with opacities `0.60 / 0.75 / 0.90 / 0.75 / 0.60` at line 472. Word extraction at `extractWords` (lines 188–249) emits per-word entries from text-layer spans; spec quote `"only be five words at a time at maximum"` confirmed in `inline-ask.md:23`. | Team A — done |
| 2 | Focus pacer: **Gaussian-shaped opacity falloff** | ✓ (gentle gradient) | `FocusLight.tsx:472` — `0.90 / 0.75 / 0.60` is the gentle gradient the user accepted in commit `5968215` after rejecting the previous `0.20`-tail version. Comment block `419–435` cites the user's verbatim rejection of the deeper falloff. | Team A — done |
| 3 | Focus pacer: **no surrounding glow** | ✓ | `FocusLight.tsx:498` — `boxShadow: 'none'` with explicit comment block `491–497` quoting the user's "surrounding focus light" rejection. | Team A — done |
| 4 | Focus pacer: **continuous motion at WPM cadence** | ✓ | `FocusLight.tsx:357–378` — `setInterval` ticks at `60000 / wpm`. Continuous slide is implemented via CSS `transition: left ${transitionMs}ms linear` (`FocusLight.tsx:500`) where `transitionMs ≈ tickMs` so each slide finishes as the next begins (comment block 452–459). | Team A — done |
| 5 | Focus pacer: **mouse-idle gate (pause when finger off trackpad)** | ✓ | `FocusLight.tsx:138–139, 366` — `lastMouseMoveRef` updated on every `mousemove` (lines 310–317); the interval skips ticks when `now - lastMouseMoveRef.current > FINGER_IDLE_MS (400 ms)`. The 400 ms threshold + macOS limit is documented at lines 117–137. | Team A — done |
| 6 | Focus pacer: **spacebar pause** | ✓ | `FocusLight.tsx:323–341` — `keydown` handler intercepts `code === 'Space'`, skips when target is INPUT/TEXTAREA/contenteditable, calls `setPaused((p) => !p)`. Used in the interval gate at line 359. | Team A — done |
| 7 | Focus pacer: **click-to-anchor a paragraph** | ✓ | `FocusLight.tsx:277–305` — `mousedown` handler hit-tests the region under the cursor (`findRegionAt`), extracts words, picks the closest one as `middleIndex`. UI-control click guard at lines 282–289. | Team A — done |
| 8 | Focus pacer: **scroll-anchored to page (not viewport-fixed)** | ✓ | `FocusLight.tsx:462–507` — bands are rendered via `createPortal(..., pageEl)` with `position: absolute` relative to the page container. Comment block 380–393 explains the structural fix away from rAF + position:fixed. | Team A — done |
| 9 | Focus pacer: **slow defaults** | ✓ | `SettingsPanel.tsx:33–35` — `DEFAULT_FOCUS_WPM = 80`, `MIN = 10`, `MAX = 150`. App.tsx:497 clamps to the same range. Commit `4317203` ("slow defaults") confirms. | Team A — done |
| 10 | Focus pacer: **opt-in beta in Preferences** | ✓ | `SettingsPanel.tsx:236–302` — "Beta features" section with `focusLightBetaEnabled` checkbox + WPM slider. Default off. Header button hidden until enabled (`App.tsx:889`). | Team A — done |
| 11 | Reading position memory: **page + zoom + scroll position survive reopen** | ✓ | `state/document.ts:25–28` (v2 fields), `PdfViewer.tsx:55–112` (restore: applies zoom first, then scrolls to `page + offset`), `PdfViewer.tsx:118–184` (save: persists page, offsetInPage, zoom on scroll + visibilitychange + cleanup). Schema at `db/schema.ts:179–187` (additive ALTER TABLE for `last_page`, `last_offset_in_page`, `last_zoom`). | Team B — done |
| 12 | Welcome screen: **single drop zone (not two cards)** | ✓ | `App.tsx:1259–1288` — single dashed-border `button` with downward-arrow glyph and "Drop a PDF here / or click to browse · ⌘O" label. Two-card grid is gone. Commit `2686d10` ("welcome restyle"). | Team-lead — done |
| 13 | Welcome screen: **recents list** | ✓ | `App.tsx:1144–1149, 1290–1337` — `recents` state populated via `window.lens.recentPapers(8)`; rendered as a list with title, path, and `formatRelativeTime` timestamp. | Team-lead — done |
| 14 | Welcome screen: **sample at the bottom of recents** | ✓ | `App.tsx:1338–1376` — sample row appended after the recents `.map`, tagged "sample" with amber border. Click → same `openSample` pipeline. | Team-lead — done |
| 15 | Multi-window: **Open With → new window** | ✓ | `main/index.ts:1276–1316` (open-file event spawns `createWindow(filePath)`); `electron-builder.config.cjs:36, 111` registers `.pdf` handler for Finder. Cold-launch path at lines 1392–1411. Commit `aa48830` (cold-launch fix) and `3770b51` (multi-window). | Team E — done |
| 16 | Multi-window: **⌘+N opens new window** | ✓ | `main/index.ts:1145–1153` — application menu has accelerator `Cmd+N` calling `createWindow()`. | Team E — done |
| 17 | Multi-window: **recents on welcome** | ✓ | Same as #13. | Team-lead — done |
| 18 | Multi-worker rendering: **faster page load (todo #44)** | ✓ | `App.tsx:35–36` (flag `MULTI_WORKER_RENDER = true`, `WORKER_COUNT = 3`); `App.tsx:127–129` opens via `MultiWorkerDoc.open(WORKER_COUNT, docOpts)`. Worker pool implementation at `pdf/multiWorkerDoc.ts` (211 LOC). Logging at `App.tsx:131–138` records `t=…ms` to fathom.log. | Team C — done |
| 19 | "Rendering…" → **spinner** | ✓ | `PageView.tsx:307–315` — when `renderedAt === null && visible`, renders a CSS-spinning ring (`animate-spin`, role="status", aria-label="Loading page"). No literal "Rendering…" text path remains for the per-page placeholder. | Team C — done |
| 20 | Minor principle in CLAUDE.md: **visual > text for transient UI** | ✓ | `CLAUDE.md:260–273` — bullet under "§11 Minor principles" with cross-references to fathom-cog-review §3 and §4, plus the persistent-state counter-example. | Team-lead — done |
| 21 | Cursor-anchored zoom: **point under cursor stays under cursor across zoom** | ✓ | `PdfViewer.tsx:758–851` — `applyAnchoredZoom`. Anchors against the page-element rect (not the scroller-content origin) to immunize against `mx-auto` gutter recomputation. Documented bug + fix at lines 787–818. | Team C / team-lead — done |
| 22 | Cursor-anchored zoom: **max zoom > 400%** | ✓ | `state/document.ts:39–46` — `MAX_ZOOM = 8` (= 800%) with rationale comment. Used by `applyAnchoredZoom` (line 779) and the +/- chrome buttons (line 904). | Team C — done |
| 23 | Open With → Fathom (Finder integration) | ✓ | `electron-builder.config.cjs:36, 111` (file-association registration); `main/index.ts:1276+` (open-file event handler); cold-launch covered separately. Commit `aa48830` ("fix Open With → Fathom on cold launch"). | Team E — done |
| 24 | Team architecture itself: **PM, cog reviewer, AI scientist, SE, alignment checker** | ✓ | `.claude/TEAMS.md` enumerates: Teams A–E (lines 45–132), PM (lines 134–230), AI scientist (lines 232–266), SE (lines 268–312), Alignment checker (lines 313–369), Cog reviewer (lines 370–393). Operational status block at lines 449–567 confirms Teams API live with config at `~/.claude/teams/fathom-build/config.json`. | Team-lead — done |
| 25 | Inline two-finger ask (NEW feature) — spec exists and matches user intent | ✓ (spec) | `.claude/specs/inline-ask.md` — full PM spec card (422 LOC) with verbatim user quotes at lines 11–24 and 88–104. The "RESOLVED QUESTIONS" block at the top captures the user's corrections (single tap not double-tap; small input not big; answer streams in lens with marker color change). Spec aligns with user intent. | PM — done |
| 26 | Inline two-finger ask — **implementation** | ✗ MISSING | grep for `InlineAskBubble`, `display_mode`, `displayMode` returns ZERO matches in `src/`. `PdfContextMenu.tsx` still imported and rendered at `PdfViewer.tsx:10, 442`; the old "Dive into …" context-menu path is the live behaviour. Schema has no `display_mode` column. Per-lens stream-handle refactor (spec edge-case 6) NOT done — `explain.ts:8, 66` still references the old `currentHandle`. | **Team D primary, Team B secondary** — log a build task. Spec is complete; implementation has not started. |

---

## Cross-cutting findings

### A. Settings copy is stale (low-severity ⏳)

`SettingsPanel.tsx:255` describes the focus pacer as "A **3-word** reading
pacer. The middle word is bright …". The implementation is the **5-word**
window (#1 above) and the cog-audit explicitly lists this discrepancy
("Discrepancy A — comment vs. implementation", `cog-audit-focus-pacer.md:299–
305`). The Settings copy is what the user SEES, so this misleads even though
the engine is correct. One-line fix.

### B. FocusLight docstring still says "3-word" (low-severity ⏳)

`FocusLight.tsx:48–60` opens with "Focus Light — a moving 3-word reading
pacer." and the rationale paragraph references the 3-word version. Same
class as A: behaviour is right, doc is stale. Already flagged in
`cog-audit-focus-pacer.md` follow-ups #5.

### C. Cog-audit §5 finding (REQUEST REVISION) is unaddressed (medium ⏳)

The cognitive reviewer issued **REQUEST REVISION** on `FocusLight.tsx` for
§5 (saccadic predictability — the smooth-slide animation conflicts with
the saccade-fixate cycle). Two fix options were proposed (Option A: drop
inter-tick transition; Option B: reframe WPM and add 80 ms ease-in). The
current code at `FocusLight.tsx:500` still uses
`transition: left ${transitionMs}ms linear` — neither option has been
applied. Per `TEAMS.md:370–393`, cog-reviewer REQUEST REVISION blocks
"any further pacer work" until addressed.

### D. Inline-ask blocker chain (high ✗)

The inline-ask spec is the largest open commitment. Several sub-items must
ship together for it to demo:

  - `lens_anchors.display_mode` column migration (Team B).
  - Per-lens stream-handle refactor in `explain.ts` (Team D, refactor #6
    in spec edge cases) — REQUIRED FIRST per `inline-ask.md:316–329`.
  - `InlineAskBubble.tsx` component, gesture rewire on `PdfViewer.tsx`,
    `PdfContextMenu.tsx` deletion (Team D).
  - Hydration of `display_mode` in renderer (Team B → renderer).
  - `?` help overlay update + `fathom-e2e-test.md` extension.

None of this is in the working tree. Task list shows #1 as `in_progress`
but no commits or staged changes exist for it. The team task is owned by
`inline-interactions` per the in_progress label.

### E. Recents endpoint dependency (low — verify)

Welcome screen recents (#13) calls `window.lens.recentPapers?.(8)` with
optional chaining — the `?.` suggests it's defensive against an older main
process. Confirmed present at `main/index.ts` (recents IPC). No action
required; flagged so a future "recents went empty" report can find it.

---

## Summary

- ✓ **22 SATISFIED**
- ⏳ **3 PARTIAL** (Settings copy "3-word", FocusLight docstring, cog-audit §5 fix)
- ✗ **1 MISSING** (inline two-finger ask implementation — spec is complete, code is not)

**Overall: NOT done.** The session-level work is mostly shipped (focus pacer
in its full 5-word/no-glow/scroll-anchored form, position memory, welcome
restyle, multi-window, multi-worker rendering, zoom fix, spinner, CLAUDE.md
principle, team architecture). The two blockers are (i) the cog-reviewer's
REQUEST REVISION on the focus pacer's saccade-vs-smooth-pursuit conflict,
and (ii) the inline two-finger ask, whose spec is fully resolved but whose
implementation hasn't started.

---

## Recommended next dispatches

1. **Team A — Reading Aids**: address cog-audit §5. Pick Option A (drop
   inter-tick `transition` for forward ticks; preserve only on initial
   anchor) or Option B (80 ms ease-in only, reframe WPM copy). Same commit:
   update `FocusLight.tsx:48` docstring to say "5-word" and update
   `SettingsPanel.tsx:255` body copy to match. Estimated diff: < 30 LOC.

2. **Team D + Team B — Inline two-finger ask**: build per
   `.claude/specs/inline-ask.md`. Sequencing per spec §SEQUENCING:
     - First: `explain.ts` per-lens stream handle refactor (Team D).
     - Then: Team B ships the `display_mode` ALTER TABLE + IPC field.
     - Then: Team D builds `InlineAskBubble.tsx`, rewires `PdfViewer.tsx`
       gesture, deletes `PdfContextMenu.tsx`, updates `?` help overlay,
       extends `fathom-e2e-test.md`.
   - Cog reviewer to gate the red marker colour + 2 s auto-close timing
     before merge.

3. **Alignment-checker re-run**: required before the next user-facing
   commit per `TEAMS.md:351–356`. Specifically confirm Items #26 (inline
   ask) and the three ⏳ entries above before declaring the session done.
