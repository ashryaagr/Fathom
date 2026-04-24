import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { explain, type ExplainArgs } from './ai/client';
import { decomposePaper, digestToContext } from './ai/decompose';
import { getDb } from './db/schema';
import { Papers, Explanations, Regions } from './db/repo';
import {
  initAutoUpdater,
  manualCheckForUpdates,
  quitAndInstall,
  getLastUpdateStatus,
} from './updater';
import { initLogging, logFilePath } from './logger';
import {
  checkClaude,
  ensureClaudeOnPath,
  translateClaudeError,
} from './claudeCheck';

const PDF_CACHE_DIR = join(tmpdir(), 'lens-pdfs');

// --- Small settings store (last-opened folder, first-run flag, etc). ---
// One JSON file under Electron's userData dir. Never throws; corruption
// degrades gracefully to defaults so a bad settings file can't brick startup.
interface FathomSettings {
  lastOpenDir?: string;
  firstRunCompletedAt?: string;
  tourCompletedAt?: string;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function readSettings(): FathomSettings {
  try {
    if (!existsSync(settingsPath())) return {};
    return JSON.parse(readFileSync(settingsPath(), 'utf-8')) as FathomSettings;
  } catch (err) {
    console.warn('[settings] could not read settings:', err);
    return {};
  }
}

function writeSettings(patch: Partial<FathomSettings>): void {
  try {
    const next: FathomSettings = { ...readSettings(), ...patch };
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[settings] could not persist settings:', err);
  }
}

/**
 * We keep a content-hash → index-folder mapping in memory so handlers that only receive
 * a paperHash (regions:save, explain:start, paper:decompose, paper:state, paper:savePageImage)
 * can still resolve the right per-PDF folder.
 */
const indexDirByHash = new Map<string, string>();

/**
 * Compute the Fathom sidecar folder that sits **next to** the user's PDF:
 *   /path/to/paper.pdf
 *   /path/to/paper.pdf.fathom/         ← everything Fathom-related, one clean folder
 * If we can't write next to the source (permission issue, read-only volume), fall back to
 * the tmp-dir cache keyed by content hash.
 */
function resolveIndexDir(pdfPath: string, contentHash: string): string {
  const preferred = `${pdfPath}.fathom`;
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
    if (mainWindow) initAutoUpdater(mainWindow);
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

/**
 * Shared "prepare this PDF path for the renderer" flow. Used by:
 *   - pdf:open (Finder dialog)
 *   - pdf:openPath (drag-and-drop from renderer)
 *   - app.on('open-file', …) (user ⌘-clicked a PDF in Finder → Open With Fathom)
 *   - Open Sample Paper menu / first-run button
 */
async function prepareOpenedPdf(filePath: string) {
  writeSettings({ lastOpenDir: dirname(filePath) });
  const bytes = await readFile(filePath);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  Papers.upsert({ contentHash, title: filePath.split('/').pop() });
  const indexDir = await ensureIndexDir(filePath, contentHash);
  return {
    path: filePath,
    indexDir,
    name: filePath.split('/').pop() ?? 'document.pdf',
    contentHash,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

ipcMain.handle('pdf:open', async () => {
  if (!mainWindow) return null;
  // First-time openers get pointed at ~/Downloads (where almost all papers
  // land). After that, remember the folder they last used so they don't
  // have to re-navigate every time.
  const settings = readSettings();
  const defaultDir = settings.lastOpenDir && existsSync(settings.lastOpenDir)
    ? settings.lastOpenDir
    : app.getPath('downloads');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF',
    defaultPath: defaultDir,
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return prepareOpenedPdf(result.filePaths[0]);
});

// Renderer drag-and-drop: the <DropZone> picks up a dragged .pdf, pulls the
// local path (via the Electron File.path extension), and hands it to the
// main process through this handler. Same return shape as pdf:open.
ipcMain.handle('pdf:openPath', async (_event, filePath: string) => {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  if (!filePath.toLowerCase().endsWith('.pdf')) return null;
  return prepareOpenedPdf(filePath);
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
      const raw = err instanceof Error ? err.message : String(err);
      const translated = translateClaudeError(err);
      console.error(`[explain:start] failed — ${raw}`);
      const message = translated.suggestion
        ? `${translated.message}\n\n${translated.suggestion}`
        : translated.message;
      if (!sender.isDestroyed()) {
        sender.send(channel, { type: 'error', message });
      }
    } finally {
      activeExplains.delete(requestId);
    }
  })();

  return { requestId, channel };
});

// Renderer-invoked "Show log" — used by the error toast so a user can share
// the log file in one click without hunting through Help menus.
ipcMain.handle('log:reveal', async () => {
  const p = logFilePath();
  if (existsSync(p)) shell.showItemInFolder(p);
  else shell.openPath(dirname(p));
});

// Settings surface for the renderer — read-only get + targeted setters.
// We deliberately don't expose a general-purpose setSettings() so the
// renderer can't scribble arbitrary keys into the file.
ipcMain.handle('settings:get', async () => readSettings());
ipcMain.handle('settings:markTourDone', async () => {
  writeSettings({ tourCompletedAt: new Date().toISOString() });
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

// ---- auto-update IPC ----
ipcMain.handle('update:check', async () => manualCheckForUpdates());
ipcMain.handle('update:install', async () => {
  quitAndInstall();
});
ipcMain.handle('update:status', async () => getLastUpdateStatus());

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
      // Decompose reads the per-paper index folder (content.md + cropped figure PNGs)
      // that the renderer already built — no raw-PDF access, no poppler dependency.
      const indexPath = indexDirFor(req.paperHash);
      const digest = await decomposePaper(indexPath, ctl);
      Papers.upsert({ contentHash: req.paperHash, digest });
      activeDecomposes.delete(req.paperHash);
      event.sender.send('paper:decompose:status', {
        paperHash: req.paperHash,
        state: 'done',
      });
      return { state: 'done' };
    } catch (err) {
      activeDecomposes.delete(req.paperHash);
      const raw = err instanceof Error ? err.message : String(err);
      const translated = translateClaudeError(err);
      // Include both the friendly headline and the fix hint in what we show,
      // and keep the raw error in the log so the user can attach it to an issue.
      const message = translated.suggestion
        ? `${translated.message}\n\n${translated.suggestion}`
        : translated.message;
      console.error(`[paper:decompose] failed — ${raw}`);
      event.sender.send('paper:decompose:status', {
        paperHash: req.paperHash,
        state: 'error',
        message,
      });
      return { state: 'error', message };
    }
  },
);

