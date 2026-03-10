# import/

Reads update requests from the inbox folder on disk and applies them back into Foundry. This is how changes made in VaultHero make it into the live game.

## What it does

VaultAPI drops incoming updates as JSON files into `import/inbox/`. VaultSync polls that folder on a timer and, for each new file:

1. Reads and parses the JSON (`ImportOp` format — see `contract/`)
2. Normalizes it into a common internal shape regardless of how it arrived
3. Routes it to the right handler (actor, item, journal, chat)
4. Applies the update to Foundry (create or upsert)
5. Writes a small "done" marker file to `import/processed/` so VaultAPI knows the job is complete — or a "failed" marker if something went wrong

VaultSync only processes files it hasn't seen before (based on whether a marker already exists). The same file being present twice won't cause a double-apply.

## Normalization (`normalize.ts`)

Inbox files can arrive in a few slightly different shapes depending on how VaultAPI built them. `normalize.ts` irons out those differences into a single `NormalizedImportRecord` that all the handlers downstream can rely on. The key field is `foundry` — the raw Foundry document data to apply.

## Sub-folders

| Folder | Handles |
|--------|---------|
| `actor/` | Finds or creates the actor, merges the update, handles embedded items |
| `item/` | Standalone item upsert |
| `journal/` | Journal entry and page upsert |
| `chat/` | Chat message creation |

## Marker files (ACK pattern)

After processing a file, VaultSync writes a marker to `import/processed/_done/` or `import/failed/_done/`:

```
import/processed/_done/actor.abc123.1741440000000.x7r1.json.1741440001000.ab12.done.json
```

VaultSync cannot delete files, so the original inbox file stays on disk. VaultAPI reads the markers to know what's been handled, then deletes the original inbox files during its cleanup pass (every 30 seconds).
