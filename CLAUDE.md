# Fathom — Core Principles

Fathom is a PDF reader for research papers, built around a "semantic zoom" gesture: pinch with ⌘ held on a passage → a full-screen lens opens with a streaming, grounded explanation from Claude. This document collects the design and engineering principles the product is built on. Every principle below comes directly from instructions given by the user during construction; nothing here is speculative.

This file is the source of truth for future changes. If a new feature contradicts anything below, the principle wins unless the user explicitly revises it.

**For Claude Code / agents**: this file is the authoritative brief for the codebase. Read it in full before making behavioural changes. The rules in §0 (next section) override everything else, including the default agent behaviours.

---

## 0. Working with the user

These rules shape *how* you (Claude Code, or any agent) collaborate on
Fathom. They override any conflicting default behaviour.

- **Every instruction is executed.** If the user gives an instruction
  and you decide to prioritise a different task first, record the
  deferred instruction in `todo.md` at the repo root *immediately*.
  Resume `todo.md` top-to-bottom once the current task finishes, and
  tell the user you're doing so.

- **Queuing requires a `todo.md` entry — every time, no exceptions.**
  Any phrase that defers work — *"queued for v1.0.X"*, *"Phase 3 will…"*,
  *"follow-up"*, *"next session"*, *"deferred to…"*, *"shipping
  later"* — appearing in a commit message, release note, response,
  or skill must have a corresponding `todo.md` entry committed
  alongside. The rule applies **if and only if you are actually
  queuing**. Don't pad `todo.md` with hypothetical future work that
  isn't a real commitment; do log every real commitment so a future
  session can pick it up. A commit that promises follow-up but
  ships no `todo.md` line is incomplete — fix the commit before
  pushing.

- **End-to-end verify shipping paths.** Distribution, install, update,
  and first-run flows must be tested on a real version bump before
  being declared done. "The code looks right" has failed us at least
  once (Squirrel.Mac / ad-hoc signing incident) — don't rely on it.

- **Agent harness is a first-class artefact.** Fathom isn't just
  shipped software; it's shipped software plus the agent tooling that
  tests and ships it. New gestures, new controls, new release flows
  all require updating the corresponding `.claude/skills/` file so the
  next agent session inherits the capability.

- **Design-pattern check runs on every controls change.** When you
  touch gestures, keyboard shortcuts, or the install/update flow,
  invoke the `fathom-ux-review` skill (or its checklist) before
  committing. UX regressions are regressions.

- **Communication matches the dev workflow.** Fathom is a dev-first
  tool — we build, ship, and update it via terminal. Our external
  communication must reflect that ordering: the terminal install is
  the *primary* path everywhere it shows up (README, docs home,
  INSTALL guide, release notes, in-app tour). The DMG is a text
  link to a Mac-install section — never the hero CTA, never
  accompanied by an app-store-style icon. Every contributor surface
  should read "we use our own CLI; here is that CLI." See
  `.claude/skills/fathom-communication.md` for the typographic +
  copy rules that enforce this.

- **Pre-release QA is mandatory.** Every release runs through
  `.claude/skills/fathom-qa.md`'s canonical flow before the tag is
  pushed. Typecheck is free; state+logs check is cheap; screenshot
  grading is the critical step that catches "lens crashes on dive"
  and its cousins. Do not declare a release done on the basis of
  "the code looks right" — that has now misled us multiple times.

- **Reported-failure retrospection.** When the user reports that a
  fix we've already shipped isn't actually working for them, treat
  it as a systemic failure of our agent harness — not a retry prompt.
  Specifically:
  1. **Retrospect honestly, out loud.** What failure mode did we
     match the bug to, and what mode did we miss? Was our mental
     model of the underlying system (trackpad driver, Gatekeeper,
     Squirrel.Mac, Electron API surface) wrong?
  2. **Add instrumentation before re-fixing.** A future recurrence
     has to be diagnosable from the log file alone — the user
     doesn't have DevTools open at the moment of frustration.
     Debug flags are fine (e.g. `window.__fathomGestureDebug`).
  3. **Capture the new pattern.** If you learned a design rule —
     "pinch always wins the tie-break vs swipe" — it goes into
     this file or into the relevant `.claude/skills/*` file so the
     next session inherits it. Skills are the harness; treat them
     as code.
  4. **Skill-level detectable.** Ask: could `fathom-ux-review`
     catch this regression just by reading the diff? If not, add
     the rule. Same for `fathom-e2e-test` — is there a gesture
     sequence that would have exposed this? Add it.

