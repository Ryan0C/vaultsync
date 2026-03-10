/**
 * export/item/index.ts
 * Item export (Foundry v13).
 *
 * Strategy:
 *  - Item is the export unit (WORLD item documents only).
 *  - Create-only writes: every export creates a new versioned JSON file.
 *
 * Output folders (world-scoped):
 *  - exports/items/
 */

import type { ExportRecord } from "../../contract";
import { createExportRecord } from "../../contract";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { writeJsonVersioned } from "../../storage/json";
import { MODULE_ID } from "../../constants";
import { withSuppressedHooks } from "../../runtime/hooks";
import { updateItemManifest } from "./manifest";

const EXTERNAL_ID_FLAG_PATH = `flags.${MODULE_ID}.externalId`;

function getExternalId(doc: any): string | undefined {
  return doc?.getFlag?.(MODULE_ID, "externalId") ?? doc?.flags?.[MODULE_ID]?.externalId;
}

export interface ExportItemOptions {
  source?: "data";

  /**
   * If true, ensure flags.<moduleId>.externalId exists on exported docs.
   * Default true.
   */
  ensureExternalId?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function exportItem(item: any, opts: ExportItemOptions = {}): Promise<{ itemFile?: string | null }> {
  const source = opts.source ?? "data";
  const ensureExternalId = opts.ensureExternalId ?? true;

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const itemsDir = `${paths.exports}/items`;

  if (ensureExternalId) await ensureExternalIdFlag(item);

  const record = makeExportRecord("Item", item);
  const baseName = safeBaseName(`item.${item.id ?? "unknown"}`);
  const itemFile = await writeJsonVersioned(itemsDir, baseName, record, source);

  await updateItemManifest([{ doc: item, latestFile: itemFile ?? "" }].filter(u => !!u.latestFile), source);

  return { itemFile };
}

/**
 * Convenience: export currently selected world item, if available.
 */
export async function exportSelectedItem(
  opts: ExportItemOptions = {}
): Promise<{ itemFile?: string | null } | null> {
  const item = getSelectedItemBestEffort();
  if (!item) return null;
  return await exportItem(item, opts);
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function makeExportRecord(docType: "Item", doc: any): ExportRecord {
  const foundryObj = doc?.toObject ? doc.toObject() : doc;
  const uuid = doc?.uuid;
  const externalId = getExternalId(doc);

  return createExportRecord(docType, foundryObj, { uuid, externalId });
}

async function ensureExternalIdFlag(doc: any): Promise<string | null> {
  const existing = getExternalId(doc);
  if (existing) return existing;

  const created = `vh:${doc?.documentName ?? "Doc"}:${crypto.randomUUID()}`;

  return await withSuppressedHooks(async () => {
    if (typeof doc?.setFlag === "function") {
      await doc.setFlag(MODULE_ID, "externalId", created);
      return created;
    }

    if (typeof doc?.update === "function") {
      await doc.update({ [EXTERNAL_ID_FLAG_PATH]: created }, { diff: true });
      return created;
    }

    return null;
  });
}

function safeBaseName(name: string): string {
  return String(name).replace(/[^\w.-]+/g, "_");
}

/**
 * Best-effort way to find a selected WORLD Item.
 * (Embedded Actor items are handled via Actor export/import.)
 */
function getSelectedItemBestEffort(): any | null {
  const apps: Record<string, any> = (ui as any)?.windows ?? {};

  // 1) Look for an Item sheet window
  for (const k of Object.keys(apps)) {
    const app = apps[k];
    const obj = app?.object;
    if (obj?.documentName === "Item") return obj;
  }

  return null;
}