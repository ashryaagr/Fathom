---
name: fathom-excalidraw
description: Fathom whiteboard architecture, MCP wrapper, smoke tests, and how to extend any of it.
when_to_use: Touching anything in src/main/mcp/, src/main/ai/whiteboard.ts, src/renderer/whiteboard/, or scripts/{runpass2-smoke,inspect-scene,smoke-whiteboard-mcp,render-whiteboard}.{mts,mjs}. Read this BEFORE editing — it documents non-obvious design choices that drove the current architecture.
---

# Fathom whiteboard — agent skill

## Architecture (Option C, ratified 2026-04-26)

The Pass 2 agent authors the `.excalidraw` scene directly via an **SDK-instantiated MCP wrapper** (`createSdkMcpServer` from `@anthropic-ai/claude-agent-sdk`). We do **not** spawn the upstream `yctimlin/mcp_excalidraw` Express + stdio pair, even though we vendored it as a reference. The upstream is designed for chat clients with a live shared canvas (Claude Desktop), which Fathom doesn't need — our user sees the diagram only after Pass 2 completes and the renderer mounts the saved scene.

**Why this matters for a future agent**: don't try to "fix" us back to the upstream's two-process design. The SDK MCP pattern is intentional and gives us:

- One MCP per Pass 2 call. State is per-call by construction.
- No port management, no zombie cleanup, no `EXPRESS_SERVER_URL` env-var threading.
- Single source of truth: the wrapper authors the same `.excalidraw` JSON shape the renderer loads. No translation layer.
- Native integration with the SDK we already use across the codebase.

The full design doc lives at `.claude/specs/whiteboard-mcp-pivot.md` (originally parked, now implemented).

## Pipeline

```
[Indexing complete]
       ↓
[Pass 1 — UNDERSTAND]            (Opus 4.7, 1M context, ~50s, ~$1.35/paper)
   src/main/ai/whiteboard.ts::runPass1
   Reads ENTIRE paper + figure captions + digest
   Tools: Grep on content.md
   Output: whiteboard-understanding.md (markdown)
       ↓
[Pass 2 — RENDER]                (Opus 4.7, ~80s, ~$0.40 cached)
   src/main/ai/whiteboard.ts::runPass2
   - Spawns wrapper MCP via createWhiteboardMcpWithStateAccess
   - Plugs into mcpServers: { whiteboard: mcp } on query()
   - Agent calls: read_diagram_guide → 5× create_node_with_fitted_text →
     N× connect_nodes → describe_scene → export_scene
   - getScene() snapshots the in-memory state (defensive, persists even
     if agent forgot export_scene)
   Output: .excalidraw scene JSON
       ↓
[Renderer mount]                  (instant, no API call)
   src/renderer/whiteboard/WhiteboardTab.tsx
   - L1 mount effect watches store.pass2L1Scene, calls api.updateScene
   - L2 mount effect watches store.pass2L2Scenes Map, offsets by
     parent.y + parent.h + 200 for vertical drill placement
       ↓
[Sidecar persist]
   ~/Library/Application Support/Fathom/sidecars/<contentHash>/whiteboard.excalidraw
```

**Eager L2 pre-warm**: when L1 lands, the renderer fires `runExpand` for every drillable node IN PARALLEL. Click feels instant because the L2 frame is usually already painted.

## The wrapper's nine MCP tools

`src/main/mcp/whiteboard-mcp.ts::createWhiteboardMcpWithStateAccess`

Always-available (Pass 2 + chat):

