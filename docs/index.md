---
layout: default
title: Fathom
---

## Built out of necessity

I'm [Ashrya](https://github.com/ashryaagr) — an AI scientist who reads a lot
of research papers. Every one had the same moment: I'd hit a dense paragraph,
copy it out, switch to another window, lose my place, come back, miss the
point. The reading broke every few minutes, and half of what I thought I'd
understood was just me skipping.

So I built the reader I wanted. Fathom is a desktop app where the explanation
of any passage is one pinch away, streaming in place, grounded in the paper
itself. When it got polished enough for me to use daily, it felt like it
might be useful to someone else too.

There's nothing to sign up for, no subscription, no account. If you already
pay for Claude, you have everything Fathom needs.

## What it feels like

Hold **⌘** and pinch on any passage. The page gives way to a full-screen
lens, and the explanation starts streaming in. Pinch a phrase inside the
lens to drill deeper — recursively, as far as the idea goes. Swipe back, the
way you came. Every lens persists across sessions: close the PDF, open it
next month, pinch the same paragraph, and the thread you had is still
there, exactly where you left it.

## What makes it different

- **The zoom is the explanation.** No side panel, no context switch, no
  "AI assistant" icon. The gesture you'd already use to look closer is how
  you ask for help.
- **Grounded in the paper itself.** Claude is given a file-system index of
  the paper — `content.md`, per-figure PNGs, a digest — and navigates it
  with `Read` / `Grep` / `Glob`. No RAG, no embeddings, no similarity
  search. The paper is a filesystem; the AI is a shell.
- **Diagrams when they help.** Architectures, pipelines, and relationships
  render as hand-drawn inline SVG. Never ASCII, never Mermaid.
- **Durable across sessions.** Every lens round-trips across app restarts:
  the viewport crop, the full thread, the exact prompt that was sent.

## Install

One download. One first-launch approval in System Settings → Privacy &
Security. Then Fathom opens like any other Mac app.

[**Download Fathom for macOS**](https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg){: .btn .btn-primary}

Apple Silicon · ~200 MB · [full install guide]({{ '/INSTALL' | relative_url }})

## Free and open source

Fathom is MIT-licensed and built in the open.

- [**Source →**](https://github.com/ashryaagr/Fathom)
- [**Releases →**](https://github.com/ashryaagr/Fathom/releases)
- [**Design principles →**]({{ '/PRINCIPLES' | relative_url }}) — the rules
  Fathom was built on. Read before proposing changes.
- [**Report a bug →**](https://github.com/ashryaagr/Fathom/issues)

There's no roadmap document because the roadmap is whatever the paper I'm
reading this week demands. If you're using Fathom on something it handles
badly, opening an issue with the PDF attached is the most direct way to
shape what ships next.
