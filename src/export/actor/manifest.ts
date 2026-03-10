/**
 * export/actor/manifest.ts
 *
 * Maintains a world-scoped export manifest for actors.
 *
 * Same strategy as journal/manifest.ts:
 *  1) Try overwrite exports/actors/index.json
 *  2) If overwrite fails, write exports/actors/_manifest/index.<ts>.<rand>.json
 * Read:
 *  1) Try exports/actors/index.json
 *  2) Else newest under exports/actors/_manifest/
 */

import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { FP } from "../../storage/fp";

/* -------------------------------------------- */
/* Types                                        */
/* -------------------------------------------- */

export interface ActorManifestItem {
  /** Stable key for matching. Prefer externalId when present. */
  key: string;

  id?: string;
  uuid?: string;
  externalId?: string;

  name?: string;
  type?: string;

  updatedAt?: string;

  /** Path (relative to /data) to latest exported JSON snapshot (versioned file). */
  latestFile: string;

  /** When this manifest item was last updated. */
  exportedAt: string;
}

export interface ActorManifest {
  moduleId: string;
  schemaVersion: string;
  generatedAt: string;

  worldId?: string;

  actors: Record<string, ActorManifestItem>;
}

/* -------------------------------------------- */
/* Public API                                   */
/* -------------------------------------------- */

export interface ActorManifestUpdate {
  doc: any; // Actor
  latestFile: string;
}

async function fileExists(dir: string, filename: string, source: "data"): Promise<boolean> {
  try {
    const res = await FP().browse(source, dir);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];
    return files.some((p) => String(p).endsWith(`/${filename}`) || String(p) === filename);
  } catch {
    return false;
  }
}

export async function updateActorManifest(
  updates: ActorManifestUpdate[],
  source: "data" = "data"
): Promise<ActorManifest> {
  if (!updates.length) return await readActorManifest(source);

  await ensureVaultSyncDirs(source);
  const manifest = await readActorManifest(source);

  const now = new Date().toISOString();
  manifest.generatedAt = now;
  manifest.worldId = (game as any)?.world?.id;

  for (const u of updates) {
    const item = toItem(u.doc, u.latestFile);
    manifest.actors[item.key] = item;
  }

  await writeActorManifest(manifest, source);
  return manifest;
}

export async function readActorManifest(source: "data" = "data"): Promise<ActorManifest> {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const actorsDir = `${paths.exports}/actors`;
  const stablePath = `${actorsDir}/index.json`;
  const versionedDir = `${actorsDir}/_manifest`;

  // ✅ avoid fetch 404 by checking existence first
  const hasStable = await fileExists(actorsDir, "index.json", source);
  if (hasStable) {
    const stable = await readJsonSafe<ActorManifest>(stablePath, source);
    if (stable) return normalizeManifest(stable);
  }

  const newest = await findNewestManifestFile(versionedDir, source);
  if (newest) {
    const v = await readJsonSafe<ActorManifest>(`${versionedDir}/${newest}`, source);
    if (v) return normalizeManifest(v);
  }

  return defaultManifest();
}

export async function writeActorManifest(
  manifest: ActorManifest,
  source: "data" = "data"
): Promise<void> {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const actorDir = `${paths.exports}/actors`;
  const stablePath = `${actorDir}/index.json`;
  const versionedDir = `${actorDir}/_manifest`;

  await ensureDir(versionedDir, source);

  // Attempt overwrite stable index.json
  try {
    await writeJsonOverwrite(stablePath, manifest, source);
    return;
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    console.warn(`[${MODULE_ID}] actor manifest overwrite failed; falling back to versioned`, msg);
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const name = `index.${ts}.${rand}.json`;

  await uploadJsonFile(source, versionedDir, name, manifest, { overwrite: false });
}

/* -------------------------------------------- */
/* Internals                                    */
/* -------------------------------------------- */

function defaultManifest(): ActorManifest {
  return {
    moduleId: MODULE_ID,
    schemaVersion: VAULT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    worldId: (game as any)?.world?.id,
    actors: {}
  };
}

function normalizeManifest(m: ActorManifest): ActorManifest {
  return {
    moduleId: m.moduleId ?? MODULE_ID,
    schemaVersion: m.schemaVersion ?? VAULT_SCHEMA_VERSION,
    generatedAt: m.generatedAt ?? new Date().toISOString(),
    worldId: m.worldId ?? (game as any)?.world?.id,
    actors: m.actors ?? {}
  };
}

function toItem(doc: any, latestFile: string): ActorManifestItem {
  const uuid: string | undefined = doc?.uuid;
  const id: string | undefined = doc?.id;

  const externalId: string | undefined =
    doc?.getFlag?.(MODULE_ID, "externalId") ?? doc?.flags?.[MODULE_ID]?.externalId;

  const key = externalId || uuid || id || latestFile;

  const name =
    doc?.name ??
    doc?.data?.name ??
    doc?.toObject?.()?.name;

  const type =
    doc?.type ??
    doc?.data?.type ??
    doc?.toObject?.()?.type;

  const updatedAt =
    doc?._stats?.modifiedTime
      ? new Date(doc._stats.modifiedTime).toISOString()
      : doc?.updatedAt ?? undefined;

  return {
    key,
    id,
    uuid,
    externalId,
    name,
    type,
    updatedAt,
    latestFile,
    exportedAt: new Date().toISOString()
  };
}

async function findNewestManifestFile(dirPath: string, source: "data"): Promise<string | null> {
  try {
    const res = await FP().browse(source, dirPath);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];

    const names = files
      .map((p) => {
        const s = String(p);
        const i = s.lastIndexOf("/");
        return i >= 0 ? s.slice(i + 1) : s;
      })
      .filter((n) => n.startsWith("index.") && n.endsWith(".json"));

    if (!names.length) return null;

    names.sort((a, b) => parseTs(b) - parseTs(a));
    return names[0] ?? null;
  } catch {
    return null;
  }
}

function parseTs(filename: string): number {
  // index.<ts>.<rand>.json
  const parts = filename.split(".");
  const ts = Number(parts[1] ?? 0);
  return Number.isFinite(ts) ? ts : 0;
}

/* -------------------------------------------- */
/* Low-level FS ops (v13 FilePicker impl)       */
/* -------------------------------------------- */

async function ensureDir(path: string, source: "data") {
  const parts = path.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    const parent = current;
    current = current ? `${current}/${part}` : part;
    try {
      await FP().createDirectory(source, current, { parent: parent || null });
    } catch (err: any) {
      const msg = String(err?.message ?? err).toLowerCase();
      if (msg.includes("exists") || msg.includes("already") || msg.includes("conflict")) continue;
      throw err;
    }
  }
}

async function readJsonSafe<T>(filePath: string, source: "data"): Promise<T | null> {
  const normalized = filePath.replace(/^\/+/, "");

  try {
    const getRoute = (globalThis as any)?.foundry?.utils?.getRoute;
    let url: string;

    if (typeof getRoute === "function") {
      const maybe = getRoute(normalized);
      url = new URL(maybe, window.location.origin).toString();
    } else {
      url = new URL(`/${normalized}`, window.location.origin).toString();
    }

    const cbUrl = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    const res = await fetch(cbUrl, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function writeJsonOverwrite(filePath: string, data: unknown, source: "data") {
  const parts = filePath.split("/").filter(Boolean);
  const name = parts.pop()!;
  const dir = parts.join("/");

  await ensureDir(dir, source);
  await uploadJsonFile(source, dir, name, data, { overwrite: true });
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
  return await FP().upload(source, dir, file, { overwrite: opts.overwrite }, { notify: false });
}