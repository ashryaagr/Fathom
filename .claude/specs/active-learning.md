---
spec: Active Learning — interventions that turn passive reading into engaged learning
owning_team_primary: TBD
owning_team_secondary: Reading Science Researcher (DELIVERED), Cog Reviewer (next), PM Interpreter (synthesis below), AI Scientist (per-feature design after user picks slice)
status: SYNTHESIS COMPLETE — awaiting Cog Reviewer + user pick of slice. Do not implement yet.
created: 2026-04-25
related_specs:
  - `.claude/specs/whiteboard-diagrams.md` (complementary; the Whiteboard is one *form* of active engagement, this spec is about the *behavioral* layer)
research-sidecar: `.claude/specs/active-learning-research.md`
---

# PM SYNTHESIS v2 — pivoted around the forcing-function principle (2026-04-25)

The user reviewed PM Synthesis v1 (preserved at the bottom of this file) and rejected most of the recommended slice:

> *"I don't find the current recommendations very convincing. I find that the timer thing can be useful if I put a timer on how much time I am taking per section; then that can help me see that I am mindful that it is spending time. The purpose anchor doesn't help, because I am most likely to ignore it, and for nodes I might not even want to make nodes. It's like there needs to be a forcing function in our design. Perhaps that is something we can keep in mind for problems like these, where we want to correct behaviors like these; there might need to be a forcing function."*

This pivot establishes a new design principle (now in CLAUDE.md §1): **Behavior change needs forcing functions, not nudges.** Optional anchors and opt-in note keys fail because the user — by definition of "I want to change this behavior" — is the user who won't opt in. The Focus Light is the canonical right-sized forcing function: visible enough to ignore is a choice, weak enough that ignoring it costs nothing concrete.

## Recommended slice v2 — one intervention, one forcing function

### Section Timer (NEW — replaces the v1 slice. Cog reviewer revisions absorbed 2026-04-25)

**Mechanism.** A small per-section timer in a corner of the PDF view (exact placement: PM/UX reviewer agent). Starts counting when the user enters a section (detected by scroll position past the section heading); auto-resets when they enter the next section, with a 3 s overlay showing the previous section's time (e.g. *"Intro: 8m"*) before the new section's timer starts at "just now". Timer is always visible while reading.

