# Installing Fathom

macOS, Apple Silicon. Two real paths: download the DMG, or build from source.
Both require the Claude Code CLI at runtime — see [Prerequisites](#prerequisites).

- [1. Download Fathom](#1-download-fathom) — recommended.
- [2. First launch: approve the app](#2-first-launch-approve-the-app) — the
  macOS Privacy & Security dialog you'll see once.
- [3. Prerequisites](#3-prerequisites) — Claude Code CLI.
- [4. Build from source](#4-build-from-source) — if you want to modify or inspect Fathom.
- [5. Dev container](#5-dev-container-docker) — Linux-based build environment.
- [6. Where Fathom stores your data](#6-where-fathom-stores-your-data)
- [7. Verifying it works](#7-verifying-it-works)

---

## 1. Download Fathom

**→ [`Fathom-arm64.dmg`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg)**

| Architecture | Direct link |
|---|---|
| Apple Silicon (M1 / M2 / M3 / M4) | [Fathom-arm64.dmg](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg) |
| Apple Silicon, zipped `.app` | [Fathom-arm64-mac.zip](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip) |
| Intel | *(v1: build from source; prebuilt x64 lands when demand warrants)* |

GitHub resolves `/releases/latest/download/<asset>` to the newest release, so
these links stay valid across versions.

Double-click the DMG, drag `Fathom.app` onto the Applications folder in the
DMG window, then close the disk image. The app now lives in `/Applications`.

---

## 2. First launch: approve the app

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

### Claude Code CLI (required)

Fathom uses your existing Claude Code authentication — no API key to paste
anywhere.

```bash
# If you don't have claude installed yet:
curl -fsSL https://claude.ai/install.sh | sh
claude login
```

Verify:
```bash
which claude
claude --version
```

If `claude` isn't in your PATH, Fathom will fail to generate explanations and
the indexing toast will say so. (macOS GUI apps inherit PATH from
`/usr/libexec/path_helper`, not your shell config, so make sure `claude` is
installed somewhere in the system PATH — `/usr/local/bin` or `/opt/homebrew/bin`
both work.)

### poppler (optional, for now)

Needed during the one-time indexing pass if you want Claude to read figure
pixels straight from the source PDF. After indexing, Fathom uses the cropped
figure PNGs it wrote to the sidecar folder and does not need poppler again.

```bash
brew install poppler
```

Without poppler, indexing may fail or produce a lower-precision digest on
figure-heavy papers. Removing this dependency entirely (rendering pages via
our own pdf.js pipeline during indexing) is on the roadmap.

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
- `Fathom-arm64-mac.zip`
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

Per-paper state lives **next to your PDF file**:

```
~/Papers/3d-paper.pdf
~/Papers/3d-paper.pdf.fathom/           ← everything for this paper, one folder
  ├── content.md                        ← full paper text, reading order
  ├── images/
  │   └── page-003-fig-1.png            ← cropped figures only
  ├── zooms/
  │   └── <lensId>.png                  ← exact viewport crop per lens
  ├── digest.json                       ← structured section/figure map
  └── MANIFEST.md                       ← layout reference for Claude
```

The sidecar folder is portable — move `3d-paper.pdf` together with
`3d-paper.pdf.fathom/` to another Mac and your reading session travels.

SQLite metadata (region anchors, Q&A thread, zoom-path mappings) lives in
macOS app data:

```
~/Library/Application Support/Fathom/lens.db
```

To uninstall cleanly:
```bash
rm -rf /Applications/Fathom.app
rm -rf ~/Library/Application\ Support/Fathom
# Sidecar folders next to PDFs are yours to keep or delete.
```

---

## 7. Verifying it works

1. Launch Fathom. Window title bar shows `Fathom` when no PDF is open.
2. Click **Open PDF…** and pick a research paper.
3. A toast at the bottom-right reads **"Indexing paper…"** (spinner). After
   10–60 seconds it flips to green **"Paper indexed ✓"** or red **"Indexing
   failed — …"**. Follow the error hint if red (usually "install poppler").
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
