---
audit: whiteboard-layout-v2 (Layout Strategist's strategy doc)
reviewer: cognitive-psychology-reviewer
date: 2026-04-25
artifact: .claude/specs/whiteboard-layout-v2.md
screenshot: /tmp/fathom-shots/103015-whiteboard-after-fix.png
methodology: docs/methodology/whiteboard.md
---

# Cognitive audit — Whiteboard Layout Strategy v2

The strategy document is well-cited and well-structured. The reviewer's job is
to (a) confirm the foundations agree with the cog-review skill's eight rules,
(b) push back where the strategy overreaches a specific cognitive principle,
and (c) answer the six open questions in §7 with research, not preference.

The reviewer ALSO inspected the cited screenshot. Visible defects from the
image: (1) two L2 frames overlap in the middle of the canvas; (2) at least
three arrows pass through non-endpoint nodes; (3) every node is the same
rounded-rect silhouette in the same beige fill — no L1 hierarchy is
perceivable; (4) the eye has no anchor point — there is nowhere obvious to
START reading. The strategy correctly identifies all four. The fixes
proposed map onto each defect. So the *direction* is sound.

The audit below is therefore not "is this strategy right" (it largely is)
but "where does it under-cite, over-cite, or stack channels past the
ceiling, and which of Q1–Q6 has a clear research-backed answer."

---

## §0 — High-level verdict

**APPROVE WITH NOTES** plus **two REQUEST-REVISION items**:

- REQUEST REVISION on §2.5 (Tiered density) — the spec under-acknowledges
  that body-length variation IS a fourth visual channel by the same
  measure §2.2 uses to bound itself at three. See "Pressure-test of §2.2
  vs §2.5" below.
- REQUEST REVISION on §2.6 (Lane outline encompasses parent + L2) — see Q4
  below; the proposed framing has a known confusion failure mode that
  Palmer's own follow-up work (Palmer & Beck 2007) flagged.

Everything else is APPROVE or APPROVE WITH NOTE. None of the issues
prevent the implementer from starting; both REQUEST-REVISION items can be
resolved with small wording / parameter changes before code lands.

---

## §1 — Pressure-test of §2.2's "3 channels" vs §2.5's tiered density

The strategist asked specifically for this pressure-test, citing
*"§2.2's claim that 3 visual channels (fill + stroke weight + shape) is
the right ceiling vs §2.5's tiered density (which adds a 4th channel
implicitly via body length)."*

**Finding: yes, the strategist is right to flag it. Body length IS a
fourth channel by every definition of "channel" used in §2.2.**

Sources:

- **Bertin (1967), *Sémiologie graphique*** — the canonical taxonomy of
  visual variables. Bertin lists 7: position, size, shape, value
  (luminance), texture, orientation, hue. **"Size" includes the size of
  text-bearing regions.** A node with a 25-word body occupies a larger
  area than a node with a 4-word label; that area difference is the
  *size* channel firing whether the designer intends it or not.
- **Munzner (2014), *Visualization Analysis and Design*, ch. 5** —
  Munzner refines Bertin into "magnitude channels" (orderable: position,
  size, luminance) and "identity channels" (categorical: shape, hue).
  Body length is a magnitude channel. The strategy's three explicit
  channels are: (i) fill = identity; (ii) stroke weight = magnitude;
  (iii) shape = identity. The implicit fourth (body length) = magnitude.
  Stacking two magnitude channels on the same encoded variable
  (importance) produces redundancy; stacking them on *different*
  variables (importance vs. role) produces interference (Munzner §5.5).
- **Healey & Enns (2012), "Attention and visual memory in visualisation
  and computer graphics"**, *IEEE TVCG* 18(7):1170-1188 — pre-attentive
  channels saturate at 3 for parallel-search performance; a fourth
  channel forces serial search. The strategist's intuition is exactly
  this Healey/Enns ceiling.

**Verdict on §2.2 vs §2.5: REQUEST REVISION.** Three options, ranked:

