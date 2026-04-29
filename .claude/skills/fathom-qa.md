---
name: fathom-qa
description: How Claude Code does QA on a visual, gesture-driven Mac app. A tiered pipeline — cheap checks first, vision/CUA only when necessary — and the canonical pre-release flow to run before every release.
type: skill
---

# Fathom QA

Fathom is a visual, gesture-driven app. CLI test harnesses can only
reach part of it; the rest is pixels, animation, and feel. This
skill is the playbook for doing real QA as an agent on a machine
where a human isn't watching.

## When to use

- **Before every release.** Run the canonical flow end-to-end. No
  release declared done until this passes and the log is clean.
- **After any change** to: gestures (App.tsx, PdfViewer.tsx,
  FocusView.tsx), the lens pipeline, the welcome screen, the
  install path, or anything the user interacts with.
- **When a user reports a symptom** — reproduce it under the
  harness first, then fix. Do not blind-patch from description.

## The pyramid

Fastest, cheapest check first. Escalate only when a lower tier
can't answer the question.

```
          ┌──────────────────────────────┐
          │  Computer use (manual feel)  │  Rare
          ├──────────────────────────────┤
          │  Video + frame sampling      │  Animation bugs
          ├──────────────────────────────┤
          │  Screenshots + vision grade  │  Visual correctness
          ├──────────────────────────────┤
          │  __fathomTest state + logs   │  State correctness
          ├──────────────────────────────┤
          │  typecheck + unit tests      │  Logic + types
          └──────────────────────────────┘
```

80% of bugs are catchable in the bottom two tiers. Reserve the
top tiers for what only eyes can see.

### Tier 1 — typecheck (always run first)

```bash
npm run typecheck
```

Free, seconds, catches half of all regressions before they even
ship to the harness. **Never commit without a clean typecheck.**

> **In dev-mode**: typecheck is only step 1 of pre-flight. Step 2
> is the bundle-mtime gate (see "Pre-claim verification" below).
> A typecheck-clean main-side edit is NOT live in the running
> Electron app until `out/main/index.js`'s mtime is newer than the
> source you edited.

### Tier 2 — state + log

Two substrates:

1. **`fathom.log`** is the renderer + main timeline. Thanks to
   the `log:dev` IPC, renderer `[Lens]` / `[Gesture]` /
   `[Highlights]` lines all land here alongside `[Fathom Updater]`.
   After every harness command:

   ```bash
   tail -120 ~/Library/Logs/Fathom/fathom.log
   grep -E '\[error\]|uncaught|failed' ~/Library/Logs/Fathom/fathom.log | tail
   ```

2. **ErrorBoundary** wraps the major renderer subtrees
   (EmptyState / PdfViewer / FocusView). A component-level crash
   no longer shows as a white screen — it shows as a small
   "something went wrong in FocusView" card AND logs the stack
   via `log:dev`.

### Tier 3 — screenshot + vision grade

Not pixel-diff against a golden image — vision-grade against a
short *description*. More forgiving of cosmetic drift; strict
about structural correctness.

```bash
scripts/fathom-test.sh shot welcome
# returns: /tmp/fathom-shots/HHMMSS-welcome.png
```

Then read that file path and grade it yourself. Good expectation
phrasings:

- ✓ "A warm cream card in the middle of the window. At the top,
  the word 'Fathom' in a handwritten typeface, with the tagline
  'Dive into any paper.' beneath. Two buttons: *Try with sample
  paper* and *Open your own paper*."
- ✗ "Looks right."  *(too vague; grade nothing)*

### Tier 4 — video + frame sampling

For gesture animations (swipe arrow, lens open transition,
pinch-commit ring), static screenshots miss the frame where the
animation peaks. Use `screencapture -v` to record a short clip:

```bash
screencapture -v -R 0,0,1280,880 -T 0 /tmp/fathom-gesture.mov
# ... trigger gesture ...
# Ctrl+C to stop

# Sample frames with ffmpeg, then read
ffmpeg -i /tmp/fathom-gesture.mov -vf fps=10 /tmp/frames/f-%03d.png
```

Read the frames in sequence; confirm the animation beats happen
in the right order (armed → committing → lens open).

### Tier 5 — computer use (only when the above can't tell)

If a bug is "feels bad" or "something's off" and the structural
checks all pass, escalate to CUA-style manual driving. Reserve
for novel UX judgement, not routine regression.

## Pre-claim verification: `out/main/index.js` mtime check

