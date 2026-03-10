/**
 * runtime/hooks.ts
 * Thin Foundry hook wiring (v13).
 *
 * Purpose:
 *  - Subscribe to Foundry document lifecycle hooks.
 *  - Route interesting events to the export pipeline (debounced).
 *  - Write tombstones (_done markers) when documents are deleted.
 *  - Avoid echo loops: changes caused by imports/exports should not trigger exports.
 *
 * Keep this file thin:
 *  - No storage logic
 *  - No import apply logic
 *  - No export serialization logic (just call exporters)
 */

import { exportActor } from "../export/actor";
import { exportJournalEntry, exportJournalPage } from "../export/journal";
import { exportItem } from "../export/item";
import { exportChatMessage } from "../export/chat";
import { tombstone } from "../storage/json";
import { getVaultSyncPaths } from "../storage";
import { MODULE_ID } from "../constants";

export interface RegisterHooksOptions {
  moduleId: string;

  /** If true, only the GM will run auto-exports from hooks. Default true. */
  exportGmOnly?: boolean;

  /** Debounce window for exporting the same document repeatedly. Default 750ms. */
  exportDebounceMs?: number;

  /** Log hook events to console. Default true. */
  debug?: boolean;
}

/**
 * Single suppression flag for ALL vaultsync-caused mutations.
 * - Imports should set this while applying.
 * - Exporters should set this while writing flags (externalId, etc.)
 */
let _suppress = false;

/** Suppress all hook reactions (imports, exports, internal maintenance). */
export function suppressHooks(value: boolean) {
  _suppress = value;
}

/** Are hooks currently suppressed? */
export function hooksSuppressed(): boolean {
  return _suppress;
}

/**
 * Convenience: run a block with hooks suppressed (always restores).
 * Use in exporters/importers around setFlag/update/apply changes.
 */
export async function withSuppressedHooks<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _suppress;
  _suppress = true;
  try {
    return await fn();
  } finally {
    _suppress = prev;
  }
}

let _isImporting = false;
// preserve suppression state across import cycles
let _suppressBeforeImport: boolean | null = null;

/**
 * Set while applying import operations.
 * Important: do NOT clobber an existing suppression state when import ends.
 */
export function setImporting(value: boolean) {
  if (value) {
    if (_suppressBeforeImport === null) _suppressBeforeImport = _suppress;
    _isImporting = true;
    _suppress = true;
    return;
  }

  _isImporting = false;
  if (_suppressBeforeImport !== null) {
    _suppress = _suppressBeforeImport;
    _suppressBeforeImport = null;
  }
}

export function isImporting(): boolean {
  return _isImporting;
}

/* -------------------------------------------------------------------------- */
/* Debounced Export Queue (local, thin)                                       */
/* -------------------------------------------------------------------------- */

type Timer = ReturnType<typeof setTimeout>;
const _timers = new Map<string, Timer>();

function scheduleOnce(key: string, ms: number, fn: () => void) {
  const prev = _timers.get(key);
  if (prev) clearTimeout(prev);

  const t = setTimeout(() => {
    _timers.delete(key);
    fn();
  }, ms);

  _timers.set(key, t);
}

function docKey(doc: any): string {
  return doc?.uuid ?? `${doc?.documentName ?? "Doc"}:${doc?.id ?? "unknown"}`;
}

/* -------------------------------------------------------------------------- */
/* Tombstone helpers                                                           */
/* -------------------------------------------------------------------------- */

function getDocExternalId(doc: any): string | undefined {
  return (
    doc?.getFlag?.(MODULE_ID, "externalId") ??
    doc?.flags?.[MODULE_ID]?.externalId
  );
}