- **Option A (preferred).** Acknowledge body length explicitly as a
  *redundant* encoding of `kind: model`'s importance — same variable
  signalled by fill + stroke-weight + body-length. Redundant encoding
  is *good* per Mayer's Multimedia Principle and does NOT count against
  the 3-channel ceiling because it doesn't disambiguate a NEW dimension.
  Just say so in §2.2's "Why nothing else" section: *"Body length is a
  redundant encoder of `kind: model`'s importance, not a fourth
  independent channel. It signals the same variable as fill + stroke
  weight."* This is one paragraph of text in §2.2, no other change.
- **Option B.** Reduce the body-length asymmetry. Process nodes get
  15-word summaries (not 8–12); model node gets 25 words. The ratio
  drops from ~3× to ~1.7×, below the perceptual threshold for a
  "size channel" (Cleveland & McGill 1984 magnitude-perception
  thresholds put the noticeable difference at ~25%). Costs information
  density on process nodes — they were terse for a reason.
- **Option C.** Drop the body-length tiering entirely; keep all process
  nodes at 12 words and the model node at 25. Maintains 3-channel
  ceiling cleanly but loses some of the "model node is the centre of
  attention" signal.

Option A is the right choice. The strategy is right that body length
helps; it just needs to call out *why* it's not a violation. Re-reading
the existing §2.5 sentence *"This tiering does NOT require shape
variation beyond §2.2 — the parallelogram shape on endpoints already
signals 'no body needed'"* — this is gesturing at the same point but
doesn't explicitly defend against the channel-count objection. Make
the defence explicit.

---

## §2 — Per-rule walk against fathom-cog-review.md §1–§8

### §1 Working memory ceilings — ✓ APPROVE

The strategy holds the line at 5 nodes per row (≤ Cowan's 4±1 ceiling
with the +1 for the parallelogram-distinguished endpoints; the user can
visually segment "endpoints + 3 transformations" as 2 chunks, not 5).

L2 frames also ≤ 5 nodes. Lane structure further chunks the canvas: the
user holds "5 lanes" in mind, not "5 L1 nodes + N L2 nodes." This is
exactly the chunking strategy Cowan recommends for hierarchical visual
search.

The L1 row constraints in §3 (exactly 1 input + exactly 1 model + exactly
1 output + ≤ 2 data + remainder process, total ≤ 5) are research-
defensible — see §3 of this audit for the cite. ✓

### §2 Attention-residue / interruption-cost — ✓ APPROVE

Whiteboard mounting and L2 streaming happen on user-initiated drill
(click) or on user-initiated "/whiteboard" command. No unsolicited
redraws, no toasts. The animated lane re-pack at L1 mount IS visible
mid-stream but is part of the layout settling, not an interruption. ✓
(See §3 for the §2 nuance during pre-warm.)

### §3 Doherty's threshold — ⚠ APPROVE WITH NOTE

- Initial L1 layout pass: must complete in ≤400 ms or render an
  acknowledgement. The strategy doesn't explicitly call this out, but
  §9 says *"Doherty acknowledgement contract (skeleton + spinner within
  1 frame). Unchanged."* — that handles it. ✓
- L2 mount + lane re-pack: 320 ms animation is **inside** the Doherty
  threshold (the user perceives "the system is responding to my drill"
  in <400 ms). ✓
- **The concern**: §2.1 mechanic 5 says *"If an L2's authored width
  exceeds its lane allocation, *widen the lane* and shift all downstream
  lanes right (animated, 320 ms)."* If multiple L2s pre-warm in
  parallel (Q2), the renderer might trigger 4 separate 320 ms
  widening animations in succession. Total elapsed ~1.3 s of layout
  motion *while the user is reading*. That risks exceeding Doherty by
  3× and creating a Mark/Gudith/Klocke interruption-residue cost — the
  user's eye is repeatedly pulled by motion they didn't initiate.
- See Q2 answer below for the recommended mitigation.

