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
  `);

  // Additive migration: the zoom image path was added after the initial schema shipped.
  // Check pragma and only ALTER if the column is missing.
  const cols = db.pragma('table_info(explanations)') as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'zoom_image_path')) {
    db.exec('ALTER TABLE explanations ADD COLUMN zoom_image_path TEXT');
  }
}
