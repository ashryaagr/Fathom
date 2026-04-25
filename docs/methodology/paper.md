---
layout: default
title: Methodology — The Paper Pipeline
permalink: /methodology/paper/
---

> Part of the [Methodology Index](/methodology/). This page covers how Fathom processes the **paper itself**: indexing, lens dives, in-place explanations. The [Whiteboard methodology](/methodology/whiteboard/) covers the multi-level visual diagram pipeline.

How Fathom actually works — the engineering and scientific choices behind
the product, in one document, so the "why" doesn't have to be inferred
from the source every time.

## The problem

Reading a research paper is a lookup task disguised as reading. You
encounter a citation, a symbol, an algorithm, a claim — and behind each
lives a definition, a prior paper, a figure, a derivation. The reader's
job is to assemble enough of that context, fast enough, that the paper
stays coherent in short-term memory.

In practice, most of that assembly happens in other windows — ChatGPT, a
search tab, a second PDF. Every hop resets the reader's spatial state and
breaks the reading loop. Fathom's goal is to collapse that loop by making
each lookup a gesture on the paper the reader is already looking at.

## Grounding is a product feature, not a bolted-on safeguard

A reading assistant's output is only as useful as its grounding. The
unforgivable failure mode is fluent nonsense: an answer that reads well
but is disconnected from the paper in front of you. Fathom treats
grounding as a first-class architectural concern.

**Three-channel alignment.** The image the user sees, the image Fathom
persists to disk, and the image Claude consults are the *same pixels*.
The renderer captures the viewport at the moment of the pinch, saves it
to `<pdf>.fathom/zooms/<lensId>.png`, and hands Claude the absolute path
to that file. If extracted text disagrees with the image (which happens
whenever PDF text extraction lumps columns, drops a caption, or garbles
math), the system is instructed to trust the image. This is the only way
to keep the answer anchored to what the user actually pinched on.

## The index is a filesystem, not a vector store

Fathom deliberately rejects the standard RAG approach — embed chunks,
retrieve nearest neighbours, stuff into context. Two reasons:

1. **Semantic similarity is not citation.** "The model uses
   cross-attention" and "the model does not use cross-attention" are
   embedding-close but factually opposite. A grounding strategy that
   can't tell them apart is worse than none.

2. **Papers are small.** A typical paper is a few hundred kilobytes of
   markdown. There's no scale problem that vector search solves here.
   What helps a reader is *structure* — page boundaries, figure
   references, section hierarchy, citation numbers.

The primitive Fathom chose is the filesystem. Opening `foo.pdf` produces
`foo.pdf.fathom/` next to it:

| File | Purpose |
|---|---|
| `content.md` | Full paper text in reading order. Page boundaries marked by `<!-- PAGE N -->` and `## Page N`. References section inline. |
| `images/page-NNN-fig-K.png` | Cropped figure PNGs, referenced inline in `content.md` at the right page boundary. No full-page screenshots. |
| `zooms/<lensId>.png` | The exact viewport the user pinched on, one file per lens. |
| `digest.json` | One-shot structured digest produced by Claude — title, abstract, section summaries, figure descriptions, glossary. Cached after first open. |
| `MANIFEST.md` | A short readme that teaches Claude the folder layout. |

Claude is handed this folder and given its full toolbox — `Read`, `Grep`,
`Glob`, `WebSearch`, `WebFetch`. Resolving a citation like `[76]` becomes
a literal `Grep "\[76\]" content.md`. Finding where *self-attention* is
defined is `Grep "self-attention" content.md | head`. The AI is a shell;
the paper is a filesystem.

## Extraction pipeline

Extraction happens entirely in the renderer, through `pdfjs-dist`. No
external binaries, no system dependencies (no `poppler`, no Ghostscript,
no `pdftoppm`). This matters because anything the user has to
`brew install` is a latent failure mode on every new machine.

1. **Text.** `extractAllPagesText()` walks each page's text content and
   reconstructs lines, clustering runs into paragraphs. Column detection
   uses x-overlap and gap heuristics (≥35% x-overlap to stay in the same
   paragraph, ≤3.5× font-width gap to stay on the same line) so
   two-column papers don't collapse row-wise.

2. **Figures.** `extractFigureBoxes()` walks the page's PDF operator list
   and tracks the current transformation matrix through every `save`,
   `restore`, and `transform` op. For each `paintImageXObject`,
   `paintJpegXObject`, inline image, or mask op, the axis-aligned
   bounding box of the unit square (transformed by the CTM) is recorded.
   Boxes smaller than a minimum threshold (≥60 pt wide/tall, ≥6000 pt²
   area) are discarded as icons / bullet markers.

