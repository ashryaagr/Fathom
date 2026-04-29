---
spec: Template catalog for whiteboard explanation patterns (round 13 input)
owning_team: template-scout (one-turn research)
created: 2026-04-27
inputs: excalidraw-expert's 8-pattern proposal + public GitHub scout
machine_readable: scripts/template-catalog.json (19 entries, schemaVersion 1)
---

# Executive summary

The whiteboard's v3.2 spec ships **6 minimal primitives + agent freedom** instead of pre-baked modality renderers. That decision is correct (~500 LoC saved, expressively complete), but it leaves the agent without a vocabulary of *what good looks like* per content type. This catalog fills that gap: a curated index of 19 explanation-diagram patterns, each composable from the existing primitives, with `fitSignals` the agent can match against the paper's content at Pass 2 time.

The 19 entries break down as: **8 patterns from excalidraw-expert's prior proposal** (kept verbatim), **3 patterns added by promoting Mermaid concepts that map to common research-paper modalities** (sequence-diagram, state-machine, quadrant-chart), and **8 patterns added from public-repo scout** — chiefly the `dair-ai/ml-visuals` archive (MIT, 100+ figures), the `kaicheng001/TikZ-Collection` repo (MIT), and Mermaid's mindmap/algorithm vocabulary. Crucially, **no template requires a new MCP tool** — every entry is a parameterized arrangement of `create_labeled_shape` / `create_text` / `create_callout_box` / `create_background_zone` / `connect`. Porting cost is the catalog file + a thin Pass 2 prompt update + ~50-100 LoC per template of bbox-arithmetic helpers (estimate 3-5h per template once the framework is in place; first template costs more, subsequent ones cheap).

# Catalog table

| id | name | source | license | port effort | priority |
|---|---|---|---|---|---|
| flow-chart | Flow chart / pipeline | excalidraw-expert + Mermaid concept | n/a (composed) | 4h | P0 |
| key-insight-callout | Key insight / KEY IDEA | excalidraw-expert | n/a | 2h | P0 |
| comparison-matrix | Comparison matrix / vs table | excalidraw-expert | n/a | 5h | P0 |
| taxonomy-tree | Taxonomy tree / hierarchy | excalidraw-expert + treefun + Mermaid mindmap | concept generic; treefun=check repo | 4h | P0 |
| time-chain | Time chain / iterative refinement | excalidraw-expert | n/a | 3h | P0 |
| definition-with-callouts | Definition with callouts | excalidraw-expert | n/a | 4h | P1 |
| axis-on-number-line | Number line / axis annotation | excalidraw-expert | n/a | 3h | P1 |
| before-after-panels | Before/after panels | excalidraw-expert | n/a | 3h | P1 |
| equation-decomposition | Equation symbol-by-symbol | LaTeX-TikZ-Diagrams (concept) | MIT | 5h | P1 |
| architecture-block-diagram | Architecture block diagram | dair-ai/ml-visuals | MIT | 5h | P1 |
| annotated-architecture | Annotated architecture (Alammar) | jalammar.github.io/illustrated-transformer | concept generic; CC-BY style if reproduced exactly | 5h | P2 |
| sequence-diagram | Sequence diagram (protocol) | Mermaid concept | MIT | 5h | P2 |
| state-machine | State machine / FSM | Mermaid concept | MIT | 4h | P2 |
| quadrant-chart | Quadrant chart (2D categorization) | Mermaid concept | MIT | 4h | P2 |
| algorithm-pseudocode | Algorithm pseudocode block | TikZ-Collection | MIT | 3h | P2 |
| concept-map | Concept map / mind map | Mermaid mindmap + GitHub topic | MIT | 5h | P2 |
| venn-overlap | Venn diagram / set overlap | TikZ-Collection + Penrose | MIT | 3h | P2 |
| loss-decomposition | Loss decomposition (sum-of-losses) | ml-visuals + scout | MIT | 4h | P2 |
| data-flow-graph | Data-flow / computational graph | ml-visuals + xyflow examples | MIT | 5h | P2 |

P0 (5 templates, ~18h) = round 13 ship-with-the-streaming-render set. P1 (5 templates, ~20h) = round 14. P2 (9 templates) = round 15+ / opportunistic. Recommendation below revises this slightly.

# Open licensing questions

