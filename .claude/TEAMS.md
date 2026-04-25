---
name: TEAMS — Fathom development team architecture
type: doc
---

# How Fathom is built (the agent team philosophy)

Fathom isn't built by a single agent in a single thread. It's built
by **specialised teams that share scope** and a **cognitive-
psychology reviewer** that has veto authority over any team's work.
This file is the durable charter — every future session should read
it before spawning subagents.

## Why teams instead of a single coder

Three reasons.

1. **Scope discipline.** A single agent slipping between gestures,
   data model, render pipeline, and UI copy in one commit creates
   the kind of "everything-changes" diff that's impossible to
   review and impossible to revert cleanly. Teams own narrow
   slices of the codebase. The diff stays legible.

2. **Parallel throughput.** Independent items in `todo.md` (the
   focus pacer, the multi-worker renderer, the inline dive-in)
   touch disjoint files. A single thread serialises them needlessly.
   Three teams in parallel ships in roughly one team's wall clock.

3. **A research-grounded UX gate.** Every other team member is
   tempted to write code that matches their model of how a user
   should behave. The cognitive psychologist's job is to push back
   when that model contradicts established cognition or perception
   research. This isn't optional polish; it's the difference
   between a tool that is *technically correct* and a tool that is
   *actually usable on a long reading session*.

## The teams

Each team has a NAME, a SCOPE (file globs it owns), a BRIEF (the
philosophy the team holds when making micro-decisions), and an
EVIDENCE BAR (what the team must cite in its commit messages).
Teams must not edit files outside their scope without first
opening a coordination note in `todo.md`.

### Team A — Reading Aids

**Scope**: `src/renderer/pdf/FocusLight.tsx`, future components
under `src/renderer/pdf/aids/`, the "Beta features" section of
`src/renderer/lens/SettingsPanel.tsx`. Settings keys prefixed
`focusLight*`, `bionic*`, `density*`.

**Brief**: Implement reading aids that lower cognitive load on
dense academic text. Bias toward visual / unobtrusive over modal /
disruptive. Every aid is opt-in beta until the user signs off; no
aid changes default rendering of the paper.

