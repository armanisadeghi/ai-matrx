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
      "Files",
      "MATRX",
    ]);
  });

  it("offers exactly ONE Files entry — upload and stored files are unified", () => {
    const categories = getVisibleResourcePickerCategories();
    const filesCategory = categories.find((c) => c.category === "Files");

    // One "files" row (Voice Pad is capability-gated off without support).
    expect(filesCategory?.items.map((item) => item.id)).toEqual(["files"]);
    const allIds = categories.flatMap((c) => c.items.map((i) => i.id));
    expect(allIds).not.toContain("upload");
    expect(allIds).not.toContain("storage");
  });
});
