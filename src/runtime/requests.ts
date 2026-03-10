// runtime/requests.ts

import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../storage";
import { writeJsonVersioned } from "../storage/json";

import {
  exportItemPackIndex,
  exportAllItemPackIndexes,
  exportItemFromPack
} from "../export/item/packs";

import { exportActor } from "../export/actor";
import { exportItem } from "../export/item";
import { exportJournalEntry, exportJournalPage } from "../export/journal";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type VaultSyncRequestAction =
  | "exportItemPackIndex"
  | "exportAllItemPackIndexes"
  | "exportItemFromPack"
  | "exportByUuid"
  | "listItemPacks"
  | "searchItemPackIndex";

export interface VaultSyncRequestEnvelope {
  type?: "request" | "command";
  action: VaultSyncRequestAction | string;
  requestId?: string;
  params?: Record<string, any>;
  createdAt?: number;
  meta?: Record<string, any>;
}

export interface VaultSyncRequestContext {
  moduleId: string;
  source: "data";
}

export interface VaultSyncRequestResponse {
  ok: boolean;
  reason?: string;

  action?: string;
  requestId?: string;

  responseFile?: string | null;
  result?: any;

  generatedAt?: string;
  schemaVersion?: string;
  worldId?: string;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function handleVaultSyncRequest(
  payload: any,
  ctx: VaultSyncRequestContext
): Promise<VaultSyncRequestResponse> {
  const source = ctx.source ?? "data";

  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid-request:payload-not-object" };
  }

  const req = payload as VaultSyncRequestEnvelope;

  const action = String(req.action ?? "");
  if (!action) return { ok: false, reason: "invalid-request:missing-action" };

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const requestId = req.requestId ?? defaultRequestId(action);

  let result: any;
  try {
    result = await runAction(action, req.params ?? {}, source);
  } catch (err: any) {
    const response: VaultSyncRequestResponse = {
      ok: false,
      reason: `request-failed:${action}:${String(err?.message ?? err)}`,
      action,
      requestId,
      generatedAt: new Date().toISOString(),
      schemaVersion: VAULT_SCHEMA_VERSION,
      worldId: (game as any)?.world?.id,
      result: {
        error: String(err?.message ?? err),
        stack: err?.stack
      }
    };

    const responseFile = await writeResponse(paths, action, requestId, response, source);
    response.responseFile = responseFile;
    return response;
  }

  const response: VaultSyncRequestResponse = {
    ok: true,
    action,
    requestId,
    generatedAt: new Date().toISOString(),
    schemaVersion: VAULT_SCHEMA_VERSION,
    worldId: (game as any)?.world?.id,
    result
  };

  const responseFile = await writeResponse(paths, action, requestId, response, source);
  response.responseFile = responseFile;
  return response;
}

/* -------------------------------------------------------------------------- */
/* Action routing                                                             */
/* -------------------------------------------------------------------------- */

