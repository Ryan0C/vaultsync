import { writeJson, deleteFile, ensureFolder } from "../../io/fs";
import { vaultDir } from "../../paths";
import { serializeChatMessage } from "../serialize/chat";
import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../../constants";
import { noteChatEvent } from "./chat_manifest";
import { safeId  } from "./utils";
/* -------------------------------------------- */
/*  Utilities                                   */
/* -------------------------------------------- */

function dayStamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function hourStamp(ts: number): string {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0"); // "00".."23"
}


function msgTimestamp(msg: ChatMessage): number {
  const doc = msg.toObject() as any;
  return (doc?.timestamp as number) ?? Date.now();
}

/* -------------------------------------------- */
/*  Chat Event Stream                           */
/* -------------------------------------------- */

type ChatEvent =
  | { op: "create"; ts: number; id: string; message: ReturnType<typeof serializeChatMessage> }
  | { op: "update"; ts: number; id: string; message: ReturnType<typeof serializeChatMessage> }
  | { op: "delete"; ts: number; id: string };

/**
 * Writes a single chat event as one file:
 *   chat/events/YYYY-MM-DD/HH/<ts>-<op>-<id>.json
 */
async function writeChatEventFile(evt: ChatEvent) {
  const ts = evt.ts ?? Date.now();
  const dir = `${vaultDir("chat")}/events/${dayStamp(ts)}/${hourStamp(ts)}`;
  await ensureFolder(dir);

  // If two events somehow share the exact same ts for the same id/op,
  // the later one would overwrite. If that worries you, add a short random suffix.
  const filename = `${ts}-${evt.op}-${safeId(evt.id)}.json`;
  await writeJson(`${dir}/${filename}`, evt);
  noteChatEvent(evt.op, ts);
}

export async function appendChatCreate(msg: ChatMessage) {
  const ts = msgTimestamp(msg);
  await writeChatEventFile({
    op: "create",
    ts,
    id: msg.id!,
    message: serializeChatMessage(msg)
  });
}

export async function appendChatUpdate(msg: ChatMessage) {
  // record update time, not original message timestamp
  const ts = Date.now();
  await writeChatEventFile({
    op: "update",
    ts,
    id: msg.id!,
    message: serializeChatMessage(msg)
  });
}

export async function appendChatDelete(messageId: string, ts = Date.now()) {
  await writeChatEventFile({
    op: "delete",
    ts,
    id: messageId
  });
}

/**
 * Backfill recent persisted chat messages as "create" events using a cursor.
 * Stores cursor in setting: chatLastExportedTs
 */
export async function backfillChat() {
  const lastTs = (game.settings.get(MODULE_ID, "chatLastExportedTs") as number) || 0;
  const limit = (game.settings.get(MODULE_ID, "chatBackfillLimit") as number) || 250;

  const msgs = game.messages?.contents ?? [];
  const recent = msgs.slice(-limit);

  const pending = recent
    .map((m) => ({ m, ts: ((m.toObject() as any)?.timestamp ?? 0) as number }))
    .filter(({ ts }) => ts > lastTs)
    .sort((a, b) => a.ts - b.ts);

  let maxTs = lastTs;

  for (const { m, ts } of pending) {
    await writeChatEventFile({
      op: "create",
      ts,
      id: m.id!,
      message: serializeChatMessage(m)
    });
    if (ts > maxTs) maxTs = ts;
  }

  if (maxTs > lastTs) {
    await game.settings.set(MODULE_ID, "chatLastExportedTs", maxTs);
  }
}