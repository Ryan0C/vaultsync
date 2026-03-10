// src/ui/index.ts
import { MODULE_ID } from "../constants";

type PackOption = { collection: string; title: string };

export class VaultSyncToolsForm extends FormApplication {
  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "vaultsync-tools",
      title: "VaultSync Tools",
      template: `modules/${MODULE_ID}/templates/vaultsync-tools.hbs`,
      width: 460,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false
    });
  }

  override async getData(): Promise<{ packs: PackOption[] }> {
    return { packs: getItemPacks() };
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);

    html.find("[data-action='refresh']").on("click", async () => {
      await this.render(true);
    });

    html.find("[data-action='exportAll']").on("click", async () => {
      ui.notifications!.info("Exporting all item pack indexes...");
      await (game.modules!.get(MODULE_ID)! as any).api.exportAllItemPackIndexes();
      ui.notifications!.info("Done exporting all pack indexes.");
    });

    html.find("[data-action='exportOne']").on("click", async () => {
      const collection = String(html.find("#vs-pack-select").val() ?? "");
      if (!collection) return;

      ui.notifications!.info(`Exporting pack index: ${collection}`);
      await (game.modules!.get(MODULE_ID)! as any).api.exportItemPackIndex(collection);
      ui.notifications!.info("Done.");
    });
  }

  // Required by FormApplication even if you don't use submission
  protected override async _updateObject(_event: Event, _formData: any) {
    return;
  }
}

function getItemPacks(): PackOption[] {
  const packs: PackOption[] = [];

  for (const pack of game.packs ?? []) {
    const docName = (pack as any)?.documentName ?? (pack as any)?.metadata?.type;
    if (docName !== "Item") continue;

    packs.push({
      collection: (pack as any).collection,
      title: (pack as any).title ?? (pack as any)?.metadata?.label ?? (pack as any).collection
    });
  }

  packs.sort((a, b) => a.title.localeCompare(b.title));
  return packs;
}