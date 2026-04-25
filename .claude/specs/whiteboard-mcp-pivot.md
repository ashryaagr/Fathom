---
spec: Whiteboard Pass 2 — MCP-driven authoring (parked design)
status: AWAITING USER DECISION (do NOT implement until the user picks Path B/C; if they pick Path A, archive)
created: 2026-04-26
parked: 2026-04-26
parked_by: whiteboard-impl, on team-lead instruction
context: Render-only close-the-loop verification (run 2026-04-26 17:40-18:02 UTC) showed the user's three reported bugs (text overflow, vertical L1, arrow overlaps) ALL not reproduced after the `regenerateIds: false` + bend-points + text-aware sizing + 24-char label cap fixes. Scene size dropped from 165 KB (213 elements, 3 stacked diagram copies) to 22 KB (28 elements, single clean diagram). Path A — ship the render fix and defer MCP — was recommended to the user. This spec captures the MCP design in case the user picks Path B/C instead.
research-by: ai-scientist@fathom-build agent (handoff received 2026-04-26)
supersedes: nothing yet — additive on `whiteboard-diagrams.md`
---

# Why this spec is parked

The render-only verification on v1.0.20 demonstrated that the existing pipeline, with the render-layer fixes from the 2026-04-26 round, produces clean diagrams. The MCP-driven Pass 2 was designed under the assumption that text-fitting could only be fixed by server-side `measureText` *before* element creation. That assumption was true while we were emitting WBDiagram → ELK → `convertToExcalidrawElements` with `regenerateIds: true` (the default), because the regenerated rect ids broke the bound-text `containerId` references and let text free-float. With `regenerateIds: false`, bound text actually binds, Excalidraw's auto-wrap inside `containerId` works, and text stays inside boxes.

So the MCP no longer solves a problem we have. It would solve a problem we *had*, at:

| | Existing pipeline (v1.0.20+ fixes) | MCP-driven Pass 2 |
|---|---|---|
| Cost per paper | ~$1.90 | ~$4.00 |
| L1 first-paint latency | ~70 s | ~95 s |
| Per L2 expansion | ~$0.05 | ~$0.45 |
| Wrapper module needed | no | yes (`create_node_with_fitted_text`, `connect_nodes`) |
| New runtime dep | none | `node-canvas` + bundled MCP fork |
| Spec rewrite scope | small (touch-ups) | large (replace Pass 2 section, delete Pass 2.5 section) |
| Code deletion | small | ~600 LOC (DSL parser + ELK layout + convertToExcalidrawElements wrapper + Pass 2.5 critique pipeline) |

The MCP path adds fewer-than-zero benefits over the existing pipeline now that the bindings work, and adds substantial cost and complexity. **Recommendation to the user is Path A: ship the render fix, archive this spec.** The user has not yet decided. If they decide Path B/C, this spec is the implementation brief.

# Origin

The user's instruction (verbatim, 2026-04-25):

> "Maybe integrate with Excalidraw MCP to make this workflow very smooth. Work with the AI scientist to see how this can work best, because this is an AI problem, not simply a software engineering problem. Probably it's best to give access to MCP for Excalidraw and then work through this so that the agent has the best tools accessible through the language it understands. https://github.com/yctimlin/mcp_excalidraw — This is an example MCP that I use for Excalibur."

The AI scientist agent was dispatched after the user's instruction landed. They returned the design captured below. The render-only verification ran in parallel and produced evidence the MCP isn't necessary. Both pieces of work landed at the orchestrator simultaneously; the team-lead made the call to park this until the user picks a direction.

# Architecture (if implemented)

## What stays (no changes)

