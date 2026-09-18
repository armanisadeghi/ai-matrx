// features/marketing/seo/topical-map/views/table/__tests__/editPatches.test.ts
//
// THE SAVE THAT SAID "Changes saved" AND KEPT THE OLD NAME.
//
// `MatrxDataTable` toasts "Changes saved" whenever `edit.onSave` RESOLVES, and
// "Couldn't save: <message>" when it throws. The table's save path built its
// patches by skipping any name that was blank after trimming — so clearing a
// topic's name produced zero patches, an early return, a resolved promise, a
// green toast, and the old name still on screen.
//
// The mapping is a pure function now, and it REFUSES: a name field that is
// present and blank is a save that cannot happen, not a field to drop.

import { topicPatchesFromEdits } from "../editPatches";

describe("topicPatchesFromEdits — a blank name refuses the save", () => {
  it("refuses an empty name instead of dropping it", () => {
    expect(topicPatchesFromEdits({ recycling: { topic: "" } })).toEqual({
      refusal: "A topic needs a name.",
    });
  });

  it("refuses a whitespace-only name — a space is not a name", () => {
    expect(topicPatchesFromEdits({ recycling: { name: "   " } })).toEqual({
      refusal: "A topic needs a name.",
    });
  });

  it("refuses the WHOLE save when one row of several has a blank name", () => {
    // Saving the good rows and silently dropping the bad one is how the person
    // ends up believing an edit landed that never did.
    expect(
      topicPatchesFromEdits({
        metals: { topic: "Metals" },
        recycling: { topic: "  " },
      }),
    ).toEqual({ refusal: "A topic needs a name." });
  });

  it("never lets a blank name reach the server as a patch", () => {
    const result = topicPatchesFromEdits({ recycling: { topic: " " } });
    expect("patches" in result).toBe(false);
  });

  it("trims and passes a real name", () => {
    expect(topicPatchesFromEdits({ recycling: { topic: "  Metals  " } })).toEqual({
      patches: [{ slug: "recycling", name: "Metals" }],
    });
  });

  it("reads the name from either the `topic` or the `name` cell id", () => {
    expect(topicPatchesFromEdits({ recycling: { name: "Metals" } })).toEqual({
      patches: [{ slug: "recycling", name: "Metals" }],
    });
  });

  it("clears a description to null — an empty description IS a value", () => {
    // Unlike the name: a topic with no description is a real, allowed state,
    // and `seo.patch_map_topics` takes null for it.
    expect(topicPatchesFromEdits({ recycling: { description: "  " } })).toEqual({
      patches: [{ slug: "recycling", description: null }],
    });
  });

  it("carries a name and a description together", () => {
    expect(
      topicPatchesFromEdits({ recycling: { topic: "Metals", description: "Scrap" } }),
    ).toEqual({
      patches: [{ slug: "recycling", name: "Metals", description: "Scrap" }],
    });
  });

  it("returns no patches when nothing editable changed", () => {
    expect(topicPatchesFromEdits({ recycling: { pages: 4 } })).toEqual({ patches: [] });
  });
});
