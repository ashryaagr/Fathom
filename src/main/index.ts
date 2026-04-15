import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { explain, type ExplainArgs } from './ai/client';
import { decomposePaper, digestToContext } from './ai/decompose';
import { getDb } from './db/schema';
import { Papers, Explanations, Regions } from './db/repo';

const PDF_CACHE_DIR = join(tmpdir(), 'lens-pdfs');

/**
 * We keep a content-hash → index-folder mapping in memory so handlers that only receive
 * a paperHash (regions:save, explain:start, paper:decompose, paper:state, paper:savePageImage)
 * can still resolve the right per-PDF folder.
 */
const indexDirByHash = new Map<string, string>();

/**
 * Compute the lens folder that sits **next to** the user's PDF. Structure:
 *   /path/to/paper.pdf
 *   /path/to/paper.pdf.lens/           ← everything lens-related, one clean folder
 * If we can't write next to the source (permission issue, read-only volume), fall back to
 * the tmp-dir cache keyed by content hash.
 */
function resolveIndexDir(pdfPath: string, contentHash: string): string {
  const preferred = `${pdfPath}.lens`;
  return preferred.length > 0 && preferred.includes('/')
    ? preferred
    : join(PDF_CACHE_DIR, contentHash);
}

function indexDirFor(paperHash: string): string {
  return indexDirByHash.get(paperHash) ?? join(PDF_CACHE_DIR, paperHash);
}

