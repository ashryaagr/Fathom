/**
 * Whiteboard Diagrams pipeline. Spec:
 *   - .claude/specs/whiteboard-diagrams.md (PIPELINE V2 LOCKED)
 *   - docs/methodology/whiteboard.md (user-facing operations doc)
 *
 * Two passes:
 *   - Pass 1 (Opus 4.7, 1M context): reads the entire indexed paper
 *     + figure captions + digest, emits a structured-but-loose
 *     markdown "understanding doc". Cached for 1 hour. Read-only Grep
 *     on content.md is the only tool.
 *   - Pass 2 (Sonnet 4.6): takes the cached Pass 1 output + a render
 *     request ("Render Level 1" or "Render Level 2 for the node X")
 *     and emits one WBDiagram JSON. ≤ 5 calls per Level 2 + 1 call
 *     for Level 1 = ≤ 6 Pass 2 calls per paper.
 *
 * Plus a soft-verifier that grep-checks each `[p.N] "quote"` Pass 1
 * inlined; results land in `whiteboard-issues.json` for the renderer
 * to surface as the dashed-citation marker. The diagram is NEVER
 * mutated based on verifier output (per spec — soft, not structural).
 *
 * Logging contract (matches docs/methodology/whiteboard.md "What to
 * look for in logs"): every call emits one `[Whiteboard PassN] …` line
 * with token counts + latency + cache hit/miss + cost estimate. The
 * methodology doc lists these prefixes as user-facing — do not rename
 * without updating the doc in the same commit.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { homedir } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolveClaudeExecutablePath } from '../claudeCheck';

// --- Cost & model constants. Pricing per Anthropic's docs (Apr 2026).
//     We surface these in logs so the methodology doc's cost numbers
//     have a code-side source of truth.
const OPUS_INPUT_USD_PER_MTOKEN = 15.0; // $15 / Mtok
const OPUS_OUTPUT_USD_PER_MTOKEN = 75.0; // $75 / Mtok
const SONNET_INPUT_USD_PER_MTOKEN = 3.0; // $3 / Mtok
const SONNET_OUTPUT_USD_PER_MTOKEN = 15.0; // $15 / Mtok
// Cached prefix tokens are 10% the regular input rate on the cache hit.
const CACHE_DISCOUNT = 0.1;

// --- Filenames inside the per-paper sidecar. Stable so the
//     methodology doc can name them and a future user can poke at them
//     directly without a code dive.
export const WB_UNDERSTANDING_FILE = 'whiteboard-understanding.md';
export const WB_ISSUES_FILE = 'whiteboard-issues.json';
export const WB_SCENE_FILE = 'whiteboard.excalidraw';
export const WB_CHAT_FILE = 'whiteboard-chat.json'; // placeholder for v1

// --- Pass 1 system prompt — verbatim from the spec, paste-once-and-
//     never-edit-without-a-spec-change. The `<<INDEXPATH>>` placeholder
//     is templated in by `runPass1` because the main wrapper needs the
//     absolute path to scope the Grep tool.
const PASS1_SYSTEM = `You are reading a research paper to help a curious technical reader build a mental
model of what the paper does — its core methodology, its key components, and how
they fit together. NOT literature review, NOT related work, NOT acknowledgements.

You have:
  • The full paper text (with \`<!-- PAGE N -->\` markers).
  • Figure captions and references.
  • A pre-computed digest (sections, equations, glossary).
  • Optional: the user's stated purpose for reading this paper. If present, weight
    your synthesis toward what they came to learn — but don't omit core methodology
    they didn't explicitly ask about.

You may call \`Grep\` on \`content.md\` if you want to verify a specific phrase before
committing it to your output. Use it sparingly — the paper is already in your
context. Grep is for confirming verbatim quotes, not for re-reading.

Reason section by section first (out loud, in <thinking> tags if you support them,
otherwise as a numbered list). Then synthesise.

Output a markdown document organised however feels natural. As a STARTING TEMPLATE
(not a contract — adapt freely):

## Goal
One sentence: what does this paper do? Then one paragraph of context: why does it
matter, what problem space does it sit in.

## Core methodology
The heart of the paper, in plain language. 2–4 paragraphs. Reference figure
numbers when figures carry the explanation (e.g. "see Figure 2"). Quote sparingly
when the paper's wording is load-bearing — use inline \`[p.N]\` page tags so a
downstream renderer can attach citations.

## Components
The 4–7 distinct pieces that make up the methodology. For each: one-line label, a
2-3 sentence description, source page reference, and (if applicable) the figure
that depicts it. These are the candidate nodes for the Level 1 diagram.

## Suggested Level 1 diagram
The user will see a top-level diagram with at most 5 nodes (working memory limit).
If your Components list above has more, propose a grouping — which Components
collapse into which Level 1 nodes. Use the paper's own vocabulary.

## Suggested Level 2 expansions
For each Level 1 node that contains 2+ Components, briefly say what its zoom-in
should show. Skip Level 1 nodes that are leaf concepts.

Hard rules:
  - Do NOT invent components, stages, or relationships that aren't in the paper.
    If you're not sure, say so.
  - Use the paper's own terminology. Don't rename things.
  - If the paper isn't a methods/system/algorithm paper (e.g. a theory paper or a
    survey), say so explicitly at the top and adapt the structure: theory papers
    show theorems instead of stages; surveys show the categorisation taxonomy.
  - Quote inline (\`[p.N]: "..."\`) only when confident the quote is verbatim. The
    downstream renderer will run a soft verifier and flag any unverified quotes
    with a \`?\` marker — you don't need to be perfect, but flagged citations
    look bad to the user, so quote conservatively.`;

// --- Pass 2 system prompt. Sonnet's job is small — render one
//     diagram from the cached Pass 1 understanding doc. Loose schema
//     so the model isn't fighting structure (per the user's "rigorous
//     structures can often be counterproductive" direction).
const PASS2_SYSTEM = `You render a single research-paper diagram as JSON. The Pass 1 understanding doc above the request describes the paper's goal, core methodology, components, and suggested diagrams. Use it as the source of truth — do not invent stages or components that aren't in the doc.

Output ONE JSON object inside a \`\`\`json fence. No prose before or after. Schema (everything but \`nodes\` and \`edges\` is optional):

\`\`\`json
{
  "level": 1,
  "title": "Optional title — appears at the top of the diagram",
  "parent": "L1.2",            // present on Level 2 only — the parent node id from the Level 1 plan
  "nodes": [
    {
      "id": "L1.1",            // stable id; use "L1.1" / "L1.2" for Level 1, "L1.2.1" / "L1.2.2" for Level 2
      "label": "Token Embed",  // ≤ 4 words, ≤ 24 chars — diagrams must scan in one fixation
      "kind": "input",         // one of: input, process, output, data, model. Defaults to "process".
      "summary": "...",        // ≤ 25 words, optional — only if it adds info the label doesn't carry
      "drillable": true,       // true iff this node contains 2+ Components and should reveal a Level 2 zoom
      "citation": { "page": 4, "quote": "we use scaled dot-product attention" },  // optional but encouraged for novel/complex nodes
      "figure_ref": { "page": 3, "figure": 2 }   // optional — see "Figure references" below
    }
  ],
  "edges": [
    { "from": "L1.1", "to": "L1.2", "label": "tokens" }   // label optional
  ],
  "layout_hint": "lr"   // "lr" (left-to-right pipeline, default) or "tb" (top-to-bottom flow)
}
\`\`\`

Rules:
  - Hard ceiling 5 nodes per diagram. If the source has more, group; the grouped node becomes \`drillable: true\` so the user can drill into it.
  - One node should be the "novel contribution" — set its \`kind\` to "model" so the renderer gives it visual weight.
  - Edges follow the paper's own narrative arrows. Don't invent edges that aren't in the paper.
  - Use the paper's own terminology in labels — never rename a component to be more "intuitive".
  - For Level 2, the diagram should show the inside of one Level 1 node (drillable=true on that L1 node). Same 5-node ceiling, same grammar, same \`drillable\` flag for sub-nodes that warrant a Level 3 — though Level 3 is not yet implemented.

Figure references (HIGH-VALUE — please use when the understanding doc names a figure):
  - The paper's index already cropped each figure to a PNG at \`<indexPath>/images/page-NNN-fig-K.png\` (NNN is zero-padded page number, K is 1-based figure index within that page).
  - When the Pass 1 understanding doc references a figure for a node — phrasings like "see Figure 2", "Figure 3 shows the encoder", or a \`(Fig. 4)\` aside next to a Component — set \`"figure_ref": {"page": N, "figure": K}\` on that node. The renderer embeds the cropped figure PNG inside the node so the reader recognises it instantly.
  - You may call \`Glob\` once on the pattern \`images/page-*.png\` (relative to the index path) to confirm which figure files actually exist before committing a figure_ref. Skip the figure_ref if no matching file exists — the renderer falls back to text-only without crashing, but a never-missing-file ref looks more confident.
  - Only one figure_ref per node. Do not invent figure references that aren't in the understanding doc.`;

// --- Public surface ---

export interface Pass1Result {
  /** The rendered understanding doc (markdown) — also persisted to
   * `<sidecar>/whiteboard-understanding.md`. */
  understanding: string;
  /** USD cost estimate for the call (input + output, no caching since
   * Pass 1 *is* the cached prefix for downstream calls). */
  costUsd: number;
  /** Wall-clock latency, milliseconds. */
  latencyMs: number;
  /** Anthropic-reported usage; null if the SDK didn't surface it. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** Optional purpose anchor — passed through so the methodology doc
   * can show what the user came to learn. */
  purposeAnchor?: string;
}

