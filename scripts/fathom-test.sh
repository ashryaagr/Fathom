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
    open -a Fathom
    echo "launched"
    ;;

  shot)
    name="${2:-state}"
    path="$SHOTDIR/$(date +%H%M%S)-$name.png"
    screencapture -x "$path"
    echo "$path"
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

  # --- Gesture keyboard equivalents ---
  dive|ask)
    # ⌘⇧D / ⌘⇧A — semantic-zoom commit on current viewport.
    osascript -e 'tell application "Fathom" to activate' \
      -e 'delay 0.2' \
      -e 'tell application "System Events" to keystroke "d" using {command down, shift down}'
    ;;
  back)
    # ⌘[ — swipe back through lens history.
    osascript -e 'tell application "Fathom" to activate' \
      -e 'delay 0.2' \
      -e 'tell application "System Events" to keystroke "[" using {command down}'
    ;;
  forward)
    # ⌘] — swipe forward.
    osascript -e 'tell application "Fathom" to activate' \
      -e 'delay 0.2' \
      -e 'tell application "System Events" to keystroke "]" using {command down}'
    ;;
  prefs)
    # ⌘, — open Preferences.
    osascript -e 'tell application "Fathom" to activate' \
      -e 'delay 0.2' \
      -e 'tell application "System Events" to keystroke "," using {command down}'
    ;;
  open-pdf)
    # ⌘O — open the PDF picker.
    osascript -e 'tell application "Fathom" to activate' \
      -e 'delay 0.2' \
      -e 'tell application "System Events" to keystroke "o" using {command down}'
    ;;

  *)
    echo "usage: $0 {reset|launch|shot [name]|log [n]|click <label>|key <keycode>|dive|ask|back|forward|prefs|open-pdf}" >&2
    exit 1
    ;;
esac