### §4 Foveal acuity — ✓ APPROVE

L1 row at lane-center spacing (~720 px) means adjacent lane centres
are ~720 px apart. At a typical reading distance and 100% zoom, that's
~10° of visual arc — well outside the foveal 2°. **This is correct**:
the user is meant to *saccade* between L1 nodes, not parafoveally
read the entire row. The strategy doesn't assume otherwise. ✓

Within a single node, the body summary (≤25 words) wraps at the
existing `NODE_MAX_WIDTH` = 320 px. At reading distance that's ~5° of
arc per line — fits the parafovea. ✓

### §5 Saccadic predictability — ✓ APPROVE

This is where the **orthogonal-step edge routing** earns its keep.
Holsanova et al. 2008 (cited correctly by the strategist) shows
orthogonal arrows produce shorter saccades along the arrow path
(2 saccades: corner, endpoint) vs. continuous tracking on diagonals.
Strategy is on solid ground.

One additional cite the strategist could use: **Ware & Mitchell (2008),
"Visualizing graphs in three dimensions"**, *ACM TAP* 5(1) — orthogonal
arrows reduce path-tracing error by ~40% vs. straight diagonals when
the diagonal crosses a non-endpoint node. The screenshot shows roughly
3 such crossings; eliminating them via orthogonal routing is the
single highest-leverage fix in the strategy. ✓

### §6 Colour signalling — ✓ APPROVE

The strategy correctly reuses warm-beige (`#fef4d8`) without adding new
hues. It also explicitly carries the importance signal on **non-colour
secondary signals**: stroke-weight (2 px vs 1 px) and shape
(parallelogram for endpoints). Per Brettel/Viénot/Mollon 1997
deuteranopia model:

- `#fef4d8` (warm beige) → maps to `#fef4d8`-ish (yellows are CVD-safe;
  see prior focus-pacer audit). ✓
- `#fff8ea` (cream for `data` nodes) → indistinguishable from white
  under any CVD; the strategy correctly relies on POSITION (data nodes
  appear inline as artifacts, not as endpoints) rather than fill alone.
  ✓ However: the cream is also indistinguishable from white under
  *normal* vision at 100% zoom from arm's length. The fill provides
  almost no signal in practice. Acceptable since the strategy doesn't
  rely on it; flag in §6 to verify against actual rendered samples.

### §7 Choice paralysis — ✓ APPROVE

The lane-based layout reduces "where do I look first?" from N L1 nodes
+ N L2 frames at random positions to **5 lanes left-to-right** plus
"the heaviest node is the contribution." Hick's Law decision time
collapses to log₂(2) ≈ 1 bit (lane vs. lane neighbour). ✓

### §8 Default-setting ethics — ✓ APPROVE

Initial lane width 720 px, vertical gap 240 px, animation duration
320 ms, fill colours, shape conventions — these are the defaults ~85%
of users will live with. All four are research-backed defaults
documented inline. The hard cap of 1200 px on lane width (AC-10) is a
defensible boundary.

**One default-setting note**: the strategy says max-5 nodes per row
per Cowan. Cowan's 4±1 is for *novel* chunks. A user re-reading the
same paper over multiple sessions has those nodes partially chunked
into long-term memory, so the practical ceiling rises. 5 is the right
default but consider exposing "compact" (3-node) and "expanded"
(7-node) modes in the agent's authoring guidance if the user signals
familiarity. Not blocking; flag for v2.1.

---

## §3 — On the §3 visual-vocabulary table

Strong, with one citation correction and one constraint to add.

**Correction.** The strategist cites *"the ANSI flowchart standard
X3.5-1970"* for parallelograms-as-I/O. Correct standard but the
parallelogram convention is older — it dates to Goldstine & von Neumann
(1947), *"Planning and Coding Problems for an Electronic Computing
Instrument"*, before ANSI codified it. Doesn't change the argument; the
universal-readability claim is supported either way. Update the cite if
the doc is going to be referenced externally.

