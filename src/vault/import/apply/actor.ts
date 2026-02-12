import { logger } from "../../../logger";

export type ImportMode = "merge" | "replace";

export type ApplyActorImportOptions = {
  importActorFlags?: boolean;
  importItemFlags?: boolean;
  allowedFlagScopes?: string[];
  importPrototypeToken?: boolean;
  importEffects?: boolean;

  /**
   * If true, attempt to keep embedded item _id when creating.
   * Default: false (safer)
   */
  preserveItemIds?: boolean;

  /**
   * If true, try to resolve compendium-backed items by pack+id/uuid
   * and embed the compendium item (instead of importing system blob).
   * Default: true (recommended).
   */
  resolveCompendiumItems?: boolean;

  /**
   * If true, allow replace-mode deletes even when preserveItemIds=false,
   * using stable keys.
   * Default: true (recommended).
   */
  replaceByStableKey?: boolean;
};

function filterFlags(flags: any, allowed: string[]) {
  const out: Record<string, unknown> = {};
  const src = flags && typeof flags === "object" ? flags : {};
  for (const scope of allowed) {
    if (scope in src) out[scope] = foundry.utils.deepClone(src[scope]);
  }
  return out;
}

function stableItemKey(item: any): string {
  // Prefer compendium reference if present
  const pack = item?.pack ?? item?.flags?.core?.sourceId?.split(".")?.[1] ?? null;
  const id = item?.id ?? item?._id ?? null;

  if (pack && id) return `pack:${pack}:${id}`;

  // Fallback: type+name (can collide, but acceptable for 1.0)
  const type = String(item?.type ?? "unknown").toLowerCase();
  const name = String(item?.name ?? "unnamed").trim().toLowerCase();
  return `local:${type}:${name}`;
}

/**
 * Try to resolve an exported item that references a compendium entry.
 * Expected export shape: { id, pack, ... } (your serializer writes pack)
 */
async function resolveCompendiumItem(itemSrc: any): Promise<any | null> {
  const packId = itemSrc?.pack;
  const entryId = itemSrc?.id ?? itemSrc?._id;

  if (!packId || !entryId) return null;

  const pack = game.packs.get(packId);
  if (!pack) return null;

  try {
    // Foundry packs store documents by _id
    const doc = await pack.getDocument(entryId);
    if (!doc) return null;
    return doc.toObject();
  } catch {
    return null;
  }
}

