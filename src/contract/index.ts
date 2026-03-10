/**
 * VaultSync Contract v1
 *
 * This defines the envelope format for:
 *  - Exported records (written to disk)
 *  - Import operations (read from disk and applied)
 *
 * IMPORTANT:
 *  - `foundry` contains RAW Foundry document data (no translation).
 *  - This file must remain framework-agnostic.
 */

export const VAULTSYNC_CONTRACT_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/*                                  Shared                                    */
/* -------------------------------------------------------------------------- */

export type VaultSyncDocType =
  | "JournalEntry"
  | "JournalPage"
  | "Actor"
  | "Item"
  | "RollTable"
  | "Scene"
  | "ChatMessage"
  | string; // allow future extension without breaking typing

export type VaultSyncMode = "upsert" | "patch" | "delete";

/**
 * Base envelope shared by exports and imports.
 */
export interface VaultSyncEnvelopeBase {
  contractVersion: typeof VAULTSYNC_CONTRACT_VERSION;

  /**
   * Foundry document type (e.g. "JournalPage").
   */
  docType: VaultSyncDocType;

  /**
   * UUID at time of export (may not exist in target world).
   */
  uuid?: string;

  /**
   * Stable cross-instance identifier.
   * Recommended to be stored in flags.vaulthero.externalId
   */
  externalId?: string;

  /**
   * Raw Foundry document data or patch.
   * This MUST match Foundry's native structure.
   */
  foundry?: unknown;
}

/* -------------------------------------------------------------------------- */
/*                                  Export                                    */
/* -------------------------------------------------------------------------- */

/**
 * Written to disk by the export pipeline.
 * Represents a snapshot of a document.
 */
export interface ExportRecord extends VaultSyncEnvelopeBase {
  type: "export";

  /**
   * Timestamp (ms since epoch).
   */
  exportedAt: number;

  /**
   * Optional lightweight integrity hash.
   * Useful later for change detection.
   */
  hash?: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Import                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read from disk and applied to Foundry.
 */
export interface ImportOp extends VaultSyncEnvelopeBase {
  type: "import";

  /**
   * Unique operation id.
   * Used for idempotency (safe retries).
   */
  opId: string;

  /**
   * How the import should be applied.
   */
  mode: VaultSyncMode;

  /**
   * Timestamp of when the op was created.
   */
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*                              Type Guards                                    */
/* -------------------------------------------------------------------------- */

export function isExportRecord(value: unknown): value is ExportRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).type === "export"
  );
}

export function isImportOp(value: unknown): value is ImportOp {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).type === "import"
  );
}

/* -------------------------------------------------------------------------- */
/*                           Factory Helpers (Optional)                       */
/* -------------------------------------------------------------------------- */

export function createExportRecord(
  docType: VaultSyncDocType,
  foundry: unknown,
  options?: {
    uuid?: string;
    externalId?: string;
    hash?: string;
  }
): ExportRecord {
  return {
    type: "export",
    contractVersion: VAULTSYNC_CONTRACT_VERSION,
    docType,
    uuid: options?.uuid,
    externalId: options?.externalId,
    foundry,
    exportedAt: Date.now(),
    hash: options?.hash,
  };
}

export function createImportOp(
  docType: VaultSyncDocType,
  mode: VaultSyncMode,
  foundry?: unknown,
  options?: {
    uuid?: string;
    externalId?: string;
    opId?: string;
  }
): ImportOp {
  return {
    type: "import",
    contractVersion: VAULTSYNC_CONTRACT_VERSION,
    docType,
    uuid: options?.uuid,
    externalId: options?.externalId,
    foundry,
    opId: options?.opId ?? crypto.randomUUID(),
    mode,
    createdAt: Date.now(),
  };
}