(Established 2026-04-27 after a string of "the fix is live, but still
broken" reports. Multiple agent claims of "main edit landed" were
factually wrong — the running dev Electron was executing a fossilized
bundle from session start.)

When ANY agent claims a main-process or preload edit is live in dev,
the QA harness MUST verify by reading `out/main/index.js` (or the
relevant preload bundle) mtime via:

```bash
stat -f '%Sm %N' out/main/index.js src/main/<edited-file>.ts
# or for a preload edit:
stat -f '%Sm %N' out/preload/index.mjs src/preload/<edited-file>.ts
```

The bundle's mtime MUST be **newer** than the source file's mtime. If
the bundle is older — or has the same mtime as it had at dev launch —
the edit is NOT live regardless of any agent's confidence.

### Why this happens

`package.json`'s `dev` script SHOULD include the `--watch` flag (per
`electron-vite dev --watch`), which rebuilds main + preload on source
edits. As of 2026-04-27 it does. But this fix is recent — older
checkouts, branches that pre-date it, or any session that launched
dev manually without `--watch` will silently fossilize main+preload at
launch time.

Per `node_modules/electron-vite/dist/cli.js:39`: *"-w, --watch:
rebuilds when main process or preload script modules have changed on
disk"*. Without it, only the renderer is HMR'd; main + preload are
built ONCE at startup and never re-built. Renderer-only edits
(`src/renderer/**`) are immune — the Vite dev server HMRs them
directly into the running window.

### Scope of the rule

This mtime check applies to changes in:

- `src/main/**` — the main Electron process
- `src/preload/**` — the contextBridge IPC surface
- `src/main/mcp/**` — the in-MCP tools (`whiteboard-mcp.ts` and friends)
- `src/main/ai/**` — the AI orchestration (`whiteboard.ts`,
  `whiteboard-chat.ts`, `whiteboard-critique.ts`)
- `src/main/db/**` — the SQLite layer

**Renderer-only edits** (`src/renderer/**`) DO NOT require the mtime
check — Vite HMR delivers them within seconds of save and the dev
log will print `hmr update /path/file.tsx` as confirmation.

### Adding the check to the canonical flow

Before declaring a main-side fix verified — i.e. before running any
Tier 2-5 grade against the running app — execute the mtime check.
The bundle-newer-than-source assertion is binary: pass / fail. If
fail:

1. The agent's claim is false; do not accept the verification.
2. Investigate why `--watch` didn't rebuild — check `package.json`
   for the flag, check the dev process for crashes, check the file
   watcher (macOS fsevents quirks).
3. Restart dev with `./node_modules/.bin/electron-vite dev --watch`
   if `package.json`'s script lacks the flag.
4. Re-run the mtime check after the restart's main-build cycle
   completes (~3-5s post-launch). Only then proceed to Tier 2-5.

### Concrete pattern

```bash
# 1. Pre-flight: bundle is newer than every recently-edited main file
SOURCE_MTIME=$(stat -f '%m' src/main/mcp/whiteboard-mcp.ts)
BUNDLE_MTIME=$(stat -f '%m' out/main/index.js)
if [ "$BUNDLE_MTIME" -lt "$SOURCE_MTIME" ]; then
  echo "FAIL: bundle older than source; main fix NOT live"
  exit 1
fi
# 2. Now safe to run Tier 2-5 grading.
```

### History this rule is meant to catch

- **2026-04-27, round-11 `serverScriptPath()` fix**: agent claimed
  "render-server path bug fixed, visual self-loop now firing." Bundle
  was actually from session-start; the fix never ran. Same module-not-
  found error recurred for hours.
- **2026-04-27, chat-frame skeleton fix**: agent claimed the v0.18
  frame fields were live in main. Bundle was fossilized; the user's
  next chat turn produced another invisible frame.

Both were caught only when a teammate explicitly ran `stat` on the
bundle and noticed the mtime was hours old. Bake the check into every
post-edit dispatch.

## The canonical pre-release flow

Run every single step before shipping a release. Each step has
a screenshot + log grep + state assertion.

