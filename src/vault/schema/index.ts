/**
 * Vault Sync — Models
 * -------------------
 * Purpose:
 *  - Shared TypeScript types describing the JSON shapes written into the Vault
 *    and/or returned by the vault-api.
 *
 * Design goals:
 *  - Stable, portable, system-agnostic payloads.
 *  - Keep "licensed" or SRD-restricted content out of raw blobs where possible.
 *    Prefer references (ids, compendium keys, UUIDs) over full data dumps.
 */

/***********************
 * Primitive Aliases
 ***********************/

/**
 * ISO 8601 timestamp string.
 * Example: "2026-02-11T23:41:12.123Z"
 *
 * NOTE:
 *  - This is a type alias only (no runtime validation).
 *  - All vault timestamps must be UTC ISO strings.
 */
export type IsoDateString = string;

/** Readability aliases (no runtime branding) */
export type VaultId = string;
export type WorldId = string;

/**
 * Revision for optimistic concurrency / cache invalidation.
 * Start with number; allow string later (etag/hash) without breaking callers.
 */
export type VaultRevision = number | string;

/**
 * Common metadata every vault-backed entity should have.
 */
export interface VaultEntityBase {
  /** Stable vault identifier (often Foundry document id, but not required). */
  vaultId: VaultId;

  /** Foundry system id, e.g. "dnd5e". */
  system: string;

  /** Monotonic revision or content hash/etag. */
  revision: VaultRevision;

  /** Last time this entity was written/updated in the vault. */
  updatedAt: IsoDateString;
}

/**
 * Minimal listing shape for browsing/lookup endpoints.
 */
export interface VaultActorSummary extends VaultEntityBase {
  name: string;
}

/**
 * Full actor record stored in the vault.
 * `TData` lets you strongly-type actor payloads per-system if you want.
 */
export interface VaultActor<TData = Record<string, unknown>> extends VaultActorSummary {
  /**
   * Portable actor payload you define.
   * Keep licensed content as references, not blobs.
   */
  data: TData;

  /**
   * Optional: include the originating Foundry document id separately if you ever
   * decouple `vaultId` from Foundry ids.
   */
  foundryId?: string;

  /**
   * Optional: world provenance if you ever aggregate multiple worlds into one vault root.
   */
  worldId?: WorldId;
}

/**
 * Token response shape used by vault-api auth.
 */
export interface VaultAuthTokenResponse {
  token: string;
  /** ISO timestamp when token expires (if tokens expire). */
  expiresAt?: IsoDateString;
}