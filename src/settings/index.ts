/**
 * Vault Sync — Module Settings Registration
 * ----------------------------------------
 * Purpose:
 *  - Defines user-configurable settings for the vault-sync Foundry module.
 *  - These settings control where vault files are written and how they’re identified.
 *
 * How it’s used:
 *  - vault/paths.ts reads `vaultRoot` and `worldIdOverride` to build the on-disk folder structure:
 *      <vaultRoot>/worlds/<worldId>/(actors|chat|meta|manifests)
 *  - Other module code can read `debug` to decide whether to emit verbose logs.
 *
 * Settings:
 *  - vaultRoot (world): Root folder under the Foundry "data" FilePicker source where vault files live.
 *  - worldIdOverride (world): Optional stable identifier for the world directory (defaults to game.world.id).
 *  - debug (client): Enables extra console logging for troubleshooting (per-user).
 *
 * Notes:
 *  - `scope: "world"` settings sync to the world and apply for all users in that world.
 *  - `scope: "client"` is per-browser/user and does not affect other players.
 */
import { MODULE_ID } from "../constants";
import { openActorImportDialog } from "../vault/runtime/import_ui";

export function registerSettings() {
  // Root folder inside Foundry UserData
  game.settings.register(MODULE_ID, "vaultRoot", {
    name: "Vault Root Folder",
    hint: "Root folder (inside Foundry UserData) where Vault Sync stores files.",
    scope: "world",
    config: true,
    type: String,
    default: "vault"
  });

  // Optional override for world id
  game.settings.register(MODULE_ID, "worldIdOverride", {
    name: "World ID Override",
    hint: "Override the Foundry world id used for vault storage (optional).",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  // Debug logging
  game.settings.register(MODULE_ID, "debug", {
    name: "Enable Debug Logging",
    hint: "Log extra information to the console for troubleshooting.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

    game.settings.register(MODULE_ID, "chatLastExportedTs", {
    name: "Chat: Last Exported Timestamp",
    hint: "Internal cursor used to backfill chat messages to vault.",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, "chatBackfillLimit", {
    name: "Chat: Backfill Limit",
    hint: "How many recent chat messages to export on world start.",
    scope: "world",
    config: true,
    type: Number,
    default: 250
  });

  game.settings.registerMenu(MODULE_ID, "importMenu", {
    name: "Vault Import…",
    label: "Open Import Dialog",
    hint: "Import an actor payload from a JSON file (GM executes imports).",
    icon: "fas fa-file-import",
    type: class extends FormApplication {
      static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
          id: "vaultsync-import-menu",
          title: "Vault Import",
          template: "templates/blank.hbs", // unused; we immediately open the dialog
          width: 1,
          height: 1
        });
      }
      async render(force?: boolean, options?: any) {
        // Close this pseudo-form immediately and open the real dialog.
        super.render(force, options);
        this.close();
        openActorImportDialog(); // no actorId => defaults to "create new"
        return this;
      }
    },
    restricted: false // non-GM can request; GM executes via bridge
  });

}