```bash
# 0. Setup
scripts/fathom-test.sh reset
scripts/fathom-test.sh launch
sleep 3

# 1. Welcome screen
scripts/fathom-test.sh shot 01-welcome
# Expect: "Fathom" wordmark in handwriting, two buttons, no PDF visible.

# 2. Sample paper
scripts/fathom-test.sh click "Try with sample paper"
sleep 5   # buildPaperIndex + decomposePaper kick off
scripts/fathom-test.sh shot 02-sample-opened
# Expect: Transformer paper title, section 1 visible, indexing toast
# bottom-right.
scripts/fathom-test.sh log 40 | grep -E '\[sample\]|decompose' | tail -5
# Expect: [sample] copied, [Fathom Decompose] start

# 3. Dive on the viewport (⌘⇧D keyboard alias)
scripts/fathom-test.sh dive
sleep 2
scripts/fathom-test.sh shot 03-lens-opening
# Expect: full-screen lens overlay, handwritten heading, "Working…"
# collapsible visible, Ask footer at bottom.
grep '\[Lens\] opening' ~/Library/Logs/Fathom/fathom.log | tail -1
# Expect: a line from the last ~5 seconds

# 4. Wait for the stream to finish
sleep 15
scripts/fathom-test.sh shot 04-lens-streamed
# Expect: lens with completed explanation body, no "Working" pulse.

# 5. Ask a follow-up by key
osascript -e 'tell application "System Events" to keystroke "what is multi-head attention"'
osascript -e 'tell application "System Events" to key code 36'  # Return
sleep 12
scripts/fathom-test.sh shot 05-followup
# Expect: second Q&A turn appended below the first.

# 6. Swipe back → close lens
scripts/fathom-test.sh back
sleep 1
scripts/fathom-test.sh shot 06-back-to-pdf
# Expect: PDF visible, small amber marker near the zoomed paragraph.

# 7. Highlight ⌘H test — select something then highlight
#   (skip if text selection via osascript isn't trivial here;
#   the hook point is proving the keyboard shortcut fires the
#   handler. Use log.)
scripts/fathom-test.sh key 4  # 'H'  — trigger ⌘H with the key harness
# Expect log line: [Highlights] selection empty OR saved (either
# proves the shortcut bound).

# 8. ANCHOR-IMAGE ROUND-TRIP CHECK (mandatory — this regresses
#    frequently). Confirm a lens's saved figure survives both
#    in-session close-and-reopen AND a full app restart.
#
# The bug class: persistedZoomPaths was hydration-only or the
# hydration filter dropped viewport-origin rows; reopen showed
# the magnifying-glass placeholder instead of the saved figure.
# v1.0.16 closed two compounding holes; this regression check
# is what stops a future change from re-opening them.

# 8a. Same-session reopen (the v1.0.16 fix)
scripts/fathom-test.sh dive            # open viewport-origin lens
sleep 8                                 # let the explain stream + the
                                        # zoom save complete
scripts/fathom-test.sh shot 08a-zoomed  # vision-grade: figure visible
                                        # in the anchor at the top
scripts/fathom-test.sh back             # close lens → marker pinned
sleep 1
# Click the marker. The harness has no built-in for this yet —
# use the dive shortcut as a proxy (it reopens viewport scope on
# the same page) OR use mcp__claude-in-chrome to click the marker
# DOM directly (look for `aria-label="Reopen previous zoom"`).
scripts/fathom-test.sh dive
sleep 2
scripts/fathom-test.sh shot 08a-reopened
# Expect: same anchor figure as 08a-zoomed. **NOT** the
# magnifying-glass placeholder (rect with circle + path).
# If you see the placeholder, the persistedZoomPaths in-session
# write regressed — check src/renderer/lens/store.ts open().

# 8b. Cross-session reopen (paper close-and-reopen via app restart)
# Quit & relaunch the app, reopen the same paper, click the same
# marker. Anchor figure should restore from the lens_anchors
# zoom_image_path via the hydration loop in App.tsx. If it
# doesn't, check that the loop's filter is not `&& a.region_id`
# again (that filter dropped viewport-origin rows in v1.0.15
# and earlier).
pkill -x Fathom
sleep 2
scripts/fathom-test.sh launch
sleep 5
# Reopen the same sample paper; same marker click; same shot.
scripts/fathom-test.sh click "Try with sample paper"
sleep 5
# Click marker via DOM if available, or take the shortcut path
# the harness exposes:
scripts/fathom-test.sh shot 08b-after-restart
# Expect: marker still pinned next to the previously-zoomed
# paragraph. After click → figure restored.

# 8c. Logs — on miss, both reopen paths log to fathom.log
grep -E 'no persistedZoomPath|readAssetAsDataUrl failed' \
  ~/Library/Logs/Fathom/fathom.log | tail -5
# Expect: empty. Any line here means the path lookup missed
# and the user saw the placeholder. Triage from the line.

# 9. Final clean-log check
grep -E '\[error\]|uncaught|React error boundary tripped' \
  ~/Library/Logs/Fathom/fathom.log | tail
# Expect: nothing from the window of this test run.
```