**Why this satisfies the forcing-function principle.** The timer is a side-effect of normal use — the user sees it because they're reading, not because they made a separate decision to "track time." Mindfulness about time-spent emerges from the *visibility*, not from a notification. Counter to v1's purpose anchor (which the user said they'd ignore), the timer cannot be ignored without the user actively occluding the corner.

**Why this addresses both Problem A and Problem B.** A timer that shows *"You've been on this section for 18m"* lets the user see for themselves: am I spending time productively, or drifting? Long times on a dense methods section = engaged; long times on the abstract = drift. The user becomes their own metacognitive monitor — Fathom doesn't need to detect "lost," because the user can detect their own drift from the timer alone.

#### Visual physics — locked by cog reviewer (CRITICAL — implementation must follow these exactly)

The cog reviewer flagged that the prior spec under-specified the timer's visual physics. Without these constraints, the timer would either steal foveal attention (over-strong) or be habituated away within 3 sessions (over-weak). The Focus-Light forcing-function ratio depends on the constraints below.

- **Granularity: relative minutes only.** Display strings: `just now` (< 60 s), `1m`, `2m`, ... `60m`, `1h 5m`, etc. **Never seconds.** Cog reasoning: minutes is the unit the user thinks in for self-monitoring drift; seconds are stopwatch-thinking, a different cognitive mode (§1 working memory + §5 saccadic predictability).
- **Refresh: only when the displayed value would change.** A timer that shows `5m` for 60 s, then `6m`, costs ~1 chunk every 60 s — within Cowan ceiling. A timer that ticks every second is over-ceiling and gets detected as motion in peripheral vision (§5). At minute granularity, the timer is visually *static* for 60 s at a stretch — invisible to peripheral motion detectors. **No pulse or animation on refresh; the value-change is the cue.**
- **Two opacity states, single threshold:**
  - Default (below user's personal median per-section time for this section type): **40 % opacity**.
  - Above-threshold (the user has spent unusually long on this section): **70 % opacity** — passive bump, no animation, no colour flash. This is the *single* threshold; no third state. Reasoning: §2 interruption residue. Threshold escalation at arbitrary minute boundaries (5/10/30) would be unprompted attention pulls; one principled threshold based on the user's own historical pace is acceptable.
  - The user's "personal median per-section time" is computed from `reading-times.json` history; until enough history exists (first ~3 papers), default is a fixed 15-min threshold.
- **Typography: 18–20 px monospace digits.** Sized to be parseable at ~10° eccentricity (peripheral vision is motion- and contrast-sensitive, not detail-sensitive — large enough to glance-read when foveated, low enough opacity to suppress saliency-grab when not).
- **Controls: 2 surface controls only** (Start/Pause toggle + Reset). History view (per-section times for this paper) is a click-to-expand on the timer body itself, not a third surface control. Reset surface visibility is `?`-icon-style — appears on hover. Pause state is shown by prepending `▌▌` glyph to the digits — non-colour signal (§6).
- **State variants, all using shape/position not colour:**
  - Running: digits visible at current opacity.
  - Paused: digits + `▌▌` prefix.
  - Reset: digits show `0m` anchored at zero (position cue).

#### Behaviour — locked by cog reviewer

| Question | Ruling | Reason |
|---|---|---|
| **Reset boundary** | Auto-reset on section change. Briefly (3 s) overlay the just-completed section's time (`Intro: 8m`) before the new timer starts. All section times persisted to `reading-times.json` regardless. | Auto-reset is the forcing function — user can't game it by forgetting. The brief overlay preserves the data signal. |
| **Pause-on-blur** | Keep running when Fathom loses focus. | Pausing on blur breaks the forcing-function frame ("the timer lies if I tab away to think"). Time spent thinking in another window *is* time on the section. Honest measurement > flattering measurement. |
| **Total-paper timer** | NO — per-section only in v1. Total is derivable from history; surface it in the click-to-expand history view, not the live UI. | Two timers = §1 (two chunks to track) + §7 (which one am I looking at?) |
| **Visibility during lens / whiteboard** | Keep visible, keep running. The lens IS part of reading the section. Position must avoid lens chrome — PM/UX reviewer's call. | Pausing during lens use falsely flatters the timer. |

**Persistence.** Per-section times stored in the paper's sidecar as `reading-times.json`: `[{ section_id, section_title, started_at, ended_at, total_ms }, ...]`. Reopen the paper → resume the current section's timer + read history for the click-to-expand view. No cross-paper aggregation in v1.

**Forcing-function calibration check (cog reviewer ruling):** corner placement at 40 % default opacity drifting to 70 % above the user's personal median is the Focus-Light ratio: ignorable by default, harder to ignore once in unusual territory, never coercive (no modal, no sound, no colour alarm). The "invisible-until-threshold" alternative was rejected — invisibility means the user must remember the timer exists, exactly the opt-in failure mode the pivot rejected.

**Doherty:** Start/Pause/Reset clicks flip state synchronously before any I/O; persistence to `reading-times.json` runs async post-ack. Standard.

**Estimated effort.** Small — one React component (~250 LOC after absorbing the visual physics + state machine), one schema migration for per-section times (or just JSON file in the existing sidecar), one IPC for load/save, one UI integration into PDF view at the placement the PM/UX reviewer specifies. ~3 days.

**Kill criterion.** User invokes the timer's controls (Start/Pause/Reset/click-history) <1× per paper after week 2. (Visibility alone is the v1 win — clicking is a stronger signal of usefulness for v2.)

**Status:** cog reviewer APPROVED with revisions absorbed 2026-04-25. PM/UX reviewer APPROVED with concrete placement (below). Implementer dispatch held until whiteboard implementer finishes (both touch `PdfViewer.tsx` at the same mount point — sequential to avoid merge conflicts).

#### UI placement — PM/UX reviewer ruling 2026-04-25

**Bottom-LEFT corner of the PDF scroller, 16 px from edges, `z-10`** (same chrome stratum as ZoomChrome which lives bottom-right). Mirrors ZoomChrome — same pill aesthetic, opposite corner, same visual weight. Reasoning:

- Top-left = back/recents chrome + macOS traffic lights.
- Top-right = ZoomChrome + `?` help glyph.
- Bottom-right = ZoomChrome.
- Bottom-left is the only quiet corner. No collision with: Focus Light bands (live inside page column, centered), inline-ask bubble (cursor-anchored, almost never bottom-left), lens markers (sit beside paragraphs), or the future Whiteboard tab strip (lives at top of content area).

**Visual treatment** — pulled from ZoomChrome so it reads as a sibling, not a new thing:

- Container: `rounded-md border border-black/10 bg-white/85 backdrop-blur shadow-sm`
- Padding: `px-2 py-1`
- Typography: `font-mono text-xs` — system mono (`ui-monospace, SFMono-Regular, Menlo`); Excalifont forbidden here per §2.4 (chrome ≠ voice).
- Digits at default opacity (40 %, per cog reviewer); leading clock glyph in `text-[color:var(--color-lens)]/70` amber (ties to existing marker palette without screaming).

**State variants** (each carries shape+position+text in addition to opacity, per cog §6):

| State | Glyph | Text | Opacity |
|---|---|---|---|
| Running, below threshold | `⏱` | `5m` | 40 % |
| Running, above user's median | `⏱` | `18m` | 70 % (passive bump, no animation) |
| Paused | `▌▌` | `12m` | 40 % (dimmed) |
| Reset | `⏱` | `just now` | 40 % |

**Interactive affordances:**

- Click → toggle pause/resume.
- Right-click → reset, with a 200 ms amber flash on digits before zeroing (so accidental right-clicks aren't silently destructive).
- Hover → `title=` tooltip: *"Reading time. Click to pause · Right-click to reset · ⌥T toggles."*
- Click-and-hold or long-press on body → expand history view (per-section times for this paper).
- Keyboard path: `⌥T` toggles pause/resume; listed in `?` overlay.
- `aria-label`: *"Section timer, [running|paused]. [N] minutes elapsed. Press ⌥T to toggle."*

**Behaviour across surfaces:**

- **Lens open**: timer container fades to `opacity-40` and becomes `pointer-events-none`. Stays counting. Lens owns attention; timer is still glance-readable.
- **Whiteboard tab**: timer mounts at App level (not PdfViewer level) so switching tabs doesn't unmount/remount it. Keeps counting.
- **Window blurred**: timer keeps running. The user wandering off to email is exactly the friction this surfaces.

**Multi-window**: each window owns its own timer for the paper in that window — state lives on document store keyed by `contentHash`, no global sum. Cross-window aggregation would change the metaphor from "this section took N minutes" (forcing function for current paragraph) to "productivity tracker" (out of scope).

**Markup sketch** (PM/UX reviewer's draft — implementer can build directly from this):

```tsx
<div className="pointer-events-none absolute bottom-4 left-4 z-10">
  <button
    type="button"
    onClick={togglePause}
    onContextMenu={(e) => { e.preventDefault(); reset(); }}
    title="Reading time. Click to pause · Right-click to reset · ⌥T toggles."
    aria-label={`Section timer, ${paused ? 'paused' : 'running'}. ${displayValue} elapsed.`}
    className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-black/10 bg-white/85 px-2 py-1 font-mono text-xs shadow-sm backdrop-blur transition-colors duration-180 hover:bg-black/5"
    style={{ opacity: aboveMedian ? 0.7 : 0.4 }}
  >
    <span className={paused ? 'text-black/40' : 'text-[color:var(--color-lens)]/70'} aria-hidden>
      {paused ? '▌▌' : '⏱'}
    </span>
    <span className={paused ? 'text-black/40' : 'text-black/70'}>{displayValue}</span>
  </button>
</div>
```

Mount alongside `ZoomChrome` in `PdfViewer.tsx` (around line 443).

**Considered and rejected**: top header strip (too prominent — competes with title for top-bar attention), bottom drawer (steals 30+ px reading space + breaks "metaphor is the paper"), floating overlay near cursor (collides with InlineAskBubble + forces eye to track moving chrome — Doherty violation).

## Skim Mode (B2) — kept from v1, lower priority

The user did not explicitly reject Skim Mode in their pivot message. It still scores STRONG-EVIDENCE-AND-ACCEPTABLE per the Reading Science Researcher, and addresses the orthogonal "should I read this paper at all?" problem that the timer cannot. **Defer to the post-timer slice** unless the user pulls it forward. The timer is the higher-priority pivot signal.

## Explicitly rejected from v1

- **Purpose Anchor (B1)** — *"The purpose anchor doesn't help, because I am most likely to ignore it."* Dropped from the active-learning slice. (The user's stated purpose can still feed Whiteboard / lens grounding via a different surface — Preferences setting per paper — but it's no longer the active-learning intervention itself.)
- **Single-Key Note `N` (A5)** — *"For nodes I might not even want to make nodes."* Dropped.
- All other v1-deferred items (A1 self-explanation prompts, A2 active-recall cards, A4 still-with-me probes, B3 purpose-fit checks, B4 reading log, B5 Whiteboard purpose-highlighting) remain deferred.

## Required reviews before implementation

Per user instruction 2026-04-25:

1. **Cognitive Reviewer** — verifies the timer is a well-calibrated forcing function (visible without coercive), the reset/pause heuristics, the relative-vs-absolute granularity question.
2. **PM / UX Reviewer** — proposes a concrete UI placement that does not overlap with: lens markers, Focus Light, inline-ask bubble, the recents/back chrome, multi-window switching, the (future) Whiteboard tab. Confirms visual consistency with the existing aesthetic.

Both must sign off (or request specific revisions) before the implementer is dispatched.

---

# PM SYNTHESIS v1 — preserved for reference (rejected by user 2026-04-25)

The Reading Science Researcher ranked all 10 candidate interventions by effect size + acceptability + failure-mode risk (full audit in the sidecar). Three findings drove v1's recommendation:

1. **The user's intuition that we can detect "lost" is probably wrong with current sensing.** State-of-the-art mind-wandering detection requires gaze + EDA (F1 ≈ 0.78); without those signals, performance drops near chance (D'Mello 2016). The honest move is to NOT build a lost-detector and instead expand user-initiated externalisation surfaces.
2. **"I'm reading but not learning" may not always be a tool problem.** Per the deliberate-practice literature (Ericsson 1993), fatigue + low-purpose reading is best addressed by *stopping*, not by adding scaffolding. Less tooling, not more, may be the right answer for some sessions. The triage prompt fits this — it gives the user permission to stop.
3. **Self-explanation prompts measurably help (Bisra 2018 g = 0.55) AND users disable them.** The expertise-reversal effect (Berthold/Renkl) bites the user — high-prior-knowledge readers, which the user describes themselves as, resent prompts. So opt-in only.

v1's recommended slice was Skim Mode + Purpose Anchor + Single-Key Note `N`. Failure mode of v1: it relied on opt-in scaffolds, which the user — the cohort the literature warns will resent prompts — accurately predicted they wouldn't engage with. The pivot to a forcing-function design (the timer) directly addresses this.

---

# Why this spec exists — quoted user instruction (verbatim)

# Why this spec exists — quoted user instruction (verbatim)

> "Sometimes I get lost. I feel like I'm just reading but not really learning anything. I need to think of different ways so that I can tackle that problem so that I'm actively learning rather than just passively being like, 'Okay, I'm just reading through it.' I don't know even why I'm reading this; probably I should not even be reading this, and we need to think of smart solutions to tackle that."

# The two distinct problems inside that statement

The user's message contains two cleanly separable concerns. Solutions for each are different.

## Problem A — *Passive reading*: text goes past the eyes without forming a mental model

**Symptom**: "I'm just reading but not really learning anything." The reader's eyes move; their schemas don't update; nothing sticks. Comes home and can't recall what the paper was about.

**Mechanism (well-established cognitive science)**:
- Self-explanation effect (Chi et al. 1989, 1994) — explainers learn far more than re-readers; the act of *generating* bridging inferences is what produces durable understanding.
- Generation effect (Slamecka & Graf 1978; Bertsch 2007 meta-analysis d ≈ 0.40) — self-generated summaries beat highlighting / re-reading.
- Dunlosky et al. (*PSPI* 2013) — passive techniques (highlighting, re-reading, summarisation-untrained) are *low-utility*; only generation-based techniques are high-utility.
- Cognitive load theory: passive reading converts intrinsic load into wasted effort because nothing reaches germane (schema-building) load.

**What Fathom can do** (candidate interventions — research agent will deepen):
1. **Section-end self-explanation prompts.** When the user scrolls past a section, an unobtrusive corner prompt: *"In one sentence, what was this section's contribution?"* User types; AI compares against source and surfaces divergence. Opt-in.
2. **Active-recall card after long reading sessions.** After ~20 minutes of reading, AI generates 3 short questions the user should be able to answer if they were learning. They answer; AI shows divergence inline.
3. **Lens-as-generation**: when the user dives, the lens currently waits for them to ask. We could add an optional "first explain back what you think this is about" mode — they generate, AI critiques.
4. **Margin micro-prompts**: detect when the user's been on the same page for >2 minutes without scrolling/asking — gentle "still with me?" with one of three actions: (a) ask Claude, (b) re-read this section, (c) note this is confusing. Item (c) silently bookmarks for future review.
5. **Reading-while-reading externalisation**: user can drop a single-key note (`N`) anywhere; AI organises notes by section in a sidebar. Generation effect activated by the act of articulating.

## Problem B — *Purpose loss*: not knowing why this paper, whether to keep going, what to extract

**Symptom**: "I don't know even why I'm reading this; probably I should not even be reading this." The reader has no purpose anchor; reading becomes drift.

**Mechanism**:
- Goal-setting research (Locke & Latham 2002) — specific goals dramatically improve performance vs. vague intent.
- Keshav 3-pass — pass 1 is *explicitly* a 5–10 min "should I keep reading this?" filter. Most papers should not get pass 2.
- Triage research (Bergman 2010) — readers who triage upfront read fewer papers but learn more from each.
- Metacognitive monitoring (Nelson & Narens 1990) — knowing what you know vs. don't is a separate skill from knowing things; deficit here is what produces "I'm reading but not learning."

**What Fathom can do** (candidate interventions):
1. **Purpose anchor at open**: when a paper opens for the first time, a single optional prompt: *"What are you trying to learn from this paper? (one sentence, optional)"*. The answer persists; surfaces in a faint header strip; AI grounds Whiteboard + lens explanations toward the stated purpose.
2. **30-second triage mode**: an explicit "skim first" mode that shows abstract + Figure 1 + section headings + conclusion, with a binary "worth reading further? yes / no" prompt at the end. Maps to Keshav pass 1.
3. **Purpose-fit check at section breaks**: AI compares section content against stated purpose. If divergent: *"This section is about X; you came here for Y. Skip?"*
4. **Reading log**: after a paper, a one-line "what did I learn?" prompt that the user can scroll back through across all papers. Builds metacognition over time.
5. **Whiteboard purpose-highlighting**: in the Whiteboard's Level 1 diagram, the boxes most relevant to the user's stated purpose are visually emphasised. Reduces cognitive load of "is this part relevant to me?"

# Hard requirements (from the user's instruction)

1. **Smart, not nagging.** The user is asking to be helped to learn, not interrupted. Any intervention that fires too often will be disabled and the feature dies.
2. **Opt-in by default.** The expertise reversal effect (Kalyuga 2007) is real; an expert who already self-explains internally will be burdened by external prompts.
3. **Distinguish "I'm lost in this paper" from "I should not be reading this paper".** Different problems; different responses.
4. **Don't moralise.** Telling a reader they're not reading "actively enough" is patronising. Surfaces should *enable* generation, not *demand* it.
5. **Generation, not recognition.** Per the literature, the win comes from the user articulating, not from us showing them what they should have understood.

# Non-goals

- Quizzes / exams / test-prep aesthetics. This isn't school.
- Pop-ups that interrupt reading flow.
- Streaks / gamification / "you've read N pages today!" notifications. None of that matches the cognitive-fatigue principle (CLAUDE.md §1).
- Adaptive learning systems that *decide* what the user knows. The user owns metacognition; Fathom enables it.
- Replacing the user's own thought with AI-generated "this is what you learned" summaries. That's the opposite of generation effect.

# Design questions the research agent must answer

1. **Triage UX**: how does Keshav-pass-1-style triage feel without being a chore? What's the right surface (modal at open, optional banner, an Excalidraw overview)?
2. **Self-explanation prompts**: when do they fire (section end? scroll detection? time?), how does the user dismiss without guilt, and how does the AI's "your answer matched / diverged" feedback avoid feeling like grading?
3. **Purpose anchor**: should it be free-text or structured (multiple-choice "I'm reading this because…")? How does it influence downstream prompting?
4. **Detecting "lost"**: behavioural signals (time without scroll, time without ask, repeated re-reading of the same paragraph). Can we distinguish "deeply thinking" from "lost"? Probably not perfectly — what's the action under uncertainty?
5. **Active recall**: spacing intervals (Ebbinghaus), question generation prompts, answer-evaluation prompts. What's the right cadence inside a single reading session vs. across sessions?
6. **Metacognitive monitoring**: how do we surface "what do you understand vs. don't" without it feeling like surveillance?
7. **Connection to the Whiteboard**: if the Whiteboard from the other spec exists, the user's purpose can shape which boxes get emphasised. How tight is that integration?
8. **Cross-paper learning capture**: a "what I learned today" log. Where does it live? How does it connect to the Zettelkasten / external-tool ecosystem the user might already use?

# Cognitive principles already locked in (CLAUDE.md §1)

- **Reduce cognitive fatigue.** Any intervention that adds load without proportional learning benefit fails by definition.
- **Element interactivity, not word count, drives cost.** Self-explanation prompts on conceptually dense paragraphs help more than on simple ones — the AI can target.
- **Scaffolding must be dismissable.** Every active-learning surface has an "I don't need this" path that hides it for the rest of the session, paper, or forever.
- **The reader controls the resolution.** The user decides depth; Fathom never pushes.
- **User-felt fatigue is ground truth.** If a prompt feels nagging once, we change the trigger.

# Sequencing (proposal)

1. **Reading Science Researcher agent** (to be spawned with this spec) — researches the literature on each candidate intervention, ranks by effect size + acceptability, surfaces failure modes, recommends 2–3 to prototype first.
2. **PM (this file)** — synthesises into concrete design for the top-ranked interventions.
3. **Cog Reviewer** — gates the trigger heuristics (when does a prompt fire) and the dismissal paths against §1, §3, §6, §7.
4. **AI Scientist** — designs the prompts for each intervention (self-explanation prompts must avoid grading-tone; purpose-anchor must avoid sounding like a form).
5. **Quality Analyst** — runs a sample-paper walkthrough and grades whether the interventions feel useful or naggy.
6. **User picks slice + prototype builds.**

# Open questions for the user (after research lands)

To be filled in. Anticipated:

- Which problem to attack first — A (passive reading) or B (purpose loss)?
- Comfortable being asked "what are you trying to learn?" at paper open, or does that already feel intrusive?
- Are you comfortable being interrupted by self-explanation prompts at section ends? How frequently is OK?
- Should the active-learning layer be on by default or opt-in?

# Cross-references

- **CLAUDE.md §1** — cognitive fatigue, structural reading, dismissable scaffolding (all directly load-bearing here).
- **`.claude/specs/whiteboard-diagrams.md`** — complementary feature; user's stated purpose can shape Whiteboard emphasis.
- **`.claude/specs/structural-reading.md`** (superseded) — reading-science background still relevant: Keshav 3-pass, self-explanation, generation effect.
- **`.claude/skills/fathom-cog-review.md`** — every intervention must pass §1 (working memory), §2 (interruption residue — particularly load-bearing here), §3 (Doherty's threshold for acknowledgement), §7 (Hick's Law for dismissal options).

# Definition of "research done" for this spec

- ⏳ Reading Science Researcher returns: ranked candidate interventions, effect sizes, acceptability data, failure modes, recommended first 2–3 to prototype
- ⏳ PM synthesises into concrete design
- ⏳ Cog Reviewer signs off (trigger heuristics + dismissal paths)
- ⏳ AI Scientist designs the prompts (tone, grading-avoidance, purpose-form-avoidance)
- ⏳ Quality Analyst walkthrough on sample paper
- ⏳ User picks slice
- ⏳ Implementation begins
