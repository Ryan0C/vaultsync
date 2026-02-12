// src/vault/chat_manifest.ts
import { ensureFolder, writeJson } from "../../io/fs";
import { vaultDir } from "../../paths";
import { debounce } from "../../io/debounce";

type Ops = { create: number; update: number; delete: number };

type ShardKey = string; // "YYYY-MM-DD/HH"

type ShardState = {
  day: string;
  hour: string;
  startTs: number;
  endTs: number;
  count: number;
  ops: Ops;
};

const shards = new Map<ShardKey, ShardState>();

function dayHourStamp(ts: number): { day: string; hour: string } {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  return { day: `${yyyy}-${mm}-${dd}`, hour: hh };
}

export function noteChatEvent(op: "create" | "update" | "delete", ts: number) {
  const { day, hour } = dayHourStamp(ts);
  const key = `${day}/${hour}`;

  const cur = shards.get(key);
  if (!cur) {
    shards.set(key, {
      day,
      hour,
      startTs: ts,
      endTs: ts,
      count: 1,
      ops: { create: op === "create" ? 1 : 0, update: op === "update" ? 1 : 0, delete: op === "delete" ? 1 : 0 }
    });
  } else {
    cur.startTs = Math.min(cur.startTs, ts);
    cur.endTs = Math.max(cur.endTs, ts);
    cur.count += 1;
    cur.ops[op] += 1;
  }

  // Debounced flush per shard
  debounce(`chat-manifest:${key}`, 1000, async () => flushShard(key));
}

async function flushShard(key: string) {
  const s = shards.get(key);
  if (!s) return;

  const dir = `${vaultDir("chat")}/manifests/${s.day}`;
  await ensureFolder(dir);

  await writeJson(`${dir}/${s.hour}.json`, {
    ...s,
    generatedAt: new Date().toISOString()
  });
}