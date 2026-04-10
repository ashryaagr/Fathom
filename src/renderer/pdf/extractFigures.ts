import { pdfjsLib, type PDFPageProxy } from './pdfjs';

export interface FigureBox {
  /** Bounding box in PDF user space (origin at bottom-left of page). */
  x: number;
  y: number;
  width: number;
  height: number;
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
      boxes.push({ x: minX, y: minY, width: w, height: h });
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
