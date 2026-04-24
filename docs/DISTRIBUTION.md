# Distribution strategy

Fathom is distributed without an Apple Developer ID. This page documents
how that constraint shapes every install and update path, and why the
design converges on one script — `install.sh` — powering both.

## The constraint: ad-hoc signing

An Apple Developer ID costs $99/year and attaches a stable cryptographic
identity to every build. With one, macOS Gatekeeper lets the app launch
without a warning, and Squirrel.Mac (electron-updater's install engine)
can swap bundles in place on update because the "designated requirement"
stays the same across versions.

Without one, we ad-hoc sign. `codesign --deep --force --sign -` runs on
every build and produces a valid-but-identityless signature. The linker
is happy; the kernel loader is happy; Gatekeeper can be taught to open
the app once with the *right-click → Open* ritual. But Squirrel.Mac
refuses: the "code requirement" it derives from the running app doesn't
match the next build (CDHash is content-derived, so every rebuild looks
like a different identity), and it throws:

```
code failed to satisfy specified code requirement(s)
```

…and fails the install.

## The two install paths (both supported)

### Option A — DMG

```
Fathom-arm64.dmg  →  drag to /Applications  →  right-click → Open (once)
```

Familiar to any Mac user. What 80% of users will reach for. Ships the
exact same `Fathom.app` that Option B delivers.

### Option B — `install.sh` via curl

```
curl -fsSL …/install.sh | bash
```

Same as the install flow developers know from Claude Code, `rustup`,
`nvm`, `deno`, Homebrew. The script:

1. Downloads `Fathom-arm64.zip` from GitHub Releases.
2. Extracts to `/Applications/Fathom.app` (or `~/Applications/` on
   managed Macs where `/Applications` isn't writable).
3. Clears the `com.apple.quarantine` extended attribute — `curl`
   doesn't set it the way Safari does, so Gatekeeper treats the
   extracted bundle as a locally-built app and doesn't prompt. **No
   right-click → Open ritual.**
4. Re-applies ad-hoc signing so the loader stays happy.
5. Installs a `fathom` launcher at `~/.local/bin/fathom` for terminal
   use.

For users who distrust piping curl into bash (a healthy instinct), the
README documents the `curl -o install.sh; less install.sh; bash install.sh`
pattern. The script is ~200 lines of readable shell.

## Why the same script also powers updates

Auto-updating is exactly the same problem as first-install: replace an
existing `Fathom.app` bundle with a new one. Once we have a script that
does this correctly for the install case, there's no reason to write a
*second* mechanism for updates.

The in-app updater (`src/main/updater.ts`):

1. Uses `electron-updater` only for the *check* — it knows how to parse
   `latest-mac.yml` from GitHub Releases. `autoDownload` is off;
   Squirrel never runs.
2. On `update-available`, downloads the zip to `/tmp` ourselves (not
   via Squirrel).
3. On user click "Install", spawns the bundled `install.sh` with
   `--from-zip /tmp/…zip --wait-pid <our-pid> --relaunch` as a
   detached child process, then calls `app.quit()`.
4. The script waits for our process to exit, swaps the bundle, clears
   quarantine, re-signs, and relaunches the new version.

The user sees a toast → click "Restart to install" → the app vanishes
for ~2 seconds → the new version comes back. No dialogs, no Finder
interaction, no Squirrel, no DMG mount.

**Critically, this works identically regardless of whether the user
installed via DMG or via curl.** Both paths produced the same
`Fathom.app`; both are updated by the same script.

## Why this design

1. **One mechanism to test.** We only have to keep `install.sh`
   working. Breaking the update path means breaking the install path
   — and users will notice that before a release ships.
2. **No Apple Developer fee.** $99/year is cheap insurance for a
   commercial product; for a free, open-source tool shipped by one
   person, it's overhead that adds no meaningful user-facing value.
3. **Works in both audiences.** DMG for users who expect DMG. Terminal
   for users who expect curl-pipe-bash. Neither camp is asked to
   adopt the other camp's ritual.
4. **Auditable.** The script is in the repo, reviewable on GitHub,
   readable in ~200 lines. The in-app updater is a thin wrapper that
   shells out to it.

## When to revisit

We'd switch to Developer ID signing when any of these become true:

- **Fathom ships to a non-technical audience at scale.** First-install
  friction (the right-click → Open ritual for DMG users) is a real
  drop-off point for users who aren't developers. Developer ID removes
  it.
- **macOS tightens ad-hoc signing further.** Sequoia (15+) has
  already introduced some edge cases where ad-hoc-signed apps from
  outside the App Store can trigger additional warnings. If a future
  macOS version blocks them outright, we'd need to pivot.
- **The install script starts accumulating edge cases.** If we find
  ourselves writing special-case logic for obscure filesystem layouts
  or permissions setups, Apple's signing + Gatekeeper machinery
  becomes worth the $99.

Until then, the script is the cleanest path. See [`install.sh`](../install.sh)
for the code.

## Files involved

```
install.sh                          # the universal install/update script
src/main/updater.ts                 # in-app updater (spawns install.sh)
electron-builder.config.cjs         # bundles install.sh + configures zip target
docs/INSTALL.md                     # user-facing install guide
docs/DISTRIBUTION.md                # this file
```

## Testing a release end-to-end

Per the lesson we learned the hard way (v1.0.0 → v1.0.1 shipped with a
broken Squirrel-based update path), every release **must** be tested on
a real version bump before being declared done:

```bash
# Install v(N)
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
open -a Fathom     # verify it launches

# Ship v(N+1) to GitHub Releases
npm run dist:mac
gh release create v(N+1) dist/*.zip dist/*.dmg dist/latest-mac.yml

# In the running v(N) app:
#   - wait for the auto-update toast (or use "Help → Check for Updates")
#   - click "Restart to install"
#   - verify the app relaunches at v(N+1)
#   - verify no Gatekeeper warning, no terminal prompts
```

This loop is captured as a skill for the agent harness: see
[`.claude/skills/fathom-release.md`](../.claude/skills/fathom-release.md).
