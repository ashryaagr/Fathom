<div align="center">

<img src="resources/icon.png" alt="Fathom" width="128" height="128" />

<img src="resources/hero.png" alt="Dive into any paper." width="560" />

[![CI](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ashryaagr/Fathom?label=release&color=f59e0b)](https://github.com/ashryaagr/Fathom/releases/latest)
[![Platform](https://img.shields.io/badge/macOS-arm64-lightgrey)](#download)
[![License](https://img.shields.io/github/license/ashryaagr/Fathom)](./LICENSE)

Reading a research paper hasn't changed in forty years. Every few minutes,
you leave the page — copy, paste into Claude, scroll back. Every time, you
lose your place.

Fathom asks you not to leave. The explanation comes to the page, right
where your eye already is. You keep reading. You finish the paper.

### [⬇ Download Fathom for Mac](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg)

*Apple Silicon · ~200 MB · [first-launch approval](./docs/INSTALL.md#2-first-launch-approve-the-app) is one click in System Settings*

[Install guide](./docs/INSTALL.md) · [How it works](#how-it-works) · [Principles](./docs/PRINCIPLES.md) · [Build from source](#build-from-source) · [All releases](https://github.com/ashryaagr/Fathom/releases)

</div>

---

## What Fathom does

When you hit a dense passage, you have two bad options: stop reading and context-switch to another tool, or press on and accept you didn't really understand it. Both break the reading flow. Fathom replaces the context-switch with a gesture that happens *inside* the paper.

- **Pinch** with two fingers → cursor-anchored visual zoom (like Preview.app).
- **⌘ + pinch** on a passage, then release ⌘ → a full-screen **lens** opens with a streaming Claude explanation, grounded in the paper via an on-disk file-system index (no RAG, no embeddings — Claude uses `Read`, `Grep`, `Glob`).
- **Select a phrase** inside a lens and ⌘ + pinch on it → drill into that concept. Recursive. Back and forward via two-finger swipe, like a browser.
- **Ask follow-ups** in the sticky footer. Each Q&A stacks into a running thread inside the lens. Typing a new question cancels the in-flight answer.
- **Every lens is durable.** A small amber marker appears next to the paragraph you zoomed into. Close the PDF, reopen it next week, and your lens — the exact viewport crop, the full Q&A thread, the prompt — is all there.
- **Diagrams when they help.** Claude emits inline SVG for architectures / pipelines / flows. Rendered live, never as ASCII.

## Download

**macOS — Apple Silicon**

**→ [`Fathom-arm64.dmg`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg)**

That link always resolves to the most recent release. Zipped `.app` at [`Fathom-arm64-mac.zip`](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip). Release notes and checksums live on the [Releases page](https://github.com/ashryaagr/Fathom/releases).

### First launch

Fathom v1 isn't enrolled in the Apple Developer Program, so macOS asks you to approve it the first time you open it — a one-time click in **System Settings → Privacy & Security → Open Anyway**. Full walkthrough in the [install guide](./docs/INSTALL.md#2-first-launch-approve-the-app). After that, Fathom launches like any other Mac app.

Intel Macs aren't supported in v1 (native module `better-sqlite3` is ABI-locked per architecture). Build from source if you need x64 today — see below.

## Prerequisite

Fathom talks to Claude through the [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI. You need:

- **Claude Code installed and authenticated.** `claude` in your `$PATH`, logged in. Fathom uses your existing Claude subscription — no API keys to paste anywhere.

That's it. Fathom extracts text and figures from the PDF with its own pdf.js pipeline; there's no poppler / pdftoppm / Ghostscript dependency on your machine.

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

## Methodology

[docs/METHODOLOGY.md](./docs/METHODOLOGY.md) is the long-form engineering
and scientific write-up of how Fathom works: the extraction pipeline, the
filesystem-as-index grounding strategy, why Fathom explicitly rejects RAG,
three-channel alignment, and the per-call explanation path.

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
