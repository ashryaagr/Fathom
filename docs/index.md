---
layout: default
title: Fathom
---

## A new way to read a paper

Reading a PDF hasn't changed in forty years. We scroll, we copy, we paste
somewhere else, we scroll back. For most things that's fine. For research
papers it's a tax you pay every few minutes — enough that half of what you
thought you'd read, you'd really just skimmed and moved on from.

Fathom is different. You hold ⌘. You pinch on the part you want to
understand better. The page gives way, and a clearer view arrives right
there — grounded in the paper itself, streaming as you read. You pinch a
phrase inside to go deeper. You swipe back, like turning a page.

It's not an AI assistant bolted onto a PDF viewer. It's a reading app
shaped around the way you already read: zoom in when you want detail,
zoom out when you want to keep going.

## Built out of necessity

I'm [Ashrya](https://github.com/ashryaagr), an AI scientist. I read a lot of
research papers, and I got tired of the same moment: hit a dense paragraph,
copy it out, switch to another window, lose my place, miss the point. So I
built the reader I wanted. When it was polished enough for me to use daily,
it felt like it might be useful to someone else.

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