Most everything in the P0/P1/P2 set is MIT-licensed source material OR generic-concept content (no specific repo's code is being copied — we're porting the *idea* of "a sequence diagram" not Mermaid's renderer). The two items the user should sign off on before we proceed:

1. **Annotated-architecture (Alammar style)** — Jay Alammar's illustrated-transformer blog is the seminal example of this pattern. The *concept* is generic, but if any of our diagrams visibly reproduce his specific diagrams (the colored-box stack with side-narration), we should attribute him in the methodology doc per CC-BY style. P2 priority deliberately to give time to decide.
2. **`dair-ai/ml-visuals` figures** — MIT licensed, but the project asks for attribution-when-possible. Recommendation: cite ml-visuals in `docs/methodology/whiteboard.md` once we ship any template that traces back to it (`architecture-block-diagram`, `loss-decomposition`, `data-flow-graph`). No blocker; just a one-line acknowledgment.

Nothing GPL was found among the candidates we kept. DAGitty (causal DAG editor, GPL) was rejected on license; we don't need it because `data-flow-graph` covers the same shape under a different name.

# Candidates we considered and rejected

- **Mermaid C4 diagrams** — too software-architecture-specific; CS papers rarely use C4 model levels. Don't add.
- **Mermaid Gantt** — research papers don't use schedules. Could be used for "training schedule across epochs," but `time-chain` already covers that more elegantly.
- **Mermaid Pie / Radar / XY chart** — these are *data charts*, not explanation diagrams. The whiteboard isn't trying to replace matplotlib — papers already have their own chart figures, and `create_image` lets the agent embed them.
- **Sankey diagram** — interesting but rare. ~1-2% of papers. Skipped for v1; revisit when a paper explicitly needs flow-with-magnitudes.
- **Treemap / sunburst / chord** (D3 gallery) — primarily data visualization. Same reasoning as charts.
- **Distill.pub interactive components** — CC-BY 4.0 + MIT for code, but they're React components with embedded JS interactivity. We'd be porting *static-snapshot ideas* (annotated activations, visualized embeddings), which is what `annotated-architecture` already covers. Don't pull the React code.
- **`mingrammer/diagrams`** (Python cloud-arch as code) — MIT but extremely cloud-vendor-specific (AWS / Azure / GCP icons). Vocabulary not relevant to research papers.
- **`OpenDCAI/Paper2Any`** — Apache-2.0 but the codebase is the generation pipeline, not a separable template library. Could inspire the "technical roadmap" pattern (taxonomy-tree variant); already absorbed into our `taxonomy-tree` and `flow-chart` entries.
- **3blue1brown / manim** — animation, not static diagrams. Wrong substrate.
- **Causal DAGitty / CausalDAG** — license issues (GPL/BSD-3) and limited additional value over our `data-flow-graph` + `taxonomy-tree`. Defer until a causal-inference paper specifically demands it.
- **Excalidraw "Software Architecture" library** (microservice/db/cache) — wrong domain (devops, not research).
- **DBT-style dbml-renderer / draw.io shape libraries** — wireframe / diagram-tool ecosystems, not explanation patterns.
- **PaperBanana / paper-graphics tutorial** — reference material on *how to design good figures*, not a template library. Should be linked from `docs/methodology/whiteboard.md` as further-reading; not portable as code.

# Recommendation: round 13 P0 set (revised vs excalidraw-expert)

excalidraw-expert proposed `flow-chart`, `key-insight-callout`, `comparison-matrix`, `taxonomy-tree` for round 13. The scout agrees — those four cover ~70% of CS-paper sections by frequency (architecture / methods / related-work / takeaway). One revision suggestion: **swap or pair `taxonomy-tree` with `time-chain`** for round 13 because:

- `time-chain` is currently *missing* from round 13 even though diffusion / RL / training-dynamics papers need it constantly, and it's cheap (3h) and trivial to compose (N ellipses + N-1 arrows).
- `taxonomy-tree` is more complex layout (depth + balanced spread) and rarely the *primary* visual — it's more often a sub-element of a broader survey section. P1 is the right slot for it.

So the recommended round 13 P0 = `flow-chart` + `key-insight-callout` + `comparison-matrix` + `time-chain` + (optional) `taxonomy-tree` if there's slack. Total port effort: 14h core + 4h optional.

Round 14 P1 backfill: `taxonomy-tree` (if not in 13) + `definition-with-callouts` + `axis-on-number-line` + `before-after-panels` + `equation-decomposition`. ~20h.

# Top 3 surprises from the scout

1. **`dair-ai/ml-visuals` is the closest thing to a "research-paper diagram archive" that exists on GitHub.** 100+ MIT-licensed figures spanning every common ML architecture archetype. We should reference it in the methodology doc and treat it as an inspiration corpus the agent can be shown screenshots of (via `create_image` with bundled figures, or via the Pass 2 prompt's worked-example slot).
2. **The Excalidraw-libraries catalog has almost zero research-paper utility.** Of ~50 community libraries, only `Software Architecture` (devops domain) and `Information Architecture` (UX flow domain) come close to explanation diagrams; everything else is icons, UI mockups, or decorations. The right framing is: **Excalidraw's *primitives* are excellent (which is why we're using them), but the *libraries* community has not produced research-paper-grade explanation patterns.** Our catalog is filling a real gap.
3. **Mermaid's diagram taxonomy (22 types) is broader than any equivalent.** It's the right shopping list for "what kinds of explanations exist." But Mermaid's *renderer* output doesn't match the warm-Excalifont whiteboard aesthetic we want, so we port the *concept* (sequence-diagram, state-machine, quadrant-chart) and re-author it in our primitives. This is exactly what excalidraw-expert proposed and what the scout confirms — no need to actually depend on Mermaid as a runtime.

# What's NOT in this catalog (and why)

- **Domain-specific schematics** (electrical circuits, chemistry molecules, biology pathways) — out of scope for v1; CS-paper-first.
- **3D / spatial diagrams** — Excalidraw is 2D; out of scope.
- **Interactive widgets** (sliders, hoverable callouts) — the whiteboard is a static scene + chat refinement; interactive elements live in the lens text, not the whiteboard.
- **Animation / morphing transitions** — out of scope; static frames only.
- **Photo-realistic figures** — covered by `create_image` (existing primitive in the v3.2 spec) which embeds the paper's actual figure PNGs from the sidecar.