- **Pass 1** (`runPass1` in `src/main/ai/whiteboard.ts`) — Opus 4.7, 1 M context, understanding doc to disk. Prompt unchanged.
- **Soft quote-verifier** (`runVerifier` + `whiteboard-issues.json`) — background pass, never mutates diagram.
- **Sidecar persistence** at `~/Library/Application Support/Fathom/sidecars/<contentHash>/whiteboard.excalidraw`.
- **Excalidraw renderer** in `WhiteboardTab.tsx` — loads the `.excalidraw` file as-is. No changes beyond removing the DSL → scene conversion path.
- **Tab status dot** (red pulsing → amber idle) — color/animation rules unchanged; re-source in-flight signal from MCP `onProgress` deltas instead of the existing `expandingNodeIds`.
- **Doherty ack contract** (50 ms placeholder skeleton on tab click).
- **Drill UX** (vertical L2 placement via post-process step, animated `scrollToContent`, breadcrumb).

## What goes

- `WBDiagram` DSL — `parseWBDiagram` in `src/renderer/whiteboard/dsl.ts` and the matching schema in `src/main/ai/whiteboard.ts`'s Pass 2 prompt.
- ELK.js layout call (`src/renderer/whiteboard/elkLayout.ts`).
- `convertToExcalidrawElements` skeleton-builder in `src/renderer/whiteboard/toExcalidraw.ts` (the agent paints palette directly using the MCP's `read_diagram_guide`).
- `runPass25Critique` and the Pass 2.5 standalone pipeline (the MCP gives the agent `describe_scene`, so critique happens inside Pass 2's tool-use loop).

## What gets added

### 1. MCP server lifecycle in main process

Spawn `yctimlin/mcp_excalidraw` (Express canvas + MCP stdio bridge) on demand at the start of each `runPass2` call; tear down on done/abort. **One MCP per Pass 2 call** so concurrent L2 expansions don't collide on shared canvas state. Use the SDK's `mcpServers` config on the `query()` call; the SDK type is `AgentMcpServerSpec` (confirmed in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:112`).

Vendor the MCP under `resources/mcp_excalidraw` so it ships inside the `.app` bundle. Resolve the path at runtime with `process.resourcesPath` (works in dev + packaged). PR-upstream policy is up to the user.

### 2. Wrapper MCP module (`src/main/mcp/excalidraw-wrapper.ts`, ~80 LOC)

Adds two MCP tools the agent calls instead of the upstream's raw primitives:

- **`create_node_with_fitted_text(label, summary, kind, x, y, drillable, citation?)`** — uses `node-canvas` (new dep) with Excalifont registered server-side to `measureText` *before* creating the rect. Computes the wrap inside `(maxInnerWidth)` for a label-fits-on-one-line + summary-wraps-to-≤3-lines goal. Calls upstream `batch_create_elements` with rect + text-bound-to-container (`containerId` set to the rect's id). Returns `{rect_id, text_id, actual_w, actual_h}`. **This is the load-bearing piece** — without it, the upstream MCP creates rect + text as two unbound elements and we get the same overflow we just fixed.
- **`connect_nodes(from_id, to_id, label?)`** — calls upstream `create_element` for an arrow with `startBinding` + `endBinding` set, so the arrow auto-routes when nodes move.

Both return upstream MCP element ids so the agent can chain.

### 3. Pass 2 agent rewrite

New system prompt:

> "You are authoring a Fathom whiteboard. Use Excalidraw MCP tools. Quality bar: ≤ 5 nodes / horizontal pipeline / text inside boxes / drillable = ⌖ glyph + dashed border / citations as amber squares. After each `batch_create_elements` call, call `describe_scene` to confirm nothing overlaps. Call `export_scene` when done."

Allowed tools: wrapper MCP toolset + `Read` on `<indexPath>/content.md` (citation grounding only). `maxTurns: 30`. Pass 1 understanding doc still cached as the prefix.

### 4. Vertical L2 placement post-process (~10 LOC, no LLM)

After each L2 frame's scene is exported, in main: parse the JSON, offset every element's `y` by `parent.y + parent.h + 200`, merge into the combined `whiteboard.excalidraw`.

### 5. Per-node `customData`

Still carries `{drillable, parent, citation, generated_at}`. Agent populates these when authoring (instructed in the system prompt).

# Sequencing (if implemented)

1. **Vendor + smoke test the upstream MCP** against the SDK — prove the SDK can spawn it via `mcpServers` config. ~10 min, $0 (smoke test asks for "list available tools" only).
2. **Build the wrapper MCP** in `src/main/mcp/excalidraw-wrapper.ts`. Verify `create_node_with_fitted_text` produces correctly-sized rects on the same fixtures the render-only CLI exercises (`reconviagen-l1`, `stress-l1`).
3. **Wire MCP lifecycle** into `runPass2`. Spawn-per-call, tear-down on done/abort.
4. **Rewrite Pass 2 system prompt** with the spec rules above.
5. **Add the L2 vertical post-process** in main.
6. **Delete dead code** only after the MCP path renders cleanly end-to-end.
7. **Repurpose `scripts/render-whiteboard.mjs`** as a saved-scene inspector (no changes to the CLI itself; just point it at sidecar paths).
8. **Update consent prompt** ($1.90 → $4, 70 s → 95 s) + methodology doc + this spec.

# Spend caps (if implemented)

- ~$0.50 across smoke-test phase.
- ~$4 for first end-to-end MCP Pass 2 dry-run.

# Universal fixes that survive the pivot regardless

These already shipped in v1.0.20 + working tree and stay valuable in either path:

- `regenerateIds: false` on every `convertToExcalidrawElements` call site — the renderer still calls this at hydration; in fact MORE important post-pivot because the `.excalidraw` scene is authored by the agent (not us) and will have stable ids the agent set.
- `sanitiseAppStateForDisk` collaborators-Map fix — Excalidraw's restore behaviour unchanged.
- DB `Whiteboards.upsert` split for cost-only callers (NOT NULL fix).
- Tab status dot (re-source from MCP-tool-in-flight `onProgress` signals).
- Vertical L2 placement math (moves into the post-process step).
- `scripts/fathom-test.sh whiteboard-generate` ⌘⇧F4 QA shortcut.
- `scripts/render-whiteboard.mjs` and the `render-fixtures/` (used as offline scene inspector).

# Non-goals for the pivot (defer)

- Figure embedding through the wrapper MCP — phase-2 concern; the upstream's `import_scene` may give a better path.
- Migrating the soft quote-verifier — it operates on the understanding doc text, not the scene, so MCP doesn't affect it.

# Decision waiting on the user

Pick one of:

- **Path A — Ship without MCP.** Render-only verification proved the existing pipeline produces clean diagrams. Archive this spec. ~$1.90/paper, ~70 s first paint.
- **Path B — Ship MCP now.** Execute step 1 onward. ~$4/paper, ~95 s first paint. Throws away ~600 LOC of working code.
- **Path C — Keep render fix, add MCP later as an opt-in cost tier.** Ship Path A, leave this spec parked. If/when a "smoother authoring" feature is requested, pull this spec out.

Recommendation from the orchestrator (relayed from the close-the-loop report 2026-04-26 18:02 UTC): **Path A**. Render-only evidence is decisive; MCP solves a problem we no longer have at 2× cost and 1.6× latency.

# Cross-references

- `.claude/specs/whiteboard-diagrams.md` — the active Pass 1 + Pass 2 + render spec. Stays canonical regardless of this pivot's outcome.
- `.claude/specs/whiteboard-diagrams-research-ai-scientist.md` — original AI Scientist research that informed the v2 pipeline. Predates this MCP pivot.
- `docs/methodology/whiteboard.md` — user-facing operations doc. Updated in the same commit IF this pivot is implemented.
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:112` — `AgentMcpServerSpec` type (the SDK's MCP integration surface).
- `https://github.com/yctimlin/mcp_excalidraw` — the upstream MCP this pivot would integrate.
