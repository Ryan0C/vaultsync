import {
  writeActorFile,
  writeWorldMeta,
  writeVaultMeta,
  writeActorsManifest,
  backfillChat
} from "../export";
import { ensureFolder } from "../io/fs";
import { vaultDir, vaultWorldRoot } from "../paths";
import { MODULE_ID } from "../../constants";
import { logger } from "../../logger";

export async function bootstrapVault() {
  try {
    await ensureFolder(vaultWorldRoot());
    await ensureFolder(vaultDir("actors"));
    await ensureFolder(vaultDir("chat"));
    await ensureFolder(vaultDir("meta"));
    await ensureFolder(vaultDir("manifests"));

    await writeWorldMeta();
    await writeVaultMeta();

    for (const actor of game.actors.contents) {
      await writeActorFile(actor);
    }

    await backfillChat();

    // initial manifest snapshot
    await writeActorsManifest();

    logger.info(`vault ready`);
  } catch (err) {
    logger.error(`vault initialization failed`, err);
  }
}