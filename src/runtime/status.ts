/**
 * runtime/status.ts
 *
 * Runtime status snapshot for VaultSync.
 *
 * Goals:
 *  - Provide a cheap "health + sync" picture for dev + UI.
 *  - Use the journal manifest as the current export truth source.
 *  - Report pending import inbox files (create-only: rely on markers).
 *
 * Assumptions (defaults, but overrideable):
 *  - imports/inbox            => incoming commands/records
 *  - imports/processed        => done markers
 *  - imports/failed           => error markers
 *
 * Marker naming convention (create-only friendly):
 *  - processed/<inboxName>.done.json
 *  - failed/<inboxName>.error.json
 */

import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../storage";
import { FP } from "../storage/fp";
import { readJournalManifest } from "../export/journal/manifest";
import { readActorManifest } from "../export/actor/manifest";

export interface PackInfo {
  id: string;              // collection (e.g. "dnd5e.spells")
  label?: string;
  documentName?: string;   // "Item"
  type?: string;           // legacy alias, optional
  packageId?: string;      // metadata.packageName
  packageType?: string;    // metadata.packageType (module/system/world)
  system?: string | null;  // metadata.system
  private?: boolean;
  locked?: boolean;
}

export interface VaultSyncStatusOptions {
  source?: "data";
  importInboxDir?: string;
  importProcessedDir?: string;
  importFailedDir?: string;
  includePendingList?: boolean;
  includeRecentFailedList?: boolean;
  recentFailedLimit?: number;

  /** Include compendium pack metadata in status. Default true. */
  includePacks?: boolean;

  /** If true, include only Item packs. Default true (what your app likely wants). */
  packsItemsOnly?: boolean;
}

export interface VaultSyncStatus {
  moduleId: string;
  schemaVersion: string;
  worldId?: string;
  generatedAt: string;

  exports: {
    journalManifestPresent: boolean;
    journalManifestGeneratedAt?: string;
    journalEntriesCount?: number;
    journalPagesCount?: number;

    actorManifestPresent: boolean;
    actorManifestGeneratedAt?: string;
    actorsCount?: number;
  };

  /** Environment (world capabilities) */
  packs?: {
    included: boolean;
    itemsOnly: boolean;
    count: number;
    packs: PackInfo[];
  };

  imports: { /* ... unchanged ... */ };

  outOfSync: boolean;
}
/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

async function browseDirnames(dirPath: string, source: "data"): Promise<string[]> {
  try {
    const res = await FP().browse(source, dirPath);
    const dirs: string[] = Array.isArray(res?.dirs) ? res.dirs : [];
    return dirs.map((p) => {
      const s = String(p);
      const i = s.lastIndexOf("/");
      return i >= 0 ? s.slice(i + 1) : s;
    });
  } catch {
    return [];
  }
}

