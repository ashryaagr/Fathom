---
spec: Whiteboard Layout Strategy v3.2 — minimal primitives + sizeWeight hierarchy + labeled zones + equation strategy + AC-3 retired (refines v3.1 with whiteboard-impl's read of the example image)
owning_team_primary: Layout Strategist (this doc)
review_required: cog-reviewer-2 (parallel teammate, before any code lands) — v3.2 refines v3.1 (which itself superseded v3-draft-1). Combined v3.1+v3.2 audit; reviewer can verdict both at once. v2 verdicts in §15 stand for the *cognitive content* of preserved decisions but the *structural location* changes per §16.
created: 2026-04-25
revised: 2026-04-25 (v3.2) — refines v3.1 with four implementation-grounded additions surfaced by whiteboard-impl's read of the example image: (a) **`sizeWeight` parameter** on `create_labeled_shape` (`'dominant'|'standard'|'subordinate'`) to drive the SIZE-based hierarchy the example uses (the DiT Backbone is bigger because it's the main thing — not because of a kind tag); (b) **labeled-background-zone semantics** for intra-section grouping (INPUTS / EMBED / PROJECT in the example) — same `create_background_zone` primitive but the `label` slot is explicit with typography rules; (c) **equation typesetting strategy** picked: tiered (unicode + monospace as default for v3.2; KaTeX→SVG deferred to v3.3 with feature flag); (d) **AC-3 retired** ("exactly 1 model node" is paradigm-incompatible with sizeWeight hierarchy) and replaced with AC-36 (FAIL) "exactly 1 sizeWeight: 'dominant' per workflow-style section" + AC-37 (WARN) "no dominant = no clear focal point." Plus a note in §8 surfacing the lane-allocator → section-band allocator refactor whiteboard-impl flagged. v3.1 design philosophy (6 minimal primitives + 2 programmatic guarantees + soft authoring guidelines) is unchanged.
revised: 2026-04-25 (v3.1) — supersedes v3-draft-1 sent to cog-reviewer-2 earlier today. The v3-draft-1 baked seven prescriptive modalities as separate MCP tool primitives; team-lead's softening brief retracts that as over-engineering. v3.1 keeps the outer narrative-sections model (§16) but drops the modality-as-tool-vocabulary in favor of **6 minimal expressive primitives + 2 programmatic guarantees + soft authoring guidelines**.
audit-status: **v2: APPROVED (pass-4) on 2026-04-25 — preserved.** **v3.2.1: APPROVABLE per cog-reviewer-2 pass-2 (2026-04-25) with 3 small ✗ + 5 housekeeping items — all folded.** Pass-2 audited v3.1; v3.2 had landed before pass-2 with most of pass-2's PART A items already addressed (we crossed wires twice — pass-1 audited v3-draft-1, pass-2 audited v3.1, both before successive supersede pings landed). Pass-2's actionable items, all now in spec: ✗1 AC-numbering corrected (AC-39 text-overflow + AC-40 shape-non-overlap, distinct from v2 AC-1/AC-2 which are L2-frame-overlap + edge-crosses-node); ✗2 critique rubric expanded to cog-reviewer-2's 6-criterion checklist in §17.5 iteration discipline; ✗3 cross-section title-crossing — already in spec as AC-33 (cog-reviewer-2's renumbering ask absorbed via numbering note); C3 AC-28 except-on-instant-mode added; C5 §17.5 item 7 figure-placement guideline added; Q-v3.1-1..5 verdicts (✓/⚠ as marked) all reflect the v3.2 mitigations already in spec. **v3.2.1: PENDING cog-reviewer-2 pass-3 sign-off banner.** Re-audit scope (pass-3 final verdict): verify ✗1/✗2/✗3 + C3/C5 actually land cleanly; if so, write the §15-style v3 sign-off banner appendix (which goes in as a new §20).
supersedes_partially: `.claude/specs/whiteboard-diagrams.md` §"Visual + interaction design" — clauses on L2 placement, visual diversity, and edge routing. v3.1 supersedes v2's §10 chat-zone band layout (chat is now a section type) and v3-draft-1's §17 modality decision tree (replaced by primitive set + soft guidelines). v3.2 supersedes v2's AC-3 (model-node-count enforcement, paradigm-incompatible with sizeWeight).
adds: (v2) chat-authored diagrams; camera/viewport orchestration (§11); checkpoint/restore (§12); labeled-shape-first authoring (§13); progressive emission order (§14). (v3.1) narrative sections as vertical-flow contract (§16); minimal expressive primitives + agent authoring guidelines (§17); per-element semantic-role palette extension (§18); v3.1 audit asks (§19). (v3.2) `sizeWeight` parameter on `create_labeled_shape`; labeled-zone typography rules; equation typesetting strategy (tiered); AC-3 → AC-36 + AC-37; section-band allocator refactor surfacing.
depends-on: `look_at_scene` MCP tool (built by VLOOP-1, task #59). Returns a PNG of the current in-memory scene so vision-capable Claude can self-critique. **CRITICAL for v3.1**: with the 7-modality scaffolding removed, the visual self-loop is now the *primary* quality safeguard — the agent has freedom to compose, the renderer enforces the two guarantees (no shape overlap; text-in-shape doesn't overflow), and the visual self-loop catches everything else (free-text-on-node collisions, ugly compositions, illegible cluttered sections). This is the calibration v3.1 stakes: **freedom + guarantees + iteration loop > prescriptive vocabulary**.
external-input: (v2) 2026-04-25 the team-lead surfaced the style guide of a sibling Excalidraw tool. (v3-draft-1) 2026-04-25 team-lead surfaced the example image at `/Users/ashrya/.claude/image-cache/bea285c3-7422-4595-a668-2b7b9fa2b858/5.png`. (v3.1) 2026-04-25 team-lead's softening brief — verbatim user instruction: *"need a programmatic way or some good way to ensure that the text meant for each box is within that box. Also, all the texts need not be inside their respective boxes. We can sometimes have text presentation just like in the image I showed. Sometimes you might just be explaining it with text and some diagrams, like a very lucid interplay of how people explain on whiteboards. This is not essentially box after box or a very rigid workflow, because you are providing these tools and guidelines to an agent. You want that agent to be freely able to do anything on the whiteboard that it wants, without over-constraining it."* This drives the v3.1 design philosophy.
references:
  - screenshot (v2 — bug we fixed): `/tmp/fathom-shots/103015-whiteboard-after-fix.png`
  - screenshot (v3.1 — quality target, NOT template): `/Users/ashrya/.claude/image-cache/bea285c3-7422-4595-a668-2b7b9fa2b858/5.png`
  - implementation surface: `src/main/mcp/whiteboard-mcp.ts` (the MCP tool inventory) and `src/renderer/whiteboard/WhiteboardTab.tsx::useEffect L2 mount` (the offset math we currently apply post-process)
  - methodology: `docs/methodology/whiteboard.md`
---

# 1. Strategy summary

**v3.1 design philosophy** (top of stack — read first). The whiteboard agent gets **freedom to compose**, anchored by **two programmatic guarantees** and **one navigational structure** (sections). The agent expresses every concept — workflows, math callouts, number lines, time chains, hatched distributions, annotation paragraphs, key-idea callouts, anything — by composing **6 minimal expressive primitives**. There is no template, no modality enforcement, no decision tree the agent must obey. The user's words: *"a very lucid interplay of how people explain on whiteboards … you want that agent to be freely able to do anything on the whiteboard that it wants, without over-constraining it."*

The two programmatic guarantees that make freedom safe:

1. **Text-in-a-box is GUARANTEED to fit in that box.** When the agent puts text inside a container, the renderer auto-fits + auto-wraps. Already solved at the schema level by Excalidraw's native `label: {text, fontSize}` (LABEL-1, task #61). AC-2 verifies post-render that no `label`-text overflows its container.

2. **Declared shapes don't overlap.** The agent says "I'm placing a box at (x, y, w, h)"; the renderer enforces that no two shapes overlap. AC-1 (carried from v2) is unchanged: a FAIL on render that aborts scene-load with a diagnostic. Free text and free arrows can sit anywhere; **shapes** (anything with bounded x/y/w/h that the agent intends as a container) cannot collide.

Beyond those two guarantees, the agent has full latitude:
- **Free-floating text** — annotation paragraphs, captions, math equations, KEY IDEA callouts, narrative explanations between elements. Like a human writing on a whiteboard.
- **Mixed visualizations per whiteboard** — sometimes a workflow, sometimes a number line, sometimes math + a sketch, sometimes just text + arrows. Agent picks what serves the explanation.
- **Variable hierarchy** — important things bigger, less-important things smaller. By judgement, not template.
- **Variable layout** — sometimes vertically narrative-stacked, sometimes horizontally pipelined, sometimes radially clustered. Whatever fits the concept.

**The 6 minimal expressive primitives** (full schemas in §17.2):

1. `create_labeled_shape` — primary primitive for text-in-a-container. Type: rectangle / ellipse / diamond. Excalidraw's native `label` field guarantees text fit. (Replaces v2's `create_node_with_fitted_text`.)
2. `create_text` — free-floating text. NO container. For annotations, captions, equations, narrative paragraphs, anything that isn't text-in-a-shape.
3. `create_callout_box` — convenience: tinted background rectangle behind multi-line text (the yellow math callout box, the green KEY IDEA callout). Internally a rectangle + an overlapping text element; the wrapper handles co-positioning.
4. `create_background_zone` — opacity-30 grouping rectangle, optionally with a label at top (INPUTS / EMBED-PROJECT zones in the example).
5. `connect` — edge between any two elements (boxes, text, anything with bounds). Renderer routes orthogonally and avoids crossings.
6. `set_camera` — viewport hint per v2 §11.

Plus one auxiliary I'm proposing as a v3.1 addition (push-back to team-lead's brief; see §17.5 for justification):

