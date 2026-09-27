// update_decks visibility / folder_ids and duplicate_decks (page-pass
// 2026-09-27): the agent twins of the row menu's Rename, Duplicate, Move to
// folder and Who can see it.
import {
  copyName,
  parseDuplicateDecksValue,
  parseUpdateDecksValue,
} from "../deckAgentWrites";

const decks = [
  { id: "d1", name: "Cell Biology", archived: false, organizationId: "o1" },
  { id: "d2", name: "Old deck", archived: true, organizationId: "o1" },
];
const folders = [{ id: "f1", name: "Exams" }];

describe("update_decks — visibility and folders", () => {
  it("accepts a known visibility and known folders", () => {
    const [plan] = parseUpdateDecksValue(
      [{ id: "d1", visibility: "internal", folder_ids: ["f1"] }],
      decks,
      folders,
    );
    expect(plan.visibility).toBe("internal");
    expect(plan.folderIds).toEqual(["f1"]);
    expect(plan.organizationId).toBe("o1");
    expect(plan.changed).toEqual(["visibility", "folder_ids"]);
  });

  it("an empty folder list takes the deck out of every folder", () => {
    const [plan] = parseUpdateDecksValue([{ id: "d1", folder_ids: [] }], decks, folders);
    expect(plan.folderIds).toEqual([]);
  });

  it("refuses an unknown visibility and an unknown folder, naming both", () => {
    expect(() =>
      parseUpdateDecksValue(
        [{ id: "d1", visibility: "everyone", folder_ids: ["nope"] }],
        decks,
        folders,
      ),
    ).toThrow(/visibility must be one of[\s\S]*"nope"/);
  });
});

describe("duplicate_decks", () => {
  it("names the copy '(copy)' and skips taken names", () => {
    expect(copyName("Cell Biology", new Set())).toBe("Cell Biology (copy)");
    expect(copyName("Cell Biology", new Set(["cell biology (copy)"]))).toBe(
      "Cell Biology (copy 2)",
    );
    const [plan] = parseDuplicateDecksValue(["d1"], decks, ["Cell Biology"]);
    expect(plan).toEqual({
      sourceId: "d1",
      sourceName: "Cell Biology",
      name: "Cell Biology (copy)",
    });
  });

  it("refuses an archived deck, an unknown id and a taken name", () => {
    expect(() => parseDuplicateDecksValue(["d2"], decks, [])).toThrow(/archived/);
    expect(() => parseDuplicateDecksValue(["zz"], decks, [])).toThrow(/not a deck on screen/);
    expect(() =>
      parseDuplicateDecksValue([{ id: "d1", name: "Cell Biology" }], decks, ["Cell Biology"]),
    ).toThrow(/already has a deck named/);
  });
});
