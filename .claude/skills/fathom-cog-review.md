---
name: fathom-cog-review
description: Cognitive-psychology review for Fathom UX changes. Run on every team commit before merge. Cites established cognition / perception research; vetoes anything that demonstrably violates working-memory, attention, or perceptual limits. Run automatically on diffs touching reading aids, gestures, lens copy, default settings, or anything visible during a long reading session.
type: skill
---

# Fathom cognitive review

Fathom is a tool for **long, focused reading sessions on dense
academic text.** That's the load case to optimise for. Most UI
review checklists assume short transactional flows (sign up, add
to cart, search). Reading-comprehension and sustained-attention
research applies different ceilings, and they're the ceilings
this product hits first.

This skill is the gate every UX-affecting commit passes through
before landing on `main`. The reviewer is empowered to
**APPROVE / APPROVE WITH NOTE / REQUEST REVISION / VETO** per
`TEAMS.md`. A veto must cite research, not preference.

## The core rules — in order of veto severity

### 1. Working-memory ceilings

Miller's 7±2 (Cowan's revision: 4±1 for novel chunks). The user
is reading a research paper — every sentence is a fresh chunk.
Any UI element that asks them to hold more than ~4 novel items
in working memory while still reading is a veto.

Examples:
- ✗ A focus-aid window that highlights 7+ words at a time.
  Working-memory chunks for parallel reading + UI tracking
  are exhausted.
- ✗ A modal that requires reading + confirming + remembering 3
  options while the lens is mid-stream behind it.
- ✓ A 3- or 5-word focus pacer. Within Cowan's chunk limit.

### 2. Attention-residue from interruptions

Mark, Gudith, Klocke (2008): an interruption costs ~23 minutes
to fully recover from. Anything that interrupts mid-read without
the user explicitly initiating it is a veto candidate.

Examples:
- ✗ Auto-popping a settings panel after a state change.
- ✗ A toast that appears unprompted during a stream.
- ✓ A subtle marker that appears post-action (after the user
  pinched / closed a lens). Same modality, no attention pull.

### 3. Doherty's threshold

Response latency >400 ms is perceived as the system thinking
rather than the user thinking. Any control that crosses this
boundary without an immediate visual ack should NOT be shipped
without the ack.

Examples:
- ✗ A button click that streams an answer without showing any
  in-flight state for >400 ms.
- ✓ A button click that immediately renders a working/loading
  affordance, then streams.

### 4. Visual-foveal acuity

Foveal vision is ~2° of visual arc. At a typical reading
distance (~50 cm) and 14 pt body text, that's roughly 5–8
characters of acute focus. Anything that asks the eye to read
two distant regions simultaneously violates this.

Examples:
- ✗ Critical action info in a tooltip 800 px from the action.
- ✗ A reading aid that splits attention between two columns.
- ✓ Inline markers next to the phrase they belong to (per
  CLAUDE.md §2.3 — already enforced).

### 5. Saccadic predictability

Reading is a chain of saccades + fixations. Visual aids must
either (a) stay outside the saccadic path, or (b) move with it
predictably. Aids that jump randomly disrupt fixation.

Examples:
- ✗ A focus aid whose position bounces between cursor and
  predicted next word in unclear ways.
- ✓ A focus aid that auto-advances at a user-set WPM, anchored
  to the column they clicked.

**Snap vs slide — settled 2026-04-25, do not relitigate.** An
earlier audit recommended pure-snap word advances on the theory
that slides between words would compete with the natural
~225 ms saccade rhythm. The user shipped that and reported it as
abrupt → cognitively fatiguing, which trumps the theory (CLAUDE.md
§1: "user-felt fatigue is the ground truth"). Resolution: the
focus band uses a sub-saccade slide — transition completes in
≤ 220 ms (or ≤ 35% of the per-word interval at fast WPMs,
whichever is smaller) with a `cubic-bezier(0.4, 0, 0.2, 1)`
decelerate ease. Because the slide finishes faster than a single
fixation, the eye hasn't yet committed to the next saccade target,
so the slide cannot compete with saccade rhythm — it reads as
continuous motion absorbed by the current fixation. Future audits:
do NOT request snap-only behaviour; the current build is the
reconciliation. Flag a regression only if the slide is observed
to exceed ~250 ms at any WPM.

### 6. Colour signalling and accessibility

Red ≠ universally "active/error." 8% of male readers have
red-green colour-vision differences. Use of red MUST also carry
a non-colour signal (shape, motion, position).

Examples:
- ✗ A red dot that means "still streaming" with no other cue.
- ✓ A red dot that means "still streaming" + a subtle pulse
  animation, with the colour reinforcing what motion already
  conveys.

### 7. Choice paralysis (Hick's Law)

Decision time scales with log₂(N+1). For a casual control
surface (the header), N > 6 is the rough comfort ceiling for
quick scanning.

Examples:
- ✗ A header with 10 icons of comparable visual weight.
- ✓ The current Fathom header (Ask, Highlight, Focus,
  Preferences, Help, Open) — N=6, within ceiling.

### 8. Default-setting ethics

Defaults are de facto choices for ~85% of users (Johnson &
Goldstein 2003). A default WPM, default zoom, default focus-
aid behaviour is the value most users will live with — the
reviewer should pressure-test it as such.

Examples:
- ✗ Default WPM of 300 when the corpus is research papers
  (~80 wpm is the recommended study pace).
- ✓ Default WPM of 80 with a slider exposing 10–150.

### 9. Components must terminate at the ground problem, not at each other