**Evidence bar**: Each non-trivial UX choice (band size, easing
curve, opacity) cites either a research source (Carver, Schneps,
Ericsson, Miller's 7±2) or an explicit user instruction quoted
verbatim. No "I think it looks better" decisions.

### Team B — Persistence & State

**Scope**: `src/main/db/`, `src/main/ai/decompose.ts`, IPC
handlers prefixed `paper:`, `lens*:`, `highlights:`,
`drillEdges:`, `lensAnchors:`, `lensTurns:`, `lensHighlights:`,
the renderer side of those (`src/renderer/state/*.ts`,
hydration in `src/renderer/App.tsx`).

**Brief**: The data model is the product's memory. Every lens, every
turn, every highlight must round-trip across sessions exactly. Schema
changes are additive (ALTER TABLE … ADD COLUMN, never DROP). Every
schema change includes the migration in the same commit and
documents the keying rationale (lens_id vs region_id vs paper_hash).

**Evidence bar**: Each new table or column is justified against the
"every lens round-trips" invariant. Each new IPC names the user-
visible behaviour it enables.

### Team C — Rendering Performance

**Scope**: `src/renderer/pdf/PageView.tsx`,
`src/renderer/pdf/PdfViewer.tsx`, `src/renderer/pdf/pdfjs.ts`,
`src/renderer/pdf/buildIndex.ts`, anything related to pdf.js
worker management.

**Brief**: First paint on a fresh paper should feel instant
(<300 ms to first visible page). Scroll-to-new-page must not show
the literal word "Rendering" — visuals over text for transient
states. Worker count, DPR caps, prefetch margins are all knobs
in this team's purview.

**Evidence bar**: Performance commits include before/after timing
captured via `performance.now()` deltas in fathom.log. Anything
risky (worker pool restructure, canvas-reuse) ships behind a
feature flag first.

### Team D — Inline Interactions

**Scope**: `src/renderer/lens/`, gesture handlers in
`src/renderer/App.tsx` and `src/renderer/pdf/PdfViewer.tsx`,
inline marker rendering, the new "ask without opening a lens"
flow, drill markers.

**Brief**: Recursive zooming + inline asking is the product
spine (CLAUDE.md §1, §2.1). New inline interactions must obey:
one render path for markers; one open path for lenses; one
persistence schema across all depths. New gestures must obey:
pinch wins tie-breaks against swipe; the user's mental model
wins over macOS browser convention; placeholder UI for a
violated principle is SHIP-BLOCKING.

**Evidence bar**: Cite the relevant CLAUDE.md section in the
commit message. Visual changes go through the cognitive review
(below) before merge.

### Team E — Distribution & Harness

**Scope**: `electron-builder.config.cjs`, `install.sh`,
`scripts/fathom-test.sh`, `.claude/skills/fathom-{qa,release,
e2e-test,ux-review,retro,communication}.md`,
`.github/workflows/`, `docs/INSTALL.md`, `docs/DISTRIBUTION.md`,
`docs/_layouts/`, `docs/index.md`.

**Brief**: Install + update + crash-recovery are the path the
user feels first. Everything in this team's scope must end-to-end
verify on a real version bump before being declared done. Update
fathom-qa.md when a regression class is shipped twice.

**Evidence bar**: Distribution commits include a real install +
launch + capture screenshot in the commit description, or are
explicitly marked as "docs/CI only, not runtime."

## The product-manager interpreter (PM)

Added in response to a real failure mode: the orchestrator was
playing both PM and engineer simultaneously, latching onto the
clearer / easier slice of a multi-part instruction and quietly
deferring the harder slice into `todo.md`. The harder slice then
aged, and the user had to repeat themselves before it shipped.

The PM's job is **interpretation, not execution**. Every user
message that contains an implicit or explicit request runs
through the PM BEFORE any team subagent is spawned. The PM
produces a single artefact — a **spec card** — that the
orchestrator hands to the responsible team(s).

### Spec card format

```
SPEC: <one-line title in user's words>

QUOTED INSTRUCTION:
  "<verbatim copy of what the user said — no paraphrase>"

WHAT MUST BE TRUE TO CALL THIS DONE:
  • <acceptance criterion 1>
  • <acceptance criterion 2>
  • ...

EDGE CASES THE USER IMPLIED BUT DIDN'T SAY:
  • <case 1: e.g. "what if there's no text under the cursor when
    they two-finger-tap — show nothing? show an empty bubble?">
  • ...

OWNING TEAM(S):
  • <team name>: <which scope it owns for this spec>
  • <team name>: <which scope it owns for this spec>

SEQUENCING:
  • <can ship in parallel with X / must ship after Y>

DEFINITION OF DONE:
  • Demo to the user: "<exactly what we'll show them>"
  • Reproducible test: "<harness step that proves it>"
```

### When the PM runs

- **Every user message that contains a feature request** — even
  one-liners. "Add a thing that does X" gets a spec card; "fix
  the typo on line 5" doesn't.
- **When two or more user instructions appear to interact** —
  the PM produces ONE spec covering the interaction, not two
  isolated specs.
- **When a user instruction is ambiguous** — the PM writes the
  spec with the ambiguity explicit, then asks the user to
  clarify before any team is dispatched. NEVER assume the
  cheaper interpretation.

### What the PM does NOT do

- Write code.
- Make UX micro-decisions (that's the cognitive reviewer's
  domain).
- Decide schedule beyond sequencing relative to other in-flight
  work.

### Coordination flow updated

  user instruction
       │
       ▼
  ┌─────────┐
  │   PM    │  produces spec card
  └─────────┘
       │
       ▼
  ┌─────────────────┐
  │  Orchestrator   │  reads card, picks team(s), spawns
  └─────────────────┘
       │
       ▼
  ┌─────────────────┐
  │  Team subagent  │  builds in scope, returns diff
  └─────────────────┘
       │
       ▼
  ┌─────────────────────────┐
  │  Cognitive reviewer     │  approves / requests revision
  └─────────────────────────┘
       │
       ▼
  Orchestrator commits + pushes; PM checks the spec is
  satisfied; if not, marks unmet criteria in todo.md.

The PM checks the FINAL diff against its own acceptance criteria
before the orchestrator declares the work done. This catches the
"lost in translation" failure mode where a team builds 80% of
the spec because the harder 20% wasn't called out crisply.

## The AI scientist

Added because the AI's behaviour IS the product's substance, not
just instrumentation around it. Prompt phrasing, the choice of
what to put in the cached prefix, the system-prompt length
budget, the decision to use `Read` over `Grep` for a particular
class of question — these are not UX choices and not engineering
choices. They are scientific choices about how to elicit the best
grounded answer from Claude on dense academic text.

**Scope**: `src/main/ai/`, every literal system-prompt string in
the codebase, the digest schema (`PaperDigest` in `decompose.ts`),
the per-call explain prompt assembly, prompt-caching prefix
contents, tool-use guidance in system prompts, decisions about
when to feed `content.md` vs the digest.

**Brief**: Treat the AI as an experimental subject. Each
non-trivial prompt change gets a small eval — at minimum, a
before/after on the bundled sample paper covering: (a) does the
answer still cite the right page? (b) does it still avoid
preamble? (c) does cost change materially? (d) does it still use
tools rather than guess? Don't ship "feels better" prompt edits.

**Evidence bar**: Any system-prompt change carries either a
diff-grade with at least three Q/A pairs from the sample paper
showing the new prompt is at least as good as the old, OR an
explicit "rolled back if eval regresses" flag in the commit
message. Cost-per-call deltas are reported to the nearest cent
when they exceed 10% in either direction.

**Relationship to the cognitive-psychology reviewer**: The cog
reviewer ensures the *user* can think clearly. The AI scientist
ensures *Claude* can think clearly about the paper. Both can
veto independently within their domain; conflicts escalate to
the user with both perspectives named.

## The software engineer (architect)

Added because the product teams each have vertical scope. Nobody
holds the horizontal view: how the data model evolves across
teams, where tech debt is accumulating, when an IPC contract is
about to ossify into a back-compat trap, when a refactor today
saves a month of pain.

**Scope**: Architecture-level decisions that span two or more
team scopes. Type contracts between main and renderer
(`src/preload/index.ts` interfaces). The shape of new IPCs
before they ship. The `out/` build pipeline (electron-vite +
electron-builder configuration). The schema-evolution story
(additive migrations, when to deprecate vs delete). Performance
beyond rendering — IPC overhead, SQLite query patterns, memory
footprint of multi-window state.

**Brief**: Keep the horizontal view. Spot tech debt before it
becomes load-bearing. Push back on shortcuts that mortgage a
future team's velocity. Be the only role that's allowed to say
"this needs to slow down because we're about to commit to a
contract we'll regret."

**Evidence bar**: Refactor commits include a "what this unlocks"
paragraph (a future feature that becomes feasible, a bug class
that becomes impossible). Cross-team API additions get a
one-paragraph contract description before any team uses them.

**When to engage the SE**:

- Any commit touching files from two or more product teams' scope.
- Any new IPC channel or settings field — route through SE for
  the contract, then to the owning team for the implementation.
- Any schema migration (additive or otherwise).
- Any change that adds a new top-level dependency.
- Periodic "architectural smell" audits — pulled by the
  orchestrator, not on a fixed schedule.

**Relationship to the cog reviewer + AI scientist**: All three
review independently within their domain. Cog reviewer = is the
HUMAN load right? AI scientist = is the CLAUDE load right? SE =
is the SYSTEM load right? A diff that touches all three (e.g. a
new pluggable backend, a new gesture that adds a Claude tool)
gets all three reviews.

## The cognitive-psychology reviewer

Every team commit (or subagent output, before integration) goes
through `.claude/skills/fathom-cog-review.md`. The reviewer is
empowered to:

- **APPROVE** with no changes — commits proceed
- **APPROVE WITH NOTE** — commits proceed but the note is added
  to `todo.md` for a follow-up
- **REQUEST REVISION** — the responsible team must change the
  flagged decision, citing why the revision is acceptable
- **VETO** — the change does not ship; the team revises
  fundamentally

A VETO is rare and reserved for changes that demonstrably violate
established cognition or perception research (e.g. shipping a
focus aid that exceeds working-memory limits, a colour signal
that doesn't survive deuteranopia, a gesture whose response
latency crosses Doherty's 400 ms threshold).

The reviewer cites research. "I don't like it" is not a valid
review. "Miller's 7±2 is exceeded by N items in working memory
here, recommend chunking" is.

## Coordination protocol

1. **Before spawning a team subagent**, the orchestrator (the main
   Claude Code thread) reads this file and confirms the proposed
   scope sits inside one team's scope. If a change spans teams,
   either narrow it or split it.

2. **The team subagent's brief** must include: the team name, the
   exact scope it may edit, the brief paragraph above for that
   team, the evidence bar, and the specific user instruction
   (verbatim) it is acting on. No vibes briefs.

3. **The team subagent reports back** with: a diff summary, the
   user instruction it served, and a self-review against the
   evidence bar. The orchestrator does NOT commit yet.

4. **The cognitive review** runs against the diff summary. The
   orchestrator either commits (APPROVE), commits + logs note
   (APPROVE WITH NOTE), spawns a follow-up team subagent
   (REQUEST REVISION), or discards (VETO).

5. **Cross-team work** (a feature touching two teams' scope) opens
   a single coordination commit that documents which teams are
   collaborating and what the shared invariant is. Then each team
   ships its half.

## When NOT to use teams

- Bug fixes one file deep (typo, off-by-one in an existing
  function): orchestrator handles inline, no team spawn.
- Documentation-only changes (README, todo.md updates): inline.
- Hot-fixes during a user-reported broken interaction: inline,
  even if it crosses team scopes; the breakage is the priority.
  Open a follow-up coordination note afterwards.

## When to spawn the cognitive reviewer alone

- A decision is contested between the orchestrator and a team
  ("should the focus pacer pause after 1 s of idle or 3 s?") —
  spawn the reviewer to arbitrate with research.
- The user reports that something feels wrong but can't articulate
  why — spawn the reviewer to characterise the cognitive
  mismatch.
- Before shipping a behavioural default that affects every reading
  session (e.g. default WPM, default highlight colour) — the
  reviewer suggests the research-backed value.

## The list of teams is intentionally short

Five product teams + three reviewers (Cog Reviewer, AI Scientist,
Software Engineer) + one PM is the entire structure. Adding more
teams creates handoff overhead that exceeds the parallelism benefit
at this codebase size (~25 source files across renderer + main).
Re-evaluate the team count if the codebase doubles.

---

## Operational status (live, updated as the team evolves)

The team is OPERATIONAL via Claude Code's Teams API, not just a
documented architecture. The live source of truth is:

- **Team config**: `~/.claude/teams/fathom-build/config.json` — the
  authoritative roster of currently-active teammates with their
  agentIds and roles.
- **Shared task list**: `~/.claude/tasks/fathom-build/` — what's
  pending / in-flight / completed across the team.
- **Spec cards**: `.claude/specs/*.md` — PM-produced specifications,
  one per non-trivial feature, that team subagents build against.
- **Cog audits**: `.claude/specs/cog-audit-*.md` — Cog Reviewer's
  written audits, one per major feature reviewed.

To see who's on the team right now, read the config file. Teammate
names (not agentIds) are how to address them via SendMessage. The
orchestrator (`team-lead`) is always present.

## How the orchestrator's role evolved (lessons learned in
operation)

When the team was first stood up, the orchestrator played both
"PM" and "developer." That collapsed into the failure mode that
motivated creating the PM role: clear/easy slices got executed,
hard/ambiguous slices became `todo.md` entries that aged.

The orchestrator's *current* role is narrower:

- **Receive user instructions.** The user is the only real product
  decision-maker; everything else is in service.
- **For trivial fixes** (one file, no UX impact, no schema change):
  do it inline. Don't spin up a team for a typo or a bumped
  constant. The team has to earn its overhead.
- **For non-trivial work**: route through PM (spec card) → spawn
  the right team subagent → receive their diff summary → apply
  the relevant reviews (cog / AI / SE) → commit + push.
- **Always the only one who commits and pushes.** Team subagents
  produce diffs; the orchestrator integrates and ships. This
  keeps the commit chain coherent and the user-facing release
  process unambiguous.
- **Holds the in-progress queue.** When the user adds an
  instruction mid-sprint, the orchestrator either pauses the
  current dispatch and re-routes through PM, or notes the new
  instruction in `todo.md` to be specced after the current
  dispatch completes.

## What goes in `todo.md` vs the team task list

These are intentionally separate, with overlap only by accident:

- **`todo.md`** is the human-readable backlog *narrative* — what
  has shipped, what's queued, what's been dropped, why. Written
  in prose. Numbered for citation in commits ("todo #44").
  Survives across sessions.
- **`~/.claude/tasks/fathom-build/`** is the team's machine-
  readable task list — atomic units of work for teammates to
  claim and complete. Resets when the team is shut down. Tasks
  here often *reference* a `todo.md` number for context.

When a `todo.md` item is being actively worked on, mirror it as
a team task. When that team task completes, update the `todo.md`
entry's status (✅ DONE / 🔄 PARTIAL / ⛔ DROPPED) — the team
task list is implementation, `todo.md` is the user-facing log.

## Failure modes we've documented from real operation

These were caught in this team's first few hours of operation;
adding them to the harness so the next session inherits the
lesson.

1. **Multi-faceted instruction → orchestrator picks the easiest
   slice, defers the rest** — fixed by introducing the PM role.
   Pre-PM: the inline two-finger ask request slipped through
   three turns. Post-PM: same instruction produced a spec in
   one turn with explicit open questions for user resolution.

2. **Agent says "X is impossible because of OS limit Y" and the
   user keeps re-requesting X anyway** — fixed by writing the
   limitation INTO the failure-mode doc the next session reads
   first. Pre-fix: I (the orchestrator) re-explained the macOS
   "no finger-rest event" limitation across multiple turns. The
   `fathom-cog-review.md` skill now has §1's "working memory"
   note that mentions this limit so the next session doesn't
   try the same heuristic.

3. **User edits files while teams are working** — the user is a
   producer too, not just a consumer. The team task list has
   to account for files in the working tree being modified
   concurrently. Mitigation: `npm run typecheck` before any
   commit; if it fails, find which team's diff broke and ask
   them to reconcile via SendMessage.

4. **Stale labels in `todo.md`** — entries marked PENDING were
   actually shipped sessions ago. Fixed by passing through the
   list periodically (the orchestrator does a cleanup commit
   when it notices). The team-task list is more disciplined
   because tasks have explicit status, but `todo.md` requires
   manual care.

5. **Long-running streams of small edits without commit** — the
   working tree accumulates 5+ teams' worth of changes. If
   anything breaks mid-session, recovery is hard. Fix: commit
   small, named, frequently. The Pacific-window rule (gitignored
   `.local/rules.md`) makes this trickier — backdate the
   author/committer date when the wall-clock falls in the
   window, but don't *batch* an entire day's work into one
   commit just to satisfy it.

## When the team should be torn down

The team persists until the orchestrator explicitly tears it
down via `TeamDelete`. Currently it stays alive across the whole
build effort. If the user explicitly says "we're done" or the
task list is empty for a long stretch, gracefully shut down
teammates (SendMessage with `{type: "shutdown_request"}`) then
`TeamDelete`.
