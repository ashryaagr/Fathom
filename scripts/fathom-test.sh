#!/usr/bin/env bash
# Fathom smoke-test harness.
#
# Gives us (Claude + the developer) a way to drive the packaged Fathom.app,
# capture its screen state, and read its log file — without a human manually
# poking the UI. Used to catch regressions like "Try with sample paper did
# nothing" where the failure happens silently in the main process and the
# only visible signal is that nothing changed on screen.
#
# Usage:
#   scripts/fathom-test.sh reset          # wipe first-run + tour flags
#   scripts/fathom-test.sh launch         # kill any running app, launch fresh
#   scripts/fathom-test.sh shot <name>    # screencapture into /tmp/fathom-shots/
#   scripts/fathom-test.sh log [N]        # tail last N (default 40) log lines
#   scripts/fathom-test.sh click "Button Label"   # press a button in the frontmost dialog
#   scripts/fathom-test.sh key <keycode>  # send a raw key press via System Events
#
#   # Gesture keyboard equivalents — usable by a computer-use agent that
#   # can send keycodes but can't synthesize trackpad wheel events.
#   scripts/fathom-test.sh dive           # ⌘⇧D — open lens on current viewport (pinch equivalent)
#   scripts/fathom-test.sh ask            # ⌘⇧A — "Ask about viewport" (same effect)
#   scripts/fathom-test.sh back           # ⌘[ — swipe back through lens history
#   scripts/fathom-test.sh forward        # ⌘] — swipe forward
#   scripts/fathom-test.sh prefs          # ⌘, — open Preferences panel
#   scripts/fathom-test.sh open-pdf       # ⌘O — open PDF dialog

set -euo pipefail

SHOTDIR="/tmp/fathom-shots"
mkdir -p "$SHOTDIR"

case "${1:-}" in
  reset)
    SETTINGS="$HOME/Library/Application Support/Fathom/settings.json"
    if [ -f "$SETTINGS" ]; then
      # Remove first-run + tour flags so welcome dialog + in-app card re-fire.
      python3 -c "
