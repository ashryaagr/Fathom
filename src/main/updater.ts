import type { BrowserWindow } from 'electron';
import { app, shell } from 'electron';
import electronUpdaterPkg from 'electron-updater';
const { autoUpdater } = electronUpdaterPkg;

/**
 * Auto-updates against GitHub Releases.
 *
 * Flow from the user's perspective:
 *   1. App launches. 3 s later we quietly check GitHub for a newer release.
 *   2. If one exists, we download it silently in the background and then show a
 *      non-blocking toast: "Update to vX.Y.Z is ready — Restart".
 *   3. User clicks Restart → the app quits, the updater swaps the bundle, the new
 *      version launches.
 *   4. If the automated install fails (this can happen on an unsigned build because
 *      Gatekeeper refuses to replace an unsigned app), we fall back to opening the
 *      new release's DMG in the user's browser and tell them how to finish manually.
 *
 * The renderer subscribes to `update:status` events via the preload and renders the
 * UpdateToast component (see App.tsx).
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

function send(status: UpdateStatus): void {
  lastStatus = status;
  console.log(`[Fathom Updater] ${status.state}`, status);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update:status', status);
}

export function getLastUpdateStatus(): UpdateStatus {
  return lastStatus;
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Dev doesn't have a real installer; skip entirely.
  if (!app.isPackaged) {
    console.log('[Fathom Updater] skipping in dev (app is not packaged)');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (m: unknown) => console.log('[Fathom Updater]', m),
    warn: (m: unknown) => console.warn('[Fathom Updater]', m),
    error: (m: unknown) => console.error('[Fathom Updater]', m),
    debug: (m: unknown) => console.debug('[Fathom Updater]', m),
  } as unknown as (typeof autoUpdater)['logger'];

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send({
      state: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    }),
  );
  autoUpdater.on('update-not-available', () => send({ state: 'up-to-date' }));
  autoUpdater.on('download-progress', (progress) =>
    send({
      state: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send({ state: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    send({
      state: 'error',
      message: err?.message ?? String(err),
      downloadUrl:
        'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg',
    }),
  );

  // Kick off an initial check after the window is ready (don't block startup).
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) =>
      send({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 3000);

  // Re-check every 6 hours while the app is running.
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {
        /* ignore periodic failures; user sees nothing until next check succeeds */
      });
    },
    6 * 60 * 60 * 1000,
  );
}

/** IPC handler: manually triggered "Check for Updates…" from the app menu / UI. */
export async function manualCheckForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return { state: 'up-to-date' };
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    send({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
      downloadUrl:
        'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg',
    });
  }
  return lastStatus;
}

/** IPC handler: apply the downloaded update and restart. */
export function quitAndInstall(): void {
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    // If quitAndInstall fails (e.g. macOS refuses to swap an unsigned bundle),
    // open the DMG download in the browser as a fallback.
    console.error('[Fathom Updater] quitAndInstall failed:', err);
    shell.openExternal(
      'https://github.com/ashryaagr/Fathom/releases/latest/download/Fathom-arm64.dmg',
    );
  }
}
