import { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { explain, type ExplainArgs } from './ai/client';
import { decomposePaper, digestToContext } from './ai/decompose';
import { getDb } from './db/schema';
import {
  Papers,
  Explanations,
  Regions,
  Highlights,
  DrillEdges,
  LensAnchors,
  LensTurns,
  LensHighlights,
} from './db/repo';
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

const PDF_CACHE_DIR = join(tmpdir(), 'lens-pdfs'); // kept as tmp fallback only

// --- Small settings store (last-opened folder, first-run flag, etc). ---
// One JSON file under Electron's userData dir. Never throws; corruption
// degrades gracefully to defaults so a bad settings file can't brick startup.
interface FathomSettings {
  lastOpenDir?: string;
  firstRunCompletedAt?: string;
  tourCompletedAt?: string;
  /** Folders the user wants Claude to search during explain calls
   * (in addition to the paper's own index). Examples: a sibling paper,
   * a codebase the paper references. Passed through as additionalDirectories. */
  extraDirectories?: string[];
  /** Free-form instruction appended to every explain prompt. */
  customInstructions?: string;
  /** Beta feature toggle: when true, the header gets a "Focus Light"
   * button that lets the user spotlight the column they're reading.
   * Off by default — must be explicitly enabled in Preferences. */
  focusLightBetaEnabled?: boolean;
  /** Words-per-minute the Focus Light advances at. Default 300
   * (average adult reading speed). Range clamped to [80, 800] in
   * the renderer to keep the slider usable. */
  focusLightWpm?: number;
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
 * Per-paper sidecar folder.
 *
 * v1 stored sidecars NEXT TO the PDF (`/path/to/paper.pdf.fathom/`). The
 * "paper + its state travel together" design was nice but triggered macOS
 * TCC permission prompts for every PDF sitting in ~/Desktop, ~/Documents,
 * or ~/Downloads — the three folders users actually keep papers in. Those
 * prompts were both annoying and privacy-invasive-looking to anyone not
 * familiar with macOS sandboxing.
 *
 * Now sidecars live under Electron's userData dir
 * (`~/Library/Application Support/Fathom/sidecars/<contentHash>/`), keyed
 * by SHA-256 of the PDF bytes, so the same paper on any path reuses the
 * same sidecar. No TCC prompts; no folder clutter next to the user's PDF.
 */
function resolveIndexDir(_pdfPath: string, contentHash: string): string {
  return join(app.getPath('userData'), 'sidecars', contentHash);
}

function indexDirFor(paperHash: string): string {
  return (
    indexDirByHash.get(paperHash) ??
    join(app.getPath('userData'), 'sidecars', paperHash)
  );
}

async function ensureIndexDir(pdfPath: string, contentHash: string): Promise<string> {
  const preferred = resolveIndexDir(pdfPath, contentHash);
  try {
    await mkdir(preferred, { recursive: true });
    indexDirByHash.set(contentHash, preferred);
    return preferred;
  } catch (err) {
    // userData should always be writable, but if something weird (full disk,
    // filesystem mount issue) blocks us, fall back to the OS tmp dir so the
    // app at least runs.
    console.warn(`Could not create ${preferred}, falling back to tmp:`, err);
    const fallback = join(PDF_CACHE_DIR, contentHash);
    await mkdir(fallback, { recursive: true });
    indexDirByHash.set(contentHash, fallback);
    return fallback;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Multi-window support — todo #38.
//
// Pre-v1.0.21 Fathom maintained a single `mainWindow` global, so opening
// a second PDF replaced the first. The user requested macOS-native
// multi-window: each PDF opens in its own BrowserWindow, switchable via
// the system Window menu, ⌘` (next-window), and the dock.
//
// `mainWindow` is preserved as a backwards-compat alias that points at
// the most-recently-created window — many existing call sites just want
// "any" window for safe sends and dialog parents, and rebinding 41
// reference sites at once would be brittle. New code should prefer:
//   • activeWindow()        → focused window, or fallback to any
//   • safeSendActive()      → dispatch IPC to the focused window
//   • safeBroadcast()       → dispatch IPC to all open windows
//   • createWindow(path?)   → spawn a new window, optionally pre-loaded
//                             with a PDF
const allWindows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;
const activeExplains = new Map<string, AbortController>();

/** The window the user is most likely interacting with: focused, else
 * any alive window in the registry, else null. Used for dialog parents
 * and as the default target for global shortcut deliveries. */
function activeWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && allWindows.has(focused) && !focused.isDestroyed()) {
    return focused;
  }
  for (const w of allWindows) {
    if (!w.isDestroyed()) return w;
  }
  return null;
}

/**
 * Send a message to the renderer only if the window AND its webContents
 * are still alive. Electron destroys webContents when the window closes,
 * and calling `send()` on a destroyed webContents throws
 * "Object has been destroyed" — which bubbles up as an uncaught exception
 * in main and can take the app down. Uses the most-recent mainWindow
 * pointer for back-compat with v1.0.x sites; new code should prefer
 * safeSendActive (focused-window-aware) or safeBroadcast (all windows).
 */
function safeSend(channel: string, ...args: unknown[]): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (wc.isDestroyed()) return;
  wc.send(channel, ...args);
}

/** Send an IPC message to the user's currently-focused Fathom window
 * (or any alive window if nothing has focus). Right thing for global
 * shortcuts and "user wants this in the foreground app" semantics. */
function safeSendActive(channel: string, ...args: unknown[]): void {
  const w = activeWindow();
  if (!w || w.webContents.isDestroyed()) return;
  w.webContents.send(channel, ...args);
}

/** Broadcast an IPC message to every alive Fathom window. Used by the
 * auto-updater so every open window sees the same "update available"
 * toast — single user, multiple workspaces, one product state. */
function safeBroadcast(channel: string, ...args: unknown[]): void {
  for (const w of allWindows) {
    if (w.isDestroyed()) continue;
    if (w.webContents.isDestroyed()) continue;
    w.webContents.send(channel, ...args);
  }
}

let autoUpdaterInitialized = false;

/** Open a new Fathom window. Pass `initialPdfPath` to pre-load a PDF
 * — used by the open-file event (drag onto dock, Open With → Fathom)
 * so each external file opens in its own window without disturbing
 * any existing windows. The path goes through the same
 * `pdf:openExternal` channel a fresh user-driven open uses, so the
 * preload buffer + onOpenExternal hydration race is already handled. */
async function createWindow(initialPdfPath?: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
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
  allWindows.add(win);
  mainWindow = win;
  win.on('closed', () => {
    allWindows.delete(win);
    if (mainWindow === win) {
      // Re-point the back-compat alias at any other alive window.
      mainWindow = null;
      for (const other of allWindows) {
        if (!other.isDestroyed()) {
          mainWindow = other;
          break;
        }
      }
    }
  });

  win.on('ready-to-show', () => {
    win.show();
    if (process.env.ELECTRON_RENDERER_URL) win.webContents.openDevTools({ mode: 'right' });
    // Init the auto-updater exactly once across the whole app lifetime.
    // Multi-window means many windows can be alive simultaneously; we
    // want one updater poll loop, not N. Updater events still need to
    // reach EVERY window, so we wrap the original window-targeted
    // initAutoUpdater in a thin BroadcastBrowserWindow that fans every
    // webContents.send to the registry.
    if (!autoUpdaterInitialized) {
      autoUpdaterInitialized = true;
      initAutoUpdater(broadcastBrowserWindow);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Initial PDF: send through the same channel as Open-With, so the
  // preload buffer (which holds messages until React mounts) catches
  // it and the renderer's onOpenExternal handler opens the file.
  if (initialPdfPath) {
    win.webContents.send('pdf:openExternal', initialPdfPath);
  }

  return win;
}

/** Tiny BrowserWindow-shaped object the auto-updater can target without
 * knowing about the registry. Forwards `webContents.send` to all alive
 * windows; the rest of the BrowserWindow surface is unused by the
 * updater so we can leave it minimal. Cast through `unknown` because
 * BrowserWindow's interface is large; the updater only touches
 * webContents.send. */
const broadcastBrowserWindow = {
  webContents: {
    send: (channel: string, ...args: unknown[]) => safeBroadcast(channel, ...args),
    isDestroyed: () => allWindows.size === 0,
  },
  isDestroyed: () => allWindows.size === 0,
} as unknown as BrowserWindow;

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

ipcMain.handle('pdf:open', async (event) => {
  // Use the WINDOW that called this IPC as the dialog parent — modal
  // sheets attach to that window, which is the right macOS behaviour
  // when multiple Fathom windows are open.
  const callerWindow = BrowserWindow.fromWebContents(event.sender) ?? activeWindow();
  if (!callerWindow) return null;
  const settings = readSettings();
  const defaultDir = settings.lastOpenDir && existsSync(settings.lastOpenDir)
    ? settings.lastOpenDir
    : app.getPath('downloads');
  const result = await dialog.showOpenDialog(callerWindow, {
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

// Renderer-triggered "give me the local path to the sample paper".
// Copies the bundled sample into userData (same location the menu
// flow uses) and hands the path back. The renderer then runs it
// through the same openPdf(path) pipeline as a drag-dropped PDF —
// no duplicated bootstrap logic here.
ipcMain.handle('pdf:openSample', async (): Promise<{ path: string } | null> => {
  const sourcePath = app.isPackaged
    ? join(process.resourcesPath, 'sample-paper.pdf')
    : join(__dirname, '../../resources/sample-paper.pdf');
  console.log(`[sample] IPC request, source=${sourcePath}`);
  if (!existsSync(sourcePath)) {
    console.warn(`[sample] not found at ${sourcePath}`);
    return null;
  }
  const destDir = app.getPath('userData');
  const destPath = join(destDir, 'Fathom — Short Tour.pdf');
  try {
    await mkdir(destDir, { recursive: true });
    if (!existsSync(destPath)) {
      const bytes = await readFile(sourcePath);
      await writeFile(destPath, bytes);
      console.log(`[sample] copied to ${destPath}`);
    } else {
      console.log(`[sample] reusing existing copy at ${destPath}`);
    }
  } catch (err) {
    console.warn('[sample] copy failed', err);
    return null;
  }
  return { path: destPath };
});

interface ExplainRequest extends Omit<ExplainArgs, 'abortController' | 'onDelta'> {
  paperHash: string;
  regionId?: string;
  pdfPath?: string;
  page?: number;
  // Lens-keyed persistence fields — added in v1.0.14 to fix the
  // schema gap where viewport-origin and drill-origin lenses (which
  // have no regionId) had their answers silently dropped because the
  // legacy `explanations` table requires region_id NOT NULL.
  lensId?: string;
  turnIndex?: number;
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

      // Pull user preferences fresh each call so edits take effect without
      // restarting the app. Filter out invalid paths so a stale entry doesn't
      // fail the whole request.
      const settings = readSettings();
      const extraDirectories = (settings.extraDirectories ?? []).filter(
        (d) => typeof d === 'string' && existsSync(d),
      );

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
        extraDirectories: extraDirectories.length > 0 ? extraDirectories : undefined,
        customInstructions: settings.customInstructions,
        resumeSessionId: (req as ExplainRequest & { resumeSessionId?: string }).resumeSessionId,
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
        onSessionId: (sessionId) => {
          if (sender.isDestroyed()) return;
          sender.send(channel, { type: 'sessionId', sessionId });
        },
      });
      const questionText = req.customInstruction ?? req.focusPhrase ?? null;
      const zoomImagePath =
        (req as ExplainRequest & { zoomImagePath?: string }).zoomImagePath ?? null;
      // Region-keyed persistence (legacy path, kept for back-compat with
      // already-saved data and for cached-region marker clicks that
      // hydrate by region id). Only fires when the lens is anchored to
      // a real PDF region.
      if (req.regionId) {
        try {
          Explanations.insert({
            regionId: req.regionId,
            depth: req.depth,
            focusPhrase: questionText,
            body: fullText,
            zoomImagePath,
          });
        } catch (e) {
          console.warn('failed to persist explanation', e);
        }
      }
      // Lens-keyed persistence — the universal path. Fires for every
      // lens that has a stable lensId (always true for region-origin
      // and the common viewport-origin path; the fallback Date.now()
      // path in PdfViewer also writes here, harmlessly orphaned across
      // sessions). The 5071-char drop the QA agent reported on v1.0.12
      // was this branch missing entirely; lens_turns now closes that
      // gap.
      if (req.lensId && typeof req.turnIndex === 'number' && fullText.length > 0) {
        try {
          LensTurns.upsert({
            lensId: req.lensId,
            turnIndex: req.turnIndex,
            question: questionText,
            body: fullText,
            zoomImagePath,
          });
        } catch (e) {
          console.warn('failed to persist lens turn', e);
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
// ── QA offscreen capture ─────────────────────────────────────────
// Captures the renderer's current pixels via webContents.capturePage
// and writes them to a caller-supplied path. Works with the window
// hidden or occluded — no screen-area capture, so the user's other
// apps aren't disrupted by flashes or focus steals. Only available
// in packaged builds where BrowserWindow is real.
ipcMain.handle('qa:capture', async (_e, destPath?: string): Promise<string> => {
  // Capture from the focused window when multiple are open — that's the
  // one the user (or QA agent) cares about. activeWindow() falls back
  // to any alive window if nothing is focused, which is also fine for
  // the headless QA case.
  const target = activeWindow();
  if (!target) return '';
  try {
    const image = await target.webContents.capturePage();
    // /tmp (not os.tmpdir(), which on macOS resolves to a per-user
    // /var/folders path) so the bash QA harness — which polls a
    // predictable shared location — can find what we wrote without
    // having to inherit the app's $TMPDIR.
    const out = destPath && destPath.startsWith('/')
      ? destPath
      : join('/tmp', 'fathom-shots', `${Date.now()}.png`);
    const dir = dirname(out);
    await mkdir(dir, { recursive: true });
    await writeFile(out, image.toPNG());
    return out;
  } catch (err) {
    console.warn('[QA] capture failed', err);
    return '';
  }
});

// Fires the sample-paper flow without needing the renderer's DOM
// button to be clickable. Used by the QA harness to bypass the
// accessibility-layer brittleness of osascript `click button "..."`.
// Targets the focused window so the QA agent doesn't disturb other
// open papers.
ipcMain.handle('qa:openSample', async (): Promise<string> => {
  try {
    safeSendActive('qa:triggerSample');
    return 'dispatched';
  } catch (err) {
    console.warn('[QA] openSample failed', err);
    return 'error';
  }
});

// Renderer → main log bridge. Renderer components (gesture handlers,
// lens pipeline, error boundaries) call window.lens.logDev(…) and the
// payload lands in fathom.log alongside the main-process lines. This
// closes the observability gap where a "white screen" crash was
// invisible to me because it only wrote to DevTools console.
ipcMain.handle(
  'log:dev',
  async (
    _e,
    payload: { level: 'info' | 'warn' | 'error'; tag: string; message: string; data?: unknown },
  ) => {
    const prefix = `[${payload.tag}]`;
    const body = payload.data ? ` ${JSON.stringify(payload.data)}` : '';
    const line = `${prefix} ${payload.message}${body}`;
    if (payload.level === 'error') console.error(line);
    else if (payload.level === 'warn') console.warn(line);
    else console.log(line);
  },
);

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
ipcMain.handle('settings:update', async (
  _event,
  patch: Partial<FathomSettings>,
) => {
  // Whitelist the keys the renderer is allowed to write, so a compromised
  // renderer can't scribble into things like `firstRunCompletedAt`.
  const allowed: Partial<FathomSettings> = {};
  if ('extraDirectories' in patch && Array.isArray(patch.extraDirectories)) {
    allowed.extraDirectories = patch.extraDirectories.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
  }
  if ('customInstructions' in patch) {
    allowed.customInstructions =
      typeof patch.customInstructions === 'string'
        ? patch.customInstructions
        : undefined;
  }
  if ('focusLightBetaEnabled' in patch) {
    allowed.focusLightBetaEnabled =
      typeof patch.focusLightBetaEnabled === 'boolean'
        ? patch.focusLightBetaEnabled
        : undefined;
  }
  if ('focusLightWpm' in patch) {
    const n = patch.focusLightWpm;
    allowed.focusLightWpm =
      typeof n === 'number' && Number.isFinite(n) ? Math.max(80, Math.min(800, Math.round(n))) : undefined;
  }
  writeSettings(allowed);
});
ipcMain.handle('settings:pickDirectory', async (event) => {
  // Anchor the directory picker to the calling window so the modal
  // sheet attaches to the right Fathom window in multi-window mode.
  const callerWindow = BrowserWindow.fromWebContents(event.sender) ?? activeWindow();
  if (!callerWindow) return null;
  const result = await dialog.showOpenDialog(callerWindow, {
    title: 'Choose a folder Fathom can search',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
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
  await quitAndInstall();
});
ipcMain.handle('update:status', async () => getLastUpdateStatus());

ipcMain.handle('paper:state', async (_event, paperHash: string) => {
  const paper = Papers.get(paperHash);
  if (!paper) return null;
  return {
    paper,
    regions: Regions.byPaper(paperHash),
    explanations: Explanations.byPaper(paperHash),
    highlights: Highlights.byPaper(paperHash),
    drillEdges: DrillEdges.byPaper(paperHash),
    lensAnchors: LensAnchors.byPaper(paperHash),
    lensTurns: LensTurns.byPaper(paperHash),
    lensHighlights: LensHighlights.byPaper(paperHash),
  };
});

ipcMain.handle(
  'lensHighlights:save',
  async (
    _event,
    req: {
      id: string;
      lensId: string;
      paperHash: string;
      selectedText: string;
      color?: string;
    },
  ): Promise<{ ok: boolean }> => {
    try {
      LensHighlights.insert(req);
      return { ok: true };
    } catch (err) {
      console.warn('[lensHighlights:save] failed', err);
      return { ok: false };
    }
  },
);

ipcMain.handle('lensHighlights:delete', async (_event, id: string): Promise<{ ok: boolean }> => {
  try {
    LensHighlights.delete(id);
    return { ok: true };
  } catch (err) {
    console.warn('[lensHighlights:delete] failed', err);
    return { ok: false };
  }
});

// Persist a lens-anchor row on every lens open. Decoupled from
// `explanations` (which only exists once the user asks Claude
// something) so a "zoom + close without asking" lens still keeps
// its zoom image path and bbox across sessions. Upserts on
// `lens_id` so re-opening the same lens just refreshes the
// timestamp and any newly-known fields.
ipcMain.handle(
  'lensAnchors:save',
  async (
    _event,
    a: {
      lensId: string;
      paperHash: string;
      origin: string;
      page: number;
      bbox: { x: number; y: number; width: number; height: number } | null;
      regionId: string | null;
      zoomImagePath?: string | null;
      anchorText?: string | null;
    },
  ) => {
    LensAnchors.upsert(a);
    return { ok: true };
  },
);

// Persist a single drill edge — written from the renderer the moment
// the user pinches on a phrase inside a parent lens. The edge is what
// drives in-lens markers (the recursive equivalent of PDF-page
// markers).
ipcMain.handle(
  'drillEdges:save',
  async (
    _event,
    e: {
      paperHash: string;
      parentLensId: string;
      childLensId: string;
      turnIndex: number;
      selection: string;
    },
  ) => {
    DrillEdges.insert(e);
    return { ok: true };
  },
);

// ---- Highlights IPC ----
ipcMain.handle(
  'highlights:save',
  async (
    _event,
    h: {
      id: string;
      paperHash: string;
      page: number;
      rects: Array<{ x: number; y: number; width: number; height: number }>;
      text?: string;
      color?: string;
    },
  ) => {
    Highlights.insert(h);
    return { ok: true };
  },
);

ipcMain.handle('highlights:delete', async (_event, id: string) => {
  Highlights.delete(id);
  return { ok: true };
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
 * Copy the bundled sample PDF into a user-writable location (not ~/Documents,
 * which TCC blocks without a permission prompt — and blocks silently on our
 * first attempt, which is why "Try with sample paper" used to fail without
 * any visible error). We use the app's userData dir, which is always
 * writable for our app and can still host the `.fathom` sidecar alongside.
 *
 * Idempotent: if the file is already there and unchanged, skip the copy and
 * just open it. Log the resolved paths so a user shipping us a log can see
 * exactly where the file was sourced and written.
 */
async function openSamplePaper(): Promise<void> {
  // Targets the user's currently-focused window. If no window is open
  // (rare — dock-click on macOS recreates one), spawn a new one with
  // the sample as its initial PDF. The previous code returned early
  // here, which silently no-op'd if the user had closed all windows.
  const target = activeWindow();
  // Source: in production under Resources/ next to the .app; in dev the same
  // relative path resolves into the repo's resources/ folder.
  const sourcePath = app.isPackaged
    ? join(process.resourcesPath, 'sample-paper.pdf')
    : join(__dirname, '../../resources/sample-paper.pdf');
  console.log(`[sample] source=${sourcePath}`);
  if (!existsSync(sourcePath)) {
    if (target) {
      void dialog.showMessageBox(target, {
        type: 'info',
        message: 'Sample paper missing',
        detail: `Expected at ${sourcePath}. This is a build problem — please open an issue.`,
        buttons: ['OK'],
      });
    }
    return;
  }

  // userData is the app's private Library folder — always writable, no TCC
  // prompts. Sidecar goes next to the PDF here, same as for user-opened PDFs.
  const destDir = app.getPath('userData');
  const destPath = join(destDir, 'Fathom — Short Tour.pdf');
  try {
    await mkdir(destDir, { recursive: true });
    const src = await readFile(sourcePath);
    const needsWrite =
      !existsSync(destPath) || Buffer.compare(src, await readFile(destPath)) !== 0;
    if (needsWrite) {
      await writeFile(destPath, src);
      console.log(`[sample] copied to ${destPath} (${src.length} bytes)`);
    } else {
      console.log(`[sample] reusing existing copy at ${destPath}`);
    }
  } catch (err) {
    console.error('[sample] copy failed:', err);
    if (target) {
      void dialog.showMessageBox(target, {
        type: 'error',
        message: "Couldn't open the sample paper",
        detail: `${err instanceof Error ? err.message : String(err)}\n\nIf the problem persists, Help → Reveal Log File and share the log.`,
        buttons: ['OK'],
      });
    }
    return;
  }
  // If a window is already in front, deliver the path to it; otherwise
  // open a new window pre-loaded with the sample.
  if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) {
    target.webContents.send('pdf:openExternal', destPath);
  } else {
    void createWindow(destPath);
  }
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    // Custom Fathom app menu (replaces the default appMenu role) so we can
    // put Preferences… in the macOS-canonical location under the app name.
    {
      label: 'Fathom',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => safeSendActive('settings:show'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          // todo #38 — Cmd+N opens a fresh empty Fathom window. Each
          // window has its own document/lens/highlight state because
          // each BrowserWindow gets its own renderer process and
          // therefore its own Zustand stores. macOS Window menu lists
          // the open windows; Cmd+` cycles between them.
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void createWindow();
          },
        },
        {
          label: 'Open PDF…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            safeSendActive('pdf:openRequest');
          },
        },
        {
          label: 'Open Sample Paper',
          click: () => {
            void openSamplePaper();
          },
        },
        { type: 'separator' },
        // Users who expect macOS-convention look here first (File is the
        // most-read menu); keep the accelerator the same as the app-menu
        // one so `⌘,` always works.
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => safeSendActive('settings:show'),
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
            safeSendActive('tour:show');
          },
        },
        {
          label: 'Check for Updates…',
          click: async () => {
            const target = activeWindow();
            if (!target) return;
            const status = await manualCheckForUpdates();
            // Re-check after the await — the user could have closed the
            // window while the check was in flight, and
            // dialog.showMessageBox on a destroyed BrowserWindow throws
            // "Object has been destroyed" which bubbles up as a fatal
            // uncaught exception (this was the root cause of the
            // "whole screen went white" crash the user reported).
            const stillTarget = activeWindow();
            if (!stillTarget) return;
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
            void dialog.showMessageBox(stillTarget, {
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
 * First-run greeting has moved into the renderer's EmptyState welcome
 * card — cream paper, handwritten brand, two balanced buttons. The old
 * native `dialog.showMessageBox` version fires on top of that card and
 * ends up offering the same two options twice, which is exactly the
 * "why do I see this menu" confusion the user reported. This function
 * stays as a silent flag-setter so other code that keys off
 * `firstRunCompletedAt` continues to work; no UI fires from here.
 */
async function maybeShowFirstRunWelcome(_win: BrowserWindow): Promise<void> {
  const settings = readSettings();
  if (settings.firstRunCompletedAt) return;
  writeSettings({ firstRunCompletedAt: new Date().toISOString() });
}

// macOS sends `open-file` when a user drags a PDF onto the Fathom dock icon
// or chooses Open With → Fathom in Finder. If the window is not up yet, we
// queue the path and replay once it's ready.
//
// Critical: on a COLD launch (Fathom not running, user clicks Open With),
// the open-file event is dispatched DURING `will-finish-launching` —
// before app.whenReady resolves and before any module-top-level
// listener has had a chance to settle. Registering the listener inside
// the will-finish-launching callback is the canonical Electron pattern
// for capturing the earliest possible delivery. Verified by debug
// breadcrumb: a top-level-only listener missed cold-launch events
// every time; moving inside will-finish-launching fixes it.
//
// We also enqueue any pdf-shaped path from process.argv at module
// load — this is a belt-and-suspenders fallback for cases where macOS
// passes the file as an arg instead of via open-file (some packaged
// builds / OS versions exhibit this).
//
// Debug breadcrumb to /tmp/fathom-openfile.log: always-on, persisted
// regardless of whether fathom.log has been initialized yet, so future
// "Open With doesn't work" reports are diagnosable without DevTools.
const openFileQueue: string[] = [];
function recordOpenFile(filePath: string, source: string): void {
  try {
    writeFileSync(
      '/tmp/fathom-openfile.log',
      `[${new Date().toISOString()}] ${source} path=${filePath} mainWindow=${mainWindow ? 'present' : 'null'}\n`,
      { flag: 'a' },
    );
  } catch {
    /* breadcrumb is best-effort */
  }
}
function handleExternalPdf(filePath: string, source: string): void {
  recordOpenFile(filePath, source);
  // Multi-window semantic (todo #38): each external file opens in its
  // own NEW window, never replacing what's already open. If the app
  // hasn't reached `whenReady` yet, queue and let the whenReady
  // handler create one window per queued path. If `app.isReady` is
  // already true (warm Open-With on a running app), spawn directly.
  if (app.isReady()) {
    void createWindow(filePath);
  } else {
    openFileQueue.push(filePath);
  }
}
app.on('will-finish-launching', () => {
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    handleExternalPdf(filePath, 'open-file');
  });
});
// Argv fallback. process.argv on macOS cold-launch sometimes carries
// the file path as the last argument; on Windows always does. Filter
// for `.pdf` to avoid mis-interpreting electron / asar args.
for (const arg of process.argv.slice(1)) {
  if (typeof arg === 'string' && arg.toLowerCase().endsWith('.pdf') && existsSync(arg)) {
    handleExternalPdf(arg, 'argv');
  }
}

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

// Reset process.cwd() to userData *before* any subprocess gets spawned.
// macOS launchers (Finder double-click, drag-onto-dock) can hand us a
// cwd of `~/Desktop`, `~/Documents`, or `~/Downloads`. Every child
// process Fathom spawns inherits that cwd by default — which means
// the Claude Code subprocess we run for explanations triggers a TCC
// permission prompt the first time it does *anything* in those dirs,
// even though we never want it to look there. Forcing cwd to userData
// (always safe, always writable, no TCC) at startup solves the whole
// class. Inherited cwd never leaks to a child again.
try {
  process.chdir(app.getPath('userData'));
} catch (err) {
  console.warn('[startup] could not chdir to userData', err);
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

  // Multi-window startup (todo #38). If the user launched Fathom with
  // one or more PDFs (Open With, drag-onto-dock, argv), open one window
  // PER queued path. If they launched empty, open a single empty
  // window so the welcome card shows.
  if (openFileQueue.length === 0) {
    await createWindow();
  } else {
    const queued = openFileQueue.splice(0);
    await createWindow(queued.shift());
    for (const p of queued) {
      void createWindow(p);
    }
  }

  // Health checks anchor to whichever window came up first. Subsequent
  // windows skip these (they're per-app concerns, not per-window).
  const first = activeWindow();
  if (first) {
    // If Claude isn't usable, tell the user on arrival — no point waiting for
    // them to hit the failure through a pinch gesture 3 minutes in.
    await showClaudeHealthDialog(first);
    await maybeShowFirstRunWelcome(first);

    // QA harness entry points. Global shortcuts fire regardless of
    // which app is frontmost, so the harness can drive a hidden
    // (`open -gj`) Fathom without stealing focus from the user's
    // other work on the same machine. F9 / F10 are free on stock
    // macOS — the Function-key chassis apps (volume, brightness)
    // use F11 / F12 / media glyphs.
    //
    // Each shortcut targets the FOCUSED window (via safeSendActive)
    // because in multi-window mode the user could have multiple papers
    // open and only wants the action to apply to the one in front.
    globalShortcut.register('CommandOrControl+Shift+F9', () => {
      safeSendActive('qa:triggerSample');
    });
    globalShortcut.register('CommandOrControl+Shift+F10', () => {
      const target = activeWindow();
      if (!target) return;
      const destPath = join('/tmp', 'fathom-shots', `${Date.now()}-qa.png`);
      void (async () => {
        try {
          const img = await target.webContents.capturePage();
          await mkdir(dirname(destPath), { recursive: true });
          await writeFile(destPath, img.toPNG());
          console.log('[QA] offscreen capture →', destPath);
        } catch (err) {
          console.warn('[QA] offscreen capture failed', err);
        }
      })();
    });
    // QA navigation globals — these mirror the in-window keyboard
    // shortcuts (⌘⇧D dive, ⌘[ back, ⌘] forward, ⌘, prefs) but are
    // *global* so the QA harness can drive Fathom without first
    // calling `tell app "Fathom" to activate` — that activate call
    // was yanking the user back to Fathom's Space whenever a QA
    // run happened on a separate display. F-key combos avoid
    // collisions with common app shortcuts. Human users keep using
    // the window-level shortcuts; these are agent-only.
    globalShortcut.register('CommandOrControl+Shift+F8', () => {
      safeSendActive('qa:triggerDive');
    });
    globalShortcut.register('CommandOrControl+Shift+F7', () => {
      safeSendActive('qa:triggerBack');
    });
    globalShortcut.register('CommandOrControl+Shift+F6', () => {
      safeSendActive('qa:triggerForward');
    });
    globalShortcut.register('CommandOrControl+Shift+F5', () => {
      safeSendActive('settings:show');
    });
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Release any global shortcuts we registered — macOS otherwise
// keeps them alive after the app quits, which would block the same
// key combo for other apps.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
