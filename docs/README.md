# Vault Sync — Internal Architecture Documentation

> This document describes how Vault Sync works internally.
> It is intended for maintainers and developers integrating with the vault.

---

# Overview

Vault Sync mirrors selected Foundry VTT world data into a structured,
deterministic filesystem layout under the Foundry `data` source.

It provides:

- Deterministic export of actors and chat events
- Safe, GM-only import of actors
- A socket bridge for controlled remote imports
- A stable JSON schema for vault-api consumption
- Write safety via debouncing and multi-lane write queues

Foundry remains authoritative.

Vault is a structured mirror for external tooling.

---

# Design Principles

1. **One-way by default**  
   Export is automatic. Import is opt-in and guarded.

2. **Deterministic filesystem layout**  
   No append corruption. No race overwrites.

3. **Safe imports only**  
   No ownership overrides. No permission escalation.

4. **Stable schema contract**  
   `_meta.schema` versioned and forward-compatible.

5. **Scalable structure**  
   Chat is sharded hourly. Actors are individual files.

---

# Folder Structure

Vault files are written under:
data/vault/worlds//

Structure:

actors/
    .json
tombstones/
    .json

chat/
    events/
        YYYY-MM-DD/
            HH/
                --.json
    manifests/
        YYYY-MM-DD/
            HH.json

manifests/
    actors.json

meta/
    world.json
    users.json
    vault.json
    status.json

---

# Export Layer

Location:
src/vault/export/

Responsible for:

- Serializing Foundry documents
- Writing deterministic JSON files
- Updating manifests
- Writing chat event streams

### Actors

Each actor is written as:
actors/.json

Deletes produce:
actors/tombstones/.json

Manifests are written to:
manifests/actors.json

---

### Chat Event Stream

Chat is written as an append-only event stream:
chat/events/YYYY-MM-DD/HH/--.json

Operations:
create
update
delete

Each file contains one event.

Hourly sharding prevents directory explosion.

A shard manifest tracks ranges:
chat/manifests/YYYY-MM-DD/HH.json

---

# Import Layer

Location:
src/vault/import/

Import is:

- GM-only
- Explicitly invoked
- Safe by default

Supports:

- Import into existing actor
- Import as new actor
- Replace or merge mode
- Optional effect import
- Flag filtering

Dangerous fields are never imported:

- ownership
- permissions
- folder
- sort

---

# Import Bridge (Socket Layer)

Location:
src/vault/runtime/import_bridge.ts

Purpose:

- Allow non-GM users or modules to request imports
- GM executes import
- Response returned via socket

Channel:
module.vault-sync

Message types:
import.actor
import.actor.result

---

# IO Layer

Location:
src/vault/io/

Provides:

- `fs.ts` — FilePicker abstraction
- `write_queue.ts` — multi-lane write serialization
- `debounce.ts` — manifest write coalescing

### Multi-Lane Write Queue

Writes are serialized per logical lane:

- actors
- chat
- manifests
- meta
- default

Prevents:

- Folder creation races
- Overwrite corruption
- Burst write contention

---

# Runtime Layer

Location:
src/vault/runtime/

Responsible for:

- Bootstrap on world ready
- Registering hooks
- Registering import bridge
- Registering import UI

Hooks:

- createActor
- updateActor
- deleteActor
- createChatMessage
- updateChatMessage
- deleteChatMessage

---

# Schema

Location:
src/vault/schema/

Every exported entity contains:

_meta: {
schema: number,
source: “foundry”,
worldId: string,
systemId: string,
coreVersion?: string,
exportedAt?: ISODateString
}

Schema version is defined in:
constants.ts

---

# Security Model

- Import is GM-only.
- Socket execution only allowed on GM client.
- Flags filtered by allowed namespaces.
- No permission or ownership imports.
- Replace mode guarded against unsafe deletes.

---

# What Vault Sync Is

- A deterministic filesystem mirror
- An infrastructure layer for vault-api
- A reusable export/import foundation for other modules
- Safe by default

---

# What Vault Sync Is Not

- A public REST API server
- A real-time sync engine
- A permission management system
- A full world backup solution

---

# Versioning Strategy

Vault Sync follows semantic versioning:

- MAJOR: Schema breaking changes
- MINOR: Feature additions
- PATCH: Fixes only

Schema version is independent and explicitly versioned.

---

# Future Extension Points

Possible future improvements:

- Scene export
- Token state export
- Diff-based actor export
- Compendium reference resolution
- Structured change feeds
- Import dry-run diff UI

---

# Maintenance Notes

When modifying export shape:

1. Increment schema version.
2. Maintain backwards compatibility where possible.
3. Update this document.

---

# Final Notes

Vault Sync is infrastructure.

It exists to make world data portable, inspectable,
and safely re-importable.

Foundry remains authoritative.

Vault is the mirror.