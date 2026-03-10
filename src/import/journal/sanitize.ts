// src/import/journal/sanitize.ts

/**
 * Remove Foundry internal fields that you generally don't want to import verbatim.
 * Add to this list as you encounter conflicts.
 */
export function sanitizeFoundryDoc<T extends Record<string, any>>(data: T): T {
  const clone: any = structuredClone(data ?? {});
  delete clone._stats;
  return clone;
}