// src/import/actor/uuid.ts
export function parseActorUuid(uuid: string): { actorId: string | null } {
  // Foundry canonical: Actor.<id>
  if (!uuid) return { actorId: null };

  const parts = String(uuid).split(".");
  if (parts.length >= 2 && parts[0] === "Actor") return { actorId: parts[1] ?? null };

  return { actorId: null };
}