- **Agent harness as a first-class product.** We're not only building
  a PDF reader; we're building the team of agents + skills + hooks
  that builds, tests, and ships it. Treat every retrospection as an
  opportunity to improve that harness. If two sessions in a row hit
  the same shape of problem, that's a missing skill or a missing
  instrumentation — fix the harness, not just the symptom.

- **Teammates for high-level work; sub-agents are an internal tool.** Established 2026-04-25. When dispatching feature implementation, audits, reviews, research streams that may need follow-up, or anything that should retain context across a multi-turn iteration: use **named teammates** (the `Agent` tool with a `name`, addressable via `SendMessage`) — the structure documented in `.claude/TEAMS.md`. Cog Reviewer is the same Cog Reviewer across the Section Timer audit, the Whiteboard pipeline audit, and the Whiteboard pipeline-v2 re-audit; PM Interpreter is the same PM across all the specs. One-shot sub-agents (the `Agent` tool with no `name`) are something a teammate may use *internally* to parallelise their own work — that is the teammate's call, not the orchestrator's. **The rule for the orchestrator (this conversation): every high-level implementation, audit, review, or research dispatch goes to a teammate.** A useful side-effect is that "the verifier was too aggressive — tune it" can `SendMessage` the original verifier instead of re-briefing a fresh agent and losing nuance.
- **Close the loop on output quality, not just functionality** (established 2026-04-25). When AI teammates ship software the user sees the *output*, not the source. A typecheck-clean build that produces a cluttered diagram, an answer that misses the point, a focus light that pulses wrong is **not** done — even if every test passes. Therefore:
  - **Every implementer teammate must run their own work against a real example before declaring done.** For Whiteboard: render the diagram against one of the user's actual papers, look at the rendered output, iterate on quality. For Section Timer: run a session, observe the visual physics, confirm the threshold opacity-bump fires correctly. For Lens explanations: stream against a real paragraph and read the output. Synthetic tests don't substitute for "I looked at what the user will see."
  - **A separate quality-verifier teammate may do the looking** if the implementer is too close to their own work. The verifier drives the app (via `scripts/fathom-test.sh` or the in-app test harness), captures the visible output (screenshots, log tail, scene JSON inspection), grades against the spec's quality bar, and sends feedback back to the implementer. They iterate together until the output matches the spec, then both report done.
  - **The PM (this conversation) does NOT declare a feature live until the close-the-loop pass has happened.** A teammate's "typecheck clean and build succeeds" is necessary but not sufficient. The PM either runs the verification themselves (when possible from CLI) or holds the install pending a quality-verifier teammate's sign-off. Skipping this and trusting "build succeeded" is the failure mode that produced the broken Whiteboard render on first install — an embarrassing process gap, not a one-off.
  - **Iteration is expected, not a sign of failure.** First render of the Whiteboard against the sample paper is allowed to look wrong. What's not allowed is shipping it without looking. If the implementer renders it once and the output is bad, they iterate; the SendMessage channel exists precisely so the loop doesn't have to restart from a fresh brief each round.
  - This principle composes with AI-built-product: methodology + logs are how the *user* audits the running product; close-the-loop verification is how the *implementer* audits their own output before the user has to. Both are mandatory; neither substitutes for the other.
- **Local-only context.** At session start, read every `.local/*.md`
  file if the directory exists. `.local/` is gitignored and holds
  the author's working notes — operational rules, dev-machine
  instrumentation, release timing preferences — that never belong
  in the public repo. Content in `.local/` supersedes defaults in
  this file when they conflict. Never reference `.local/` content
  by quote or detail in any tracked file, commit message, or
  release note; a neutral pointer (like this bullet) is the only
  permitted leak.

---

> **Categories of principles, and how to read this file.**
>
> Principles below are split into four groups so a reader can find the
> *right* kind of guidance fast. The four kinds:
>
> - **Product principles** — what we're building, for whom, and why
>   (§1). Mission-level. These outlive any specific UI.
> - **Design principles** — how the product feels, looks, and reacts
>   (§2). Cover gesture, layout, typography, motion, copy hierarchy.
> - **Scientific principles** — how the AI grounds itself in the
>   paper (§6). Cover the index, the no-RAG stance, three-channel
>   alignment, what Claude is allowed to make up vs read.
> - **Engineering principles** — how the codebase is built and
>   maintained (§8). Cover diagnosis, instrumentation, persistence,
>   release discipline.
>
> Communication principles (voice, copy, typography enforcement) live
> in `.claude/skills/fathom-communication.md` rather than this file
> because they're routinely consulted as a checklist by the agent
> harness when copy or visuals change.

