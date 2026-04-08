import type { PDFPageProxy } from './pdfjs';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';

/**
 * A region in PDF user-space coordinates (origin at bottom-left of page).
 * To convert to CSS pixels at zoom=1: x_css = x, y_css = pageHeight - y - height.
 */
export interface Region {
  /** Stable id: `${paperHash}:${page}:${sha10(text)}:${ordinal}` */
  id: string;
  paperHash: string;
  page: number;
  parentId: string | null;
  /** Bounding box in PDF user space. */
  bbox: { x: number; y: number; width: number; height: number };
  text: string;
  /** Index of this region within the page (0-based, document order). */
  ordinal: number;
  /** Approximate font size of the dominant text run, used for layout heuristics. */
  fontSize: number;
}

interface Line {
  yTop: number; // PDF coord of top of line (baseline + ascender approximation)
  yBottom: number; // PDF coord of bottom (baseline)
  xLeft: number;
  xRight: number;
  text: string;
  fontSize: number;
}

interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
  hasEOL?: boolean;
  fontName?: string;
}

/**
 * Extract paragraph-level regions from a PDF page.
 *
 * Algorithm:
 *  1. Pull positioned glyph runs via `getTextContent`.
 *  2. Cluster runs into lines using a baseline tolerance proportional to font size.
 *  3. Cluster lines into paragraphs whenever the inter-line gap exceeds ~1.6× the line height.
 *
 * This is intentionally conservative — for v1 we want stable regions, not perfect ones.
 * AI segmentation refines this later.
 */
export async function extractRegions(
  page: PDFPageProxy,
  pageNumber: number,
  paperHash: string,
  textContent?: TextContent,
): Promise<Region[]> {
  const content = textContent ?? (await page.getTextContent());
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  const items = (content.items as unknown as PdfTextItem[]).filter(
    (it): it is PdfTextItem => 'str' in it && it.str !== undefined && it.transform != null,
  );
  if (items.length === 0) return [];

  // Build line clusters, column-aware: two runs at the same Y baseline but separated by
  // a large horizontal gap belong to different columns, not the same line. We look for
  // an existing line with matching Y whose x-right is close to this item's x-left; only
  // then do we append. Otherwise we start a new line even if Y matches.
  const lines: Line[] = [];
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = Math.max(Math.abs(item.transform[3]), Math.abs(item.transform[0]), 1);
    const yTop = y + fontSize * 0.85;
    const yBottom = y - fontSize * 0.15;
    const lineTol = fontSize * 0.4;
    // A gap larger than ~3 glyph widths on the same baseline almost always indicates a
    // column boundary in a two-column layout. Use font size as a proxy for glyph width.
    const maxHorizGap = fontSize * 3.5;

    // Find the most recent line with compatible Y AND continuous X that can absorb this run.
    let absorbed = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const candidate = lines[i];
      if (Math.abs(candidate.yBottom - y) > lineTol) {
        // Once we're too far back in Y, no earlier line will match either.
        break;
      }
      const gap = x - candidate.xRight;
      if (gap < maxHorizGap && x + item.width > candidate.xLeft - maxHorizGap) {
        const needsSpace =
          !candidate.text.endsWith(' ') &&
          !item.str.startsWith(' ') &&
          candidate.text.length > 0;
        candidate.text += (needsSpace ? ' ' : '') + item.str;
        candidate.xLeft = Math.min(candidate.xLeft, x);
        candidate.xRight = Math.max(candidate.xRight, x + item.width);
        candidate.yTop = Math.max(candidate.yTop, yTop);
        candidate.yBottom = Math.min(candidate.yBottom, yBottom);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      lines.push({
        yTop,
        yBottom,
        xLeft: x,
        xRight: x + item.width,
        text: item.str,
        fontSize,
      });
    }
  }

  // Sort lines top to bottom (PDF coords: high Y = top).
  lines.sort((a, b) => b.yBottom - a.yBottom);

  // Cluster lines into paragraphs. For multi-column layouts, we need to group lines that
  // belong to the same column (overlap in X significantly) AND are vertically adjacent.
  // A naive top-to-bottom sweep won't do: we may encounter col-1 line 2 before col-2 line 1.
  // We scan lines and greedily attach each to the nearest open paragraph that has strong X
  // overlap and is within vertical proximity; otherwise we open a new paragraph.
  const paragraphs: Line[][] = [];
  for (const line of lines) {
    let best: { idx: number; gap: number } | null = null;
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const para = paragraphs[i];
      const last = para[para.length - 1];
      const lineHeight = Math.max(last.yTop - last.yBottom, line.yTop - line.yBottom, 1);
      const gap = last.yBottom - line.yTop;
      if (gap < 0 || gap > lineHeight * 1.4) continue;
      const xOverlap = Math.min(last.xRight, line.xRight) - Math.max(last.xLeft, line.xLeft);
      const xOverlapRatio = xOverlap / Math.max(last.xRight - last.xLeft, 1);
      if (xOverlapRatio < 0.35) continue;
      if (!best || gap < best.gap) best = { idx: i, gap };
    }
    if (best) paragraphs[best.idx].push(line);
    else paragraphs.push([line]);
  }

  return paragraphs.map((para, idx) => {
    const text = para
      .map((l) => l.text.trim())
      .filter(Boolean)
      .join(' ');
    const xLeft = Math.min(...para.map((l) => l.xLeft));
    const xRight = Math.max(...para.map((l) => l.xRight));
    const yTop = Math.max(...para.map((l) => l.yTop));
    const yBottom = Math.min(...para.map((l) => l.yBottom));
    const fontSize = mode(para.map((l) => Math.round(l.fontSize)));
    void pageHeight;
    return {
      id: regionId(paperHash, pageNumber, text, idx),
      paperHash,
      page: pageNumber,
      parentId: null,
      bbox: {
        x: xLeft,
        y: yBottom,
        width: Math.max(xRight - xLeft, 1),
        height: Math.max(yTop - yBottom, 1),
      },
      text,
      ordinal: idx,
      fontSize,
    };
  });
}

function regionId(paperHash: string, page: number, text: string, ordinal: number): string {
  // Cheap djb2-style hash — keeps ids stable across re-extractions of the same content
  // without needing the WebCrypto SubtleCrypto async API.
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  const tag = (h >>> 0).toString(16).padStart(8, '0');
  return `${paperHash.slice(0, 12)}:${page}:${tag}:${ordinal}`;
}

function mode(arr: number[]): number {
  if (arr.length === 0) return 12;
  const counts = new Map<number, number>();
  for (const n of arr) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}
