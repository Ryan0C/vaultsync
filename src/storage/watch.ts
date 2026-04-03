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
import {
  decodeTargetFromMarker,
  tryParseTimestampFromName,
  entityKeyFromFilename,
  findSupersededInboxFilesByMode,
  type InboxDedupeCandidate,
  type InboxFileMode,
} from "./watchFilenames";

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
      // We only supersede older siblings when every file in an entity group is
      // a full snapshot. If any file is patch-shaped (or unknown), preserve
      // strict ordering and apply all files so partial updates are never lost.
      const unprocessed = candidates.filter((name) => !seen.has(name) && !processed.has(name) && !failed.has(name));
      const dedupeCandidates = await classifyDedupeCandidates(unprocessed, inboxDir, source);
      const superseded = findSupersededInboxFilesByMode(dedupeCandidates);

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

async function classifyDedupeCandidates(names: string[], inboxDir: string, source: FileSource): Promise<InboxDedupeCandidate[]> {
  const keys = names.map((name) => entityKeyFromFilename(name)).filter((key): key is string => Boolean(key));
  const keyCounts = new Map<string, number>();
  for (const key of keys) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);

  const candidates: InboxDedupeCandidate[] = [];
  for (const name of names) {
    const key = entityKeyFromFilename(name);
    if (!key || (keyCounts.get(key) ?? 0) < 2) continue;

    const fullPath = `${inboxDir}/${name}`.replace(/\/+/g, "/");
    let mode: InboxFileMode = "unknown";
    try {
      const payload = await readJson<any>(fullPath, source);
      mode = inferInboxFileMode(payload);
    } catch {
      mode = "unknown";
    }
    candidates.push({ name, mode });
  }
  return candidates;
}

function inferInboxFileMode(payload: unknown): InboxFileMode {
  if (Array.isArray(payload)) {
    const childModes = payload.map((entry) => inferInboxFileMode(entry));
    if (childModes.some((mode) => mode === "patch")) return "patch";
    if (childModes.length && childModes.every((mode) => mode === "snapshot")) return "snapshot";
    return "unknown";
  }
  if (!payload || typeof payload !== "object") return "unknown";

  const record = payload as Record<string, unknown>;
  if (record.type === "import") {
    const mode = typeof record.mode === "string" ? record.mode.toLowerCase() : "";
    if (mode === "patch") return "patch";
    if (mode === "upsert" || mode === "delete") return "snapshot";
    return "unknown";
  }
  if (Array.isArray(record.records)) {
    return inferInboxFileMode(record.records);
  }
  if (typeof record.docType === "string" && Object.prototype.hasOwnProperty.call(record, "foundry")) {
    return "snapshot";
  }
  return "unknown";
}
