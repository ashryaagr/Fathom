---
name: fathom-tool-design
type: skill
audience: any agent extending or reviewing Fathom's MCP tool surface
established: 2026-04-27 (round 9 user critique)
---

# Tool design — wrappers enforce constraints; prompts only guide intent

This is a CORE engineering principle in Fathom (CLAUDE.md §8). Read it
before adding to or reviewing any MCP tool wrapper, especially one that
accepts geometric inputs (x, y, width, height, text body, label).

## The principle in one line

> When the agent's call would produce an invalid artifact, the **tool**
> should reject the call with a precise error stating which constraint
> failed and what would satisfy it — NOT the prompt should warn the
> agent in advance.

## Why

We have spent rounds 1-8 of the whiteboard build cycle adding prompt
rules ("text must fit," "labels must not overlap," "callouts size to
content"). Each prompt rule is a *guideline* the agent may forget,
under-budget, or override. The user's verbatim critique on round 8:

> *"We should have structural ways to prevent this, or tools can just
> simply do the computation and let the tool know when it's going to
> get out of the box or when something's going to overlap, so that
> these kinds of problems don't happen. We need to fundamentally
> think, rather than just improving the prompt, on how we can make
> better tools and … better agent harnesses."*

A constraint enforced in the wrapper:
- runs every call (no forgetting)
- gives the agent a *concrete* error with measurements + suggested fixes
- becomes a forcing function — the bad output is literally impossible
  to ship through that tool
- composes with other constraints automatically (every tool's wrapper
  enforces its own slice; the union is the system invariant)

A constraint enforced only in a prompt:
- depends on the agent reading and remembering the rule
- fires *after* the bad output is in the scene (AC-fail)
- is silently weakened by every new prompt rule that competes for
  attention
- requires another iteration round when the agent ignores it

ACs are still useful as belt-and-suspenders / future-regression catch.
But the long-term goal is: **every AC-FAIL class becomes a wrapper-
rejection class**, and AC-FAIL counts trend toward zero.

## When to apply

Trigger this principle whenever a tool wrapper accepts:
- coordinates (x, y) where the result must sit inside a parent bbox
- dimensions (width, height) that must accommodate text or other content
- text strings whose rendered size depends on font/wrap/line-height
- IDs that must reference existing scene elements with valid relationships

For each such input, the wrapper's job is:
1. **Compute** the predicted result (bbox, wrap, collision surface).
2. **Check** the result against the constraint (fits in parent? no
   collision with siblings? no broken reference?).
3. **Decide**:
   - Constraint satisfied → emit normally.
   - Constraint violated AND auto-correctable (e.g. height too small for
     body wrap) → auto-correct + log a debug line.
   - Constraint violated AND NOT auto-correctable → reject with a
     precise error.

## Worked examples (round 9)

### Example 1 — `connect_nodes` arrow-label collision check

The agent was emitting arrow labels whose default-position bbox landed
on top of node-question subtitles below sibling nodes. The render
showed overlapping glyphs; the user flagged it as "the text on the
arrow on the generate column overlaps with the text below SS Flow."

**Old behavior**: tool emits the arrow + label at midpoint, no check.
The agent has no way to know about the collision until it looks at the
rendered output (and even then, easy to miss in a dense column).

**New behavior**: wrapper computes the label's bbox at the arrow
midpoint (label-text-length × char-width × font-size), iterates
`state.elements`, and rejects the call if the label bbox overlaps any
non-endpoint, non-pseudo, non-zone element. The error includes:
- the offending label and its predicted bbox
- the colliding element(s) by id + fathomKind + truncated text
- a `labelOffset: {dx, dy}` suggestion the wrapper has already verified
  is collision-free (small grid search around the midpoint), OR an
  instruction to shorten the label if no nearby offset is free.

```
connect_nodes: arrow label "T_g (global)" at midpoint (940,395) size ~84×20px
collides with 1 element(s): wb-question-029 (wb-node-question, "→ where in 3D
should the object's mass live?"). Try `labelOffset: { dx: 0, dy: -28 }` —
wrapper verified that offset is collision-free.
```

The agent reads the error, sees the suggested offset, retries with
that offset, and the call succeeds. The bad output never ships.

### Example 2 — `create_callout_box` auto-grow + reflow

The user reported "the fourth line of the KEY IDEA is going out of the
box." Round 7 had already added wrap-aware sizing — the wrapper did
predict the body's wrapped line count and grow the callout's height to
fit. But the prediction used a char-width of 10 px @ fontSize=16, and
Excalifont actually renders closer to 12 px/char on average. The
wrapper predicted N lines; the renderer drew N+1 or N+2; the trailing
line spilled.

**New behavior**: wrapper bumps char-width estimate from 10 → 12 (more
conservative) AND re-flows the body text with explicit `\n` line
breaks before emitting it, so the renderer paints exactly the wrap the
wrapper sized for. The prediction and the render are now the same
operation, not two estimates of the same thing.

```typescript
const CALLOUT_BODY_CHAR_W = 12; // was 10; bumped to match Excalifont's wider rendering
const reflowedParas: string[] = [];
for (const para of args.body.split('\n')) {
  const wrapped = wrapToWidth(para || ' ', CALLOUT_BODY_CHAR_W, innerW);
  totalLines += Math.max(1, wrapped.length);
  reflowedParas.push(wrapped.join('\n'));
}
const reflowedBody = reflowedParas.join('\n');
// emit text element with reflowedBody, NOT args.body
```

The wrapper auto-grows the callout to fit the predicted wrap (this was
already true in round 7) AND pre-wraps the text so the renderer can't
disagree with the wrapper's prediction. Both halves are required —
either alone leaves a gap.

## Anti-patterns

### Anti-pattern 1 — adding a prompt rule when the wrapper could check

> *"Add to PASS2_SYSTEM: 'NEVER place an arrow label at the midpoint
> when there's a node-question below the sibling node — use a
> labelOffset.'"*

This is a guideline the agent may forget. The right move is a wrapper
check that fires every time and tells the agent the exact offset that
would work. The prompt may briefly mention the constraint exists ("if
connect_nodes returns a collision error, retry with the suggested
labelOffset") but the *enforcement* belongs in the wrapper.

### Anti-pattern 2 — silent auto-correct without a log line

> Wrapper auto-grows a callout's height but logs nothing.

The agent (and the human reviewer) lose the ability to notice that
their inputs were systematically wrong. Always log the auto-correction
with the before/after measurements at debug verbosity. If the agent
can see "I asked for height=120 but the wrapper grew it to 280," they
learn to size correctly next time without an error round-trip.

### Anti-pattern 3 — rejection without a fix path

> Wrapper rejects with `"text overflows"` and no further info.

The agent can't act on this — it doesn't know by how much, in which
direction, or what would satisfy. Every rejection error should include:
1. **What constraint failed** (with measurements).
2. **What was supplied** (the agent's inputs, restated).
3. **What would satisfy** (a concrete suggested fix the wrapper has
   verified would work, OR a parameter range the agent should re-pick from).

### Anti-pattern 4 — wrapper enforces constraint A but skips constraint B

> Wrapper checks "label fits inside the arrow's bounding region" but
> not "label doesn't overlap sibling elements."

The user critique that triggered this skill was exactly this: round 7
covered text-vs-callout fit but not text-vs-sibling-element collision.
When designing a constraint check, enumerate the *failure modes the
user has flagged* and check each of them. Don't pick the easy one.

## Composability with the AC layer

ACs and wrapper-rejections are NOT competitors. The right division of
labor:

- **Wrapper** enforces single-call constraints — "this one tool call
  must produce a valid artifact given the current scene state."
- **AC** enforces whole-scene invariants — "the rendered scene as a
  whole must satisfy these properties," including ones that span
  multiple tool calls (e.g. progressive emission ordering, sequential
  section numbering, color-role consistency across a zone).

If an AC fires on a class of defect that a wrapper *could* prevent,
that's a refactor opportunity: move the check into the wrapper. The
AC stays as belt-and-suspenders for future regressions.

Over time, wrapper-rejections grow and ACs shrink — the system
converges toward "ACs report zero fails per render" because every
fail-class has a wrapper that prevents the call.

## Summary — the rule

When you're about to add a paragraph to PASS2_SYSTEM telling the
agent to avoid some structural defect: **stop**. Ask whether the
defect could be detected at tool-call time by computing the result.
If yes, add the check to the wrapper instead. The prompt addition is
the wrong layer for structural enforcement. The right layer is the
tool itself.
