// Post-pivot WhiteboardTab — a thin host adapter around the
// fathom-whiteboard <Whiteboard> component. The package owns the
// Excalidraw mount + chat input + persistence orchestration; this file
// exists solely to translate the package's WhiteboardHost interface
// onto Fathom's IPC surface (and to keep the pre-pivot import path in
// App.tsx working).

import React, { useMemo } from 'react';
import { Whiteboard, type WhiteboardHost, type WhiteboardScene } from 'fathom-whiteboard/react';
import type { OpenDocument } from '../state/document';
import { useWhiteboardStore } from './store';

interface Props {
  document: OpenDocument;
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
          void lens
            .whiteboardGenerate(
              { paperHash, pdfPath, focus },
              {
                onLog: (line) => cb.onLog?.(line),
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
          void lens
            .whiteboardRefine(
              {
                paperHash,
                pdfPath,
                sceneJson: serializeScene(currentScene),
                instruction,
              },
              {
                onLog: (line) => cb.onLog?.(line),
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
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Whiteboard host={host} />
    </div>
  );
}
