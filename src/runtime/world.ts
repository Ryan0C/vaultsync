// src/runtime/world.ts
import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../storage";
import { FP } from "../storage/fp";
import { writeJsonVersioned } from "../storage/json";

type Source = "data";

const HEARTBEAT_MS = 3000;

let _timer: number | null = null;
let _startedAtIso: string | null = null;

function getModuleVersion(): string {
  const m: any = game.modules!.get(MODULE_ID as any);
  return (m?.version as string) || "unknown";
}

function genStableId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const fid = (globalThis as any)?.foundry?.utils?.randomID?.();
  if (fid) return fid;
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureWorldUuid(): Promise<string> {
  const key = "worldUuid";
  let id = ((game.settings as any)!.get(MODULE_ID, key) as string) || "";
  if (!id) {
    id = genStableId();
    await (game.settings as any)!.set(MODULE_ID, key, id);
  }
  return id;
}

async function ensureDir(path: string, source: Source) {
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
    throw err; // <-- important
    }
  }
}

async function writeJsonOverwrite(source: Source, dir: string, name: string, data: unknown) {
  await ensureDir(dir, source);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  await FP().upload(source, dir, file, { overwrite: true }, { notify: false });
}

function getCompendiumPacks() {
  return Array.from(game.packs!.values())
    .map((p: any) => ({
      id: p.collection,
      label: p.metadata?.label,
      packageId: p.metadata?.packageName,
      packageType: p.metadata?.packageType, // optional
      type: p.documentName,
      system: p.metadata?.system,
      private: p.private ?? false,
      locked: p.locked ?? false
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getEnabledModules() {
  return Array.from(game.modules!.values())
    .filter((m: any) => m.active)
    .map((m: any) => ({
      id: m.id,
      title: m.title,
      version: m.version ?? "unknown"
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getUsers() {
  const users = (game.users?.contents ?? []) as any[];
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active
  }));
}

function collectStatus(extra?: Record<string, any>) {
  const activeUsers = game.users?.contents?.filter((u: any) => u.active)?.length ?? 0;
  const userCount = (game.users?.size ?? game.users?.contents?.length ?? 0) as number;

  return {
    schema: "vaultsync.status.v1",
    moduleId: MODULE_ID,
    moduleVersion: getModuleVersion(),

    worldId: game.world!.id,
    worldTitle: game.world!.title,
    worldUuid: (game.settings as any)!.get(MODULE_ID, "worldUuid"),

    foundryVersion: game.version,
    systemId: game.system!.id,
    systemVersion: game.system!.version,

    isReady: Boolean((game as any)?.ready),

    startedAt: _startedAtIso,
    lastHeartbeatAt: new Date().toISOString(),

    userCount,
    activeUsers,

    ...(extra ?? {})
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

function requireGM() {
  if (!game.user?.isGM) throw new Error("GM required to write VaultSync meta files.");
}

export async function writeVaultMeta(source: Source = "data") {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();
  const metaDir = `${paths.root}/meta`;

  await ensureWorldUuid();

  await writeJsonVersioned(metaDir, "vault", {
    schemaVersion: VAULT_SCHEMA_VERSION,
    moduleId: MODULE_ID,
    moduleVersion: getModuleVersion(),
    foundryVersion: game.version,
    systemId: game.system!.id,
    worldId: game.world!.id,
    generatedAt: new Date().toISOString()
  }, source);
}

export async function writeWorldMeta(source: Source = "data") {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();
  const metaDir = `${paths.root}/meta`;

  const worldUuid = await ensureWorldUuid();

  await writeJsonVersioned(metaDir, "world", {
    worldUuid,
    id: game.world!.id,
    title: game.world!.title,
    system: game.system!.id,
    systemVersion: game.system!.version,
    coreVersion: game.version,
    updatedAt: new Date().toISOString(),
    modules: getEnabledModules(),
    packs: getCompendiumPacks()
  }, source);

  await writeJsonVersioned(metaDir, "users", { users: getUsers() }, source);
}


export async function writeStatusMeta(extra?: Record<string, any>, source: Source = "data") {
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();
  const metaDir = `${paths.root}/meta`;

  await ensureWorldUuid();

  await writeJsonVersioned(metaDir, "status", collectStatus(extra), source);
}

export function startWorldHeartbeat(opts?: { source?: Source; gmOnly?: boolean; intervalMs?: number }) {
  requireGM();
  const source = opts?.source ?? "data";
  const gmOnly = opts?.gmOnly ?? true;
  const intervalMs = opts?.intervalMs ?? HEARTBEAT_MS;

  if (gmOnly && !game.user?.isGM) return;
  if (_timer != null) return;

  if (!_startedAtIso) _startedAtIso = new Date().toISOString();

  void writeStatusMeta({ reason: "heartbeat-start" }, source);

  _timer = window.setInterval(() => {
    void writeStatusMeta({ reason: "heartbeat" }, source);
  }, intervalMs);

  // Best-effort shutdown mark
  window.addEventListener("beforeunload", () => {
    void writeStatusMeta({ reason: "beforeunload", isReady: false }, source);
  });
}

export function stopWorldHeartbeat() {
  if (_timer != null) {
    window.clearInterval(_timer);
    _timer = null;
  }
}