## 1. Product principles

- **Reduce cognitive fatigue. Everything else flows from this.** Reading a research paper is already hard. Every interaction Fathom adds — the gesture, the lens, the marker, the focus light, the in-place answer — must measurably *reduce* the load on the reader, not add to it. When a feature is in tension with this goal, the goal wins. Concrete consequences:
  - Switching to ChatGPT in another tab to ask "what does this mean?" forces a context switch that costs the reader the spatial + semantic context they were holding. The lens collapses that loop in place — the entire reason the product exists.
  - Micro-interactions (the slide of the focus band between words, the cross-fade of a marker, the easing of a zoom) must feel continuous, not stepwise. Abrupt transitions force the eye to re-acquire — that's load. Smooth transitions absorb the change for free.
  - Decisions that *look* right by some external rule (saccade-aligned snaps, theoretical UX heuristics, framework conventions) but feel jarring to the reader are wrong. User-felt fatigue is the ground truth.
  - When two design rules conflict, prefer the one that demonstrably lowers the reader's cognitive load over the one that satisfies an abstraction.
- **The user is trying to understand a research paper.** Every design decision must measurably help that goal. "Cool" features that don't help understanding are out of scope.
- **The reader should never have to leave the document.** The Claude chat is not a side panel; it is the zoom. When the user asks for help, the help appears in place, as part of the reading flow.
- **Zoom has two distinct modes:** visual zoom (plain pinch) and semantic zoom (⌘ + pinch). They must feel continuous with each other, not like two separate tools.
- **Zooming persists.** If a user semantically zooms on a paragraph, closes the lens, reopens the paper weeks later, and zooms again — the exact same anchor view, the conversation history, and the diagrams must all be there. "It should all be a consistent experience, no matter when you open it or in what situation, after how many steps or whatever you do."
- **Recursion is the spine of the product.** Reading begets zoom; zoom begets a lens; the lens begets drills; the drills are themselves lenses; their selections beget more drills. There is no maximum depth. The user's mental model isn't "one PDF + one assistant", it's "one PDF and as many turtles all the way down as I need". This is the product's *shape*. The design principles in §2 are how we make that shape feel like one continuous interaction; the data model in §9 is how we make it survive across sessions.
- **Structural reading is the cognitive model.** Research papers do not yield to linear reading. Expert readers oscillate between resolutions — workflow at the top, then individual stages, then components within a stage, then back up to re-evaluate the whole — and they elaborate locally only on the parts that confuse them. Fathom must *support* this movement, not impose a single-pass flow. Concrete consequences:
  - Every aid Fathom builds should make moving between resolutions cheaper. A view that shows "this paper at the workflow level" must connect smoothly to "this stage" and to "this component," each at the same gesture cost.
  - Elaboration is on-demand, not pre-emptive. The reader tells Fathom what they're confused about (by zooming, asking, drilling); Fathom does not decide what to explain.
  - Confirmed by the literature: Keshav's 3-pass method and expert eye-tracking studies (Gegenfurtner et al. 2011) both show that experts pre-build a structural skeleton before filling in detail, and that they oscillate freely rather than reading linearly. Graphic advance organisers (Luiten, Ames & Ackerson 1980 meta-analysis: d ≈ 1.24) outperform any other pre-reading aid. We should be making it cheaper to *see* the structure, not just describe it.
