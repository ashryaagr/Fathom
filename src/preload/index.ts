import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Buffer pdf:openExternal messages that arrive before the React app
// mounts and registers a handler via `onOpenExternal`. Without this,
// Finder's "Open With → Fathom" launches with the user's chosen PDF
// fire `pdf:openExternal` before any listener exists in the renderer
// process, and the path is lost. The buffer is drained the first time
// a handler attaches.
const pendingExternalOpens: string[] = [];
let externalOpenHandlerAttached = false;
ipcRenderer.on('pdf:openExternal', (_evt, path: string) => {
  if (externalOpenHandlerAttached) return; // a real handler is already on it
  pendingExternalOpens.push(path);
});

export interface OpenedPdf {
  path: string;
  /** Absolute path to the lens metadata folder sitting next to the PDF
   * (e.g. `/Users/.../paper.pdf.lens/`). All lens state for this paper lives there. */
  indexDir: string;
  name: string;
  contentHash: string;
  bytes: ArrayBuffer;
}

export interface ExplainRequest {
  paperHash: string;
  regionId?: string;
  regionText: string;
  focusPhrase?: string;
  paperDigest?: string;
  paperText?: string;
  priorExplanations?: Array<{ depth: number; body: string; focusPhrase?: string | null }>;
  depth: number;
  customInstruction?: string;
  pdfPath?: string;
  page?: number;
  /** Absolute path to the saved zoom image — ground truth for what the user sees. */
  zoomImagePath?: string;
  /** PDF user-space bbox of the zoom target, for precise localization. */
  regionBbox?: { x: number; y: number; width: number; height: number };
  /** If set, resumes the Agent SDK session of the same UUID — used to keep
   * every Ask inside one lens in a single ongoing conversation. */
  resumeSessionId?: string;
  /** Stable lens id (focused.id in renderer). Required for the
   * lensId-keyed persistence path that fixes the legacy
   * regionId-only schema gap — every viewport-origin and
   * drill-origin lens should set this. */
  lensId?: string;
  /** Index of the turn being streamed inside the lens
   * (focused.turns.length - 1). Together with lensId forms the
   * primary key in lens_turns so a re-stream replaces rather than
   * duplicates. */
  turnIndex?: number;
}

export interface ExplainHandle {
  abort: () => void;
}

export interface ExplainCallbacks {
  onDelta: (text: string) => void;
  onProgress?: (text: string) => void;
  onPromptSent?: (prompt: string) => void;
  /** Fires once with the Agent SDK session id. Save it on the lens so
   * subsequent Asks can resume the same conversation. */
  onSessionId?: (sessionId: string) => void;
  onDone: (full: string) => void;
  onError: (message: string) => void;
}

export interface PaperState {
  paper: { content_hash: string; title: string | null; last_opened: number; digest_json: string | null };
  regions: Array<{
    id: string;
    paper_hash: string;
    page: number;
    parent_id: string | null;
    bbox_json: string | null;
    original_text: string;
    ordinal: number;
  }>;
  explanations: Array<{
    id: number;
    region_id: string;
    depth: number;
    focus_phrase: string | null;
    body: string;
    created_at: number;
    zoom_image_path: string | null;
  }>;
  highlights: Array<{
    id: string;
    paper_hash: string;
    page: number;
    rects_json: string;
    text: string | null;
    color: string;
    created_at: number;
  }>;
  drillEdges: Array<{
    id: number;
    paper_hash: string;
    parent_lens_id: string;
    child_lens_id: string;
    turn_index: number;
    selection: string;
    created_at: number;
  }>;
  lensAnchors: Array<{
    lens_id: string;
    paper_hash: string;
    origin: string;
    page: number;
    bbox_json: string | null;
    region_id: string | null;
    zoom_image_path: string | null;
    anchor_text: string | null;
    created_at: number;
  }>;
  lensTurns: Array<{
    lens_id: string;
    turn_index: number;
    question: string | null;
    body: string;
    prompt: string | null;
    session_id: string | null;
    zoom_image_path: string | null;
    created_at: number;
  }>;
  lensHighlights: Array<{
    id: string;
    lens_id: string;
    paper_hash: string;
    selected_text: string;
    color: string;
    created_at: number;
  }>;
}

