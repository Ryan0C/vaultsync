function now(): string {
  return new Date().toISOString();
}

function safeClone<T>(v: T): T {
  return foundry.utils.deepClone(v);
}

/**
 * Serialize a Foundry Actor into a vault-safe structure (round-trip friendly).
 */
export function serializeActor(actor: Actor) {
  const doc: any = actor.toObject();

  // Items from the actor snapshot are already plain objects
  const rawItems: any[] = Array.isArray(doc.items) ? doc.items : [];

  return {
    // Keep both; _id matches Foundry source conventions
    _id: doc._id ?? actor.id,
    id: actor.id,

    name: actor.name,
    type: actor.type,
    folder: actor.folder?.id ?? doc.folder ?? null,
    img: actor.img ?? doc.img ?? null,
    sort: actor.sort ?? doc.sort ?? 0,

    // ⚠️ Consider removing for v1.0, or treat as "export-only"
    ownership: safeClone((doc.ownership ?? actor.ownership) ?? {}),

    system: safeClone(doc.system ?? {}),
    prototypeToken: safeClone(doc.prototypeToken ?? {}),

    // Full embedded item sources for reliable import
    items: rawItems.map((item: any) => {
      const sourceId =
        item?.flags?.core?.sourceId ??
        item?.flags?.core?.sourceUUID ??
        null;

      return {
        _id: item._id ?? item.id ?? null,
        id: item._id ?? item.id ?? null,
        key: item.pack ? `pack:${item.pack}:${item._id}` : `local:${item.type}:${item.name}`,
        name: item.name,
        type: item.type,
        img: item.img ?? null,

        // Compendium provenance (usually via core.sourceId UUID)
        sourceId,

        // If you want a compact view, keep these:
        system: safeClone(item.system ?? {}),
        flags: safeClone(item.flags ?? {}),

        // And ALSO keep the full item source for round-tripping:
        _source: item
      };
    }),

    effects: safeClone(doc.effects ?? []),
    flags: safeClone(doc.flags ?? {}),

    _meta: {
      schema: 1,
      source: "foundry",
      worldId: game.world.id,
      systemId: game.system.id,
      coreVersion: game.version,

      exportedAt: now(),
      // optional useful provenance:
      // modifiedTime: doc?._stats?.modifiedTime ?? null,
    }
  };
}