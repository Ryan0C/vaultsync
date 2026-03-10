/**
 * storage/watch.ts
 * Simple import inbox watcher using FilePicker.browse polling.
 *
 * Goals:
 *  - Works in Foundry v13.
 *  - Server-safe: does NOT require Node fs access.
 *  - Create-only world: we never delete or overwrite inbox files.
 *  - Avoids hammering FilePicker (poll + backoff).
 *  - Supports "processed" + "failed" markers by writing marker files (tombstones),
 *    not moving/deleting originals.
 *
 * How it works:
 *  - Periodically lists files in `<world>/vaultsync/import/inbox`.
 *  - Filters for .json files.
 *  - Skips files already marked as processed/failed (via marker files).
 *  - Calls a provided handler for each new file.
 *  - On success/failure, writes a marker into processed/failed folder.
 *
 * NOTE:
 *  - Foundry modules often cannot delete or overwrite non-media files.
 *  - Therefore "ack" is implemented by creating marker files, not moving/deleting.
 */

import type { FileSource } from "./index";
import { getVaultSyncPaths, ensureVaultSyncDirs } from "./index";
import { listFiles, readJson, tombstone } from "./json";

export type ImportFileStatus = "processed" | "failed";

export interface WatchOptions {
  source?: FileSource;

  /**
   * How often to poll the inbox (ms). Default 1500ms.
   * Increase if you want less load.
   */
  intervalMs?: number;

  /**
   * Max number of inbox files to process per poll tick.
   * Default 5 to prevent long blocking loops.
   */
  maxPerTick?: number;

  /**
   * Only the GM should run the watcher by default.
   */
  gmOnly?: boolean;

  /**
   * Optional: ignore files older than this many ms.
   * Useful if you drop a huge backlog and want to manually triage.
   */
  ignoreOlderThanMs?: number;

  /**
   * Optional logger (console-like).
   */
  logger?: { debug?: (...a: any[]) => void; info?: (...a: any[]) => void; warn?: (...a: any[]) => void };
}

export interface WatchHandle {
  stop: () => void;
  isRunning: () => boolean;
}

export interface ImportFileContext<T = any> {
  fileName: string;
  inboxDir: string;
  fullPath: string;
  payload: T;
}

export type ImportFileHandler = (ctx: ImportFileContext) => Promise<void>;

/**
 * Starts a poller that watches the VaultSync import inbox directory.
 */
