/**
 * export/chat/index.ts
 * ChatMessage export (Foundry v13).
 *
 * Output folder (world-scoped):
 *  - exports/chat/
 */

import { createExportRecord } from "../../contract";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { writeJsonVersioned } from "../../storage/json";
import { MODULE_ID } from "../../constants";

export interface ExportChatOptions {
  source?: "data";
}

export async function exportChatMessage(
  msg: any,
  opts: ExportChatOptions = {}
): Promise<{ chatFile?: string | null }> {
  const source = opts.source ?? "data";

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();
  const chatDir = `${paths.exports}/chat`;

  const foundryObj = msg?.toObject ? msg.toObject() : msg;
  const uuid = msg?.uuid;
  const externalId =
    msg?.getFlag?.(MODULE_ID, "externalId") ??
    msg?.flags?.[MODULE_ID]?.externalId;

  const record = createExportRecord("ChatMessage", foundryObj, { uuid, externalId });
  const baseName = `chat.${msg?.id ?? "unknown"}`;
  const chatFile = await writeJsonVersioned(chatDir, baseName, record, source);

  return { chatFile };
}