export interface Pass2Result {
  /** Raw model output. The renderer's `parseWBDiagram` does the
   * tolerant decoding into a WBDiagram object. */
  raw: string;
  costUsd: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** True iff the SDK reported a cache hit on the Pass 1 prefix. We
   * instrument this so the methodology doc's "1-hour TTL beta enabled"
   * claim is verifiable from the logs. */
  cachedPrefixHit: boolean;
}

export interface VerifierIssue {
  page: number;
  quote: string;
  /** Trigram overlap (0..1) against the closest passage in
   * `content.md` after whitespace + case + punctuation normalisation.
   * Soft-verifier rule (spec): ≥0.85 = verified; 0.50–0.85 = soft;
   * <0.50 = unverified. */
  score: number;
  /** Coarse classification from the score. */
  status: 'verified' | 'soft' | 'unverified';
  /** Best-matching passage we found, truncated to 240 chars. Useful
   * when the user opens whiteboard-issues.json to debug. */
  closest: string;
}

export interface VerifierResult {
  issues: VerifierIssue[];
  /** Fraction of quotes that passed the ≥0.85 threshold. The renderer
   * uses this to decide whether to show the "some citations may not
   * match" banner. */
  verificationRate: number;
  /** Map quote → status, so the per-node citation marker can render the
   * verified/unverified affordance without scanning issues. */
  quoteStatus: Record<string, VerifierIssue>;
}

