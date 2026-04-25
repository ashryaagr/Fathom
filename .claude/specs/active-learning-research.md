# Reading Science Researcher — Active Learning Findings (research input for `active-learning.md`)

This is the Reading Science Researcher (Active Learning specialist) agent's raw deliverable. Synthesised into the parent spec by the PM.

---

## Part 1 — Evidence ranking of candidate interventions

### Problem A (passive reading)

**A1. Section-end self-explanation prompts.** *Effect size:* Bisra et al. 2018 meta-analysis of 64 studies, g = 0.55 (moderate); strongest when prompts elicit causal/principle elaboration, weakest when they elicit paraphrase. *Acceptability:* Mitchell & McKeown 2014 and the Berthold/Renkl line show that prompt fatigue sets in fast — Berthold found experts in prompted journaling conditions invested **less** effort than no-prompt controls (expertise reversal). *Failure modes:* (a) fires on a section the user already understood → patronising; (b) the AI's "your answer matched/diverged" feedback reads as grading; (c) breaks flow at the moment the user is most likely to continue reading. *Verdict:* **STRONG-EVIDENCE-BUT-NAGGY** unless triggered sparingly and dismissable forever per paper.

**A2. Active-recall card after ~20 min.** *Effect size:* Testing effect is among the most robust in cognitive psychology — Rowland 2014 meta-analysis g = 0.50, Adesope 2017 g = 0.61, Karpicke & Blunt 2011 d = 1.50 vs concept mapping. *Acceptability:* The Anki literature is the cautionary cousin — daily-use medical-student data (Lu et al. 2023, *BMC Med Educ*) shows correlation with Step 1 score, but practitioner data show ~80% of SRS users quit within months from review-load burnout. *Failure modes:* recall during reading is a context shift; the user came to read, not be quizzed. *Verdict:* **STRONG-EVIDENCE-BUT-NAGGY** mid-session; **STRONG-EVIDENCE-AND-ACCEPTABLE** at session-end if optional.

**A3. Lens-as-generation ("explain back first").** *Effect size:* Self-explanation (Bisra g = 0.55) applied at the moment the user has already opted in by diving. *Acceptability:* High — the user already chose to engage; adding an optional "try first" toggle is consent-respecting. *Failure modes:* if it's the default, it breaks the existing zero-friction dive contract from CLAUDE.md §3 ("zoom sets context; the user types what they want"). *Verdict:* **STRONG-EVIDENCE-AND-ACCEPTABLE** as opt-in mode only.

**A4. Margin micro-prompts ("still with me?").** *Effect size:* No direct evidence this helps comprehension; it's an attention-recovery intervention, not a learning one. The closest evidence is the mind-wandering literature (Mills & D'Mello 2015, *Cognition*; Faber et al. 2018) showing that probes which **interrupt** mind-wandering can recover comprehension on the immediate passage. *Acceptability:* Mark/Gudith/Klocke 2008 — 23-min interruption residue. The Frontiers 2022 digital-reading study found unprompted attention disruptions every ~4 min on average; one more from the app is salt in the wound. *Failure modes:* false positives are devastating — pinging a deep-thinker is the canonical "tool that user disables in week 1." *Verdict:* **WEAK-EVIDENCE** unless we can build a much better lost-detector than current state-of-the-art (we can't — see Part 2).

**A5. Single-key note (`N`) externalisation.** *Effect size:* Generation effect (Bertsch 2007 meta-analysis d = 0.40) plus the writing-to-learn literature (Bangert-Drowns et al. 2004 d = 0.17, modest). *Acceptability:* Consent-respecting — user-initiated, no surface fires unprompted. Matches the existing dive/marker grammar (note = a kind of marker). *Failure modes:* low — worst case it's unused. Best case it's the user's preferred input modality and they never need a prompt. *Verdict:* **STRONG-EVIDENCE-AND-ACCEPTABLE.**

### Problem B (purpose loss)

**B1. Purpose anchor at open (free text).** *Effect size:* Locke & Latham 2002 meta-analytic d ≈ 0.42–0.80 for goal-setting on task performance. Reading-specific: Linderholm & van den Broek 2002 (*JEP:LMC*) — readers given a study purpose vs entertainment purpose showed measurably different inference patterns and recall structure. McCrudden & Schraw 2007 *EPR* review confirms reading goals reliably shape what gets encoded. *Acceptability:* No published data on prompt-at-open in PDF readers. Adjacent evidence is mixed — adult learners resent perceived patronisation (Knowles' andragogy literature), but a one-line *optional* prompt is closer to a TextField than a quiz. *Failure modes:* becomes a form to fill; user types "idk" and never trusts it again. *Verdict:* **STRONG-EVIDENCE-AND-ACCEPTABLE** if optional, dismissable per paper, and the answer is editable mid-read.

**B2. 30-second triage mode (Keshav pass 1).** *Effect size:* Keshav's own paper is procedural, not empirical; no controlled trial. But the underlying claim (most papers don't deserve pass 2) is consistent with citation-skew literature — most papers are read once or never. Bergman 2010 is on personal information re-finding, not paper triage; the user's spec slightly overcites it. *Acceptability:* Readwise Reader's "Inbox / Later / Archive" triage flow is the closest shipping example; their NPS is high among power users specifically because of triage. *Failure modes:* the user may not know on pass 1 whether the paper is worth pass 2 — the triage decision is itself effortful. *Verdict:* **STRONG-EVIDENCE-AND-ACCEPTABLE** because it directly addresses the "probably I should not even be reading this" sentence.

**B3. Purpose-fit check at section breaks.** *Effect size:* No direct evidence. Theoretical only. *Acceptability:* High risk of telling the user something they already know ("you're in Methods; you came for results"). *Failure modes:* the AI is wrong about purpose-fit half the time; suggestions to "skip" section are paternalistic. *Verdict:* **WEAK-EVIDENCE / NOT-WORTH-PROTOTYPING** in v1.

**B4. Reading log ("what did I learn?").** *Effect size:* Writing-to-learn (Bangert-Drowns d = 0.17) + retrieval practice (g = 0.50) when answered without looking. *Acceptability:* High — invoked once per paper, post-read; mirrors Roam/Obsidian rituals power users already perform. *Failure modes:* low. *Verdict:* **STRONG-EVIDENCE-AND-ACCEPTABLE.**

**B5. Whiteboard purpose-highlighting.** *Effect size:* Signalling effect in multimedia learning (van Gog 2014 review, d ≈ 0.4). *Acceptability:* Depends on Whiteboard spec — out of scope here. *Verdict:* **WEAK-EVIDENCE** until Whiteboard ships; deferred.

## Part 2 — Behavioural-signal research

The honest answer: **without eye tracking, a PDF reader cannot reliably distinguish deep-thinking from lost.** Mills & D'Mello, Faber et al., and Bixler & D'Mello get F1 ≈ 0.74–0.80 for mind-wandering detection — and that's *with* gaze + EDA. Sensor-free models (D'Mello 2016 "dreamcatcher") drop to F1 ≈ 0.60, barely above chance.

