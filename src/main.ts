import { MODULE_ID } from "./constants";
import { registerSettings } from "./settings";
import { bootstrapVault } from "./vault/runtime/bootstrap";
import { registerVaultHooks } from "./vault/runtime/hooks";
import { logger } from "./logger";
import { registerImportBridge } from "./vault/runtime/import_bridge";
import { registerImportUiHooks } from "./vault/runtime/import_ui";

Hooks.once("init", () => {
  logger.info("init");
  registerSettings();
  registerVaultHooks();
});

Hooks.once("ready", async () => {
  await bootstrapVault();

  // Import runtime
  registerImportBridge();   // GM listener
  registerImportUiHooks();  // context menu + header buttons
});