export interface RunPass1Args {
  paperHash: string;
  indexPath: string;
  /** Optional purpose statement — appended to the user prompt so the
   * model can weight its synthesis toward what the reader came for.
   * Per the spec: present in the prompt but never required. */
  purposeAnchor?: string;
  abortController?: AbortController;
  /** Streaming hook — fired on every `text_delta`. Used by the
   * renderer to drive the Pass 1 streaming sidebar (cog reviewer
   * non-blocking note). Tool-use messages also reach this stream as
   * `[grep …]` lines so the user sees activity. */
  onProgress?: (text: string) => void;
}

export interface RunPass2Args {
  paperHash: string;
  indexPath: string;
  understanding: string;
  /** "Render the Level 1 diagram" or "Render the Level 2 expansion of
   * the Level 1 node labelled X (id: L1.2)". Built by the IPC layer. */
  renderRequest: string;
  level: 1 | 2;
  /** Parent WBNode id when level=2. Threaded into the prompt so Sonnet
   * knows which Level 1 node we're zooming into. */
  parentNodeId?: string;
  abortController?: AbortController;
  onProgress?: (text: string) => void;
}

/** TCC-aware cwd selector — same pattern as ai/client.ts and
 * ai/decompose.ts. Prefer the paper's sidecar (always inside userData
 * → no TCC prompt) when valid; fall back to homedir otherwise. */
function safeCwd(preferred?: string): string {
  if (preferred) {
    const home = homedir();
    const protectedPrefixes = [
      `${home}/Desktop`,
      `${home}/Documents`,
      `${home}/Downloads`,
    ];
    const isProtected = protectedPrefixes.some(
      (prefix) => preferred === prefix || preferred.startsWith(prefix + '/'),
    );
    if (!isProtected) {
      try {
        if (existsSync(preferred) && statSync(preferred).isDirectory()) return preferred;
      } catch {
        /* fall through */
      }
    }
  }
  return homedir();
}

// --------------------------------------------------------------------
// Pass 1 — UNDERSTAND
// --------------------------------------------------------------------

/** Run Pass 1 of the Whiteboard pipeline. Reads the entire paper into
 * Opus 4.7's 1M context window and writes a markdown understanding doc
 * to disk, returning the doc + cost/latency for logging. */
