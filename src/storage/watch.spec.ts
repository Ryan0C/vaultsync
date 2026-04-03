import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeTargetFromMarker,
  entityKeyFromFilename,
  filenameTs,
  findSupersededInboxFilesByMode,
  findSupersededInboxFiles,
  tryParseTimestampFromName,
} from "./watchFilenames.ts";

describe("storage/watch filename helpers", () => {
  it("derives marker targets from done marker names", () => {
    const marker = "actor.actorA.1770000000000.ab12.done.json";
    assert.equal(decodeTargetFromMarker(marker), "actor.actorA");
    assert.equal(decodeTargetFromMarker("bad.done.json"), null);
  });

  it("parses timestamp and entity key from standard inbox filenames", () => {
    const file = "actor.actorA.1770000000000.ab12.json";
    assert.equal(entityKeyFromFilename(file), "actor.actorA");
    assert.equal(filenameTs(file), 1770000000000);
    assert.equal(tryParseTimestampFromName(file), 1770000000000);
  });

  it("marks only older siblings as superseded", () => {
    const files = [
      "actor.actorA.1770000000000.a1.json",
      "actor.actorA.1770000001000.a2.json",
      "actor.actorB.1770000000500.b1.json",
      "journal.entryA.1770000000200.c1.json",
      "invalid-name.json",
    ];

    const superseded = findSupersededInboxFiles(files);
    assert.equal(superseded.has("actor.actorA.1770000000000.a1.json"), true);
    assert.equal(superseded.has("actor.actorA.1770000001000.a2.json"), false);
    assert.equal(superseded.has("actor.actorB.1770000000500.b1.json"), false);
    assert.equal(superseded.has("journal.entryA.1770000000200.c1.json"), false);
    assert.equal(superseded.has("invalid-name.json"), false);
  });

  it("does not supersede patch-mode siblings", () => {
    const superseded = findSupersededInboxFilesByMode([
      { name: "actor.actorA.1770000000000.a1.json", mode: "patch" },
      { name: "actor.actorA.1770000001000.a2.json", mode: "patch" },
    ]);
    assert.equal(superseded.size, 0);
  });

  it("supersedes older siblings for snapshot-only groups", () => {
    const superseded = findSupersededInboxFilesByMode([
      { name: "actor.actorA.1770000000000.a1.json", mode: "snapshot" },
      { name: "actor.actorA.1770000001000.a2.json", mode: "snapshot" },
      { name: "actor.actorB.1770000000200.b1.json", mode: "snapshot" },
    ]);
    assert.deepEqual([...superseded].sort(), ["actor.actorA.1770000000000.a1.json"]);
  });
});
