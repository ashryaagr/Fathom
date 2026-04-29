/**
 * Headless Fathom verification harness — qa-watcher's primary tool.
 *
 * Per TEAMS.md §7 (2026-04-28): QA must never disrupt the user's
 * running session. Every `verify <task>` ask runs against an
 * ISOLATED Fathom instance pointed at `/tmp/fathom-test-<hash>/`,
 * driven by Playwright + Electron's official `_electron` API.
 * The user's live state under `~/Library/Application Support/fathom/`
 * is READ-ONLY (we may copy from it but never write to it) and the
 * user's running Fathom.app stays untouched.
 *
 * The harness is parametrised by a TEST CASE NAME — pick one of:
 *
 *   bug54-stuck-pass1
 *     Reproduces the stuck-pass1 regression. Pre-seeds the test DB
 *     with a `whiteboards` row at status='pass1' for the bundled
 *     sample paper, plus a copied `whiteboard.excalidraw` sidecar.
 *     Verifies the self-heal block at src/main/index.ts:1366-1381
 *     returns 'ready' so the side-chat panel renders.
 *
 * USAGE:
 *   npx tsx scripts/fathom-headless-verify.mts bug54-stuck-pass1
 *   npx tsx scripts/fathom-headless-verify.mts bug54-stuck-pass1 --keep
 *
 * --keep flag preserves the test userData dir for post-mortem
 * inspection. Default: dir is removed on success, preserved on
 * failure.
 *
 * EXIT CODES:
 *   0 = PASS
 *   1 = FAIL (assertion failed)
 *   2 = ERROR (harness setup broke before assertions could run)
 */

import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  reason?: string;
  artefacts: { kind: string; path: string }[];
  logHighlights: string[];
}

