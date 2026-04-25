import { getDb } from './schema';

export interface PaperRow {
  content_hash: string;
  title: string | null;
  last_opened: number;
  digest_json: string | null;
  last_scroll_y: number | null;
  last_path: string | null;
  /** Reading-position memory v2 — page + offset + zoom. Raw scrollY
   * (above) is kept as a back-compat fallback for old rows that
   * predate v2. (todo #42) */
  last_page: number | null;
  last_offset_in_page: number | null;
  last_zoom: number | null;
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
  upsert(p: { contentHash: string; title?: string; digest?: unknown; path?: string }): void {
    getDb()
      .prepare(
        `INSERT INTO papers(content_hash, title, last_opened, digest_json, last_path)
         VALUES (@hash, @title, @now, @digest, @path)
         ON CONFLICT(content_hash) DO UPDATE SET
           title = COALESCE(excluded.title, papers.title),
           last_opened = excluded.last_opened,
           digest_json = COALESCE(excluded.digest_json, papers.digest_json),
           last_path = COALESCE(excluded.last_path, papers.last_path)`,
      )
      .run({
        hash: p.contentHash,
        title: p.title ?? null,
        now: Date.now(),
        digest: p.digest ? JSON.stringify(p.digest) : null,
        path: p.path ?? null,
      });
  },
  get(contentHash: string): PaperRow | null {
    return (getDb()
      .prepare('SELECT * FROM papers WHERE content_hash = ?')
      .get(contentHash) as PaperRow | undefined) ?? null;
  },
  /** Persist where the user was scrolled to in the PDF, so the next
   * open lands at the same place. Throttled writes are the renderer's
   * responsibility — this just clobbers the columns. (todo #42)
   *
   * v2 takes the full position vector (page + offset-in-page + zoom)
   * because raw scrollY is zoom-dependent and was producing the
   * "wrong page on reopen" bug. The legacy `scrollY` field is still
   * written as a back-compat hint but the renderer prefers the v2
   * fields when present. */
  saveScroll(args: {
    contentHash: string;
    scrollY: number;
    page?: number;
    offsetInPage?: number;
    zoom?: number;
  }): void {
    getDb()
      .prepare(
        `UPDATE papers SET
           last_scroll_y = @scroll,
           last_page = COALESCE(@page, last_page),
           last_offset_in_page = COALESCE(@offset, last_offset_in_page),
           last_zoom = COALESCE(@zoom, last_zoom)
         WHERE content_hash = @hash`,
      )
      .run({
        hash: args.contentHash,
        scroll: Math.max(0, Math.round(args.scrollY)),
        page: typeof args.page === 'number' ? args.page : null,
        offset:
          typeof args.offsetInPage === 'number'
            ? Math.max(0, Math.min(1, args.offsetInPage))
            : null,
        zoom: typeof args.zoom === 'number' ? args.zoom : null,
      });
  },
  /** Most-recently-opened papers (drives the welcome screen's recent
   * list, todo #43). Filters out rows without a known path because we
   * can't reopen them without one — but they stay in the DB so other
   * paper-keyed state (lens turns, highlights) is preserved. */
  recent(limit: number): PaperRow[] {
    return getDb()
      .prepare(
        `SELECT * FROM papers
         WHERE last_path IS NOT NULL AND last_path != ''
         ORDER BY last_opened DESC
         LIMIT ?`,
      )
      .all(limit) as PaperRow[];
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
  /** 'lens' for full-screen-lens-origin anchors, 'inline' for the
   * inline two-finger-ask flow. Drives marker colour at hydrate time
   * (red while the inline stream is in flight, amber once a body
   * exists in `lens_turns`). */
  display_mode: string;
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
    /** When omitted, the row is inserted as 'lens' but an existing
     * row's mode is preserved on conflict — so the Ask-button / ⌘+
     * pinch open path doesn't accidentally downgrade an existing
     * 'inline' row when the user later opens it as a lens. The
     * inline-ask flow always sends `displayMode: 'inline'`
     * explicitly. */
    displayMode?: string | null;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO lens_anchors(lens_id, paper_hash, origin, page, bbox_json, region_id, zoom_image_path, anchor_text, display_mode, created_at)
         VALUES (@lens_id, @paper_hash, @origin, @page, @bbox_json, @region_id, @zoom_image_path, @anchor_text, @display_mode, @created_at)
         ON CONFLICT(lens_id) DO UPDATE SET
           bbox_json       = COALESCE(excluded.bbox_json, lens_anchors.bbox_json),
           region_id       = COALESCE(excluded.region_id, lens_anchors.region_id),
           zoom_image_path = COALESCE(excluded.zoom_image_path, lens_anchors.zoom_image_path),
           anchor_text     = COALESCE(excluded.anchor_text, lens_anchors.anchor_text),
           display_mode    = COALESCE(@display_mode_override, lens_anchors.display_mode)`,
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
        // INSERT path always needs a non-null value because the column
        // is NOT NULL DEFAULT 'lens'; UPDATE path uses the override
        // expression above (NULL → keep existing).
        display_mode: a.displayMode ?? 'lens',
        display_mode_override: a.displayMode ?? null,
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

export interface LensHighlightRow {
  id: string;
  lens_id: string;
  paper_hash: string;
  selected_text: string;
  color: string;
  created_at: number;
}

export const LensHighlights = {
  insert(h: {
    id: string;
    lensId: string;
    paperHash: string;
    selectedText: string;
    color?: string;
  }): void {
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO lens_highlights(id, lens_id, paper_hash, selected_text, color, created_at)
         VALUES (@id, @lens_id, @paper_hash, @selected_text, @color, @created_at)`,
      )
      .run({
        id: h.id,
        lens_id: h.lensId,
        paper_hash: h.paperHash,
        selected_text: h.selectedText,
        color: h.color ?? 'amber',
        created_at: Date.now(),
      });
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM lens_highlights WHERE id = ?').run(id);
  },
  byPaper(paperHash: string): LensHighlightRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM lens_highlights WHERE paper_hash = ? ORDER BY created_at',
      )
      .all(paperHash) as LensHighlightRow[];
  },
};

