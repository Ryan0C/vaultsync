// src/runtime/settings.ts
import { MODULE_ID } from "../constants";
import { VaultSyncToolsForm } from "../ui";

export const SETTINGS = {
  WORLD_UUID: "worldUuid"
} as const;

export function registerVaultSyncSettingsMenu() {
  game.settings!.registerMenu(MODULE_ID, "toolsMenu", {
    name: "VaultSync Tools",
    label: "Open VaultSync Tools",
    hint: "Export compendium indexes and run VaultSync utilities.",
    icon: "fas fa-toolbox",
    type: VaultSyncToolsForm,
    restricted: true
  });

  (game.settings as any)!.register(MODULE_ID, SETTINGS.WORLD_UUID, {
    name: "World UUID (VaultSync)",
    hint: "Stable unique id used by VaultSync to identify this world across exports.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}