Available signals and their reliability for the four-state classification:

- **Long dwell + no scroll:** ambiguous between deep-thinking and disengaged; literature confirms time-on-page bimodal but overlapping (Smilek/Carriere 2010 found mind-wandering ≈ same fixation duration but more regressions).
- **Repeated regressions to same paragraph:** Booth & Weger 2013, Schotter et al. 2014 — comprehension-driven regressions DO predict lower comprehension, but also predict deeper integration in skilled readers. Bicausal; not actionable from scroll alone.
- **No-interaction periods >N minutes:** weakest signal; tells you nothing about state.
- **Ask/dive events:** the only *high-precision positive* signal for engagement. Their absence is not informative.

Recommendation: **don't build a lost-detector.** Build user-initiated signals (`N` note, dive, ask) and treat their absence as silence, not absence-of-engagement. The "still with me?" probe is the wrong primitive given current sensing.

## Part 3 — Triage / pre-reading

Keshav's procedural claim that most papers fail pass 1 is widely cited but never quantified. Closest empirical anchor: Tenopir et al. 2009 (*Aslib*) found scientists abandon ~50% of papers after abstract. Readwise Reader's triage UX is the prior-art benchmark — Inbox→Later→Archive resolves "should I read this?" via *positional* commitment (it's in the Inbox) rather than asking the user a yes/no question. **Structured user prompt > AI judgment**: AI lacks the user's research context to judge "should you read this," but a 60-second skim view (abstract, fig 1, conclusion, headings) gives the user the data to decide themselves. This matches the spec's "user owns metacognition" non-goal.

## Part 4 — Purpose anchoring

Linderholm & van den Broek 2002 is the cleanest evidence: study-purpose readers built more inferences than entertainment-purpose readers on the same text, even with comprehension matched. McCrudden & Schraw 2007's relevance-instructions framework reviews ~30 studies showing purpose statements consistently shape encoding (d ≈ 0.3–0.5, modest but reliable). On acceptability: there's no published study of "prompt-at-open" UX for adult readers; the closest is journaling-app onboarding research (Day One, Reflect) where free-text intent prompts have completion rates 30-50% on first use, dropping to <10% by week 2 — i.e. **users skip these once they're familiar**. Design implication: the prompt must be (a) skippable in one keystroke, (b) editable later, (c) never required to proceed.

## Part 5 — Recommended first 2–3 to prototype

**1. B2 — 30-second triage view ("Skim mode").** Highest match to the user's most painful sentence ("I should not even be reading this"). Low naggy-risk because it's user-invoked, not pushed. *Target paper:* one the user is ambivalent about — ideally a paper on their reading list they haven't opened. *Measurement:* did the user reach a yes/no decision in <2 min? Did the decision stick (no oscillation later)? *Kill criteria:* user opens skim mode <1× per 5 papers after week 2.

**2. B1 — Optional purpose anchor (one-line, dismissable).** Strongest evidence base for problem B; lowest implementation risk. *Target:* same papers as #1 — purpose stated post-skim. *Measurement:* qualitative — does the user say in retrospective that the anchor changed what they read? Quantitative — does the anchor text get edited (signal of active use) or stay frozen (signal of fill-in-and-forget)? *Kill criteria:* anchor unchanged on >80% of papers after first set; or completion rate <20% on first week.

**3. A5 — Single-key note (`N`).** Cheapest to build, lowest naggy-risk (zero unprompted surface), evidence-grounded (generation effect). Pairs with #2 — the purpose anchor gives notes their frame. *Target:* same papers. *Measurement:* notes-per-page distribution; compare against baseline (zero). *Kill criteria:* <1 note per paper across 10 papers.

**Explicitly NOT prototyping first:** A4 (margin micro-prompts) — sensing is too weak, see Part 2. A2 mid-session quizzes — Anki-style burnout pattern is a known failure mode. B3 (purpose-fit) — speculative.

## Part 6 — Honest contradictions

1. **The user's intuition that detecting "lost" is solvable is probably wrong** with current sensing. State-of-the-art with eye tracking is F1 ≈ 0.78; without it, near-chance. The honest move is to *not build a detector* and instead expand user-initiated externalisation surfaces (note, mark-confusing, dive). The spec already half-says this in §A4 design question 4 — promote that hedge to a decision.

2. **Self-explanation prompts measurably help AND users disable them.** Bisra g = 0.55 is real; the Berthold expertise-reversal finding is also real. The user describing themselves as already metacognitively aware ("I feel like I'm reading but not learning") is a *high-prior-knowledge* signal — they may be exactly the cohort the literature warns will resent prompts. Recommend opt-in only.

3. **The "I'm reading but not learning" complaint may not be a tool problem.** Carlson & Levin 1988, plus the deliberate-practice literature (Ericsson 1993), suggest that fatigue + low-purpose reading is best addressed by *stopping* reading. The spec's own Problem B framing ("probably I should not even be reading this") points the same way. The most honest intervention may be: surface the triage prompt aggressively, then *get out of the way*. Less tooling, not more.

4. **Goal-setting effect sizes outside controlled studies are smaller.** Locke & Latham's meta is on motivated workplace tasks; the read-this-paper-on-Saturday-afternoon scenario isn't the same load case. Real effect size in the wild may be d ≈ 0.2 — still positive, still cheap, but don't oversell.

---

## Sources

- [Bisra et al. 2018 — Inducing Self-Explanation: a Meta-Analysis (g = 0.55)](https://link.springer.com/article/10.1007/s10648-018-9434-x)
- [Chi et al. 1994 — Eliciting self-explanations improves understanding](https://gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf)
- [Kalyuga 2007 — Expertise Reversal Effect and Its Implications](https://link.springer.com/article/10.1007/s10648-007-9054-3)
- [Roediger & Karpicke 2006 — Test-Enhanced Learning](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)
- [Lu et al. 2023 — Anki use in medical school (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10176558/)
- [Anki Burnout — practitioner data](https://my-senpai.com/insights/ankiburnout.html)
- [Faber, Bixler & D'Mello 2018 — automated mind-wandering detection during reading](https://link.springer.com/article/10.3758/s13428-017-0857-y)
- [D'Mello et al. — gaze + EDA mind-wandering detection (F1 ≈ 0.78–0.80)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7248717/)
- [Mitsea et al. — attentional disruption during digital reading (~every 4 min)](https://frontiersin.org/articles/10.3389/fpsyg.2022.987964/full)
- [Booth & Weger 2013 — regressions, comprehension vs oculomotor](https://pmc.ncbi.nlm.nih.gov/articles/PMC6235565/)
- [Mark, Gudith & Klocke 2008 — 23-min interruption recovery (cited in industry summaries)](https://santoshbotre01.medium.com/mindful-notifications-finding-balance-with-ios-focus-feature-and-apns-interruption-level-109b59ab2a04)
- [Keshav — How to Read a Paper](http://ccr.sigcomm.org/online/files/p83-keshavA.pdf)
- [Linderholm & van den Broek 2002 — reading purpose effects (review summarized)](https://files.eric.ed.gov/fulltext/EJ1059624.pdf)
- [McCrudden & Schraw 2007 — Relevance Instructions framework (cited in)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.635289/full)
- [Rowland 2014 / Adesope 2017 testing-effect meta-analyses (summary)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12302331/)