export async function runPass1(args: RunPass1Args): Promise<Pass1Result> {
  const t0 = Date.now();
  const cwd = safeCwd(args.indexPath);
  const pathToClaudeCodeExecutable = resolveClaudeExecutablePath() ?? undefined;

  // Load the inputs Opus needs. content.md is required; the digest
  // and figure captions are optional but useful.
  const contentPath = join(args.indexPath, 'content.md');
  if (!existsSync(contentPath)) {
    throw new Error(
      `Whiteboard Pass 1 needs content.md but it does not exist at ${contentPath}. The paper must be indexed first.`,
    );
  }
  const content = await readFile(contentPath, 'utf-8');
  // Digest is best-effort — if missing or unparseable, we still run.
  let digestText = '';
  const digestPath = join(args.indexPath, 'digest.json');
  if (existsSync(digestPath)) {
    try {
      digestText = await readFile(digestPath, 'utf-8');
    } catch {
      /* digest unreadable — Pass 1 still works without it */
    }
  }

  console.log(
    `[Whiteboard Pass1] BEGIN paper=${args.paperHash.slice(0, 10)} ` +
      `content=${content.length}ch digest=${digestText.length}ch ` +
      `purpose=${args.purposeAnchor ? `"${args.purposeAnchor.slice(0, 60)}"` : 'none'}`,
  );

  const userPrompt = buildPass1Prompt({
    indexPath: args.indexPath,
    content,
    digestText,
    purposeAnchor: args.purposeAnchor,
  });

  // The Agent SDK uses Sonnet by default (Claude Code preset). For Pass 1
  // we explicitly request Opus 4.7. The model ID is `claude-opus-4-7` —
  // there's no `-1m` variant; 1M context is the model's native window
  // (and also accessed via the `anthropic-beta: context-1m-2025-08-07`
  // header on Sonnet, but Opus 4.7 doesn't need that flag). The
  // initially-shipped `claude-opus-4-7-1m` was a hallucinated identifier
  // and produced a runtime "model not found" error on first generation.
  const q = query({
    prompt: userPrompt,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PASS1_SYSTEM },
      model: 'claude-opus-4-7',
      // Read-only Grep on content.md is the only tool. Spec §"Pass 1":
      // "no Read (already loaded), no WebSearch, no Bash."
      allowedTools: ['Grep'],
      additionalDirectories: [args.indexPath],
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      abortController: args.abortController,
      cwd,
      pathToClaudeCodeExecutable,
      // Opus might Grep a few times to verify quotes. 24 is generous.
      maxTurns: 24,
    },
  });

  let body = '';
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let toolUseCount = 0;

  for await (const msg of q) {
    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          body += event.delta.text;
          args.onProgress?.(event.delta.text);
        } else if (event.delta.type === 'thinking_delta') {
          // Thinking deltas surface to the user as faint progress
          // text — gives the streaming sidebar something to render
          // during the long Pass 1 wait.
          args.onProgress?.(event.delta.thinking);
        }
      }
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content ?? []) {
        if (block.type === 'tool_use') {
          toolUseCount++;
          const input = block.input as Record<string, unknown>;
          const pat = String(input.pattern ?? '').slice(0, 60);
          console.log(`[Whiteboard Pass1] grep: "${pat}"`);
          args.onProgress?.(`\n🔎 Grep "${pat}"\n`);
        }
      }
      // Stable schema: assistant messages carry usage on the message.
      const usage = (msg.message as unknown as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      if (usage) {
        if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens;
        if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens;
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution') {
        if (body.length === 0) {
          throw new Error(`Whiteboard Pass 1 failed: ${msg.subtype}`);
        }
        console.warn(`[Whiteboard Pass1] ${msg.subtype}; returning partial body of ${body.length} chars`);
      }
      // Top-level usage on the final result message — prefer it when present.
      const usageR = (msg as unknown as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      if (usageR) {
        if (typeof usageR.input_tokens === 'number') inputTokens = usageR.input_tokens;
        if (typeof usageR.output_tokens === 'number') outputTokens = usageR.output_tokens;
      }
    }
  }

  // Persist the understanding doc to disk. The methodology doc points
  // users at `whiteboard-understanding.md` for debugging — write it
  // before logging completion so a stat-on-log race can't lie.
  await mkdir(args.indexPath, { recursive: true });
  await writeFile(join(args.indexPath, WB_UNDERSTANDING_FILE), body, 'utf-8');

  const latencyMs = Date.now() - t0;
  // Cost estimate: full Opus pricing on input (no cache hit on Pass 1
  // itself — Pass 1 *creates* the cache). Output priced at Opus output
  // rate.
  const costUsd =
    ((inputTokens ?? estimateTokens(userPrompt)) / 1_000_000) * OPUS_INPUT_USD_PER_MTOKEN +
    ((outputTokens ?? estimateTokens(body)) / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOKEN;

  console.log(
    `[Whiteboard Pass1] END paper=${args.paperHash.slice(0, 10)} ` +
      `body=${body.length}ch tools=${toolUseCount} ` +
      `tokens(in=${inputTokens ?? '?'}, out=${outputTokens ?? '?'}) ` +
      `cost=$${costUsd.toFixed(3)} t=${latencyMs}ms`,
  );

  return {
    understanding: body,
    costUsd,
    latencyMs,
    inputTokens,
    outputTokens,
    purposeAnchor: args.purposeAnchor,
  };
}

function buildPass1Prompt(args: {
  indexPath: string;
  content: string;
  digestText: string;
  purposeAnchor?: string;
}): string {
  const parts: string[] = [];
  parts.push(
    `You have a per-paper index folder at "${args.indexPath}". The paper text is in "${args.indexPath}/content.md" (also pasted below for direct reading). Use \`Grep\` on content.md to verify any specific phrase before quoting it; otherwise rely on the inline text.`,
  );
  if (args.purposeAnchor && args.purposeAnchor.trim().length > 0) {
    parts.push(`<reader_purpose>\n${args.purposeAnchor.trim()}\n</reader_purpose>`);
  }
  if (args.digestText.length > 0) {
    parts.push(`<paper_digest>\n${args.digestText}\n</paper_digest>`);
  }
  parts.push(`<paper_content>\n${args.content}\n</paper_content>`);
  parts.push(
    `Now produce the structured-but-loose markdown understanding document described in the system prompt. Begin directly — no preamble.`,
  );
  return parts.join('\n\n');
}

// --------------------------------------------------------------------
// Pass 2 — RENDER
// --------------------------------------------------------------------

