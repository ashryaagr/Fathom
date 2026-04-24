import { contextBridge, ipcRenderer } from 'electron';

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
}

const api = {
  openPdf: (): Promise<OpenedPdf | null> => ipcRenderer.invoke('pdf:open'),

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
   * Finder's Open With, and the Open Sample Paper flow. */
  onOpenExternal: (handler: (path: string) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, path: string) => handler(path);
    ipcRenderer.on('pdf:openExternal', listener);
    return () => ipcRenderer.removeListener('pdf:openExternal', listener);
  },

  /** Open Finder on the Fathom log file so a user can share it in one drag. */
  revealLogFile: (): Promise<void> => ipcRenderer.invoke('log:reveal'),

  // ---- settings (tiny JSON under userData) ----
  getSettings: (): Promise<{
    lastOpenDir?: string;
    firstRunCompletedAt?: string;
    tourCompletedAt?: string;
    extraDirectories?: string[];
    customInstructions?: string;
  }> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: {
    extraDirectories?: string[];
    customInstructions?: string;
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