async function ensureIndexDir(pdfPath: string, contentHash: string): Promise<string> {
  const preferred = resolveIndexDir(pdfPath, contentHash);
  try {
    await mkdir(preferred, { recursive: true });
    indexDirByHash.set(contentHash, preferred);
    return preferred;
  } catch (err) {
    console.warn(`Could not create ${preferred}, falling back to tmp cache:`, err);
    const fallback = join(PDF_CACHE_DIR, contentHash);
    await mkdir(fallback, { recursive: true });
    indexDirByHash.set(contentHash, fallback);
    return fallback;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const activeExplains = new Map<string, AbortController>();

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 760,
    minHeight: 520,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafaf7',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (process.env.ELECTRON_RENDERER_URL) mainWindow?.webContents.openDevTools({ mode: 'right' });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('pdf:open', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const bytes = await readFile(filePath);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  Papers.upsert({ contentHash, title: filePath.split('/').pop() });

  // Place the per-paper index folder next to the PDF so the user sees one clean
  // "<filename>.pdf.lens/" sibling containing everything.
  const indexDir = await ensureIndexDir(filePath, contentHash);

  return {
    path: filePath,
    indexDir,
    name: filePath.split('/').pop() ?? 'document.pdf',
    contentHash,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
});

interface ExplainRequest extends Omit<ExplainArgs, 'abortController' | 'onDelta'> {
  paperHash: string;
  regionId?: string;
  pdfPath?: string;
  page?: number;
}

ipcMain.handle('explain:start', async (event, req: ExplainRequest) => {
  const requestId = randomUUID();
  const abortController = new AbortController();
  activeExplains.set(requestId, abortController);
  const sender = event.sender;
  const channel = `explain:event:${requestId}`;

  // Fire and forget — the renderer subscribes to channel for streaming + completion.
  (async () => {
    try {
      // Prefer the cached paper digest over a per-call PDF Read: once the paper has been
      // indexed the digest already contains figure/equation/glossary context and re-reading
      // the PDF is expensive (and currently requires poppler installed on the host).
      const paperRow = Papers.get(req.paperHash);
      let paperDigest = req.paperDigest;
      let digestAvailable = false;
      if (!paperDigest && paperRow?.digest_json) {
        try {
          const parsed = JSON.parse(paperRow.digest_json);
          paperDigest = digestToContext(parsed) ?? req.paperDigest;
          digestAvailable = !!parsed && typeof parsed === 'object' && !parsed.rawBody;
        } catch {
          /* ignore malformed cached digest */
        }
      }

      // Only fall back to a per-call PDF Read when the digest is missing or unusable —
      // gives Claude a chance to grab visual context even on a non-indexed paper.
      const pdfPath = digestAvailable ? undefined : req.pdfPath;
      const indexPath = indexDirFor(req.paperHash);

      const fullText = await explain({
        regionText: req.regionText,
        focusPhrase: req.focusPhrase,
        paperDigest,
        paperText: req.paperText,
        priorExplanations: req.priorExplanations,
        depth: req.depth,
        customInstruction: req.customInstruction,
        pdfPath,
        page: req.page,
        indexPath,
        zoomImagePath: (req as ExplainRequest & { zoomImagePath?: string }).zoomImagePath,
        regionBbox: (req as ExplainRequest & { regionBbox?: ExplainArgs['regionBbox'] }).regionBbox,
        abortController,
        onDelta: (text) => {
          if (sender.isDestroyed()) return;
          sender.send(channel, { type: 'delta', text });
        },
        onProgress: (text) => {
          if (sender.isDestroyed()) return;
          sender.send(channel, { type: 'progress', text });
        },
        onPromptSent: (prompt) => {
          if (sender.isDestroyed()) return;
          sender.send(channel, { type: 'prompt', text: prompt });
        },
      });
      if (req.regionId) {
        try {
          const questionText = req.customInstruction ?? req.focusPhrase ?? null;
          Explanations.insert({
            regionId: req.regionId,
            depth: req.depth,
            focusPhrase: questionText,
            body: fullText,
            // Save the zoom image path so the exact viewport crop is restorable
            // across sessions when the user clicks the region's cached marker.
            zoomImagePath:
              (req as ExplainRequest & { zoomImagePath?: string }).zoomImagePath ?? null,
          });
        } catch (e) {
          console.warn('failed to persist explanation', e);
        }
      }
      if (!sender.isDestroyed()) sender.send(channel, { type: 'done', text: fullText });
    } catch (err) {
      if (!sender.isDestroyed()) {
        sender.send(channel, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      activeExplains.delete(requestId);
    }
  })();

  return { requestId, channel };
});

ipcMain.handle('explain:abort', async (_event, requestId: string) => {
  const ctrl = activeExplains.get(requestId);
  if (ctrl) {
    ctrl.abort();
    activeExplains.delete(requestId);
    return true;
  }
  return false;
});

// Read a file (by absolute path) and return it as a data URL. Used to hydrate restored
// zoom images so <img> tags can render them in the renderer without any protocol plumbing.
ipcMain.handle('asset:dataUrl', async (_event, absPath: string) => {
  const bytes = await readFile(absPath);
  const mime = absPath.toLowerCase().endsWith('.jpg') || absPath.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg'
    : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
});

ipcMain.handle('paper:state', async (_event, paperHash: string) => {
  const paper = Papers.get(paperHash);
  if (!paper) return null;
  return {
    paper,
    regions: Regions.byPaper(paperHash),
    explanations: Explanations.byPaper(paperHash),
  };
});

interface SerializedRegion {
  id: string;
  paperHash: string;
  page: number;
  parentId: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  text: string;
  ordinal: number;
}

// Save a cropped figure PNG. Filename is supplied by the renderer (e.g. page-004-fig-2.png).
ipcMain.handle(
  'paper:saveFigureImage',
  async (_event, req: { paperHash: string; filename: string; bytes: ArrayBuffer }) => {
    const dir = join(indexDirFor(req.paperHash), 'images');
    await mkdir(dir, { recursive: true });
    const safeName = req.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = join(dir, safeName);
    await writeFile(path, Buffer.from(req.bytes));
    return { path };
  },
);

// Save a per-lens "zoom image" — the exact crop the user is looking at when they
// Cmd+pinch. Claude Reads this as ground truth so the image/text/prompt alignment
// is automatic even when text extraction is imperfect.
ipcMain.handle(
  'zoom:save',
  async (_event, req: { paperHash: string; lensId: string; bytes: ArrayBuffer }) => {
    const dir = join(indexDirFor(req.paperHash), 'zooms');
    await mkdir(dir, { recursive: true });
    const safeName = req.lensId.replace(/[^a-zA-Z0-9._-]/g, '_') + '.png';
    const path = join(dir, safeName);
    await writeFile(path, Buffer.from(req.bytes));
    return { path };
  },
);

// Save the one-and-only content.md that represents the full paper in reading order with
// inline image references back to images/page-NNN.png. Also writes MANIFEST.md.
ipcMain.handle(
  'paper:saveMarkdown',
  async (_event, req: { paperHash: string; markdown: string }) => {
    const dir = indexDirFor(req.paperHash);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'content.md'), req.markdown);
    // Count pages from the HTML page markers so MANIFEST.md doesn't need a separate param.
    const pageMatches = req.markdown.match(/<!-- PAGE \d+ -->/g) ?? [];
    const numPages = pageMatches.length;
    await writeFile(join(dir, 'MANIFEST.md'), buildManifest(numPages));
    return { indexPath: dir, numPages };
  },
);

function buildManifest(numPages: number): string {
  return `# Paper index

A file-system representation of one research paper. \`Read\`, \`Grep\`, and \`Glob\` are
all you need — no RAG, no embeddings, just files.

## Layout

\`\`\`
./
├── content.md               # the FULL paper text, in reading order, with inline figure refs
├── images/
│   ├── page-001-fig-1.png   # cropped FIGURES only (not whole pages), one PNG per figure
│   ├── page-003-fig-1.png
│   └── …
├── digest.json              # structured digest (after decompose): sections, figures, glossary
└── MANIFEST.md              # this file
\`\`\`

The paper has **${numPages} pages**.

## How to use this index

1. **Start with \`content.md\`.** It's the single source of truth for the paper's text in
   reading order. Page boundaries are marked with \`<!-- PAGE N -->\` and a
   \`## Page N\` heading; figure references appear immediately after each page heading as
   \`![Figure K on page N](./images/page-NNN-fig-K.png)\`.

2. **Grep \`content.md\` first.** To resolve a numbered citation like \`[76]\`, grep for
   \`\\\\[76\\\\]\` — the references section is inline, not split out. To find a symbol,
   a figure caption, or a named concept, grep it. Cheaper than re-reading.

3. **Read \`images/page-NNN-fig-K.png\`** when a figure matters — these are actual cropped
   figures, not full pages. Claude's Read tool handles PNG natively.

4. **Read \`digest.json\`** (if present) for a compact section/figure/glossary pointer map.

5. **Cite page numbers and figure numbers in your answer** so the reader can jump to the
   source. Trust increases when you point at the exact thing.`;
}

ipcMain.handle('regions:save', async (_event, regions: SerializedRegion[]) => {
  if (regions.length === 0) return 0;
  Regions.upsertMany(
    regions.map((r) => ({
      id: r.id,
      paper_hash: r.paperHash,
      page: r.page,
      parent_id: r.parentId,
      bbox_json: JSON.stringify(r.bbox),
      original_text: r.text,
      ordinal: r.ordinal,
    })),
  );
  return regions.length;
});

// Background "index" task — decomposes the PDF into a structured digest via Claude Read,
// emits status events so the renderer can show a toast.
const activeDecomposes = new Map<string, AbortController>();

ipcMain.handle(
  'paper:decompose',
  async (event, req: { paperHash: string; pdfPath: string; numPages: number }) => {
    const paper = Papers.get(req.paperHash);
    if (paper?.digest_json) {
      // Already indexed — no-op.
      event.sender.send('paper:decompose:status', {
        paperHash: req.paperHash,
        state: 'cached',
      });
      return { state: 'cached' };
    }

    // Cancel any prior run for this paper.
    const prior = activeDecomposes.get(req.paperHash);
    if (prior) prior.abort();
    const ctl = new AbortController();
    activeDecomposes.set(req.paperHash, ctl);

    event.sender.send('paper:decompose:status', {
      paperHash: req.paperHash,
      state: 'running',
    });

    try {
      const digest = await decomposePaper(req.pdfPath, req.numPages, ctl);
      // Detect the poppler-missing failure — Claude gives us back a free-form message
      // instead of JSON when its PDF reader can't render. Flag it so the user knows
      // *why* indexing is degraded and how to fix it.
      const rawBody = digest.rawBody ?? '';
      const popplerMissing =
        /poppler|pdftoppm|pdftocairo|PDF reader couldn[’']?t render/i.test(rawBody);
      if (popplerMissing) {
        activeDecomposes.delete(req.paperHash);
        event.sender.send('paper:decompose:status', {
          paperHash: req.paperHash,
          state: 'error',
          message:
            'Claude needs poppler to see figures in PDFs. Run `brew install poppler` and reopen the PDF.',
        });
        return {
          state: 'error',
          message: 'poppler not installed',
        };
      }
      Papers.upsert({ contentHash: req.paperHash, digest });
      activeDecomposes.delete(req.paperHash);
      event.sender.send('paper:decompose:status', {
        paperHash: req.paperHash,
        state: 'done',
      });
      return { state: 'done' };
    } catch (err) {
      activeDecomposes.delete(req.paperHash);
      const message = err instanceof Error ? err.message : String(err);
      event.sender.send('paper:decompose:status', {
        paperHash: req.paperHash,
        state: 'error',
        message,
      });
      return { state: 'error', message };
    }
  },
);

app.whenReady().then(async () => {
  // Eagerly initialize DB so a missing migration surfaces at startup, not on first explain.
  getDb();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
