import type { PdfDocFacade } from './multiWorkerDoc';

/**
 * Extract raw text for every page of a PDF in reading order. Used to seed the on-disk
 * index so Claude can Read/Grep/Glob the paper as a real file system instead of paying
 * poppler costs on every explain call.
 */
export async function extractAllPagesText(doc: PdfDocFacade): Promise<string[]> {
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // getTextContent items include hasEOL marks; build text using both explicit EOL and
    // implicit line breaks when the transform's y drops significantly.
    let text = '';
    let lastY: number | null = null;
    const items = content.items as Array<{
      str: string;
      hasEOL?: boolean;
      transform: number[];
    }>;
    for (const item of items) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2 && text.length > 0 && !text.endsWith('\n')) {
        text += '\n';
      }
      text += item.str;
      if (item.hasEOL && !text.endsWith('\n')) text += '\n';
      lastY = y;
    }
    pages.push(text);
  }
  return pages;
}