- **Cost lives in element interactivity, not word count.** A paragraph is expensive when many entities depend on each other simultaneously — a five-symbol equation, a multi-clause definition, a term used before it is defined, an unstated bridging inference the reader must compute. Sentence length is a poor proxy. When Fathom decides what to highlight, what to elaborate, or where to draw the reader's attention, it should weight inter-symbol coupling and unstated dependencies, not paragraph size. (Backed by Sweller, Chen & Kalyuga 2010 on element interactivity, and Graesser, Singer & Trabasso 1994 on bridging inferences.)
- **Scaffolding must be dismissable.** The expertise reversal effect (Kalyuga 2007, well-established) is real: structural overviews, glossaries, and pre-built explanations that help a novice actively *burden* an expert who has already chunked the paper. Anything Fathom layers on top of the source — outlines, advance organisers, key-claim cards, summary lenses — must be off by default, or quietly dismissable, or driven by an explicit reader gesture. Fathom never assumes the reader needs a scaffold they didn't ask for.
- **Behavior change needs forcing functions, not nudges** (established 2026-04-25). When the goal of a feature is to *correct* a user's behavior — not just enable a new one — gentle prompts and optional surfaces fail by design. The user will skip the optional purpose anchor; they won't press the optional note key; they won't engage with the optional self-explanation. If the behavior we're trying to encourage is one the user has already failed to do on their own, an opt-in scaffold cannot fix it. The design must instead create a **forcing function**: a low-cost surface the user *measurably interacts with* as a side effect of the behavior we want, not as a separate decision.
  - **The right amount of forcing — Focus Light as the canonical example.** When the focus band slides forward, it's not coercive: the user can ignore it, slow down, jump elsewhere — but its motion *is* a forcing function for pace. The reader who tries to drift sees the band move on without them; that gentle pressure is exactly enough to keep cadence without overriding intent. Future behavior-correction features should be calibrated to this Focus-Light ratio: visible enough that ignoring it is itself a choice, weak enough that ignoring it costs nothing concrete. Anything more aggressive (modal blockers, locked controls, "you must do X to continue") is too restrictive and breaks the cognitive-fatigue-reduction principle.
  - Other examples of well-calibrated forcing: a visible per-section timer (the user sees how long they spent without choosing to track), the dive gesture (the user sees the lens because they zoomed — there's no version of "diving" that doesn't trigger the explanation), the whiteboard breadcrumb (the user sees where they are because they're there).
  - Counter-examples we tried and rejected: optional "set a purpose at paper open" prompts (skipped); optional "press N to make a note" gestures (never pressed); optional "still with me?" probes (sensing too weak, false positives kill trust).
  - The pattern: **the surface must be a side-effect of normal use, not a separate ask.** Scaffolding still has to be dismissable per the prior principle, but for *behavior-correction* features specifically, "off by default" and "behavior-correction" are usually contradictory — pick one. The Focus Light makes the choice cleanly: it's off by default at the system level, but once the user opts in, the band moves whether they ask it to or not.
- **Observability and methodology docs are part of the product, not afterthoughts** (the **AI-built-product principle**, established 2026-04-25). When AI is the implementer and the user is the PM, the user does not read the source. They read the product, the docs, and the logs. Therefore:
  - **Every non-trivial subsystem ships with a methodology document** under `docs/methodology/` that explains *how it works* — the pipeline, the prompts, the design decisions, the failure modes — in plain language, not as a code reference. The user must be able to read that doc and reason about whether the approach is correct without opening any `.ts` file. If the approach turns out to be wrong, the doc is where the reasoning is found.
  - **Every non-trivial subsystem ships with structured logging the user can see** — both file logs (`fathom.log`) and a UI surface (the existing log viewer in the lens, or a per-feature DevTools panel for newer features). When something misbehaves, the user inspects logs and the doc, not source code, to understand what happened.
  - **Documentation precedes code; logging precedes documentation.** When we add a feature, the methodology doc and the logging hooks land in the same change as the implementation. Skipping either is a process failure, not just a polish gap.
  - **Implementer agents must be told this.** When the PM (this conversation) dispatches an implementer, the brief must include "ship the methodology doc + structured logs alongside the code." A successful build that has no doc + no logs is incomplete; the implementer must finish both before declaring done.
  - The methodology pages are the long-form complement to this CLAUDE.md. CLAUDE.md is principles ("don't do X"); methodology pages are operations ("here is how X works step-by-step").

## 2. Design principles

These are about *feel* — how Fathom looks, moves, and rewards the user's gestures. Apple-level smoothness is the bar.

### 2.1 Recursion has one visual grammar

This is the highest-priority design rule, because the product *is* the recursion.

- **Diving from PDF into a lens, drilling from a lens into a sub-lens, drilling from a sub-lens into a sub-sub-lens — all three are the SAME interaction**, with the same gesture, animation, anchor treatment, conversation surface, marker style, and back-navigation. *"It should be very much like the inception dream, where it's just hard to distinguish if I am in the regular PDF or the zoomed-in lens."*
- **One render path for markers.** Amber dots appear next to *every* place the user has dived into — paragraphs in the PDF, drilled phrases inside a parent lens, drilled phrases inside a sub-lens. Same colour, same size, same hover affordance, same click behaviour. The user can't tell whether they're clicking a "PDF marker" or a "lens marker"; from their POV both are "the dot near the thing I dove into".
- **One open path for lenses.** `useLensStore.open()` is the only entry; whether the click came from a PDF marker, an inline-lens marker, or a fresh ⌘+pinch is invisible to the rest of the rendering pipeline.
- **One persistence schema.** The drill graph is a uniform parent-child relation; depth is a derived property, not a special-cased one. (See §9 for the schema sketch.)
- **Test for recursion correctness:** ask "would adding depth N+1 require any new code beyond inserting another row in the same table?" If yes, we've broken the rule. If no, we're aligned.

### 2.2 Apple-level feel

- **Apple-level quality.** Semantic zoom must feel smooth and continuous, not a click-through wizard. Avoid any interaction that feels "very manual or very step-by-step."
- **The experience teaches itself.** A user should never need to read documentation to know what to do next. The DMG window explains how to install. The first launch explains what to try. The gesture explains itself. If a step depends on the user finding a README, we have failed the design. This rule applies at install, first-run, first-zoom, and every follow-up — instructions belong inside the surface the user is already looking at.
- **Simple, minimal options, impactful.** Every control earns its keep. No settings dialogs, no preferences, no toggles that only 5% of users will find.
- **The metaphor is the paper, not a chatbot.** Handwritten font on the explanation (Excalifont). Serif on anchor text. No speech bubbles, no avatars, no "AI says:" headers.
- **Help should be discoverable.** A `?` icon revealing all gestures and shortcuts is always present; never hide the controls behind experimentation.

### 2.3 Markers are the bookmark of the recursion

- **Markers are always present.** Any paragraph that has been zoomed into carries a small amber marker nearby — *right next to the paragraph it belongs to*, column-aware. The marker appears the instant the user pinches; it persists after the lens closes; it survives app restart and PDF reopen.
- **Markers nest.** When a marker is clicked and a lens opens, *that lens* renders its own markers next to phrases the user has previously drilled on. Click one of those, the sub-lens opens with its markers visible. (See §2.1 for why this is non-negotiable.)
- **Drill-origin lenses don't leave PDF-page markers.** They leave *in-lens* markers in the parent's body. The PDF page only carries markers for region- and viewport-origin lenses opened from the page itself.

### 2.4 Typography, controls, accessibility

- **Handwritten = voice, sans = information.** Excalifont is reserved for places where a human is speaking directly to the reader (Fathom wordmark, tagline, the "Built out of necessity" section in the README, the lens explanation body). Everything else — navigation, buttons, tables, code blocks, metadata, error text, download controls — uses system sans so it scans fast. Handwriting stops being special once it's everywhere; treat it as a scarce resource. The full enforcement rules live in `.claude/skills/fathom-communication.md`.
- **Icons explain themselves on hover.** Every icon-only or icon-heavy control has a `title=` (tooltip) and `aria-label` that names its purpose AND its keyboard shortcut. If a user has to hunt for what a control does, the control has failed.
- **Every control has a keyboard path.** Trackpad gestures are the idiomatic input, but the same action must be reachable via a keyboard shortcut — listed in the `?` help overlay and in `docs/INSTALL.md`. This is an accessibility principle first; the fact that it makes the app agent-testable is a secondary benefit.

## 3. Design principles — semantic-zoom gesture

- **Zoom frames the passage; the user asks the question.** The lens opens anchored on exactly what the user was looking at, with an input focused at the bottom. Fathom does NOT auto-prompt Claude on zoom. This was the original design and it kept guessing wrong — sometimes the user wanted a definition, sometimes a summary, sometimes to chase a citation. Shipping the auto-prompt spent latency on answers the user didn't ask for. The current rule: zoom sets context; the user types what they want; Claude answers that specific question. Drill inside a lens works the same way — pinch a phrase, lens opens anchored on the phrase, user asks.
- **The marker appears the moment the user zooms.** Not when the answer lands, not when the lens closes. As soon as a lens opens on a region or viewport, an amber dot is registered for that paper+page; when the lens closes the dot is visible on the PDF. Drill-origin lenses (selection inside a lens) don't get a PDF marker — they live inside the lens history, not on the page.
- **⌘ + pinch arms semantic mode.** Plain pinch stays visual.
- **Visual zoom is always cursor-anchored.** The point under the cursor must stay stationary through the zoom. Anything else is broken.
- **Commit moment = ⌘ key release.** Not gesture-start, not gesture-end. The user finishes framing what they want, then releases ⌘, then the lens opens.
- **Selection > cursor > viewport** for target priority when the user releases ⌘. If the user has text selected they mean that; otherwise cursor-anchored paragraph; otherwise the viewport contents.
- **What the user sees = what we capture = what Claude sees.** All three must be the same pixels. The anchor image shown in the lens, the image persisted to disk, and the image referenced in Claude's prompt are the same file. This is the "three-channel alignment" rule: if the text extraction disagrees with the image, trust the image.
- **Two-finger swipe navigates history.** Swipe right → back through lens history. Swipe left → forward. Like a browser. Opening a fresh lens invalidates forward history (also like a browser).

## 4. Design principles — lens (focus view) layout

In reading order, top to bottom:

1. **Anchor image.** A crop of the user's viewport at the moment of zoom — nothing more, nothing less. In a two-column layout, this must be only the targeted column, never both. The exact viewport is persisted to disk as `<pdf>.lens/zooms/<lensId>.png` and restored verbatim on reopen.
2. **Per-turn block.** Each question/answer pair in a stackable chat:
   1. The user's question (if this isn't the initial zoom turn).
   2. `▸ prompt to Claude` — the literal prompt sent, collapsed by default. Click to expand for full transparency.
   3. `▾ working` — live tool calls (`📖 Read content.md`, `🔎 Grep "\[76\]"`, `🌐 WebSearch …`) and any thinking deltas. Expanded while the answer body is empty, auto-collapses once the answer starts streaming.
   4. The answer body itself — handwritten font, markdown + KaTeX + inline SVG diagrams, selectable so the user can drill further.