export async function getVaultSyncStatus(
  opts: VaultSyncStatusOptions = {}
): Promise<VaultSyncStatus> {
  const source = opts.source ?? "data";

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const worldId = (game as any)?.world?.id;

  const inboxDir = opts.importInboxDir ?? `${paths.imports}/inbox`;
  const processedDir = opts.importProcessedDir ?? `${paths.imports}/processed`;
  const failedDir = opts.importFailedDir ?? `${paths.imports}/failed`;

  // Exports: journal manifest
  const journalManifest = await readJournalManifest(source);
  const journalManifestPresent = !!journalManifest?.generatedAt;

  const entriesCount = journalManifest?.entries ? Object.keys(journalManifest.entries).length : 0;
  const pagesCount = journalManifest?.pages ? Object.keys(journalManifest.pages).length : 0;

  // Exports: actor manifest
  const actorManifest = await readActorManifest(source);
  const actorManifestPresent = !!actorManifest?.generatedAt;

  const actorsCount = actorManifest?.actors ? Object.keys(actorManifest.actors).length : 0;

  // Imports: pending inbox (create-only markers)
  const [inboxFiles, processedFiles, failedFiles] = await Promise.all([
    browseFilenames(inboxDir, source),
    browseFilenames(processedDir, source),
    browseFilenames(failedDir, source)
  ]);

  const processedSet = new Set(processedFiles);
  const failedSet = new Set(failedFiles);

    const includeRecentFailedList = opts.includeRecentFailedList ?? false;
  const recentFailedLimit = opts.recentFailedLimit ?? 10;

  const recentFailedFiles = includeRecentFailedList
    ? failedFiles
        .filter(n => n.endsWith(".error.json"))
        .slice(-recentFailedLimit)
        .reverse()
    : undefined;

  // pack index coverage
  const itemPacks = Array.from(game.packs ?? []).filter((p: any) => p.documentName === "Item");
  const foundryItemPacksCount = itemPacks.length;

  // determine which packs have an exported index dir
  const packsRoot = `${paths.exports}/items/packs`;
  const exportedPackDirs = await browseDirnames(packsRoot, source); // new helper (dirs, not files)

  const exportedSet = new Set(exportedPackDirs);
  const missing = itemPacks
    .map((p: any) => p.collection) // e.g. "dnd5e.spells24"
    .filter((collection: string) => !exportedSet.has(collection));

  const exportedPackIndexesCount = exportedPackDirs.length;
  const missingPackIndexesCount = missing.length;

  // Pending = inbox json files that do not have done/error marker
  const pending = inboxFiles.filter((name) => {
    if (!name.endsWith(".json")) return false;

    // ignore markers if someone accidentally drops them into inbox
    if (name.endsWith(".done.json") || name.endsWith(".error.json")) return false;

    const doneMarker = `${name}.done.json`;
    const errMarker = `${name}.error.json`;

    return !processedSet.has(doneMarker) && !failedSet.has(errMarker);
  });

  const includePacks = opts.includePacks ?? true;
  const packsItemsOnly = opts.packsItemsOnly ?? true;

  const packList = includePacks ? getPackInfoList({ itemsOnly: packsItemsOnly }) : [];

  const status: VaultSyncStatus = {
    moduleId: MODULE_ID,
    schemaVersion: VAULT_SCHEMA_VERSION,
    worldId,
    generatedAt: new Date().toISOString(),

    exports: {
      journalManifestPresent,
      journalManifestGeneratedAt: journalManifest?.generatedAt,
      journalEntriesCount: entriesCount,
      journalPagesCount: pagesCount,

      actorManifestPresent,
      actorManifestGeneratedAt: actorManifest?.generatedAt,
      actorsCount
    },

    ...(includePacks
      ? {
          packs: {
            included: true,
            itemsOnly: packsItemsOnly,
            count: packList.length,
            packs: packList
          }
        }
      : {
          packs: {
            included: false,
            itemsOnly: packsItemsOnly,
            count: 0,
            packs: []
          }
        }),

    imports: {
      inboxDir,
      processedDir,
      failedDir,

      inboxCount: inboxFiles.length,
      processedCount: processedFiles.length,
      failedCount: failedFiles.length,

      pendingCount: pending.length,
      ...(opts.includePendingList ? { pendingFiles: pending } : {})
    },

    outOfSync: pending.length > 0
  };

  return status;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function browseFilenames(dirPath: string, source: "data"): Promise<string[]> {
  try {
    const res = await FP().browse(source, dirPath);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];

    // Normalize to basenames
    return files.map((p) => {
      const s = String(p);
      const i = s.lastIndexOf("/");
      return i >= 0 ? s.slice(i + 1) : s;
    });
  } catch {
    // dir might not exist yet; treat as empty
    return [];
  }
}

function getPackInfoList(opts: { itemsOnly: boolean }): PackInfo[] {
  const packs = Array.from(game.packs?.values?.() ?? []);

  const filtered = opts.itemsOnly
    ? packs.filter((p: any) => p?.documentName === "Item")
    : packs;

  return filtered
    .map((p: any) => ({
      id: p.collection,
      label: p.metadata?.label,
      documentName: p.documentName,
      type: p.documentName, // optional alias
      packageId: p.metadata?.packageName,
      packageType: (p.metadata as any)?.packageType,
      system: p.metadata?.system ?? null,
      private: p.private ?? false,
      locked: (p as any)?.locked ?? false
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}