7. `create_image` — embed a figure from `<sidecar>/figures/page-N-fig-K.png`. Without this, the agent can't ground in the paper's actual figures (which are the user's anchor); composing everything from primitives loses that handle.

**That's the entire authoring surface.** Everything else is composition. A number line = `create_text` for axis labels + a styled `connect` for the velocity arrow + `create_labeled_shape` ellipses with hatched fill at the endpoints. A time chain = N `create_labeled_shape` ellipses + N-1 styled `connect` arrows. A math callout = `create_callout_box` with multi-line equation text. The agent gets the LEGO bricks; it composes the explanation.

**The one navigational structure: narrative sections** (§16). The canvas is a top-to-bottom vertical stack of N sections. Each section has a title + optional subtitle + content (which the agent fills however it wants). Sections give us:
- A **vertical-flow contract** so the canvas reads top-to-bottom in narrative order, not as a pile of stuff at random coords.
- **Camera-tour anchors** so the existing v2 §11 camera orchestration has natural "step here, then here" units.
- **Eviction units** so old content can collapse when the stack grows past N=8 (per v2 §10.5, generalised in §16.5).
- **Provenance labels** (paper / drill / chat) carried as `customData.provenance` — drives subtle background tint and the section header glyph.

**Drilling appends a new section** to the bottom of the stack with a cross-section edge (purple dashed orthogonal — v2's universal cross-zone idiom) back to the parent node. Unifies drill-as-action with chat-as-action: every action that elaborates content (paper-spawn, drill, chat) appends a new section. Recursion grammar (CLAUDE.md §2.1) preserved because every drill at every depth uses the same gesture, same persistence, same outermost layout primitive.

**Chat is also a section type**, not a dedicated band. Each user question appends a chat section to the bottom of the stack. Chat sections look like any other section; provenance is carried by the section header glyph (`Q`) + a faint peach background tint.

**The agent's quality bar comes from the visual self-loop**, not from prescriptive primitives. With the 7-modality scaffolding from v3-draft-1 dropped, `look_at_scene` (VLOOP-1, task #59) becomes the *primary* quality safeguard. The flow:
1. Agent restores latest checkpoint (v2 §12).
2. Agent composes a section using the 6 primitives.
3. Agent calls `look_at_scene` to see the rendered output.
4. Agent self-critiques: is the layout cluttered? Is text on top of a node? Are the arrows messy? Does the hierarchy feel right?
5. Agent iterates. The two programmatic guarantees prevent the *worst* failures (overlap, overflow); the visual loop catches everything else (compositional clutter, ugly free-text placement, illegible cluttering).

**The v2 dependencies survive verbatim** and are still load-bearing inside this new outer structure:

| v2 dependency | v3.1 status |
|---|---|
| Lane-based placement (v2 §2.1) | Still applies *as a soft authoring guideline* (§17.6) when the agent chooses to lay out a workflow. Not enforced at the renderer level — agents that compose differently aren't blocked. |
| Concrete palette (v2 §3) | Unchanged. v3.1 extends with the per-element semantic-role palette (§18 — preserved from v3-draft-1) layered on top of v2's kind-based palette. |
| Edge routing (v2 §2.4) | Unchanged. `connect` invokes orthogonal-step routing under the hood. |
| Camera orchestration (v2 §11) | Unchanged. Each section gets a focus camera; the overview spans the first 3 sections; agent emits `set_camera` per-region as needed. |
| Checkpoint/restore (v2 §12) | Unchanged. Each new section appended to the stack is a checkpoint extension. |
| Labeled-shape-first (v2 §13) | Unchanged. `create_labeled_shape` is the primary primitive. |
| Progressive emission (v2 §14) | Unchanged. Element order in the array IS draw order. |

**Why v3.1 over v3-draft-1**. The v3-draft-1 spec baked seven specialised MCP tool primitives (one per modality). The team-lead's softening brief retracts that as over-engineering — the agent doesn't need a `create_number_line` tool because it can compose a number line from `create_text` + `connect` + `create_labeled_shape`. Building seven tools costs ~600 LoC for renderers + per-tool prompt instruction + worked-example coverage; it constrains the agent to the seven shapes we predicted; it makes adding an eighth shape (Sankey diagram? Bar chart? Tree?) require a new MCP tool. The minimal-primitives approach is **expressively complete** (the agent can compose any 2D visual the user might want) and **dramatically cheaper to ship** (~200 LoC of new MCP wrapper vs ~600+ LoC of per-modality renderers).

**The trade-off**: v3-draft-1 was easier for the agent (specialised tools = pre-built composition primitives) but harder to extend. v3.1 is harder for the agent (must compose from scratch) but expressively complete and cheaper to ship. The visual self-loop closes the agent-side complexity gap: the agent can *try* a composition, *see* it, and *iterate* — same loop a human would use to draft on a whiteboard. **Cog-reviewer-2 ask in §19**: is this trade defensible, or does the agent-side composition complexity blow past what `look_at_scene` can correct in 1-2 iterations?

# 2. Layout decisions

## 2.1 L2 placement — **Lane below parent (Option b, refined)**

**Decision.** Each drillable L1 node owns a vertical *lane* in the canvas. Its L2 expansion lives entirely inside that lane. Lanes are computed up-front from the L1 row layout, before any L2 frame is authored.

**Why this option, not the others (CLAUDE.md §1 reduce cognitive fatigue + §2.2 Apple-level smoothness):**

- **Inline expansion (option a)** would re-flow the L1 row when any L2 mounts. Cog cost: the user's spatial map of L1 is destroyed every time they drill. Violates "structural reading" (§1) — they can no longer oscillate between resolutions because the resolutions don't share a stable layout.
- **Frame-stacked below (option c, current)** loses spatial connection to parent the moment two siblings collide. The screenshot is option c.
- **Side panel (option d)** loses the "same canvas, animated zoom" rule from `whiteboard-diagrams.md` §7, which is the recursion grammar (CLAUDE.md §2.1). Drilling into a side panel feels like context-switching, not like zooming-in.
- **Full-canvas swap (option e)** loses the user's place. They no longer see the L1 they came from. Violates expert oscillation behaviour (Gegenfurtner et al. 2011 — experts oscillate between resolutions; a full swap disables oscillation). Also breaks "Apple-level continuous feel" (§2.2).

**Lane mechanics (the layout pass — runs in the renderer, not the agent):**

1. After L1 mounts, compute each L1 node's *desired* lane width:
   - **Drillable L1 node**: the L2 scene this lane will hold has at most 5 nodes (Cowan ceiling), each ≤ 320 px wide (existing `NODE_MAX_WIDTH`), with ~60 px inter-node gaps. Worst case: 5 × 320 + 4 × 60 = 1840 px. We don't allocate worst case; we allocate on demand once the first L2 lands. Initial reservation: 720 px (3 × 200 + 2 × 60 — accommodates a 3-node L2 comfortably; widens later if the L2 actually needs more).
   - **Leaf L1 node**: lane width = `node.width + 60 px` (just enough margin).
2. **Re-pack L1 horizontally** so each L1 node's center sits at the center of its lane. This is a one-time animated transition from the current "agent-authored x" positions to the "lane-center x" positions. Duration **400 ms** `cubic-bezier(0.4, 0, 0.2, 1)` (pass-2 audit ⚠1 superseded the pass-1 240 ms decision: pass-2's smooth-pursuit math — Lisberger 2010 — shows 300 px shifts in 240 ms exceed the eye's smooth-pursuit ceiling at ~30°/s for 50 cm reading distance, so the eye attempts to fixate-jump rather than track. 400 ms gives 750 px/s ≈ 22°/s, comfortably within smooth-pursuit; lay-out-comprehension transitions have their own ergonomic budget separate from Doherty's 400 ms UI-ack floor — at 400 ms we sit at the boundary intentionally because comprehension > snappiness for this transition). The dive transition stays at 320 ms — different cognitive operation (zoom) — so the timing asymmetry is intentional, not inconsistent.
3. **Re-route L1 edges** as the L1 nodes shift: arrows track via Excalidraw's binding system (existing `startBinding` / `endBinding` already do this).
4. When a Pass 2 L2 stream lands for parent `P`, place the L2 scene at `(lane_center_x(P) - L2_width / 2, parent.y + parent.height + 240)`. Because lanes don't overlap by construction, L2 scenes can never overlap.
5. **Lane widening is deferred until the user drills into the affected lane** (cog-reviewer-2 audit, Q2). When a pre-warmed L2 stream lands and its authored width exceeds its lane's current allocation, the L2 renders at the lane's current width with text wrapping — *no animated widening fires during pre-warm*. The widening only runs when the user clicks the parent L1 node to drill in; at that moment, the lane widens (animated 240 ms) and downstream lanes shift right. **Why deferred**: pre-warming all L2s in parallel could fire 4 simultaneous widenings across the canvas — that's 4 unsolicited motion events in the user's parafovea (Yantis & Jonides 1984: abrupt motion captures attention pre-attentively, the user can't NOT look) plus interruption residue (Mark/Gudith/Klocke 2008). Pre-allocating worst-case 1840 px per lane is also rejected — sprawls L1 to 10000 px, exceeds AC-10, kills the see-the-whole-paper goal. Codified in new AC-26 (no animated widening during pre-warm).

**Vertical gap of 240 px** (was 200): increased to leave headroom for the L2 frame's title and the L1→L2 connector line (see §2.6 below). 240 ≈ 1 line of L1 summary + the connector + 1 line of L2 title = a single vertical "breath" between rows. (Bartlett 1932 / Sweller 1988 — a perceptible whitespace gap reduces inter-row binding error.)

**Cited principle.** Sweller, Chen & Kalyuga 2010 (element interactivity) — the cognitive cost of the L2 row is proportional to the number of L1↔L2 binding decisions the eye has to make. Lanes reduce that to one decision per parent ("which lane below?"). Without lanes, the eye has to disambiguate every overlapping L2 cluster against every neighbouring parent. That is the screenshot's failure mode.

## 2.2 Visual diversity — **Shape + weight + (existing) fill, no new colour**

**Decision.** Add **one shape distinction** and **one stroke-weight distinction** to the existing fill distinction. Reject the rest of the proposed visual encoding inventory because it crosses Sketchnote Handbook (Rohde 2013) discipline: "hierarchy via size + weight, not colour, and never more than 3 visual channels at once."

The full vocabulary is in §3. Headline:

| Channel | Already used | Adding |
|---|---|---|
| Fill colour | `kind: model` → warm beige `#fef4d8`; everything else white | (no change) |
| Stroke weight | All nodes 1 px | **Novel-contribution node** (`kind: model`) → 2 px (already partially in code) |
| Stroke style | Drillable → dashed; leaf → solid | (no change) |
| **Shape** | All rectangles | **Endpoint nodes** (`kind: input`, `kind: output`) → **ellipse** (per cog-reviewer-2 audit pass-2 ✗3 — swapped from parallelogram on stronger reasoning; see "Why ellipses, not parallelograms" below) |

**Why nothing else:**

- **Hexagon for novel contribution** — rejected. The warm-beige fill + heavier stroke already mark the contribution. Adding a hexagon stacks 3 cues on one node, leaving the *neighbours* visually flatter by contrast. (Tufte: the noise is the absence of contrast on neighbours, not the presence of cues on the marked node.)
- **Inline iconography (tensor cubes, flame for trainable, snowflake for frozen)** — rejected. Excalidraw doesn't render arbitrary glyphs cleanly, the icons would either ship as PNGs (visual jarring against hand-drawn aesthetic) or as Excalidraw primitives (additional complexity). Most importantly: this would force the Pass 1 model to classify every node into a tensor/op/parameter taxonomy. That's exactly the "rigorous structure" the user told us to avoid (`whiteboard-diagrams.md` Pass 1 prompt rationale).
- **Border treatments beyond solid/dashed (dotted, double)** — rejected. The dashed border already carries "drillable"; adding more border styles dilutes the signal. Cog-reviewer §6 rule: each visual channel does *one* job.
- **Typography variation in nodes (bold title + italic citations)** — rejected. Excalidraw font support is limited; Excalifont isn't a font family with weights, and mixing fonts inside a node breaks the "casual hand-drawn" aesthetic that is the product's voice (CLAUDE.md §2.4).

**Why body-length variation isn't a fourth channel** (cog-reviewer-2 audit, body-length pressure-test). §2.5 gives the model node a richer body (25 words) than process nodes (12–15 words after the Q5 revision below). Body length is, in isolation, a magnitude visual variable (Bertin 1967, Munzner 2014, Healey & Enns 2012) — and so a naïve read of §2.2's "≤ 3 channels" ceiling would say body length pushes us to 4 channels on the model node. **The resolution is that body length here is a redundant encoder of the same variable** (`kind: model` importance) that fill + stroke weight already encode. Mayer's Multimedia Principle: redundant encoding *reduces* extraneous load (the eye gets the same answer from any of the channels) — it does not add a new perceptual dimension. The 3-channel ceiling is about *independent* dimensions, not total visible properties. AC-12 below makes this explicit: it counts only INDEPENDENT channels, and fill + stroke + body length all encoding "this is the model node" count as ONE channel for that assertion. Without this clarification AC-12 would fire on every model node — that would be the wrong test, not a real violation.

**Why ellipses, not parallelograms** (cog-reviewer-2 audit pass-2 ✗3 superseded the prior pass-1 parallelogram-with-fallback decision):

- **Stronger categorical jump from rounded-rect.** Treisman pop-out works when shapes are *categorically distinct*. Ellipse vs rounded-rect = "smooth-curve closed shape vs four-corner closed shape" — strong jump. Parallelogram vs rounded-rect = "four-corner shape with parallel slants vs four-corner shape with right angles" — much weaker, especially at the rendered scale where the slant angle (~15°) is barely perceptible without fixation.
- **Convention agnosticism.** ANSI X3.5 has parallelogram = I/O AND ellipse = "terminator" (start/end) — both are flowchart-canonical for endpoint-ish roles. Goldstine & von Neumann 1947 is the historical origin of the parallelogram convention; UML use-case + ER-diagram entity gave us the ellipse convention. The user's reading population (researchers reading ML/systems papers) decodes both roughly equally.
- **Excalidraw native primitive.** Ellipse renders via `shape: ellipse` directly. Parallelogram is a hack via `diamond` with custom points — more likely to break under user editing (drag a corner, parallelogram becomes a quadrilateral), violating the "user can edit the canvas freely" principle from CLAUDE.md §2.2.
- **Aesthetic match.** Excalidraw's hand-drawn ellipse looks like a rough oval, which fits the "casual sketchy notebook" voice better than a sheared diamond which reads as "engineering blueprint."
- **The pass-1 peripheral-vision argument was overweighted.** Pass-1 leaned on Treisman 1988 axis-asymmetry; pass-2's response: at the rendered ~15° slant, ellipse-vs-rounded-rect's curve-vs-corner contrast pops harder than parallelogram-vs-rounded-rect's slant-asymmetry. Anderson & Lebiere 1998 supports foveal equivalence; the parafoveal difference favours ellipse, not parallelogram, at our render scale.
- **Implementation**: `create_labeled_shape({shape: 'ellipse', kind: 'input' | 'output', label, ...})`. No hack, no escape valve needed — ellipse just works.

**Cited principle.** Mayer's Multimedia Principle (2009): redundant visual encoding (shape + position + label) reduces extraneous cognitive load — the eye gets the role from the silhouette in one fixation, then reads the label to confirm. Without the shape distinction, the label *is* the only encoding and every endpoint costs a full read.

## 2.3 Layout algorithm — **Hybrid (option c)**

**Decision.** The agent emits semantic intent (nodes + edges + kinds + drillable flags). A deterministic post-process layout pass in the renderer computes coordinates. The agent does not pick numbers.

**Why hybrid, not pure post-process:**

- The agent already authors `connect_nodes` declaratively (no points), and `create_node_with_fitted_text` already sizes nodes via `fitNodeSize`. We're 80% there. The missing piece is *position*: the agent currently picks `x` and `y` based on a "180px increments" mental model in the prompt, which works for L1 but produces the L2 collision problem.
- A pure post-process layout pass (ELK or dagre) would override the agent's layout intent entirely. We tried this earlier (per `docs/methodology/whiteboard.md` post-2026-04-26 architecture note: "no ELK layout pass") and the user rejected it because the agent's semantic placement (e.g. "Q, K, V should be adjacent inputs to MHA") gets lost.
- The hybrid: the agent picks **order** (which node comes after which), the renderer picks **coordinates** (lane center for L1, lane interior for L2). Order is semantic; coordinates are mechanical.

**Mechanics:**

1. **L1 layout pass.** After the agent finishes Pass 2 L1, the renderer:
   - Reads node order from the authored x-positions (sorts ascending).
   - Counts drillable nodes → reserves a lane per drillable node (initial 720 px); leaf nodes get tight lanes (`node.width + 60 px`).
   - Re-positions each L1 node at its lane's horizontal center, vertical row 0.
   - Re-binds arrows (Excalidraw's binding system handles this automatically).
2. **L2 layout pass.** When each L2 stream lands:
   - Reads node order from the authored x-positions inside the L2 scene.
   - Computes the L2 row's required width (sum of node widths + gaps).
   - If wider than the parent's lane: widen the lane (animated), shift downstream lanes right.
   - Places L2 nodes at `lane_left + (lane_width - L2_width) / 2 + cumulative_offset`, vertical row `parent.y + parent.height + 240`.
3. **Edge routing pass.** After all layout: for any edge whose straight-line path crosses another node's bbox, replace its `points` with an orthogonal elbow (right + down + right, or down + right + down). See §2.4.

**Cited principle.** Wertheimer / Gestalt (1923) "good continuation" — the eye groups nodes by their layout regularity. Lane-based layout makes the L1 row read as one Gestalt; the L2 scenes read as N independent Gestalts (one per lane). The current "everyone drops below their parent and overlaps" produces a single confused Gestalt.

## 2.4 Edge routing — **Orthogonal-step with collision avoidance**

**Decision.** L1↔L1 arrows and L2↔L2 arrows stay straight (the lane discipline guarantees they don't cross other nodes). The L1→L2 *connector* line (see §2.6) and any L2 arrow that crosses a sibling node use orthogonal-step routing (right-angle elbows, not curves).

**Why orthogonal, not curves:**

- Curves are visually noisier than orthogonal lines for technical diagrams (Tversky 2011, *Visualizing Thought*). Curves carry semantic weight ("this is a smooth transition") that we don't want — paper architectures are discrete, not continuous.
- Orthogonal arrows match the hand-drawn Excalidraw aesthetic — they read as "drawn with a ruler" rather than "drawn freehand," which is appropriate for the structural-architecture role.
- Excalidraw arrows take a `points` array. An orthogonal elbow is a 3-point path: `[start, midpoint, end]` where midpoint shares one axis with start. Trivial to author.

**Routing algorithm (renderer-side, not agent-side):**

For each arrow, compute the straight-line path. Test against every other rectangle's bbox (excluding the arrow's own start/end nodes). If no crossing → keep straight. If crossing → replace with a 3-point elbow:
- Horizontal-first: `[(start.x, start.y), (end.x, start.y), (end.x, end.y)]`
- If the horizontal-first elbow also crosses a node, try vertical-first.
- If both elbows cross nodes, log a warning and keep straight (we'll widen the relevant lane on next layout pass).

**Excalidraw note.** Excalidraw 0.18 supports `elbowed` arrow type (released ~2024). If the bundled version supports it, prefer the native elbow over manual 3-point construction — it round-trips through user edits cleanly.

**Cited principle.** Holsanova et al. 2008, eye-tracking on technical diagrams: orthogonal arrows produce shorter saccades along the arrow path (the eye jumps to the corner, then to the endpoint, in 2 saccades). Curves and diagonals require continuous tracking, which is slower and more fatiguing.

## 2.5 Information hierarchy in node bodies — **Tiered density**

**Decision.** Three node body densities, mapped to `kind`:

| Node role | Body content | Rationale |
|---|---|---|
| `kind: model` (the novel contribution) | Label (1–3 words) + summary (≤ 25 words, full) + optional inline figure ref + optional citation | This is what the user came to understand. Spend the visual budget here. AC-24 caps the body at 35 words — past that the asymmetry stops reading as "highlighted" and reads as "the only one." |
| `kind: process` (intermediate stages) | Label (1–3 words) + summary (**≤ 18 words**, terse-but-substantive — two short sentences fit) | Pass-2 audit ✗4 superseded the pass-1 12–15 cap: pass-2's argument is that the asymmetry between model (25 w) and process should NOT do the pre-attentive hierarchy work — that's already carried by fill+stroke (fast). Body length should *inform* the eye that's actively building the structural skeleton, not *signal hierarchy* by absence. Sweller et al. 2010 element interactivity: process nodes carry the structural skeleton; eye-tracking on info-graphics shows readers fixate skeleton nodes ~70% as long as the focal node, so they need ~70% of the body real estate, not 30%. 18 words ≈ 72% of model's 25 words — matches the empirical fixation ratio. Drops the model:process word ratio to ~1.4×, below Cleveland & McGill 1984's relative-magnitude threshold but well above noticeable. |
| `kind: input` / `kind: output` (endpoints) | Label only (≤ 4 words). No summary. | Endpoints don't need elaboration; their role is structural ("here's where data enters/leaves"). |
| `kind: data` (intermediate stored artifacts, e.g. "feature map", "token embeddings") | Label + (≤ 8 words) terse summary | Slightly richer than endpoints because the artifact's name often needs a one-line "what's stored." |

This tiering does NOT require shape variation beyond §2.2 — the ellipse shape on endpoints already signals "no body needed." For `model` vs `process`, the warm-yellow fill + heavier amber stroke on the model node already signal "this is the bigger node — read its full body."

**Implementation surface.** The Pass 2 prompt currently doesn't differentiate body density by kind — every node gets a 25-word summary. We add a one-paragraph rule to the prompt:

> *"Reserve full ≤ 25-word summaries for the `model` node (the novel contribution). For `process` nodes, write ≤ 18-word summaries (two short sentences — describe the structural step substantively). For `input` and `output` endpoints, write the label only — no summary. The pre-attentive hierarchy lives in fill + stroke weight (fast); body density only needs to be informative enough to ground the structural skeleton (per Sweller's element-interactivity principle, structural-skeleton nodes get ~70% the foveal-fixation budget of the focal node — match that with body real estate, not minimise it)."*

The MCP `create_node_with_fitted_text` tool already accepts `summary` as optional, so no API change needed.

**Cited principle.** Sweller et al. 2010 (element interactivity): a uniform density forces the eye to read every node's body to decide which is important. Tiered density lets the silhouette (heavy + filled + bigger body) carry the importance signal, freeing the eye to skim non-model nodes. Cleveland & McGill 1984 (graphical perception): magnitude asymmetry has noticeable threshold ~25%, judgement-of-relative-magnitude threshold ~50% — we tune the ratio to sit between the two so the model node reads as "the most important one" without making the others read as "much less important."

## 2.6 Connecting L1 to L2 — **Lane outline + breadcrumb (no connector line)**

**Decision** (revised per cog-reviewer-2 audit, Q4). When a Level 2 frame mounts in its lane, draw a **soft outline around the L2 frame ONLY** — NOT around the L1 parent. The outline's top edge sits at `parent.y + parent.height + 80` (a clear gap between the L1 row and the L2 outline). A small text label at the top-left of the outline restates the parent's name (e.g. *"inside Encoder ×6"*). Do NOT draw a literal arrow from L1 down to L2.

**Why outline only the L2, not the parent + L2 together** (cog-reviewer-2 audit pushback on the original encompassing draft):

- The original draft cited Palmer 1992 (Common Region) to justify enclosing parent + L2 in a single outline. Audit corrected: Palmer 1992 distinguishes *common region* from *connected region*; encompassing parent + child is the connected-region case, and Palmer & Beck 2007 (the same author's follow-up) showed connected region **collapses hierarchical contrast** — the opposite of what we want. The L1 parent IS the abstraction layer; the L2 IS the elaboration; they're related but at different ranks. We want the eye to read them as ranked, not equivalent.
- Tufte's small-multiples convention agrees: label each child region; do not enclose the parent.
- The 80 px gap between the L1 row and the L2 outline gives the eye a clear "this stops, that begins" signal — the rank differential is implicit in the gap.

**Why outline over connector arrow:**

- A literal connector arrow would conflict with the L1→L1 horizontal pipeline arrows visually. Three arrows leaving the same node (one rightward to next L1 sibling, one leftward from prior L1 sibling, one downward to L2) makes the L1 node a hub of arrows — that's the screenshot's *other* problem and we're trying to fix it.
- A lane outline is a *Gestalt grouping* cue (Wertheimer 1923 / Palmer 1992 *common region*, NOT connected region) — the eye reads "these L2 nodes belong together" pre-attentively, no fixation needed. An arrow requires a fixation to read.
- The outline is `roughness: 1` (matching Excalidraw's hand-drawn aesthetic), `strokeStyle: 'dashed'`, `strokeColor: #d4cfc6` (faint gray, ~30% contrast), `strokeWidth: 1 px` (capped at 1.5 px per AC-25 — heavier competes with node strokes inside, defeats soft Gestalt grouping), `backgroundColor: 'transparent'`, no fill. It frames the L2 group; it does not enclose the parent.

**Restated parent label** (top-left of the L2 outline, in system sans, 11 px, color `#5a4a3a`): *"inside Encoder ×6"*. This is the same breadcrumb signal the global breadcrumb shows — but anchored locally so the user doesn't have to glance up to the breadcrumb when they're focused on the L2 detail. Tufte's *small multiples* + Sketchnote Handbook (Rohde) "label every grouping" principle.

**Forward note on L3** (cog-reviewer-2 audit, Q6): if Level 3 ever ships (deferred from v1), it uses a **contained-card metaphor inside the L2 frame**, NOT a sub-lane underneath. Reasoning: Nielsen 1995 explicitly warns against fractal-recursion in hierarchical navigation (lanes-within-lanes-within-lanes is overwhelming); Lakoff & Núñez 2000's container schema says humans naturally map "deeper" to "inside-of" rather than "side-by-side." This is consistent with CLAUDE.md §2.1 because §2.1 says recursion has one *gesture* and one *persistence schema* — not one *layout primitive*. Different layouts at different ranks is fine; identical layout at every rank is the trap.

**Cited principle.** Palmer 1992, *Common Region principle of Gestalt* (NOT connected region — see audit correction above): enclosing visual elements within a shared region is a strong grouping cue, stronger than proximity or similarity. We use it to group the L2 nodes with each other; we do NOT use it to group the L2 with its L1 parent (that would be connected region, which collapses the hierarchical contrast).

# 3. Visual vocabulary — palettes + paper-kind mapping

This is the implementer's contract. Adopts the sibling Excalidraw-tool's three semantic palettes (per the team-lead's input) and maps Fathom's paper-element kinds onto them. The earlier draft used "stroke-weight + shape + fill" as three orthogonal channels; we preserve that discipline but ground the values in concrete colors instead of leaving them implicit.

## 3.1 The three palettes

**Primary palette** — saturated, used for arrow strokes, shape outlines, accent text. High contrast against pastel fills + background zones.

| Token | Hex | Used for |
|---|---|---|
| `primary.blue` | `#4a9eed` | standard component / `process` strokes; in-band edge default |
| `primary.amber` | `#f59e0b` | novel contribution / `model` strokes (the heavy amber stroke + pastel.yellow fill IS the "novel" signal — no separate ★ glyph; per ✗2) |
| `primary.green` | `#22c55e` | input / output endpoint strokes; "verified citation" tint |
| `primary.red` | `#ef4444` | error states; "unverified citation" warning glyph |
| `primary.purple` | `#8b5cf6` | drillable ⌖ glyph **on `kind: process` nodes only** (the model node's dashed border alone carries "drillable" — adding the glyph would stack a redundant channel per ✗2); L2 zone accent |
| `primary.cyan` | `#06b6d4` | data / intermediate-artifact strokes |
| `primary.orange` | `#c87a3f` (Fathom-tinted) | **RESERVED — do NOT use for chat provenance.** Per cog-reviewer-2 audit pass-2 ✗1: chat provenance is carried at the zone-tint level (Palmer common region), not at per-frame border or per-edge stroke. Orange is held for a higher-value future signal — *"this answer disagrees with / refines / contradicts the paper's claim"* — which is genuinely worth a primary color. Until that signal is designed, no live element uses this hex. |
| `primary.pink` | `#ec4899` | reserved (no current use; keep available for future affordances) |

**Pastel-fill palette** — desaturated, used for shape backgrounds. Always paired with the corresponding primary stroke for contrast.

| Token | Hex | Used for |
|---|---|---|
| `pastel.blue` | `#a5d8ff` | `process` (standard component) fill |
| `pastel.green` | `#b2f2bb` | `input`/`output` endpoint fill |
| `pastel.orange` | `#ffd8a8` | **RESERVED** — was the `kind: model` fallback fill; dropped per pass-4 ✗2(a). The fallback was wrong because it decoupled fill from kind (model could be yellow OR orange), which made fill ambiguous. Pass-4's resolution: model is *always* pastel.yellow; if a `data` neighbour collides perceptually, change the *data* node's fill to a desaturation of pastel.teal (kind-fill is non-negotiable for model; for data it's already deferable). |
| `pastel.yellow` | `#fff3bf` | **`model`** (novel contribution) fill — default; warmer + more attention-grabbing |
| `pastel.teal` | `#c3fae8` | `data` (intermediate artifact) fill |
| `pastel.purple` | `#d0bfff` | reserved for future "secondary novelty" sub-distinction |
| `pastel.red` | `#ffc9c9` | error / unverified-claim fill (rare; only on banner-flagged content) |
| `pastel.pink` | `#eebefa` | reserved |

**Background-zone palette** — `opacity: 30` rectangles laid down as the FIRST elements (before any content) to create soft-tinted regions that group related nodes by provenance. This replaces the earlier draft's per-node provenance-stroke hack.

| Token | Hex (at opacity 30) | Used for |
|---|---|---|
| `zone.blue` | `#dbe4ff` | **L1 zone** (paper top-level architecture) |
| `zone.purple` | `#e5dbff` | **L2 zone** (paper drilled-in expansions) |
| `zone.peach` | `#fde7d4` | **chat zone** (user-question-derived agent answers). Per cog-reviewer-2 audit pass-2 ✗1: warm peach selected over pale green so the chat zone reads as "different provenance" without the green-pop competition that pale-green would create against `pastel.green` endpoint fills. Risk noted (E3 in audit's PART E): peach may clash with `pastel.yellow` model fill — A/B test peach / soft slate / faint sage during implementation. |

The zones are stacked vertically: L1 zone at top, L2 zone below it, chat zone below that. Within each zone, lanes (§2.1) partition further. The zones tell the user "what kind of content lives here" pre-attentively; the lanes within each zone tell them "which parent owns this child."

## 3.2 Paper-element-kind → palette mapping

| Paper element | `kind` | Shape | Fill | Stroke | Stroke width | Label (on shape) | Body density |
|---|---|---|---|---|---|---|---|
| Raw input (*"Multi-view Images"*, *"Source tokens"*) | `input` | **Ellipse** (per ✗3 — Excalidraw `shape: ellipse`, native primitive, edits cleanly, strong categorical jump from rounded-rect) | `pastel.green` | `primary.green` | 1.5 px | label only (≤ 4 words) | none |
| Terminal output (*"3D Output"*, *"Next-token probs"*) | `output` | **Ellipse** (same as input — both endpoints share shape; position + edge-direction disambiguate which end of the pipeline) | `pastel.green` | `primary.green` | 1.5 px | label only (≤ 4 words) | none |
| Intermediate transformation (*"Token+Pos Embed"*, *"Add+Norm"*) | `process` | Rounded rectangle | `pastel.blue` | `primary.blue` | 1.5 px | label (≤ 24 chars) + **≤ 18-word summary** (per pass-2 ✗4) | tier-2 |
| Stored intermediate artifact (*"Feature map"*) | `data` | Rounded rectangle | `pastel.teal` | `primary.cyan` | 1.5 px | label + ≤ 8-word summary | tier-3 |
| **Novel contribution** (the one node) | `model` | Rounded rectangle | `pastel.yellow` (always — no fallback per pass-4 ✗2(a)) | `primary.amber` | **2.5 px** (heavy) | label + full ≤ 25-word summary + optional inline figure | tier-1 (rich) |
| **Chat-spawned answer node** (inside a chat frame) | provenance via `customData.fathomKind: 'wb-chat-frame'` on the parent frame; nodes inherit the same `kind` enum as paper content | Inherits from one of the above | Inherits | Inherits | Inherits | Same as the inherited kind | Same |

**Note on chat provenance.** It is a *customData* tag (`customData.fathomKind: 'wb-chat-frame'` on the frame element), not a separate visual kind. Per cog-reviewer-2 audit pass-2 ✗1, the visual encoding lives **entirely at the background-zone level** (peach `zone.peach #fde7d4` @ opacity 30) — the frame border, frame title, and cross-zone edge style all carry NO color-based provenance signal. Inside the chat frame, nodes use the same `kind` vocabulary as paper-derived content. The prior draft's 6-kind enumeration is collapsed to 5 visual roles + 1 customData provenance tag — cleaner mapping, fewer special cases for the Pass 2 / chat agents.

**Note on the model node — no ★ glyph, no ⌖ glyph (per cog-reviewer-2 audit pass-2 ✗2).** Earlier drafts mentioned a ★ glyph + a ⌖ glyph overlaid on the `kind: model` node. Both are dropped. The `pastel.yellow` fill + 2.5 px `primary.amber` stroke already encode "this is the novel contribution" (Treisman pop-out via co-varied fill+stroke pair); adding a ★ glyph stacks a third independent channel encoding the same thing, displacing the contrast budget that should make the *neighbouring* nodes recognisable as their own categories (Tufte data-ink ratio). The ⌖ drillable affordance is similarly redundant on the model node specifically — the `strokeStyle: dashed` already says "drillable"; a ⌖ glyph stacks another channel for the same signal. **Drop both glyphs from the `kind: model` node.** The ⌖ glyph stays on `kind: process` drillable nodes (where the dashed border alone is the only signal and the glyph reinforces it) — it's the model node specifically that violates the channel ceiling. Net: model node uses 3 channels (fill+stroke pair = 1, stroke-width = 2, stroke-style = 3 when drillable); see AC-12.

## 3.3 Edge palette

| Edge type | Stroke | Width | Style | Routing | Label font |
|---|---|---|---|---|---|
| Main pipeline (in-zone, between paper-derived nodes) | `primary.blue` (`#4a9eed`) | 1.5 px | solid | straight if no crossing, else orthogonal elbow | 11 px Helvetica, dark |
| Side branch (in-zone, secondary feedback arrow) | `primary.blue` | 1.2 px | dashed | orthogonal preferred | 11 px |
| Drill linkage (L1 ↔ L2, between zones, optional) | `primary.purple` (`#8b5cf6`) | 1.0 px | dotted | always orthogonal | n/a (no label) |
| Cross-zone, chat → paper | `primary.purple` (`#8b5cf6`) | 1.0 px | **dashed** (style channel does the cross-provenance work) | always orthogonal | n/a |

**Universal cross-zone idiom** (per cog-reviewer-2 audit pass-4 ✗1 refinement). All cross-zone edges (L1↔L2 drill linkage AND chat→paper) share the `primary.purple` color. The eye learns "purple line crossing zones = relationship between provenance domains" once and applies it everywhere. The two cross-zone cases stay distinguishable by line *style* (dotted for L1→L2 drill linkage, dashed for chat→paper) — cleaner than two separate cross-zone color languages, and a stronger compositional statement than the prior pass-2's "neutral dark" fallback.
| Citation marker → source paragraph (planned, not v1) | `primary.green` | 1.0 px | dotted | n/a (renders as faint connector inside lens) | n/a |

The drill linkage is **deliberately optional**: Common Region grouping (§2.6) does most of the work; the dotted purple line is added only when the lane outline alone leaves ambiguity (e.g. when two adjacent lanes have similarly-styled L2 frames and the eye needs an explicit pointer).

## 3.4 Constraints (what the agent MUST satisfy)

**On the L1 zone:**
- **Exactly 1** `kind: input` node (or 0 — theory papers).
- **Exactly 1** `kind: model` node (the novel contribution; fail-loud in `describe_scene` if 0 or >1).
- **Exactly 1** `kind: output` node (or 0 — theory papers).
- **0–2** `kind: data` nodes (rare at L1).
- The remainder are `kind: process`. Total ≤ 5 (Cowan).

**On L2 zone (per parent):**
- **0** `kind: input` and **0** `kind: output` nodes (parents own those roles).
- **0 or 1** `kind: model` nodes (only when parent itself contains a sub-novelty).
- The rest are `process` and `data`. Total ≤ 5.

**On chat zone (per chat frame):**
- **0 or 1** `kind: model` node (the answer's "★ key insight"). Allowed because `kind: model` is scope-local, not paper-global (§10.3).
- All other constraints inherited.

## 3.5 Sizing defaults (adopted from the sibling tool's style guide)

| Quantity | Default | Notes |
|---|---|---|
| Labeled rect minimum (W × H) | **120 × 60** | Was 180 × 80 (the wrapper's `NODE_MIN_WIDTH/HEIGHT`); shrinking improves the lane density we can fit per L1. |
| Labeled rect maximum width | 320 | Unchanged. |
| Element gap minimum | 20 px (intra-lane) / **100 px (inter-lane gutter; pass-2 audit ⚠5)** — drops to 60 px when background zones are also painted (the zone tint already does the visual separation work) | Pass-2 audit ⚠5: inter-lane gutter must be ≥1.5–2× the intra-lane gap (Palmer common-region) for the eye to read distinct regions; with intra=20 and original inter=60, the ratio was 3× nominally but visually weak because the gutter was just empty space — bumping to 100 gives unambiguous separation. With background zones painted (per §3.1), the zone boundary visually does this work for free, so the gutter can shrink back to 60. |
| Body/label font size | 16 px Excalifont (label) / 13 px Helvetica (summary) | Unchanged from current `LABEL_FONT` / `SUMMARY_FONT`. |
| Title font size | 20 px Excalifont | New: used for frame titles (L1 / L2 / chat-frame `Q:` headings) per §10.3. |
| Camera padding (per `cameraUpdate`) | content bbox × 1.5 | New: §11. Don't cramp the camera against content edges. |
| Camera aspect ratios | 4:3 — choose from {400×300, 600×450, 800×600, 1200×900, 1600×1200} | New: §11. Stays close to viewport's natural ratio. |
| Background-zone vertical padding | 60 px above + below content | Zones extend past content so the user sees the zone *before* their eye lands on a node. |
| Inter-zone vertical gap | 320 px (= L1.y_max → L2.y_min, etc.) | Unchanged from prior `chat_band_y` formula. |

**Citation marker** (unchanged): 10 × 10 amber square at node's top-right corner. Verified = solid `primary.green`-tinted amber; unverified = dashed outline + faint `?` glyph (existing `whiteboard-diagrams.md` §"Anti-hallucination").

## 3.6 Why the channel discipline still holds (rebuttal to the open question Q5/Q6.b implication)

The earlier draft worried that adding a 4th channel (body density) on top of fill + stroke + shape risked cog overload. The Excalidraw-tool integration sharpens this:

- **Per-node**: at most 3 channels per AC-12's explicit accounting (fill+stroke pair = 1, shape = 2, body-density = 3, drillable affordance = 3 when active, citation marker doesn't count). Within a single zone, all nodes share the zone's tinted background — the *between-node* channel competition is bounded at 3.
- **Per zone**: 1 additional channel (background tint). The zone tells the user "what provenance" pre-attentively; the per-node channels tell them "what role within this provenance."
- **Per frame** (chat only): 1 additional channel (frame border — now neutral gray dashed per pass-2 ✗1, identical to L2 lane outline; the orange that earlier drafts used has been retired). Frames are higher-scope than nodes; the border is read once per frame, not per-node.

So the rule is: **per scope, ≤ 3 perceptual channels.** Different scopes (zone, frame, node) can each carry their own ≤ 3 because the eye reads them at different fixations (Treisman 1988 feature integration — channels integrate within a fixation, not across fixations).

**Pass-3 caveat (Q7) and pass-4 tightening.** This per-scope ceiling is **enforced by camera-level zoom**, not by a global guarantee. The overview camera renders L1 nodes at body-density-illegible scale (per §3.5 the body font is 13 px Helvetica at native zoom; the overview camera shows a 2640 px-wide canvas in a ~1200 px viewport, so body text renders at ~5–6 px — well below foveal-acuity readability). At that zoom, body density drops out as a perceived channel — net per-node channels = fill+stroke (1) + shape (2) = 2, plus 1 zone channel = 3 active. ✓ within ceiling.

Per-component cameras (L2 dive, chat focus) zoom in such that body density becomes legible AND the user's fovea covers ≤ 2 nodes simultaneously (one focal node, one peripheral). At that zoom, the eye sees 2 nodes × 3 node-channels + 1 zone = 7 features in fixation, but only the focal node's channels integrate fully — the peripheral node's body density is below acuity, dropping it back to 2 channels for the peripheral. Net ≤ 5 features in foveal scope, comfortable under Cowan 4±1 chunking.

**Pass-4 acknowledged risk.** A determined user CAN free-pan to a sweet-spot zoom where body density is still readable at L1-overview scale. At that zoom, channels collide globally and pop-out collapses. This is acceptable because: (1) it requires deliberate user action, (2) the user gets what they asked for (full visibility at the cost of some pop-out), (3) the 80% common case (camera-driven) is well within budget. Free-panning to a global-collision zoom is a user-deliberate act outside our cog-budget.

**This makes camera orchestration a hard v1 requirement** (see §11.6) — without cameras enforcing scope-by-zoom, pass-2's ✗1 + ✗2 channel-discipline corrections lose their cognitive footing.

# 4. Worked example — ReconViaGen

The screenshot's paper, paraphrased from the Pass 1 understanding doc structure:

- **Multi-view Images** (input) → **Recon Conditioning** (model, drillable; contains VGGT + Condition Net) → **Coarse-to-Fine Generation** (process, drillable; contains SS Flow + SLAT Flow) → **Inference Refinement** (process, drillable; contains RVC velocity compensation) → **3D Output** (output)
- Side branches: *Pose Refinement* (data, leaf) feeding back into Recon Conditioning; *Velocity Compensation* (data, leaf) feeding back into Coarse-to-Fine Generation.

## 4.1 New L1 layout (5 nodes, lane-based, palette-applied)

The renderer first lays down the L1 background zone (`zone.blue`, opacity 30) covering the entire row. Then it emits each L1 node in pipeline order, each shape carrying its label inline (`label: {text, fontSize}`), and finally the connecting arrows. (See §13–§14 for the labeled-shape and emission-order rules.)

```
[ L1 zone — pale blue tint #dbe4ff @ opacity 30, padded 60 px above + below ]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ lane: input  │ lane: Recon Cond. │ lane: Coarse-to-Fine │ lane: Refinement │ lane: out │
│  width 240   │  width 720         │  width 720           │  width 720       │ width 240 │
│              │                    │                      │                  │           │
│ ╱──────╲     │   ┌──────────┐     │     ┌──────────┐     │   ┌──────────┐   │  ╱─────╲  │
│ │Multi-view│─►│Recon Cond.│ ──► │     │Coarse-to-│──►│   │Inference │  │  │ 3D     │  │
│ │ Images    │  │ (no glyph │      │     │Fine Gen  │    │   │Refinement│  │  │ Output │  │
│ ╲──────╱     │   │  — fill   │     │     │   ⌖      │    │   │   ⌖      │   │  ╲─────╱  │
│              │   │  + stroke │     │     │ (process │    │   │ (process │   │           │
│              │   │  is the   │     │     │ drillable│    │   │ drillable│   │           │
│              │   │  signal)  │     │     │  glyph)  │    │   │  glyph)  │   │           │
│              │   │ pastel.   │     │     │ pastel.  │    │   │ pastel.  │   │           │
│              │   │ yellow +  │     │     │ blue +   │    │   │ blue +   │   │           │
│              │   │ amber     │     │     │ blue     │    │   │ blue     │   │           │
│              │   │ stroke    │     │     │ stroke   │    │   │ stroke   │   │           │
│              │   │ 2.5 px    │     │     │ 1.5 px   │    │   │ 1.5 px   │   │           │
│              │   │ (dashed   │     │     │ (dashed  │    │   │ (dashed  │   │           │
│              │   │  border)  │     │     │  border) │    │   │  border) │   │           │
│              │   └──────────┘     │      └──────────┘    │   └──────────┘   │           │
└──────────────────────────────────────────────────────────────────────────────────────┘
   x: 0–240   x: 240–960          x: 960–1680            x: 1680–2400      x: 2400–2640

   Total canvas width: 2640 px (well within Excalidraw's pan range).
   Vertical row 0: y = 0; nodes ~140 px tall.

   Endpoints (Multi-view Images, 3D Output):
     fill: pastel.green #b2f2bb, stroke: primary.green #22c55e 1.5 px, ellipse

   Edges (in-band L1 pipeline):
     stroke: primary.blue #4a9eed 1.5 px, solid, straight (no crossings) → orthogonal if any
```

The eye finds entry + exit in one fixation (ellipses + green tint, low chroma — pre-attentive; ellipse-vs-rounded-rect is a curve-vs-corner categorical jump that pops faster than slant-asymmetry would). Then the eye lands on **Recon Cond.** because of its `pastel.yellow` fill + heavier amber stroke — a single unmistakable "★ this is the novel contribution" cue that doesn't require reading any label text. The other three transformations carry the same `pastel.blue + primary.blue` paired styling, so they read as "siblings of equal structural weight" — exactly the Mike Rohde discipline (Sketchnote Handbook): "all nodes at the same level must have visually equal weight, so the eye doesn't infer false hierarchy."

## 4.2 New L2 layout (one frame, inside Recon Cond. lane, palette-applied)

L2 of *Recon Conditioning* (3 nodes — parent has 2 components per the understanding doc, plus a "fused output" data artifact). The renderer first lays down the L2 background zone (`zone.purple` `#e5dbff` @ opacity 30) covering the entire L2 row, then emits the per-lane L2 content:

```
[ L2 zone — pale purple tint #e5dbff @ opacity 30 ]
   ┌─── inside Recon Conditioning ─────────────────────────────────────────────────┐
   │   (lane outline: faint dashed gray #d4cfc6, sits ON TOP of the purple zone)    │
   │                                                                                │
   │   ┌──────────┐         ┌──────────┐         ┌──────────┐                       │
   │   │  VGGT    │  ─────► │Condition │  ─────► │ Fused    │                       │
   │   │ multi-vw │         │ Net      │         │ Tokens   │                       │
   │   │ feat ext │         │          │         │          │                       │
   │   │ pastel.  │         │ pastel.  │         │ pastel.  │                       │
   │   │ blue     │         │ yellow   │         │ teal     │                       │
   │   │ +blue    │         │ +amber   │         │ +cyan    │                       │
   │   │ stroke   │         │ stroke   │         │ stroke   │                       │
   │   │ 1.5px    │         │ 2.5px    │         │ 1.5px    │                       │
   │   │ process  │         │ model    │         │ data     │                       │
   │   └──────────┘         └──────────┘         └──────────┘                       │
   │                                                                                │
   └────────────────────────────────────────────────────────────────────────────────┘
   y: 380 (= L1 row bottom 140 + 240 gap)
   x range: 240 to 960 (entirely within Recon Cond. lane)
```

The L2 frame sits in the L2 zone (purple tint), inside the Recon Cond. lane (x: 240–960). Two-channel grouping: the purple zone tells the user "this is L2 content"; the lane outline tells them "specifically belongs to Recon Cond." Sibling lanes' L2 expansions live in separate sub-regions of the same purple zone, so the user reads "all the L2 stuff is here" at zone scope and "this particular L2 belongs to that L1" at lane scope — two independent fixations, two independent answers.

The L2 also has its own ★ node (Condition Net): allowed because `kind: model` is scope-local (§3.4) — Recon Cond. is itself the L1 novelty, and Condition Net is the sub-novelty within it.

If the user clicks Coarse-to-Fine Gen, its L2 mounts at x: 960–1680 in the same purple zone — separated from Recon Cond.'s L2 by the lane boundary (Palmer's Common Region disambiguates).

## 4.2.b Chat frame placement (added per §10)

User asks in side chat: *"how does the velocity-compensation branch interact with SLAT Flow?"*

The chat agent authors a 3-node frame. The renderer first ensures a chat zone (`zone.peach` `#fde7d4` @ opacity 30) exists below the L2 zone (lazily created on first chat question); then the chat frame is placed in the chat zone, **stacked upward** — newest at the top of the zone, just below the L2 zone, at a stable predictable y-position. Earlier chat frames slide down to make room. (Per the §10.2 stacking-direction decision.)

```
[ chat zone — warm peach tint #fde7d4 @ opacity 30 ]
   ┌─── Q: how does velocity-compensation interact with SLAT Flow? ──────────────┐
   │   (frame border: dashed neutral gray #d4cfc6 1 px — same treatment as the    │
   │    L2 lane outline; frame title in system sans 12 px, color #5a4a3a)         │
   │                                                                              │
   │   ┌──────────┐         ┌──────────┐         ┌──────────┐                    │
   │   │ Velocity │  ─────► │ Residual │  ─────► │ SLAT Flow│ ┄┄┄(cross-zone     │
   │   │ Estimate │         │ Token    │         │ refined  │      dashed dark   │
   │   │          │         │ Patch    │         │  output  │      gray edge UP  │
   │   │ pastel.  │         │ pastel.  │         │ pastel.  │      to L2 SLAT    │
   │   │ blue     │         │ blue     │         │ yellow   │      Flow node)    │
   │   │ +blue    │         │ +blue    │         │ +amber   │                    │
   │   │ 1.5px    │         │ 1.5px    │         │ 2.5px    │                    │
   │   │ process  │         │ process  │         │ model    │                    │
   │   └──────────┘         └──────────┘         └──────────┘                    │
   │                                                                              │
   └──────────────────────────────────────────────────────────────────────────────┘
   y: chat_zone_top (predictable; never moves regardless of how many chat frames exist)
```

The dashed cross-zone edge from "SLAT Flow refined output" UP to the existing L2 *SLAT Flow* node tells the user "this answer extends THAT node, not just hand-wavily relates to it." Edge styling per §3.3 post-pass-4 ✗1 universal-cross-zone-idiom: `primary.purple #8b5cf6`, 1.0 px, **dashed** (universal cross-zone color; dash distinguishes chat→paper from the dotted L1↔L2 drill linkage).

Provenance reads cleanly with each channel doing exactly one job:
- **Zone (peach tint)**: pre-attentive "this is chat content."
- **Frame title (`Q: <excerpt>`)**: the user reads it when they want to know which question this frame answers — content, not pre-attentive grouping.
- **Cross-zone edge (dashed dark gray)**: "this connection crosses provenance into the paper content above."

The orange palette stays reserved (per §3.1) for the higher-value future signal *"this answer disagrees with the paper's claim."*

## 4.3 What changed from the screenshot

- **Overlap eliminated**: lane discipline guarantees no L2 collision regardless of how many siblings expand simultaneously.
- **Eye finds entry + exit instantly**: ellipses + position make the input/output endpoints structurally obvious.
- **Eye finds the novel contribution instantly**: `pastel.yellow` fill + heavy `primary.amber` stroke (the co-varied fill+stroke pair carries the "novel" signal pre-attentively per Treisman 1988; no ★ glyph — that would be a redundant channel per ✗2).
- **L2 connection to parent is unambiguous**: lane outline + restated parent label means the user never wonders "which L1 node does this L2 belong to?"
- **Edges no longer cross unrelated nodes**: orthogonal-step routing (where straight crossing detected) routes around bystanders.

## 4.4 v3.1 multi-section rendering (replaces §4.1–§4.3 as the canonical v3.1 layout)

The v2 single-workflow layout above (§4.1) renders ReconViaGen as one big horizontal pipeline. v3.1 instead emits ReconViaGen as **3 stacked sections** (per the team-lead's brief), each composed by the agent from the §17 primitives in whichever shape fits the concept. The L1 row + L2 frame collapse into Section 1 (workflow-style composition); the velocity-correction equation gets its own Section 2 (`create_callout_box` with monospace equation text); the denoising-time iteration gets Section 3 (composed from N `create_labeled_shape` ellipses + N-1 styled `connect`s — what reads as a "time chain"). Reads top-to-bottom like a tutorial, not horizontally like an architecture diagram. **None of these "modality" labels are enforced** — they're descriptive of what the agent composed, not template tags the renderer dispatches on.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│   ReconViaGen — Reconstruction-Conditioned Generation for 3D     [paper title bar]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ [section.background.tint  paper #fcfaf5 @ opacity 12]                                │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 1. Three stages produce a 3D scene from images                                  │  │
│ │    Workflow modality                                                            │  │
│ │                                                                                 │  │
│ │   [ INPUT zone, opacity 30 ]            [ RECON ZONE, opacity 30 ]              │  │
│ │   ╱──────────╲                          ┌──────────┐                            │  │
│ │   │ Multi-vw │  ───────────────────►   │  Recon   │  ─────►  ┌──────────┐       │  │
│ │   │ Images   │  (role: data)           │  Cond.   │          │ Coarse-to│       │  │
│ │   ╲──────────╱                         │  ★ model │          │  Fine    │       │  │
│ │   pastel.blue / blue 1.5px             │  big     │          │ Generate │       │  │
│ │   ellipse  (kind: input,               │  pastel  │          │  ⌖drill  │       │  │
│ │            role: data)                 │  purple  │          │  pastel  │       │  │
│ │                                        │  fill +  │          │  purple  │       │  │
│ │                                        │  amber   │          │  fill +  │       │  │
│ │                                        │  2.5px   │          │  blue    │       │  │
│ │                                        │  stroke  │          │  1.5px   │       │  │
│ │                                        └──────────┘          │  (role:  │       │  │
│ │                                        (kind: model,         │ compute) │       │  │
│ │                                         role: compute,       └──────────┘       │  │
│ │                                         drillable)                              │  │
│ │                                                                                 │  │
│ │                                              ┌──────────┐                       │  │
│ │                                              │Inference │  ─►  ╱──────────╲     │  │
│ │                                              │ Refine   │      │ 3D       │     │  │
│ │                                              │  ⌖drill  │      │ Scene    │     │  │
│ │                                              │ pastel.  │      ╲──────────╱     │  │
│ │                                              │ purple + │      pastel.green     │  │
│ │                                              │ blue     │      green ellipse    │  │
│ │                                              │ 1.5px    │      (kind: output,   │  │
│ │                                              │ (role:   │       role: output)   │  │
│ │                                              │ compute) │                       │  │
│ │                                              └──────────┘                       │  │
│ │                                                                                 │  │
│ │   Edge labels: "view encoding" (input → recon), "scene tokens" (recon →         │  │
│ │   gen), "coarse 3D" (gen → refine), "RVC velocity" (refine → output)            │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 2. The RVC equation that makes it work                                          │  │
│ │    Math callout modality                                                        │  │
│ │                                                                                 │  │
│ │      ┌────────────────────────────────────────────────────────────────────┐     │  │
│ │      │ pastel.yellow #fff3bf fill, primary.amber #f59e0b 1.0px stroke    │     │  │
│ │      │                                                                    │     │  │
│ │      │   Standard flow:    v_θ(x_t, t)        =  ∂x_0/∂t                  │     │  │
│ │      │   RVC correction:   Δv = -t · ∂L/∂x̂_0    (fired only when t < 0.5) │     │  │
│ │      │   Final velocity:   v_corrected = v_θ + Δv                         │     │  │
│ │      │                                                                    │     │  │
│ │      │   ← this is what "reconstruction-conditioned" means: the           │     │  │
│ │      │     denoising velocity is corrected by the gradient of the         │     │  │
│ │      │     2D-3D reconstruction loss                                      │     │  │
│ │      └────────────────────────────────────────────────────────────────────┘     │  │
│ │                                                                                 │  │
│ │      (equations in monospace 14px; comments in Excalifont 13px italic;          │  │
│ │       annotation in Excalifont 11px italic)                                     │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 3. How v gets used at inference                                                 │  │
│ │    Time chain modality                                                          │  │
│ │                                                                                 │  │
│ │   Walk a noisy point from t=0 to t=1 (clean) by N Euler steps;                  │  │
│ │   RVC engages at the t<0.5 half (sharper-features stage):                       │  │
│ │                                                                                 │  │
│ │   ●─────►●─────►●─────►●─────►●─────►●─────►●                                   │  │
│ │   t=0   t=0.15 t=0.3 t=0.45  t=0.6  t=0.8  t=1.0                                │  │
│ │   red   red    orng  yellow  ltgrn  green  green                                │  │
│ │                                                                                 │  │
│ │      ┌──── + v · dt ────┘                                                       │  │
│ │      (above each arrow)                                                         │  │
│ │                                                                                 │  │
│ │   ↑─────────────────────↑                                                       │  │
│ │   RVC active here (t<0.5)   "standard flow only" beyond t=0.5                   │  │
│ │                                                                                 │  │
│ │   (annotation below the chain, Excalifont 13px italic, color #5a4a3a)           │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 4. The key idea                                                                 │  │
│ │    Key idea callout modality                                                    │  │
│ │                                                                                 │  │
│ │      ┌────────────────────────────────────────────────────────────────────┐     │  │
│ │      │ pastel.green #b2f2bb fill, primary.green #22c55e 1.5px stroke     │     │  │
│ │      │                                                                    │     │  │
│ │      │ KEY IDEA                                                           │     │  │
│ │      │                                                                    │     │  │
│ │      │ The flow-matching velocity v_θ tells the denoiser which way to    │     │  │
│ │      │ step at each timestep. ReconViaGen says: in the "sharpening"       │     │  │
│ │      │ second half (t<0.5), correct that velocity by how badly the        │     │  │
│ │      │ current latent reconstructs the input views.                       │     │  │
│ │      └────────────────────────────────────────────────────────────────────┘     │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Section count: 4 (3 from the team-lead's brief + 1 closing key idea). The user reads top-to-bottom: architecture (workflow) → equation (math) → temporal dynamics (time chain) → punchline (key idea).

**v3 vs v2 comparison for the same paper:**

| Aspect | v2 (single-workflow + L2 lanes) | v3 (4 stacked sections) |
|---|---|---|
| Outer structure | 1 horizontal pipeline + N L2 lanes below | 4 vertical sections |
| Where the equation lives | Inline as a sub-element of "Inference Refinement" L2 — easily missed | Section 2: a tinted yellow callout, unambiguous |
| Where the temporal iteration lives | Implicit in the "Inference Refinement" L2 nodes — easily missed | Section 3: an explicit time chain showing 7 steps |
| Where the key idea lives | Embedded in a node body summary — easily missed | Section 4: a bordered green callout labeled KEY IDEA |
| User cog cost | Decode 1 layout shape (workflow), then drill into L2s to find the math + iteration | Recognise 4 modalities at-a-glance, each shown at the appropriate level |
| Pop-out signal | Within the workflow only (model node = amber stroke) | Both within section (model node) AND across sections (modality categorical jump) |

**Drilling within v3 sections.** If the user clicks `Recon Cond.` in Section 1, a new section (Section 5: provenance=drill) appends below Section 4 with title *"Inside Recon Cond."* and modality=workflow, showing VGGT + Condition Net + Fused Tokens (the v2 §4.2 L2 content). A cross-section edge (purple dashed) connects Section 5's title bar UP to the `Recon Cond.` node in Section 1.

**Chat within v3 sections.** If the user asks *"how does the velocity-compensation branch interact with SLAT Flow?"*, Section 6 appends with provenance=chat, title *"Q: how does the velocity-compensation branch interact with SLAT Flow?"*, modality picked by chat agent — likely a workflow showing Velocity Estimate → Residual Token Patch → SLAT Flow refined output, with cross-section edges back to Section 3 (time chain) and Section 1 (workflow). Same author-rules from v2 §10.4 (grounding-vs-extension 60-40-60).

# 5. Worked example — Attention Is All You Need

Hierarchical-depth paper. The encoder-decoder symmetry tests whether our strategy handles two near-identical drillable nodes.

## 5.1 New L1 layout (5 nodes, palette-applied)

```
[ L1 zone — pale blue tint #dbe4ff @ opacity 30 ]
   ╱──────╲      ┌──────────┐     ┌──────────┐     ┌──────────┐      ╱──────╲
   │Source │ ──► │ Token+Pos│ ──► │Encoder ×6│ ──► │Decoder ×6│ ──►  │ Next- │
   │tokens │     │  Embed   │     │ (no glyph│     │   ⌖      │      │ token │
   ╲──────╱      │          │     │          │     │          │      │ probs │
   x: 0–240      │ pastel.  │     │ pastel.  │     │ pastel.  │      ╲──────╱
                 │ blue +   │     │ yellow + │     │ blue +   │      pastel.green
                 │ blue     │     │ amber    │     │ blue     │      + green stroke
                 │ stroke   │     │ stroke   │     │ stroke   │      1.5px
                 │ 1.5 px   │     │ 2.5 px   │     │ 1.5 px   │      ellipse
                 └──────────┘     └──────────┘     └──────────┘
                 x: 240–600       x: 600–1320      x: 1320–2080
                                  drillable        drillable
   Lanes:
     • Source tokens:  240 px (leaf endpoint, pastel.green + green stroke, ellipse)
     • Token+Pos Embed: 360 px (leaf process, pastel.blue + blue stroke 1.5px)
     • Encoder ×6:      720 px (drillable, ★ NOVEL — pastel.yellow + amber stroke 2.5px)
     • Decoder ×6:      720 px (drillable but NOT novel — pastel.blue + blue stroke 1.5px,
                                dashed border for drillable, no ★)
     • Next-token probs: 240 px (leaf endpoint, pastel.green + green stroke, ellipse)

   Decoder gets the same pastel.blue + blue 1.5px treatment as Token+Pos Embed and
   intermediate processes — visually equivalent to its sibling stages. The dashed
   border distinguishes "drillable" from "leaf" within the same kind. Two channels
   (kind = fill+stroke pair, drillable = stroke style); the eye reads them at one
   fixation each.
```

The visual hierarchy reads: pipeline of 5 boxes; the encoder is the heaviest visually (`pastel.yellow` fill + `primary.amber` 2.5px stroke); the decoder is *also* drillable but visually lighter — that asymmetry correctly tells the user "the encoder is the novelty (self-attention only, no recurrence); the decoder is structurally similar but conceptually a re-application." This is exactly the pre-attentive feature-integration result Treisman 1988 predicts: yellow + heavy stroke pop out in one fixation; the decoder reads as a sibling at the same kind level on the next fixation.

## 5.2 L2 of Encoder ×6

```
[ L2 zone — pale purple tint #e5dbff @ opacity 30 ]
   ┌─── inside Encoder ×6 ──────────────────────────────────────────────────────────┐
   │                                                                                 │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
   │  │ Multi-Hd │─►│ Add+Norm │─►│ Position-│─►│ Add+Norm │─►│ (×6 stack│          │
   │  │ Self-Attn│  │ residual │  │ wise FFN │  │ residual │  │  badge)  │          │
   │  │ (no glyph│  │          │  │          │  │          │  │          │          │
   │  │ pastel.  │  │ pastel.  │  │ pastel.  │  │ pastel.  │  │ pastel.  │          │
   │  │ yellow   │  │ blue     │  │ blue     │  │ blue     │  │ blue     │          │
   │  │ +amber   │  │ +blue    │  │ +blue    │  │ +blue    │  │ +blue    │          │
   │  │ 2.5px    │  │ 1.5px    │  │ 1.5px    │  │ 1.5px    │  │ 1.5px    │          │
   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
   │                                                                                 │
   │   Lane width: 720 px → fits 5 nodes @ 130 px each + 20 px intra-lane gaps       │
   └─────────────────────────────────────────────────────────────────────────────────┘
```

The L2 of Encoder *also* has a `kind: model` node (Multi-Head Self-Attn) — this is the L2 case where the parent is the novelty AND the parent contains a sub-novelty. The same `pastel.yellow + amber-stroke` treatment marks it; the eye lands on it within the L2 frame the same way it lands on Encoder within L1. Recursion grammar (CLAUDE.md §2.1).

## 5.3 L2 of Decoder ×6 (specialised content, never repeats Encoder L2)

```
   ┌─── inside Decoder ×6 ──────────────────────────────────────────────────────────┐
   │                                                                                 │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
   │  │ Masked   │─►│ Add+Norm │─►│Cross-Attn│─►│ Add+Norm │─►│ FFN +    │          │
   │  │ MHA      │  │          │  │ (K,V from│  │ + FFN    │  │  Add+Norm│          │
   │  │ (process,│  │          │  │  encoder)│  │          │  │  (process│          │
   │  │  not     │  │          │  │ (process,│  │          │  │  ×6 stack│          │
   │  │  novel)  │  │          │  │  novel   │  │          │  │  badge)  │          │
   │  │          │  │          │  │  here)   │  │          │  │          │          │
   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
   │                                                                                 │
   │  Cross-Attn is the structurally-distinct piece (encoder→decoder bridge);        │
   │  we mark it as the L2 model node IF the agent decides it deserves               │
   │  beige-attention. Reasonable judgement call; either is acceptable.              │
   └─────────────────────────────────────────────────────────────────────────────────┘
```

Decoder L2 ≠ Encoder L2 even though they share Add+Norm and FFN — the *Masked* MHA and the *Cross*-Attn are the distinguishing content. The "never repeat L1 sibling node names in L2" rule (already in `DIAGRAM_GUIDE`) is preserved.

## 5.3.b Chat frame placement (added per §10)

User asks: *"why does the decoder need cross-attention but the encoder doesn't?"*

A 4-node chat frame mounts at the top of the chat zone (`zone.peach #fde7d4`, upward stacking — predictable y-position regardless of conversation depth):

```
   ┌─── Q: why does the decoder need cross-attention but the encoder doesn't? ───┐
   │                                                                              │
   │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
   │   │ Encoder  │ ─► │ Self-attn│ ─► │Decoder   │ ─► │ Cross-   │              │
   │   │ inputs:  │    │ over     │    │must      │    │ attn:    │              │
   │   │ source   │    │ source   │    │condition │    │ K,V from │              │
   │   │ tokens   │    │ tokens   │    │on source │    │ encoder; │              │
   │   │ (chat)   │    │ (chat)   │    │ (chat)   │    │ Q from   │              │
   │   │          │    │          │    │          │    │ decoder  │              │
   │   │          │    │          │    │          │    │ (chat,   │              │
   │   │          │    │          │    │          │    │ heavy)   │              │
   │   └────┬─────┘    └──────────┘    └──────────┘    └──────────┘              │
   │        ┊                                               ┊                    │
   │        ┊ (cross-band dashed edge up to L2 Encoder      ┊                    │
   │        ┊  Self-Attn node — confirms answer grounds     ┊                    │
   │        ┊  in the existing rendered structure)          ┊                    │
   └──────────────────────────────────────────────────────────────────────────────┘
```

The chat frame is allowed to use `kind: model` (★ heavy stroke) on its own answer-key node (here: Cross-Attn), because chat answers can have their own narrative emphasis. It does NOT introduce a *second* model node at the paper level — the L1 model node (Encoder) and the chat model node (Cross-Attn) are in different frames, each with their own ★ in their own scope. (See §10's "scope of `kind: model`" rule.)

## 5.4 Encoder + Decoder lanes side by side

The two drillable lanes sit adjacent:

```
[lane: Encoder ×6, width 720]  [lane: Decoder ×6, width 720]
[Encoder L1 node, lane center]  [Decoder L1 node, lane center]
[Encoder L2 frame, fully       [Decoder L2 frame, fully
 inside its lane]               inside its lane]
```

Total canvas width grows but Excalidraw pans freely. The user sees "encoder-decoder symmetry" at the L1 level; if they expand both L2 frames, they see the *asymmetry* of the internals (Masked MHA, Cross-Attn) — which IS the conceptual lesson of the paper. The layout earns its keep here: side-by-side lanes make the symmetry/asymmetry comparison cheap.

## 5.5 v3.1 multi-section rendering (replaces §5.1–§5.4 as the canonical v3.1 layout)

The Transformer paper renders as **3 sections** composed by the agent from §17 primitives (per the team-lead's brief):

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│   Attention Is All You Need (Vaswani et al. 2017)             [paper title bar]     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 1. The encoder-decoder transformer at a glance                                  │  │
│ │    Workflow modality                                                            │  │
│ │                                                                                 │  │
│ │   ╱──────╲    ┌─────────┐    ┌─────────┐  ────►  ┌─────────┐    ╱──────╲       │  │
│ │   │Source│ ─► │ Token + │ ─► │ Encoder │         │ Decoder │ ─► │ Next-│       │  │
│ │   │tokens│    │ Pos     │    │ ×6      │  ────►  │ ×6      │    │ token│       │  │
│ │   ╲──────╱    │ Embed   │    │ ⌖ drill │         │ ⌖ drill │    │ probs│       │  │
│ │   pastel.    │ pastel  │    │ ★ NOVEL │  K,V    │ pastel  │    ╲──────╱       │  │
│ │   blue       │ purple  │    │ pastel  │         │ purple  │    pastel.green   │  │
│ │   ellipse    │ +blue   │    │ purple  │         │ +blue   │    + green        │  │
│ │   (kind:     │ 1.5px   │    │ +amber  │         │ 1.5px   │    ellipse        │  │
│ │   input,     │ (kind:  │    │ 2.5px   │         │ (kind:  │    (kind: output, │  │
│ │   role:      │ process │    │ (kind:  │         │ process,│    role: output)  │  │
│ │   data)      │ role:   │    │ model,  │         │ role:   │                   │  │
│ │              │ compute)│    │ role:   │         │ compute)│                   │  │
│ │              └─────────┘    │ compute)│         └─────────┘                   │  │
│ │                             └─────────┘                                        │  │
│ │                                                                                 │  │
│ │   Edge label: "K,V from encoder" on the encoder→decoder cross-attention link    │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 2. Scaled dot-product attention (the equation that does the work)               │  │
│ │    Math callout modality                                                        │  │
│ │                                                                                 │  │
│ │      ┌────────────────────────────────────────────────────────────────────┐     │  │
│ │      │ pastel.yellow #fff3bf fill, primary.amber #f59e0b 1.0px stroke    │     │  │
│ │      │                                                                    │     │  │
│ │      │   Attention(Q, K, V)  =  softmax(  Q · K^T / √d_k  ) · V          │     │  │
│ │      │                                                                    │     │  │
│ │      │   Q ∈ R^{n×d_k}     queries  (decoder side)                       │     │  │
│ │      │   K ∈ R^{m×d_k}     keys     (encoder side)                       │     │  │
│ │      │   V ∈ R^{m×d_v}     values   (encoder side)                       │     │  │
│ │      │                                                                    │     │  │
│ │      │   ← scaling by √d_k prevents the softmax from saturating           │     │  │
│ │      │     when d_k is large; without it the gradients collapse           │     │  │
│ │      └────────────────────────────────────────────────────────────────────┘     │  │
│ │                                                                                 │  │
│ │      Construction: a query attends over all key-value pairs;                    │  │
│ │      output is a weighted sum of values, weight = scaled-dot-product            │  │
│ │      similarity between Q and K.                                                │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│ │ 3. The encoder is 6 identical blocks stacked                                    │  │
│ │    Time chain modality (treating depth-axis as the "iteration axis")            │  │
│ │                                                                                 │  │
│ │   ●─────►●─────►●─────►●─────►●─────►●                                          │  │
│ │   block  block  block  block  block  block                                      │  │
│ │   1      2      3      4      5      6                                          │  │
│ │   (each block: pastel.purple fill, primary.blue stroke 1.5px,                   │  │
│ │    label "Self-Attn → FFN → AddNorm")                                           │  │
│ │                                                                                 │  │
│ │   Edge label: "→ same operation, residual + layernorm between"                  │  │
│ │                                                                                 │  │
│ │   Annotation below the chain:                                                   │  │
│ │   "Each block applies the SAME structure: multi-head self-attention            │  │
│ │    over the sequence, then a position-wise FFN, with residual + LayerNorm       │  │
│ │    around each. The decoder is the same shape with one extra block (cross-      │  │
│ │    attention in the middle) — see paper §3 for the full diagram."               │  │
│ │                                                                                 │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Section 3 is the most interesting compositional choice. Treating "the encoder is 6 identical blocks" as a **time-chain-style composition** (N circles + sequential `connect`s) rather than a workflow (6 sequential boxes) exposes the meaningful structure (it's the same block applied repeatedly, like Euler integration on the model depth) better than nesting 6 identical lanes. The cog payoff: the user reads "oh, 6 iterations of the same thing" at-a-glance, instead of reading 6 nearly-identical workflow sub-zones. This is exactly the kind of agent-judgement call v3.1 enables: no fixed template for "encoder ×N stacks," the agent picks what serves the explanation.

**Drilling within v3 sections.** Clicking `Encoder ×6` in Section 1 spawns Section 4 (provenance=drill, modality=workflow) with the v2 §5.2 contents (Multi-Hd Self-Attn → Add+Norm → FFN → Add+Norm → ×6 stack badge). Cross-section edge connects Section 4's title back to the Encoder ×6 node in Section 1. Decoder drill spawns Section 5 with the v2 §5.3 contents.

**Encoder-decoder symmetry comparison.** The v2 §5.4 "side-by-side lanes" advantage is preserved: with both encoder and decoder drills opened (Sections 4 and 5), the user can scroll between them and see the symmetric structure. The cog cost is one extra scroll vs. v2's side-by-side, but in exchange every section is at full reading width (no horizontal squeeze). For papers where side-by-side comparison is critical (encoder-decoder; ablation studies; model-comparison plots), v3.1 may add a "compare side-by-side" gesture that temporarily renders two sections in a 2-column layout. Out of v3.0 scope.

# 6. Anti-cases (failure modes the strategy explicitly rejects)

The strategy is wrong if any of the following slip through. These are testable predicates the implementer (and cog-reviewer) check before declaring done.

**Severity convention** (per cog-reviewer-2 audit pass-3, AC-17 pressure-test answer): each AC is either **FAIL** (no defensible counterexample → dev-build console.error + scene-load aborts) or **WARN** (legitimate edge cases exist → console.warn + diagnostic dump, scene loads regardless). The diagnostic question for assigning severity: *"is there a single counterexample case where the predicate fires but the diagram is still correct?"* If yes → WARN. If no → FAIL.

Severity-by-AC (audit-aligned; v3.1 + v3.2 revisions noted):

- **FAIL** (structural invariants — no defensible counterexample): AC-1, AC-2, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-13, AC-14, AC-18, AC-19, AC-20, AC-21, AC-25, AC-28, **AC-33 (v3.1 cross-section edge crosses titles)**, **AC-34 (v3.1 provenance integrity)**, **AC-36 (v3.2 dominant-count = 1)**, **AC-38 (v3.2 zone non-overlap)**, **AC-39 (v3.1 user-cited text-overflow)**, **AC-40 (v3.1 user-cited shape-non-overlap, generalises v2 AC-1)**. (AC-3 RETIRED in v3.2 — model-node-count enforcement paradigm-incompatible with sizeWeight; replaced by AC-36 + AC-37.)
- **WARN** (probabilistic correctness — counterexamples exist): AC-4, AC-8, AC-12, AC-16, AC-17, AC-22, AC-24, AC-27, **AC-29 (v3.1 free-text-on-shape)**, **AC-30 (v3.1 workflow-style section node count)**, **AC-35 (v3.1 chromostereopsis)**, **AC-37 (v3.2 dominant-count ≥ 1)**. (AC-23 dropped per pass-4 Q9 — latest-only checkpoint, no accumulation. AC-31, AC-32 dropped in v3.1 — modality enforcement removed.)
- **POLICY** (not an assertion — implemented as a behavior, not a runtime check): AC-15 (eviction is a §10.5 mechanism, not a fail/warn check; v3.1 generalises it to all section types per §16.5), AC-26 (the deferred-widening rule is a layout-pass behavior, not a post-render assertion — though a `triggeredBy: 'user-drill'` audit log entry is the asserted artifact).

| # | Failure mode | Why it's rejected | Detection |
|---|---|---|---|
| AC-1 | **Two L2 frames overlap horizontally.** | Lane discipline is the strategy's load-bearing claim; if it can fail, the strategy doesn't work. | After L2 mount: for every pair of L2 frames, assert `L2_a.x_max + lane_gutter ≤ L2_b.x_min` where `lane_gutter = 100 px` without background zones, `60 px` with zones (per §3.5 sizing-defaults table, post pass-2 ⚠5). If false, layout pass has a bug. Add a dev-build assertion that fires console.error + dumps the lane allocation. |
| AC-2 | **An edge crosses any node that is not its endpoint.** | The screenshot's "edges crossing other nodes" defect. Orthogonal-step routing exists exactly to fix this. | After every layout pass: for every arrow, geometric test against every rectangle bbox. If a non-endpoint node intersects the arrow path, the routing pass has not run or has failed. |
| ~~AC-3~~ | **RETIRED in v3.2** — was about model-node-count enforcement, but v3.2's sizeWeight hierarchy is paradigm-incompatible. The example image has zero `kind: model` nodes; hierarchy is carried by `sizeWeight: dominant` instead. AC-3 reincarnates as **AC-36** (FAIL — exactly 1 dominant per workflow-style section) + **AC-37** (WARN — no dominant = no clear focal point). See AC-36/AC-37 rows below. | n/a | n/a |
| AC-4 | **An L2 frame contains a node whose label matches an L1 sibling node's label.** | The "Q,K,V at L1 vs Q,K,V at L2 of Encoder" duplication bug. Already covered in `DIAGRAM_GUIDE`'s anti-pattern detector but bears explicit testing. | After L2 mount: `intersect(L1_labels, L2_labels) === ∅`. If non-empty, log + warn (not auto-reject — there are legitimate cases where a label overlaps, e.g. "Output" appearing both at L1 and inside an L2 frame meaning "the parent's output". Use confidence threshold + cog-reviewer judgement.) |
| AC-5 | **A node at L1 has a label longer than 24 chars.** | Foveal-readability ceiling. Already enforced by `create_node_with_fitted_text`'s `z.string().min(1).max(24)`. | Schema validation. |
| AC-6 | **The novel contribution node is positioned at the start or end of the L1 row** (i.e. is `kind: model` AND is also the leftmost or rightmost L1 node), OR **the model node is NOT at row centre or ±1 from centre.** | Then it gets confused with `kind: input` / `kind: output` (start/end case); centre placement is itself a magnitude-channel signal of importance (Tufte 1983, Few 2009) so deviating from centre dilutes the visual hierarchy. | Lane-allocation pass: assert (a) `model_node.lane_index ∉ {0, lanes.length - 1}` AND (b) `\|model_node.lane_index - floor(lanes.length / 2)\| ≤ 1`. |
| AC-7 | **The lane outline is missing for an L2 frame** OR **the lane-restating label ("inside <parent>") is missing.** | The Gestalt-grouping cue is the only thing tying L2 to its parent visually (we deliberately rejected a connector arrow in §2.6). Without the outline, L2 floats orphaned. | Renderer asserts: every mounted L2 frame has a sibling outline element with matching `customData.parentId`. |
| AC-8 | **A node has a body summary >18 words but is `kind: process` (not `model`)** (cap raised from 12 per pass-2 ✗4). | Tier-2 information hierarchy violation. Process nodes get substantive-but-bounded summaries (~70% of model body, matching the eye-tracking fixation ratio). The model node still monopolises the *peak* body budget. | Pass 2 prompt enforcement + `describe_scene` warning if violated. |
| AC-9 | **L1 contains zero `kind: input` and zero `kind: output` nodes** (i.e. neither endpoint type is present). | Pipeline diagrams must show what flows in and out, or they're fragments. Theory papers that genuinely have no input/output (rare; e.g. pure existence proofs) get an exception via `customData.kindException: 'theory'`. | `describe_scene` warns; agent can override with the customData exception. |
| AC-10 | **Lane reservation is unbounded** (i.e. a single L2 widens its lane past, say, 1500 px and pushes downstream lanes off-screen). | Defeats the "user sees the whole pipeline in one viewport" goal. | Hard cap: lanes max out at 1200 px. If the agent's L2 needs more, it's authoring too many nodes (likely violating ≤5 ceiling) — fail-loud and flag. |
| AC-11 | **L1 row positions are still the agent's authored x-values after the L1 layout pass should have re-flowed them.** | The lane re-pack is the load-bearing transition; if skipped, lanes don't actually exist. | Layout pass logs "L1 re-pack: <N> nodes shifted from <old_xs> to <new_xs>". If the log doesn't fire on first L1 mount, the pass is dead code. |
| AC-12 | **Visual encoding stacks more than 3 perceptual channels on one node.** Per pass-4 ✗2(b) explicit accounting, channels are: (1) **fill+stroke pair** (always co-varied per kind — counted as ONE channel because they encode the same variable), (2) **shape**, (3) **body-density tier**, (4) **drillable affordance** (dashed border + ⌖ glyph counted as ONE — they're co-varied), (5) **citation marker** (counts as 0 because it's a separate-scope micro-frame at top-right, doesn't compete in node-scope pop-out). The model node should have at most 3 of {1, 2, 3, 4} active at once. Audit: `kind: model` drillable = fill+stroke (1) + body-density tier-1 (2) + drillable dashed+⌖ (3) = 3 ✓. `kind: model` non-drillable = fill+stroke + body-density = 2 ✓. `kind: process` drillable = fill+stroke + body-density + drillable = 3 ✓. Within ceiling for every legitimate combination. | Sketchnote Handbook (Rohde 2013) + Tufte data-ink ratio. More than 3 *independent* channels per node = the neighbours look unmarked by contrast, defeating the hierarchy. | Visual-encoding inventory pass: for each node, group channels by the variable they encode per the explicit list above; count distinct active channels; >3 = warn. |
| AC-13 | **A chat frame is positioned inside the L1 row's y-range or within an L2 lane's y-range.** | Chat content is provenance-distinct from paper content; mixing y-bands defeats the at-a-glance "this is grounded in the paper / this is an agent answer" distinction. | Renderer assert: every chat frame's `y_min ≥ chat_band_y` (computed as `max(L1.y_max, L2.y_max) + 320`). |
| AC-14 | **A cross-zone edge (chat → paper) is solid** OR **uses any color other than `primary.purple #8b5cf6`** (post pass-4 ✗1 — universal cross-zone idiom). | Cross-zone edges must be visually distinguishable as cross-provenance. Dashed-purple is the universal cross-zone language; deviating from either channel breaks the idiom and the user has to re-learn it per edge. | Renderer assert: every cross-zone edge (`from` element in chat zone, `to` element in L1/L2 zone) has `strokeStyle: 'dashed'` AND `strokeColor: '#8b5cf6'`. |
| AC-15 | **Chat frames stack past the canvas's pannable height** (>20 frames) without an evict / collapse mechanism. | Canvas grows unbounded, scrolling becomes the dominant interaction, the L1 row falls off the top of view. Violates "the user can see the whole pipeline in one viewport" goal. | Eviction policy in §10: most recent N=8 frames stay open; older frames auto-collapse to a single 32 px-tall title-only stub the user can re-expand. |
| AC-16 | **Two chat frames have a `kind: model` node and they share an identical label** (i.e. the chat agent is regurgitating the same "★ key insight" across multiple answers). | Suggests the agent isn't reading prior chat frames before authoring the next one; each answer should build on context, not repeat. | Per-paper assertion across all chat frames: `intersect(model_node_labels) === ∅`. Warn, don't fail-loud — there are legitimate cases (the same concept genuinely IS the answer to two different questions). |
| AC-17 | **A chat frame contains zero edges to existing paper content (no cross-band edges) AND its labels duplicate ≥2 L1 / L2 node labels.** | Suggests the chat agent re-rendered paper content as a "new" answer instead of extending it. The canvas accumulates redundant scenes the user has to mentally dedupe. | Soft warning: if chat frame has no cross-band edges and ≥2 label collisions with paper-derived nodes, suggest the agent should have used cross-band edges instead. |
| AC-18 | **Background zone elements appear at any array index other than the FIRST per-zone element.** | Excalidraw z-order = array order; a zone laid down after content covers the content. Background-first is a load-bearing ordering rule (§14). | Renderer assert: every `customData.fathomKind === 'wb-zone'` element has `index < min(index of any non-zone element in the same y-band)`. Fails dev build. |
| AC-19 | **An L2 / chat author tool call fires before `restore_checkpoint` was called.** | Without restore-first, the agent re-creates content that already exists; provenance is lost; cross-zone edges become impossible. | MCP wrapper enforces: any `create_*` call without a prior `restore_checkpoint(latest)` returns `isError: true` with message "scene state is empty; call restore_checkpoint first or call clear_scene if you really want a blank canvas." (§12.3) |
| AC-20 | **A `cameraUpdate` pseudo-element survives into the rendered scene** (i.e. the renderer's strip pass missed it; it shows as a misshapen rectangle). | Indicates the strip pass has a type filter bug; user sees a phantom rectangle that does nothing on click. | Renderer assert post-strip: `scene.elements.find(el => el.type === 'cameraUpdate') === undefined`. |
| AC-21 | **A shape uses `label: {text}` AND has a separate `text` element with `containerId` pointing back at it** (i.e. the new + old text-binding mechanisms coexist on one shape). | Bug A / B regression risk — Excalidraw might double-render or one might silently drop. | Renderer assert per shape: `(shape.label !== undefined) XOR (any text element has containerId === shape.id)`. |
| AC-22 | **`scene.elements` array is not in narrative order** (e.g. all rects clustered, then all arrows clustered — the v1 batched-by-type pattern). | Defeats Excalidraw's draw-on animation; defeats the cog-fatigue benefit of progressive narrative emission (§14). | Renderer assert during streaming: for any rect at index `i` with `kind: process` whose outgoing arrow exists, that arrow's index ∈ `[i+1, i+5]` (not 50 indices later). Soft warning if the agent batched. |
| ~~AC-23~~ | ~~**Total checkpoints exceeds 50.**~~ | **DROPPED per pass-4 audit Q9.** v1 keeps latest-only (single `whiteboard.checkpoint.json` flat file); no accumulation, no eviction needed. If the audit-trail UI lands later, this AC reactivates with the new directory schema. | n/a |
| AC-24 (cog audit) | **Model node body length exceeds 35 words.** | Cleveland & McGill 1984: beyond ~3.5× asymmetry stops being "highlighted" and becomes "the only one that has content"; the other nodes read as sketches. The 25-word default + 35-word ceiling sits below that threshold. | Pass 2 prompt enforcement + `describe_scene` warns if violated. |
| AC-25 (cog audit) | **Lane outline `strokeWidth` exceeds 1.5 px.** | Heavier outline competes with node strokes inside the L2 group, defeats the soft Gestalt grouping (the outline should *frame*, not *enclose*). | Renderer assert: `lane_outline.strokeWidth ≤ 1.5`. Hard cap. |
| AC-26 (cog audit) | **Animated lane widening fires during pre-warm** (i.e. before the user has clicked the parent L1 node). | Yantis & Jonides 1984: abrupt motion in parafovea captures attention pre-attentively — the user can't NOT look; 4 simultaneous L2 widenings = 4 unsolicited motion events. Mark/Gudith/Klocke 2008 interruption residue. Codifies the §2.1 step-5 deferred-widening rule. | Renderer assert: any lane-width change with `animate: true` MUST have a `triggeredBy: 'user-drill'` flag in its event log. Pre-warm lane-width changes use `animate: false` and re-render text-wrapped. |
| AC-27 (cog audit pass-3) | **A chat frame's mix of new-label nodes vs reused-via-cross-zone-edge references sits at 40-60%** (i.e. neither ≥60% novel nor ≥60% reused). | Per pass-3 grounding-bias rule: the chat agent must make the explicit "introduce vs reference" decision per question. A 40-60% mixed frame signals that the agent is re-rendering paper content as if it were a new answer — defeats grounding (Bartlett 1932 schema theory). | After chat-frame mount: count `(novel labels) / (novel labels + cross-zone references)`. If ratio ∈ [0.4, 0.6], log a soft warning suggesting the agent should re-think the grounding mode. Soft warning (WARN), not hard fail — there are legitimate hybrid answers. |
| AC-28 (cog audit pass-4; v3.2 exception added) | **A partial L2 frame is visible to the user during *streaming*.** v3.2 adds an exception: `streamingMode === 'instant'` (paper reopen per §17.7) is permitted to render the entire scene at once with no streaming animation; AC-28 doesn't fire in that mode (no partial-frame flash because there's no streaming gap to flash *during*). | Per pass-4 audit Q10: L2 streaming uses pre-warm-then-flash, NOT stream-as-drawn. Surfacing a partial L2 mid-paint defeats the click-responsiveness rationale and produces a flash-of-incomplete-content the user has to mentally complete. | Renderer assert: a frame's `customData.fathomKind === 'wb-l2-frame'` element is added to `api.updateScene` only when ALL its child elements (nodes + edges + labels) are also being added in the same updateScene call — **except when the call's `streamingMode === 'instant'`** (paper reopen), in which case all elements arrive in one updateScene call and the predicate trivially holds. Partial L2 mounts fire console.error in dev build (non-instant mode only). |
| AC-29 (v3.1) | **A `create_text` element overlaps the bbox of a `create_labeled_shape`** (free text sits on top of a node). | Per the user's brief: free text has latitude, but text-on-top-of-a-shape is almost always a layout mistake the agent intended to avoid. The visual self-loop should catch this; AC-29 is a soft check that surfaces it explicitly so the agent can re-look. | Renderer warn: for each `create_text` element, geometric intersection-test against every `create_labeled_shape` bbox (excluding the text element's own background-zone parent). If overlap → console.warn + diagnostic. **WARN** — the agent may legitimately want to overlay text on a shape (e.g. a label outside Excalidraw's `label` mechanism for special positioning), but the default expectation is no-overlap. |
| AC-30 (v3.1) | **A workflow-style section (composition hint = "workflow") contains more than 7 `create_labeled_shape` nodes**. | Cowan ceiling at section-scope. More than 7 nodes inside a single workflow-style section breaks at-a-glance recognition. The agent SHOULD split into two sections per §17.5 guideline. | Renderer warn per section with `compositionHint: 'workflow'`: `count(labeled_shape children) ≤ 7`. **WARN** — soft check; legitimate cases exist (8+ component pipeline that artificially splits worse than it stays). |
| AC-31 (v3.1) | **DELETED in v3.1** — was about lane-elements-in-non-workflow-modality, but v3.1 removed enforced modalities. Lanes are now a soft authoring guideline (§17.6); the agent can use `create_background_zone` in any section without violation. | n/a | n/a |
| AC-32 (v3.1) | **DELETED in v3.1** — was about adjacent-same-modality sections, but v3.1 removed enforced modalities. The visual self-loop catches "all sections look the same" cog-load problems via the agent's own iteration; no programmatic check. | n/a | n/a |
| AC-33 (v3.1) | **The cross-section edge from a drilled section to its parent crosses through any other section's title bar.** | Parent-child binding via cross-section edges (per Q-v3.1-3) is the v3.1 replacement for v2's spatial-proximity Gestalt. If the edge crosses through unrelated section titles, the user can't visually trace it without ambiguity (which earlier section was the parent?). | Renderer assert: cross-section edge path geometry must not intersect any other section's title-bar y-region. If it does, the renderer routes around (orthogonal elbow); if no clean route exists, log warn. **FAIL** — ambiguous cross-section binding is a structural defect. |
| AC-34 (v3.1) | **A section's `provenance: 'paper'` is set on a section that was authored AFTER the user's first chat or drill interaction** (i.e. the agent retroactively claims chat/drill content as paper-derived). | Provenance lying defeats the `customData.fathomKind` audit trail used for tint coloring + eviction priority + camera tour ordering. Paper sections are pinned-by-default per Q-v3.1-5; mis-tagging chat/drill as paper would pin them too. | Renderer assert per section: if `section.customData.authoredAt > whiteboard.firstInteractionAt`, then `section.customData.provenance ∈ {drill, chat}`. **FAIL** — provenance integrity. |
| AC-35 (v3.1) | **The role-fill on an element conflicts with the kind-stroke** in a chromostereopsis-prone way (e.g. role: noise red fill + kind: model amber stroke = red-on-amber, both in the warm range, vibrating). | Per Q-v3.1-4 risk: complementary or near-complementary color pairings on small UI elements at our viewing distance can cause a perceptual vibration (Allen & Rubin 1981). The element becomes uncomfortable to look at. | Renderer warn: precompute the role-stroke color combinations that fall within ΔE_2000 < 15 of each other in CIELAB space (perceptually close = vibration risk). For each rendered element, check the resolved (fill, stroke) tuple against the warn-list. **WARN** — vibration is subjective; flag for designer review. |
| AC-36 (v3.2 — replaces AC-3) | **More than 1 element with `sizeWeight: 'dominant'` per workflow-style section** OR per any section that contains ≥3 `create_labeled_shape` outputs. | Multiple dominants = no dominants, perceptually. The pre-attentive hierarchy carried by SIZE collapses when every shape claims to be the focal element. Same cog principle as v2 AC-3 (single ★) but applied to the sizeWeight axis instead of the kind axis. | Renderer assert per section with ≥3 shapes: `count(shapes where sizeWeight === 'dominant') ≤ 1`. **FAIL** — multiple dominants is a structural error; abort scene-load. |
| AC-37 (v3.2 — paired with AC-36) | **Zero elements with `sizeWeight: 'dominant'` in a workflow-style section that contains ≥3 `create_labeled_shape` outputs.** | A workflow section without a dominant signals "everything's equally important," which is almost always wrong for a research-paper architecture explanation (one component IS the novelty being explained). The agent should pick one. | Renderer warn per section with ≥3 shapes: `count(shapes where sizeWeight === 'dominant') ≥ 1`. **WARN** — there are legitimate cases (a section that's genuinely about a symmetric encoder-decoder where neither side is more important; a section that's a survey of N approaches where the comparison IS the content); soft warning lets the agent override. |
| AC-38 (v3.2) | **Two background zones overlap each other** (intra-section sub-zones overlapping; or sub-zone overlapping with section-provenance zone — different scope but same primitive). | Zone overlap defeats the Gestalt-grouping cue: the user reads "these elements are in zone A AND in zone B" as ambiguous. Zones should be either disjoint or strictly nested. | Renderer assert per pair of `wb-zone` elements: bbox-disjoint OR bbox-strictly-contained. **FAIL** — overlapping non-nested zones break grouping semantics. |
| AC-39 (v3.1 user-cited guarantee — see §17.4.1) | **Text inside a `create_labeled_shape` overflows the shape's interior bbox.** | The user explicitly cited this as a programmatic guarantee they want. Excalidraw's native `label: {text, fontSize}` field auto-fits + auto-wraps, but AC-39 verifies post-render that no shape-bound text geometry exceeds its container's interior (after 8px padding per side). | Post-render measure text bbox via canvas `measureText`; assert `text_bbox.width ≤ shape.width - 16` AND `text_bbox.height ≤ shape.height - 16`. **FAIL** — abort scene-load + dump diagnostic. |
| AC-40 (v3.1 user-cited guarantee — see §17.4.2; generalises v2 AC-1) | **Two `create_labeled_shape` outputs have overlapping bboxes** (the second user-cited guarantee). | The user said: "declared boxes don't overlap." Generalises v2 AC-1's L2-frame-specific scope to all v3.1 shapes. Free text and arrows have full latitude; shapes do not. | Renderer assert: for every pair of `create_labeled_shape` outputs, bbox-disjoint with the §3.5 lane-gutter rules absorbed (60px gap inside zones, 100px outside). **FAIL** — abort scene-load. |

# 7. Open questions for cog-reviewer

These are the spots where I'm uncertain and want a cognitive-science gut-check before implementation.

> **Status as of cog-reviewer-2 audit pass 3 (2026-04-25)**: pass-3 added scope-local channel discipline + chat grounding-bias rule + AC severity convention. Pass-2 superseded several pass-1 answers; pass-3 added new resolutions on top. Final state — applied throughout the spec:
>
> **Pass-3 resolutions:**
> - **Q7 (channel discipline at multiple scopes)**: ✓ defensible per pass-3 — IF cameras enforce scopes. §11.6 added making camera orchestration load-bearing for v1 (not optional polish). Without cameras, the channel ceiling collapses to global and pass-2 ✗1/✗2 corrections lose footing. §1 strategy summary updated to mark cameras as load-bearing.
> - **Chat grounding-bias rule**: §10.4 prompt now includes the explicit "introduce vs reference" decision (60-40-60 ratio diagnostic) per pass-3's Bartlett schema-theory argument. New AC-27 enforces it as a soft warning.
> - **AC severity convention**: §6 table gains a FAIL / WARN / POLICY classification per pass-3's generalised rule ("is there a counterexample where the predicate fires but the diagram is correct?"). 16 ACs are FAIL, 9 are WARN, 2 are POLICY.
> - **Q6 (L3 recursion)**: bonus pass-3 confirmation — inset-card metaphor at L3 (not sub-lanes). Already in §2.6 forward note; pass-3 added explicit cog basis (Gestalt similarity-of-treatment preserved at the *interaction* level, not the *containment metaphor* level).
>
> **Pass-2 resolutions** (carried forward):
>
> - **Q1 (re-pack duration)**: pass-1 said 240 ms; **pass-2 ⚠1 raised to 400 ms** (smooth-pursuit ceiling argument). Applied in §2.1 step 2 and §10.2 chat-frame slide.
> - **Q2 (lane widening during pre-warm)**: both passes agree — defer widening until user drill. Applied in §2.1 step 5 + AC-26.
> - **Q3 (endpoint shape)**: pass-1 said parallelogram with ellipse fallback; **pass-2 ✗3 swapped to ellipse outright** (categorical-jump + native-primitive + edit-safety reasoning beats the parallelogram peripheral-vision argument at our render scale). Applied in §2.2, §3.2, §4.1/§5.1 ASCIIs.
> - **Q4 (lane outline scope)**: both passes agree — outline only the L2 frame, not parent + L2. Applied in §2.6.
> - **Q5 (process body density)**: pass-1 said 12–15 words; **pass-2 ✗4 raised to ≤18 words** (eye-tracking fixation-ratio argument). Applied in §2.5, §3.2, AC-8.
> - **Q6 (lane recursion to L3)**: both passes agree — contained-card-inside-L2, not sub-lane. Applied in §2.6 forward note.
> - **Q6.b (chat stacking direction)**: pass-2 confirmed upward stacking (Siegel & White 1975 + Kosslyn 1987 spatial-schema argument). Applied throughout §10.
> - **Pass-2 ✗1 (chat provenance over-encoded)**: chat now uses zone-tint + dashed-edge-style + literal title; no orange border, no orange edge color. Orange palette reserved for "this answer disagrees with the paper" future signal. Applied in §3.1, §3.3, §10.3, AC-14.
> - **Pass-2 ✗2 (model node 5-channel violation)**: dropped ★ glyph and ⌖ glyph from `kind: model` nodes. ⌖ stays on `kind: process` drillable. Applied in §3.1, §3.2, all worked-example ASCIIs.
> - **Pass-2 ⚠5 (lane gutter undefined)**: gutter = 100 px without zones / 60 px with zones. Applied in §3.5 + AC-1.
>
> **All ten + Q6.b are now RESOLVED.** Pass-3 resolved Q7 (scope-local channels work IF cameras are load-bearing — §11.6). Pass-4 resolved Q8 (Focus-Light-style soft-default tour, §11.7), Q9 (latest-only checkpoint for v1, §12.4), Q10 (hybrid streaming modes — L1 streams, L2 pre-warm-then-flash, chat streams — §14.6 + AC-28). Plus pass-4 ✗1 (universal cross-zone purple), ✗2(a) (drop pastel.orange model fallback), ✗2(b) (AC-12 explicit channel formula), C7 (camera bbox padded to viewport ratio). Spec is fully audited.

## Q1. Lane re-pack animation duration

**Context.** When the L1 row first mounts, the agent has authored x-positions roughly. The renderer then re-packs nodes to lane centers — possibly shifting them by 100–300 px each. We propose 320 ms with `cubic-bezier(0.4, 0, 0.2, 1)` to match the existing dive transition.

**Concern.** Is 320 ms enough to *follow* the motion (so the user understands "the layout reorganised, but nothing changed")? Or should it be slower (e.g. 500 ms) so each node's path is trackable? Conversely, would a snap (no animation, 0 ms) be *better* — the layout settles instantly and the user never sees the agent's intermediate state?

**Trade-off.** Animation preserves continuity (Wertheimer common fate) but costs 320 ms. Snap loses continuity but is instant. The existing dive uses 320 ms; consistency matters. But the dive *zooms*, while the re-pack *re-positions* — different cognitive operations. 

**Cog-reviewer ask.** Is 320 ms the right number for a re-position-without-zoom transition? Should we test at 240 ms / 320 ms / 500 ms and pick by feel?

## Q2. Initial lane width vs. dynamic widening

**Context.** We initialize each drillable lane at 720 px (3-node L2 fits comfortably). When a 4- or 5-node L2 lands, the lane widens and downstream lanes shift right (animated).

**Concern.** Each L2 mount can trigger an animated re-flow of the entire L1 row right of it. With pre-warming (every L2 starts in parallel), the user may see 4 simultaneous lane widenings as L2 streams land. Is that visually overwhelming?

**Trade-off.** Pre-allocate worst-case lane widths (5 × 320 + gaps = ~1840 px each) → no dynamic widening but the L1 row sprawls across ~10000 px even when L2s are small. OR initialise narrow + widen on demand → tighter L1 footprint but multiple animated widenings during pre-warm.

**Cog-reviewer ask.** Does animated widening during pre-warm violate Doherty's threshold or attention-residue rules? Should we suppress widenings until the user actually drills (i.e., L2s pre-warm into "compressed" form, expand only on view)?

## Q3. Endpoint shapes — parallelogram vs. ellipse

**Context.** §2.2 picks parallelograms for `input`/`output` based on flowchart convention. Excalidraw doesn't have a native parallelogram primitive (we'd hack it via `diamond` with custom points or via a 4-point closed line).

**Concern.** Implementation cost vs. cognitive payoff. An ellipse is trivially in Excalidraw's primitive set and *also* signals "endpoint" by convention (UML use case, ER diagram entity). Is the parallelogram worth the implementation complexity, or does an ellipse get us 90% of the cognitive benefit at 10% of the build cost?

**Cog-reviewer ask.** Is the parallelogram→ellipse swap a cognitive downgrade or a wash? If a wash, prefer ellipse on engineering grounds.

## Q4. Lane outline: outline only the L2 frame, or both L1 parent + L2 frame?

**Context.** §2.6 proposes the lane outline encompasses both the L1 parent AND its L2 expansion. The label *"inside Encoder ×6"* sits at the top of the outline.

**Concern.** Outlining the L1 parent inside the same outline as its L2 might confuse the user about whether the L1 node is *part of* its own L2 or *the container of* its L2. The L1 node is the abstraction layer above; it's neither inside nor outside its own internals.

**Alternative.** Outline only the L2 frame (not the L1 parent). The label *"inside Encoder ×6"* still anchors the L2 to its parent; the L1 parent stays visually independent in the L1 row.

**Cog-reviewer ask.** Which framing better supports the structural-reading oscillation (CLAUDE.md §1)? Encompassing (parent + child grouped) emphasises hierarchy; child-only emphasises the L2 as a distinct view-of.

## Q5. Information hierarchy density vs. scanability

**Context.** §2.5 proposes terse 8–12-word summaries on `process` nodes and full 25-word summaries on the `model` node.

**Concern.** Density variation across L1 nodes might create perceptual asymmetry the user reads as "the model node is *more important*" — which is the goal — but might also bleed into "the process nodes are *less important*" — which is wrong. They're necessary structural pieces, just not the contribution.

**Cog-reviewer ask.** Does the asymmetry support the intended "the eye lands on model first" hierarchy (Treisman 1988 feature integration), or does it produce a "process nodes are afterthoughts" misread? Is there a middle ground (e.g. process nodes get 15-word summaries, model gets 25)?

## Q6.b Chat frame stacking direction (decision provisional, validate per §10)

**Decision in spec.** §10 places chat frames in the chat zone with **upward stacking** — newest at the top of the zone (just below the L2 zone), older frames slide down. Predictable y-anchor for the latest answer.

**Why this over conventional chat-UI bottom-stacking.** Most chat UIs (Slack, iMessage, Claude itself) put newest at the bottom and auto-scroll. The whiteboard's viewport is NOT anchored — the user might be focused on L1 or L2 when the answer lands. Bottom-stacking + auto-scroll would yank them away from their reading position; bottom-stacking without auto-scroll would land the answer somewhere they can't see. Upward-stacking puts the latest answer at a stable y-position they can build muscle memory for.

**Cog-reviewer-2 ask.** Validate or reject. Specifically: (a) does the convention-violation cost (users expect newest-at-bottom from every chat tool they use) outweigh the anchored-position benefit? (b) The §11 camera orchestration could deliver the user to the new chat frame regardless of stacking direction (auto-camera to the new frame). If we can rely on cameras, does that change the calculus — i.e. should we revert to bottom-stacking + always-camera-to-new? (c) Is there a hybrid (e.g. "always camera to new chat frame, but stack upward so the camera glides UP into the band rather than DOWN out of the paper") that's better than either pure direction?

## Q6. Should L2 frames have their own lane outline, or share one with their parent's lane?

**Context.** §2.6 currently says: one lane outline per drillable L1 node, encompassing the L1 parent + its L2 expansion. If the L2 itself has drillable nodes (a hypothetical L3 future), would each drillable L2 node *also* get a sub-lane?

**Concern.** Recursion grammar (CLAUDE.md §2.1) says every interaction at every level uses the same visual primitives. But infinite-nested lanes are visually overwhelming.

**Cog-reviewer ask.** Is the lane concept recursive (L3 gets sub-lanes) or terminal at L2 (L3 uses a different containment metaphor, e.g. inset card)? The current spec is L1+L2 only, so this is forward-looking.

## Q7. Channel discipline at multiple scopes (§3.6)

**Context.** §3.6 argues that "≤ 3 perceptual channels per scope" is the right ceiling, where scopes are zone (background tint), frame (border), node (fill+stroke pair, shape, body density). Each scope has its own ≤ 3 budget because the eye reads them at different fixations.

**Concern.** This is my reasoning, not a citation. Treisman 1988 feature-integration says channels integrate within a fixation; it's silent on whether they integrate across fixations. The "scope-local channels" claim could be wrong: if the user fixates on a single node, they may unconsciously read the zone tint + frame border + node properties as five channels, not three-per-scope.

**Cog-reviewer-2 ask.** Is "per-scope channel ceiling" a defensible cognitive position, or am I rationalising the addition of zones + frame borders? If the latter, what's the simpler discipline — drop zones, drop frame borders, drop body density?

## Q8. Camera tour as a forcing function vs. nudge (§11)

**Context.** §11 emits a camera tour the user can step through with ←/→. The user can opt out (free-pan, Esc). The tour is a *suggested* reading order.

**Concern.** Per CLAUDE.md §1's behavior-change-needs-forcing-functions rule: a *suggestion* the user can ignore tends to be ignored. If the cog-fatigue benefit of guided foveal attention only materialises when the user actually steps through, an optional tour might fail to deliver. But making it mandatory (locking the canvas to the tour) would violate the "scaffolding must be dismissable" rule (CLAUDE.md §1) and the structural-reading principle.

**Cog-reviewer-2 ask.** Does the optional camera tour actually do its job, or is it cognitive theater? Is there a hybrid (e.g. "tour is the default; ←/→ continues; clicking outside any node exits the tour but the camera state persists") that's better calibrated to the Focus Light ratio (visible enough that ignoring is a choice, weak enough that ignoring is free)?

## Q9. Checkpoint accumulation as model evidence (§12)

**Context (historical — Q9 was resolved in pass-4 to latest-only).** Earlier drafts kept every checkpoint additively in `<sidecar>/whiteboard.checkpoints/`, with AC-23 evicting past 50. Pass-4 collapsed this to a single `whiteboard.checkpoint.json` flat file (latest-only); AC-23 was dropped. The audit-trail use case ("rewind to before my bad chat answer", "see how the diagram evolved") is preserved via a lazy-migration path documented in §12.4 — when an audit-trail UI lands, the directory schema reactivates from that point forward. No v1 architectural cost from latest-only-now.

**Concern.** Checkpoints aren't user-facing today (no UI to browse them). They're agent-grounding only. So why keep more than the latest? Two reasons we could surface them later: (a) "rewind the whiteboard to before my last chat question" — useful if a chat answer was bad; (b) audit trail for the methodology principle ("the user can audit how the AI's understanding evolved"). Neither is currently designed.

**Cog-reviewer-2 ask.** Is keeping >1 checkpoint worth the disk cost in v1, or should we ship checkpoint-as-latest-only and add the timeline UI separately when the audit-trail use case lands?

## Q10. Progressive emission speed vs. wall-of-content trade-off (§14)

**Context.** §14 calls `api.updateScene` every ~50 ms during Pass 2 streaming so Excalidraw's draw-on animation runs. The whole L1 paint then takes ~80s — same as before, but instead of "nothing for 80s + flash" it's "draw-on for 80s."

**Concern.** Progressive emission delays the moment the user can act on the diagram (e.g. drill into an L1 node). If the user wants to drill 10s after the tab opens, they're blocked because L1 is still painting. We could let the user click drill-in even on partially-painted L1 (the agent would be authoring concurrently in another lane), but then the click might land on a node whose label hasn't materialised yet.

**Cog-reviewer-2 ask.** Is "the user has to wait for L1 to finish painting before drilling" acceptable, or does it violate Doherty? Should we render-and-pause (paint at full speed, then animate cameras) instead of stream-as-drawn?

# 8. Implementation surface — what changes where

For the implementer who picks this up after the cog-reviewer-2 audit. Not part of the strategy; included to ground the reviewers in scope.

| Change | File | Type |
|---|---|---|
**MCP wrapper changes** (in `src/main/mcp/whiteboard-mcp.ts` + new `src/main/mcp/whiteboard-chat-mcp.ts`):

| Change | Type |
|---|---|
| Add `create_labeled_shape` MCP tool — replaces `create_node_with_fitted_text`; `shape: rectangle\|ellipse\|diamond` (parallelogram dropped per ✗3 — endpoints use `ellipse`), `label: {text, fontSize}` lives ON the shape (kills text-overflow + wrap bugs at the schema level — §13). | New tool, ~120 LoC |
| Keep `create_node_with_fitted_text` as deprecated wrapper that internally builds the same `label`-on-shape structure (back-compat for any in-flight call sites). | ~30 LoC change |
| Add `create_background_zone` MCP tool — emits an `opacity: 30` rectangle for L1/L2/chat zones (§3.1). | New tool, ~50 LoC |
| Add `emit_camera` MCP tool — emits a `cameraUpdate` pseudo-element with bbox + aspect + duration + label (§11). | New tool, ~50 LoC |
| Add `restore_checkpoint` MCP tool — loads prior scene state into the agent's MCP, returns the element list + authored-by summary + available anchors (§12). MUST be the first tool call in every L2 / chat authoring pass. | New tool, ~120 LoC |
| Add `connect_cross_zone` MCP tool — emits an orthogonal-routed dashed `primary.purple #8b5cf6` edge from a chat-frame node UP to an existing L1/L2 node (uses `available_anchors` from `restore_checkpoint`). Universal cross-zone idiom per §3.3 / pass-4 ✗1 — same purple as L1↔L2 drill linkage, distinguished by dash-vs-dot style. | New tool, ~60 LoC |
| Update `DIAGRAM_GUIDE` constant: §3 palette tokens (concrete hex values), §3.4 kind constraints, §10 chat-frame contract, §11 camera-emission rules, §12 restore-first workflow, §13 labeled-shape-first rule, §14 progressive-emission order. | ~150 LoC of prose |
| New chat MCP wrapper `src/main/mcp/whiteboard-chat-mcp.ts` — closure over the same scene state primitives as Pass 2 but scoped to chat frames; tools surface includes `create_labeled_shape`, `create_chat_frame`, `connect_cross_zone`, `restore_checkpoint`, `look_at_scene`, `describe_scene`, `export_scene`. Caller `src/main/whiteboard/runChat.ts` orchestrates per-question. | ~280 LoC |

**Renderer changes** (in `src/renderer/whiteboard/WhiteboardTab.tsx`):

| Change | Type |
|---|---|
| Lane allocation + L1 re-pack pass (computes lane widths from drillable count, animates L1 to lane centers). | New function, ~120 LoC |
| L2 mount: place inside parent's lane (replaces "centered on parent x" math). The hardcoded `L1_LAYOUT_WIDTH = 1200` fallback in `WhiteboardTab.tsx` becomes dead code after this change — L2 x derives from `lane_center_x(parent)`, not from a hardcoded layout width. Remove the constant when its last caller goes away (don't keep it "just in case"). | ~30 LoC change in existing `useEffect L2 mount` |
| Lane outline + restated parent label rendering. | New function, ~60 LoC |
| **Background-zone rendering** — three opacity-30 rectangles laid down before content per §3.1 (L1 blue, L2 purple, chat green). Auto-resized as content grows. | New function, ~70 LoC |
| **Camera-tour controller** — strips `cameraUpdate` pseudo-elements from the rendered scene, builds an ordered tour, binds ←/→ to step, animates `scrollToContent` per camera (§11). Auto-injects overview camera at index 0 + chat-focus camera on chat-frame mount. | New function, ~140 LoC |
| **Checkpoint persistence + restore plumbing** — overwrite `<sidecar>/whiteboard.checkpoint.json` (single flat file, latest-only per §12.4 / pass-4 Q9) after each agent call's `export_scene`. The IPC layer exposes the latest checkpoint to the MCP wrapper so `restore_checkpoint(latest)` works. No history accumulation in v1. | ~100 LoC across renderer + main |
| **Progressive emission** — call `api.updateScene` incrementally (~50 ms tick) during Pass 2 streaming so Excalidraw's draw-on animation runs (§14). | ~40 LoC change in stream handler |
| Edge crossing detector + orthogonal-elbow routing for in-zone arrows. | New function, ~80 LoC |
| Anti-case assertions (AC-1 through AC-17) as dev-build runtime checks. | New function, ~80 LoC |
| Chat frame mount (place in chat zone, append upward-stacked, run cross-zone edge router). | New function, ~80 LoC |
| Chat frame eviction / collapse (N=8 expanded, older auto-collapse to 32 px stub). | New function, ~60 LoC |
| Side-chat UI: per-question Doherty ack + frame-spawn loading state. | `src/renderer/whiteboard/WhiteboardSideChat.tsx`, ~40 LoC change |

**v3.1 additions to the implementation surface** (relative to v2; supersedes v3-draft-1's per-modality additions):

| v3.1 change | Type |
|---|---|
| Add `create_section` MCP tool — mounts a section frame at the bottom of the stack with title + subtitle + provenance metadata per §16.1 (no enforced modality — `compositionHint` is descriptive only). Returns `section_id`; subsequent primitives are positioned within the section's coordinate system. | New tool, ~70 LoC |
| Add `create_text` MCP tool — free-floating text per §17.2.2. Excalifont default; monospace for equations; configurable font/color/align/line-height. | New tool, ~50 LoC |
| Add `create_callout_box` MCP tool — convenience: tinted background rectangle + overlapping text per §17.2.3. Wrapper handles co-positioning so agent can't get rectangle + text out of sync. | New tool, ~70 LoC |
| Add `create_image` MCP tool — embed a figure from `<sidecar>/figures/page-N-fig-K.png` per §17.2.7 (push-back to team-lead's brief; cog-reviewer-2 audits whether to keep). | New tool, ~50 LoC |
| Refactor `create_node_with_fitted_text` → `create_labeled_shape` per §17.2.1 (already in flight as LABEL-1, task #61 — v3.1 just confirms the rename). Excalidraw native `label` field guarantees text-fit. Old name kept as deprecated shim. | Refactor in progress (LABEL-1) |
| Refactor `connect_nodes` → `connect` per §17.2.5 (broader: connects any two elements with bounds, not just nodes). Cross-section variant absorbed via `strokeColor: '#8b5cf6'` + `strokeStyle: 'dashed'` defaults. Old name kept as deprecated shim. | ~30 LoC change |
| Update `DIAGRAM_GUIDE` constant: §16 section vocabulary, §17 minimal-primitives + soft authoring guidelines, §18 role palette + role-selection rule, §18.3 kind/role conflict resolution. | ~120 LoC of prose (less than v3-draft-1's 200 — soft guidelines are shorter than enforced specs) |
| Section-stack layout pass (top-down emission, `y = prev.y + prev.height + 80`, max width MAX_SECTION_WIDTH=1800px). Replaces the v2 L1-row + L2-lane layout pass at the canvas level. v2 lane logic becomes a soft authoring guideline (§17.6) — no renderer-enforced lane layout pass in v3.1. **v3.2 refactor note** (per whiteboard-impl): the v2 `allocateLanes` function in `WhiteboardTab.tsx` survives as `allocateSectionBands` (renamed; same algorithm, different scope — operates on sections within the canvas instead of L1 nodes within a row). The v2 `repackL1Row` survives as `repackSection` (renamed; re-flows shapes within a section band when sizeWeight assignments change). The renderer-side geometry pass code is preserved; just the level it operates at changes. | New function, ~80 LoC (less than v3-draft-1 — no per-modality dispatch); ~60 LoC of v2 lane-allocator code is reused via renaming |
| **v3.2 sizeWeight resolver** — translates `sizeWeight: 'dominant'|'standard'|'subordinate'` to actual `width`×`height` per §17.2.1.a multipliers. Runs as part of the `create_labeled_shape` MCP tool's response (so the agent gets back the actual dimensions immediately, can reason about them for downstream connect placement). | New function, ~30 LoC |
| **v3.2 labeled-zone label rendering** — when `create_background_zone` is called with a `label`, the renderer composes the white-plate-backed uppercase Excalifont label per §17.2.4.b typography rules. Reuses Excalidraw's text element with `customData.fathomKind: 'wb-zone-label'` for AC checks. | New function, ~30 LoC |
| Section-aware camera tour — extends v2 §11 camera-tour controller to step through the section stack (each section gets a focus camera; the overview spans the first 3 sections). | ~60 LoC change in existing camera-tour controller |
| Hybrid kind+role palette resolver — per §18.3, resolves the (fill, stroke) tuple for each labeled_shape from its kind + role assignment. | New function, ~40 LoC |
| Section eviction (generalised from v2 §10.5 to all section types per §16.5; paper-section-pinning rule per Q-v3.1-5). | ~30 LoC change in existing chat-frame eviction |
| Cross-section edge router — extends v2 cross-zone router to route purple-dashed-orthogonal edges from drilled section title bars UP to the parent section's drilled node. AC-33 enforcement (no title-bar crossings). | ~50 LoC change in existing cross-zone edge router |
| Drill-spawn IPC (when user clicks a drillable node, IPC message to main spawns a drill-agent Pass 2 call scoped to that node, returns the new section's content for renderer to mount). | New function, ~80 LoC main + ~40 LoC renderer |
| Anti-case assertions for AC-29 + AC-30 + AC-33 + AC-34 + AC-35 (v3.1 ACs; AC-31 + AC-32 dropped per modality removal). | ~30 LoC additional dev-build runtime checks (less than v3-draft-1's 50 — fewer ACs) |

**Methodology page update**: `docs/methodology/whiteboard.md`, ~200 lines of prose covering lane layout, palettes, camera orchestration, checkpoint/restore, labeled-shape-first, progressive emission, chat-as-diagram. **v3.1 add**: ~120 additional lines covering section stack, minimal primitives + soft authoring guidelines, role palette, drill-as-section-creation, kind/role resolution, visual-self-loop discipline. (Less than v3-draft-1's 150 prose lines — soft guidelines are shorter than per-modality recipes.)

Estimated total: ~1500 LoC + ~200 lines of prose (v2) + **~600 LoC + ~120 prose (v3.1 additions)** = **~2100 LoC + ~320 prose**. v3-draft-1's estimate was ~2600 + ~350; v3.1 saves ~500 LoC + ~30 prose by dropping the 6 specialised modality renderers in favor of the agent composing from minimal primitives. The MCP tool inventory grows from v2's 6 tools by **4 active v3.1 tools** (`create_section`, `create_text`, `create_callout_box`, `create_image`) plus 2 v2 renames (`create_node_with_fitted_text` → `create_labeled_shape`; `connect_nodes` → `connect`). Total v3.1 active inventory: **8 active primitives + 4 deprecated shims + 4 utilities = 16 tools** (was v2: 12; was v3-draft-1: 18). The deprecated v2 names stay as shims. No schema migration on disk: section frames are additional Excalidraw `frame` elements with `customData.fathomKind: 'wb-section'`, the new pseudo-elements (`cameraUpdate`) are stripped on render, so existing `.excalidraw` files round-trip unchanged. Checkpoints are an additive on-disk artifact (single flat file, not a schema change). Existing v2 whiteboards re-layout on next load via the renderer-side section-stack pass; the canvas-level section stack is the new outer container.

**v3.1 ship-everything-day-one recommendation**. Unlike v3-draft-1 (which recommended a 5-modality starter set + 2 deferred), v3.1 ships its full primitive set day one because (a) the primitives are minimal and inexpensive (~600 LoC vs v3-draft-1's ~1100), (b) every primitive is used universally (no per-modality cluster of features that could be deferred independently), (c) the agent's composition flexibility is what unlocks the value, and gating any of the 6 primitives undermines that. The only deferable: `create_image` (auxiliary; safe to land in v3.2 if cog-reviewer-2 rejects the push-back).

# 9. What this strategy does NOT change

So future readers know what's still load-bearing from the existing `whiteboard-diagrams.md`:

- Pass 1 + Pass 2 split (Opus 4.7 throughout, MCP-driven authoring, cached-prefix Pass 2). Unchanged.
- The 5-node Cowan ceiling (per frame — applies to L1, L2, AND each chat frame). Unchanged.
- Excalidraw + Excalifont aesthetic. Unchanged.
- Drill UX (click drillable node → animated `scrollToContent` to L2 frame). Unchanged.
- Drillable affordance (dashed border + ⌖ glyph). Unchanged.
- Citation marker (amber square top-right). Unchanged.
- Persistence model (single `.excalidraw` file in sidecar dir; chat frames are additional `frame` elements in the same file). Unchanged.
- Doherty acknowledgement contract (skeleton + spinner within 1 frame; extended in §10 to chat-question submission). Unchanged.
- Tab-level status dot (extended in §10 to also pulse during chat-frame authoring). Unchanged in mechanism.

# 10. Chat-authored content

Added 2026-04-25 per user instruction: *"whenever I ask anything on side chat on whiteboard, then the agent should make new charts on whiteboard to answer or explain that."* The side chat is no longer text-only; every user question produces a new diagram on the canvas as the agent's response.

## 10.1 The fundamental shape

Three content types now coexist on one whiteboard canvas:

| Type | Provenance | Authored by | Lives in |
|---|---|---|---|
| L1 | Paper-derived (top-level architecture) | Pass 2 agent | Top row, lane-packed |
| L2 | Paper-derived (zoom-in of one L1 node) | Pass 2 agent (per-parent, parallel pre-warm) | Lane below its L1 parent |
| **Chat frame** | **User-question-derived (agent's diagrammatic answer)** | **Chat agent** (one per user question) | **Chat band below all paper-derived content** |

All three types use the same MCP authoring surface (rect nodes, arrows, the §3 visual vocabulary). The differences are positional (which y-band) and provenance-signaled (chat frame border + frame title + edge style for cross-band edges).

## 10.2 Chat frame placement — the chat band

**Decision.** Chat frames live in a dedicated horizontal band below the L1+L2 grid. The band's top is `chat_band_y = max(L1.y_max, L2.y_max) + 320 px` (one full vertical breath below the deepest paper-derived content). Frames stack within the band; spans the full canvas width.

**Stacking direction (default: upward, anchored).** New chat frames mount at the top of the chat band — just below the L2 row, at a stable predictable y-position. Earlier chat frames slide down to make room (animated, **400 ms** — same re-position-not-zoom transition as the L1 re-pack per §2.1, pass-2 audit ⚠1 timing). The user always knows where to look for the latest agent answer: same place every time, no scrolling required.

This reverses the typical chat-UI convention (newest at bottom + auto-scroll) because the whiteboard viewport isn't anchored — the user might be focused on L1, and we cannot auto-scroll them to the bottom without disrupting their reading flow. (See open question Q6.b in §7 — cog-reviewer-2 may push back.)

**Frame width.** Each chat frame's width is computed from its content (5-node Cowan ceiling × max node width = ~1840 px worst case). The frame is left-aligned at `x = 0` so frames of varying widths share a consistent left edge, making them easy to scan vertically.

**Frame height.** Computed from its node row: `max(node.height) + 80 px` (frame title + padding). Single-row diagrams only at L1/L2/chat — no sub-rows inside a chat frame.

**Vertical gap between chat frames.** 24 px. Chat frames are visually denser than L1/L2 (less whitespace per frame) because the band already provides isolation from paper-derived content.

## 10.3 Chat frame visual vocabulary

Per cog-reviewer-2 audit pass-2 ✗1: the prior draft encoded chat-vs-paper provenance via four channels (orange border + `Q:` title + dashed cross-zone edge + y-band position). Treisman & Gelade 1980 + Tufte data-ink ratio: each redundant channel displaces visual contrast budget that could mark a higher-value distinction. The chat zone tint already does the pre-attentive provenance grouping. We collapse to:

Same vocabulary as L1/L2 nodes, plus two visual additions and one customData tag:

1. **Frame border.** Thin neutral gray dashed — *identical to the L2 lane outline* per §2.6 (stroke `#d4cfc6`, 1 px, `strokeStyle: 'dashed'`, `roughness: 1`, no fill). Frames are frames; they don't need provenance via border because the chat-zone peach tint already does it. (Reuses the L2 lane outline's visual treatment so the eye reads "this is a frame around something" at zone-agnostic cost.)
2. **Frame title (top-left of frame border, system sans, 12 px, color `#5a4a3a`).** Format: `Q: <question excerpt up to 80 chars>`. Excerpt is the user's question literally, truncated with `…` if longer. The literal-quote convention (not a paraphrase) tells the user the agent answered *their actual words*, not its interpretation. This is **content the user reads when they want to know which question that frame answers** — it is not a pre-attentive provenance channel (the zone is). Title and zone do different jobs at different cognitive levels.
3. **`customData.fathomKind: 'wb-chat-frame'` tag** on the frame element. Provenance lives in customData (read by the renderer + agent, not by the user's eye); the *visual* provenance signal is the zone tint and nothing else. The prior draft's `kind: "chat"` enum was redundant — collapsed back into customData.

**Scope of `kind: model`.** A chat frame is allowed to have its own `kind: model` node (the answer's key insight). This does NOT violate AC-3's "exactly 1 model node at L1." `kind: model` is scoped per-frame: L1 has 1, each L2 has 0–1, each chat frame has 0–1. The ★ visual emphasis tells the user "this is the punchline of this frame" — which is true at every scope.

**Cross-zone edges (chat → paper).** When the chat agent's answer references existing paper content (an L1 or L2 node), it draws an edge from a chat-frame node UP to the referenced paper node. Cross-zone edge style (per §3.3 post-pass-4 ✗1 universal-cross-zone-idiom refinement):

- `strokeStyle: 'dashed'` (vs solid for in-zone, vs dotted for L1↔L2 drill linkage) — the *style* channel disambiguates which kind of cross-zone link.
- `strokeColor: 'primary.purple #8b5cf6'` — same purple as L1↔L2 drill linkage; the eye learns "purple = relationship across provenance domains" once. The chat zone tint at the source end carries the "this is chat content" signal at the zone scope, so the edge color is freed up for the universal cross-zone meaning.
- `strokeWidth: 1.0` (vs 1.5 for in-zone — slightly thinner so it reads as secondary).
- Always orthogonal-routed (§2.4). Cross-zone straight lines would cross many nodes; orthogonal routing is mandatory here.

This frees the orange palette (`primary.orange`) for a higher-value future signal — *"this answer disagrees with / refines / contradicts the paper's claim"* — see §3.1 reservation note.

## 10.4 The chat agent — restore-checkpoint + author-frame

> **Updated 2026-04-25 to use `restore_checkpoint` per §12.** The earlier draft proposed a chat-only `read_existing_scene` tool; that's now subsumed by the universal `restore_checkpoint(latest)` mechanism. Same mental model whether the agent is authoring L2 or chat. The table below names `restore_checkpoint` accordingly; if the prose still mentions `read_existing_scene` below, treat it as a synonym for `restore_checkpoint(latest)`.

The chat agent is a new SDK MCP-driven Claude Agent SDK call (sibling to Pass 2), spawned per user question. Its tool surface:

| Tool | Purpose | Notes |
|---|---|---|
| `restore_checkpoint(latest)` (universal — §12) | Returns the current whiteboard's elements + authored-by summary + available_anchors (existing nodes the chat frame can connect to via cross-zone edges). | Lets the agent ground its answer in what's already there ("the user already has Encoder L2 with cross-attention; let me extend that"). MUST be the first tool call in every chat-frame authoring pass. |
| `look_at_scene` (NEW, built by VLOOP-1 in parallel) | Returns a PNG of the current authored chat frame so vision-Claude can self-critique. | Shared with Pass 2; assumed to exist per spec frontmatter. |
| `create_chat_frame` (NEW) | Mounts a new chat frame at `chat_band_y` with a neutral gray dashed border (`#d4cfc6`, identical to L2 lane outline) + literal `Q: <excerpt>` title. Returns frame_id. Provenance is carried by the chat zone tint (`zone.peach #fde7d4` @ opacity 30) per §10.3 / pass-2 ✗1 — NOT by the frame border. | Authoring contract: must be called BEFORE any nodes; subsequent `create_labeled_shape` calls are bound to this frame. |
| `create_node_with_fitted_text` | (existing) | Same as Pass 2; node positions are interpreted as relative to the active chat frame's origin. |
| `connect_nodes` | (existing) | Same as Pass 2; in-frame edges only. |
| `connect_cross_zone` (NEW — renamed from `connect_cross_band` for §3 zone vocabulary alignment) | Authors an edge from a chat-frame node UP to a paper-derived node (L1 or L2). Auto-styles per §3.3 universal cross-zone idiom: `primary.purple #8b5cf6` dashed orthogonal. | The agent passes `from_id` (chat-frame node) and `to_id` (existing L1/L2 node id from the `available_anchors` returned by `restore_checkpoint`). |
| `describe_scene` | (existing) | Reports the current chat frame's state for self-critique. |
| `export_scene` | (existing) | Finalises and persists the chat frame. |

**Prompt skeleton (chat agent's system prompt):**

> *"You are answering the user's question by drawing a new diagram on the whiteboard. The user is reading a research paper alongside this whiteboard; they can already see the L1 architecture and any L2 expansions they've drilled into. Your answer is a frame on the same canvas.*
>
> *Workflow:*
> *1. Call `restore_checkpoint(latest)` first — load the existing whiteboard state. Identify nodes the user's question references (by name or by topic) from the returned `available_anchors`.*
> *2. Plan a 1–5 node diagram that answers the question. Use the same visual vocabulary as the existing scene (ellipse for I/O endpoints per §3.2 post-✗3 swap, `kind: model` heavy amber stroke + pastel.yellow fill for the answer's key insight — NO ★ glyph).*
> *3. **Decide grounding-vs-extension first** (cog-reviewer-2 audit pass-3, grounding-bias rule). Is the question's subject already represented as a node in the existing scene?*
>    - *If YES → mostly REFERENCE existing nodes via cross-zone edges; introduce only new nodes for the conceptual machinery that BRIDGES them. The relationship between known things IS your answer; don't re-render the known things.*
>    - *If NO → mostly INTRODUCE new nodes that fill in the missing structure; cross-zone edges only at the points where your new structure attaches to the paper's existing structure.*
>    - *Diagnostic check: count the labels in your draft. ≥60% novel labels → "introducing" mode (correct for absent-subject questions). ≥60% reused labels → "referencing" mode (correct for present-subject questions). 40-60% mixed → you're probably re-rendering the paper instead of answering — re-think before authoring.*
> *4. Call `create_chat_frame(question_excerpt)`, then author your nodes + edges, then `look_at_scene` to verify visually, then `describe_scene` for structural verification, then `export_scene`.*
> *5. Hard rules: ≤5 nodes per frame (Cowan); use the paper's terminology; cite paper page numbers via `citation: {page, quote}` when grounding in a specific paragraph; never re-render a node that already exists on the canvas — link to it via `connect_cross_zone` instead. The grounding-vs-extension decision in step 3 is the load-bearing one — get it right and the rest is mechanical."*

**Cog basis** (per pass-3 grounding-bias answer): Bartlett 1932 schema theory + Anderson 1977 on text comprehension. When the question's subject matches an existing schema node, the cognitive answer IS the relationship (an edge), not a duplicate node. When the subject is conceptually absent, the agent must build new schema-attachment points. The 60-40-60 ratio diagnostic forces the agent to make the choice explicitly rather than drift toward whichever authoring path is mechanically easier.

## 10.5 Eviction / collapse

Canvases can't grow unbounded. Eviction policy:

- **Most recent N = 8 chat frames stay fully expanded.**
- **Older chat frames auto-collapse** to a 32 px-tall stub showing only the `Q:` title (no nodes, no edges visible). The stub renders at the same x and width as the full frame, sliding into a "collapsed" state with a 200 ms fade.
- **User can re-expand any collapsed frame** by clicking its title stub — 200 ms expansion animation. Re-expansion does NOT re-collapse a different frame; the user can manually balloon up to 20 expanded frames if they really want to. (We hard-cap at 20 expanded frames; the 21st triggers a "you have a lot of conversation; consider archiving older threads" toast — non-blocking.)
- **Cross-band edges from collapsed frames** render as a single faint vertical line from the collapsed stub up to the referenced paper node (truncated to a "this collapsed frame referenced X" hint). The full edge re-renders on expansion.
- **Persistence.** Eviction state (which frames are collapsed) persists per-paper in `whiteboard.excalidraw` via Excalidraw's `customData.collapsed: boolean` on each frame element. Re-opening the paper restores the same collapsed/expanded state.

**Why N = 8 is the default expanded count.** Cowan 4±1 working memory * 2 (one slot for "frame I'm reading" + one slot for "frames I might compare against") = 8 chunks comfortable. Past 8, the band starts to feel like a list and collapse becomes mandatory. (Calibrate after dogfood; might raise to 10 or lower to 6 based on observed scrolling behavior.)

## 10.6 Doherty contract for chat-question submission

Same rule as the existing whiteboard contract: every user-initiated action acknowledges within ≤ 50 ms.

When the user submits a chat question:

1. **Within 50 ms**: a placeholder chat frame appears at the top of the chat band (faint neutral-gray dashed border per §10.3 post-✗1, `Q: <question>` title, "Drawing answer…" caption inside). The chat band shifts existing frames down with the 400 ms re-position animation (per §2.1, pass-2 audit ⚠1). The send-button shows a spinner.
2. **Within ~5 s** (per existing per-side-chat-patch latency budget — see `whiteboard-diagrams.md` §"Cost & latency"): the agent's first node lands. Hydrates the placeholder.
3. **Within ~15–25 s**: the full frame is authored, edges drawn, cross-band edges to paper content drawn, `export_scene` called. The placeholder caption clears. The tab-level status dot transitions from red-pulsing back to amber-static.

The red-pulse → amber transition on the tab dot is reused from the existing Pass 2 status grammar (per `docs/methodology/whiteboard.md` §"Tab-level status dot"). This means the dot has one consistent meaning ("Claude is authoring something on the whiteboard") regardless of whether the work is L2 pre-warm or chat-frame authoring. No new grammar.

## 10.7 What chat frames must NOT do

- **Must not be placed inside an L1 lane or L2 lane.** They live in the chat band only. (AC-13)
- **Must not duplicate paper-derived nodes** without a cross-band edge to the original. (AC-17)
- **Must not exceed 5 nodes per frame.** Same Cowan ceiling as L1/L2.
- **Must not use solid black edges to paper nodes** — cross-zone edges are `primary.purple #8b5cf6` dashed (universal cross-zone idiom per §3.3 / pass-4 ✗1). (AC-14)
- **Must not silently hallucinate paper claims.** Citations to paper pages are encouraged when the answer makes a claim about the paper; use `citation: {page, quote}` (existing tool param). The same soft verifier (`whiteboard-diagrams.md` §"Anti-hallucination") greps the quote against `content.md`; unverified citations get the dashed-amber + `?` glyph treatment.
- **Must not render text-only answers as a single label-only node.** A text answer belongs in the side chat history, not on the canvas. The agent must produce a diagram with structure (nodes + edges + relationships); if it can't, it should respond in side-chat text only and skip the frame (the side chat continues to host the conversation thread).

## 10.8 Persistence and round-tripping

Chat frames are additional Excalidraw `frame` elements in the same `whiteboard.excalidraw` file as L1 and L2. Each carries `customData: {fathomKind: 'wb-chat-frame', question: '<full literal question>', questionExcerpt: '<title shown>', authoredAt: '<iso-ts>', collapsed: false, modelInsightNodeId?: '<id>', citedPaperPages: [<int>...]}`.

The chat conversation history (the sequence of user questions and the resulting frame IDs) lives in `whiteboard-chat.json` keyed by paper hash, sibling to the `.excalidraw` file. This already exists for the deferred-from-v1 side chat (per `whiteboard-diagrams.md` §"The side chat"); we're now writing to it for the chat-as-diagram path instead of holding text replies in memory.

Move the PDF and the entire conversation + diagram history travels with the sidecar — same invariant as L1/L2.

This strategy is a layout + visual-hierarchy refinement, not a re-architecture. The pipeline shape, the tool inventory shape, the persistence shape, and the user-facing interactions all stay.

# 11. Camera / viewport orchestration

Adopted from the sibling Excalidraw-tool's `cameraUpdate` pseudo-element pattern. Direct application of CLAUDE.md §1's reduce-cognitive-fatigue principle — instead of a wall of nodes the user has to scan, the diagram becomes a *narrative* the eye is led through one component at a time.

## 11.1 The mechanism

A `cameraUpdate` is a non-rendered pseudo-element the agent emits inline with normal scene elements. The renderer interprets it as "pan + zoom the viewport to this bbox over N ms." The agent emits multiple cameras in sequence, producing a guided tour through the diagram.

```jsonc
// Pseudo-element shape (lives in scene.elements alongside rectangles + arrows):
{
  "type": "cameraUpdate",
  "id": "cam-001",
  "bbox": { "x": 0, "y": 0, "width": 2640, "height": 280 },  // L1 row overview
  "aspectHint": "1600x1200",                                  // 4:3, picks the closest viewport ratio
  "duration": 600,                                            // ms — animated pan, eased
  "label": "Top-level pipeline",                              // optional — shown briefly as a caption during the transition
  "customData": { "fathomKind": "wb-camera", "stepIndex": 0, "totalSteps": 6 }
}
```

The renderer:
1. Strips `cameraUpdate` elements from the rendered scene (they're not Excalidraw shapes).
2. Builds an ordered list of cameras (`stepIndex` ascending).
3. On first mount: animates to camera[0], shows the label briefly.
4. Binds ←/→ arrow keys to step backward/forward through the camera list.
5. Binds `Esc` (or click outside any node) to exit the guided tour and free-pan.

## 11.2 What the agent emits

| Phase | Camera | Content |
|---|---|---|
| Open | **Overview** — bbox covers the entire L1 row + L1 zone padding. Aspect 1600×1200. | "Top-level pipeline" caption. The user sees the whole architecture in one fixation before any drilling. |
| Per L1 component | **Focus** — bbox covers ONE L1 node + its lane outline. Aspect 800×600 or 1200×900. | The L1 node's label as caption (e.g. "Encoder ×6"). User's foveal acuity is on one component at a time. |
| Per L2 expansion (post-drill) | **L2 dive** — bbox covers the L2 frame within its lane. Aspect 800×600. | "Inside Encoder ×6" caption. |
| Chat answer landing | **Chat focus** — bbox covers the new chat frame. Aspect 800×600. | The `Q:` excerpt as caption. The renderer auto-emits this when a chat frame mounts (per Q6.b's hybrid suggestion). |

Cameras are EMITTED BY THE AGENT during Pass 2 + chat authoring (the agent decides which components deserve their own focus camera) and AUGMENTED BY THE RENDERER (the renderer auto-injects the overview at index 0 + the chat-focus camera when chat frames mount, so the agent doesn't have to think about those).

## 11.3 Sizing — 4:3 content guides + viewport-ratio padding

The sibling tool uses 4:3 aspect ratios as content-bbox guides. Available sizes:

| Size | Use |
|---|---|
| 400 × 300 | Single-node focus (rare; L3 napkin cards if/when shipped) |
| 600 × 450 | Tight focus (single L2 node + immediate neighbours) |
| 800 × 600 | Default per-component focus |
| 1200 × 900 | Wide focus (L1 node + its lane outline incl. L2) |
| 1600 × 1200 | Full overview (entire L1 row + zones) |

**Padding rule (revised per pass-4 audit C7).** The 4:3 sizes above are *content-bbox guides* — they tell the agent how much canvas to frame around the focal content. But the user's actual viewport is most often 16:9 on macs, not 4:3. Animating a 4:3 camera bbox into a 16:9 viewport produces black-bar regions or overshoots horizontally.

The renderer therefore applies a two-step padding:
1. **Content padding**: camera content-bbox = `agent_specified_bbox × 1.5` (don't cramp the edges).
2. **Viewport-ratio padding**: actual rendered viewport-bbox = `max(content_bbox_padded, content_bbox_padded_letterboxed_to_viewport_ratio)` — i.e. extend the bbox horizontally OR vertically (never crop content) until it matches the active viewport's aspect ratio. The user always sees the full content-bbox plus *additional* canvas in the dominant viewport direction; never less than the content bbox.

The agent emits 4:3 content guides; the renderer composes them with the viewport ratio at transition time. No animation glitches at any viewport ratio (16:9, 16:10, 4:3, ultrawide all just work).

## 11.4 Doherty-compliant transitions

Camera transitions are 600 ms `cubic-bezier(0.4, 0, 0.2, 1)` (above the 400 ms Doherty floor for a perceived-deliberate motion, but well within the 1 s where the user starts wondering). Stepping rapidly through cameras (←/← in <100 ms apart) collapses queued transitions to direct jumps — no animation queue overflow.

## 11.5 Why this isn't decorative

A common reviewer concern with guided tours is "isn't this just animation for animation's sake?" The cog-defense:

- **Foveal acuity is ~2°.** A diagram with 5 L1 nodes + 5 L2 expansions + 3 chat frames spans far more than 2° of the user's vision. Without camera guidance, the user must saccade across the entire scene to build a mental model — that's the cognitive cost. With per-component cameras, each fixation contains exactly one component the user can fully integrate.
- **The user can opt out.** ←/→ are convenience; the user can free-pan anytime. The guided tour is a *suggested* reading order, not a forced one. Honors the structural-reading principle (CLAUDE.md §1) that the reader chooses the resolution.
- **The camera path IS the narrative.** When the agent emits `[overview, encoder, decoder, chat]` in that order, that ordering encodes "first see the whole, then the contribution, then its symmetric counterpart, then the user's question about it" — that's the paper's mental model, externalised. The user replays it by stepping through.

## 11.6 Camera orchestration is load-bearing for the channel-discipline ceiling

Cog-reviewer-2 audit pass-3, Q7 answer: the entire "≤3 channels per scope" assertion in §3.6 (and the per-scope analysis throughout §3) is **only defensible because cameras enforce the scope.** Without camera orchestration, the user can free-pan to a zoom level that shows L1 + L2 + chat simultaneously; at that zoom, all channels collide globally and Treisman pop-out collapses to serial search. Several ✗-grade violations from pass-2 (chat-frame border channel, model-node glyph stack) would resurface as global-channel-budget overruns.

**With cameras**: each scope renders at its own zoom level. The overview camera deliberately suppresses scope-local detail (L2 body text, chat-frame interior nodes — see §11.2 + §3.5 sizing-by-camera rule), so the overview never has to fight the global-channel-budget problem. Per-component cameras give each scope exclusive access to the user's attention.

**Treisman 1988 + Wertheimer common-region:** pop-out is a scope-local effect within the ~5° radius of fixation, not a global one. Body length is a post-fixation reading channel that doesn't displace pop-out budget. Frame border at the chat-frame scope is a separator-class feature operating on a different perceptual mechanism. So scope-local channel budgeting works as long as scopes are *enforced* — and the camera is what enforces them.

**This makes camera orchestration a hard requirement for v1, not an optional polish.** Without cameras, the ✗1 + ✗2 channel-discipline corrections from pass-2 lose their cognitive footing. Specifically:

- Camera 0 (overview) MUST suppress L2 body text and chat-frame interior nodes at the rendered zoom level. The L2 zone shows only the parent label and a "×N components" count (e.g. *"Encoder ×6 · 5 components"*); the chat zone shows only frame titles. This prevents global channel collision.
- Per-component cameras (L2 dive, chat focus) are the *only* zoom levels at which body text + cross-zone edges + frame borders become legible. The user reads detail at the camera that owns that detail.
- Free-pan is allowed (CLAUDE.md §1: reader controls resolution), but free-pan is the user opting out of the scope-discipline guarantee. They get the canvas they asked for; the cog-load consequences are theirs to manage.

Engineering implication: the implementer cannot ship the lane discipline without cameras, or the channel ceiling falls back to global. **§11 is therefore promoted from "feature" to "load-bearing dependency" in §1's strategy summary** (already updated below).

## 11.7 Tour engagement — Focus-Light-style soft default (per pass-4 audit Q8)

A pure-optional camera tour fails to deliver: the cog-load benefit only materialises if the user follows it, and most users free-pan immediately. A pure-mandatory tour (locked canvas) violates dismissibility-of-scaffolding + reader-controls-resolution. Both extremes are wrong.

**The Focus Light is the right precedent** (CLAUDE.md §1: behavior-change-needs-forcing-functions): "off by default at the system level, but once the user opts in, the band moves whether they ask it to or not. Visible enough that ignoring is a choice; weak enough that ignoring is free." Applied to the camera tour:

1. **First-time-paper default**: tour ENABLED. Whiteboard opens at camera[0] (overview); a caption *"← / → to step through the architecture (Esc to free-pan)"* appears for 3 seconds, then fades. Minimum invitation that ensures the user knows the tour exists.
2. **Mid-tour behavior**: each ←/→ step is the user *initiating* a camera move. Smooth pan+zoom transitions per §11.4. The tour does NOT auto-advance — auto-advance would be the unprompted-motion violation (Yantis & Jonides 1984).
3. **Free-pan exit**: any pan/zoom gesture (drag, scroll-zoom, pinch-zoom) immediately exits tour mode. Camera state persists where the user landed. ←/→ revert to native Excalidraw shortcuts (no longer tour navigation).
4. **Re-entry**: user can re-enter the tour by clicking a "Start tour" button in the whiteboard header (or pressing T). Camera goes to camera[0]; tour state resumes.
5. **Per-paper memory**: if the user has ever exited the tour for a given paper, subsequent reopenings of that paper start in free-pan mode (the user has demonstrated they prefer free-pan for this paper). If they re-enter and ride the tour to the end, that gets remembered too. Persisted in `whiteboard-chat.json` as `tourState: 'first-time' | 'opted-out' | 'opted-in'` per paper hash.

**Calibrated to the Focus-Light ratio**: visible enough on first-paper-open that ignoring is a choice (the 3-second caption invitation), weak enough that any free-pan gesture exits without friction. Per-paper memory means the user's *demonstrated* preference governs subsequent sessions — they don't have to re-opt-out repeatedly. Cog-defense: matches the "behavior-change needs forcing functions, not nudges" principle while honoring "scaffolding must be dismissable."

**Concrete implementation notes:**
- The 3-second invitation caption renders in system sans, 13 px, semi-transparent (`rgba(26, 22, 20, 0.7)`), bottom-center of the whiteboard tab.
- The caption fade-out is `opacity: 1 → 0` over 400 ms cubic-bezier(0.4, 0, 0.2, 1) starting at t=3000 ms.
- The "Start tour" button in the whiteboard header is a small circular icon (16 px); on hover, tooltip *"Restart camera tour (T)"*.
- `tourState` persistence write happens on free-pan exit (state → `'opted-out'`) or on user reaching the final camera step (state → `'opted-in'`).

# 12. Checkpoint / restore — additive scene editing

Adopted from the sibling tool's `restoreCheckpoint` pseudo-element. Each persisted scene is a checkpoint; subsequent agent calls extend rather than rebuild. This is a fundamental shift in how Pass 2 + chat authoring work.

## 12.1 The model (latest-only per pass-4 audit Q9)

- **Every scene save replaces `<sidecar>/whiteboard.checkpoint.json`** (single flat file, not a directory). The current `whiteboard.excalidraw` IS always the materialised render of this latest checkpoint. **No checkpoint history accumulates in v1** — see §12.4 for the latest-only justification.
- **The next agent call's first action is `restore_checkpoint(latest)`.** This loads the prior scene into the agent's MCP state. The agent then *appends* (new L2 frame, new chat frame) without re-sending prior content.
- **The MCP returns IDs of restored elements** so the agent can reference them — for `connect_cross_zone` (chat → existing L2 node), for `emit_camera` to focus on an existing region, for `relabel` / `extend` ops in the future side-chat patch loop.

## 12.2 Why it matters

Three independent wins:

1. **Halves prompt size on long sessions.** A paper with L1 + 5 L2s + 8 chat frames already authored takes ~12k tokens to round-trip. With checkpoint-restore, the next call ships the prior scene as a single tool result + a tiny delta — net ~1k tokens saved per call. Compounds across the conversation.
2. **Eliminates "agent ignored existing content" failure mode.** Today, Pass 2 L2 expansions are independent calls; an L2 author might re-create a node the L1 already has, or invent a connection that conflicts. With restore-first, the agent literally cannot author a duplicate — it sees the existing element and chooses to extend it instead. Especially relevant for chat (§10.4's `read_existing_scene` becomes the standard restore pattern).
3. **Provenance is explicit in the data model.** Each checkpoint records *which agent call authored which elements* via `customData.authoredBy: 'pass2-l1' | 'pass2-l2-<parentId>' | 'chat-<frameId>'`. The renderer can filter / dim / highlight by provenance for free, without a separate provenance log.

## 12.3 The MCP tool

```jsonc
// Tool: restore_checkpoint
// Input:
{ "ref": "latest" | "<checkpointHash>" }
// Output (JSON, ~5-50 KB depending on scene size):
{
  "elements": [...],            // every element in the prior scene
  "checkpoint_id": "<hash>",
  "authored_summary": {
    "pass2-l1": { "node_count": 5, "edge_count": 4, "ids": ["wb-rect-001", ...] },
    "pass2-l2-wb-rect-003": { "node_count": 4, ... },
    "chat-cf-001": { "node_count": 3, "ids": [...] }
  },
  "available_anchors": [        // ids the next call can connect TO via cross-zone edges
    { "id": "wb-rect-003", "label": "Encoder ×6", "kind": "model", "level": 1 },
    { "id": "wb-l2-wb-rect-003-rect-001", "label": "Multi-Hd Self-Attn", "kind": "model", "level": 2 },
    ...
  ]
}
```

The agent MUST call `restore_checkpoint(latest)` as the first tool call in every Pass 2 L2 expansion and every chat-frame authoring call. The system prompt enforces this; if the agent skips it, the MCP returns an error on the first `create_*` call ("scene state is empty; call restore_checkpoint first or call clear_scene if you really want a blank canvas").

## 12.4 Persistence shape (revised per pass-4 audit Q9 — latest-only for v1)

```
<sidecar>/
├── whiteboard.excalidraw                    # Current scene (latest checkpoint, materialised)
├── whiteboard.checkpoint.json               # Latest checkpoint only (single flat file, replaces .checkpoints/ directory)
└── whiteboard-chat.json                     # Chat conversation history (questions + frame IDs, plus tourState per pass-4 Q8)
```

**Latest-only justification (per pass-4 Q9).** v1 has no UI to surface checkpoint history to the user. The agent only ever needs `latest` for restore-first grounding. Keeping older checkpoints is pure speculative storage (~1–2.5 MB/paper for a feature no UI consumes). The "rewind to before my bad chat answer" + audit-trail UI use cases are unbuilt and unscheduled — YAGNI. Critical: shipping latest-only does NOT preclude shipping audit-trail later. When the audit-trail UI is designed, we add a config flag that writes cumulatively *from that point forward*. Older paper sessions wouldn't have history; new sessions would. Lazy migration; no architectural cost from latest-only-now.

The user's "Reset whiteboard" button (already in the UI per CLEAR-1, task #58) wipes both `whiteboard.excalidraw` AND `whiteboard.checkpoint.json`. No eviction logic needed because no accumulation happens. **AC-23 (checkpoint count > 50 eviction) is dropped** in v1 — no checkpoints to evict.

## 12.5 What this replaces

The earlier draft had `read_existing_scene` (§10.4) as a separate chat-only tool. With checkpoint/restore, `read_existing_scene` is subsumed — the chat agent uses `restore_checkpoint(latest)` like every other agent call. One tool, one mental model, one canonical provenance trail. (Update §10.4 accordingly when the implementer reads this.)

# 13. Labeled-shape-first authoring

Adopted from the sibling tool's `label: {text, fontSize}` pattern on shape primitives. **Eliminates Bug A (text outside box) + Bug B (text not wrapping) at the schema level** rather than via the wrapper's character-width approximation that whiteboard-impl just hand-fixed.

## 13.1 The bugs we're killing

The current `create_node_with_fitted_text` MCP tool (in `src/main/mcp/whiteboard-mcp.ts`) authors a `rectangle` element + a separate `text` element with `containerId` pointing back to the rectangle. The text element's geometry is computed via `fitNodeSize()`'s character-width approximation (`LABEL_CHAR_W=10`, `SUMMARY_CHAR_W=7.5`). Bug A occurs when the approximation underestimates the actual rendered text width and the text overflows the rectangle. Bug B occurs when the text element's `autoResize: false` is set but the text isn't actually pre-wrapped to fit (or the wrap mismatches Excalidraw's renderer's actual wrap point).

Both bugs are *structurally* about the wrapper trying to predict the renderer's text layout. **The fix is not better prediction but eliminating the prediction entirely.**

## 13.2 The new mechanism

Excalidraw shape primitives (rectangle, ellipse, diamond, etc.) accept a `label` property:

```jsonc
{
  "type": "rectangle",
  "id": "wb-rect-001",
  "x": 240, "y": 0,
  "width": 280, "height": 120,
  "fill": "#fff3bf",                           // pastel.yellow
  "stroke": "#f59e0b",                         // primary.amber
  "strokeWidth": 2.5,
  "roundness": { "type": 3 },
  "label": {                                   // ← NEW: label lives ON the shape
    "text": "Recon Cond.\n(VGGT + Condition Net)",
    "fontSize": 16,
    "fontFamily": 5,                           // Excalifont
    "color": "#1a1614",
    "align": "center",
    "verticalAlign": "middle"
  },
  "customData": { ... }
}
```

The renderer:
- Auto-centers the label within the shape (no separate text element, no `containerId` to manage).
- Auto-wraps at the shape's interior width minus padding.
- Auto-resizes the shape to fit the label IF the agent sets `autoSize: true` on the shape (default false — agent picks size, renderer respects it).

This is Excalidraw's native "bound text" semantics, exposed at authoring time via a single nested object instead of two coupled elements. **No `containerId` to forget. No character-width approximation. No `originalText` field that has to match the wrapped `text` field.**

## 13.3 The new MCP tool

`create_labeled_shape` replaces `create_node_with_fitted_text` for new authoring:

```jsonc
// Input:
{
  "shape": "rectangle" | "ellipse" | "diamond",   // parallelogram dropped per audit ✗3
  "x": 240, "y": 0,
  "width": 280,                                // optional; renderer auto-sizes if omitted
  "height": 120,                               // optional
  "label": "Recon Cond.\n(VGGT + Condition Net)",
  "kind": "model",                             // → renderer applies palette per §3.2
  "drillable": true,                           // optional → dashed border + ⌖ glyph
  "citation": { "page": 4, "quote": "..." },   // optional → amber square top-right
  "figure_ref": { "page": 3, "figure": 1 }     // optional → embedded figure inline
}
// Output:
{
  "node_id": "wb-rect-001",
  "actual_width": 280, "actual_height": 120,
  "right_edge_x": 520, "bottom_edge_y": 120
}
```

`shape: "ellipse"` is the endpoint shape (per ✗3, replaces the prior parallelogram plan; replaces the earlier `create_endpoint_node` tool — collapsed into `create_labeled_shape` since the only differentiator was shape choice).

`shape: "ellipse"` and `shape: "diamond"` are reserved for L3 napkin cards (state-machine + decision-flow) and not used in v1.

## 13.4 Backward compatibility

The existing `create_node_with_fitted_text` stays in place as a deprecated wrapper that internally builds the same `label`-on-shape structure. Pass 2 authoring docs (the `DIAGRAM_GUIDE` constant) are updated to recommend `create_labeled_shape`. Existing scenes that round-trip via the old shape are NOT re-authored — they continue to render via the existing `containerId` text-binding path (Excalidraw still supports it natively). No persistence migration needed.

## 13.5 Standalone text — when to still use it

`label`-on-shape covers ~95% of authoring. Standalone text elements remain for:

- **Frame titles** (e.g. `Q: <excerpt>` on a chat frame, "inside Encoder ×6" on a lane outline) — these float above frames, not bound to a shape.
- **Camera transition captions** (`label` on `cameraUpdate`).
- **Annotations** the user adds manually post-authoring (free-floating notes — out of scope for the agents but supported in the file format).
- **Edge labels** (e.g. "×6", "K,V from encoder") — these live on `arrow` elements via `arrow.label`.

Anything that conceptually says "this text describes this shape" → `label` on the shape. Anything that floats independently → standalone text.

# 14. Progressive emission order — array order is z-order AND streaming order

Adopted from the sibling tool's "background → shape → label → outgoing arrow → next shape" rule. Element order in the `scene.elements` array is the streaming/draw order; Excalidraw's built-in draw-on animation runs in array order.

## 14.1 The current problem

Today's Pass 2 agent batches its tool calls by element type: all `create_node_with_fitted_text` calls first, then all `connect_nodes` calls. The resulting `scene.elements` array is `[rect, text, rect, text, ..., arrow, arrow, arrow, ...]` — rendered all at once via `api.updateScene`. There's no draw-on animation; the diagram appears as a single flash.

Two costs:
1. **Doherty-compliant but cognitive-cliff**: the user sees nothing for ~80s, then everything at once. The §11 cameras can mitigate (overview camera leads the eye), but the *initial paint* is still a wall.
2. **Wasted Excalidraw affordance**: Excalidraw natively supports element-by-element draw-on animation when `updateScene` is called incrementally. We're not using it.

## 14.2 The new order

The agent emits in **narrative order**: background zones first, then per-region (shape → its label → its outgoing arrows → next shape):

```
1. Background zones      [zone.blue (L1), zone.purple (L2), zone.peach (chat) — all opacity 30]
2. L1 shape 1 (input)    + label
3. L1 arrow 1→2
4. L1 shape 2 (process)  + label
5. L1 arrow 2→3
6. L1 shape 3 (model)    + label
7. L1 arrow 3→4
8. L1 shape 4 (process)  + label
9. L1 arrow 4→5
10. L1 shape 5 (output)  + label
11. cameraUpdate: overview → focus on shape 3 (the model node)
12. L2 expansions (when authored, repeat the per-region pattern inside their lane)
13. cameraUpdate transitions per §11
```

(With `label`-on-shape per §13, "shape + label" collapses to a single element — even cleaner.)

## 14.3 The renderer + MCP wire-up

- The MCP wrapper preserves agent tool-call order in the in-memory scene state's element array. (Already true — `state.elements.push(...)` runs in call order.)
- The renderer's `api.updateScene` is called incrementally — once per ~50 ms tick during Pass 2 streaming, with newly-arrived elements appended. Excalidraw's draw-on animation handles the rest.
- For round-tripped scenes (loaded from disk), Excalidraw renders all-at-once (no streaming animation on reload — the user expects instant when re-opening a paper). Streaming animation only on first authoring.

## 14.4 Why background-first matters

The opacity-30 zones must be drawn FIRST so they sit at the bottom of the z-order. If they were drawn last, they'd cover the content. Excalidraw's z-order = array order, so "background first" is literally an array-position rule. (Other tools handle this via separate z-index fields; Excalidraw's array-order convention is simpler and we honor it.)

## 14.5 Cited principle

Sweller's "split-attention effect" (Chandler & Sweller 1992): when the user sees content land progressively in narrative order (background → first node → its connection to next → ...), each saccade has a clear next-target. When everything appears at once, the eye has no priority signal — it picks an entry point arbitrarily, often wrong. Progressive emission gives the eye a built-in scan path.

## 14.6 Streaming modes per content type (per pass-4 audit Q10 — Doherty drillability)

Progressive emission is correct for L1 and chat, but wrong for L2 — L2's context is "user just clicked to drill" and click-responsiveness > draw-on aesthetics in that scenario. Three streaming modes:

| Content type | Mode | Why |
|---|---|---|
| **L1** | **Stream-as-drawn** (per §14.2 narrative emission) | The user has just opened the paper. They are NOT yet in "drill" mode — they're orienting themselves to the architecture. The 80s paint duration IS itself a guided narrative (background zone, then node 1, then arrow 1→2, then node 2, ...) that maps to graphic-advance-organizer theory. The user can't productively drill into nodes that don't exist yet, so render-and-pause unlocks nothing during L1 paint. |
| **L2** | **Pre-warm-then-flash** (NOT stream-as-drawn) | By the time L2 is being painted, L1 already exists; the user has been orienting and may want to drill at any moment. Pre-warm completes in the background (renders to off-screen scene state). When the user clicks L1 to drill, the L2 frame appears INSTANTLY (already painted from pre-warm) and the L2 camera engages. Click-responsiveness wins over draw-on aesthetics for the drill case. Codified as new **AC-28**: L2 frames must be fully painted before they're surfaced — partial L2 frames must not be visible. |
| **Chat** | **Stream-as-drawn** (per §10.6 Doherty contract) | User just asked a question; they want to see the answer build. Stream-as-drawn is correct because the user is *waiting for an answer* — progress visibility IS the signal. |

**The Doherty bound is therefore: L1's 80s feels acceptable** because the user is orienting (not yet in click-to-act mode) AND the camera-led narrative gives a continuous progress signal (each node landing is an ack). **Click-to-drill responsiveness is protected** for L2 (the scenario where Doherty would actually bite) by the pre-warm-then-flash mode. **Click-during-L1-paint is acceptable**: a click on a not-yet-painted L1 node has no effect (or shows a brief *"still drawing…"* caption near the cursor) — acceptable because the user can't see what isn't drawn, and the wait per node is ~16s on average within a continuous progress narrative.

This requires a per-call mode flag on the renderer's `api.updateScene` plumbing (the agent doesn't change). Three modes: `stream-as-drawn` (L1, chat), `pre-warm-then-flash` (L2). Flag is set by the caller (`runPass2L1`, `runPass2L2`, `runChat`) at IPC time; the renderer routes accordingly.

# 15. v2 sign-off (preserved as historical record; v3 needs a fresh audit)

> **v3 status banner.** This §15 is the v2 sign-off, preserved verbatim. It is *partially invalidated* by the v3 structural change: the line items below for "§2.1 lane discipline (load-bearing claim)", "§10 chat-as-diagram", "§10.2 upward chat-frame stacking", and "§10.3 chat provenance via zone-tint alone" all assumed the v2 outer canvas shape (L1 row + L2 lanes + chat zone). v3 keeps the *cognitive content* of those claims (lanes still do non-overlap inside workflow sections; chat is still cog-fatigue-reducing because the answer lives in the same workspace; chat sections are still distinguishable by tint) but the *structural location* changes (lanes are now intra-section; chat is now a section type, not a band). The v2 verdicts on visual-discipline decisions (§3 palettes, §11 cameras, §12 checkpoint, §13 labeled-shape, §14 progressive emission, AC-1 through AC-28) carry into v3 unchanged. **v3-specific re-audit asks** are listed in §19; cog-reviewer-2 is asked to re-verify the affected line items against the v3 structural shape.

**Sign-off date.** 2026-04-25 (v2 only).
**Reviewer.** cog-reviewer-2 (cognitive-psychology reviewer per `.claude/TEAMS.md`; veto authority over designs that contradict established cognition / perception research).
**Iterations.** Four audit passes (v1 broad audit + Q1–Q6 answers; v2 absorbed + 4 new pressure-tests + AC severity policy; v3 Q7–Q10 verdicts + 7 housekeeping items; v4 final reconciliation).
**Verdict (v2).** **APPROVED for implementation** of the v2-scope work. v3-scope work pending re-audit per §19.

## 15.1 Per-decision verdict table

| Section / decision | Verdict | Citation |
|---|---|---|
| §2.1 lane discipline (load-bearing claim) | ✓ APPROVED | Cowan 2001 (4±1); Sweller/Chen/Kalyuga 2010 (element interactivity) |
| §2.1 step 2 — re-pack 400 ms | ✓ APPROVED | Lisberger 2010 (smooth-pursuit ≤30°/s ceiling) |
| §2.1 step 5 — deferred widening (AC-26) | ✓ APPROVED | Yantis & Jonides 1984 (unprompted-motion attention capture) |
| §2.2 ellipse for I/O endpoints | ✓ APPROVED | Treisman 1988 (categorical-distinctness for pop-out); Excalidraw native primitive (engineering hygiene) |
| §2.3 hybrid layout (agent-order, renderer-coords) | ✓ APPROVED | Wertheimer 1923 (good continuation); Gestalt grouping |
| §2.4 orthogonal-step edge routing | ✓ APPROVED | Holsanova et al. 2008 (saccade economics on technical diagrams) |
| §2.5 tiered density: model 25w / process 18w / data 8w / endpoint label-only | ✓ APPROVED | Sweller et al. 2010 (eye-tracking ~70% structural-skeleton fixation ratio) |
| §2.6 L2-only outline (not parent + L2) | ✓ APPROVED | Palmer 1992 (common region); Palmer & Beck 2007 (connected-region collapses hierarchy) |
| §3.1 palette tokens (primary 8 + pastel 8 + zones 3) | ✓ APPROVED | Treisman & Gelade 1980 (pop-out budget); discipline preserved at ≤4 simultaneous-encoded colors per scope |
| §3.2 paper-element-kind → palette mapping | ✓ APPROVED | Mayer 2009 (multimedia / redundant encoding); Tufte 1983 (data-ink ratio) |
| §3.5 sizing minimums (120×60, 16/20pt, 4:3 cameras) | ✓ APPROVED | Foveal-acuity legibility threshold at 50cm reading distance |
| §3.6 + §11.6 scope-local channel ceiling (≤3 per scope; cameras enforce) | ✓ APPROVED with tightening | Treisman 1988 — pop-out is spatially local within ~5° fixation. **Load-bearing condition**: cameras must enforce zoom levels that hide body-density text at overview, otherwise the per-scope ceiling collapses to global. AC-19 + §11.6 enforce. |
| §10 chat-as-diagram | ✓ APPROVED | CLAUDE.md §1 cognitive-fatigue principle (answer in same workspace as question) |
| §10.2 upward chat-frame stacking | ✓ APPROVED | Siegel & White 1975, Kosslyn 1987 (spatial schemata; predictable-position beats chronological for unanchored viewports) |
| §10.3 chat provenance via zone-tint alone | ✓ APPROVED (pass-4 universal cross-zone purple) | Palmer 1992 (common region pre-attentive grouping); Treisman & Gelade 1980 (pop-out requires rare features) |
| §10.4 chat-agent grounding-bias rule (60-40-60 ratio) | ✓ APPROVED | Bartlett 1932 (schema theory); Anderson 1977 (text comprehension via reference vs introduction) |
| §11 camera/viewport orchestration | ✓ APPROVED | Holsanova on saccade economics; Doherty 1982 + Lisberger 2010 (600ms transitions in the smooth-pursuit window) |
| §11.7 Focus-Light-style soft-default tour | ⚠ APPROVED WITH NOTE | CLAUDE.md §1 behavior-change-needs-forcing-functions principle. Per-paper memory tracked in `whiteboard-chat.json::tourState`. Calibrated to match the Focus-Light ratio (visible enough that ignoring is a choice, weak enough that ignoring is free). |
| §12 checkpoint/restore (latest-only for v1) | ✓ APPROVED | YAGNI per RULES.md; lazy-migration path documented for future audit-trail UI |
| §13 labeled-shape-first | ✓ APPROVED | Cowan 2001 chunking (label-with-shape consolidates into one WM slot); schema-level fix for Bug A + Bug B |
| §14 progressive emission order | ✓ APPROVED | Sweller split-attention (Chandler & Sweller 1992); Luiten/Ames/Ackerson 1980 graphic-advance-organizer (d≈1.24) |
| §14.6 hybrid streaming modes | ⚠ APPROVED WITH NOTE | Doherty 1982 risk bounded to L1's 80s orientation phase only; L2 pre-warm-then-flash protects click-responsiveness; chat streams because user is awaiting answer |
| AC-1 through AC-28 (severity-tagged) | ✓ APPROVED | Per-AC counterexample test from pass-3; FAIL/WARN/POLICY mapping in §6 |

## 15.2 Risks the reviewer wants on the record

These are not blockers — the spec ships — but the reviewer flags them as the most likely places where the design will need to be revisited based on observed user behaviour:

1. **§3.6 / §11.6 channel ceiling depends on cameras.** If users routinely free-pan to a zoom level that simultaneously shows L1 + L2 + chat at body-density-readable scale, pop-out collapses globally and several ✗-grade violations resurface. Mitigated by camera-on-mount + camera-on-drill + camera-on-chat-mount. **Watch for**: users who immediately Esc out of the tour and free-pan; if observed >50% of sessions, revisit §11.7 calibration toward stronger soft-default.
2. **§11.7 tour engagement.** Focus-Light-style soft-default may still under-engage. If `tourState: opted-out` becomes the modal state across users, the camera-orchestration cog benefit isn't materializing. **Watch for**: telemetry on tour-completion rate per paper; <30% completion across 10+ papers is a signal to escalate the calibration (e.g. 5-second invitation, more visible "Start tour" header button).
3. **§10.4 grounding-bias 60-40-60 ratio (AC-27).** This is a heuristic threshold without empirical calibration; the actual sweet spot may be 70-30-70 or 55-45-55. **Watch for**: chat-frame quality after dogfood — if users frequently report chat answers as "feels like the agent re-rendered the paper" or "feels like the agent ignored what was already there," recalibrate the threshold and the chat-agent prompt.
4. **§3.2 `pastel.yellow` model fill collision risk.** Dropped the `pastel.orange` fallback per pass-4 ✗2a. The collision case (model + adjacent yellow-fill data) is rare-by-construction (models at row index 1-3, data at endpoints) but not impossible. **Watch for**: any rendered diagram where model + data nodes are visually adjacent and same-fill; resolve by changing the data node's fill to desaturated `pastel.teal`, not by re-introducing the `pastel.orange` model fallback.
5. **§14.6 L1 click-during-paint.** "Click on a not-yet-painted L1 node has no effect" is a Doherty-acceptable but not Doherty-optimal answer. **Watch for**: user frustration during the L1 80s phase; if observed, mitigate with a more visible "still drawing..." caption or with click-to-queue ("we'll dive into Encoder ×6 once it's drawn") rather than click-to-no-op.

## 15.3 What the reviewer did NOT review

Out of cog-reviewer scope per `.claude/skills/fathom-cog-review.md`:

- Code correctness, MCP wrapper logic, IPC plumbing — implementer's responsibility (Team B).
- Performance / latency budget for the camera-transition animation, the lane re-pack, the streaming `updateScene` tick rate — performance review domain (Team C).
- Aesthetic preference where it doesn't intersect cog-load research (e.g. exact hex tints within the pastel range, font weight nuances in Excalifont).

## 15.4 Implementation-time checks the reviewer wants performed

The cog-reviewer is signing off on the *spec*. Two checks should run during implementation to confirm the spec's claims hold in practice:

1. **A/B variants from PART E of the audit** (camera transition duration 500/700/900ms; lane gutter 60/80/100px with zones; chat zone tint peach/slate/sage; overview-camera L2-body visibility on/off). Implementer should ship at least 3 of these as runtime-toggleable to let the user pick by feel during dogfood.
2. **Anti-case AC-1 through AC-28 runtime checks** must actually fire in dev-build. Per the §6 severity policy, FAIL ACs abort scene-load with console.error; WARN ACs log diagnostic dumps. The reviewer asks the implementer to confirm at least one diagnostic test per FAIL AC and per WARN AC verifies the assertion fires when the predicate is violated, before declaring CHATDIAG-1 / LABEL-1 / CKPT-1 done.

### 15.4.a v3.2 A/B variants (per cog-reviewer-2 v3 audit PART E)

Additional A/B knobs the implementer should expose as runtime-toggleable for v3.2 dogfood:

- **E-v3-1: Cross-section edge styling.** Test (a) thin solid purple, (b) dashed purple, (c) dotted purple. Pick by visual debt at long stacks. v3.2 default = thin solid purple per §16.6.a item 3.
- **E-v3-2: Section header height.** Test 60px / 80px / 100px. v3.2 default = 80px per §16.2 (title 28 + subtitle 18 + padding 34). Smaller may free more vertical real estate at the cost of header readability.
- **E-v3-3: Provenance tint opacity.** v3.2 picks opacity 12 (down from v2's 30). Test 8 / 12 / 20 / 30 — find the sweet spot where provenance is distinguishable but non-distracting.
- **E-v3-4: Drill backlink button position.** Test (a) section header top-left (v3.2 default per §16.6.a item 2), (b) floating button to the left of the section, (c) keyboard shortcut only (no visible button). Per Q-v3.1-3 mitigation. Default = (a) on the cog argument that visible backlink composes with the camera tour better than keyboard-only.
- **E-v3-5: sizeWeight dominant multiplier.** v3.2 picks 1.5× per §17.2.1.a; cog-reviewer-2's pass-1 v3 audit Q-v3.2-1 question asks "should it be 2×?" Implementer ships both with a runtime toggle so we can compare against the example image's apparent ratio.

—

# 16. Narrative sections (v3 outermost structure)

Added 2026-04-25 per team-lead brief and the example image at `/Users/ashrya/.claude/image-cache/bea285c3-7422-4595-a668-2b7b9fa2b858/5.png`. The whiteboard is now organised top-to-bottom as a vertical stack of *narrative sections*, each section being a self-contained explanation. The agent composes each section's content freely from the §17 primitives — sections give us vertical-flow + camera-anchor + eviction structure; the *content* is the agent's call.

## 16.1 The shape

A whiteboard = `[section, section, section, ..., chat_section, chat_section, ...]`. Each section is an Excalidraw `frame` element with `customData.fathomKind: 'wb-section'` carrying:

```jsonc
{
  "type": "frame",
  "id": "wb-section-001",
  "x": 0, "y": 0,
  "width": 1600, "height": 720,                  // height computed from content
  "name": "1. Three things go in, one tensor comes out",   // shown as the title bar
  "customData": {
    "fathomKind": "wb-section",
    "sectionNumber": 1,                          // 1-indexed; visible in the title
    "subtitle": "Forward pass of a flow-matching DiT",
    "provenance": "paper" | "drill" | "chat",    // see §16.3
    "drilledFrom"?: "wb-rect-..." | null,        // if provenance=drill, which node spawned this
    "spawnedByQuestion"?: "<full literal Q>" | null,  // if provenance=chat
    "compositionHint"?: "workflow" | "math" | "timeline" | "free" | "<other agent-chosen tag>"  // OPTIONAL descriptive hint, NOT enforced; useful for telemetry + camera-orchestration heuristics
  }
}
```

Sections stack at `y = previous_section.y + previous_section.height + 80px` (the inter-section gap is 80px — one full vertical "breath" between sections, matching v2 §2.6's L1→L2 gap rationale).

## 16.2 Section header

Each section renders with a title bar at the top:

- **Number + title** in Excalifont, 24px, color `#1a1614`, left-aligned. Format: `"<n>. <title>"` (e.g. *"1. Three things go in, one tensor comes out"*).
- **Subtitle** in system sans, 13px, color `#5a4a3a`, left-aligned, line below the title. Optional — only if the agent supplies one.
- **Provenance glyph** at the right edge of the title bar:
  - `paper` → no glyph (default visual; paper-derived is the baseline).
  - `drill` → small `↳` glyph in `primary.purple` 12px, plus a thin line connecting back up to the spawning section's drilled node (cross-section edge, dashed purple per v2 §3.3 universal cross-zone idiom — now renamed "cross-section idiom" but the visual contract is identical).
  - `chat` → small `Q` glyph in 12px Excalifont, color `#5a4a3a`, plus a `Q: <question excerpt up to 80 chars>` caption below the title (replaces the v2 chat-frame `Q:` title; the question literally goes here).

The header bar height is 80px (title 28 + subtitle 18 + padding 34). Section content starts at `y = section.y + 80`.

## 16.3 Three section provenances

| Provenance | Authored by | Trigger |
|---|---|---|
| `paper` | Pass 2 agent (one or more sections per paper, authored at first whiteboard open) | New paper opens; Pass 1 understanding doc → Pass 2 emits N sections |
| `drill` | Drill agent (a focused Pass 2 call scoped to one node) | User clicks a `drillable: true` node; a new section appends below the bottom of the stack with the drill-target as its primary subject |
| `chat` | Chat agent (one section per question) | User submits a side-chat question; new section appends below the bottom of the stack |

All three provenances **append to the bottom of the section stack** in chronological order. The stack reads top-to-bottom as the user's reading + interaction history. This is **the single biggest unification move** v3 makes: drilling and chatting now both look identical at the canvas-shape level — both append a new section below. The user's mental model is "everything I've explored becomes a new section beneath what came before," which composes cleanly with the recursion grammar (CLAUDE.md §2.1) — drilling at any depth uses the same gesture, the same persistence, and the same outermost layout primitive.

**Why bottom-append instead of insert-near-source?** Considered and rejected. Insert-near-source would put a drill-spawned section right below the section that contained the drilled node, shifting later sections down. This (a) destroys the user's spatial map of later sections every time they drill (Sweller element-interactivity violation per v2 §2.1), and (b) makes "where will the new section appear?" unpredictable. Bottom-append gives a stable rule: new content always appears at the bottom, and the cross-section edge (purple dashed) shows the spatial back-reference. The cross-section edge does the relational work; the spatial location does the chronological-history work.

## 16.4 Section width discipline

All sections share the **same x range** and a **consistent left edge at `x = 0`**. Width is computed from the modality but capped at a paper-wide `MAX_SECTION_WIDTH = 1800px` (allows comfortable reading on standard 1920×1080 viewports without horizontal panning). Modalities that don't need full width (math callout, key idea callout) center their content within the section's x range.

This shared-left-edge is a Tufte small-multiples principle: a stack of objects with a shared baseline reads as "members of one collection" pre-attentively, freeing the eye to focus on the differences between them rather than re-deriving the alignment per section.

## 16.5 Section count discipline (Cowan ceiling, applied at section scope)

A single whiteboard should not exceed **9 sections** (3 paper-sections + ~6 drill/chat sections expected as a typical session) before triggering the eviction policy from v2 §10.5 (which now applies to chat AND drill sections, not just chat frames). The exact policy:

- **Most recent N=8 sections stay fully expanded.**
- **Older sections auto-collapse** to a 60px-tall stub showing only the section number + title (no content visible), per v2 §10.5's chat collapse mechanism — extended to all section types.
- **Collapsed-stub format** (per cog-reviewer-2 v3 audit Q-v3-3 refinement): the stub shows the section's `name` field literally, plus the agent-authored subtitle if present. **No icon** for "what kind of content lives here" — instead, the agent's section title + subtitle do that work in plain English (`"1. Three things go in, one tensor comes out — workflow"` or `"2. The Euler step — equation"`). Per CLAUDE.md §11 minor principles: persistent state changes (collapsed-section provenance/composition signal) get plain English, not glyphs — the inverse rule of the visual-indicator-for-transient-UI principle. The agent doesn't have to consciously emit a "modality" tag for the collapsed-stub label to be informative; whatever they wrote as the section subtitle becomes the collapsed signal.
- **User can re-expand any collapsed section** by clicking its stub (200ms expansion animation).
- **User can manually pin any section** (per cog-reviewer-2 v3 audit Q-v3-7 refinement): a small pin icon in the section header (16px, top-right of the title bar) toggles `customData.pinned: boolean`. Pinned sections are exempt from auto-collapse regardless of provenance. Combined eviction rule: `pinnedByDefault = (provenance === 'paper') || customData.pinned`. Most recent N=8 of (unpinned-AND-non-paper) sections stay expanded; older unpinned-non-paper sections collapse first; pinned + paper sections never auto-collapse.
- **Cross-section edges from collapsed sections** render as a faint vertical line from the collapsed stub up to the referenced earlier section's anchor node (truncated hint).
- **Persistence**: collapse state per section persists in `whiteboard.excalidraw` via `customData.collapsed: boolean` on the section frame element. Pin state via `customData.pinned: boolean`.

The Cowan ceiling here is justified at the *section-scope* per v2 §3.6's per-scope-channel rule: a user reading the whiteboard treats each section as a chunk; 9 chunks is the working-memory ceiling for "scenes I'm holding in mind across the conversation." 8 expanded + collapse-rest mirrors v2 §10.5's chat-frame discipline, scaled up from "frames in a band" to "sections in a stack."

## 16.6 Drilling appends a new section (not a sub-lane)

This is the single most consequential v3 change relative to v2. **Drilling no longer expands the L2 lane below the parent in the same workflow section.** Instead:

1. User clicks a `drillable: true` node in any section (call it section K, drillable node = node D).
2. A new section appends at the bottom of the stack: `customData.provenance: 'drill'`, `customData.drilledFrom: D.id`, title = D.label, subtitle = D's role description.
3. The drill agent (a focused Pass 2 call) composes the section's content from §17's primitives, picking whichever composition pattern matches D's nature (workflow primitives if D is a sub-pipeline; a `create_callout_box` with equation text if D is a definition; ellipses-on-an-axis if D is an interpolation; etc. — composition is the agent's call per §17.5 soft authoring guidelines). **Note**: a drill doesn't *have* to produce a new section — the agent may instead append a callout to the existing section K (when the drill target is a small clarification rather than a full sub-explanation), or inline a number line into K's content area. Bottom-append is the *default* behavior; the drill agent has compositional freedom per the user's "agent freedom" brief. When a new section IS produced, this §16.6 process applies; when an inline expansion is more apt, the drill agent uses §17 primitives directly within K.
4. A cross-section edge (purple dashed orthogonal — universal cross-section idiom) is drawn from the new section's title bar UP to D in section K. The user can follow it visually to remember where they came from.
5. The camera (§11) auto-pans to the new section.

### 16.6.a Cross-section edge tangling mitigation (v3.2 — per cog-reviewer-2 audit Q-v3-4 ⚠)

cog-reviewer-2's pass-1 v3 audit flagged a real risk: when the drill section sits 6 sections below the source, the cross-section edge crosses 5 other section title bars (or routes orthogonally around them, producing a tangled elbow path). Multiple drill-edges accumulate visual debt at saccade-economic cost (Holsanova 2008). v3.2 mitigates with three composing layers:

1. **Camera composition** (already in v2 §11). When the user clicks a drillable node, the camera auto-pans to the new drill section per §16.6 step 5. The user does NOT see the long cross-section edge during the camera transition or when camera-focused on the drill section. The edge is only visible when the user free-pans to a spatial-overview zoom level — a deliberate user action where they're asking "show me how the canvas is structured." Bounded visual-debt cost.

2. **Backlink button in the drill section header** (NEW in v3.2). Every drill section's header carries a small `← parent` button (top-left of the title bar, 12px Excalifont, color `#5a4a3a`, with hover-tooltip *"back to <parent_section_title>"*). Click → camera animates to the parent section. This makes the cross-section edge an *aesthetic* visual back-reference; the *functional* back-navigation is button-driven and doesn't require the user to trace the edge visually. Composes with §11.7's Focus-Light tour: a backlink press exits tour-mode and directly cameras the user.

3. **Cross-section edge styling** (v3.2 A/B variants — see §15.4 implementation-time check E-v3-1): the edge defaults to thin solid purple (`primary.purple #8b5cf6`, 1px, solid, orthogonal-routed). v3.2 ships with this default; the implementer ships A/B variants (dashed, dotted) to dogfood. Solid is picked as the default because it reads as a stable "canonical link" rather than a hover-state dashed-flicker.

**Telemetry-driven escalation** (per §19.7 implementation-time check #5): if the median y-distance between drill-source and drill-section exceeds 2000px in observed sessions, the cross-section edge length erodes the cog link beyond what the camera + backlink can compensate for. In that case, revisit the bottom-append rule — possibly switch to insert-near-source (despite v3.1's rejection of that alternative on Sweller-element-interactivity grounds). The rejection was correct *for short stacks*; it's possibly wrong for long stacks. Don't preemptively switch — wait for the data.

**Why this is better than v2's L2 lane.** v2's L2 lanes were structurally constrained — every drill produced a 3–5 node workflow. The example image and the user's brief make clear this is wrong: drilling into "what is the velocity v_theta" should produce a number-line-style composition, not a 5-node workflow. v3.1 unties drilling from "produces a workflow"; the drill agent composes whatever shape fits the drill target. This restores the cog-fatigue-reduction principle: explanations have the cognitive shape that matches the concept (CLAUDE.md §1).

**Recursion preserved.** A drilled section may itself contain drillable nodes; clicking one appends *another* section to the stack (or inlines content per the §16.6 step-3 alternative). There is no maximum depth at the rendering level (eviction kicks in after N=8 expanded). Visually, every drill at every depth produces a new bottom-of-stack section + backlink button + camera pan; the cross-section edge shows the visual back-reference. CLAUDE.md §2.1 satisfied.

## 16.7 Chat is also a section (no dedicated band)

The v2 dedicated chat band is **dissolved** in v3. Chat sections are just sections with `provenance: 'chat'` — they live in the same vertical stack as paper-derived and drill-derived sections, in chronological order.

**Why dissolve the chat band.** v2's band was a separate y-region (peach tint) with its own stacking direction (upward) and its own eviction policy. It worked but introduced two distinct mental models for "where does new content go?" (drill: under parent's lane; chat: at top of band below the L1+L2 grid). v3's section stack collapses both into one model: new content always goes at the bottom of the stack, regardless of provenance. Provenance is communicated by the section header's glyph + subtle background tint, not by the section's spatial location.

**Section background tint by provenance** (replaces v2's per-zone tinting):

| Provenance | Section background tint | Notes |
|---|---|---|
| `paper` | `#fcfaf5` (very faint cream — matches the paper's "background paper" aesthetic; almost imperceptible) | Default for all paper-derived sections |
| `drill` | `#f5f1ff` (very faint lavender — distantly related to v2's `zone.purple` for L2 expansions, but lighter) | Drill-derived sections; the user has actively requested this |
| `chat` | `#fdf5e8` (very faint warm peach — preserves the v2 `zone.peach` reference but at much lower opacity since it's now per-section, not a full band) | User-question-derived sections |

Tints are at **opacity 12** (down from v2's opacity 30 zones) because the section header's glyph + format already does most of the provenance work; the tint is a soft-secondary cue, not the primary signal. Treisman & Gelade 1980: when one channel (header glyph) is high-contrast, secondary channels (tint) can be very faint and still register at scope-local fixation. Tufte data-ink: the lower the tint contrast, the less the tint competes with content inside the section.

## 16.8 What v3 keeps from v2's chat-band design

Per the brief: most of v2 §10 still applies, just relocated.

- **Cross-section edges** (formerly cross-zone): universal idiom = purple dashed orthogonal. Connects chat-section nodes UP to anchor nodes in earlier paper/drill sections. (v2 §3.3, §10.3 carried forward.)
- **Doherty contract**: when the user submits a chat question, a placeholder section appears within 50ms at the bottom of the stack (caption *"Drawing answer…"*). The first node lands within ~5s. Full section authored within ~15–25s. (v2 §10.6 carried forward, retitled section-not-frame.)
- **Grounding-bias rule** (60-40-60 ratio): the chat agent must decide grounding-vs-extension before authoring. ≥60% novel labels = "introducing" mode (correct for absent-subject questions). ≥60% reused labels via cross-section edges = "referencing" mode (correct for present-subject questions). 40-60% mixed = re-think before authoring. (v2 §10.4 + AC-27 carried forward.)
- **Eviction policy** (8 expanded + collapse-rest): see §16.5 above. Generalised from chat-only to all section types.
- **Persistence**: chat sections are additional Excalidraw `frame` elements in the same `whiteboard.excalidraw` file. The chat conversation history (questions + section IDs) lives in `whiteboard-chat.json`. (v2 §10.8 carried forward.)

## 16.9 What v3 changes about chat

- **No dedicated band**. Chat sections live in the section stack, distinguished by provenance not by y-region.
- **Composition is per-question**. The chat agent composes its answer freely from the §17 primitives — workflow-style for "how does X work," callout-style for "what is the equation for Y," number-line-style for "where is Z between extremes," etc. v2 implicitly assumed every chat answer was a workflow; v3.1 lets the chat agent compose whatever fits.
- **Title is `Q: <excerpt>` in the section header**. v2's `Q:` was a frame-title above the chat-frame; v3 makes it the section subtitle, integrated with the section's normal header format.
- **Stacking direction**. v3.1's bottom-append is downward. v2's chat-band was upward-anchored. The reason for v2's upward stacking (predictable y-position; user-doesn't-have-to-scroll) is now achieved by the section *number* — the user knows the latest section is always the highest-numbered, and the camera auto-pans to it. The y-position changes per session, but the camera pan masks the difference. (Pressure-test note for cog-reviewer-2: is bottom-append-with-camera-pan equivalent in cog cost to v2's upward-stacking-with-stable-y? The upward-stacking-anchored argument was Siegel & White 1975 spatial schemata; bottom-append-camera-pan replaces "stable y" with "stable temporal-recency-rule + camera-driven attention" — defensible but worth re-checking. Not a separately numbered audit ask in §19; folded into Q-v3.1-2 recursion-grammar verdict.)

# 17. Authoring primitives + soft guidelines (replaces v3-draft-1's modality decision tree)

The agent gets **6 primitives + 1 auxiliary** and **soft authoring guidelines** as prompt guidance. There are no enforced modalities, no decision tree the agent must obey, no specialised tools per visualization shape. The agent composes everything from primitives, sees the result via `look_at_scene`, and iterates. The two programmatic guarantees (§17.4) keep the worst failure modes off the table; the visual self-loop catches everything else.

## 17.1 Design philosophy

Verbatim from the user (per the team-lead's softening brief): *"a very lucid interplay of how people explain on whiteboards … you want that agent to be freely able to do anything on the whiteboard that it wants, without over-constraining it."*

The v3-draft-1 spec baked seven specialised modalities (workflow / math_callout / number_line / time_chain / hatched_distribution / annotation_paragraph / key_idea_callout) as separate MCP tool primitives. This was over-engineering — the agent doesn't need a `create_number_line` tool because a number line is just an axis arrow + two endpoint shapes + labels, all expressible via the 6 primitives. Building seven specialised tools would (a) constrain the agent to the seven shapes we predicted, (b) require ~600 LoC of per-modality renderers, (c) make adding an eighth shape (Sankey diagram, bar chart, tree, free-form annotation cluster) require a new MCP tool. The minimal-primitives approach is **expressively complete** (the agent can compose any 2D visual the user might want) and **dramatically cheaper to ship**.

The cog-fatigue principle (CLAUDE.md §1) is still served: distinct visualization shapes per section still produce categorical pop-out at the section-stack level (Treisman 1988) — but the *vocabulary* of shapes is the agent's choice, not a fixed seven. The agent might use a number-line-style composition for one paper, a tree-style composition for another, a free-form sketch + annotation for a third. The user's eye recognises the shape from rendered geometry, not from a customData modality tag.

The trade-off this spec stakes: agent-side composition complexity is closed by the visual self-loop (`look_at_scene`) — the agent tries, sees, iterates. Same loop a human would use to draft on a whiteboard. **§19 audit ask**: is this trade defensible?

## 17.2 The 6 primitives + 1 auxiliary

### 17.2.1 `create_labeled_shape`

Primary primitive for any text-in-a-container element. Excalidraw's native `label` field guarantees text fits.

```jsonc
{
  "shape": "rectangle" | "ellipse" | "diamond",
  "x": 240, "y": 0,
  "width": 280,                                // optional; renderer auto-sizes from sizeWeight if omitted
  "height": 120,                               // optional
  "sizeWeight": "dominant" | "standard" | "subordinate",  // v3.2 — see §17.2.1.a below; drives SIZE-based hierarchy
  "label": {
    "text": "DiT Backbone\n(× N blocks)",
    "fontSize": 16                             // default 16; renderer auto-fits if text overflows
  },
  "fill": "#d0bfff",                           // pastel — agent picks per role (§18)
  "stroke": "#8b5cf6",                         // primary — agent picks per role (§18)
  "strokeWidth": 1.5,
  "strokeStyle": "solid" | "dashed",           // dashed = drillable
  "fillStyle": "solid" | "hachure" | "cross-hatch",  // hachure = hatched probability distribution
  "roundness": { "type": 3 } | null,           // null for ellipse
  "customData": {
    "fathomKind": "wb-shape",
    "role": "data" | "compute" | "output" | "math" | "noise" | "neutral",
    "kind"?: "input" | "output" | "process" | "model" | "data",   // optional v2 kind tag (drives stroke per §18.3)
    "drillable"?: boolean,
    "citation"?: { "page": 4, "quote": "..." }
  }
}
```

**Returns**: `{ node_id, actual_width, actual_height, right_edge_x, bottom_edge_y }`.

This is the only primitive for text-in-a-container. Endpoints (input/output) use `shape: 'ellipse'`. Process/model nodes use `shape: 'rectangle'`. Hatched probability distributions use `shape: 'ellipse'` + `fillStyle: 'hachure'`. The v2 `create_node_with_fitted_text` shim is deprecated; new authoring uses `create_labeled_shape`.

#### 17.2.1.a `sizeWeight` — discrete hierarchy via SIZE (v3.2 addition)

Per whiteboard-impl's read of the example image: hierarchy in the example is carried by SIZE, not by kind tag (the DiT Backbone is the largest box because it's the main thing being explained, not because it's tagged `kind: model`). v3.2 adds `sizeWeight` as a first-class authoring parameter to make this hierarchy axis explicit and discrete.

**Three values**:

| Value | Width multiplier | Height multiplier | Use |
|---|---|---|---|
| `dominant` | 1.5× | 1.4× | The single most important element in a section. The DiT Backbone in Section 1 of the example. The model output box in Section 1 of ReconViaGen. **Maximum 1 per workflow-style section** (AC-36) — multiple dominants = no dominants, perceptually. |
| `standard` (default) | 1.0× | 1.0× | The default. Sibling components at equal structural rank — process boxes, intermediate stages, embed/projection nodes. The visual majority of the canvas. |
| `subordinate` | 0.7× | 0.7× | Supporting context, scalar inputs, "details" nodes the user CAN read but isn't expected to focus on. The `t timestep in [0,1]` peach box in Section 1 of the example would be `subordinate` (smaller than the cond image features box because cond is what changes per generation; t is just a control scalar). |

Multipliers apply to the renderer-default base size (`NODE_BASE_WIDTH = 200`, `NODE_BASE_HEIGHT = 100`). If the agent passes explicit `width` / `height`, they override the multiplier. If the agent omits both, the renderer computes from sizeWeight + label-fit constraints.

**Why discrete (3 values) not continuous**: Cleveland & McGill 1984 show that continuous size variation requires the user to *judge relative magnitude* (slow, fixation-required) whereas categorical size variation produces pre-attentive pop-out (fast, parafovea-readable). 1.5× / 1.0× / 0.7× sits at the categorical-distinct ratio (Cleveland & McGill's "judgement-of-relative-magnitude threshold" is ~50%; our dominant-vs-standard ratio is 50% → above threshold → categorical). 3 values also avoids continuous-tuning thrash from the agent (which size do I pick? → just 3 options).

**Composes with kind+role palette resolution (§18.3)**, doesn't replace it. Kind still drives stroke (heavy amber for `kind: model`); role still drives fill (purple for `role: compute`). sizeWeight is a third orthogonal channel that drives WIDTH × HEIGHT. A node can be `kind: model` + `role: compute` + `sizeWeight: dominant` (the DiT Backbone — heavy stroke, purple fill, bigger). It can also be `kind: process` + `role: data` + `sizeWeight: subordinate` (a small scalar context input). The three axes encode three orthogonal pieces of information; each contributes one perceptual channel per AC-12 accounting (sizeWeight counts as ONE channel; multipliers are co-varied with no independent sub-channel).

**Soft guideline for the agent** (added to §17.5):

> *"Pick `sizeWeight` per element to communicate hierarchy. The single most important element of the section is `dominant` (1.5× larger). Sibling components are `standard` (default, 1.0×). Supporting context elements are `subordinate` (0.7× smaller). Maximum 1 dominant per section — if you have two equally-important elements, both should be `standard` (let the user infer equal weight from sibling-equality, not from co-dominance)."*

### 17.2.2 `create_text`

Free-floating text. NO container. For annotations, captions, math equations, narrative paragraphs, KEY IDEA text, axis labels on agent-composed number lines, anything that isn't text-bound-to-a-shape.

```jsonc
{
  "text": "The network maps (x_t, t, cond) to a tensor of the SAME SHAPE as x_t.",
  "x": 100, "y": 580,
  "width": 800,                                // wraps at this width; height auto-computed
  "fontSize": 13,
  "fontFamily": 5,                             // 5 = Excalifont (default); 1 = Helvetica; 2 = JetBrains Mono (for equations)
  "color": "#1a1614",
  "align": "left" | "center" | "right",
  "fontStyle"?: "normal" | "italic",
  "lineHeight": 1.5,                           // default 1.25; 1.5 for prose
  "customData": {
    "fathomKind": "wb-text",
    "purpose": "annotation" | "caption" | "equation" | "axisLabel" | "narrative" | "title"  // optional, for AC checks + camera grouping
  }
}
```

**Returns**: `{ text_id, actual_width, actual_height, right_edge_x, bottom_edge_y }`.

`fontFamily: 2` (monospace) is reserved for equations — Excalifont's hand-drawn variable-width spacing breaks math glyph alignment (parens don't line up, subscripts shift). Use Excalifont for prose, monospace for equations. The agent picks per `purpose`.

### 17.2.3 `create_callout_box`

Convenience: a tinted background rectangle behind multi-line text. Saves the agent from picking coords for both rectangle + text (and from doing the math to keep them aligned). Used for math callouts, KEY IDEA callouts, WATCH OUT callouts, anything that wants emphasis without containment-of-bound-text.

```jsonc
{
  "lines": ["dx_t/dt = x_0 - x_1", "v* = x_0 - x_1"],   // an array of strings; one per line
  "x": 100, "y": 800,
  "width": 800,                                          // height auto-computed from line count
  "fillColor": "yellow" | "blue" | "green" | "red" | "neutral",  // role-driven per §18
  "strokeColor"?: "amber" | "blue" | "green" | "red",   // optional; defaults to matching primary tier
  "strokeWidth": 1.0,                                    // light — the box is a frame, not emphasis
  "fontSize": 14,
  "fontFamily": 2,                                       // default monospace for equations
  "label"?: "KEY IDEA" | "WATCH OUT" | "CONCEPT" | null,  // optional uppercase label at top-left
  "alignment": "left" | "center"                          // default left
}
```

**Returns**: `{ callout_id, actual_width, actual_height, right_edge_x, bottom_edge_y }`.

Internally: a `roundness: { type: 3 }` rectangle with the role-pastel fill + role-primary stroke, plus a `create_text` overlapping it with the same coords + padding. The wrapper handles co-positioning so the agent can't get them out of sync.

### 17.2.4 `create_background_zone`

Opacity-tinted grouping rectangle, optionally with a labeled header. Two distinct uses, both via the same primitive (per whiteboard-impl's read of the example image — INPUTS / EMBED / PROJECT zones in Section 1 are intra-section grouping, the chat-section peach tint is section-provenance).

```jsonc
{
  "x": 60, "y": 200,
  "width": 800, "height": 240,
  "fillColor": "#dbe4ff",                      // zone tint per §3.1 + §16.7
  "opacity": 30,                               // default 30 for intra-section grouping; 12 for section-provenance per §16.7
  "label"?: "INPUTS",                          // OPTIONAL header label (see typography rules below)
  "labelPosition"?: "top-left" | "top-center", // default top-left
  "strokeStyle": "none" | "solid" | "dashed",  // default 'none' — pure tint
  "customData": {
    "fathomKind": "wb-zone",
    "purpose": "sub-zone" | "section-provenance"   // sub-zone = intra-section grouping; section-provenance = section background tint
  }
}
```

**Returns**: `{ zone_id }`.

Background zones MUST be emitted before any content elements that overlap them (per v2 §14 progressive emission — array order = z-order; zones first or they cover content).

#### 17.2.4.a Two distinct use modes

**Mode 1 — Intra-section grouping zone (the example's INPUTS / EMBED / PROJECT)**:
- `purpose: 'sub-zone'`, `opacity: 30`, `label` is REQUIRED (the zone's whole point is to name a group).
- Use case: a workflow-style section has parallel sub-zones for parallel pipeline lanes (input encoders feeding a common compute backbone). The labeled zone tells the user pre-attentively "these elements belong together AND this group is named X."
- Stroke: `'none'` (no border) — the tinted fill + label do all the work; a border would compete with the inner shapes' borders.
- Sizing: zone bbox extends 60px above + 60px below the contained elements (per v2 §3.5 background-zone vertical padding).

**Mode 2 — Section-provenance tint (the chat-section faint peach background per §16.7)**:
- `purpose: 'section-provenance'`, `opacity: 12` (much fainter — secondary cue, not primary signal), `label` is OMITTED (the section header glyph + provenance tag carry the provenance signal).
- Use case: each section automatically gets a faint provenance tint laid down by the renderer (cream for paper, lavender for drill, peach for chat per §16.7). The agent doesn't author these directly — the renderer auto-emits them when `create_section` is called with `provenance: paper|drill|chat`.
- Stroke: `'none'` always.

#### 17.2.4.b Label typography rules (sub-zone mode)

When `label` is set:
- **Font**: Excalifont (`fontFamily: 5`) 11px, **uppercase tracking** (`letter-spacing: 0.08em`).
- **Color**: `#5a4a3a` (warm gray, ~70% contrast on cream).
- **Position**: top-left, inset 8px from the zone's top-left corner (per `labelPosition: top-left` default).
- **Background plate**: a small white rectangle 4px-padded around the label text, opacity 90, so the label reads against the tinted zone fill without low-contrast loss.

The whiteboard-impl read of the example flagged that the INPUTS / EMBED / PROJECT labels read as "category headers" — uppercase + tracked + small + warm-gray-on-tinted is the typographic idiom for "this is a section heading inside a larger composition" (Bringhurst's *Elements of Typographic Style*; design-system convention).

### 17.2.5 `connect`

Edge between any two elements (boxes, text, ellipses, anything with bounds). Renderer routes orthogonally and avoids crossings if possible per v2 §2.4.

```jsonc
{
  "from_id": "wb-shape-001",
  "to_id": "wb-shape-002",
  "label"?: "tokens",                          // optional edge label
  "labelFontSize": 11,
  "strokeColor": "#4a9eed",                    // primary.blue default; primary.purple for cross-section
  "strokeStyle": "solid" | "dashed" | "dotted",
  "strokeWidth": 1.5,
  "endArrowhead": "arrow" | "triangle" | "circle" | "none",
  "startArrowhead"?: "arrow" | "none",
  "routing": "auto" | "straight" | "orthogonal",  // auto = straight if no crossing, else orthogonal
  "customData": {
    "fathomKind": "wb-edge",
    "purpose": "in-section" | "cross-section"
  }
}
```

**Returns**: `{ edge_id }`.

The renderer applies orthogonal routing automatically when `routing: 'auto'` and a straight line would cross a shape's bbox. For cross-section edges (drill linkage; chat → paper reference), the agent passes `strokeColor: '#8b5cf6'`, `strokeStyle: 'dashed'`, `routing: 'orthogonal'` per v2 §3.3 universal cross-zone idiom.

### 17.2.6 `set_camera`

Viewport hint per v2 §11. Each section emits at least one `set_camera` (a focus camera for that section); the agent emits additional per-element cameras when a section is rich enough to need them.

```jsonc
{
  "x": 0, "y": 0,
  "width": 1600, "height": 900,                // bbox the camera should frame
  "aspectHint": "1600x1200",                   // 4:3 content guide; renderer adjusts to viewport ratio per v2 §11.3
  "duration": 600,                             // ms — animated pan
  "label"?: "Section 1: architecture overview",  // optional caption shown briefly during transition
  "customData": {
    "fathomKind": "wb-camera",
    "stepIndex": 1,
    "totalSteps": 6
  }
}
```

**Returns**: `{ camera_id }`.

Cameras are pseudo-elements stripped from the rendered scene per v2 §11.1. The renderer builds an ordered tour from `stepIndex`; ←/→ steps through; Esc free-pans. Soft-default tour engagement per v2 §11.7 unchanged.

### 17.2.7 `create_image` (auxiliary; the v3.1 push-back to the team-lead's brief)

Embed a figure from the paper's sidecar (`<sidecar>/figures/page-N-fig-K.png`). Without this, the agent can't ground in the paper's actual figures, which are the user's anchor.

```jsonc
{
  "src": "<sidecar>/figures/page-3-fig-1.png",
  "x": 240, "y": 100,
  "width": 320,                                // height computed from aspect ratio
  "caption"?: "Fig 1 (p. 3): RVC architecture",  // optional caption rendered below image as create_text
  "captionFontSize": 11,
  "customData": {
    "fathomKind": "wb-image",
    "page": 3,
    "figure": 1
  }
}
```

**Returns**: `{ image_id, actual_width, actual_height }`.

**Why this is in the spec despite team-lead's brief omitting it**: the example image's Section 1 INPUTS zone has three colored input boxes whose content (`x_t noisy latent`, `t timestep in [0,1]`, `cond image features`) is text. But many papers put a *real visual artifact* in the input position — a sample image, a tensor visualization, a graph plot. Without `create_image`, the agent has to compose those from primitives (which doesn't work for raster figures). The cog payoff of letting the agent embed actual paper figures (the user's spatial-memory anchor) is high; the LoC cost is low (~40 LoC: load image from sidecar, embed as Excalidraw `image` element). Push-back accepted or rejected, this stays in the spec for cog-reviewer-2 to verdict.

## 17.3 The deprecated v2 primitives

For back-compat:

- `create_node_with_fitted_text` — kept as a thin shim that internally calls `create_labeled_shape`. Existing in-flight call sites continue to work.
- `connect_nodes` — kept as a thin shim that internally calls `connect`. Same back-compat.
- `connect_cross_zone` — kept as a thin shim that calls `connect` with cross-section defaults (`primary.purple` dashed orthogonal).
- `create_section` — adopted as a v3.1 primitive (newly built on top of the above; not in v2). Mounts a section frame at the bottom of the stack with title + subtitle + provenance metadata per §16.1.
- `restore_checkpoint` (v2 §12) — unchanged. Always called as the first tool call in any L2 / drill / chat authoring pass.
- `look_at_scene` (VLOOP-1, v2 §12.5 reference) — unchanged. The visual self-loop entry point.
- `describe_scene`, `export_scene` — unchanged.

**Total v3.1 MCP tool inventory**: 6 v3.1 primitives + 1 v3.1 auxiliary + 1 v3.1 newly-built section primitive (`create_section`) + 4 deprecated v2 shims + 4 universal utilities (`restore_checkpoint`, `look_at_scene`, `describe_scene`, `export_scene`) = **8 active primitives** + **4 deprecated shims** + **4 utilities** = 16 total tools. v3-draft-1 had 18 (12 active + 4 shims + 2 utilities); v3.1 dropped 6 specialised modality tools, added 1 auxiliary (`create_image`) and 1 section primitive (`create_section`), netting -4 active tools relative to v3-draft-1.

## 17.4 The two programmatic guarantees

> **Numbering note** (per cog-reviewer-2 v3 audit pass-2 ✗1): v2 AC-1 is "Two L2 frames overlap" and v2 AC-2 is "An edge crosses any node that is not its endpoint" — both occupied. v3.2's AC-36/AC-37/AC-38 are also taken (sizeWeight + zone-non-overlap). The two v3.1 user-cited programmatic guarantees take the next available numbers: **AC-39** (text-in-shape no-overflow, the user's explicitly-cited bug-fix guarantee) and **AC-40** (shape non-overlap, generalised from v2 AC-1 to all `create_labeled_shape` outputs not just L2 frames). The §6 severity table reflects this. cog-reviewer-2's pass-2 ✗3 (AC-37 cross-section title-crossing) is already in spec as **AC-33** — same predicate, different number; no fresh AC needed.

### 17.4.1 AC-39: text-in-shape doesn't overflow (FAIL)

When the agent emits a `create_labeled_shape` with a `label.text`, the rendered text MUST fit inside the shape's bounds. Excalidraw's native `label` field auto-fits + auto-wraps; AC-39 verifies post-render that no `label`-bound text geometry exceeds its container's interior bbox (after padding).

**Implementation**: post-render, for each shape with a `label`, measure the rendered text bbox via the canvas's `measureText` API; if `text_bbox.width > shape.width - 2 * padding` OR `text_bbox.height > shape.height - 2 * padding`, fire `console.error` + dump the diagnostic, abort scene-load. The padding is 8px per side per v2's existing convention.

**Why FAIL not WARN**: text overflow is the bug the user explicitly cited as needing a programmatic fix. There is no defensible counterexample — text outside its container is always wrong.

### 17.4.2 AC-40: no two declared shapes overlap (FAIL — generalises v2 AC-1)

For every pair of `create_labeled_shape` outputs, assert their bboxes don't overlap (with the v2 lane-gutter rules absorbed: 60px gap inside background zones, 100px gap outside). Free text (`create_text`) and arrows (`connect`) can sit anywhere; **shapes** cannot collide.

**Generalisation note**: v2 AC-1 was scoped to "L2 frames overlap" — the layout primitive that existed in v2. v3.1's section-stack model has no L2 frames; instead it has `create_labeled_shape` outputs at section scope. AC-40 generalises v2 AC-1 to "any two declared shapes overlap." v2 AC-1 is preserved verbatim in §6 as a historical record but is no longer load-bearing in v3.1+ (the section-stack supersedes the L2-lane primitive that AC-1 was protecting).

**Why this still works under v3.1's minimal primitives**: shapes are the only primitive with declared bounded x/y/w/h that the agent intends as containers. Free text doesn't have meaningful "bounds" the user expects to be inviolate; arrows route around things by definition; cameras don't render. So the overlap check applies to `create_labeled_shape` outputs only — same predicate shape as v2 AC-1, broader scope.

## 17.5 Soft authoring guidelines (PROMPT guidance, NOT enforced)

These are the section of the agent's system prompt that gives compositional guidance. They are guidelines, not rules — the agent can deviate when the explanation calls for it.

**The framing point** (per team-lead's softening brief): the agent thinks in *modalities* (workflow / number line / math callout / time chain / KEY IDEA / annotation / figure embed); the renderer sees *primitives* (the 6 + 1). **Modality is a CONCEPT in the agent's prompt, not a tool in the MCP wrapper.** The agent picks which modality fits the concept being explained, then composes that modality from the 6 primitives. The renderer doesn't dispatch on modality — it just renders whatever primitives the agent emitted. This preserves agent freedom (it can mix modalities, invent new ones, hybrid-compose) while keeping the wrapper surface small. The cost — more element calls per "specialised" modality — is closed by the visual self-loop (`look_at_scene`) and by the worked-example assembly patterns below.

> *"You are composing a whiteboard explanation for a research paper. You have 7 primitives (`create_labeled_shape`, `create_text`, `create_callout_box`, `create_background_zone`, `connect`, `set_camera`, `create_image`). Compose freely. The goal is a lucid explanation, like a human would write on a whiteboard.*
>
> *Some compositional patterns that work well (use, ignore, or invent your own):*
>
> *1. **Workflow** — when explaining a sequence of components transforming inputs to outputs: `create_labeled_shape` for each component (rectangles for processes, ellipses for inputs/outputs), `connect` for the flow arrows, optional `create_background_zone` (mode 1 — sub-zone with label) for grouping parallel pipelines (INPUTS zone, EMBED zone, etc.). The dominant component (the main thing being explained) gets `sizeWeight: 'dominant'`; siblings at equal rank get `sizeWeight: 'standard'`; supporting context gets `sizeWeight: 'subordinate'`. Maximum 1 dominant per section.*
>
> *2. **Math callout** — when explaining an equation, derivation, or training objective: `create_callout_box` with `fillColor: 'yellow'`, monospace font (`fontFamily: 2`), equations on separate lines, optional comments in italic. Annotation arrows pointing at specific sub-expressions can use `create_text` with a small `fontSize`.*
>
> *3. **Number line** — when explaining position between two endpoints (noise↔data; threshold value; t in [0,1]): a horizontal `connect` arrow as the axis, two `create_labeled_shape` ellipses with `fillStyle: 'hachure'` at the endpoints (label them "noise" and "data"), a `create_text` for any midpoint label, an additional styled `connect` for the velocity vector if relevant.*
>
> *4. **Time chain** — when explaining iterative timesteps: N `create_labeled_shape` ellipses (N≤7) in a row with role-fill colors representing the position along the iteration axis (e.g. red→green for noise→data), N-1 `connect` arrows between them with edge labels (`+v·dt`).*
>
> *5. **KEY IDEA / WATCH OUT callout** — for the punchline the user must walk away with: `create_callout_box` with `fillColor: 'green'` + `label: 'KEY IDEA'` (or `'amber'` + `'WATCH OUT'`). Single-sentence; max 240 chars.*
>
> *6. **Annotation paragraph** — for narrative cement between visualizations: `create_text` with `fontSize: 13`, `fontFamily: 5` (Excalifont), `lineHeight: 1.5`, `align: 'left'`, max width ~1200px. Place below the visualization it cements.*
>
> *7. **Embed a paper figure** — when the paper's actual figure is the right visual: `create_image` with the path to `<sidecar>/figures/page-N-fig-K.png` and an optional caption. Don't try to redraw paper figures from primitives; embed the original. **Place the figure within the section that discusses it** (next to or below the relevant `create_callout_box` or `create_labeled_shape` cluster) — don't author a separate "just the figure" section unless the figure is the entire point of the section. (Cog basis: Mayer's redundancy / split-attention — embedding the figure adjacent to its discussion eliminates the cost of "look at whiteboard, then look at paper, then come back.")*
>
> *Color discipline (per §18): every element gets a `role` (data, compute, output, math, noise, neutral) which drives its fill color. Inputs/intermediates that flow data → blue. Compute blocks → purple. Outputs / final answers → green. Math / training context → yellow. Noise / loss / errors → red. Background context → gray-beige.*
>
> *Hierarchy discipline (per §17.2.1.a): every `create_labeled_shape` gets a `sizeWeight`. The single most important element of the section is `dominant` (the renderer makes it 1.5× bigger). Sibling components are `standard` (default 1.0×). Supporting context is `subordinate` (0.7× smaller). Maximum 1 dominant per section. If two elements feel equally important, both should be `standard` — co-dominance reads as no dominance.*
>
> *Equation discipline (per §17.5.a equation typesetting tier): equations go in `create_callout_box` with `fontFamily: 2` (monospace) at v3.2 default. Use unicode operators where possible: `·` for multiplication, `√` for sqrt, `∂` for partial derivative, `∑` for sum, `∫` for integral, `≤` `≥` `≠` `≈` for relations, subscripts as `_t` `_θ` etc. (Greek letters via unicode; π θ φ are all readable in monospace). For complex expressions that don't render cleanly in unicode (nested fractions, multi-line integrals, matrix typesetting), fall back to plain prose description. v3.3 will add KaTeX→SVG rendering as a feature flag; for v3.2 stay within unicode + monospace.*
>
> *Section discipline (per §16): every authoring pass starts with `create_section` to mount a new section frame. All subsequent primitives are positioned inside that section's coordinate system. Each section gets at least one `set_camera` so the camera tour can step to it.*
>
> *Iteration discipline (per VLOOP-1, strengthened in v3.2 per cog-reviewer-2 audit R-v3-6 + ✗2): after composing, call `look_at_scene` to see the rendered output. **Run through this 6-criterion critique checklist (in order — stop at the first failure, fix it, re-render, repeat).** Each round walks the checklist top-to-bottom; iterate up to 3 rounds total. The 6 criteria tie back to specific cog-load failures, not generic aesthetics — pareidolia is not engineering.*
>   - *1. **Text legibility** — is any label hard to read at the rendered scale? Is any free `create_text` element on top of a shape, blocking it (per AC-29 WARN)? Is any callout's text clipped at the edge?*
>   - *2. **Shape clutter** — are shapes spaced enough apart that the eye can isolate each one (≥60px gap inside zones, ≥100px gap between zones per AC-1 / AC-40)? Are shapes the same size when they should differ in importance?*
>   - *3. **Visual hierarchy** — does the eye land on the most important element first? In a workflow-style section, exactly 1 `sizeWeight: 'dominant'` per AC-36; if zero or multiple dominants, fix.*
>   - *4. **Arrow flow** — do arrows route cleanly without crossing unrelated nodes (AC-2)? Is the read order obvious from arrow direction (left-to-right for workflows, top-to-bottom for derivations)?*
>   - *5. **Color discipline** — count the distinct semantic-role colors visible in the foveal frame (~5° at the camera's zoom); ≤4 per Treisman pop-out limit. Are role assignments consistent (every "data" element blue, every "compute" element purple)? Does any element have a kind:model exception conflict per §18.3?*
>   - *6. **At-a-glance recognition** — without reading any text, can you tell what kind of explanation this section is (workflow, equation, time evolution, etc.)? If not, the visual idiom isn't strong enough — pick clearer shapes, stronger fills, or split into two sections.*
> *Each round references per-modality good/bad exemplars (provided in PASS2_SYSTEM as image refs): the example whiteboard at `/Users/ashrya/.claude/image-cache/bea285c3-7422-4595-a668-2b7b9fa2b858/5.png` for "good workflow + math + time-chain composition"; v2's screenshot at `/tmp/fathom-shots/103015-whiteboard-after-fix.png` for "what to avoid: overlapping L2 lanes, edges crossing nodes, uniform body density." Critique against the exemplars, not in a vacuum.*
> *If the checklist still has failures after round 3, ship what you have and log `customData.iterationsExceeded: true` + the unresolved criterion to fathom.log — telemetry will surface patterns and harden the prompt over time.*
>
> *Two hard guarantees the renderer enforces (you don't have to think about them, just know they exist): (1) text inside a `create_labeled_shape` will fit; (2) two `create_labeled_shape` outputs cannot overlap. Free text and arrows have full latitude; shapes have non-overlap discipline."*

### 17.5.a Equation typesetting strategy (v3.2 decision)

Whiteboard-impl raised this: the example image's equations look properly typeset (`x_t = (1-t)·x_1 + t·x_0` reads as math). Excalidraw doesn't have native equation rendering. Three options were on the table:

1. **KaTeX → SVG → Excalidraw image element** (best fidelity; ~$0 per equation but requires KaTeX in main + image-loading IPC).
2. **Unicode + monospace text** (decent for simple expressions; doesn't handle fractions / integrals / summations cleanly).
3. **Excalifont handwritten math** (authentic to whiteboard metaphor; readability suffers for complex expressions).

**v3.2 picks option 2 as default; option 1 deferred to v3.3 with a feature flag.** Rationale:
- Option 2 ships now with no new infrastructure (just `create_text` with `fontFamily: 2`).
- The example image's equations are all option-2-compatible — `x_t = (1-t)·x_1 + t·x_0` and `dx/dt = v_θ(x_t, t, cond)` and the Euler step are all unicode + monospace expressible.
- Complex expressions (nested fractions, matrix typesetting) genuinely need KaTeX, but they're rare in research-paper architectural explanations (where Fathom's scope sits). When they do appear, v3.2 falls back to plain prose description in `create_text`.
- v3.3 adds KaTeX as a feature flag (`Settings → Rendering → Use KaTeX for equations`) so motivated users get fidelity-mode without forcing the infrastructure complexity on the v3.2 ship.

**v3.3 KaTeX implementation sketch** (out of v3.2 scope, recorded for the implementer's followup):
- Add `create_equation({latex, x, y, fontSize})` MCP tool that calls KaTeX in the main process to produce SVG, embeds as Excalidraw `image` element with the SVG blob (fileId-referenced).
- KaTeX is ~250KB minified — load it lazily on first equation, not at app startup.
- Cache rendered SVGs by `latex` hash so repeat-equation calls skip re-rendering.
- Fall back to option 2 (unicode + monospace) if KaTeX errors on the input string (malformed LaTeX shouldn't crash the whiteboard).

## 17.6 Workflow lane discipline (now a soft guideline, not a renderer-enforced rule)

v2's lane discipline was renderer-enforced — the layout pass re-flowed L1 nodes to lane centers. v3.1 demotes lane discipline to a **soft authoring guideline** that the agent SHOULD follow when laying out a workflow but isn't blocked from violating.

The soft guideline (in the agent's prompt per §17.5 item 1):

> *"For a workflow with N drillable components, allocate vertical lanes — each lane wide enough for the component's drill-target diagram. Place the component at the lane's horizontal center, vertical row 0. Non-drillable components get tight lanes (just enough to fit the node + 60px margin)."*

The agent picks the lane allocation; the renderer enforces no overlap (AC-1 still applies). If the agent composes a non-lane layout (radial, free-form, clustered), AC-1 catches the overlap if any but doesn't otherwise object. This unties the lane discipline from being a rigid template — it's now just a useful pattern the agent reaches for when a workflow would benefit.

**Why demote**: v3-draft-1 had lane discipline at section-scope inside workflow-modality sections. But "this is a workflow" was an enforced modality tag; the renderer ran a per-section lane layout pass. v3.1 has no modality tag — the agent might lay out a workflow today and a radial cluster tomorrow. Renderer-side layout passes only fire when triggered by an explicit modality marker, which v3.1 doesn't have. So the layout discipline moves to the prompt, where the agent applies it judgement-by-judgement.

## 17.7 Per-section streaming mode (carried from v3-draft-1, simplified)

Three streaming modes, picked per-section by the agent (or defaulted):

| Mode | Used when | Behavior |
|---|---|---|
| `stream-as-drawn` (default) | Most paper sections, chat sections, annotation-heavy sections | Excalidraw's draw-on animation runs as elements arrive (~50ms tick per element). User watches the section build. |
| `pre-warm-then-flash` | Drilled sections AFTER the user has clicked drill | Renderer composes the section off-screen; mounts in one shot when ready. Click-responsiveness wins over draw-on aesthetics. |
| `instant` | Loaded-from-disk on paper reopen | All-at-once render, no animation. The user expects instant when re-opening. |

The agent passes `streamingMode` to `create_section`; defaults to `stream-as-drawn` for paper-spawned + chat sections, `pre-warm-then-flash` for drill-spawned sections (renderer auto-overrides). On paper reopen, the renderer forces `instant` regardless of stored mode.

This collapses v3-draft-1's per-modality streaming table into a per-section streaming mode (3 modes vs 7). Simpler, same coverage.



## 17.8 (DELETED v3-draft-1 subsections — see §17 above for the v3.1 version)

The following subsections from v3-draft-1 are deleted in v3.1: the seven-modality table, the modality decision tree, the per-modality detail sections (workflow / math_callout / number_line / time_chain / hatched_distribution / annotation_paragraph / key_idea_callout), the modality-MCP-tools table, and the per-modality streaming table. They are replaced by §17.2 (6 primitives + 1 auxiliary), §17.5 (soft authoring guidelines), and §17.7 (per-section streaming mode, 3 modes vs 7).

The deleted content is preserved in git history at the HEAD commit before this v3.1 revision (look for the Edit replacing v3-draft-1's §17 with v3.1's §17 in the layout-strategist's edit log).



# 18. Per-element semantic-role palette (extends v2 §3)

Adds a per-element semantic palette layered on top of v2's kind-based palette. Maps to existing v2 palette tokens; the addition is the *role-based selection rule*.

## 18.1 The role palette

| Role | Pastel fill | Primary stroke | Use |
|---|---|---|---|
| `data` (data flow / inputs / activations / tensors) | `pastel.blue` `#a5d8ff` | `primary.blue` `#4a9eed` | Anything that *flows* through a model — inputs, intermediate activations, hidden states, embeddings |
| `compute` (computation / projection / transformation) | `pastel.purple` `#d0bfff` | `primary.purple` `#8b5cf6` | Compute blocks — projection layers, attention modules, MLPs, the model backbone |
| `output` (output / endpoint / final result) | `pastel.green` `#b2f2bb` | `primary.green` `#22c55e` | Model outputs, final predictions, the answer to the question |
| `math` (math / training context / equations / derivations) | `pastel.yellow` `#fff3bf` | `primary.amber` `#f59e0b` | Math callouts, training-objective context, derivation boxes |
| `noise` (noise / loss / error / anomaly) | `pastel.red` `#ffc9c9` | `primary.red` `#ef4444` | Noise priors, loss terms, error states, "watch out" callouts |
| `neutral` (neutral context / supporting structure / unfocused) | `#f5f1ed` (very pale beige) | `#a89a8c` (warm gray) | Background context, structural scaffolding, unfocused elements |

These map directly onto v2's existing palette tokens — no new hex values. The addition is the *selection rule*: when authoring an element, the agent picks both:
1. **Kind** (per v2 §3.2: input/output/process/data/model) — drives stroke weight, shape, and dashed-vs-solid border.
2. **Role** (per §18.1 above) — drives fill color and primary stroke color when fill+stroke pair would otherwise default.

## 18.2 Why both kind AND role

v2's kind-based palette encodes **structural role within a workflow** (this is the model node, this is an endpoint, etc.). v3's role-based palette encodes **semantic role within an explanation** (this is data flowing, this is compute, this is math).

These are **orthogonal axes**:
- A `kind: process` (structural: intermediate stage) can be a `role: data` (semantic: it's where data lives at this stage) OR a `role: compute` (semantic: it's where compute happens at this stage).
- A `kind: model` (structural: novel contribution) is almost always `role: compute` (semantic: it computes things) but could be `role: math` if the contribution is a new equation.

Without the role axis, the agent has only kind to encode color — and kind doesn't distinguish "this is data" from "this is compute," which is exactly the distinction the example image makes (blue input boxes vs purple embed/projection vs green output).

## 18.3 Conflict resolution when kind and role disagree

**The general rule**: kind wins on stroke, role wins on fill.

**The kind:model exception** (v3.2 — per cog-reviewer-2 audit Q-v3-5 ⚠ refinement). When `kind: 'model'` fires, kind wins on BOTH stroke AND fill — the role axis is suppressed for this one case. The model node always renders as `pastel.yellow #fff3bf` fill + `primary.amber #f59e0b` 2.5px stroke (v2 default), regardless of what role the agent assigned.

**Why the exception**. cog-reviewer-2's pass-1 v3 audit Q-v3-5 raised the brand-look-dissonance risk: amber-on-purple (kind:model + role:compute resolved per the general rule) reads as "warning sign" (high-contrast complementary colors are a hazard convention), not as "novel + featured." Geometric chromostereopsis is below threshold at our element sizes (Allen & Rubin 1981), but the cultural color-pair association is the cog hazard. The amber-on-yellow (v2 default) reads as a single coherent "this is the novelty being explained" signal — Mayer redundant encoding (fill + stroke both saying the same thing about importance), not a competing signal. For all OTHER kinds (process, data, output, input), the role-wins-fill rule still applies — those nodes don't have brand-look conflict because their kinds aren't "★ novelty."

**Consequence for v3.2 ACs**: AC-35 (chromostereopsis WARN) is no longer applicable in v3.2 because the only chromostereopsis-prone case is precluded by the kind:model exception. AC-35 stays in the spec for completeness (and because future custom roles might re-introduce the case), but its expected fire rate drops to near-zero.

| Element example | Kind (structural) | Role (semantic) | Resolved fill | Resolved stroke |
|---|---|---|---|---|
| The novel model backbone | `kind: model` | `role: compute` (or any) | **`pastel.yellow` `#fff3bf`** (kind:model exception — role suppressed; per Q-v3-5) | `primary.amber` `#f59e0b` 2.5px (kind wins stroke — heavy amber says "this is the novelty") |
| An input image tensor | `kind: input` | `role: data` | `pastel.blue` `#a5d8ff` (role wins; v2's default `pastel.green` for kind:input is overridden) | `primary.green` `#22c55e` 1.5px ellipse (kind wins stroke + shape — green ellipse says "endpoint") |
| A loss function | `kind: process` | `role: noise` | `pastel.red` `#ffc9c9` (role wins fill) | `primary.blue` `#4a9eed` 1.5px (kind wins stroke — process default) |
| A standard intermediate transformation | `kind: process` | `role: compute` | `pastel.purple` `#d0bfff` (role wins fill) | `primary.blue` `#4a9eed` 1.5px (kind wins stroke — process default) |
| An attention output (intermediate data) | `kind: data` | `role: data` | `pastel.blue` `#a5d8ff` (no conflict — both say data) | `primary.cyan` `#06b6d4` 1.5px (kind wins; cyan distinguishes "stored intermediate" from "flowing input") |
| The model's velocity prediction (final output) | `kind: output` | `role: output` | `pastel.green` `#b2f2bb` (no conflict) | `primary.green` `#22c55e` 1.5px ellipse |

**Why kind wins stroke and role wins fill**: stroke carries the *pop-out* hierarchy signal (heavy amber for novelty is the most important pre-attentive cue — it must not be diluted). Fill carries the *grouping* signal (which elements are related semantically — Gestalt similarity). These two jobs are orthogonal: the eye reads stroke for "what's important" and fill for "what's related." Letting them be encoded by different axes (kind for stroke, role for fill) lets each axis do its job without interference.

## 18.3a Zone-color and node-color are independent decisions (round-5 critic clarification, 2026-04-27)

A regression class observed in round 5: the agent picked node colors by **zone membership** rather than by per-node role. A 5-stage GENERATE pipeline rendered all 5 nodes as green because they sat inside a green-tinted GENERATE zone. The result destroys the green=terminal signal — the reader can no longer tell which node is the actual delivered output.

**The principle**: a zone gets exactly ONE role (chosen at zone-creation time, drives the 30% background tint). The nodes that sit inside the zone get their OWN roles, picked per-element based on what each node DOES, not where it sits. These two role assignments are **independent**.

**Worked example — the round-5 GENERATE zone**:

| Element | Zone-color reasoning (WRONG) | Per-element role reasoning (RIGHT) |
|---|---|---|
| GENERATE zone | role=output → green tint | role=output → green tint |
| SS-Flow node (intermediate) | role=output (because in GENERATE zone) → green | role=process (it transforms data) → **purple** |
| SLAT-Flow+RVC node (intermediate) | role=output (because in GENERATE zone) → green | role=process (it transforms data) → **purple** |
| 3D mesh node (final artifact) | role=output → green | role=output (terminal artifact) → **green** |

**The decoder rule for the agent**: when authoring each node, ask *"what does this node DO in the explanation?"* not *"where does this node SIT on the canvas?"* If the answer is "mid-pipeline transformation" → role=process (purple). If the answer is "the final output of the entire diagram" → role=output (green). Zone membership is never a substitute for this per-element question.

**AC enforcement**: `AC-COLOR-ROLE-CONSISTENCY` (FAIL) fires when any zone contains >1 green node. The predicate is intentionally loose — it catches the regression class without requiring full arrow-graph terminal detection. False-positive risk is low because legitimate designs always have exactly 0 or 1 green node per zone.

## 18.4 The role-selection rule for the agent

The agent's prompt rule for picking role when authoring a node:

> *"Per element: assign a `role` that matches what the element CONTAINS or REPRESENTS in the explanation:*
> *- If the element is a tensor, vector, embedding, or anything that "flows" through the model → `role: data` (blue).*
> *- If the element is a compute block, attention module, MLP, projection, transformation, or "the model itself" → `role: compute` (purple).*
> *- If the element is the model's output / final prediction / answer to the question → `role: output` (green).*
> *- If the element is an equation, derivation, training objective, or math context → `role: math` (yellow).*
> *- If the element is noise, loss, error, anomaly, or "be careful here" → `role: noise` (red).*
> *- If none of the above (background context, structural scaffolding, unfocused content) → `role: neutral` (gray-beige).*
> *The role drives the fill color so semantically related elements pop together (Wertheimer Gestalt similarity); the kind continues to drive stroke + shape so structural hierarchy still pops (Treisman pop-out). When in doubt, pick the role that the user would most expect the element to "feel like" — a tensor box should feel blue (data), a compute box should feel purple, an answer box should feel green."*

## 18.5 Role applies to modality elements too

Math callouts, key idea callouts, time chain steps, and number line endpoints all use the role palette for fill color:

- Math callout `fillColor: 'yellow'` (default for math context) or `'blue'` (for blue-themed equations like the example's ODE callout) or others per the agent's choice.
- Key idea callout `fillColor: 'green'` (conclusion / "you got it"), `'amber'` (caution / "watch out"), `'blue'` (concept / "this is the idea").
- Time chain steps colored as a gradient along the role axis (e.g. red→green for noise→data per the example).
- Number line endpoints colored per the distribution they represent (red for noise, green for data, etc.).

The role palette unifies color semantics across all modalities and per-element node fills. The user learns *one* color vocabulary and applies it everywhere.

## 18.6 Channel-discipline accounting (re-check against AC-12)

v2 AC-12 limits independent perceptual channels per node to ≤3. v3's role addition does NOT add a channel because role and kind are co-encoded into the same fill+stroke pair (kind wins stroke; role wins fill). The pair is still ONE perceptual channel per AC-12's explicit accounting (fill+stroke pair = 1 channel). The pair just now encodes a 2-tuple of (role, kind) instead of a 1-tuple of (kind alone). Mayer redundant encoding still applies; the eye reads the pair as one signal that conveys both pieces of information.

The accounting per node in v3 is therefore the same as v2:
- (1) fill+stroke pair (now encoding role+kind tuple)
- (2) shape (rectangle / ellipse / diamond)
- (3) body density tier
- (4) drillable affordance (dashed border + ⌖ glyph) when active

Within v2's per-scope ceiling of 3. ✓ AC-12 unchanged.

# 19. v3.1 + v3.2 audit asks (for cog-reviewer-2)

These are the v3.1+v3.2-specific questions that need cog-reviewer-2's verdict before implementation. The v2 verdicts in §15 stand for the unchanged surface; this list is the v3.1+v3.2 delta. v3.1 asks slimmed from v3-draft-1's eight to **five** (modality-vocabulary asks retracted with the prescriptive-modality system itself); v3.2 adds **two** asks for the sizeWeight + equation-typesetting decisions = **7 total**.

## 19.1 Q-v3.1-1 — Does the visual self-loop substitute for prescriptive primitives? (THE central v3.1 ask)

**Context.** v3.1 stakes the bet that **freedom + 2 programmatic guarantees + visual self-loop > prescriptive primitives**. The agent gets 6 minimal primitives + soft authoring guidelines; it composes everything (number lines, time chains, math callouts, hatched distributions) from those primitives; it calls `look_at_scene` (VLOOP-1) to see the rendered output; it iterates. Versus v3-draft-1's prescriptive 7-modality vocabulary, v3.1 trades agent-side composition complexity for renderer-side specialisation cost.

**My claim.** The trade is defensible because:
- **Excalidraw is rich enough** — `fillStyle: 'hachure'` makes ellipses look like probability distributions; `connect` with arrowheads + labels makes any sequence; `create_text` covers any free-floating annotation; `create_callout_box` handles math + key-idea boxes uniformly. The 6 primitives cover the example image's full visual vocabulary (composing it would take ~25 tool calls, vs ~10 with the v3-draft-1 specialised primitives).
- **The visual self-loop closes the agent-complexity gap** — the agent can author, see, critique, iterate. Same loop a human uses on a real whiteboard.
- **Prescriptive primitives have hidden costs** — they constrain to N predicted shapes, they bake aesthetic decisions into the renderer (and we then have to ship those decisions even when they're wrong for a given paper), they don't extend cleanly (Sankey, bar chart, tree all need new tools).

**Cog-reviewer-2 ask.** Validate the trade. Specifically: in 1-2 iteration rounds with `look_at_scene`, can the agent actually achieve the example image's visual quality from primitives alone? Or does the composition complexity exceed what the iteration loop can correct, leading to systematically worse rendered output than v3-draft-1 would have produced? Concrete pressure test: pick one section of the example image (say Section 2 — the number line + math callout) and reason through what tool-call sequence the agent would emit + what the post-look_at_scene critique would catch. If the answer is "the agent gets it right in 2 rounds" → trade is fine. If "the agent thrashes for 5 rounds and still produces a cluttered mess" → revisit specialised primitives.

## 19.2 Q-v3.1-2 — Does the section-stack layout preserve recursion grammar?

(Carried from v3-draft-1 Q-v3-1; unchanged content.)

**Context.** v2 had three distinct layout primitives (L1 row, L2 lane, chat band) for three distinct content types. v3.1 collapses to one primitive (the section stack) for all three. CLAUDE.md §2.1 requires "every interaction at every level uses the same visual primitives + same gesture + same persistence" — v3.1 satisfies the latter two trivially (drill-gesture and chat-input are both unchanged; both produce a new section in the same persistence schema). The question is the *visual primitives*: does "all sections look like sections" satisfy recursion grammar even when the underlying provenance differs?

**My claim.** Yes — section-as-primitive is *more* recursion-compliant than v2's three-primitive layout. v2 had to teach the user three layout shapes (the L1 row reads horizontally, the L2 lane reads vertically inside its parent, the chat band stacks at the bottom). v3.1 teaches one shape (top-to-bottom section stack) that applies recursively. The user sees consistent grammar at every drill depth.

**Cog-reviewer-2 ask.** Validate or reject. Specifically: does the loss of v2's spatial-distinction-of-content-type (L2 was visually distinct from L1 because lanes are vertical inside a horizontal row) cost more cognition than the gain of one-primitive-grammar? My intuition: the spatial distinction was redundant with provenance (which §16.7 now encodes via tint + glyph), so collapsing it loses no information.

## 19.3 Q-v3.1-3 — Does drill-as-section-creation lose the L1/L2 spatial parent-child link?

(Carried from v3-draft-1 Q-v3-4; unchanged content.)

**Context.** v2's L2 lane sat directly under its L1 parent — the spatial-proximity Gestalt cue was the primary parent-child link. v3.1 puts drilled sections at the bottom of the stack, with a cross-section edge (purple dashed) back up to the parent node.

**My claim.** The cross-section edge does the same Gestalt work as proximity. Edges are an explicit link — proximity is implicit. Explicit ≥ implicit when the user is asking "which section explains this node I just clicked?" Their eye follows the cross-section edge directly to the new section.

**Cog-reviewer-2 ask.** Is "explicit edge" cognitively equivalent to "spatial proximity" for parent-child binding? My concern: when the section stack grows (e.g. 6 sections), the cross-section edge becomes long — does length erode the cognitive link? Mitigation: the camera (§11) auto-pans to the new section, so the user doesn't see the edge length until they free-pan back. But after they've drilled a few times, the camera state may not track which edge belongs to which drill. Need to think about this.

## 19.4 Q-v3.1-4 — Per-element semantic-role palette: does it collide with kind palette?

(Carried from v3-draft-1 Q-v3-5; unchanged content.)

**Context.** §18 introduces a role palette layered on kind. Kind wins stroke; role wins fill.

**My claim.** No collision; the two axes encode genuinely orthogonal information (structural vs semantic) and the eye reads stroke and fill separately (Treisman pop-out by stroke is independent of grouping by fill).

**Cog-reviewer-2 ask.** Validate. Specifically: in the resolution table (§18.3), the model node renders as `pastel.purple` fill + `primary.amber` 2.5px stroke. Does the amber-on-purple combination create a visual dissonance (purple-yellow being roughly complementary on the color wheel)? Or does the high contrast between the two reinforce the "this is the model AND it's compute" reading? My instinct: high contrast pair is good (Mayer redundant encoding when they tell you the same story; perceptual jolt when they tell you orthogonal stories). But complementary colors on small UI elements can vibrate (chromostereopsis at 30+ minutes of arc visual angle — Allen & Rubin 1981). At our element sizes (~280×120px at native zoom) and viewing distance (~50cm), we're well above the threshold; should be fine. But worth checking.

## 19.5 Q-v3.1-5 — Section eviction generalised to all sections — does it work?

(Carried from v3-draft-1 Q-v3-7; unchanged content.)

**Context.** §16.5 generalises v2's chat-frame eviction (8 expanded + collapse-rest) to all section types. A user with a busy session might have 4 paper sections + 6 drill sections + 3 chat sections = 13 sections. Eviction collapses the oldest 5 to stubs.

**Concern.** Older paper sections might be the canonical reference (Section 1 = "the architecture") that the user keeps coming back to. Auto-collapsing them just because newer sections (drills, chats) accumulated could hide the foundation.

**My recommendation.** Eviction priority: collapse oldest *non-paper* sections first. Paper sections are pinned-by-default; only when 8 paper sections exist (rare) do paper sections start to collapse. User can manually pin/unpin any section.

**Cog-reviewer-2 ask.** Validate priority rule. Is "paper sections are special" a defensible asymmetry, or does it create an inconsistent grammar (most sections evict; some don't)?

## 19.6 Q-v3.2-1 — sizeWeight as discrete (3 values) vs continuous size (NEW v3.2 ask)

**Context.** §17.2.1.a introduces `sizeWeight: 'dominant' | 'standard' | 'subordinate'` as a 3-value discrete parameter that the renderer translates to width/height multipliers (1.5× / 1.0× / 0.7×). The example image's hierarchy is carried by SIZE — the DiT Backbone is bigger because it's the main thing — and we want the agent to express that hierarchy explicitly.

**My claim.** Discrete (3 values) beats continuous (any width/height) on three counts:
1. **Cleveland & McGill 1984 categorical-vs-magnitude judgement**: continuous size requires the user to *judge relative magnitude* (slow, fixation-required); categorical size produces pre-attentive pop-out (fast, parafovea). 1.5×/1.0×/0.7× sits at the categorical-distinct ratio (>50% delta = above magnitude-judgement threshold).
2. **Agent thrash-prevention**: continuous size makes the agent re-tune width/height per node ("is 240 wide enough? 280? 320?"). 3 discrete values eliminate that thrash — pick one of three labels, done.
3. **Renderer composability with text-fit AC-2**: with discrete sizes, the renderer pre-computes "for sizeWeight: dominant + label.text length L, what's the auto-fit fontSize that fits?" and applies it deterministically. Continuous sizes would require per-shape iterative solve.

**Cog-reviewer-2 ask.** Validate the discrete-3 choice. Specifically: is 1.5× / 1.0× / 0.7× the right ratio? My multipliers come from Cleveland & McGill's relative-magnitude threshold (~50%) — dominant is +50%, subordinate is -30%. But the example image's DiT Backbone looks more like 2× the embed boxes. Should `dominant` be 1.5× or 2×? My instinct: 1.5× is enough for pop-out without breaking the canvas budget (a 2× dominant in a section with 5 elements widens the section by 100px+). But I want a cog verdict — pop-out at 1.5× vs 2×, which is the right calibration?

## 19.7 Q-v3.2-2 — Equation typesetting tier choice (NEW v3.2 ask)

**Context.** §17.5.a picks unicode + monospace as the v3.2 default with KaTeX→SVG deferred to v3.3 with a feature flag. The example image's equations are simple enough to render in unicode + monospace; complex expressions (matrix typesetting, nested fractions, integrals) genuinely need KaTeX.

**My claim.** Tiered shipping is the right move:
- v3.2 ships with unicode + monospace — covers the example image and most architectural-explanation equations.
- v3.3 adds KaTeX as a feature flag for users who need fidelity-mode (typically theorists reading dense-math papers).
- The agent prompt (§17.5 equation discipline) instructs falling back to plain prose description when an expression doesn't render cleanly in unicode — degrades gracefully.

**Cog-reviewer-2 ask.** Validate the tier. Specifically: are there cog-load consequences from the agent NOT having KaTeX in v3.2 — does the prose-fallback path actually degrade gracefully, or does the user perceive "the agent gave up" when they see prose where they expected math? My instinct: prose fallback for rare-complex-math is fine because the user is on a research paper and CAN look at the original paper for the typeset version (Fathom is a reading aid, not a substitute). But cog-reviewer-2 verdict on whether that's defensible vs ship-KaTeX-in-v3.2.

## 19.8 Risks I want on the v3.1 + v3.2 record

These are the v3.1 analogs to v2's §15.2 risks — places I expect the design will need revisiting based on observed user behaviour.

1. **§17 visual self-loop as the primary quality safeguard.** The biggest v3.1 bet is also the biggest v3.1 risk. If the agent's compositions from primitives are systematically worse than what specialised primitives would have produced, AND the visual self-loop doesn't close the gap in 1-2 rounds, the rendered output looks worse than v2 (let alone v3-draft-1). **Watch for**: rendered whiteboards that feel "drafted" rather than "designed" — text crammed against shapes, free-text floating in awkward places, arrows that should have been routed differently. If observed, the response is NOT to add prescriptive primitives back wholesale (that loses the freedom benefit) but to harden the soft authoring guidelines in §17.5 with more concrete compositional examples + tighten the post-look_at_scene self-critique rubric.

2. **§16.7 chat-as-section vs v2's chat-as-band.** If users actively *want* chat content visually segregated from paper content (because they think of them as different categories), v3.1's section-stack with subtle tint differentiation may feel like the chat content is "diluting" the paper content. **Watch for**: user feedback that "I can't tell which sections are mine vs the paper's". If observed, raise the chat tint opacity from 12 to 24 or re-introduce a soft band header marker (e.g. *"— Q&A —"* divider) between paper sections and the first chat section.

3. **§18 role palette saturation.** With 6 role colors plus the existing kind-derived colors, the canvas can become visually busy. **Watch for**: rendered diagrams that feel "rainbow-y." If observed, recalibrate role palette toward narrower hue ranges (e.g. all roles use desaturated tints; only kind:model preserves the saturated amber for pop-out).

4. **§16.5 eviction ceiling at 8.** Inherited from v2 §10.5 but now applies to a heterogeneous section mix (paper + drill + chat). A user with 4 paper + 8 drill sections has 12 active sections, 4 of which auto-collapse. If those 4 are early drills the user wanted to keep available, frustration. **Watch for**: users frequently re-expanding collapsed sections. If observed, raise N from 8 to 12, OR introduce a manual pin gesture, OR introduce a "recent N" rule that respects user-pinned sections separately.

5. **§17.5 soft authoring guidelines could be ignored by the agent.** The guidelines are prompt-only — there is no enforcement that the agent will use `create_callout_box` for the math callout vs ad-hoc rectangle + text. If the agent ignores the guideline and composes from raw primitives every time, the rendered consistency degrades. **Watch for**: rendered whiteboards where compositional patterns vary widely between sessions for similar concepts. If observed, surface the guideline patterns more prominently in the prompt, or add a soft post-render check ("did this section use a recognised compositional pattern?") that nudges the agent toward consistency.

6. **(v3.2) sizeWeight discrete granularity might be too coarse.** 3 values (dominant / standard / subordinate) covers the example image cleanly but may not handle all hierarchies. A paper with "main contribution + 2 sub-contributions + 4 supporting components + 2 inputs" has at least 4 implicit ranks, but sizeWeight only offers 3. **Watch for**: agent compositions where the agent wants a "secondary dominant" tier (the sub-contributions) and forces them into either dominant (creating multi-dominant violations of AC-36) or standard (collapsing the rank to siblings). If observed, add a 4th `sizeWeight: 'secondary'` tier (1.2× multiplier) — but ONLY if the data shows it. Don't preemptively add — the example image works at 3.

7. **(v3.2) Equation prose-fallback could read as "agent gave up."** When the agent encounters a complex expression that doesn't render in unicode + monospace, §17.5 instructs falling back to plain prose description. The user might perceive this as "the agent didn't try" rather than "the equation is too complex for the medium." **Watch for**: user feedback that math sections feel under-served. If observed, accelerate v3.3 KaTeX shipping (turn the feature flag on by default for all users, not just opt-in motivated readers).

## 19.9 Implementation-time checks the v3.1 + v3.2 reviewer wants performed

In addition to the v2 §15.4 checks (carried forward unchanged):

1. **Visual-self-loop telemetry**: log the number of `look_at_scene` calls per section authoring pass + the elements added/modified between calls. If the median pass uses `look_at_scene` 0 times (agent skips it) or >5 times (agent thrashes), that signals the visual loop isn't calibrated correctly. Target: 1-3 calls per section.
2. **Composition pattern recognition**: log which compositional pattern each section appears to instantiate (heuristic from element types: ellipses + horizontal `connect`s = number-line-like; circles + sequential `connect`s = time-chain-like; tinted rectangle + text-only content = math-callout-like). Telemetry on pattern frequency lets us spot if the agent is over/under-using certain patterns.
3. **AC-1 + AC-2 fire rate in dev build**: per the §6 severity policy, FAIL ACs abort scene-load with console.error. The implementer should confirm both fire on synthetic violations before declaring the v3.1 surface done.
4. **Role palette runtime**: log the role assignment per element to `fathom.log` so we can audit the agent's role-selection accuracy. Per the role-selection rule prompt (§18.4), if the agent picks `role: noise` for a tensor input, that's a misclassification we need to spot in observed data.
5. **Section count telemetry + cross-section edge length distribution**: as in v3-draft-1's Q-v3-7 + Q-v3-4 implementation checks.

—

# 20. Approved by cog-reviewer-2 (v3.2.1 — cumulative across v3-draft-1, v3.1, v3.2)

**Sign-off date.** 2026-04-25.
**Reviewer.** cog-reviewer-2 (cognitive-psychology reviewer per `.claude/TEAMS.md`; veto authority over designs that contradict established cognition / perception research).
**Iteration loop.** Three audit passes (pass-1 audited v3-draft-1; pass-2 audited v3.1; pass-3 sign-off on v3.2.1). The strategist's intervening v3.1 + v3.2 supersedes landed faster than my audits could; the result is that my pass-1's structural ✗ ("retract the 7-modality vocabulary; ship 6 minimal primitives + agent freedom + visual self-loop instead") was already in the strategist's hands before my audit landed. We arrived at the same place independently three times.
**Verdict.** **APPROVED for implementation** with one risk-on-record (sizeWeight ratio calibration) shipped as runtime A/B variant.

## 20.1 Per-decision verdict table (v3-specific surface)

| Decision | Section | Verdict | Citation |
|---|---|---|---|
| Section-stack as outermost recursion primitive (one-primitive replaces v2's three primitives) | §16.1 | ✓ APPROVED | CLAUDE.md §2.1 recursion grammar |
| Section header (number + title + subtitle + provenance glyph; modality icon when collapsed → text marker per §11 minor principles) | §16.2 | ✓ APPROVED | Cognitive consistency over conditional iconography |
| Three section provenances (paper / drill / chat), bottom-append to stack, provenance via tint+glyph not spatial location | §16.3 | ✓ APPROVED | Sweller element interactivity (no re-flow on append); chat-band dissolution simplifies grammar |
| Shared left edge x=0 across all sections | §16.4 | ✓ APPROVED | Tufte small-multiples |
| 8-section eviction ceiling, paper-pinned by default, manual pin gesture | §16.5 | ✓ APPROVED | Cowan 2001 chunking; asymmetry that matches user intent ≠ inconsistency |
| Drill-as-section + cross-section edge + camera-hides-edge + backlink button | §16.6 + §16.6.a + §11.7 | ⚠ APPROVED WITH NOTE | Explicit edge ≥ implicit proximity in small-stack; ⚠ at long-stack mitigated by camera + backlink |
| Chat-as-section (no dedicated band) | §16.7 + §16.9 | ✓ APPROVED | Provenance-via-tint+glyph + section number sufficient signal; downward stacking acceptable when camera auto-pans |
| 6 minimal primitives + 1 auxiliary (`create_image`); soft authoring guidelines, no enforced modality enum | §17.1 + §17.2 + §17.5 | ✓ APPROVED | Agent freedom per user brief; primitive minimality; visual self-loop carries the slack |
| `sizeWeight` discrete (3 values: dominant / standard / subordinate) for SIZE-based hierarchy | §17.2.1.a | ✓ APPROVED on discreteness; ⚠ on ratio (see §20.2 risk #1) | Cleveland & McGill 1984 categorical-vs-magnitude; Wolfe 1994 pop-out threshold |
| `create_image` for paper figures (push-back to brief) | §17.2.7 | ✓ APPROVED | Mayer 2009 redundancy + split-attention |
| Two programmatic guarantees: AC-39 text-overflow (FAIL) + AC-40 shape-non-overlap (FAIL, generalises v2 AC-1) | §17.4 + §6 | ✓ APPROVED | User-cited; Excalidraw native `label` field handles overflow at schema level |
| Soft authoring guidelines (modality as exemplar prose, not schema enum) | §17.5 | ✓ APPROVED | Per user "agent freedom" brief; Treisman 1988 pop-out doesn't require schema tagging |
| Visual-self-loop 6-criterion critique rubric (text legibility / shape clutter / visual hierarchy / arrow flow / color discipline / at-a-glance) | §17.5 iteration discipline | ✓ APPROVED | Pareidolia pre-empted; rubric ties to specific cog-load failures, not generic aesthetics |
| Workflow lane discipline as soft guideline (not renderer-enforced) | §17.6 | ✓ APPROVED | Correct demotion — modality-free agent can compose non-lane layouts; AC-1/AC-40 catch real overlap |
| Three streaming modes per section (stream-as-drawn / pre-warm-then-flash / instant) | §17.7 + §14.6 + AC-28 | ✓ APPROVED | AC-28 instant-mode exception per pass-2 C5 — no spurious fire on paper reopen |
| Equation typesetting tier (v3.2 unicode+monospace; v3.3 KaTeX feature flag); faithful prose translation for complex math | §17.5.a | ✓ APPROVED | Mayer 2009; right shipping cadence; prose translation requirement (per Q-v3.2-2 refinement) prevents "agent gave up" failure mode |
| Per-element semantic-role palette (data/compute/output/math/noise/neutral) layered on v2 kind palette | §18.1 + §18.2 | ✓ APPROVED | Wertheimer Gestalt similarity; orthogonal axes encoded into one channel pair |
| Kind+role conflict resolution (kind wins stroke, role wins fill — except `kind: model` which gets full alignment override per §18.3 model-node exception) | §18.3 | ⚠ APPROVED WITH NOTE | Allen & Rubin 1981 chromostereopsis — at our element sizes safe per geometry; brand-look dissonance (amber-on-purple = "warning sign") avoided via §18.3 model-node exception |
| AC-3 retired → AC-36 (FAIL exactly-1-dominant) + AC-37 (WARN no-dominant) | §6 | ✓ APPROVED | Correct paradigm shift from kind-based to size-based hierarchy |
| AC-38 (zone non-overlap, FAIL) | §6 | ✓ APPROVED | Palmer common-region invariant |
| AC-33 (cross-section edge no-title-crossing, FAIL) | §6 | ✓ APPROVED | Cross-section parent-child binding integrity |
| AC severity classification (FAIL = no defensible counterexample; WARN = probabilistic) | §6 + pass-3 from v2 | ✓ APPROVED | Generalised counterexample test from pass-3 |
| 36 active ACs (28 v2 + 8 v3 net new after retirements/dropouts) | §6 | ✓ APPROVED | Within team-lead's "few new ACs" ceiling for v3 (8 net new in v3 round) |
| §15.4.a A/B variants for implementer dogfood (cross-section edge styling, section header height, provenance tint opacity, backlink button position, sizeWeight dominant multiplier 1.5×/2×) | §15.4.a | ✓ APPROVED | Right discipline — empirical pick by user feel for the items where cog-research alone doesn't decide |
| §19.10 implementation-time telemetry (look_at_scene call count, composition pattern recognition, AC fire rate, role assignment audit, section count distribution, cross-section edge length) | §19.10 | ✓ APPROVED | Recalibration-after-dogfood discipline preserved from v2 §15.4 |

## 20.2 Risks the reviewer wants on the v3 record

These are the v3-specific risks; v2 §15.2 risks remain in force for the v2 carry-forward surface.

1. **§17.2.1.a sizeWeight `dominant` ratio at 1.5× width / 1.4× height — at conscious-judgement threshold, may not pop pre-attentively.** Pass-2 ✗-v3.2-1 asked for a bump to 1.7× / 1.5× per Wolfe 1994 pop-out threshold (~70% relative-size delta for parafoveal detection in 200ms). Strategist correctly logged as **E-v3-5 A/B variant** (§15.4.a) so the implementer ships both ratios with a runtime toggle and the user picks empirically. **Watch for**: dogfood feedback that "the dominant element doesn't feel obviously the focal point" or "I have to look-and-compare to see which is bigger." If observed, switch the default from 1.5× to 1.7× without spec change. The decision lives at runtime, not in the spec — appropriate calibration discipline.

2. **§17 visual self-loop as the primary quality safeguard.** The 6-criterion critique rubric (✗2 from pass-2, now in §17.5) gives the loop a concrete predicate-list to check; the round budget (3) gives it a stop-condition. But the loop's effectiveness still depends on the agent ACTUALLY running the rubric (vs ignoring it and shipping after one generic look). **Watch for** (per §19.10 telemetry): median `look_at_scene` calls per section authoring pass. Target: 1-3 calls. If the median is 0 (agent skips) or >5 (thrashing), the loop isn't calibrated. Mitigation: reinforce the rubric prominence in the prompt; don't add prescriptive primitives back.

3. **§16.7 chat-as-section vs v2's chat-as-band.** If users actively want chat content visually segregated from paper content, v3.1's tint differentiation may feel like dilution. **Watch for**: user feedback "I can't tell which sections are mine vs the paper's." If observed, raise chat-section tint opacity from 12 to 24, or re-introduce a soft `— Q&A —` divider between paper sections and the first chat section.

4. **§18 role palette saturation.** With 6 role colors plus kind-derived colors, canvas can become busy. **Watch for**: rendered diagrams that feel "rainbow-y." Mitigation: desaturate role palette toward narrower hue ranges, with kind:model preserving the saturated amber for pop-out.

5. **§16.5 eviction ceiling at 8.** Inherited from v2 §10.5 but now applies to a heterogeneous section mix. **Watch for**: users frequently re-expanding collapsed sections. Mitigation: raise N from 8 to 12, or rely on the manual pin gesture to handle the long-tail user.

6. **§17.5 soft authoring guidelines could be ignored.** Guidelines are prompt-only — no enforcement. **Watch for**: rendered whiteboards where compositional patterns vary wildly between sessions for similar concepts. Mitigation: surface guideline patterns more prominently in the prompt; do NOT add prescriptive primitives back wholesale (defeats the freedom benefit).

7. **§17.2.1.a sizeWeight discrete granularity might be too coarse.** 3 values (dominant / standard / subordinate) covers the example image but may not handle 4+ implicit ranks. **Watch for**: agent compositions where a "secondary dominant" tier is wanted. Mitigation: add `sizeWeight: 'secondary'` (1.2× or 1.3× multiplier) only when observed — don't preemptively.

8. **§17.5.a equation prose-fallback.** Pass-2 Q-v3.2-2 refinement requires faithful natural-language translation, not "see paper" hand-wave. If the agent still hand-waves, the user perceives "agent gave up." **Watch for**: math sections that say "see paper for the formula." Mitigation: tighten the equation discipline in the prompt; accelerate v3.3 KaTeX feature-flag default-on.

9. **§16.6.a cross-section edge tangling at long stacks.** Pass-2 Q-v3-4 ⚠. Camera composition + backlink button + AC-33 routing-around mitigate; if telemetry shows median y-distance >2000px between drill source and drill section, the visual debt compounds. Mitigation: aggressive camera pan or insert drilled sections nearer source.

## 20.3 What the reviewer did NOT review

Out of cog-reviewer scope per `.claude/skills/fathom-cog-review.md`:

- Code correctness, MCP wrapper logic, IPC plumbing, schema migrations — implementer's responsibility (whiteboard-impl).
- Performance / latency budget for `look_at_scene` round-trip, the section-band allocator, the streaming `updateScene` tick rate — performance review domain.
- Aesthetic preference where it doesn't intersect cog-load research (specific hex tints within the pastel range, font-weight nuances in Excalifont, exact Excalifont vs JetBrains Mono kerning).

## 20.4 Implementation-time checks the reviewer wants performed

In addition to the v2 §15.4 checks (carried forward unchanged):

1. **Visual-self-loop telemetry per §19.10.1**. Log `look_at_scene` call count per section authoring pass + elements added/modified between calls. Median target: 1-3 calls. Outliers (0 or >5) trigger prompt recalibration.

2. **Composition pattern recognition per §19.10.2**. Heuristic-classify each section by element types (ellipses + horizontal connects = number-line-like; circles + sequential connects = time-chain-like; etc.). Pattern-frequency telemetry lets us spot if the agent over/under-uses certain compositions.

3. **AC-1 / AC-2 / AC-39 / AC-40 fire rate in dev build**. Per §6 severity policy, FAIL ACs abort scene-load with console.error. Implementer should confirm all four FAIL ACs (text-overflow, shape-non-overlap, edge-crosses-node, L2-frames-overlap) fire on synthetic violations before declaring v3.1+v3.2 surface done.

4. **Role palette runtime audit**. Log role assignment per element to `fathom.log`. If the agent picks `role: noise` for a tensor input, that's a misclassification we need to spot in observed data.

5. **Cross-section edge length telemetry**. Track y-distance between drill-source nodes and their drilled sections. Median >2000px = visual debt is compounding; revisit either the bottom-append rule or the backlink-button prominence.

6. **A/B variant ship per §15.4.a**. Ship the 5 A/B variants (cross-section edge styling, section header height, provenance tint opacity, backlink button position, sizeWeight dominant multiplier 1.5× vs 2×) as runtime-toggleable. Dogfood for one week, pick by user feel, persist the picks in user preferences.

7. **6-criterion critique rubric exemplar references in agent prompt**. Per §17.5 iteration discipline, each round's critique should reference both good exemplars (the example image at `/Users/ashrya/.claude/image-cache/.../5.png`) and bad exemplars (v2's screenshot at `/tmp/fathom-shots/103015-whiteboard-after-fix.png` for what-to-avoid). Implementer should confirm both image refs are loaded into the agent's context at every authoring pass.

—

**Signed**: cog-reviewer-2, 2026-04-25.

The v3.2.1 spec is APPROVED for implementation. whiteboard-impl is unblocked to start the v3.1+v3.2 work. LABEL-1 (#61) and CKPT-1 (#62) continue v2-scope work in parallel. Frontmatter audit-status flips to APPROVED on next strategist edit.