If any step fails, **do not ship the release**. The bug is real
and the user will hit it.

### Why step 8 is in every flow now

The user has reported the "anchor image disappears on reopen"
bug class three times across v1.0.x. Two distinct root causes
(`persistedZoomPaths` hydration-only, hydration filter dropping
viewport-origin rows) shipped under the same symptom. This step
is the permanent trip-wire — if it fails, ship is blocked
regardless of how clean the rest of the flow is. The user's
explicit guidance (April 2026): *"there should be something to
be checked by QA agent every time because this is getting wrong
frequently."*

## Reading a screenshot — how to vision-grade

1. Read the file with the Read tool (vision layer parses it).
2. State what you expect in one or two concrete sentences.
3. Compare. Don't just say "looks right" — state the structural
   facts you see. "Two buttons labelled X and Y on a cream card."
4. Flag any of these categories of failure:
   - Missing element (no lens overlay where there should be)
   - Wrong text (label says "Ask Claude" when spec says "Ask")
   - Wrong font (handwritten where it should be sans, or vice
     versa — see `fathom-communication.md` for the policy)
   - Layout overflow (text clipped, cut off, wrapping badly)
   - Wrong state (PDF visible when welcome should be showing)
   - Visible error card (ErrorBoundary fallback)

## Simulating missing prerequisites

Fathom needs Claude Code installed + signed in. Users will hit the
failure path when one of those is missing. The canonical flow tests
the happy path — but the failure paths need coverage too, because
that's what a first-time user on a clean machine sees.

Three scenarios to rehearse per release:

### S1. `claude` not on PATH

Simulate by shadowing the binary for the session:

```bash
# Launch Fathom with /usr/bin:/bin:/sbin only, hiding every .local/bin
# or Homebrew path where claude normally sits. This is what Fathom
# will see for a user who never installed Claude Code.
env PATH=/usr/bin:/bin:/sbin open -gj -a Fathom
```

Expected: a dialog on startup citing "Claude Code not found" with a
copy-paste install command. Log line in `fathom.log`:
`[startup] claude=NOT FOUND`.

### S2. `claude` on PATH but not signed in

Simulate by renaming the auth cache:

```bash
mv ~/.config/claude ~/.config/claude.bak 2>/dev/null || true
mv ~/.claude ~/.claude.bak 2>/dev/null || true
open -gj -a Fathom
# after the test:
mv ~/.claude.bak ~/.claude 2>/dev/null || true
mv ~/.config/claude.bak ~/.config/claude 2>/dev/null || true
```

Expected: the app launches, welcome shows, but any dive triggers an
explain-start failure in the log: `[explain:start] failed — not
authenticated`. Toast should surface the `claude login` remedy.

### S3. macOS TCC denies access to user Downloads / Documents

Simulate by pointing Fathom at a PDF in `/private/var/root/` or
another folder the app hasn't been granted access to. (Rare in
practice — we moved the sidecar to `userData` precisely to avoid
this — but if you re-introduce any Desktop/Documents/Downloads
writes, this test catches the permission dialog.)

**Rule**: every prerequisite Fathom depends on gets one of these
scenarios before shipping a release. New prerequisite added? Add its
matching S-entry here, and fail any release that hasn't rehearsed
the scenario.

## What the harness can't answer (yet)

- **Pinch/zoom kinematics.** We can `dive` via keyboard; we
  can't synthesise a trackpad pinch. Only a human or a full CUA
  session can test that.
- **Audio/haptic feedback.** We don't use either, so moot.
- **Scroll inertia feel.** Screenshots + log won't surface this;
  escalate to video sampling.

## Pitfalls to avoid

- **"I ran the flow once and it passed" ≠ "shipped safely."** Run
  twice in a row with `reset` between. Flakiness surfaces on the
  second pass.
- **Don't skip the final log grep.** A test can visually pass
  while the log is littered with ErrorBoundary trips or
  [Fathom Decompose] errors that will hit the user in production.
- **Don't tune the harness to the bug you're chasing.** The
  canonical flow is a regression net. Add new steps for new
  features; don't mutate steps for today's bug.
- **Always read the screenshots.** It's tempting to declare
  success when the harness commands don't fail. The commands
  succeed even if the app renders a white screen — that's the
  whole category of bug this skill exists to catch.
