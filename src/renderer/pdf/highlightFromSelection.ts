import { useHighlightsStore, type Highlight } from '../state/highlights';
import { useDocumentStore } from '../state/document';

/**
 * Convert the user's current DOM selection into persisted amber highlights,
 * one per page the selection covers. Splits multi-page selections cleanly.
 *
 * Coordinate conversion:
 *   - `selection.getClientRects()` returns CSS viewport rectangles.
 *   - Each page element carries `data-page={n}` and has known base size at
 *     zoom=1. We find the page ancestor for each rect, convert to
 *     PDF user-space (bottom-up y, points), and group by page.
 *
 * Nothing happens if there's no selection, no document open, or no rects
 * land on a page element (e.g. the selection is in the lens overlay).
 */
export async function createHighlightFromSelection(paperHash: string): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 1 && r.height > 1,
  );
  if (rects.length === 0) return 0;

  const zoom = useDocumentStore.getState().zoom;
  const selectedText = selection.toString().trim();

  // Bucket each rect into its containing page (by data-page attribute).
  const byPage = new Map<
    number,
    {
      rects: Array<{ x: number; y: number; width: number; height: number }>;
      pageRect: DOMRect;
      baseHeight: number;
    }
  >();

  for (const clientRect of rects) {
    // Probe the center of the rect to find the page element underneath.
    // Using elementsFromPoint handles z-stacked layers (canvas, textLayer).
    const cx = clientRect.left + clientRect.width / 2;
    const cy = clientRect.top + clientRect.height / 2;
    const stack = document.elementsFromPoint(cx, cy);
    const pageEl = stack.find((el) =>
      el instanceof HTMLElement && el.hasAttribute('data-page'),
    ) as HTMLElement | undefined;
    if (!pageEl) continue;

    const pageNum = Number(pageEl.getAttribute('data-page'));
    if (!Number.isFinite(pageNum)) continue;

    const pageRect = pageEl.getBoundingClientRect();
    const baseHeight = pageRect.height / zoom;

    // Client → PDF user-space. PDF is bottom-up; we flip y.
    const x = (clientRect.left - pageRect.left) / zoom;
    const cssY = (clientRect.top - pageRect.top) / zoom;
    const width = clientRect.width / zoom;
    const height = clientRect.height / zoom;
    const y = baseHeight - cssY - height;

    const bucket = byPage.get(pageNum) ?? {
      rects: [],
      pageRect,
      baseHeight,
    };
    bucket.rects.push({ x, y, width, height });
    byPage.set(pageNum, bucket);
  }

  const store = useHighlightsStore.getState();
  let created = 0;
  for (const [page, bucket] of byPage) {
    const id = `${paperHash}:${page}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const highlight: Highlight = {
      id,
      paperHash,
      page,
      rects: bucket.rects,
      text: selectedText,
      color: 'amber',
      createdAt: Date.now(),
    };
    store.add(highlight);
    try {
      await window.lens.saveHighlight({
        id,
        paperHash,
        page,
        rects: bucket.rects,
        text: selectedText,
        color: 'amber',
      });
    } catch (err) {
      console.warn('[Highlights] persistence failed, keeping in memory', err);
    }
    created++;
  }

  // Clear the selection so the amber mark is visually confirmed.
  selection.removeAllRanges();
  return created;
}