export async function runPass2(args: RunPass2Args): Promise<Pass2Result> {
  const t0 = Date.now();
  const cwd = safeCwd(args.indexPath);
  const pathToClaudeCodeExecutable = resolveClaudeExecutablePath() ?? undefined;

  console.log(
    `[Whiteboard Pass2] BEGIN paper=${args.paperHash.slice(0, 10)} ` +
      `level=${args.level} ${args.parentNodeId ? `parent=${args.parentNodeId} ` : ''}` +
      `understanding=${args.understanding.length}ch`,
  );

  const userPrompt = buildPass2Prompt(args);

  // Pass 2 uses Opus 4.7 — same model as Pass 1 — for consistent quality
  // across both passes. Sonnet was the AI Scientist's cost-optimisation
  // recommendation (~3× cheaper for "just constrained JSON generation"),
  // but the user overrode that 2026-04-25: "You should have been using
  // Opus 4.7." A diagram is the user's mental-model substitute for the
  // paper; quality consistency between Pass 1 (understanding) and Pass 2
  // (rendering) matters more than the per-call cost saving. Net cost
  // bumps from ~$1.50 to ~$1.90 per paper for first-time generation.
  const q = query({
    prompt: userPrompt,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PASS2_SYSTEM },
      model: 'claude-opus-4-7',
      // Glob is permitted so the model can confirm which
      // `images/page-NNN-fig-K.png` figure files actually exist before
      // committing a figure_ref. No Read, no WebSearch — Pass 2 is
      // still constrained-generation, just with one cheap escape hatch.
      allowedTools: ['Glob'],
      additionalDirectories: [args.indexPath],
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      abortController: args.abortController,
      cwd,
      pathToClaudeCodeExecutable,
      // 6 turns leaves room for one Glob hop + retries on bad JSON.
      maxTurns: 6,
    },
  });

  let raw = '';
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cachedPrefixHit = false;

  for await (const msg of q) {
    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        raw += event.delta.text;
        args.onProgress?.(event.delta.text);
      }
    } else if (msg.type === 'assistant') {
      const usage = (msg.message as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      }).usage;
      if (usage) {
        if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens;
        if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens;
        if (
          typeof usage.cache_read_input_tokens === 'number' &&
          usage.cache_read_input_tokens > 0
        ) {
          cachedPrefixHit = true;
        }
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution') {
        if (raw.length === 0) {
          throw new Error(`Whiteboard Pass 2 failed: ${msg.subtype}`);
        }
        console.warn(`[Whiteboard Pass2] ${msg.subtype}; returning partial body of ${raw.length} chars`);
      }
      const usageR = (msg as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      }).usage;
      if (usageR) {
        if (typeof usageR.input_tokens === 'number') inputTokens = usageR.input_tokens;
        if (typeof usageR.output_tokens === 'number') outputTokens = usageR.output_tokens;
        if (
          typeof usageR.cache_read_input_tokens === 'number' &&
          usageR.cache_read_input_tokens > 0
        ) {
          cachedPrefixHit = true;
        }
      }
    }
  }

  const latencyMs = Date.now() - t0;
  // Cost: cached input tokens are 10% the regular Sonnet input rate
  // when the prefix matches. Output is full price. We can only attest
  // to a hit when the SDK reported `cache_read_input_tokens > 0`; for
  // safety we assume non-cached pricing and note the discount when
  // the SDK confirms it.
  const inTokensEst = inputTokens ?? estimateTokens(userPrompt);
  const outTokensEst = outputTokens ?? estimateTokens(raw);
  const inputCost = cachedPrefixHit
    ? (inTokensEst / 1_000_000) * SONNET_INPUT_USD_PER_MTOKEN * CACHE_DISCOUNT
    : (inTokensEst / 1_000_000) * SONNET_INPUT_USD_PER_MTOKEN;
  const costUsd = inputCost + (outTokensEst / 1_000_000) * SONNET_OUTPUT_USD_PER_MTOKEN;

  console.log(
    `[Whiteboard Pass2] END paper=${args.paperHash.slice(0, 10)} ` +
      `level=${args.level} body=${raw.length}ch ` +
      `tokens(in=${inputTokens ?? '?'}, out=${outputTokens ?? '?'}) ` +
      `cache=${cachedPrefixHit ? 'HIT' : 'miss'} ` +
      `cost=$${costUsd.toFixed(4)} t=${latencyMs}ms`,
  );

  return { raw, costUsd, latencyMs, inputTokens, outputTokens, cachedPrefixHit };
}

function buildPass2Prompt(args: RunPass2Args): string {
  const parts: string[] = [];
  parts.push(`<pass1_understanding>\n${args.understanding}\n</pass1_understanding>`);
  parts.push(`<render_request>\n${args.renderRequest}\n</render_request>`);
  if (args.level === 2 && args.parentNodeId) {
    parts.push(
      `Render the Level 2 diagram for the Level 1 node with id "${args.parentNodeId}". Show its interior — the components inside it. Use sub-ids like "${args.parentNodeId}.1", "${args.parentNodeId}.2", etc. Set "parent": "${args.parentNodeId}" on the diagram object so the renderer can draw the parent-frame outline.`,
    );
  } else {
    parts.push(
      `Render the Level 1 diagram from the "Suggested Level 1 diagram" section of the understanding doc. ≤ 5 nodes. Set "level": 1.`,
    );
  }
  parts.push(`Output ONLY the JSON object inside a \`\`\`json fence — no surrounding prose.`);
  return parts.join('\n\n');
}

