import { query } from '@anthropic-ai/claude-agent-sdk';
import { dirname } from 'node:path';

const DECOMPOSE_SYSTEM = `You index research papers for an in-place PDF reader. You will be asked to read a PDF file and produce a compact JSON digest of it. Be precise, concise, and faithful to the source.`;

export interface PaperDigest {
  title?: string;
  authors?: string[];
  abstract?: string;
  sections?: Array<{ name: string; summary: string; pages?: number[] }>;
  figures?: Array<{ id?: string; page?: number; caption?: string; description?: string }>;
  equations?: Array<{ id?: string; page?: number; summary?: string }>;
  glossary?: Array<{ term: string; definition: string }>;
  /** If JSON parsing failed, we keep the raw markdown body here so downstream can still use it. */
  rawBody?: string;
}

/**
 * Run one Agent SDK invocation that reads the PDF end-to-end and produces a structured
 * digest. Used as a best-effort background task on PDF open; subsequent explain calls
 * receive this digest as compact grounding context.
 *
 * @param numPages Total pages in the PDF — used to chunk Read calls into ≤15-page slices.
 */
export async function decomposePaper(
  pdfPath: string,
  numPages: number,
  abortController?: AbortController,
): Promise<PaperDigest> {
  const chunks: string[] = [];
  for (let start = 1; start <= numPages; start += 15) {
    const end = Math.min(numPages, start + 14);
    chunks.push(start === end ? `${start}` : `${start}-${end}`);
  }
  const readInstructions = chunks
    .map((c, i) => `  ${i + 1}. Use Read on "${pdfPath}" with pages: "${c}".`)
    .join('\n');

  const prompt = `Read the entire PDF and produce a structured JSON digest of it.

Steps:
${readInstructions}

After reading, output a single JSON object with this shape (and nothing else — no preamble, no trailing prose):

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

  const q = query({
    prompt,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code', append: DECOMPOSE_SYSTEM },
      allowedTools: ['Read'],
      additionalDirectories: [dirname(pdfPath)],
      includePartialMessages: false,
      permissionMode: 'bypassPermissions',
      abortController,
      // Decompose often takes multiple Read turns + a final JSON turn; leave headroom.
      maxTurns: Math.max(6, chunks.length + 2),
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
