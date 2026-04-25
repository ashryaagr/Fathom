# Visual Abstraction Researcher — Visual + Interaction Design (research input for `whiteboard-diagrams.md`)

This is the Visual Abstraction Researcher agent's raw deliverable for the Whiteboard Diagrams spec. Synthesised into the parent spec by the PM after the AI Scientist also returned.

---

## 1. Level 1 — "what even happens in the paper"

**Convergent grammar across paper types.** Survey of "Figure 1" conventions (Transformer, ResNet, MapReduce, AlphaGo, BERT, Diffusion, PRIMES-in-P) shows they all reduce to a single shape: **inputs → transformation pipeline → outputs**, with a labelled "what's new" badge on the novel block. We adopt that single template — paper type does not change the grammar, only the *labels on the boxes*.

**Hard ceiling: 5 nodes (Cowan 4±1).** Anything more is a §1 veto in `fathom-cog-review`. If the paper has more stages, the AI Scientist must collapse them (e.g. "encoder × N" stays as one node, drillable).

**Text per node:** 2–4 words, ≤24 chars. Excalifont at the lens's default 1.0 zoom renders ~16 px x-height; below ~12 chars per line it stays foveal-readable in one fixation.

### 1a. ML methods paper — "Attention Is All You Need"

```
              ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐    ┌──────────────┐
   tokens ─►  │  Token +     │ ─► │   Encoder        │ ─► │   Decoder    │ ─► │   Linear +   │ ─► tokens
              │  Pos. Embed  │    │   (× 6 stack)    │    │   (× 6)      │    │   Softmax    │
              └──────────────┘    └─────────┬────────┘    └──────┬───────┘    └──────────────┘
                                            │ "no recurrence"    │
                                            └────► self-attention only ◄────┘
                                                       (★ novel)
```

Star/badge on the novel block. Edge labels are tensor shapes only when shapes are the contribution.

### 1b. Systems paper — "MapReduce"

```
   ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  Input   │ ─► │    Map       │ ─► │   Shuffle &  │ ─► │   Reduce     │ ─► output files
   │  splits  │    │   workers    │    │    Sort      │    │   workers    │
   └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                          ▲                                       ▲
                          └──────── Master (assigns tasks) ───────┘
                                          (★ novel)
```

Single coordinator drawn as a *separate* node above the pipeline — orchestration boxes never sit inline (Tufte: layering & separation).

### 1c. Theory paper — "PRIMES is in P"

```
   ┌───────────┐    ┌──────────────────┐    ┌────────────────┐    ┌──────────────┐
   │  Input n  │ ─► │ Check if n =     │ ─► │ Find smallest r│ ─► │ Verify       │ ─► PRIME / COMPOSITE
   │           │    │ a^b (a,b > 1)    │    │ s.t. ord_r(n)  │    │ congruences  │
   │           │    │                  │    │ > log²n        │    │ (★ novel)    │
   └───────────┘    └──────────────────┘    └────────────────┘    └──────────────┘
                                                                  polylog(n) time
```

Theory papers get the *theorem statement* as a small caption beneath ("PRIMES ∈ P, deterministic, polylog runtime").

## 2. Level 2 — zoom into a Level 1 node

**Same canvas, animated zoom — not a new tab.** Excalidraw's `scrollToContent` + camera animation moves the viewport into the parent node's bounding rect; the parent node's interior fades from the placeholder rectangle into the Level 2 sub-graph. This mirrors Fathom's existing dive: anchor stays put, content elaborates inside it. The user sees they are *inside* the Encoder, not *next to* it.

The transition: 320 ms `cubic-bezier(0.4, 0, 0.2, 1)`, well inside Doherty's 400 ms.

**Continuity cues:**
- Parent node's stroke colour + label persist as a soft frame around the Level 2 subgraph (still says "Encoder" in the corner).
- Sibling Level 1 nodes ghost to ~20% opacity at the canvas edges so the user knows where they are in the parent.

### Example — Level 2 inside "Encoder"

