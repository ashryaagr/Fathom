import { pdfjsLib, type PDFPageProxy } from './pdfjs';

export interface FigureBox {
  /** Bounding box in PDF user space (origin at bottom-left of page). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** For logging/diagnostics — where did we find this figure. */
  source?: 'raster' | 'caption';
}

/**
 * Walk a page's operator list and collect the page-coordinate bboxes of every
 * raster image drawn on the page. We track the current transformation matrix (CTM)
 * using the standard save/restore/transform ops and read paintImageXObject /
 * paintImageXObjectRepeat / paintJpegXObject placements off the top of the stack.
 *
 * The returned boxes are deduplicated and filtered to only meaningful figures
 * (≥60pt wide and ≥60pt tall, ≥6000pt² area) so background textures / tiny icons
 * don't flood the output.
 */
export async function extractFigureBoxes(page: PDFPageProxy): Promise<FigureBox[]> {
  const opList = await page.getOperatorList();
  const OPS = (pdfjsLib as unknown as { OPS: Record<string, number> }).OPS;

  const save = OPS.save;
  const restore = OPS.restore;
  const transformOp = OPS.transform;
  const paintImageXObject = OPS.paintImageXObject;
  const paintImageXObjectRepeat = OPS.paintImageXObjectRepeat;
  const paintJpegXObject = OPS.paintJpegXObject;
  const paintImageMaskXObject = OPS.paintImageMaskXObject;
  const paintInlineImageXObject = OPS.paintInlineImageXObject;

  // CTM stack; identity on the bottom.
  type Mat = [number, number, number, number, number, number];
  const stack: Mat[] = [[1, 0, 0, 1, 0, 0]];
  const multiply = (a: Mat, b: Mat): Mat => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];

  const boxes: FigureBox[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[];
    if (fn === save) {
      stack.push(stack[stack.length - 1].slice() as Mat);
    } else if (fn === restore) {
      if (stack.length > 1) stack.pop();
    } else if (fn === transformOp) {
      const m = args as unknown as Mat;
      stack[stack.length - 1] = multiply(stack[stack.length - 1], m);
    } else if (
      fn === paintImageXObject ||
      fn === paintImageXObjectRepeat ||
      fn === paintJpegXObject ||
      fn === paintImageMaskXObject ||
      fn === paintInlineImageXObject
    ) {
      const m = stack[stack.length - 1];
      // In PDF, an image lives in unit-square space; the CTM maps (0,0)-(1,1) onto the
      // page. For axis-aligned placements |m[0]| = width, |m[3]| = height.
      const width = Math.abs(m[0]);
      const height = Math.abs(m[3]);
      // Guard against weird skew / rotation by using an AABB over the unit square corners.
      const corners: Array<[number, number]> = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]) as Array<
        [number, number]
      >;
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = Math.max(maxX - minX, width);
      const h = Math.max(maxY - minY, height);
      if (w < 60 || h < 60 || w * h < 6000) continue;
      boxes.push({ x: minX, y: minY, width: w, height: h, source: 'raster' });
    }
  }

  // Dedup near-duplicate boxes (some PDFs emit an image twice for overlay effects).
  return boxes.filter((b, i) => {
    for (let j = 0; j < i; j++) {
      const o = boxes[j];
      if (
        Math.abs(b.x - o.x) < 2 &&
        Math.abs(b.y - o.y) < 2 &&
        Math.abs(b.width - o.width) < 2 &&
        Math.abs(b.height - o.height) < 2
      ) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Supplement op-list figure detection by finding "Figure N" / "Fig. N"
 * captions in the text, and backing out the figure region above each caption.
 * This catches vector-drawn figures (diagrams, pipelines, architecture
 * charts) that never trigger a `paintImageXObject` op and would otherwise be
 * invisible to the index — a common case in ML and systems papers.
 *
 * Approach: for each caption, scan upward in PDF y (i.e., geometrically
 * above the caption line) within the same column until text resumes. The
 * gap between is the figure region. Conservative fallback height used when
 * no text is found above (figure extends up to the top margin).
 */
export async function extractCaptionBasedFigures(
  page: PDFPageProxy,
): Promise<FigureBox[]> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageW = viewport.width;
  const pageH = viewport.height;

  type Item = { str: string; x: number; y: number; width: number };
  const items: Item[] = (
    content.items as Array<{ str: string; transform: number[]; width?: number }>
  ).map((raw) => ({
    str: raw.str ?? '',
    x: raw.transform?.[4] ?? 0,
    y: raw.transform?.[5] ?? 0,
    width: raw.width ?? 0,
  }));

  // Detect two-column layout by counting items whose x is in the left vs
  // right half and checking they're comparable in count.
  const leftCount = items.filter((i) => i.x < pageW / 2).length;
  const rightCount = items.filter((i) => i.x >= pageW / 2).length;
  const total = leftCount + rightCount;
  const isTwoColumn =
    total > 50 &&
    Math.min(leftCount, rightCount) > 0.3 * Math.max(leftCount, rightCount);

  const CAPTION_RE = /^(Figure|Fig\.|FIG\.?|FIGURE)\s+\d/;

  const boxes: FigureBox[] = [];
  for (const item of items) {
    if (!CAPTION_RE.test(item.str.trim())) continue;

    // Which column does this caption live in?
    const inLeftColumn = item.x < pageW / 2;
    const columnStart = isTwoColumn ? (inLeftColumn ? 18 : pageW / 2 + 6) : 18;
    const columnEnd = isTwoColumn ? (inLeftColumn ? pageW / 2 - 6 : pageW - 18) : pageW - 18;
    const columnWidth = columnEnd - columnStart;

    const captionY = item.y; // baseline of caption in PDF coords (bottom-up)

    // Find the nearest text item ABOVE the caption (higher y) in the same column.
    // "Above" = y > caption_y; "same column" = x in [columnStart, columnEnd].
    let closestAboveY = pageH - 18; // default: top margin
    for (const other of items) {
      if (other === item) continue;
      if (!other.str.trim()) continue;
      if (other.x < columnStart - 2 || other.x > columnEnd + 2) continue;
      if (other.y <= captionY + 4) continue; // same line or below caption
      if (other.y < closestAboveY) closestAboveY = other.y;
    }

    // Figure occupies the vertical band (captionY + small pad) → (closestAboveY - small pad).
    const figBottom = captionY + 10; // just above the caption top
    const figTop = closestAboveY - 6;
    const figHeight = figTop - figBottom;
    // Skip degenerate or obviously-wrong detections (e.g. two captions stacked
    // back-to-back leave no room for a figure between them).
    if (figHeight < 60) continue;
    if (columnWidth < 80) continue;

    boxes.push({
      x: columnStart,
      y: figBottom,
      width: columnWidth,
      height: figHeight,
      source: 'caption',
    });
  }

  return boxes;
}

/** Overlap ratio (0-1) between two axis-aligned boxes. */
function overlaps(a: FigureBox, b: FigureBox): boolean {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersect = ix * iy;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 && intersect / smaller > 0.5;
}

/**
 * Run both detectors and merge. Raster figures win when there's significant
 * overlap with a caption-derived region (a raster detection is more precise
 * than our caption-based fallback).
 */
export async function extractAllFigureBoxes(page: PDFPageProxy): Promise<FigureBox[]> {
  const [raster, caption] = await Promise.all([
    extractFigureBoxes(page),
    extractCaptionBasedFigures(page),
  ]);
  const merged: FigureBox[] = [...raster];
  for (const c of caption) {
    if (raster.some((r) => overlaps(c, r))) continue;
    merged.push(c);
  }
  return merged;
}
