/**
 * Vault Sync — File System Helpers (Foundry VTT)
 * ------------------------------------------------
 * Purpose:
 *  - Provide a tiny, reliable abstraction over Foundry's FilePicker API for writing “vault” files.
 *  - The vault is a folder tree under the Foundry user data directory (FilePicker "data" source).
 *
 * What this file does:
 *  - ensureFolder(): recursively creates directories so subsequent uploads succeed.
 *  - writeJson(): writes a JSON file (overwrite).
 *  - appendNdjson(): appends an event to an NDJSON log (newline-delimited JSON),
 *    implemented as read + rewrite for MVP.
 *  - deleteFile(): deletes a file if it exists.
 *
 * Why it exists:
 *  - vault-api reads these files even when the world is offline.
 *  - vault-sync’s job is to keep these files current while the world is online.
 *
 * Notes:
 *  - We intentionally keep FileSource = "data" for now. Other sources could be added later.
 *  - Foundry error messages are inconsistent across versions/sources; ensureFolder is permissive
 *    about “already exists” / conflict scenarios.
 *
 * Concurrency:
 *  - Operations run through a write queue with multiple independent lanes.
 *  - Each lane is FIFO; different lanes may run concurrently.
 *  - We do NOT call queued functions from within queued blocks (to avoid deadlocks).
 */

import { FP } from "../../foundry/filepicker";
import { MODULE_ID } from "../../constants";
import { enqueueWrite, laneForPath, WriteLane } from "./write_queue";
import { logger } from "../../logger";
export type FileSource = "data";

function toBlobJson(obj: unknown): Blob {
  return new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
}

function toBlobText(text: string): Blob {
  return new Blob([text], { type: "text/plain" });
}

/**
 * Best-effort helper to resolve a readable URL for a file.
 * Foundry has had multiple getURL signatures across versions/implementations,
 * so we try a few.
 */
async function resolveFileUrl(source: FileSource, path: string): Promise<string> {
  const anyFP = FP as any;

  const candidates: Array<() => Promise<string>> = [
    () => anyFP.getURL(path, source),
    () => anyFP.getURL(source, path),
    () => anyFP.getURL(path, { source })
  ];

  let lastErr: unknown = null;

  for (const fn of candidates) {
    try {
      const maybe = await fn();
      if (typeof maybe === "string" && maybe.length) {
        // Foundry may return relative URLs; normalize to absolute.
        return new URL(maybe, window.location.origin).toString();
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error(`resolveFileUrl failed for ${source}:${path}`);
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Ensure a directory exists (recursively) under the "data" source.
 * Path is relative to the source root, e.g. "vault/worlds/<id>/actors"
 */
export async function ensureFolder(path: string, source: FileSource = "data") {
  // Put folder creation in its own lane so it doesn't block chat writes forever.
  return enqueueWrite(async () => {
    await ensureFolderUnlocked(path, source);
  }, "folders");
}

export async function writeJson(filePath: string, data: unknown, source: FileSource = "data") {
  const lane = laneForPath(filePath);

  return enqueueWrite(async () => {
    const parts = filePath.split("/").filter(Boolean);
    const name = parts.pop()!;
    const dir = parts.join("/");

    // Do NOT call ensureFolder() here (it's queued) — use unlocked helper.
    await ensureFolderUnlocked(dir, source);

    const file = new File([toBlobJson(data)], name, { type: "application/json" });
    await (FP as any).upload(source, dir, file, { overwrite: true }, { notify: false });
  }, lane);
}

export async function deleteFile(filePath: string, source: FileSource = "data") {
  const lane = laneForPath(filePath);

  return enqueueWrite(async () => {
    try {
      await (FP as any).delete(source, filePath);
    } catch (err) {
      logger.warn("VaultSync deleteFile error:", err);
    }
  }, lane);
}

/**
 * Append NDJSON by read+rewrite. This is not a true filesystem append, but works
 * reliably under Foundry's FilePicker constraints.
 *
 * IMPORTANT:
 *  - This will never be safe at very high volume due to read+rewrite cost.
 *  - For chat, you're already moving to event-per-file sharding, which is best.
 *    Keep this for low-frequency logs only.
 */
export async function appendNdjson(filePath: string, event: unknown, source: FileSource = "data") {
  const lane = laneForPath(filePath);

  return enqueueWrite(async () => {
    const debug = !!game.settings.get(MODULE_ID, "debug");

    const parts = filePath.split("/").filter(Boolean);
    const name = parts.pop()!;
    const dir = parts.join("/");

    await ensureFolderUnlocked(dir, source);

    let existing = "";

    try {
      const url = await resolveFileUrl(source, `${dir}/${name}`);
      const cbUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;

      const res = await fetch(cbUrl, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (res.ok) {
        existing = await res.text();
      } else if (debug) {
        const body = await res.text().catch(() => "");
        logger.warn("VaultSync appendNdjson read failed:", {
          filePath,
          url: cbUrl,
          status: res.status,
          body: body.slice(0, 200)
        });
      }
    } catch (err) {
      if (debug) logger.warn("VaultSync appendNdjson read threw:", { filePath, err });
      // missing/unreadable file is treated as empty
    }

    const next = existing + JSON.stringify(event) + "\n";
    const file = new File([toBlobText(next)], name, { type: "text/plain" });

    await (FP as any).upload(source, dir, file, { overwrite: true }, { notify: false });

    if (debug) {
      logger.info("VaultSync appendNdjson wrote:", {
        filePath,
        prevBytes: existing.length,
        nextBytes: next.length
      });
    }
  }, lane);
}

/* -------------------------------------------- */
/*  Internal Helpers (NOT queued)               */
/* -------------------------------------------- */

/**
 * Non-queued version of ensureFolder used inside enqueueWrite blocks.
 * Calling the queued ensureFolder() from inside enqueueWrite() can deadlock.
 */
async function ensureFolderUnlocked(path: string, source: FileSource) {
  const parts = path.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    const parent = current;
    current = current ? `${current}/${part}` : part;

    try {
      await (FP as any).createDirectory(source, current, { parent: parent || null });
    } catch (err: any) {
      const msg = String(err?.message ?? err).toLowerCase();
      if (
        msg.includes("exists") ||
        msg.includes("already") ||
        msg.includes("eexist") ||
        msg.includes("conflict")
      ) {
        continue;
      }
      throw err;
    }
  }
}