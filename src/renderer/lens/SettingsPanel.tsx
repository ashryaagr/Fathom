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
  focusLightWpm?: number;
  groundingRepoEvictionEnabled?: boolean;
  groundingRepoEvictionDays?: number;
  groundingRepoPrivacyNoticeAt?: string;
  whiteboardAutoGenerateOnIndex?: boolean;
  whiteboardSonnetLite?: boolean;
}

/** Row shape returned by `lens.listGroundingRepos()`. Mirrors the
 * SQLite columns exactly so we can render straight from the IPC
 * payload without an intermediate adapter. */
export interface GroundingRepoView {
  id: number;
  url: string;
  local_path: string;
  cloned_at: number | null;
  last_used_at: number | null;
  size_bytes: number | null;
  clone_status: 'pending' | 'cloning' | 'ready' | 'failed' | 'evicted';
  error: string | null;
  created_at: number;
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// Focus pacer defaults — research-paper reading is much slower than
// novel reading. 80 wpm is the default ("thoughtful study" pace), 150
// is the cap ("can still parse dense math without losing the
// argument"), 10 is the floor (deliberately almost-stopped, so the
// user can crawl through a single equation or definition while
// nothing else moves). The user noted these will be re-calibrated as
// they get more data on what speeds actually feel right.
const DEFAULT_FOCUS_WPM = 80;
const MIN_FOCUS_WPM = 10;
// Upper bound for the SLIDER ONLY (typical reading range). The numeric
// input below has no upper cap — power users can type any value
// ≥ MIN_FOCUS_WPM. Per user 2026-04-25: "The maximum value should be
// uncapped for the words per minute. If someone wants higher than 300,
// they can do that through the text box."
const FOCUS_WPM_SLIDER_MAX = 300;

/**
 * A small `(?)` info glyph that exposes a longer description on hover
 * via the native `title=` tooltip — same pattern used by the lens icon
 * controls and the App.tsx help overlay rows. We pair it with
 * `aria-describedby` so a screen reader announces the description when
 * focus lands on the section header. The description is rendered into
 * a visually-hidden span so it remains in the accessibility tree.
 *
 * Native browser tooltips are intentional here (Doherty / 1-frame
 * response, no JS state, no portal) — see CLAUDE.md §2.4 and the
 * cog-review skill notes.
 */
function InfoHint({ id, text }: { id: string; text: string }) {
  return (
    <>
      <span
        role="img"
        aria-label="More info"
        aria-describedby={id}
        tabIndex={0}
        title={text}
        className="ml-1 inline-flex h-[14px] w-[14px] cursor-help items-center justify-center rounded-full border border-black/20 text-[9.5px] font-medium leading-none text-black/45 hover:border-[#c9832a] hover:text-[#c9832a] focus:outline-none focus:ring-1 focus:ring-[#c9832a]/40"
      >
        ?
      </span>
      <span id={id} className="sr-only">
        {text}
      </span>
    </>
  );
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
  const [focusLightWpm, setFocusLightWpm] = useState<number>(DEFAULT_FOCUS_WPM);
  const [saving, setSaving] = useState(false);

  // GitHub-repo grounding (.claude/specs/github-repo-grounding.md).
  // Lives in component state because it polls the main process while
  // the panel is open — clones can take seconds to minutes and the UI
  // needs to reflect the status flip without forcing the user to
  // close + reopen Preferences.
  const [repos, setRepos] = useState<GroundingRepoView[]>([]);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [repoAddError, setRepoAddError] = useState<string | null>(null);
  const [repoAdding, setRepoAdding] = useState(false);
  const [evictionEnabled, setEvictionEnabled] = useState(true);
  const [evictionDays, setEvictionDays] = useState<number>(30);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  // Whiteboard auto-generate — opt-in per the cog reviewer §8 financial-
  // consent rule. When true, opening a fresh paper kicks off the
  // ~$1.50 Whiteboard pipeline as soon as indexing finishes; when
  // false, the Whiteboard tab shows the inline consent button.
  const [whiteboardAutoGenerate, setWhiteboardAutoGenerate] = useState(false);

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
        setFocusLightWpm(
          typeof s.focusLightWpm === 'number' && Number.isFinite(s.focusLightWpm)
            ? Math.max(MIN_FOCUS_WPM, s.focusLightWpm)
            : DEFAULT_FOCUS_WPM,
        );
        setEvictionEnabled(
          typeof s.groundingRepoEvictionEnabled === 'boolean'
            ? s.groundingRepoEvictionEnabled
            : true,
        );
        setWhiteboardAutoGenerate(!!s.whiteboardAutoGenerateOnIndex);
        setEvictionDays(
          typeof s.groundingRepoEvictionDays === 'number' && Number.isFinite(s.groundingRepoEvictionDays)
            ? Math.max(1, Math.round(s.groundingRepoEvictionDays))
            : 30,
        );
        // One-time inline notice on the very first repo add. We track
        // acknowledgement (not just dismissal) so reopening Preferences
        // doesn't keep showing it.
        if (!s.groundingRepoPrivacyNoticeAt) {
          setShowPrivacyNotice(true);
        }
      } catch {
        // settings unreadable — start with defaults; saves will recreate the file
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Repo list — load once on open, then poll while any repo is in a
  // transitional state (pending / cloning). Per the spec's Doherty
  // note, the user should see the spinner stop within a frame of the
  // clone finishing; 1 s polling is the right knob here (perceptible
  // but not janky, cheap on the IPC channel).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = async () => {
      try {
        const list = await window.lens.listGroundingRepos();
        if (cancelled) return;
        setRepos(list);
        const anyPending = list.some(
          (r) => r.clone_status === 'pending' || r.clone_status === 'cloning',
        );
        if (!anyPending && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // IPC errors are non-fatal — list will simply not refresh.
      }
    };
    void refresh();
    timer = setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
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

  /** Refresh the repo list immediately. Used after add/update/remove
   * so the user sees the optimistic state flip without waiting for
   * the 1-second poll tick. */
  const refreshRepos = async () => {
    try {
      const list = await window.lens.listGroundingRepos();
      setRepos(list);
    } catch {
      /* non-fatal */
    }
  };

  const addRepo = async () => {
    const trimmed = newRepoUrl.trim();
    if (!trimmed) return;
    setRepoAddError(null);
    setRepoAdding(true);
    try {
      const result = await window.lens.addGroundingRepo(trimmed);
      if (!result.ok) {
        setRepoAddError(result.error);
        return;
      }
      setNewRepoUrl('');
      // Persist privacy-notice acknowledgement on first successful add
      // so we don't keep showing the banner.
      if (showPrivacyNotice) {
        setShowPrivacyNotice(false);
        await window.lens.updateSettings({
          groundingRepoPrivacyNoticeAt: new Date().toISOString(),
        });
      }
      await refreshRepos();
    } finally {
      setRepoAdding(false);
    }
  };

  const removeRepo = async (id: number) => {
    await window.lens.removeGroundingRepo(id);
    await refreshRepos();
  };

  const updateRepo = async (id: number) => {
    await window.lens.updateGroundingRepo(id);
    await refreshRepos();
  };

  const dismissPrivacyNotice = async () => {
    setShowPrivacyNotice(false);
    try {
      await window.lens.updateSettings({
        groundingRepoPrivacyNoticeAt: new Date().toISOString(),
      });
    } catch {
      /* non-fatal */
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.lens.updateSettings({
        extraDirectories: dirs,
        customInstructions: customInstructions.trim() || undefined,
        focusLightBetaEnabled: focusLightBeta,
        focusLightWpm,
        groundingRepoEvictionEnabled: evictionEnabled,
        groundingRepoEvictionDays: evictionDays,
        whiteboardAutoGenerateOnIndex: whiteboardAutoGenerate,
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
            className="flex max-h-[80vh] w-[560px] max-w-[90vw] flex-col rounded-2xl bg-[#faf4e8] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (fixed) */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-black/5 px-7 py-5">
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

            {/* Body (scrollable) */}
            <div className="flex flex-col gap-4 overflow-y-auto px-7 py-6">
              {/* Extra grounding directories */}
              <section>
                <h3 className="mb-2 flex items-center text-[13.5px] font-medium text-[#1a1614]">
                  Extra grounding directories
                  <InfoHint
                    id="hint-extra-dirs"
                    text="Folders Claude can Read / Grep / Glob during an explain call, in addition to the paper's own index. Example: point Fathom at the repo this paper implements, and explanations will cite the file and function."
                  />
                </h3>

                {dirs.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-1">
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

              {/* Extra grounding GitHub repos */}
              <section>
                <h3 className="mb-2 flex items-center text-[13.5px] font-medium text-[#1a1614]">
                  Extra grounding GitHub repos
                  <InfoHint
                    id="hint-extra-repos"
                    text="Paste a git URL — Fathom clones it locally and Claude can Read / Grep / Glob the code while explaining a paper. Public repos only in v1; private repos coming soon."
                  />
                </h3>

                {showPrivacyNotice && (
                  <div className="mb-2 flex items-start gap-2 rounded-md border border-[#c9832a]/30 bg-[#fff5e1] px-3 py-1.5 text-[11.5px] leading-snug text-[#6b4a1a]">
                    <span className="flex-1">
                      Repos you add here are cloned to your machine (under Fathom's app data) and read locally — never uploaded.
                    </span>
                    <button
                      onClick={dismissPrivacyNotice}
                      className="text-[11px] text-[#6b4a1a]/60 hover:text-[#6b4a1a]"
                      aria-label="Dismiss notice"
                    >
                      Got it
                    </button>
                  </div>
                )}

                {repos.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-1">
                    {repos.map((r) => {
                      const status = r.clone_status;
                      const busy = status === 'pending' || status === 'cloning';
                      const failed = status === 'failed';
                      // Three controls per row (Update, Remove, status indicator) —
                      // keeps Hick's Law count low per the spec's cog notes.
                      return (
                        <li
                          key={r.id}
                          className="rounded-md border border-black/5 bg-white/70 px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex-1 truncate font-mono text-[11.5px] text-[#2a2420]"
                              title={r.url}
                            >
                              {r.url}
                            </span>
                            {busy && (
                              <span
                                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#c9832a]/30 border-t-[#c9832a]"
                                aria-label={status === 'pending' ? 'Queued' : 'Cloning'}
                                title={status === 'pending' ? 'Queued' : 'Cloning'}
                              />
                            )}
                            {status === 'ready' && (
                              <span className="text-[10.5px] text-black/45 tabular-nums">
                                {formatBytes(r.size_bytes)} · used {formatRelative(r.last_used_at)}
                              </span>
                            )}
                            {failed && (
                              <span
                                className="text-[10.5px] text-red-600"
                                title={r.error ?? 'Clone failed'}
                              >
                                Failed
                              </span>
                            )}
                            <button
                              onClick={() => updateRepo(r.id)}
                              disabled={busy}
                              className="text-[11px] text-black/40 hover:text-[#c9832a] disabled:opacity-40"
                              aria-label={`Update ${r.url}`}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => removeRepo(r.id)}
                              className="text-[11px] text-black/40 hover:text-red-600"
                              aria-label={`Remove ${r.url}`}
                            >
                              Remove
                            </button>
                          </div>
                          {failed && r.error && (
                            <div className="mt-1 text-[11px] leading-relaxed text-red-600/80">
                              {r.error}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addRepo();
                      }
                    }}
                    placeholder="https://github.com/owner/repo.git"
                    disabled={repoAdding}
                    className="flex-1 rounded-md border border-black/10 bg-white/70 px-3 py-2 font-mono text-[12px] outline-none focus:border-[#c9832a] disabled:opacity-60"
                  />
                  <button
                    onClick={() => void addRepo()}
                    disabled={repoAdding || newRepoUrl.trim().length === 0}
                    className="rounded-md border border-black/10 bg-white/80 px-3 py-2 text-[12px] text-[#2a2420] hover:bg-white disabled:opacity-50"
                  >
                    {repoAdding ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {repoAddError && (
                  <div className="mt-2 text-[11.5px] text-red-600">{repoAddError}</div>
                )}

                {/* Eviction toggle. Per the spec's default-setting ethics
                    note: eviction DELETES user data, so it must be opt-out
                    and visible (not hidden behind an advanced sub-panel). */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-black/10 bg-white/70 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#2a2420]">
                    <input
                      type="checkbox"
                      checked={evictionEnabled}
                      onChange={(e) => setEvictionEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#c9832a]"
                    />
                    Auto-remove unused repos after
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={evictionDays}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) setEvictionDays(Math.max(1, Math.round(n)));
                    }}
                    disabled={!evictionEnabled}
                    aria-label="Eviction TTL in days"
                    className="w-14 rounded border border-black/15 bg-white px-1.5 py-0.5 text-right font-mono text-[11.5px] outline-none focus:border-[#c9832a]/70 disabled:opacity-50"
                  />
                  <span className="text-[12px] text-black/55">days of disuse</span>
                </div>
              </section>

              {/* Custom instructions */}
              <section>
                <h3 className="mb-2 flex items-center text-[13.5px] font-medium text-[#1a1614]">
                  Custom instructions
                  <InfoHint
                    id="hint-custom-instructions"
                    text="Appended to every explain call's prompt. Good for standing preferences — e.g. cite the file and function from the reference repo when answering, or focus on systems-side cost (memory, latency, parallelism) when the passage touches ML methods."
                  />
                </h3>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={4}
                  placeholder={`(Optional) e.g. "Cite the file and function from the reference repo when answering."`}
                  className="w-full resize-none rounded-md border border-black/10 bg-white/70 px-3 py-2 text-[13px] leading-relaxed text-[#2a2420] outline-none focus:border-[#c9832a]"
                />
              </section>

              <section>
                <h3 className="mb-2 flex items-center text-[13px] font-medium tracking-tight text-[#1a1614]">
                  Beta features
                  <InfoHint
                    id="hint-beta"
                    text="Experimental reading aids. Off by default; enable individually."
                  />
                </h3>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={focusLightBeta}
                    onChange={(e) => setFocusLightBeta(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[#c9832a]"
                  />
                  <span className="flex flex-1 items-center text-[13px] font-medium text-[#2a2420]">
                    Focus Light
                    <InfoHint
                      id="hint-focus-light"
                      text={
                        'A 3-word reading pacer. The middle word is bright dark yellow (your focal point); the words just before and just after are faintly highlighted as peripheral context. Click any word to start it there. The pacer auto-advances at the speed below — press SPACEBAR to pause when you want to stop and think. Click another word to re-anchor. Toggle on/off from the "Focus" button in the header.'
                      }
                    />
                  </span>
                </label>
                {/* WPM slider + numeric input. Range 10–300 covers
                    deliberate study (~30–80) through average adult
                    reading (~250) through brisk technical reading
                    (~300). The numeric input lets the user dial in
                    an exact value (e.g. when they've calibrated)
                    without dragging the slider. Both inputs share
                    the same backing state — slider drives input,
                    input drives slider, clamped to MIN..MAX. */}
                <div
                  className={
                    'mt-3 rounded-md border border-black/10 bg-white/70 px-3 py-3 transition-opacity ' +
                    (focusLightBeta ? '' : 'opacity-50')
                  }
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#2a2420]">
                      Focus Light speed
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={MIN_FOCUS_WPM}
                        // No `max` — user explicitly asked for an
                        // uncapped numeric input so power users can
                        // dial in any value above the slider's typical
                        // range. The slider below stays bounded
                        // (typical reading 10–300); the text box is
                        // the override path.
                        step={1}
                        value={focusLightWpm}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          if (!Number.isFinite(raw)) return;
                          // Clamp on commit, NOT on every keystroke,
                          // so the user can type "12" en route to
                          // "120" without the input snapping to MIN.
                          setFocusLightWpm(raw);
                        }}
                        onBlur={(e) => {
                          const raw = Number(e.target.value);
                          if (!Number.isFinite(raw)) {
                            setFocusLightWpm(MIN_FOCUS_WPM);
                            return;
                          }
                          // Lower bound enforced; no upper bound.
                          setFocusLightWpm(
                            Math.max(MIN_FOCUS_WPM, Math.round(raw)),
                          );
                        }}
                        disabled={!focusLightBeta}
                        aria-label="Focus Light speed in words per minute"
                        className="w-16 rounded border border-black/15 bg-white px-1.5 py-0.5 text-right font-mono text-[12px] text-[#2a2420] outline-none focus:border-[#c9832a]/70 focus:ring-1 focus:ring-[#c9832a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <span className="text-[11px] text-black/55">wpm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={MIN_FOCUS_WPM}
                    max={FOCUS_WPM_SLIDER_MAX}
                    step={5}
                    value={Math.max(MIN_FOCUS_WPM, Math.min(FOCUS_WPM_SLIDER_MAX, focusLightWpm))}
                    onChange={(e) => setFocusLightWpm(Number(e.target.value))}
                    disabled={!focusLightBeta}
                    className="w-full cursor-pointer accent-[#c9832a] disabled:cursor-not-allowed"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-black/45 uppercase tracking-wide">
                    <span>crawl · 10</span>
                    <span>study · 80</span>
                    <span>average · 250</span>
                    <span>brisk · 300</span>
                  </div>
                </div>

                {/* Whiteboard auto-generate. Default off — financial-
                    consent rule (cog reviewer §8). When on, the
                    Whiteboard pipeline kicks off as soon as a paper
                    finishes indexing instead of waiting for the user
                    to click the consent button on the Whiteboard
                    tab. ~$1.50/paper from your own Claude CLI auth. */}
                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={whiteboardAutoGenerate}
                    onChange={(e) => setWhiteboardAutoGenerate(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[#c9832a]"
                  />
                  <span className="flex flex-1 items-center text-[13px] font-medium text-[#2a2420]">
                    Auto-generate whiteboards
                    <InfoHint
                      id="hint-whiteboard-auto"
                      text="When on, opening a fresh paper kicks off the ~$1.50 whiteboard pipeline as soon as indexing finishes — no consent prompt. Off by default; you can always trigger one manually from the Whiteboard tab."
                    />
                  </span>
                </label>
              </section>
            </div>

            {/* Footer (fixed) */}
            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-black/5 px-7 py-4">
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