3. **Sticky Ask footer.** A single input with a send button outside the box on the right. Always reachable, regardless of chat length. No duplicate "ask" labels anywhere.

Surrounding context (paragraphs before/after the anchor) is deliberately *not* shown. The anchor image provides enough spatial context. If the user wants more, they can pinch-out of the lens.

## 5. Scientific principles — explanations and grounding quality

- **Dive into a topic, don't summarize.** Semantic zoom is a request to learn more about something, not to re-read the passage in simpler words. Add the underlying mechanism, the symbols, the intuition, the prior work it builds on.
- **Use diagrams when structure matters.** Default to including one inline SVG when the passage describes an architecture, pipeline, loop, or relationship between components. Never Mermaid, never ASCII, never Markdown pseudo-diagrams. Excalidraw-style hand-drawn is the aesthetic — rounded rects, soft strokes, warm beige for the focused component, handwritten labels.
- **Ground every answer in the paper.** Before answering, Claude grep's the on-disk index, reads the right figure, resolves citations — never speculates. Cite page numbers and figure numbers in the reply so the user can verify.
- **No preamble, no padding.** "Begin directly with substance. No 'Here is an explanation…', no 'Sure!', no 'Of course.'."
- **Claude has the full toolbox.** `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`. Tool use is decisive — speculating when you could have grepped is a failure mode.

