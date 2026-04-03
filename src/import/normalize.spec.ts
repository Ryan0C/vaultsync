import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeImportPayload } from "./normalize.ts";

describe("import/normalize", () => {
  it("normalizes canonical import envelopes into export records", () => {
    const result = normalizeImportPayload({
      type: "import",
      contractVersion: 1,
      docType: "JournalPage",
      uuid: "JournalEntry.X.JournalEntryPage.Y",
      externalId: "ext-1",
      foundry: { name: "Entry Page" },
      opId: "op-1",
      mode: "upsert",
      createdAt: 1770000000000,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.docType, "JournalEntryPage");
    assert.equal(result[0]?.meta?.opId, "op-1");
    assert.deepEqual(result[0]?.foundry, { name: "Entry Page" });
  });

  it("preserves array ordering while normalizing mixed payload shapes", () => {
    const first = {
      type: "import",
      contractVersion: 1,
      docType: "Actor",
      uuid: "Actor.A1",
      foundry: { id: "A1" },
      opId: "op-a",
      mode: "upsert",
      createdAt: 1,
    };
    const second = {
      records: [
        {
          docType: "Item",
          uuid: "Item.I1",
          foundry: { id: "I1" },
          meta: { source: "records" },
        },
      ],
    };

    const result = normalizeImportPayload([first, second]);
    assert.deepEqual(result.map((record) => record.docType), ["Actor", "Item"]);
  });
});
