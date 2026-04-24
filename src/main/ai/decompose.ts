import { query } from '@anthropic-ai/claude-agent-sdk';
import { homedir } from 'node:os';
import { existsSync, statSync } from 'node:fs';

/**
 * Build a structured digest of the paper from the on-disk index we've already
 * written to `<pdf>.fathom/`:
 *
 *   content.md            — full paper text in reading order, page boundaries
 *                           marked by `<!-- PAGE N -->` and `## Page N`,
 *                           figure references inline at the right page.
 *   images/page-NNN-fig-K.png — cropped figure PNGs, referenced from content.md.
 *
 * We deliberately DO NOT ask Claude to `Read` the raw PDF here. The old
 * approach did — which invoked the Agent SDK's PDF reader path and required
 * `poppler` (pdftoppm / pdftocairo) to be installed on the user's machine.
 * That's now a ghost dependency: every pixel Claude might want is already a
 * PNG we wrote with pdf.js during the renderer's `buildPaperIndex` pass, so
 * Read on a PNG is all that's needed.
 */
const DECOMPOSE_SYSTEM = `You index research papers for an in-place PDF reader. Your input is a pre-built per-paper index folder (content.md + cropped figure PNGs). Produce a compact, faithful JSON digest.`;

export interface PaperDigest {
  title?: string;
  authors?: string[];
  abstract?: string;
  sections?: Array<{ name: string; summary: string; pages?: number[] }>;
  figures?: Array<{ id?: string; page?: number; caption?: string; description?: string }>;
  equations?: Array<{ id?: string; page?: number; summary?: string }>;
  glossary?: Array<{ term: string; definition: string }>;
  /** If JSON parsing failed, keep the raw markdown body so downstream can still use it. */
  rawBody?: string;
}

function safeCwd(preferred?: string): string {
  if (preferred) {
    try {
      if (existsSync(preferred) && statSync(preferred).isDirectory()) return preferred;
    } catch {
      /* fall through */
    }
  }
  return homedir();
}

/**
 * Decompose the paper into a structured digest. Reads ONLY the per-paper
 * index folder — no raw PDF access, no poppler needed.
 */
export async function decomposePaper(
  indexPath: string,
  abortController?: AbortController,
): Promise<PaperDigest> {
  const prompt = `You have a pre-built index of this paper at "${indexPath}".

Files:
  - "${indexPath}/content.md" — the FULL paper text in reading order. Page boundaries are marked by \`<!-- PAGE N -->\` comments and \`## Page N\` headings. Figure references appear inline right after each page heading as markdown images, e.g. \`![Figure 1 on page 3](./images/page-003-fig-1.png)\`.
  - "${indexPath}/images/page-NNN-fig-K.png" — cropped figure PNGs. Read these when a figure's visual content matters for its description.

Steps:
  1. Read "${indexPath}/content.md" end-to-end.
  2. For each figure referenced in content.md, Read the corresponding PNG if a short visual description of the figure's content is load-bearing for the digest (otherwise the caption alone is enough).

Then output a single JSON object — no preamble, no trailing prose:

\`\`\`json
{
  "title": "...",
  "authors": ["..."],
  "abstract": "...",
  "sections": [
    { "name": "1. Introduction", "summary": "one sentence", "pages": [1, 2] }
  ],
  "figures": [
    { "id": "Figure 1", "page": 3, "caption": "...", "description": "one sentence about what the figure actually shows visually" }
  ],
  "equations": [
    { "id": "Eq. 2", "page": 4, "summary": "what it computes in plain English" }
  ],
  "glossary": [
    { "term": "self-attention", "definition": "one sentence" }
  ]
}
\`\`\`

Be faithful — only include items that actually appear in the paper. If a section has no figures or equations, omit those arrays. Keep descriptions under 30 words each.`;

  const cwd = safeCwd(indexPath);
  console.log(`[Lens Decompose] indexPath=${indexPath} cwd=${cwd}`);

  const q = query({
    prompt,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code', append: DECOMPOSE_SYSTEM },
      allowedTools: ['Read', 'Grep', 'Glob'],
      additionalDirectories: [indexPath],
      includePartialMessages: false,
      permissionMode: 'bypassPermissions',
      abortController,
      cwd,
      // One Read of content.md + ~a handful of figure PNGs + one JSON turn.
      // Large papers with many figures may need more; 16 is a comfortable ceiling.
      maxTurns: 16,
    },
  });

  let body = '';
  for await (const msg of q) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content ?? []) {
        if (block.type === 'text') body += block.text;
        if (block.type === 'tool_use') {
          console.log(`[Lens Decompose] tool_use: ${block.name}`, block.input);
        }
      }
    } else if (msg.type === 'result') {
      console.log(`[Lens Decompose] result:`, msg.subtype);
      if (msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution') {
        throw new Error(`Agent SDK decompose error: ${msg.subtype}`);
      }
    }
  }

  console.log(`[Lens Decompose] body length: ${body.length}`);
  return parseDigest(body);
}

function parseDigest(body: string): PaperDigest {
  const fence = /```json\s*([\s\S]*?)```/i.exec(body);
  const jsonSlice = fence ? fence[1].trim() : body.trim();
  try {
    const parsed = JSON.parse(jsonSlice) as PaperDigest;
    return parsed;
  } catch {
    return { rawBody: body };
  }
}

/**
 * Render a digest into a compact markdown string used as grounding context for explain calls.
 */
export function digestToContext(d: PaperDigest | null): string | undefined {
  if (!d) return undefined;
  if (d.rawBody) return d.rawBody;
  const parts: string[] = [];
  if (d.title) parts.push(`# ${d.title}`);
  if (d.authors?.length) parts.push(`Authors: ${d.authors.join(', ')}`);
  if (d.abstract) parts.push(`## Abstract\n${d.abstract}`);
  if (d.sections?.length) {
    parts.push(
      `## Section map\n${d.sections
        .map((s) => `- **${s.name}**${s.pages ? ` (pp. ${s.pages.join('–')})` : ''}: ${s.summary}`)
        .join('\n')}`,
    );
  }
  if (d.figures?.length) {
    parts.push(
      `## Figures\n${d.figures
        .map(
          (f) =>
            `- **${f.id ?? '?'}** (p. ${f.page ?? '?'}): ${f.caption ?? ''}${f.description ? ` — ${f.description}` : ''}`,
        )
        .join('\n')}`,
    );
  }
  if (d.equations?.length) {
    parts.push(
      `## Equations\n${d.equations.map((e) => `- **${e.id ?? '?'}** (p. ${e.page ?? '?'}): ${e.summary ?? ''}`).join('\n')}`,
    );
  }
  if (d.glossary?.length) {
    parts.push(
      `## Glossary\n${d.glossary.map((g) => `- **${g.term}** — ${g.definition}`).join('\n')}`,
    );
  }
  return parts.join('\n\n');
}
