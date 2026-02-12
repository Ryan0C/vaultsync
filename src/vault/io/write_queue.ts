/**
 * Vault Sync — Write Queue (Multi-Lane)
 * -------------------------------------
 * Purpose:
 *  - Serialize vault writes to avoid bursty concurrent FilePicker operations.
 *  - Prevent race conditions (folder creation + rapid uploads) by enforcing ordering.
 *
 * Design:
 *  - Multiple independent FIFO lanes (Promise chains), keyed by lane name.
 *  - Tasks within a lane run sequentially in enqueue order.
 *  - Different lanes may run concurrently (best-effort).
 *
 * Notes:
 *  - If a task fails, that lane continues (we swallow in the chain and rethrow to caller).
 *  - Lanes auto-clean when idle to avoid unbounded memory growth.
 */

/* -------------------------------------------- */
/*  Lane Definitions (Single Source of Truth)   */
/* -------------------------------------------- */

/**
 * Explicit lane names used throughout vault-sync.
 * Add new lanes here intentionally.
 */
export type WriteLane =
  | "default"
  | "folders"
  | "meta"
  | "actors"
  | "manifests"
  | "chat";

/**
 * Optional exported constants to avoid magic strings everywhere.
 */
export const WRITE_LANES: Record<WriteLane, WriteLane> = {
  default: "default",
  folders: "folders",
  meta: "meta",
  actors: "actors",
  manifests: "manifests",
  chat: "chat"
};

/* -------------------------------------------- */
/*  Internal State                              */
/* -------------------------------------------- */

const lanes = new Map<WriteLane, Promise<void>>();

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Enqueue a write task in a specific lane.
 *
 * Examples:
 *   enqueueWrite(() => writeActorsManifest());
 *   enqueueWrite(() => appendChatEvent(...), "chat");
 *   enqueueWrite(() => writeActorFile(actor), "actors");
 */
export function enqueueWrite<T>(
  fn: () => Promise<T>,
  lane: WriteLane = "default"
): Promise<T> {
  const prev = lanes.get(lane) ?? Promise.resolve();

  let resolveOut!: (value: T) => void;
  let rejectOut!: (reason?: unknown) => void;

  const out = new Promise<T>((resolve, reject) => {
    resolveOut = resolve;
    rejectOut = reject;
  });

  const next: Promise<void> = prev
    .catch(() => {
      // Swallow prior failure so the lane keeps moving.
    })
    .then(async () => {
      try {
        const result = await fn();
        resolveOut(result);
      } catch (err) {
        rejectOut(err);
      }
    })
    .finally(() => {
      // Auto-clean: only remove if we're still the tail for this lane.
      if (lanes.get(lane) === next) lanes.delete(lane);
    });

  lanes.set(lane, next);
  return out;
}

/**
 * Convenience helper to derive a lane from a vault file path.
 * Keeps routing logic centralized and consistent.
 */
export function laneForPath(filePath: string): WriteLane {
  const p = `/${filePath}`;

  if (p.includes("/chat/")) return "chat";
  if (p.includes("/actors/")) return "actors";
  if (p.includes("/manifests/")) return "manifests";
  if (p.includes("/meta/")) return "meta";

  return "default";
}