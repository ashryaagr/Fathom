#!/usr/bin/env node
/**
 * Generate resources/sample-paper.pdf — a short, self-teaching "welcome"
 * paper that new users can open from the welcome dialog (or from the menu)
 * without having to find a real PDF themselves.
 *
 * The content deliberately reads like a mini research paper so the lens
 * gesture has something meaty to chew on: a pretend "methodology" paragraph
 * and a pretend "result" paragraph, each dense enough that Command+pinch on them
 * actually produces an interesting explanation from Claude.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'resources', 'sample-paper.pdf');

const doc = await PDFDocument.create();
doc.setTitle('A Short Tour of Fathom');
doc.setAuthor('Fathom');
doc.setSubject('First-run demo paper');
doc.setCreator('Fathom (scripts/build-sample-pdf.mjs)');

const serif = await doc.embedFont(StandardFonts.TimesRoman);
const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

// US-letter at 72dpi: 612 × 792.
const PAGE_W = 612;
const PAGE_H = 792;
const M = 72; // one-inch margins
const CONTENT_W = PAGE_W - 2 * M;
const ink = rgb(0.1, 0.08, 0.07);
const ruleColor = rgb(0.6, 0.55, 0.4);

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawParagraph(page, opts) {
  const { text, x, y, width, font, size, leading, color = ink } = opts;
  const lines = wrap(text, font, size, width);
  let cursor = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cursor, size, font, color });
    cursor -= leading;
  }
  return cursor;
}

// ------------ PAGE 1 ------------
{
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Title
  page.drawText('A Short Tour of Fathom', {
    x: M,
    y: PAGE_H - M - 6,
    size: 22,
    font: serifBold,
    color: ink,
  });

  page.drawText('A two-page demo paper, for trying the semantic zoom.', {
    x: M,
    y: PAGE_H - M - 32,
    size: 11,
    font: serifItalic,
    color: ink,
  });

  // Rule under the title
  page.drawLine({
    start: { x: M, y: PAGE_H - M - 46 },
    end: { x: PAGE_W - M, y: PAGE_H - M - 46 },
    thickness: 0.5,
    color: ruleColor,
  });

  let y = PAGE_H - M - 80;

  page.drawText('Abstract', { x: M, y, size: 13, font: serifBold, color: ink });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'Research papers are written compactly: each paragraph assumes the background, the ' +
      'prior work, and the notation of the paragraph before it. Readers who do not already ' +
      'carry that background find themselves skimming, switching to another window to look up ' +
      'a definition, and losing their place. We argue that the reading environment itself is ' +
      'the right place to close that gap, and present a prototype desktop reader in which the ' +
      'act of zooming in on a passage is the act of asking for a clearer explanation of it.',
    x: M,
    y,
    width: CONTENT_W,
    font: serif,
    size: 11,
    leading: 14,
  });

  y -= 26;
  page.drawText('1. Try it now', { x: M, y, size: 13, font: serifBold, color: ink });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'Hold the Command key and pinch in with two fingers on this paragraph. The page ' +
      'gives way to a full-screen lens, and Claude produces a clearer explanation of what ' +
      'you are looking at — grounded in the paper itself, streaming as you read. No side ' +
      'window, no context switch, no paste-to-chat.',
    x: M,
    y,
    width: CONTENT_W,
    font: serif,
    size: 11,
    leading: 14,
  });

  y -= 22;
  y = drawParagraph(page, {
    text:
      'You can drill deeper. Once a lens is open, pinching again on a specific phrase within ' +
      'the explanation opens another lens, focused on that phrase. Swipe left with two ' +
      'fingers to go back, like turning a page in a book. The entire interaction stays on ' +
      'the paper.',
    x: M,
    y,
    width: CONTENT_W,
    font: serif,
    size: 11,
    leading: 14,
  });

  y -= 26;
  page.drawText('2. Pretend methodology (for the lens to chew on)', {
    x: M, y, size: 13, font: serifBold, color: ink,
  });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'We instantiate an encoder-decoder with rotary positional embeddings in the attention ' +
      'layer, and substitute standard softmax attention with a linearized kernel attention ' +
      'whose feature map is a random Fourier projection of dimension 256. The encoder shares ' +
      'parameters across layers 2–6 under a tied-weight scheme, reducing parameters from ' +
      '83M to 54M while preserving validation perplexity to within 0.12 nats on WikiText-103.',
    x: M,
    y,
    width: CONTENT_W,
    font: serif,
    size: 11,
    leading: 14,
  });

  y -= 18;
  y = drawParagraph(page, {
    text:
      'Try Command+pinch on the paragraph above — it is intentionally dense enough that an ' +
      'explanation of it is useful. Fathom will read the paper index, resolve the terms it ' +
      'can, and explain the rest.',
    x: M, y, width: CONTENT_W, font: serifItalic, size: 10.5, leading: 13,
  });

  // Footer
  page.drawText('1', {
    x: PAGE_W / 2 - 4,
    y: M / 2,
    size: 10,
    font: serif,
    color: ruleColor,
  });
}

// ------------ PAGE 2 ------------
{
  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M - 6;

  page.drawText('3. Every lens is durable', {
    x: M, y, size: 13, font: serifBold, color: ink,
  });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'Close this PDF and reopen it next week. The paragraph you pinched on will show a ' +
      'small amber marker next to it; clicking the marker restores the exact viewport crop, ' +
      'the full Q&A thread, and the prompt that was sent to Claude. Nothing lives in a ' +
      'hidden database behind your back: the files are right next to the PDF, in a folder ' +
      'called <filename>.fathom/.',
    x: M, y, width: CONTENT_W, font: serif, size: 11, leading: 14,
  });

  y -= 26;
  page.drawText('4. Grounded, not hallucinated', { x: M, y, size: 13, font: serifBold, color: ink });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'Fathom does not use retrieval-augmented generation. The paper is written to disk as ' +
      'a filesystem — content.md for the text in reading order, per-figure PNGs for the ' +
      'figures — and Claude is given its usual toolbox (Read, Grep, Glob) to navigate it. ' +
      'A citation [76] is resolved by literally grepping for "[76]" in the references ' +
      'section; a figure is inspected by reading its PNG. Answers cite page numbers you ' +
      'can click and verify.',
    x: M, y, width: CONTENT_W, font: serif, size: 11, leading: 14,
  });

  y -= 26;
  page.drawText('5. When you\'re ready', { x: M, y, size: 13, font: serifBold, color: ink });
  y -= 22;

  y = drawParagraph(page, {
    text:
      'Open File ->Open PDF… (Command+O) and pick a research paper you have been meaning to ' +
      'finish. If it is sitting in Downloads, it is already one click away. You can also ' +
      'drag a PDF onto the Fathom window to open it. Or right-click a PDF in Finder and ' +
      'choose Open With ->Fathom.',
    x: M, y, width: CONTENT_W, font: serif, size: 11, leading: 14,
  });

  y -= 30;
  // Closing aphorism
  y = drawParagraph(page, {
    text:
      '— the reading app for the paper you meant to finish.',
    x: M, y, width: CONTENT_W, font: serifItalic, size: 11, leading: 14,
    color: rgb(0.5, 0.4, 0.2),
  });

  page.drawText('2', {
    x: PAGE_W / 2 - 4,
    y: M / 2,
    size: 10,
    font: serif,
    color: ruleColor,
  });
}

const bytes = await doc.save();
await writeFile(out, bytes);
console.log(`  ✓ ${out} (${bytes.length} bytes)`);
