import { getVisibleResourcePickerCategories } from "../resource-picker-menu-items";

describe("getVisibleResourcePickerCategories", () => {
  it("limits a reused picker to the resource kinds supported by its host", () => {
    const categories = getVisibleResourcePickerCategories(undefined, {
      allowedViewIds: ["files", "notes"],
    });

    expect(
      categories.flatMap((category) => category.items.map((item) => item.id)),
    ).toEqual(["files", "notes"]);
    expect(categories.map((category) => category.category)).toEqual([
      "",
      "Attach/Associate",
    ]);
  });

  it("offers exactly ONE Files entry — upload and stored files are unified", () => {
    const categories = getVisibleResourcePickerCategories();
    const primary = categories.find((c) => c.category === "");

    // One "files" row (Voice Pad / Tools / Skills are conversation-gated).
    expect(primary?.items.map((item) => item.id)).toEqual(["files", "webpage"]);
    const allIds = categories.flatMap((c) => c.items.map((i) => i.id));
    expect(allIds).not.toContain("upload");
    expect(allIds).not.toContain("storage");
  });

  it("keeps primary rows headerless and groups MATRX items under Attach/Associate", () => {
    const categories = getVisibleResourcePickerCategories(undefined, {
      conversationId: "conv-1",
      // Force audio on so Voice Pad appears in the primary list.
    });
    const withAudio = getVisibleResourcePickerCategories(
      { supportsAudio: true },
      { conversationId: "conv-1" },
    );

    expect(withAudio[0]?.category).toBe("");
    expect(withAudio[0]?.items.map((i) => i.id)).toEqual([
      "files",
      "audio",
      "webpage",
      "tools",
      "skills",
    ]);
    expect(
      categories.find((c) => c.category === "Attach/Associate"),
    ).toBeTruthy();
    expect(categories.some((c) => c.category === "Files")).toBe(false);
    expect(categories.some((c) => c.category === "MATRX")).toBe(false);
    expect(categories.some((c) => c.category === "This run")).toBe(false);
  });
});
