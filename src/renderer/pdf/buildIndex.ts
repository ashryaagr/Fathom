import type { PDFDocumentProxy, PDFPageProxy } from './pdfjs';
import { extractAllPagesText } from './extractAllPages';
import { extractFigureBoxes, type FigureBox } from './extractFigures';

/** Pixels-per-PDF-point when rendering cropped figures. 2 ≈ Retina sharp. */
const FIGURE_PIXEL_SCALE = 2;

export interface IndexBuildProgress {
  stage: 'text' | 'figures' | 'writing';
  done: number;
  total: number;
}

interface ExtractedFigure {
  pageNumber: number;
  figureIndex: number; // 1-based within the page
  filename: string; // e.g. page-004-fig-2.png
  bbox: FigureBox; // PDF user space
}

export async function buildPaperIndex(
  doc: PDFDocumentProxy,
  paperHash: string,
  onProgress?: (p: IndexBuildProgress) => void,
): Promise<void> {
  // Step 1: full text of every page.
  onProgress?.({ stage: 'text', done: 0, total: doc.numPages });
  const pagesText = await extractAllPagesText(doc);
  onProgress?.({ stage: 'text', done: doc.numPages, total: doc.numPages });

  // Step 2: figure extraction. For each page, parse the operator list to find image
  // placements, then render just those rects to PNG and save them. No full-page PNGs —
  // we already have the markdown text. Only actual figures land on disk.
  onProgress?.({ stage: 'figures', done: 0, total: doc.numPages });
  const figuresPerPage = new Map<number, ExtractedFigure[]>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const figures = await renderPageFigures(page, p, paperHash);
    if (figures.length > 0) figuresPerPage.set(p, figures);
    onProgress?.({ stage: 'figures', done: p, total: doc.numPages });
    await new Promise((r) => setTimeout(r, 0));
  }

  // Step 3: assemble content.md, inserting figure references at each page break.
  onProgress?.({ stage: 'writing', done: 0, total: 1 });
  const markdown = buildMarkdown(pagesText, figuresPerPage);
  await window.lens.savePaperMarkdown({ paperHash, markdown });
  onProgress?.({ stage: 'writing', done: 1, total: 1 });
}

async function renderPageFigures(
  page: PDFPageProxy,
  pageNumber: number,
  paperHash: string,
): Promise<ExtractedFigure[]> {
  const bboxes = await extractFigureBoxes(page);
  if (bboxes.length === 0) return [];

  // Render the full page once at the chosen pixel density, then crop each figure
  // bbox out of it. PDF y-axis is bottom-up; canvas y is top-down.
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: FIGURE_PIXEL_SCALE });
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = Math.ceil(viewport.width);
  pageCanvas.height = Math.ceil(viewport.height);
  const pageCtx = pageCanvas.getContext('2d');
  if (!pageCtx) return [];
  pageCtx.fillStyle = '#ffffff';
  pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  await page.render({ canvas: pageCanvas, viewport }).promise;

  const figures: ExtractedFigure[] = [];
  const pad = (n: number) => String(n).padStart(3, '0');
  for (let i = 0; i < bboxes.length; i++) {
    const bbox = bboxes[i];
    // Convert PDF coords → canvas coords. Clip to canvas bounds.
    const srcX = Math.max(0, bbox.x * FIGURE_PIXEL_SCALE);
    const srcY = Math.max(
      0,
      (baseViewport.height - bbox.y - bbox.height) * FIGURE_PIXEL_SCALE,
    );
    const srcW = Math.min(pageCanvas.width - srcX, bbox.width * FIGURE_PIXEL_SCALE);
    const srcH = Math.min(pageCanvas.height - srcY, bbox.height * FIGURE_PIXEL_SCALE);
    if (srcW < 10 || srcH < 10) continue;

    const crop = document.createElement('canvas');
    crop.width = Math.ceil(srcW);
    crop.height = Math.ceil(srcH);
    const cropCtx = crop.getContext('2d');
    if (!cropCtx) continue;
    cropCtx.drawImage(pageCanvas, srcX, srcY, srcW, srcH, 0, 0, crop.width, crop.height);

    const blob: Blob = await new Promise((resolve, reject) =>
      crop.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
        'image/png',
      ),
    );
    const bytes = await blob.arrayBuffer();
    const filename = `page-${pad(pageNumber)}-fig-${i + 1}.png`;
    await window.lens.saveFigureImage({
      paperHash,
      filename,
      bytes,
    });

    figures.push({ pageNumber, figureIndex: i + 1, filename, bbox });
  }
  return figures;
}

function buildMarkdown(
  pages: string[],
  figuresPerPage: Map<number, ExtractedFigure[]>,
): string {
  const parts: string[] = [
    `<!-- Lens paper index. Each page is delimited by an HTML comment. Figure references -->\n` +
      `<!-- point to cropped PNGs in ./images/ — images are real figures, not whole pages. -->\n`,
  ];
  for (let i = 0; i < pages.length; i++) {
    const p = i + 1;
    parts.push(`\n<!-- PAGE ${p} -->\n`);
    parts.push(`## Page ${p}\n`);
    const figs = figuresPerPage.get(p) ?? [];
    for (const f of figs) {
      parts.push(`![Figure ${f.figureIndex} on page ${p}](./images/${f.filename})\n`);
    }
    parts.push(pages[i].trim() + '\n');
  }
  return parts.join('\n');
}
