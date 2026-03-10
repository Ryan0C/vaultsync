import type { ExportRecord } from "../../contract";
import { MODULE_ID } from "../../constants";

const FLAG_KEY = "externalId";

export function getExternalId(record: ExportRecord): string | undefined {
  return record?.externalId ?? (record?.foundry as any)?.flags?.[MODULE_ID]?.[FLAG_KEY];
}

export async function safeFromUuid(uuid?: string): Promise<any | null> {
  if (!uuid) return null;
  try {
    return (await fromUuid(uuid)) as any;
  } catch {
    return null;
  }
}

export function findEntryByExternalId(externalId: string): any | null {
  const entries = game.journal?.contents ?? [];
  return entries.find((e: any) => e?.getFlag?.(MODULE_ID, FLAG_KEY) === externalId) ?? null;
}

export function findPageByExternalId(externalId: string): any | null {
  const entries = game.journal?.contents ?? [];
  for (const e of entries) {
    const pages = e?.pages?.contents ?? [];
    const hit = pages.find((p: any) => p?.getFlag?.(MODULE_ID, FLAG_KEY) === externalId);
    if (hit) return hit;
  }
  return null;
}

function parentEntryUuidFromPageUuid(pageUuid?: string): string | null {
  // JournalEntry.<EID>.JournalEntryPage.<PID>
  if (!pageUuid) return null;
  const marker = ".JournalEntryPage.";
  const idx = pageUuid.indexOf(marker);
  if (idx === -1) return null;
  return pageUuid.slice(0, idx);
}

export async function resolveParentEntryForPage(record: ExportRecord): Promise<any | null> {
  const pageUuid = record?.uuid;
  const entryUuid = parentEntryUuidFromPageUuid(pageUuid);
  if (entryUuid) {
    const parent = await safeFromUuid(entryUuid);
    if (parent?.documentName === "JournalEntry") return parent;
  }

  const data: any = (record.foundry as any) ?? {};
  const parentId =
    data?.journalEntryId ??
    data?.entryId ??
    data?.parent?._id ??
    data?.parent ??
    null;

  if (typeof parentId === "string") {
    const parent = game.journal?.get(parentId) ?? null;
    if (parent) return parent;
  }

  return null;
}

export function withExternalIdFlag(data: any, externalId?: string) {
  if (!externalId) return data;
  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
  data.flags[MODULE_ID][FLAG_KEY] = externalId;
  return data;
}