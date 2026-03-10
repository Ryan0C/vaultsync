// src/import/actor/actor.ts
import type { ExportRecord } from "../../contract";
import { sanitizeFoundryActorDoc } from "./sanitize";
import {
  getExternalId,
  safeFromUuid,
  findActorByExternalId,
  withExternalIdFlag
} from "./resolve";
import { upsertActorEmbedded } from "./embedded";
import { MODULE_ID } from "../../constants";
import { exportActor } from "../../export/actor";

export interface ApplyActorImportOptions {
  debug?: boolean;
  exactSyncEmbedded?: boolean; // optional legacy toggle (applies to both)
  exactSyncItems?: boolean;
  exactSyncEffects?: boolean;
  includeEmbedded?: boolean; // default true
}

export async function applyActorImport(
  record: ExportRecord,
  opts: ApplyActorImportOptions = {}
) {
  const debug = opts.debug ?? true;
  const exactSyncEmbedded = opts.exactSyncEmbedded ?? false;
  const includeEmbedded = opts.includeEmbedded ?? true;

  const uuid = record.uuid;
  const externalId = getExternalId(record);

  let existing = await safeFromUuid(uuid);
  if (!existing && externalId) existing = findActorByExternalId(externalId);

    const rawIncoming = (record.foundry as any) ?? {};
    const incoming = sanitizeFoundryActorDoc(rawIncoming);

    // IMPORTANT: embedded are handled by upsertActorEmbedded
    delete (incoming as any).items;
    delete (incoming as any).effects;
    delete (incoming as any).activeEffects; // some exports use this key

  // Ensure actor externalId flag
  withExternalIdFlag(incoming, externalId);

  let actor;

  if (existing) {
    if (debug) console.log(`[${MODULE_ID}] Import Actor update`, existing.id);

    await existing.update(incoming, { diff: false, recursive: false });
    actor = existing;
  } else {
    if (debug)
      console.log(`[${MODULE_ID}] Import Actor create`, incoming.name ?? "(unnamed)");
    actor = await (Actor as any).create(incoming, { renderSheet: false });
  }

  // ------------------------------------------------------------------
  // Embedded upsert happens AFTER root actor exists
  // ------------------------------------------------------------------

  const hasIncomingItems = Object.prototype.hasOwnProperty.call(rawIncoming ?? {}, "items");
  const hasIncomingEffects =
    Object.prototype.hasOwnProperty.call(rawIncoming ?? {}, "effects") ||
    Object.prototype.hasOwnProperty.call(rawIncoming ?? {}, "activeEffects");
  // For actor patches that include embedded arrays, default to exact sync so
  // removals (e.g. vendor sells) are applied deterministically in Foundry.
  const exactSyncItems = hasIncomingItems
    ? (opts.exactSyncItems ?? true)
    : false;
  const exactSyncEffects = hasIncomingEffects
    ? (opts.exactSyncEffects ?? true)
    : false;

  const embeddedRes = includeEmbedded
    ? await upsertActorEmbedded(
        actor,
        {
          items: rawIncoming.items,
          effects: rawIncoming.effects ?? rawIncoming.activeEffects
        },
        {
          debug,
          exactSync: exactSyncEmbedded,
          exactSyncItems,
          exactSyncEffects,
          fallbackMatchByNameType: false
        }
      )
    : {
        ok: true,
        items: { ok: true, updated: 0, created: 0, deleted: 0 },
        effects: { ok: true, updated: 0, created: 0, deleted: 0 },
      };

  if (debug) {
    console.log(`[${MODULE_ID}] Actor embedded result`, embeddedRes);
  }

  // Import apply runs under hook suppression, so normal update hooks won't
  // trigger an export. Export explicitly to refresh API/UI snapshots.
  const exportRes = await exportActor(actor, {
    source: "data",
    ensureExternalId: false,
    ensureEmbeddedExternalIds: false,
  });

  return {
    ok: true,
    action: existing ? "updated" : "created",
    docType: "Actor",
    id: actor.id,
    uuid: actor.uuid,
    embedded: embeddedRes,
    export: exportRes,
  };
}
