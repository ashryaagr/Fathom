# Fathom — design principles

These are the rules Fathom was built on. If a change you're proposing contradicts one of
them, the principle wins unless you can articulate — in an issue or PR description — why
it should change.

Short and public version; the longer operational notes stay private.

## Product

- **The reader should never have to leave the document.** Claude is the zoom, not a side panel.
- **Two zoom modes, one gesture surface.** Pinch = visual. ⌘ + pinch = semantic. They live on the same trackpad.
- **Zoom persists.** Every lens — the viewport image, the chat history, the prompt, the diagrams — round-trips across app restarts.

## Feel

- **Smooth, not wizard-driven.** Gestures commit on intent, not on a button press. Nothing in Fathom should feel like a step-by-step click-through.
- **Minimal options, impactful.** No settings dialog, no preferences.
- **Consistency at every level.** Drilling into a concept from a lens feels identical to opening a lens from the PDF. Recursive, same grammar.

## Gesture

- Visual zoom is **cursor-anchored**. The point under the pointer stays stationary.
- Semantic zoom **commits on ⌘ release** — the user frames what they want first, then commits.
- **Selection > cursor > viewport** for target priority.
- **What the user sees = what we capture = what Claude sees.** Three-channel alignment. If extracted text disagrees with the image, trust the image.
- **Two-finger swipe = browser back / forward** through the lens history.

## Content

- The paper is a **filesystem**, not a vector store.
- **No RAG. No embeddings. No semantic similarity.** Claude uses `Read` / `Grep` / `Glob`.
- **One `content.md`** with the full paper text in reading order — not per-page files (loses cross-page context).
- **Cropped figures, not whole-page screenshots.** `images/page-NNN-fig-K.png`, referenced inline in `content.md`.
- **The sidecar lives next to the PDF** — `<pdf>.fathom/`. Portable. One folder, no clutter.

## AI

- Uses **Claude Code** via the Agent SDK. The user's own auth — no API keys.
- **Pre-decompose on open** into a structured digest, cache forever. Per-call reads reuse the digest.
- **Stream everything.** Text, thinking, tool calls. Perceived latency must be close to zero.
- **Diagrams only when they help** — one inline SVG per response when structure / flow / relationship is the point. Never Mermaid, never ASCII, never markdown pseudo-diagrams.

## Engineering

- **Instrument first, fix second.** Every subsystem logs entry/exit and key decisions.
- **Step-by-step diagnosis before assuming.** When something breaks, the logs show where. Don't guess-and-check.
- **Trust but verify.** Non-trivial changes get an independent reader agent pass.
- **No flakiness in visible state.** Markers, anchor images, chat history are deterministic.
- **Transparency is a feature.** The exact prompt sent to Claude is one click away on every lens turn.

## Non-goals

- Inline sticky-note overlays on PDF pages.
- Side-panel chat UI.
- Recursive AI-on-AI paraphrasing.
- RAG, embeddings, vector search.
- Figure generation via Mermaid, ASCII, or markdown pseudo-diagrams.
- Decorative chrome. Apple-level quality means restrained, not flashy.
