// src/import/item/resolve.ts
import type { ExportRecord } from "../../contract";
import { MODULE_ID } from "../../constants";

const FLAG_KEY = "externalId";

export function getExternalId(record: ExportRecord): string | undefined {
  return (
    record?.externalId ??
    (record?.foundry as any)?.flags?.[MODULE_ID]?.[FLAG_KEY]
  );
}

export async function safeFromUuid(uuid?: string): Promise<any | null> {
  if (!uuid) return null;
  try {
    return (await fromUuid(uuid)) as any;
  } catch {
    return null;
  }
}

export function findItemByExternalId(externalId: string): any | null {
  const items = game.items?.contents ?? [];
  return (
    items.find((i: any) => i?.getFlag?.(MODULE_ID, FLAG_KEY) === externalId) ?? null
  );
}

export function withExternalIdFlag(target: any, externalId?: string) {
  if (!externalId) return;
  target.flags = target.flags ?? {};
  target.flags[MODULE_ID] = target.flags[MODULE_ID] ?? {};
  target.flags[MODULE_ID][FLAG_KEY] = externalId;
}
