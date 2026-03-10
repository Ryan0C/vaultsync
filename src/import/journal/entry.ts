import type { ExportRecord } from "../../contract";
import { getExternalId, safeFromUuid, findEntryByExternalId, withExternalIdFlag } from "./resolve";

export interface ApplyJournalImportOptions {
  debug?: boolean;
}

export async function applyJournalEntryImport(record: ExportRecord, opts: ApplyJournalImportOptions = {}) {
  const debug = opts.debug ?? true;

  const uuid = record.uuid;
  const externalId = getExternalId(record);

  let existing = await safeFromUuid(uuid);
  if (!existing && externalId) existing = findEntryByExternalId(externalId);

  const data: any = { ...((record.foundry as any) ?? {}) };
  delete data._id;
  withExternalIdFlag(data, externalId);

  if (existing) {
    if (debug) console.log("[vault-sync] import JournalEntry update", existing.id);
    await existing.update(data, { diff: false, recursive: false });
    return { ok: true, action: "updated", docType: "JournalEntry", id: existing.id, uuid: existing.uuid };
  } else {
    if (debug) console.log("[vault-sync] import JournalEntry create", data.name ?? "(unnamed)");
    const created = await (JournalEntry as any).create(data, { renderSheet: false });
    return { ok: true, action: "created", docType: "JournalEntry", id: created.id, uuid: created.uuid };
  }
}