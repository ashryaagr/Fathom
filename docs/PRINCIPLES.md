# Fathom — principles

These are the rules Fathom was built on. If a change you're proposing
contradicts one of them, the principle wins unless you can articulate
— in an issue or PR description — why it should change.

Short and public version; the longer operational notes stay private
in `CLAUDE.md` at the repo root.

The principles are grouped by *kind*, because the kind tells you who
the rule constrains:

| Category | Constrains | Example |
|---|---|---|
| **Product** | What we build, for whom, why. | "Reader should never leave the document." |
| **Design** | How the product looks, feels, reacts. | "Recursion has one visual grammar." |
| **Scientific** | How the AI grounds itself in the paper. | "The paper is a filesystem, not a vector store." |
| **Engineering** | How the codebase is built and maintained. | "Instrument first, fix second." |
| **Communication** | Voice, copy, typography. (Lives separately in `.claude/skills/fathom-communication.md`.) | "Handwritten = voice, sans = information." |

---

## Product principles

- **The reader should never have to leave the document.** Claude is the zoom, not a side panel.
- **Two zoom modes, one gesture surface.** Pinch = visual. ⌘ + pinch = semantic. They live on the same trackpad.
- **Zoom persists.** Every lens — the viewport image, the chat history, the prompt, the diagrams — round-trips across app restarts.
- **Recursion is the spine of the product.** Reading begets a zoom; the zoom begets a lens; the lens begets drills; drills are themselves lenses; their selections beget more drills. There is no maximum depth. The user's mental model isn't "PDF + assistant" — it's *turtles all the way down, on demand.*

---

## Design principles

### Recursion has one visual grammar

This is the highest-priority design rule, because the product *is* the recursion.

- Diving from PDF → lens, drilling lens → sub-lens, drilling sub-lens → sub-sub-lens — all three are the **same interaction**, with the same gesture, animation, anchor treatment, conversation surface, marker style, and back-navigation. *"Like the inception dream — hard to tell whether you're in the regular PDF or a zoomed-in lens."*
- **One render path for markers.** Amber dots appear next to every place the user has dived into — paragraphs in the PDF, drilled phrases inside a parent lens, drilled phrases inside a sub-lens. Same colour, same size, same hover affordance, same click behaviour.
- **One open path for lenses.** Whether the click came from a PDF marker, an inline-lens marker, or a fresh ⌘+pinch is invisible to the rest of the rendering pipeline.
- Test: *would adding depth N+1 require new code beyond inserting another row in the same table?* If yes, we've broken the rule.

### Feel

- **The experience teaches itself.** A user should never need to open the docs to know what to do next. The DMG window shows how to install. The first launch shows what to try. The gesture shows its own affordance. If a step requires reading a README, we've failed.
- **Smooth, not wizard-driven.** Gestures commit on intent, not on a button press.
- **Minimal options, impactful.** No settings dialog, no preferences cluttering the chrome.
- **Markers are the bookmark of the recursion.** Always present, always click-to-reopen, always nest inside lenses just like they do on the PDF.

### Gesture

- Visual zoom is **cursor-anchored**. The point under the pointer stays stationary.
- Semantic zoom **commits on ⌘ release** — the user frames what they want first, then commits.
- **Zoom frames the passage; the user asks the question.** No auto-prompt. The lens opens with an empty chat focused on what was zoomed; the user types what they actually want to know.
- **Selection > cursor > viewport** for target priority.
- **What the user sees = what we capture = what Claude sees.** Three-channel alignment. If extracted text disagrees with the image, trust the image.
- **Two-finger swipe = browser back / forward** through the lens history.

---

## Scientific principles

How Fathom grounds Claude in the paper. These are the rules that decide what the AI can and can't make up.

- The paper is a **filesystem**, not a vector store.
- **No RAG. No embeddings. No semantic similarity.** Claude uses `Read` / `Grep` / `Glob`.
- **One `content.md`** with the full paper text in reading order — not per-page files (loses cross-page context).
- **Cropped figures, not whole-page screenshots.** `images/page-NNN-fig-K.png`, referenced inline in `content.md`.
- **The sidecar lives in `userData/sidecars/<contentHash>/`.** Keyed by SHA-256 of the PDF, so the same paper on any path reuses the same state. (Earlier versions stored sidecars next to the PDF; that triggered macOS TCC prompts on `~/Desktop` / `~/Documents` / `~/Downloads`. Moved to `userData` to eliminate those.)
- Uses **Claude Code** via the Agent SDK. The user's own auth — no API keys.
- **Pre-decompose on open** into a structured digest, cache forever. Per-call reads reuse the digest.
- **Stream everything.** Text, thinking, tool calls. Perceived latency must be close to zero.
- **Diagrams only when they help** — one inline SVG per response when structure / flow / relationship is the point. Never Mermaid, never ASCII, never markdown pseudo-diagrams.

---

## Engineering principles

- **Instrument first, fix second.** Every subsystem logs entry/exit and key decisions.
- **Step-by-step diagnosis before assuming.** When something breaks, the logs show where. Don't guess-and-check.
- **Trust but verify.** Non-trivial changes get an independent reader-agent pass.
- **No flakiness in visible state.** Markers, anchor images, chat history are deterministic.
- **Transparency is a feature.** The exact prompt sent to Claude is one click away on every lens turn.
- **Reported-failure retrospection.** If a fix we shipped doesn't work for the user, treat it as a systemic failure of the agent harness — not a retry. Add instrumentation, capture the new pattern in a skill.
- **End-to-end verify shipping paths.** Distribution / install / update / first-run flows must be tested on a real version bump before being declared done.

---

## Communication principles (typography, copy, voice)

These live in `.claude/skills/fathom-communication.md` because they're routinely consulted as a checklist by the agent harness when copy or visuals change. Headlines:

- **Report, don't persuade.** No marketing superlatives.
- **Handwritten = voice, sans = information.** Excalifont is a scarce resource.
- **Three-surface typography rule.** App + docs site can carry handwriting; GitHub README can't (use blockquote for voice moments instead).
- **Don't rewrite the author's voice.** Existing phrasing is the voice, not a draft.

---

## Non-goals

- Inline sticky-note overlays on PDF pages.
- Side-panel chat UI.
- Recursive AI-on-AI paraphrasing (drills always re-anchor in the paper, not in Claude's prior generation).
- RAG, embeddings, vector search.
- Figure generation via Mermaid, ASCII, or markdown pseudo-diagrams.
- Decorative chrome. Apple-level quality means restrained, not flashy.
- Auto-prompting Claude on zoom. Zoom sets context; the user asks the question.
