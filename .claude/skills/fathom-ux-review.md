---
name: fathom-ux-review
description: Review Fathom control/gesture/install/update changes against macOS conventions, browser-swipe semantics, and Apple HIG. Run this BEFORE committing any diff that touches gestures, keyboard shortcuts, or the install/update UX.
type: skill
---

# Fathom UX design-pattern review

Fathom aims for an Apple-level feel. Every gesture and control earns that
by matching intuitive patterns the user already knows from other Mac apps,
Safari, and the macOS system itself. **A control is worse than not having
it at all if it misleads the user about what it does.**

This skill is the checklist an agent runs over a proposed UX change
before committing.

## When to use this skill

Invoke this skill **automatically** (without the user asking) whenever a
diff touches:

- `src/renderer/App.tsx` (keyboard shortcuts, swipe handler, drop zones)
- `src/renderer/pdf/PdfViewer.tsx` (gesture detection, cursor anchoring)
- `src/renderer/pdf/PageView.tsx` (markers)
- `src/renderer/lens/FocusView.tsx` (Esc, scroll inside lens, drill)
- `src/renderer/lens/GestureFeedback.tsx` (visual affordances)
- `src/renderer/lens/CoachHint.tsx` / `FirstRunTour.tsx` (onboarding)
- `src/renderer/lens/SettingsPanel.tsx` (Preferences)
- `install.sh` (install UX copy, terminal prompts)
- `src/main/updater.ts` / `UpdateToast.tsx` (update UX)
- `scripts/fathom-test.sh` (adds/changes agent-facing controls —
  which implies the user-facing ones changed too)

## The checklist

### 1. Gesture direction is intuitive on Mac

- **Natural scrolling**: two-finger swipe RIGHT moves content to the
  right in your field of view → that's BACK through history (like
  browsers). Swipe LEFT = forward.
- **Pinch-in** = zoom IN (content gets larger). **Pinch-out** = zoom
  OUT.
- **⌘ + gesture** should augment, never contradict, the plain gesture
  — because users experiment by adding/removing ⌘ mid-motion.

### 2. A gesture doesn't fire if it has nothing to do

This is the rule we learned the hard way: the swipe-right chevron
animation was appearing on plain PDF scrolls because the swipe handler
fired regardless of whether there was lens history. That gaslit the
user — the app suggested something happened when nothing did.

**Every control must check that its action has an effect before
committing visual feedback:**

- Swipe back → only if `focused !== null` or `backStack.length > 0`.
- Swipe forward → only if `forwardStack.length > 0`.
- ⌘Z (undo lens close) → only if history is non-empty.
- ⌘+0 (reset zoom) → only if zoom ≠ 1.

If the action would be a no-op, **let the underlying scroll/pan
happen**. Don't preventDefault. Don't show a chevron.

### 3. Platform conventions hold

- `⌘ O` = Open. Not New, not Find.
- `⌘ ,` = Preferences. Not Settings (App Store naming), not in Help.
- `⌘ [` / `⌘ ]` = Back / Forward, matching every browser and file
  manager on macOS.
- `⌘ ⇧ D` = our custom "Dive" — document it in help, never alias it to
  something unrelated.
- `Esc` — if it doesn't do what users expect (close the topmost modal),
  show them what does. The user-facing hint via `fathom:escHint` is
  how we did that for the lens.

### 4. Affordance is visible before the action

Drop zones, markers, and lens handles need to be visible *before* the
user tries the gesture. "The feature exists but users can't find it"
is a design failure, not a user failure.

- Empty state has a visible drop zone with dashed border.
- Paragraphs with cached explanations have persistent markers.
- Preferences is reachable from at least two places (App menu + header).
- Controls that are only accessible via `⌘+X` must also have a visible
  button or menu item.

### 5. First-time install: zero friction, zero prior knowledge

- DMG path: user drags to Applications, right-click → Open. Not more.
- Terminal path: `curl … | bash`. One command, complete in <15s.
- No README-finding required. The DMG background tells you how to
  install. The install.sh tells you what it did.
- If `~/.local/bin` isn't on PATH, the script prints the exact line to
  add — not a link to documentation.

### 6. Updates: zero re-installation ritual

- No re-drag-to-Applications on update.
- No re-approve in Privacy & Security.
- No terminal commands to remember.
- User clicks one button in the toast, the app restarts at the new
  version. That's it.

### 7. Copy is plain English

- Toast says "Fathom 1.0.2 is downloading", not "UpdateStatus: available".
- Error says "Couldn't download — check your internet", not "HTTPError
  at net.js:42 code ECONNREFUSED".
- Buttons are verbs: "Restart to install", "Open Anyway", "Download
  manually", not "OK" / "Confirm" / "Proceed".

### 8. Visual feedback is one-to-one with action

- Action succeeds → feedback shows.
- Action doesn't happen → no feedback. (See rule 2.)
- Action is slow → progress indicator while it waits.
- Action fails → failure state shows the remedy, not the error code.

### 9. Reading (not writing) changes nothing

Clicking a lens marker, opening Preferences, hovering a control —
none of these should mutate state or fire any user-visible side
effect. Only explicit actions (pinch, click Install, pick a PDF) are
allowed to move the app to a new state.

### 10. Agent-testability

Every new control added in a change must have a keyboard equivalent
and an entry in `scripts/fathom-test.sh`, so the `fathom-e2e-test`
skill can drive it. If it can't be tested without a trackpad, it
can't be regression-tested by the harness — and it **will** regress.

## How to run this review

1. Read the diff.
2. Walk every item in the checklist against the changed files.
3. For each item, write "✓" if the change respects it, "⚠" with a
   note if ambiguous, "✗" with the exact issue if violated.
4. Before committing, all ✗ issues must be resolved (or the commit is
   an explicit deviation with the user's approval captured in the
   commit message).
5. Log the review result in the commit body so future agents can
   retrace the reasoning.

## Pitfalls to avoid

- **"The test passes" ≠ the UX is right.** Tests verify code paths;
  this review verifies mental-model alignment.
- **"I tested it on my machine" ≠ "users will find it."** Discoverability
  failures are silent — nobody reports a feature they couldn't see.
- **"It's consistent with our own prior version" ≠ "it's intuitive."**
  If an earlier version of Fathom violated a macOS convention, the fix
  is to align, not to compound.