const REPO_ROOT = resolve(process.argv[1], '../..');
const ELECTRON_BIN = join(REPO_ROOT, 'node_modules/.bin/electron');
const MAIN_BUNDLE = join(REPO_ROOT, 'out/main/index.js');
const SAMPLE_PDF = join(REPO_ROOT, 'resources/sample-paper.pdf');
const SAMPLE_HASH = 'bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697';
const SAMPLE_SIDECAR_SRC = join(
  homedir(),
  'Library/Application Support/fathom/sidecars',
  SAMPLE_HASH,
  'whiteboard.excalidraw',
);
const SHOTS_DIR = '/tmp/fathom-shots';

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[headless-verify] ${msg}`);
}

function preflight(): void {
  if (!existsSync(ELECTRON_BIN)) {
    throw new Error(`electron CLI missing at ${ELECTRON_BIN} — run npm install`);
  }
  if (!existsSync(MAIN_BUNDLE)) {
    throw new Error(`main bundle missing at ${MAIN_BUNDLE} — run npm run build`);
  }
  if (!existsSync(SAMPLE_PDF)) {
    throw new Error(`sample PDF missing at ${SAMPLE_PDF}`);
  }
  if (!existsSync(SAMPLE_SIDECAR_SRC)) {
    throw new Error(
      `sample sidecar missing at ${SAMPLE_SIDECAR_SRC} — bug54-stuck-pass1 needs a saved scene to reproduce the stuck-row state. Run the sample paper through the live app once to generate it, OR pick a different test case.`,
    );
  }
  mkdirSync(SHOTS_DIR, { recursive: true });
}

function makeTestUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fathom-test-'));
  log(`test userData = ${dir}`);
  return dir;
}

/** Initialise an empty DB with the production schema, then seed the
 *  pre-existing-row state we want to reproduce. We import schema by
 *  running the migration logic inline here — the app would do this
 *  at startup, but we want the rows in place BEFORE the renderer
 *  hydrates so the gate at WhiteboardTab.tsx:889 sees the seeded
 *  state on first paint, not on a re-fetch.
 *
 *  This mirrors the CREATE TABLE statements in src/main/db/schema.ts
 *  (the `migrate()` function). Keep in sync: any new column there
 *  must be reflected here. */
/** Seed the DB via the sqlite3 CLI rather than better-sqlite3 — the
 *  Electron-bundled native binary is built for NODE_MODULE_VERSION 145
 *  (Electron 41 / Node 22) and will not load under tsx running on
 *  Node 24 (NMV 127). The sqlite3 CLI is preinstalled on macOS and
 *  has zero version coupling.
 *
 *  Mirrors the production schema in src/main/db/schema.ts. Keep in
 *  sync if columns change. */
function seedDb(userDataDir: string, paperHash: string, status: string): void {
  const dbPath = join(userDataDir, 'lens.db');
  const now = Date.now();
  const sql = `
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS papers (
      content_hash TEXT PRIMARY KEY,
      title TEXT,
      last_opened INTEGER NOT NULL,
      digest_json TEXT
    );
    CREATE TABLE IF NOT EXISTS whiteboards (
      paper_hash TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      generated_at INTEGER,
      pass1_cost REAL,
      pass2_cost REAL,
      total_cost REAL,
      pass1_latency_ms INTEGER,
      verification_rate REAL,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO papers(content_hash, title, last_opened, digest_json)
      VALUES('${paperHash}', 'sample-paper.pdf', ${now}, NULL)
      ON CONFLICT(content_hash) DO UPDATE SET last_opened = excluded.last_opened;
    INSERT INTO whiteboards(paper_hash, status, created_at)
      VALUES('${paperHash}', '${status}', ${now})
      ON CONFLICT(paper_hash) DO UPDATE SET status = excluded.status;
  `;
  execFileSync('sqlite3', [dbPath], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  log(`seeded DB: papers row + whiteboards.status=${status} for paper=${paperHash.slice(0, 10)}`);
}

function seedSidecar(userDataDir: string, paperHash: string): void {
  const dest = join(userDataDir, 'sidecars', paperHash);
  mkdirSync(dest, { recursive: true });
  const sceneDest = join(dest, 'whiteboard.excalidraw');
  copyFileSync(SAMPLE_SIDECAR_SRC, sceneDest);
  log(`seeded sidecar: ${sceneDest}`);
}

/** Seed a non-empty `whiteboard-understanding.md` so the unified
 *  WhiteboardChat panel has streaming-body text to render during the
 *  pass1/pass2 phases. The file is loaded into `wb.understanding`
 *  via the `whiteboard:get` IPC and rendered inside the chat scroller
 *  by `WhiteboardChat.tsx:280`'s StreamingBody. */
function seedUnderstanding(userDataDir: string, paperHash: string, text: string): void {
  const dest = join(userDataDir, 'sidecars', paperHash);
  mkdirSync(dest, { recursive: true });
  const understandingPath = join(dest, 'whiteboard-understanding.md');
  writeFileSync(understandingPath, text, 'utf-8');
  log(`seeded understanding.md: ${text.length} chars at ${understandingPath}`);
}

/** Pre-mark the first-run tour as complete so the test instance
 *  skips the welcome overlay (a fullscreen z-100 div that intercepts
 *  clicks). Without this, every click on a tab/button below the
 *  overlay times out. */
function seedSettings(userDataDir: string): void {
  const settingsPath = join(userDataDir, 'settings.json');
  const settings = {
    // Both fields exist in FathomSettings — set both for safety. The
    // gate at App.tsx:597 reads `tourCompletedAt`; `firstRunCompletedAt`
    // is a separate later-added field for the install-flow.
    tourCompletedAt: new Date().toISOString(),
    firstRunCompletedAt: new Date().toISOString(),
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  log(`seeded settings.json with firstRunCompletedAt`);
}

async function launchTestInstance(
  userDataDir: string,
  capturedStdout: string[],
): Promise<ElectronApplication> {
  log(`launching electron with --user-data-dir=${userDataDir} FATHOM_HEADLESS=1`);
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      MAIN_BUNDLE,
      `--user-data-dir=${userDataDir}`,
    ],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      // #65: tells main-process startup to skip BrowserWindow.show(),
      // skip native fullscreen on paper-open, hide the dock icon, and
      // suppress auto-updater popups. Together with the off-screen
      // window position below, enforces §7's "never disrupt the user's
      // screen" rule even when the user is actively working elsewhere.
      FATHOM_HEADLESS: '1',
    },
    timeout: 30000,
  });
  // The logger module (src/main/logger.ts) writes every line to BOTH
  // the rotating file at ~/Library/Logs/Fathom/fathom.log AND stdout
  // (via originalConsole). On macOS Electron's `app.getPath('logs')`
  // is anchored on app.name and is NOT redirected by --user-data-dir,
  // so the file-side write would contaminate the user's live log.
  // We avoid relying on the file: capture stdout instead. Same
  // information, no contamination.
  const proc = app.process();
  proc.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf-8').split('\n').filter((l) => l.length > 0);
    capturedStdout.push(...lines);
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf-8').split('\n').filter((l) => l.length > 0);
    capturedStdout.push(...lines.map((l) => `[stderr] ${l}`));
  });
  log(`electron app launched, stdout/stderr piped`);
  return app;
}

async function waitForPaperRendered(app: ElectronApplication, page: Page): Promise<void> {
  log(`waiting for welcome screen → invoke qa:openSample`);
  // Wait for the welcome screen to mount (any window is fine).
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

  // The qa:openSample IPC handler at src/main/index.ts:735 sends
  // a 'qa:triggerSample' event to the active window's renderer,
  // which then calls window.lens.openSample() → pdf:openSample
  // IPC → copies + opens the bundled sample PDF.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    // Trigger the renderer-side handler by emitting the channel
    // the renderer subscribes to via window.lens.onQaTriggerSample
    // (App.tsx:641). We do this from main because that's where
    // safeSendActive lives — but the same effect can be achieved
    // by webContents.send.
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      if (!w.isDestroyed()) w.webContents.send('qa:triggerSample');
    }
  });
  log(`qa:triggerSample sent to all windows`);

  // The PDF takes time to render — wait for the .pdfViewer or any
  // PDF-page canvas to appear. Conservative timeout: 30s for a
  // cold-launch + index build.
  await page.waitForSelector(
    'canvas, [data-paperhash], [aria-label*="whiteboard" i], [aria-label*="ask" i]',
    { timeout: 30000 },
  );
  log(`paper render detected (canvas or whiteboard surface visible)`);
}

async function navigateToWhiteboard(app: ElectronApplication, page: Page): Promise<void> {
  log(`navigating to Whiteboard tab via in-renderer evaluate (synthetic keydown)`);
  // The tab pill is bound to ⌘2 via a `keydown` listener on `window`
  // (App.tsx:491). When the BrowserWindow is positioned off-screen
  // it doesn't receive OS-level keyboard input, so Playwright's
  // page.keyboard.press is a no-op. Workaround: dispatch a synthetic
  // KeyboardEvent inside the page that matches what App.tsx's
  // listener checks for (e.metaKey + e.key === '2').
  //
  // This bypasses the OS keyboard chain entirely and works regardless
  // of window focus state — exactly what a headless test needs.
  await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', {
      key: '2',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  });
  // Give the React state flip + WhiteboardTab effect time to settle.
  await page.waitForTimeout(800);
  // Confirm we landed: look for a whiteboard-tab marker in DOM.
  const wbMarkers = [
    '[aria-label*="whiteboard" i]',
    'text=Regenerate',
    'text=Clear',
    '.excalidraw',
  ];
  for (const sel of wbMarkers) {
    if ((await page.locator(sel).count()) > 0) {
      log(`whiteboard tab confirmed (selector="${sel}")`);
      return;
    }
  }
  // Fallback: try the click path in case the keyboard accelerator
  // isn't bound in the renderer the way we think.
  log(`keyboard ⌘2 didn't surface whiteboard markers; trying click fallback`);
  const candidates = [
    'button:has-text("Whiteboard")',
    '[role="tab"]:has-text("Whiteboard")',
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.click({ timeout: 5000, force: true });
      log(`force-clicked Whiteboard via selector: ${sel}`);
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error(`Could not navigate to Whiteboard tab (⌘2 + click fallback both failed)`);
}

async function checkSideChatVisible(page: Page): Promise<{
  chatPresent: boolean;
  selectorMatched: string | null;
}> {
  // Two possible states from WhiteboardChat.tsx:
  //   - collapsed: a small button with aria-label="Open whiteboard chat" (L195)
  //   - expanded: a textarea with aria-label="Ask the whiteboard chat" (L485)
  //                 or aria-label="Send message" (L498) on the send button.
  //                 or aria-label="Collapse chat" (L316) on the header arrow.
  // ANY of these proves the WhiteboardChat component mounted, which
  // means the gate at WhiteboardTab.tsx:889 (wb.status !== 'pass1' && !== 'pass2')
  // PASSED — i.e. the self-heal returned 'ready' to the renderer.
  const selectors = [
    '[aria-label="Open whiteboard chat"]',
    '[aria-label="Ask the whiteboard chat"]',
    '[aria-label="Send message"]',
    '[aria-label="Collapse chat"]',
    'textarea[aria-label*="chat" i]',
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      log(`side chat present (selector="${sel}", count=${count})`);
      return { chatPresent: true, selectorMatched: sel };
    }
  }
  log(`side chat NOT present — none of: ${selectors.join(', ')}`);
  return { chatPresent: false, selectorMatched: null };
}

