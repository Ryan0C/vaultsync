/**
 * Vault Sync — Import Bridge (Runtime)
 * -----------------------------------
 * Purpose:
 *  - Provide a GM-only socket bridge for applying imports.
 *  - Other clients/modules can request an import, but only a GM executes it.
 */

import { MODULE_ID } from "../../constants";
import { logger } from "../../logger";
import type { ImportMode } from "../import";
import { importActorIntoExisting, importActorAsNew } from "../import";
import type { ApplyActorImportOptions } from "../import/apply/actor";

type ImportActorRequest = {
  t: "import.actor";
  requestId: string;
  userId: string;

  mode: ImportMode;
  actorId?: string;
  create?: boolean;

  payload: any;
  opts?: ApplyActorImportOptions;
};

type ImportActorResponse = {
  t: "import.actor.result";
  requestId: string;

  /** Who should consume this response */
  targetUserId: string;

  ok: boolean;
  error?: string;

  actorId?: string;
  created?: boolean;
};

type ImportBridgeMessage = ImportActorRequest | ImportActorResponse;

function socketChannel() {
  return `module.${MODULE_ID}`;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Deterministically choose a single GM to handle requests.
 * (Avoids multiple GMs processing the same message.)
 */
function isPrimaryGM(): boolean {
  const me = game.user;
  if (!me?.isGM) return false;

  const activeGMs = game.users
    .filter(u => u.active && u.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0]?.id === me.id;
}

let bridgeRegistered = false;

/**
 * Register the GM listener that actually executes imports.
 * Call this once on "ready".
 */
export function registerImportBridge() {
  const channel = socketChannel();

  if (!game.user?.isGM) {
    logger.info("import bridge: not GM, listener not registered");
    return;
  }

  if (!isPrimaryGM()) {
    logger.info("import bridge: GM but not primary, listener not registered");
    return;
  }

  if (bridgeRegistered) {
    logger.warn("import bridge: already registered, skipping");
    return;
  }
  bridgeRegistered = true;

  logger.info("import bridge: primary GM listener registered");

  game.socket.on(channel, async (msg: ImportBridgeMessage) => {
    try {
      if (!msg || typeof msg !== "object") return;
      if (msg.t !== "import.actor") return;

      // Basic validation
      if (!msg.requestId || !msg.userId) return;

      // Optional payload size guard (avoid huge socket packets)
      try {
        const bytes = JSON.stringify(msg.payload ?? null).length;
        const MAX = 1_000_000; // ~1MB string; tune as needed
        if (bytes > MAX) {
          const res: ImportActorResponse = {
            t: "import.actor.result",
            requestId: msg.requestId,
            targetUserId: msg.userId,
            ok: false,
            error: `Import payload too large for socket (${bytes} bytes). Use a server-side fetch (vault-api) or shrink payload.`
          };
          game.socket.emit(channel, res);
          return;
        }
      } catch {
        // If stringify fails, let apply handle it / error out.
      }

      const mode: ImportMode = msg.mode ?? "merge";

      const result = msg.create
        ? await importActorAsNew(msg.payload, mode, msg.opts)
        : msg.actorId
          ? await importActorIntoExisting(msg.actorId, msg.payload, mode, msg.opts)
          : ({ ok: false, error: "Missing actorId (or set create=true)" } as const);

      const res: ImportActorResponse = result.ok
        ? {
            t: "import.actor.result",
            requestId: msg.requestId,
            targetUserId: msg.userId,
            ok: true,
            actorId: result.actor.id!,
            created: result.created
          }
        : {
            t: "import.actor.result",
            requestId: msg.requestId,
            targetUserId: msg.userId,
            ok: false,
            error: result.error
          };

      game.socket.emit(channel, res);
    } catch (err) {
      logger.error("import bridge: handler error", err);
    }
  });
}

/**
 * Client-side helper:
 *  - If GM => executes immediately.
 *  - If not GM => sends a request over socket and waits for GM response.
 */
export async function requestActorImport(args: {
  payload: any;
  mode?: ImportMode;
  actorId?: string;
  create?: boolean;
  opts?: ApplyActorImportOptions;
  timeoutMs?: number;
}): Promise<{ ok: true; actorId: string; created: boolean } | { ok: false; error: string }> {
  const user = game.user;
  if (!user) return { ok: false, error: "No active user." };

  const mode: ImportMode = args.mode ?? "merge";

  // If GM, just do it directly.
  if (user.isGM) {
    const res = args.create
      ? await importActorAsNew(args.payload, mode, args.opts)
      : args.actorId
        ? await importActorIntoExisting(args.actorId, args.payload, mode, args.opts)
        : ({ ok: false, error: "Missing actorId (or set create=true)" } as const);

    return res.ok
      ? { ok: true, actorId: res.actor.id!, created: res.created }
      : { ok: false, error: res.error };
  }

  // Non-GM: request GM to do it.
  const requestId = uid();
  const channel = socketChannel();
  const timeoutMs = args.timeoutMs ?? 15_000;

  return new Promise((resolve) => {
    let done = false;

    const onMessage = (msg: ImportBridgeMessage) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.t !== "import.actor.result") return;
      if (msg.requestId !== requestId) return;
      if ((msg as ImportActorResponse).targetUserId !== user.id) return;

      done = true;
      game.socket.off(channel, onMessage);

      if (msg.ok && msg.actorId) resolve({ ok: true, actorId: msg.actorId, created: !!msg.created });
      else resolve({ ok: false, error: msg.error ?? "Import failed." });
    };

    game.socket.on(channel, onMessage);

    const req: ImportActorRequest = {
      t: "import.actor",
      requestId,
      userId: user.id!,
      mode,
      actorId: args.actorId,
      create: !!args.create,
      payload: args.payload,
      opts: args.opts
    };

    game.socket.emit(channel, req);

    window.setTimeout(() => {
      if (done) return;
      game.socket.off(channel, onMessage);
      resolve({ ok: false, error: "Timed out waiting for GM to apply import." });
    }, timeoutMs);
  });
}