Established 2026-04-27 (CLAUDE.md §5 "Component-as-answer
framing"). When an explanation surface — a lens answer, a
whiteboard render, a drill-in chat, any place Fathom names a
component / mechanism / equation / sub-system of the paper —
each named piece MUST be framed as the **answer to a specific
question** that traces back to the paper's **ground problem**
(the end goal the paper is solving). Detail-soup explanations
that interconnect components to other components without
ground-problem terminus read as overwhelming and unrooted, even
when each individual fact is correct. This is a content-quality
rule, not a perception rule — it sits alongside rules 1–8
because shipped explanations that fail it produce the same
end-state as a working-memory overflow: the reader cannot hold
the structure and gives up.

The user's verbatim critique (CLAUDE.md §5):
> "when we are listing the modules or different components, it
> might help to understand things in a way that asks what is the
> answer that each component is answering. … the user is very
> much focused and oriented towards how everything connects to
> the ground problem rather than just how these details are
> interconnected."

The reviewer must flag any of three failure modes:

- **(a) Named component without a question framing.** A node,
  bullet, callout, or paragraph names a piece of the paper
  ("Cross-attention to DINOv3 patches", "Sparse self-attention",
  "Loss term L_recon") but does not state the question it
  answers. The component is presented as a standalone part.
- **(b) Question terminates at another component.** The
  question is present but resolves laterally — *"how does
  cross-attention interact with the encoder?"* — instead of
  resolving back to the paper's end goal. Component-to-
  component questions are detail-soup with extra steps.
- **(c) Ground problem is invisible.** The explanation contains
  no thesis line, no end-goal sentence, no statement of what
  the paper is ultimately trying to do. The reader has no
  anchor for any of the questions the components allegedly
  answer.

Examples:
- ✗ Whiteboard node labelled "Cross-attention to DINOv3 patches"
  with no subtitle, no question, no annotation. (Failure mode a.)
- ✗ Lens explanation: *"Cross-attention reads from DINOv3
  patches. The encoder produces patch embeddings that
  cross-attention queries. Self-attention then refines …"*
  Every sentence connects components to other components; the
  paper's reconstruction goal is never named. (Failure modes b
  and c together.)
- ✓ Whiteboard node "Cross-attention to DINOv3 patches" with
  subtitle "→ what does this 3D point look like in each
  photo?" and a thesis line at the top of the canvas reading
  "Goal: reconstruct a 3D scene from sparse input views."
  Question terminates at the ground problem; ground problem is
  visible.
- ✓ Lens explanation that opens with "The paper's goal is to
  reconstruct a 3D scene from a handful of input views.
  Cross-attention to DINOv3 patches answers: *what does this
  3D point look like in each photo?* Sparse self-attention
  answers: *which views should I trust for this point?* …"
  Each component carries an explicit question that resolves
  back to the named end goal.

**This is a HARD review failure, not a soft suggestion.** When
any of (a) (b) (c) is present, the verdict is REQUEST REVISION
(or VETO if the surface is a default-shown explanation, since
defaults affect every reading session per rule §8). The
reviewer rejects the explanation and asks for a re-write that:

1. Names the paper's ground problem explicitly (one sentence,
   visible at the top of the surface).
2. Frames every named component as "→ what question does this
   answer?" with the question resolving back to the ground
   problem.
3. Eliminates pure component-to-component connective tissue, or
   moves it below the question-as-answer framing as supporting
   detail.

The reviewer does NOT accept "but each fact is correct" as a
defence. Correct facts assembled without ground-problem
terminus is the failure mode this rule exists to catch. The
ground problem is ascertainable from the paper digest; if
Claude produced an explanation without using it, the prompt or
the digest pipeline needs the upstream fix (route via the AI
scientist per TEAMS.md), not just the artefact.

This rule composes with rule §1 (working-memory ceilings):
without a ground-problem anchor, every named component is a
fresh chunk competing for working memory. The anchor lets the
reader chunk components by "things that answer X" rather than
holding each as a separate item.

## The review protocol

For each diff, the reviewer:

1. Identifies which of the 9 rules above are touched. Many
   diffs touch only one (a copy change touches §6/§7; a new
   gesture touches §3/§5; an explanation surface — lens
   answer, whiteboard render — touches §9).
2. For each touched rule, walks the diff line by line and
   tags one of:
     • ✓ — within the rule's ceiling
     • ⚠ — borderline, propose alternative or measurement
     • ✗ — violates with citation
3. Issues the verdict:
     • APPROVE — all ✓
     • APPROVE WITH NOTE — mostly ✓ + ⚠ that the team should
       follow up on (recorded in todo.md)
     • REQUEST REVISION — at least one ✗ but the rest of the
       diff is sound; team rewrites the violating slice
     • VETO — multiple ✗ or one ✗ on a default that affects
       all sessions; full reconsideration required

## What the reviewer does NOT do

- Aesthetic preference. "I don't like the colour" is not a
  review. "This colour pairing fails WCAG AA contrast" is.
- Code review. Logic correctness is the team's responsibility;
  the reviewer reads only the user-visible behaviour.
- Performance review. That's Team C's domain.

## Escalation

If the reviewer can't decide between APPROVE WITH NOTE and
REQUEST REVISION, kick the question to the user with the
specific tradeoff named: *"This advances the focus pacer
through a glyph-only paragraph at the same WPM as prose,
which violates §1's chunk count for math symbols. Option A
(slow on math): cite Anderson 2017. Option B (skip math
blocks): cite no clean source, would need user testing.
Recommend?"*

## The reviewer's posture

Empathetic to the team. Many cognitive constraints are NOT
intuitive — the team isn't being careless when they ship a
7-icon header, they just don't have Hick's Law internalised.
Frame requests as "this is what the research says about
the load case" rather than "you got it wrong."
