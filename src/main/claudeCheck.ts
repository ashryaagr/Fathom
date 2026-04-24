import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { app } from 'electron';

/**
 * Claude Code CLI plumbing.
 *
 * Two failure modes we see in production:
 *
 * 1. "`claude` isn't in PATH." Most users install via `curl -fsSL
 *    https://claude.ai/install.sh | sh` which puts it at `~/.local/bin/claude`.
 *    That's not in the PATH macOS gives to apps launched from Finder — GUI
 *    apps inherit the minimal PATH from `/usr/libexec/path_helper`, not your
 *    shell config. So the binary exists, but Fathom can't spawn it.
 *
 * 2. The CLI is present but not logged in. Any spawn succeeds, any real API
 *    call from the SDK fails with an auth error that makes no sense in the
 *    decompose toast ("error_during_execution") unless we translate it.
 *
 * This module handles both: locate the CLI, ensure its directory is on PATH,
 * and provide a user-readable health check we can surface on startup or when
 * a request fails.
 */

/** Well-known install locations, in priority order. First hit wins. */
const CANDIDATE_DIRS = [
  join(homedir(), '.local', 'bin'), // claude's official installer default
  join(homedir(), '.claude', 'bin'),
  '/opt/homebrew/bin', // Apple Silicon Homebrew
  '/usr/local/bin', // Intel Homebrew, npm global on Intel
  join(homedir(), 'bin'),
  join(homedir(), '.npm-global', 'bin'),
  '/usr/bin',
];

