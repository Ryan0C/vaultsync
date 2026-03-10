/**
 * runtime/bootstrap.ts
 * VaultSync module bootstrap for Foundry VTT v13.
 *
 * Responsibilities:
 *  - Ensure storage directories exist under the active world data dir.
 *  - Register socket + hook wiring (thin).
 *  - Start the import inbox watcher (server-side behavior), GM-only by default.
 *
 * Notes:
 *  - This module assumes "create-only" filesystem semantics: no delete/move required.
 *  - The watcher marks processed/failed via marker files (see storage/watch.ts).
 */

import { isImporting, hooksSuppressed, registerVaultSyncHooks } from "./hooks";
import { ensureVaultSyncDirs } from "../storage";
import { startImportInboxWatcher } from "../storage/watch";
import { registerVaultSyncSocket } from "./socket";
import { getVaultSyncStatus } from "./status";
import { applyImportPayload } from "../import";
import { registerVaultSyncSettingsMenu } from "./settings";
import { writeVaultMeta, writeWorldMeta, startWorldHeartbeat, writeStatusMeta } from "./world";

import {
  exportItemPackIndex,
  exportAllItemPackIndexes,
  exportItemFromPack
} from "../export/item/packs";

// ✅ static exports imports (no dynamic import)
import { exportSelection } from "../export";

import {
  exportSelectedJournalPage,
  exportJournalPage,
  exportJournalEntry
} from "../export/journal";

import { exportSelectedActor, exportActor, exportAllWorldActors } from "../export/actor";

import { exportSelectedItem, exportItem } from "../export/item";

import { exportChatMessage } from "../export/chat";

// ✅ NEW: request/command handler (static import)
import { handleVaultSyncRequest } from "./requests";

export interface VaultSyncBootstrapOptions {
  moduleId: string;
  startWatcher?: boolean;
  watchIntervalMs?: number;
  watchMaxPerTick?: number;
  watcherGmOnly?: boolean;
  source?: "data";
}

type WatchHandle = { stop: () => void; isRunning: () => boolean };

let _bootstrapped = false;
let _watchHandle: WatchHandle | null = null;


