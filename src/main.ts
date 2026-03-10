/**
 * main.ts
 * VaultSync entrypoint (Foundry VTT v13).
 *
 * Responsibilities:
 *  - Define MODULE_ID (single source of truth).
 *  - Call bootstrap to register hooks/socket and start watcher.
 *
 * Keep this file tiny.
 */

import { bootstrapVaultSync } from "./runtime/bootstrap";
import { MODULE_ID } from "./constants";

bootstrapVaultSync({
  moduleId: MODULE_ID,

  // v1 defaults
  startWatcher: true,
  watchIntervalMs: 1500,
  watchMaxPerTick: 5,
  watcherGmOnly: true,
  source: "data"
});