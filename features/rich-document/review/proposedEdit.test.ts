import { reduceToBlockEdit, spliceProposal } from "./proposedEdit";

const DOC = [
  "# Refund policy",
  "",
  "Gold customers get 60 days.",
  "",
  "```ts",
  "const window = 60;",
  "```",
  "",
  "Silver customers get 30 days.",
  "",
].join("\n");

describe("an AI proposal saves as a splice", () => {
  it("changes only the changed block — every other byte is untouched", () => {
    const proposed = DOC.replace("Gold customers get 60 days.", "Gold customers get sixty days.");
    const result = spliceProposal(DOC, proposed)!;
    expect(result.text).toBe(proposed);
    expect(result.changes).toHaveLength(1);
    const { keptBlocks, replacedBlocks } = reduceToBlockEdit(DOC, proposed);
    expect(replacedBlocks).toBe(1);
    expect(keptBlocks).toBeGreaterThan(1);
    // The one change sits inside the Gold paragraph; the fence after it is
    // outside every changed range.
    const fenceAt = DOC.indexOf("```ts");
    expect(result.changes[0].oldEnd).toBeLessThanOrEqual(fenceAt);
  });

  it("an identical proposal writes nothing", () => {
    expect(spliceProposal(DOC, DOC)).toBeNull();
    expect(reduceToBlockEdit(DOC, DOC).edit).toBeNull();
  });

  it("handles a pure insertion and a pure deletion", () => {
    const inserted = DOC.replace("Silver", "Bronze customers get 14 days.\n\nSilver");
    expect(spliceProposal(DOC, inserted)!.text).toBe(inserted);
    const deleted = DOC.replace("Silver customers get 30 days.\n", "");
    expect(spliceProposal(DOC, deleted)!.text).toBe(deleted);
  });

  it("a rewrite that would destroy a protected island is REFUSED, never forced", () => {
    let code: string | undefined;
    try {
      spliceProposal(DOC, "Totally new text.\n");
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code).toBe("island_edit");
  });
});
