// src/import/normalize.ts

// ---------------------------------------------------------------------------
// Contract types (mirrors src/contract/index.ts - kept local to avoid a
// circular import through the storage layer).
// ---------------------------------------------------------------------------

/** Written to disk by the EXPORT pipeline. */
export type VaultExportEnvelope = {
  type: "export";
  contractVersion: number;
  docType: string;
  uuid?: string;       // optional - uuid may be absent for cross-world imports
  externalId?: string;
  foundry: any;
  exportedAt?: number;
  hash?: string;
};

/**
 * Written to the IMPORT inbox (by vaultapi or external tools).
 * This is the canonical inbox format - type must be "import".
 */
export type VaultImportOp = {
  type: "import";
  contractVersion: number;
  docType: string;
  uuid?: string;
  externalId?: string;
  foundry: any;
  opId: string;
  mode: "upsert" | "patch" | "delete";
  createdAt: number;
};

/** Normalised internal record passed between import handlers. */
export type ExportRecord = {
  docType: string;
  uuid?: string;
  externalId?: string;
  foundry: any;           // always holds the raw Foundry document (matches contract field name)
  meta?: Record<string, any>;
};

// ---------------------------------------------------------------------------
// Doc-type normalisation
// ---------------------------------------------------------------------------

/**
 * Canonicalise doc types to what Foundry v13 actually uses internally.
 */
function normalizeDocType(docType: string, uuid?: string): string {
  if (!docType) return docType;

  // Journal
  if (docType === "JournalPage" || docType === "JournalEntryPage") return "JournalEntryPage";
  if (docType === "JournalEntry") return "JournalEntry";

  // Actor / Item / Chat (straight through)
  if (docType === "Actor") return "Actor";
  if (docType === "Item") return "Item";
  if (docType === "ChatMessage") return "ChatMessage";

  // Trust UUID prefix when docType is ambiguous
  if (uuid) {
    if (uuid.startsWith("Actor.")) return "Actor";
    if (uuid.includes(".JournalEntryPage.")) return "JournalEntryPage";
    if (uuid.includes(".JournalEntry.")) return "JournalEntry";
  }

  return docType;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * VaultImportOp -- the canonical inbox envelope (type: "import").
 * Requires docType and foundry; uuid/externalId are optional.
 */
function looksLikeImportOp(x: any): x is VaultImportOp {
  return (
    x != null &&
    typeof x === "object" &&
    x.type === "import" &&
    typeof x.docType === "string" &&
    x.docType.length > 0 &&
    "foundry" in x
  );
}

/**
 * VaultExportEnvelope -- export snapshot (type: "export").
 * Kept for backward-compat: vaulthero may still send ExportRecords directly.
 * uuid made optional here (the original type required it as string, but
 * cross-world imports may not have a valid UUID).
 */
function looksLikeEnvelope(x: any): x is VaultExportEnvelope {
  return (
    x != null &&
    typeof x === "object" &&
    x.type === "export" &&
    typeof x.docType === "string" &&
    x.docType.length > 0 &&
    "foundry" in x
  );
}

/** Already-normalised internal ExportRecord (has docType + foundry). */
function looksLikeRecord(x: any): x is ExportRecord {
  return (
    x != null &&
    typeof x === "object" &&
    typeof x.docType === "string" &&
    x.docType.length > 0 &&
    "foundry" in x &&
    // must NOT also look like an ImportOp or ExportEnvelope (those are inputs, not already-normalised)
    x.type !== "import" &&
    x.type !== "export"
  );
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toRecordFromImportOp(op: VaultImportOp): ExportRecord {
  const uuid = op.uuid;
  const externalId = op.externalId;
  const docType = normalizeDocType(op.docType, uuid);

  return {
    docType,
    uuid,
    externalId,
    foundry: op.foundry,
    meta: {
      uuid,
      externalId,
      contractVersion: op.contractVersion,
      opId: op.opId,
      mode: op.mode,
      createdAt: op.createdAt,
    },
  };
}

function toRecordFromEnvelope(env: VaultExportEnvelope): ExportRecord {
  const uuid = env.uuid;
  const externalId = env.externalId;
  const docType = normalizeDocType(env.docType, uuid);

  return {
    docType,
    uuid,
    externalId,
    foundry: env.foundry,
    meta: {
      uuid,
      externalId,
      contractVersion: env.contractVersion,
      exportedAt: env.exportedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Public normaliser
// ---------------------------------------------------------------------------

/**
 * Accept any payload shape and return a uniform list of ExportRecords.
 *
 * Priority order:
 *  0) Array           -- recurse each element
 *  1) ExportRecord    -- already normalised, pass through
 *  2) records[]       -- batch of records
 *  3) items[]         -- manifest batch
 *  4) ImportOp        -- canonical inbox format (type: "import")  <- NEW
 *  5) ExportEnvelope  -- legacy / direct vaulthero send (type: "export")
 *  6) .record wrapper -- nested single record
 */
export function normalizeImportPayload(payload: any): ExportRecord[] {
  if (!payload) return [];

  // 0) Array of mixed items
  if (Array.isArray(payload)) {
    return payload.flatMap(normalizeImportPayload);
  }

  // 1) Already normalised single record (has docType + foundry, not an ImportOp or ExportEnvelope)
  if (looksLikeRecord(payload)) {
    const uuid = payload.uuid ?? payload.meta?.uuid;
    const externalId = payload.externalId ?? payload.meta?.externalId;
    const docType = normalizeDocType(payload.docType, uuid);
    return [
      {
        ...payload,
        docType,
        uuid,
        externalId,
        meta: { ...(payload.meta ?? {}), uuid, externalId },
      },
    ];
  }

  // 2) Batch: records[]
  if (Array.isArray(payload.records)) {
    return payload.records.flatMap(normalizeImportPayload);
  }

  // 3) Batch: items[]
  if (Array.isArray(payload.items)) {
    return payload.items.flatMap(normalizeImportPayload);
  }

  // 4) Canonical ImportOp envelope (type: "import") -- written by vaultapi
  if (looksLikeImportOp(payload)) {
    return [toRecordFromImportOp(payload)];
  }

  // 5) Legacy ExportRecord envelope (type: "export") -- direct send from vaulthero
  if (looksLikeEnvelope(payload)) {
    return [toRecordFromEnvelope(payload)];
  }

  // 6) Nested single-record wrapper
  if (payload.record) return normalizeImportPayload(payload.record);

  return [];
}