| Tool | Purpose |
|---|---|
| `read_diagram_guide` | Returns the spec rules (≤5 nodes, kinds, layout, workflow). Agent reads ONCE at start. |
| `create_node_with_fitted_text` | Measures label+summary server-side, sizes the rect, emits batch (rect + bound text via containerId). Returns `{node_id, suggested_next_x}`. |
| `connect_nodes` | Emits arrow with `startBinding` + `endBinding` so it tracks node movement. |
| `describe_scene` | Text dump (counts, positions, broken-binding check, ≤5 check). The STRUCTURAL self-critique loop. |
| `look_at_scene` | Renders the current scene to PNG via headless Chromium + real `@excalidraw/excalidraw`'s `exportToCanvas`, returns the image as an MCP image content block (base64 + mimeType). The agent SEES the result; this is the VISUAL self-critique loop. ≤3 rounds (Pass 2) / ≤2 rounds (chat), then `export_scene`. Lazily spawns `scripts/render-real-server.mjs` on first call (~10-15s cold), subsequent renders ~500ms. |
| `export_scene` | Finalises `.excalidraw` JSON. Caller writes to disk. |
| `clear_scene` | Wipes state. Defensive — agent can start over if wrong. |

Chat-mode only (`mode: 'chat'` in `createWhiteboardMcpWithStateAccess` opts; allowed via runPass2's `allowedTools`):

| Tool | Purpose |
|---|---|
| `place_chat_frame` | Places a soft-orange Excalidraw `frame` at (x, y, w, h) titled `Q: <user question>`. Subsequent create/connect calls are auto-parented into the frame via `pushElements`. The agent picks (x, y) from `read_diagram_state.bbox`. |
| `read_diagram_state` | Returns a JSON snapshot of what's already on the canvas (L1 + L2 + prior chat frames) — node bboxes + labels + kinds, frame bboxes, total scene bbox. The chat agent uses this to park its frame to the right of paper-derived content and reference existing nodes by name. |

The `createWhiteboardMcpWithStateAccess` return now exposes:
- `getScene()` — snapshot of the in-memory state (the same shape `export_scene` would return).
- `getActiveFrameId()` — chat-mode only; the id of the frame placed via `place_chat_frame`. Used by the IPC layer to surface the chat-frame back to the renderer for the "Jump to chart" button.
- `dispose()` — MUST be awaited in `try/finally` by every caller. Tears down the look_at_scene render-server subprocess. Skip and you leak a Chromium per call.

The text-fit logic uses character-width approximation (10 px/char @ 16 px Excalifont label, 7.5 px/char @ 13 px Helvetica summary), proven against real fixtures via `scripts/smoke-whiteboard-mcp.mjs`. Conservative over-estimate so the rect always contains its text.

## Diagram quality bar (the `read_diagram_guide` content)

The wrapper's `DIAGRAM_GUIDE` constant is the source of truth. Excerpt:

- **At most 5 nodes per diagram** (Cowan 4±1 working memory cap). Group beyond 5 into a drillable parent.
- **Horizontal pipeline by default** (left-to-right). Side branches drop to a second row — that's correct ELK-style layered placement, not a layout failure.
- **Use the paper's own terminology** for labels — never rename a component to be more "intuitive."
- **Mark exactly ONE node as `kind: "model"`** — the novel contribution. Renderer fills it with warm beige (#fef4d8).
- **`drillable: true` when the node contains 2+ sub-components.** Renderer paints dashed inner border + ⌖ glyph at bottom-right.
- **Citations**: `citation: {page, quote}` → small amber square at top-right.
- **Figures**: `figure_ref: {page, figure}` → renderer embeds `<indexPath>/images/page-NNN-fig-K.png` next to the rect.

## Smoke tests (no Electron needed)

| Script | Purpose | Cost |
|---|---|---|
| `npx tsx scripts/runpass2-smoke.mts` | Drive runPass2 inline against the cached Pass 1 doc. Verifies the agent produces clean L1 scenes. | ~$0.40 (cache HIT) |
| `npx tsx scripts/runpass2-smoke.mts --level 2 --parent wb-rect-XXX` | L2 expansion against an L1 node id. | ~$0.30 (cache HIT) |
| `node scripts/smoke-whiteboard-mcp.mjs` | Pure-JS port of the wrapper's text-fit logic. Exercises sizing/binding without any Claude calls. | $0 |
| `node scripts/inspect-scene.mjs <path>.excalidraw` | GEOMETRY-only renderer (counts, bbox parity, broken-binding check). Does NOT show what Excalidraw actually paints — use render-real for that. | $0 |
| `node scripts/render-real.mjs <path>.excalidraw [out]` | **REAL Excalidraw render** — Playwright + headless Chromium mounting `@excalidraw/excalidraw` and either screenshotting the page or calling `exportToCanvas`. This is the only harness whose output matches what the user sees. | $0 |
| `node scripts/render-whiteboard.mjs <fixture>.json` | Legacy WBDiagram-fixture renderer. Not needed for the MCP path; kept for fixture-test parity. | $0 |

**Run order for a fresh-start verification**:

1. `npx tsx scripts/runpass2-smoke.mts --sidecar <FULL_PATH_TO_SIDECAR>` — emits `/tmp/wb-pass2-smoke-<ts>.excalidraw`
2. `node scripts/render-real.mjs /tmp/wb-pass2-smoke-<ts>.excalidraw /tmp/wb-out` — emits `wb-out.canvas.png` (Excalidraw's own export — what the user sees) + `wb-out.page.png` (full page screenshot with chrome)
3. `Read /tmp/wb-out.canvas.png` to look at the actual pixels

Total: ~110 seconds, ~$0.40 spend, complete L1 render verified visually against real Excalidraw.

**Do NOT trust inspect-scene.mjs alone** — it confirms geometry parity (rect bbox, binding pointers) but cannot detect: missing `originalText` field, `autoResize=true` falling back to text-grow-the-box behaviour, fontFamily fallback width drift, or any other render-pipeline divergence. The real Excalidraw render is the only page-of-truth.

## Live-app QA harness

`scripts/fathom-test.sh` subcommands:

- `launch` — visible-mode launch via `open -a Fathom`. (Don't switch back to `open -gj` hidden mode — it breaks BrowserWindow's `ready-to-show` event on this Electron version.)
- `sample` — opens the bundled sample paper via ⌘⇧F9 global shortcut.
- `whiteboard-generate` — fires ⌘⇧F4, switches to Whiteboard tab, auto-accepts consent, kicks the MCP-driven Pass 2.
- `whiteboard-drill` — fires ⌘⇧F2, drills into the first drillable L1 node.
- `capture <name>` — non-disruptive offscreen screenshot via ⌘⇧F10.

The QA harness does NOT work when the macOS screen is locked — System Events keystrokes can't reach Fathom. If your test silently does nothing, check whether the screen is locked. Otherwise prefer the Node smoke test which doesn't need the live app.

## Vendored upstream (reference only)

`.vendor/mcp_excalidraw-reference/` is a `git clone` of `yctimlin/mcp_excalidraw`. Useful for:

- Reading their tool taxonomy + JSDoc to inform our wrapper's design
- Comparing our `read_diagram_guide` against their `read_diagram_guide`
- Understanding the `.excalidraw` element shapes the upstream emits

We do **not** spawn it at runtime. If you find yourself needing to, talk to whoever last touched the wrapper — there's almost certainly a better path through the SDK MCP.

## Universal fixes that survived multiple architecture rewrites

These are load-bearing across the WBDiagram → DSL → MCP migration. Don't accidentally undo any of them:

- **`regenerateIds: false` on every `convertToExcalidrawElements` call site.** Default `true` rewrites every rect/text/arrow id post-skeleton, breaking `containerId` and `start/endBinding` references. Caused "text outside the boxes" + "arrows through nodes" bugs in pre-MCP versions.
- **Container-bound text MUST have `width`, `height`, `originalText`, and `autoResize: false`.** Excalidraw will silently drop the text element if `width`/`height` are NaN/missing — the rect renders empty. With `autoResize: true` (default) and a long line, the text grows beyond the rect bounds instead of wrapping. With no `originalText`, Excalidraw's editor breaks on first interaction. The wrapper enforces all four; if you ever emit a text element through a different code path, mirror this exactly. Bug found 2026-04-26: every saved scene before the wrapper fix shipped without these fields and rendered as empty boxes.
- **Pre-wrap the `text` field at server-side measured width.** Excalidraw renders the `text` field verbatim — line breaks and all. With `autoResize: false` it does NOT re-wrap a long line to fit `width`; it just clips. So the wrapper takes the lines `fitNodeSize` already computed and joins them with `\n` into the `text` field, while keeping the unwrapped string in `originalText` for editor round-trips.
- **L2 element ids MUST be namespaced by parent.** Each MCP call has its own counter starting at 1, so L1 emits `wb-rect-001..N` and EVERY L2 also starts at `wb-rect-001`. When the renderer merges L1 + multiple L2 scenes into one Excalidraw canvas, duplicate ids cause container-text bindings + arrow-end bindings to land on the wrong element. The wrapper now emits L2 ids as `wb-l2-<parentId>-rect-001` etc. Don't change the namespace scheme without rewriting the renderer's binding lookups.
- **`sanitiseAppStateForDisk` on persist + restore.** Excalidraw uses a `Map` for `appState.collaborators`; JSON.stringify turns it into `{}`; restore crashes with `appState.collaborators.forEach is not a function`. Allowlist-only persisting fixes it.
- **DB `Whiteboards.upsert` split** into status-aware + status-omitted code paths. Cost-only callers (whiteboard:expand) hit `NOT NULL constraint failed: whiteboards.status` if they go through the unified path.
- **Tab status dot** uses the same color grammar as PDF inline-ask streaming markers (`#d4413a` red + `fathom-marker-streaming` pulse → `var(--color-lens)` amber). One unified "is the AI working?" signal across the product.

## Where to look when something is wrong

| Symptom | Look here |
|---|---|
| Pass 2 emits junk diagram | `src/main/ai/whiteboard.ts::PASS2_SYSTEM` (system prompt) + `src/main/mcp/whiteboard-mcp.ts::DIAGRAM_GUIDE` (rules tool returns) |
| Text overflows boxes | `src/main/mcp/whiteboard-mcp.ts::fitNodeSize` (server-side measureText). Tighten `LABEL_CHAR_W`/`SUMMARY_CHAR_W` if you find Excalifont actually renders wider than 10 px/char. |
| L2 mounts in the wrong place | `src/renderer/whiteboard/WhiteboardTab.tsx` L2 mount effect (offset math: `parent.y + parent.h + 200`) |
| Status dot stuck on red after Pass 2 done | Check `expandingNodeIds.size` in the store — pre-warm L2 expansions may be in flight |
| Saved scene won't reopen | Check `sanitiseAppStateForDisk` allowlist — a new appState field may be sneaking through |
| `whiteboard-generate` does nothing | Screen locked? Check `osascript -e 'tell application "System Events" to count windows of process "Fathom"'`. Should return 1. |

## Future-work follow-ups (not blocking)

- `dsl.ts` (`parseWBDiagram`, `WBDiagram` types) is now mostly dead — only the type is used by the legacy `setLevel1`/`setLevel2` store actions for breadcrumb labels. Could be replaced with a minimal `{nodes: {id, label}[]}` shape and `dsl.ts` deleted. ~30 LOC saved.
- `elkLayout.ts` + `toExcalidraw.ts` are unreferenced after the MCP cutover. Safe to delete; left in tree for now to be fully sure no other teammate references them.
- `scripts/render-whiteboard.mjs` (the WBDiagram-fixture renderer) is also unreferenced post-MCP. Sister to `inspect-scene.mjs`. Can be deleted when we delete `dsl.ts`.

## Cost & latency you should plan for

| Stage | Cost (first run, 10pp paper) | Latency |
|---|---|---|
| Pass 1 (Opus 4.7) | ~$1.35 | ~50 s |
| Pass 2 — L1 (Opus 4.7, MCP-driven, cache HIT) | ~$0.40 | ~80 s |
| Pass 2 — L2 ×5 (Opus 4.7, MCP, cache HIT, parallel) | ~$1.40 (5 × $0.28) | ~80 s wall-clock (parallel) |
| **Total first-time generation** | **~$3.15** | **~130 s to L1 paint, ~140 s to L1+L2 fully expanded** |

Costs verified via `scripts/runpass2-smoke.mts` runs on 2026-04-26.
