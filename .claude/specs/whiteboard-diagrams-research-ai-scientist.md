# AI Scientist — Pipeline + Prompting Proposal (research input for `whiteboard-diagrams.md`)

> **⚠️ STAGE PLAN SUPERSEDED 2026-04-25 by user redirection.** The original 5-stage pipeline below has been replaced by a 2-pass design (Pass 1 = max-context Understand on Opus 4.7's 1M window; Pass 2 = lazy per-diagram Render on Sonnet 4.6). User instruction (verbatim): *"I don't want to do a multi-stage pass. As a matter of fact, two passes are more than okay. Try to use as much context as possible for stage one... Opus 4.7 has a 1 million context window and we want to use that... Design all of this to be LLM friendly as much as possible. Enforcing rigorous structures can often be counterproductive when working with agents."*
>
> The replacement pipeline lives in the parent spec (`whiteboard-diagrams.md` → "Pipeline (v2 — LLM-friendly 2-pass)"). The detailed prompts below are kept as **reference material**. The grounding-via-quotes pattern is still useful; the rigid `evidence:[{page, quote_lt_30w}]` schema, the Zod-strict parsing, and the per-stage tool isolation are NOT — those are exactly the "rigorous structures" the user flagged as counterproductive. **Do not implement from the prompts below; consult the parent spec.**

---

# Original 5-stage proposal (preserved as reference)

## 1. Pipeline shape (5 stages, 3 model tiers)

```
[Index complete] → S1 Extract → S2 Skeleton → S3 Level1 DSL → S4 Level2 expand → S5 Level3 expand
                   Sonnet 4.6   Opus 4.7      Sonnet 4.6     Sonnet 4.6        Sonnet 4.6
                   (grounded)   (1 call)      (1 call)       (N calls, lazy)   (N calls, lazy)
                                                                               ↓
                                                      [DSL → Excalidraw scene] (deterministic, no LLM)
```

| Stage | In | Out | Model | Why |
|---|---|---|---|---|
| **S1 Extract** | `indexPath` (Read/Grep/Glob over `content.md` + figure PNGs + `digest.json`) | `methodology.json` (typed claims with `quote` + `page` + `figure_ref`) | Sonnet 4.6 | Tool-heavy; grep-then-read loops; cheap. |
| **S2 Skeleton** | `methodology.json` only (no paper text) | `skeleton.json` — paper-archetype + 3-7 Level-1 nodes + parent/child outline | **Opus 4.7** | Structural reasoning; one shot; sets the spine all other levels inherit. Worth the cost. |
| **S3 Level1 DSL** | `skeleton.json` + per-node citation snippets | Level-1 `WBDiagram` (DSL) | Sonnet 4.6 | Constrained generation, no novel reasoning. |
| **S4 Level2 expand** | `skeleton.json` + parent node + grounded snippets for that node | Level-2 `WBDiagram` (DSL) | Sonnet 4.6 | One per Level-1 node; lazy on first user click; pre-warm in background. |
| **S5 Level3 expand** | parent Level-2 node + algorithm/equation snippets | Level-3 `WBDiagram` (DSL, often pseudocode shape) | Sonnet 4.6 | Lazy. |

Render is **deterministic**, not an LLM call (see §4). The model never emits Excalidraw JSON directly.

**Caching.** Use Anthropic `cache_control` on (a) the system prompt, and (b) `methodology.json` + `skeleton.json` — both reused across S3/S4/S5 and across every side-chat refinement (§6). 5-min TTL is enough; refresh on user activity. Cache hits cost ~10% of input price, which is what makes recursive expansion + iteration affordable.

---

## 2. Per-stage prompts

### S1 — Extract (system prompt appended to `claude_code` preset)

```
You are extracting the CORE METHODOLOGY of a research paper for a visual whiteboard. NOT literature, NOT related work, NOT acknowledgements. You have a per-paper index at <indexPath>:
  - content.md (full text, page-tagged with `<!-- PAGE N -->`)
  - images/page-NNN-fig-K.png (cropped figures)
  - digest.json (sections, figures, equations, glossary)

PROCEDURE — follow exactly:
  1. Read digest.json. Identify the Methods/Approach/Method/System/Algorithm sections by name. IGNORE: Introduction, Background, Related Work, References, Acknowledgements, Limitations (unless they describe the method).
  2. Grep content.md for those section names; Read 2-3 pages around each match.
  3. Read every figure PNG that the digest tags as part of the method (architecture, pipeline, algorithm box). Skip results plots.
  4. Identify: (a) the paper's GOAL (what input → what output); (b) the METHODOLOGY STAGES (3-7 sequential or parallel stages — if the paper has none, say so); (c) any named ALGORITHMS / COMPONENTS within those stages.

Output a single JSON object, no preamble:
{
  "archetype": "workflow" | "algorithm" | "theory" | "system" | "survey" | "position",
  "goal": { "input": "...", "output": "...", "one_line": "..." },
  "stages": [
    { "id": "s1", "name": "...", "summary_25w": "...",
      "evidence": [{ "page": 4, "quote_lt_30w": "...", "figure_ref": "Figure 2" | null }],
      "components": [{ "id": "c1", "name": "...", "summary_15w": "...",
                       "evidence": [{ "page": 5, "quote_lt_30w": "..." }] }]
    }
  ],
  "algorithms": [
    { "id": "a1", "name": "...", "of_stage": "s2", "page": 6,
      "pseudocode_shape": ["init ...", "for k in 1..K: ...", "return ..."],
      "evidence": [{ "page": 6, "quote_lt_30w": "..." }] }
  ]
}

HARD RULES:
- Every stage / component / algorithm MUST have ≥1 evidence entry with a real page number and a verbatim quote you can grep back. If you cannot cite, omit it.
- Use the paper's own names. Do not invent names.
- If the paper has no operational stages (e.g. a theory paper with theorems instead of a pipeline), set archetype accordingly and put theorems in `algorithms[]` with their page+statement. Do NOT fabricate a workflow.
- Cap: 7 stages, 5 components per stage, 8 algorithms.
```

### S2 — Skeleton (Opus 4.7, no tools)

```
You are designing a 3-level visual explanation of a research paper. You receive a verified methodology.json (every claim already grounded with page + quote). DO NOT invent new content; only select, group, and order what is already there.

Produce a `skeleton.json`:
{
  "archetype": "...",
  "level1": {
    "title_lt_8w": "...",
    "nodes": [           // 3-7 nodes; Cowan 4±1 chunk limit. Prefer 4-5.
      { "id": "L1.1", "label_lt_4w": "...", "kind": "input"|"process"|"output"|"data"|"model",
        "from_stage_ids": ["s1","s2"],   // which methodology stages this rolls up
        "summary_25w": "...",
        "expandable": true|false }
    ],
    "edges": [{ "from": "L1.1", "to": "L1.2", "label_lt_3w": "..." }]
  },
  "level2_plan": [        // one per expandable Level1 node
    { "parent": "L1.2", "from_stage_ids": ["s2"],
      "node_count_target": 4, "include_algorithms": ["a1"] }
  ],
  "level3_plan": [        // one per algorithm worth its own diagram
    { "parent_node": "L2.2.3", "algorithm_id": "a1", "shape": "pseudocode"|"flow"|"state" }
  ]
}

DESIGN RULES:
- Level 1 collapses the whole methodology to ≤5 visible nodes. If the paper has 7 stages, you GROUP them — name the groups using the paper's own vocabulary.
- An L1 node is expandable iff it rolls up ≥2 stages OR contains a named algorithm.
- Visual consistency: the SAME stage IDs must reappear in level2_plan parents — every L2 diagram is the "zoom of" exactly one L1 node, never a remix.
- For archetype="theory" or "survey": Level 1 is goal + 3-5 key results (not stages); Level 2 expands each result into theorem + assumptions + intuition; no Level 3.
```

### S3 — Level1 DSL (Sonnet 4.6, no tools, with cached `methodology.json`+`skeleton.json`)

```
Render Level 1 as a WBDiagram. Use ONLY content from skeleton.level1. Per node, attach the citations that justify it (copy from methodology.evidence).

Output JSON only:
{ "level": 1, "title": "...",
  "nodes": [
    { "id": "L1.1", "label": "≤4 words", "kind": "input|process|output|data|model",
      "summary": "≤25 words", "expandable": true,
      "citations": [{ "page": 4, "quote": "verbatim ≤30w", "figure_ref": "Figure 2"|null }],
      "from_stage_ids": ["s1"] }
  ],
  "edges": [{ "from":"L1.1","to":"L1.2","label":"≤3 words","kind":"flow|feedback|optional" }],
  "layout_hint": "lr" | "tb"
}

RULES: every node has ≥1 citation copied from methodology.json. Do not write any quote you cannot grep verbatim in content.md. Edge labels are optional; omit rather than invent.
```

### S4 — Level2 expand (one call per parent L1 node)

```
Parent L1 node: <L1.x with label, summary, from_stage_ids>.
You may Read these grounded snippets only:
  <inline excerpts pre-extracted from methodology.json for the relevant stage_ids — quotes + page tags>
  <list of figure PNG paths the methodology tagged for these stages>

Produce a Level-2 WBDiagram of {{node_count_target}}±1 nodes that is ENTIRELY a zoom-in of the parent. Use the parent's color/kind palette so the user feels continuity. Same DSL as Level 1, plus:
  "parent": "L1.x"
Every node cites a page+quote from the snippets above. Anything you cannot cite, you must drop.
```

### S5 — Level3 expand (algorithms)

```
Render algorithm "<name>" (page <p>) as a Level-3 WBDiagram, shape={{shape}}.
For shape="pseudocode": nodes are line-by-line steps from algorithms[i].pseudocode_shape; edges are sequential + the loops/branches the paper draws.
Cite the page + verbatim line for each step. If the paper has an Algorithm box, mirror its line count exactly.
```

---

## 3. Grounding strategy

**Reuse the lens's pattern**: same `additionalDirectories: [indexPath]`, same `Read`/`Grep`/`Glob` toolbox, same `cwd = safeCwd(indexPath)`, same `bypassPermissions`. Only S1 has tools; S2-S5 are tool-free reasoning over already-grounded JSON. This mirrors the "Selection-Inference" / chain-of-verified-thought pattern (Creswell et al. 2022; Dhuliawala et al. *Chain-of-Verification* 2023): **separate the "what's in the paper" extraction from the "how to draw it" reasoning** so the reasoning step physically cannot hallucinate new facts — its inputs are a closed set.

**Anti-hallucination enforcement is structural, not exhortative**:

1. S1 schema requires `evidence: [{page, quote_lt_30w}]` on every leaf. Items without evidence are dropped by the parser, not by Claude.
2. **Post-S1 verifier**: a deterministic TS pass takes every `quote` and runs it through the existing index `Grep` (case-insensitive, whitespace-normalised). Any quote not literally present in `content.md` → that item is dropped before S2 ever sees it. This is the "citation faithfulness" check from Bohnet et al. (*Attributed QA*, 2022) and Gao et al. (*RARR*, 2023), simplified for our case (we already own the source corpus).
3. S2-S5 are explicitly told "DO NOT invent; only select/group/order" and receive only the verified set.
4. Each rendered Excalidraw node carries `customData.citations` so the user can hover → see page + quote → click → jump into the PDF (exact same affordance as lens markers).

This is stronger than RAG-style "cite your source" prompting because (a) the corpus is finite and local, (b) verification is mechanical, and (c) the model never sees uncited content as input to later stages.

---

## 4. Diagram DSL — node/edge list + deterministic Excalidraw renderer (with ELK layout)

**Pick: structured node/edge list (`WBDiagram` JSON above) → ELK.js layout → Excalidraw scene.**

Why not the alternatives:

- **Direct Excalidraw JSON from LLM**: Excalidraw scenes have ~30 fields per element (`seed`, `versionNonce`, `groupIds`, `boundElements`, `roundness`, `frameId`...). LLMs get the binding/grouping wrong consistently; one stale `versionNonce` and the scene won't load. Token-expensive too (~500 tokens per node).
- **Mermaid → Excalidraw**: there's `mermaid-to-excalidraw` (the official Excalidraw library does this), but Mermaid's expressivity is a subset of what we want (no per-node citations, no kind-based palette, no cross-level parent links), and we'd be debugging two parsers.
- **Our own DSL → ELK → Excalidraw**: ELK.js (Eclipse Layout Kernel, JS port) is the same engine Excalidraw's own auto-layout uses. We get research-grade hierarchical layouts for free, the LLM emits ~50 tokens per node, and we own every Excalidraw field so binding/IDs are correct by construction. This is the path used by `excalidraw-mermaid`, `tldraw`'s AI demos, and Vercel's v0 diagram mode.

The TS renderer maps `kind` → palette (`process` = `#fff8ea` warm beige matching the existing lens SVG aesthetic, `model` = lavender, `data` = pale blue, `input/output` = white) and applies Excalifont, stroke-width 1.5, `roundness: type-3` (sloppiness 1) for the hand-drawn feel.

---

## 5. Level-of-detail control

- **Level 1**: 3-7 nodes, hard cap at 7 (Miller 1956's 7±2 ceiling), target 4-5 (Cowan 2001 chunk limit cited in CLAUDE.md). Each node ≤4 words. One canvas, "input → process → output" reading along `layout_hint`. **One Level 1 per paper.**
- **Level 2**: **one diagram per expandable Level-1 node** (1-to-1, not user-picks-one-of-many). Pre-warmed in background after S3 lands. 4-7 nodes each. Visual continuity rule: each L2 diagram **starts with a faded "ghost" of the parent L1 node in the top-left** so the user sees "you are zooming into THIS box". Same palette as the parent.
- **Level 3**: **only for nodes flagged `include_algorithms` or marked as a named component** (not every L2 node gets an L3). 1-to-1 with algorithms, not nodes. Pseudocode shape for algorithms (line-per-row), state-diagram shape for protocols, flow shape for sub-pipelines.

Visual continuity = (a) palette inherited from parent, (b) ghost-of-parent in corner, (c) breadcrumb in title (`Method › Training › Inner Loop`), (d) same Excalifont + stroke-width across all levels. The user's mental model is "zoom into the same drawing", not "open a different artwork", same as CLAUDE.md §2.1.

---

## 6. Side-chat refinement

**Patch-mode by default, regenerate-mode on demand.** Two tool-using sub-agents:

- `propose_patch(diagram_id, ops[])` — ops are typed: `add_node`, `remove_node`, `relabel(id, new_label)`, `split_node(id, into[])`, `merge_nodes(ids[], into)`, `add_edge`, `change_kind(id, kind)`. The model emits ops; a deterministic TS reducer applies them and re-runs ELK layout. **User edits in Excalidraw are preserved by storing them as a final ops layer** (`user_ops[]`) replayed after every regeneration — same pattern as `prosemirror`'s collaborative ops.
- `regenerate(level, parent_id, instruction)` — full re-pass through S3/S4/S5 with the instruction injected after the cached prefix. Used when the user says "redo this completely as a state diagram" or "this is wrong about the method".

Side-chat prompt:

```
You edit research-paper whiteboards. The current diagram is <DSL JSON>. The user said: "<instruction>". Available tools: propose_patch, regenerate. Default to propose_patch with minimal ops. Only call regenerate if the user asks for a "redo", "from scratch", or the requested change touches >40% of nodes. Every new/relabelled node still needs a citation drawn from <methodology.json> (cached). If the change cannot be cited from the paper, refuse and say which page would need to support it.
```

---

## 7. Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Theory/survey/position paper | S1's `archetype` field | S2 uses theory-mode branch (results not stages); skip Level 3; show banner "this paper is a theory paper — diagram shows results, not a pipeline" |
| Invalid DSL JSON | TS Zod parse fails | Re-prompt once with the parse error appended; if still bad, drop offending node, render the rest |
| Hallucinated stage | Post-S1 grep verifier (§3) fails | Drop the item before S2; log to `whiteboard-issues.json` so user can inspect |
| ELK layout overflow (too many nodes) | Renderer measures bounding box | Force Claude to re-emit with `node_count_target` reduced by 2 |
| Empty methodology section | S1 returns 0 stages | Render Level 1 as "Goal + Result + Evidence" triptych; suppress Level 2/3 |

---

## 8. Cost & latency (10-page typical paper, ~40k input tokens)

| Stage | Input (uncached / cached) | Output | Model | First run | Cached re-run |
|---|---|---|---|---|---|
| S1 Extract | 40k | ~3k JSON | Sonnet 4.6 | $0.15 | $0.05 |
| S2 Skeleton | 4k (S1 JSON) | ~1.5k | Opus 4.7 | $0.10 | $0.04 |
| S3 Level 1 | 5k (cached) | ~1k | Sonnet 4.6 | $0.02 | $0.005 |
| S4 ×5 (one per L1 node) | 4k each (cached) | ~1k each | Sonnet 4.6 | $0.08 | $0.02 |
| S5 ×3 (algorithms only) | 3k each (cached) | ~1k each | Sonnet 4.6 | $0.04 | $0.01 |
| **First-time total** | | | | **≈ $0.40** | |
| **Per side-chat patch** | mostly cached | small | Sonnet 4.6 | | **≈ $0.005** |

Latency: S1 dominated by tool loops (~25-40s for 10pp), S2 ~6s, S3+S4+S5 streamed in parallel after skeleton lands (~8s). Total first-paint of Level 1 ≈ 45s; full 3-level expansion ≈ 70s, all visible as it streams.

Caching strategy: mark the system prompt + `methodology.json` + `skeleton.json` with `cache_control: { type: "ephemeral" }`. Refresh-on-touch keeps the prefix warm during a refinement session. This is the same prefix-caching pattern Anthropic documents for Claude Sonnet/Opus and what makes recursive iteration affordable.

---

**Files cited:**
- `/Users/ashrya/Desktop/PdfReader/.claude/specs/whiteboard-diagrams.md`
- `/Users/ashrya/Desktop/PdfReader/src/main/ai/client.ts`
- `/Users/ashrya/Desktop/PdfReader/src/main/ai/decompose.ts`
- `/Users/ashrya/Desktop/PdfReader/src/renderer/pdf/buildIndex.ts`
- `/Users/ashrya/Desktop/PdfReader/CLAUDE.md` §1, §2.1, §6, §7

**Research grounding:** multi-stage / Selection-Inference (Creswell et al. 2022); Chain-of-Verification (Dhuliawala et al. 2023); attribution-by-quote-grep (Bohnet et al. *Attributed QA* 2022; Gao et al. *RARR* 2023); working-memory caps for diagram density (Miller 1956; Cowan 2001; Sweller-Chen-Kalyuga 2010 element interactivity — already in CLAUDE.md §1); Anthropic prompt caching docs for the cached-prefix economics; ELK hierarchical layout (Schipper & von Hanxleden 2010) used by Excalidraw/tldraw.