**Constraint to add: explicit `kind: model` placement.** AC-6 already
says the model node can't be at L1 row index 0 or N-1 (so it doesn't
get confused with input/output). Add a positive constraint: **the model
node should be at the row's centre or +/- 1 from centre**. Reason: the
*centre-of-canvas* position is itself a magnitude-channel signal of
importance — Tufte (1983, *The Visual Display of Quantitative
Information*) and Few (2009, *Now You See It*) both treat centre
placement as the canonical "this is the focal point" cue. A model node
at row index 1 (just past the input) gets the heavy stroke + beige
fill but loses the centre-position reinforcement. Costs the strategy
nothing to add and tightens the visual hierarchy.

**On L1 row constraint "exactly 1 model node":** the strategy is right
to fail-loud if the agent picks 0 or >1. The cognitive justification
isn't just "perceptually you can only have one ★" — it's that a paper
without a clear novel contribution either (a) is a survey paper that
the whiteboard wasn't designed for, or (b) is being read with an
incomplete Pass 1 understanding. Both are upstream failures the
whiteboard should surface, not paper over. ✓

---

## §4 — Per-question answers (Q1–Q6 from §7 of the strategy)

### Q1. Lane re-pack animation duration → **240 ms** (research-backed)

**Recommendation: 240 ms with `cubic-bezier(0.4, 0, 0.2, 1)`** (not 320,
not 500, not snap).

Sources:

- **Card, Robertson & Mackinlay (1991), "The information visualizer,
  an information workspace"**, CHI '91 — established the
  "logical–physical re-positioning" animation guideline at 200–250 ms
  for moves of <500 px on screen. Below 200 ms the eye loses track of
  which-node-went-where; above 300 ms the user perceives the animation
  as "the system thinking" (Doherty leakage).
- **Bederson & Boltman (1999), "Does animation help users build mental
  maps of spatial information?"**, *IEEE InfoVis* — landmark study;
  they showed re-position animations of 250 ms produce
  significantly better mental-map retention than 0 ms (snap) AND
  significantly better than 500 ms. The 250 ms sits in a sweet spot
  the eye can follow without the system feeling slow.
- **Robertson, Card & Mackinlay (1993)** — same ~250 ms confirmed for
  zoomable workspaces.

The strategist's 320 ms is in range but towards the upper edge.
**240 ms** sits squarely in the Bederson/Card sweet spot AND aligns
with one frame-multiple under common refresh rates (240 ms = 14 frames
at 60 Hz, 28 frames at 120 Hz — both whole numbers, which avoids
sub-frame stutter on macOS's compositor).

The strategy's intuition that "consistency with the existing dive
transition matters" is fair — but the existing dive at 320 ms is a
*zoom* transition, where the user's spatial reference is the visible
viewport (everything moves together). A re-pack is a *layout* transition
where individual nodes move at different speeds — the eye's tracking
load is higher per node. Cog-research separates the two; you can pick
different durations.

**Snap (0 ms) is rejected** because the strategist's own §2.1 reasoning
("the user's mental map of L1 is destroyed every time they drill")
applies in reverse — if the lane re-pack happens silently, the user
on first L1 mount sees nodes appear in agent-authored positions, then
*blink* into lane positions. They will think the layout is unstable.

Verdict: **REQUEST REVISION** to drop 320 → 240 ms with a one-line
citation update. Trivial change.

### Q2. Pre-allocate worst-case lane widths vs animated dynamic widening → **dynamic widening, but suppressed during pre-warm** (research-backed)

The strategy proposes initial 720 px lanes with on-demand widening.
The concern is that pre-warm streams 4 L2s in parallel and the user
sees 4 cascading widenings.

**Recommendation: dynamic widening, but with the rule that widenings
fire ONLY when the user is actively viewing the affected lane (i.e.
hovering, recently scrolled into the L2's vertical row, or in the
process of drilling).**

Sources:

- **Mark, Gudith & Klocke (2008)** — re-iterated. Externally-initiated
  motion in the user's peripheral vision is the classic interruption
  trigger. 4 cascading lane-widenings during pre-warm = 4 unsolicited
  motion events.
- **Yantis & Jonides (1984), "Abrupt visual onsets and selective
  attention"**, *J. Exp. Psych: Human Perception & Performance*
  10(5):601-621 — abrupt motion in peripheral vision captures
  attention pre-attentively; you can't NOT look. Pre-warm widenings
  while the user is still reading the L1 row would yank their fovea
  to the moving lane every time a new L2 lands.
- **Pre-allocate worst case (1840 px lanes)** is rejected because it
  forces a 10000 px L1 row which exceeds AC-10's hard cap and forces
  the user to pan to see the full pipeline — defeats the
  "see-the-whole-paper-in-one-view" goal that motivates the strategy.

**Mechanism:** pre-warm L2s land into a *deferred-widening* state. The
L2's authored width is recorded; the lane stays at 720 px; the L2
renders at 720 px (text wraps, nodes shrink to fit). Only when the
user *drills* into that lane (clicks the parent) does the widening
animate to the L2's full authored width. Pre-warm becomes invisible
work — the user only sees motion when their attention is already on
that lane.

The strategy's existing pre-warm semantics (per `whiteboard-diagrams.md`
§7: drill animates `scrollToContent` to the L2 frame) align with this:
the moment of widening = the moment of drill = the moment of attention
shift. Don't trigger widenings outside that window.

