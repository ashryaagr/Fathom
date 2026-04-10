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
  `);

  // Additive migration: the zoom image path was added after the initial schema shipped.
  // Check pragma and only ALTER if the column is missing.
  const cols = db.pragma('table_info(explanations)') as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'zoom_image_path')) {
    db.exec('ALTER TABLE explanations ADD COLUMN zoom_image_path TEXT');
  }
}
