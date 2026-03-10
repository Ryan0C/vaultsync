/**
 * runtime/socket.ts
 * Minimal request/response socket wiring (v13).
 *
 * Purpose:
 *  - Allow client UI to request server/GM actions (export, import, status).
 *  - Keep it tiny and explicit.
 *
 * Notes:
 *  - Foundry socket messages are broadcast; we implement a simple requestId + response.
 *  - By default, only the GM will act on requests (server authority).
 */

export interface RegisterSocketOptions {
  moduleId: string;
}

type VaultSyncSocketMessage =
  | {
      kind: "request";
      requestId: string;
      fromUserId: string;
      action: VaultSyncAction;
      payload?: any;
    }
  | {
      kind: "response";
      requestId: string;
      toUserId: string;
      ok: boolean;
      result?: any;
      error?: string;
    };

export type VaultSyncAction =
  | "ping"
  | "status";

function socketChannel(moduleId: string) {
  return `module.${moduleId}`;
}

const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: any) => void; timeout: number }
>();

export function registerVaultSyncSocket(opts: RegisterSocketOptions) {
  const { moduleId } = opts;
  const channel = socketChannel(moduleId);

  Hooks.once("ready", () => {
    game.socket!.on(channel, async (msg: VaultSyncSocketMessage) => {
      try {
        if (!msg || typeof msg !== "object") return;

        // Handle responses for awaiting callers
        if (msg.kind === "response") {
          const waiter = pending.get(msg.requestId);
          if (!waiter) return;
          if (game.user?.id !== msg.toUserId) return;

          window.clearTimeout(waiter.timeout);
          pending.delete(msg.requestId);

          if (msg.ok) waiter.resolve(msg.result);
          else waiter.reject(new Error(msg.error ?? "VaultSync request failed"));
          return;
        }

        // Handle requests (GM/server authority)
        if (msg.kind === "request") {
          const isGM = !!game.user?.isGM;
          if (!isGM) return; // only GM processes

          const result = await handleRequest(moduleId, msg.action, msg.payload);

          // Respond directly to requester
          const response: VaultSyncSocketMessage = {
            kind: "response",
            requestId: msg.requestId,
            toUserId: msg.fromUserId,
            ok: true,
            result
          };
          game.socket!.emit(channel, response);
        }
      } catch (err: any) {
        // If request handling fails, try to respond with an error (GM side)
        if (msg?.kind === "request" && game.user?.isGM) {
          const response: VaultSyncSocketMessage = {
            kind: "response",
            requestId: msg.requestId,
            toUserId: msg.fromUserId,
            ok: false,
            error: String(err?.message ?? err)
          };
          game.socket!.emit(channel, response);
        }
      }
    });
  });
}

/**
 * Client helper: call the GM/server and await a response.
 */
export function callVaultSyncServer<T = any>(
  moduleId: string,
  action: VaultSyncAction,
  payload?: any,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const channel = socketChannel(moduleId);
  const requestId = crypto.randomUUID();
  const fromUserId = game.user?.id ?? "unknown";

  const timeoutMs = opts?.timeoutMs ?? 10_000;

  const msg: VaultSyncSocketMessage = {
    kind: "request",
    requestId,
    fromUserId,
    action,
    payload
  };

  const p = new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`VaultSync request timed out (${action})`));
    }, timeoutMs);

    pending.set(requestId, { resolve, reject, timeout });
  });

  game.socket!.emit(channel, msg);
  return p;
}

/* -------------------------------------------------------------------------- */
/*                             Request Handling                               */
/* -------------------------------------------------------------------------- */

async function handleRequest(moduleId: string, action: VaultSyncAction, payload?: any) {
  switch (action) {
    case "ping":
      return { pong: true, moduleId, at: Date.now() };

    case "status":
      return {
        moduleId,
        userId: game.user?.id,
        isGM: game.user?.isGM ?? false,
        worldId: (game as any)?.world?.id
      };

    default:
      throw new Error(`Unknown VaultSync action: ${String(action)}`);
  }
}