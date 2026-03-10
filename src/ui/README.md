# ui/

In-game UI components for VaultSync. Intentionally minimal — the main interface for the sync system is VaultHero, not this module's in-game UI.

## What's here

### `index.ts`
Registers any UI elements that appear inside Foundry itself, such as:
- A button or panel in the module settings to manually trigger an export of all actors
- Status indicators showing whether the sync system is active
- Any debug controls useful during development (force re-sync, clear state, etc.)

These controls are GM-only and are intended as escape hatches, not the primary workflow. Day-to-day syncing happens automatically through the hooks and inbox watcher — you shouldn't need to touch this UI during normal operation.
