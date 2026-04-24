import type { BrowserWindow } from 'electron';
import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import electronUpdaterPkg from 'electron-updater';
const { autoUpdater } = electronUpdaterPkg;

/**
 * Custom auto-updater.
 *
 * The DMG + Squirrel.Mac default path doesn't work for us: we ad-hoc
 * sign, so the designated requirement across builds isn't stable, and
 * Squirrel refuses the in-place bundle swap with "code failed to satisfy
 * specified code requirement(s)". Rather than require every user to
 * manually re-install on every version bump, we ship our own updater:
 *
 *   1. Use `electron-updater` only for the check step — it knows how to
 *      parse `latest-mac.yml` from GitHub Releases, handle prereleases,
 *      etc. `autoDownload` is off; we never let Squirrel try to install.
 *
 *   2. On `update-available`, we download the ZIP artifact ourselves
 *      (not the DMG — the zip is a bare Fathom.app, no DMG wrapper).
 *
 *   3. On user click "Install", we spawn the bundled `install.sh` with
 *      `--from-zip <path> --wait-pid <pid> --relaunch` and immediately
 *      `app.quit()`. The script waits for us to exit, swaps the bundle,
 *      re-applies ad-hoc signing, clears quarantine, and relaunches the
 *      new version. One script is both our in-app updater and our
 *      `curl … | bash` installer — the update path is the same codepath
 *      as the first-time install.
 *
 * The renderer subscribes to `update:status` events via the preload and
 * renders the UpdateToast component.
 */

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number; transferred: number; total: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string; downloadUrl?: string };

let mainWindow: BrowserWindow | null = null;
let lastStatus: UpdateStatus = { state: 'up-to-date' };
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/** Path to the zip downloaded for the most recent `update-available` event.
 * Once set, the user clicking "Install" kicks the swap script against it. */
let stagedZipPath: string | null = null;
let stagedVersion: string | null = null;

function send(status: UpdateStatus): void {
  lastStatus = status;
  console.log(`[Fathom Updater] ${status.state}`, status);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (wc.isDestroyed()) return;
  wc.send('update:status', status);
}

export function getLastUpdateStatus(): UpdateStatus {
  return lastStatus;
}

/**
 * Resolve the bundled install.sh. In dev, it lives at the repo root. In a
 * packaged app, electron-builder copies it to `process.resourcesPath` via
 * the `extraResources` entry in electron-builder.config.cjs.
 */
