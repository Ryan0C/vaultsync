export function decodeTargetFromMarker(markerName: string): string | null {
  const name = String(markerName);
  if (!name.endsWith(".done.json")) return null;

  const stripped = name.slice(0, -".done.json".length);
  const parts = stripped.split(".");
  if (parts.length < 3) return null;

  const ts = parts[parts.length - 2];
  const rand = parts[parts.length - 1];
  if (!/^\d{10,}$/.test(ts)) return null;
  if (!rand.length) return null;

  const target = parts.slice(0, parts.length - 2).join(".");
  return target || null;
}

export function tryParseTimestampFromName(fileName: string): number | null {
  const name = String(fileName);
  const parts = name.split(".");
  if (parts.length < 4) return null;

  const ts = Number(parts[parts.length - 3]);
  return Number.isFinite(ts) ? ts : null;
}

export function entityKeyFromFilename(name: string): string | null {
  if (!name.endsWith(".json")) return null;
  const base = name.slice(0, -5);
  const parts = base.split(".");
  if (parts.length < 4) return null;
  const ts = parts[parts.length - 2];
  if (!/^\d{10,}$/.test(ts)) return null;
  return parts.slice(0, parts.length - 2).join(".");
}

export function filenameTs(name: string): number {
  if (!name.endsWith(".json")) return 0;
  const base = name.slice(0, -5);
  const parts = base.split(".");
  if (parts.length < 4) return 0;
  const ts = parseInt(parts[parts.length - 2], 10);
  return Number.isFinite(ts) ? ts : 0;
}

export function findSupersededInboxFiles(names: string[]): Set<string> {
  const entityNewest = new Map<string, string>();
  for (const name of names) {
    const key = entityKeyFromFilename(name);
    if (!key) continue;
    const current = entityNewest.get(key);
    if (!current || filenameTs(name) > filenameTs(current)) {
      entityNewest.set(key, name);
    }
  }

  const superseded = new Set<string>();
  for (const name of names) {
    const key = entityKeyFromFilename(name);
    if (!key) continue;
    if (entityNewest.get(key) !== name) superseded.add(name);
  }
  return superseded;
}

export type InboxFileMode = "snapshot" | "patch" | "unknown";

export interface InboxDedupeCandidate {
  name: string;
  mode: InboxFileMode;
}

/**
 * Supersedes older files only when all files for an entity are full snapshots.
 * If any candidate for an entity is a patch (or unknown shape), preserve order
 * and apply all files to avoid dropping partial updates.
 */
export function findSupersededInboxFilesByMode(candidates: InboxDedupeCandidate[]): Set<string> {
  const byEntity = new Map<string, InboxDedupeCandidate[]>();
  for (const candidate of candidates) {
    const key = entityKeyFromFilename(candidate.name);
    if (!key) continue;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(candidate);
  }

  const superseded = new Set<string>();
  for (const entries of byEntity.values()) {
    if (entries.length < 2) continue;
    if (entries.some((entry) => entry.mode !== "snapshot")) continue;

    let newest = entries[0]!.name;
    for (const entry of entries) {
      if (filenameTs(entry.name) > filenameTs(newest)) newest = entry.name;
    }
    for (const entry of entries) {
      if (entry.name !== newest) superseded.add(entry.name);
    }
  }
  return superseded;
}
