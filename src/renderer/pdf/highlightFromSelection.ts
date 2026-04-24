import { useHighlightsStore, type Highlight } from '../state/highlights';
import { useLensHighlightsStore, type LensHighlight } from '../state/lensHighlights';
import { useDocumentStore } from '../state/document';

/**
 * Convert the user's current DOM selection into persisted amber highlights.
 *
 * Two anchor mechanisms in one entry point:
 *
 *   1. Selection inside a lens body (an ancestor with data-lens-id):
 *      store as a `LensHighlight` keyed by lens_id + selected text.
 *      No rects — the markdown body re-flows so we re-find the text on
 *      render. Same UX surface as the PDF highlight (⌘H, header icon).
 *      CLAUDE.md §2.4 + todo #24.
 *
 *   2. Selection on a PDF page (an ancestor with data-page): store as a
 *      `Highlight` with rects in PDF user-space so zoom changes don't
 *      drift the marks.
 *
 * The branch is decided by which ancestor type appears first under the
 * selection's client rect — lens body wins because lens overlays the
 * page, so a stray rect from the page underneath shouldn't be picked
 * up by a deliberate in-lens selection.
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

  const selectedText = selection.toString().trim();
  if (!selectedText) return 0;

  // Lens-body branch — selection sits inside a lens body container.
  // Walk up from the range's startContainer for a `[data-lens-id]`
  // ancestor; if we find one before any `[data-page]`, it's an
  // in-lens highlight. We skip rect math entirely; lens highlights
  // re-anchor by text on render.
  const lensId = findAncestorAttr(range.startContainer, 'data-lens-id');
  if (lensId) {
    const id = `lh:${lensId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const lh: LensHighlight = {
      id,
      lensId,
      paperHash,
      selectedText,
      color: 'amber',
      createdAt: Date.now(),
    };
    useLensHighlightsStore.getState().add(lh);
    try {
      await window.lens.saveLensHighlight?.({
        id,
        lensId,
        paperHash,
        selectedText,
        color: 'amber',
      });
    } catch (err) {
      console.warn('[LensHighlights] persistence failed, keeping in memory', err);
    }
    selection.removeAllRanges();
    return 1;
  }

  const zoom = useDocumentStore.getState().zoom;

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

/** Walk up from a DOM node looking for an element with a given attribute.
 * Returns the attribute's value if found, or null. Used to detect
 * "is this selection inside a lens body" via `data-lens-id`. */
function findAncestorAttr(node: Node, attr: string): string | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute(attr)) {
      return current.getAttribute(attr);
    }
    current = current.parentNode;
  }
  return null;
}
