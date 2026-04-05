import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed asset URL at build time and a dev-server URL at dev time.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
