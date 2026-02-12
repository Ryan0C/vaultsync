import { writeJson, deleteFile, ensureFolder } from "../../io/fs";
import { vaultDir } from "../../paths";
import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../../constants";

/* -------------------------------------------- */
/*  Module Metadata                              */
/* -------------------------------------------- */
function getModuleVersion(): string {
  const m = game.modules.get(MODULE_ID as any);
  return (m?.version as string) || "unknown";
}

export async function writeVaultMeta() {
  const metaPath = vaultDir("meta");
  await ensureFolder(metaPath);

  await writeJson(`${metaPath}/vault.json`, {
    schemaVersion: VAULT_SCHEMA_VERSION,
    moduleId: MODULE_ID,
    moduleVersion: getModuleVersion(),
    foundryVersion: game.version,
    systemId: game.system.id,
    worldId: game.world.id,
    generatedAt: new Date().toISOString()
  });
}

/* -------------------------------------------- */
/*  World Metadata                              */
/* -------------------------------------------- */

export async function writeWorldMeta() {
  const metaPath = vaultDir("meta");
  await ensureFolder(metaPath);

  await writeJson(`${metaPath}/world.json`, {
    id: game.world.id,
    title: game.world.title,
    system: game.system.id,
    coreVersion: game.version,
    updatedAt: new Date().toISOString()
  });

  await writeJson(`${metaPath}/users.json`, {
    users: game.users.contents.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      active: u.active
    }))
  });
}
