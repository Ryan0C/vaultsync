/**
 * export/journal/manifest.ts
 *
 * Maintains a world-scoped export manifest for journals.
 *
 * Goals:
 *  - Provide a single "what is current" index for external consumers.
 *  - Avoid scanning the entire exports tree to find latest versions.
 *  - Respect Foundry hosting constraints:
 *      - Some servers disallow overwriting non-media files (like .json).
 *      - VaultSync should be create-only when possible.
 *
 * Write strategy:
 *  1) Attempt to write/overwrite:  exports/journal/index.json
 *  2) If overwrite fails, write a versioned manifest under:
 *        exports/journal/_manifest/index.<ts>.<rand>.json
 *
 * Read strategy:
 *  1) Try reading exports/journal/index.json
 *  2) Else, find newest file under exports/journal/_manifest/
 */

import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { FP } from "../../storage/fp";

/* -------------------------------------------- */
/* Types                                        */
/* -------------------------------------------- */

export type JournalManifestKind = "entries" | "pages";

export interface JournalManifestItem {
  /** Stable key for matching. Prefer externalId when present. */
  key: string;

  id?: string;
  uuid?: string;
  externalId?: string;

  name?: string;
  updatedAt?: string;

  /** Path to the latest exported JSON snapshot (versioned file). */
  latestFile: string;

  /** When this manifest item was last updated. */
  exportedAt: string;
}

export interface JournalManifest {
  moduleId: string;
  schemaVersion: string;
  generatedAt: string;

  worldId?: string;

  entries: Record<string, JournalManifestItem>;
  pages: Record<string, JournalManifestItem>;
}

/* -------------------------------------------- */
/* Public API                                   */
/* -------------------------------------------- */

export interface JournalManifestUpdate {
  kind: JournalManifestKind;
  doc: any; // JournalEntry | JournalPage
  latestFile: string;
}

export async function updateJournalManifest(
  updates: JournalManifestUpdate[],
  source: "data" = "data"
): Promise<JournalManifest> {
  if (!updates.length) return await readJournalManifest(source);

  await ensureVaultSyncDirs(source);
  const manifest = await readJournalManifest(source);

  const now = new Date().toISOString();
  manifest.generatedAt = now;
  manifest.worldId = (game as any)?.world?.id;

  for (const u of updates) {
    const item = toItem(u.doc, u.latestFile);
    const bucket = u.kind === "entries" ? manifest.entries : manifest.pages;
    bucket[item.key] = item;
  }

  await writeJournalManifest(manifest, source);
  return manifest;
}

export async function readJournalManifest(source: "data" = "data"): Promise<JournalManifest> {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const stablePath = `${paths.exports}/journal/index.json`;
  const versionedDir = `${paths.exports}/journal/_manifest`;

  // 1) Try stable index.json
  try {
    const stable = await readJsonSafe<JournalManifest>(stablePath, source);
    if (stable) return normalizeManifest(stable);
  } catch {
    // ignore
  }

  // 2) Try newest versioned manifest
  const newest = await findNewestManifestFile(versionedDir, source);
  if (newest) {
    const v = await readJsonSafe<JournalManifest>(`${versionedDir}/${newest}`, source);
    if (v) return normalizeManifest(v);
  }

  // 3) Default
  return defaultManifest();
}

export async function writeJournalManifest(
  manifest: JournalManifest,
  source: "data" = "data"
): Promise<void> {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const journalDir = `${paths.exports}/journal`;
  const stablePath = `${journalDir}/index.json`;
  const versionedDir = `${journalDir}/_manifest`;

  // Ensure /_manifest exists (best-effort, create-only safe)
  await ensureDir(versionedDir, source);

  // Attempt overwrite of stable index.json first
  try {
    await writeJsonOverwrite(stablePath, manifest, source);
    return;
  } catch (err: any) {
    // If server disallows overwriting JSON, fall back to versioned manifests.
    const msg = String(err?.message ?? err);
    console.warn(`[${MODULE_ID}] manifest overwrite failed; falling back to versioned`, msg);
  }

  // Versioned fallback (create-only)
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const name = `index.${ts}.${rand}.json`;

  await uploadJsonFile(source, versionedDir, name, manifest, { overwrite: false });
}

/* -------------------------------------------- */
/* Internals                                    */
/* -------------------------------------------- */

function defaultManifest(): JournalManifest {
  return {
    moduleId: MODULE_ID,
    schemaVersion: VAULT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    worldId: (game as any)?.world?.id,
    entries: {},
    pages: {}
  };
}

function normalizeManifest(m: JournalManifest): JournalManifest {
  // Keep it permissive; only ensure expected keys exist.
  return {
    moduleId: m.moduleId ?? MODULE_ID,
    schemaVersion: m.schemaVersion ?? VAULT_SCHEMA_VERSION,
    generatedAt: m.generatedAt ?? new Date().toISOString(),
    worldId: m.worldId ?? (game as any)?.world?.id,
    entries: m.entries ?? {},
    pages: m.pages ?? {}
  };
}

function toItem(doc: any, latestFile: string): JournalManifestItem {
  const uuid: string | undefined = doc?.uuid;
  const id: string | undefined = doc?.id;

  const externalId: string | undefined =
    doc?.getFlag?.(MODULE_ID, "externalId") ?? doc?.flags?.[MODULE_ID]?.externalId;

  const key = externalId || uuid || id || latestFile;

  // name/title varies by doc
  const name =
    doc?.name ??
    doc?.title ??
    doc?.data?.name ??
    doc?.data?.title ??
    doc?.toObject?.()?.name ??
    doc?.toObject?.()?.title;

  // updatedAt varies; if not present, omit
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
    updatedAt,
    latestFile,
    exportedAt: new Date().toISOString()
  };
}

async function findNewestManifestFile(dirPath: string, source: "data"): Promise<string | null> {
  try {
    const res = await FP().browse(source, dirPath);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];

    // Browse returns full paths; normalize to filenames.
    const names = files
      .map((p) => {
        const s = String(p);
        const i = s.lastIndexOf("/");
        return i >= 0 ? s.slice(i + 1) : s;
      })
      .filter((n) => n.startsWith("index.") && n.endsWith(".json"));

    if (!names.length) return null;

    // Our names include timestamp after "index."
    names.sort((a, b) => {
      const ta = parseTs(a);
      const tb = parseTs(b);
      return tb - ta;
    });

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
    // Prefer foundry route helper when available
    const getRoute = (globalThis as any)?.foundry?.utils?.getRoute;
    let url: string;

    if (typeof getRoute === "function") {
      const maybe = getRoute(normalized);
      url = new URL(maybe, window.location.origin).toString();
    } else {
      // fallback: assume served from root
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
  // notify false to keep it quiet; Foundry logs "saved to ..." anyway sometimes
  return await FP().upload(source, dir, file, { overwrite: opts.overwrite }, { notify: false });
}