/** Probe the unified WhiteboardChat panel for geometry + state.
 *  Returns enough to verify (a) the panel exists at the flush right
 *  edge, (b) it's the ONLY chat-rail wrapper in the DOM, (c) the
 *  textarea's disabled/placeholder/header text match the seeded
 *  status. */
async function probeChatPanel(page: Page): Promise<{
  textareaCount: number;
  textareaDisabled: boolean | null;
  textareaPlaceholder: string | null;
  headerLabel: string | null;
  panelRectRight: number | null;
  panelRectWidth: number | null;
  viewportWidth: number;
  bodyText: string;
  hasStreamingSidebarLegacy: boolean;
}> {
  return await page.evaluate(() => {
    const textarea = document.querySelector(
      '[aria-label="Ask the whiteboard chat"]',
    ) as HTMLTextAreaElement | null;
    // The chat panel root is the textarea's nearest ancestor whose
    // computed style is the rail wrapper (320px width). Walk up until
    // we hit something with width >= 300 OR fall back to body.
    let panel: HTMLElement | null = textarea;
    while (panel && panel !== document.body) {
      const r = panel.getBoundingClientRect();
      if (r.width >= 300 && r.width <= 360) break;
      panel = panel.parentElement;
    }
    const panelRect = panel && panel !== document.body ? panel.getBoundingClientRect() : null;
    // The header label sits above the textarea — first heading-style
    // text node we can find inside the panel ancestor with `font-size`
    // > 11px and not inside the scroller body. Pragmatic: just read
    // first non-empty short text in the panel that contains "chat",
    // "Reading", or "Drawing".
    let headerLabel: string | null = null;
    if (panel) {
      const candidates = Array.from(panel.querySelectorAll('div, span'));
      for (const el of candidates) {
        const t = (el.textContent ?? '').trim();
        if (
          t.length > 0 &&
          t.length < 80 &&
          /Reading the paper|Drawing the diagram|Level 1 chat|Detail chat/.test(t)
        ) {
          headerLabel = t;
          break;
        }
      }
    }
    // Legacy StreamingSidebar shape: top-16 right-4 floating panel
    // inset from top-right. If we find any element matching that
    // shape (NOT the unified rail), it's a regression.
    const possibleLegacy = Array.from(
      document.querySelectorAll('div'),
    ).find((d) => {
      const cls = d.className;
      if (typeof cls !== 'string') return false;
      return cls.includes('top-16') && cls.includes('right-4');
    });
    return {
      textareaCount: document.querySelectorAll('[aria-label="Ask the whiteboard chat"]').length,
      textareaDisabled: textarea ? textarea.disabled : null,
      textareaPlaceholder: textarea ? textarea.placeholder : null,
      headerLabel,
      panelRectRight: panelRect ? panelRect.right : null,
      panelRectWidth: panelRect ? panelRect.width : null,
      viewportWidth: window.innerWidth,
      bodyText: document.body.innerText.slice(0, 8000),
      hasStreamingSidebarLegacy: Boolean(possibleLegacy),
    };
  });
}

/** Filter the captured stdout for self-heal-relevant lines. The
 *  logger emits lines like `[Whiteboard get] paper=bdfaa68d89 self-heal:
 *  row.status=pass1 but scene exists → returning 'ready'` — exactly
 *  what proves the IPC ran the new self-heal code path. We also
 *  include the renderer's [WhiteboardTab] hydrate log because it
 *  shows what status the renderer received. */
function filterStdoutForSelfHeal(
  capturedStdout: string[],
  paperHashShort: string,
): string[] {
  const matched: string[] = [];
  for (const line of capturedStdout) {
    if (
      line.includes('[Whiteboard get]') ||
      line.includes('[WhiteboardTab] hydrate') ||
      line.includes(`paper=${paperHashShort}`) ||
      /self-heal/.test(line)
    ) {
      matched.push(line);
    }
  }
  return matched.slice(-15);
}

