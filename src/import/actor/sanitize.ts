// src/import/actor/sanitize.ts
export function sanitizeFoundryActorDoc(data: any): any {
  const incoming: any = { ...(data ?? {}) };

  // Always delete _id so we control whether it's set.
  delete incoming._id;

  // Avoid accidental ownership issues coming from exports
  // (Foundry can be picky across worlds/users)
  delete incoming.ownership;

  // IMPORTANT: Embedded docs are handled separately by upsertActorEmbedded().
  // If we leave these on the root payload, Foundry/system may try to apply them
  // during Actor.create/update, causing duplicates or conflicts.
  delete incoming.items;
  delete incoming.effects;
  delete incoming.activeEffects; // some serializers use this key
  delete incoming._effects;      // extra defensive (rare)

  // Some exports may include derived/temporary fields; keep permissive otherwise.
  return incoming;
}