// src/import/actor/types.ts
import type { ExportRecord } from "../../contract";

export type ActorExportRecord = ExportRecord & {
  docType: "Actor";
};