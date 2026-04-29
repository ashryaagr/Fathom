#!/usr/bin/env bash
# Production-build smoke test.
#
# Run AFTER `npm run dist:mac` and BEFORE `./install.sh`. Checks that
# the packaged app has all the bits the runtime needs:
#   1. Vendor excalidraw-mcp is in app.asar.unpacked (so child_process
#      .spawn can execute it). Bug we hit on 0.1.4 was that vendor was
#      packed inside app.asar where Node's spawn can't reach.
#   2. Vendor `dist/index.js` actually launches and prints a listening
#      URL (proves spawn works, PORT=0 mechanism works, the file is
#      complete).
#   3. The fathom-whiteboard package is at the expected version.
#
# Exits non-zero on any failure with a clear message. No user-state
# touched: extracts the zip to a tmp dir, never touches /Applications,
# never touches ~/Library/Application Support/Fathom.

set -euo pipefail

ZIP="${1:-dist/Fathom-arm64.zip}"
EXPECTED_FW_VERSION="${EXPECTED_FW_VERSION:-}"

if [ ! -f "$ZIP" ]; then
  echo "✗ smoke: zip not found at $ZIP" >&2
  exit 1
fi

TMPDIR=$(mktemp -d -t fathom-smoke-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

echo "→ smoke: extracting $ZIP → $TMPDIR"
ditto -x -k "$ZIP" "$TMPDIR" 2>/dev/null

APP="$TMPDIR/Fathom.app"
if [ ! -d "$APP" ]; then
  echo "✗ smoke: Fathom.app not found in zip" >&2
  exit 1
fi

UNPACKED="$APP/Contents/Resources/app.asar.unpacked"
VENDOR_ENTRY="$UNPACKED/node_modules/fathom-whiteboard/vendor/excalidraw-mcp/dist/index.js"

# CHECK 1 — vendor unpacked
if [ ! -f "$VENDOR_ENTRY" ]; then
  echo "✗ smoke: vendor excalidraw-mcp dist/index.js NOT in app.asar.unpacked" >&2
  echo "         expected: $VENDOR_ENTRY" >&2
  echo "         (asarUnpack rule in electron-builder.config.cjs is missing or wrong)" >&2
  exit 1
fi
echo "✓ smoke: vendor excalidraw-mcp is in app.asar.unpacked"

# CHECK 2 — vendor dist actually launches with PORT=0 and prints a listening URL
echo "→ smoke: launching vendor MCP to verify spawn path…"
LAUNCH_LOG=$(mktemp -t fathom-smoke-launch-XXXXXX)
trap 'rm -rf "$TMPDIR" "$LAUNCH_LOG"' EXIT

# Use the system node (not Electron's exe) — the vendor is plain Node code
# and spawning it via system node confirms the file is intact + runnable.
PORT=0 node "$VENDOR_ENTRY" > "$LAUNCH_LOG" 2>&1 &
NODE_PID=$!
LISTEN_URL=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.5
  if grep -qE "listening on https?://" "$LAUNCH_LOG" 2>/dev/null; then
    LISTEN_URL=$(grep -oE "listening on https?://[^ ]*" "$LAUNCH_LOG" | head -1 || true)
    break
  fi
done
kill "$NODE_PID" 2>/dev/null || true
wait "$NODE_PID" 2>/dev/null || true

if [ -z "$LISTEN_URL" ]; then
  echo "✗ smoke: vendor MCP did not print listening URL within 5s" >&2
  echo "         log:" >&2
  sed 's/^/         /' "$LAUNCH_LOG" >&2
  exit 1
fi
echo "✓ smoke: vendor MCP launched successfully ($LISTEN_URL)"

# CHECK 3 — fathom-whiteboard version
FW_PKG="$UNPACKED/node_modules/fathom-whiteboard/package.json"
if [ ! -f "$FW_PKG" ]; then
  # Fallback: package.json may live inside asar (only the vendor needs to be unpacked).
  FW_PKG="$APP/Contents/Resources/app.asar"
  FW_VERSION=$(npx --yes @electron/asar extract-file "$FW_PKG" \
    node_modules/fathom-whiteboard/package.json 2>/dev/null \
    | python3 -c "import sys, json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")
else
  FW_VERSION=$(python3 -c "import json; print(json.load(open('$FW_PKG'))['version'])")
fi
echo "✓ smoke: fathom-whiteboard version is $FW_VERSION"

if [ -n "$EXPECTED_FW_VERSION" ] && [ "$FW_VERSION" != "$EXPECTED_FW_VERSION" ]; then
  echo "✗ smoke: expected fathom-whiteboard $EXPECTED_FW_VERSION, got $FW_VERSION" >&2
  exit 1
fi

echo "✓ smoke: all checks passed"