/**
 * GitHub-repo grounding. The user adds a git URL in Preferences; we
 * clone it into a managed userData dir and feed the local path into
 * the same `additionalDirectories` array Claude already uses for
 * extra grounding folders. See `src/main/repos/cloneManager.ts` for
 * the actual `git clone` shell-out and `.claude/specs/github-repo-
 * grounding.md` for the design.
 *
 * Lifecycle of `clone_status`:
 *   pending  → row inserted, clone not yet started
 *   cloning  → `git clone` subprocess running
 *   ready    → clone succeeded; local_path is a valid checkout
 *   failed   → clone failed; `error` column has the message
 *   evicted  → reserved (v1 hard-deletes on remove)
 */
export interface GroundingRepoRow {
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

export const GroundingRepos = {
  /** All repos, newest first. The Settings panel renders this list as-is. */
  list(): GroundingRepoRow[] {
    return getDb()
      .prepare('SELECT * FROM grounding_repos ORDER BY created_at DESC')
      .all() as GroundingRepoRow[];
  },
  /** Look up by URL (UNIQUE). Used to short-circuit "add" when the user
   * pastes a URL we already have a row for. */
  getByUrl(url: string): GroundingRepoRow | null {
    return (getDb()
      .prepare('SELECT * FROM grounding_repos WHERE url = ?')
      .get(url) as GroundingRepoRow | undefined) ?? null;
  },
  getById(id: number): GroundingRepoRow | null {
    return (getDb()
      .prepare('SELECT * FROM grounding_repos WHERE id = ?')
      .get(id) as GroundingRepoRow | undefined) ?? null;
  },
  /** Repos whose clone is on disk and usable as a grounding directory.
   * Wired into the `additionalDirectories` build path in `explain:start`. */
  ready(): GroundingRepoRow[] {
    return getDb()
      .prepare("SELECT * FROM grounding_repos WHERE clone_status = 'ready'")
      .all() as GroundingRepoRow[];
  },
  /** Insert a fresh row at status='pending'. The clone manager flips
   * status as it progresses. Returns the new row id. Throws on URL
   * collision — callers should `getByUrl` first. */
  add(args: { url: string; localPath: string }): number {
    const result = getDb()
      .prepare(
        `INSERT INTO grounding_repos(url, local_path, clone_status, created_at)
         VALUES (@url, @local_path, 'pending', @created_at)`,
      )
      .run({
        url: args.url,
        local_path: args.localPath,
        created_at: Date.now(),
      });
    return Number(result.lastInsertRowid);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM grounding_repos WHERE id = ?').run(id);
  },
  /** Bump `last_used_at` so the eviction job knows the user is still
   * actively grounding against this repo. Called from `explain:start`
   * for every ready repo we feed into `additionalDirectories`. */
  markUsed(id: number): void {
    getDb()
      .prepare('UPDATE grounding_repos SET last_used_at = ? WHERE id = ?')
      .run(Date.now(), id);
  },
  /** Internal helper used by the clone manager to flip status + persist
   * size + error string in a single round-trip. Pass undefined to leave
   * a column unchanged. */
  updateStatus(args: {
    id: number;
    status: GroundingRepoRow['clone_status'];
    sizeBytes?: number | null;
    error?: string | null;
    clonedAt?: number | null;
  }): void {
    getDb()
      .prepare(
        `UPDATE grounding_repos SET
           clone_status = @status,
           size_bytes   = COALESCE(@size_bytes, size_bytes),
           error        = @error,
           cloned_at    = COALESCE(@cloned_at, cloned_at)
         WHERE id = @id`,
      )
      .run({
        id: args.id,
        status: args.status,
        size_bytes: args.sizeBytes ?? null,
        // Pass NULL explicitly when the caller wants to clear the
        // error column on a successful retry. Default-undefined keeps
        // the existing message.
        error: args.error === undefined ? null : args.error,
        cloned_at: args.clonedAt ?? null,
      });
  },
  /** Repos whose `last_used_at` is older than `cutoff` (ms epoch) AND
   * are in the 'ready' state. The eviction job consumes this list at
   * app start. Repos that have never been used (`last_used_at IS NULL`)
   * use `cloned_at` as the fallback timestamp — a repo cloned weeks
   * ago and never queried is still a candidate. */
  staleReady(cutoff: number): GroundingRepoRow[] {
    return getDb()
      .prepare(
        `SELECT * FROM grounding_repos
         WHERE clone_status = 'ready'
           AND COALESCE(last_used_at, cloned_at, created_at) < ?`,
      )
      .all(cutoff) as GroundingRepoRow[];
  },
};

/**
 * Whiteboard diagrams (spec: .claude/specs/whiteboard-diagrams.md).
 * One row per paper that has had a whiteboard generated. Filesystem
 * still holds the source of truth — Excalidraw scene at
 * `<sidecar>/whiteboard.excalidraw`, Pass 1 understanding doc at
 * `<sidecar>/whiteboard-understanding.md`, soft-verifier results at
 * `<sidecar>/whiteboard-issues.json`. This table is the index the
 * main process consults so the renderer doesn't have to stat disk on
 * every paper-state lookup. */
export interface WhiteboardRow {
  paper_hash: string;
  status: 'idle' | 'pass1' | 'pass2' | 'ready' | 'failed';
  generated_at: number | null;
  pass1_cost: number | null;
  pass2_cost: number | null;
  total_cost: number | null;
  pass1_latency_ms: number | null;
  verification_rate: number | null;
  error: string | null;
  created_at: number;
}

export const Whiteboards = {
  get(paperHash: string): WhiteboardRow | null {
    return (
      (getDb()
        .prepare('SELECT * FROM whiteboards WHERE paper_hash = ?')
        .get(paperHash) as WhiteboardRow | undefined) ?? null
    );
  },
  /** Upsert with sparse fields. Pass undefined to leave a column
   * unchanged on the UPDATE branch. The status transitions are driven
   * from `whiteboard.ts`'s pipeline. */
  upsert(args: {
    paperHash: string;
    status?: WhiteboardRow['status'];
    generatedAt?: number | null;
    pass1Cost?: number | null;
    pass2Cost?: number | null;
    totalCost?: number | null;
    pass1LatencyMs?: number | null;
    verificationRate?: number | null;
    error?: string | null;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO whiteboards(
           paper_hash, status, generated_at, pass1_cost, pass2_cost, total_cost,
           pass1_latency_ms, verification_rate, error, created_at
         ) VALUES (
           @paper_hash, @status, @generated_at, @pass1_cost, @pass2_cost, @total_cost,
           @pass1_latency_ms, @verification_rate, @error, @created_at
         )
         ON CONFLICT(paper_hash) DO UPDATE SET
           status              = COALESCE(excluded.status, whiteboards.status),
           generated_at        = COALESCE(excluded.generated_at, whiteboards.generated_at),
           pass1_cost          = COALESCE(excluded.pass1_cost, whiteboards.pass1_cost),
           pass2_cost          = COALESCE(excluded.pass2_cost, whiteboards.pass2_cost),
           total_cost          = COALESCE(excluded.total_cost, whiteboards.total_cost),
           pass1_latency_ms    = COALESCE(excluded.pass1_latency_ms, whiteboards.pass1_latency_ms),
           verification_rate   = COALESCE(excluded.verification_rate, whiteboards.verification_rate),
           error               = excluded.error`,
      )
      .run({
        paper_hash: args.paperHash,
        status: args.status ?? null,
        generated_at: args.generatedAt ?? null,
        pass1_cost: args.pass1Cost ?? null,
        pass2_cost: args.pass2Cost ?? null,
        total_cost: args.totalCost ?? null,
        pass1_latency_ms: args.pass1LatencyMs ?? null,
        verification_rate: args.verificationRate ?? null,
        // We always want to clear the error column on a successful step;
        // pass `null` explicitly when the caller advances the status.
        error: args.error === undefined ? null : args.error,
        created_at: Date.now(),
      });
  },
};

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
