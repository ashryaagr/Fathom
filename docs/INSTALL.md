# Installing Fathom

Three install paths, in order of ease:

1. [Download the DMG](#1-download-the-dmg) — pre-built, drag-and-drop.
2. [Build from source](#2-build-from-source) — if you want to modify or inspect the app.
3. [Dev container](#3-dev-container-docker) — reproducible build environment.

All paths require Claude Code CLI as a runtime prerequisite. See [Prerequisites](#prerequisites).

---

## Prerequisites

### Claude Code CLI (required)

Fathom uses your existing Claude Code authentication — no API key to paste.

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

If `claude` isn't in your PATH, Fathom will fail to generate explanations. The indexing toast will say so.

### poppler (optional)

Only needed if you want Claude to be able to read the source PDF during the one-time indexing pass (it sees figure pixels that way). After indexing, Fathom uses the cropped figure PNGs stored in the sidecar folder and does not need poppler.

```bash
brew install poppler
```

If you skip poppler, the indexing toast will flip to a red "indexing failed — run `brew install poppler` and reopen the PDF" state. The app still works; results in the lens may be less precise on figure-heavy pages.

---

## 1. Download the DMG

Grab the latest release from the [Releases page](https://github.com/ashryaagr/Fathom/releases).

| Architecture | File |
|---|---|
| Apple Silicon (M1/M2/M3/M4) | `Fathom-<version>-arm64.dmg` |
| Intel | *(v1: build from source; prebuilt x64 lands when demand warrants)* |

### First launch (unsigned build)

Fathom v1 is unsigned — macOS Gatekeeper will refuse to open it on first launch. Two ways to fix:

**The Finder way:**
1. Drag `Fathom.app` to `/Applications`.
2. Right-click `Fathom` → **Open**.
3. In the dialog, click **Open** again.
4. macOS remembers this consent; future launches are normal.

**The Terminal way:**
```bash
xattr -cr /Applications/Fathom.app
```
This strips the quarantine attribute Gatekeeper checks. Next launch works normally.

Signed / notarized builds are planned for a later release.

---

## 2. Build from source

```bash
git clone https://github.com/ashryaagr/Fathom.git
cd Fathom
npm install
npm run rebuild             # rebuild better-sqlite3 for Electron's Node ABI
```

**Run in dev:**
```bash
npm run dev
```
Opens an Electron window with hot-reload for the renderer. Main process changes require restarting (`Ctrl+C` and re-run).

**Produce a distributable:**
```bash
npm run dist:mac            # arm64 only (default on Apple Silicon)
npm run dist:mac-intel      # x64 only
npm run dist:mac-both       # both architectures
```

Outputs land in `dist/`:
- `Fathom-<version>-arm64.dmg`
- `Fathom-<version>-arm64-mac.zip`

**Regenerate the app icon:**
```bash
npm run build-icon
```
Re-rasterizes `resources/icon.svg` into `resources/icon.icns` and `resources/icon.png` used by electron-builder.

---

## 3. Dev container (Docker)

See [DOCKER.md](./DOCKER.md) for a Linux-based build environment with Node, Python, and Electron build deps pre-installed. Useful for CI and for contributors who don't want to install the full toolchain on their host machine.

Note: Fathom is a macOS-first desktop app. The Docker image is for **building** and **testing the Node/TypeScript code**, not for running the Electron UI. The DMG still has to be built on a Mac (for the macOS-specific packaging and `iconutil` tooling).

---

## Where Fathom stores your data

Per-paper state lives **next to your PDF file**:

```
~/Papers/3d-paper.pdf
~/Papers/3d-paper.pdf.fathom/           ← everything for this paper, one folder
  ├── content.md                        ← full paper text, reading order
  ├── images/
  │   └── page-003-fig-1.png            ← cropped figures only
  ├── zooms/
  │   └── <lensId>.png                  ← exact viewport crop per lens
  ├── digest.json                       ← structured section/figure map (if indexed)
  └── MANIFEST.md                       ← layout reference for Claude
```

The sidecar folder is portable — move `3d-paper.pdf` together with `3d-paper.pdf.fathom/` to another Mac and your reading session travels.

SQLite metadata (regions, chat history, zoom-path mappings) lives in macOS app data:

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

## Verifying it works

1. Launch Fathom. Window title bar shows `Fathom` when no PDF is open.
2. Click **Open PDF…** and pick a research paper.
3. You should see a toast at the bottom-right: **"Indexing paper…"** (spinner). After 10–60 seconds it flips to either green "Paper indexed ✓" or red "Indexing failed — …". If red, follow the error hint (usually "install poppler").
4. ⌘ + pinch on any paragraph → release ⌘ → the Focus View should open with a streaming explanation within 1-3 seconds.
5. Open DevTools (Cmd+Option+I) → Console. You'll see `[Fathom] …` lines for every subsystem. If something stalls, the last log line tells you where.

If step 4 doesn't produce a response, the most likely cause is that `claude` isn't in your PATH. Check:
```bash
which claude
```
from the same shell you launched Fathom from (matters on macOS — GUI apps inherit PATH from `/usr/libexec/path_helper`, not your shell config).
