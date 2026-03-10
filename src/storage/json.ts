/**
 * storage/json.ts
 * Create-only JSON I/O on top of Foundry FilePicker.
 *
 * Constraints:
 *  - We assume we cannot delete files.
 *  - We assume overwriting non-media files may be blocked.
 *
 * Therefore:
 *  - All writes create new versioned files.
 *  - "Latest" is determined by listing the directory.
 */
import { FP } from "./fp";
import type { FileSource } from "./index";
import { ensureDir } from "./index";

function canUpload(): boolean {
  const g: any = game as any;
  if (!g?.ready) return false;
  const u = g.user;
  if (!u) return false;
  return Boolean(u?.can?.("FILES_UPLOAD") ?? u?.isGM);
}

function toBlobJson(obj: unknown): Blob {
  return new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
}

function randomSuffix(len = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Best-effort helper to resolve a readable URL for a file.
 * Uses foundry.utils.getRoute when available, then FilePicker.getURL, then fallback.
 */
async function resolveFileUrl(source: FileSource, path: string): Promise<string> {
  const normalized = String(path).replace(/^\/+/, "");

  const getRoute = (globalThis as any)?.foundry?.utils?.getRoute;
  if (typeof getRoute === "function") {
    const maybe = getRoute(normalized);
    if (typeof maybe === "string" && maybe.length) {
      return new URL(maybe, window.location.origin).toString();
    }
  }

  const fp = FP();
  if (fp && typeof fp.getURL === "function") {
    const tries: Array<() => any> = [
      () => fp.getURL(source, normalized),
      () => fp.getURL(normalized, source),
      () => fp.getURL(normalized, { source })
    ];

    let lastErr: unknown;
    for (const t of tries) {
      try {
        const out = t();
        const url = out instanceof Promise ? await out : out;
        if (typeof url === "string" && url.length) {
          return new URL(url, window.location.origin).toString();
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error(`FilePicker.getURL failed for ${source}:${normalized}`);
  }

  return new URL(`/${normalized}`, window.location.origin).toString();
}

/**
 * Upload a file with overwrite disabled (create-only).
 */
async function uploadCreateOnly(source: FileSource, dir: string, file: File) {
  if (!canUpload()) return;
  // overwrite MUST remain false for create-only behavior
  return await FP().upload(
    source,
    dir,
    file,
    { overwrite: false },
    { notify: false }
  );
}

/**
 * List full file paths in a directory.
 */
export async function listFilesFull(dirPath: string, source: FileSource = "data"): Promise<string[]> {
  try {
    const res = await FP().browse(source, dirPath);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];
    return files.map(String);
  } catch {
    return [];
  }
}

/**
 * List filenames only (no dir prefix).
 */
export async function listFiles(dirPath: string, source: FileSource = "data"): Promise<string[]> {
  const full = await listFilesFull(dirPath, source);
  return full.map((p) => {
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(i + 1) : p;
  });
}

/**
 * Create a new JSON file with a versioned filename.
 *
 * Example:
 *  writeJsonVersioned(".../exports/journal", "page", {...})
 *  -> "page.1709321234567.ab12cd.json"
 *
 * Returns the full created path.
 */
export async function writeJsonVersioned(
  dirPath: string,
  baseName: string,
  data: unknown,
  source: FileSource = "data",
  opts?: { suffix?: string }
): Promise<string | null> {
  if (!canUpload()) return null;

  const dir = String(dirPath).replace(/\/+$/, "");
  await ensureDir(dir, source);

  const ts = Date.now();
  const suffix = opts?.suffix ?? randomSuffix();
  const safeBase = baseName.replace(/[^\w.-]+/g, "_");
  const name = `${safeBase}.${ts}.${suffix}.json`;

  const file = new File([toBlobJson(data)], name, { type: "application/json" });
  await uploadCreateOnly(source, dir, file);

  return `${dir}/${name}`;
}

/**
 * Tombstone marker (create-only).
 * Creates a marker file under `${dir}/_done/` with metadata about the target file.
 */
export async function tombstone(
  dirPath: string,
  targetFileName: string,
  source: FileSource = "data",
  meta?: Record<string, unknown>
): Promise<string | null> {
  if (!canUpload()) return null;

  const dir = String(dirPath).replace(/\/+$/, "");
  const doneDir = `${dir}/_done`;
  await ensureDir(doneDir, source);

  const marker = {
    targetFileName,
    markedAt: new Date().toISOString(),
    ...meta
  };

  const safeTarget = targetFileName.replace(/[^\w.-]+/g, "_");
  const ts = Date.now();
  const name = `${safeTarget}.${ts}.${randomSuffix()}.done.json`;

  const file = new File([toBlobJson(marker)], name, { type: "application/json" });
  await uploadCreateOnly(source, doneDir, file);

  return `${doneDir}/${name}`;
}

/**
 * Read JSON from a specific file path.
 * Path should be relative to data root (e.g. "worlds/<id>/vaultsync/.../file.json").
 */
export async function readJson<T = any>(filePath: string, source: FileSource = "data"): Promise<T> {
  const normalized = String(filePath).replace(/^\/+/, "");
  const url = await resolveFileUrl(source, normalized);
  const cbUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;

  const res = await fetch(cbUrl, {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`readJson failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Find the "latest" versioned JSON file for a baseName in a directory.
 * Strategy: list files and pick the highest timestamp in the filename.
 *
 * Expected filename format:
 *   <base>.<timestamp>.<suffix>.json
 */
export async function findLatestVersionedFile(
  dirPath: string,
  baseName: string,
  source: FileSource = "data"
): Promise<string | null> {
  const files = await listFilesFull(dirPath, source);
  const safeBase = baseName.replace(/[^\w.-]+/g, "_");
  const prefix = `${safeBase}.`;
  const suffix = `.json`;

  let best: { path: string; ts: number } | null = null;

  for (const fullPath of files) {
    const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;

    // name: base.ts.suffix.json
    const parts = name.split(".");
    if (parts.length < 4) continue;

    const ts = Number(parts[parts.length - 3]); // ... <ts> <suffix> json
    if (!Number.isFinite(ts)) continue;

    if (!best || ts > best.ts) best = { path: fullPath, ts };
  }

  return best?.path ?? null;
}

/**
 * Convenience: read the latest versioned JSON file for a baseName.
 */
export async function readLatestVersionedJson<T = any>(
  dirPath: string,
  baseName: string,
  source: FileSource = "data"
): Promise<{ path: string; data: T } | null> {
  const latestPath = await findLatestVersionedFile(dirPath, baseName, source);
  if (!latestPath) return null;
  const data = await readJson<T>(latestPath, source);
  return { path: latestPath, data };
}

async function uploadJsonFile(
  source: "data",
  dir: string,
  name: string,
  data: unknown,
  opts: { overwrite: boolean }
) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });

  return await FP().upload(
    source,
    dir,
    file,
    { overwrite: opts.overwrite },
    { notify: false }
  );
}
export async function writeJsonOverwrite(filePath: string, data: unknown, source: "data") {
  const parts = filePath.split("/").filter(Boolean);
  const name = parts.pop()!;
  const dir = parts.join("/");

  await ensureDir(dir, source);
  await uploadJsonFile(source, dir, name, data, { overwrite: true });
}