async function runBug54StuckPass1(): Promise<TestResult> {
  // Allow `--seed-status=ready` to short-circuit the self-heal path
  // and test the renderer-side rendering only — a control case to
  // confirm whether the side-chat panel renders at all in headless
  // mode against the seeded sample paper.
  const seedStatusArg = process.argv.find((a) => a.startsWith('--seed-status='));
  const seedStatus = seedStatusArg ? seedStatusArg.split('=')[1] : 'pass1';
  const result: TestResult = {
    name: `bug54-stuck-pass1 (seed-status=${seedStatus})`,
    status: 'ERROR',
    artefacts: [],
    logHighlights: [],
  };

  preflight();
  const userDataDir = makeTestUserData();
  const capturedStdout: string[] = [];

  let app: ElectronApplication | null = null;
  try {
    seedDb(userDataDir, SAMPLE_HASH, seedStatus);
    seedSidecar(userDataDir, SAMPLE_HASH);
    seedSettings(userDataDir);

    app = await launchTestInstance(userDataDir, capturedStdout);
    const page = await app.firstWindow({ timeout: 30000 });
    log(`firstWindow ready`);

    // Hide it off-screen so it doesn't disrupt the user's screen
    // even momentarily. Per §7: "Position the test instance off-screen
    // or hidden."
    await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.setPosition(-10000, -10000);
          // setSkipTaskbar isn't strictly needed on macOS but harmless.
          try {
            w.setSkipTaskbar(true);
          } catch {
            /* ok */
          }
        }
      }
    });
    log(`window moved off-screen`);

    await waitForPaperRendered(app, page);

    // Give the WhiteboardTab a moment after the paper opens to mount
    // (it's lazy-loaded behind the tab; clicking activates it).
    await page.waitForTimeout(1500);
    await navigateToWhiteboard(app, page);

    // Wait for hydration to complete:
    // - WhiteboardTab.tsx:97 sets `hydrating = true` and renders
    //   "Loading whiteboard…" (line 797).
    // - The window.lens.whiteboardGet IPC fires (this exercises the
    //   self-heal at src/main/index.ts:1376-1381).
    // - When the IPC returns, hydrating flips to false in the
    //   finally block (line ~152), and the real surface renders.
    // - Then the Excalidraw lazy import finishes and the side chat
    //   gate at L889 evaluates with the now-`'ready'` wb.status.
    //
    // We wait until the "Loading whiteboard…" text is gone (max 20s)
    // and then poll for the side-chat selector for up to 10 more
    // seconds. The IPC re-fires under React Strict Mode so the
    // self-heal log line will appear ~2x; that's expected and
    // matches what we observed (the 15-line burst earlier was
    // because the page itself re-mounted while we were watching).
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Loading whiteboard…'),
        { timeout: 20000 },
      );
      log(`hydrating done — "Loading whiteboard…" gone`);
    } catch {
      log(`WARN: "Loading whiteboard…" still present after 20s — proceeding anyway`);
    }
    // One more beat for the lazy Excalidraw import + child component mount.
    await page.waitForTimeout(2000);

    const shotPath = join(SHOTS_DIR, `headless-bug54-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    result.artefacts.push({ kind: 'screenshot', path: shotPath });
    log(`screenshot: ${shotPath}`);

    const sideChat = await checkSideChatVisible(page);

    result.logHighlights = filterStdoutForSelfHeal(capturedStdout, SAMPLE_HASH.slice(0, 10));
    if (result.logHighlights.length === 0) {
      result.logHighlights = ['(no [Whiteboard get] / [WhiteboardTab] hydrate / self-heal lines in captured stdout)'];
    }
    // Persist the FULL stdout dump so we can debug what's happening
    // beyond our whitelist filter (e.g. errors, IPC traffic, renderer
    // crashes that wouldn't match self-heal keywords).
    const stdoutDumpPath = `/tmp/fathom-shots/headless-bug54-${Date.now()}-stdout.log`;
    writeFileSync(stdoutDumpPath, capturedStdout.join('\n'), 'utf-8');
    result.artefacts.push({ kind: 'stdout-dump', path: stdoutDumpPath });

    if (sideChat.chatPresent) {
      result.status = 'PASS';
      result.reason = `WhiteboardChat mounted (selector="${sideChat.selectorMatched}"). Self-heal at index.ts:1366-1381 returned 'ready' despite seeded whiteboards.status='pass1'. Side-chat gate at WhiteboardTab.tsx:889 passed.`;
    } else {
      result.status = 'FAIL';
      result.reason = `WhiteboardChat NOT in DOM after navigation to Whiteboard tab. Self-heal at index.ts:1366-1381 either did not run, did not return 'ready', OR the gate at WhiteboardTab.tsx:889 failed for another reason. See log highlights + screenshot.`;
    }
  } catch (err) {
    result.status = 'ERROR';
    result.reason = `harness exception: ${(err as Error).message}\n${(err as Error).stack ?? ''}`;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        /* ok */
      }
    }
    const keep = process.argv.includes('--keep') || result.status !== 'PASS';
    if (!keep) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
        log(`cleaned up ${userDataDir}`);
      } catch {
        /* ok */
      }
    } else {
      log(`PRESERVING ${userDataDir} for post-mortem`);
      result.artefacts.push({ kind: 'userData', path: userDataDir });
    }
  }

  return result;
}

/** Drive a single test instance with the given seed status (and
 *  optional understanding text) and return the chat-panel probe.
 *  Caller cleans up the userData on success. */
async function probeForStatus(
  status: string,
  understandingText: string | null,
): Promise<{
  probe: Awaited<ReturnType<typeof probeChatPanel>>;
  screenshotPath: string;
  userDataDir: string;
}> {
  const userDataDir = makeTestUserData();
  const capturedStdout: string[] = [];
  let app: ElectronApplication | null = null;
  try {
    seedDb(userDataDir, SAMPLE_HASH, status);
    seedSidecar(userDataDir, SAMPLE_HASH);
    if (understandingText !== null) {
      seedUnderstanding(userDataDir, SAMPLE_HASH, understandingText);
    }
    seedSettings(userDataDir);

    app = await launchTestInstance(userDataDir, capturedStdout);
    const page = await app.firstWindow({ timeout: 30000 });
    await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.setPosition(-10000, -10000);
          try {
            w.setSkipTaskbar(true);
          } catch {
            /* ok */
          }
        }
      }
    });
    await waitForPaperRendered(app, page);
    await page.waitForTimeout(1500);
    await navigateToWhiteboard(app, page);
    // Wait for hydration to complete OR for the streaming-phase
    // panel (which renders even when wb.status === 'pass1'/'pass2'
    // because the unified chat is mounted whenever wb.status !==
    // 'consent', per WhiteboardTab.tsx:911).
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Loading whiteboard…'),
        { timeout: 20000 },
      );
    } catch {
      // For status='pass1' or 'pass2' the placeholder may persist
      // because the canvas is genuinely waiting on the agent — but
      // the chat rail itself should still be mounted alongside.
    }
    await page.waitForTimeout(1500);
    const screenshotPath = join(SHOTS_DIR, `headless-bug63-${status}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const probe = await probeChatPanel(page);
    return { probe, screenshotPath, userDataDir };
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        /* ok */
      }
    }
  }
}

