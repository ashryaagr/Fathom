#!/usr/bin/env bash
# Fathom installer + updater.
#
# This one script is both:
#   - the first-time installer (curl … | bash)
#   - the update mechanism (re-run it, or the in-app updater spawns it
#     with --from-zip pointing at a pre-downloaded local copy)
#
# It deliberately avoids the DMG / Squirrel.Mac path because those require
# a stable code-signing identity across builds, which we don't have (we
# ad-hoc sign every release). Instead we treat Fathom.app as a plain ZIP
# archive: download → extract → ad-hoc re-sign → clear quarantine → launch.
# This works indefinitely with ad-hoc signing and needs zero GUI steps.
#
# Usage:
#   # First install
#   curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
#
#   # Install a specific version
#   curl … | bash -s -- --version v1.0.2
#
#   # Update from an already-downloaded zip (used by the in-app updater)
#   ./install.sh --from-zip /tmp/fathom.zip --wait-pid 12345 --relaunch
#
#   # Uninstall
#   ./install.sh --uninstall

set -euo pipefail

REPO_OWNER="ashryaagr"
REPO_NAME="Fathom"
APP_NAME="Fathom"
BUNDLE_NAME="${APP_NAME}.app"
LAUNCHER_NAME="fathom"

# --- Flags -----------------------------------------------------------------

VERSION=""                # empty = latest
FROM_ZIP=""               # local zip path
WAIT_PID=""               # wait for this pid to exit before swap
RELAUNCH=0                # open the app after install
UNINSTALL=0
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)       VERSION="$2"; shift 2 ;;
    --from-zip)      FROM_ZIP="$2"; shift 2 ;;
    --wait-pid)      WAIT_PID="$2"; shift 2 ;;
    --relaunch)      RELAUNCH=1; shift ;;
    --uninstall)     UNINSTALL=1; shift ;;
    --quiet)         QUIET=1; shift ;;
    -h|--help)
      sed -n '3,40p' "$0"
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

log() { [[ $QUIET -eq 1 ]] || printf "%b\n" "$*"; }
die() { printf "Error: %s\n" "$*" >&2; exit 1; }

# --- OS + arch sanity checks ----------------------------------------------

[[ "$(uname)" == "Darwin" ]] || die "Fathom only runs on macOS."

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="arm64" ;;   # Intel builds not shipped yet; fall back so the download works
  *) die "Unsupported architecture: $ARCH_RAW" ;;
esac

# --- Install location -----------------------------------------------------
# Prefer /Applications. Fall back to ~/Applications if /Applications isn't
# writable (happens on managed Macs). Both are legitimate macOS app homes.

if [[ -w "/Applications" ]] || [[ ! -d "/Applications" ]]; then
  INSTALL_DIR="/Applications"
else
  INSTALL_DIR="${HOME}/Applications"
  mkdir -p "$INSTALL_DIR"
fi
APP_PATH="${INSTALL_DIR}/${BUNDLE_NAME}"
LAUNCHER_DIR="${HOME}/.local/bin"
LAUNCHER_PATH="${LAUNCHER_DIR}/${LAUNCHER_NAME}"

# --- Uninstall ------------------------------------------------------------

if [[ $UNINSTALL -eq 1 ]]; then
  log "Uninstalling Fathom from ${APP_PATH}…"
  rm -rf "$APP_PATH" || true
  rm -f "$LAUNCHER_PATH" || true
  log "Done. (Per-paper sidecars and settings under ~/Library/Application Support/Fathom are untouched.)"
  exit 0
fi

# --- Wait on a running copy ----------------------------------------------

if [[ -n "$WAIT_PID" ]]; then
  log "Waiting for Fathom (pid $WAIT_PID) to exit…"
  # ~15s budget; macOS app quit is usually < 1s.
  for _ in $(seq 1 75); do
    if ! kill -0 "$WAIT_PID" 2>/dev/null; then break; fi
    sleep 0.2
  done
fi

# --- Acquire the zip ------------------------------------------------------

WORK_DIR="$(mktemp -d /tmp/fathom-install.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
ZIP_PATH="${WORK_DIR}/${APP_NAME}-${ARCH}-mac.zip"

if [[ -n "$FROM_ZIP" ]]; then
  [[ -f "$FROM_ZIP" ]] || die "--from-zip '$FROM_ZIP' doesn't exist."
  log "Using local zip ${FROM_ZIP}…"
  cp "$FROM_ZIP" "$ZIP_PATH"
else
  if [[ -z "$VERSION" ]]; then
    URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${APP_NAME}-${ARCH}-mac.zip"
    log "Fetching latest Fathom…"
  else
    # Normalize: accept "1.0.2" or "v1.0.2"
    [[ "$VERSION" == v* ]] || VERSION="v${VERSION}"
    URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${VERSION}/${APP_NAME}-${ARCH}-mac.zip"
    log "Fetching Fathom ${VERSION}…"
  fi
  # -L follows redirects (GitHub hands out a presigned S3 URL), -f fails
  # on HTTP error, --retry handles transient network blips.
  curl -fL --retry 3 --retry-delay 1 -o "$ZIP_PATH" "$URL" \
    || die "Download failed. Check your internet connection, or pass --version explicitly."
