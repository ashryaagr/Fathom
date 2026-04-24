---
name: fathom-retro
description: The retrospection skill. Acts like an engineering manager running a performance review of Fathom's agent harness — which skills pulled weight, which didn't, what's missing, what should be hired/fired/altered. Run after every release, after any significant incident, or whenever the harness feels like it's drifting.
type: skill
---

# Fathom retrospection

A regular performance review of the agents, skills, and hooks that
build Fathom. Treat every skill in `.claude/skills/` as a team
member. Every commit-window hook, pre-push hook, build script as a
process. Every CLAUDE.md rule as a working agreement. All of them
should earn their place every cycle.

Other skills tell agents how to *do* things (test, release,
review UX, write copy). This skill tells agents how to *judge*
the team. It hires, fires, and asks for behaviour changes.

## When to run

- **After every release.** Right after the post-release log
  settles, before the next feature cycle starts.
- **After any user-reported regression that shipped.** If a fix
  slipped through and reached the user, the harness failed —
  figure out why.
- **After any cycle where more than one new skill was added.**
  New skills are hypotheses; check whether they're earning their
  keep.
- **Anytime CLAUDE.md §0 grows a new rule.** Rules that don't
  show up in retrospection drift into being decorative.

## The questions (the review)

For every member of the team, answer:

### 1. What the skill / hook / rule did this cycle

List specific moments — commits, incidents, decisions — where the
skill was invoked or the rule was applied. A skill that nobody
invoked is a skill that didn't contribute. That's not
automatically a bad thing (some skills are insurance) but it's a
signal.

### 2. What it caught that humans wouldn't have

Credit for catches the skill uniquely enabled. For example:
`fathom-qa` caught the hooks-order regression in v1.0.3 — a React
error that would have shipped to the user otherwise. That's a
hire-worthy contribution.

### 3. What it *missed* that it should have caught

Charges against the skill. For example: `fathom-release` didn't
flag that v1.0.2 would be a migration release (v1.0.1's broken
updater couldn't reach v1.0.2 automatically); the user hit the
wall before the skill warned us. The skill has since been
updated — that's the retro's output.

### 4. Does the skill overlap with another?

Two skills covering the same ground create confusion about which
to invoke. Decide: merge, delete, or carve a sharper boundary.
Example: we already consolidated "branding" + "marketing" +
"aesthetic" into `fathom-communication` — don't let them fork
again.

### 5. Is the skill's prescription still calibrated?

Rules go stale. A check that mattered six weeks ago may block
progress today. Ask: would we write this rule today the same way?
If no — update or remove.

## The verdicts

After the review, each skill / hook / rule gets one of:

- **🟢 Keep** — earning its place, no changes needed.
- **🟡 Alter** — useful but drifting; update the prescription.
  Write the new version inline in this retro report.
- **🔴 Fire** — no longer earning its place. Move to
  `.local/archived-skills/` (gitignored) for reference, and
  delete from `.claude/skills/`.
- **🎯 Hire** — missing coverage a new skill would close. Spec
  out the skill's brief inline; create it in the same session.
- **↔ Split** — one skill is doing two jobs; split into two.
- **⊕ Merge** — two skills are doing one job; merge.

## The output

A retro report at `.local/retros/<YYYY-MM-DD>-<label>.md`. Local
only — gitignored. Format:

```markdown
# Fathom retrospection — <date> — <trigger>

## Cycle summary
<one paragraph: what shipped, what broke, what was the vibe>

## Team review
### fathom-qa
- Invoked: <X times>
- Caught: <incidents>
- Missed: <incidents>
- Verdict: 🟢 Keep / 🟡 Alter / 🔴 Fire
- If Alter: <specific changes, or "see diff below">

### fathom-release
...
(every skill + every §0 rule + every hook)

## Hires
<new skills to add, with briefs>

## Fires
<skills to archive>

## Harness changes shipped this retro
<list of commits made as part of executing this retro>
```

## Authorities this skill holds

The retro skill is the only skill authorised to:

- **Rename / restructure** `.claude/skills/*` files.
- **Archive** (move to `.local/archived-skills/`) skills that
  aren't pulling weight.
- **Propose changes** to CLAUDE.md §0 rules (the actual edit
  should still happen through the usual commit path, but the
  retro report is the source document).
- **Rewire harness pieces** — `scripts/fathom-test.sh`, the
  pre-commit hook, the pre-push hook — based on gaps found.

Any agent invoking this skill can perform those actions inline.
Authority is scoped to the harness itself, not to product code.
A retro should not ship a product fix; it ships a *harness* fix.

## Running the retro

A canonical invocation (from any agent session after a release):

```
1. Read .claude/skills/*.md + CLAUDE.md §0 + the post-release log
   window since the last retro.
2. For each skill / hook / rule, answer the 5 questions above.
3. Assign a verdict per member.
4. Draft the retro report at .local/retros/<date>-<label>.md.
5. Execute any 🟡 Alter / 🔴 Fire / 🎯 Hire / ⊕ Merge / ↔ Split
   changes. Commit with a subject starting `retro:`.
6. Surface the "cycle summary" back to the user — they shouldn't
   have to read the whole report; just the top-line and the
   hires / fires.
```

## Things the retro skill must avoid

- **Performative ceremony.** If a cycle had no incidents and
  every skill did exactly what it was supposed to, the retro
  should be short and honest: "everything earned its place,
  nothing to change." Don't invent changes to justify running
  the skill.
- **Symmetric grading.** Not every skill deserves a medal every
  cycle. Some skills are insurance and will do nothing most of
  the time; that's fine. Grade on contribution, not attendance.
- **Product-level scope creep.** The retro reviews the harness,
  not the product. "Lens UI felt clunky" is for
  `fathom-ux-review`; "nobody ran `fathom-ux-review` before that
  lens change landed" is for the retro.
- **Being diplomatic.** The review exists because diplomacy
  misses things. If a skill is dead weight, say so. If a rule
  is wrong, rewrite it. That's the job.

## Example verdicts from recent cycles

Keep this list short — it's illustrative only. The real retro
reports live in `.local/retros/` (gitignored).

- 🟢 **Keep**: `fathom-qa` — caught the v1.0.3 hooks-order
  regression that would have shipped to the user as a
  white-screen-on-dive.
- 🟡 **Alter**: `fathom-release` — previously didn't distinguish
  migration releases (updater.ts changes) from normal ones;
  gained that rule after the v1.0.1 → v1.0.2 wall.
- 🟢 **Keep** (with minor alter): `scripts/fathom-test.sh` — QA
  agent flagged that `shot` doesn't activate Fathom first;
  needs a one-line fix. Filed for next harness pass.
- ⊕ **Merged** (historical): what was "branding" + "marketing" +
  "aesthetic" consolidated into `fathom-communication`.
