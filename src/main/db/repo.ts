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

export interface HighlightRow {
  id: string;
  paper_hash: string;
  page: number;
  rects_json: string;
  text: string | null;
  color: string;
  created_at: number;
}

export const Highlights = {
  insert(h: {
    id: string;
    paperHash: string;
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
    text?: string;
    color?: string;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO highlights(id, paper_hash, page, rects_json, text, color, created_at)
         VALUES (@id, @paper_hash, @page, @rects_json, @text, @color, @created_at)
         ON CONFLICT(id) DO UPDATE SET
           rects_json = excluded.rects_json,
           color = excluded.color,
           text = excluded.text`,
      )
      .run({
        id: h.id,
        paper_hash: h.paperHash,
        page: h.page,
        rects_json: JSON.stringify(h.rects),
        text: h.text ?? null,
        color: h.color ?? 'amber',
        created_at: Date.now(),
      });
  },
  byPaper(paperHash: string): HighlightRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM highlights WHERE paper_hash = ? ORDER BY page, created_at',
      )
      .all(paperHash) as HighlightRow[];
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM highlights WHERE id = ?').run(id);
  },
};

export interface DrillEdgeRow {
  id: number;
  paper_hash: string;
  parent_lens_id: string;
  child_lens_id: string;
  turn_index: number;
  selection: string;
  created_at: number;
}

export interface LensAnchorRow {
  lens_id: string;
  paper_hash: string;
  origin: string;
  page: number;
  bbox_json: string | null;
  region_id: string | null;
  zoom_image_path: string | null;
  anchor_text: string | null;
  created_at: number;
}

export const LensAnchors = {
  upsert(a: {
    lensId: string;
    paperHash: string;
    origin: string;
    page: number;
    bbox: { x: number; y: number; width: number; height: number } | null;
    regionId: string | null;
    zoomImagePath?: string | null;
    anchorText?: string | null;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO lens_anchors(lens_id, paper_hash, origin, page, bbox_json, region_id, zoom_image_path, anchor_text, created_at)
         VALUES (@lens_id, @paper_hash, @origin, @page, @bbox_json, @region_id, @zoom_image_path, @anchor_text, @created_at)
         ON CONFLICT(lens_id) DO UPDATE SET
           bbox_json       = COALESCE(excluded.bbox_json, lens_anchors.bbox_json),
           region_id       = COALESCE(excluded.region_id, lens_anchors.region_id),
           zoom_image_path = COALESCE(excluded.zoom_image_path, lens_anchors.zoom_image_path),
           anchor_text     = COALESCE(excluded.anchor_text, lens_anchors.anchor_text)`,
      )
      .run({
        lens_id: a.lensId,
        paper_hash: a.paperHash,
        origin: a.origin,
        page: a.page,
        bbox_json: a.bbox ? JSON.stringify(a.bbox) : null,
        region_id: a.regionId,
        zoom_image_path: a.zoomImagePath ?? null,
        anchor_text: a.anchorText ?? null,
        created_at: Date.now(),
      });
  },
  byPaper(paperHash: string): LensAnchorRow[] {
    return getDb()
      .prepare('SELECT * FROM lens_anchors WHERE paper_hash = ? ORDER BY created_at')
      .all(paperHash) as LensAnchorRow[];
  },
};

export const DrillEdges = {
  insert(e: {
    paperHash: string;
    parentLensId: string;
    childLensId: string;
    turnIndex: number;
    selection: string;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO drill_edges(paper_hash, parent_lens_id, child_lens_id, turn_index, selection, created_at)
         VALUES (@paper_hash, @parent_lens_id, @child_lens_id, @turn_index, @selection, @created_at)
         ON CONFLICT(parent_lens_id, child_lens_id) DO UPDATE SET
           turn_index = excluded.turn_index,
           selection = excluded.selection`,
      )
      .run({
        paper_hash: e.paperHash,
        parent_lens_id: e.parentLensId,
        child_lens_id: e.childLensId,
        turn_index: e.turnIndex,
        selection: e.selection,
        created_at: Date.now(),
      });
  },
  byPaper(paperHash: string): DrillEdgeRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM drill_edges WHERE paper_hash = ? ORDER BY parent_lens_id, created_at',
      )
      .all(paperHash) as DrillEdgeRow[];
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

export interface LensTurnRow {
  lens_id: string;
  turn_index: number;
  question: string | null;
  body: string;
  prompt: string | null;
  session_id: string | null;
  zoom_image_path: string | null;
  created_at: number;
}

export const LensTurns = {
  // ON CONFLICT replaces an existing turn at the same (lens_id, turn_index)
  // — needed because the same turn can be re-streamed (regenerate, error
  // retry) and we want the latest body to win without leaving stale rows.
  upsert(t: {
    lensId: string;
    turnIndex: number;
    question?: string | null;
    body: string;
    prompt?: string | null;
    sessionId?: string | null;
    zoomImagePath?: string | null;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO lens_turns(lens_id, turn_index, question, body, prompt, session_id, zoom_image_path, created_at)
         VALUES (@lens_id, @turn_index, @question, @body, @prompt, @session_id, @zoom_image_path, @created_at)
         ON CONFLICT(lens_id, turn_index) DO UPDATE SET
           question = excluded.question,
           body = excluded.body,
           prompt = excluded.prompt,
           session_id = excluded.session_id,
           zoom_image_path = excluded.zoom_image_path`,
      )
      .run({
        lens_id: t.lensId,
        turn_index: t.turnIndex,
        question: t.question ?? null,
        body: t.body,
        prompt: t.prompt ?? null,
        session_id: t.sessionId ?? null,
        zoom_image_path: t.zoomImagePath ?? null,
        created_at: Date.now(),
      });
  },
  byPaper(paperHash: string): LensTurnRow[] {
    return getDb()
      .prepare(
        `SELECT lt.* FROM lens_turns lt
         JOIN lens_anchors la ON la.lens_id = lt.lens_id
         WHERE la.paper_hash = ?
         ORDER BY lt.lens_id, lt.turn_index`,
      )
      .all(paperHash) as LensTurnRow[];
  },
};
