/**
 * Renderer-side log helper that mirrors to `~/Library/Logs/Fathom/fathom.log`.
 *
 * Motivation: most lens + gesture + highlighter instrumentation calls
 * `console.log('[Lens] …')` today. That lands only in DevTools console —
 * invisible to anyone post-hoc, which is how a "white screen" crash slipped
 * through unlogged. `devLog` writes to both places at once: the DevTools
 * console (unchanged for live debugging) AND the main-process log file
 * (via the `log:dev` IPC) so a user sharing their log captures the full
 * renderer timeline.
 *
 * Usage:
 *   devLog('Lens', 'commit start', { page, zoom });
 *   devLog.warn('Lens', 'zoom save failed', err);
 *   devLog.error('Lens', 'render crashed', { stack });
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, tag: string, message: string, data?: unknown): void {
  const prefix = `[${tag}]`;
  if (level === 'error') console.error(prefix, message, data ?? '');
  else if (level === 'warn') console.warn(prefix, message, data ?? '');
  else console.log(prefix, message, data ?? '');

  try {
    // Fire-and-forget — IPC failures shouldn't crash the caller. We
    // deliberately swallow the error: the console side above always
    // succeeds, so at minimum DevTools has the log.
    void window.lens?.logDev?.(level, tag, message, sanitize(data));
  } catch {
    /* preload not available — console log is enough. */
  }
}

/** Keep payloads small + serializable. Strips circular refs, stack
 * traces over ~4k, etc. */
function sanitize(data: unknown): unknown {
  if (data === undefined || data === null) return data;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: (data.stack ?? '').slice(0, 4000) };
  }
  try {
    const s = JSON.stringify(data);
    if (s.length > 8000) return { _truncated: true, preview: s.slice(0, 4000) };
    return JSON.parse(s);
  } catch {
    return { _unserialisable: String(data) };
  }
}

export const devLog = Object.assign(
  (tag: string, message: string, data?: unknown) => emit('info', tag, message, data),
  {
    info: (tag: string, message: string, data?: unknown) => emit('info', tag, message, data),
    warn: (tag: string, message: string, data?: unknown) => emit('warn', tag, message, data),
    error: (tag: string, message: string, data?: unknown) => emit('error', tag, message, data),
  },
);