/**
 * Copy the bundled sample PDF into ~/Documents (so the `.fathom` sidecar
 * folder can be written alongside it — the in-bundle Resources folder is
 * read-only) and open it via the normal flow. Idempotent: if the file is
 * already there and unchanged, we skip the copy and just open it.
 */
async function openSamplePaper(): Promise<void> {
  if (!mainWindow) return;
  // In production the sample lives under Resources/ next to the .app; in dev
  // the same relative path resolves into the repo's resources/ folder.
  const sourcePath = app.isPackaged
    ? join(process.resourcesPath, 'sample-paper.pdf')
    : join(__dirname, '../../resources/sample-paper.pdf');
  if (!existsSync(sourcePath)) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Sample paper missing',
      detail: `Expected at ${sourcePath}. This is a build problem — please open an issue.`,
      buttons: ['OK'],
    });
    return;
  }
  const destDir = app.getPath('documents');
  const destPath = join(destDir, 'Fathom — Short Tour.pdf');
  try {
    const src = await readFile(sourcePath);
    if (!existsSync(destPath) || Buffer.compare(src, await readFile(destPath)) !== 0) {
      await writeFile(destPath, src);
    }
  } catch (err) {
    console.warn('[sample] could not copy sample to Documents:', err);
  }
  mainWindow.webContents.send('pdf:openExternal', destPath);
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('pdf:openRequest');
          },
        },
        {
          label: 'Open Sample Paper',
          click: () => {
            void openSamplePaper();
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Show Welcome Tour',
          click: () => {
            mainWindow?.webContents.send('tour:show');
          },
        },
        {
          label: 'Check for Updates…',
          click: async () => {
            if (!mainWindow) return;
            const status = await manualCheckForUpdates();
            const { dialog } = require('electron') as typeof import('electron');
            // Turn the updater state into a one-sentence summary the user can
            // read and dismiss — no need for a toast system here.
            const headline =
              status.state === 'up-to-date'
                ? "You're on the latest version."
                : status.state === 'available'
                  ? `Version ${status.version} is available and downloading in the background.`
                  : status.state === 'ready'
                    ? `Version ${status.version} is ready. Restart Fathom to apply.`
                    : status.state === 'downloading'
                      ? 'Downloading the update…'
                      : status.state === 'error'
                        ? `Update check failed: ${status.message ?? 'unknown error'}`
                        : 'Checking…';
            void dialog.showMessageBox(mainWindow, {
              type: 'none',
              message: headline,
              buttons: ['OK'],
              defaultId: 0,
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Reveal Log File in Finder',
          click: () => {
            const p = logFilePath();
            if (existsSync(p)) shell.showItemInFolder(p);
            else shell.openPath(dirname(p));
          },
        },
        {
          label: 'Copy Log File Path',
          click: () => {
            const { clipboard } = require('electron') as typeof import('electron');
            clipboard.writeText(logFilePath());
          },
        },
        { type: 'separator' },
        {
          label: 'Report an Issue…',
          click: () => {
            shell.openExternal('https://github.com/ashryaagr/Fathom/issues/new');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * First time anyone launches Fathom we greet them with a brief native dialog —
 * confirms the Gatekeeper approval worked, names the core gesture, and points
 * them at Open PDF. Deliberately tiny: we want to be out of their way. A full
 * in-app welcome tour is a separate concern.
 */
async function maybeShowFirstRunWelcome(win: BrowserWindow): Promise<void> {
  const settings = readSettings();
  if (settings.firstRunCompletedAt) return;

  const result = await dialog.showMessageBox(win, {
    type: 'none',
    icon: join(__dirname, '../../resources/icon.png'),
    title: 'Welcome to Fathom',
    message: 'You’re in.',
    detail:
      'Fathom is a PDF reader for research papers. The one thing you need to know:\n\n' +
      '    • Hold ⌘ (Command) and pinch on any passage.\n' +
      '    • The page gives way to a full-screen lens with a streaming, grounded explanation.\n' +
      '    • Pinch a phrase inside the lens to dive deeper. Swipe back to return.\n\n' +
      'Tip: right-click the Fathom icon in the Dock and choose Options → Keep in Dock so it’s a click away.',
    buttons: ['Try with sample paper', 'Open a PDF…', 'Later'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  writeSettings({ firstRunCompletedAt: new Date().toISOString() });

  if (result.response === 0) {
    await openSamplePaper();
  } else if (result.response === 1) {
    // Forward to the existing open-PDF path so the welcome exits straight into
    // the core interaction the user was promised.
    win.webContents.send('pdf:openRequest');
  }
}

// macOS sends `open-file` when a user drags a PDF onto the Fathom dock icon
// or chooses Open With → Fathom in Finder. If the window is not up yet, we
// queue the path and replay once it's ready.
const openFileQueue: string[] = [];
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('pdf:openExternal', filePath);
  } else {
    openFileQueue.push(filePath);
  }
});

/**
 * Surface a clear, actionable "Claude Code isn't working" dialog. Called at
 * startup if we can't find the CLI, and wherever a decompose / explain error
 * turns out to mean the same thing.
 */
async function showClaudeHealthDialog(win: BrowserWindow): Promise<void> {
  const status = checkClaude();
  if (status.ok) return;

  await dialog.showMessageBox(win, {
    type: 'warning',
    title: status.error ?? 'Claude Code CLI needed',
    message: status.error ?? 'Claude Code CLI needed',
    detail: status.suggestion ?? '',
    buttons: ['Open install instructions', 'OK'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }).then((r) => {
    if (r.response === 0) {
      shell.openExternal('https://docs.anthropic.com/en/docs/claude-code/overview');
    }
  });
}

app.whenReady().then(async () => {
  // File-logging first so any downstream init failures are captured for the user
  // to share via the Help menu instead of being eaten by the GUI's silent stdout.
  initLogging();
  // Find the Claude CLI and make sure its directory is in PATH before any
  // child_process.spawn('claude', …) happens — GUI-launched apps otherwise
  // miss `~/.local/bin` where the official installer puts it.
  const pathResult = ensureClaudeOnPath();
  console.log(
    `[startup] claude=${pathResult.path ?? 'NOT FOUND'} augmentedPath=${pathResult.addedDir ?? '(already on PATH)'}`,
  );
  buildAppMenu();
  // Eagerly initialize DB so a missing migration surfaces at startup, not on first explain.
  getDb();
  await createWindow();
  if (mainWindow) {
    // If Claude isn't usable, tell the user on arrival — no point waiting for
    // them to hit the failure through a pinch gesture 3 minutes in.
    await showClaudeHealthDialog(mainWindow);
    await maybeShowFirstRunWelcome(mainWindow);

    // Replay any PDFs the user dragged onto the dock icon / Open-With'd before
    // the window was ready.
    while (openFileQueue.length > 0) {
      const p = openFileQueue.shift()!;
      mainWindow.webContents.send('pdf:openExternal', p);
    }
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
