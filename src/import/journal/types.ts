// src/import/journal/types.ts
import type { ExportRecord } from "../../contract";

export type JournalExportRecord = ExportRecord & {
  docType: "Journal";
};