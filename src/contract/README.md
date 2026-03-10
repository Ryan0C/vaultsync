# contract/

The shared file format that VaultSync and VaultAPI both speak. If you change anything here, both sides need to be updated together.

## Why this exists

VaultSync (running inside Foundry) and VaultAPI (a Node.js server) never talk to each other directly — they communicate by reading and writing JSON files on a shared disk path. This folder defines exactly what those JSON files look like so both sides stay in agreement.

## The two file types

### ExportRecord — written by VaultSync, read by VaultAPI
Represents a snapshot of a Foundry document (actor, item, journal, chat message) at a point in time.

```json
{
  "type": "export",
  "contractVersion": 1,
  "docType": "Actor",
  "uuid": "Actor.abc123",
  "externalId": "vh:Actor:abc123",
  "foundry": { ...raw Foundry actor data... },
  "exportedAt": 1741440000000
}
```

The `foundry` field is the raw object you'd get from `actor.toObject()` in Foundry — no transformation applied.

### ImportOp — written by VaultAPI, read by VaultSync
Represents an update request coming from VaultHero that should be applied to Foundry.

```json
{
  "type": "import",
  "contractVersion": 1,
  "docType": "Actor",
  "uuid": "Actor.abc123",
  "externalId": "vh:Actor:abc123",
  "foundry": { ...fields to apply... },
  "opId": "uuid-v4",
  "mode": "upsert",
  "createdAt": 1741440000000
}
```

The `opId` is a stable UUID — if VaultAPI retries a submission the same opId prevents it from being applied twice. The `mode` is currently always `"upsert"` (create if missing, update if found).

## Important rule

Both `ExportRecord` and `ImportOp` use the field name `foundry` for the raw Foundry document data. Earlier versions used `data` — that name is gone. Don't bring it back.
