// src/import/actor/embedded.ts
//
// Upsert logic for Actor embedded documents (Items + ActiveEffects).
//
// Goals:
//  - Add/update only by default (safe): never delete missing docs unless explicitly requested.
//  - Prefer matching by externalId flag (stable across worlds), fallback to _id when present.
//  - Keep this file focused: no actor root create/update here.

import { MODULE_ID } from "../../constants";

export interface UpsertEmbeddedOptions {
  debug?: boolean;

  /**
   * If true, delete existing embedded docs that are not present in the incoming snapshot.
   * Default false (safer).
   */
  exactSync?: boolean;
  /**
   * Optional exact-sync override for Items only.
   * If omitted, falls back to `exactSync`.
   */
  exactSyncItems?: boolean;
  /**
   * Optional exact-sync override for ActiveEffects only.
   * If omitted, falls back to `exactSync`.
   */
  exactSyncEffects?: boolean;

  /**
   * If true, fallback-match by name+type when externalId is missing.
   * Default false (avoid accidental merges).
   */
  fallbackMatchByNameType?: boolean;
}

const FLAG_KEY = "externalId";

function logIf(debug: boolean, ...args: any[]) {
  if (debug) console.log(...args);
}

function getExternalIdFromDoc(doc: any): string | undefined {
  return doc?.getFlag?.(MODULE_ID, FLAG_KEY) ?? doc?.flags?.[MODULE_ID]?.[FLAG_KEY];
}

function getExternalIdFromData(data: any): string | undefined {
  return data?.flags?.[MODULE_ID]?.[FLAG_KEY];
}

function withExternalIdFlag(data: any, externalId?: string) {
  if (!externalId) return;
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
  data.flags[MODULE_ID][FLAG_KEY] = externalId;
}

function safeArray<T = any>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

type AnyDoc = any;

function sanitizeIncomingEmbeddedItem(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const out: any = { ...raw };
  // Foundry embedded updates identify docs by _id, not id.
  delete out.id;
  // Strip linkage fields that can cause schema/update issues across worlds.
  delete out.actorId;
  delete out.parent;
  delete out.pack;
  delete out.ownership;
  return out;
}

function sanitizeIncomingEmbeddedEffect(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const out: any = { ...raw };
  delete out.id;
  delete out.actorId;
  delete out.parent;
  delete out.pack;
  return out;
}

function buildKeyForIncoming(
  incoming: any,
  opts: { fallbackMatchByNameType: boolean }
): string | null {
  const ext = getExternalIdFromData(incoming);
  if (ext) return `ext:${ext}`;

  const id = incoming?._id;
  if (id) return `id:${id}`;

  if (opts.fallbackMatchByNameType) {
    const name = incoming?.name;
    const type = incoming?.type;
    if (name && type) return `nt:${type}:${name}`;
  }

  return null;
}

function buildKeyForExisting(
  doc: AnyDoc,
  opts: { fallbackMatchByNameType: boolean }
): string[] {
  const keys: string[] = [];

  const ext = getExternalIdFromDoc(doc);
  if (ext) keys.push(`ext:${ext}`);

  const id = doc?.id;
  if (id) keys.push(`id:${id}`);

  if (opts.fallbackMatchByNameType) {
    const name = doc?.name;
    const type = doc?.type;
    if (name && type) keys.push(`nt:${type}:${name}`);
  }

  return keys;
}

/**
 * Upsert embedded Items on an Actor.
 *
 * Incoming items should be plain objects from record.data.items (i.e., Foundry serialized form).
 * This function assumes you already sanitized each incoming item (e.g., removed ownership).
 */
