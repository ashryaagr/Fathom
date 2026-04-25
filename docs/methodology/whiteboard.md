---
layout: default
title: Methodology — The Whiteboard Pipeline
permalink: /methodology/whiteboard/
---

> Part of the [Methodology Index](/methodology/). This page covers how Fathom turns an indexed paper into a multi-level Excalidraw whiteboard you can zoom into. The companion [Paper methodology](/methodology/paper/) covers the underlying paper-indexing and lens pipeline.

# The Whiteboard pipeline

The Whiteboard is a separate tab next to the PDF view. After a paper indexes, Fathom builds a hand-drawn Excalidraw diagram explaining the paper's **core methodology and algorithms** — not literature, not section structure. You can zoom into any node to see a more detailed sub-diagram. Two zoom levels in v1; Level 3 (algorithm-level napkin cards) is a follow-up.

The full design spec lives at [`.claude/specs/whiteboard-diagrams.md`](https://github.com/anthropics/fathom/blob/main/.claude/specs/whiteboard-diagrams.md) in the source tree. This page is the user-facing *operations* version: what actually happens at each step, what to look for in logs, what to do when it goes wrong.

## The two-pass shape

```
[Indexing complete]                       [User opens Whiteboard tab]
       │                                          │
       │                                          ▼
       │                                  [Inline consent prompt]
       │                                  "Generate whiteboard?
       │                                   ~$1.90 · ~70 s"
       │                                          │ accept
       ▼                                          ▼
[Pass 1 — UNDERSTAND]                     [Pass 2 — RENDER (Level 1)]
   Opus 4.7 (1M context)                     Opus 4.7
   Reads ENTIRE paper                        Cached: Pass 1 output
   Tools: Grep on content.md                 Tools: Glob on images/
   Output: Markdown                          Output: WBDiagram JSON
   "understanding doc"                               for Level 1
                                                    │
                                                    ▼
                                          [ELK.js auto-layout]
                                                    │
                                                    ▼
                                          [Excalidraw scene]
                                          (rendered in tab —
                                           figures embedded inline)

                            ──────────────────────────────────

[Level 1 lands → eagerly pre-warm Level 2 expansions in parallel]
                            │
                            ▼
            [Pass 2 — RENDER (Level 2 × N)]
               Opus 4.7  ·  Promise.all
               Cached: Pass 1 output         (each call is independent
               Output: one WBDiagram JSON     and shares the cached prefix —
                       per drillable node     parallelism is free)
                            │
                            ▼
            [ELK.js auto-layout → new Excalidraw frames]
            (animated zoom in when the user clicks a drillable node;
             frames are usually already painted by then)
```

## Pass 1 — Understand

**What it does.** Loads the entire indexed paper into Opus 4.7's 1M-token context window — `content.md`, figure captions, the digest, the optional purpose anchor — and asks the model to produce a structured-but-loose markdown document describing the paper's goal, core methodology, components, and a suggested diagram structure for Levels 1 and 2.

**Why Opus 4.7, not Sonnet.** Long-context selection is exactly what Opus is built for. The whole paper fits; the model decides what's important. We deliberately avoid a multi-stage extraction pipeline because narrowing too early loses information that later passes might need.

**Why not RAG.** Fathom's foundational principle (CLAUDE.md §6): no embeddings, no semantic search. The paper is already a folder Claude can navigate as a file system. Pass 1 doesn't need RAG because the entire paper fits in context; for the rare case where it doesn't (long surveys), we chunk by section using the digest, run Pass 1 per super-section, and merge.

**Tools.** Pass 1 has read-only `Grep` on `content.md`. Not for retrieval (the paper is already loaded) but for self-verification — when the model is about to commit a quote, it can grep to confirm the wording is verbatim. This is the Chain-of-Verification pattern (Dhuliawala et al. 2023). No `Read`, no `Bash`, no `WebSearch` — Pass 1 is purely about understanding what's in front of it.

**Output.** Markdown with H2 sections (Goal, Core methodology, Components, Suggested Level 1 diagram, Suggested Level 2 expansions). The structure is a *suggestion*, not a contract — the user told us "rigorous structures can often be counterproductive when working with agents." If a paper doesn't fit the standard shape (e.g. a theory paper), the model adapts the headings.

**What to look for in logs.** `[Whiteboard Pass1]` lines. Cost per call (~$1.35 for a 10pp paper), latency (~50s), input token count, output token count. If output is truncated (very long papers), you'll see a `truncated_at` field. If Grep was called, you'll see `[Whiteboard Pass1] grep: <pattern>` lines.

**Failure modes.**

- **Long papers (>80k input tokens)**: v1 ships the single-call path. Most research papers fit comfortably in Opus 4.7's 1M context window; surveys and book chapters may produce a degraded understanding doc as long-context attention degrades past the RULER benchmark's 80k threshold. The chunked-by-section + thin-merge fallback is described in the spec and tracked in todo.md #57; it lands the first time a user reports a degraded understanding doc.
- **Pass 1 returns empty / unparseable**: the renderer surfaces the error state with a "Try again" button. The whiteboard tab persists no scene; the user can retry via consent + Generate.
- **Theory / survey papers**: Opus is asked to detect this in the system prompt and adapt its sections (theorems instead of stages, taxonomy instead of pipeline). The renderer's tolerant DSL accepts whatever shape Sonnet emits — Pass 2 just produces fewer drillable nodes for theorem-shaped papers.

## Pass 2 — Render (called per diagram)

**What it does.** Takes the cached Pass 1 understanding doc + a render request ("Render Level 1" or "Render Level 2 for the node labelled X") and emits a `WBDiagram` JSON — node/edge list with optional citations, kinds, layout hint, and an optional `figure_ref`. Pass 2 was originally specced as Sonnet 4.6 but shipped on Opus 4.7 (PM update 2026-04-25): "A diagram is the user's mental-model substitute for the paper; quality consistency between Pass 1 (understanding) and Pass 2 (rendering) matters more than the per-call cost saving." Net cost bumps from ~$1.50 to ~$1.90 per paper.

**The DSL.** Loose schema, all fields except `nodes` and `edges` optional. Renderer is tolerant: missing summaries default; unknown `kind` values fall back to "process"; layout-hint defaults to "lr" (left-to-right); missing or invalid `figure_ref` silently falls back to text-only. Nothing in the DSL is a hard constraint that breaks the model.

**Tools.** Pass 2 has read-only `Glob` on the per-paper sidecar — specifically so the model can confirm which `images/page-NNN-fig-K.png` figure files actually exist before committing a `figure_ref`. No `Read`, no `WebSearch`, no `Bash`. Same Chain-of-Verification spirit as Pass 1's grep escape hatch (Dhuliawala et al. 2023).

**Caching.** Pass 2 reuses the Pass 1 understanding doc as the cached prefix (passed to the Claude Agent SDK). The `[Whiteboard Pass2]` log line reports `cache=HIT` or `cache=miss` — instrument first, escalate later. Pass 2 calls (1 for Level 1, up to 5 for Level 2 expansions) all hit the same prefix; per-call cost ~$0.05 on a hit (Opus pricing).

**Eager Level 2 pre-warm.** The renderer kicks off all Level 2 expansions in parallel as soon as Level 1 lands (`Promise.all` — each call is independent and shares the cached prefix). This turns the worst-case "user clicks a drillable node → wait 8 s for the L2 to land" into "user clicks → it's already painted, or close to it." Cancellable: if the user closes the tab mid-warm the abort controllers cancel the in-flight calls.

**Rendering.** The DSL is fed into ELK.js (Eclipse Layout Kernel — the same engine Excalidraw's auto-layout uses) for hierarchical placement, then converted to an Excalidraw scene with proper bindings. The model never emits Excalidraw JSON directly because Excalidraw scenes have ~30 fields per element with brittle inter-element bindings; LLMs get them consistently wrong.

**Visual continuity rules** (from the Visual Abstraction researcher):

- ≤ 5 nodes per diagram (Cowan 4±1 working memory cap).
- Same Excalifont, same hand-drawn stroke, same palette across all levels.
- Level 2 diagrams render inside a parent-frame outline labeled with the parent node's name; sibling Level 1 nodes ghost to ~20% opacity at the canvas edges so the user knows where they are.
- Drillable nodes carry a `⌖` glyph + dashed inner border; leaf nodes carry no glyph + solid border; generating nodes carry a spinning `⌖` + dashed border. Three non-color signals (color-blind safe).
- Citation markers (small amber square in node's top-right) follow the same grammar as PDF lens markers — one unified marker language across the product.
- **Bound text inside containers**: each node's label and (optional) summary live inside ONE bound text element with `containerId` set to the rectangle. Excalidraw centers + word-wraps it inside the container, which is the only way to keep text from spilling outside the rect at varying summary lengths. Free-positioned summary text (the v1 attempt) is forbidden — it overflowed the boxes and overlapped neighbors.

**Embedded paper figures.** When the understanding doc references a figure for a node (e.g. "see Figure 2"), Pass 2 may set `figure_ref: {page: N, figure: K}` on that node. The renderer composes the path `<sidecarDir>/images/page-NNN-fig-K.png`, registers the PNG with Excalidraw's `addFiles`, and embeds it as an `image` element to the right of the node's rectangle. Single highest-leverage UX win — readers recognise their own paper's figures instantly. Falls back silently to text-only if the file doesn't exist (no crash). The lookup is a deterministic path computation, not retrieval — preserves CLAUDE.md §6's no-RAG rule.

**What to look for in logs.** `[Whiteboard Pass2]` lines. Per render: target frame (`level=1` or `level=2 parent=L1.X`), token counts, cache hit/miss (`cache=HIT` or `cache=miss`), USD cost, latency. `[Whiteboard Render]` lines for the ELK layout pass include node + edge counts and the resulting bounding box. `[Whiteboard UI]` lines from the renderer mark each end-to-end pipeline transition (`generate begin`, `pass1 done`, `pass2 done`, `expand begin`, `generation complete`).

## Anti-hallucination — soft verifier

Pass 1 is encouraged to inline-cite quotes with `[p.N]` page tags. After Pass 1 completes, a **background verifier** greps each cited quote against `content.md`:

- Whitespace + case + punctuation normalised first.
- Accept ≥85% trigram overlap as "verified."
- Hard "unverified" only when overlap is <50% with anything in `content.md`.

Verifier results are logged to `whiteboard-issues.json` in the paper's sidecar folder. The diagram is **never mutated** based on verifier output. Instead, the citation marker carries a two-channel verified/unverified signal:

- **Verified citation**: solid amber square, no glyph.
- **Unverified citation**: dashed amber square outline + faint `?` glyph.

Two channels (shape + glyph), so color-blind / low-vision users still get the cue without relying on color contrast.

If >40% of quotes fail to verify on a paper, a one-time banner appears: *"Some citations may not match the paper exactly — review carefully."* (Threshold is data-driven; we'll calibrate after observing real papers.)

**Why soft, not hard.** v1's design auto-dropped any unverified node; the user (correctly) flagged this as the kind of "rigorous structure" that hides the model's actual reasoning. Better to surface unverified citations as such and let the user judge than to silently delete content.

## The side chat (deferred from v1)

The right-rail side chat — patch loop with typed ops (`add_node`, `relabel`, `split_node`, `merge_nodes`, `add_edge`, `change_kind`) and a regenerate-mode escape hatch — is **not in the v1 build**. The spec describes it; the implementer was asked to focus on the diagram pipeline + rendering + drill-in first and to revisit the side chat after the core works.

When it lands, the design is unchanged from the spec: 320 px collapsible right rail, scoped per-frame (Level 1 vs. Level 2 of Encoder are separate threads), patch-mode by default with a regenerate-mode escape when the model wants to touch >40% of nodes.

For now, regenerating means: the user clicks "Try again" on a failed run, which calls `whiteboard:generate` again and replaces the saved understanding doc + scene.

## Persistence

Whiteboard state lives at `~/Library/Application Support/Fathom/sidecars/<contentHash>/whiteboard.excalidraw` (alongside the rest of the paper's index). Each zoom level is an Excalidraw `frame` element; all frames live in the single `.excalidraw` file. Per-node metadata (citation, parent, drillable, generated-at) lives in Excalidraw's `customData` field, which round-trips through the file format for free. Side-chat history lives at `whiteboard-chat.json` keyed by frame ID.

Move the PDF and the whole sidecar folder travels with it. Re-opening the paper restores the whiteboard exactly as the user left it.

## Cost & latency

For a typical 10-page paper:

| Stage | Cost (first run) | Latency |
|---|---|---|
| Pass 1 (Opus 4.7) | ~$1.35 | ~50 s |
| Pass 2 — Level 1 (Opus 4.7, cached) | ~$0.05 | ~5–8 s |
| Pass 2 — Level 2 ×5 (Opus 4.7, cached, parallel) | ~$0.50 | ~5–8 s wall-clock (parallel) |
| **Total first-time generation** | **~$1.90** | **~60 s to L1 paint, ~70 s to L1+L2 fully expanded** |
| Per side-chat patch | ~$0.05 | ~3 s |

The user's Claude CLI auth pays for this — so consent is required per paper. First Whiteboard-tab click for a paper shows an inline button: *"Generate whiteboard for this paper? · ~$1.90 · ~70 s"*. After accept, the pipeline runs. A Preferences toggle "auto-generate on index" can flip default behavior.

## Tab-level status dot (forcing function)

The Whiteboard tab in the header tab strip carries a small colored dot next to the label so the user can tell "is the AI working on this?" at a glance — without having to switch into the tab. Color + animation grammar matches the inline-ask streaming markers (`fathom-marker-streaming` in `index.css`):

| State | Dot | Notes |
|---|---|---|
| No whiteboard yet (consent pending) | none | The consent affordance lives inside the tab; no dot needed. |
| Pass 1 in flight (~50 s) | red (#d4413a) + 1.2 s opacity pulse | Same red as the streaming marker on the PDF — one unified "working" signal. |
| Pass 2 / Level 1 hydrate in flight | red, still pulsing | Continuous with Pass 1 — the user sees one streaming state. |
| Pre-warming Level 2 expansions in parallel | red, still pulsing | The dot stays red until every in-flight expansion completes. |
| Ready (Level 1 painted, no in-flight expansions) | amber (`var(--color-lens)`), no animation | Same amber as PDF lens markers and citation markers inside diagrams. |
| Failed | red, no animation | Combined with the failure UI inside the tab. |

This is a forcing function for "is it ready" awareness — the user does not have to remember to check the tab. Color + motion are two channels (cog reviewer §6 colour-blindness rule) so the screen-reader `aria-label` ("Whiteboard generating", "Whiteboard ready", "Whiteboard generation failed") provides the third independent channel.

## Drill UX

Two equivalent ways to drill from a Level 1 node into its Level 2 expansion (per CLAUDE.md §2.1: every interaction needs a keyboard path AND a gesture path):

1. **Click the drillable Level 1 node** (preferred — discoverable, no learning curve). Drillable nodes carry a dashed inner border + amber ⌖ glyph at the bottom-right. Click → Level 2 frame becomes the active focus, breadcrumb updates to "Paper ▸ <node label>", canvas animates `scrollToContent` over 320 ms with a `cubic-bezier(0.4, 0, 0.2, 1)` curve (inside Doherty's 400 ms threshold).
2. **⌘+pinch on the node** (matches the existing PDF dive gesture — same recursion grammar, CLAUDE.md §2.1). Same animation curve, same destination. Useful when the user already has the trackpad in pinch-mode from the previous interaction.

**Drill direction is VERTICAL.** The Level 2 frame sits BELOW its Level 1 parent in the Excalidraw scene, not to the right. The user's mental model is "zooming into a node moves you DOWN the page, not across" (PM update 2026-04-25). Same recursion grammar applies if Level 3 ever ships. The animated `scrollToContent` handles smooth panning; the positional choice is a layout decision in `WhiteboardTab.tsx::mountLevel2Frame`.

Because Level 2 expansions are pre-warmed in parallel as soon as Level 1 lands (see "Eager Level 2 pre-warm" above), the typical drill is *instant* — the L2 frame is already painted, the click just animates the camera to it.

To drill back out: click the breadcrumb's "Paper" segment, or two-finger swipe right (matches existing lens history navigation).

## Pass 2.5 — visual critique loop ("AI agents that produce visual artefacts must see-and-iterate")

After Pass 2 emits a `WBDiagram` and the renderer rasterises it via Excalidraw's `exportToCanvas`, an Opus 4.7 critique pass LOOKS at the rendered PNG against a small set of layout rules:

- text inside boxes (no overflow)
- arrows don't cross node geometry
- no orphan dashed placeholders (skeleton was torn down)
- drillable nodes carry the ⌖ glyph + dashed inner border
- figure embeds resolve (no broken-image placeholders)
- ≤ 5 nodes per diagram

The critic emits one of:

- `{ "ok": true }` — diagram passes; ship to canvas
- `{ "fix": "patch", "ops": [...] }` — typed ops to apply locally (`shorten_summary`, `rename_label`, `drop_node`, `drop_edge`, `set_drillable`, `set_figure_ref`)
- `{ "fix": "replace", "diagram": {...} }` — emit a fresh WBDiagram

The renderer applies the fix, re-renders to PNG via the same `exportToCanvas` path, re-submits, and ships whatever the final iteration produced. Loop caps at 3 iterations. The PNG path is `<sidecar>/whiteboard-render-iter-N.png` and the model `Read`s it via the standard tool — same pattern as the lens reads the zoom image (CLAUDE.md §6 — "Claude's Read tool handles PNG natively"). No headless Puppeteer needed: `exportToCanvas` runs against the live renderer's Excalidraw bundle and returns a Canvas which we serialise via `.toDataURL('image/png')`.

Cost: ~$0.05 per critique iteration on Opus 4.7. Worst case (3 iterations) adds ~$0.15 to a paper's first-time generation, bringing total to ~$2.05/paper. The critique cost is rolled into the per-paper Pass 2 cost counter so the bottom-left cost pill shows a true total.

Logs:

- `[Whiteboard Pass2.5] BEGIN paper=… iter=N png=…` per iteration
- `[Whiteboard Pass2.5] END paper=… iter=N verdict=OK|patch|replace cost=$… t=…ms`
- `[Whiteboard UI] Pass2.5 iter=N verdict=… cost=$…` from the renderer side

## Doherty acknowledgement contract

Every user-initiated whiteboard interaction must produce a visual response within one frame (≤ 400 ms, target ≤ 50 ms). Specifically:

- **First click on the Whiteboard tab**: skeleton + 5 placeholder node outlines + "Generating…" glyph appear in 1 frame. Real nodes hydrate as Pass 2 streams in.
- **Click on a drillable node (Level 2 drill-in)**: parent-frame outline begins drawing AND spinning `⌖` glyph appears within 50 ms. Even if Level 2 generation hasn't started yet (cold cache), the user sees acknowledgement.
- **Side-chat patch submission**: affected nodes get a soft outline pulse within 50 ms.

The 70 s first-paint and ~5 s per-iteration latencies are fine *as long as the immediate ack is in*. Implementation must not let any user-visible interaction wait for a network call before painting confirmation.

## Where to look when something is wrong

1. **The diagram looks wrong / missing components.** Read `content.md` (the indexed paper) — what's there determines what Pass 1 can see. If Pass 1 missed something obvious, check the `[Whiteboard Pass1]` log for truncation or chunking failures. The Pass 1 understanding doc is saved alongside the diagram for inspection.
2. **Citations show `?` markers.** Open `whiteboard-issues.json` in the paper's sidecar — it lists every flagged quote with the closest match it found in `content.md`. Often the issue is paraphrase vs. verbatim, not fabrication.
3. **Click on a node does nothing.** Check the Excalidraw `customData` for that node — if `drillable: false`, it's a leaf by design. If `drillable: true` and nothing happens, the Pass 2 call for that node may be in `pending` / `failed`; check the side-chat error state.
4. **Level 2 looks unrelated to Level 1.** This is a Pass 2 grounding bug — the cached Pass 1 didn't carry enough structure for the L2 prompt to anchor. File an issue with the paper hash + the diagram screenshot; the Pass 1 understanding doc will be in the sidecar for diagnosis.

## Known limits and follow-ups

- **No Level 3 in v1.** Algorithm-level napkin cards are deferred to a follow-up. Level 1 + Level 2 only.
- **No side chat in v1.** Iterative patch-loop refinement is deferred (see §"The side chat" above). Today, "regenerate" means the user clicks "Try again" on a failed run; per-node patches are not yet wired.
- **No "Lite" cost-tier toggle in v1.** A `whiteboardSonnetLite` setting is reserved in the schema for the cog-reviewer non-blocking note's $0.50 Sonnet-only Pass 1 alternative. We surface it after observing real acceptance rates on the default Opus-priced version, per the spec's "instrument first, build later" direction.
- **One whiteboard per paper.** No comparing two papers' diagrams side-by-side yet.
- **Public papers only.** No support for protected PDFs or papers behind paywalls (orthogonal to this pipeline).
- **English papers tested.** Other languages should work because Opus is multilingual, but we've observed Pass 1 selecting components correctly only in English so far.
- **Cost may surprise users.** ~$1.90/paper is significantly more than the lens (~$0.05/dive). Consent prompt explicit about this.
- **5-node ceiling enforced at parse time.** If Sonnet emits >5 nodes for a single diagram, the parser keeps the first 5 and drops dangling edges. Cog reviewer §1 hard rule (Cowan 4±1 working memory cap) — silently violating it would defeat the diagram's purpose.

## Updating this page

When the implementer changes the pipeline, this page must change in the same commit. The CLAUDE.md "AI-built-product principle" treats methodology + logs + code as one shipping unit, not three separate concerns. If the doc and the code drift, file the gap as a bug — both need to land in the same change.
