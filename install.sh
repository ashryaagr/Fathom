#!/usr/bin/env bash
# Fathom install script — the no-Gatekeeper-drama way.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
#
# Files downloaded via curl carry no macOS quarantine flag, so this path
# avoids the "Fathom is damaged and can't be opened" error you'd hit from
# a browser DMG download of an unsigned app.

set -euo pipefail

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
info() { printf "%s==>%s %s\n" "$BLUE" "$RESET" "$1"; }
ok()   { printf "%s✓%s  %s\n" "$GREEN" "$RESET" "$1"; }
fail() { printf "%s✗%s  %s\n" "$RED" "$RESET" "$1" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || fail "Fathom only runs on macOS."

arch=$(uname -m)
case "$arch" in
  arm64) asset="Fathom-arm64.dmg" ;;
  x86_64)
    fail "Intel Macs aren't supported in v1. Build from source: https://github.com/ashryaagr/Fathom#build-from-source"
    ;;
  *) fail "Unsupported architecture: $arch" ;;
esac

url="https://github.com/ashryaagr/Fathom/releases/latest/download/${asset}"
tmp=$(mktemp -d -t fathom-install)
mnt="$tmp/mnt"
mkdir -p "$mnt"

cleanup() {
  hdiutil detach -quiet "$mnt" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

info "Downloading $asset…"
curl -fL --progress-bar -o "$tmp/Fathom.dmg" "$url"

info "Mounting disk image…"
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$tmp/Fathom.dmg" >/dev/null
[[ -d "$mnt/Fathom.app" ]] || fail "Fathom.app not found inside the DMG."

if [[ -w /Applications ]]; then
  dest="/Applications"
else
  dest="$HOME/Applications"
  mkdir -p "$dest"
fi

if [[ -d "$dest/Fathom.app" ]]; then
  info "Replacing existing $dest/Fathom.app…"
  rm -rf "$dest/Fathom.app"
fi

info "Copying Fathom.app to $dest…"
ditto "$mnt/Fathom.app" "$dest/Fathom.app"

# Belt-and-suspenders: strip any quarantine xattr that may have hitched a ride.
xattr -cr "$dest/Fathom.app" 2>/dev/null || true
ok "Installed to $dest/Fathom.app"

cat <<EOF

${GREEN}Fathom is ready.${RESET}

  ${DIM}Launch:${RESET}  open -a Fathom
  ${DIM}Path:  ${RESET}  $dest/Fathom.app

${DIM}Prerequisite: the \`claude\` CLI must be installed and authenticated for
explanations to stream. If you don't have it:
  curl -fsSL https://claude.ai/install.sh | sh   &&   claude login${RESET}
EOF
