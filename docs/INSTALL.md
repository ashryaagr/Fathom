# Installing Fathom

macOS, Apple Silicon. Two install paths — pick whichever feels natural:

- **Option A — DMG**: the familiar drag-to-Applications flow. Requires
  approving the app once via System Settings the first time you launch it.
- **Option B — `install.sh`**: `curl | bash`. No Gatekeeper approval, no
  drag. Adds a `fathom` terminal launcher. Same app, different wrapper.

Both end up as `/Applications/Fathom.app` and are updated afterwards by
the same in-app updater — see [DISTRIBUTION.md](./DISTRIBUTION.md) for why
both paths converge on one mechanism.

Both require the Claude Code CLI at runtime — see
[Prerequisites](#3-prerequisites).

- [1. Download Fathom](#1-download-fathom) — DMG or curl.
- [2. First launch: approve the app](#2-first-launch-approve-the-app) —
  DMG users only. Option B skips this.
- [3. Prerequisites](#3-prerequisites) — Claude Code CLI.
- [4. Build from source](#4-build-from-source) — modify or inspect Fathom.
- [5. Dev container](#5-dev-container-docker) — Linux build environment.
- [6. Where Fathom stores your data](#6-where-fathom-stores-your-data)
- [7. Verifying it works](#7-verifying-it-works)

---

## 1. Download Fathom

### Option A — `install.sh` (primary)

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

That's it. The script:

1. Downloads `Fathom-arm64.zip` from the latest GitHub Release.
2. Extracts to `/Applications/Fathom.app` (or `~/Applications/` if the
   system directory isn't writable).
3. Clears the `com.apple.quarantine` xattr — Gatekeeper treats the
   bundle as a locally-built app, so **no "Open Anyway" prompt the
   first time you launch**.
4. Re-applies ad-hoc signing so the loader is satisfied.
5. Installs a `fathom` launcher at `~/.local/bin/fathom`:
   ```bash
   fathom                 # launch the app
   fathom paper.pdf       # open with a paper
   fathom update          # pull latest (same script runs again)
   fathom --version
   fathom uninstall
   ```
6. Launches Fathom — you land on the welcome screen in one motion.

If `~/.local/bin` isn't already on your `PATH`, the script prints the
one line you need to add to `~/.zshrc` (or `~/.bashrc`).

**Want to read the script before piping it to bash?**

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh -o install.sh
less install.sh
bash install.sh
```

The script lives [here in the repo](../install.sh) — about 200 lines.

**Install a specific version:**
```bash
curl -fsSL …/install.sh | bash -s -- --version v1.0.4
```

**Uninstall:**
```bash
fathom uninstall
```

### Option B — DMG

If you'd rather drag-to-Applications:

1. **Download** [`Fathom-arm64.dmg`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg).
2. Double-click the DMG to mount it.
3. Drag `Fathom.app` onto the **Applications** folder shown in the DMG window.
4. Close the disk image.
5. Open `/Applications/Fathom.app`. macOS will block it the first time
   with a "can't be opened because Apple cannot check it" warning —
   that's expected. Continue to
   [Section 2](#2-first-launch-approve-the-app) for the one-time
   approval.

| Architecture | Direct link |
|---|---|
| Apple Silicon (M1 / M2 / M3 / M4) | [Fathom-arm64.dmg](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg) |
| Apple Silicon, zipped `.app` | [Fathom-arm64.zip](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.zip) |
| Intel | *(build from source; prebuilt x64 lands when demand warrants)* |

Auto-updates are identical for both paths — once installed, Fathom
pulls new versions in-app; see [DISTRIBUTION.md](./DISTRIBUTION.md).

---

## 2. First launch: approve the app

**Option B users skip this section** — the `xattr -cr` in the install
script already cleared the quarantine bit, so your first `open -a Fathom`
launches directly with no dialog.

**Option A (DMG) users read on.**

Fathom v1 is distributed outside the Apple Developer Program, so the first
time you open it, macOS Gatekeeper will block it. This is standard for any
non-App-Store app; you approve it once, and it runs normally after that.

**Step-by-step:**

1. Double-click **Fathom** in `/Applications`.
2. macOS shows a dialog: *"Fathom" can't be opened because Apple cannot check
   it for malicious software.* Click **Done**.
3. Open **System Settings** → **Privacy & Security** (the same pane where
   FileVault and the lock-screen settings live).
4. Scroll down to the **Security** section. You'll see a line near the bottom:
   *"Fathom was blocked from use because it is not from an identified
   developer."* Next to it: an **Open Anyway** button.
5. Click **Open Anyway**. macOS prompts for your login password (or Touch ID)
   to confirm.
6. Fathom relaunches. A final confirmation appears: *"Are you sure you want
   to open it?"* Click **Open**.

You'll never see these dialogs again for this install. Future launches are
identical to any other Mac app.

> **Why the extra step?** Apple requires developers to pay $99/year and
> notarize every build to skip this flow. Fathom is free and opts out of that
> for v1; the approval above is Apple's sanctioned escape hatch for apps
> distributed outside the Developer Program. Signed + notarized builds are on
> the roadmap.

**If the Privacy & Security pane doesn't show the *"Open Anyway"* button** —
this usually means the DMG was served from a mirror/proxy that stripped the
app's code signature. Re-download from the [official release
page](https://github.com/ashryaagr/Fathom/releases/latest), which always
resolves to the current signed build.

---

## 3. Prerequisites

Three things Fathom needs. The app checks for them on launch and tells
you exactly what's missing.

### Checklist

- [ ] **macOS on Apple Silicon.** Fathom ships arm64 binaries; Intel
  Macs need to build from source today.
- [ ] **Claude Code CLI installed** (`claude` on your `$PATH`).
- [ ] **Claude Code signed in** to your Anthropic account.

### 3.1 Claude Code CLI — install

Fathom uses your existing Claude Code authentication — no API key to
paste anywhere inside Fathom.

```bash
# One-line install from the official source:
curl -fsSL https://claude.ai/install.sh | sh
```

Verify it ended up on your `$PATH`:

```bash
which claude          # should print something like ~/.local/bin/claude
claude --version
```

macOS GUI apps inherit their `$PATH` from `/usr/libexec/path_helper`,
not your shell config. If `claude` is only visible in your interactive
shell, put it in a system-discovered location like `/usr/local/bin` or
`/opt/homebrew/bin`, or symlink it there.

### 3.2 Sign in to Claude Code

```bash
claude login
```

This opens a browser tab for the sign-in flow. Same account as your
Claude subscription; after this step, Fathom can invoke the Agent SDK
without any further auth.

### 3.3 What Fathom does NOT need

No **poppler**, no **pdftoppm**, no **Ghostscript**, no **Python**, no
**Node**, no **Homebrew** (unless you already use it for Claude Code).
Fathom extracts PDF text and figure images through its own pdf.js
pipeline and writes a per-paper index that Claude reads via `Read` /
`Grep` / `Glob`.

---

## 4. Build from source

```bash
git clone https://github.com/ashryaagr/Fathom.git
cd Fathom
npm install
npm run rebuild            # rebuild better-sqlite3 for Electron's Node ABI
```

**Run in dev:**
```bash
npm run dev
```
Opens an Electron window with hot-reload for the renderer. Main-process
changes require restarting (`Ctrl+C` and re-run).

**Produce a distributable:**
```bash
npm run dist:mac           # arm64 (default on Apple Silicon)
npm run dist:mac-intel     # x64
npm run dist:mac-both      # both
```

Outputs land in `dist/`:
- `Fathom-arm64.dmg`
- `Fathom-arm64.zip`
- `latest-mac.yml` (auto-updater metadata)

The build runs an `afterSign` step (see `electron-builder.config.cjs`) that
ad-hoc signs the full bundle with `codesign --deep --force --sign -` so the
resulting app clears Gatekeeper's "damaged" check when downloaded.

**Regenerate the app icon:**
```bash
npm run build-icon
```
Re-rasterizes `resources/icon.svg` into `resources/icon.icns` and
`resources/icon.png` used by electron-builder.

---

## 5. Dev container (Docker)

See [DOCKER.md](./DOCKER.md) for a Linux-based build environment with Node,
Python, and Electron build deps pre-installed. Useful for CI and for
contributors who don't want to install the full toolchain on their host.

The Docker image builds and tests the Node/TypeScript code only — the DMG
itself still has to be produced on a Mac (for `codesign` and `iconutil`).

---

## 6. Where Fathom stores your data

All per-paper state lives under the app's data directory, keyed by the
PDF's content hash so state survives when you rename or move the PDF:

```
~/Library/Application Support/Fathom/
  ├── lens.db                            ← SQLite: regions, Q&A threads, zoom paths
  ├── settings.json                      ← preferences (extra dirs, custom instructions)
  └── sidecars/<contentHash>/            ← one folder per paper
      ├── content.md                     ← full paper text, reading order
      ├── images/
      │   └── page-003-fig-1.png         ← cropped figures only
      ├── zooms/
      │   └── <lensId>.png               ← exact viewport crop per lens
      ├── digest.json                    ← structured section/figure map
      └── MANIFEST.md                    ← layout reference for Claude
```

State is content-addressed by SHA-256 of the PDF bytes, so moving or
renaming the PDF keeps your reading session intact.

To uninstall cleanly:
```bash
fathom uninstall                                      # removes the app + launcher
rm -rf ~/Library/Application\ Support/Fathom          # removes all papers' state
```

Or via the classic DMG-era instructions:
```bash
rm -rf /Applications/Fathom.app
rm -rf ~/Library/Application\ Support/Fathom
rm -f ~/.local/bin/fathom
```

---

## 7. Verifying it works

1. Launch Fathom. Window title bar shows `Fathom` when no PDF is open.
2. Click **Open PDF…** and pick a research paper.
3. A toast at the bottom-right reads **"Indexing paper…"** (spinner). After
   10–60 seconds it flips to green **"Paper indexed ✓"** or red **"Indexing
   failed — …"**. Follow the error hint if red.
4. Hold **⌘** and pinch on any paragraph → release ⌘ → the Focus View opens
   with a streaming explanation within 1–3 seconds.
5. DevTools console (Cmd+Option+I) shows `[Fathom] …` lines for every
   subsystem. If anything stalls, the last log line tells you where.

If step 4 doesn't produce a response, the most likely cause is that
`claude` isn't visible to a GUI-launched macOS app. Run:
```bash
/Applications/Fathom.app/Contents/MacOS/Fathom
```
from Terminal; the app inherits your shell PATH that way. If it works from
Terminal but not via double-click, add a symlink to `claude` in `/usr/local/bin`.
