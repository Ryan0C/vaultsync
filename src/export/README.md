# export/

Reads Foundry documents and writes them to disk as versioned JSON snapshots. This is how VaultHero learns what's in the world.

## What it does

When a document changes in Foundry (actor updated, item created, journal edited, etc.), the export pipeline:

1. Grabs the current document state via `doc.toObject()`
2. Wraps it in an `ExportRecord` envelope (see `contract/`)
3. Writes a new versioned file: `{type}.{id}.{timestamp}.{random}.json`
4. Updates the manifest (`exports/{type}/index.json`) to point at the new file

The manifest is the "table of contents" — VaultAPI reads it to find the latest version of a document without scanning the whole directory.

## Change detection (skip unchanged exports)

Before writing, each exporter checks whether the document has actually changed since the last export by comparing `_stats.modifiedTime` (Foundry's own last-modified timestamp) against what the manifest recorded. If they match, the export is skipped and no new file is written. This is what prevents the export directories from filling up with thousands of identical snapshots when Foundry is running.

## Sub-folders

| Folder | Handles |
|--------|---------|
| `actor/` | Actor documents, including embedded items and active effects |
| `item/` | Standalone item documents |
| `journal/` | Journal entries and their pages |
| `chat/` | Chat messages |

Each sub-folder follows the same pattern: an `index.ts` with the main `export*()` function and a `manifest.ts` that manages the index file for that document type.

## File naming

Every write creates a new file rather than overwriting the previous one:

```
exports/actors/actor.abc123.1741440000000.x7q2r1.json
               ──────────── ─────────────── ──────
               base name    unix ms         random suffix
```

The manifest's `latestFile` field always points to the current version. VaultAPI periodically prunes old versions (keeping the newest per document) because VaultSync itself cannot delete files.