export async function upsertActorItems(
  actor: AnyDoc,
  incomingItems: any[],
  opts: UpsertEmbeddedOptions = {}
): Promise<{
  ok: boolean;
  updated: number;
  created: number;
  deleted: number;
  errors?: any[];
}> {
  const debug = opts.debug ?? true;
  const exactSync = opts.exactSyncItems ?? opts.exactSync ?? false;
  const fallbackMatchByNameType = opts.fallbackMatchByNameType ?? false;

  const existing = actor?.items?.contents ?? actor?.items ?? [];
  const existingByKey = new Map<string, AnyDoc>();

  for (const doc of existing) {
    for (const k of buildKeyForExisting(doc, { fallbackMatchByNameType })) {
      // keep first hit; don't overwrite
      if (!existingByKey.has(k)) existingByKey.set(k, doc);
    }
  }

  const updates: any[] = [];
  const creates: any[] = [];

  // Track which existing docs were matched (for optional exact sync deletion)
  const matchedExistingIds = new Set<string>();

  for (const raw of safeArray(incomingItems)) {
    const incoming = sanitizeIncomingEmbeddedItem(raw);

    // Prefer matching by externalId if it exists on incoming
    const key = buildKeyForIncoming(incoming, { fallbackMatchByNameType });

    let match: AnyDoc | undefined;
    if (key) match = existingByKey.get(key);

    // If we found a match by ext or name/type, update that _id deterministically
    if (match?.id) incoming._id = match.id;

    // If incoming already had an externalId, ensure it's present (no-op if already there)
    const extIncoming = getExternalIdFromData(incoming);
    const extMatched = match ? getExternalIdFromDoc(match) : undefined;
    withExternalIdFlag(incoming, extIncoming ?? extMatched);

    if (incoming._id && actor.items?.get?.(incoming._id)) {
      updates.push(incoming);
      matchedExistingIds.add(incoming._id);
    } else if (match?.id) {
      // match existed but actor.items.get might not (shouldn't happen, but safe)
      incoming._id = match.id;
      updates.push(incoming);
      matchedExistingIds.add(match.id);
    } else {
      // Create new item (no _id)
      delete incoming._id;
      creates.push(incoming);
    }
  }

  const deletions: string[] = [];
  if (exactSync) {
    for (const doc of existing) {
      const id = doc?.id;
      if (!id) continue;
      if (!matchedExistingIds.has(id)) deletions.push(id);
    }
  }

  const errors: any[] = [];
  try {
    if (updates.length) {
      logIf(debug, "[vault-sync] upsertActorItems update", { actorId: actor.id, count: updates.length });
      try {
        await actor.updateEmbeddedDocuments("Item", updates, { diff: false, recursive: false });
      } catch (err) {
        // Fallback: isolate bad payloads instead of failing the entire batch.
        console.warn("[vault-sync] upsertActorItems batch update failed; retrying per item", err);
        for (const one of updates) {
          try {
            await actor.updateEmbeddedDocuments("Item", [one], { diff: false, recursive: false });
          } catch (e) {
            errors.push(e);
            console.warn("[vault-sync] upsertActorItems single update failed", {
              actorId: actor.id,
              itemId: one?._id,
              name: one?.name,
              error: e,
            });
          }
        }
      }
    }

    if (creates.length) {
      logIf(debug, "[vault-sync] upsertActorItems create", { actorId: actor.id, count: creates.length });
      try {
        await actor.createEmbeddedDocuments("Item", creates, { render: false });
      } catch (err) {
        console.warn("[vault-sync] upsertActorItems batch create failed; retrying per item", err);
        for (const one of creates) {
          try {
            await actor.createEmbeddedDocuments("Item", [one], { render: false });
          } catch (e) {
            errors.push(e);
            console.warn("[vault-sync] upsertActorItems single create failed", {
              actorId: actor.id,
              itemId: one?._id,
              name: one?.name,
              error: e,
            });
          }
        }
      }
    }

    if (deletions.length) {
      logIf(debug, "[vault-sync] upsertActorItems delete", { actorId: actor.id, count: deletions.length });
      await actor.deleteEmbeddedDocuments("Item", deletions, { render: false });
    }

    return {
      ok: errors.length === 0,
      updated: updates.length,
      created: creates.length,
      deleted: deletions.length,
      ...(errors.length ? { errors } : {}),
    };
  } catch (err) {
    errors.push(err);
    console.warn("[vault-sync] upsertActorItems failed", err);
    return {
      ok: false,
      updated: updates.length,
      created: creates.length,
      deleted: deletions.length,
      errors
    };
  }
}

