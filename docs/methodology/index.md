---
layout: default
title: Methodology
permalink: /methodology/
---

# How Fathom works — methodology index

Fathom is built by AI agents working with a single human PM. The PM doesn't read the source; they read this section, the in-app logs, and the product itself. These pages exist so you can audit *how* Fathom works without opening a `.ts` file — and pinpoint where the approach is wrong, or where a bug lives, by reading methodology + logs together.

This is a living doc. Each non-trivial subsystem of Fathom gets its own page. CLAUDE.md (the design principles file) tells contributors *what not to do*; these methodology pages tell readers *what is being done, and why, step-by-step*.

## The pages

- **[Paper pipeline](/methodology/paper/)** — How Fathom indexes a PDF, builds the per-paper sidecar (`content.md`, figure crops, digest), and grounds every lens explanation in the file system rather than RAG. Covers the dive gesture, the in-place lens, the streaming pipeline, persistence.
- **[Whiteboard pipeline](/methodology/whiteboard/)** — How Fathom turns an indexed paper into a multi-level Excalidraw diagram you can zoom into. Covers the 2-pass Opus 4.7 + Sonnet 4.6 pipeline, the soft-verifier anti-hallucination policy, the per-node citations, the side-chat patch loop.

## How to use these docs

When something feels wrong:

1. Read the relevant methodology page to confirm what *should* be happening.
2. Open the in-app log viewer (Help → Show Logs, or the per-feature DevTools panels) to see what *did* happen.
3. If the gap between (1) and (2) is the bug — file an issue with both quoted, or report it directly. The implementer agents need the gap, not just the symptom.
4. If the methodology itself is wrong (the approach is incorrect, not the implementation) — say so. The methodology pages are the source of truth for design intent and need to be updated before re-implementation.

## The principle behind these pages

Per CLAUDE.md §1 (added 2026-04-25): *"Observability and methodology docs are part of the product, not afterthoughts. When AI is the implementer and the user is the PM, the user does not read the source. They read the product, the docs, and the logs."* Every non-trivial subsystem must ship with both — methodology and logging — alongside its code. The user should never have to reverse-engineer a feature from `git log`.
