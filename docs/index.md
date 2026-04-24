---
layout: default
title: Fathom
---

<p align="center">
  <img src="https://raw.githubusercontent.com/ashryaagr/Fathom/main/resources/icon.png" alt="Fathom" width="128" height="128" />
</p>

# Fathom

**Reading a research paper is a human-computer interaction problem. We've been solving it badly for forty years.**

Fathom is a new reading interaction. Hold **⌘** and pinch on any passage — the
page gives way to a full-screen lens that explains it, grounded in the paper
itself, streaming as you read. Drill deeper by pinching on a phrase inside the
lens. Swipe back, like turning a page. Dive into a concept the way you'd dive
into water: by depth, recursively, and always coming back to where you were.

---

## Install

One line in Terminal — downloads via `curl`, which bypasses macOS's Gatekeeper
quarantine attribute, so the app launches cleanly on first double-click:

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

*Apple Silicon · ~200 MB*

Prefer a graphical install? See the [install guide]({{ '/INSTALL' | relative_url }})
for the DMG path and the one-time `xattr -cr` step to clear Gatekeeper's
"damaged" error on unsigned builds.

---

## What makes it different

- **The zoom *is* the explanation.** There's no side panel, no context switch.
  The gesture you already use to look closer at a page is the gesture that asks
  for help.
- **Grounded in the paper itself.** Claude is given a file-system index of the
  paper — `content.md`, per-figure PNGs, a structured digest — and navigates it
  with `Read` / `Grep` / `Glob`. No RAG. No embeddings. No vector similarity.
- **Diagrams when they help.** Architectures, pipelines, flows, and
  relationships render as inline SVG inside the lens. Handwritten aesthetic,
  never ASCII, never Mermaid.
- **Durable.** Every lens you open — the exact viewport crop, the full Q&A
  thread, the prompt — round-trips across app restarts. Close the PDF today,
  reopen it next month, pinch the same paragraph: it's all there.
- **Transparent.** The exact prompt sent to Claude is one click away on every
  lens turn. Tool calls stream live. You can see what the machine is doing at
  every step.

---

## Documentation

- [**Install guide**]({{ '/INSTALL' | relative_url }}) — one-line installer,
  DMG path, build from source, dev container, data layout, uninstall.
- [**Design principles**]({{ '/PRINCIPLES' | relative_url }}) — the rules
  Fathom was built on. Read before proposing changes.
- [**Dev container**]({{ '/DOCKER' | relative_url }}) — Linux-based build
  environment for contributors who don't want the full toolchain on their host.

---

## How it works

```
  PDF opened
  │
  ├─► pdf.js renders pages + extracts positioned text
  │
  ├─► Fathom builds an on-disk index next to the PDF:
  │     paper.pdf.fathom/
  │       content.md       ── full text, in reading order
  │       images/          ── per-figure cropped PNGs
  │       digest.json      ── structured section / figure map
  │       zooms/           ── viewport PNG per lens you open
  │       MANIFEST.md      ── layout reference for Claude
  │
  └─► You ⌘+pinch → a lens opens → Claude is given:
         • the path to the index folder
         • the exact viewport image (ground truth for what you see)
         • the extracted passage + page number
         • tools: Read, Grep, Glob, WebSearch, WebFetch
       Response streams into the lens as Markdown + KaTeX + inline SVG.
```

The paper is a filesystem; the AI is a shell.

---

## Links

- **Source code** — [github.com/ashryaagr/Fathom](https://github.com/ashryaagr/Fathom)
- **Releases** — [github.com/ashryaagr/Fathom/releases](https://github.com/ashryaagr/Fathom/releases)
- **Issues / feedback** — [github.com/ashryaagr/Fathom/issues](https://github.com/ashryaagr/Fathom/issues)
- **License** — [MIT](https://github.com/ashryaagr/Fathom/blob/main/LICENSE)