// --------------------------------------------------------------------
// Pass 2.5 — VISUAL CRITIQUE
// --------------------------------------------------------------------
//
// "AI agents that produce visual artefacts must see-and-iterate." After
// Pass 2 emits a WBDiagram and the renderer rasterises it to a PNG via
// `exportToCanvas`, we ask Opus 4.7 to LOOK at the PNG and check it
// against the layout rules:
//   - text inside boxes (no overflow)
//   - arrows don't cross nodes
//   - figure embeds resolve (no broken-image placeholders)
//   - 5-node ceiling honoured
//   - drillable nodes show ⌖ glyph + dashed border
// If everything passes → {ok: true}. If something is wrong → either a
// patch (typed ops list to apply locally) or a fresh WBDiagram. The
// renderer caps iteration at 3 to avoid thrashing.
//
// Why Read tool instead of inline image content blocks: Opus's `Read`
// tool natively handles PNGs (CLAUDE.md §6 — same trick the lens uses
// for the zoom image). The renderer writes the PNG to a known path
// inside the sidecar, the prompt names that path, the model calls
// Read once. Avoids threading base64 image bytes through IPC and
// matches the pattern the rest of Fathom uses for visual grounding.

const PASS25_SYSTEM = `You are a visual layout reviewer for Fathom whiteboard diagrams. You see a rendered PNG of a hand-drawn diagram and the JSON it was rendered from. You enforce a small set of layout rules and emit either {"ok": true} or a fix.

Rules (HARD — any violation requires a fix):
  1. **Text fits inside its box.** Every node's label and summary must be entirely INSIDE the rounded rectangle. No overflow, no clipping at the box edge, no overlap with sibling boxes.
  2. **Arrows don't cross node geometry.** Edges between nodes route AROUND nodes, never through them. Clipping the source/target box at the entry/exit point is fine; cutting through a third node is not.
  3. **No orphan placeholders.** If you see dashed empty rectangles WITHOUT any real-content node painted on top of them, the skeleton wasn't torn down — that's a fix.
  4. **Drillable nodes have ⌖ glyph.** Any node with \`drillable: true\` in the JSON must have a small ⌖ glyph visible near its bottom-right corner AND a dashed inner border. Solid borders + no glyph means drillable wasn't honoured.
  5. **Figure embeds resolve.** If the JSON has \`figure_ref\` on a node, you should see an actual cropped figure PNG embedded next to that node — not a grey "image missing" placeholder.
  6. **≤5 nodes per diagram.** If you count more than 5 rectangles in the diagram, that's a fix (the parser should have trimmed; if rendered, it's a bug).

Output ONE JSON object, no prose, in a \`\`\`json fence:

\`\`\`json
{ "ok": true }                        // diagram passes; ship as-is
\`\`\`

OR

\`\`\`json
{
  "fix": "patch",
  "ops": [
    { "op": "shorten_summary", "node_id": "L1.2", "to": "≤25 words new summary" },
    { "op": "rename_label", "node_id": "L1.3", "to": "≤24 chars" },
    { "op": "drop_node", "node_id": "L1.6" },
    { "op": "drop_edge", "from": "L1.1", "to": "L1.4" },
    { "op": "set_drillable", "node_id": "L1.2", "drillable": true }
  ],
  "reason": "one-sentence explanation of what was wrong"
}
\`\`\`

OR (if patching can't fix it — most rare):

\`\`\`json
{
  "fix": "replace",
  "diagram": { ...complete WBDiagram with the same shape Pass 2 emits... },
  "reason": "one-sentence explanation"
}
\`\`\`

You can call \`Read\` on the PNG path the prompt gives you to see the rendered diagram. You may call it multiple times if you want to zoom or re-check; usage is metered.

Be conservative. Most renders pass. Only emit a fix when a real rule violation is visible. NEVER fix on aesthetic preference — these rules are the bar, not "could look prettier".`;

export interface Pass25CritiqueOk {
  ok: true;
}

export interface Pass25Patch {
  op:
    | 'shorten_summary'
    | 'rename_label'
    | 'drop_node'
    | 'drop_edge'
    | 'set_drillable'
    | 'set_figure_ref';
  /** Target node id for ops that take one. */
  node_id?: string;
  /** New value for shorten_summary / rename_label. */
  to?: string;
  /** drop_edge: edge endpoints. */
  from?: string;
  /** set_drillable: target value. */
  drillable?: boolean;
  /** set_figure_ref: target page+figure. */
  figure_ref?: { page: number; figure: number };
}

export interface Pass25CritiquePatch {
  fix: 'patch';
  ops: Pass25Patch[];
  reason: string;
}

export interface Pass25CritiqueReplace {
  fix: 'replace';
  diagram: unknown; // shape-checked by parseWBDiagram on the renderer side
  reason: string;
}

export type Pass25Critique = Pass25CritiqueOk | Pass25CritiquePatch | Pass25CritiqueReplace;

export interface Pass25Result {
  raw: string;
  costUsd: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Parsed verdict; null on parse failure (treated as ok=true to avoid
   * blocking the user on a critique parse bug). */
  verdict: Pass25Critique | null;
}

export interface RunPass25Args {
  paperHash: string;
  indexPath: string;
  /** The current WBDiagram (after any prior patch iterations) being
   * critiqued, serialised as a JSON string for inlining in the prompt. */
  diagramJson: string;
  /** Absolute path to the PNG render the model should `Read`. Lives in
   * the sidecar so Read's per-paper allowlist permits access. */
  renderedPngPath: string;
  /** Iteration index (1, 2, or 3). Threaded into the log line + into
   * the prompt so the model sees what it tried before. */
  iteration: number;
  abortController?: AbortController;
}

