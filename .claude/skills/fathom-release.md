---
name: fathom-release
description: Build, sign, and publish a new Fathom release; verify the 1→N+1 auto-update works end-to-end before declaring done. Use when shipping a version bump.
type: skill
---

# Fathom release pipeline

Fathom ships as a single `Fathom.app` bundle, distributed via both DMG and
a `curl | bash` install script. Both are generated from the same build.
See [docs/DISTRIBUTION.md](../../docs/DISTRIBUTION.md) for the design.

## When to use this skill

- User says "cut a release" / "ship v1.0.2".
- A non-trivial feature has landed on main and needs to reach users.
- A bugfix affects distribution / install / update flow — those
  **must** be tested on a real version bump, not just in dev.

## Prerequisites on the dev machine

- macOS Apple Silicon with Xcode CLI tools (for `codesign`, `ditto`).
- `gh` CLI, authenticated against github.com/ashryaagr/Fathom.
- Node + npm, dependencies installed, `npm run rebuild` once to build
  `better-sqlite3` against Electron's ABI.
- A clean working tree (no untracked files in `dist/`).

## The pipeline

```bash
# 0. Confirm working tree clean + on main
git status
git branch --show-current       # expect: main

# 1. Bump the version
#    Follow SemVer. Anything touching install/update is at least a minor.
npm version <patch|minor|major> --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "Releasing v$VERSION"

# 2. Build the mac artifacts — arm64 only for v1
npm run dist:mac
# Produces:
#   dist/Fathom-arm64.dmg            — drag-to-Applications installer
#   dist/Fathom-arm64.zip        — zipped .app (what install.sh consumes)
#   dist/latest-mac.yml              — electron-updater metadata

# 3. Verify the ad-hoc signature before uploading
codesign --verify --deep --strict "dist/mac-arm64/Fathom.app"
# Expect: no output + exit 0. Any error here means the afterSign hook broke.

# 4. Tag and push
git add package.json package-lock.json
git commit -m "v$VERSION"
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

# 5. Create the GitHub release with all artifacts
gh release create "v$VERSION" \
  dist/Fathom-arm64.dmg \
  dist/Fathom-arm64.zip \
  dist/latest-mac.yml \
  --title "v$VERSION" \
  --notes-file RELEASE_NOTES.md    # or --generate-notes
```

## Mandatory end-to-end verification (do not skip)

Lessons from v1.0.0 → v1.0.1 and v1.0.1 → v1.0.2: update paths that
look right in code have twice failed in the real world. Every
release **must** be verified with a real version-bump install before
it's declared done.

### Special case: the release changes updater.ts

If this release modifies `src/main/updater.ts` — including config
flags like `autoDownload` / `autoInstallOnAppQuit`, the download
pipeline, or the install trigger — treat it as a **migration
release**, not a normal update. Existing users on v(N-1) cannot
auto-update to v(N), because the bit that's broken on v(N-1) is
exactly the bit that would have fetched v(N). They're stuck behind
the old updater.

Required actions for a migration release:

1. **Call it out in release notes, at the top.** "If you're on
   v(N-1), run this one-liner once to catch up:
   `curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash`"
   then a sentence explaining why.
2. **Actively quit-and-reinstall the test machine.** You cannot
   confirm v(N-1) → v(N) automatic update for a migration release
   — that's the expected failure. Instead, verify that the
   one-liner upgrade path works, and that v(N) → v(N+1) auto
   update works (see the normal test loop below).
3. **From v(N) onwards, the updater is fixed.** Future auto-
   updates land without intervention.

### Normal (non-migration) release test loop

```bash
# In a separate terminal, install the PREVIOUS version and watch it update:

# 1. Install v(N-1) fresh (or keep your existing install)
#    If starting fresh:
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh \
  | bash -s -- --version "v$PREV_VERSION"

# 2. Launch it
fathom
# Verify: window shows vPREV_VERSION in DevTools (`app.getVersion()`).

# 3. In the app: Help menu → Check for Updates
#    OR wait ~3 seconds for auto-check on launch.
#    Expect: bottom-left toast "Fathom vNEW is downloading".

# 4. When toast flips to "ready", click "Restart to install".
#    Expect: app vanishes for ~2 seconds, relaunches at vNEW.
#    Verify: `fathom --version` prints vNEW.

# 5. Verify the curl install works for first-time users too
curl -fsSL …/install.sh | bash
open -a Fathom
# Expect: app launches immediately, no Gatekeeper warning.
```

If any step fails, **do not declare the release done**. Fix the bug,
bump the patch version, and re-release. A broken update mechanism means
every user gets stuck on the previous version.

## Post-release: update the curl URL if main changed

The install script URL is `https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh`.
If `install.sh` itself changed as part of this release, make sure the
commit landed on main before announcing — otherwise new users will pull
a stale script.

## Rollback

Releases are additive. To "roll back":

```bash
# 1. Delete the broken release tag
gh release delete "v$BAD_VERSION" --yes
git push --delete origin "v$BAD_VERSION"

# 2. Re-publish the previous release with the same asset names so that
#    /releases/latest/download/<asset> points to the good version again.
gh release edit "v$PREV_VERSION" --latest
```

A user who already auto-updated to the broken version is stuck on it
until the next release — this is why step 4 of verification is not
optional.

## Checklist before calling it done

- [ ] Working tree clean, on main.
- [ ] Version bumped in `package.json`.
- [ ] `npm run dist:mac` completed without errors.
- [ ] `codesign --verify --deep --strict` passed.
- [ ] Release created on GitHub with all 3 artifacts uploaded.
- [ ] v(N-1) running copy auto-updated to vN cleanly.
- [ ] `fathom --version` confirms vN after update.
- [ ] Fresh `curl | bash` install produces a launchable app with no
      Gatekeeper warning.
- [ ] No error lines in `~/Library/Logs/Fathom/fathom.log` after a
      full round-trip open → dive → back → close.