/** Absolute path to `claude` if we find it anywhere on disk, else null. */
export function findClaudeBinary(): string | null {
  for (const dir of CANDIDATE_DIRS) {
    const p = join(dir, 'claude');
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Return the absolute path to the `claude` binary the Agent SDK should spawn.
 *
 * Without this override, the SDK computes the path from its own
 * `import.meta.url`. When packaged, that resolves to a virtual location
 * inside `app.asar`. We DO unpack the binary to `app.asar.unpacked/` via
 * electron-builder, but the SDK doesn't know to look there — `spawn` tries
 * the asar-path, Node hits `app.asar` (a file), and fails with `ENOTDIR`.
 *
 * Resolution priority:
 *   1. The SDK's own bundled binary, rewritten to its unpacked location.
 *      We prefer this because its version is guaranteed to match the SDK.
 *   2. The user's installed Claude Code (from our findClaudeBinary walk).
 *      Used when the bundled binary is missing for any reason (dev runs
 *      without the native package installed, user deleted it, etc).
 *   3. `null` — caller falls back to the SDK default (which will fail),
 *      and the user gets the standard "Claude CLI needed" dialog.
 */
export function resolveClaudeExecutablePath(): string | null {
  // The arm64 / x64 platform-native package sits next to claude-agent-sdk in
  // node_modules. In the packaged app it's unpacked because of asarUnpack.
  const platformPkg =
    process.platform === 'darwin' && process.arch === 'arm64'
      ? 'claude-agent-sdk-darwin-arm64'
      : process.platform === 'darwin'
        ? 'claude-agent-sdk-darwin-x64'
        : null;

  if (platformPkg) {
    const candidates = app.isPackaged
      ? [
          join(
            process.resourcesPath,
            'app.asar.unpacked',
            'node_modules',
            '@anthropic-ai',
            platformPkg,
            'claude',
          ),
          // Fallback, in case someone mis-configures asarUnpack in the future.
          join(
            process.resourcesPath,
            'app.asar',
            'node_modules',
            '@anthropic-ai',
            platformPkg,
            'claude',
          ),
        ]
      : [
          join(
            app.getAppPath(),
            'node_modules',
            '@anthropic-ai',
            platformPkg,
            'claude',
          ),
        ];
    for (const p of candidates) {
      if (existsSync(p) && !p.includes('app.asar/')) {
        return p;
      }
    }
  }

  return findClaudeBinary();
}

/**
 * Augment process.env.PATH so the Claude Agent SDK's `spawn('claude', …)`
 * finds the binary even when Fathom was launched from Finder. Safe to call
 * multiple times — no duplicates added.
 */
export function ensureClaudeOnPath(): { found: boolean; path?: string; addedDir?: string } {
  const binary = findClaudeBinary();
  if (!binary) return { found: false };

  const dir = dirname(binary);
  const sep = process.platform === 'win32' ? ';' : ':';
  const current = (process.env.PATH ?? '').split(sep).filter(Boolean);
  if (current.includes(dir)) return { found: true, path: binary };

  process.env.PATH = [dir, ...current].join(sep);
  return { found: true, path: binary, addedDir: dir };
}

export interface ClaudeStatus {
  ok: boolean;
  /** Absolute path to the binary, if we located one. */
  path?: string;
  /** Version string the CLI printed, if it ran cleanly. */
  version?: string;
  /** User-readable headline for the failure. */
  error?: string;
  /** Actionable next-step copy to show in the UI. */
  suggestion?: string;
}

/**
 * Verify `claude` is installed AND responsive. Called at startup and whenever
 * we want to give a user a clear "why doesn't indexing work?" answer.
 *
 * We only check that `claude --version` runs; login state is checked lazily
 * via a live API call (translated by `translateClaudeError` below if it fails)
 * because `claude` doesn't expose a cheap login-check command.
 */
export function checkClaude(): ClaudeStatus {
  const found = findClaudeBinary();
  if (!found) {
    return {
      ok: false,
      error: 'Claude Code CLI not found.',
      suggestion:
        'Install it in Terminal:\n\n    curl -fsSL https://claude.ai/install.sh | sh\n\nThen log in:\n\n    claude login\n\nFathom uses your existing Claude Code authentication — no API key to paste.',
    };
  }
  try {
    const out = execFileSync(found, ['--version'], { timeout: 5000, encoding: 'utf-8' }).trim();
    return { ok: true, path: found, version: out };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      path: found,
      error: `Claude CLI was found at ${found} but couldn’t run.`,
      suggestion:
        `Try running it manually to see the real error:\n\n    ${found} --version\n\nIf that also fails, reinstalling usually fixes it:\n\n    curl -fsSL https://claude.ai/install.sh | sh\n\nUnderlying error:\n${message}`,
    };
  }
}

/**
 * Turn a raw Agent SDK / spawn error into a message we can confidently put
 * in a toast without confusing the user. Falls back to the original message
 * for anything we don't recognise — better to show something awkward than to
 * swallow novel failures silently.
 */
export function translateClaudeError(err: unknown): {
  message: string;
  suggestion?: string;
} {
  const raw = err instanceof Error ? err.message : String(err);

  if (/ENOENT.*claude|spawn claude ENOENT|Cannot find.*claude/i.test(raw)) {
    return {
      message: 'Fathom couldn’t find the `claude` CLI.',
      suggestion:
        'Install it with:\n    curl -fsSL https://claude.ai/install.sh | sh\nThen: `claude login`. Restart Fathom after installing.',
    };
  }
  if (/ENOTDIR/.test(raw)) {
    return {
      message: 'Fathom hit a working-directory error while spawning Claude.',
      suggestion:
        'This usually clears after a relaunch. If it keeps happening, open Help → Reveal Log File and share the log in an issue.',
    };
  }
  if (/401|403|unauthori[sz]ed|not.*logged.?in|login/i.test(raw)) {
    return {
      message: 'Claude is installed but not logged in.',
      suggestion: 'In Terminal, run:\n    claude login\n\nThen reopen the PDF.',
    };
  }
  if (/poppler|pdftoppm|pdftocairo|PDF reader couldn[’']?t render/i.test(raw)) {
    return {
      message: 'Claude needs poppler to read figures from the PDF.',
      suggestion: 'Install it with:\n    brew install poppler\n\nThen reopen the PDF.',
    };
  }
  if (/error_max_turns/.test(raw)) {
    return {
      message: 'Indexing ran out of steps before finishing.',
      suggestion:
        'This paper may be unusually long. Fathom will still work with degraded precision on figures; try pinching on a passage anyway.',
    };
  }
  return { message: raw };
}
