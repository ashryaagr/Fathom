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

  // Additive migration: the zoom image path was added after the initial schema shipped.
  // Check pragma and only ALTER if the column is missing.
  const cols = db.pragma('table_info(explanations)') as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'zoom_image_path')) {
    db.exec('ALTER TABLE explanations ADD COLUMN zoom_image_path TEXT');
  }
}