export function bootstrapVaultSync(opts: VaultSyncBootstrapOptions) {
  if (_bootstrapped) return;
  _bootstrapped = true;

  const moduleId = opts.moduleId;
  const source = opts.source ?? "data";
  const startWatcher = opts.startWatcher ?? true;

  Hooks.once("init", () => {
    
    registerVaultSyncSettingsMenu();

    try {
      registerVaultSyncSocket({ moduleId });
    } catch (err) {
      console.error(`[${moduleId}] registerVaultSyncSocket failed`, err);
    }

    registerVaultSyncHooks({
      moduleId,
      exportGmOnly: true,
      exportDebounceMs: 750,
      debug: true
    });

    console.log(`[${moduleId}] Hooks registered`);
  });

  Hooks.once("ready", async () => {
    // Ensure world-scoped storage exists.
    try {
      await ensureVaultSyncDirs(source);
    } catch (err) {
      console.warn(`[${moduleId}] Failed to ensure VaultSync dirs`, err);
      // keep going—module can still operate without watcher
    }

    const mod: any = game.modules!.get(moduleId);
    if (!mod) {
      console.warn(`[${moduleId}] bootstrap: module not found in game.modules`);
      return;
    }

    // Meta + heartbeat (GM-only recommended)
    if (game.user?.isGM) {
        await writeVaultMeta(source).catch(() => {});
        await writeWorldMeta(source).catch(() => {});
        startWorldHeartbeat({ source, gmOnly: true, intervalMs: 3000 });

        // Initial full actor export for world bootstrap.
        const actorExport = await exportAllWorldActors({
          source,
          ensureExternalId: false,
          ensureEmbeddedExternalIds: false
        }).catch((err) => {
          console.warn(`[${moduleId}] initial actor export failed`, err);
          return null;
        });
        if (actorExport) {
          console.log(`[${moduleId}] initial actor export complete`, { count: actorExport.count });
        }
    }

    // Optional: more reactive status updates
    if (game.user?.isGM) {
        Hooks.on("updateUser", () => { void writeStatusMeta({ reason: "updateUser" }, source); });
        Hooks.on("createUser", () => { void writeStatusMeta({ reason: "createUser" }, source); });
        Hooks.on("deleteUser", () => { void writeStatusMeta({ reason: "deleteUser" }, source); });
    }
    mod.api = {
      hooks: () => ({
        suppressed: hooksSuppressed(),
        importing: isImporting(),
        userIsGM: !!game.user?.isGM
      }),

      // --- status / diagnostics ---
      status: async (apiOpts?: any) =>
        await getVaultSyncStatus({
          source,
          includePendingList: true,
          ...(apiOpts ?? {})
        }),

      watcher: () => ({
        running: Boolean(_watchHandle?.isRunning?.()),
        gmOnly: opts.watcherGmOnly ?? true
      }),

      stopWatcher: () => stopVaultSyncWatcher(),

      // --- exports ---
      exportSelection: async () => {
        return await exportSelection({ source, ensureExternalId: true });
      },

      /* ------------------------------ Journals ------------------------------ */

      exportSelectedJournalPage: async () => {
        return await exportSelectedJournalPage({
          source,
          ensureExternalId: true,
          includeParentEntry: true
        });
      },

      exportJournalByUuid: async (uuid: string) => {
        const doc: any = await fromUuid(uuid);
        if (!doc) throw new Error(`No document for uuid: ${uuid}`);

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
      },

      /* ------------------------------- Actors ------------------------------ */

      exportSelectedActor: async () => {
        return await exportSelectedActor({
          source,
          ensureExternalId: false,
          ensureEmbeddedExternalIds: false
        });
      },

      exportActorByUuid: async (uuid: string) => {
        const doc: any = await fromUuid(uuid);
        if (!doc) throw new Error(`No document for uuid: ${uuid}`);
        if (doc.documentName !== "Actor") throw new Error(`Not an Actor uuid: ${uuid}`);

        return await exportActor(doc, {
          source,
          ensureExternalId: false,
          ensureEmbeddedExternalIds: false
        });
      },

      /* -------------------------------- Items ------------------------------ */

      exportSelectedItem: async () => {
        return await exportSelectedItem({
          source,
          ensureExternalId: true
        });
      },

      exportItemByUuid: async (uuid: string) => {
        const doc: any = await fromUuid(uuid);
        if (!doc) throw new Error(`No document for uuid: ${uuid}`);
        if (doc.documentName !== "Item") throw new Error(`Not an Item uuid: ${uuid}`);

        // NOTE: This is for WORLD items. Embedded items are exported via Actor.
        return await exportItem(doc, {
          source,
          ensureExternalId: true
        });
      },

      exportItemPackIndex: async (collection: string) => exportItemPackIndex(collection, { source }),
      exportAllItemPackIndexes: async () => exportAllItemPackIndexes({ source }),
      exportItemFromPack: async (collection: string, id: string) =>
        exportItemFromPack(collection, id, { source }),

      /* ----------------------------- ChatMessages --------------------------- */

      exportChatByUuid: async (uuid: string) => {
        const doc: any = await fromUuid(uuid);
        if (!doc) throw new Error(`No document for uuid: ${uuid}`);
        if (doc.documentName !== "ChatMessage") throw new Error(`Not a ChatMessage uuid: ${uuid}`);
        return await exportChatMessage(doc, { source });
      },

      /* ----------------------------- Requests/Commands ---------------------- */

      // Useful for testing from console:
      // game.modules.get("vault-sync2").api.handleRequest({type:"request", ...})
      handleRequest: async (req: any) => handleVaultSyncRequest(req, { moduleId, source }),

      /* ----------------------------- Generic export ------------------------- */

      exportByUuid: async (uuid: string) => {
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

        if (doc.documentName === "ChatMessage") {
          return await exportChatMessage(doc, { source });
        }

        throw new Error(`Unsupported doc type: ${doc.documentName}`);
      }
    };

    console.log(`[${moduleId}] Dev API ready: game.modules.get("${moduleId}").api`);

    // Watcher start (GM-only by default)
    if (!startWatcher) return;

    const gmOnly = opts.watcherGmOnly ?? true;
    if (gmOnly && !game.user?.isGM) return;

    if (_watchHandle?.isRunning()) return;

    _watchHandle = await startImportInboxWatcher(
      async ({ fileName, fullPath, payload }) => {
        console.log(`[${moduleId}] Inbox file: ${fileName}`, { fullPath });

        // ✅ NEW: commands/requests route here; everything else goes to import pipeline
        const isRequest =
          payload?.type === "request" ||
          payload?.type === "command" ||
          typeof payload?.action === "string";

        const res = isRequest
          ? await handleVaultSyncRequest(payload, { moduleId, source })
          : await applyImportPayload(payload);

        // IMPORTANT: if we don't throw on failures, watcher will mark "done" anyway.
        if (!res?.ok) {
          console.warn(`[${moduleId}] Inbox rejected: ${fileName}`, res);
          throw new Error(`Inbox failed: ${(res as any)?.reason ?? "unknown"}`);
        }

        console.log(`[${moduleId}] Inbox applied: ${fileName}`, res);
      },
      {
        source,
        intervalMs: opts.watchIntervalMs ?? 1500,
        maxPerTick: opts.watchMaxPerTick ?? 5,
        gmOnly,
        logger: console
      }
    );

    console.log(`[${moduleId}] Import watcher started`);
  });

  Hooks.on("shutdown" as any, () => {
    try {
      _watchHandle?.stop();
      _watchHandle = null;
    } catch {
      // ignore
    }
  });
}

export function stopVaultSyncWatcher() {
  try {
    _watchHandle?.stop();
  } finally {
    _watchHandle = null;
  }
}