fi

# --- Extract --------------------------------------------------------------

log "Extracting…"
EXTRACT_DIR="${WORK_DIR}/extract"
mkdir -p "$EXTRACT_DIR"
# ditto preserves extended attributes and is robust against zip variants
# electron-builder produces. It also writes to EXTRACT_DIR atomically.
ditto -x -k "$ZIP_PATH" "$EXTRACT_DIR" \
  || die "Extraction failed. Zip may be corrupt."
[[ -d "${EXTRACT_DIR}/${BUNDLE_NAME}" ]] \
  || die "Extracted archive has no ${BUNDLE_NAME} inside."

# --- Swap in place --------------------------------------------------------

if [[ -e "$APP_PATH" ]]; then
  log "Replacing existing ${APP_PATH}…"
  # Move the old one aside first (atomic on same filesystem) so we can
  # rollback if the swap fails. Also means the running app (if any) keeps
  # its open file handles — macOS handles rename-while-running gracefully.
  BACKUP_PATH="${WORK_DIR}/${BUNDLE_NAME}.bak"
  mv "$APP_PATH" "$BACKUP_PATH"
fi

log "Installing to ${APP_PATH}…"
# ditto also preserves metadata on the move.
ditto "${EXTRACT_DIR}/${BUNDLE_NAME}" "$APP_PATH"

# --- Clean quarantine + ad-hoc sign ---------------------------------------
# curl doesn't set the com.apple.quarantine xattr (browsers do), but ditto
# may have propagated something from the source if the zip was downloaded
# via a browser. Clear it for safety.
xattr -cr "$APP_PATH" 2>/dev/null || true

# Ad-hoc sign so the kernel's amfi loader is happy with our Mach-O layout.
# --deep signs all nested frameworks and helper binaries consistently.
if command -v codesign >/dev/null 2>&1; then
  log "Ad-hoc signing…"
  codesign --deep --force --sign - "$APP_PATH" 2>/dev/null \
    || log "  (codesign warning — app may still launch)"
else
  log "codesign not found on PATH — skipping ad-hoc signature."
fi

# --- Install the fathom CLI launcher --------------------------------------

log "Installing CLI launcher at ${LAUNCHER_PATH}…"
mkdir -p "$LAUNCHER_DIR"
cat > "$LAUNCHER_PATH" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
# Fathom CLI — thin wrapper that launches the Fathom.app.
#
# Usage:
#   fathom                  # open Fathom
#   fathom paper.pdf        # open Fathom with a paper
#   fathom update           # pull the latest version
#   fathom --version        # print the installed version
#   fathom uninstall        # remove Fathom

set -e

APP_NAME="Fathom"
# Resolve the installed app bundle (prefer /Applications over ~/Applications).
if [[ -d "/Applications/${APP_NAME}.app" ]]; then
  APP="/Applications/${APP_NAME}.app"
elif [[ -d "${HOME}/Applications/${APP_NAME}.app" ]]; then
  APP="${HOME}/Applications/${APP_NAME}.app"
else
  echo "Fathom not installed. Run:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash" >&2
  exit 1
fi

case "${1:-}" in
  update)
    echo "Updating Fathom…"
    exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh)"
    ;;
  uninstall)
    exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh) --uninstall"
    ;;
  --version|-v|version)
    PLIST="${APP}/Contents/Info.plist"
    if [[ -f "$PLIST" ]]; then
      /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PLIST"
    else
      echo "unknown"
    fi
    ;;
  --help|-h|help)
    sed -n '3,12p' "$0"
    ;;
  "")
    exec open -a "$APP"
    ;;
  *)
    # Treat trailing args as paths (or flags) to hand to the app.
    exec open -a "$APP" "$@"
    ;;
esac
LAUNCHER_EOF
chmod +x "$LAUNCHER_PATH"

# --- PATH hint ------------------------------------------------------------

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$LAUNCHER_DIR"; then
  log ""
  log "Note: ${LAUNCHER_DIR} is not on your PATH."
  log "      Add this line to your ~/.zshrc (or ~/.bashrc):"
  log "          export PATH=\"\${HOME}/.local/bin:\${PATH}\""
fi

# --- Relaunch / final message ---------------------------------------------

if [[ $RELAUNCH -eq 1 ]]; then
  log "Relaunching Fathom…"
  open -a "$APP_PATH" || true
  exit 0
fi

log ""
log "✓ Fathom installed to ${APP_PATH}"
log ""
log "Launch it:"
log "  open -a Fathom           # from Finder / anywhere"
log "  fathom                   # from terminal (if ~/.local/bin is on PATH)"
log "  fathom some-paper.pdf    # with a paper"
log ""
log "Update later: fathom update"