## 6. Scientific principles — the index is a file system, not RAG

- **No retrieval-augmented generation. No embeddings. No semantic similarity.** The paper becomes a folder Claude navigates as a file system.
- **One `content.md`** with the full paper in reading order. Page boundaries marked with `<!-- PAGE N -->` and `## Page N`. The references section is inline. Text-in-Markdown is friendlier to Claude than rendered pages.
- **Figure images only** — not whole-page screenshots. Each figure is a cropped PNG under `images/page-NNN-fig-K.png`, referenced inline in `content.md` at the right page boundary. "We don't need images of the pages; we need images of the figures, specifically."
- **The index folder lives next to the PDF.** Opening `~/Papers/foo.pdf` creates `~/Papers/foo.pdf.lens/`. One folder, no clutter, portable — move the PDF and `.lens/` folder together and the reading session travels.
- **`MANIFEST.md` teaches Claude the layout.** Every Claude explain call is told the index path; the system prompt instructs it to use `Read`/`Grep`/`Glob` inside that path as the primary grounding step.
- **Claude's Read tool handles PNG natively** — no poppler, no extra system deps for the per-call path.

## 7. Scientific principles — Claude is the engine

- **Use Claude Code underneath** (Agent SDK programmatically). The user's existing Claude CLI auth powers every call; no API key management.
- **Pre-decompose the paper once on open** as a background task, produce a structured digest (sections, figures, equations, glossary). Index quality determines answer quality — be deliberate about what goes into it.
- **Per-call explanations prefer the digest**, fall back to raw PDF Read only when needed. Keeps latency and costs low after the one-time indexing.
- **Stream everything.** Text deltas, tool calls, thinking — all flow to the renderer as they happen. Perceived latency must be as close to zero as possible.
- **Transparency.** The user can always see:
  - The exact prompt sent to Claude (collapsed by default, expandable).
  - The tool calls Claude made in real time.
  - The thinking stream if any.
  - Rich debug logs in DevTools for every hop (`[Fathom] …`, `[Lens AI <id>] …`, `[Lens Decompose] …`).