import json, pathlib
p = pathlib.Path('''$SETTINGS''')
d = json.loads(p.read_text())
for k in ('firstRunCompletedAt','tourCompletedAt'): d.pop(k, None)
p.write_text(json.dumps(d, indent=2))
print('flags cleared')
"
    else
      echo "no settings file yet — fresh user state"
    fi
    ;;

  launch)
    pkill -x Fathom 2>/dev/null || true
    sleep 1
    # Visible launch. We used to launch hidden via `open -gj -a Fathom`
    # so the QA harness wouldn't disturb the user, but on this build's
    # Electron the BrowserWindow's `ready-to-show` apparently never
    # fires when launched hidden — `[Render] doc open` and
    # `createWindow` log lines stay silent, the renderer process spawns
    # but never paints, global shortcut keystrokes route to nothing
    # (because globalShortcut.register sits AFTER the createWindow
    # await in app.whenReady). Verified 2026-04-26 by team-lead via
    # plain `open -a` showing 1 window + full render logs.
    #
    # Visible mode = the QA harness is the right posture for live
    # testing of diagrams + screenshots. Steals focus during a test
    # run; the user is fine with that during dev iterations.
    open -a Fathom
    echo "launched (visible)"
    ;;

  # Legacy full-display screencapture. Left intact for ad-hoc
  # inspection; the QA flow should use `capture` instead, which is
  # non-disruptive.
  shot)
    name="${2:-state}"
    path="$SHOTDIR/$(date +%H%M%S)-$name.png"
    screencapture -x "$path"
    echo "$path"
    ;;

  # Non-disruptive QA screenshot. Fires the global shortcut ⌘⇧F10,
  # which the main process catches and calls webContents.capturePage
  # on. PNG lands under /tmp/fathom-shots/<ts>-qa.png regardless of
  # whether Fathom's window is visible, hidden, or occluded — no
  # screen-region capture, so the user's other apps aren't disturbed.
  capture)
    name="${2:-state}"
    before_ts=$(date +%s)
    # key code 109 = F10 on macOS (stable across keyboard layouts).
    osascript -e 'tell application "System Events" to key code 109 using {command down, shift down}' 2>/dev/null
    # Poll for the resulting file — capturePage is typically <300 ms.
    for i in $(seq 1 40); do
      latest=$(ls -t "$SHOTDIR"/*-qa.png 2>/dev/null | head -1)
      if [[ -n "$latest" ]]; then
        mtime=$(stat -f %m "$latest" 2>/dev/null || echo 0)
        if (( mtime >= before_ts )); then
          renamed="$SHOTDIR/$(date +%H%M%S)-$name.png"
          mv "$latest" "$renamed"
          echo "$renamed"
          exit 0
        fi
      fi
      sleep 0.15
    done
    echo "(capture timeout — is Fathom running? check with: pgrep -x Fathom)" >&2
    exit 1
    ;;

  # ⌘⇧F9 — trigger the bundled sample paper to open. Works even when
  # Fathom is hidden / background because it's a global shortcut
  # registered by the main process.
  sample)
    # key code 101 = F9 on macOS.
    osascript -e 'tell application "System Events" to key code 101 using {command down, shift down}' 2>/dev/null
    echo "(sample requested)"
    ;;

  log)
    n="${2:-40}"
    tail -n "$n" "$HOME/Library/Logs/Fathom/fathom.log" 2>/dev/null || echo "(no log yet)"
    ;;

  click)
    # Click a named button in the frontmost Fathom window/sheet.
    label="${2:?click requires a button label}"
    osascript <<EOF
tell application "System Events"
  tell process "Fathom"
    set frontmost to true
    try
      click button "$label" of window 1
    on error errMsg
      try
        # Sheet / modal dialog case
        click button "$label" of sheet 1 of window 1
      on error
        return "NOT FOUND: $label — " & errMsg
      end try
    end try
  end tell
end tell
EOF
    ;;

  key)
    # Raw keycode, for e.g. Escape=53 Return=36
    keycode="${2:?key requires a keycode}"
    osascript -e "tell application \"System Events\" to key code $keycode"
    ;;

  # --- QA gesture aliases — non-disruptive ---
  # Each fires a global keyboard shortcut that Fathom's main process
  # registered on startup, so the keystroke reaches Fathom regardless
  # of which app is frontmost. NO `tell app to activate` calls — the
  # user keeps their cursor + Space focus where they were.
  dive|ask)
    # ⌘⇧F8 → renderer triggers commit-semantic-focus on current viewport.
    osascript -e 'tell application "System Events" to key code 100 using {command down, shift down}' 2>/dev/null
    ;;
  back)
    # ⌘⇧F7 → renderer pops the lens stack.
    osascript -e 'tell application "System Events" to key code 98 using {command down, shift down}' 2>/dev/null
    ;;
  forward)
    # ⌘⇧F6 → renderer advances the forward stack.
    osascript -e 'tell application "System Events" to key code 97 using {command down, shift down}' 2>/dev/null
    ;;
  prefs)
    # ⌘⇧F5 → main-process opens Preferences modal.
    osascript -e 'tell application "System Events" to key code 96 using {command down, shift down}' 2>/dev/null
    ;;
  whiteboard-generate)
    # ⌘⇧F4 → switch to the Whiteboard tab + auto-accept the consent
    # affordance for the currently-open paper. Smoke-test the pipeline
    # end-to-end against logs:
    #   scripts/fathom-test.sh sample
    #   scripts/fathom-test.sh whiteboard-generate
    #   ... wait ~90 s ...
    #   scripts/fathom-test.sh log 200 | grep '\[Whiteboard'
    # The Whiteboard tab auto-generates on mount when no saved scene
    # exists, so the tab-switch alone drives the pipeline. Tail logs
    # for `[tool_use] mcp__excalidraw__create_view` (the agent's first
    # canvas paint) and `[Whiteboard Persist]` (final scene saved).
    # key code 118 = F4.
    osascript -e 'tell application "System Events" to key code 118 using {command down, shift down}' 2>/dev/null
    echo "(whiteboard generation triggered; tail logs for [tool_use] mcp__excalidraw__create_view)"
    ;;
  open-pdf)
    # No global shortcut for this one yet — the file picker requires
    # an active window context. Falls back to window-targeted
    # keystroke; *will* steal focus if Fathom isn't already on the
    # active Space. Document this; agents should prefer `sample` in
    # QA flows.
    osascript -e 'tell application "System Events" to keystroke "o" using {command down}' 2>/dev/null
    ;;

  *)
    echo "usage: $0 {reset|launch|shot [name]|capture [name]|sample|log [n]|click <label>|key <keycode>|dive|ask|back|forward|prefs|open-pdf|whiteboard-generate}" >&2
    echo "       capture             = non-disruptive offscreen screenshot via ⌘⇧F10 global shortcut (preferred for QA)" >&2
    echo "       sample              = open the bundled sample paper via ⌘⇧F9 global shortcut" >&2
    echo "       whiteboard-generate = switch to Whiteboard tab via ⌘⇧F4 (auto-generates; ~\$1 spend)" >&2
    exit 1
    ;;
esac
