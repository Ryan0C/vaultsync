/**
 * export/actor/index.ts
 * Actor export (Foundry v13).
 *
 * Strategy:
 *  - Actor is the primary export unit (this is what your frontend cares about).
 *  - Create-only writes: every export creates a new versioned JSON file.
 *
 * Output folders (world-scoped):
 *  - exports/actors/
 */

import type { ExportRecord } from "../../contract";
import { createExportRecord } from "../../contract";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { writeJsonVersioned } from "../../storage/json";
import { MODULE_ID } from "../../constants";
import { withSuppressedHooks } from "../../runtime/hooks";
import { updateActorManifest, readActorManifest } from "./manifest";
import type { ActorManifest } from "./manifest";

const EXTERNAL_ID_FLAG_PATH = `flags.${MODULE_ID}.externalId`;

function getExternalId(doc: any): string | undefined {
  return doc?.getFlag?.(MODULE_ID, "externalId") ?? doc?.flags?.[MODULE_ID]?.externalId;
}

export interface ExportActorOptions {
  source?: "data";

  /**
   * If true, ensure flags.<moduleId>.externalId exists on exported docs.
   * Default false.
   */
  ensureExternalId?: boolean;

  ensureEmbeddedExternalIds?: boolean;

  /**
   * Pre-fetched manifest. When exporting many actors in a loop, pass this in
   * so each call doesn't need to fetch the manifest file independently.
   * The skip check uses it read-only; the write path always refreshes.
   */
  _manifest?: ActorManifest;
}

/* -------------------------------------------------------------------------- */
/*                              Public API                                    */
/* -------------------------------------------------------------------------- */

async function ensureActorEmbeddedExternalIds(actor: any, debug = true) {
  const items = actor?.items?.contents ?? [];
  const effects = actor?.effects?.contents ?? [];

  await withSuppressedHooks(async () => {
    for (const it of items) await ensureExternalIdFlag(it);
    for (const ef of effects) await ensureExternalIdFlag(ef);
  });

  if (debug) console.log("[vault-sync] ensured embedded externalIds", {
    actorId: actor?.id,
    items: items.length,
    effects: effects.length
  });
}