function resolveInstallScript(): string {
  const candidates = [
    join(process.resourcesPath, 'install.sh'),
    resolve(app.getAppPath(), '..', '..', 'install.sh'),
    resolve(app.getAppPath(), 'install.sh'),
    resolve(__dirname, '..', '..', 'install.sh'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * Download a URL to a destination file, streaming and emitting
 * `download-progress` events via send(). Follows redirects (GitHub hands
 * out S3 presigned URLs).
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (p: { percent: number; transferred: number; total: number }) => void,
): Promise<void> {
  await mkdir(join(destPath, '..'), { recursive: true });
  return new Promise((resolveP, rejectP) => {
    const request = net.request({ method: 'GET', url, redirect: 'follow' });
    let total = 0;
    let transferred = 0;
    request.on('response', (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        rejectP(new Error(`download failed: HTTP ${response.statusCode}`));
        return;
      }
      const lenHeader = response.headers['content-length'];
      const lenStr = Array.isArray(lenHeader) ? lenHeader[0] : lenHeader;
      total = Number.parseInt(String(lenStr ?? '0'), 10) || 0;
      const out = createWriteStream(destPath);
      response.on('data', (chunk: Buffer) => {
        transferred += chunk.length;
        out.write(chunk);
        if (total > 0) {
          onProgress({
            percent: Math.min(99, Math.round((transferred / total) * 100)),
            transferred,
            total,
          });
        }
      });
      response.on('end', () => {
        out.end(() => {
          onProgress({ percent: 100, transferred, total });
          resolveP();
        });
      });
      response.on('error', rejectP);
    });
    request.on('error', rejectP);
    request.end();
  });
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Dev doesn't have a real installed bundle; skip.
  if (!app.isPackaged) {
    console.log('[Fathom Updater] skipping in dev (app is not packaged)');
    return;
  }

  // Squirrel is disarmed. We only use electron-updater for `check`.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (m: unknown) => console.log('[Fathom Updater]', m),
    warn: (m: unknown) => console.warn('[Fathom Updater]', m),
    error: (m: unknown) => console.error('[Fathom Updater]', m),
    debug: (m: unknown) => console.debug('[Fathom Updater]', m),
  } as unknown as (typeof autoUpdater)['logger'];

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));

  autoUpdater.on('update-available', async (info) => {
    send({
      state: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });

    // Download the zip ourselves, reporting progress. We don't use the
    // Squirrel-managed download because Squirrel would then try to install
    // via its own (broken-for-ad-hoc) path on quit.
    try {
      const arch = process.arch === 'x64' ? 'arm64' : process.arch;
      // Versionless asset path — electron-builder is configured to produce
      // Fathom-arm64.zip as a stable name, so the /latest/download URL is
      // always valid. Falls back to a versioned name if the latest-link
      // route 404s.
      const latestUrl = `https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-${arch}-mac.zip`;
      const versionedUrl = `https://github.com/ashryaagr/Fathom/releases/download/v${info.version}/Fathom-${arch}-mac.zip`;
      const zipPath = join(tmpdir(), `fathom-update-${info.version}.zip`);

      let succeeded = false;
      for (const url of [latestUrl, versionedUrl]) {
        try {
          await downloadFile(url, zipPath, (p) =>
            send({ state: 'downloading', ...p }),
          );
          succeeded = true;
          break;
        } catch (err) {
          console.warn(`[Fathom Updater] download from ${url} failed:`, err);
        }
      }
      if (!succeeded) throw new Error('all download URLs failed');

      stagedZipPath = zipPath;
      stagedVersion = info.version;
      send({ state: 'ready', version: info.version });
    } catch (err) {
      send({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
        downloadUrl:
          'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip',
      });
    }
  });

  autoUpdater.on('update-not-available', () => send({ state: 'up-to-date' }));

  autoUpdater.on('error', (err) =>
    send({
      state: 'error',
      message: err?.message ?? String(err),
      downloadUrl:
        'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip',
    }),
  );

  // Initial check, delayed so startup isn't slowed.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) =>
      send({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 3000);

  // Re-check every 6 hours while running.
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {
        /* silent — user sees nothing until the next check succeeds */
      });
    },
    6 * 60 * 60 * 1000,
  );
}

/** IPC handler — "Check for Updates…" from the menu or UI. */
export async function manualCheckForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return { state: 'up-to-date' };
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    send({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
      downloadUrl:
        'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip',
    });
  }
  return lastStatus;
}

/**
 * Run the install script against the staged zip and quit. The script
 * waits for our pid to exit, then performs the bundle swap and relaunches.
 * We spawn detached + stdio:ignore so the child survives our death.
 */
export async function quitAndInstall(): Promise<void> {
  if (!stagedZipPath || !existsSync(stagedZipPath)) {
    console.error('[Fathom Updater] quitAndInstall called with no staged zip');
    // Graceful degradation: open the download page.
    await shell.openExternal(
      'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64-mac.zip',
    );
    return;
  }

  const script = resolveInstallScript();
  if (!existsSync(script)) {
    console.error('[Fathom Updater] install.sh not found at', script);
    await shell.openExternal(
      'https://github.com/ashryaagr/Fathom/releases/latest',
    );
    return;
  }

  // install.sh lives in the app's resources dir on disk; it's readable
  // but may not be executable depending on how it was unpacked. Copy it to
  // a writable tmp path and chmod +x so `bash` can run it either way.
  const runnable = join(tmpdir(), `fathom-install-${Date.now()}.sh`);
  try {
    const body = await readFile(script, 'utf-8');
    await writeFile(runnable, body, 'utf-8');
    await chmod(runnable, 0o755);
  } catch (err) {
    console.error('[Fathom Updater] could not prepare install script:', err);
    await shell.openExternal(
      'https://github.com/ashryaagr/Fathom/releases/latest',
    );
    return;
  }

  const args = [
    runnable,
    '--from-zip',
    stagedZipPath,
    '--wait-pid',
    String(process.pid),
    '--relaunch',
  ];

  console.log('[Fathom Updater] spawning install script:', 'bash', args.join(' '));
  const child = spawn('bash', args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Give the helper a beat to start waiting for our pid, then quit.
  setTimeout(() => {
    console.log('[Fathom Updater] quitting to let installer swap bundle…');
    app.quit();
  }, 300);
}
