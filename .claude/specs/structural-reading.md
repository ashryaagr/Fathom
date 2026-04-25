---
spec: structural reading — features for hierarchical / zoom-out → zoom-in comprehension of research papers
owning_team_primary: SUPERSEDED — see `whiteboard-diagrams.md`
owning_team_secondary: SUPERSEDED
status: SUPERSEDED 2026-04-25 by `.claude/specs/whiteboard-diagrams.md`
created: 2026-04-25
research-by: 2 parallel general-purpose agents (reading science + product survey)
---

# SUPERSEDED — read `whiteboard-diagrams.md` instead

The user reviewed this spec and rejected the direction as **too mechanical**:

> "We are trying to do something that is very mechanical, let's say, whereas we are forgetting the spirit. The spirit is to understand the research paper. That is my goal. That's it. It doesn't help me to read the paper skeleton, etc."

The replacement direction is a separate **whiteboard tab** that, after indexing, generates a multi-level Excalidraw diagram of the paper's core methodology + algorithms (not literature, not section structure), with an iterative side chat for refinement. Read `.claude/specs/whiteboard-diagrams.md`.

The reading-science research and product survey below remain useful background for the new spec — particularly the findings on graphic advance organisers (d ≈ 1.24), expert eye-tracking patterns, and the white-space conclusion that nobody ships AI-generated recursive paper structure with in-place drill-down. The *features* below are obsolete.

---

# Why this spec exists

The user's framing (verbatim, condensed): *"sometimes we only understand the local context but not the global context, like how things are related or getting the bigger picture, because words are basically too much. Sometimes all we need is just a good way to read, a good structural framing... reading it in structures... first I understand this thing, then this thing, and then this, and whenever I'm confused about something, I elaborate upon it more... a zoom-out and zoom-in way of understanding, so that first I understand the workflow at a high level, how different things are processing, how the workflow looks like, and then I understand each independent stage, and then I understand how the different components within that stage work."*

This is not a feature request — it's a category. The user is asking us to think about how Fathom can help readers *build a mental model* of a paper, not just understand individual paragraphs.

# What the research says (validated)

Two parallel research agents investigated cognitive science and existing products. The convergent findings:

1. **Expert readers do not read linearly.** Keshav's 3-pass method (SIGCOMM 2007) is the canonical articulation — pass 1 builds skeleton, pass 2 fills body, pass 3 reconstructs from assumptions. Eye-tracking meta-analyses (Gegenfurtner et al. 2011) confirm: experts have shorter fixations, longer saccades, fixate figures first, oscillate freely between resolutions. The user's "zoom-out → zoom-in" intuition matches established expert behaviour.

2. **Graphic advance organisers are the highest-impact pre-reading aid.** Luiten/Ames/Ackerson (1980) meta-analysis of 135 studies: graphic organisers d ≈ 1.24 (very large effect); expository (verbal) organisers d ≈ 0.80. Showing the structure visually before detail-reading dominates any other preparatory technique.

3. **Schema theory + cognitive load theory both predict** that without a top-level mental structure, sentence-level information has nowhere to attach (Bartlett 1932; Anderson 1977; Sweller 1988). The bottleneck is working memory chunking — 4±1 chunks (Cowan 2001) — so a paper's 6–10 sections cannot be held simultaneously without grouping.

4. **Cost lives in element interactivity, not word count.** Sweller, Chen & Kalyuga (2010): a 30-word sentence with two independent claims is cheap; a 12-word equation with five coupled symbols is expensive. Bridging inferences (Graesser, Singer & Trabasso 1994): the unstated causal/coherence links the reader must compute drive paragraph difficulty more than length.

5. **Self-explanation doubles comprehension gains** vs. re-reading (Chi et al. 1989, 1994; Dunlosky 2013 rates as moderate-to-high utility). The mechanism: forces the reader to *generate* bridging inferences rather than passively recognise statements.

## Validated contradictions to user intuition

- **Strict hierarchy is wrong.** Experts oscillate (figure → caption → method → figure → table → section header). A UI that imposes a single zoom-out-then-zoom-in flow contradicts how experts actually read. The structure must be *navigable from any direction*, not a guided tour.
- **Pre-built outlines are weak unless they trigger generation.** Dunlosky et al. (2013, *PSPI*) explicitly downgrade summarisation/highlighting when passive. A static TOC or auto-summary helps less than a prompt that asks the reader to articulate the structure themselves.
- **Expertise reversal is real (Kalyuga 2003, 2007).** Scaffolds that help novices actively burden experts. Anything Fathom shows must be dismissable, off by default, or driven by an explicit reader gesture. We cannot assume the reader needs help they didn't ask for.

