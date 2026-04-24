import { app } from 'electron';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, WriteStream } from 'node:fs';
import { join } from 'node:path';

/**
 * File-based logging so users can share logs when something goes wrong — no
 * need to open DevTools, no need to re-launch from Terminal to capture stdout.
 *
 * Every `console.log` / `.warn` / `.error` / `.debug` call still prints to stdout
 * (so `npm run dev` keeps working) but is *also* written to a rotating log file
 * at `~/Library/Logs/Fathom/fathom.log`. One previous rotation is kept as
 * `fathom.log.1` so we can see the last two sessions if a crash overwrote
 * something.
 *
 * Expose the log path via `logFilePath()` and reveal it via the app menu
 * ("Help → Reveal Log File") so a user submitting a bug report can attach it
 * in one click.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file, two rotations.
let currentStream: WriteStream | null = null;
let currentPath = '';
let originalConsole: {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
  debug: typeof console.debug;
  info: typeof console.info;
} | null = null;

function logDir(): string {
  // macOS convention; also correct on Linux (~/.config/Fathom/logs). On Windows,
  // Electron's 'logs' path resolves under %APPDATA% which is fine.
  return app.getPath('logs');
}

function rotateIfNeeded(): void {
  if (!currentPath) return;
  try {
    if (!existsSync(currentPath)) return;
    const st = statSync(currentPath);
    if (st.size < MAX_BYTES) return;
  } catch {
    return;
  }
  try {
    const rotated = `${currentPath}.1`;
    if (existsSync(rotated)) {
      const { unlinkSync } = require('node:fs') as typeof import('node:fs');
      unlinkSync(rotated);
    }
    renameSync(currentPath, rotated);
  } catch {
    /* rotation is best-effort — logging must never throw */
  }
}

function openStream(): void {
  const dir = logDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  currentPath = join(dir, 'fathom.log');
  rotateIfNeeded();
  currentStream = createWriteStream(currentPath, { flags: 'a' });
  currentStream.on('error', (err) => {
    if (originalConsole) originalConsole.error('[logger] stream error:', err);
  });
}

function fmt(level: string, args: unknown[]): string {
  const ts = new Date().toISOString();
  const body = args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return `[${ts}] [${level}] ${body}\n`;
}

function write(level: string, args: unknown[]): void {
  if (!currentStream) return;
  try {
    currentStream.write(fmt(level, args));
  } catch {
    /* never let logging throw */
  }
}

/** Initialize file logging. Call once, after `app.whenReady()`. */
export function initLogging(): void {
  if (originalConsole) return; // idempotent
  openStream();

  originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
  };

  console.log = (...args: unknown[]) => {
    originalConsole!.log(...args);
    write('info', args);
  };
  console.info = (...args: unknown[]) => {
    originalConsole!.info(...args);
    write('info', args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole!.warn(...args);
    write('warn', args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole!.error(...args);
    write('error', args);
  };
  console.debug = (...args: unknown[]) => {
    originalConsole!.debug(...args);
    write('debug', args);
  };

  // Capture anything that would otherwise silently blow up.
  process.on('uncaughtException', (err) => {
    write('fatal', ['uncaughtException', err]);
    originalConsole!.error('[uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason) => {
    write('fatal', ['unhandledRejection', reason]);
    originalConsole!.error('[unhandledRejection]', reason);
  });

  // Helpful first line so a shared log has context about the session.
  write('info', [
    `=== Fathom ${app.getVersion()} launched`,
    `electron=${process.versions.electron}`,
    `node=${process.versions.node}`,
    `platform=${process.platform} ${process.arch}`,
    `packaged=${app.isPackaged}`,
    `PATH=${process.env.PATH?.split(':').slice(0, 6).join(':') ?? ''}…`,
    `===`,
  ]);
}

/** Absolute path to the active log file. */
export function logFilePath(): string {
  return currentPath || join(logDir(), 'fathom.log');
}