const api = {
  openPdf: (): Promise<OpenedPdf | null> => ipcRenderer.invoke('pdf:open'),

  /** Ask main to materialise the bundled sample paper and hand back
   * its absolute path. The renderer then routes that path through
   * the normal `openPdfAtPath` flow, so the sample gets the same
   * indexing + state restoration as any user-supplied PDF. */
  openSample: (): Promise<{ path: string } | null> =>
    ipcRenderer.invoke('pdf:openSample'),

  /** Resolve the filesystem path of a dropped File. Electron 32+ removed
   * the non-standard `File.path` property; this is the sanctioned
   * replacement. Returns "" on renderer-synthesised files. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** Open a PDF at a specific local path — used by drag-and-drop and the
   * OS's Open-With / open-file flow. Returns null on bad paths. */
  openPdfAtPath: (path: string): Promise<OpenedPdf | null> =>
    ipcRenderer.invoke('pdf:openPath', path),

  /** Main process asking the renderer to pop the Finder dialog
   * (fires on File → Open PDF… from the app menu and from the first-run
   * dialog). */
  onOpenRequest: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('pdf:openRequest', listener);
    return () => ipcRenderer.removeListener('pdf:openRequest', listener);
  },

  /** Main process pushing a PDF at the renderer — fires for drag-on-dock,
   * Finder's Open With, and the Open Sample Paper flow.
   *
   * Race we have to handle: Finder's "Open With" launches Fathom and the
   * main process can fire `pdf:openExternal` BEFORE the React app has
   * mounted and called this function. Without buffering, the message
   * lands at preload-level `ipcRenderer.on` with no handler attached
   * and is silently dropped. We hold a small backlog inside preload and
   * flush it the first time a handler registers, so the user's
   * Open-With'd PDF actually opens. */
  onOpenExternal: (handler: (path: string) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, path: string) => handler(path);
    ipcRenderer.on('pdf:openExternal', listener);
    // Drain any paths that arrived before this handler was registered.
    if (pendingExternalOpens.length > 0) {
      const drained = pendingExternalOpens.splice(0);
      // Defer to a microtask so the caller's useEffect setup completes
      // before handler fires — keeps the React mount tree consistent.
      queueMicrotask(() => {
        for (const p of drained) handler(p);
      });
    }
    externalOpenHandlerAttached = true;
    return () => {
      ipcRenderer.removeListener('pdf:openExternal', listener);
      externalOpenHandlerAttached = false;
    };
  },

  /** Open Finder on the Fathom log file so a user can share it in one drag. */
  revealLogFile: (): Promise<void> => ipcRenderer.invoke('log:reveal'),

  /** Renderer → main log bridge. Use from any renderer-side codepath
   * where a failure is otherwise invisible to fathom.log (lens open
   * pipeline, error boundaries, gesture classifier). Lands as a
   * regular [<tag>] line in the main log. */
  logDev: (
    level: 'info' | 'warn' | 'error',
    tag: string,
    message: string,
    data?: unknown,
  ): Promise<void> => ipcRenderer.invoke('log:dev', { level, tag, message, data }),

  /** QA-harness offscreen capture. Returns the saved PNG path, or
   * empty string on failure. Uses webContents.capturePage so the
   * window can be hidden/occluded without breaking the shot. */
  qaCapture: (destPath?: string): Promise<string> =>
    ipcRenderer.invoke('qa:capture', destPath),

  /** QA-harness: dispatch a trigger event into the renderer so the
   * welcome card can open the sample paper without an osascript
   * button click. */
  onQaTriggerSample: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('qa:triggerSample', listener);
    return () => ipcRenderer.removeListener('qa:triggerSample', listener);
  },

  /** QA-harness gesture aliases. Each fires the same in-app code path
   * the corresponding window-level keyboard shortcut would, but
   * routed via a *global* shortcut so the QA agent doesn't have to
   * `tell app to activate` first (which yanks the user across
   * Spaces). Human users keep using ⌘⇧D / ⌘[ / ⌘] / ⌘,. */
  onQaTriggerDive: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('qa:triggerDive', listener);
    return () => ipcRenderer.removeListener('qa:triggerDive', listener);
  },
  onQaTriggerBack: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('qa:triggerBack', listener);
    return () => ipcRenderer.removeListener('qa:triggerBack', listener);
  },
  onQaTriggerForward: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('qa:triggerForward', listener);
    return () => ipcRenderer.removeListener('qa:triggerForward', listener);
  },

  // ---- settings (tiny JSON under userData) ----
  getSettings: (): Promise<{
    lastOpenDir?: string;
    firstRunCompletedAt?: string;
    tourCompletedAt?: string;
    extraDirectories?: string[];
    customInstructions?: string;
    focusLightBetaEnabled?: boolean;
  }> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: {
    extraDirectories?: string[];
    customInstructions?: string;
    focusLightBetaEnabled?: boolean;
  }): Promise<void> => ipcRenderer.invoke('settings:update', patch),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:pickDirectory'),
  markTourDone: (): Promise<void> => ipcRenderer.invoke('settings:markTourDone'),
  onShowTour: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('tour:show', listener);
    return () => ipcRenderer.removeListener('tour:show', listener);
  },
  onShowSettings: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on('settings:show', listener);
    return () => ipcRenderer.removeListener('settings:show', listener);
  },

  // ---- auto-updater ----
  checkForUpdates: (): Promise<{
    state: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
    version?: string;
    message?: string;
    downloadUrl?: string;
  }> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  getUpdateStatus: (): Promise<{
    state: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
    version?: string;
    message?: string;
    downloadUrl?: string;
  }> => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (
    handler: (status: {
      state: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
      version?: string;
      message?: string;
      downloadUrl?: string;
      percent?: number;
    }) => void,
  ): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: Parameters<typeof handler>[0]) =>
      handler(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },

  explain: (req: ExplainRequest, cb: ExplainCallbacks): Promise<ExplainHandle> =>
    (async () => {
      const { requestId, channel } = (await ipcRenderer.invoke('explain:start', req)) as {
        requestId: string;
        channel: string;
      };
      const listener = (
        _event: Electron.IpcRendererEvent,
        msg:
          | { type: 'delta'; text: string }
          | { type: 'progress'; text: string }
          | { type: 'prompt'; text: string }
          | { type: 'sessionId'; sessionId: string }
          | { type: 'done'; text: string }
          | { type: 'error'; message: string },
      ) => {
        if (msg.type === 'delta') cb.onDelta(msg.text);
        else if (msg.type === 'progress') cb.onProgress?.(msg.text);
        else if (msg.type === 'prompt') cb.onPromptSent?.(msg.text);
        else if (msg.type === 'sessionId') cb.onSessionId?.(msg.sessionId);
        else if (msg.type === 'done') {
          cb.onDone(msg.text);
          ipcRenderer.removeListener(channel, listener);
        } else if (msg.type === 'error') {
          cb.onError(msg.message);
          ipcRenderer.removeListener(channel, listener);
        }
      };
      ipcRenderer.on(channel, listener);
      return {
        abort: () => {
          ipcRenderer.invoke('explain:abort', requestId);
          ipcRenderer.removeListener(channel, listener);
        },
      };
    })(),

  paperState: (paperHash: string): Promise<PaperState | null> =>
    ipcRenderer.invoke('paper:state', paperHash),

  // ---- lens anchors (full lens-open registry) ----
  saveLensAnchor: (a: {
    lensId: string;
    paperHash: string;
    origin: string;
    page: number;
    bbox: { x: number; y: number; width: number; height: number } | null;
    regionId: string | null;
    zoomImagePath?: string | null;
    anchorText?: string | null;
  }): Promise<{ ok: true }> => ipcRenderer.invoke('lensAnchors:save', a),

  // ---- drill edges (in-lens markers) ----
  saveDrillEdge: (e: {
    paperHash: string;
    parentLensId: string;
    childLensId: string;
    turnIndex: number;
    selection: string;
  }): Promise<{ ok: true }> => ipcRenderer.invoke('drillEdges:save', e),

  // ---- highlights ----
  saveHighlight: (h: {
    id: string;
    paperHash: string;
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
    text?: string;
    color?: string;
  }): Promise<{ ok: true }> => ipcRenderer.invoke('highlights:save', h),

  deleteHighlight: (id: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke('highlights:delete', id),

  // ---- in-lens highlights (lens-body, not PDF page) ----
  saveLensHighlight: (h: {
    id: string;
    lensId: string;
    paperHash: string;
    selectedText: string;
    color?: string;
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('lensHighlights:save', h),

  deleteLensHighlight: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('lensHighlights:delete', id),

  saveRegions: (
    regions: Array<{
      id: string;
      paperHash: string;
      page: number;
      parentId: string | null;
      bbox: { x: number; y: number; width: number; height: number };
      text: string;
      ordinal: number;
    }>,
  ): Promise<number> => ipcRenderer.invoke('regions:save', regions),

  saveFigureImage: (req: {
    paperHash: string;
    filename: string;
    bytes: ArrayBuffer;
  }): Promise<{ path: string }> => ipcRenderer.invoke('paper:saveFigureImage', req),

  saveZoomImage: (req: {
    paperHash: string;
    lensId: string;
    bytes: ArrayBuffer;
  }): Promise<{ path: string }> => ipcRenderer.invoke('zoom:save', req),

  readAssetAsDataUrl: (path: string): Promise<string> =>
    ipcRenderer.invoke('asset:dataUrl', path),

  savePaperMarkdown: (req: {
    paperHash: string;
    markdown: string;
  }): Promise<{ indexPath: string; numPages: number }> =>
    ipcRenderer.invoke('paper:saveMarkdown', req),

  decomposePaper: (req: { paperHash: string; pdfPath: string; numPages: number }): Promise<{
    state: 'done' | 'cached' | 'error';
    message?: string;
  }> => ipcRenderer.invoke('paper:decompose', req),

  onDecomposeStatus: (
    handler: (status: {
      paperHash: string;
      state: 'running' | 'done' | 'cached' | 'error';
      message?: string;
    }) => void,
  ): (() => void) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      status: {
        paperHash: string;
        state: 'running' | 'done' | 'cached' | 'error';
        message?: string;
      },
    ) => handler(status);
    ipcRenderer.on('paper:decompose:status', listener);
    return () => ipcRenderer.removeListener('paper:decompose:status', listener);
  },
};

contextBridge.exposeInMainWorld('lens', api);

export type LensApi = typeof api;