# White space (validated by product survey)

No tool currently ships **AI-generated, navigable, recursive paper structure with in-place drill-down anchored to source pixels.** The space splits cleanly:

- **Chat-with-PDF** (SciSpace, Explainpaper, Anthropic Projects with PDFs): atomized Q&A on selections, no structure, no in-place anchor — break reading flow.
- **Flashcard extractors** (Scholarcy): extract structure into a fixed taxonomy (claims/methods/results), but the cards *replace* the paper rather than letting you traverse it. One-shot, not progressive.
- **Augmented PDF research** (Semantic Reader, Scim, ScholarPhi from AI2/UW): closest to in-place augmentation — inline citation cards, position-sensitive definitions, three-class skimming highlights. But: **no recursion** — you can't drill from a "Method" highlight into "explain the components of this method." One-shot overlays.
- **Canvas / map tools** (Heptabase, Obsidian Canvas): support hierarchical decomposition, but require **manual** card-building. AI doesn't propose the paper's hierarchy.
- **Outline tools** (Readwise Reader, Logseq, Tana): host the *reader's* notes about papers, not the paper's argument tree.

Fathom's existing recursion model (gesture-driven dive, in-place lens, persistent markers) is already the right substrate to fuse the augmented-PDF and canvas-decomposition halves. We're already half-built; what we lack is the *structural* layer that lets the reader move between resolutions without losing spatial anchor.

# Proposed features

In implementation order — each builds on the prior. **Do not implement any until the user picks the slice they want first.**

## Feature 1 — Paper Skeleton (graphic advance organiser)

**What:** On paper open, AI generates a hierarchical visual map: top = thesis/contribution, branches = top-level sections, leaves = subsections + figure references. Renders as a left-side deck (toggleable with `⌘⇧S` or the existing `?` overlay). Click any node → smooth scroll + zoom to that part of the PDF.

**Why:** Graphic advance organisers d ≈ 1.24. Directly addresses "first I understand the workflow at a high level." Building the skeleton once, then leaving it accessible, satisfies both novice (uses it) and expert (closes it).

**Cog rules respected:** Off by default per user preference (expertise reversal). Each node is tappable for drill, not auto-expanded. The skeleton is the *map*, not a substitute for reading.

**Effort:** Medium. We already extract the section tree at index time (`buildIndex.ts`). Need: AI pass to label nodes meaningfully (not just heading text) + a deck UI + a click-to-navigate handler. ~2–3 days.

## Feature 2 — Stage View (mid-resolution drill)

**What:** For papers with workflow / pipeline structures (most ML / systems / methods papers), AI extracts "stages" — discrete steps the paper describes (e.g. "data collection → preprocessing → model architecture → training → evaluation"). Each stage card shows: 1-line purpose, key concepts, the figures it owns. Click stage → opens a *Stage Lens* containing only the 3–5 source paragraphs that describe that stage, plus an explanation grounded in *the stage's role in the workflow* (not just the paragraph in isolation).

**Why:** Chunking (4±1) — most papers have 4–8 stages, which fits exactly inside working memory once labelled. Schema theory — the stage label is the schema slot the body content attaches to. Maps to user's "each independent stage."