export async function runPass25Critique(args: RunPass25Args): Promise<Pass25Result> {
  const t0 = Date.now();
  const cwd = safeCwd(args.indexPath);
  const pathToClaudeCodeExecutable = resolveClaudeExecutablePath() ?? undefined;

  console.log(
    `[Whiteboard Pass2.5] BEGIN paper=${args.paperHash.slice(0, 10)} ` +
      `iter=${args.iteration} png=${args.renderedPngPath.split('/').pop()}`,
  );

  const userPrompt = [
    `<rendered_diagram_path>${args.renderedPngPath}</rendered_diagram_path>`,
    `<current_diagram_json>\n${args.diagramJson}\n</current_diagram_json>`,
    `Iteration ${args.iteration} of at most 3. Read the rendered diagram PNG, check it against the rules in your system prompt, and emit ONE JSON object inside a \`\`\`json fence — either {"ok": true} or a fix object. No prose.`,
  ].join('\n\n');

  const q = query({
    prompt: userPrompt,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PASS25_SYSTEM },
      model: 'claude-opus-4-7',
      // Read is the only tool — for the rendered PNG. No Glob, no
      // WebSearch, no Bash. Sidecar dir is added so Read's per-paper
      // permission allows the rendered-PNG path.
      allowedTools: ['Read'],
      additionalDirectories: [args.indexPath],
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      abortController: args.abortController,
      cwd,
      pathToClaudeCodeExecutable,
      // 4 turns: read the PNG, optionally re-read for a closer look,
      // emit the verdict.
      maxTurns: 4,
    },
  });

  let raw = '';
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cachedPrefixHit = false;

  for await (const msg of q) {
    if (msg.type === 'stream_event') {
      const event = msg.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        raw += event.delta.text;
      }
    } else if (msg.type === 'assistant') {
      const usage = (msg.message as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      }).usage;
      if (usage) {
        if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens;
        if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens;
        if (typeof usage.cache_read_input_tokens === 'number' && usage.cache_read_input_tokens > 0) {
          cachedPrefixHit = true;
        }
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution') {
        if (raw.length === 0) {
          throw new Error(`Whiteboard Pass 2.5 failed: ${msg.subtype}`);
        }
      }
      const usageR = (msg as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      }).usage;
      if (usageR) {
        if (typeof usageR.input_tokens === 'number') inputTokens = usageR.input_tokens;
        if (typeof usageR.output_tokens === 'number') outputTokens = usageR.output_tokens;
        if (typeof usageR.cache_read_input_tokens === 'number' && usageR.cache_read_input_tokens > 0) {
          cachedPrefixHit = true;
        }
      }
    }
  }

  const latencyMs = Date.now() - t0;
  const inTokensEst = inputTokens ?? estimateTokens(userPrompt);
  const outTokensEst = outputTokens ?? estimateTokens(raw);
  const inputCost = cachedPrefixHit
    ? (inTokensEst / 1_000_000) * OPUS_INPUT_USD_PER_MTOKEN * CACHE_DISCOUNT
    : (inTokensEst / 1_000_000) * OPUS_INPUT_USD_PER_MTOKEN;
  const costUsd = inputCost + (outTokensEst / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOKEN;

  const verdict = parseCritiqueVerdict(raw);
  console.log(
    `[Whiteboard Pass2.5] END paper=${args.paperHash.slice(0, 10)} iter=${args.iteration} ` +
      `verdict=${verdict ? ('ok' in verdict ? 'OK' : verdict.fix) : 'unparseable→OK'} ` +
      `tokens(in=${inputTokens ?? '?'}, out=${outputTokens ?? '?'}) cost=$${costUsd.toFixed(4)} t=${latencyMs}ms`,
  );

  return { raw, costUsd, latencyMs, inputTokens, outputTokens, verdict };
}

