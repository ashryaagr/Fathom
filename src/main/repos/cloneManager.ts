import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { existsSync, statSync, readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { app } from 'electron';
import { GroundingRepos, type GroundingRepoRow } from '../db/repo';

/**
 * Clone manager — turns a user-pasted git URL into a local checkout
 * that Claude Code can Read/Grep/Glob during explain calls.
 *
 * Per `.claude/specs/github-repo-grounding.md`:
 *   - Public repos only in v1. Auth failure surfaces a friendly error
 *     and points at todo.md #53 (deferred SSH/PAT/OAuth work).
 *   - Default clone: `git clone --depth=50 --recurse-submodules` —
 *     50 commits is enough for blame on the recent history while
 *     keeping the on-disk size sane for the 500 MB guardrail.
 *   - Storage: `userData/repos/<sha256(url)>` so two URLs that
 *     normalize to the same content can't collide on the filesystem
 *     and so a path can never leak the URL string.
 *   - All output is streamed to fathom.log via console.log so a user
 *     reporting "my repo never finished cloning" hands us the log
 *     and we see the exact git output that failed.
 */

const CLONE_DEPTH = 50;
const SIZE_WARN_BYTES = 500 * 1024 * 1024; // 500 MB

/** Filesystem root for all cloned repos. Inside userData → never trips
 * macOS TCC, never collides with the user's own files. */
function reposRoot(): string {
  return join(app.getPath('userData'), 'repos');
}

/** Deterministic per-URL local-path slot. Hash the URL so:
 *  (a) different URLs never collide, even if they share a basename
 *      (e.g. `github.com/a/foo` vs `github.com/b/foo`),
 *  (b) the on-disk path doesn't leak the URL itself (mild privacy
 *      improvement — userData is a shared directory other tools may
 *      list), and
 *  (c) we can rebuild the path from the URL alone, so a row whose
 *      `local_path` got out of sync with disk can self-heal. */
export function localPathForUrl(url: string): string {
  const hash = createHash('sha256').update(url.trim()).digest('hex').slice(0, 32);
  return join(reposRoot(), hash);
}

/**
 * Lightweight URL validation. We accept anything that looks like a git
 * remote — https / ssh / git protocols. The actual reachability check
 * is the clone itself; this is just a guard against obvious garbage so
 * we don't spawn `git clone <user input>` on a SQL injection attempt.
 */
export function looksLikeGitUrl(raw: string): boolean {
  const url = raw.trim();
  if (url.length === 0 || url.length > 1024) return false;
  // No shell metacharacters that could escape the argv array. (We
  // pass via spawn argv anyway, but defense in depth.)
  if (/[\s;&|`$<>()\\]/.test(url)) return false;
  // https://, http://, git://, ssh://, or scp-style git@host:owner/repo
  if (/^https?:\/\//i.test(url)) return true;
  if (/^git(\+ssh)?:\/\//i.test(url)) return true;
  if (/^ssh:\/\//i.test(url)) return true;
  if (/^[\w.-]+@[\w.-]+:[\w./-]+/.test(url)) return true;
  return false;
}

/** Recursive directory size in bytes. Used after a clone to populate
 * `size_bytes` for the Preferences UI ("how much disk is this eating?")
 * and for the 500 MB warning. Errors per-entry are swallowed — a
 * partial estimate beats no estimate. */
function dirSizeBytes(root: string): number {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    let entries: Dirent[];
    try {
      // `withFileTypes: true` returns Dirent[]; the explicit cast keeps
      // TS happy across @types/node versions where the overload resolves
      // to a Buffer-flavoured Dirent.
      entries = readdirSync(next, { withFileTypes: true }) as unknown as Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry.name === 'string' ? entry.name : String(entry.name);
      const p = join(next, name);
      try {
        if (entry.isDirectory()) {
          stack.push(p);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          total += statSync(p).size;
        }
      } catch {
        // Permission errors / broken symlinks → skip silently.
      }
    }
  }
  return total;
}

/** Spawn `git` with the given args. Resolves to { code, stdout, stderr }.
 * We never inherit stdio because the Electron main process has no
 * tty; instead we capture the streams and write each line to
 * `fathom.log` via console.log so the user can attach the log on a
 * bug report. */
function runGit(
  args: string[],
  opts: { cwd?: string; logTag: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        // Disable interactive prompts (passwords, host-key approval)
        // so a private repo or first-time SSH host fails fast instead
        // of hanging the spawned process forever. v1 = public repos
        // only; auth flow is todo #53.
        GIT_TERMINAL_PROMPT: '0',
        // Belt-and-suspenders: also tell SSH itself never to prompt.
        GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdout += text;
      for (const line of text.split('\n')) {
        if (line.trim()) console.log(`[repos ${opts.logTag}] ${line.trimEnd()}`);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderr += text;
      // git writes progress to stderr — log as info, not warn, to keep
      // the noise level appropriate.
      for (const line of text.split('\n')) {
        if (line.trim()) console.log(`[repos ${opts.logTag}] ${line.trimEnd()}`);
      }
    });
    child.on('error', (err) => {
      resolve({ code: -1, stdout, stderr: stderr + String(err) });
    });
    child.on('close', (code) => {
      resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr });
    });
  });
}

/** Pattern-match git's stderr to a friendly user message. We try to
 * keep the wording short and actionable — the user is reading a paper,
 * not debugging git. */
function classifyGitError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (
    s.includes('authentication failed') ||
    s.includes('could not read username') ||
    s.includes('terminal prompts disabled') ||
    s.includes('permission denied') ||
    s.includes('repository not found')
  ) {
    return 'Private repos require authentication — coming soon (todo.md #53). v1 supports public repos only.';
  }
  if (s.includes('could not resolve host') || s.includes('failed to connect')) {
    return 'Network error — could not reach the git host. Check your connection and retry.';
  }
  if (s.includes('not a git repository') || s.includes('does not appear to be a git repository')) {
    return 'That URL does not look like a git repository.';
  }
  if (s.includes('disk full') || s.includes('no space left')) {
    return 'Out of disk space while cloning.';
  }
  // Trim the raw error to one line so the UI doesn't blow up.
  const firstLine = stderr.split('\n').find((l) => l.trim().length > 0)?.trim() ?? 'Clone failed';
  return firstLine.slice(0, 240);
}

/**
 * Clone a repo in the background. Marks the row as 'cloning', shells
 * out to `git clone`, then flips the row to 'ready' (with size) or
 * 'failed' (with error message). Idempotent against an already-existing
 * `local_path`: if the directory exists and looks like a git checkout,
 * we skip the clone and just refresh size + status.
 *
 * The caller is expected to have already inserted the row at
 * status='pending' and has the row id. We swallow all errors because
 * the renderer polls `listGroundingRepos` for the latest status — a
 * thrown error here would only surface in the log, never in the UI.
 */
export async function cloneRepoInBackground(repoId: number): Promise<void> {
  const row = GroundingRepos.getById(repoId);
  if (!row) {
    console.warn(`[repos] cloneRepoInBackground: row ${repoId} missing — abort`);
    return;
  }

  const logTag = `clone#${row.id}`;
  GroundingRepos.updateStatus({ id: row.id, status: 'cloning', error: null });

  // Idempotent re-add: if the slot already has a `.git` folder, treat
  // it as ready and just refresh the size. This is what makes
  // "Remove + Add same URL" instant on a second pass and what makes a
  // crash-then-restart not lose existing checkouts.
  if (existsSync(join(row.local_path, '.git'))) {
    console.log(`[repos ${logTag}] existing checkout at ${row.local_path} — reusing`);
    const size = dirSizeBytes(row.local_path);
    GroundingRepos.updateStatus({
      id: row.id,
      status: 'ready',
      sizeBytes: size,
      clonedAt: row.cloned_at ?? Date.now(),
      error: null,
    });
    return;
  }

  // Make sure the parent dir exists. The slot dir itself MUST NOT exist
  // (git clone refuses a non-empty target); rm -rf any half-finished
  // attempt from a prior failed run.
  try {
    await rm(row.local_path, { recursive: true, force: true });
  } catch {
    // Best-effort; if rm fails the clone will report it.
  }

  console.log(`[repos ${logTag}] starting: git clone ${row.url} -> ${row.local_path}`);
  const result = await runGit(
    [
      'clone',
      `--depth=${CLONE_DEPTH}`,
      '--recurse-submodules',
      '--shallow-submodules',
      // Single-branch keeps the on-disk size predictable; users who
      // want history on other branches can manually update later.
      '--single-branch',
      '--no-tags',
      row.url,
      row.local_path,
    ],
    { logTag },
  );

  if (result.code !== 0) {
    const friendly = classifyGitError(result.stderr || result.stdout);
    console.warn(`[repos ${logTag}] failed (exit ${result.code}): ${friendly}`);
    // Remove any partial checkout so a retry starts clean.
    try {
      await rm(row.local_path, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    GroundingRepos.updateStatus({
      id: row.id,
      status: 'failed',
      error: friendly,
      sizeBytes: 0,
    });
    return;
  }

  const size = dirSizeBytes(row.local_path);
  console.log(
    `[repos ${logTag}] done — ${(size / 1024 / 1024).toFixed(1)} MB at ${row.local_path}`,
  );
  if (size > SIZE_WARN_BYTES) {
    console.warn(
      `[repos ${logTag}] WARNING: ${(size / 1024 / 1024).toFixed(0)} MB exceeds ${(SIZE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB soft limit`,
    );
  }
  GroundingRepos.updateStatus({
    id: row.id,
    status: 'ready',
    sizeBytes: size,
    clonedAt: Date.now(),
    error: null,
  });
}

/**
 * Run `git pull` against an existing clone. Used by the "Update" button
 * in Preferences. Re-uses the same status flow as a fresh clone so the
 * UI spinner logic doesn't need a separate code path.
 *
 * If the local dir is missing (user manually deleted it, or the slot
 * never finished cloning), we fall back to a fresh `cloneRepoInBackground`.
 */
export async function updateRepoInBackground(repoId: number): Promise<void> {
  const row = GroundingRepos.getById(repoId);
  if (!row) {
    console.warn(`[repos] updateRepoInBackground: row ${repoId} missing`);
    return;
  }
  if (!existsSync(join(row.local_path, '.git'))) {
    console.log(`[repos update#${row.id}] no checkout on disk — falling back to clone`);
    await cloneRepoInBackground(repoId);
    return;
  }

  const logTag = `update#${row.id}`;
  GroundingRepos.updateStatus({ id: row.id, status: 'cloning', error: null });
  console.log(`[repos ${logTag}] git pull in ${row.local_path}`);
  const result = await runGit(
    ['pull', '--ff-only', '--recurse-submodules'],
    { cwd: row.local_path, logTag },
  );

  if (result.code !== 0) {
    const friendly = classifyGitError(result.stderr || result.stdout);
    console.warn(`[repos ${logTag}] update failed (exit ${result.code}): ${friendly}`);
    // Failed pull doesn't invalidate the existing checkout — leave the
    // local files alone and just mark the row 'ready' again with the
    // error attached so the UI can surface it without losing grounding.
    GroundingRepos.updateStatus({
      id: row.id,
      status: 'ready',
      error: `Update failed: ${friendly}`,
    });
    return;
  }

  const size = dirSizeBytes(row.local_path);
  console.log(`[repos ${logTag}] updated — ${(size / 1024 / 1024).toFixed(1)} MB`);
  GroundingRepos.updateStatus({
    id: row.id,
    status: 'ready',
    sizeBytes: size,
    clonedAt: Date.now(),
    error: null,
  });
}

/**
 * Remove a repo entirely: delete the row, then `rm -rf` the local
 * checkout. Order matters — wipe the row first so an in-flight clone's
 * subsequent updateStatus call no-ops, then take down the files. This
 * is racy with a concurrent clone subprocess, but the worst-case is a
 * brief disk-leak that the eviction job will catch.
 */
export async function removeRepo(repoId: number): Promise<void> {
  const row = GroundingRepos.getById(repoId);
  if (!row) return;
  GroundingRepos.remove(repoId);
  try {
    await rm(row.local_path, { recursive: true, force: true });
    console.log(`[repos] removed ${row.url} (${row.local_path})`);
  } catch (err) {
    console.warn(`[repos] removed row ${repoId} but failed to rm local path: ${String(err)}`);
  }
}

/**
 * Eviction job. Called once at app start. Walks `grounding_repos` for
 * rows whose `last_used_at` is older than `ttlMs` and removes them
 * (row + on-disk checkout). Default TTL is 30 days; the user can
 * change it in Preferences.
 *
 * Per the spec's "default-setting ethics" note, this DELETES user
 * data — so we log every eviction at INFO so the user can see in the
 * log exactly what got cleaned up, and the toggle to disable lives
 * in Preferences (settings.groundingRepoEvictionEnabled).
 */
export async function evictStaleRepos(args: {
  ttlMs: number;
  enabled: boolean;
}): Promise<{ evicted: GroundingRepoRow[] }> {
  if (!args.enabled) {
    console.log('[repos eviction] disabled by user setting — skipping');
    return { evicted: [] };
  }
  const cutoff = Date.now() - args.ttlMs;
  const stale = GroundingRepos.staleReady(cutoff);
  if (stale.length === 0) {
    console.log(
      `[repos eviction] nothing stale (TTL ${(args.ttlMs / 86400_000).toFixed(0)} days)`,
    );
    return { evicted: [] };
  }
  console.log(
    `[repos eviction] removing ${stale.length} stale repo(s) older than ${(args.ttlMs / 86400_000).toFixed(0)} days`,
  );
  for (const row of stale) {
    const lastUsed = row.last_used_at ?? row.cloned_at ?? row.created_at;
    const ageDays = ((Date.now() - lastUsed) / 86400_000).toFixed(1);
    console.log(`[repos eviction]   - ${row.url} (last used ${ageDays} days ago)`);
    await removeRepo(row.id);
  }
  return { evicted: stale };
}

/** Wrapper for the IPC handler. Inserts the row if needed, then kicks
 * off the clone in the background and returns immediately. The renderer
 * polls `listGroundingRepos` for the eventual status flip. */
export async function addRepo(url: string): Promise<{
  ok: true;
  id: number;
  status: GroundingRepoRow['clone_status'];
  reused: boolean;
} | { ok: false; error: string }> {
  if (!looksLikeGitUrl(url)) {
    return { ok: false, error: 'That does not look like a git URL.' };
  }
  const trimmed = url.trim();
  const existing = GroundingRepos.getByUrl(trimmed);
  if (existing) {
    // Idempotent re-add: if the existing row is already ready / cloning,
    // just return it. If it's failed, treat as a retry — kick off another
    // clone in the background.
    if (existing.clone_status === 'failed') {
      console.log(`[repos] retry: ${trimmed} (row ${existing.id})`);
      void cloneRepoInBackground(existing.id);
      return { ok: true, id: existing.id, status: 'cloning', reused: true };
    }
    return { ok: true, id: existing.id, status: existing.clone_status, reused: true };
  }

  const localPath = localPathForUrl(trimmed);
  const id = GroundingRepos.add({ url: trimmed, localPath });
  console.log(`[repos] add: ${trimmed} (row ${id}, slot ${localPath})`);
  // Fire and forget — clone runs in the background; UI polls.
  void cloneRepoInBackground(id);
  return { ok: true, id, status: 'pending', reused: false };
}
