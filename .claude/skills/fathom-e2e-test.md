---
name: fathom-e2e-test
description: End-to-end test the packaged Fathom.app via keyboard gestures and screenshots, without a human at the trackpad. Use when verifying a feature works, reproducing a user-reported bug, or before calling a task done.
type: skill
---

# Fathom end-to-end test harness

The app is a desktop PDF reader whose core interaction is a trackpad
pinch. A computer-use agent can't synthesize multi-finger trackpad
events, so **every gesture has a keyboard equivalent** and the test
harness at `scripts/fathom-test.sh` drives them all via `osascript` and
`screencapture`.

## When to use this skill

- The user reports a bug ("Try with sample paper did nothing").
- You just finished a change that touches gestures, the lens, the tour,
  or any visible UI surface.
- You want to verify a `fathom-release.md` build hasn't regressed the
  golden path.

## The harness

`scripts/fathom-test.sh` — single entry point:

```bash
# Lifecycle
scripts/fathom-test.sh reset                # wipe firstRunCompletedAt / tourCompletedAt
scripts/fathom-test.sh launch               # kill + relaunch packaged Fathom
scripts/fathom-test.sh log 80               # tail fathom.log

# Pixels
scripts/fathom-test.sh shot <name>          # screencapture → /tmp/fathom-shots/HHMMSS-<name>.png
                                            # the returned path is what you Read to see it

# Direct controls
scripts/fathom-test.sh click "<button-label>"   # press a named button in the frontmost window
scripts/fathom-test.sh key <keycode>            # raw key code via System Events

# Gesture-keyboard equivalents (the important bit)
scripts/fathom-test.sh open-pdf             # ⌘O  open file dialog
scripts/fathom-test.sh dive                 # ⌘⇧D open a lens on the current viewport
scripts/fathom-test.sh ask                  # ⌘⇧A same thing, alternate mnemonic
scripts/fathom-test.sh back                 # ⌘[  navigate back through lens history
scripts/fathom-test.sh forward              # ⌘]  navigate forward
scripts/fathom-test.sh prefs                # ⌘,  open Preferences
```

The key insight: `⌘⇧D` is how the agent performs semantic zoom when it
can't pinch. Any time you'd reach for the trackpad, reach for `dive` or
`ask` instead.

## Canonical end-to-end test loop

Run this before declaring any non-trivial change done.

```bash
# 1. Clean slate
scripts/fathom-test.sh reset
scripts/fathom-test.sh launch
sleep 2
scripts/fathom-test.sh shot welcome           # expect: welcome dialog

# 2. Open sample paper via the welcome dialog
scripts/fathom-test.sh click "Try with sample paper"
sleep 3
scripts/fathom-test.sh shot sample-opened     # expect: 3-page paper, first page visible

# 3. Dive into the viewport
scripts/fathom-test.sh dive
sleep 4                                       # let the lens open + first stream start
scripts/fathom-test.sh shot lens-streaming    # expect: handwritten header, streaming body

# 4. Wait for the stream, then ask a follow-up
sleep 15                                      # rough allowance for a short stream
scripts/fathom-test.sh shot lens-final

# 5. Go back
scripts/fathom-test.sh back
sleep 1
scripts/fathom-test.sh shot back-to-pdf       # expect: back on the PDF, marker next to paragraph

# 6. Check the log tail for errors
scripts/fathom-test.sh log 40
```

## Inline two-finger ask (PARTIALLY MANUAL — todo.md #51)

The two-finger tap on a paragraph opens a small "Dive into" bubble;
typed question + Enter drops a marker on the page that goes red while
Claude streams in a background lens, then cross-fades amber when the
answer is ready. The harness can SEE the marker colour transition via
`capture`, but cannot yet synthesize the trackpad two-finger tap or
the post-completion marker click — both require coordinate-precise
clicks that AppleScript doesn't expose without registering new global
shortcuts in the main process.

**Until the harness commands exist** (todo.md #51 — add `inline-ask
<question>` and `click-marker <n>` subcommands plus the matching
main-process IPC), validate this flow manually after each release:

1. Open the sample paper.
2. Two-finger tap on a body paragraph → small "Dive into" bubble appears
   anchored to the cursor.
3. Type a short question (≈ 5 words), press Enter.
4. Bubble closes immediately. A RED dot appears on the right edge of
   the paragraph and PULSES (1.2 s opacity loop).
5. Wait for the stream to finish (~10–25 s for the sample paper).
   Dot cross-fades RED → AMBER over 600 ms; pulse stops.
6. Click the amber dot → lens opens with the question + streamed answer.
7. Quit Fathom (⌘Q), relaunch, reopen the same paper from "Recently
   read" → same amber dot is in the same place; click → same Q&A.

A regression on any of these steps is shippable-blocker severity (the
marker colour is the only feedback the user has that the background
stream finished — silent failure here is unrecoverable from the user's
side). Re-run on every release until the harness can do steps 2–7
autonomously.

If any step shows a red toast, an empty lens, no marker, or an error in
the log — that's the test failing. Report the specific screenshot and
log line, don't just say "it didn't work".

## What to Read vs what to screenshot

- Screenshots (`.png` under `/tmp/fathom-shots/`): use `Read` on the
  file path — the vision layer can parse the UI state.
- Logs: capture lines prefixed `[Fathom]`, `[Fathom AI <id>]`, or
  `[Fathom Decompose]`. Most failures log a root cause before the
  user-visible symptom.

## Things you can't test this way

- Actual trackpad pinch kinematics. If the user reports "pinch feels
  bad", that's for them to validate; the keyboard path just checks
  that the commit logic works.
- Animations timing precisely. Screenshots are point-in-time; use
  multiple with `sleep` between them if animation correctness matters.
- Any audio or haptic feedback.

## Before finishing

Every test loop should end with:

```bash
scripts/fathom-test.sh log 100 | grep -Ei 'error|fail|uncaught' || echo "clean log ✓"
```

Clean log + the final screenshot matching the expected state = pass.
