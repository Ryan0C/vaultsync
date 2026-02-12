/**
 * Vault Sync — Paths
 * ------------------
 * Purpose:
 *  - Centralize how we compute “where” vault data is stored inside Foundry’s
 *    `data` filesystem, so every writer/reader uses the same canonical paths.
 *
 * How it’s used:
 *  - All vault writes go under: `${vaultRoot()}/worlds/${worldId()}/*`
 *  - `vaultRoot()` is a world setting (default: "vault")
 *  - `worldId()` is either the optional override (for stable external sync),
 *    or the current Foundry `game.world.id`.
 *
 * Notes:
 *  - Paths are always relative to Foundry’s `data` source root.
 *  - If you later support multiple sources (s3, etc), keep the *path* logic here
 *    and vary the file adapter elsewhere.
 */

import { MODULE_ID } from "../../constants";

/** Root folder inside Foundry "data" filesystem (relative path). */
export function vaultRoot(): string {
  return (game.settings.get(MODULE_ID, "vaultRoot") as string) || "vault";
}

/**
 * The id used for vault pathing.
 * Override lets you keep a stable ID even if you rename/clone worlds.
 */
export function worldId(): string {
  const override = (game.settings.get(MODULE_ID, "worldIdOverride") as string) || "";
  return override.trim() || game.world.id;
}

/** Canonical world root folder for all vault data for this world. */
export function vaultWorldRoot(): string {
  return `${vaultRoot()}/worlds/${worldId()}`;
}

/** Top-level vault subfolders we manage. */
export type VaultKind = "actors" | "chat" | "meta" | "manifests";

/** Returns the directory path for a given vault folder kind. */
export function vaultDir(kind: VaultKind): string {
  return `${vaultWorldRoot()}/${kind}`;
}

/** Convenience accessors used throughout the writers. */
export const actorsDir = (): string => vaultDir("actors");
export const chatDir = (): string => vaultDir("chat");
export const metaDir = (): string => vaultDir("meta");
export const manifestsDir = (): string => vaultDir("manifests");