async function runAction(action: string, params: Record<string, any>, source: "data") {
  switch (action) {
    case "exportItemPackIndex": {
      const collection = String(params.collection ?? "");
      if (!collection) throw new Error("missing params.collection");
      return await exportItemPackIndex(collection, { source });
    }

    case "exportAllItemPackIndexes": {
      return await exportAllItemPackIndexes({ source });
    }

    case "exportItemFromPack": {
      const collection = String(params.collection ?? "");
      const id = String(params.id ?? "");
      if (!collection) throw new Error("missing params.collection");
      if (!id) throw new Error("missing params.id");
      return await exportItemFromPack(collection, id, { source });
    }

    case "exportByUuid": {
      const uuid = String(params.uuid ?? "");
      if (!uuid) throw new Error("missing params.uuid");

      const doc: any = await fromUuid(uuid);
      if (!doc) throw new Error(`No document for uuid: ${uuid}`);

      if (doc.documentName === "Actor") {
        return await exportActor(doc, {
          source,
          ensureExternalId: false,
          ensureEmbeddedExternalIds: false
        });
      }

      if (doc.documentName === "Item") {
        return await exportItem(doc, { source, ensureExternalId: true });
      }

      if (doc.documentName === "JournalPage" || doc.documentName === "JournalEntryPage") {
        return await exportJournalPage(doc, {
          source,
          ensureExternalId: true,
          includeParentEntry: true
        });
      }

      if (doc.documentName === "JournalEntry") {
        return await exportJournalEntry(doc, {
          source,
          ensureExternalId: true,
          includeAllPages: true
        });
      }

      throw new Error(`Unsupported doc type: ${doc.documentName}`);
    }

    /* -------------------------- NEW: list packs -------------------------- */

    case "listItemPacks": {
      // params:
      //  - includeLocked?: boolean (default true)
      //  - includePrivate?: boolean (default true)
      //  - includeNonItem?: boolean (default false)
      const includeLocked = params.includeLocked ?? true;
      const includePrivate = params.includePrivate ?? true;
      const includeNonItem = params.includeNonItem ?? false;

      const packs: any[] = [];

      for (const pack of (game as any).packs ?? []) {
        const docName = pack?.documentName ?? pack?.metadata?.type; // v13 docName is typical
        const isItemPack = docName === "Item";

        if (!includeNonItem && !isItemPack) continue;
        if (!includeLocked && pack?.locked) continue;

        // "private" can vary; treat ownership-limited as private-ish
        const isPrivate = !!pack?.private || pack?.metadata?.private === true;
        if (!includePrivate && isPrivate) continue;

        const meta = pack?.metadata ?? {};
        packs.push({
          collection: pack.collection ?? meta?.id ?? meta?.collection,
          title: pack.title ?? meta?.label ?? meta?.name,
          documentName: pack.documentName ?? meta?.type,
          package: meta?.package,
          system: meta?.system,
          path: meta?.path,
          locked: !!pack.locked,
          private: isPrivate,
          ownership: meta?.ownership,
          banner: meta?.banner,
          type: meta?.type
        });
      }

      // stable-ish sort for UX
      packs.sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));

      return {
        count: packs.length,
        packs
      };
    }

    /* --------------------- NEW: search pack index ------------------------ */

    case "searchItemPackIndex": {
      // params:
      //  - collection: string (required)
      //  - q: string (required)
      //  - limit?: number (default 50)
      //  - fields?: string[] (default ["name","type"])
      //  - caseSensitive?: boolean (default false)
      const collection = String(params.collection ?? "");
      const qRaw = params.q;
      const q = String(qRaw ?? "").trim();
      if (!collection) throw new Error("missing params.collection");
      if (!q) throw new Error("missing params.q");

      const limit = Math.max(1, Math.min(Number(params.limit ?? 50), 500));
      const caseSensitive = params.caseSensitive ?? false;

      const fields: string[] = Array.isArray(params.fields) && params.fields.length
        ? params.fields.map(String)
        : ["name", "type"];

      const pack: any = (game as any).packs?.get?.(collection);
      if (!pack) throw new Error(`Unknown pack collection: ${collection}`);

      const docName = pack?.documentName ?? pack?.metadata?.type;
      if (docName !== "Item") {
        throw new Error(`Pack is not an Item pack: ${collection} (${docName ?? "unknown"})`);
      }

      // Ask Foundry for an index with additional fields if requested.
      // Many systems support "type" and "system.*" in the index.
      // If a field isn't supported, Foundry usually just omits it (fine).
      const index: any[] = await pack.getIndex?.({ fields }) ?? await pack.getIndex?.() ?? [];

      const needle = caseSensitive ? q : q.toLowerCase();

      const matches: any[] = [];
      for (const row of index) {
        // Build a simple search corpus out of requested fields
        const corpusParts: string[] = [];
        for (const f of fields) {
          const v = getPath(row, f);
          if (v === null || v === undefined) continue;
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            corpusParts.push(String(v));
          } else {
            // for objects/arrays, stringify lightly
            try {
              corpusParts.push(JSON.stringify(v));
            } catch {
              // ignore
            }
          }
        }

        const haystackRaw = corpusParts.join(" | ");
        const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase();

        if (haystack.includes(needle)) {
          matches.push({
            _id: row._id ?? row.id,
            uuid: row.uuid ?? `Compendium.${collection}.${row._id ?? row.id}`,
            name: row.name,
            type: row.type,
            img: row.img,
            // include the raw row for debugging / future UI
            row
          });
          if (matches.length >= limit) break;
        }
      }

      return {
        collection,
        q,
        fields,
        count: matches.length,
        matches
      };
    }

    default:
      throw new Error(`unsupported-action:${action}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Response writing                                                           */
/* -------------------------------------------------------------------------- */

async function writeResponse(
  paths: ReturnType<typeof getVaultSyncPaths>,
  action: string,
  requestId: string,
  response: VaultSyncRequestResponse,
  source: "data"
): Promise<string | null> {
  const outDir = `${paths.exports}/requests/outbox`;
  const base = safeBaseName(`resp.${action}.${requestId}`);
  return await writeJsonVersioned(outDir, base, response, source);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function defaultRequestId(action: string) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${safeBaseName(action)}.${ts}.${rand}`;
}

function safeBaseName(name: string): string {
  return String(name).replace(/[^\w.-]+/g, "_");
}

function getPath(obj: any, path: string): any {
  // supports "system.school" etc.
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
