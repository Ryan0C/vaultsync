// src/import/item/sanitize.ts

/**
 * Strip fields from raw Foundry Item data that should not be imported verbatim.
 * Mirrors the actor sanitize pattern — keeps it minimal.
 */
export function sanitizeFoundryItemDoc(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const doc = { ...raw };

  // _id is set by Foundry on create; let Foundry assign it
  delete doc._id;

  // Active effects on the item itself
  delete doc.effects;
  delete doc.activeEffects;

  return doc;
}