3. **Crop rendering.** The page is rendered once to a canvas at 2×
   density, and each figure bbox is cut out of the canvas and saved as
   a PNG under `images/page-NNN-fig-K.png`. Rendering twice — once per
   figure — would be wasteful and visibly slow on figure-heavy pages.

4. **Assembly.** `content.md` is written with a `## Page N` heading per
   page, `<!-- PAGE N -->` comment markers for stable anchor points, and
   markdown image references to each page's extracted figures placed
   right after the heading. Reading order is preserved.

## Decomposition (one-shot, cached)

After the index is written, a single Claude Agent SDK call reads
`content.md` end-to-end and any figure PNGs whose visual content is
load-bearing, then emits a compact JSON digest:

```json
{
  "title": "...",
  "authors": ["..."],
  "abstract": "...",
  "sections": [
    { "name": "1. Introduction", "summary": "one sentence", "pages": [1, 2] }
  ],
  "figures": [
    { "id": "Figure 1", "page": 3, "caption": "...", "description": "one sentence" }
  ],
  "equations": [...],
  "glossary": [...]
}
```

The digest is persisted to SQLite keyed by the paper's content hash (not
path), so moving or renaming the PDF preserves indexing. Per-paper cost:
one-time. Per-explain cost: amortized.

This call used to tell Claude to `Read` the raw PDF page-by-page, which
routed through the Agent SDK's PDF reader (which shells out to `pdftoppm`
from poppler). That was redundant: the renderer had already written the
full text + cropped figures to disk. The new decompose prompt points
Claude at the index folder, and poppler is no longer reached anywhere in
the system.

## Per-call explanation

When the user holds ⌘ and pinches on a passage:

1. The renderer determines the target: **selection > cursor-hit >
   viewport**. If text is selected, that's the passage; otherwise the
   smallest region containing the cursor; otherwise the viewport
   contents.
2. The exact viewport is captured from the `<canvas>` layer and written
   to `zooms/<lensId>.png` before the stream starts, so Claude sees the
   same pixels the user does.
3. The renderer sends an IPC `explain:start` with the extracted passage,
   page number, PDF bbox, zoom image path, index folder, and cached
   digest.
4. The main process composes a prompt and calls the Agent SDK with:
   - A system prompt instructing the model to ground in the paper, to
     default to including one inline SVG diagram when structure matters,
     to begin with substance (no "Here's an explanation…" preamble), and
     to cite page and figure numbers.
   - A user prompt carrying the passage, the page, the zoom image path,
     the index folder path, the cached digest, any prior Q&A on this
     region, and any user-supplied follow-up.
5. The SDK streams the response: text deltas, tool calls (Read, Grep,
   WebSearch…), and thinking deltas all flow to the renderer in real
   time via IPC. The user sees "working…" activity before the final
   answer starts arriving.
6. On completion, the explanation is persisted to SQLite keyed by region
   id. Reopening the PDF weeks later restores the exact lens — viewport
   image, thread, prompt.

## Why this composition works

- **Low perceived latency.** The digest + zoom image + passage fits into
  the context window without expensive file reads. First token typically
  arrives in 1–2 seconds.
- **High precision.** `Grep` on the index produces citations that a
  human can click and verify. Answers refer to "p. 4" because they read
  page 4.
- **Cheap per-paper.** The expensive call (decomposition) happens once;
  every subsequent pinch reuses the cached digest.
- **No external tooling.** Everything the user sees Fathom do — extract
  text, crop figures, render diagrams, stream answers — works from a
  clean macOS install + the `claude` CLI.
- **Portable state.** All paper state lives in one folder next to the
  PDF. Move both, and reading continues on the new machine with the same
  lens history.

## Non-goals

Deliberately out of scope:

- RAG / embeddings / vector nearest-neighbour search.
- Whole-page PDF screenshots as grounding (cropped figures only).
- Generated diagrams via Mermaid, ASCII art, or markdown
  pseudo-diagrams. Inline SVG only.
- Shared / server-side storage. All paper state is local; Fathom does
  not transmit papers or lens content off-device.
- Multi-PDF search / library. Fathom is a reader, not a digital library.

## Further reading

- [Principles]({{ '/PRINCIPLES' | relative_url }}) — the design rules
  these engineering choices support.
- [Install guide]({{ '/INSTALL' | relative_url }}) — how to get Fathom
  running.
- [Source code](https://github.com/ashryaagr/Fathom) — the code the
  document describes.
