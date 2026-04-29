<div align="center">

<img src="resources/icon.png" alt="Fathom" width="128" height="128" />

<img src="resources/hero.png" alt="Dive into any paper." width="560" />

<!-- TODO: hero GIF/screenshot — gesture in motion preferred per Logseq pattern -->

Fathom is a Mac PDF reader built around a gesture: ⌘+pinch on a confusing passage, the AI explains it in place. The explanation persists per-paper, across sessions. No tab-switching, no copy-paste.

For now: macOS + Claude Code subscription. Windows, Linux, Codex, and Gemini support coming soon.

[![CI](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/ashryaagr/Fathom/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ashryaagr/Fathom?label=release&color=f59e0b)](https://github.com/ashryaagr/Fathom/releases/latest)
[![Platform](https://img.shields.io/badge/macOS-arm64-lightgrey)](#download)
[![License](https://img.shields.io/github/license/ashryaagr/Fathom)](./LICENSE)
[![Stars — Fathom](https://img.shields.io/github/stars/ashryaagr/Fathom?style=social)](https://github.com/ashryaagr/Fathom)
[![Stars — Slate](https://img.shields.io/github/stars/ashryaagr/fathom-whiteboard?style=social&label=Slate)](https://github.com/ashryaagr/fathom-whiteboard)

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

*Apple Silicon · adds a `fathom` launcher · no Gatekeeper prompt*

Prefer drag-to-Applications? [Get the Mac DMG →](./docs/INSTALL.md#option-b--dmg)

[Documentation](https://ashryaagr.github.io/Fathom/) · [Install guide](./docs/INSTALL.md) · [Distribution](./docs/DISTRIBUTION.md) · [How it works](#how-it-works) · [Principles](./docs/PRINCIPLES.md) · [Build from source](#build-from-source) · [All releases](https://github.com/ashryaagr/Fathom/releases)

</div>

---

## Built out of necessity

> I'm [Ashrya](https://github.com/ashryaagr), an AI scientist. I read a lot of research papers and, I got tired of the same spiral: hit a paragraph full of jargons I have no freaking clue about => go to Claude & ask for clarification => then clarification of the clarification => and by the time I'd surfaced, where the hell am I?. So I built the reader I always wanted. When it was polished enough for me to use daily, it felt like it might be useful to someone else.

There's nothing to sign up for, no subscription, no account. If you already pay for [Claude](https://claude.com/product/overview), you have everything Fathom needs.

## What it feels like

Hold **⌘** and pinch on any passage. The page gives way to a full-screen lens, anchored on exactly what you were looking at. Type whatever you want to know. Pinch a phrase inside the lens to drill deeper — recursively, as far as the idea goes. Swipe back, the way you came. Every lens persists across sessions: close the PDF, open it next month, pinch the same paragraph, and the thread you had is still there, exactly where you left it.

## What makes it different

- **The zoom is the context, not the question.** Instead of guessing what you wanted explained, Fathom lets the zoom *frame* the passage and then you ask. One less thing the machine tries to predict. Simpler, faster, under your control.
- **Grounded in the paper itself.** Claude is given a file-system index of the paper — `content.md`, per-figure PNGs, a digest — and navigates it with `Read` / `Grep` / `Glob`. No RAG, no embeddings, no similarity search. The paper is a filesystem; the AI is a shell.
- **Diagrams when they help.** Architectures, pipelines, and relationships render as hand-drawn inline SVG. Never ASCII, never Mermaid.
- **Durable across sessions.** Every lens round-trips across app restarts: the viewport crop, the full thread, the exact prompt that was sent.
- **Yours to shape.** Preferences (⌘,) let you point Fathom at extra folders — a codebase the paper implements, a sibling paper — and add a standing instruction for every explanation.
- **Ground on a GitHub repo.** Paste a public GitHub URL into Preferences ("Extra grounding GitHub repos") and Fathom clones it into a managed sidecar; from then on every explanation can `Read` and `Grep` the repo as part of grounding. Useful when the paper references its own implementation. Cloned repos auto-evict after 30 days of disuse (toggleable).
- **Inline two-finger ask.** Two-finger tap on a paragraph opens a tiny "Dive into" composer. Type a short question, press Enter — a marker drops, turns red while Claude streams in the background, and cross-fades amber when the answer is ready. Click the marker to read the answer in the lens. Lets you queue several questions in flight while you keep reading.
- **Focus Light, optional.** A 3-word reading pacer that slides at your set WPM. Press **F** to toggle when the beta is enabled in Preferences, **Space** to pause. Speed dial is a slider 10–300 wpm + a numeric input for anything higher.

The same whiteboard component is available standalone as [Slate](https://github.com/ashryaagr/fathom-whiteboard) — paste a paper, an abstract, an image; get the same explanatory diagram surface without needing Fathom open.

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

## Prerequisites

For now: macOS + Claude Code subscription. Windows, Linux, Codex, and Gemini support coming soon.

Fathom needs three things on your machine. The app checks for the first two on launch and tells you exactly what's missing if anything is off.

- [ ] **macOS on Apple Silicon** (M1 / M2 / M3 / M4). Fathom is built for arm64; Intel Macs need to build from source today — the `better-sqlite3` native module is ABI-locked per architecture.
- [ ] **Claude Code CLI installed**, with `claude` on your `$PATH`.
   ```bash
   # One-line install from the official source:
   curl -fsSL https://claude.ai/install.sh | sh
   # Verify:
   which claude    # should print something like /Users/you/.local/bin/claude
   claude --version
   ```
- [ ] **Claude Code signed in.** Fathom uses your existing Claude subscription through the CLI — no API keys, no accounts inside Fathom.
   ```bash
   claude login     # opens a browser-based sign-in flow
   ```

That's it. **No poppler, no pdftoppm, no Ghostscript** — Fathom extracts text and figures with its own pdf.js pipeline.

On first launch, if `claude` isn't on your `$PATH` or you aren't signed in, Fathom surfaces a dialog with the specific command to run. You can then re-launch and continue.

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

## Using inside your company

- Zero telemetry. Fathom collects nothing. Ever.
- Open source under the MIT license — audit every line, fork if needed.
- Build from source in five minutes. Build it, ship it on your own laptops, never touch our servers.
- Use the same Claude CLI subscription your team already pays for. Fathom rides on `claude` auth.

Most enterprise reading tools want a vendor relationship; Fathom is just a Mac app you compiled yourself.

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

## Why this works (research backing)

The design choices above aren't decorative. Each leans on a specific result from the cognitive-science and reading-comprehension literature.

**Cost lives in element interactivity, not word count.** A passage's load is set by the number of symbols a reader must hold in mind simultaneously, not by how many words sit on the page — so Fathom should flag for elaboration based on inter-symbol coupling and unstated bridging dependencies, not paragraph length.
- Sweller, J. 2010. *Element Interactivity and Intrinsic, Extraneous, and Germane Cognitive Load.* Educational Psychology Review 22(2). [doi.org/10.1007/s10648-010-9128-5](https://doi.org/10.1007/s10648-010-9128-5)
- Graesser, A. C., Singer, M., & Trabasso, T. 1994. *Constructing Inferences During Narrative Text Comprehension.* Psychological Review 101(3). [doi.org/10.1037/0033-295X.101.3.371](https://doi.org/10.1037/0033-295X.101.3.371)

**Scaffolds that help novices burden experts.** A worked example, glossary, or auto-imposed outline that lifts a beginner becomes measurable friction once the reader has chunked the domain. So every Fathom scaffold — the focus pacer, the whiteboard, the inline ask — is off-by-default or quietly dismissable.
- Kalyuga, S. 2007. *Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction.* Educational Psychology Review 19(4). [doi.org/10.1007/s10648-007-9054-3](https://doi.org/10.1007/s10648-007-9054-3)

**Graphic advance organisers help, modestly.** The whiteboard view sits before deep reading because structural overviews aid learning and retention — small but reliable across 135 studies. Useful as a structural aid, not a giant learning multiplier.
- Luiten, J. W., Ames, W., & Ackerson, G. 1980. *A Meta-analysis of the Effects of Advance Organizers on Learning and Retention.* American Educational Research Journal 17(2). [doi.org/10.2307/1162483](https://doi.org/10.2307/1162483)

**Expert reading is non-linear.** Experts oscillate between resolutions — workflow → stage → component → back — with shorter fixations on task-relevant regions and longer saccades. So Fathom must let you move between resolutions at uniform gesture cost; a strict top-to-bottom UI penalises the way experts actually read.
- Gegenfurtner, A., Lehtinen, E., & Säljö, R. 2011. *Expertise Differences in the Comprehension of Visualizations.* Educational Psychology Review 23(4). [doi.org/10.1007/s10648-011-9174-7](https://doi.org/10.1007/s10648-011-9174-7)
- Keshav, S. 2007. *How to Read a Paper.* ACM SIGCOMM CCR 37(3). [doi.org/10.1145/1273445.1273458](https://doi.org/10.1145/1273445.1273458)

**Tab-switching is cognitively expensive.** Fragmented work forces context reconstruction every time the reader leaves the document — exactly the cost the in-document lens collapses.
- Mark, G., González, V. M., & Harris, J. 2005. *No Task Left Behind? Examining the Nature of Fragmented Work.* CHI '05. [doi.org/10.1145/1054972.1055017](https://doi.org/10.1145/1054972.1055017)

**Articulating the question is the work that produces understanding.** Self-explanation — having the reader phrase the confusion themselves — is what produces learning, not absorbing a pre-formed answer. So Fathom's zoom *frames* the passage and the user *types* the question; we deliberately do not auto-prompt Claude.
- Chi, M. T. H., Bassok, M., Lewis, M. W., Reimann, P., & Glaser, R. 1989. *Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.* Cognitive Science 13(2). [doi.org/10.1207/s15516709cog1302_1](https://doi.org/10.1207/s15516709cog1302_1)

**Spatial location anchors document memory.** Readers remember where on the page a fact sat. So Fathom's amber markers stay column-aware and page-stable — markers must not move when you reopen the paper.
- Piolat, A., Roussey, J.-Y., & Thunin, O. 1997. *Effects of Screen Presentation on Text Reading and Revising.* International Journal of Human-Computer Studies 47(4). [doi.org/10.1006/ijhc.1997.0145](https://doi.org/10.1006/ijhc.1997.0145)
- Rothkopf, E. Z. 1971. *Incidental Memory for Location of Information in Text.* JVLVB 10(6). [doi.org/10.1016/S0022-5371(71)80066-X](https://doi.org/10.1016/S0022-5371(71)80066-X)

**Diagrams aid reasoning by indexing relations spatially.** Architectures and pipelines render as inline diagrams in the lens because spatial layout reduces inference cost — a result well-established for forty years.
- Larkin, J. H., & Simon, H. A. 1987. *Why a Diagram is (Sometimes) Worth Ten Thousand Words.* Cognitive Science 11(1). [doi.org/10.1111/j.1551-6708.1987.tb00863.x](https://doi.org/10.1111/j.1551-6708.1987.tb00863.x)

## Build from source

One clone, one install. Fathom resolves [`fathom-whiteboard`](https://github.com/ashryaagr/fathom-whiteboard) as a regular dependency (pinned to a release tarball on GitHub), so you don't have to do anything separate for the whiteboard side:

```bash
git clone https://github.com/ashryaagr/Fathom.git
cd Fathom
npm install            # pulls fathom-whiteboard automatically
npm run dist:mac
open dist/Fathom-arm64.dmg
```

Requires Node 22+, macOS 14+, Xcode Command Line Tools.

Want to hack on `fathom-whiteboard` alongside Fathom? Clone the [whiteboard repo](https://github.com/ashryaagr/fathom-whiteboard) as a sibling and switch the dep to `"fathom-whiteboard": "file:../fathom-whiteboard"` in `package.json` — `npm install` then resolves the local copy.

For HMR development:
```bash
cd Fathom
npm run rebuild         # rebuild better-sqlite3 against Electron's Node ABI
npm run dev             # Electron with HMR
```

Produce a distributable for other architectures:
```bash
npm run dist:mac        # → dist/Fathom-arm64.dmg (Apple Silicon)
npm run dist:mac-intel  # → dist/Fathom-x64.dmg (Intel)
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

## More tools for researchers

- [papers-we-love/papers-we-love](https://github.com/papers-we-love/papers-we-love) — community-curated CS papers organised by topic, the canonical "papers worth reading" map.
- [writing-resources/awesome-scientific-writing](https://github.com/writing-resources/awesome-scientific-writing) — tools for the *output* end of research (Markdown editors, citation managers, Pandoc, Quarto). Fathom sits at the input end; this list complements it.
- [josephmisiti/awesome-machine-learning](https://github.com/josephmisiti/awesome-machine-learning) — long-running ML frameworks/libraries index. Note: the maintainer noted in early 2026 that LLM-generated PRs slowed contributions.

## Contact

If you like the project — drop a note to ashryaagr@gmail.com. I read every message.

## See also

- [Slate](https://github.com/ashryaagr/fathom-whiteboard) — same whiteboard, standalone Mac app for paste-driven brainstorming.

## License

MIT — see [LICENSE](./LICENSE).