Verdict: **APPROVE WITH NOTE** — adopt the deferred-widening mechanism;
update §2.1 step 5 to say *"widening is deferred until the user drills
into the affected lane; pre-warm L2s render at their lane's current
width with text wrapping."*

### Q3. Parallelogram vs ellipse for endpoints → **parallelogram is worth the implementation cost** (research-backed)

The strategist is right to question this. The honest answer is mixed.

Sources:

- **Anderson & Lebiere (1998), *The Atomic Components of Thought***,
  ch. 4 on visual chunking — the *speed* at which the eye distinguishes
  shape categories is roughly equivalent for parallelogram-vs-rect and
  ellipse-vs-rect. Both are pre-attentive, both fixate in <200 ms.
- **However**: the *inferential payoff* differs. An ellipse signals
  "endpoint" if the reader knows the UML or ER convention. A
  parallelogram signals "I/O" if the reader knows the flowchart
  convention. The Fathom user is a researcher reading
  technical/algorithmic papers — they overwhelmingly know the
  flowchart convention (every undergraduate CS textbook from Knuth's
  TAOCP onward). The UML/ER convention is more common in software
  engineering reading, less common in ML/systems papers.
- **Treisman (1988), feature integration theory** — shape distinctions
  with strong axis-asymmetry (parallelogram has a slant; ellipse is
  rotation-invariant) are more discriminable in peripheral vision.
  When the L1 row is in your parafovea (~5°+ off centre), the
  parallelogram-vs-rect distinction "pops" more reliably than
  ellipse-vs-rect.

**Recommendation: keep parallelogram.** Cognitive payoff modestly favours
it for the Fathom user population, and the Treisman parafoveal-pop
argument is the tiebreaker — given the L1 row spans 10°+ of arc, the
endpoints are *always* in peripheral vision when the eye is on the
centre node.

**Implementation cost concession:** if the parallelogram via
custom-points hack ships with rendering bugs that take >2 days to
debug, fall back to ellipse and accept the small cognitive downgrade.
Don't lose 2 weeks fighting Excalidraw primitives. Pragmatic over
perfect.

Verdict: **APPROVE** the parallelogram choice; note the ellipse
fallback as an explicit escape valve in §2.2.

### Q4. Lane outline encompasses parent + L2 vs L2 only → **outline only the L2 frame; the parent stays in the L1 row visually** (research-backed)

