import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Auto-updater UI.
 *
 * The main-process updater ticks through states: checking → available →
 * downloading(%) → ready. This component subscribes to those transitions
 * and shows a toast at the bottom-left whenever there's something the user
 * should know about. Silent states (checking / up-to-date) render nothing.
 *
 * When the update is "ready", the toast offers a "Restart to install"
 * button that calls `quitAndInstall`. Dismissible; if dismissed, the
 * update still applies on the next normal quit via `autoInstallOnAppQuit`.
 */

type State =
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number; transferred: number; total: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string; downloadUrl?: string };

export default function UpdateToast() {
  const [status, setStatus] = useState<State | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Initial state fetch — in case the ready/downloading event fired
    // before we mounted.
    void window.lens.getUpdateStatus().then((s) => setStatus(s as State));
    return window.lens.onUpdateStatus((s) => {
      setStatus(s as State);
      // A fresh status is user-relevant; un-dismiss so newly-arriving
      // states (e.g. download completed → ready) reappear.
      setDismissed(false);
    });
  }, []);

  if (!status || dismissed) return null;

  // Silent states: don't bother the user.
  if (status.state === 'checking' || status.state === 'up-to-date') return null;

  return (
    <AnimatePresence>
      {true && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22 }}
          className="fixed bottom-6 left-6 z-[80] max-w-[320px] rounded-xl bg-[#1a1614] px-4 py-3 text-[12.5px] text-[#faf4e8] shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
        >
          {status.state === 'available' && (
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9832a"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                   className="flex-shrink-0 mt-0.5">
                <path d="M12 3 L12 15 M6 9 L12 15 L18 9" />
                <path d="M4 21 L20 21" />
              </svg>
              <div className="flex-1">
                <div className="font-medium leading-tight">
                  Fathom {status.version} is downloading
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  In the background. We'll tell you when it's ready.
                </div>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="ml-1 -mr-1 -mt-1 rounded p-1 text-white/40 hover:text-white/70"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {status.state === 'downloading' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium">
                  Downloading Fathom · {status.percent}%
                </span>
                <button
                  onClick={() => setDismissed(true)}
                  className="ml-2 text-white/40 hover:text-white/70"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full bg-[#c9832a]"
                  animate={{ width: `${status.percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {status.state === 'ready' && (
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9832a"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12 L11 15 L16 9" />
              </svg>
              <div className="flex-1">
                <div className="font-medium leading-tight">
                  Fathom {status.version} is ready
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  Restart Fathom to install the update.
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => void window.lens.installUpdate()}
                    className="rounded-full bg-[#c9832a] px-3 py-1 text-[11.5px] font-medium text-[#1a1614] hover:bg-[#e09a3d]"
                  >
                    Restart to install
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="rounded-full px-3 py-1 text-[11.5px] text-white/55 hover:text-white/85"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {status.state === 'error' && (
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef8c5a"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                   className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8 L12 13 M12 16 L12 16.01" />
              </svg>
              <div className="flex-1">
                <div className="font-medium leading-tight">Update couldn't download</div>
                <div className="mt-0.5 text-[11px] text-white/55 line-clamp-2">
                  {status.message}
                </div>
                {status.downloadUrl && (
                  <a
                    href={status.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-[11px] text-[#c9832a] underline-offset-2 hover:underline"
                  >
                    Download manually
                  </a>
                )}
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="ml-1 -mr-1 -mt-1 rounded p-1 text-white/40 hover:text-white/70"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
