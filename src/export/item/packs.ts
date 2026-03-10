// src/export/item/packs.ts
import { MODULE_ID, VAULT_SCHEMA_VERSION } from "../../constants";
import { ensureVaultSyncDirs, getVaultSyncPaths } from "../../storage";
import { writeJsonVersioned, writeJsonOverwrite } from "../../storage/json"; // use what you already have
import { FP } from "../../storage/fp";
import { getSpellClassesForIdentifier } from "./spellClassMap";
import { getSpellSubclassesForIdentifier } from "./spellSubclassMap";

export type ItemPackIndexEntry = {
  _id: string;
  uuid?: string;     // best-effort (see notes)
  name: string;
  type?: string;
  img?: string;
  system?: any;      // usually present in index for dnd5e (varies)
  flags?: any;
  vh?: {
    spell?: {
      classes?: string[];
      subclasses?: string[];
      level?: number;
      school?: string | null;
      ritual?: boolean;
      concentration?: boolean;
      components?: string[];
      materials?: string | null;
      source?: string | null;
    };
  };
};

export type ItemPackIndexSnapshot = {
  moduleId: string;
  schemaVersion: string;
  generatedAt: string;
  worldId?: string;

  pack: {
    collection: string;     // e.g. "dnd5e.spells"
    label?: string;
    package?: string;       // pack.metadata.packageName in v13-ish
    type?: string;          // "Item"
  };

  count: number;
  entries: ItemPackIndexEntry[];
};

export interface ExportItemPackIndexOptions {
  source?: "data";

  /**
   * If true, try to overwrite packs/<collection>/index.json (like your manifest strategy).
   * If overwrite fails, fall back to versioned.
   * Default true.
   */
  preferStableIndex?: boolean;

  /**
   * If true, include `system` from index entries if present.
   * Default true.
   */
  includeSystem?: boolean;
}

function safeBaseName(name: string) {
  return String(name).replace(/[^\w.-]+/g, "_");
}

function isSpellRitual(system: any): boolean {
  const props = Array.isArray(system?.properties) ? system.properties : [];
  return props.includes("ritual") || !!system?.ritual;
}

function isSpellConcentration(system: any): boolean {
  const props = Array.isArray(system?.properties) ? system.properties : [];
  return (
    props.includes("concentration") ||
    !!system?.concentration ||
    !!system?.duration?.concentration
  );
}

function getSpellComponents(system: any): string[] {
  const props = Array.isArray(system?.properties) ? system.properties : [];
  const out: string[] = [];

  if (props.includes("vocal") || system?.components?.vocal || system?.components?.v) out.push("V");
  if (props.includes("somatic") || system?.components?.somatic || system?.components?.s) out.push("S");
  if (props.includes("material") || system?.components?.material || system?.components?.m) out.push("M");

  return out;
}

function getSpellSource(system: any): string | null {
  const src = system?.source ?? {};
  const custom = String(src?.custom ?? "").trim();
  if (custom) return custom;

  const book = String(src?.book ?? "").trim();
  const rules = String(src?.rules ?? "").trim();

  if (book && rules) return `${book} • ${rules}`;
  return book || rules || null;
}

function getSpellClasses(system: any): string[] {
  const identifier = system?.identifier;
  if (!identifier) return [];
  return getSpellClassesForIdentifier(identifier);
}

// Optional helper if you want to avoid 404 fetch noise like you did in actor manifest
async function fileExists(dir: string, filename: string, source: "data"): Promise<boolean> {
  try {
    const res = await FP().browse(source, dir);
    const files: string[] = Array.isArray(res?.files) ? res.files : [];
    return files.some((p) => String(p).endsWith(`/${filename}`) || String(p) === filename);
  } catch {
    return false;
  }
}