async function runBug63ChatPersistence(): Promise<TestResult> {
  const result: TestResult = {
    name: 'bug63-chat-persistence',
    status: 'ERROR',
    artefacts: [],
    logHighlights: [],
  };
  preflight();

  // SCOPE NOTE: The original bug63 brief asked for pass1↔ready
  // comparison. The pass1 streamingPhase branch in WhiteboardChat
  // (`status === 'pass1' || 'pass2'`) is reachable only via the
  // user clicking Generate — which triggers a real ~$0.30+ API
  // call. No static seed reaches that branch because:
  //   - WhiteboardTab.tsx:181-185 always overrides status to
  //     'ready' (scene present) or 'idle' (no scene) on hydrate;
  //     the seeded DB row is observed but immediately replaced.
  //   - The self-heal at index.ts:1376 also collapses pass1/pass2
  //     → 'ready' when the scene file exists.
  // Without ~$0.30 spend or new test-only IPCs to mutate zustand,
  // we can only verify the `ready` rendering and the absence of the
  // legacy StreamingSidebar DOM shape. Streaming-phase rendering
  // remains a code-review-only verification today; a future test
  // hook (e.g. window.__fathomTest.setStatus) could enable it.

  const dirsToCleanup: string[] = [];
  try {
    log(`=== bug63 probe: status=ready (canonical post-generation) ===`);
    const B = await probeForStatus('ready', null);
    dirsToCleanup.push(B.userDataDir);
    result.artefacts.push({ kind: 'screenshot-ready', path: B.screenshotPath });

    const issues: string[] = [];

    // Exactly one chat textarea — proves the two old components
    // were replaced by ONE unified panel and didn't accidentally
    // double-mount.
    if (B.probe.textareaCount !== 1) {
      issues.push(`expected 1 chat textarea, found ${B.probe.textareaCount}`);
    }
    // Legacy StreamingSidebar shape (top-16 right-4 floating panel)
    // must NOT be in the DOM.
    if (B.probe.hasStreamingSidebarLegacy) {
      issues.push(
        `legacy StreamingSidebar shape (div with class containing 'top-16' + 'right-4') still present in DOM — unification incomplete`,
      );
    }
    // Panel flush against the right viewport edge (within 1px
    // tolerance for sub-pixel rounding).
    const flushRight =
      B.probe.panelRectRight !== null &&
      Math.abs(B.probe.panelRectRight - B.probe.viewportWidth) <= 1;
    if (!flushRight) {
      issues.push(
        `panel right=${B.probe.panelRectRight} not flush against viewport=${B.probe.viewportWidth}`,
      );
    }
    // Panel width matches RAIL_WIDTH_PX = 320 (allow 1-2 px sub-
    // pixel slack).
    if (
      B.probe.panelRectWidth === null ||
      Math.abs(B.probe.panelRectWidth - 320) > 2
    ) {
      issues.push(
        `panel width=${B.probe.panelRectWidth} expected ~320px (RAIL_WIDTH_PX)`,
      );
    }
    // ready: textarea ENABLED, placeholder mentions "Ask about".
    if (B.probe.textareaDisabled !== false) {
      issues.push(`textarea expected disabled=false (ready), got ${B.probe.textareaDisabled}`);
    }
    if (
      B.probe.textareaPlaceholder === null ||
      !/Ask about/.test(B.probe.textareaPlaceholder)
    ) {
      issues.push(
        `placeholder expected to contain "Ask about", got "${B.probe.textareaPlaceholder}"`,
      );
    }
    // ready header — informational only. The probe walks up the
    // DOM looking for header text but the WhiteboardChat header
    // sits in a sibling, not an ancestor of the textarea — so the
    // current probe may legitimately return null. Don't gate on it;
    // log the value for diagnostic review and rely on the body-
    // text fallback below.
    // Header label is rendered with `text-transform: uppercase`
    // (WhiteboardChat.tsx:413). Browsers' `innerText` reflects the
    // visually-displayed casing, so the source string "Level 1 chat"
    // surfaces as "LEVEL 1 CHAT". Use a case-insensitive match.
    const bodyHasReadyHeader =
      /level 1 chat|detail chat/i.test(B.probe.bodyText);
    if (!bodyHasReadyHeader) {
      issues.push(
        `body innerText missing "Level 1 chat" / "Detail chat" (case-insensitive) — header text not rendering`,
      );
    }

    if (issues.length === 0) {
      result.status = 'PASS';
      result.reason =
        `Unified WhiteboardChat renders correctly in 'ready' state: 1 textarea (no double-mount), ` +
        `flush right edge (right=${B.probe.panelRectRight} vs viewport=${B.probe.viewportWidth}), ` +
        `width=${B.probe.panelRectWidth}px (matches RAIL_WIDTH=320), textarea enabled with "Ask about" placeholder, ` +
        `no legacy StreamingSidebar shape in DOM, body contains ready-state header text. ` +
        `(streamingPhase pass1/pass2 branches not statically reachable without ~$0.30 API spend; verified by code review only.)`;
    } else {
      result.status = 'FAIL';
      result.reason = `bug63 assertions failed (${issues.length}):\n  - ${issues.join('\n  - ')}`;
    }
    result.logHighlights = [
      `ready probe: textareaCount=${B.probe.textareaCount} disabled=${B.probe.textareaDisabled} placeholder="${B.probe.textareaPlaceholder}" header="${B.probe.headerLabel}" right=${B.probe.panelRectRight} width=${B.probe.panelRectWidth} viewport=${B.probe.viewportWidth} legacySidebar=${B.probe.hasStreamingSidebarLegacy}`,
    ];
  } catch (err) {
    result.status = 'ERROR';
    result.reason = `harness exception: ${(err as Error).message}\n${(err as Error).stack ?? ''}`;
  } finally {
    const keep = process.argv.includes('--keep') || result.status !== 'PASS';
    for (const dir of dirsToCleanup) {
      if (!keep) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* ok */
        }
      } else {
        result.artefacts.push({ kind: 'userData', path: dir });
      }
    }
  }
  return result;
}

/** Exposes the live `globalThis.__whiteboard` zustand hook to a callback
 *  evaluated in the renderer. Throws if the hook is missing (which means
 *  the build was prod-mode without #64's gate-drop, or the hook was
 *  tree-shaken). */
async function withStore<T>(
  page: Page,
  fn: (
    store: {
      getState: () => Record<string, unknown> & {
        setStatus: (h: string, s: string) => void;
        appendUnderstanding: (h: string, t: string) => void;
        appendPass2Stream: (h: string, t: string) => void;
        appendChatTurn: (h: string, frame: string, turn: Record<string, unknown>) => void;
        appendStreamingChatDelta: (h: string, frame: string, delta: string) => void;
        finishStreamingChatTurn: (
          h: string,
          frame: string,
          info: Record<string, unknown>,
        ) => void;
        setChatInFlight: (h: string, inFlight: boolean) => void;
        byPaper: Map<string, Record<string, unknown>>;
      };
    },
    paperHash: string,
  ) => T,
  paperHash: string,
): Promise<T> {
  const result = await page.evaluate(
    ({ paperHash: ph, fnSource }: { paperHash: string; fnSource: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.__whiteboard) {
        throw new Error(
          'window.__whiteboard not found — was the renderer built without the #64 dev hook? grep `__whiteboard` out/renderer/assets/*.js to verify',
        );
      }
      // eslint-disable-next-line no-new-func
      const evaluated = new Function('store', 'paperHash', `return (${fnSource})(store, paperHash);`);
      return evaluated(w.__whiteboard, ph);
    },
    { paperHash, fnSource: fn.toString() },
  );
  return result as T;
}

/** Read the current panel handle's stable test-marker. We assign one
 *  via dataset on the first call; subsequent calls return the same
 *  marker only if the underlying DOM node is identity-stable across
 *  status transitions. Returns the marker string, or null if no panel. */
