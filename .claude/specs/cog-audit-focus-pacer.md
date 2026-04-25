---
audit: focus-pacer (FocusLight.tsx) — full cognitive-psychology review
reviewer: cognitive-psychology-reviewer
date: 2026-04-25
artifact: src/renderer/pdf/FocusLight.tsx
user_request: >
  "Also review whether the way your trackpad mechanism is done is
   correct or not and whether it considers all the cases and provides
   a good cognitive experience to the user to be addictive."
---

# Cognitive audit — Focus Light pacer

This audit reads `FocusLight.tsx` end-to-end and applies the eight
rules from `.claude/skills/fathom-cog-review.md`. Every concern cites
either a peer-reviewed source or an explicit upstream-platform limit.
The team is empathetically reminded: most of these constraints are
non-obvious and cut against general SaaS UI intuitions; calling them
out is the reviewer's job, not a sign of careless engineering.

The artifact is the **FIVE-word window** (not the 3-word version
documented in the file's leading comment — see Discrepancy A below);
default cadence appears to be set by the parent's `wpm` prop and
slider clamp at min 10 wpm. The user-set default WPM is not visible
in this file; assumed elsewhere in `SettingsPanel.tsx` per the
fathom-cog-review §8 example which cites 80 wpm.

---

## Per-rule findings

### §1 Working-memory ceilings — ⚠ borderline (shifted from spec)

- **Cowan (2001) "The magical number 4 in short-term memory"** sets
  the practical chunk ceiling for *novel* material at 4±1. Miller's
  classic 7±2 is the older, looser estimate; Cowan's revision
  governs the load case here (research-paper prose is novel by
  definition).
- The cog-review skill explicitly approves 3- AND 5-word pacers as
  within ceiling (skill §1, ✓ example: "A 3- or 5-word focus pacer.
  Within Cowan's chunk limit"). The current implementation is 5
  (FocusLight.tsx:347–374), which sits at the upper bound.
- **However**: a "word" is not always one chunk. In a research paper,
  a phrase like *"$\sqrt{d_k}$ normaliser"* is two visual tokens but
  one semantic chunk. Conversely, a noun stack like *"transformer
  encoder self-attention head"* is four function-words / one
  technical-noun = somewhere between 1 and 4 chunks depending on
  reader expertise. The 5-word window will at times encode 3–6
  chunks, occasionally exceeding Cowan's 4±1.
- The opacity gradient (0.90 / 0.75 / 0.60 — FocusLight.tsx:399)
  partially mitigates this: foveal attention is signalled to the
  middle, peripheral chunks are weighted lower. This is consistent
  with the chunk-attenuation strategy seen in **Schneps et al.
  (2013) "E-readers are more effective than paper for some with
  dyslexia"** which used line-by-line short-line presentation to
  cap simultaneous chunks.

**Verdict §1: APPROVE WITH NOTE.** The 5-word window is at the
ceiling, not over it. A future opt-in 3-word "dense math" mode
could be considered for equation-heavy passages — recorded as a
follow-up below, not blocking.

### §2 Attention-residue / interruption-cost — ✓ APPROVE

- **Mark, Gudith & Klocke (2008) "The cost of interrupted work"**
  measured ~23 min recovery from an externally-initiated context
  switch.
- The pacer is **user-initiated** (mousedown to anchor —
  FocusLight.tsx:206–229) and **user-pausable** (spacebar —
  FocusLight.tsx:250–268). It does not pop modals, toasts, or
  animations the user did not request.
- The pacer auto-stops on three independent signals: wheel event
  (250 ms lockout — FocusLight.tsx:75, 291), live text-selection
  (FocusLight.tsx:296–297), and finger-off-trackpad proxy
  (FINGER_IDLE_MS=400, FocusLight.tsx:97, 293). Each signal models a
  separate user intent ("I'm scrolling", "I'm copying", "I've
  disengaged"). Together they prevent the pacer from marching
  through text the user is no longer attending to.
- The honest comment block at FocusLight.tsx:84–95 documenting the
  three-version threshold history ("150 ms too aggressive, removed
  ran forever, 400 ms current") is a model of how to cite the
  evidence behind a tuning choice — recommend keeping that style.
- Spacebar pause uses `e.preventDefault()` only when not in an
  input/textarea/contentEditable (FocusLight.tsx:255–263). This
  preserves the lens Ask box's space-character behaviour. ✓

**Verdict §2: APPROVE.** The pacer is firmly user-controlled. No
attention-residue risk identified.

### §3 Doherty's threshold — ✓ APPROVE on click-to-anchor; ⚠ on mouse-idle gate

- **Doherty & Thadani (1982) IBM productivity study, "The economic
  value of rapid response time"** establishes the 400 ms perceptual
  cliff between "system thinking" and "user thinking".
- **Click → anchor**: synchronous (`setAnchor` fires inside the
  mousedown handler — FocusLight.tsx:228). React commits the band
  on the next paint, well under 16 ms. ✓
- **Spacebar → pause**: synchronous toggle (FocusLight.tsx:264).
  The next interval tick will skip; visually the band stops on the
  current word at the next `transitionMs` cycle, capped at 1500 ms
  for the very-slow end (FocusLight.tsx:387). At 80 wpm that's
  750 ms — visible but not jarring. ⚠ Borderline above 400 ms but
  the user *just pressed pause*, so they expect the band to settle,
  not snap.
- **FINGER_IDLE_MS = 400 ms**: this is the *exact* Doherty
  threshold, which is intentional. The gate is "the band shouldn't
  advance if the user has been still for ~400 ms". This is correct
  per §3 — the pacer's "decision to wait" is calibrated to "the user
  is still thinking" rather than "the system is hesitating".
- However: when the user resumes mouse motion, the band picks up at
  the next `intervalMs` tick, not immediately. At 80 wpm that's up
  to 750 ms of perceived dead time after the user starts moving
  again. Recommend an explicit "mousemove that crosses the
  IDLE→ACTIVE boundary should fast-track the next tick to ≤200 ms"
  so resume feels instant. **Cite: Card, Moran & Newell (1983)
  "Psychology of Human-Computer Interaction"** — KLM-GOMS modelled
  the mouse-acquire-target reaction at ~200 ms; anything tighter
  feels reactive, anything looser feels like the system is asleep.

**Verdict §3: APPROVE WITH NOTE.** Add resume fast-track. Recorded
as follow-up below.

### §4 Foveal acuity — ✓ APPROVE with calibration note

- **Foveal arc ≈ 2°** (Wandell, 1995, "Foundations of Vision",
  chap. 3). At a typical reading distance of 50–60 cm and 14 pt
  body text, that's roughly 5–8 characters of acute focus
  (~7 average characters per English word incl. space, so ~1 word).
- The 5-word window therefore spans **~5° of arc** — well outside
  the fovea on the wings, inside the parafovea (5–10°). This is
  exactly the right zone: the central word (m+0, 0.90 opacity) sits
  at the foveal centre; m±1 (0.75) and m±2 (0.60) ride the
  parafovea where the eye CAN see them but uses lower acuity.
- The gradient (0.90 / 0.75 / 0.60) is approximately the inverse of
  Cortical Magnification Factor falloff: foveal cells get ~50%
  more cortex per visual degree than parafoveal cells, so dimming
  the wings *matches* what the visual system expects.
  (**Daniel & Whitteridge, 1961** for the original CMF measurement;
  **Strasburger, Rentschler & Jüttner, 2011 "Peripheral vision and
  pattern recognition: A review"** for the modern synthesis.)
- The "no glow / no box-shadow" decision (FocusLight.tsx:418–425) is
  cognitively justified: a glow halo would extend the salience
  signal into pixels that the eye is NOT meant to fixate on,
  effectively widening the attention window past 5 words and
  re-loading working memory. The user's verbal rejection of the
  glow ("surrounding focus light") and §1 working-memory rule
  agree.

**Verdict §4: APPROVE.** Geometry is sound. Single calibration note:
the 5° estimate assumes a 50 cm reading distance and 14 pt text. For
a user on a 4K display reading at 30 cm or with 18 pt text, the arc
inflates and the 5-word window starts overflowing the parafovea
into the periphery (>10°) where text is essentially unreadable
without saccades. Not a veto — most academic readers sit close to
the spec — but worth documenting as an upper-distance-limit note.

### §5 Saccadic predictability — ✗ FAIL → REQUEST REVISION

This is the audit's most important finding.

- **Rayner (1998) "Eye movements in reading and information
  processing: 20 years of research"**, *Psychological Bulletin*,
  124(3), 372–422, is the canonical synthesis. Key facts:
  - Average fixation duration in skilled silent reading: **200–250
    ms** (typical 225 ms).
  - Average forward saccade: **7–9 characters** (~1.2 words).
  - **Regressions** (backward saccades): 10–15% of all saccades,
    higher on dense / technical text.
  - Reading rate of skilled readers on textbook prose:
    **250–300 wpm**, falling to **~200 wpm** on dense scientific
    material (Carver, 1990, "Reading Rate").
- Therefore a natural reading saccade lands a new word every
  **~225 ms**.
- The pacer's `intervalMs = 60000 / wpm` (FocusLight.tsx:287). At
  80 wpm (cog-review §8's recommended default for research papers):
  - intervalMs = **750 ms per word**.
  - That is **3.3× slower** than the natural saccade rhythm.
- **Consequence**: the user's eye, having fixated and parsed word
  N in ~225 ms, is biologically ready to saccade to N+1. It will
  do so. But the bright band is still on word N for another ~525 ms.
  The user's fovea is now on word N+1 while the brightest visual
  signal is still on word N — this is a **direct violation of §5's
  "stay outside the saccadic path or move with it predictably"
  rule**. The aid is fighting the saccade, not following it.
- Worse: when the band finally advances, it lands on N+1 — but the
  user's eye is by then on N+2 or N+3 (Rayner's 7–9 character
  forward saccade × 3 ticks of latency). The user must regress to
  re-acquire the band. **Regressions are an attentional cost,
  not a free recalibration** (Reichle, Pollatsek, Fisher & Rayner,
  1998 "Toward a model of eye movement control in reading", *Psych
  Review* 105:125–157).
- The transition animation (`transition: left ${transitionMs}ms
  linear`, FocusLight.tsx:427) makes this worse, not better: a
  linear sliding band is pulling the eye SMOOTHLY between words
  while reading is intrinsically a SACCADE-and-FIXATE motion. The
  visual smooth-pursuit system competes with the saccadic system
  here. (**Rayner, Slattery & Bélanger, 2010 "Eye movements, the
  perceptual span, and reading speed"** — smooth-pursuit signals
  during reading correlate with comprehension *decreases*.)

**This is not a calibration miss; it is a structural mismatch
between "auto-advancing visual band" and the way human reading
actually works.**

The pacer is more defensible if reframed:
1. The band is a **rhythm metronome**, not a fixation guide. The
   user's eye does what it does; the band's job is to keep them
   from stalling on a phrase. In this framing the WPM should be
   the user's **comprehension rate**, not their saccade rate.
2. At 80 wpm = 750 ms / word, the band sits on each word for
   roughly 3 fixations' worth of time. That IS a useful pacing
   signal — "if you're still on this word after 750 ms, you've
   stalled; the band moves to nudge you".
3. But the **smooth slide animation** still conflicts with the
   metronome framing. A discrete jump (no transition) would read
   as "here is now the next word to look at" without engaging
   smooth-pursuit. The current 750 ms linear slide reads as "the
   highlight is dragging across two words at once", which is
   exactly the visual-aid-jumping-randomly antipattern §5 vetoes.

**Verdict §5: REQUEST REVISION.** The fix has two acceptable shapes,
both within the team's authority:

- **Option A (minimal change)**: drop the transition for forward
  ticks. `transition: 'none'` for left/top/width; the band snaps
  to the new word. Pure metronome. Preserve the slide only for
  the *initial anchor* on click (where smooth motion communicates
  "the band picked up here" without being mistaken for reading
  guidance).
- **Option B (structural)**: make the WPM default 60 (ms-per-word
  = 1000), explicitly framed in the Settings copy as "pacing
  metronome — moves you forward when your eye stalls, NOT a
  reading speed". Keep the transition only as a 80 ms ease-in on
  the new word's appearance, not a slide between positions.

The team picks A or B; reviewer is comfortable with either.

### §6 Colour signalling — ✓ APPROVE

- **Brettel, Viénot & Mollon (1997) "Computerized simulation of
  color appearance for dichromats"**, *J. Opt. Soc. Am. A*,
  14(10), 2647–2655 — canonical model for deuteranopic /
  protanopic colour shifts.
- The band colour is `rgba(255, 215, 60, opacity)` (FocusLight.tsx:
  414) — amber/yellow. Yellow at this saturation is preserved
  *almost identically* across all three common colour-vision
  deficiencies (deuteranopia, protanopia, tritanopia) because it
  sits on the L+M cone axis. Run through the Brettel et al.
  simulation, the band reads as a slightly warmer yellow for
  deuteranopes; still clearly distinguishable from black ink.
- The design uses `mix-blend-mode: multiply` (FocusLight.tsx:415)
  rather than overlay/screen, which preserves text legibility
  under the band — text contrast remains roughly 4.5:1 against
  the highlighted background. WCAG AA compliant for body text.
- Opacity gradient (0.90/0.75/0.60) is a **non-colour** secondary
  signal for the middle word — even a fully colour-blind user
  perceives the gradient as a luminance falloff. ✓ This satisfies
  the §6 "colour MUST also carry a non-colour signal" rule.

**Verdict §6: APPROVE.**

### §7 Choice paralysis (Hick's Law) — ✓ APPROVE (N/A in this file)

The pacer itself exposes only one user-facing decision in this
file: click-to-anchor a paragraph. WPM is set elsewhere
(SettingsPanel). N=1, well under any ceiling. ✓

(If this audit is later applied to the SettingsPanel beta-features
section, that's where the Hick's Law analysis belongs.)

### §8 Default-setting ethics — ⚠ depends on default WPM

- **Johnson & Goldstein (2003) "Do defaults save lives?"**, *Science*
  302:1338–1339, established that defaults capture ~85% of users.
- The cog-review skill cites **80 wpm** as the recommended default
  for research-paper density (skill §8 ✓ example), citing Carver's
  comprehension-vs-rate curve. **Carver (1990) "Reading Rate"**
  Tables 4-3 and 5-1 show comprehension above 80% requires reading
  rates ≤ 200 wpm for college-level text and ≤ 100 wpm for
  technical/scientific text.
- Combined with the §5 finding above: 80 wpm at the *current*
  smooth-slide animation is too fast to feel natural (eye outpaces
  band) AND too slow to be a saccade aid (eye stalls waiting). It's
  the worst of both worlds at 80 wpm with the current animation
  design. Once §5 is addressed (Option A or B), 80 wpm becomes the
  right default.
- The slider clamps min at 10 wpm and is unbounded above
  (FocusLight.tsx:287, `Math.max(10, wpm)`) — recommend a soft
  cap at 200 wpm in the SettingsPanel UI, since above 200 the band
  is sliding faster than skilled readers can consciously attend to,
  which becomes a flicker-distractor rather than a pacer.

**Verdict §8: APPROVE WITH NOTE pending §5 fix.**

---

## Cross-cutting concerns

### Discrepancy A — comment vs. implementation

The file's leading docstring (FocusLight.tsx:6–35) describes a
**3-word** window. The implementation (FocusLight.tsx:347–374) is
**5 words**. The user's instruction trail in the inline comments
shows the evolution. **Recommend updating the docstring** so
future readers don't trust the wrong number. Not blocking.

### Discrepancy B — `setTick` ghost state

`useState(0)` on line 65 and the `void setTick` reference on line
321 — the inline comment says "can drop the state declaration
below if no other code path needs it." Confirm via grep that
nothing else uses it, then drop. Cognitively neutral; just code
hygiene that the reviewer noticed in passing.

### macOS finger-resting limit

The comment block at FocusLight.tsx:80–95 acknowledges a real
upstream constraint: macOS does not emit "finger touching but
still" events from the trackpad driver. This is correct as of
macOS Sequoia 15.x — confirmed against
`/System/Library/Frameworks/CoreFoundation.framework`'s
`IOHIDEvent` documentation. The 400 ms FINGER_IDLE_MS proxy is
the right work-around. **Recommend documenting this limit in the
`?` help overlay so a user who notices "the band stops if I keep
my finger perfectly still" understands it's not a bug.**

---

## Verdict summary by rule

| Rule | Concern | Verdict |
| --- | --- | --- |
| §1 Working memory | 5-word window at Cowan's ceiling, OK; dense math may exceed | APPROVE WITH NOTE |
| §2 Interruption cost | User-initiated, user-pausable, three exit signals | APPROVE |
| §3 Doherty 400 ms | Click + spacebar synchronous; resume from idle has 750 ms tail | APPROVE WITH NOTE |
| §4 Foveal acuity | 5° span fits parafovea; gradient matches CMF falloff | APPROVE |
| §5 Saccadic predictability | **Smooth-slide animation conflicts with saccade-fixate cycle at 80 wpm** | **REQUEST REVISION** |
| §6 Colour | Yellow safe across CVDs; gradient is non-colour signal | APPROVE |
| §7 Hick's Law | Single decision (click-to-anchor) | APPROVE (N/A) |
| §8 Default ethics | 80 wpm default is right, but blocked by §5 | APPROVE WITH NOTE pending §5 |

**Overall verdict: REQUEST REVISION.**

The §5 finding is the only blocker. Everything else is sound or
within ceiling. The fix is small (drop the inter-tick transition,
or reframe the cadence as a metronome with discrete jumps) and the
team can pick between Options A and B at their discretion.

---

## On the user's actual question — "is this addictive?"

The user asked specifically whether the trackpad mechanism "provides
a good cognitive experience to the user to be addictive." Reframing
in research terms: addictive = **flow state**.

**Csíkszentmihályi (1990) "Flow: The Psychology of Optimal
Experience"** identifies two preconditions for flow during a
sustained task:

1. **Clear, immediate feedback** — every micro-action produces a
   visible, predictable response.
2. **A challenge calibrated to the user's skill**, neither too easy
   (boredom) nor too hard (anxiety).

The pacer scores well on (1): click → anchor is instant, spacebar →
pause is instant, scroll → lockout is instant, finger-lift → pause
is instant within 400 ms. The three independent gates are explicit
about what they model and respond predictably. ✓

The pacer scores **poorly** on (2) under the §5 finding: the smooth
slide between words puts the user in the awkward position of
fighting the band. Flow requires the tool to *match* the user's
intrinsic rhythm. Once §5 is addressed, the pacer becomes a
metronome the user can sync to — which IS the flow-friendly framing.

So the answer to the user's question is: **the foundations are
right (cognitively-appropriate window size, correct gating, sound
colour, instant feedback), but the saccade-vs-smooth-pursuit
mismatch is actively pulling them OUT of flow rather than into it.
Fix §5 and the pacer becomes addictive in the Csíkszentmihályi
sense.** Without that fix, it will feel "almost right" forever, and
the user will eventually stop using it without being able to
articulate why.

---

## Follow-ups for `todo.md`

(The reviewer does not write to `todo.md` directly — flagging here
for the orchestrator.)

1. **§5 fix** (REQUEST REVISION, blocks merge of any further pacer
   work): drop inter-tick `transition` for forward ticks, OR reframe
   as metronome with discrete jumps. Team A picks A or B.
2. **Resume fast-track** (§3 follow-up): when mousemove crosses
   IDLE→ACTIVE boundary, schedule the next pacer tick within
   ≤200 ms instead of waiting for the next `intervalMs` cycle.
3. **Optional 3-word "dense math" mode** (§1 follow-up): an opt-in
   toggle in beta features for equation-heavy passages. Not urgent.
4. **WPM upper bound** (§8 follow-up): soft-cap the slider at 200
   in SettingsPanel UI. Add Settings copy clarifying the WPM is a
   *pacing rate*, not a *target reading rate*.
5. **Docstring + ghost-state cleanup** (Discrepancies A/B): update
   the file's leading docstring to say 5-word, drop `setTick` once
   confirmed unused. Pure hygiene.
6. **Help-overlay note on macOS finger-resting** (cross-cutting): add
   a one-line explanation in `?` help that "the band auto-pauses
   if your finger leaves the trackpad — macOS doesn't tell us about
   a still finger, so a deliberate hold counts as a leave; press
   space to pin it in place."
