import { homedir } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { resolveClaudeExecutablePath } from '../claudeCheck';
import { runAgentSession } from './_agent-runner';

/**
 * Pick a cwd that is guaranteed to be:
 *   1. a real directory (Claude Agent SDK spawns subprocesses; an
 *      ENOTDIR cwd kills the whole pipeline),
 *   2. NOT under `~/Desktop`, `~/Documents`, or `~/Downloads` —
 *      macOS TCC prompts the user the first time any subprocess
 *      reads those paths, even just to enumerate the cwd, and we
 *      never want Fathom to pop a system permission dialog mid-
 *      question. The only legitimate `cwd` for the explain
 *      subprocess is the per-paper sidecar inside `userData` (TCC
 *      doesn't apply there).
 *
 * Order: caller-preferred path (validated) → homedir (`/Users/me`,
 * which is itself fine for TCC even if its subdirs aren't).
 */
function safeCwd(preferred?: string): string {
  if (preferred) {
    if (isTccProtected(preferred)) {
      console.warn(
        `[safeCwd] refusing TCC-protected preferred path "${preferred}" — falling back`,
      );
    } else {
      try {
        if (existsSync(preferred) && statSync(preferred).isDirectory()) return preferred;
      } catch {
        /* fall through to homedir */
      }
    }
  }
  return homedir();
}

/** True iff the path lives under a macOS TCC-protected user folder
 * (Desktop / Documents / Downloads). Used to keep `cwd` away from
 * directories that would prompt the user on first access. */
