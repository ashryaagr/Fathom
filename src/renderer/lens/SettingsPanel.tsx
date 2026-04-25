import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * A minimal preferences panel for the things a user most obviously wants to
 * control: which extra folders Claude is allowed to search during an
 * explanation (for grounding in other papers or a codebase), and a custom
 * standing instruction that gets appended to every explain call.
 *
 * Deliberately small. Not a kitchen-sink prefs dialog. These two levers
 * unlock a surprising amount of behavior — "point Fathom at the repo this
 * paper implements and explanations will cite the file and function" —
 * without needing a dozen configuration knobs.
 */

export interface FathomSettings {
  lastOpenDir?: string;
  firstRunCompletedAt?: string;
  tourCompletedAt?: string;
  extraDirectories?: string[];
  customInstructions?: string;
  focusLightBetaEnabled?: boolean;
}

export default function SettingsPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [dirs, setDirs] = useState<string[]>([]);
  const [newDir, setNewDir] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [focusLightBeta, setFocusLightBeta] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current settings when the panel opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = (await window.lens.getSettings()) as FathomSettings;
        if (cancelled) return;
        setDirs(s.extraDirectories ?? []);
        setCustomInstructions(s.customInstructions ?? '');
        setFocusLightBeta(!!s.focusLightBetaEnabled);
      } catch {
        // settings unreadable — start with defaults; saves will recreate the file
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const addDir = async () => {
    const picked = await window.lens.pickDirectory();
    if (picked) setDirs((d) => (d.includes(picked) ? d : [...d, picked]));
  };

  const addDirByPath = () => {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    setDirs((d) => (d.includes(trimmed) ? d : [...d, trimmed]));
    setNewDir('');
  };

  const removeDir = (p: string) => setDirs((d) => d.filter((x) => x !== p));

  const save = async () => {
    setSaving(true);
    try {
      await window.lens.updateSettings({
        extraDirectories: dirs,
        customInstructions: customInstructions.trim() || undefined,
        focusLightBetaEnabled: focusLightBeta,
      });
      // Notify the rest of the app — the header listens for this so the
      // Focus Light icon appears/disappears without needing a reload.
      window.dispatchEvent(new CustomEvent('fathom:settingsUpdated'));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.97, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="w-[560px] max-w-[90vw] rounded-2xl bg-[#faf4e8] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 px-7 py-5">
              <h2 className="text-[18px] font-medium tracking-tight text-[#1a1614]">
                Preferences
              </h2>
              <button
                onClick={onClose}
                className="text-[20px] text-black/40 hover:text-black/70"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-6 px-7 py-6">
              {/* Extra grounding directories */}
              <section>
                <h3 className="mb-1 text-[13.5px] font-medium text-[#1a1614]">
                  Extra grounding directories
                </h3>
                <p className="mb-3 text-[12px] leading-relaxed text-black/55">
                  Folders Claude can <code className="rounded bg-black/5 px-1 py-[1px] text-[11px]">Read</code>/
                  <code className="rounded bg-black/5 px-1 py-[1px] text-[11px]">Grep</code>/
                  <code className="rounded bg-black/5 px-1 py-[1px] text-[11px]">Glob</code> during an
                  explain call, in addition to the paper's own index.
                  <br />
                  <span className="italic text-black/45">
                    Example: point Fathom at the repo this paper implements, and explanations will cite the file and function.
                  </span>
                </p>

                {dirs.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1">
                    {dirs.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 rounded-md border border-black/5 bg-white/70 px-2.5 py-1.5"
                      >
                        <span className="flex-1 truncate font-mono text-[11.5px] text-[#2a2420]">
                          {p}
                        </span>
                        <button
                          onClick={() => removeDir(p)}
                          className="text-[11px] text-black/40 hover:text-red-600"
                          aria-label={`Remove ${p}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDirByPath();
                      }
                    }}
                    placeholder="/Users/you/code/project or paste a path"
                    className="flex-1 rounded-md border border-black/10 bg-white/70 px-3 py-2 font-mono text-[12px] outline-none focus:border-[#c9832a]"
                  />
                  <button
                    onClick={addDir}
                    className="rounded-md border border-black/10 bg-white/80 px-3 py-2 text-[12px] text-[#2a2420] hover:bg-white"
                  >
                    Browse…
                  </button>
                </div>
              </section>

              {/* Custom instructions */}
              <section>
                <h3 className="mb-1 text-[13.5px] font-medium text-[#1a1614]">
                  Custom instructions
                </h3>
                <p className="mb-3 text-[12px] leading-relaxed text-black/55">
                  Appended to every explain call's prompt. Good for standing preferences.
                  <br />
                  <span className="italic text-black/45">
                    Example: "I'm a systems researcher. When the passage touches ML methods, explain the
                    systems-side cost (memory, latency, parallelism), not just the algorithm."
                  </span>
                </p>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={4}
                  placeholder="(Optional) Add a standing instruction Fathom should apply to every explain…"
                  className="w-full resize-none rounded-md border border-black/10 bg-white/70 px-3 py-2 text-[13px] leading-relaxed text-[#2a2420] outline-none focus:border-[#c9832a]"
                />
              </section>

              <section>
                <h3 className="mb-1 text-[13px] font-medium tracking-tight text-[#1a1614]">
                  Beta features
                </h3>
                <p className="mb-3 text-[12px] leading-relaxed text-black/55">
                  Experimental reading aids. Off by default; enable individually.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={focusLightBeta}
                    onChange={(e) => setFocusLightBeta(e.target.checked)}
                    className="mt-[3px] h-4 w-4 cursor-pointer accent-[#c9832a]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-[#2a2420]">
                      Focus Light
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-black/55">
                      A yellow highlighter band that follows your cursor across one
                      column of text — a digital reading ruler. Click on a paragraph to
                      anchor it; the band tracks your cursor's vertical position within
                      that column. Pinch and two-finger gestures don't move it. Click
                      the "Focus Light" button in the header to turn the band on/off
                      while you read.
                    </span>
                  </span>
                </label>
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-black/5 px-7 py-4">
              <button
                onClick={onClose}
                className="rounded-full px-4 py-1.5 text-[13px] text-black/55 hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#1a1614] px-5 py-2 text-[13px] font-medium text-[#faf4e8] shadow-sm transition hover:bg-[#c9832a] disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
