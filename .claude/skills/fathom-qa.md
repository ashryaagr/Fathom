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

# 8. Final clean-log check
grep -E '\[error\]|uncaught|React error boundary tripped' \
  ~/Library/Logs/Fathom/fathom.log | tail
# Expect: nothing from the window of this test run.
```

If any step fails, **do not ship the release**. The bug is real
and the user will hit it.

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
