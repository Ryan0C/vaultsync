/**
 * Vault Sync — Import API
 * -----------------------
 * Purpose:
 *  - Provide controlled “import into Foundry” helpers.
 *  - GM-only by design.
 *
 * Notes:
 *  - vault-sync is primarily export. Import is opt-in and guarded.
 *  - Callers supply payloads (from vault-api, local files, etc).
 */

import { applyActorImport } from "./apply/actor";
import { logger } from "../../logger";

export type ImportMode = "merge" | "replace";

export type ImportResult =
  | { ok: true; actor: Actor; created: boolean }
  | { ok: false; error: string };

function assertGM() {
  const user = game.user;
  if (!user) throw new Error("Import requires an active user session.");
  if (!user.isGM) throw new Error("Import is GM-only.");
}

function errToString(err: unknown) {
  const msg = (err as any)?.message ?? String(err);
  const debug = !!game.settings?.get?.("vault-sync", "debug");
  if (!debug) return String(msg);
  const stack = (err as any)?.stack ? `\n${(err as any).stack}` : "";
  return `${String(msg)}${stack}`;
}

function getSrcActor(payload: any) {
  return payload?.actor ?? payload ?? null;
}

function isActorDocument(doc: any): doc is Actor {
  // Avoid instanceof pitfalls; prefer documentName.
  return !!doc && (doc.documentName === "Actor" || doc.constructor?.name === "Actor");
}

export type ImportActorCreateOptions = {
  renderSheet?: boolean;
};

type ApplyOpts = Parameters<typeof applyActorImport>[3];

/**
 * Import actor payload into an existing Actor (by id).
 */
export async function importActorIntoExisting(
  actorId: string,
  payload: any,
  mode: ImportMode = "merge",
  opts?: ApplyOpts
): Promise<ImportResult> {
  try {
    assertGM();

    const target = game.actors?.get(actorId);
    if (!target) return { ok: false, error: `Actor not found: ${actorId}` };

    await applyActorImport(target, payload, mode, opts);
    return { ok: true, actor: target, created: false };
  } catch (err) {
    logger.error("importActorIntoExisting failed", err);
    return { ok: false, error: errToString(err) };
  }
}

/**
 * Import actor payload and create a new Actor document.
 * - Creates a minimal shell first, then applies import (so embedded items work).
 */
export async function importActorAsNew(
  payload: any,
  mode: ImportMode = "merge",
  opts?: ApplyOpts,
  createOpts: ImportActorCreateOptions = {}
): Promise<ImportResult> {
  try {
    assertGM();

    const srcActor = getSrcActor(payload);
    if (!srcActor) return { ok: false, error: "Missing payload.actor" };

    const renderSheet = createOpts.renderSheet ?? false;

    // Create a minimal shell actor first.
    // IMPORTANT: do NOT import ownership/permissions/folder/sort here either.
    const created = await Actor.create(
      {
        name: srcActor.name ?? "Imported Actor",
        type: srcActor.type ?? "npc",
        img: srcActor.img ?? null,
        // Keep this minimal; applyActorImport will set system/flags safely.
        system: {},
        flags: {}
      },
      { renderSheet }
    );

    if (!created) return { ok: false, error: "Actor.create() returned null/undefined" };

    await applyActorImport(created, payload, mode, opts);
    return { ok: true, actor: created, created: true };
  } catch (err) {
    logger.error("importActorAsNew failed", err);
    return { ok: false, error: errToString(err) };
  }
}

/**
 * Convenience: import by UUID (Actor.<id> OR compendium actor UUID).
 */
export async function importActorByUuid(
  actorUuid: string,
  payload: any,
  mode: ImportMode = "merge",
  opts?: ApplyOpts
): Promise<ImportResult> {
  try {
    assertGM();

    const doc = await fromUuid(actorUuid);
    if (!doc) return { ok: false, error: `UUID not found: ${actorUuid}` };
    if (!isActorDocument(doc)) return { ok: false, error: `UUID is not an Actor: ${actorUuid}` };

    await applyActorImport(doc, payload, mode, opts);
    return { ok: true, actor: doc, created: false };
  } catch (err) {
    logger.error("importActorByUuid failed", err);
    return { ok: false, error: errToString(err) };
  }
}

/**
 * Optional: expose a capability check for UI gating.
 */
export function canImport(): boolean {
  return !!game.user?.isGM;
}