export async function applyActorImport(
  target: Actor,
  payload: any,
  mode: ImportMode = "merge",
  opts: ApplyActorImportOptions = {}
) {
  const {
    importActorFlags = true,
    importItemFlags = true,
    allowedFlagScopes = ["core", "dnd5e", "vaultsync"],
    importPrototypeToken = true,
    importEffects = false,
    preserveItemIds = false,
    resolveCompendiumItems = true,
    replaceByStableKey = true
  } = opts;

  // Accept either {actor, items} or actor-like payloads
  const srcActor = payload?.actor ?? payload;
  const srcItems = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(srcActor?.items)
      ? srcActor.items
      : [];

  if (!srcActor) throw new Error("applyActorImport: missing payload.actor");

  /* -------------------------------------------- */
  /* Actor update — SAFE fields only              */
  /* -------------------------------------------- */

  const actorUpdate: any = {
    // Be careful: srcActor.name might be undefined if you import partial payloads
    ...(srcActor.name !== undefined ? { name: srcActor.name } : {}),
    ...(srcActor.img !== undefined ? { img: srcActor.img } : {}),
    system: foundry.utils.deepClone(srcActor.system ?? {})
  };

  if (importPrototypeToken && srcActor.prototypeToken) {
    actorUpdate.prototypeToken = foundry.utils.deepClone(srcActor.prototypeToken);
  }

  if (importActorFlags) {
    actorUpdate.flags = filterFlags(srcActor.flags ?? {}, allowedFlagScopes);
  }

  await target.update(actorUpdate);

  /* -------------------------------------------- */
  /* Actor effects (optional)                     */
  /* -------------------------------------------- */

  if (importEffects) {
    const incomingFx: any[] = Array.isArray(srcActor.effects) ? srcActor.effects : [];

    const existingFx = new Map<string, any>(target.effects.map(e => [e.id, e]));
    const incomingFxIds = new Set<string>();

    const fxToUpdate: any[] = [];
    const fxToCreate: any[] = [];

    for (const fx of incomingFx) {
      const id = fx?._id ?? fx?.id ?? null;
      const fxDoc = foundry.utils.deepClone(fx);

      if (id && existingFx.has(id)) {
        incomingFxIds.add(id);
        fxToUpdate.push({ ...fxDoc, _id: id });
      } else {
        delete fxDoc._id;
        delete fxDoc.id;
        fxToCreate.push(fxDoc);
      }
    }

    if (fxToUpdate.length) await target.updateEmbeddedDocuments("ActiveEffect", fxToUpdate);
    if (fxToCreate.length) await target.createEmbeddedDocuments("ActiveEffect", fxToCreate);

    if (mode === "replace") {
      const fxToDelete = target.effects
        .filter(e => !incomingFxIds.has(e.id))
        .map(e => e.id);
      if (fxToDelete.length) await target.deleteEmbeddedDocuments("ActiveEffect", fxToDelete);
    }
  }

  /* -------------------------------------------- */
  /* Inventory (embedded Items)                   */
  /* -------------------------------------------- */

  // Index existing by id AND by stableKey
  const existingById = new Map<string, Item>(target.items.map(i => [i.id, i]));
  const existingByKey = new Map<string, Item>();
  for (const i of target.items) {
    existingByKey.set(stableItemKey(i.toObject()), i);
  }

  const incomingKeys = new Set<string>();

  const toUpdate: any[] = [];
  const toCreate: any[] = [];

  for (const raw of srcItems) {
    const itemSrc = raw?._source ?? raw;
    if (!itemSrc) continue;

    const exportedId: string | null =
      raw?._id ?? raw?.id ?? itemSrc?._id ?? itemSrc?.id ?? null;

    // Build safe item document (maybe from compendium)
    let baseDoc: any = itemSrc;

    if (resolveCompendiumItems) {
      const resolved = await resolveCompendiumItem(itemSrc);
      if (resolved) baseDoc = resolved;
    }

    // Only import safe fields
    const safeItem: any = {
      name: baseDoc.name,
      type: baseDoc.type,
      img: baseDoc.img ?? null,
      system: foundry.utils.deepClone(baseDoc.system ?? {})
    };

    if (importItemFlags) {
      safeItem.flags = filterFlags(baseDoc.flags ?? {}, allowedFlagScopes);
    }

    if (Array.isArray(baseDoc.effects)) {
      safeItem.effects = foundry.utils.deepClone(baseDoc.effects);
    }

    // Preserve pack reference if you want it downstream (optional)
    if (itemSrc.pack) safeItem.pack = itemSrc.pack;

    const key = stableItemKey({ ...itemSrc, ...baseDoc });
    incomingKeys.add(key);

    // Prefer id match
    if (exportedId && existingById.has(exportedId)) {
      toUpdate.push({ ...safeItem, _id: exportedId });
      continue;
    }

    // Otherwise try stableKey match
    const match = existingByKey.get(key);
    if (match) {
      toUpdate.push({ ...safeItem, _id: match.id });
      continue;
    }

    // Create new
    if (preserveItemIds && exportedId) safeItem._id = exportedId;
    toCreate.push(safeItem);
  }

  if (toUpdate.length) await target.updateEmbeddedDocuments("Item", toUpdate);
  if (toCreate.length) await target.createEmbeddedDocuments("Item", toCreate);

  if (mode === "replace") {
    if (!replaceByStableKey && !preserveItemIds) {
      logger.warn(
        "applyActorImport: replace requested but replaceByStableKey=false and preserveItemIds=false; skipping deletes."
      );
      return;
    }

    // Recompute stable keys *after* create/update
    const postItems = target.items.contents;
    const postKeys = new Map<string, Item>();
    for (const i of postItems) postKeys.set(stableItemKey(i.toObject()), i);

    const deleteIds: string[] = [];
    for (const i of postItems) {
      const k = stableItemKey(i.toObject());
      if (!incomingKeys.has(k)) deleteIds.push(i.id);
    }

    if (deleteIds.length) await target.deleteEmbeddedDocuments("Item", deleteIds);
  }
}