// Post-pivot WhiteboardTab — a thin host adapter around the
// fathom-whiteboard <Whiteboard> component. The package owns the
// Excalidraw mount + chat input + persistence orchestration; this file
// exists solely to translate the package's WhiteboardHost interface
// onto Fathom's IPC surface (and to keep the pre-pivot import path in
// App.tsx working).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Whiteboard, type WhiteboardHost, type WhiteboardScene } from 'fathom-whiteboard/react';
import type { OpenDocument } from '../state/document';
import { useWhiteboardStore } from './store';

interface Props {
  document: OpenDocument;
}

// Tool toggles persisted across sessions. Mirrors clawdSlate's
// settings shape so users with both apps see the same behaviour:
// arxiv on, web search on, and a per-MCP-server map populated from
// the agent's session-init advertisement. Hugging Face on by
// default; everything else off.
type ToolSettings = {
  webSearch: boolean;
  arxiv: boolean;
  servers: Record<string, boolean>;
  availableTools: string[];
};

// v3: per-server map + availableTools snapshot.
const SETTINGS_KEY = 'fathom.whiteboardTools.v3';
const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  webSearch: true,
  arxiv: true,
  servers: {},
  availableTools: [],
};

function loadToolSettings(): ToolSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_TOOL_SETTINGS, servers: {}, availableTools: [] };
    const parsed = JSON.parse(raw) as Partial<ToolSettings>;
    return {
      webSearch: typeof parsed.webSearch === 'boolean' ? parsed.webSearch : true,
      arxiv: typeof parsed.arxiv === 'boolean' ? parsed.arxiv : true,
      servers:
        parsed.servers && typeof parsed.servers === 'object'
          ? { ...parsed.servers }
          : {},
      availableTools: Array.isArray(parsed.availableTools)
        ? parsed.availableTools
        : [],
    };
  } catch {
    return { ...DEFAULT_TOOL_SETTINGS, servers: {}, availableTools: [] };
  }
}

function saveToolSettings(s: ToolSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* localStorage full / disabled — ignore */
  }
}

function parseServerName(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null;
  const rest = toolName.slice(5);
  const lastSep = rest.lastIndexOf('__');
  if (lastSep === -1) return null;
  return rest.slice(0, lastSep);
}

function displayServerName(server: string): string {
  let s = server;
  if (s.startsWith('claude_ai_')) s = s.slice('claude_ai_'.length);
  return s.replace(/_/g, ' ');
}

function defaultServerEnabled(server: string): boolean {
  if (server === 'claude_ai_Hugging_Face') return true;
  return false;
}

function computeDisallowedTools(settings: ToolSettings): string[] {
  const disallowed: string[] = [];
  for (const tool of settings.availableTools) {
    const server = parseServerName(tool);
    if (!server) continue;
    if (server === 'excalidraw' || server === 'arxiv') continue;
    const enabled =
      settings.servers[server] !== undefined
        ? settings.servers[server]
        : defaultServerEnabled(server);
    if (!enabled) disallowed.push(tool);
  }
  return disallowed;
}

function groupToolsByServer(
  tools: string[],
): Array<{ server: string; tools: string[] }> {
  const groups = new Map<string, string[]>();
  for (const t of tools) {
    const s = parseServerName(t);
    if (!s) continue;
    if (s === 'excalidraw' || s === 'arxiv') continue;
    const arr = groups.get(s) ?? [];
    arr.push(t);
    groups.set(s, arr);
  }
  return Array.from(groups.entries())
    .map(([server, tools]) => ({ server, tools }))
    .sort((a, b) =>
      displayServerName(a.server).localeCompare(displayServerName(b.server)),
    );
}

function parseScene(json: string | null): WhiteboardScene | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { elements?: unknown[] };
    if (Array.isArray(parsed.elements)) {
      return { elements: parsed.elements as WhiteboardScene['elements'] };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function serializeScene(scene: WhiteboardScene): string {
  return JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'fathom-whiteboard',
      elements: scene.elements,
      appState: { viewBackgroundColor: '#ffffff' },
    },
    null,
    2,
  );
}

