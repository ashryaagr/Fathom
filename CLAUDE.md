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

- **The user is trying to understand a research paper.** Every design decision must measurably help that goal. "Cool" features that don't help understanding are out of scope.
- **The reader should never have to leave the document.** The Claude chat is not a side panel; it is the zoom. When the user asks for help, the help appears in place, as part of the reading flow.
- **Zoom has two distinct modes:** visual zoom (plain pinch) and semantic zoom (⌘ + pinch). They must feel continuous with each other, not like two separate tools.
- **Zooming persists.** If a user semantically zooms on a paragraph, closes the lens, reopens the paper weeks later, and zooms again — the exact same anchor view, the conversation history, and the diagrams must all be there. "It should all be a consistent experience, no matter when you open it or in what situation, after how many steps or whatever you do."
- **Recursion is the spine of the product.** Reading begets zoom; zoom begets a lens; the lens begets drills; the drills are themselves lenses; their selections beget more drills. There is no maximum depth. The user's mental model isn't "one PDF + one assistant", it's "one PDF and as many turtles all the way down as I need". This is the product's *shape*. The design principles in §2 are how we make that shape feel like one continuous interaction; the data model in §9 is how we make it survive across sessions.

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

## Appendix: the user's instructions, verbatim

The 28 distinct user instructions that shaped Fathom v1 are preserved at
`/Users/ashrya/.claude/projects/-Users-ashrya-Desktop-PdfReader/` in the
session jsonl file. A deduplicated text dump is available on request. Every
principle above traces back to one or more of those messages.
