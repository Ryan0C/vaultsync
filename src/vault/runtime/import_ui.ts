/**
 * Vault Sync — Import UI (Runtime)
 * --------------------------------
 * GM-only UI entry points for importing actor payloads.
 * Non-GM users can still *request* import via socket bridge.
 */

import { MODULE_ID } from "../../constants";
import { logger } from "../../logger";
import type { ImportMode } from "../import";
import { canImport } from "../import";
import { requestActorImport } from "./import_bridge";

type ImportUiDefaults = {
  actorId?: string;
};

function notify(msg: string) {
  ui.notifications?.info(`${MODULE_ID} | ${msg}`);
}
function warn(msg: string) {
  ui.notifications?.warn(`${MODULE_ID} | ${msg}`);
}
function error(msg: string) {
  ui.notifications?.error(`${MODULE_ID} | ${msg}`);
}

function readJsonFromFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Render a small import dialog.
 * - If actorId is provided, default is "import into existing actor".
 * - If actorId is not provided, default is "create new actor".
 */
export function openActorImportDialog(defaults: ImportUiDefaults = {}) {
  const user = game.user;
  if (!user) return;

  // We allow non-GM to open the dialog, but they will go through the bridge.
  // If there is no GM online/listening, request will time out.
  const defaultCreate = !defaults.actorId;

  const content = `
<form class="vaultsync-import">
  <div class="form-group">
    <label>Source JSON</label>
    <input type="file" name="file" accept="application/json,.json" />
    <p class="notes">Choose an exported actor JSON payload.</p>
  </div>

  <div class="form-group">
    <label>Mode</label>
    <select name="mode">
      <option value="merge" selected>Merge (safe)</option>
      <option value="replace">Replace (dangerous)</option>
    </select>
    <p class="notes">Replace can delete items/effects depending on options.</p>
  </div>

  <hr/>

  <div class="form-group">
    <label>Target</label>
    <div class="form-fields">
      <label style="display:flex;gap:8px;align-items:center;">
        <input type="checkbox" name="create" ${defaultCreate ? "checked" : ""}/>
        Create new Actor
      </label>
    </div>
    <p class="notes">
      If unchecked, imports into the current actor (if provided).
    </p>
  </div>

  <div class="form-group">
    <label>Options</label>
    <div class="form-fields" style="flex-direction:column;align-items:flex-start;">
      <label><input type="checkbox" name="importActorFlags" checked/> Import actor flags (filtered)</label>
      <label><input type="checkbox" name="importItemFlags" checked/> Import item flags (filtered)</label>
      <label><input type="checkbox" name="importPrototypeToken" checked/> Import prototypeToken</label>
      <label><input type="checkbox" name="importEffects"/> Import ActiveEffects (off by default)</label>
      <label><input type="checkbox" name="preserveItemIds"/> Preserve item IDs (risky)</label>
    </div>
  </div>

  <div class="form-group">
    <label>Allowed flag scopes</label>
    <input type="text" name="allowedFlagScopes" value="core,dnd5e,vaultsync" />
    <p class="notes">Comma-separated namespaces.</p>
  </div>
</form>
`;

  new Dialog({
    title: "Vault Import Actor",
    content,
    buttons: {
      import: {
        icon: '<i class="fas fa-file-import"></i>',
        label: "Import",
        callback: async (html) => {
          try {
            const form = html.find("form.vaultsync-import")[0] as HTMLFormElement;
            const fileInput = form.querySelector<HTMLInputElement>('input[name="file"]');
            const file = fileInput?.files?.[0];
            if (!file) return warn("Choose a JSON file first.");

            const payload = await readJsonFromFile(file);

            const mode = (form.querySelector<HTMLSelectElement>('select[name="mode"]')?.value ?? "merge") as ImportMode;
            const create = !!form.querySelector<HTMLInputElement>('input[name="create"]')?.checked;

            if (!create && !defaults.actorId) {
              return warn("No target actor provided. Check 'Create new Actor' or open from an actor context.");
            }

            const allowedFlagScopes = (form.querySelector<HTMLInputElement>('input[name="allowedFlagScopes"]')?.value ?? "")
              .split(",")
              .map(s => s.trim())
              .filter(Boolean);

            const opts = {
              importActorFlags: !!form.querySelector<HTMLInputElement>('input[name="importActorFlags"]')?.checked,
              importItemFlags: !!form.querySelector<HTMLInputElement>('input[name="importItemFlags"]')?.checked,
              importPrototypeToken: !!form.querySelector<HTMLInputElement>('input[name="importPrototypeToken"]')?.checked,
              importEffects: !!form.querySelector<HTMLInputElement>('input[name="importEffects"]')?.checked,
              preserveItemIds: !!form.querySelector<HTMLInputElement>('input[name="preserveItemIds"]')?.checked,
              allowedFlagScopes: allowedFlagScopes.length ? allowedFlagScopes : ["core", "dnd5e", "vaultsync"]
            };

            const res = await requestActorImport({
              payload,
              mode,
              actorId: defaults.actorId,
              create
            });

            if (!res.ok) {
              error(res.error);
              return;
            }

            notify(res.created ? `Imported actor as new: ${res.actorId}` : `Imported into actor: ${res.actorId}`);

            // If we imported into an existing actor, re-render its sheets.
            const actor = game.actors?.get(res.actorId);
            actor?.sheet?.render(true);
          } catch (e: any) {
            logger.error("import ui: failed", e);
            error(String(e?.message ?? e));
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "import"
  }).render(true);
}

/**
 * Register:
 * - Actors directory context menu entry
 * - Actor sheet header button
 */
export function registerImportUiHooks() {
  // Actor Directory context menu (right-click)
  Hooks.on("getActorDirectoryEntryContext", (_html: JQuery, entries: any[]) => {
    entries.push({
      name: "Vault: Import into Actor…",
      icon: '<i class="fas fa-file-import"></i>',
      condition: () => true, // non-GM can request via bridge; GM executes
      callback: (li: JQuery) => {
        const actorId = li.data("documentId") ?? li.data("actorId");
        if (!actorId) return warn("Could not determine actor id.");
        openActorImportDialog({ actorId: String(actorId) });
      }
    });
  });

  // Actor sheet header button
  Hooks.on("getActorSheetHeaderButtons", (app: any, buttons: any[]) => {
    const actor = app?.actor as Actor | undefined;
    if (!actor?.id) return;

    // show to everyone; non-GM requests go to bridge
    buttons.unshift({
      label: "Vault Import",
      class: "vaultsync-import",
      icon: "fas fa-file-import",
      onclick: () => openActorImportDialog({ actorId: actor.id! })
    });
  });

  // Optional: warn if someone opens UI but can’t import and no GM is present
  Hooks.once("ready", () => {
    if (!canImport()) {
      logger.info("import ui: non-GM client; requests will require a GM online");
    }
  });
}