// src/import/index.ts
import { setImporting, withSuppressedHooks } from "../runtime/hooks";
import { applyJournalEntryImport, applyJournalEntryPageImport } from "./journal";
import { applyActorImport } from "./actor";
import { applyItemImport } from "./item";
import { applyChatMessageImport } from "./chat";
import { normalizeImportPayload } from "./normalize";

export interface ApplyImportOptions {
  gmOnly?: boolean;
  debug?: boolean;
}

export type NormalizedImportRecord = {
  docType: string;
  uuid?: string;
  externalId?: string;
  foundry: any;           // raw Foundry document — populated by normalizeImportPayload
  meta?: Record<string, any>;
  [k: string]: any;
};

/**
 * Session-scoped deduplication set for ImportOp opIds.
 *
 * Each ImportOp carries a stable opId (UUID). If the same op is retried by
 * VaultHero (network blip, 202 treated as failure, offline-queue flush) it
 * arrives as a second inbox file with the same opId. Without this guard,
 * VaultSync would apply the same HP change twice — triggering Foundry's
 * reactive systems (concentration saves, Bloodied condition, etc.) a second
 * time and creating an oscillation loop.
 *
 * The set lives for the lifetime of the Foundry session. On GM reconnect the
 * watcher already skips files that have marker files on disk, so cross-session
 * safety is handled by the marker/tombstone mechanism in watch.ts.
 */
const _appliedOpIds = new Set<string>();

export async function applyImportPayload(payload: any, opts: ApplyImportOptions = {}) {
  const gmOnly = opts.gmOnly ?? true;
  const debug = opts.debug ?? true;

  if (gmOnly && !game.user?.isGM) return { ok: false, reason: "gmOnly" as const };

  // ── opId deduplication ──────────────────────────────────────────────────
  // If this exact operation has already been applied in this session, skip it.
  // The marker file on disk handles cross-session dedup; this handles retries
  // that arrive as a second inbox file before the first one is cleaned up.
  const opId = typeof payload?.opId === "string" && payload.opId ? payload.opId : null;
  if (opId) {
    if (_appliedOpIds.has(opId)) {
      return { ok: true, reason: "duplicate-opId" as const, skipped: true };
    }
    // Register before applying — if the apply throws, the error handler in
    // watch.ts will write a failed marker, which is the right outcome. The
    // in-memory guard prevents a second attempt from succeeding silently.
    _appliedOpIds.add(opId);
  }
  // ────────────────────────────────────────────────────────────────────────

  const records = normalizeImportPayload(payload) as NormalizedImportRecord[];
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, reason: "invalid-payload" as const };
  }

  setImporting(true);
  try {
    return await withSuppressedHooks(async () => {
      const results: any[] = [];

      for (const record of records) {
        const docType =
          record.docType === "JournalPage" ? "JournalEntryPage" : record.docType;

        switch (docType) {
          case "Actor": {
            results.push(
              await applyActorImport(
                {
                  docType: "Actor",
                  uuid: record.uuid,
                  externalId: record.externalId,
                  foundry: record.foundry
                } as any,
                { debug }
              )
            );
            break;
          }

          case "Item": {
            results.push(
              await applyItemImport({
                type: "export",
                contractVersion: 1,
                docType: "Item",
                uuid: record.uuid,
                externalId: record.externalId,
                foundry: record.foundry,
                exportedAt: record.meta?.exportedAt ?? 0
              })
            );
            break;
          }

          case "JournalEntry": {
            results.push(await applyJournalEntryImport(record as any, { debug }));
            break;
          }

          case "JournalEntryPage": {
            results.push(await applyJournalEntryPageImport(record as any, { debug }));
            break;
          }

          case "ChatMessage": {
            results.push(
              await applyChatMessageImport({
                type: "export",
                contractVersion: 1,
                docType: "ChatMessage",
                uuid: record.uuid,
                externalId: record.externalId,
                foundry: record.foundry,
                exportedAt: record.meta?.exportedAt ?? 0
              })
            );
            break;
          }

          default: {
            results.push({ ok: false, reason: `unsupported-docType:${docType}` });
            break;
          }
        }
      }

      const ok = results.every(r => r?.ok);
      return { ok, results };
    });
  } finally {
    setImporting(false);
  }
}
