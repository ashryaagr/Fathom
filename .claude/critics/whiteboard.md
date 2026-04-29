---
name: whiteboard-critic rubric
type: critic-rubric
audience: every spawn of whiteboard-critic, in perpetuity
---

# Whiteboard critic rubric — durable, user-derived

This file is the standing rubric for `whiteboard-critic`. Every spawn of
whiteboard-critic must `Read` this file as its first action and grade
every render against the bar below.

The rubric grows over time as the user critiques renders. The
orchestrator appends to this file after every user critique (per CLAUDE.md
§0 "Critics are user proxies — every user critique becomes durable critic
rubric"). Older entries are not retired without an explicit user revision.

The critic grades the **rendered image only** — never the implementation,
spec, prompts, or agent reasoning chain. Implementation context biases the
grade and must be ignored.

**The critic verifies AGENT-GENERATED output, never hand-authored scenes.**
Hand-authored scenes are designer mockups; they prove nothing about whether
the agent + MCP tools + visual self-loop + ACs actually produce good
whiteboards. If a render arrives with the caption "hand-authored,"
respond with "rescinded — only grade agent-generated output." Hand-authored
work is never the product.

**Critic feedback drives PIPELINE changes, not artifact tweaks.** When the
critic finds an issue, the recommended next-render ask must target a
modifiable layer of the pipeline:
- *Prompt*: "PASS2_SYSTEM should add a worked example showing math
  callouts as text-not-shape" (fixes future agent runs).
- *MCP tool*: "`create_callout_box` should default opacity 0.30 not 0.50"
  (fixes the primitive).
- *AC*: "AC-TEXT-FIT mode-B's char-width estimate undercounts Excalifont
  by ~10%; raise to 0.70 from 0.625" (fixes the validator).
- *Spec*: "v3.2.1 §17.5 should explicitly state that math sections forbid
  rect containers, not just suggest" (fixes the rules the agent reads).
The critic should NOT recommend "the implementer should hand-edit the
scene to fix box X" — that's tweaking an artifact, not improving the
product. Every recommendation is an upstream fix.

**Geometric defect classes the critic MUST scan for explicitly on every
render** (added 2026-04-27 after the round-9 critic APPROVED a render
with three user-visible structural defects). The critic's prior pattern
of "look for the rule violations and miss the geometric collisions" is
a known failure mode. Before issuing any verdict, run a *geometric
checklist* over the rendered PNG:

1. **Zone-vs-zone overlap.** Does any background zone partially cover
   another zone in a way that obscures content? (Round-9 instance:
   INPUTS purple zone only partly covering the multi-view blue zone.)
2. **Text-vs-container overflow.** Does any text element extend past
   its visible parent container's right or bottom edge — including
   nodes, callouts, zone-labels, section-subtitles, node-question
   subtitles? (Round-9 instance: multi-view box body text extending
   outside the box.)
3. **Arrow-path-vs-text crossing.** Does any arrow line (the path,
   not the label) cross OVER a text element along its route? Note
   that round 9 added arrow-LABEL collision check at the wrapper
   layer; arrow-PATH crossings still need to be visually graded
   until the wrapper covers them too. (Round-9 instance: arrow from
   SLAT Flow + RVC to 3D mesh crossing text below.)
4. **Element-vs-element overlap.** Does any pair of nodes,
   callouts, or labelled regions partially overlap each other in
   the rendered pixels? Pixel inspection is required — element
   bbox math can read OK in JSON while the PNG shows pixel overlap
   due to padding or stroke width.
5. **Template bbox containment (round 13+).** Every templated
   section's bbox is contained within its parent section's bbox.
   The wrapper-side bbox-fit-check at \`instantiate_template\`
   rejects calls that would overflow, so a properly-shipped scene
   is overlap-free by construction; the critic confirms by visual
   inspection that no template's right edge or bottom edge crosses
   its parent section's edge in the rendered PNG. If it does, the
   wrapper's bbox-prediction undercounted (a tunable defect — log
   the predicted vs actual delta in the verdict).

If any of (1)–(5) is present, the verdict is at least ITERATE
regardless of whether the rule-based axes (modality, color, framing,
question-as-answer, ground-problem terminus, template-fit) are clean.
Geometric defects FAIL even if the content is correct — they make
the diagram unreadable, which is a higher-priority failure than any
content nuance.

The critic is also to recommend, alongside the verdict, that the
harness adds the corresponding **tool-layer rejection** so that future
agent runs cannot ship the same defect — per the strong-vs-weak ask
rule below. A verdict of "ITERATE: zone-overlap on multi-view"
without a tool-layer ask is itself an incomplete grade.

**For STRUCTURAL defects, recommend tool-level fixes, not prompt-level
fixes.** Established 2026-04-27 (CLAUDE.md §8 "Tools enforce
constraints; prompts only guide intent"). Structural defects are the
class where a fast geometric check at tool-call time would have caught
the impossibility: text overflowing a container, elements overlapping,
labels colliding with other elements, lines crossing labelled regions,
callout text outside callout bounds. For these, the *kind* of
recommendation matters as much as the substance:
- WEAKER ask: "PASS2_SYSTEM should add a rule that text must fit inside
  callouts" (asks the agent, via prose, to do the right thing).
- STRONGER ask: "MCP wrapper for `create_callout_box` should compute the
  wrapped body height at the callout's inner width and reject the call
  with a precise error if the supplied callout height is too small —
  e.g. 'body text wraps to 5 lines × 24px lineH = 120px, but callout is
  80px tall; raise height to ≥160px or shorten body.'" (makes the bad
  output literally impossible to emit through the tool).
The critic should default to the STRONGER ask for any defect that has a
geometric definition. Prompt-level recommendations are reserved for
*content-quality* defects (term-of-art, question framing, depth of
explanation, modality choice) where the tool layer cannot statically
detect the failure. A critic ask of "PASS2_SYSTEM should tell the agent
to avoid X" where X is a measurable geometric condition is itself a
critic failure mode — the recommendation should be re-aimed at the
tool wrapper.

---

## Reference image (the floor, not the ceiling)

The user pasted a flow-matching DiT whiteboard early in the v3 design
phase. It showed 3 vertical sections (architecture / mathematical
formulation / discussion), each section using a *different* visual
modality appropriate to its content. That is the v3.x quality bar.
Single-row pipelines of plain boxes are below that bar regardless of
palette/AC cleanliness.

## Design grammar (user-stated, 2026-04-26)

### 1. Background zones group meaning, not shapes

A whiteboard's first design move is to identify the 2–3 conceptual
regions of the explanation and drop those as faint background zones
(roughly 30% opacity). Then place labeled shapes inside the zones.
The zones do the categorization so the inner shapes don't have to.

Examples of valid zone framings:
- "INPUTS / EMBED-PROJECT / OUTPUT"
- "UI layer / logic layer / data layer"
- "Input / Process / Output"

Grading consequence: a render with no zones, or with zones that don't
correspond to actual conceptual regions of the explanation, is
ITERATE or REJECTED depending on severity.

### 2. Color carries semantic load

The color mapping is fixed:

| Color | Role |
|---|---|
| Blue | input / source |
| Green | success / output |
| Amber / yellow | notes / decisions |
| Red | error / critical |
| Purple | processing / special |

Every shape's fill is making an assertion about its role. Picking
colors aesthetically (e.g. "this section is purple because it goes
with the purple zone above") is wrong — colors are labels.

Grading consequence: a render where colors don't match the role of
their shapes is ITERATE. A render where every shape is the same color
is REJECTED unless the explanation genuinely has no role distinctions.

### 3. Camera is narration

`cameraUpdate` should be used heavily. The camera controls attention
while the diagram streams in. Plan camera moves *first*, then build
the diagram around them:
- Title close-up
- Wide shot of the whole flow
- Zoom into a detail
- Pan across actors in a sequence
- Wide shot again

This structure is what makes a whiteboard feel like a lecturer at a
board rather than a static graphic.

Grading consequence: a v3.x render with no camera plan or with
arbitrary camera moves (zoom that doesn't track the explanation) is
ITERATE.

### 4. Progressive emission (array order = z-order = streaming order)

The agent must emit shapes in narrative order: shape, then its
label, then its outgoing arrow, then the next shape. NOT "all
rectangles first, then all text, then all arrows."

This is what makes the draw-on animation read like building an idea
step by step.

Grading consequence: detectable from element ordering in the scene
JSON. Sorted-by-type ordering is ITERATE.

### 5. Three modes; pick the right one for the content

The Excalidraw guide doesn't formally name these but the examples
train recognition:

- **Structured mode** (sequence-flow example) — formal columns,
  dashed lifelines, labeled message arrows. For parallel actors
  exchanging messages.
- **Animation mode** (snake example) — draw, delete, redraw with new
  ids to fake motion. For things that change over time.
- **Plain whiteboard mode** — labeled shapes and arrows scattered
  with intent. For free-form explanations with annotations.

A v3.x render must pick the mode that matches the content. A render
that uses plain mode for a sequence-of-messages explanation, or
structured mode for a definition-with-parts, is ITERATE.

### 6. Format-choice decision rules (user heuristics)

The user's mapping (not formally documented in the Excalidraw guide;
extracted from their feel):

| Content shape | Right format |
|---|---|
| Sequential (clear before/after) | Flow with arrows L→R or top→bottom, zones for phases |
| Parallel actors talking to each other | Sequence diagram (lifelines + messages) |
| Nested / hierarchical structure | Containment via zones, **not** arrows |
| Definition / concept with parts | One big illustration in the middle, callouts pointing at it |
| Changes over time | Animation mode (delete + redraw) |
| Formula / piece of math | Big text element + colored box around the right-hand side, **no shapes** |

Grading consequence: the critic must judge whether the agent picked
the right format for the content. Format mismatch (e.g. boxes-and-
arrows for a math formula) is ITERATE; persistent format mismatch
across the canvas is REJECTED.

### 7. Template-fit (round 13)

Round 13 introduced a template library — pre-arranged primitive
bundles for the most common explanation patterns (\`flow-chart\`,
\`comparison-matrix\`, \`time-chain\`, \`key-insight-callout\` in
round 13; more in round 14+). Templates own their geometry by
construction; using the right template for the right section gives
a fitted, overlap-free render in one call instead of 10-30 primitive
calls.

Each section that uses \`instantiate_template\` was authored against
a specific template. Grade whether the chosen template was the
*best* fit for the section's content:

- A "compare 4 methods on 3 metrics" section that used \`flow-chart\`
  instead of \`comparison-matrix\` is a template-fit defect — the
  matrix shows all 12 cells at once; the flow-chart loses that
  structure. Severity: **ITERATE** (not FAIL — the render is
  technically correct, just suboptimal).
- A "denoising step / iterative refinement" section that used
  \`flow-chart\` instead of \`time-chain\` loses the temporal
  reading; severity: ITERATE.
- A "thesis sentence" section that used \`create_callout_box\`
  primitive instead of the \`key-insight-callout\` template is a
  fit miss too — the template version gets the round-14 cross-
  template linking for free. Severity: ITERATE (low-priority).
- A section that used primitives-mode but a P0 template would have
  fit cleanly is also ITERATE — cite the missed template by id.

Always recommend the better template by id and cite the
\`fitSignals\` match from the catalog (\`scripts/template-catalog.json\`).
Recommendation should target PASS2_SYSTEM's worked-example block or
the catalog's \`fitSignals\` field, not a per-render hand-edit. Per
CLAUDE.md §0 "Critics are user proxies — every user critique becomes
durable critic rubric"; template-fit grading is itself a rubric
upgrade vs round-12.

**Anti-failure mode**: a render that uses 4 templates but the SAME
template (e.g. four flow-charts back-to-back) is its own template-fit
defect — diversity of modality across sections is the point of the
catalog. Multiple instances of the same template inside ONE section
are fine (a comparison-matrix + a key-insight-callout below it);
multiple sections using the same template is ITERATE if a
better-fitting template existed.

Round 13 implements only 4 of the 19 catalog entries (P0 set). For
section shapes whose best-fit template is round-14 (P1) or later,
primitives-mode is the correct path — flag this in the verdict as
"primitives-mode acceptable for round 13; round-14 will add
\`<templateId>\`" rather than as a defect.

## Carry-forward rules from prior user critiques

- **Plainness is a downgrade signal** (verbatim user critique
  2026-04-26): "this whiteboard is too plain — I want adaptive
  modality charting." A whiteboard that explains everything as
  boxes-and-arrows is automatically ITERATE or REJECTED.
- **Modality must adapt to content** (verbatim user critique): "the
  charting needs to adapt to the kind of explanations that I want."
  Modality match is itself a grading axis. A canvas with 3 sections
  where all 3 use the same modality is ITERATE — even if each
  individual section is internally clean.
- **AC reports do not substitute for visual judgment**. "AC: 0 fails
  0 warns" is necessary but not sufficient. The critic's job is the
  visual + cognitive grade the AC can't capture: does the diagram
  *explain*? Does it adapt? Does it look like something a human
  teacher would draw on a whiteboard?
- **Section numbering must be sequential — 1, 2, 3, not 1, 3, 5**
  (verbatim user critique 2026-04-27: *"we mentioned 1, 3, and 5,
  whereas 2 and 4"*). The whiteboard's own section numbers are a
  presentation device, not the paper's section numbering. Sequential
  numbers signal a complete arc; gaps signal "you skipped something."
  Grading: any gap in section numbering is ITERATE.
- **Equations must be explained in depth — every symbol, intent, and
  mechanism** (verbatim user critique 2026-04-27: *"whenever we
  mention equations, we should explain them in depth: what they
  mean, what they intend to do, and explain each and every part of
  that equation"*). A bare equation with a one-line caption is not
  enough. For each equation:
    - State what the equation IS (name, role: loss / update rule /
      sampling step / etc.)
    - State its INTENT (why this exists in the paper, what it
      computes, what failure mode it addresses)
    - DECOMPOSE every symbol on both sides — name it, state its
      type / shape, explain its role in the formula
    - Where multi-equation, state how they CHAIN (output of one
      feeds input of the next)
  Bare equations downgrade to ITERATE. Whitespace is not the
  enemy here; under-explanation is.
- **Containers must fit their content — no oversized empty boxes**
  (verbatim user critique 2026-04-27: *"in the fifth element, the
  box is way bigger than the text"*). Callouts, zones, and section
  frames must size to their content with consistent padding (~24-32
  px), not arbitrary fixed dimensions. A green KEY IDEA callout that
  is 600 px wide for 200 px of text is wrong. Grading: visible
  whitespace > ~50% of container area is ITERATE.
- **Layout must respect global bounds — local elements that overflow
  globally are bugs** (verbatim user critique 2026-04-27: *"how is
  the explanation for equation 6, equation 7, and equation 8? They
  are all in a straight line and that moves out of the global box.
  We also have to think that, whenever we are adding an element
  locally, how does it look globally?"*). Every element's bounding
  box must sit inside its parent section's bounding box; multi-
  equation explanations on a single line that overflow the canvas
  are FAIL-class. Wrap, line-break, or split into per-equation
  paragraphs. Grading: any element extending past its section's
  right/bottom edge is ITERATE; a long single-line annotation that
  visibly overflows is the canonical instance.
- **Two-pass authoring — plan content first, then place with
  global-layout discipline** (architectural critique 2026-04-27,
  user verbatim: *"our method for generating charts is separated
  into two different parts: 1. When we decide the core logic as to
  what you want to put. 2. The next step when we actually go ahead
  and create the charts. When creating the charts, you have to keep
  these layout principles, global consistency, etc., in mind."*).
  An ITERATE-class signal that the agent skipped the planning pass
  is: visible inconsistency in section sizing, a section that runs
  off-canvas, a callout with wrong proportions, an equation
  annotation that overflows. These are evidence the agent was
  emitting tool calls without first reasoning about global layout.
  Grading: persistent layout inconsistencies (≥2 sections with
  proportion or overflow problems) is REJECTED — the agent didn't
  plan before placing.
- **Text inside any container — including callout bodies — must
  stay inside the container's visible bounds** (verbatim user
  critique 2026-04-27: *"the text in the box three is coming out
  of the box. That should not happen. We should have structural
  ways to make sure that this does not happen."*). The "structural
  ways" framing is load-bearing: this is a hard FAIL on the
  pipeline, not a soft visual nudge. Coverage must extend to ALL
  text-in-container element types, regardless of how the underlying
  primitive is emitted. The known historical gap was callout-body
  text being emitted as FREE excalidraw text (containerId=null)
  with `fathomKind: 'wb-callout-body'`, which the existing
  AC-TEXT-FIT and AC-PARAGRAPH-WIDTH-FIT predicates intentionally
  skipped. That gap is the canonical instance of this rule's
  violation. Pipeline-modification ask: (a) wrapper-side, the
  callout primitive (and any other "free text inside a
  container" primitive) must size its container from a
  width-aware text wrap, not from raw line count; (b) AC-side, a
  hard FAIL predicate must check that every text element with a
  visually-implied parent container — callout-body, callout-tag,
  zone-label, section-subtitle, etc. — fits inside that container's
  bbox minus padding. Grading: any visible text-overflow past a
  container's right or bottom edge is FAIL-class regardless of
  element type or how the agent chose to emit it.
- **Components must be framed as answers to ground-problem
  questions, not as standalone parts** (verbatim user critique
  2026-04-27: *"when we are listing the modules or different
  components, it might help to understand things in a way that
  asks what is the answer that each component is answering. For
  example… cross-attention to dyno v3 patches helps us answer:
  what does the 3D point look like in each photo? Sparse
  self-attention can help answer in this specific problem…
  how does this point relate to its neighbors? Which view should
  I trust here? … the user is very much focused and oriented
  towards how everything connects to the ground problem rather
  than just how these details are interconnected."*). Every
  whiteboard node, callout, and inline annotation that names a
  component, mechanism, equation, or sub-system MUST be paired
  with a visible question that the component answers — and that
  question must trace back to the paper's ground problem (the
  end goal the paper is solving), not to another component.
  Examples:
    - Wrong: node label "Cross-attention to DINOv3 patches" with
      no question, OR with the question "how does it interact
      with the encoder?" (component-to-component, no ground
      problem terminus).
    - Right: node label "Cross-attention to DINOv3 patches" with
      visible subtitle/annotation "→ what does this 3D point
      look like in each photo?" (question terminates at the
      paper's reconstruction goal).
  Grading: ITERATE if any named component lacks a visible
  question-as-answer framing. ITERATE if questions connect only
  to other components instead of to the ground problem. The
  ground problem must be ascertainable from the paper digest;
  the agent should declare it once at the top of the canvas (a
  thesis line, the paper's end-goal sentence) and every node's
  question must trace back to it. This is a higher bar than
  "modality matches content" — modality match is necessary but
  not sufficient; explanatory orientation toward the ground
  problem is a separate axis. APPROVED requires both.

- **APPROVED**: meets the reference-image bar. Multi-section,
  modality-matched-to-content, clear visual hierarchy via
  `sizeWeight`, paper figures embedded where load-bearing, semantic
  color mapping correct, zones present, camera plan coherent, no
  AC violations.
- **ITERATE**: multi-section but uneven (one section great, another
  plain; modalities match content but colors don't; camera moves
  exist but don't track explanation; etc.). Specific feedback
  required: "section 2 is plain — should use math-callout modality
  for its equation"; "color of node X doesn't match its role."
- **REJECTED**: single-modality canvas; single-row layouts with no
  sections; plain boxes-and-arrows when the paper has math/figures/
  temporal narratives the agent ignored; format mismatch across the
  canvas (e.g. sequence-of-messages rendered as flowchart); no zones;
  uniform color palette.

## Critic output format

Always emit:
1. Top 3 issues, ordered by severity (FAIL > WARN).
2. For each issue: which design-grammar rule it violates (e.g.
   "violates rule 2 — colors don't match role").
3. Verdict: APPROVED / ITERATE / REJECTED.
4. If ITERATE or REJECTED: one or two concrete next-render asks
   ("collapse the architecture box hierarchy from 7 nested rects to
   3 + zones"; "convert section 2 to math-callout modality").

The implementer iterates on your asks. You re-grade. Loop closes when
APPROVED.
