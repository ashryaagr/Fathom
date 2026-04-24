<div align="center">

<img src="resources/icon.png" alt="Fathom" width="128" height="128" />

# Fathom

**A semantic-zoom PDF reader for research papers.**

Pinch with **⌘** on a passage — a full-screen lens opens with a streaming,
grounded explanation from Claude. Dive into concepts the way you'd dive into
water: by depth, recursively, and always coming back to where you were.

### [⬇ Download Fathom for Mac](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg)

*Apple Silicon · ~200 MB · unsigned — see [first-launch note](./docs/INSTALL.md#first-launch-unsigned-build)*

[Install guide](./docs/INSTALL.md) · [How it works](#how-it-works) · [Build from source](#build-from-source) · [All releases](https://github.com/ashryaagr/Fathom/releases)

</div>

---

## What Fathom does

When you read a research paper and hit something you don't understand, you have two bad options: stop reading and open ChatGPT in another window, or press on and accept you didn't really understand it. Fathom replaces that choice with a gesture.

- **Pinch** with two fingers → cursor-anchored visual zoom (like Preview.app).
- **⌘ + pinch** on a passage, then release ⌘ → a full-screen **lens** opens with a streaming Claude explanation, grounded in the paper via an on-disk file-system index (no RAG, no embeddings — Claude uses `Read`, `Grep`, `Glob`).
- **Select a phrase** inside a lens and ⌘ + pinch on it → drill into that concept. Recursive. Back and forward via two-finger swipe, like a browser.
- **Ask follow-ups** in the sticky footer. Each Q&A appends below as a chat history. Typing a new question cancels the in-flight answer.
- **Every lens is durable.** A small amber marker appears next to the paragraph you zoomed into. Close the PDF, reopen it next week, and your lens — the exact viewport crop, the full chat history, the prompt — is all there.
- **Diagrams when they help.** Claude emits inline SVG for architectures / pipelines / flows. Rendered live, never as ASCII.

## Download

**macOS — Apple Silicon**

One-click latest DMG:

**→ [`Fathom-arm64.dmg`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg)**

That link always resolves to the most recent release, so the same URL keeps working across versions. Zipped `.app` bundle available at [`Fathom-arm64-mac.zip`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip). Full per-release notes and checksums live on the [Releases page](https://github.com/ashryaagr/Fathom/releases).

For v1, binaries are unsigned: the first launch needs **right-click → Open** (once), or `xattr -cr /Applications/Fathom.app`. See [INSTALL.md](./docs/INSTALL.md#first-launch-unsigned-build).

Intel Macs aren't supported in v1 (native module `better-sqlite3` is ABI-locked per architecture). Build from source if you need x64 today — see below.

## Prerequisite

Fathom talks to Claude through the [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI. You need:

- **Claude Code installed and authenticated.** `claude` in your `$PATH`, logged in. Fathom uses your existing Claude subscription — no API keys to paste anywhere.
- *(Optional)* **poppler** — `brew install poppler`. Only needed during the one-time indexing pass if you want Claude to see figure pixels via the PDF directly. After indexing, Fathom uses the cropped figure PNGs and doesn't need poppler again.

## How it works

```
  PDF opened
  │
  ├─► pdf.js renders pages + extracts positioned text
  │
  ├─► Fathom builds an on-disk index next to the PDF:
  │     paper.pdf.fathom/
  │       content.md       ── full text, in reading order, <!-- PAGE N --> markers
  │       images/          ── per-figure cropped PNGs (not whole-page screenshots)
  │       digest.json      ── structured section / figure map from one Claude pass
  │       zooms/           ── exact viewport PNG per lens you open
  │       MANIFEST.md      ── teaches Claude the layout of this folder
  │
  └─► You ⌘+pinch → a lens opens → Claude is given:
         • the path to the index folder
         • the exact viewport image (ground truth for what you see)
         • the extracted passage + page number
         • tools: Read, Grep, Glob, WebSearch, WebFetch
       Response streams into the lens as Markdown + KaTeX + inline SVG.
```

Claude navigates the index the same way a human colleague would:
```bash
Grep "\\[76\\]"  content.md     # resolve a citation
Read             images/page-003-fig-1.png   # look at a figure
Grep "self-attention" content.md  # locate where a concept is defined
```

No retrieval layer, no vector store. The paper is a filesystem; the AI is a shell.

## Design principles

The product was built on a small set of principles. [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) spells them out — read it before proposing changes.

Highlights:
1. **The reader should never have to leave the document.** Claude is not a side-panel — it is the zoom.
2. **Apple-level feel.** Gestures feel continuous; the semantic zoom is not a click-through wizard.
3. **File-system-first AI.** No RAG. No embeddings. Claude uses `Read` / `Grep` / `Glob`.
4. **Three-channel alignment.** What the user sees = what we capture = what Claude reads. Always the same pixels.
5. **Everything is transparent.** The exact prompt sent to Claude is one click away on every lens turn. Tool calls stream live. You can see what the machine is doing.

## Build from source

```bash
git clone https://github.com/ashryaagr/Fathom.git
cd Fathom
npm install
npm run rebuild         # rebuild better-sqlite3 against Electron's Node ABI
npm run dev             # Electron with HMR
```

Produce a distributable:
```bash
npm run dist:mac        # → dist/Fathom-1.0.0-arm64.dmg
npm run dist:mac-intel  # → dist/Fathom-1.0.0.dmg (Intel)
npm run dist:mac-both   # both architectures
```

Containerized dev environment (for consistent builds): see [docs/DOCKER.md](./docs/DOCKER.md).

## Architecture

```
src/
├── main/                    Electron main process
│   ├── ai/
│   │   ├── client.ts        Claude Agent SDK wrapper, streaming
│   │   └── decompose.ts     One-shot PDF → structured digest
│   ├── db/
│   │   ├── schema.ts        SQLite schema + migrations
│   │   └── repo.ts          Papers / Regions / Explanations CRUD
│   └── index.ts             IPC handlers, window management
├── preload/
│   └── index.ts             contextBridge API surface (window.lens)
└── renderer/                Electron renderer (React + Vite)
    ├── pdf/                 pdf.js rendering, region extraction, figure crops
    ├── gestures/            pinch / hit-test / swipe normalization
    ├── lens/                focus-view UI, explanation streaming, store
    ├── state/               Zustand: document, regions
    └── App.tsx              App shell, PDF open, restore, global shortcuts
```

Core dependencies: Electron, React 18, pdfjs-dist, `@anthropic-ai/claude-agent-sdk`, Zustand, Framer Motion, react-markdown + rehype-katex + remark-math, DOMPurify, better-sqlite3.

## Contributing

Issues and PRs are welcome. Before opening a PR, check [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) — if your change contradicts a principle there, the principle wins unless you can articulate why it should change.

For bug reports, the DevTools console log (Cmd+Option+I in the running app) is more useful than a screenshot — every subsystem emits `[Fathom …]` lines with IDs so we can trace a failure end-to-end.

## License

MIT — see [LICENSE](./LICENSE).