**Cog rules respected:** Stage extraction can be wrong; user must be able to merge / split / rename stages. The Stage Lens is just a regular Fathom lens with extra context, so the existing recursion (drill into a stage's component) Just Works.

**Effort:** Medium-large. Needs an AI prompt that decomposes by workflow (not by section heading), a Stage Lens UI variant, and the editing affordances for the user to correct mistakes. ~4–5 days.

## Feature 3 — Component Drill (existing lens, contextually scoped)

**What:** When a user dives (`⌘ + pinch`) inside a Stage View context, the AI is grounded in: the source paragraphs of the stage + the stage's role in the workflow + the parent skeleton. The explanation references back to the stage ("this is component 2 of stage 1: X").

**Why:** Schema theory predicts that explanations grounded in higher-level context are encoded better than free-floating ones. Maps to user's "different components within that stage." Also: maintains the recursion-has-one-visual-grammar principle (§2.1).

**Cog rules respected:** Pure context augmentation — no new UI, no new gesture. The existing dive feels exactly the same; only the explanation gets richer.

**Effort:** Small. Augment the explain-region prompt with stage + skeleton context when present. ~1 day.

## Feature 4 — Difficulty Heatmap (element-interactivity overlay)

**What:** Toggleable visual layer on the PDF that gently tints paragraphs by estimated cognitive cost. Inputs to the cost estimate:
- Equation / symbol density
- Number of undefined symbols (used before defined)
- Bridging-inference gaps (terms whose causal/coherence links the paper assumes)
- Subordinate-clause depth as a weak proxy for syntactic load

Hot zones tell the reader "slow down here." A faint warm tint, not red — never alarming.

**Why:** Sweller's element interactivity — readers' biggest fatigue source is hitting an unexpectedly dense paragraph without warning. Showing where the cost is *before* the reader hits it lets them allocate attention. Pre-emptive scaffold; user can ignore it.

**Cog rules respected:** Off by default, toggleable. Tint is gentle; doesn't add salience above the text's own. Faint enough to ignore; visible enough to inform.

**Effort:** Medium. Needs an AI pass during indexing to estimate per-paragraph cost, plus an overlay layer. ~3 days.

## Feature 5 — Self-Explanation Prompts (opt-in)

**What:** At the end of each section (detected on scroll past the section's end), an unobtrusive prompt appears in the corner: *"In one sentence, what was this section's contribution?"* User types, AI compares to source. If the user's answer matches → confirmation + dismiss. If divergent → quick highlight of the source span the user missed.

**Why:** Self-explanation is the most-validated comprehension intervention in the literature (Chi et al. 1989+, Dunlosky 2013 moderate-utility). Generation effect (Slamecka & Graf 1978) doubles retention vs. recognition.

**Cog rules respected:** Opt-in only — buried in settings. The prompt is dismissable with one click. No quiz vibes.

**Effort:** Small-medium. ~2 days. Can be the lowest-priority feature for v1 of structural reading.

## Feature 6 — Glossary-on-Demand (term-aware)

**What:** When the AI detects a term used before its definition (or assumed from prior knowledge), a faint dot appears next to its first occurrence. Click → mini-lens with the definition or the prior-context. Borrowed directly from Semantic Reader's position-sensitive definitions.

**Why:** Bridging-inference research — the most expensive paragraphs are ones that assume terms. Showing that a term is *assumed* (not just used) is itself useful information.

**Cog rules respected:** Faint dot, no salience hijack. Click-driven, not hover-popups (hover popups break reading flow).

**Effort:** Medium. Needs an AI pass during indexing to build the term-graph + a per-page overlay. ~3 days.

## Feature 7 — Reading Trail (oscillation-aware history)

**What:** Tracks the user's path through the paper at all resolutions: Skeleton open → Stage 3 click → Component drill → back to Stage 3 → Stage 5 → ... Visualised as a tiny breadcrumb trail in the bottom-left. Click any breadcrumb to teleport back. Survives reload.

**Why:** Experts oscillate; they don't read linearly. A linear "back" stack (which we have) doesn't capture multi-resolution movement. The trail makes the oscillation visible to the reader and re-traversable.

**Cog rules respected:** Tiny, peripheral, can be hidden. Doesn't compete with the source for attention.

**Effort:** Small. ~1–2 days, mostly state plumbing.

# Sequencing recommendation

If the user picks one slice to ship first: **Feature 1 (Paper Skeleton) + Feature 3 (Component Drill context-augmentation)** as a single MVP. Reason:

- Feature 1 is the highest-evidence intervention (graphic organisers d ≈ 1.24).
- Feature 3 is nearly free given Feature 1 ships (just augment an existing prompt with skeleton context).
- Together they give the user the "see structure → drill into anything → explanation respects structure" loop the spec is about, without requiring the harder pipeline-extraction work of Feature 2.

If the user wants the *most* ambitious slice: **Feature 1 + Feature 2 + Feature 3** as a v1 of "Structural Reading." This is a 1.5–2 week build but produces the unified "skeleton → stage → component" experience the user described.

Defer Features 4–7 to follow-ups; they're each independently valuable but not load-bearing for the first cut.

# Open questions for the user

1. **Which slice first?** Pick one of: (a) Feature 1 only, (b) Features 1 + 3, (c) Features 1 + 2 + 3, (d) something else. Default recommendation: (b).
2. **Where does the Skeleton live visually?** Three options: (i) collapsible left side-deck (always present), (ii) full-screen overlay summoned by `⌘⇧S` then dismissed, (iii) a "skeleton mode" that replaces the PDF view temporarily. Default recommendation: (ii) — matches Fathom's existing gesture-summoned overlay pattern (lens, settings).
3. **Should Stage View be auto-extracted on first open, or on user request?** Auto-extract = faster UX, more index cost. On-request = aligned with "scaffolding must be dismissable" principle but adds friction. Default recommendation: on-request, with a one-tap "build stages" affordance in the Skeleton.
4. **Off-by-default vs on-by-default for the Skeleton?** Per expertise-reversal evidence: off by default. But there's a counter-argument: the user is the expert, this is *their* tool — letting them turn it on once is fine. Default recommendation: off by default for first install; user can flip a setting to "always show skeleton on open."
5. **What language for the Skeleton labels?** AI-generated paraphrases (e.g. "Stage 2: how the model is trained" instead of the literal section heading "Section 4.2: Optimization") tend to be more navigable, but lose the paper's own framing. Default recommendation: AI-paraphrased with the original heading on hover.

# Cross-references

- **CLAUDE.md §1** (just updated): structural reading, element interactivity, dismissable scaffolding.
- **CLAUDE.md §2.1** (recursion has one visual grammar): the Stage Lens and Component Drill must use the same lens primitive as the existing dive.
- **CLAUDE.md §6** (no RAG): structural extraction happens at index time; per-call lookups go through the existing file-system index. No embeddings.
- **`.claude/skills/fathom-cog-review.md`**: every feature above should be reviewed against rules §1 (working memory), §3 (Doherty's threshold), §6 (colour signalling), §7 (Hick's Law on visible options).

# Sources

## Cognitive science
- Keshav, *How to Read a Paper* (SIGCOMM CCR 2007)
- Luiten/Ames/Ackerson, *Meta-analysis of Advance Organizer Studies* (J Exp Ed 1980)
- Chi et al., *Eliciting Self-Explanations Improves Understanding* (Cognitive Science 1994)
- Kalyuga, *Expertise Reversal Effect and Its Implications* (Educ Psych Review 2007)
- Graesser, Singer, Trabasso, *Constructing Inferences During Narrative Text Comprehension* (Psych Review 1994)
- Nesbit & Adesope, *Learning With Concept and Knowledge Maps: A Meta-Analysis* (RER 2006)
- Sweller, Chen & Kalyuga, *Cognitive Load and Element Interactivity* (Educ Psych Rev 2010)
- Dunlosky et al., *Improving Students' Learning With Effective Learning Techniques* (PSPI 2013)
- Gegenfurtner et al., *Expertise Differences in Visualization Comprehension: Eye-Tracking Meta-Analysis* (Educ Psych Rev 2011)
- Cowan, *The Magical Number 4 in Short-Term Memory* (BBS 2001)

## Products in the white space
- Semantic Reader Project, AI2 (Allen Institute) — *CACM*
- Scim: Intelligent Skimming Support for Scientific Papers — Fok et al., *CHI 2023*
- ScholarPhi — AI2/UW
- Heptabase — visual reading workspace (commercial, manual structure)
- Scholarcy — flashcard extraction (commercial, fixed taxonomy)
- SciSpace Copilot, ChatPDF, Explainpaper — chat-with-PDF (commercial, no structure)

# Definition of "done" for this proposal

- ✅ Two research streams completed (cognitive science + product survey)
- ✅ Findings synthesised against user-stated needs
- ✅ White space identified (recursive AI structure + in-place drill — nobody ships it)
- ✅ 7 candidate features proposed with evidence and effort estimates
- ✅ Sequencing recommendation made
- ✅ Open questions for the user surfaced
- ⏳ User picks the slice they want first
- ⏳ PM Interpreter writes the chosen slice's implementation spec
- ⏳ Cog Reviewer gates the chosen slice's UI before build
- ⏳ Implementation begins