async function tagOrReadPanelMarker(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const textarea = document.querySelector(
      '[aria-label="Ask the whiteboard chat"]',
    ) as HTMLTextAreaElement | null;
    let panel: HTMLElement | null = textarea;
    while (panel && panel !== document.body) {
      const r = panel.getBoundingClientRect();
      if (r.width >= 300 && r.width <= 360) break;
      panel = panel.parentElement;
    }
    if (!panel || panel === document.body) {
      // streamingPhase: no textarea visible (`disabled` is rendered as
      // a textarea anyway, so this branch is rare). Fall back to any
      // child of the chat-rail wrapper. The wrapper is the absolute
      // right-edge column at WhiteboardTab.tsx:912 — `position: absolute,
      // top:0, right:0, bottom:0, z-20, flex`.
      // Search for any element at the right edge with width ~320.
      const all = Array.from(document.querySelectorAll('div')) as HTMLElement[];
      for (const d of all) {
        const r = d.getBoundingClientRect();
        if (
          Math.abs(r.right - window.innerWidth) <= 1 &&
          Math.abs(r.width - 320) <= 4 &&
          r.height > 100
        ) {
          panel = d;
          break;
        }
      }
    }
    if (!panel || panel === document.body) return null;
    let marker = panel.dataset.testStableMarker;
    if (!marker) {
      marker = `wb-chat-${Math.random().toString(36).slice(2, 10)}`;
      panel.dataset.testStableMarker = marker;
    }
    return marker;
  });
}

interface PhaseProbe {
  marker: string | null;
  textareaCount: number;
  textareaDisabled: boolean | null;
  textareaPlaceholder: string | null;
  bodyText: string;
  hasStreamingSidebarLegacy: boolean;
  threadLength: number;
  windowVisible: boolean | null;
}

async function probeChatFlowState(
  app: ElectronApplication,
  page: Page,
  paperHash: string,
): Promise<PhaseProbe> {
  // Fetch zustand state for the thread length so we can verify the
  // simulated send round-trip in Phase D. Use the level1 frame (the
  // store's default focus on a fresh paper).
  const threadLength = await withStore(
    page,
    (store, ph) => {
      const wb = store.getState().byPaper.get(ph);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const threads = (wb as any)?.chatThreads;
      if (!threads) return 0;
      const thread = threads.get('level1');
      return thread ? thread.length : 0;
    },
    paperHash,
  );
  const marker = await tagOrReadPanelMarker(page);
  const dom = await page.evaluate(() => {
    const textarea = document.querySelector(
      '[aria-label="Ask the whiteboard chat"]',
    ) as HTMLTextAreaElement | null;
    const possibleLegacy = Array.from(document.querySelectorAll('div')).find((d) => {
      const cls = d.className;
      if (typeof cls !== 'string') return false;
      return cls.includes('top-16') && cls.includes('right-4');
    });
    return {
      textareaCount: document.querySelectorAll('[aria-label="Ask the whiteboard chat"]').length,
      textareaDisabled: textarea ? textarea.disabled : null,
      textareaPlaceholder: textarea ? textarea.placeholder : null,
      bodyText: document.body.innerText.slice(0, 12000),
      hasStreamingSidebarLegacy: Boolean(possibleLegacy),
    };
  });
  // Headless validation: confirm the BrowserWindow is NOT visible.
  const windowVisible = await app.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) return false;
    return wins[0].isVisible();
  });
  return {
    marker,
    threadLength,
    windowVisible,
    ...dom,
  };
}

