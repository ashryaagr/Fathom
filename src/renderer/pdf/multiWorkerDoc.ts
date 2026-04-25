import { pdfjsLib, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs';

/**
 * Minimal subset of `PDFDocumentProxy` the renderer actually uses.
 * Lets us slot a multi-worker facade in where a single document used
 * to live without touching call sites (`PdfViewer`, `PageView`,
 * `buildPaperIndex`, `extractAllPagesText` all just call `getPage`
 * and read `numPages`).
 */
export interface PdfDocFacade {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

/** Document data shape that pdf.js will accept by-value across all the
 * sibling docs without re-fetching. We slice the same `Uint8Array` per
 * worker because pdf.js transfers the buffer to the worker, which
 * detaches it on the main thread — sharing one buffer across N
 * `getDocument` calls would leave docs 2..N seeing an empty buffer. */
export interface MultiDocOptions {
  data: Uint8Array;
  cMapUrl: string;
  cMapPacked: boolean;
  standardFontDataUrl: string;
  wasmUrl: string;
  maxImageSize: number;
  useSystemFonts: boolean;
}

/**
 * Open the same PDF N times against N independent `PDFWorker`s so up
 * to N pages can render in parallel.
 *
 * pdf.js queues every render task per-document on a single worker
 * thread. With one document/worker, even though `IntersectionObserver`
 * mounts 4-8 PageViews concurrently (we prefetch ~6 viewports), only
 * one `page.render()` actually decodes at a time — every other waits
 * its turn on the worker's message queue. First paint and
 * scroll-to-new-page both pay that serialisation cost.
 *
 * The fix is to give pdf.js more workers. We open N copies of the
 * doc, each bound to its own `PDFWorker` instance, and route
 * `getPage(n)` to `docs[(n-1) % N]` so adjacent pages never share a
 * worker. Memory cost = N× the per-doc cache (page objects, text
 * content, op-list); for typical 2-50 page research papers this is
 * 30-150 MB extra at N=3, well under the comfortable Electron renderer
 * budget on the dev machine. The figure-extraction `buildPaperIndex`
 * pass also benefits: page renders inside the indexer are routed to
 * the same `(n-1) % N` worker as the visible page, so the indexer
 * uses idle workers when the user is parked on one page.
 *
 * Each doc is opened independently from the same `Uint8Array` source
 * (sliced per call because pdf.js detaches the buffer). The first
 * doc's `getDocument` call is awaited eagerly so the user sees pages
 * begin to load on a 1-worker timeline; the rest open in the
 * background and the facade routes early calls to whichever doc has
 * resolved. If a non-primary worker fails to open we degrade
 * gracefully to whatever's available — never to a stuck await.
 */
export class MultiWorkerDoc implements PdfDocFacade {
  private readonly docs: PDFDocumentProxy[];
  private readonly workers: InstanceType<typeof pdfjsLib.PDFWorker>[];
  /** Promises for each doc's open(). docs[i] is resolved iff
   * openPromises[i] resolved. Routing waits on the relevant slot
   * before delegating, so a getPage that lands before that worker's
   * doc is open simply waits for that worker (not all workers). */
  private readonly openPromises: Promise<PDFDocumentProxy>[];
  readonly numPages: number;

  private constructor(
    workers: InstanceType<typeof pdfjsLib.PDFWorker>[],
    docs: PDFDocumentProxy[],
    openPromises: Promise<PDFDocumentProxy>[],
    numPages: number,
  ) {
    this.workers = workers;
    this.docs = docs;
    this.openPromises = openPromises;
    this.numPages = numPages;
  }

  static async open(workerCount: number, opts: MultiDocOptions): Promise<MultiWorkerDoc> {
    const n = Math.max(1, Math.floor(workerCount));
    const workers: InstanceType<typeof pdfjsLib.PDFWorker>[] = [];
    // PDFWorker's TS d.ts declares `name?: null | undefined` — a known
    // upstream typings bug; the runtime accepts a string and uses it
    // for debug labels. Cast around the bad type rather than dropping
    // the names (they're useful in DevTools' worker pane to spot which
    // pool entry is busy).
    type WorkerCtor = new (params: { name?: string }) => InstanceType<typeof pdfjsLib.PDFWorker>;
    const Ctor = pdfjsLib.PDFWorker as unknown as WorkerCtor;
    for (let i = 0; i < n; i++) {
      workers.push(new Ctor({ name: `fathom-pdf-w${i}` }));
    }

    const buildOpts = (i: number) => ({
      // Per-worker copy: pdf.js detaches the underlying buffer on
      // worker post, so each call needs its own slice.
      data: opts.data.slice(),
      cMapUrl: opts.cMapUrl,
      cMapPacked: opts.cMapPacked,
      standardFontDataUrl: opts.standardFontDataUrl,
      wasmUrl: opts.wasmUrl,
      maxImageSize: opts.maxImageSize,
      useSystemFonts: opts.useSystemFonts,
      worker: workers[i],
    });

    const openPromises: Promise<PDFDocumentProxy>[] = workers.map((_, i) =>
      pdfjsLib.getDocument(buildOpts(i)).promise,
    );

    // Await the primary doc so we know numPages. The other docs open
    // in parallel; their promises stay in `openPromises` for routing.
    const primary = await openPromises[0];
    const docs: PDFDocumentProxy[] = new Array(n);
    docs[0] = primary;
    // Background-fill the rest as they resolve.
    for (let i = 1; i < n; i++) {
      const idx = i;
      openPromises[idx]
        .then((d) => {
          docs[idx] = d;
        })
        .catch((err) => {
          console.warn(`[MultiWorkerDoc] worker ${idx} failed to open, falling back`, err);
          // Replace the slot with the primary so routing never hangs;
          // we lose parallelism for that lane but stay correct.
          docs[idx] = primary;
        });
    }

    return new MultiWorkerDoc(workers, docs, openPromises, primary.numPages);
  }

  /** Route to the worker for this page. Adjacent pages land on
   * different workers (1→0, 2→1, 3→2, 4→0, …) so a typical
   * "render page 1+2+3 above the fold" burst saturates all N
   * workers instead of stacking on one queue. */
  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    const lane = (pageNumber - 1) % this.docs.length;
    let doc = this.docs[lane];
    if (!doc) {
      // Worker hasn't finished opening yet. Wait for just that
      // lane's open — not all lanes — so we don't serialise on the
      // slowest worker for every getPage call early in the session.
      try {
        doc = await this.openPromises[lane];
        this.docs[lane] = doc;
      } catch {
        // Open failed; fall back to lane 0 (the primary, guaranteed
        // resolved before this facade was constructed).
        doc = this.docs[0];
      }
    }
    return doc.getPage(pageNumber);
  }

  async destroy(): Promise<void> {
    // Best-effort: close every doc and worker. pdf.js doc.destroy
    // returns a Promise; worker.destroy is sync.
    await Promise.allSettled(
      this.docs.map((d) => (d ? d.destroy() : Promise.resolve())),
    );
    for (const w of this.workers) {
      try {
        w.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Single-worker facade preserving the original code path. Used when
 * `MULTI_WORKER_RENDER` is off so a regression caused by the worker-
 * pool change is a one-line revert (flip the flag) rather than a
 * codebase rewind.
 */
export class SingleWorkerDoc implements PdfDocFacade {
  readonly numPages: number;
  private readonly doc: PDFDocumentProxy;

  constructor(doc: PDFDocumentProxy) {
    this.doc = doc;
    this.numPages = doc.numPages;
  }

  static async open(opts: MultiDocOptions): Promise<SingleWorkerDoc> {
    const loadingTask = pdfjsLib.getDocument({
      data: opts.data,
      cMapUrl: opts.cMapUrl,
      cMapPacked: opts.cMapPacked,
      standardFontDataUrl: opts.standardFontDataUrl,
      wasmUrl: opts.wasmUrl,
      maxImageSize: opts.maxImageSize,
      useSystemFonts: opts.useSystemFonts,
    });
    return new SingleWorkerDoc(await loadingTask.promise);
  }

  getPage(pageNumber: number): Promise<PDFPageProxy> {
    return this.doc.getPage(pageNumber);
  }

  destroy(): Promise<void> {
    return this.doc.destroy();
  }
}
