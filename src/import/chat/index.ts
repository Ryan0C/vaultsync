// src/import/chat/index.ts
import type { ExportRecord } from "../../contract";
import { MODULE_ID } from "../../constants";
import { exportChatMessage } from "../../export/chat";

export async function applyChatMessageImport(record: ExportRecord) {
  const rawIncoming = (record.foundry as any) ?? {};
  const incoming: any = { ...rawIncoming };

  // Strip id so Foundry assigns a new one
  delete incoming._id;

  // Stamp externalId flag
  if (record.externalId) {
    incoming.flags = incoming.flags ?? {};
    incoming.flags[MODULE_ID] = incoming.flags[MODULE_ID] ?? {};
    incoming.flags[MODULE_ID].externalId = record.externalId;
  }

  console.log(
    `[${MODULE_ID}] Import ChatMessage create`,
    incoming.content?.slice(0, 80)
  );

  const msg = await (ChatMessage as any).create(incoming, { renderSheet: false });

  // Import runs under hook suppression (withSuppressedHooks in import/index.ts),
  // so the createChatMessage hook never fires and the message is never exported
  // automatically. Export explicitly so VaultAPI's tick can pick it up and
  // the originating VaultHero client sees the confirmed Foundry message.
  if (msg) {
    try {
      await exportChatMessage(msg, { source: "data" });
    } catch (err) {
      console.warn(`[${MODULE_ID}] applyChatMessageImport: post-import export failed`, err);
    }
  }

  return {
    ok: true,
    action: "created" as const,
    docType: "ChatMessage",
    id: msg?.id,
    uuid: msg?.uuid
  };
}