function parseCritiqueVerdict(raw: string): Pass25Critique | null {
  const fence = /```json\s*([\s\S]*?)```/i.exec(raw);
  const body = fence ? fence[1] : raw;
  try {
    const parsed = JSON.parse(body.trim()) as Record<string, unknown>;
    if (parsed.ok === true) return { ok: true };
    if (parsed.fix === 'patch' && Array.isArray(parsed.ops)) {
      return {
        fix: 'patch',
        ops: parsed.ops as Pass25Patch[],
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      };
    }
    if (parsed.fix === 'replace' && parsed.diagram) {
      return {
        fix: 'replace',
        diagram: parsed.diagram,
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// --------------------------------------------------------------------
// Soft verifier — background grep-check of inline citations
// --------------------------------------------------------------------

/**
 * Extract every `[p.N]: "quote"` or `[p.N] "quote"` citation from the
 * Pass 1 markdown and grep-verify each against `content.md`.
 *
 * Trigram overlap is the score: ≥0.85 = verified; ≥0.50 = soft;
 * <0.50 = unverified. The verifier never mutates the diagram — it
 * just writes `whiteboard-issues.json`.
 */
export async function runVerifier(args: {
  paperHash: string;
  indexPath: string;
  understanding: string;
}): Promise<VerifierResult> {
  const t0 = Date.now();
  const contentPath = join(args.indexPath, 'content.md');
  if (!existsSync(contentPath)) {
    console.warn(`[Whiteboard Verifier] no content.md at ${contentPath}; skipping verification`);
    return { issues: [], verificationRate: 1, quoteStatus: {} };
  }
  const content = await readFile(contentPath, 'utf-8');
  const normalisedContent = normalise(content);

  const citations = extractCitations(args.understanding);
  console.log(
    `[Whiteboard Verifier] BEGIN paper=${args.paperHash.slice(0, 10)} ` +
      `quotes=${citations.length}`,
  );

  const issues: VerifierIssue[] = [];
  const quoteStatus: Record<string, VerifierIssue> = {};

  for (const c of citations) {
    const target = normalise(c.quote);
    if (target.length < 8) {
      // Too short to score reliably — assume verified rather than
      // peppering the doc with question marks on bare words.
      const issue: VerifierIssue = {
        page: c.page,
        quote: c.quote,
        score: 1,
        status: 'verified',
        closest: c.quote,
      };
      issues.push(issue);
      quoteStatus[c.quote] = issue;
      continue;
    }
    const { score, closest } = bestTrigramOverlap(target, normalisedContent);
    const status: VerifierIssue['status'] =
      score >= 0.85 ? 'verified' : score >= 0.5 ? 'soft' : 'unverified';
    const issue: VerifierIssue = {
      page: c.page,
      quote: c.quote,
      score,
      status,
      closest: closest.length > 240 ? closest.slice(0, 240) + '…' : closest,
    };
    issues.push(issue);
    quoteStatus[c.quote] = issue;
  }

  const verifiedCount = issues.filter((i) => i.status === 'verified').length;
  const verificationRate = issues.length > 0 ? verifiedCount / issues.length : 1;

  // Persist results so the user can inspect them via Finder if a
  // citation marker shows the unverified affordance.
  const issuesPath = join(args.indexPath, WB_ISSUES_FILE);
  await mkdir(dirname(issuesPath), { recursive: true });
  await writeFile(
    issuesPath,
    JSON.stringify({ paperHash: args.paperHash, generatedAt: new Date().toISOString(), verificationRate, issues }, null, 2),
    'utf-8',
  );

  console.log(
    `[Whiteboard Verifier] END paper=${args.paperHash.slice(0, 10)} ` +
      `verified=${verifiedCount}/${issues.length} (${(verificationRate * 100).toFixed(0)}%) ` +
      `t=${Date.now() - t0}ms`,
  );

  return { issues, verificationRate, quoteStatus };
}

interface ExtractedCitation {
  page: number;
  quote: string;
}

/** Pull `[p.N]: "quote"`, `[p.N] "quote"`, and `[p.N]: 'quote'` out
 * of a markdown body. Tolerant to alternate quote chars and the
 * presence/absence of the colon. */
function extractCitations(md: string): ExtractedCitation[] {
  const out: ExtractedCitation[] = [];
  // Pattern: [p.N] optional colon, then a quoted string in " or '.
  const re = /\[p\.\s*(\d+)\]\s*:?\s*["“'‘]([^"”'’]{4,400})["”'’]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(md)) !== null) {
    const page = parseInt(match[1], 10);
    const quote = match[2].trim();
    if (Number.isFinite(page) && page > 0 && quote.length > 0) {
      out.push({ page, quote });
    }
  }
  return out;
}

function normalise(s: string): string {
  // Lowercase, collapse whitespace, strip punctuation. Aggressive on
  // purpose — we're matching paraphrased / re-typed quotes, not byte-
  // exact substrings.
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best trigram overlap between `target` and any window of the same
 * length within `content`. Returns the score (0..1) and the matched
 * passage substring at the best window. */
function bestTrigramOverlap(target: string, content: string): { score: number; closest: string } {
  const targetGrams = trigrams(target);
  if (targetGrams.size === 0) return { score: 0, closest: '' };

  // Slide a window of `target.length` over content. Step by half the
  // window for performance; trigram overlap is robust to alignment
  // shifts of a few words.
  const winLen = Math.max(target.length, 24);
  const step = Math.max(8, Math.floor(winLen / 4));
  let bestScore = 0;
  let bestStart = -1;
  for (let i = 0; i + winLen <= content.length; i += step) {
    const window = content.slice(i, i + winLen);
    const winGrams = trigrams(window);
    const intersection = countIntersect(targetGrams, winGrams);
    const score = intersection / targetGrams.size;
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
    // Early exit on a clean match.
    if (bestScore >= 0.95) break;
  }
  // Also try a tail window in case the loop's step missed it.
  if (content.length >= winLen) {
    const tail = content.slice(content.length - winLen);
    const tailScore = countIntersect(targetGrams, trigrams(tail)) / targetGrams.size;
    if (tailScore > bestScore) {
      bestScore = tailScore;
      bestStart = content.length - winLen;
    }
  }

  const closest =
    bestStart >= 0 ? content.slice(bestStart, bestStart + winLen) : '';
  return { score: bestScore, closest };
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

function countIntersect<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/** Rough token estimate for cost reporting when the SDK didn't surface
 * usage. ~4 chars/token is the standard Anthropic rule of thumb. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
