# runtime/

The glue between VaultSync and the Foundry lifecycle. Everything here is about wiring into Foundry's events, settings, and communication systems — not about the actual data format or file I/O.

## Files

### `bootstrap.ts`
The entry point called when the module loads. Registers settings, sets up socket listeners, starts the inbox watcher, and kicks off the initial world metadata export. Everything else in this folder is initialized from here.

### `hooks.ts`
Registers Foundry hooks (`createActor`, `updateActor`, `deleteActor`, etc.) to trigger exports when documents change. Uses a 750 ms debounce so rapid changes (like a combat round updating many actors) only produce one export per document, not one per keystroke.

Also manages **hook suppression** — a flag that prevents VaultSync's own imports from triggering new exports, which would otherwise create an echo loop (import → export → import → ...).

### `settings.ts`
Registers the module's settings in Foundry's settings UI (things like the sync interval and debug toggles). Settings are read by other parts of the module at runtime.

### `socket.ts`
Handles the FoundryVTT socket channel (`module.vault-sync`). Foundry's socket lets clients send messages to each other through the Foundry server. VaultSync uses this to relay export/import commands from non-GM players up to the GM client, which is the only one allowed to do file I/O.

### `status.ts`
Writes a periodic heartbeat to the `meta/` folder on disk. VaultAPI reads these files to know whether Foundry is currently online and which users are connected.

### `world.ts`
Exports world-level metadata (world ID, active modules, system version, connected users) to the `meta/` folder. Runs at startup and periodically so VaultAPI always has an up-to-date picture of the world state.

### `requests.ts`
Handles explicit "request" commands that can be dropped into the `requests/` folder on disk. Allows VaultAPI to ask VaultSync to do things like "export all actors right now" without going through the normal hook system.