export async function exportItemPackIndex(
  packCollection: string,
  opts: ExportItemPackIndexOptions = {}
): Promise<{ indexFile: string | null; count: number }> {
  const source = opts.source ?? "data";
  const preferStableIndex = opts.preferStableIndex ?? true;
  const includeSystem = opts.includeSystem ?? true;

  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const pack = game.packs!.get(packCollection);
  if (!pack) throw new Error(`No compendium pack: ${packCollection}`);
  if (pack.documentName !== "Item") throw new Error(`Pack is not Item: ${packCollection}`);

  // Ensure index is built/loaded
  await pack.getIndex({ fields: (includeSystem ? ["system", "img", "type", "flags"] : ["img", "type", "flags"]) as any });

    const entries: ItemPackIndexEntry[] = (pack.index?.contents ?? []).map((e: any) => {
    const isSpell = String(e?.type ?? "").toLowerCase() === "spell";
    const sys = includeSystem ? (e.system ?? {}) : {};
    const classes = getSpellClasses(sys);
    return {
        _id: e._id,
        uuid: e.uuid,
        name: e.name,
        type: e.type,
        img: e.img,
        system: sys,
        flags: e.flags,

        vh: isSpell
        ? {
            spell: {
                classes: getSpellClasses(sys),
                subclasses: getSpellSubclassesForIdentifier(sys?.identifier),
                level: Number(sys?.level ?? 0),
                school: String(sys?.school ?? "").trim() || null,
                ritual: isSpellRitual(sys),
                concentration: isSpellConcentration(sys),
                components: getSpellComponents(sys),
                materials: String(sys?.materials?.value ?? "").trim() || null,
                source: getSpellSource(sys),
            },
            }
        : undefined,
    };
    });

  const snapshot: ItemPackIndexSnapshot = {
    moduleId: MODULE_ID,
    schemaVersion: VAULT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    worldId: (game as any)?.world?.id,
    pack: {
      collection: pack.collection,
      label: pack.metadata?.label,
      package: pack.metadata?.packageName,
      type: pack.documentName
    },
    count: entries.length,
    entries
  };

  const packDir = `${paths.exports}/items/packs/${safeBaseName(pack.collection)}`;

  // write stable index.json if possible, else versioned fallback
  const stableName = "index.json";
  const stablePath = `${packDir}/${stableName}`;

  try {
    if (preferStableIndex) {
      // ensure dir exists
      // (assuming your ensureVaultSyncDirs already makes exports root; if not, createDirectory chain)
      await FP().createDirectory(source, packDir, { parent: null }).catch(() => {});
      await writeJsonOverwrite(`${packDir}/${stableName}`, snapshot, source);
      return { indexFile: stablePath, count: entries.length };
    }
  } catch (err: any) {
    console.warn(`[${MODULE_ID}] pack index overwrite failed, using versioned`, err);
  }

  // versioned fallback
  const base = safeBaseName("index");
  const indexFile = await writeJsonVersioned(packDir, base, snapshot, source);
  return { indexFile, count: entries.length };
}

/**
 * Export indexes for all Item packs (system + modules + world compendium packs).
 */
export async function exportAllItemPackIndexes(opts: ExportItemPackIndexOptions = {}) {
  const packs = Array.from(game.packs?.values?.() ?? []).filter((p: any) => p?.documentName === "Item");
  const results: any[] = [];

  for (const p of packs) {
    try {
      const r = await exportItemPackIndex(p.collection, opts);
      results.push({ ok: true, pack: p.collection, ...r });
    } catch (err) {
      results.push({ ok: false, pack: p.collection, error: String(err) });
    }
  }

  return { ok: results.every(r => r.ok), results };
}

/**
 * Optional: export a single full Item doc from a compendium (on-demand).
 */
export async function exportItemFromPack(
  packCollection: string,
  itemId: string,
  opts: { source?: "data" } = {}
): Promise<{ file: string | null }> {
  const source = opts.source ?? "data";
  await ensureVaultSyncDirs(source);
  const paths = getVaultSyncPaths();

  const pack = game.packs!.get(packCollection);
  if (!pack) throw new Error(`No compendium pack: ${packCollection}`);
  if (pack.documentName !== "Item") throw new Error(`Pack is not Item: ${packCollection}`);

  const doc = await pack.getDocument(itemId);
  if (!doc) throw new Error(`No item ${itemId} in ${packCollection}`);

  const data = doc.toObject();
  const docsDir = `${paths.exports}/items/packs/${safeBaseName(pack.collection)}/docs`;

  const base = safeBaseName(`item.${itemId}`);
  const file = await writeJsonVersioned(docsDir, base, data, source);
  return { file };
}