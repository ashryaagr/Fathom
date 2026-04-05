/**
 * Capture a JPEG data-URL of the portion of the PDF that the user is currently looking at.
 *
 * Used as the "anchor image" in a FocusView so the first thing the user sees there is
 * literally what they were looking at when they pinched — figure, equation, mixed content.
 *
 * Given the scroller and the visible pages (in document order), this crops the primary
 * visible page's canvas to the vertical strip that overlaps the scroller's viewport.
 * For selections, caller should pass a tighter explicit rect via cropSelectionRect.
 */
export interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export function captureScrollerViewport(scroller: HTMLElement): CapturedImage | null {
  const sRect = scroller.getBoundingClientRect();
  const pageEls = Array.from(scroller.querySelectorAll<HTMLElement>('[data-page]'));

  // Clip each page's contribution to the scroller viewport in BOTH dimensions. The image
  // must be exactly what the user is looking at — when they're zoomed in and scrolled to
  // the right column, we must not quietly include the invisible left column.
  const strips: Array<{
    canvas: HTMLCanvasElement;
    srcX: number;
    srcY: number;
    srcW: number;
    srcH: number;
    dstW: number;
    dstH: number;
  }> = [];
  let totalCssHeight = 0;
  let stripCssWidth = 0;

  for (const pageEl of pageEls) {
    const pRect = pageEl.getBoundingClientRect();
    const top = Math.max(pRect.top, sRect.top);
    const bottom = Math.min(pRect.bottom, sRect.bottom);
    const left = Math.max(pRect.left, sRect.left);
    const right = Math.min(pRect.right, sRect.right);
    if (bottom <= top || right <= left) continue;
    const canvas = pageEl.querySelector('canvas');
    if (!canvas) continue;
    const cssH = parseFloat(canvas.style.height) || pRect.height;
    const cssW = parseFloat(canvas.style.width) || pRect.width;
    if (cssH <= 0 || cssW <= 0) continue;
    const dpr = canvas.height / cssH;

    const stripCssLeft = left - pRect.left;
    const stripCssTop = top - pRect.top;
    const stripCssW = right - left;
    const stripCssH = bottom - top;

    strips.push({
      canvas,
      srcX: stripCssLeft * dpr,
      srcY: stripCssTop * dpr,
      srcW: stripCssW * dpr,
      srcH: stripCssH * dpr,
      dstW: stripCssW,
      dstH: stripCssH,
    });
    totalCssHeight += stripCssH;
    stripCssWidth = Math.max(stripCssWidth, stripCssW);
  }

  if (strips.length === 0 || totalCssHeight <= 0 || stripCssWidth <= 0) return null;

  const outDpr = 2;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(stripCssWidth * outDpr));
  out.height = Math.max(1, Math.round(totalCssHeight * outDpr));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  let dstY = 0;
  for (const s of strips) {
    // Center narrower strips so mixed-width pages still look tidy.
    const dstX = ((stripCssWidth - s.dstW) / 2) * outDpr;
    const dstW = s.dstW * outDpr;
    const dstH = s.dstH * outDpr;
    ctx.drawImage(s.canvas, s.srcX, s.srcY, s.srcW, s.srcH, dstX, dstY, dstW, dstH);
    dstY += dstH;
  }

  return {
    dataUrl: out.toDataURL('image/jpeg', 0.85),
    width: out.width / outDpr,
    height: out.height / outDpr,
  };
}

/**
 * Capture a rectangle from a specific page canvas — used for selection drills where
 * we want a tighter crop around the selection's bounding rect.
 */
export function captureCanvasRect(
  pageElement: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
): CapturedImage | null {
  const canvas = pageElement.querySelector('canvas');
  if (!canvas) return null;
  const pRect = pageElement.getBoundingClientRect();
  const cssH = parseFloat(canvas.style.height) || pRect.height;
  const cssW = parseFloat(canvas.style.width) || pRect.width;
  if (cssH <= 0 || cssW <= 0) return null;
  const dpr = canvas.height / cssH;

  const localX = rect.x - pRect.left;
  const localY = rect.y - pRect.top;
  const srcX = Math.max(0, localX * dpr);
  const srcY = Math.max(0, localY * dpr);
  const srcW = Math.min(canvas.width - srcX, rect.width * dpr);
  const srcH = Math.min(canvas.height - srcY, rect.height * dpr);
  if (srcW <= 0 || srcH <= 0) return null;

  const outDpr = 2;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width * outDpr));
  out.height = Math.max(1, Math.round(rect.height * outDpr));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

  return {
    dataUrl: out.toDataURL('image/jpeg', 0.9),
    width: out.width / outDpr,
    height: out.height / outDpr,
  };
}