export async function exportActor(
  actor: any,
  opts: ExportActorOptions = {}
): Promise<{ actorFile: string | null; skipped?: true }> {
  const source = opts.source ?? "data";
  const ensureExternalId = opts.ensureExternalId ?? false;
  const ensureEmbeddedExternalIds = opts.ensureEmbeddedExternalIds ?? false;

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();
  const actorsDir = `${paths.exports}/actors`;

  if (ensureExternalId) await ensureExternalIdFlag(actor);
  if (ensureEmbeddedExternalIds) await ensureActorEmbeddedExternalIds(actor);

  // ── Change detection: skip if actor hasn't changed since last export ───────
  // Foundry tracks the last-modified wall-clock in actor._stats.modifiedTime
  // (a Unix ms timestamp). The manifest stores this as updatedAt (ISO string)
  // after each successful export.  If they match, the content is identical to
  // what was already exported and we can skip the file write entirely.
  const currentModifiedAt = actor?._stats?.modifiedTime
    ? new Date(actor._stats.modifiedTime).toISOString()
    : null;

  if (currentModifiedAt) {
    const manifest = opts._manifest ?? await readActorManifest(source);
    const externalId = getExternalId(actor);
    const key = externalId || actor?.uuid || actor?.id;
    const existing = key ? manifest.actors[key] : undefined;

    if (existing?.updatedAt === currentModifiedAt && existing.latestFile) {
      console.debug(`[vault-sync] skip export: ${actor.name} (${actor.id}) unchanged since ${currentModifiedAt}`);
      return { actorFile: existing.latestFile, skipped: true };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const actorExport = makeExportRecord("Actor", actor);
  const actorBaseName = safeBaseName(`actor.${actor.id ?? "unknown"}`);
  const actorFile = await writeJsonVersioned(actorsDir, actorBaseName, actorExport, source);

  // ✅ Update manifest (latest pointer)
  await updateActorManifest(
    [{ doc: actor, latestFile: actorFile ?? "" }].filter((u) => !!u.latestFile),
    source
  );

  return { actorFile: actorFile ?? null };
}

export async function exportAllWorldActors(
  opts: ExportActorOptions = {}
): Promise<{ count: number; skipped: number; results: Array<{ actorId: string; actorFile?: string | null; skipped?: true; error?: string }> }> {
  const source = opts.source ?? "data";
  const actors: any[] = (game as any)?.actors?.contents ?? [];
  const results: Array<{ actorId: string; actorFile?: string | null; skipped?: true; error?: string }> = [];

  // Pre-fetch manifest once so every actor's skip-check doesn't need its own read
  const manifest = await readActorManifest(source);

  let skipped = 0;
  for (const actor of actors) {
    const actorId = String(actor?.id ?? "");
    if (!actorId) continue;

    try {
      const out = await exportActor(actor, { ...opts, _manifest: manifest });
      if (out.skipped) skipped++;
      results.push({ actorId, actorFile: out.actorFile ?? null, ...(out.skipped ? { skipped: true } : {}) });
    } catch (err: any) {
      results.push({ actorId, error: String(err?.message ?? err) });
    }
  }

  return { count: results.length, skipped, results };
}

/**
 * Convenience: export "currently selected" actor, if available.
 * Best-effort; selection APIs vary by sheet/app.
 */
export async function exportSelectedActor(
  opts: ExportActorOptions = {}
): Promise<{ actorFile?: string | null } | null> {
  const actor = getSelectedActorBestEffort();
  if (!actor) return null;
  return await exportActor(actor, opts);
}

export async function exportActorByUuid(
  uuid: string,
  opts: ExportActorOptions = {}
): Promise<{ actorFile?: string | null }> {
  const doc: any = await fromUuid(uuid);
  if (!doc) throw new Error(`No document for uuid: ${uuid}`);
  if (doc.documentName !== "Actor") throw new Error(`Unsupported doc type: ${doc.documentName}`);
  return await exportActor(doc, opts);
}

/* -------------------------------------------------------------------------- */
/*                                Internals                                   */
/* -------------------------------------------------------------------------- */

function makeExportRecord(docType: "Actor", doc: any): ExportRecord {
  const foundryObj = doc?.toObject ? doc.toObject() : doc;
  const uuid = doc?.uuid;
  const externalId = getExternalId(doc);

  return createExportRecord(docType, foundryObj, {
    uuid,
    externalId
  });
}

async function ensureExternalIdFlag(doc: any): Promise<string | null> {
  const existing = getExternalId(doc);
  if (existing) return existing;

  const created = `vh:${doc?.documentName ?? "Doc"}:${crypto.randomUUID()}`;

  return await withSuppressedHooks(async () => {
    if (typeof doc?.setFlag === "function") {
      await doc.setFlag(MODULE_ID, "externalId", created);
      return created;
    }

    if (typeof doc?.update === "function") {
      await doc.update({ [EXTERNAL_ID_FLAG_PATH]: created }, { diff: true });
      return created;
    }

    return null;
  });
}

function safeBaseName(name: string): string {
  return String(name).replace(/[^\w.-]+/g, "_");
}

/**
 * Best-effort way to find a selected Actor.
 * You can replace this later with your own UI state (recommended).
 */
function getSelectedActorBestEffort(): any | null {
  // 1) If an Actor sheet is open, its object is usually available as `app.object`.
  const apps: Record<string, any> = (ui as any)?.windows ?? {};
  for (const k of Object.keys(apps)) {
    const app = apps[k];
    const obj = app?.object;
    if (obj?.documentName === "Actor") return obj;
  }

  // 2) If a token is controlled, use its actor.
  const token = (canvas as any)?.tokens?.controlled?.[0];
  const actor = token?.actor ?? token?.document?.actor;
  if (actor?.documentName === "Actor") return actor;

  return null;
}