/**
 * Upsert embedded ActiveEffects on an Actor.
 *
 * Incoming effects should be plain objects from record.data.effects.
 */
export async function upsertActorEffects(
  actor: AnyDoc,
  incomingEffects: any[],
  opts: UpsertEmbeddedOptions = {}
): Promise<{
  ok: boolean;
  updated: number;
  created: number;
  deleted: number;
  errors?: any[];
}> {
  const debug = opts.debug ?? true;
  const exactSync = opts.exactSyncEffects ?? opts.exactSync ?? false;
  const fallbackMatchByNameType = opts.fallbackMatchByNameType ?? false;

  const existing = actor?.effects?.contents ?? actor?.effects ?? [];
  const existingByKey = new Map<string, AnyDoc>();

  for (const doc of existing) {
    for (const k of buildKeyForExisting(doc, { fallbackMatchByNameType })) {
      if (!existingByKey.has(k)) existingByKey.set(k, doc);
    }
  }

  const updates: any[] = [];
  const creates: any[] = [];
  const matchedExistingIds = new Set<string>();

  for (const raw of safeArray(incomingEffects)) {
    const incoming = sanitizeIncomingEmbeddedEffect(raw);

    const key = buildKeyForIncoming(incoming, { fallbackMatchByNameType });

    let match: AnyDoc | undefined;
    if (key) match = existingByKey.get(key);

    if (match?.id) incoming._id = match.id;

    const ext = getExternalIdFromData(incoming);
    withExternalIdFlag(incoming, ext);

    if (incoming._id && actor.effects?.get?.(incoming._id)) {
      updates.push(incoming);
      matchedExistingIds.add(incoming._id);
    } else if (match?.id) {
      incoming._id = match.id;
      updates.push(incoming);
      matchedExistingIds.add(match.id);
    } else {
      delete incoming._id;
      creates.push(incoming);
    }
  }

  const deletions: string[] = [];
  if (exactSync) {
    for (const doc of existing) {
      const id = doc?.id;
      if (!id) continue;
      if (!matchedExistingIds.has(id)) deletions.push(id);
    }
  }

  const errors: any[] = [];
  try {
    if (updates.length) {
      logIf(debug, "[vault-sync] upsertActorEffects update", { actorId: actor.id, count: updates.length });
      await actor.updateEmbeddedDocuments("ActiveEffect", updates, { diff: false, recursive: false });
    }

    if (creates.length) {
      logIf(debug, "[vault-sync] upsertActorEffects create", { actorId: actor.id, count: creates.length });
      await actor.createEmbeddedDocuments("ActiveEffect", creates, { render: false });
    }

    if (deletions.length) {
      logIf(debug, "[vault-sync] upsertActorEffects delete", { actorId: actor.id, count: deletions.length });
      await actor.deleteEmbeddedDocuments("ActiveEffect", deletions, { render: false });
    }

    return { ok: true, updated: updates.length, created: creates.length, deleted: deletions.length };
  } catch (err) {
    errors.push(err);
    console.warn("[vault-sync] upsertActorEffects failed", err);
    return {
      ok: false,
      updated: updates.length,
      created: creates.length,
      deleted: deletions.length,
      errors
    };
  }
}

/**
 * Convenience: upsert both items and effects from an exported Actor snapshot.
 * Pass record.data.items / record.data.effects through your sanitize layer first if desired.
 */
export async function upsertActorEmbedded(
  actor: AnyDoc,
  snapshot: { items?: any[]; effects?: any[] },
  opts: UpsertEmbeddedOptions = {}
) {
  const itemsRes = await upsertActorItems(actor, snapshot.items ?? [], opts);
  const effectsRes = await upsertActorEffects(actor, snapshot.effects ?? [], opts);
  const ok = !!itemsRes.ok && !!effectsRes.ok;
  return { ok, items: itemsRes, effects: effectsRes };
}