```
   ┌─── Encoder ────────────────────────────────────────────────────────────────┐
   │                                                                            │
   │   in ─►┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐  │
   │        │  Multi-head  │─►│  Add & Norm  │─►│  Feed-Fwd    │─►│ Add &   │─►│ out
   │        │  Self-Attn   │  │  (residual)  │  │  (2-layer)   │  │ Norm    │  │
   │        └──────┬───────┘  └──────┬───────┘  └──────────────┘  └─────────┘  │
   │               │                 │                                         │
   │               └─ residual ──────┘                                         │
   │                                                                          ×6│
   └────────────────────────────────────────────────────────────────────────────┘
```

Same 5-node ceiling. Same grammar. The ×N badge in the corner indicates the stack.

## 3. Level 3 — algorithm interior

**Choice of representation depends on what the algorithm IS, not on the paper type.** Three templates:

| Algorithm shape | Template | Example |
|---|---|---|
| Sequential transformation | **Annotated pseudocode card** | self-attention math |
| Branching control flow | **Flowchart** | beam search |
| State machine / loop | **State diagram** | Paxos, training loop |

To keep "casual hand-drawn aesthetic" without becoming a wall of code, pseudocode is rendered as a **napkin card** (Roam, *Back of the Napkin*): a hand-drawn rectangle with 5–8 lines of monospaced-but-Excalifont-styled text + one inline mini-diagram on the right showing the shape transformation. Code lines are commented in plain language, not language-specific.

### Example — Level 3, self-attention

```
   ┌─── Self-Attention ────────────────────────────────────────────────────────┐
   │                                                                           │
   │  for each token x_i:                       ┌──────────────────────┐      │
   │    q, k, v = W_q·x, W_k·x, W_v·x           │   Q  ┐               │      │
   │                                            │      ├─► Q·Kᵀ        │      │
   │    scores = Q · Kᵀ  / √d_k                 │   K  ┘     │         │      │
   │    weights = softmax(scores)               │            ▼         │      │
   │    out_i  = weights · V                    │          softmax     │      │
   │                                            │            │         │      │
   │  ★ every token attends to every other      │   V ──► weights·V    │      │
   │     in O(n²) compute, O(1) sequential      │            │         │      │
   │                                            │            ▼  out    │      │
   │                                            └──────────────────────┘      │
   │                                                                          │
   │  ▢ source: §3.2.1, p.4, eq.(1)                                          │
   └───────────────────────────────────────────────────────────────────────────┘
```

The right-side mini-diagram is the *picture* of the math. Multimedia Principle (Mayer) — words + picture beats either alone. Both rendered in Excalidraw with hand-drawn arrows.

## 4. Navigation between zoom levels

**Primary: ⌘+pinch on a node** — identical to the existing dive gesture (CLAUDE.md §2.1, recursion has one visual grammar). The whiteboard does not invent a new gesture.

**Secondary (mouse-only / accessibility, per §2.4 keyboard-path rule):**
- Double-click node → drill in
- `Esc` or two-finger swipe-right → drill out (matches existing lens history)
- `[` / `]` → previous / next sibling at current level

**Persistent breadcrumb (top-left of canvas, NOT a tab):**

```
  Paper ▸ Encoder ▸ Self-Attention
```

System sans (chrome, not voice — §2.4). Each segment clickable to jump back. Max depth surfaced; if the user drills past Level 3, breadcrumb truncates middle with `…`.

**Mini-map: NO.** A mini-map would split foveal attention from canvas to corner. The breadcrumb plus the parent-frame outline (§2 above) provide the same orientation cheaply. Reject mini-map proposals on this basis.

## 5. Drillable vs. leaf affordance

- **Drillable node:** dashed inner border + tiny "⌖" glyph in the bottom-right corner (5 px). Glyph appears on hover; border is always there but subtle. Pinch-cursor on hover (matches PDF dive).
- **Leaf node:** solid border, no glyph, no inner dashing. Cursor stays default. Hover tooltip says *"as deep as it goes"* on first encounter only (dismissable scaffolding, §1 CLAUDE.md).
- **Generating-on-demand node:** dashed border + spinning ⌖ glyph, immediate ack on click (Doherty) → optimistic "Generating Level 2 of Encoder…" caption beneath the node within 50 ms.

Per §6 cog-review, the affordance combines **shape (border style) + glyph + cursor** — three non-colour signals so red/green colour-blindness doesn't break it.

