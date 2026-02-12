import { writeJson, deleteFile, ensureFolder } from "../../io/fs";
import { vaultDir } from "../../paths";
import { serializeActor } from "../serialize/actor";
import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../../constants";
import { safeId  } from "./utils";


/* -------------------------------------------- */
/*  Actor Files                                 */
/* -------------------------------------------- */

export async function writeActorFile(actor: Actor) {
  const actorsPath = vaultDir("actors");
  await ensureFolder(actorsPath);
  await writeJson(`${actorsPath}/${actor.id}.json`, serializeActor(actor));
}

export async function deleteActorFile(actorId: string) {
  const actorsPath = vaultDir("actors");
  const tombPath = `${actorsPath}/tombstones`;
  await ensureFolder(tombPath);

  const id = safeId(actorId);

  // Write tombstone first (so deletion is durable even if delete fails)
  await writeJson(`${tombPath}/${id}.json`, {
    op: "delete",
    id,
    worldId: game.world.id,
    ts: Date.now(),
    deletedAt: new Date().toISOString()
  });

  // Then try to delete the snapshot (optional but usually desired)
  await deleteFile(`${actorsPath}/${id}.json`);
}

export async function writeActorsManifest() {
  const manifestPath = vaultDir("manifests");
  await ensureFolder(manifestPath);

  const list = game.actors.contents.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    updatedAt: a.updatedAt ?? new Date().toISOString()
  }));

  await writeJson(`${manifestPath}/actors.json`, {
    worldId: game.world.id,
    count: list.length,
    actors: list,
    generatedAt: new Date().toISOString()
  });
}