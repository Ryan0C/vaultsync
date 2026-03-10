// src/import/journal/uuid.ts

export function parseJournalEntryPageUuid(uuid: string) {
  // "JournalEntry.<entryId>.JournalEntryPage.<pageId>"
  const parts = uuid.split(".");
  const entryIdx = parts.indexOf("JournalEntry");
  const pageIdx = parts.indexOf("JournalEntryPage");

  const entryId = entryIdx >= 0 ? parts[entryIdx + 1] : undefined;
  const pageId = pageIdx >= 0 ? parts[pageIdx + 1] : undefined;

  return { entryId, pageId };
}