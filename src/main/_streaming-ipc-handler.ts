/**
 * IPC streaming-handler scaffold — single source of truth for the
 * channel-naming + abort-registration + safeChannelSend + IIFE wrap
 * pattern that every long-running `event.sender.send(channel, …)`
 * IPC handler used to inline.
 *
 * What every long-running streamed IPC handler in this app does:
 *   1. Generate a UUID `requestId`.
 *   2. Build a per-call channel name (`<prefix>:${requestId}`).
 *   3. Construct an `AbortController`, register it in the handler's
 *      module-level Map keyed by `requestId` (so a future
 *      `*:abort` call can signal it).
 *   4. Capture `event.sender` so an inner IIFE can stream events
 *      after the IPC reply has already been delivered.
 *   5. Define a `safeChannelSend(msg)` closure that no-ops when the
 *      sender's BrowserWindow has been destroyed (paper close,
 *      window close, app quit during a long agent call).
 *   6. Spawn a fire-and-forget `(async () => { try {…} catch (err)
 *      {…onError…} finally {activeMap.delete(requestId)} })()` IIFE.
 *   7. Return `{ requestId, channel }` SYNCHRONOUSLY so the renderer
 *      can subscribe to the channel BEFORE the IIFE starts emitting
 *      (the existing renderer/main IPC handshake — preserve verbatim).
 *
 * That's ~30 LOC of identical plumbing across every long-running
 * streamed handler. This module owns it.
 *
 * What this module DOES NOT do:
 *   - Awareness of which agent shape the body uses. The body callback
 *     is free to call any single-turn / streaming / multi-call agent
 *     helper; this module doesn't know or care.
 *   - SQLite writes. The body owns its DB updates.
 *   - Sidecar persistence. The body owns its on-disk artefacts.
 *   - Per-handler error message shape. Different handlers send
 *     differently-shaped error events (e.g. `{type:'error',…}`); the
 *     caller's `onError` writes its own side-effects AND emits the
 *     channel-scoped error message via `ctx.safeChannelSend`.
 *
 * Current callers:
 *   - `whiteboard:generate` (one-shot generateWhiteboard via
 *     fathom-whiteboard → persist scene → DB upsert).
 *   - `whiteboard:refine` (one-shot refineWhiteboard given an
 *     instruction → persist updated scene → DB rollup).
 *   - the lens-explain pipeline uses an equivalent inline pattern
 *     (and is a candidate for adopting this helper).
 */

import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';

/** Bundle the helper passes to the caller's `body` callback. The
 * caller closes over its own `req` (paperHash, etc.) when
 * constructing `body`; the helper supplies the channel-and-abort
 * plumbing through `ctx`. */
export interface StreamingIpcContext {
  /** UUID for this run; also the key in `activeMap` and the suffix
   * of `channel`. Mostly opaque to the body — useful only when the
   * body wants to emit logs that match the renderer's outstanding-
   * request tracking. */
  requestId: string;
  /** Per-call IPC channel: `<channelPrefix>:${requestId}`. The body
   * normally doesn't reference this directly — `safeChannelSend`
   * already targets it — but having it visible helps debugging. */
  channel: string;
  /** Send an arbitrarily-shaped event message on `channel`. No-op
   * when the originating webContents has been destroyed (the user
   * closed the paper / window mid-call). The body uses this for
   * every per-call streamed event that targets this run only. */
  safeChannelSend: (msg: unknown) => void;
  /** Per-run abort controller. Already registered in
   * `args.activeMap` under `requestId`. The body threads this into
   * any agent / step-loop / network call that takes one. A
   * subsequent `whiteboard:abort` IPC handler signals it. */
  abortController: AbortController;
  /** Per-paper sidecar dir, computed by the caller via
   * `indexDirFor(paperHash)`. Bundled here so the body doesn't
   * have to recompute it. */
  indexPath: string;
  /** webContents that originated this IPC call. The body uses this
   * for non-channel-scoped broadcasts (`whiteboard:step`,
   * `whiteboard:scene-stream`, `whiteboard:critic-verdict`) which
   * the renderer subscribes to globally, not per-call. */
  sender: WebContents;
}

/** Inputs to one streaming IPC handler run. */
export interface RunStreamingIpcHandlerArgs {
  /** Prefix for the per-call channel name. Helper appends
   * `:${requestId}`. Examples: `'whiteboard:event'`,
   * `'whiteboard:chatEvent'`. */
  channelPrefix: string;
  /** The handler's module-scoped Map of in-flight abort controllers
   * keyed by `requestId`. Helper sets the entry on entry and
   * deletes it on completion / error. The corresponding `*:abort`
   * handler reads from the same Map to signal a running call. */
  activeMap: Map<string, AbortController>;
  /** Per-paper sidecar dir. Caller computes via
   * `indexDirFor(req.paperHash)`. */
  indexPath: string;
  /** Source webContents — `event.sender` from the IPC handler. */
  sender: WebContents;
  /** The handler-specific work. Runs inside the IIFE's try block.
   * Receives the streaming context bundle. Throws → `onError` runs.
   * Returns → cleanup runs (helper deletes `activeMap.get(requestId)`). */
  body: (ctx: StreamingIpcContext) => Promise<void>;
  /** Runs when `body` throws. The helper does NOT call
   * `safeChannelSend` for the error message itself — that's the
   * caller's responsibility (the message shape differs per handler:
   * `:generate` uses `{type:'error',…}`, `:chatSend` uses
   * `{type:'chatError',…}`, etc.). The caller's `onError` writes
   * any side-effects (DB upsert / chat-thread error append) AND
   * sends the channel-scoped error message via `ctx.safeChannelSend`.
   * `onError` itself throwing is logged + swallowed; the cleanup
   * `activeMap.delete(requestId)` still runs. */
  onError: (err: unknown, ctx: StreamingIpcContext) => void | Promise<void>;
}

/** What the IPC handler returns to the renderer. */
export interface RunStreamingIpcHandlerResult {
  requestId: string;
  channel: string;
}

/** Run a long-running streamed IPC handler. Synchronous return — the
 * renderer subscribes to `channel` BEFORE the body's first
 * `safeChannelSend` fires. `body` runs in a fire-and-forget IIFE.
 *
 * Verbatim equivalent of the inline `(async (event, req) => {
 *   const requestId = randomUUID(); ...;
 *   activeMap.set(requestId, abortController);
 *   const safeChannelSend = …;
 *   (async () => { try {body} catch {onError} finally {…delete…} })();
 *   return { requestId, channel };
 * })` pattern that used to appear in every streamed handler. */
export function runStreamingIpcHandler(
  args: RunStreamingIpcHandlerArgs,
): RunStreamingIpcHandlerResult {
  const requestId = randomUUID();
  const channel = `${args.channelPrefix}:${requestId}`;
  const abortController = new AbortController();
  args.activeMap.set(requestId, abortController);
  const safeChannelSend = (msg: unknown): void => {
    if (args.sender.isDestroyed()) return;
    args.sender.send(channel, msg);
  };
  const ctx: StreamingIpcContext = {
    requestId,
    channel,
    safeChannelSend,
    abortController,
    indexPath: args.indexPath,
    sender: args.sender,
  };
  void (async () => {
    try {
      await args.body(ctx);
    } catch (err) {
      try {
        await args.onError(err, ctx);
      } catch (errOnError) {
        console.error('[streaming-ipc-handler] onError threw', errOnError);
      }
    } finally {
      args.activeMap.delete(requestId);
    }
  })();
  return { requestId, channel };
}