async function writeTombstone(
  doc: any,
  exportSubdir: string,
  source: "data" = "data"
) {
  try {
    const paths = getVaultSyncPaths();
    const dir = `${paths.exports}/${exportSubdir}`;
    const targetName = `${doc?.documentName ?? "doc"}.${doc?.id ?? "unknown"}`;
    await tombstone(dir, targetName, source, {
      docType: doc?.documentName,
      uuid: doc?.uuid,
      externalId: getDocExternalId(doc),
      deletedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn(`[${MODULE_ID}] writeTombstone failed`, err);
  }
}

/* -------------------------------------------------------------------------- */
/* Hook Registration                                                          */
/* -------------------------------------------------------------------------- */

export function registerVaultSyncHooks(opts: RegisterHooksOptions) {
  const moduleId = opts.moduleId;
  const exportGmOnly = opts.exportGmOnly ?? true;
  const exportDebounceMs = opts.exportDebounceMs ?? 750;
  const debug = opts.debug ?? true;

  const canAutoExport = () => {
    if (exportGmOnly && !game.user?.isGM) return false;
    return true;
  };

  const log = (...args: any[]) => {
    if (!debug) return;
    console.log(...args);
  };

  const warn = (...args: any[]) => console.warn(...args);

  function shouldIgnore(options?: any) {
    const o = options ?? {};
    if (_suppress || _isImporting) return true;
    if (o.noHook) return true;
    if (o.vaultsync || o.vaultSync) return true;
    return false;
  }

  function isWorldItem(doc: any): boolean {
    if (!doc) return false;
    if (doc.parent) return false;
    if (doc.collection && game.items && doc.collection === game.items) return true;
    return doc.documentName === "Item";
  }

  /* ----------------------------- Export helpers ---------------------------- */

  function exportJournalPageDebounced(pageDoc: any) {
    if (!canAutoExport()) return;

    const key = `export:journalPage:${docKey(pageDoc)}`;
    scheduleOnce(key, exportDebounceMs, () => {
      void (async () => {
        try {
          await withSuppressedHooks(async () => {
            await exportJournalPage(pageDoc, {
              source: "data",
              ensureExternalId: true,
              includeParentEntry: true
            });
          });
          log(`[${moduleId}] auto-exported JournalEntryPage`, pageDoc?.uuid ?? pageDoc?.id);
        } catch (err) {
          warn(`[${moduleId}] auto-export JournalEntryPage failed`, err);
        }
      })();
    });
  }

  function exportJournalEntryDebounced(entryDoc: any) {
    if (!canAutoExport()) return;

    const key = `export:journalEntry:${docKey(entryDoc)}`;
    scheduleOnce(key, exportDebounceMs, () => {
      void (async () => {
        try {
          await withSuppressedHooks(async () => {
            await exportJournalEntry(entryDoc, {
              source: "data",
              ensureExternalId: true,
              includeAllPages: false
            });
          });
          log(`[${moduleId}] auto-exported JournalEntry`, entryDoc?.uuid ?? entryDoc?.id);
        } catch (err) {
          warn(`[${moduleId}] auto-export JournalEntry failed`, err);
        }
      })();
    });
  }

  function exportActorDebounced(actorDoc: any) {
    if (!canAutoExport()) return;

    const key = `export:actor:${docKey(actorDoc)}`;
    scheduleOnce(key, exportDebounceMs, () => {
      void (async () => {
        try {
          await withSuppressedHooks(async () => {
            await exportActor(actorDoc, {
              source: "data",
              ensureExternalId: false,
              ensureEmbeddedExternalIds: false
            });
          });
          log(`[${moduleId}] auto-exported Actor`, actorDoc?.uuid ?? actorDoc?.id);
        } catch (err) {
          warn(`[${moduleId}] auto-export Actor failed`, err);
        }
      })();
    });
  }

  function exportItemDebounced(itemDoc: any) {
    if (!canAutoExport()) return;

    const key = `export:item:${docKey(itemDoc)}`;
    scheduleOnce(key, exportDebounceMs, () => {
      void (async () => {
        try {
          await withSuppressedHooks(async () => {
            await exportItem(itemDoc, {
              source: "data",
              ensureExternalId: true
            });
          });
          log(`[${moduleId}] auto-exported Item`, itemDoc?.uuid ?? itemDoc?.id);
        } catch (err) {
          warn(`[${moduleId}] auto-export Item failed`, err);
        }
      })();
    });
  }

  function exportChatDebounced(msgDoc: any) {
    if (!canAutoExport()) return;

    const key = `export:chat:${docKey(msgDoc)}`;
    scheduleOnce(key, exportDebounceMs, () => {
      void (async () => {
        try {
          await exportChatMessage(msgDoc, { source: "data" });
          log(`[${moduleId}] auto-exported ChatMessage`, msgDoc?.uuid ?? msgDoc?.id);
        } catch (err) {
          warn(`[${moduleId}] auto-export ChatMessage failed`, err);
        }
      })();
    });
  }

  /* ------------------------------- Journals -------------------------------- */

  Hooks.on("createJournalEntry", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] createJournalEntry`, doc?.uuid ?? doc?.id);
    exportJournalEntryDebounced(doc);
  });

  Hooks.on("updateJournalEntry", (doc: any, change: any, options: any, userId: string) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] updateJournalEntry`, { uuid: doc?.uuid, userId, change });
    exportJournalEntryDebounced(doc);
  });

  Hooks.on("deleteJournalEntry", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] deleteJournalEntry`, doc?.uuid ?? doc?.id);
    if (canAutoExport()) void writeTombstone(doc, "journal");
  });

  Hooks.on("createJournalEntryPage", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] createJournalEntryPage`, doc?.uuid ?? doc?.id);
    exportJournalPageDebounced(doc);
  });

  Hooks.on("updateJournalEntryPage", (doc: any, change: any, options: any, userId: string) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] updateJournalEntryPage`, { uuid: doc?.uuid, userId, change });
    exportJournalPageDebounced(doc);
  });

  Hooks.on("deleteJournalEntryPage", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] deleteJournalEntryPage`, doc?.uuid ?? doc?.id);
    if (canAutoExport()) void writeTombstone(doc, "journal");
  });

  /* -------------------------------- Actors --------------------------------- */

  Hooks.on("createActor", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] createActor`, doc?.uuid ?? doc?.id);
    exportActorDebounced(doc);
  });

  Hooks.on("updateActor", (doc: any, change: any, options: any, userId: string) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] updateActor`, { uuid: doc?.uuid, userId, change });
    exportActorDebounced(doc);
  });

  Hooks.on("deleteActor", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] deleteActor`, doc?.uuid ?? doc?.id);
    if (canAutoExport()) void writeTombstone(doc, "actors");
  });

  /* -------------------------------- Items ---------------------------------- */

  Hooks.on("createItem", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;

    // Embedded Item under Actor: export the actor (inventory changed)
    if (doc?.parent?.documentName === "Actor") {
      log(`[${moduleId}] createItem (embedded)`, { actorUuid: doc.parent?.uuid, itemId: doc?.id });
      exportActorDebounced(doc.parent);
      return;
    }

    if (!isWorldItem(doc)) return;
    log(`[${moduleId}] createItem`, doc?.uuid ?? doc?.id);
    exportItemDebounced(doc);
  });

  Hooks.on("updateItem", (doc: any, change: any, options: any, userId: string) => {
    if (shouldIgnore(options)) return;

    if (doc?.parent?.documentName === "Actor") {
      log(`[${moduleId}] updateItem (embedded)`, { actorUuid: doc.parent?.uuid, userId, change });
      exportActorDebounced(doc.parent);
      return;
    }

    if (!isWorldItem(doc)) return;
    log(`[${moduleId}] updateItem`, { uuid: doc?.uuid, userId, change });
    exportItemDebounced(doc);
  });

  Hooks.on("deleteItem", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;

    if (doc?.parent?.documentName === "Actor") {
      log(`[${moduleId}] deleteItem (embedded)`, { actorUuid: doc.parent?.uuid, itemId: doc?.id });
      exportActorDebounced(doc.parent);
      return;
    }

    if (!isWorldItem(doc)) return;
    log(`[${moduleId}] deleteItem`, doc?.uuid ?? doc?.id);
    if (canAutoExport()) void writeTombstone(doc, "items");
  });

  /* ------------------------------ ChatMessages ----------------------------- */

  Hooks.on("createChatMessage", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] createChatMessage`, doc?.uuid ?? doc?.id);
    exportChatDebounced(doc);
  });

  Hooks.on("deleteChatMessage", (doc: any, options: any) => {
    if (shouldIgnore(options)) return;
    log(`[${moduleId}] deleteChatMessage`, doc?.uuid ?? doc?.id);
    if (canAutoExport()) void writeTombstone(doc, "chat");
  });
}