export default function WhiteboardTab({ document }: Props) {
  const setStatus = useWhiteboardStore((s) => s.setStatus);
  const paperHash = document.contentHash;
  const pdfPath = document.path;

  const [showSettings, setShowSettings] = useState(false);
  const [toolSettings, setToolSettings] = useState<ToolSettings>(() =>
    loadToolSettings(),
  );
  const toolSettingsRef = useRef<ToolSettings>(toolSettings);

  useEffect(() => {
    toolSettingsRef.current = toolSettings;
    saveToolSettings(toolSettings);
  }, [toolSettings]);

  // Hydrate availableTools from the main process's persisted snapshot on
  // mount so the popover can render per-server toggles even before the
  // user runs their first generation. Main-side discovery probe fires at
  // app start; this picks up its result.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tools = await window.lens.whiteboardGetAvailableTools();
        if (cancelled || !Array.isArray(tools) || tools.length === 0) return;
        setToolSettings((prev) =>
          prev.availableTools.length >= tools.length
            ? prev
            : { ...prev, availableTools: tools },
        );
      } catch {
        /* best-effort hydration */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Captures the tool list advertised at session init so the settings
  // popover can render per-server toggles. Held in a ref because the
  // host (built once in useMemo) closes over it.
  const handleAvailableToolsRef = useRef<(tools: string[]) => void>(() => {});
  handleAvailableToolsRef.current = (tools: string[]) => {
    setToolSettings((prev) => ({ ...prev, availableTools: tools }));
  };

  const host = useMemo<WhiteboardHost>(() => {
    const lens = window.lens;
    return {
      loadScene: async () => {
        const got = await lens.whiteboardGet(paperHash);
        setStatus(paperHash, (got.status as 'idle' | 'pass1' | 'pass2' | 'ready' | 'failed') ?? 'idle');
        const scene = parseScene(got.scene);
        if (!scene) return null;
        return { scene, mtimeMs: 0 };
      },
      saveScene: async (scene) => {
        await lens.whiteboardSaveScene(paperHash, serializeScene(scene));
      },
      loadViewport: async () => {
        return lens.whiteboardGetViewport(paperHash);
      },
      saveViewport: async (viewport) => {
        await lens.whiteboardSaveViewport(paperHash, viewport);
      },
      saveAsset: (filename, bytes) =>
        lens.whiteboardSaveAsset(paperHash, filename, bytes),
      generate: (cb, focus, abortController) => {
        setStatus(paperHash, 'pass2');
        return new Promise((resolve, reject) => {
          const tp = {
            webSearch: toolSettingsRef.current.webSearch,
            arxiv: toolSettingsRef.current.arxiv,
            disallowed: computeDisallowedTools(toolSettingsRef.current),
          };
          void lens
            .whiteboardGenerate(
              { paperHash, pdfPath, focus, tools: tp },
              {
                onLog: (line) => cb.onLog?.(line),
                onAvailableTools: (tools) =>
                  handleAvailableToolsRef.current(tools),
                onSceneStream: (elements) => {
                  const next: WhiteboardScene = {
                    elements: elements as WhiteboardScene['elements'],
                  };
                  cb.onScene?.(next);
                },
                onDone: ({ scene, totalCost }) => {
                  setStatus(paperHash, 'ready');
                  const parsed = parseScene(scene) ?? { elements: [] };
                  resolve({ scene: parsed, usd: totalCost });
                },
                onError: (msg) => {
                  setStatus(paperHash, 'failed');
                  reject(new Error(msg));
                },
              },
            )
            .then((handle) => {
              // Forward the caller's abort signal to the IPC abort.
              // Pipeline catches AbortError and resolves with [aborted]
              // — either way we let the existing onError/onDone path
              // settle the promise.
              abortController?.signal.addEventListener('abort', () => {
                handle.abort();
              });
            });
        });
      },
      refine: (currentScene, instruction, cb, abortController) => {
        return new Promise((resolve, reject) => {
          const tp = {
            webSearch: toolSettingsRef.current.webSearch,
            arxiv: toolSettingsRef.current.arxiv,
            disallowed: computeDisallowedTools(toolSettingsRef.current),
          };
          void lens
            .whiteboardRefine(
              {
                paperHash,
                pdfPath,
                sceneJson: serializeScene(currentScene),
                instruction,
                tools: tp,
              },
              {
                onLog: (line) => cb.onLog?.(line),
                onAvailableTools: (tools) =>
                  handleAvailableToolsRef.current(tools),
                onSceneStream: (elements) => {
                  const next: WhiteboardScene = {
                    elements: elements as WhiteboardScene['elements'],
                  };
                  cb.onScene?.(next);
                },
                onDone: ({ scene, totalCost }) => {
                  const parsed = parseScene(scene) ?? currentScene;
                  resolve({ scene: parsed, usd: totalCost });
                },
                onError: (msg) => reject(new Error(msg)),
              },
            )
            .then((handle) => {
              abortController?.signal.addEventListener('abort', () => {
                handle.abort();
              });
            });
        });
      },
      clear: async () => {
        await lens.whiteboardClear(paperHash);
        setStatus(paperHash, 'idle');
      },
    };
  }, [paperHash, pdfPath, setStatus]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <Whiteboard host={host} />
      <button
        onClick={() => setShowSettings((s) => !s)}
        title="Whiteboard tool settings"
        aria-label="Whiteboard tool settings"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 30,
          height: 30,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#86868b',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'saturate(180%) blur(8px)',
          WebkitBackdropFilter: 'saturate(180%) blur(8px)',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 7,
          cursor: 'pointer',
          zIndex: 60,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {showSettings && (
        <ToolSettingsPopover
          settings={toolSettings}
          onChange={setToolSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function ToolSettingsPopover({
  settings,
  onChange,
  onClose,
}: {
  settings: ToolSettings;
  onChange: (s: ToolSettings) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(
    () => groupToolsByServer(settings.availableTools),
    [settings.availableTools],
  );

  const toggleServer = (server: string, enabled: boolean) => {
    onChange({
      ...settings,
      servers: { ...settings.servers, [server]: enabled },
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{ position: 'absolute', inset: 0, zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-label="Whiteboard tool settings"
        style={{
          position: 'absolute',
          top: 48,
          right: 12,
          width: 320,
          maxHeight: 'calc(100vh - 70px)',
          overflowY: 'auto',
          padding: 14,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          border: '1px solid rgba(0,0,0,0.06)',
          zIndex: 71,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        <SectionLabel>Built-in tools</SectionLabel>
        <ToggleRow
          label="Web search & fetch"
          hint="Look up cited prior work; fetch URL contents."
          checked={settings.webSearch}
          onChange={(v) => onChange({ ...settings, webSearch: v })}
        />
        <ToggleRow
          label="arXiv"
          hint="Fetch research papers from arxiv.org by id or query."
          checked={settings.arxiv}
          onChange={(v) => onChange({ ...settings, arxiv: v })}
        />
        <SectionLabel style={{ marginTop: 14 }}>
          MCP servers from your Claude account
        </SectionLabel>
        {groups.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: '#86868b',
              padding: '8px 0 4px',
              lineHeight: 1.5,
            }}
          >
            None discovered yet. Generate the whiteboard once and the
            servers your Claude account has connected will appear here.
          </div>
        ) : (
          groups.map(({ server, tools }) => {
            const checked =
              settings.servers[server] !== undefined
                ? settings.servers[server]
                : defaultServerEnabled(server);
            return (
              <ToggleRow
                key={server}
                label={displayServerName(server)}
                hint={`${tools.length} tool${tools.length === 1 ? '' : 's'}`}
                checked={checked}
                onChange={(v) => toggleServer(server, v)}
              />
            );
          })
        )}
      </div>
    </>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#86868b',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 0',
        cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1d1d1f' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>{hint}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, cursor: 'pointer' }}
      />
    </label>
  );
}
