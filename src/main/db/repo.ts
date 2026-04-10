import { getDb } from './schema';

export interface PaperRow {
  content_hash: string;
  title: string | null;
  last_opened: number;
  digest_json: string | null;
}

export interface RegionRow {
  id: string;
  paper_hash: string;
  page: number;
  parent_id: string | null;
  bbox_json: string | null;
  original_text: string;
  ordinal: number;
}

export interface ExplanationRow {
  id: number;
  region_id: string;
  depth: number;
  focus_phrase: string | null;
  body: string;
  created_at: number;
  zoom_image_path: string | null;
}

export const Papers = {
  upsert(p: { contentHash: string; title?: string; digest?: unknown }): void {
    getDb()
      .prepare(
        `INSERT INTO papers(content_hash, title, last_opened, digest_json)
         VALUES (@hash, @title, @now, @digest)
         ON CONFLICT(content_hash) DO UPDATE SET
           title = COALESCE(excluded.title, papers.title),
           last_opened = excluded.last_opened,
           digest_json = COALESCE(excluded.digest_json, papers.digest_json)`,
      )
      .run({
        hash: p.contentHash,
        title: p.title ?? null,
        now: Date.now(),
        digest: p.digest ? JSON.stringify(p.digest) : null,
      });
  },
  get(contentHash: string): PaperRow | null {
    return (getDb()
      .prepare('SELECT * FROM papers WHERE content_hash = ?')
      .get(contentHash) as PaperRow | undefined) ?? null;
  },
};

export const Regions = {
  upsert(r: RegionRow): void {
    getDb()
      .prepare(
        `INSERT INTO regions(id, paper_hash, page, parent_id, bbox_json, original_text, ordinal)
         VALUES (@id, @paper_hash, @page, @parent_id, @bbox_json, @original_text, @ordinal)
         ON CONFLICT(id) DO UPDATE SET
           bbox_json = excluded.bbox_json,
           original_text = excluded.original_text,
           ordinal = excluded.ordinal`,
      )
      .run(r);
  },
  upsertMany(rows: RegionRow[]): void {
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO regions(id, paper_hash, page, parent_id, bbox_json, original_text, ordinal)
       VALUES (@id, @paper_hash, @page, @parent_id, @bbox_json, @original_text, @ordinal)
       ON CONFLICT(id) DO UPDATE SET
         bbox_json = excluded.bbox_json,
         original_text = excluded.original_text,
         ordinal = excluded.ordinal`,
    );
    const tx = db.transaction((items: RegionRow[]) => {
      for (const item of items) stmt.run(item);
    });
    tx(rows);
  },
  byPaper(paperHash: string): RegionRow[] {
    return getDb()
      .prepare('SELECT * FROM regions WHERE paper_hash = ? ORDER BY page, ordinal')
      .all(paperHash) as RegionRow[];
  },
};

export const Explanations = {
  insert(e: {
    regionId: string;
    depth: number;
    focusPhrase: string | null;
    body: string;
    zoomImagePath?: string | null;
  }): number {
    const result = getDb()
      .prepare(
        `INSERT INTO explanations(region_id, depth, focus_phrase, body, created_at, zoom_image_path)
         VALUES (@region_id, @depth, @focus_phrase, @body, @created_at, @zoom_image_path)`,
      )
      .run({
        region_id: e.regionId,
        depth: e.depth,
        focus_phrase: e.focusPhrase,
        body: e.body,
        created_at: Date.now(),
        zoom_image_path: e.zoomImagePath ?? null,
      });
    return Number(result.lastInsertRowid);
  },
  byPaper(paperHash: string): ExplanationRow[] {
    return getDb()
      .prepare(
        `SELECT e.* FROM explanations e
         JOIN regions r ON r.id = e.region_id
         WHERE r.paper_hash = ?
         ORDER BY e.region_id, e.depth, e.created_at`,
      )
      .all(paperHash) as ExplanationRow[];
  },
};
