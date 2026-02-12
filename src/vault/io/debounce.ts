// src/vault/debounce.ts
/**
 * Vault Sync — Debounce Helpers
 * ------------------------------
 * Debounces async work by key. Used to coalesce rapid bursts of Foundry events
 * into fewer writes (e.g., manifest rebuilds).
 */
import { logger } from "../../logger";
const timers = new Map<string, number>();

export function debounce(key: string, ms: number, fn: () => Promise<void>) {
  const prev = timers.get(key);
  if (prev) window.clearTimeout(prev);

  const t = window.setTimeout(() => {
    timers.delete(key);
    void fn().catch((err) => logger.error("VaultSync debounced task failed:", key, err));
  }, ms);

  timers.set(key, t);
}