## 6. Source-paragraph citations

**Every node carries a marker, drawn as a small amber square in the node's top-right corner** — the same amber as PDF lens markers (CLAUDE.md §2.3). One unified marker grammar across the product.

- **Hover marker** → tooltip: *"§3.2.1, p.4 — `'we use scaled dot-product attention because…'`"*
- **Click marker** → opens the PDF tab, scrolls to that paragraph, briefly pulses the source region. The whiteboard tab stays mounted in the background.
- **⌘+click marker** → opens a Fathom *lens* on that paragraph (full dive). This unifies the whiteboard with the rest of the product: from any whiteboard node, the user is one gesture away from the source AND one gesture away from a free-form Claude conversation about it.

Citation lives **on** the node, not in a side panel — keeps foveal attention on the diagram.

## 7. Excalidraw integration

**Package:** `@excalidraw/excalidraw` (current stable, ~0.18.x in 2026). Embed directly in a React tab; ref-based imperative API exposes `updateScene`, `scrollToContent`, `getSceneElements`, `setActiveTool`.

**Per-node metadata** uses Excalidraw's `customData: Record<string, any>` field on each element — store `{ nodeId, level, parentId, sourceCitation: {pageNum, paragraphHash, quote}, drillable: bool, generatedAt }`. CustomData round-trips through `.excalidraw` JSON, so persistence comes free.

**Gotchas to plan for:**

