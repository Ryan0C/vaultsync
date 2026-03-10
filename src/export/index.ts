import { exportSelectedJournalPage } from "./journal";

export * from "./journal";

export type ExportSurface = "journal";

export interface ExportSelectionResult {
  surface: ExportSurface;
  createdFiles: Array<string>;
}

export async function exportSelection(opts?: {
  source?: "data";
  ensureExternalId?: boolean;
}): Promise<ExportSelectionResult | null> {
  const res = await exportSelectedJournalPage({
    source: opts?.source ?? "data",
    ensureExternalId: opts?.ensureExternalId ?? true,
    includeParentEntry: true
  });

  if (!res) return null;

  const createdFiles = [res.pageFile, res.entryFile].filter((p): p is string => !!p);

  return {
    surface: "journal",
    createdFiles
  };
}