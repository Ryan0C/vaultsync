/**
 * export/journal/index.ts
 * Journal export (Foundry v13).
 *
 * Strategy:
 *  - JournalPage is the primary export unit (contains text/content).
 *  - Optionally export parent JournalEntry metadata as well.
 *  - Create-only writes: every export creates a new versioned JSON file.
 *
 * Output folders (world-scoped):
 *  - exports/journal/pages/
 *  - exports/journal/entries/
 */

import type { ExportRecord } from "../../contract";
import { createExportRecord } from "../../contract";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { writeJsonVersioned } from "../../storage/json";
import { MODULE_ID } from "../../constants";
import { withSuppressedHooks } from "../../runtime/hooks";
import { updateJournalManifest } from "./manifest";

const EXTERNAL_ID_FLAG_PATH = `flags.${MODULE_ID}.externalId`;

function getExternalId(doc: any): string | undefined {
  return doc?.getFlag?.(MODULE_ID, "externalId") ?? doc?.flags?.[MODULE_ID]?.externalId;
}

export interface ExportJournalOptions {
  source?: "data";

  /**
   * If true, ensure flags.vaulthero.externalId exists on exported docs.
   * Default true.
   */
  ensureExternalId?: boolean;

  /**
   * Export the parent JournalEntry for a page as well.
   * Default true.
   */
  includeParentEntry?: boolean;

  /**
   * If true, also export ALL pages under a JournalEntry.
   * (Ignored when exporting a page directly unless you pass a JournalEntry.)
   */
  includeAllPages?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              Public API                                    */
/* -------------------------------------------------------------------------- */

export async function exportJournalPage(
  page: any,
  opts: ExportJournalOptions = {}
): Promise<{ pageFile?: string | null; entryFile?: string | null }> {
  const source = opts.source ?? "data";
  const ensureExternalId = opts.ensureExternalId ?? true;
  const includeParentEntry = opts.includeParentEntry ?? true;

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const pagesDir = `${paths.exports}/journal/pages`;
  const entriesDir = `${paths.exports}/journal/entries`;

  if (ensureExternalId) await ensureExternalIdFlag(page);

  const pageExport = makeExportRecord("JournalPage", page);
  const pageBaseName = safeBaseName(`page.${page.id ?? "unknown"}`);
  const pageFile = await writeJsonVersioned(pagesDir, pageBaseName, pageExport, source);

  let entryFile: string | null | undefined = undefined;
  let entry: any | null = null;

  if (includeParentEntry) {
    entry = page?.parent;
    if (entry) {
      if (ensureExternalId) await ensureExternalIdFlag(entry);
      const entryExport = makeExportRecord("JournalEntry", entry);
      const entryBaseName = safeBaseName(`entry.${entry.id ?? "unknown"}`);
      entryFile = await writeJsonVersioned(entriesDir, entryBaseName, entryExport, source);
    }
  }

  // ✅ Update manifest (latest pointers)
  await updateJournalManifest(
    [
      { kind: "pages" as const, doc: page, latestFile: pageFile ?? "" },
      ...(entryFile && entry ? [{ kind: "entries" as const, doc: entry, latestFile: entryFile }] : [])
    ].filter((u) => !!u.latestFile),
    source
  );

  return { pageFile, entryFile };
}

export async function exportJournalEntry(
  entry: any,
  opts: ExportJournalOptions = {}
): Promise<{ entryFile?: string | null; pageFiles?: Array<string | null> }> {
  const source = opts.source ?? "data";
  const ensureExternalId = opts.ensureExternalId ?? true;
  const includeAllPages = opts.includeAllPages ?? true;

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const pagesDir = `${paths.exports}/journal/pages`;
  const entriesDir = `${paths.exports}/journal/entries`;

  if (ensureExternalId) await ensureExternalIdFlag(entry);

  const entryExport = makeExportRecord("JournalEntry", entry);
  const entryBaseName = safeBaseName(`entry.${entry.id ?? "unknown"}`);
  const entryFile = await writeJsonVersioned(entriesDir, entryBaseName, entryExport, source);

  const pageFiles: Array<string | null> = [];
  const pages: any[] = includeAllPages
    ? (Array.isArray(entry?.pages) ? entry.pages : (entry?.pages?.contents ?? []))
    : [];

  if (includeAllPages) {
    for (const p of pages ?? []) {
      if (!p) continue;
      if (ensureExternalId) await ensureExternalIdFlag(p);
      const pageExport = makeExportRecord("JournalPage", p);
      const pageBaseName = safeBaseName(`page.${p.id ?? "unknown"}`);
      const out = await writeJsonVersioned(pagesDir, pageBaseName, pageExport, source);
      pageFiles.push(out);
    }

    await updateJournalManifest(
    [
      ...(entryFile ? [{ kind: "entries" as const, doc: entry, latestFile: entryFile }] : []),
      ...pages
        .map((p, i) => ({ kind: "pages" as const, doc: p, latestFile: pageFiles[i] ?? "" }))
        .filter((u) => !!u.latestFile)
    ],
    source
  );
  }

  return { entryFile, pageFiles };
}

/**
 * Convenience: export "currently selected" journal page, if available.
 * This is intentionally best-effort; selection APIs vary by sheet/app.
 */
export async function exportSelectedJournalPage(
  opts: ExportJournalOptions = {}
): Promise<{ pageFile?: string | null; entryFile?: string | null } | null> {
  const page = getSelectedJournalPageBestEffort();
  if (!page) return null;
  return await exportJournalPage(page, opts);
}

/* -------------------------------------------------------------------------- */
/*                                Internals                                   */
/* -------------------------------------------------------------------------- */

function makeExportRecord(docType: "JournalEntry" | "JournalPage", doc: any): ExportRecord {
  const foundryObj = doc?.toObject ? doc.toObject() : doc;
  const uuid = doc?.uuid;
  const externalId = getExternalId(doc);

  return createExportRecord(docType, foundryObj, {
    uuid,
    externalId
  });
}

async function ensureExternalIdFlag(doc: any): Promise<string | null> {
  const existing = getExternalId(doc);
  if (existing) return existing;

  const created = `vh:${doc?.documentName ?? "Doc"}:${crypto.randomUUID()}`;

  return await withSuppressedHooks(async () => {
    if (typeof doc?.setFlag === "function") {
      await doc.setFlag(MODULE_ID, "externalId", created);
      return created;
    }

    if (typeof doc?.update === "function") {
      await doc.update({ [EXTERNAL_ID_FLAG_PATH]: created }, { diff: true });
      return created;
    }

    return null;
  });
}

function safeBaseName(name: string): string {
  return String(name).replace(/[^\w.-]+/g, "_");
}

/**
 * Best-effort way to find a selected JournalPage.
 * You can replace this later with your own UI state (recommended).
 */
function getSelectedJournalPageBestEffort(): any | null {
  // 1) If a JournalPage sheet is open, its object is usually available as `app.object`.
  const apps: Record<string, any> = (ui as any)?.windows ?? {};
  for (const k of Object.keys(apps)) {
    const app = apps[k];
    const obj = app?.object;
    if (obj?.documentName === "JournalPage") return obj;
  }

  // 2) If a JournalEntry sheet is open, try the first active/visible page.
  for (const k of Object.keys(apps)) {
    const app = apps[k];
    const obj = app?.object;
    if (obj?.documentName === "JournalEntry") {
      const pages = obj?.pages?.contents ?? obj?.pages;
      if (Array.isArray(pages) && pages.length) return pages[0];
    }
  }

  return null;
}