1. **Excalifont registration.** Excalidraw bundles its own font loader; we must register Excalifont *before* the component mounts or the first render shows fallback sans for one frame. Fathom already loads Excalifont for the lens — reuse the same loader, ensure `document.fonts.ready` resolves before mounting the Excalidraw tab.
2. **Read-only when generating.** Pass `viewModeEnabled={true}` while a Level N is streaming in, flip to false on completion. Prevents the user editing half-rendered nodes.
3. **Keyboard-focus theft.** Excalidraw captures keystrokes globally inside its container. Wrap the canvas in a `tabIndex={-1}` div and only forward keys when the canvas is the activeElement (Fathom's lens shortcut `⌘+L`, Ask box `/`, must still work from the whiteboard tab). `excalidrawAPI.setActiveTool({type: 'hand'})` after each level transition prevents accidental drawing.
4. **Multi-diagram = Excalidraw frames.** Use Excalidraw's native `frame` element type as our zoom-level container. Each Level 1/2/3 view is a frame; navigation = `scrollToContent(frame, {fitToContent: true, animate: true, duration: 320})`. Frames serialize cleanly into one `.excalidraw` file.
5. **Editable but undo-safe.** User edits to AI-generated nodes are kept (it's their whiteboard), but each AI node carries `customData.aiOriginal` so a "reset this diagram" command can restore.

Tab chrome (tab label "Whiteboard", breadcrumb, side-chat chrome) uses **system sans** — Excalifont stays reserved for diagram labels (the AI's voice explaining the paper), per CLAUDE.md §2.4.

## 8. Side-chat layout

**Right rail, 320 px fixed width, shrinks the canvas (does not overlay).** Overlay would occlude the diagram the user is asking about — same anti-pattern as a side-panel chat (CLAUDE.md non-goal). The rail collapses to a 32 px strip with a chevron when not in use; full-canvas mode is one click away.

**Why right rail, not bottom drawer:** zoom-level diagrams are wide (pipelines flow left-to-right). A bottom drawer steals the vertical real estate that arrows need. A right rail steals horizontal real estate the diagram doesn't use much of.

**Contents (Hick's Law — kept to N=4 controls):**

1. Chat history (scrollable, handwritten font on AI replies, sans on user input)
2. Ask box (sticky bottom)
3. "Apply to canvas" button — appears only when AI proposes a diagram edit
4. "Reset this diagram" — appears only when the user has manually edited

No model picker, no temperature slider, no diagram-style selector. Settings hide behind `?`.

Side-chat is scoped to the *currently focused frame* (Level 1 vs Level 2 of Encoder are separate threads). This avoids the chat becoming a kitchen sink and matches the per-region chat history of the existing lens.

## 9. "Where do I stop?" + closing the whiteboard

**Stop signal:** the leaf affordance from §5 (no ⌖ glyph, solid border) IS the stop signal. The user knows by looking. We additionally render a faint dotted *"deeper not modelled"* sub-label only when the AI explicitly decided not to drill (e.g. "ResNet block — see original paper [He 2015]"). That distinguishes "leaf because trivial" from "leaf because out-of-scope."

**Generating vs. leaf disambiguation:** dashed border + spinning ⌖ = generating; solid border + no glyph = leaf; dashed border + static ⌖ = drillable but not yet generated. Three states, three visual signals.

**Closing the whiteboard:** the tab is just a tab. Click "PDF" to return. State persists. We do *not* auto-close on inactivity (attention-residue — never interrupt the user). Optional `⌘+W` closes the tab; `⌘+1`/`⌘+2` switch PDF/Whiteboard (matches macOS HIG).

## 10. Prior art applied

- **Dan Roam, *Back of the Napkin* (2008)** — "Vivid → Simple → Clear." Our 5-node ceiling and the napkin-card Level 3 come straight from his constraint that a useful sketch fits on a napkin. Lesson: Level 1 must be expressible on a napkin or it's too complex.
- **Sunni Brown, *The Doodle Revolution* (2014)** — visual vocabulary of 12 primitives (box, line, arrow, cloud, person, star, etc.). We restrict the AI's diagram-DSL palette to these primitives + Excalidraw's hand-drawn style; no exotic shapes. Lesson: a small vocabulary scales; a large one balkanises.
- **Mike Rohde, *Sketchnote Handbook* (2013)** — hierarchy via size + weight, not colour. We use stroke weight to mark the novel/contribution box (★) and reserve colour for state (amber = citation marker, ghost-grey = sibling context). Lesson: colour is for state, not for hierarchy.
- **Tufte, *Visual Display* (1983)** — small multiples + layering & separation. Our parent-frame outline at Level 2/3 is layering; the orchestrator-above-pipeline pattern (MapReduce master) is separation. Lesson: orchestration boxes never sit inline with the pipeline.
- **3Blue1Brown / Sanderson** — animation as continuity, never as decoration. The 320 ms zoom transition exists to preserve the user's mental model of "where we are"; it is not eye-candy. Lesson: every motion must answer "what continuity does this preserve?"
- **Distill.pub, *Communicating with Interactive Articles* (Hohman et al. 2020)** — progressive disclosure: hide detail until requested. Our Levels 1→2→3 are exactly that. The article-level lesson: the *reader controls the resolution*, never the author.
- **Mathigon** — interactive math diagrams that respond to hover/click without leaving the page. Our hover-marker citations follow this: explore via hover, commit via click. Lesson: hover for *information*, click for *navigation*.
- **Dominic Walliman, "Map of Mathematics"** — radial decomposition with consistent visual weight per branch. We do *not* adopt radial layout (papers are pipelines, not taxonomies), but we adopt his lesson that all nodes at the same level must have visually equal weight, so the eye doesn't infer false hierarchy.
- **Apple HIG — Tabs and Hierarchy** — tab switching is instant and reversible. Our PDF↔Whiteboard tab switch is instant; state persists; no confirmation modals.
- **Survey of papers' own Figure 1s** (Transformer, ResNet, MapReduce, AlphaGo, BERT, Diffusion, Mamba) — convergent grammar: input → pipeline → output, with the novel block badged. This is what justifies our single Level 1 template.

---

## Sources

- [Excalidraw README — customData & integration](https://unpkg.com/browse/@excalidraw/excalidraw@0.14.2/README.md)
- [Excalidraw developer docs — excalidrawAPI](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)
- [Excalidraw developer docs — Integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [DeepWiki — Component Props and Imperative API](https://deepwiki.com/excalidraw/excalidraw/10.2-component-props-and-api)
- [Distill — Communicating with Interactive Articles (Hohman et al. 2020)](https://distill.pub/2020/communicating-with-interactive-articles/)
- [Distill — about page (interactive scientific publishing)](https://distill.pub/about/)
- [Progressive Disclosure — Decision Lab reference](https://thedecisionlab.com/reference-guide/design/progressive-disclosure)
