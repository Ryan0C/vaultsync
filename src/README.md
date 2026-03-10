# VaultSync – Source Overview

VaultSync is a FoundryVTT module (runs inside the Foundry browser context) that keeps Foundry data in sync with the outside world via flat JSON files on disk. It has no network server of its own — it communicates entirely by reading and writing files that VaultAPI can also see.

## How it works

1. **Export** – When an actor, item, journal entry, or chat message changes in Foundry, VaultSync writes a snapshot of that document to the `exports/` folder on disk. VaultAPI reads those files to serve data to VaultHero.

2. **Import** – VaultAPI drops incoming update requests as JSON files into the `import/inbox/` folder. VaultSync polls that folder and applies each file to Foundry. When done, it writes a small "done" marker file so VaultAPI knows the job finished.

3. **No delete privileges** – VaultSync runs inside the Foundry browser/Electron context which can create files but cannot delete them. VaultAPI handles all cleanup.

## Folder map

| Folder | What it does |
|--------|-------------|
| `contract/` | Shared type definitions and factory functions for the file format both VaultSync and VaultAPI use |
| `export/` | Writes Foundry documents to disk as versioned JSON snapshots |
| `import/` | Reads inbox files from disk and applies them back into Foundry |
| `runtime/` | Foundry lifecycle glue — hooks, socket relay, settings, bootstrap, status heartbeat |
| `storage/` | Low-level file I/O wrappers (Foundry FilePicker API, versioned writes, inbox watcher) |
| `ui/` | Minimal in-game UI (settings panel, manual export/import buttons) |

## Key constraints

- **GM only** – The inbox watcher and all import/export operations only run when a GM user is connected. Non-GM players see nothing.
- **Create-only writes** – Every export creates a *new* versioned file (`actor.id.timestamp.rand.json`) rather than overwriting the previous one. The manifest tracks which file is the current one.
- **Foundry is source of truth** – Imports update Foundry; exports read from Foundry. VaultHero never holds canonical data independently.