## 8. Engineering principles

- **Step-by-step diagnosis before assuming.** When something breaks, find the failure point via logs, DOM inspection, or a reproducible test. Don't guess-and-check.
- **Instrument first, then fix.** Every subsystem logs entry/exit and key decisions. When a user reports a symptom, the logs should already show the root cause.
- **Trust but verify.** After any non-trivial change, run an independent verifier (quality-engineer sub-agent) that re-reads the code against the user's criteria and reports pass/partial/fail.
- **No flakiness in visible state.** Markers, anchor images, chat history — each must be deterministic. If it's sometimes missing, we have a bug, not a "works most of the time" feature.
- **Never block the user's flow on the AI.** The Ask box is always editable; a new question aborts any in-flight stream. The user is in charge of their attention.
- **Telemetry and observability are core features, not afterthoughts.** Console logs, prompt inspection, tool-use stream — all exposed.

## 9. Engineering principles — persistence model

- All lens state for a paper lives under `~/Library/Application Support/Fathom/sidecars/<contentHash>/` as real files + one SQLite DB at `~/Library/Application Support/Fathom/lens.db`. No global app data keyed on paths (paths change; content hashes don't). v1 kept sidecars next to the PDF — we moved them into userData to avoid macOS TCC prompts on ~/Desktop, ~/Documents, ~/Downloads.
- Region ids are content-hash + deterministic text hash — stable across sessions and re-extractions.
- The zoom image is saved before the explain stream starts, and its absolute path is stored in the `explanations` row. On reopen, the renderer restores the image via an asset-read IPC so the exact viewport is visually identical.
- Explanations persist by region id. Follow-up questions are stored with their text so the chat history round-trips.

## 10. Non-goals (things we have been explicitly told not to build)

- Inline sticky-note overlays on the PDF page.
- Side-panel chat UI.
- Recursive elaboration that re-paraphrases itself (drilling into a selection dives into *that topic*, anchored in the paper, not into Claude's own prior output).
- RAG, embeddings, or any similarity-based retrieval.
- Figure generation via Mermaid, ASCII, or markdown pseudo-diagrams.
- Decorative visual chrome. "Apple-level design" means restrained, not flashy.

---

## 11. Minor principles

These are smaller-than-major preferences — not load-bearing enough to
sit alongside Product / Design / Scientific / Engineering, but real
enough that an agent should default to them when no stronger rule
overrides. Each one cites the user instruction it came from.

- **Visual indicators over short status text for transient UI.** For UI
  states that resolve in milliseconds — a page rendering, a save flushing,
  a stream warming up — I prefer a brief visual cue (spinner, pulse,
  colour shift, glyph) over a status word like "Loading", "Rendering",
  "Working". Short status text adds reading load that the eye doesn't
  need for a state that's about to disappear; a glyph signals the same
  thing in roughly half the foveal-acuity span and dissolves into the
  visual rhythm without inviting comprehension. Cross-references:
  `.claude/skills/fathom-cog-review.md` §3 (Doherty's threshold) and §4
  (foveal acuity ~2°). Counter-example: persistent state changes (a
  paper has been indexed, an update is ready to install) DO get plain
  English text, because the user is being asked to remember or act on
  them.

---

## Appendix: the user's instructions, verbatim

The 28 distinct user instructions that shaped Fathom v1 are preserved at
`/Users/ashrya/.claude/projects/-Users-ashrya-Desktop-PdfReader/` in the
session jsonl file. A deduplicated text dump is available on request. Every
principle above traces back to one or more of those messages.