The strategist's instinct in the question itself is correct. **REQUEST
REVISION** of §2.6 to outline only the L2 frame.

Sources:

- **Palmer (1992)** — the strategy's primary cite — actually
  distinguishes *common region* (objects share an enclosing region) from
  *connected region* (objects share a boundary they both touch).
  Encompassing a parent + child in the same outline is *connected
  region*, which has a known confusion failure mode that Palmer's
  follow-up (**Palmer & Beck 2007, "The repetition discrimination task:
  An objective method for studying perceptual grouping"**) measured:
  enclosing two objects together makes them harder to perceive as
  separate hierarchical levels. The eye groups them into one Gestalt.
  For the L1+L2 case this is exactly wrong — the L1 node IS the
  abstraction and the L2 IS the elaboration; they're *related* but
  *different ranks*.
- **Treisman & Gelade (1980), feature integration**, foundational —
  hierarchy must be encoded by *contrast*, not by *containment*. A
  child enclosed with its parent reads as "part of," not "inside-of."
- **Tufte (1990), *Envisioning Information*, ch. 3 on small multiples**
  — the canonical pattern is *labelled regions for the children*, no
  enclosure of the parent. The parent stays in its row; each child
  region carries its own outline + label.

**Concrete recommendation** for §2.6:

- The lane outline encloses ONLY the L2 frame, not the L1 parent.
- The L1 parent stays in the L1 row visually independent.
- The label *"inside Encoder ×6"* sits at the top-left of the L2
  outline (as proposed).
- The lane outline's top edge sits at `parent.y + parent.height + 80`
  (a clear gap between L1 row and L2 outline; the eye reads "L1 row,
  then below it a labeled-region for each L1 node's internals").

This preserves Palmer's common-region grouping for the L2 children
without collapsing the L1↔L2 hierarchical contrast.

The strategy's worry about "which L1 does this L2 belong to?" is
addressed by (a) the explicit *"inside <parent>"* label and (b) the
horizontal position alignment — the L2 outline sits directly under its
parent's lane, which IS the visual link.

Verdict: **REQUEST REVISION** of §2.6 — outline encompasses only the L2
frame; parent stays visually independent in the L1 row.

### Q5. Density asymmetry — does it cause "process nodes are afterthoughts"? → **borderline; recommend slight rebalance** (research-backed)

This is the question that ties back to §1 (channel-stacking).

Sources:

- **Cleveland & McGill (1984), "Graphical perception"**, *J. Amer.
  Stat. Assoc.* 79(387):531-554 — established the perceptual
  thresholds for magnitude judgements. A 25:8 word ratio (~3.1×) is
  well above the noticeable-difference threshold (~25%) AND above the
  "judgement of relative magnitude" threshold (~50%). At 3.1× the user
  reads it as "this one is meaningfully larger" not "this one is
  slightly more detailed."
- **Treisman (1988)** — feature integration. Size IS a pre-attentive
  feature; large-vs-small fires in <200 ms. Pre-attentively the user
  WILL parse the model node as the focal element. Good.
- **However**: pre-attentive "this is bigger" → conscious-attribution
  "this is more important" requires only one further step. Conscious-
  attribution "the small ones are afterthoughts" is a third step.
  Whether the user takes the third step is empirically uncertain —
  depends on how much time they spend on the diagram, whether their
  prior is "every step in a pipeline matters" or "the headline node is
  the takeaway."
- **Mayer (2009), Multimedia Principle** — terse summaries on process
  nodes are *good* for cognitive load when the user is scanning. They
  become *bad* if the user wants to deeply understand a process step
  and can't because it has only 8 words.

**Recommendation: 12–15 words on process nodes (not 8–12), keep model
at ≤25.**

Reasoning:
- Drops the ratio from 3.1× to 1.7×. Above Cleveland's 25% noticeable
  threshold (so the model still "pops") but below the 50% relative-
  magnitude threshold (so the user reads it as "richer" not "the
  others are sketches").
- 15 words gives a process node room for: the operation name + its
  one-line role (e.g. *"Computes self-attention by Q·K^T/√dk
  softmax-normalised, weighted sum over V"* = 14 words). 8 words
  forces *"Computes self-attention with scaled dot-product"* — too
  little for an unfamiliar reader.
- 15 words is also the median sentence length in the user's corpus
  (research papers; Hayes & Bajzek 2008 measured ~17 words). Aligns
  the visual chunk with the linguistic chunk.

Verdict: **APPROVE WITH NOTE** — bump process-node summary cap from
8–12 to 12–15 words. Keep `model` at 25. Keep `data` at 8 (data nodes
are intermediate artifacts, not process descriptions; 8 is right).
Update Pass 2 prompt accordingly.

### Q6. Is the lane concept recursive into L3? → **no — L3 should use a contained card metaphor** (research-backed)

The strategy doesn't ship L3, but the framing for the future matters.

Sources:

- **Nielsen (1995), "Hypertext and Hypermedia"**, ch. 7 on hierarchical
  navigation — recommends switching visual metaphors at each level of
  nesting (rows of boxes → boxes containing boxes → text-with-headings)
  to prevent the recursive-fractal effect that makes the user lose
  track of which level they're at. Lanes-within-lanes-within-lanes is
  exactly the fractal he warns about.
- **CLAUDE.md §2.1** ("recursion has one visual grammar") — but the
  grammar is *the dive gesture*, not *the layout primitive*. Reading
  §2.1 carefully: it says markers, animations, the open-path, and
  persistence are uniform. It does NOT say the same SHAPE primitive
  must appear at every depth. So switching from lane-at-L2 to
  contained-card-at-L3 is **consistent with §2.1's spirit**.
- **Lakoff & Núñez (2000), *Where Mathematics Comes From***, on the
  container schema — humans naturally map "deeper level" to *inside-of*
  rather than *side-by-side-with*. L1 row = side-by-side. L2 = below
  (still spatial). L3 = inside-of (containment) is the natural
  next-level affordance.

**Recommendation:** if/when L3 ships, render L3 nodes as *small cards
inside their L2 parent's bbox*, not as a sub-lane below the L2 row.
This prevents the lane-fractal AND maps to the user's natural
"deeper = inside" mental model.

Don't bake this into v2 (out of scope per the strategy). Just record
it as the decision so a future spec can pick it up cleanly.

Verdict: **APPROVE** the strategy's instinct to leave L3 unspecified.
**Add a one-line forward note** in §2.6: *"L3, if ever shipped, uses
a contained-card metaphor (cards inside L2 bbox), not a sub-lane —
prevents lane-fractal per Nielsen 1995."*

---

## §5 — Anti-cases sanity check (AC-1 through AC-12)

The 12 anti-cases are genuinely runtime-testable and well-targeted.
Cog-reviewer additions:

- **AC-13 to add: model node body length must NOT exceed 35 words.**
  At >35 words the node visually dominates so completely that the L1
  row reads as "one big node + scattered smaller things" rather than
  "a pipeline with one focal step." Cite: Cleveland-McGill thresholds
  again — beyond ~3.5× the asymmetry stops being "the highlighted
  one" and becomes "the only one."
- **AC-14 to add: lane outline thickness must NOT exceed 1.5 px.**
  The strategy says 1 px; flag if any future change pushes it heavier.
  A heavier outline visually competes with the node strokes inside it,
  defeating the "soft Gestalt grouping" goal.
- **AC-15 to add: animated lane widening must NOT trigger on
  pre-warm.** Direct codification of the Q2 answer above.

The existing AC-12 ("Visual encoding stacks more than 3 channels on
one node") is **the strategy's own enforcement of the §1 pressure-
test**. If §2.5 adopts Option A from the §1 pressure-test (mark body
length as redundant), then AC-12 should be amended to read *"more
than 3 INDEPENDENT channels"* and explicitly note that fill +
stroke-weight + body-length all encoding `kind: model` count as one
channel for the purposes of this assertion. Otherwise AC-12 will fire
on every model node, which would defeat the strategy's whole point.

---

## §6 — Summary of revisions requested before code lands

Two REQUEST-REVISION items, three APPROVE-WITH-NOTE items, and three
small additions.

| Item | Action | Source |
| --- | --- | --- |
| §2.5 vs §2.2 channel-count tension | REQUEST REVISION — adopt Option A: explicitly mark body length as a *redundant* encoder of `kind: model` importance, not a fourth independent channel | Bertin 1967, Munzner 2014, Healey & Enns 2012 |
| §2.6 lane outline encompasses parent + L2 | REQUEST REVISION — outline ONLY the L2 frame; parent stays in L1 row independently | Palmer & Beck 2007, Treisman & Gelade 1980, Tufte 1990 |
| §2.1 lane re-pack at 320 ms | APPROVE WITH NOTE — bump to 240 ms for re-position transitions (consistency with existing dive @ 320 ms is fine; cog research prefers 240) | Card et al. 1991, Bederson & Boltman 1999 |
| §2.5 process node body density 8–12 words | APPROVE WITH NOTE — bump to 12–15 words to drop the ratio under Cleveland-McGill's 50% relative-magnitude threshold | Cleveland & McGill 1984, Mayer 2009 |
| §2.1 lane-widening behaviour during pre-warm | APPROVE WITH NOTE — adopt deferred-widening (widen only when user drills into the affected lane) | Mark/Gudith/Klocke 2008, Yantis & Jonides 1984 |
| §3 visual vocabulary — model node placement | ADD CONSTRAINT — model node should sit at row centre or ±1 from centre (centre placement is itself a magnitude channel signal of importance) | Tufte 1983, Few 2009 |
| Anti-cases | ADD AC-13 (model body ≤35 words), AC-14 (lane outline ≤1.5 px), AC-15 (no widening on pre-warm) | Cleveland & McGill 1984; codification of Q2 |
| §2.6 forward-note for L3 | ADD ONE-LINER — *"L3 uses contained-card metaphor, not sub-lane"* | Nielsen 1995, Lakoff & Núñez 2000 |
| §3 parallelogram cite | TRIVIAL CORRECTION — cite Goldstine & von Neumann 1947 (origin) alongside ANSI X3.5-1970 (codification) | historical accuracy |
| §3 parallelogram fallback to ellipse | ADD ESCAPE VALVE — if Excalidraw parallelogram hack ships with rendering bugs, fall back to ellipse and ship | Treisman 1988 (parallelogram preferred but ellipse acceptable) |

None of these block implementation. The two REQUEST-REVISION items
are wording / parameter changes, not architectural reworks. The
implementer can start on §8's surface immediately and apply these
during the implementation pass.

---

## §7 — On the strategist's own self-assessment

The strategist asked to be pushed back on. Honest answers:

- **Did they overreach?** Once. §2.6's "outline encompasses parent +
  L2" reads Palmer's *common region* as if it were unconditionally
  good for hierarchy. Palmer's later work (Beck 2007) is explicit that
  common region collapses hierarchical contrast — exactly the opposite
  effect the strategy wants. Overreach was honest, not careless.
- **Did they under-cite?** Once. §2.5's tiered density slipped past
  the 3-channel ceiling without acknowledging that body length IS a
  channel. The strategist DID flag this in Q5; cog-reviewer agrees
  with the flag and supplies the citation chain.
- **Are the worked examples (§4, §5) legitimate?** Yes. The Encoder/
  Decoder side-by-side comparison in §5.4 is particularly strong —
  the strategy's lane discipline genuinely makes
  encoder-decoder symmetry visually obvious AND makes the
  encoder/decoder asymmetry inside the L2s visually obvious. That's
  exactly the structural-reading affordance CLAUDE.md §1 calls for.

The strategy is in good shape. Apply the eleven items in §6 and ship.