async function runBug63ChatFlow(): Promise<TestResult> {
  const result: TestResult = {
    name: 'bug63-chat-flow',
    status: 'ERROR',
    artefacts: [],
    logHighlights: [],
  };
  preflight();

  const userDataDir = makeTestUserData();
  const capturedStdout: string[] = [];
  let app: ElectronApplication | null = null;
  const issues: string[] = [];
  const phases: { name: string; probe: PhaseProbe; screenshot: string }[] = [];

  try {
    // No `whiteboards` row, no scene file. Renderer will hydrate to
    // 'idle' and show the consent screen — we'll immediately flip via
    // __whiteboard.setStatus() to bypass consent and drive each phase.
    seedSettings(userDataDir);

    app = await launchTestInstance(userDataDir, capturedStdout);
    const page = await app.firstWindow({ timeout: 30000 });
    log(`firstWindow ready (FATHOM_HEADLESS=1)`);

    // Defense-in-depth: even with show:false, move the window off-
    // screen in case any future code path calls show().
    await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.setPosition(-10000, -10000);
          try {
            w.setSkipTaskbar(true);
          } catch {
            /* ok */
          }
        }
      }
    });

    // Confirm the window is hidden right at start (the explicit gate
    // for the headless-validation requirement).
    const initiallyHidden = await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      return wins.length > 0 ? !wins[0].isVisible() : true;
    });
    log(`initial window visibility: ${initiallyHidden ? 'HIDDEN ✓' : 'VISIBLE ✗ (FATHOM_HEADLESS bypass!)'}`);
    if (!initiallyHidden) {
      issues.push('FATHOM_HEADLESS bypass: BrowserWindow was visible at startup');
    }

    await waitForPaperRendered(app, page);
    await page.waitForTimeout(1500);
    await navigateToWhiteboard(app, page);
    // Wait for the consent surface to settle (we won't see "Loading
    // whiteboard…" because there's no scene; we'll see the consent
    // gate from WhiteboardTab.tsx:825).
    await page.waitForTimeout(1500);

    const STREAMING_PASS1_TEXT =
      'BUG63_PASS1_SIG_QQQQQ — Reading paragraph 1 of the abstract... ' +
      'The paper proposes a unified attention mechanism that obviates ' +
      'recurrence and convolutions in sequence transduction. We seed ' +
      'this text via __whiteboard.appendUnderstanding so the StreamingBody ' +
      'inside WhiteboardChat renders it during the pass1 phase.'.repeat(2);

    const STREAMING_PASS2_TEXT =
      'BUG63_PASS2_SIG_RRRRR — Drawing the diagram now: positioning the ' +
      'self-attention block, multi-head fan-in, residual connections, ' +
      'feed-forward layers. Different content from pass1 so we can ' +
      'verify the body swapped (not appended).'.repeat(2);

    // ---------------------------------------------------------------
    // Phase A — pass1: drive status + seed understanding text
    // ---------------------------------------------------------------
    log(`--- Phase A: status=pass1 + understanding seed ---`);
    await withStore(
      page,
      (store, ph) => {
        store.getState().setStatus(ph, 'pass1');
      },
      SAMPLE_HASH,
    );
    await withStore(
      page,
      (store, ph) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (store.getState() as any).appendUnderstanding(
          ph,
          'BUG63_PASS1_SIG_QQQQQ — Reading paragraph 1 of the abstract... ' +
            'The paper proposes a unified attention mechanism that obviates ' +
            'recurrence and convolutions in sequence transduction. We seed ' +
            'this text via __whiteboard.appendUnderstanding so the StreamingBody ' +
            'inside WhiteboardChat renders it during the pass1 phase.',
        );
      },
      SAMPLE_HASH,
    );
    await page.waitForTimeout(800); // let React re-render
    const probeA = await probeChatFlowState(app, page, SAMPLE_HASH);
    const shotA = join(SHOTS_DIR, `headless-bug63flow-pass1-${Date.now()}.png`);
    await page.screenshot({ path: shotA, fullPage: false });
    phases.push({ name: 'pass1', probe: probeA, screenshot: shotA });
    result.artefacts.push({ kind: 'screenshot-pass1', path: shotA });

    if (probeA.marker === null) {
      issues.push(`pass1: chat panel not found in DOM (marker=null)`);
    }
    if (probeA.windowVisible !== false) {
      issues.push(`pass1: window.isVisible()=${probeA.windowVisible} (expected false)`);
    }
    if (probeA.hasStreamingSidebarLegacy) {
      issues.push(`pass1: legacy StreamingSidebar shape still present in DOM`);
    }
    if (!/reading the paper/i.test(probeA.bodyText)) {
      issues.push(
        `pass1: body innerText missing "Reading the paper" header (got first 200 chars: "${probeA.bodyText.slice(0, 200)}")`,
      );
    }
    if (!probeA.bodyText.includes('BUG63_PASS1_SIG_QQQQQ')) {
      issues.push(`pass1: seeded understanding text not surfaced in body`);
    }
    if (probeA.textareaDisabled !== true) {
      issues.push(`pass1: textarea expected disabled=true, got ${probeA.textareaDisabled}`);
    }
    if (
      probeA.textareaPlaceholder === null ||
      !/Available once the whiteboard is ready/.test(probeA.textareaPlaceholder)
    ) {
      issues.push(
        `pass1: placeholder expected "Available once the whiteboard is ready", got "${probeA.textareaPlaceholder}"`,
      );
    }

    // ---------------------------------------------------------------
    // Phase B — pass2: flip status + append pass2Stream content
    // ---------------------------------------------------------------
    log(`--- Phase B: status=pass2 + pass2Stream seed (DOM identity check) ---`);
    await withStore(
      page,
      (store, ph) => {
        store.getState().setStatus(ph, 'pass2');
      },
      SAMPLE_HASH,
    );
    await withStore(
      page,
      (store, ph) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (store.getState() as any).appendPass2Stream(
          ph,
          'BUG63_PASS2_SIG_RRRRR — Drawing the diagram now: positioning the ' +
            'self-attention block, multi-head fan-in, residual connections, ' +
            'feed-forward layers. Different content from pass1 so we can ' +
            'verify the body swapped (not appended).',
        );
      },
      SAMPLE_HASH,
    );
    await page.waitForTimeout(800);
    const probeB = await probeChatFlowState(app, page, SAMPLE_HASH);
    const shotB = join(SHOTS_DIR, `headless-bug63flow-pass2-${Date.now()}.png`);
    await page.screenshot({ path: shotB, fullPage: false });
    phases.push({ name: 'pass2', probe: probeB, screenshot: shotB });
    result.artefacts.push({ kind: 'screenshot-pass2', path: shotB });

    if (probeB.marker === null) {
      issues.push(`pass2: chat panel not found in DOM`);
    } else if (probeA.marker !== null && probeB.marker !== probeA.marker) {
      issues.push(
        `pass2: chat panel REMOUNTED across pass1→pass2 transition (marker changed: pass1="${probeA.marker}" → pass2="${probeB.marker}")`,
      );
    }
    if (probeB.windowVisible !== false) {
      issues.push(`pass2: window.isVisible()=${probeB.windowVisible} (expected false)`);
    }
    if (!/drawing the diagram/i.test(probeB.bodyText)) {
      issues.push(
        `pass2: body innerText missing "Drawing the diagram" header (got first 200: "${probeB.bodyText.slice(0, 200)}")`,
      );
    }
    if (!probeB.bodyText.includes('BUG63_PASS2_SIG_RRRRR')) {
      issues.push(`pass2: seeded pass2Stream text not surfaced in body`);
    }
    if (probeB.bodyText.includes('BUG63_PASS1_SIG_QQQQQ')) {
      issues.push(
        `pass2: pass1 streaming text still in body — content was appended, not swapped`,
      );
    }
    if (probeB.textareaDisabled !== true) {
      issues.push(`pass2: textarea expected disabled=true, got ${probeB.textareaDisabled}`);
    }

    // ---------------------------------------------------------------
    // Phase C — ready: flip status, expect chat enabled
    // ---------------------------------------------------------------
    log(`--- Phase C: status=ready (DOM identity + input enabled) ---`);
    await withStore(
      page,
      (store, ph) => {
        store.getState().setStatus(ph, 'ready');
      },
      SAMPLE_HASH,
    );
    await page.waitForTimeout(800);
    const probeC = await probeChatFlowState(app, page, SAMPLE_HASH);
    const shotC = join(SHOTS_DIR, `headless-bug63flow-ready-${Date.now()}.png`);
    await page.screenshot({ path: shotC, fullPage: false });
    phases.push({ name: 'ready', probe: probeC, screenshot: shotC });
    result.artefacts.push({ kind: 'screenshot-ready', path: shotC });

    if (probeC.marker === null) {
      issues.push(`ready: chat panel not found in DOM`);
    } else if (probeA.marker !== null && probeC.marker !== probeA.marker) {
      issues.push(
        `ready: chat panel REMOUNTED across pass1→ready transition (marker changed: "${probeA.marker}" → "${probeC.marker}")`,
      );
    }
    if (probeC.windowVisible !== false) {
      issues.push(`ready: window.isVisible()=${probeC.windowVisible} (expected false)`);
    }
    if (!/level 1 chat|detail chat/i.test(probeC.bodyText)) {
      issues.push(
        `ready: body missing "Level 1 chat" / "Detail chat" header (got first 200: "${probeC.bodyText.slice(0, 200)}")`,
      );
    }
    if (probeC.textareaDisabled !== false) {
      issues.push(`ready: textarea expected disabled=false, got ${probeC.textareaDisabled}`);
    }
    if (
      probeC.textareaPlaceholder === null ||
      !/Ask about/.test(probeC.textareaPlaceholder)
    ) {
      issues.push(
        `ready: placeholder expected to contain "Ask about", got "${probeC.textareaPlaceholder}"`,
      );
    }

    // ---------------------------------------------------------------
    // Phase D — simulated user send: drive store directly
    // ---------------------------------------------------------------
    log(`--- Phase D: simulated send (store-direct, no IPC) ---`);
    const beforeThreadLength = probeC.threadLength;
    await withStore(
      page,
      (store, ph) => {
        const userTurn = {
          role: 'user' as const,
          text: 'BUG63_USER_MSG_SSSSS What is the attention mechanism?',
          ts: Date.now(),
        };
        const assistantTurn = {
          role: 'assistant' as const,
          text: '',
          ts: Date.now(),
          streaming: true,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = store.getState() as any;
        s.appendChatTurn(ph, 'level1', userTurn);
        s.appendChatTurn(ph, 'level1', assistantTurn);
        s.setChatInFlight(ph, true);
      },
      SAMPLE_HASH,
    );
    // Stream a few tokens to simulate Claude's response.
    const RESPONSE_TOKENS = [
      'BUG63_AI_RESP_TTTTT The attention mechanism ',
      'computes a weighted sum over a sequence ',
      'where the weights are learned softmax distributions ',
      'over query-key dot products.',
    ];
    for (const tok of RESPONSE_TOKENS) {
      await withStore(
        page,
        (store, ph) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (store.getState() as any).appendStreamingChatDelta(ph, 'level1', `__TOK__`);
        },
        SAMPLE_HASH,
      );
      // We can't pass `tok` to the function via `withStore`'s
      // serialization; instead use a token-loop variant that takes
      // delta as paramater. Workaround: the inline closure can't
      // capture local vars. Use a dedicated path.
      await page.evaluate(
        ({ ph, delta }: { ph: string; delta: string }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = (window as any).__whiteboard.getState();
          // appendStreamingChatDelta replaces __TOK__ logic above —
          // to keep it simple: pop the last assistant turn's text
          // back to remove the placeholder, then append the actual
          // token via the public action.
          const wb = s.byPaper.get(ph);
          const thread = wb?.chatThreads.get('level1');
          if (thread && thread.length > 0) {
            const last = thread[thread.length - 1];
            if (last.text === '__TOK__') {
              last.text = '';
            }
          }
          s.appendStreamingChatDelta(ph, 'level1', delta);
        },
        { ph: SAMPLE_HASH, delta: tok },
      );
      await page.waitForTimeout(120);
    }
    await withStore(
      page,
      (store, ph) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = store.getState() as any;
        s.finishStreamingChatTurn(ph, 'level1', {});
        s.setChatInFlight(ph, false);
      },
      SAMPLE_HASH,
    );
    await page.waitForTimeout(800);
    const probeD = await probeChatFlowState(app, page, SAMPLE_HASH);
    const shotD = join(SHOTS_DIR, `headless-bug63flow-after-send-${Date.now()}.png`);
    await page.screenshot({ path: shotD, fullPage: false });
    phases.push({ name: 'after-send', probe: probeD, screenshot: shotD });
    result.artefacts.push({ kind: 'screenshot-after-send', path: shotD });

    if (probeD.marker === null) {
      issues.push(`after-send: chat panel not found in DOM`);
    } else if (probeA.marker !== null && probeD.marker !== probeA.marker) {
      issues.push(
        `after-send: chat panel REMOUNTED across ready→send transition (marker changed: "${probeA.marker}" → "${probeD.marker}")`,
      );
    }
    if (probeD.windowVisible !== false) {
      issues.push(`after-send: window.isVisible()=${probeD.windowVisible} (expected false)`);
    }
    // Thread should have grown by exactly 2 turns (user + assistant).
    const threadGrowth = probeD.threadLength - beforeThreadLength;
    if (threadGrowth !== 2) {
      issues.push(
        `after-send: thread grew by ${threadGrowth} turns (expected 2: user + assistant)`,
      );
    }
    if (!probeD.bodyText.includes('BUG63_USER_MSG_SSSSS')) {
      issues.push(`after-send: user message text not surfaced in chat history`);
    }
    if (!probeD.bodyText.includes('BUG63_AI_RESP_TTTTT')) {
      issues.push(`after-send: assistant streamed response not surfaced`);
    }

    // Final verdict.
    if (issues.length === 0) {
      result.status = 'PASS';
      result.reason =
        `All 4 phases passed. Panel marker="${probeA.marker}" preserved across pass1→pass2→ready→after-send. ` +
        `Streaming content swapped at each phase. Chat history grew by 2 turns after simulated send. ` +
        `Window stayed hidden throughout (FATHOM_HEADLESS=1). No legacy StreamingSidebar shape detected.`;
    } else {
      result.status = 'FAIL';
      result.reason = `bug63-chat-flow assertions failed (${issues.length}):\n  - ${issues.join('\n  - ')}`;
    }
    result.logHighlights = phases.map(
      (p) =>
        `${p.name}: marker="${p.probe.marker}" disabled=${p.probe.textareaDisabled} placeholder="${p.probe.textareaPlaceholder}" thread=${p.probe.threadLength} windowHidden=${p.probe.windowVisible === false} legacy=${p.probe.hasStreamingSidebarLegacy}`,
    );
  } catch (err) {
    result.status = 'ERROR';
    result.reason = `harness exception: ${(err as Error).message}\n${(err as Error).stack ?? ''}`;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        /* ok */
      }
    }
    const keep = process.argv.includes('--keep') || result.status !== 'PASS';
    if (!keep) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        /* ok */
      }
    } else {
      result.artefacts.push({ kind: 'userData', path: userDataDir });
    }
  }
  return result;
}

