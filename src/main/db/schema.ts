import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'lens.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  dbInstance = db;
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      content_hash TEXT PRIMARY KEY,
      title TEXT,
      last_opened INTEGER NOT NULL,
      digest_json TEXT
    );

    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      paper_hash TEXT NOT NULL,
      page INTEGER NOT NULL,
      parent_id TEXT,
      bbox_json TEXT,
      original_text TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      FOREIGN KEY (paper_hash) REFERENCES papers(content_hash) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES regions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_regions_paper ON regions(paper_hash, page);
    CREATE INDEX IF NOT EXISTS idx_regions_parent ON regions(parent_id);

    CREATE TABLE IF NOT EXISTS explanations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region_id TEXT NOT NULL,
      depth INTEGER NOT NULL,
      focus_phrase TEXT,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_explanations_region ON explanations(region_id, depth);

    -- Highlights: amber (or palette-coloured) marks the user drops over
    -- passages they want to keep visible. rects_json is a JSON array of
    -- PDF user-space rectangles, one entry per line of the selection
    -- (selections can span multiple lines with different widths).
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      paper_hash TEXT NOT NULL,
      page INTEGER NOT NULL,
      rects_json TEXT NOT NULL,
      text TEXT,
      color TEXT NOT NULL DEFAULT 'amber',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (paper_hash) REFERENCES papers(content_hash) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_highlights_paper_page ON highlights(paper_hash, page);

    -- Drill edges: a directed parent→child link recording that the
    -- user drilled on a phrase inside parent_lens_id, producing
    -- child_lens_id. Used to render in-lens markers for previously-
    -- drilled phrases, so the recursion is visible *inside* a lens
    -- the same way page-level markers are visible on the PDF. The
    -- (parent, child) pair is unique because drilling on the same
    -- phrase twice should land you on the same child lens.
    CREATE TABLE IF NOT EXISTS drill_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_hash TEXT NOT NULL,
      parent_lens_id TEXT NOT NULL,
      child_lens_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      selection TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(parent_lens_id, child_lens_id)
    );
    CREATE INDEX IF NOT EXISTS idx_drill_edges_parent ON drill_edges(parent_lens_id);
    CREATE INDEX IF NOT EXISTS idx_drill_edges_paper ON drill_edges(paper_hash);

    -- Lens anchors: one row per lens the user has ever opened,
    -- keyed by lens_id. Holds the zoom image path, the bbox the
    -- marker pins to, and origin metadata. Decoupled from the
    -- explanations table so a lens that was opened but never asked
    -- still has a persisted record — zoom image survives the
    -- close/reopen cycle, amber marker re-hydrates on paper open.
    --
    -- Tables work together:
    --   regions       paragraph-extraction metadata
    --   explanations  Q&A turns by region_id
    --   highlights    amber marks on the PDF
    --   drill_edges   parent to child drill relationships
    --   lens_anchors  lens-open registry (THIS table)
    CREATE TABLE IF NOT EXISTS lens_anchors (
      lens_id TEXT PRIMARY KEY,
      paper_hash TEXT NOT NULL,
      origin TEXT NOT NULL,
      page INTEGER NOT NULL,
      bbox_json TEXT,
      region_id TEXT,
      zoom_image_path TEXT,
      anchor_text TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lens_anchors_paper ON lens_anchors(paper_hash);

    -- Lens highlights: amber marks the user drops inside a LENS body
    -- (not on the PDF page). PDF highlights store rects in user-space
    -- and re-render at any zoom; lens highlights can't because the
    -- markdown body re-flows. Instead we store the selected text and
    -- the lens_id, then re-find that text in the body on render and
    -- wrap it. Same UI affordance as the PDF highlight, different
    -- anchor mechanism. CLAUDE.md §2.4 ("highlighter should work
    -- inside the lens too").
    CREATE TABLE IF NOT EXISTS lens_highlights (
      id TEXT PRIMARY KEY,
      lens_id TEXT NOT NULL,
      paper_hash TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'amber',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lens_highlights_lens ON lens_highlights(lens_id);
    CREATE INDEX IF NOT EXISTS idx_lens_highlights_paper ON lens_highlights(paper_hash);

    -- Lens turns: chat history keyed by lens_id (not region_id) so
    -- viewport-origin and drill-origin lenses — which have no
    -- regionId — get their answers persisted too. The legacy
    -- explanations table is region-keyed and silently dropped any
    -- streamed answer when regionId was null; this table is the
    -- replacement that always writes regardless of origin. (lens_id,
    -- turn_index) is unique so a re-stream of the same turn replaces
    -- rather than duplicating.
    CREATE TABLE IF NOT EXISTS lens_turns (
      lens_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      question TEXT,
      body TEXT NOT NULL,
      prompt TEXT,
      session_id TEXT,
      zoom_image_path TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (lens_id, turn_index)
    );
    CREATE INDEX IF NOT EXISTS idx_lens_turns_lens ON lens_turns(lens_id);
  `);

  // Additive migration: per-paper reading-position memory + path
  // recall. Adds columns to the existing papers table without
  // dropping it (which would lose all the digest_json work). Used
  // by todo #42 (reopen at last position) and #43 (recent papers
  // on the welcome screen).
  const paperCols = db.pragma('table_info(papers)') as Array<{ name: string }>;
  if (!paperCols.some((c) => c.name === 'last_scroll_y')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_scroll_y INTEGER DEFAULT 0');
  }
  if (!paperCols.some((c) => c.name === 'last_path')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_path TEXT');
  }
  // todo #42 v2 — raw scrollY isn't enough. The user reported reopen
  // landed on the wrong page because scrollY in CSS px depends on
  // zoom: scroll=2000 at zoom=1 lands on a different page than
  // scroll=2000 at zoom=2. Persist page + offset-in-page + zoom too,
  // so reopen restores all three independent of how the previous
  // session was sized.
  if (!paperCols.some((c) => c.name === 'last_page')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_page INTEGER');
  }
  if (!paperCols.some((c) => c.name === 'last_offset_in_page')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_offset_in_page REAL');
  }
  if (!paperCols.some((c) => c.name === 'last_zoom')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_zoom REAL');
  }

  // Additive migration: the zoom image path was added after the initial schema shipped.
  // Check pragma and only ALTER if the column is missing.
  const cols = db.pragma('table_info(explanations)') as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'zoom_image_path')) {
    db.exec('ALTER TABLE explanations ADD COLUMN zoom_image_path TEXT');
  }

  // Inline two-finger-ask flow: distinguishes lens anchors that were
  // opened via the full-screen lens ('lens') from those born inside an
  // in-page Ask bubble ('inline'). Used at hydration time to colour
  // the marker correctly — inline asks render red while the stream is
  // in flight (no body in lens_turns yet) and amber once an answer
  // exists. Pre-existing rows default to 'lens' so nothing about the
  // current lens-marker rendering changes for old data.
  const anchorCols = db.pragma('table_info(lens_anchors)') as Array<{ name: string }>;
  if (!anchorCols.some((c) => c.name === 'display_mode')) {
    db.exec("ALTER TABLE lens_anchors ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'lens'");
  }

  // Whiteboard diagrams (spec: .claude/specs/whiteboard-diagrams.md +
  // docs/methodology/whiteboard.md). One row per paper that has had a
  // whiteboard generated. Filesystem still holds the source of truth
  // (whiteboard.excalidraw, whiteboard-understanding.md, whiteboard-
  // issues.json under the sidecar) — this table is the *index* the
  // main process consults to answer "is there a whiteboard for this
  // paper?" without stat-ing the disk on every paper-state lookup.
  //
  // Status lifecycle: pass1 -> pass2 -> ready (happy path) or
  // pass1 -> failed / pass2 -> failed at any stage. The renderer reads
  // this status to drive the consent prompt vs Doherty skeleton vs
  // hydrated render. Cost columns are optional; surfaced to the user
  // in the methodology doc when/if we add a per-paper cost panel.
  db.exec(`
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
  `);

  // GitHub-repo grounding (spec: .claude/specs/github-repo-grounding.md).
  // The user pastes a git URL in Preferences; we clone into a managed
  // userData dir and add the local clone path to the same
  // `additionalDirectories` array we already feed Claude during every
  // explain call. One row per cloned repo. Keyed by URL (UNIQUE) so
  // re-adding the same URL is idempotent.
  //
  // Status lifecycle: pending -> cloning -> ready (happy path) or
  // pending -> cloning -> failed (network / 404 / private). 'evicted'
  // is reserved for future use if we want to keep history of removed
  // repos; v1 hard-deletes the row on remove.
  db.exec(`
    CREATE TABLE IF NOT EXISTS grounding_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      local_path TEXT NOT NULL,
      cloned_at INTEGER,
      last_used_at INTEGER,
      size_bytes INTEGER,
      clone_status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_grounding_repos_status ON grounding_repos(clone_status);
  `);
}
