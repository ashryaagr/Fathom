# Lens

A Mac PDF reader for research papers with a semantic-zoom gesture. Pinch on a passage with ⌘ held → a full-screen lens opens with a streaming, grounded explanation from Claude. Read [CLAUDE.md](./CLAUDE.md) for the product's core principles.

## Download

**macOS (Apple Silicon — M-series):**

- [`Lens-1.0.0-arm64.dmg`](./dist/Lens-1.0.0-arm64.dmg) (203 MB)
- [`Lens-1.0.0-arm64-mac.zip`](./dist/Lens-1.0.0-arm64-mac.zip) (196 MB)

Intel Macs are not supported in v1.

## Install

1. Open the DMG and drag **Lens** to **Applications**.
2. First launch — because v1 is unsigned, macOS will refuse to open it with a Gatekeeper warning. Fix by one of:
   - Right-click `Lens.app` in Applications, choose **Open**, then **Open** again in the dialog.
   - Or, once from Terminal: `xattr -cr /Applications/Lens.app` (removes quarantine), then launch normally.

## Prerequisites

Lens talks to Claude through the Claude Code CLI. You need:

- **Claude Code installed** (`claude` in your PATH) and authenticated — Lens uses your existing Claude subscription; no API key to paste.
- *(Optional)* **poppler** — only needed if you want Claude to be able to re-read the original PDF during an explanation. After indexing succeeds once, poppler is not needed for subsequent calls.
  ```
  brew install poppler
  ```

## Using Lens

- **Open a PDF**: File picker in the header, or drag a PDF onto the window.
- **Visual zoom**: pinch with two fingers. Zoom anchors on the cursor.
- **Semantic zoom**: hold **⌘** while pinching on a passage. Frame what you want, then release ⌘ — a full-screen lens opens with a streaming Claude explanation grounded in the paper.
- **Drill deeper**: inside a lens, select a phrase you don't recognize, then ⌘+pinch on it. A new lens dives into that concept.
- **Go back / forward**: two-finger swipe right = back. Two-finger swipe left = forward. ⌘+pinch-out, Esc, or the back button also work.
- **Ask follow-ups**: the sticky Ask box at the bottom of the lens. Typing a new question while Claude is still answering will cancel the current stream.
- **Cached markers**: every paragraph you've ever zoomed into gets a small amber dot next to it in the PDF. Click the dot to re-open that lens — the exact same viewport image + chat history restores.
- **Inspect what's happening**: every lens turn has `▸ prompt to Claude` (collapsed) and `▾ working` panels showing the exact prompt and Claude's tool calls in real time.

## Where your data lives

Per-paper lens state is stored next to the PDF itself:

```
~/Papers/foo.pdf
~/Papers/foo.pdf.lens/
├── content.md               # full paper text in reading order
├── images/
│   └── page-NNN-fig-K.png   # cropped figures
├── zooms/
│   └── <lensId>.png         # exact viewport crops for each lens
├── digest.json              # structured index (sections, figures, glossary)
└── MANIFEST.md              # how Claude should read this folder
```

SQLite metadata (regions, chat history, zoom-path mappings) lives in `~/Library/Application Support/lens/lens.db`.

## Build from source

```
npm install
npm run rebuild            # rebuild better-sqlite3 for Electron's ABI
npm run dev                # dev mode with HMR
```

```
npm run dist               # produces dist/Lens-<version>-arm64.dmg and .zip
```

## License

MIT. See [CLAUDE.md](./CLAUDE.md) for the product principles.