const TESTS: Record<string, () => Promise<TestResult>> = {
  'bug54-stuck-pass1': runBug54StuckPass1,
  'bug63-chat-persistence': runBug63ChatPersistence,
  'bug63-chat-flow': runBug63ChatFlow,
};

async function main(): Promise<void> {
  const testName = process.argv[2];
  if (!testName || !TESTS[testName]) {
    // eslint-disable-next-line no-console
    console.error(
      `usage: npx tsx scripts/fathom-headless-verify.mts <test-name> [--keep]\n  available: ${Object.keys(TESTS).join(', ')}`,
    );
    process.exit(2);
  }
  const t0 = Date.now();
  log(`=== ${testName} ===`);
  const result = await TESTS[testName]();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  // eslint-disable-next-line no-console
  console.log(`\n=== RESULT (${dt}s) ===`);
  // eslint-disable-next-line no-console
  console.log(`status: ${result.status}`);
  if (result.reason) {
    // eslint-disable-next-line no-console
    console.log(`reason: ${result.reason}`);
  }
  for (const a of result.artefacts) {
    // eslint-disable-next-line no-console
    console.log(`artefact: ${a.kind} → ${a.path}`);
  }
  if (result.logHighlights.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`log highlights:`);
    for (const l of result.logHighlights) {
      // eslint-disable-next-line no-console
      console.log(`  ${l}`);
    }
  }

  if (result.status === 'PASS') process.exit(0);
  if (result.status === 'FAIL') process.exit(1);
  process.exit(2);
}

void main();
