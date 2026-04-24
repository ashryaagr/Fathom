<div align="center">

<img src="resources/icon.png" alt="Fathom" width="128" height="128" />

<img src="resources/hero.png" alt="Dive into any paper." width="560" />

[![CI](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ashryaagr/Fathom?label=release&color=f59e0b)](https://github.com/ashryaagr/Fathom/releases/latest)
[![Platform](https://img.shields.io/badge/macOS-arm64-lightgrey)](#download)
[![License](https://img.shields.io/github/license/ashryaagr/Fathom)](./LICENSE)

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

*Apple Silicon · adds a `fathom` launcher · no Gatekeeper prompt*

Prefer drag-to-Applications? [Get the Mac DMG →](./docs/INSTALL.md#option-b--dmg)

[Install guide](./docs/INSTALL.md) · [Distribution](./docs/DISTRIBUTION.md) · [How it works](#how-it-works) · [Principles](./docs/PRINCIPLES.md) · [Build from source](#build-from-source) · [All releases](https://github.com/ashryaagr/Fathom/releases)

</div>

---

## Built out of necessity

I'm [Ashrya](https://github.com/ashryaagr), an AI scientist. I read a lot of research papers and, I got tired of the same spiral: hit a paragraph full of jargons I have no freaking clue about => go to Claude & ask for clarification => then clarification of the clarification => and by the time I'd surfaced, where the hell am I?. So I built the reader I always wanted. When it was polished enough for me to use daily, it felt like it might be useful to someone else.

There's nothing to sign up for, no subscription, no account. If you already pay for Claude, you have everything Fathom needs.

## What it feels like

Hold **⌘** and pinch on any passage. The page gives way to a full-screen lens, and the explanation starts streaming in. Pinch a phrase inside the lens to drill deeper — recursively, as far as the idea goes. Swipe back, the way you came. Every lens persists across sessions: close the PDF, open it next month, pinch the same paragraph, and the thread you had is still there, exactly where you left it.

## What makes it different

- **The zoom is the explanation.** No side panel, no context switch, no "AI assistant" icon. The gesture you'd already use to look closer is how you ask for help.
- **Grounded in the paper itself.** Claude is given a file-system index of the paper — `content.md`, per-figure PNGs, a digest — and navigates it with `Read` / `Grep` / `Glob`. No RAG, no embeddings, no similarity search. The paper is a filesystem; the AI is a shell.
- **Diagrams when they help.** Architectures, pipelines, and relationships render as hand-drawn inline SVG. Never ASCII, never Mermaid.
- **Durable across sessions.** Every lens round-trips across app restarts: the viewport crop, the full thread, the exact prompt that was sent.
- **Yours to shape.** Preferences (⌘,) let you point Fathom at extra folders — a codebase the paper implements, a sibling paper — and add a standing instruction for every explanation.

## Install

Fathom's primary install path is the terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

The script downloads the app, extracts to `/Applications`, clears the `com.apple.quarantine` xattr (so Gatekeeper doesn't ask for approval on first launch), ad-hoc re-signs, and drops a `fathom` launcher at `~/.local/bin/fathom` so you can `fathom paper.pdf` from any terminal. Same script handles updates — re-run it or type `fathom update`.

Want to read it before piping it to bash? [It's here](./install.sh) — about 200 lines.

Once installed:
```bash
fathom                   # open Fathom
fathom paper.pdf         # open Fathom with a paper
fathom update            # pull the latest version
fathom --version         # print the installed version
fathom uninstall         # remove Fathom
```

### Prefer a drag-to-Applications install?

Download the Mac DMG: [`Fathom-arm64.dmg`](./docs/INSTALL.md#option-b--dmg). The [install guide](./docs/INSTALL.md#option-b--dmg) walks you through the one-time Gatekeeper approval that DMG users see on first launch. Both paths converge on the same `Fathom.app`, and both auto-update via the same in-app mechanism after — see [DISTRIBUTION.md](./docs/DISTRIBUTION.md).

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

## Your data stays yours

Fathom is open source and runs entirely on your machine. There is no
telemetry, no analytics, no accounts, and no servers that touch your
PDFs, your explanations, or your conversations with Claude. The only
network calls are (a) your existing Claude Code CLI talking to
Anthropic on your behalf, and (b) the app's auto-updater checking for
new Fathom releases on GitHub. Every paper's index and chat history
lives under `~/Library/Application Support/Fathom/`, and you can
delete that folder at any time to wipe all Fathom state without
touching the PDFs themselves.

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
