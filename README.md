# Vault Sync

Vault Sync is a module for **Foundry Virtual Tabletop (v13)** that exports structured world data to a deterministic filesystem “vault” — and allows controlled, GM-only imports back into Foundry.

It turns Foundry into an authoritative runtime, while maintaining a portable, inspectable mirror of key world data outside the world database.

Vault Sync is infrastructure.

It is the foundation for external tooling such as **vault-api**, analytics pipelines, multi-world actor stewardship, and controlled character migration.

---

# What Vault Sync Actually Does (Today)

## Deterministic World Export

Vault Sync mirrors selected world data into structured JSON files under the Foundry `data/` directory.

Currently exported:

- Actors (one file per actor)
- Actor manifests
- Actor deletion tombstones
- Chat event stream (hourly sharded)
- Chat shard manifests
- World metadata
- User metadata
- Vault build metadata

Foundry remains the source of truth.  
The vault is a structured mirror.

---

## Append-Only Chat Event Stream

Chat is exported as an event log:

```
chat/events/YYYY-MM-DD/HH/<ts>-<op>-<id>.json
```

Operations:
- `create`
- `update`
- `delete`

Each file contains exactly one event.

This avoids append corruption and allows:

- Metrics
- Analytics
- Bot ingestion
- Replay or audit pipelines
- vault-api streaming

---

## Actor Import (GM-Only, Safe by Default)

Vault Sync includes a controlled import system:

- Import into existing actor
- Import as new actor
- Merge or replace mode
- Safe field filtering
- No ownership/permission overrides
- Flag scope filtering
- Optional effects import
- Socket bridge for GM execution

Import is opt-in.

Export is automatic.

---

## Write Safety & Scalability

Vault Sync uses:

- Multi-lane write queue (prevents burst corruption)
- Debounced manifest updates
- Hourly chat sharding
- Tombstones for safe deletes

This allows stability even in:

- Busy combat sessions
- Large campaigns
- Low-resource hosting environments

---

# Primary Use Case

Vault Sync exists to enable:

- External actor management
- Multi-world character stewardship
- Controlled actor migration
- Offline inspection of world data
- Foundation layer for vault-api

Foundry becomes:

> A place where stories unfold  
> Not the only place where records must live.

---

# What Vault Sync Is Not

Vault Sync is not:

- A public REST API server  
- A real-time sync engine  
- A world backup solution  
- A permission replication system  
- A replacement for Foundry's database  

It is a filesystem mirror + controlled import layer.

---

# Data Security & Content Boundaries

Vault Sync:

- Writes only selected structured data
- Does not export entire world databases
- Does not redistribute marketplace content
- Does not override permissions during import
- Does not transmit data externally on its own

Encryption and remote transport are responsibilities of vault-api or external systems.

Vault Sync only writes to the Foundry `data` source.

---

# Game System Focus

Vault Sync is built and tested with:

**Dungeons & Dragons 5e (2024)**

Other systems may work if they follow similar Actor structures, but are not officially supported at this time.

---

# Architecture Overview

```
src/
  export/      → deterministic export writers + manifests
  import/      → safe actor/item/journal/chat import handlers
  runtime/     → Foundry hooks + startup wiring
  storage/     → FilePicker abstraction + write queue
  contract/    → import/export contract helpers
  ui/          → in-Foundry module UI surfaces
  main.ts      → module entrypoint
```

Technical documentation lives in:

```
docs/README.md
```

---

# Status

Vault Sync is nearing a 1.0 test build.

Core export and import systems are functional and stable for:

- Actors
- Actor inventory
- Chat events

Future enhancements may include:

- Scene export
- Token state export
- Diff previews for imports
- Compendium reference optimization
- Structured change feeds
- Extended system support

---

# Foundry Version

- Developed for **Foundry VTT v13**
- Other versions are not officially supported

---

# License

Vault Sync is licensed under the **MIT License**.

You are free to use, modify, and distribute this module with attribution.

---

# Acknowledgments

If you build upon Vault Sync — whether for tooling, vault-api integration, or something stranger — please credit the original project and link back to the repository.

---

# Philosophy

Foundry is authoritative.

Vault is the mirror.

Vault Sync is the bridge.