function isTccProtected(p: string): boolean {
  const home = homedir();
  const protectedPrefixes = [
    `${home}/Desktop`,
    `${home}/Documents`,
    `${home}/Downloads`,
  ];
  return protectedPrefixes.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

export interface ExplainArgs {
  /** Original text from the PDF that the user wants clarified. */
  regionText: string;
  /** Optional focus — a sub-phrase the user is drilling into. */
  focusPhrase?: string;
  /** Cached "paper digest" — title, abstract, section index, glossary. */
  paperDigest?: string;
  /** Full paper text for grounding (sent as cached prefix when supported). */
  paperText?: string;
  /** Prior explanations of this region, in chronological order. */
  priorExplanations?: Array<{ depth: number; body: string; focusPhrase?: string | null }>;
  /** Current depth — 1 = first elaboration, 2+ = drill-deeper. */
  depth: number;
  /** Optional user-supplied instruction — what they want to learn specifically about this passage. */
  customInstruction?: string;
  /** Absolute path to the source PDF on disk — when present, Claude will be allowed to Read it
   * for richer context (figures, equations, layout). */
  pdfPath?: string;
  /** Page number the focused passage is on (1-based). Used to scope Claude's PDF read. */
  page?: number;
  /** Absolute path to the per-paper index folder (pages/, sections/, references.txt, digest.json,
   * MANIFEST.md). Claude can freely Read/Grep/Glob inside it. Much cheaper than PDF Read. */
  indexPath?: string;
  /** Absolute path to the saved zoom image — ground truth for what the user sees. */
  zoomImagePath?: string;
  /** PDF user-space bbox of the zoom target (for precise localization). */
  regionBbox?: { x: number; y: number; width: number; height: number };
  /** User-configured folders Claude may Read/Grep/Glob in addition to the paper. */
  extraDirectories?: string[];
  /** User's free-form standing instruction from Preferences, appended to the prompt. */
  customInstructions?: string;
  /** If set, resume this Agent SDK session instead of starting a fresh one.
   * Used to keep every Ask inside the same lens in a single conversation
   * so Claude has full history without re-sending it in each prompt. */
  resumeSessionId?: string;
  abortController?: AbortController;
  onDelta: (text: string) => void;
  /** Optional status stream for tool calls and thinking, shown collapsed in the UI so the
   * user sees activity during the long wait before the main answer arrives. */
  onProgress?: (text: string) => void;
  /** Fired once with the full user prompt right before streaming starts — useful for a
   * "▸ prompt sent to Claude" debug panel in the UI. */
  onPromptSent?: (prompt: string) => void;
  /** Fired once with the Agent SDK session_id after it's available. The
   * renderer saves this onto the FocusedLens so subsequent Asks in the
   * same lens can resume the conversation. */
  onSessionId?: (sessionId: string) => void;
}

const SYSTEM_PROMPT = `You are the AI scientist inside a PDF reader called Lens. A curious, technical reader has pinch-zoomed on a passage in a research paper (or selected a phrase inside a previous explanation of yours) because they want to *learn more*. Your job is to turn that zoom into real understanding.

Treat every call as: "Dive in. Tell me what's actually going on here — the mechanism, the motivation, the math that matters, what to walk away knowing." Never paraphrase. Never hedge. Don't pad.

# Quality is the product

This explanation is the entire value the reader gets. You are competing with them opening ChatGPT in a side window. Beat that. Specifically:

1. **Ground everything in this paper.** You have a per-paper index folder and, when needed, the source PDF. Before answering, at minimum:
   - \`Grep\` \`<indexPath>/content.md\` to resolve any citation like \`[76]\`, any symbol, any section reference that appears in the passage. The references section is inline in content.md, so \`Grep "^\\\\[76\\\\]"\` or \`Grep "\\\\[76\\\\]"\` will land on it.
   - \`Read\` \`<indexPath>/images/page-NNN.png\` when a figure, equation rendering, or table matters — text extraction often drops those.
   - If \`digest.json\` is present, use it for a structured section/figure map.
   Cite specific pages in your answer ("on p. 4 the authors define…"). Never speculate at what a citation number refers to — grep for it or WebSearch.

2. **Frame components as answers to the paper's ground problem — never as standalone parts.** Whenever you name a module, mechanism, equation, sub-system, block, layer, or component from the paper, you MUST tie it to a specific question that traces back to the paper's GROUND PROBLEM (the end-goal the paper is solving, in the reader's vocabulary, NOT in the paper's own machinery). The reader is oriented toward how everything connects to the ground problem, not toward how the parts interconnect with each other.

   **Step 0 — derive the ground-problem sentence.** Before listing any component, derive ONE plain-English sentence stating what real-world problem this paper solves. Pull it from the digest's title + abstract (provided in the prompt as \`<paper_digest>\`) or from \`<indexPath>/content.md\` intro / abstract / contributions. Examples (in the reader's vocabulary, not the paper's machinery):
     - ReconViaGen → *"Given N RGB photos of an object, produce a textured 3D mesh that looks correct from every viewpoint."* NOT *"a coarse-to-fine reconstruction-conditioned 3D diffusion pipeline."*
     - DINOv2 → *"Train a vision encoder once, on unlabelled images, that beats supervised baselines on every downstream task without fine-tuning."* NOT *"self-supervised learning with masked image modelling."*
     - Mamba → *"Run sequence models on long contexts (1M+ tokens) without the O(n²) attention cost."* NOT *"selective state-space models with hardware-aware parallel scan."*
   When the explanation has multiple components, declare the ground-problem sentence ONCE near the top (one short line, italicised), then frame each component below it as an answer to a question that terminates at that ground problem.

   **For each named component, surface the question it answers.** Format: name the component, then "→ <question>". The question must terminate at the ground problem, NOT at another component. Component-to-component questions like "→ how does this feed the encoder?" are NOT acceptable.
     - WRONG (no question): "Cross-attention to DINOv3 patches predicts 3D point clouds and per-view tokens."
     - WRONG (component-to-component question): "Cross-attention to DINOv3 patches → how does it interact with the encoder?"
     - RIGHT (ground-problem-anchored): "Cross-attention to DINOv3 patches → *what does this 3D point look like in each photo?* (which is what the paper needs to solve view-consistent 3D reconstruction)."

   **Multi-component explanations: each component gets its own arrow.** Don't bundle multiple components under one sentence. Each one earns a separate "→ <question>" line so the reader sees, component-by-component, how each piece advances the ground problem. Worked example for ReconViaGen (ground problem: *"Given N RGB photos of an object, produce a textured 3D mesh that looks correct from every viewpoint."*):
     - VGGT (LoRA-tuned) → *what global geometry can we infer across all N views?*
     - Condition Net → *what per-view geometry tokens do downstream blocks need?*
     - Sparse self-attention → *how does this 3D point relate to its neighbours? Which view should I trust here?*
     - Cross-attention to DINOv3 patches → *what does this 3D point look like in each photo?*
     - SLAT Flow + RVC → *what does each voxel actually look like, in colour and texture?*
     - Final 3D mesh → *does the mesh re-render to match the input views? if not, correct.*
   None of those questions name another component. Every one terminates at the reconstruction goal.

   This rule composes with rule 1 (grounding) — derive the ground problem from the paper, don't invent it. It does not replace rules 3+ (diagram, math, length) — it sharpens HOW you write the explanation, not whether you write one.

3. **Default to including a diagram.** Research-paper passages almost always describe a structure, pipeline, loop, module composition, or relationship that is clearer as a picture. Unless the passage is literally a single definition, a bare citation, or a one-line observation, include **exactly one** inline SVG diagram in your answer. Do NOT use Mermaid, do NOT use ASCII art, do NOT use Markdown pseudo-diagrams. Real SVG, rendered inline.

   **Output order:** one short setup sentence, *then* the SVG, *then* the details. This lets the reader see text while the diagram is still generating. Stream order matters.

   Emit the SVG inside a \`\`\`svg\`\`\` fenced code block. The viewer renders it as a real diagram. Example shape:

   \`\`\`svg
   <svg viewBox="0 0 360 140" xmlns="http://www.w3.org/2000/svg" font-family="Excalifont, Noteworthy, sans-serif" font-size="12">
     <rect x="10" y="40" width="80" height="50" rx="10" fill="#fff" stroke="#333" stroke-width="1.5"/>
     <text x="50" y="70" text-anchor="middle">Input</text>
     <path d="M 95 65 L 140 65" stroke="#333" stroke-width="1.5" marker-end="url(#arrow)"/>
     <rect x="145" y="40" width="90" height="50" rx="10" fill="#fff8ea" stroke="#b06b1c" stroke-width="1.5"/>
     <text x="190" y="70" text-anchor="middle">SC-VAE</text>
     <path d="M 240 65 L 285 65" stroke="#333" stroke-width="1.5" marker-end="url(#arrow)"/>
     <rect x="290" y="40" width="60" height="50" rx="10" fill="#fff" stroke="#333" stroke-width="1.5"/>
     <text x="320" y="70" text-anchor="middle">latent</text>
     <defs>
       <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#333"/></marker>
     </defs>
   </svg>
   \`\`\`

   Aim for a hand-drawn, Excalidraw-like feel: rounded rects, stroke-width 1.5, simple arrowheads, warm beige fill for the thing being explained (\`#fff8ea\`). Label components with short nouns. Never draw an ASCII/text diagram or a Mermaid block — they won't render.

4. **Use real math.** For equations use \`$…$\` (inline) and \`$$…$$\` (display) — KaTeX renders them. Define every symbol.

5. **Be specific.** Mention page numbers, equation numbers, figure numbers by reference. Quote short snippets if they sharpen the explanation.

6. **Length discipline.** 2–4 tight paragraphs, or a focused list, plus one SVG diagram at most. Trim until every sentence earns its keep.

7. **Begin with substance.** No "Here is an explanation". No "Sure!". No "Of course.". First sentence states the single most useful idea.

# Tool use — be decisive, not ceremonial

You have the full toolbox. Use it when it actually changes your answer:
- **Grep over \`<indexPath>/pages/\`** — for "what does citation [N] refer to", "where is symbol X first defined", "does the paper mention Y".
- **Read \`<indexPath>/pages/page-NN.txt\`** — for the full text of a specific page when you need neighboring sentences.
- **WebSearch / WebFetch** — for external references, definitions the paper assumes you know, or to disambiguate a citation.
- **Read \`<indexPath>/source.pdf\` with \`pages: "N"\`** — only when text extraction isn't enough and you need to see figure pixels.

Speculating when you could have grepped is a failure mode. So is wasting turns on unnecessary reads. Pick the shortest path to a grounded answer.

# The edge cases

- If the passage is just a citation or a bare reference, resolve the citation (Grep the index, WebSearch the title) and give one sentence on what that reference is.
- If the passage doesn't make sense on its own (cut-off sentence, caption fragment), Read nearby pages to reconstruct what the reader actually pinched on.
- If you hit a tool failure, fall back to the digest / paper_text in the prompt, and say clearly what you couldn't verify.`;

export async function explain(args: ExplainArgs): Promise<string> {
  const userPrompt = buildUserPrompt(args);

  // Claude gets a proper toolbox: Read/Grep/Glob for navigating the on-disk index,
  // WebSearch/WebFetch for resolving references or external context, and Read on the
  // source PDF for figure pixels when strictly needed.
  const allowedTools = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
  const additionalDirectoriesSet = new Set<string>();
  // The indexPath sidecar contains everything Claude needs: content.md
  // (full paper text, page-tagged), images/page-NNN-fig-K.png (cropped
  // figures), digest.json (sections + glossary), AND now `source.pdf`
  // (the original PDF copied at index time by `ensureIndexDir`). One
  // grounding directory, no TCC prompts (sidecar lives in userData),
  // direct Read on the PDF still works via `<indexPath>/source.pdf`.
  // Per user 2026-04-26: "copy the PDF to the sidecar so that we have
  // access to the PDF" — implemented in main/index.ts ensureIndexDir.
  // Replaces the prior `dirname(pdfPath)` plumbing which leaked the
  // user's Desktop into Claude Code's authorization scope.
  if (args.indexPath) additionalDirectoriesSet.add(args.indexPath);
  const additionalDirectories =
    additionalDirectoriesSet.size > 0 ? Array.from(additionalDirectoriesSet) : undefined;

  const logId = Math.random().toString(36).slice(2, 8);
  console.log(
    `[Lens AI ${logId}] BEGIN explain — passage(${args.regionText.length}ch) instruction=${args.customInstruction ? JSON.stringify(args.customInstruction) : 'none'} pdf=${args.pdfPath ?? 'no'} page=${args.page ?? '?'} digest=${args.paperDigest ? `${args.paperDigest.length}ch` : 'no'} priorTurns=${args.priorExplanations?.length ?? 0}`,
  );
  console.log(`[Lens AI ${logId}] passage: ${args.regionText.slice(0, 300)}${args.regionText.length > 300 ? '…' : ''}`);
  args.onPromptSent?.(userPrompt);

  // Prefer the per-paper sidecar (always inside userData → no TCC).
  // Never fall through to `dirname(pdfPath)` — if the user keeps the
  // PDF on their Desktop, that dirname is exactly the path that
  // triggers the TCC prompt we're trying to avoid.
  const cwd = safeCwd(args.indexPath);
  const pathToClaudeCodeExecutable = resolveClaudeExecutablePath() ?? undefined;

  // Fold user-configured extra directories into additionalDirectories so
  // Claude can Read/Grep/Glob them during the explanation. Validated in the
  // caller (see explain:start IPC handler).
  if (args.extraDirectories && args.extraDirectories.length > 0) {
    for (const d of args.extraDirectories) additionalDirectoriesSet.add(d);
  }
  const mergedDirs =
    additionalDirectoriesSet.size > 0 ? Array.from(additionalDirectoriesSet) : undefined;

  console.log(
    `[Lens AI ${logId}] cwd=${cwd} claudeBin=${pathToClaudeCodeExecutable ?? 'sdk-default'} extraDirs=${args.extraDirectories?.length ?? 0}`,
  );

  const session = await runAgentSession({
    prompt: userPrompt,
    systemPrompt: SYSTEM_PROMPT,
    allowedTools,
    additionalDirectories: mergedDirs,
    includePartialMessages: true,
    abortController: args.abortController,
    cwd,
    pathToClaudeCodeExecutable,
    // If we're continuing a prior Ask in the same lens, resume the SDK
    // session so Claude has full conversation history without us having
    // to replay it in the prompt.
    resume: args.resumeSessionId,
    // Claude typically needs: (1) Read MANIFEST, (2-4) Grep/Read the index, (5) final
    // text output. Leave headroom for WebSearch and figure Reads.
    maxTurns: 24,
    onTextDelta: (chunk) => args.onDelta(chunk),
    onThinkingDelta: (chunk) => args.onProgress?.(chunk),
    onToolUse: (name, input) => {
      console.log(`[Lens AI ${logId}] tool_use: ${name}`, input);
      args.onProgress?.(formatToolUse(name, input));
    },
    onSessionId: (sid) => {
      console.log(
        `[Lens AI ${logId}] session_id=${sid}${args.resumeSessionId ? ' (resumed)' : ''}`,
      );
      args.onSessionId?.(sid);
    },
  });

  const full = session.responseText;
  const toolUseCount = session.toolUseCount;
  console.log(
    `[Lens AI ${logId}] result: ${session.resultSubtype ?? 'no-result'} (tools: ${toolUseCount})`,
  );
  // Don't discard the partial body if we ran out of turns or hit a soft error —
  // returning what we have is far better UX than wiping the answer.
  if (session.resultSubtype === 'error_max_turns') {
    console.warn(
      `[Lens AI ${logId}] hit max_turns; returning partial body of ${full.length} chars`,
    );
  } else if (session.resultSubtype === 'error_during_execution') {
    if (full.length === 0) throw new Error(`Agent SDK result error: ${session.resultSubtype}`);
    console.warn(`[Lens AI ${logId}] error_during_execution; returning partial body`);
  }
  console.log(`[Lens AI ${logId}] END explain — body(${full.length}ch)`);
  if (full.length > 0) {
    const tail = full.slice(-120);
    console.log(`[Lens AI ${logId}] body tail: …${tail}`);
  }
  return full;
}

// Short human-readable rendering of a tool invocation, shown to the user while they wait.
function formatToolUse(name: string, input: Record<string, unknown>): string {
  const pathLike = (input.file_path ?? input.path ?? input.pattern ?? input.query ?? '') as string;
  const truncated = typeof pathLike === 'string' && pathLike.length > 80
    ? '…' + pathLike.slice(-77)
    : pathLike;
  if (name === 'Read' && input.file_path) {
    const base = String(input.file_path).split('/').pop() ?? String(input.file_path);
    const pages = input.pages ? ` pages ${String(input.pages)}` : '';
    return `\n📖 Read ${base}${pages}\n`;
  }
  if (name === 'Grep') {
    const pat = String(input.pattern ?? '');
    const where = input.path ? ` in ${String(input.path).split('/').pop()}` : '';
    return `\n🔎 Grep "${pat}"${where}\n`;
  }
  if (name === 'Glob') {
    return `\n🗂 Glob ${String(input.pattern ?? '')}\n`;
  }
  if (name === 'WebSearch') {
    return `\n🌐 WebSearch "${String(input.query ?? '')}"\n`;
  }
  if (name === 'WebFetch') {
    return `\n🌐 WebFetch ${String(input.url ?? '')}\n`;
  }
  return `\n🔧 ${name}${truncated ? ` ${truncated}` : ''}\n`;
}

function buildUserPrompt(args: ExplainArgs): string {
  const parts: string[] = [];

  if (args.indexPath) {
    parts.push(
      `You have a per-paper index folder at absolute path "${args.indexPath}". Key files:

- "${args.indexPath}/content.md" — the FULL paper text in reading order. Page boundaries are marked by \`<!-- PAGE N -->\` comments and a \`## Page N\` heading; cropped figure references appear right after each page heading, e.g. \`![Figure 1 on page 3](./images/page-003-fig-1.png)\`.
- "${args.indexPath}/images/page-NNN-fig-K.png" — the actual cropped figure (not a full page). Read this when you need the figure's pixels.
- "${args.indexPath}/digest.json" — structured digest (sections, figures, glossary) if available.
- "${args.indexPath}/MANIFEST.md" — layout reference.

Grep content.md to resolve citations (e.g. \`Grep "\\\\[76\\\\]" content.md\`), locate symbols, find sections. Read a figure's PNG when the visual matters. Cite page and figure numbers in your reply.`,
    );
  }
  if (args.pdfPath && args.page !== undefined && !args.indexPath) {
    const start = Math.max(1, args.page - 1);
    const end = args.page + 1;
    const range = start === end ? `${args.page}` : `${start}-${end}`;
    parts.push(
      `You may Read the PDF at "${args.pdfPath}" with pages: "${range}" for visual layout/figures.`,
    );
  } else if (args.paperDigest) {
    parts.push(`<paper_digest>\n${args.paperDigest}\n</paper_digest>`);
  }
  if (args.paperText && !args.pdfPath && !args.indexPath) {
    parts.push(`<paper_text>\n${args.paperText}\n</paper_text>`);
  }
  if (args.zoomImagePath) {
    const bboxStr = args.regionBbox
      ? ` at PDF coordinates (x=${args.regionBbox.x.toFixed(1)}, y=${args.regionBbox.y.toFixed(1)}, w=${args.regionBbox.width.toFixed(1)}, h=${args.regionBbox.height.toFixed(1)})`
      : '';
    parts.push(
      `**Ground truth for what the user is looking at**: the exact crop they see is saved at "${args.zoomImagePath}"${args.page !== undefined ? `, from page ${args.page}` : ''}${bboxStr}. **Read this image first** before formulating your answer. If the extracted \`<passage>\` below disagrees with the image (e.g. extraction lumped columns, missed a caption, dropped math), trust the image.`,
    );
  }
  parts.push(`<passage>\n${args.regionText}\n</passage>`);
  if (args.page !== undefined && !args.zoomImagePath) {
    parts.push(`The passage above is on **page ${args.page}** of the paper.`);
  }

  if (args.focusPhrase) {
    parts.push(
      `The reader has zoomed in on this specific phrase within the passage; focus your clarification on it: "${args.focusPhrase}"`,
    );
  }

  if (args.priorExplanations && args.priorExplanations.length > 0) {
    const chain = args.priorExplanations
      .map((p, i) => `Prior explanation ${i + 1} (depth ${p.depth}):\n${p.body}`)
      .join('\n\n');
    parts.push(
      `You have already explained this passage to the reader. They are zooming in further to ask for a deeper or simpler explanation. Build on what was said before — do not repeat it. Make this iteration more concrete, more specific, or simpler than the previous ones.\n\n${chain}`,
    );
  }

  if (args.customInstruction) {
    parts.push(
      `The reader has a specific angle they want covered:\n"${args.customInstruction}"\n\nFocus on that, in the context of this passage.`,
    );
  } else if (args.priorExplanations && args.priorExplanations.length > 0) {
    parts.push(
      `Zoom in on the highlighted concept and explain it in detail — what it actually is, how it works, and why it matters for this paper.`,
    );
  } else {
    parts.push(
      `Zoom in on this passage. Explain the details — what's going on under the hood, what the key terms mean, and what the reader should walk away knowing.`,
    );
  }

  // User's standing instruction from Preferences — apply on top of everything.
  if (args.customInstructions && args.customInstructions.trim()) {
    parts.push(
      `Standing reader preference (applies to every explanation):\n${args.customInstructions.trim()}`,
    );
  }

  // Surface the extra grounding directories in the prompt itself so Claude
  // knows they exist — Agent SDK exposes them to the sandbox, but Claude
  // won't discover them without being told.
  if (args.extraDirectories && args.extraDirectories.length > 0) {
    const dirList = args.extraDirectories.map((d) => `- "${d}"`).join('\n');
    parts.push(
      `The reader has configured extra folders Fathom can search during this explanation. When they'd help (e.g. to find the source that implements this paper, or a related paper), use Read / Grep / Glob on them:\n${dirList}`,
    );
  }

  return parts.join('\n\n');
}
