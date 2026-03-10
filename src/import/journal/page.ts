import type { ExportRecord } from "../../contract";
import {
  getExternalId,
  safeFromUuid,
  findPageByExternalId,
  resolveParentEntryForPage,
  withExternalIdFlag
} from "./resolve";

export interface ApplyJournalImportOptions {
  debug?: boolean;
}

export async function applyJournalEntryPageImport(record: ExportRecord, opts: ApplyJournalImportOptions = {}) {
  const debug = opts.debug ?? true;

  const uuid = record.uuid;
  const externalId = getExternalId(record);

  let existing = await safeFromUuid(uuid);
  if (!existing && externalId) existing = findPageByExternalId(externalId);

  const parent = existing?.parent ?? (await resolveParentEntryForPage(record));
  if (!parent) return { ok: false, reason: "missing-parent-entry" };

  const data: any = { ...((record.foundry as any) ?? {}) };
  delete data._id;
  withExternalIdFlag(data, externalId);

  if (existing) {
    if (debug) console.log("[vault-sync] import JournalEntryPage update", existing.id);
    await existing.update(data, { diff: false, recursive: false });
    return { ok: true, action: "updated", docType: "JournalEntryPage", id: existing.id, uuid: existing.uuid, parentId: parent.id };
  } else {
    if (debug) console.log("[vault-sync] import JournalEntryPage create under", parent.id);
    const created = await parent.createEmbeddedDocuments("JournalEntryPage", [data], { render: false });
    const page = created?.[0];
    return { ok: true, action: "created", docType: "JournalEntryPage", id: page?.id, uuid: page?.uuid, parentId: parent.id };
  }
}