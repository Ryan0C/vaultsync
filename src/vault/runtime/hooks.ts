import {
  writeActorFile,
  deleteActorFile,
  writeActorsManifest,
  appendChatCreate,
  appendChatUpdate,
  appendChatDelete
} from "../export";
import { debounce } from "../io/debounce";
import { MODULE_ID } from "../../constants";

const MANIFEST_DEBOUNCE_MS = 750;

function queueActorsManifest() {
  debounce("actors-manifest", MANIFEST_DEBOUNCE_MS, () => writeActorsManifest());
}

export function registerVaultHooks() {
  /* -------------------------------------------- */
  /*  ACTORS                                      */
  /* -------------------------------------------- */

  Hooks.on("createActor", async (actor: Actor) => {
    await writeActorFile(actor);
    queueActorsManifest();
  });

  Hooks.on("updateActor", async (actor: Actor) => {
    await writeActorFile(actor);
    queueActorsManifest();
  });

  Hooks.on("deleteActor", async (actor: Actor) => {
    if (!actor.id) return;
    await deleteActorFile(actor.id);
    queueActorsManifest();
  });

  /* -------------------------------------------- */
  /*  CHAT                                        */
  /* -------------------------------------------- */

  Hooks.on("createChatMessage", async (msg: ChatMessage) => {
    await appendChatCreate(msg);

    const ts = (msg.toObject() as any)?.timestamp ?? Date.now();
    const lastTs = (game.settings.get(MODULE_ID, "chatLastExportedTs") as number) || 0;
    if (ts > lastTs) await game.settings.set(MODULE_ID, "chatLastExportedTs", ts);
  });

  Hooks.on("updateChatMessage", async (msg: ChatMessage) => {
    await appendChatUpdate(msg);
  });

  Hooks.on("deleteChatMessage", async (msg: ChatMessage) => {
    if (!msg?.id) return;
    await appendChatDelete(msg.id, Date.now());
  });
}