export async function startImportInboxWatcher(
  handler: ImportFileHandler,
  opts: WatchOptions = {}
): Promise<WatchHandle> {
  const source: FileSource = opts.source ?? "data";
  const intervalMs = clamp(opts.intervalMs ?? 1500, 500, 60_000);
  const maxPerTick = clamp(opts.maxPerTick ?? 5, 1, 100);
  const gmOnly = opts.gmOnly ?? true;
  const log = opts.logger ?? console;

  await ensureVaultSyncDirs(source);

  const paths = getVaultSyncPaths();
  const inboxDir = paths.inbox;
  const processedDir = paths.processed;
  const failedDir = paths.failed;

  let timer: number | null = null;
  let running = true;
  let inflight = false;

  // cache of filenames we've seen in this session (fast skip)
  const seen = new Set<string>();

  // markers we can check to avoid reprocessing across sessions
  // We build these by listing processed/failed marker directories each tick (cheap-ish)
  async function loadMarkedNames(status: ImportFileStatus): Promise<Set<string>> {
    const dir = status === "processed" ? processedDir : failedDir;

    // tombstone() writes markers to `${dir}/_done/` (NOT `${dir}/` directly).
    // We must scan BOTH the root and `_done/` subdirectory, otherwise on Foundry
    // restart no markers are found and every previously-failed file gets reprocessed.
    const [rootFiles, doneFiles] = await Promise.all([
      listFiles(dir, source),
      listFiles(`${dir}/_done`, source),
    ]);

    const marked = new Set<string>();
    for (const name of [...rootFiles, ...doneFiles]) {
      // Marker format from tombstone(): `<target>.<ts>.<rand>.done.json`
      const target = decodeTargetFromMarker(name);
      if (target) marked.add(target);
    }
    return marked;
  }

  async function tick() {
    if (!running) return;
    if (inflight) return;
    inflight = true;

    try {
      if (!game?.ready) return;
      if (gmOnly && !game.user?.isGM) return;

      // List inbox (filenames)
      const inboxFiles = await listFiles(inboxDir, source);

      // Fast filter
      const candidates = inboxFiles
        .filter((n) => n.toLowerCase().endsWith(".json"))
        .filter((n) => !n.startsWith(".")); // ignore dotfiles

      if (!candidates.length) return;

      // Determine which are already marked processed/failed
      // (We do both to avoid reprocessing even if handler previously failed.)
      const processed = await loadMarkedNames("processed");
      const failed = await loadMarkedNames("failed");

      let processedCount = 0;

      // ── Per-entity deduplication ──────────────────────────────────────────
      // When multiple inbox files exist for the same entity (actor, item, etc.)
      // only the newest should be applied. Older files represent superseded
      // states — applying them after the newest would revert the actor to a
      // stale value and trigger Foundry reactive systems (concentration saves,
      // Bloodied condition, etc.) for every intermediate state.
      //
      // File format: {prefix}.{entityId}.{epochMs}.{nonce}.json
      // We parse {prefix}.{entityId} as the group key and keep only the file
      // with the largest embedded timestamp per group.  Superseded files are
      // marked as processed WITHOUT invoking the handler so the watcher never
      // revisits them, but VaultSync also never applies their stale content.
      const entityNewest = new Map<string, string>(); // key → newest filename
      for (const name of candidates) {
        if (seen.has(name) || processed.has(name) || failed.has(name)) continue;
        const key = entityKeyFromFilename(name);
        if (!key) continue; // non-standard filename — let it through as-is
        const current = entityNewest.get(key);
        if (!current || filenameTs(name) > filenameTs(current)) {
          entityNewest.set(key, name);
        }
      }

      // Build the superseded set: unprocessed files that have a newer sibling
      const superseded = new Set<string>();
      for (const name of candidates) {
        if (seen.has(name) || processed.has(name) || failed.has(name)) continue;
        const key = entityKeyFromFilename(name);
        if (!key) continue;
        if (entityNewest.get(key) !== name) superseded.add(name);
      }

      // Mark superseded files as processed (no handler call) so they are
      // never revisited.  Write in the background — don't block the main loop.
      for (const fileName of superseded) {
        seen.add(fileName);
        void writeStatusMarker(processedDir, inboxDir, fileName, source, {
          ok: true,
          reason: "superseded_by_newer"
        });
      }
      // ─────────────────────────────────────────────────────────────────────

      // Sort for determinism: oldest-ish first if names contain timestamps
      const sorted = candidates.slice().sort((a, b) => a.localeCompare(b));

      for (const fileName of sorted) {
        if (!running) break;
        if (processedCount >= maxPerTick) break;

        if (seen.has(fileName)) continue;
        if (processed.has(fileName) || failed.has(fileName)) {
          seen.add(fileName);
          continue;
        }
        if (superseded.has(fileName)) continue; // already marked above

        // Optional age filter (based on timestamp in filename if present)
        if (typeof opts.ignoreOlderThanMs === "number") {
          const ts = tryParseTimestampFromName(fileName);
          if (ts && Date.now() - ts > opts.ignoreOlderThanMs) {
            // Mark as failed/ignored to prevent endless re-scan
            await writeStatusMarker(failedDir, inboxDir, fileName, source, {
              reason: "ignored_old_file"
            });
            seen.add(fileName);
            continue;
          }
        }

        const fullPath = `${inboxDir}/${fileName}`.replace(/\/+/g, "/");

        try {
          const payload = await readJson<any>(fullPath, source);

          await handler({
            fileName,
            inboxDir,
            fullPath,
            payload
          });

          await writeStatusMarker(processedDir, inboxDir, fileName, source, { ok: true });
          seen.add(fileName);
          processedCount += 1;
        } catch (err: any) {
          await writeStatusMarker(failedDir, inboxDir, fileName, source, {
            ok: false,
            error: String(err?.message ?? err).slice(0, 500)
          });
          seen.add(fileName);
          processedCount += 1;
        }
      }
    } finally {
      inflight = false;
    }
  }

  timer = window.setInterval(() => {
    // fire and forget; tick guards inflight
    void tick();
  }, intervalMs);

  // do an immediate tick on start
  void tick();

  return {
    stop() {
      running = false;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },
    isRunning() {
      return running;
    }
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Extract target filename from marker name, if possible.
 * tombstone() uses:
 *   `${safeTarget}.${ts}.${rand}.done.json`
 *
 * We can't perfectly recover original if safeTarget replaced chars,
 * but in this system inbox filenames are usually safe already.
 */
function decodeTargetFromMarker(markerName: string): string | null {
  const name = String(markerName);

  // Require ".done.json" ending (as produced by tombstone)
  if (!name.endsWith(".done.json")) return null;

  // Strip suffix
  const stripped = name.slice(0, -".done.json".length);

  // Format: <target>.<ts>.<rand>
  const parts = stripped.split(".");
  if (parts.length < 3) return null;

  // target might contain dots; ts is second-to-last? Actually last two are ts and rand.
  const ts = parts[parts.length - 2];
  const rand = parts[parts.length - 1];
  if (!/^\d{10,}$/.test(ts)) return null;
  if (!rand.length) return null;

  const targetParts = parts.slice(0, parts.length - 2);
  const target = targetParts.join(".");
  return target || null;
}

/**
 * Try to parse a timestamp from a filename like:
 *   name.<ts>.<suffix>.json
 */
function tryParseTimestampFromName(fileName: string): number | null {
  const name = String(fileName);
  const parts = name.split(".");
  if (parts.length < 4) return null;

  // We used base.ts.suffix.json in writeJsonVersioned
  const ts = Number(parts[parts.length - 3]);
  return Number.isFinite(ts) ? ts : null;
}

async function writeStatusMarker(
  statusDir: string,
  inboxDir: string,
  fileName: string,
  source: FileSource,
  meta?: Record<string, unknown>
) {
  // Create a marker in statusDir by calling tombstone() on that dir.
  // We also store the original relative inbox path for debugging.
  await tombstone(statusDir, fileName, source, {
    original: `${inboxDir}/${fileName}`.replace(/\/+/g, "/"),
    ...meta
  });
}

/**
 * Extract the entity group key from an inbox filename.
 *
 * Inbox files follow the pattern:  {prefix}.{entityId}.{epochMs}.{nonce}.json
 * The group key is "{prefix}.{entityId}" — everything before the timestamp.
 *
 * Returns null for files that don't match the pattern (non-standard names).
 */
function entityKeyFromFilename(name: string): string | null {
  if (!name.endsWith(".json")) return null;
  const base = name.slice(0, -5);
  const parts = base.split(".");
  // Need at least: prefix, entityId, ts, nonce
  if (parts.length < 4) return null;
  const ts = parts[parts.length - 2];
  if (!/^\d{10,}$/.test(ts)) return null;
  return parts.slice(0, parts.length - 2).join(".");
}

/**
 * Extract the embedded epoch-ms timestamp from an inbox filename.
 * Returns 0 if the name doesn't match the expected pattern.
 */
function filenameTs(name: string): number {
  if (!name.endsWith(".json")) return 0;
  const base = name.slice(0, -5);
  const parts = base.split(".");
  if (parts.length < 4) return 0;
  const ts = parseInt(parts[parts.length - 2], 10);
  return Number.isFinite(ts) ? ts : 0;
}