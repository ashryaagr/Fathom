import { hitTest as hitRegions, useRegionsStore } from '../state/regions';
import type { Region } from '../pdf/extractRegions';

export interface PageHit {
  page: number;
  region: Region | null;
  /** PDF user-space coords (origin at bottom-left of page). */
  pdfX: number;
  pdfY: number;
  /** Element representing the page slot. */
  pageElement: HTMLElement;
}

/**
 * Resolve a viewport-space cursor (clientX, clientY) to a region inside whichever page
 * is under the cursor. Returns null if the cursor is not over any rendered page.
 */
export function findRegionUnderCursor(
  paperHash: string,
  clientX: number,
  clientY: number,
  zoom: number,
  pageBaseSizes: Array<{ width: number; height: number }>,
): PageHit | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target) return null;
  const pageEl = target.closest<HTMLElement>('[data-page]');
  if (!pageEl) return null;
  const pageNumber = Number(pageEl.dataset.page);
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
  const baseSize = pageBaseSizes[pageNumber - 1];
  if (!baseSize) return null;

  const rect = pageEl.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // Inverse of: x_css = pdfX * zoom; y_css = (pageHeight_pdf - pdfY) * zoom.
  const pdfX = cssX / zoom;
  const pdfY = baseSize.height - cssY / zoom;

  const regions = useRegionsStore.getState().getPage(paperHash, pageNumber);
  const region = hitRegions(regions, pdfX, pdfY);

  return { page: pageNumber, region, pdfX, pdfY, pageElement: pageEl };
}
