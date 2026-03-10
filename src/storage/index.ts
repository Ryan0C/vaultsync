/**
 * storage/index.ts
 * World-scoped paths + directory helpers.
 *
 * Storage model:
 *  - All writes are "create-only" (no delete, no overwrite required).
 *  - JSON writes are versioned (timestamp + random suffix).
 *  - Logical deletes are tombstones (marker files).
 */
import { FP } from "./fp";

export type FileSource = "data";

export interface VaultSyncStoragePaths {
  root: string;
  exports: string;
  imports: string;
  inbox: string;
  processed: string;
  failed: string;
  state: string;
}

export function worldVaultSyncRoot(): string {
  // Foundry user-data "data" source paths are relative to the data root.
  // World folders live under `worlds/<worldId>/`.
  const worldId = (game as any)?.world?.id ?? "unknown-world";
  return `worlds/${worldId}/vaultsync`;
}

export function getVaultSyncPaths(): VaultSyncStoragePaths {
  const root = worldVaultSyncRoot();
  return {
    root,
    exports: `${root}/exports`,
    imports: `${root}/import`,
    inbox: `${root}/import/inbox`,
    processed: `${root}/import/processed`,
    failed: `${root}/import/failed`,
    state: `${root}/state`
  };
}

export async function ensureVaultSyncDirs(source: FileSource = "data") {
  const p = getVaultSyncPaths();
  await ensureDir(p.root, source);
  await ensureDir(p.exports, source);
  await ensureDir(p.imports, source);
  await ensureDir(p.inbox, source);
  await ensureDir(p.processed, source);
  await ensureDir(p.failed, source);
  await ensureDir(p.state, source);
}

/**
 * Ensure a directory exists recursively.
 * Uses FilePicker.createDirectory and is permissive about "already exists".
 */
export async function ensureDir(path: string, source: FileSource = "data") {
  const normalized = String(path).replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);

  let current = "";
  for (const part of parts) {
    const parent = current;
    current = current ? `${current}/${part}` : part;

    try {
      // v13 signature supports { parent }
      await FP().createDirectory(source, current, {
        parent: parent || null
      });
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