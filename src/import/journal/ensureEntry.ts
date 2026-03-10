// src/import/journal/ensureEntry.ts

/**
 * Ensure a parent JournalEntry exists so we can upsert embedded pages.
 */
export async function ensureJournalEntry(entryId: string) {
  const existing = game.journal?.get(entryId);
  if (existing) return existing;

  // Create placeholder entry with matching id
  return JournalEntry.create(
    { _id: entryId, name: `Imported Journal (${entryId})` },
    { keepId: true }
  );
}