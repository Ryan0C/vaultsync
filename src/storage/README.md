# storage/

Low-level file I/O for VaultSync. Everything here deals with how files are read and written — not what the data means. The rest of the codebase calls into this layer and doesn't think about file paths or Foundry's FilePicker API.

## Key constraint: create-only

VaultSync runs inside the Foundry browser/Electron context. Foundry's FilePicker API can create and upload files, but **cannot delete or reliably overwrite them** in all hosting environments. The entire storage layer is designed around this:

- Every write creates a **new versioned file** with a timestamp and random suffix in the name
- "Overwrite" is attempted for manifest/index files only, with a fallback to a versioned file if it fails
- Nothing in this layer ever calls delete — VaultAPI handles cleanup from the outside

## Files

### `index.ts`
Path resolution and directory setup. Knows where the VaultSync root is for the active world (`worlds/{id}/vaultsync/`) and ensures all required sub-directories exist before anything else tries to write to them. No business logic — just paths and mkdir calls.

### `json.ts`
The main write helpers:
- **`writeJsonVersioned(dir, baseName, data)`** — creates a new `baseName.timestamp.random.json` file, returns the path
- **`readJsonSafe(path)`** — reads and parses a JSON file, returns null instead of throwing on failure
- **`tombstone(dir, name)`** — writes a marker file signalling that an inbox file was processed (used by the import watcher)
- **`findNewest(dir, prefix)`** — scans a directory and returns the most recently created file matching a name prefix

### `watch.ts`
The inbox watcher. Polls `import/inbox/` on a configurable interval (default every few seconds) and calls a handler function for each new `.json` file it finds. Tracks which files have already been processed by checking for marker files in `import/processed/` and `import/failed/`. Only runs when a GM user is connected.

### `fp.ts`
A thin wrapper around Foundry's `FilePicker` API that normalizes its interface and handles version differences between Foundry releases. The rest of the storage layer uses this instead of calling `FilePicker` directly.
