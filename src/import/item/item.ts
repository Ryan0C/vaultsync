// src/import/item/item.ts
import type { ExportRecord } from "../../contract";
import { MODULE_ID } from "../../constants";
import { sanitizeFoundryItemDoc } from "./sanitize";
import {
  getExternalId,
  safeFromUuid,
  findItemByExternalId,
  withExternalIdFlag
} from "./resolve";

export async function applyItemImport(record: ExportRecord) {
  const uuid = record.uuid;
  const externalId = getExternalId(record);

  let existing = await safeFromUuid(uuid);
  if (!existing && externalId) existing = findItemByExternalId(externalId);

  const rawIncoming = (record.foundry as any) ?? {};
  const incoming = sanitizeFoundryItemDoc(rawIncoming);

  withExternalIdFlag(incoming, externalId);

  let item;

  if (existing) {
    console.log(`[${MODULE_ID}] Import Item update`, existing.id);
    await existing.update(incoming, { diff: false, recursive: false });
    item = existing;
  } else {
    console.log(`[${MODULE_ID}] Import Item create`, incoming.name ?? "(unnamed)");
    item = await (Item as any).create(incoming, { renderSheet: false });
  }

  return {
    ok: true,
    action: existing ? "updated" : "created",
    docType: "Item",
    id: item?.id,
    uuid: item?.uuid
  };
}
